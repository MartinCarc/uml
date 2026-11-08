-- UML Cup: cuatro grupos de cuatro, tres fechas y eliminatorias neutrales.
-- No reemplaza ni borra fixtures existentes.
begin;
alter table public.matches add column if not exists neutral boolean not null default false;

create or replace function public.cup_group_table(p_competition uuid)
returns table(club_id uuid, group_name text, pos int, pj int, g int, e int, p int, gf int, gc int, dif int, pts int)
language sql stable security definer set search_path=public as $$
 select r.club_id, ct.group_name,
 (row_number() over(partition by ct.group_name order by r.pts desc,r.dif desc,r.gf desc,c.name,r.club_id))::int,
 r.pj,r.g,r.e,r.p,r.gf,r.gc,r.dif,r.pts
 from public.standings(p_competition) r
 join public.competition_teams ct on ct.competition_id=p_competition and ct.club_id=r.club_id
 join public.clubs c on c.id=r.club_id where ct.group_name is not null
$$;

create or replace function public.generate_cup_groups(p_competition uuid) returns int
language plpgsql security definer set search_path=public as $$
declare c public.competitions; ids uuid[]; part uuid[]; k int; group_label text;
begin
 if not public.is_admin() then raise exception 'Solo administradores.'; end if;
 select * into c from public.competitions where id=p_competition for update;
 if not found or c.kind<>'cup' then raise exception 'Seleccioná la UML Cup.'; end if;
 if c.status='finished' or coalesce((c.format->>'cancelled')::boolean,false) then raise exception 'La copa está cerrada.'; end if;
 if exists(select 1 from public.seasons where id=c.season_id and (status='closed' or historical)) then raise exception 'La temporada está cerrada.'; end if;
 if exists(select 1 from public.matches where competition_id=c.id) then raise exception 'La copa ya tiene partidos. El fixture existente se conserva.'; end if;
 select array_agg(club_id order by random()) into ids from public.competition_teams where competition_id=c.id;
 if coalesce(array_length(ids,1),0)<>16 then raise exception 'La UML Cup necesita exactamente 16 equipos.'; end if;
 for k in 0..3 loop
  group_label:=chr(65+k); part:=ids[(k*4+1):(k*4+4)];
  update public.competition_teams set group_name=group_label,seed=null where competition_id=c.id and club_id=any(part);
  insert into public.matches(competition_id,round,stage,home_club_id,away_club_id) values
  (c.id,1,'group',part[1],part[4]),(c.id,1,'group',part[2],part[3]),
  (c.id,2,'group',part[3],part[1]),(c.id,2,'group',part[4],part[2]),
  (c.id,3,'group',part[1],part[2]),(c.id,3,'group',part[3],part[4]);
 end loop;
 update public.competitions set status='active',format=format||'{"groups":true,"legs":1,"penalties":true,"extra_time":true,"neutral_knockout":true}'::jsonb where id=c.id;
 perform public.audit('generate_cup_groups','competitions',c.id::text,null);
 return 24;
end $$;

-- Guardar el generador anterior para conservar las copas existentes.
do $$ begin
 if to_regprocedure('public.generate_knockout_round(uuid)') is null then
  alter function public.generate_cup_round(uuid) rename to generate_knockout_round;
 end if;
end $$;
revoke all on function public.generate_knockout_round(uuid) from public,anon,authenticated;

