-- Aplicar una vez sobre schema_v2. No ejecuta reinicios ni eliminaciones.
begin;
alter table public.clubs add column if not exists archived boolean not null default false;
alter table public.players add column if not exists archived boolean not null default false;
alter table public.seasons add column if not exists historical boolean not null default false;
alter table public.clubs drop constraint if exists clubs_name_key;
create unique index if not exists clubs_current_name_key on public.clubs(name) where not archived;

create table if not exists public.season_snapshots (
  season_id uuid primary key references public.seasons(id) on delete cascade,
  clubs jsonb not null,
  players jsonb not null,
  captured_at timestamptz not null default now()
);
alter table public.season_snapshots enable row level security;
drop policy if exists snapshot_read on public.season_snapshots;
create policy snapshot_read on public.season_snapshots for select using (true);
grant select on public.season_snapshots to anon, authenticated;

create or replace function public.capture_season_snapshot(p_season uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  insert into public.season_snapshots(season_id, clubs, players)
  select p_season,
    coalesce((select jsonb_agg(to_jsonb(c)) from public.clubs c), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(p)) from public.players p where not p.archived), '[]'::jsonb)
  where exists (select 1 from public.seasons where id = p_season)
  on conflict (season_id) do nothing;
end $$;
revoke all on function public.capture_season_snapshot(uuid) from public, anon, authenticated;

create or replace function public.manage_club(p_club uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clubs; ref record; used boolean;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  -- Coordinar con altas, reinicios y otras operaciones sobre los clubes.
  lock table public.clubs in share row exclusive mode;
  select * into c from public.clubs where id = p_club for update;
  if not found then raise exception 'Club inexistente.'; end if;
  if p_action = 'restore' then
    update public.clubs set archived = false where id = p_club;
  elsif p_action = 'archive' then
    if exists (select 1 from public.season_teams t join public.seasons s on s.id = t.season_id
      where t.club_id = p_club and s.status <> 'closed') then
      raise exception 'El club participa en una temporada pendiente. Cerrala o eliminá esa temporada primero.';
    end if;
    update public.clubs set archived = true where id = p_club;
  elsif p_action = 'delete' then
    -- Comprobar TODAS las referencias antes de permitir un DELETE con cascadas.
    for ref in select con.conrelid::regclass as tbl, a.attname as col
      from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.contype = 'f' and con.confrelid = 'public.clubs'::regclass
    loop
      execute format('lock table %s in share row exclusive mode', ref.tbl);
      execute format('select exists (select 1 from %s where %I = $1)', ref.tbl, ref.col) into used using p_club;
      if used then raise exception 'Este club tiene datos asociados. Usá Archivar para conservar su historial.'; end if;
    end loop;
    if exists (select 1 from public.competitions where champion_club_id = p_club or runnerup_club_id = p_club)
      or exists (select 1 from public.season_snapshots where clubs @> jsonb_build_array(jsonb_build_object('id', p_club))) then
      raise exception 'Este club forma parte del historial. Usá Archivar.';
    end if;
    delete from public.clubs where id = p_club;
  else raise exception 'Acción desconocida.';
  end if;
  perform public.audit(p_action || '_club', 'clubs', p_club::text, to_jsonb(c));
end $$;

create or replace function public.start_new_game(p_confirmation text) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  if p_confirmation is distinct from 'NUEVA ETAPA' then raise exception 'Confirmación incorrecta.'; end if;
  lock table public.seasons, public.clubs, public.players, public.season_teams in share row exclusive mode;
  if exists (select 1 from public.seasons where status <> 'closed') then
    raise exception 'Primero cerrá o eliminá las temporadas en preparación o en curso.';
  end if;
  for s in select id from public.seasons where not historical loop
    perform public.capture_season_snapshot(s.id);
  end loop;
  update public.seasons set historical = true where not historical;
  update public.players set archived = true where not archived;
  update public.clubs set archived = true where not archived;
  perform public.audit('start_new_game', 'seasons', null, jsonb_build_object('confirmation', p_confirmation));
end $$;

create or replace function public.delete_current_season(p_season uuid, p_confirmation text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.seasons;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  lock table public.seasons in share row exclusive mode;
  select * into s from public.seasons where id = p_season for update;
  if not found then raise exception 'Temporada inexistente.'; end if;
  if s.status = 'closed' or s.historical then raise exception 'Las temporadas cerradas se conservan como historial.'; end if;
  if p_confirmation is distinct from ('ELIMINAR ' || s.name) then raise exception 'Confirmación incorrecta.'; end if;
  -- Retener jugadores incluso si existe una referencia de retiro cargada manualmente.
  update public.players set retired_season_id = null where retired_season_id = p_season;
  -- Las FK eliminan solo competencias, partidos, eventos, sanciones, movimientos,
  -- entrenamientos, ofertas, cola y participaciones de ESTA temporada.
  delete from public.seasons where id = p_season;
  -- El banco guarda su saldo acumulado además del libro de movimientos.
  update public.settings set value = jsonb_set(value, '{balance}',
    to_jsonb(coalesce((select sum(amount) from public.transactions where club_id is null), 0)))
    where key = 'bank';
  perform public.audit('delete_current_season', 'seasons', p_season::text, to_jsonb(s));
end $$;

-- Evitar que una interfaz antigua borre clubes o temporadas por cascada.
drop policy if exists "admin clubs" on public.clubs;
drop policy if exists "admin seasons" on public.seasons;
drop policy if exists clubs_insert on public.clubs;
drop policy if exists clubs_update on public.clubs;
drop policy if exists seasons_insert on public.seasons;
drop policy if exists seasons_update on public.seasons;
create policy clubs_insert on public.clubs for insert with check (public.is_admin());
create policy clubs_update on public.clubs for update using (public.is_admin()) with check (public.is_admin());
create policy seasons_insert on public.seasons for insert with check (public.is_admin());
create policy seasons_update on public.seasons for update using (public.is_admin() and not historical) with check (public.is_admin() and not historical);

-- Los jugadores de etapas archivadas no se pueden modificar ni eliminar.
create or replace function public.protect_archived_player() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.archived then raise exception 'El jugador pertenece a una etapa archivada.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_archived_player on public.players;
create trigger protect_archived_player before update or delete on public.players
for each row execute function public.protect_archived_player();

-- Preservar la foto disponible de temporadas ya cerradas. No se inventan datos anteriores.
insert into public.season_snapshots(season_id, clubs, players)
select s.id,
  coalesce((select jsonb_agg(to_jsonb(c)) from public.clubs c), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(p)) from public.players p where not p.archived), '[]'::jsonb)
