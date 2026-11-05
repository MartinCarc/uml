-- =====================================================================
--  UML (UEFA Manager League) - Esquema v2
--  Pegar TODO este archivo en Supabase > SQL Editor > New query > Run
--  Si venís de la versión 1, primero corré supabase/reset_v1.sql
-- =====================================================================
create extension if not exists pgcrypto;

-- =====================================================================
-- 1. PERFILES Y ROLES
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  first_name text,
  last_name text,
  avatar_url text,
  is_admin boolean not null default false,
  is_simulator boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1));
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    n := n + 1; candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
create or replace function public.is_simulator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_simulator or is_admin from public.profiles where id = auth.uid()), false) $$;

-- =====================================================================
-- 2. CONFIGURACIÓN GLOBAL (nombre, banco, webhook…)
-- =====================================================================
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values
  ('league', '{"name":"UML","full_name":"UEFA Manager League","currency":"$"}'),
  ('bank', '{"name":"UML Bank","balance":1000000000,"enabled":false,"notice":"Banco no disponible por el momento"}'),
  ('discord', '{"webhook_url":"","enabled":false}')
on conflict (key) do nothing;

-- =====================================================================
-- 3. TEMPORADAS Y COMPETENCIAS
-- =====================================================================
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null default 'one' check (mode in ('one', 'two')),   -- una liga / dos divisiones
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  market_open boolean not null default true,
  market_label text default 'Mercado de inicio de temporada',
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
-- Valores por defecto de config (se completan al crear desde la web; estos son el respaldo)
create or replace function public.default_season_config() returns jsonb language sql immutable as $$
  select '{
    "budget_tier1": 200000000, "budget_tier2": 150000000,
    "tv_tier1": 60000000, "tv_tier2": 40000000,
    "ticket_price": 50,
    "occupancy": {"top4": 1.0, "top8": 0.85, "upper_half": 0.70, "lower_half": 0.55, "relegation": 0.40},
    "relegation_zone": 3,
    "multipliers": {"league": 1.0, "derby": 1.25, "cup_early": 1.0, "cup_qf": 1.15, "cup_sf": 1.30, "promotion": 1.30, "final": 1.50},
    "fairplay_fine": 10000000, "yellow_points": 1, "red_points": 3,
    "gym_cost": 15000000,
    "squad_limit": 32, "retire_age": 41,
    "sanction_red": 2, "sanction_second_yellow": 1, "sanction_yellows_per_ban": 3, "sanction_yellow_ban": 1,
    "injury_minor": 2, "injury_major": 4
  }'::jsonb $$;

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  kind text not null check (kind in ('league', 'cup', 'supercup', 'promotion')),
  tier int not null default 1,                 -- 1 = Premier, 2 = Championship
  name text not null,
  logo_url text,
  status text not null default 'draft' check (status in ('draft', 'active', 'finished')),
  format jsonb not null default '{}'::jsonb,   -- liga: {"rounds":"double"}; copa: {"legs":1,"penalties":true,"groups":false}
  points_win int not null default 3,
  points_draw int not null default 1,
  promote_direct int not null default 0,       -- liga tier 2: ascienden directo
  relegate_direct int not null default 0,      -- liga tier 1: descienden directo
  promotion_slots int not null default 0,      -- equipos de cada lado que juegan promoción
  champion_club_id uuid,
  runnerup_club_id uuid,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists competitions_season_idx on public.competitions(season_id);

-- =====================================================================
-- 4. CLUBES, PARTICIPACIÓN POR TEMPORADA, JUGADORES
-- =====================================================================
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  short_name text,
  color text default '#1F5FC4',
  crest_url text,
  stadium_name text,
  stadium_capacity int not null default 40000,
  created_at timestamptz not null default now()
);

-- Un club dentro de una temporada: DT, presupuesto, división
create table if not exists public.season_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  tier int not null default 1,
  manager_id uuid references public.profiles(id) on delete set null,
  budget numeric not null default 0,
  reserved numeric not null default 0,         -- comprometido en acuerdos pendientes / subastas
  sponsor_id uuid,
  gym_vouchers int not null default 0,
  unique (season_id, club_id)
);
create index if not exists season_teams_season_idx on public.season_teams(season_id);

create table if not exists public.competition_teams (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  group_name text,
  seed int,
  primary key (competition_id, club_id)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,          -- null = agente libre
  loan_from_club_id uuid references public.clubs(id) on delete set null, -- cedido: dueño real
  name text not null,
  position text not null default 'MC' check (position in ('ARQ','DFC','LD','LI','MCD','MC','MD','MI','MCO','DC','SD','ED','EI')),
  age int not null default 25,
  overall int,
  value numeric not null default 0,            -- valor de referencia (automático)
  price numeric,                               -- precio pedido por el DT
  number int,
  photo_url text,
  stats jsonb,                                 -- habilidades del PES (cuando se importen)
  transfer_listed boolean not null default false,
  loan_listed boolean not null default false,
  retired boolean not null default false,
  retired_season_id uuid references public.seasons(id),
  pending_club_id uuid references public.clubs(id) on delete set null,  -- premio de sorteo sin cupo
  created_at timestamptz not null default now()
);
create index if not exists players_club_idx on public.players(club_id);

create or replace function public.position_group(p text) returns text language sql immutable as $$
  select case when p = 'ARQ' then 'ARQ' when p in ('DFC','LD','LI') then 'DEF' when p in ('MCD','MC','MD','MI','MCO') then 'MED' else 'DEL' end $$;

-- Entrenamientos por temporada
create table if not exists public.player_training (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  paid_with_voucher boolean not null default false,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5. PARTIDOS, EVENTOS, SANCIONES
-- =====================================================================
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round int not null default 1,
  stage text not null default 'league',       -- league | group | r64 r32 r16 qf sf final | promotion
  leg int not null default 1,
  tie_id uuid,                                 -- agrupa ida y vuelta
  home_club_id uuid references public.clubs(id) on delete cascade,
  away_club_id uuid references public.clubs(id) on delete cascade,
  home_goals int, away_goals int,
  home_pens int, away_pens int,
  status text not null default 'pending' check (status in ('pending', 'played')),
  simulator_id uuid references public.profiles(id) on delete set null,
  discord_url text,
  mvp_player_id uuid references public.players(id) on delete set null,
  save_player_id uuid references public.players(id) on delete set null,
  is_derby boolean not null default false,
  locked boolean not null default false,       -- cerrado por admin: el simulador ya no edita
  played_at timestamptz,
  played_seq bigserial                         -- orden de carga (para contar sanciones cumplidas)
);
create index if not exists matches_competition_idx on public.matches(competition_id, round);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  assist_player_id uuid references public.players(id) on delete set null,
  type text not null check (type in ('goal', 'own_goal', 'yellow', 'second_yellow', 'red', 'injury_minor', 'injury_major')),
  seq int not null default 0
);
create index if not exists match_events_match_idx on public.match_events(match_id);