create or replace function public.generate_cup_round(p_competition uuid) returns int
language plpgsql security definer set search_path=public as $$
declare c public.competitions; ids uuid[]; n int; last_round int; result int; a uuid;b uuid;
begin
 if not public.is_admin() then raise exception 'Solo administradores.'; end if;
 select * into c from public.competitions where id=p_competition for update;
 if not found then raise exception 'Competencia inexistente.'; end if;
 if c.status='finished' or coalesce((c.format->>'cancelled')::boolean,false) then raise exception 'La competencia está cerrada.'; end if;
 if exists(select 1 from public.seasons where id=c.season_id and (status='closed' or historical)) then raise exception 'La temporada está cerrada.'; end if;
 if coalesce((c.format->>'groups')::boolean,false) and c.kind='cup' then
  if not exists(select 1 from public.matches where competition_id=c.id) then return public.generate_cup_groups(c.id); end if;
  if not exists(select 1 from public.matches where competition_id=c.id and stage<>'group') then
   if (select count(*) from public.matches where competition_id=c.id and stage='group')<>24
     or exists(select 1 from public.matches where competition_id=c.id and stage='group' and status<>'played') then
    raise exception 'Completá los 24 partidos de grupos antes de generar cuartos.';
   end if;
   if coalesce((c.format->>'neutral_capacity')::int,0)<=0 then raise exception 'Configurá la capacidad del estadio neutral antes de generar cuartos.'; end if;
   -- Cruces de cuartos entre primeros y segundos de grupos diferentes.
   for n in 1..4 loop
    select club_id into a from public.cup_group_table(c.id) where group_name=(array['A','C','B','D'])[n] and pos=1;
    select club_id into b from public.cup_group_table(c.id) where group_name=(array['B','D','A','C'])[n] and pos=2;
    if a is null or b is null then raise exception 'Faltan clasificados en los grupos.'; end if;
    insert into public.matches(competition_id,round,stage,tie_id,home_club_id,away_club_id,neutral)
    values(c.id,4,'qf',gen_random_uuid(),a,b,true);
   end loop;
   return 4;
  end if;
 end if;
 select max(round) into last_round from public.matches where competition_id=c.id;
 if exists(select 1 from public.matches m where m.competition_id=c.id and m.round=last_round and m.tie_id is not null and public.tie_winner(m.tie_id) is null) then
  raise exception 'Completá los resultados y los penales de todas las llaves.';
 end if;
 result:=public.generate_knockout_round(c.id);
 if coalesce((c.format->>'neutral_knockout')::boolean,false) then
  update public.matches set neutral=true where competition_id=c.id and stage<>'group';
 end if;
 if result=0 and c.kind='cup' then
  select m.home_club_id,m.away_club_id into a,b from public.matches m where m.competition_id=c.id and stage='final' limit 1;
  update public.competitions set runnerup_club_id=case when champion_club_id=a then b else a end where id=c.id and champion_club_id is not null;
 end if;
 return result;
end $$;

create or replace function public.set_cup_neutral_capacity(p_competition uuid,p_capacity int) returns void
language plpgsql security definer set search_path=public as $$
declare c public.competitions;
begin
 if not public.is_admin() then raise exception 'Solo administradores.'; end if;
 select * into c from public.competitions where id=p_competition for update;
 if not found or c.kind<>'cup' or p_capacity is null or (p_capacity<=0 or p_capacity>1000000) then raise exception 'Indicá una capacidad válida para la copa.'; end if;
 if exists(select 1 from public.seasons where id=c.season_id and (status='closed' or historical)) then raise exception 'La temporada está cerrada.'; end if;
 if exists(select 1 from public.matches where competition_id=c.id and stage<>'group') then raise exception 'La capacidad queda fija al generar las eliminatorias.'; end if;
 update public.competitions set format=format||jsonb_build_object('neutral_capacity',p_capacity) where id=c.id;
end $$;
revoke all on function public.set_cup_neutral_capacity(uuid,int) from public,anon;
grant execute on function public.set_cup_neutral_capacity(uuid,int) to authenticated;

create or replace function public.validate_uml_cup_match() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.competitions;
begin
 select * into c from public.competitions where id=new.competition_id;
 if c.kind='cup' and coalesce((c.format->>'groups')::boolean,false) then
  new.neutral:=new.stage<>'group';
  if new.status='played' then
   if new.home_goals is null or new.away_goals is null then raise exception 'Completá el marcador.';end if;
   if new.stage<>'group' and new.home_goals<>new.away_goals and (new.home_pens is not null or new.away_pens is not null) then raise exception 'Solo se cargan penales si el resultado después del tiempo extra está empatado.';end if;
   if new.stage='group' and (new.home_pens is not null or new.away_pens is not null) then raise exception 'En los grupos no se juegan penales.'; end if;
   if new.stage<>'group' and new.home_goals=new.away_goals and
    (new.home_pens is null or new.away_pens is null or new.home_pens=new.away_pens or new.home_pens<0 or new.away_pens<0) then
    raise exception 'Si hay empate después del tiempo extra, cargá los penales para definir un ganador.';
   end if;
  end if;
  if tg_op='UPDATE' and old.status='played' and
     (new.home_goals,new.away_goals,new.home_pens,new.away_pens) is distinct from (old.home_goals,old.away_goals,old.home_pens,old.away_pens)
     and exists(select 1 from public.matches m where m.competition_id=c.id and m.round>old.round and m.stage<>'group') then
   raise exception 'Ya se generó una fase posterior. No se puede cambiar un resultado que define sus clasificados.';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists validate_uml_cup_match on public.matches;
create trigger validate_uml_cup_match before insert or update on public.matches for each row execute function public.validate_uml_cup_match();
revoke all on function public.generate_cup_groups(uuid),public.generate_cup_round(uuid) from public,anon;
grant execute on function public.generate_cup_groups(uuid),public.generate_cup_round(uuid) to authenticated;
grant execute on function public.cup_group_table(uuid) to anon,authenticated;
commit;
