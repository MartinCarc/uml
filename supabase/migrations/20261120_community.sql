-- Inicio, comunicados, sorteos, premios, registro EDIT y calendario.
-- Aplicar como consulta NUEVA después de Option File, subastas y fotos.
begin;
create table if not exists public.announcements(id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 1 and 160),body text not null check(length(body) between 1 and 20000),pinned boolean not null default false,author_id uuid references public.profiles(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.online_sessions(id uuid primary key,user_id uuid not null references public.profiles(id) on delete cascade,seen_at timestamptz not null default clock_timestamp());
create index if not exists online_sessions_seen on public.online_sessions(seen_at);
create table if not exists public.app_notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,season_id uuid references public.seasons(id) on delete cascade,kind text not null,title text not null,link text not null,event_key text not null,created_at timestamptz not null default now(),read_at timestamptz,unique(user_id,event_key));
create index if not exists notifications_user on public.app_notifications(user_id,created_at desc);
create table if not exists public.raffles(id uuid primary key default gen_random_uuid(),season_id uuid not null references public.seasons(id),name text not null check(length(name) between 1 and 160),status text not null default 'draft' check(status in ('draft','drawn')),created_by uuid references public.profiles(id),created_at timestamptz not null default now(),drawn_at timestamptz,participants jsonb,draw_method text);
create table if not exists public.raffle_prizes(id uuid primary key default gen_random_uuid(),raffle_id uuid not null references public.raffles(id) on delete cascade,sort_order int not null,kind text not null check(kind in ('player','money','gym','card')),config jsonb not null,unique(raffle_id,sort_order));
create table if not exists public.raffle_awards(id uuid primary key default gen_random_uuid(),prize_id uuid not null unique references public.raffle_prizes(id),raffle_id uuid not null references public.raffles(id),season_id uuid not null references public.seasons(id),club_id uuid not null references public.clubs(id),player_id uuid references public.players(id),used_at timestamptz,used_by uuid references public.profiles(id),used_player_id uuid references public.players(id),used_player_name text,used_player_pes_id bigint,chosen_card text,created_at timestamptz not null default now(),unique(raffle_id,club_id));
create table if not exists public.raffle_reserves(id uuid primary key default gen_random_uuid(),award_id uuid not null unique references public.raffle_awards(id),season_id uuid not null references public.seasons(id),club_id uuid not null references public.clubs(id),player_id uuid not null references public.players(id),status text not null default 'pending' check(status in ('pending','delivered')),created_at timestamptz not null default now(),delivered_at timestamptz);
create unique index if not exists reserve_one_player on public.raffle_reserves(player_id) where status='pending';
create table if not exists public.edit_changes(id uuid primary key default gen_random_uuid(),season_id uuid references public.seasons(id),player_id uuid not null references public.players(id),pes_id bigint,player_name text not null,club_id uuid references public.clubs(id),club_name text,actor_id uuid references public.profiles(id),actor_name text,kind text not null check(kind in ('gym','card')),source text not null,award_id uuid unique references public.raffle_awards(id),before_data jsonb not null,after_data jsonb not null,details jsonb not null,created_at timestamptz not null default now(),exported_at timestamptz,exported_by uuid references public.profiles(id));
create index if not exists edit_changes_player on public.edit_changes(player_id,created_at);
create table if not exists public.sim_turns(id uuid primary key default gen_random_uuid(),season_id uuid not null references public.seasons(id) on delete cascade,sort_order int not null,kind text not null check(kind in ('league','competition')),competition_id uuid references public.competitions(id),round int not null check(round>0),stage text not null,scheduled_at timestamptz,check((kind='league' and competition_id is null and stage='league') or (kind='competition' and competition_id is not null)));
create unique index if not exists sim_turn_unique on public.sim_turns(season_id,kind,coalesce(competition_id,'00000000-0000-0000-0000-000000000000'::uuid),stage,round);
create table if not exists public.sim_calendar_state(season_id uuid primary key references public.seasons(id) on delete cascade,published boolean not null default false,last_announced uuid,revision bigint not null default 0);
create unique index if not exists raffle_money_once on public.transactions(ref_id,coalesce(club_id,'00000000-0000-0000-0000-000000000000'::uuid)) where kind='raffle';

