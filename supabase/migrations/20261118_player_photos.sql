-- Fotos por ID PES, independientes de las versiones del EDIT y de los clubes.
begin;
create table if not exists public.player_portraits (
 pes_id bigint primary key check(pes_id>0),
 photo_url text not null check(length(photo_url)<=2048 and photo_url ~* '^https?://[^[:space:]/?#<>"\\]+[^[:space:]<>"\\]*$'),
 updated_at timestamptz not null default now()
);
alter table public.player_portraits enable row level security;
drop policy if exists player_portraits_read on public.player_portraits;
create policy player_portraits_read on public.player_portraits for select using(true);
grant select on public.player_portraits to anon,authenticated;
revoke insert,update,delete on public.player_portraits from anon,authenticated;
-- Conservar las fotos actuales; no modificar las copias históricas.
insert into public.player_portraits(pes_id,photo_url)
 select distinct on(option_file_id) option_file_id,btrim(photo_url) from public.players
 where not archived and option_file_id>0 and length(btrim(photo_url))<=2048 and btrim(photo_url) ~* '^https?://[^[:space:]/?#<>"\\]+[^[:space:]<>"\\]*$'
 order by option_file_id,id
on conflict(pes_id) do nothing;

create or replace function public.sync_player_portrait() returns trigger
language plpgsql security definer set search_path=public as $$
declare canonical text; changed boolean;
begin
 changed:=tg_op='UPDATE' and new.photo_url is distinct from old.photo_url;
 if new.photo_url is not null and (tg_op='INSERT' or changed) then
  new.photo_url:=nullif(btrim(new.photo_url),'');
  if new.photo_url is not null and (length(new.photo_url)>2048 or new.photo_url !~* '^https?://[^[:space:]/?#<>"\\]+[^[:space:]<>"\\]*$') then raise exception 'Usá un enlace HTTP o HTTPS válido para la foto.';end if;
 end if;
 if new.archived or new.option_file_id is null then return new;end if;
 if tg_op='INSERT' or new.option_file_id is distinct from old.option_file_id then
  select photo_url into canonical from public.player_portraits where pes_id=new.option_file_id;
  if canonical is not null then new.photo_url:=canonical;
  elsif new.photo_url is not null then
   insert into public.player_portraits(pes_id,photo_url) values(new.option_file_id,new.photo_url) on conflict(pes_id) do nothing;
  end if;
 elsif changed then
  if new.photo_url is null then delete from public.player_portraits where pes_id=new.option_file_id;
  else insert into public.player_portraits(pes_id,photo_url) values(new.option_file_id,new.photo_url)
   on conflict(pes_id) do update set photo_url=excluded.photo_url,updated_at=now();
  end if;
 end if;
 return new;
end $$;
drop trigger if exists sync_player_portrait on public.players;
create trigger sync_player_portrait before insert or update of photo_url,option_file_id on public.players for each row execute function public.sync_player_portrait();

create or replace function public.set_player_photo(p_player uuid default null,p_pes_id bigint default null,p_url text default null) returns void
language plpgsql security definer set search_path=public as $$
declare pl public.players; pes bigint; url text:=nullif(btrim(p_url),'');
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores pueden editar las fotos.';end if;
 perform pg_advisory_xact_lock(13300013);
 if url is not null and (length(url)>2048 or url !~* '^https?://[^[:space:]/?#<>"\\]+[^[:space:]<>"\\]*$') then raise exception 'Usá un enlace HTTP o HTTPS válido para la foto.';end if;
 if p_player is not null then
  select * into pl from public.players where id=p_player and not archived for update;
  if not found then raise exception 'Jugador inexistente o archivado.';end if;
  if p_pes_id is not null and pl.option_file_id is distinct from p_pes_id then raise exception 'El ID del EDIT no corresponde al jugador.';end if;
  pes:=pl.option_file_id;
 else
  pes:=p_pes_id;
  if pes is null or not exists(select 1 from public.option_file_entries e join public.option_file_versions v on v.id=e.version_id where v.status='active' and e.pes_id=pes)
   and not exists(select 1 from public.players where option_file_id=pes and not archived) then raise exception 'El jugador no está en el Option File vigente ni en UML.';end if;
 end if;
 if pes is not null then
  if url is null then delete from public.player_portraits where pes_id=pes;
  else insert into public.player_portraits(pes_id,photo_url) values(pes,url) on conflict(pes_id) do update set photo_url=excluded.photo_url,updated_at=now();end if;
  update public.players set photo_url=url where option_file_id=pes and not archived;
 else update public.players set photo_url=url where id=p_player;end if;
 perform public.audit('set_player_photo','players',coalesce(p_player::text,pes::text),jsonb_build_object('pes_id',pes,'has_photo',url is not null));
end $$;
revoke all on function public.sync_player_portrait() from public,anon,authenticated;
revoke all on function public.set_player_photo(uuid,bigint,text) from public,anon;
grant execute on function public.set_player_photo(uuid,bigint,text) to authenticated;
notify pgrst,'reload schema';
commit;