-- Sanciones: competition_id null = aplica a todos los partidos (lesiones)
create table if not exists public.sanctions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  type text not null check (type in ('red', 'second_yellow', 'yellow_accum', 'injury_minor', 'injury_major', 'manual')),
  matches_total int not null,
  source_match_id uuid references public.matches(id) on delete cascade,
  source_seq bigint not null default 0,
  note text,
  lifted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sanctions_player_idx on public.sanctions(player_id);

-- =====================================================================
-- 6. MERCADO: OFERTAS EN PAQUETE, LISTA DE ESPERA
-- =====================================================================
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  buyer_club_id uuid not null references public.clubs(id) on delete cascade,   -- quien inicia / pide
  seller_club_id uuid not null references public.clubs(id) on delete cascade,  -- quien responde
  players_ask uuid[] not null default '{}',   -- jugadores del vendedor que pide el comprador
  players_give uuid[] not null default '{}',  -- jugadores del comprador que entrega
  money_give numeric not null default 0,      -- dinero que paga el comprador
  money_ask numeric not null default 0,       -- dinero que pide el comprador (trueque con vuelto)
  is_loan boolean not null default false,     -- cesión hasta fin de temporada
  status text not null default 'pending' check (status in ('pending', 'accepted', 'executed', 'rejected', 'cancelled', 'countered')),
  parent_offer_id uuid references public.offers(id) on delete set null,
  created_by uuid references public.profiles(id),
  responder_turn uuid references public.clubs(id),  -- a quién le toca responder
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  executed_at timestamptz
);
create index if not exists offers_season_idx on public.offers(season_id, status);

create table if not exists public.transfer_queue (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  kind text not null check (kind in ('offer', 'free_sign', 'release', 'auction', 'raffle', 'training')),
  ref_id uuid,
  club_id uuid references public.clubs(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'executed', 'cancelled')),
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

-- =====================================================================
-- 7. DINERO: LIBRO DE CAJA (club_id null = UML Bank)
-- =====================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  amount numeric not null,
  kind text not null default 'other',          -- initial, tv, tickets, transfer_in, transfer_out, gym, fine, sponsor, prize, adjust, bank_capital
  description text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists transactions_club_idx on public.transactions(club_id, created_at desc);
insert into public.transactions (club_id, amount, kind, description)
  select null, 1000000000, 'bank_capital', 'Capital inicial del UML Bank'
  where not exists (select 1 from public.transactions where kind = 'bank_capital');

-- =====================================================================
-- 8. AUDITORÍA
-- =====================================================================
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_name text,
  action text not null,
  target_table text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create or replace function public.audit(p_action text, p_table text, p_id text, p_details jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, target_table, target_id, details)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), p_action, p_table, p_id, p_details);