from public.seasons s where s.status = 'closed'
on conflict (season_id) do nothing;

revoke all on function public.manage_club(uuid, text) from public, anon;
revoke all on function public.start_new_game(text) from public, anon;
revoke all on function public.delete_current_season(uuid, text) from public, anon;
grant execute on function public.manage_club(uuid, text) to authenticated;
grant execute on function public.start_new_game(text) to authenticated;
grant execute on function public.delete_current_season(uuid, text) to authenticated;

-- La versión de close_season adaptada se incluye a continuación.

-- Bloquear escrituras sobre una etapa histórica incluso desde un navegador antiguo.
create or replace function public.protect_historical_season() returns trigger
language plpgsql security definer set search_path = public as $$
declare row_data jsonb; sid uuid; old_sid uuid; cid uuid; mid uuid;
begin
  if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;
  sid := (row_data->>'season_id')::uuid;
  if tg_table_name = 'matches' or tg_table_name = 'competition_teams' then
    cid := (row_data->>'competition_id')::uuid;
    select season_id into sid from public.competitions where id = cid;
  elsif tg_table_name = 'match_events' then
    mid := (row_data->>'match_id')::uuid;
    select c.season_id into sid from public.matches m join public.competitions c on c.id = m.competition_id where m.id = mid;
  end if;
  if exists (select 1 from public.seasons where id = sid and historical) then
    raise exception 'Esta temporada pertenece a una etapa archivada y solo admite consulta.';
  end if;
  if tg_op = 'UPDATE' then
    old_sid := (to_jsonb(old)->>'season_id')::uuid;
    if tg_table_name in ('matches', 'competition_teams') then
      select season_id into old_sid from public.competitions where id = (to_jsonb(old)->>'competition_id')::uuid;
    elsif tg_table_name = 'match_events' then
      select c.season_id into old_sid from public.matches m join public.competitions c on c.id = m.competition_id where m.id = (to_jsonb(old)->>'match_id')::uuid;
    end if;
    if exists (select 1 from public.seasons where id = old_sid and historical) then
      raise exception 'No se pueden mover datos de una etapa archivada.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'season_teams' and exists (select 1 from public.clubs where id = (row_data->>'club_id')::uuid and archived) then
    raise exception 'Restaurá el club antes de sumarlo a una temporada.';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['competitions','season_teams','competition_teams','matches','match_events','sanctions','offers','transfer_queue','transactions','player_training'] loop
    execute format('drop trigger if exists protect_historical_season on public.%I', t);
    execute format('create trigger protect_historical_season before insert or update or delete on public.%I for each row execute function public.protect_historical_season()', t);
  end loop;