do $$ declare t text; begin
 foreach t in array array['announcements','online_sessions','app_notifications','raffles','raffle_prizes','raffle_awards','raffle_reserves','edit_changes','sim_turns','sim_calendar_state'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
 foreach t in array array['announcements','raffles','raffle_prizes','raffle_awards','raffle_reserves','sim_turns','sim_calendar_state'] loop
  execute format('drop policy if exists community_read on public.%I',t);
  execute format('create policy community_read on public.%I for select using(true)',t);
  execute format('grant select on public.%I to anon,authenticated',t);
 end loop;
end $$;
drop policy if exists edit_changes_admin on public.edit_changes;
create policy edit_changes_admin on public.edit_changes for select using(public.is_admin());
grant select on public.edit_changes to authenticated;
drop policy if exists notifications_own on public.app_notifications;
create policy notifications_own on public.app_notifications for select using(user_id=auth.uid());
grant select on public.app_notifications to authenticated;

create or replace function public.community_active(p_season uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 if not exists(select 1 from public.seasons where id=p_season and status<>'closed' and not historical) then raise exception 'La temporada debe estar activa o en preparación.';end if;
end $$;
create or replace function public.community_notice(p_user uuid,p_season uuid,p_kind text,p_title text,p_link text,p_key text) returns void language sql security definer set search_path=public as $$
 insert into public.app_notifications(user_id,season_id,kind,title,link,event_key) select p_user,p_season,p_kind,p_title,p_link,p_key where p_user is not null on conflict(user_id,event_key) do nothing
$$;
create or replace function public.announcement_save(p_title text,p_body text,p_pinned boolean default false,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$ declare result uuid;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 if p_id is null then insert into public.announcements(title,body,pinned,author_id) values(btrim(p_title),btrim(p_body),p_pinned,auth.uid()) returning id into result;
 else update public.announcements set title=btrim(p_title),body=btrim(p_body),pinned=p_pinned,updated_at=now() where id=p_id returning id into result;if not found then raise exception 'Comunicado inexistente.';end if;end if;return result;
end $$;
create or replace function public.announcement_delete(p_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;delete from public.announcements where id=p_id;
end $$;
create or replace function public.online_ping(p_session uuid,p_leave boolean default false) returns void language plpgsql security definer set search_path=public as $$ begin
 if auth.uid() is null then raise exception 'Ingresá a tu cuenta.';end if;
 if p_leave then delete from public.online_sessions where id=p_session and user_id=auth.uid();return;end if;
 insert into public.online_sessions(id,user_id) values(p_session,auth.uid()) on conflict(id) do update set seen_at=clock_timestamp() where online_sessions.user_id=auth.uid();
 delete from public.online_sessions where seen_at<clock_timestamp()-interval '3 minutes';
end $$;
create or replace function public.community_online() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.username),'[]') from(select p.id,p.username,p.avatar_url from public.profiles p where exists(select 1 from public.online_sessions s where s.user_id=p.id and s.seen_at>clock_timestamp()-interval '75 seconds'))x
$$;
create or replace function public.notifications_read(p_id uuid default null) returns void language sql security definer set search_path=public as $$
 update public.app_notifications set read_at=now() where user_id=auth.uid() and (p_id is null or id=p_id) and read_at is null
$$;

-- Un jugador en reserva tiene propietario, pero no ocupa cupo activo/proyectado.
create or replace function public.raffle_deliver(p_season uuid) returns int language plpgsql security definer set search_path=public as $$
declare r record;n int:=0;begin
 perform pg_advisory_xact_lock(13300013);
 if not exists(select 1 from public.seasons where id=p_season and status<>'closed' and not historical and market_open) then return 0;end if;
 for r in select * from public.raffle_reserves where status='pending' and club_id in (select club_id from public.season_teams where season_id=p_season) order by created_at,id for update loop
  perform 1 from public.season_teams where season_id=p_season and club_id=r.club_id for update;
  if public.squad_count(r.club_id,p_season)<coalesce((public.season_cfg(p_season)->>'squad_limit')::int,32) then
   perform set_config('uml.raffle_delivering',r.id::text,true);
   update public.players set club_id=r.club_id,pending_club_id=null where id=r.player_id and club_id is null;
   if not found then raise exception 'Jugador de reserva inconsistente.';end if;
   update public.raffle_reserves set status='delivered',delivered_at=now() where id=r.id;n:=n+1;
   perform set_config('uml.raffle_delivering','',true);
  end if;
 end loop;return n;
end $$;
create or replace function public.raffle_player_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.raffle_reserves;begin
 select * into r from public.raffle_reserves where player_id=old.id and status='pending';
 if found then
  if tg_op='DELETE' then raise exception 'El jugador pertenece a una reserva de sorteo.';end if;
  if new.club_id is distinct from old.club_id or new.pending_club_id is distinct from old.pending_club_id or new.archived is distinct from old.archived or new.retired is distinct from old.retired or new.option_file_id is distinct from old.option_file_id then
   if current_setting('uml.raffle_delivering',true) is distinct from r.id::text or new.club_id is distinct from r.club_id or new.pending_club_id is not null then raise exception 'El jugador está asignado a una reserva de sorteo.';end if;
  end if;
 end if;
 -- Una importación no puede borrar premios que aún no se trasladaron al EDIT.
 if tg_op='UPDATE' and new.option_file_version_id is distinct from old.option_file_version_id and (exists(select 1 from public.edit_changes where player_id=old.id and kind='gym' and exported_at is null) and new.stats is distinct from old.stats or exists(select 1 from public.edit_changes where player_id=old.id and kind='card' and exported_at is null) and new.pes2013_cards is distinct from old.pes2013_cards) then
  raise exception 'Hay mejoras pendientes de trasladar al EDIT para %. Revisá el registro administrativo antes de importar.',old.name;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger if exists raffle_player_guard on public.players;
create trigger raffle_player_guard before update or delete on public.players for each row execute function public.raffle_player_guard();
create or replace function public.raffle_queue_guard() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.player_id is not null and exists(select 1 from public.raffle_reserves where player_id=new.player_id and status='pending') then raise exception 'El jugador está asignado a una reserva de sorteo.';end if;return new;
end $$;
drop trigger if exists raffle_queue_guard on public.transfer_queue;
create trigger raffle_queue_guard before insert or update on public.transfer_queue for each row execute function public.raffle_queue_guard();
create or replace function public.raffle_slot_changed() returns trigger language plpgsql security definer set search_path=public as $$ declare s record;begin
 if tg_op='UPDATE' and new.club_id is not distinct from old.club_id and new.retired is not distinct from old.retired and new.archived is not distinct from old.archived then return null;end if;
 for s in select st.season_id from public.season_teams st join public.seasons se on se.id=st.season_id where st.club_id=old.club_id and se.status<>'closed' and not se.historical loop perform public.raffle_deliver(s.season_id);end loop;return null;
end $$;
drop trigger if exists raffle_slot_changed on public.players;
create constraint trigger raffle_slot_changed after update or delete on public.players deferrable initially deferred for each row execute function public.raffle_slot_changed();
do $$begin if to_regprocedure('public.set_market_before_community(uuid,boolean,text)') is null then alter function public.set_market(uuid,boolean,text) rename to set_market_before_community;end if;end$$;
create or replace function public.set_market(p_season uuid,p_open boolean,p_label text default null) returns int language plpgsql security definer set search_path=public as $$ declare n int;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 n:=public.set_market_before_community(p_season,p_open,p_label);if p_open then n:=n+public.raffle_deliver(p_season);end if;return n;
end $$;

create or replace function public.raffle_save(p_season uuid,p_name text,p_prizes jsonb,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;item jsonb;conf jsonb;idx int:=0;pes bigint;code text;entry public.option_file_entries;pl public.players;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;perform pg_advisory_xact_lock(13300013);perform public.community_active(p_season);
 if jsonb_typeof(p_prizes) is distinct from 'array' or jsonb_array_length(p_prizes)<1 or jsonb_array_length(p_prizes)>(select count(*) from public.season_teams where season_id=p_season) then raise exception 'Debe haber entre uno y tantos premios como equipos participantes.';end if;
 if p_id is null then insert into public.raffles(season_id,name,created_by) values(p_season,btrim(p_name),auth.uid()) returning id into rid;
 else select id into rid from public.raffles where id=p_id and season_id=p_season and status='draft' for update;if not found then raise exception 'Solo se edita un sorteo sin ejecutar.';end if;update public.raffles set name=btrim(p_name) where id=rid;delete from public.raffle_prizes where raffle_id=rid;end if;
 for item in select value from jsonb_array_elements(p_prizes) loop
  idx:=idx+1;conf:=item->'config';
  case item->>'kind'
  when 'money' then
   if (conf->>'amount') is null or (conf->>'amount')::numeric not between 1 and 1000000000000 or (conf->>'amount')::numeric<>trunc((conf->>'amount')::numeric) then raise exception 'Monto de premio inválido.';end if;
   conf:=jsonb_build_object('amount',(conf->>'amount')::numeric);
  when 'gym' then
   if (conf->>'max_age') is null or (conf->>'boost') is null or (conf->>'max_age')::numeric not between 15 and 65 or (conf->>'boost')::numeric not between 1 and 99 or (conf->>'max_age')::numeric<>trunc((conf->>'max_age')::numeric) or (conf->>'boost')::numeric<>trunc((conf->>'boost')::numeric) then raise exception 'Edad máxima o aumento de gimnasio inválidos.';end if;
   conf:=jsonb_build_object('max_age',(conf->>'max_age')::int,'boost',(conf->>'boost')::int);
  when 'card' then
   code:=conf->>'code';if coalesce(conf->>'mode','') not in ('fixed','choice') then raise exception 'Modalidad de tarjeta inválida.';end if;
   if conf->>'mode'='fixed' and (code is null or code !~ '^(P(0[1-9]|1[0-8])|S(0[1-9]|1[0-9]|2[0-6]))$') then raise exception 'Tarjeta inválida.';end if;
   conf:=jsonb_build_object('mode',conf->>'mode','code',case when conf->>'mode'='fixed' then code else null end);
  when 'player' then
   pes:=(conf->>'pes_id')::bigint;
   select e.* into entry from public.option_file_entries e join public.option_file_versions v on v.id=e.version_id where v.status='active' and e.pes_id=pes;
   if not found then raise exception 'Elegí un jugador del Option File vigente.';end if;
   select * into pl from public.players where option_file_id=pes and not archived;
   if pl.id is not null and (pl.club_id is not null or pl.pending_club_id is not null or pl.loan_from_club_id is not null or pl.retired or exists(select 1 from public.transfer_queue where player_id=pl.id and status='pending') or exists(select 1 from public.offers where status in ('pending','accepted') and (pl.id=any(players_ask) or pl.id=any(players_give)))) or exists(select 1 from public.auctions where pes_id=pes and status='open') then raise exception 'El jugador ya pertenece a UML o tiene una operación pendiente.';end if;
   if exists(select 1 from public.players where not archived and option_file_id is null and public.of_normalize(name)=public.of_normalize(entry.name)) then raise exception 'Vinculá primero el jugador manual al Option File.';end if;
   if (conf->>'value') is null or (conf->>'value')::numeric not between 0 and 1000000000000 or (conf->>'value')::numeric<>trunc((conf->>'value')::numeric) then raise exception 'Indicá el valor inicial de Transfermarkt.';end if;
   if exists(select 1 from public.raffle_prizes where raffle_id=rid and kind='player' and (config->>'pes_id')::bigint=pes) then raise exception 'No repitas un jugador dentro del sorteo.';end if;
   conf:=jsonb_build_object('pes_id',pes,'value',(conf->>'value')::numeric,'player',entry.data);
  else raise exception 'Tipo de premio desconocido.';end case;
  insert into public.raffle_prizes(raffle_id,sort_order,kind,config) values(rid,idx,item->>'kind',conf);
 end loop;return rid;
end $$;
create or replace function public.raffle_draw(p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.raffles;pr record;winner uuid;team_ids uuid[];idx int:=0;award uuid;pl public.players;d jsonb;version uuid;total numeric;bank numeric;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;perform pg_advisory_xact_lock(13300013);
 select * into r from public.raffles where id=p_id for update;
 if not found or r.status<>'draft' then raise exception 'El sorteo ya se ejecutó o no existe.';end if;perform public.community_active(r.season_id);
 perform 1 from public.seasons where id=r.season_id for update;
 -- Volver a comprobar disponibilidad y condiciones dentro de la transacción final.
 perform public.raffle_save(r.season_id,r.name,(select jsonb_agg(jsonb_build_object('kind',kind,'config',config) order by sort_order) from public.raffle_prizes where raffle_id=r.id),r.id);
 perform 1 from public.season_teams where season_id=r.season_id order by club_id for update;
 select array_agg(club_id order by gen_random_uuid()) into team_ids from public.season_teams where season_id=r.season_id;
 select coalesce(sum((config->>'amount')::numeric),0) into total from public.raffle_prizes where raffle_id=r.id and kind='money';
 select (value->>'balance')::numeric into bank from public.settings where key='bank' for update;
 if total>0 and (bank is null or bank<total or bank::text in ('NaN','Infinity','-Infinity')) then raise exception 'UML Bank no tiene saldo suficiente para los premios.';end if;
 update public.raffles set participants=(select jsonb_agg(jsonb_build_object('club_id',t.club_id,'club_name',c.name,'manager_id',t.manager_id) order by c.name) from public.season_teams t join public.clubs c on c.id=t.club_id where t.season_id=r.season_id),status='drawn',drawn_at=clock_timestamp(),draw_method='Orden aleatorio UUIDv4 de PostgreSQL; sin reemplazo' where id=r.id;
 for pr in select * from public.raffle_prizes where raffle_id=r.id order by sort_order loop
  idx:=idx+1;winner:=team_ids[idx];
  insert into public.raffle_awards(prize_id,raffle_id,season_id,club_id) values(pr.id,r.id,r.season_id,winner) returning id into award;
  if pr.kind='money' then
   perform public.money_move(r.season_id,null,-(pr.config->>'amount')::numeric,'raffle','Sorteo · '||r.name,award);
   perform public.money_move(r.season_id,winner,(pr.config->>'amount')::numeric,'raffle','Sorteo · '||r.name,award);
  elsif pr.kind='player' then
   select e.data,e.version_id into d,version from public.option_file_entries e join public.option_file_versions v on v.id=e.version_id where v.status='active' and e.pes_id=(pr.config->>'pes_id')::bigint;
   select * into pl from public.players where option_file_id=(pr.config->>'pes_id')::bigint and not archived for update;
   if pl.id is null then
    insert into public.players(name,position,age,overall,value,pending_club_id,stats,pes2013_cards,option_file_id,option_file_data,option_file_version_id)
    values(d->>'name',d->>'position',(d->>'age')::int,(d->>'overall')::int,(pr.config->>'value')::numeric,winner,public.of_stats(d->'abilities'),d->'cards',(pr.config->>'pes_id')::bigint,d,version) returning * into pl;
   else update public.players set value=(pr.config->>'value')::numeric,number=null,pending_club_id=winner,transfer_listed=false,loan_listed=false where id=pl.id returning * into pl;end if;
   update public.raffle_awards set player_id=pl.id where id=award;
   insert into public.raffle_reserves(award_id,season_id,club_id,player_id) values(award,r.season_id,winner,pl.id);
  end if;
  perform public.community_notice((select manager_id from public.season_teams where season_id=r.season_id and club_id=winner),r.season_id,'prize','Ganaste un premio en '||r.name,'#/s/'||r.season_id||'/premios','prize:'||award);
 end loop;
 perform public.raffle_deliver(r.season_id);return r.id;
end $$;
-- Convertir stats UML a los mismos 23 campos que usa el PES Editor.
-- Invertir etiquetas UML a claves PES sin inventar valores faltantes.
create or replace function public.community_abilities(p_stats jsonb) returns jsonb language sql immutable as $$
 select jsonb_object_agg(value#>>'{}',p_stats->key) from jsonb_each(public.of_stats('{"Attack":"Attack","Defence":"Defence","BodyBalance":"BodyBalance","Stamina":"Stamina","TopSpeed":"TopSpeed","Responsiveness":"Responsiveness","ExplosivePower":"ExplosivePower","DribbleAccuracy":"DribbleAccuracy","DribbleSpeed":"DribbleSpeed","ShortPassAccuracy":"ShortPassAccuracy","ShortPassSpeed":"ShortPassSpeed","LongPassAccuracy":"LongPassAccuracy","LongPassSpeed":"LongPassSpeed","ShotAccuracy":"ShotAccuracy","KickingPower":"KickingPower","PlaceKicking":"PlaceKicking","Swerve":"Swerve","HeaderAccuracy":"HeaderAccuracy","Jump":"Jump","BallControl":"BallControl","Tenacity":"Tenacity","GoalKeepingSkill":"GoalKeepingSkill","Teamwork":"Teamwork"}'::jsonb)) x
$$;
create or replace function public.apply_edit_benefit(p_season uuid,p_player uuid,p_kind text,p_boost int,p_card text,p_source text,p_award uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare pl public.players;a jsonb;cards jsonb;d jsonb;before_d jsonb;after_d jsonb;pos text;v_overall int;grp text;log_id uuid;begin
 select * into pl from public.players where id=p_player and not archived and not retired for update;if not found then raise exception 'Jugador no disponible.';end if;
 perform set_config('uml.benefit_write','true',true);
 before_d:=jsonb_build_object('stats',pl.stats,'overall',pl.overall,'cards',pl.pes2013_cards);
 d:=coalesce(pl.option_file_data,'{}');a:=public.community_abilities(pl.stats);cards:=coalesce(pl.pes2013_cards,'{"playing_styles":[],"special_skills":[]}');v_overall:=pl.overall;
 if p_kind='gym' then
  if p_boost not between 1 and 99 or p_boost is null or exists(select 1 from jsonb_each(a) where value='null'::jsonb or jsonb_typeof(value)<>'number' or ((value#>>'{}')::numeric not between 0 and 99 or (value#>>'{}')::numeric<>trunc((value#>>'{}')::numeric))) then raise exception 'El jugador necesita sus 23 habilidades PES completas.';end if;
  select jsonb_object_agg(key,to_jsonb(least(99,(value#>>'{}')::int+p_boost))) into a from jsonb_each(a);
  pos:=case pl.position when 'ARQ' then 'GK' when 'DFC' then 'CB' when 'LI' then 'LB' when 'LD' then 'RB' when 'MCD' then 'DMF' when 'MC' then 'CMF' when 'MI' then 'LMF' when 'MD' then 'RMF' when 'MCO' then 'AMF' when 'EI' then 'LWF' when 'ED' then 'RWF' when 'SD' then 'SS' when 'DC' then 'CF' end;
  if d->>'position'=pl.position and d->>'source_position' is not null then pos:=d->>'source_position';end if;
  v_overall:=public.of_rating(a,pos);d:=d||jsonb_build_object('abilities',a,'overall',v_overall);
  update public.players set stats=public.of_stats(a),overall=v_overall,option_file_data=case when option_file_data is null then null else d end where id=pl.id;
 elsif p_kind='card' then
  if p_card is null or p_card !~ '^(P(0[1-9]|1[0-8])|S(0[1-9]|1[0-9]|2[0-6]))$' then raise exception 'Tarjeta inválida.';end if;
  grp:=case when left(p_card,1)='P' then 'playing_styles' else 'special_skills' end;
  if cards->grp ? p_card then raise exception 'El jugador ya tiene esa tarjeta.';end if;
  cards:=jsonb_set(cards,array[grp],(select jsonb_agg(c order by c) from(select jsonb_array_elements_text(cards->grp)c union select p_card)c));
  update public.players set pes2013_cards=cards,option_file_data=case when option_file_data is null then null else jsonb_set(option_file_data,'{cards}',cards) end where id=pl.id;
 else raise exception 'Beneficio inválido.';end if;
 select jsonb_build_object('stats',stats,'overall',players.overall,'cards',pes2013_cards) into after_d from public.players where id=pl.id;
 insert into public.edit_changes(season_id,player_id,pes_id,player_name,club_id,club_name,actor_id,actor_name,kind,source,award_id,before_data,after_data,details)
 values(p_season,pl.id,pl.option_file_id,pl.name,pl.club_id,(select name from public.clubs where id=pl.club_id),auth.uid(),(select username from public.profiles where id=auth.uid()),p_kind,p_source,p_award,before_d,after_d,jsonb_build_object('boost',p_boost,'card',p_card,'player_age',pl.age,'max_age',case when p_kind='gym' then case when p_award is null then 24 else (select (p.config->>'max_age')::int from public.raffle_prizes p join public.raffle_awards a on a.prize_id=p.id where a.id=p_award) end else null end)) returning id into log_id;
 perform set_config('uml.benefit_write','',true);return log_id;
end $$;
create or replace function public.prize_use(p_season uuid,p_award uuid,p_player uuid,p_card text default null) returns void language plpgsql security definer set search_path=public as $$
declare a public.raffle_awards;pr public.raffle_prizes;pl public.players;card text;begin
 perform pg_advisory_xact_lock(13300013);perform public.community_active(p_season);
 select * into a from public.raffle_awards where id=p_award for update;if not found or a.used_at is not null then raise exception 'El vale ya se utilizó o no existe.';end if;
 if not public.manages_club(a.club_id,p_season) then raise exception 'Solo el DT asignado puede usar el vale.';end if;
 select * into pr from public.raffle_prizes where id=a.prize_id;select * into pl from public.players where id=p_player and club_id=a.club_id and not archived and not retired for update;
 if not found or pl.loan_from_club_id is not null then raise exception 'Elegí un jugador propio del plantel.';end if;
 if pr.kind='gym' then
  if pl.age>(pr.config->>'max_age')::int then raise exception 'Supera la edad máxima inclusive del vale.';end if;
  perform public.apply_edit_benefit(p_season,pl.id,'gym',(pr.config->>'boost')::int,null,'Sorteo · '||(select name from public.raffles where id=a.raffle_id),a.id);
 elsif pr.kind='card' then
  card:=case when pr.config->>'mode'='fixed' then pr.config->>'code' else p_card end;
  perform public.apply_edit_benefit(p_season,pl.id,'card',null,card,'Sorteo · '||(select name from public.raffles where id=a.raffle_id),a.id);
 else raise exception 'Este premio no es un vale.';end if;
 update public.raffle_awards set used_at=now(),used_by=auth.uid(),used_player_id=pl.id,used_player_name=pl.name,used_player_pes_id=pl.option_file_id,chosen_card=card where id=a.id;
end $$;
create or replace function public.edit_change_mark(p_ids uuid[],p_done boolean) returns void language plpgsql security definer set search_path=public as $$begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 update public.edit_changes set exported_at=case when p_done then now() else null end,exported_by=case when p_done then auth.uid() else null end where id=any(p_ids);
end $$;
alter table public.player_training add column if not exists requested_by uuid references public.profiles(id) on delete set null;
alter table public.player_training add column if not exists requested_name text;
-- Mantener límites/costos del gimnasio existente; aplicar habilidades y registrar.
create or replace function public.train_player(p_season uuid,p_player uuid,p_use_voucher boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare pl public.players;st public.season_teams;used int;lim int;tid uuid;cfg jsonb;begin
 perform pg_advisory_xact_lock(13300013);perform public.community_active(p_season);
 select * into pl from public.players where id=p_player and not archived and not retired for update;
 if not found or pl.club_id is null or pl.loan_from_club_id is not null or not (public.manages_club(pl.club_id,p_season) or public.is_admin()) then raise exception 'Solo podés entrenar jugadores propios.';end if;
 if pl.age>=25 then raise exception 'Solo pueden entrenar jugadores de hasta 24 años.';end if;
 lim:=case when pl.age<=20 then 3 else 2 end;select count(*) into used from public.player_training where player_id=p_player and season_id=p_season;
 if used>=lim then raise exception 'El jugador alcanzó su límite de entrenamientos.';end if;
 cfg:=public.season_cfg(p_season);select * into st from public.season_teams where season_id=p_season and club_id=pl.club_id for update;
 -- Validar antes de cobrar, incluso con mercado cerrado.
 if exists(select 1 from jsonb_each(public.community_abilities(pl.stats)) where value='null'::jsonb) then raise exception 'Faltan habilidades PES completas.';end if;
 if p_use_voucher then if st.gym_vouchers<1 then raise exception 'No tenés vales de gimnasio.';end if;update public.season_teams set gym_vouchers=gym_vouchers-1 where id=st.id;
 else
  if st.budget-st.reserved<(cfg->>'gym_cost')::numeric then raise exception 'Saldo insuficiente.';end if;
  perform public.money_move(p_season,pl.club_id,-(cfg->>'gym_cost')::numeric,'gym','Gimnasio · '||pl.name);
  perform public.money_move(p_season,null,(cfg->>'gym_cost')::numeric,'gym','Gimnasio · '||pl.name);
 end if;
 insert into public.player_training(player_id,season_id,club_id,paid_with_voucher,requested_by,requested_name) values(pl.id,p_season,pl.club_id,p_use_voucher,auth.uid(),(select username from public.profiles where id=auth.uid())) returning id into tid;
 if (select market_open from public.seasons where id=p_season) then
  perform public.apply_edit_benefit(p_season,pl.id,'gym',1,null,'Gimnasio habitual');update public.player_training set applied=true where id=tid;
 else insert into public.transfer_queue(season_id,kind,ref_id,club_id,player_id) values(p_season,'training',tid,pl.club_id,pl.id);end if;
end $$;
-- Procesar entrenamientos históricos pendientes sin el antiguo +1 directo a media.
create or replace function public.community_training_due(p_season uuid) returns int language plpgsql security definer set search_path=public as $$declare q record;n int:=0;log_id uuid;begin
 for q in select * from public.transfer_queue where season_id=p_season and kind='training' and status='pending' order by created_at,id for update loop
  if exists(select 1 from public.player_training where id=q.ref_id and not applied) then
   log_id:=public.apply_edit_benefit(p_season,q.player_id,'gym',1,null,'Gimnasio habitual · apertura de mercado');
   update public.edit_changes set actor_id=t.requested_by,actor_name=coalesce(t.requested_name,'Solicitante no registrado') from public.player_training t where edit_changes.id=log_id and t.id=q.ref_id;
   update public.player_training set applied=true where id=q.ref_id;
  end if;
  update public.transfer_queue set status='executed',executed_at=now() where id=q.id;n:=n+1;
 end loop;return n;
end $$;
create or replace function public.set_market(p_season uuid,p_open boolean,p_label text default null) returns int language plpgsql security definer set search_path=public as $$declare n int:=0;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 perform pg_advisory_xact_lock(13300013);
 if not exists(select 1 from public.seasons where id=p_season and status<>'closed' and not historical) then raise exception 'La temporada no admite cambios de mercado.';end if;
 if p_open then n:=public.community_training_due(p_season);end if;
 n:=n+public.set_market_before_community(p_season,p_open,p_label);if p_open then n:=n+public.raffle_deliver(p_season);end if;return n;
end $$;
-- Los demás cambios directos de tarjetas también quedan en el registro privado.
create or replace function public.community_track_cards() returns trigger language plpgsql security definer set search_path=public as $$declare sid uuid;begin
 if new.pes2013_cards is distinct from old.pes2013_cards and current_setting('uml.benefit_write',true) is distinct from 'true' and new.option_file_version_id is not distinct from old.option_file_version_id and not new.archived then
  select s.id into sid from public.seasons s join public.season_teams t on t.season_id=s.id where t.club_id=new.club_id and s.status='active' and not s.historical order by s.created_at desc limit 1;
  if sid is not null then insert into public.edit_changes(season_id,player_id,pes_id,player_name,club_id,club_name,actor_id,actor_name,kind,source,before_data,after_data,details) values(sid,new.id,new.option_file_id,new.name,new.club_id,(select name from public.clubs where id=new.club_id),auth.uid(),(select username from public.profiles where id=auth.uid()),'card','Edición directa',jsonb_build_object('stats',old.stats,'overall',old.overall,'cards',old.pes2013_cards),jsonb_build_object('stats',new.stats,'overall',new.overall,'cards',new.pes2013_cards),'{}');end if;
 end if;return null;
end $$;
drop trigger if exists community_track_cards on public.players;
create trigger community_track_cards after update of pes2013_cards on public.players for each row execute function public.community_track_cards();

create or replace function public.community_market_changed() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.status<>'closed' and new.market_open and not new.historical then perform public.raffle_deliver(new.id);end if;return null;
end $$;
drop trigger if exists community_market_changed on public.seasons;
create constraint trigger community_market_changed after insert or update on public.seasons deferrable initially deferred for each row execute function public.community_market_changed();

-- Calendario: las ligas comparten siempre la misma fecha en un único turno.
create or replace function public.sim_turn_data(p_season uuid) returns jsonb language sql volatile security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order,x.id),'[]') from(
 select t.*,case when t.kind='league' then 'Premier + Championship' else c.name end competition_name,
 coalesce(m.items,'[]') matches,m.total,m.played,
 greatest(1,case when t.kind='league' then (select coalesce(sum(n/2),0) from(select count(*)::int n from public.competition_teams ct join public.competitions co on co.id=ct.competition_id where co.season_id=t.season_id and co.kind='league' group by co.id)q)
 when t.stage='group' then (select count(*)::int/2 from public.competition_teams where competition_id=t.competition_id)
 when t.stage='qf' then 4 when t.stage='sf' then 2 when t.stage='final' then 1 else coalesce(m.total,1) end) expected,
 case when m.total>0 and m.played=m.total and m.total>=greatest(1,case when t.kind='league' then (select coalesce(sum(n/2),0) from(select count(*)::int n from public.competition_teams ct join public.competitions co on co.id=ct.competition_id where co.season_id=t.season_id and co.kind='league' group by co.id)q)
 when t.stage='group' then (select count(*)::int/2 from public.competition_teams where competition_id=t.competition_id) when t.stage='qf' then 4 when t.stage='sf' then 2 when t.stage='final' then 1 else coalesce(m.total,1) end) then 'completed'
 when coalesce(m.total,0)=0 then 'undefined' when m.played>0 then 'in_progress' else 'pending' end state
 from public.sim_turns t left join public.competitions c on c.id=t.competition_id
 left join lateral(select count(*)::int total,count(*) filter(where ma.status='played')::int played,jsonb_agg(to_jsonb(ma) order by ma.id) items from public.matches ma join public.competitions co on co.id=ma.competition_id where co.season_id=t.season_id and ((t.kind='league' and co.kind='league') or (t.kind='competition' and co.id=t.competition_id)) and ma.stage=t.stage and (t.stage not in ('league','group') or ma.round=t.round))m on true where t.season_id=p_season
 )x
$$;
create or replace function public.sim_notify(p_season uuid) returns void language plpgsql security definer set search_path=public as $$declare cur jsonb;prev uuid;u record;rev bigint;begin
 if not exists(select 1 from public.sim_calendar_state where season_id=p_season and published) then return;end if;
 select value into cur from jsonb_array_elements(public.sim_turn_data(p_season)) where value->>'state'<>'completed' limit 1;
 select last_announced into prev from public.sim_calendar_state where season_id=p_season for update;
 if cur is null then update public.sim_calendar_state set last_announced=null where season_id=p_season;return;end if;
 if (cur->>'id')::uuid is not distinct from prev then return;end if;
 update public.sim_calendar_state set last_announced=(cur->>'id')::uuid,revision=revision+1 where season_id=p_season returning revision into rev;
 for u in select distinct id from public.profiles where is_simulator or id in(select manager_id from public.season_teams where season_id=p_season) loop
  perform public.community_notice(u.id,p_season,'simulation','Turno de simulación: '||(cur->>'competition_name')||' · '||(cur->>'stage')||' '||(cur->>'round'),'#/s/'||p_season||'/calendario','turn:'||(cur->>'id')||':'||rev);
 end loop;
end $$;
create or replace function public.sim_turn_save(p_season uuid,p_kind text,p_competition uuid,p_stage text,p_round int,p_scheduled timestamptz default null,p_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$declare rid uuid;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;perform pg_advisory_xact_lock(13300013);
 if not exists(select 1 from public.seasons where id=p_season and status<>'closed' and not historical) then raise exception 'Temporada no editable.';end if;
 if p_kind='league' then p_competition:=null;p_stage:='league';
 elsif p_kind<>'competition' or not exists(select 1 from public.competitions where id=p_competition and season_id=p_season and kind<>'league') then raise exception 'Seleccioná una competencia válida; las ligas comparten turno.';end if;
 if p_kind='competition' and p_stage='league' then raise exception 'Seleccioná una fase de copa, promoción o final.';end if;
 if p_kind='competition' and p_stage<>'group' then p_round:=1;end if;
 if p_stage not in ('league','group','r64','r32','r16','qf','sf','final','promotion') or p_round not between 1 and 100 then raise exception 'Fecha o fase inválida.';end if;
 if p_id is null then insert into public.sim_turns(season_id,sort_order,kind,competition_id,stage,round,scheduled_at) values(p_season,(select coalesce(max(sort_order),0)+1 from public.sim_turns where season_id=p_season),p_kind,p_competition,p_stage,p_round,p_scheduled) returning id into rid;
 else update public.sim_turns set kind=p_kind,competition_id=p_competition,stage=p_stage,round=p_round,scheduled_at=p_scheduled where id=p_id and season_id=p_season returning id into rid;if not found then raise exception 'Turno inexistente.';end if;end if;
 perform public.sim_notify(p_season);return rid;
end $$;
create or replace function public.sim_turn_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path=public as $$declare t public.sim_turns;other public.sim_turns;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;perform pg_advisory_xact_lock(13300013);
 select * into t from public.sim_turns where id=p_id for update;
 if not found or not exists(select 1 from public.seasons where id=t.season_id and status<>'closed' and not historical) then raise exception 'Turno no editable.';end if;
 if p_action='delete' then delete from public.sim_turns where id=t.id;
 elsif p_action in ('up','down') then
  select * into other from public.sim_turns where season_id=t.season_id and (case when p_action='up' then sort_order<t.sort_order else sort_order>t.sort_order end) order by (case when p_action='up' then -sort_order else sort_order end),id limit 1 for update;
  if found then update public.sim_turns set sort_order=case when id=t.id then other.sort_order else t.sort_order end where id in(t.id,other.id);end if;
 else raise exception 'Acción desconocida.';end if;perform public.sim_notify(t.season_id);
end $$;
create or replace function public.sim_publish(p_season uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 if not exists(select 1 from public.seasons where id=p_season and status<>'closed' and not historical) then raise exception 'Temporada no editable.';end if;
 insert into public.sim_calendar_state(season_id,published) values(p_season,true) on conflict(season_id) do update set published=true;perform public.sim_notify(p_season);
end $$;
create or replace function public.community_match_notice() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.status is distinct from old.status then perform public.sim_notify((select season_id from public.competitions where id=new.competition_id));end if;return null;
end $$;
drop trigger if exists community_match_notice on public.matches;
create trigger community_match_notice after update of status on public.matches for each row execute function public.community_match_notice();
create or replace function public.community_offer_notice() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.status='pending' then perform public.community_notice((select manager_id from public.season_teams where season_id=new.season_id and club_id=new.responder_turn),new.season_id,'offer','Tenés una oferta por responder','#/s/'||new.season_id||'/mercado','offer:'||new.id);end if;return null;
end $$;
drop trigger if exists community_offer_notice on public.offers;
create trigger community_offer_notice after insert on public.offers for each row execute function public.community_offer_notice();

-- Contexto público acotado para Inicio y Sorteos; información privada bajo RLS.
create or replace function public.community_feed(p_season uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('announcements',coalesce((select jsonb_agg(to_jsonb(x)) from(select a.*,p.username author_name from public.announcements a left join public.profiles p on p.id=a.author_id order by pinned desc,created_at desc limit 50)x),'[]'),
 'turns',public.sim_turn_data(p_season),'online',public.community_online(),
 'raffles',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from public.raffles r where season_id=p_season or r.id in(select raffle_id from public.raffle_awards where club_id in(select club_id from public.season_teams where season_id=p_season and manager_id=auth.uid()))),'[]'),
 'prizes',coalesce((select jsonb_agg(to_jsonb(p)) from public.raffle_prizes p join public.raffles r on r.id=p.raffle_id where r.season_id=p_season or p.id in(select prize_id from public.raffle_awards where club_id in(select club_id from public.season_teams where season_id=p_season and manager_id=auth.uid()))),'[]'),
 'awards',coalesce((select jsonb_agg(to_jsonb(a)) from public.raffle_awards a where a.season_id=p_season or a.club_id in(select club_id from public.season_teams where season_id=p_season and manager_id=auth.uid())),'[]'),
 'reserves',coalesce((select jsonb_agg(to_jsonb(r)) from public.raffle_reserves r where r.season_id=p_season or r.club_id in(select club_id from public.season_teams where season_id=p_season)),'[]'))
$$;
-- Pulso liviano de Inicio: solo el siguiente turno, no todo el historial.
create or replace function public.community_pulse(p_season uuid) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('turns',coalesce((select jsonb_agg(value) from(select value from jsonb_array_elements(public.sim_turn_data(p_season)) where value->>'state'<>'completed' limit 1)t),'[]'))
$$;
-- Las funciones internas nunca se exponen por RPC.
revoke all on function public.community_active(uuid),public.community_notice(uuid,uuid,text,text,text,text),public.raffle_deliver(uuid),public.raffle_player_guard(),public.raffle_queue_guard(),public.raffle_slot_changed(),public.set_market_before_community(uuid,boolean,text),public.community_abilities(jsonb),public.apply_edit_benefit(uuid,uuid,text,int,text,text,uuid),public.community_training_due(uuid),public.community_market_changed(),public.community_track_cards(),public.sim_notify(uuid),public.community_match_notice(),public.community_offer_notice() from public,anon,authenticated;
revoke all on function public.announcement_save(text,text,boolean,uuid),public.announcement_delete(uuid),public.online_ping(uuid,boolean),public.notifications_read(uuid),public.raffle_save(uuid,text,jsonb,uuid),public.raffle_draw(uuid),public.prize_use(uuid,uuid,uuid,text),public.edit_change_mark(uuid[],boolean),public.sim_turn_save(uuid,text,uuid,text,int,timestamptz,uuid),public.sim_turn_action(uuid,text),public.sim_publish(uuid),public.train_player(uuid,uuid,boolean),public.set_market(uuid,boolean,text) from public,anon;
grant execute on function public.announcement_save(text,text,boolean,uuid),public.announcement_delete(uuid),public.online_ping(uuid,boolean),public.notifications_read(uuid),public.raffle_save(uuid,text,jsonb,uuid),public.raffle_draw(uuid),public.prize_use(uuid,uuid,uuid,text),public.edit_change_mark(uuid[],boolean),public.sim_turn_save(uuid,text,uuid,text,int,timestamptz,uuid),public.sim_turn_action(uuid,text),public.sim_publish(uuid),public.train_player(uuid,uuid,boolean),public.set_market(uuid,boolean,text) to authenticated;
grant execute on function public.community_feed(uuid),public.community_pulse(uuid),public.community_online(),public.sim_turn_data(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