end $$;
-- Trigger genérico para ediciones directas de admin
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.audit('delete', tg_table_name, old.id::text, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    perform public.audit('update', tg_table_name, new.id::text, jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
    return new;
  else
    perform public.audit('insert', tg_table_name, new.id::text, to_jsonb(new));
    return new;
  end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['seasons','competitions','clubs','season_teams','players','matches','sanctions'] loop
    execute format('drop trigger if exists audit_%s on public.%I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute procedure public.audit_row_change()', t, t);
  end loop;
end $$;

-- =====================================================================
-- 9. SEGURIDAD (RLS)
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['profiles','settings','seasons','competitions','clubs','season_teams','competition_teams','players','player_training','matches','match_events','sanctions','offers','transfer_queue','transactions','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read %s" on public.%I', t, t);
    execute format('create policy "read %s" on public.%I for select using (true)', t, t);
    execute format('drop policy if exists "admin %s" on public.%I', t, t);
    execute format('create policy "admin %s" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id
    and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())
    and is_simulator = (select p.is_simulator from public.profiles p where p.id = auth.uid()));

-- =====================================================================
-- 10. HELPERS
-- =====================================================================
create or replace function public.manages_club(p_club uuid, p_season uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.season_teams where club_id = p_club and season_id = p_season and manager_id = auth.uid()) $$;

create or replace function public.season_cfg(p_season uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.default_season_config() || coalesce((select config from public.seasons where id = p_season), '{}'::jsonb) $$;

create or replace function public.club_tier(p_club uuid, p_season uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select tier from public.season_teams where club_id = p_club and season_id = p_season), 1) $$;

create or replace function public.squad_count(p_club uuid, p_season uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.players where club_id = p_club and not retired)::int
       + (select count(*) from public.transfer_queue q where q.season_id = p_season and q.status = 'pending' and q.club_id = p_club and q.kind in ('free_sign','auction','raffle'))::int
       - (select count(*) from public.transfer_queue q where q.season_id = p_season and q.status = 'pending' and q.club_id = p_club and q.kind = 'release')::int
       + coalesce((select sum(coalesce(array_length(players_ask,1),0) - coalesce(array_length(players_give,1),0)) from public.offers where season_id = p_season and status = 'accepted' and buyer_club_id = p_club),0)::int
       + coalesce((select sum(coalesce(array_length(players_give,1),0) - coalesce(array_length(players_ask,1),0)) from public.offers where season_id = p_season and status = 'accepted' and seller_club_id = p_club),0)::int $$;

-- Movimiento de dinero con asiento (club null = banco)
create or replace function public.money_move(p_season uuid, p_club uuid, p_amount numeric, p_kind text, p_desc text, p_ref uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_club is null then
    update public.settings set value = jsonb_set(value, '{balance}', to_jsonb((value->>'balance')::numeric + p_amount)), updated_at = now() where key = 'bank';
  else
    update public.season_teams set budget = budget + p_amount where season_id = p_season and club_id = p_club;
  end if;
  insert into public.transactions (season_id, club_id, amount, kind, description, ref_id) values (p_season, p_club, p_amount, p_kind, p_desc, p_ref);
end $$;

-- =====================================================================
-- 11. TABLA DE POSICIONES
-- =====================================================================
create or replace function public.standings(p_competition uuid)
returns table (club_id uuid, pos int, pj int, g int, e int, p int, gf int, gc int, dif int, pts int)
language sql stable security definer set search_path = public as $$
  with c as (select points_win pw, points_draw pd from public.competitions where id = p_competition),
  rows as (
    select ct.club_id,
      coalesce(sum(case when m.id is not null then 1 else 0 end),0)::int pj,
      coalesce(sum(case when (m.home_club_id = ct.club_id and m.home_goals > m.away_goals) or (m.away_club_id = ct.club_id and m.away_goals > m.home_goals) then 1 else 0 end),0)::int g,
      coalesce(sum(case when m.id is not null and m.home_goals = m.away_goals then 1 else 0 end),0)::int e,
      coalesce(sum(case when (m.home_club_id = ct.club_id and m.home_goals < m.away_goals) or (m.away_club_id = ct.club_id and m.away_goals < m.home_goals) then 1 else 0 end),0)::int p,
      coalesce(sum(case when m.home_club_id = ct.club_id then m.home_goals when m.away_club_id = ct.club_id then m.away_goals else 0 end),0)::int gf,
      coalesce(sum(case when m.home_club_id = ct.club_id then m.away_goals when m.away_club_id = ct.club_id then m.home_goals else 0 end),0)::int gc
    from public.competition_teams ct
    left join public.matches m on m.competition_id = ct.competition_id and m.status = 'played' and m.stage in ('league','group')
      and (m.home_club_id = ct.club_id or m.away_club_id = ct.club_id)
    where ct.competition_id = p_competition
    group by ct.club_id
  )
  select r.club_id,
    (row_number() over (order by (r.g * c.pw + r.e * c.pd) desc, (r.gf - r.gc) desc, r.gf desc, (select name from public.clubs where id = r.club_id)))::int pos,
    r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc dif, (r.g * c.pw + r.e * c.pd)::int pts
  from rows r, c
$$;

-- Liga de un club en una temporada (para posición en entradas, etc.)
create or replace function public.club_league(p_club uuid, p_season uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select c.id from public.competitions c join public.competition_teams ct on ct.competition_id = c.id
  where c.season_id = p_season and c.kind = 'league' and ct.club_id = p_club limit 1 $$;

-- =====================================================================
-- 12. SANCIONES VIGENTES (calculadas, no se "descuentan" a mano)
-- =====================================================================
-- Partidos jugados por el club del jugador después del partido de origen, dentro del alcance
create or replace function public.sanction_served(p_sanction uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.sanctions s
  join public.players pl on pl.id = s.player_id
  join public.matches m on m.status = 'played' and m.played_seq > s.source_seq
    and (m.home_club_id = pl.club_id or m.away_club_id = pl.club_id)
  join public.competitions c on c.id = m.competition_id and c.season_id = s.season_id
  where s.id = p_sanction and (s.competition_id is null or s.competition_id = m.competition_id) $$;

create or replace view public.active_sanctions as
  select s.*, public.sanction_served(s.id) served, s.matches_total - public.sanction_served(s.id) remaining,
         pl.club_id, pl.name player_name
  from public.sanctions s join public.players pl on pl.id = s.player_id
  where not s.lifted and public.sanction_served(s.id) < s.matches_total;

-- =====================================================================
-- 13. TEMPORADA: INICIAR / FIXTURE DE LIGA / COPA
-- =====================================================================
create or replace function public.start_season(p_season uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; st record;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  if (select status from public.seasons where id = p_season) <> 'draft' then raise exception 'La temporada ya fue iniciada.'; end if;
  cfg := public.season_cfg(p_season);
  for st in select * from public.season_teams where season_id = p_season loop
    perform public.money_move(p_season, st.club_id, case when st.tier = 2 then (cfg->>'budget_tier2')::numeric else (cfg->>'budget_tier1')::numeric end, 'initial', 'Presupuesto inicial');
    perform public.money_move(p_season, st.club_id, case when st.tier = 2 then (cfg->>'tv_tier2')::numeric else (cfg->>'tv_tier1')::numeric end, 'tv', 'Derechos de TV · ' || (select name from public.seasons where id = p_season));
  end loop;
  update public.seasons set status = 'active' where id = p_season;
  perform public.audit('start_season', 'seasons', p_season::text, null);
end $$;

create or replace function public.generate_league_fixture(p_competition uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  comp public.competitions%rowtype; ids uuid[]; n int; half int; r int; i int; a uuid; b uuid; tmp uuid; is_double boolean;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  select * into comp from public.competitions where id = p_competition for update;
  if comp.kind <> 'league' then raise exception 'Esta competencia no es una liga.'; end if;
  if comp.status <> 'draft' then raise exception 'El fixture ya fue generado.'; end if;
  is_double := coalesce(comp.format->>'rounds', 'double') = 'double';
  select array_agg(club_id order by random()) into ids from public.competition_teams where competition_id = p_competition;
  if ids is null or array_length(ids,1) < 2 then raise exception 'Hacen falta al menos 2 equipos.'; end if;
  if array_length(ids,1) % 2 = 1 then ids := ids || null::uuid; end if;
  n := array_length(ids,1); half := n / 2;
  delete from public.matches where competition_id = p_competition;
  for r in 1..(n-1) loop
    for i in 1..half loop
      a := ids[i]; b := ids[n+1-i];
      if a is not null and b is not null then
        if r % 2 = 0 then tmp := a; a := b; b := tmp; end if;
        insert into public.matches (competition_id, round, stage, home_club_id, away_club_id) values (p_competition, r, 'league', a, b);
        if is_double then insert into public.matches (competition_id, round, stage, home_club_id, away_club_id) values (p_competition, r + n - 1, 'league', b, a); end if;
      end if;
    end loop;
    tmp := ids[n]; ids := ids[1:1] || tmp || ids[2:n-1];
  end loop;
  update public.competitions set status = 'active' where id = p_competition;
  perform public.audit('generate_fixture', 'competitions', p_competition::text, null);
  return case when is_double then 2*(n-1) else n-1 end;
end $$;

-- Ganador de una llave (uno o dos partidos; penales si hay empate global)
create or replace function public.tie_winner(p_tie uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare a uuid; b uuid; ga int := 0; gb int := 0; pa int := 0; pb int := 0; m record; cnt int := 0;
begin
  for m in select * from public.matches where tie_id = p_tie order by leg loop
    if m.status <> 'played' then return null; end if;
    if cnt = 0 then a := m.home_club_id; b := m.away_club_id; end if;
    cnt := cnt + 1;
    if m.home_club_id = a then ga := ga + m.home_goals; gb := gb + m.away_goals; pa := coalesce(m.home_pens,0); pb := coalesce(m.away_pens,0);
    else ga := ga + m.away_goals; gb := gb + m.home_goals; pa := coalesce(m.away_pens,0); pb := coalesce(m.home_pens,0); end if;
  end loop;
  if cnt = 0 then return null; end if;
  if ga > gb then return a; elsif gb > ga then return b; end if;
  if pa > pb then return a; elsif pb > pa then return b; end if;
  return null;  -- empate sin penales cargados
end $$;

-- Copa por eliminación directa. Si la cantidad no es potencia de 2, los sobrantes (por sorteo) pasan de ronda.
create or replace function public.stage_name(p_teams int) returns text language sql immutable as $$
  select case when p_teams <= 2 then 'final' when p_teams <= 4 then 'sf' when p_teams <= 8 then 'qf' when p_teams <= 16 then 'r16' when p_teams <= 32 then 'r32' else 'r64' end $$;

create or replace function public.generate_cup_round(p_competition uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  comp public.competitions%rowtype; ids uuid[]; n int; target int; byes int; r int; legs int; i int; nmatches int := 0; a uuid; b uuid; t uuid; last_round int;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  select * into comp from public.competitions where id = p_competition for update;
  if comp.kind not in ('cup','supercup') then raise exception 'Esta competencia no es una copa.'; end if;
  legs := coalesce((comp.format->>'legs')::int, 1);
  select coalesce(max(round),0) into last_round from public.matches where competition_id = p_competition;

  if last_round = 0 then
    select array_agg(club_id order by coalesce(seed, 999999), random()) into ids from public.competition_teams where competition_id = p_competition;
  else
    if exists (select 1 from public.matches where competition_id = p_competition and round = last_round and status = 'pending') then
      raise exception 'Todavía hay partidos pendientes en la ronda actual.';
    end if;
    -- ganadores de la ronda anterior + los que pasaron directo
    select array_agg(w order by random()) into ids from (
      select public.tie_winner(m.tie_id) w from public.matches m where m.competition_id = p_competition and m.round = last_round group by m.tie_id
      union all
      select ct.club_id from public.competition_teams ct where ct.competition_id = p_competition and ct.seed = -last_round  -- bye marcado
    ) x where w is not null;
    update public.competition_teams set seed = null where competition_id = p_competition and seed = -last_round;
  end if;
  n := array_length(ids,1);
  if n is null or n < 2 then
    -- campeón
    if n = 1 then update public.competitions set status = 'finished', champion_club_id = ids[1] where id = p_competition; end if;
    return 0;
  end if;
  r := last_round + 1;
  target := 1; while target * 2 <= n loop target := target * 2; end loop;   -- mayor potencia de 2 <= n
  byes := case when target = n then 0 else target * 2 - n end;            -- los que pasan directo
  -- los primeros "byes" pasan de ronda (marcados con seed negativo = ronda en la que esperan)
  for i in 1..byes loop update public.competition_teams set seed = -r where competition_id = p_competition and club_id = ids[i]; end loop;
  i := byes + 1;
  while i < n loop
    a := ids[i]; b := ids[i+1]; t := gen_random_uuid();
    insert into public.matches (competition_id, round, stage, leg, tie_id, home_club_id, away_club_id)
      values (p_competition, r, public.stage_name(n), 1, t, a, b);
    if legs = 2 and (n - byes) > 2 then
      insert into public.matches (competition_id, round, stage, leg, tie_id, home_club_id, away_club_id) values (p_competition, r, public.stage_name(n), 2, t, b, a);
    end if;
    nmatches := nmatches + 1; i := i + 2;
  end loop;
  update public.competitions set status = 'active' where id = p_competition;
  perform public.audit('generate_cup_round', 'competitions', p_competition::text, jsonb_build_object('round', r, 'ties', nmatches, 'byes', byes));
  return nmatches;
end $$;

-- =====================================================================
-- 14. RESULTADO DE UN PARTIDO (admin o simulador asignado)
-- =====================================================================
create or replace function public.set_result(p_match uuid, p_home int, p_away int, p_events jsonb default '[]'::jsonb,
  p_mvp uuid default null, p_save uuid default null, p_discord text default null, p_home_pens int default null, p_away_pens int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.matches%rowtype; comp public.competitions%rowtype; cfg jsonb; e jsonb; i int := 0; was_played boolean;
  pid uuid; cid uuid; ev_type text; league_id uuid; v_pos int; nteams int; occ numeric; mult numeric; income numeric; stage_mult text; yc int;
  home_name text; away_name text;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Partido inexistente.'; end if;
  if not coalesce(public.is_admin() or (public.is_simulator() and m.simulator_id = auth.uid() and not m.locked), false) then
    raise exception 'No tenés permiso para cargar este partido.';
  end if;
  if p_home < 0 or p_away < 0 then raise exception 'Goles inválidos.'; end if;
  select * into comp from public.competitions where id = m.competition_id;
  cfg := public.season_cfg(comp.season_id);
  was_played := m.status = 'played';

  update public.matches set home_goals = p_home, away_goals = p_away, home_pens = p_home_pens, away_pens = p_away_pens,
    status = 'played', played_at = coalesce(played_at, now()), mvp_player_id = p_mvp, save_player_id = p_save, discord_url = p_discord
    where id = p_match;
  if not was_played then update public.matches set played_seq = nextval('public.matches_played_seq_seq') where id = p_match; end if;
  select * into m from public.matches where id = p_match;

  -- Eventos
  delete from public.match_events where match_id = p_match;
  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.match_events (match_id, club_id, player_id, assist_player_id, type, seq)
    values (p_match, (e->>'club_id')::uuid, nullif(e->>'player_id','')::uuid, nullif(e->>'assist_player_id','')::uuid, e->>'type', i);
  end loop;

  -- Sanciones originadas en este partido (se regeneran)
  delete from public.sanctions where source_match_id = p_match and type <> 'manual';
  for e in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    pid := nullif(e->>'player_id','')::uuid; ev_type := e->>'type';
    if pid is null then continue; end if;
    if ev_type = 'red' then
      insert into public.sanctions (player_id, competition_id, season_id, type, matches_total, source_match_id, source_seq) values (pid, comp.id, comp.season_id, 'red', (cfg->>'sanction_red')::int, p_match, m.played_seq);
    elsif ev_type = 'second_yellow' then
      insert into public.sanctions (player_id, competition_id, season_id, type, matches_total, source_match_id, source_seq) values (pid, comp.id, comp.season_id, 'second_yellow', (cfg->>'sanction_second_yellow')::int, p_match, m.played_seq);
    elsif ev_type = 'injury_minor' then
      insert into public.sanctions (player_id, competition_id, season_id, type, matches_total, source_match_id, source_seq) values (pid, null, comp.season_id, 'injury_minor', (cfg->>'injury_minor')::int, p_match, m.played_seq);
    elsif ev_type = 'injury_major' then
      insert into public.sanctions (player_id, competition_id, season_id, type, matches_total, source_match_id, source_seq) values (pid, null, comp.season_id, 'injury_major', (cfg->>'injury_major')::int, p_match, m.played_seq);
    end if;
  end loop;
  -- Acumulación de amarillas en esta competencia (cada N amarillas, 1 partido). Se regenera para los jugadores del partido.
  for pid in select distinct player_id from public.match_events where match_id = p_match and type = 'yellow' and player_id is not null loop
    delete from public.sanctions s where s.player_id = pid and s.competition_id = comp.id and s.type = 'yellow_accum';
    yc := 0;
    for e in select jsonb_build_object('mid', ev.match_id, 'seq', mm.played_seq) from public.match_events ev join public.matches mm on mm.id = ev.match_id
             where ev.player_id = pid and ev.type = 'yellow' and mm.competition_id = comp.id and mm.status = 'played' order by mm.played_seq loop
      yc := yc + 1;
      if yc % (cfg->>'sanction_yellows_per_ban')::int = 0 then
        insert into public.sanctions (player_id, competition_id, season_id, type, matches_total, source_match_id, source_seq)
        values (pid, comp.id, comp.season_id, 'yellow_accum', (cfg->>'sanction_yellow_ban')::int, (e->>'mid')::uuid, (e->>'seq')::bigint);
      end if;
    end loop;
  end loop;

  -- Entradas (solo la primera vez que se carga; en una corrección se recalcula)
  delete from public.transactions where ref_id = p_match and kind = 'tickets';
  select name into home_name from public.clubs where id = m.home_club_id;
  select name into away_name from public.clubs where id = m.away_club_id;
  stage_mult := case
    when m.stage = 'final' or comp.kind = 'supercup' then 'final'
    when m.stage = 'sf' then 'cup_sf' when m.stage = 'qf' then 'cup_qf'
    when m.stage = 'promotion' then 'promotion'
    when m.is_derby then 'derby'
    when comp.kind = 'league' then 'league' else 'cup_early' end;
  mult := (cfg->'multipliers'->>stage_mult)::numeric;
  for cid in select unnest(case when stage_mult = 'final' then array[m.home_club_id, m.away_club_id] else array[m.home_club_id] end) loop
    if stage_mult = 'final' then occ := 1.0;
    else
      league_id := public.club_league(cid, comp.season_id);
      select s.pos into v_pos from public.standings(league_id) s where s.club_id = cid;
      select count(*) into nteams from public.competition_teams where competition_id = league_id;
      occ := case
        when v_pos is null then (cfg->'occupancy'->>'upper_half')::numeric
        when v_pos <= 4 then (cfg->'occupancy'->>'top4')::numeric
        when v_pos <= 8 then (cfg->'occupancy'->>'top8')::numeric
        when v_pos > nteams - (cfg->>'relegation_zone')::int then (cfg->'occupancy'->>'relegation')::numeric
        when v_pos <= ceil(nteams / 2.0) then (cfg->'occupancy'->>'upper_half')::numeric
        else (cfg->'occupancy'->>'lower_half')::numeric end;
    end if;
    select round(stadium_capacity * (cfg->>'ticket_price')::numeric * occ * mult) into income from public.clubs where id = cid;
    perform public.money_move(comp.season_id, cid, income, 'tickets',
      format('Entradas · %s vs %s · %s × %s × %s%% × %s', home_name, away_name, (select stadium_capacity from public.clubs where id = cid), cfg->>'ticket_price', round(occ*100), mult), p_match);
  end loop;

  perform public.audit('set_result', 'matches', p_match::text, jsonb_build_object('home', p_home, 'away', p_away, 'events', p_events));
end $$;

-- Admin: asignar simulador, marcar clásico, bloquear
create or replace function public.lock_match(p_match uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  update public.matches set locked = p_locked where id = p_match;
end $$;

-- Admin: levantar o crear sanción manual
create or replace function public.lift_sanction(p_sanction uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  update public.sanctions set lifted = true where id = p_sanction;
  perform public.audit('lift_sanction', 'sanctions', p_sanction::text, null);
end $$;
create or replace function public.add_sanction(p_player uuid, p_season uuid, p_competition uuid, p_matches int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  insert into public.sanctions (player_id, competition_id, season_id, type, matches_total, source_seq, note)
  values (p_player, p_competition, p_season, 'manual', p_matches, (select coalesce(max(played_seq),0) from public.matches), p_note);
end $$;

-- =====================================================================
-- 15. MERCADO
-- =====================================================================
-- Validaciones comunes del paquete
create or replace function public.validate_offer(p_season uuid, p_buyer uuid, p_seller uuid, p_ask uuid[], p_give uuid[], p_money_give numeric, p_money_ask numeric)
returns void language plpgsql security definer set search_path = public as $$
declare cfg jsonb; lim int; pid uuid; bt public.season_teams%rowtype; stt public.season_teams%rowtype;
begin
  cfg := public.season_cfg(p_season); lim := (cfg->>'squad_limit')::int;
  if p_buyer = p_seller then raise exception 'No podés negociar con tu propio equipo.'; end if;
  if coalesce(array_length(p_ask,1),0) = 0 and coalesce(array_length(p_give,1),0) = 0 then raise exception 'La oferta tiene que incluir al menos un jugador.'; end if;
  if p_money_give < 0 or p_money_ask < 0 then raise exception 'Monto inválido.'; end if;
  if p_money_give > 0 and p_money_ask > 0 then raise exception 'El dinero va en un solo sentido.'; end if;
  select * into bt from public.season_teams where season_id = p_season and club_id = p_buyer;
  select * into stt from public.season_teams where season_id = p_season and club_id = p_seller;
  if bt.id is null or stt.id is null then raise exception 'Equipo fuera de la temporada.'; end if;
  foreach pid in array p_ask loop
    if not exists (select 1 from public.players where id = pid and club_id = p_seller and not retired and loan_from_club_id is null) then raise exception 'Un jugador pedido no pertenece al otro equipo (o está cedido).'; end if;
  end loop;
  foreach pid in array p_give loop
    if not exists (select 1 from public.players where id = pid and club_id = p_buyer and not retired and loan_from_club_id is null) then raise exception 'Un jugador ofrecido no pertenece a tu equipo (o está cedido).'; end if;
  end loop;
  if bt.budget - bt.reserved < p_money_give then raise exception 'El comprador no tiene saldo disponible suficiente (%).', bt.budget - bt.reserved; end if;
  if stt.budget - stt.reserved < p_money_ask then raise exception 'El vendedor no tiene saldo disponible suficiente.'; end if;
  if public.squad_count(p_buyer, p_season) + coalesce(array_length(p_ask,1),0) - coalesce(array_length(p_give,1),0) > lim then
    raise exception 'Plantel lleno (%/%). Liberá un cupo o incluí jugadores tuyos en la oferta.', public.squad_count(p_buyer, p_season), lim;
  end if;
  if public.squad_count(p_seller, p_season) - coalesce(array_length(p_ask,1),0) + coalesce(array_length(p_give,1),0) > lim then
    raise exception 'El otro equipo quedaría con más de % jugadores.', lim;
  end if;
end $$;

create or replace function public.create_offer(p_season uuid, p_buyer uuid, p_seller uuid, p_ask uuid[], p_give uuid[], p_money_give numeric, p_money_ask numeric, p_is_loan boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  p_ask := coalesce(p_ask, '{}'); p_give := coalesce(p_give, '{}');
  if not (public.manages_club(p_buyer, p_season) or public.is_admin()) then raise exception 'No dirigís ese equipo.'; end if;
  if (select status from public.seasons where id = p_season) <> 'active' then raise exception 'La temporada no está activa.'; end if;
  perform public.validate_offer(p_season, p_buyer, p_seller, p_ask, p_give, p_money_give, p_money_ask);
  if p_is_loan and (coalesce(array_length(p_give,1),0) > 0 or coalesce(array_length(p_ask,1),0) <> 1) then raise exception 'Una cesión es por un solo jugador y sin jugadores a cambio.'; end if;
  insert into public.offers (season_id, buyer_club_id, seller_club_id, players_ask, players_give, money_give, money_ask, is_loan, created_by, responder_turn)
  values (p_season, p_buyer, p_seller, p_ask, p_give, p_money_give, p_money_ask, p_is_loan, auth.uid(), p_seller) returning id into v_id;
  return v_id;
end $$;

-- Contraoferta: el que tiene el turno propone un paquete nuevo; la original queda 'countered'
create or replace function public.counter_offer(p_offer uuid, p_ask uuid[], p_give uuid[], p_money_give numeric, p_money_ask numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.offers%rowtype; v_id uuid;
begin
  select * into o from public.offers where id = p_offer for update;
  if o.status <> 'pending' then raise exception 'La oferta ya fue resuelta.'; end if;
  if not (public.manages_club(o.responder_turn, o.season_id) or public.is_admin()) then raise exception 'No te toca responder esta oferta.'; end if;
  -- la contraoferta se expresa siempre desde el punto de vista del comprador original
  perform public.validate_offer(o.season_id, o.buyer_club_id, o.seller_club_id, p_ask, p_give, p_money_give, p_money_ask);
  update public.offers set status = 'countered', resolved_at = now() where id = p_offer;
  insert into public.offers (season_id, buyer_club_id, seller_club_id, players_ask, players_give, money_give, money_ask, is_loan, created_by, parent_offer_id, responder_turn)
  values (o.season_id, o.buyer_club_id, o.seller_club_id, p_ask, p_give, p_money_give, p_money_ask, o.is_loan, auth.uid(), p_offer,
          case when o.responder_turn = o.seller_club_id then o.buyer_club_id else o.seller_club_id end)
  returning id into v_id;
  return v_id;
end $$;

-- Ejecuta un acuerdo (mueve jugadores y dinero)
create or replace function public.execute_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.offers%rowtype; pid uuid; bname text; sname text; pname text;
begin
  select * into o from public.offers where id = p_offer for update;
  if o.status <> 'accepted' then return; end if;
  select name into bname from public.clubs where id = o.buyer_club_id;
  select name into sname from public.clubs where id = o.seller_club_id;
  -- liberar reservas
  update public.season_teams set reserved = reserved - o.money_give where season_id = o.season_id and club_id = o.buyer_club_id;
  update public.season_teams set reserved = reserved - o.money_ask where season_id = o.season_id and club_id = o.seller_club_id;
  foreach pid in array o.players_ask loop
    select name into pname from public.players where id = pid;
    if o.is_loan then update public.players set club_id = o.buyer_club_id, loan_from_club_id = o.seller_club_id, transfer_listed = false, loan_listed = false where id = pid;
    else update public.players set club_id = o.buyer_club_id, transfer_listed = false, loan_listed = false, price = null where id = pid; end if;
    update public.offers set status = 'cancelled', resolved_at = now() where status = 'pending' and id <> p_offer and (pid = any(players_ask) or pid = any(players_give));
  end loop;
  foreach pid in array o.players_give loop
    update public.players set club_id = o.seller_club_id, transfer_listed = false, loan_listed = false, price = null where id = pid;
    update public.offers set status = 'cancelled', resolved_at = now() where status = 'pending' and id <> p_offer and (pid = any(players_ask) or pid = any(players_give));
  end loop;
  if o.money_give > 0 then
    perform public.money_move(o.season_id, o.buyer_club_id, -o.money_give, 'transfer_out', (case when o.is_loan then 'Cesión' else 'Compra' end) || ' · ' || sname, p_offer);
    perform public.money_move(o.season_id, o.seller_club_id, o.money_give, 'transfer_in', (case when o.is_loan then 'Cesión' else 'Venta' end) || ' · ' || bname, p_offer);
  end if;
  if o.money_ask > 0 then
    perform public.money_move(o.season_id, o.seller_club_id, -o.money_ask, 'transfer_out', 'Intercambio · ' || bname, p_offer);
    perform public.money_move(o.season_id, o.buyer_club_id, o.money_ask, 'transfer_in', 'Intercambio · ' || sname, p_offer);
  end if;
  update public.offers set status = 'executed', executed_at = now() where id = p_offer;
end $$;

create or replace function public.respond_offer(p_offer uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o public.offers%rowtype; open_mkt boolean;
begin
  select * into o from public.offers where id = p_offer for update;
  if o.status <> 'pending' then raise exception 'La oferta ya fue resuelta.'; end if;
  if not (public.manages_club(o.responder_turn, o.season_id) or public.is_admin()) then raise exception 'No te toca responder esta oferta.'; end if;
  if not p_accept then
    update public.offers set status = 'rejected', resolved_at = now() where id = p_offer; return;
  end if;
  perform public.validate_offer(o.season_id, o.buyer_club_id, o.seller_club_id, o.players_ask, o.players_give, o.money_give, o.money_ask);
  update public.offers set status = 'accepted', resolved_at = now() where id = p_offer;
  update public.season_teams set reserved = reserved + o.money_give where season_id = o.season_id and club_id = o.buyer_club_id;
  update public.season_teams set reserved = reserved + o.money_ask where season_id = o.season_id and club_id = o.seller_club_id;
  select market_open into open_mkt from public.seasons where id = o.season_id;
  if open_mkt then perform public.execute_offer(p_offer);
  else insert into public.transfer_queue (season_id, kind, ref_id, club_id) values (o.season_id, 'offer', p_offer, o.buyer_club_id); end if;
  perform public.audit('accept_offer', 'offers', p_offer::text, null);
end $$;

create or replace function public.cancel_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.offers%rowtype;
begin
  select * into o from public.offers where id = p_offer for update;
  if o.status <> 'pending' then raise exception 'Solo se cancelan ofertas pendientes (un acuerdo aceptado es vinculante).'; end if;
  -- puede cancelar quien NO tiene el turno (el que la propuso), o admin
  if not (public.is_admin() or public.manages_club(case when o.responder_turn = o.seller_club_id then o.buyer_club_id else o.seller_club_id end, o.season_id)) then
    raise exception 'No podés cancelar esta oferta.';
  end if;
  update public.offers set status = 'cancelled', resolved_at = now() where id = p_offer;
end $$;

-- Admin: anular un acuerdo aceptado todavía no ejecutado
create or replace function public.void_offer(p_offer uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.offers%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  select * into o from public.offers where id = p_offer for update;
  if o.status <> 'accepted' then raise exception 'Solo se anulan acuerdos aceptados y no ejecutados.'; end if;
  update public.season_teams set reserved = reserved - o.money_give where season_id = o.season_id and club_id = o.buyer_club_id;
  update public.season_teams set reserved = reserved - o.money_ask where season_id = o.season_id and club_id = o.seller_club_id;
  update public.offers set status = 'cancelled', resolved_at = now() where id = p_offer;
  update public.transfer_queue set status = 'cancelled' where ref_id = p_offer and status = 'pending';
  perform public.audit('void_offer', 'offers', p_offer::text, jsonb_build_object('reason', p_reason));
end $$;

-- DT: marcar transferible / cedible / precio / dorsal
create or replace function public.update_my_player(p_player uuid, p_season uuid, p_price numeric, p_number int, p_transfer boolean, p_loan boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype;
begin
  select * into pl from public.players where id = p_player;
  if pl.club_id is null then raise exception 'Jugador sin equipo.'; end if;
  if not (public.manages_club(pl.club_id, p_season) or public.is_admin()) then raise exception 'No dirigís ese equipo.'; end if;
  if p_number is not null and exists (select 1 from public.players where club_id = pl.club_id and number = p_number and id <> p_player and not retired) then raise exception 'Ese dorsal ya está en uso.'; end if;
  update public.players set price = p_price, number = p_number, transfer_listed = coalesce(p_transfer, false), loan_listed = coalesce(p_loan, false) where id = p_player;
end $$;

-- Agentes libres (gratis) y liberación (gratis), sujetos al mercado
create or replace function public.sign_free_agent(p_season uuid, p_player uuid, p_club uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype; cfg jsonb; open_mkt boolean;
begin
  if not (public.manages_club(p_club, p_season) or public.is_admin()) then raise exception 'No dirigís ese equipo.'; end if;
  select * into pl from public.players where id = p_player for update;
  if pl.club_id is not null or pl.retired then raise exception 'Ese jugador no es agente libre.'; end if;
  if exists (select 1 from public.transfer_queue where player_id = p_player and status = 'pending') then raise exception 'Ese jugador ya tiene un fichaje pendiente.'; end if;
  cfg := public.season_cfg(p_season);
  if public.squad_count(p_club, p_season) >= (cfg->>'squad_limit')::int then raise exception 'Plantel lleno (%/%). Liberá un cupo primero.', public.squad_count(p_club, p_season), cfg->>'squad_limit'; end if;
  select market_open into open_mkt from public.seasons where id = p_season;
  if open_mkt then
    update public.players set club_id = p_club where id = p_player;
    perform public.audit('sign_free_agent', 'players', p_player::text, jsonb_build_object('club', p_club));
  else
    insert into public.transfer_queue (season_id, kind, club_id, player_id) values (p_season, 'free_sign', p_club, p_player);
  end if;
end $$;

create or replace function public.release_player(p_season uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype; open_mkt boolean;
begin
  select * into pl from public.players where id = p_player for update;
  if pl.club_id is null then raise exception 'Jugador sin equipo.'; end if;
  if pl.loan_from_club_id is not null then raise exception 'No podés liberar un jugador cedido.'; end if;
  if not (public.manages_club(pl.club_id, p_season) or public.is_admin()) then raise exception 'No dirigís ese equipo.'; end if;
  if exists (select 1 from public.offers where status in ('pending','accepted') and (p_player = any(players_ask) or p_player = any(players_give))) then raise exception 'Ese jugador está en una negociación o acuerdo.'; end if;
  select market_open into open_mkt from public.seasons where id = p_season;
  if open_mkt then
    update public.players set club_id = null, transfer_listed = false, loan_listed = false, price = null, number = null where id = p_player;
    perform public.audit('release_player', 'players', p_player::text, jsonb_build_object('club', pl.club_id));
  else
    insert into public.transfer_queue (season_id, kind, club_id, player_id) values (p_season, 'release', pl.club_id, p_player);
  end if;
end $$;

-- Admin: abrir / cerrar mercado. Al abrir se ejecuta la lista de espera.
create or replace function public.set_market(p_season uuid, p_open boolean, p_label text default null) returns int
language plpgsql security definer set search_path = public as $$
declare q record; n int := 0;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  update public.seasons set market_open = p_open, market_label = coalesce(p_label, market_label) where id = p_season;
  if p_open then
    for q in select * from public.transfer_queue where season_id = p_season and status = 'pending' order by created_at loop
      begin
        if q.kind = 'offer' then perform public.execute_offer(q.ref_id);
        elsif q.kind = 'release' then update public.players set club_id = null, transfer_listed = false, loan_listed = false, price = null, number = null where id = q.player_id;
        elsif q.kind = 'free_sign' then update public.players set club_id = q.club_id where id = q.player_id and club_id is null;
        elsif q.kind in ('auction','raffle') then update public.players set club_id = q.club_id, pending_club_id = null where id = q.player_id;
        elsif q.kind = 'training' then
          update public.players set overall = coalesce(overall,0) + 1 where id = q.player_id;
          update public.player_training set applied = true where id = q.ref_id;
        end if;
        update public.transfer_queue set status = 'executed', executed_at = now() where id = q.id;
        n := n + 1;
      exception when others then
        perform public.audit('queue_error', 'transfer_queue', q.id::text, jsonb_build_object('error', sqlerrm));
      end;
    end loop;
  end if;
  perform public.audit(case when p_open then 'market_open' else 'market_close' end, 'seasons', p_season::text, jsonb_build_object('executed', n));
  return n;
end $$;

-- Admin: ajustar presupuesto
create or replace function public.adjust_budget(p_season uuid, p_club uuid, p_amount numeric, p_desc text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  perform public.money_move(p_season, p_club, p_amount, 'adjust', coalesce(p_desc, 'Ajuste del administrador'));
  perform public.audit('adjust_budget', 'season_teams', p_club::text, jsonb_build_object('amount', p_amount, 'desc', p_desc));
end $$;

-- =====================================================================
-- 16. GIMNASIO
-- =====================================================================
create or replace function public.train_player(p_season uuid, p_player uuid, p_use_voucher boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype; cfg jsonb; st public.season_teams%rowtype; used int; maxn int; tid uuid; open_mkt boolean;
begin
  select * into pl from public.players where id = p_player for update;
  if pl.club_id is null or pl.loan_from_club_id is not null then raise exception 'Solo podés entrenar jugadores propios.'; end if;
  if not (public.manages_club(pl.club_id, p_season) or public.is_admin()) then raise exception 'No dirigís ese equipo.'; end if;
  if pl.age >= 25 then raise exception 'Solo pueden entrenar jugadores de hasta 24 años.'; end if;
  maxn := case when pl.age <= 20 then 3 else 2 end;
  select count(*) into used from public.player_training where player_id = p_player and season_id = p_season;
  if used >= maxn then raise exception 'Este jugador ya usó sus % entrenamientos de la temporada.', maxn; end if;
  cfg := public.season_cfg(p_season);
  select * into st from public.season_teams where season_id = p_season and club_id = pl.club_id for update;
  if p_use_voucher then
    if st.gym_vouchers <= 0 then raise exception 'No tenés vales de gimnasio.'; end if;
    update public.season_teams set gym_vouchers = gym_vouchers - 1 where id = st.id;
  else
    if st.budget - st.reserved < (cfg->>'gym_cost')::numeric then raise exception 'Saldo insuficiente para el gimnasio.'; end if;
    perform public.money_move(p_season, pl.club_id, -(cfg->>'gym_cost')::numeric, 'gym', 'Gimnasio · ' || pl.name);
    perform public.money_move(p_season, null, (cfg->>'gym_cost')::numeric, 'gym', 'Gimnasio · ' || pl.name || ' (' || (select name from public.clubs where id = pl.club_id) || ')');
  end if;
  insert into public.player_training (player_id, season_id, club_id, paid_with_voucher) values (p_player, p_season, pl.club_id, p_use_voucher) returning id into tid;
  select market_open into open_mkt from public.seasons where id = p_season;
  if open_mkt then
    update public.players set overall = coalesce(overall,0) + 1 where id = p_player;
    update public.player_training set applied = true where id = tid;
  else
    insert into public.transfer_queue (season_id, kind, ref_id, club_id, player_id) values (p_season, 'training', tid, pl.club_id, p_player);
  end if;
end $$;

-- =====================================================================
-- 17. CIERRE DE TEMPORADA
-- =====================================================================
create or replace function public.close_season(p_season uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; worst record; fine numeric; v_retired int; result jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  if (select status from public.seasons where id = p_season) <> 'active' then raise exception 'La temporada no está activa.'; end if;
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
  update public.players set club_id = loan_from_club_id, loan_from_club_id = null where loan_from_club_id is not null;
  -- Edad +1 y retiros
  update public.players set age = age + 1 where not retired;
  update public.players set retired = true, retired_season_id = p_season, club_id = null, number = null where not retired and age >= (cfg->>'retire_age')::int;
  get diagnostics v_retired = row_count;
  result := result || jsonb_build_object('retired', v_retired);
  update public.seasons set status = 'closed', closed_at = now(), market_open = false where id = p_season;
  perform public.audit('close_season', 'seasons', p_season::text, result);
  return result;
end $$;

-- =====================================================================
-- PERMISOS DE EJECUCIÓN
-- =====================================================================
grant execute on all functions in schema public to anon, authenticated;

-- =====================================================================
-- LISTO. Después de registrarte en la web, convertite en admin con:
--   update public.profiles set is_admin = true where username = 'TU_USUARIO';
-- =====================================================================