end $$;

create or replace function public.close_season(p_season uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; worst record; fine numeric; v_retired int; result jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  perform 1 from public.seasons where id = p_season for update;
  if (select status from public.seasons where id = p_season) <> 'active' then raise exception 'La temporada no está activa.'; end if;
  perform public.capture_season_snapshot(p_season);
  cfg := public.season_cfg(p_season);
  -- Multa de fair play: equipo(s) con más puntos de tarjetas
  fine := (cfg->>'fairplay_fine')::numeric;
  for worst in
    with pts as (
      select e.club_id, sum(case when e.type = 'yellow' then (cfg->>'yellow_points')::int when e.type in ('red','second_yellow') then (cfg->>'red_points')::int else 0 end) p
      from public.match_events e join public.matches m on m.id = e.match_id join public.competitions c on c.id = m.competition_id
      where c.season_id = p_season group by e.club_id)
    select * from pts where p = (select max(p) from pts) and p > 0
  loop
    perform public.money_move(p_season, worst.club_id, -fine, 'fine', 'Multa de fair play (' || worst.p || ' puntos de tarjetas)');
    perform public.money_move(p_season, null, fine, 'fine', 'Multa de fair play · ' || (select name from public.clubs where id = worst.club_id));
    result := result || jsonb_build_object('fairplay_fined', (select name from public.clubs where id = worst.club_id));
  end loop;
  -- Cesiones vuelven
  update public.players set club_id = loan_from_club_id, loan_from_club_id = null where loan_from_club_id is not null and not archived;
  -- Edad +1 y retiros
  update public.players set age = age + 1 where not archived and not retired;
  update public.players set retired = true, retired_season_id = p_season, club_id = null, number = null where not archived and not retired and age >= (cfg->>'retire_age')::int;
  get diagnostics v_retired = row_count;
  result := result || jsonb_build_object('retired', v_retired);
  update public.seasons set status = 'closed', closed_at = now(), market_open = false where id = p_season;
  perform public.audit('close_season', 'seasons', p_season::text, result);
  return result;
end $$;
create or replace function public.squad_count(p_club uuid, p_season uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.players where club_id = p_club and not archived and not retired)::int
       + (select count(*) from public.transfer_queue q where q.season_id = p_season and q.status = 'pending' and q.club_id = p_club and q.kind in ('free_sign','auction','raffle'))::int
       - (select count(*) from public.transfer_queue q where q.season_id = p_season and q.status = 'pending' and q.club_id = p_club and q.kind = 'release')::int
       + coalesce((select sum(coalesce(array_length(players_ask,1),0) - coalesce(array_length(players_give,1),0)) from public.offers where season_id = p_season and status = 'accepted' and buyer_club_id = p_club),0)::int
       + coalesce((select sum(coalesce(array_length(players_give,1),0) - coalesce(array_length(players_ask,1),0)) from public.offers where season_id = p_season and status = 'accepted' and seller_club_id = p_club),0)::int $$;
commit;
