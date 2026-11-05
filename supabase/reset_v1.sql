-- =====================================================================
--  SOLO si instalaste la versión 1 (schema.sql) antes.
--  Borra las tablas viejas (incluida la liga de prueba) para instalar la v2.
--  Correr en Supabase > SQL Editor y DESPUÉS correr schema_v2.sql
-- =====================================================================
drop view if exists public.active_sanctions;
drop table if exists public.transactions, public.transfer_offers, public.match_events, public.matches, public.players, public.teams, public.tournaments cascade;
drop table if exists public.audit_log, public.transfer_queue, public.offers, public.sanctions, public.player_training, public.competition_teams, public.season_teams, public.competitions, public.seasons, public.clubs, public.settings cascade;
drop function if exists public.generate_fixture(uuid), public.set_result(uuid,int,int,jsonb), public.respond_offer(uuid,boolean), public.cancel_offer(uuid), public.create_offer(uuid,uuid,numeric), public.sign_free_agent(uuid,uuid), public.release_player(uuid), public.adjust_budget(uuid,numeric,text), public.manages_team(uuid);
-- Los perfiles (usuarios registrados) se conservan; la v2 les agrega columnas.
alter table public.profiles drop column if exists created_at;
alter table public.profiles add column if not exists first_name text, add column if not exists last_name text, add column if not exists avatar_url text, add column if not exists is_simulator boolean not null default false, add column if not exists created_at timestamptz not null default now();
