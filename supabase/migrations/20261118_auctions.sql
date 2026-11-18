-- Subastas públicas UML. Conserva planteles, negociaciones y movimientos existentes.
-- Requiere la migración de Option File. El cierre desatendido se habilita con
-- 20261118_auctions_scheduler.sql; no se publican subastas sin ese servicio.
begin;
create table if not exists public.auctions (
 id uuid primary key default gen_random_uuid(),
 season_id uuid not null references public.seasons(id) on delete cascade,
 pes_id bigint not null, player_id uuid references public.players(id),
 player_snapshot jsonb not null, initial_amount numeric not null check(initial_amount>0 and initial_amount<=1000000000000 and initial_amount=trunc(initial_amount)),
 min_increment numeric not null check(min_increment>0 and min_increment<=1000000000000 and min_increment=trunc(min_increment)),
 starts_at timestamptz not null, ends_at timestamptz not null,
 initial_ends_at timestamptz not null, check(ends_at>starts_at),
 top_club_id uuid references public.clubs(id), top_amount numeric,
 status text not null default 'open' check(status in ('open','awarded','no_bids','cancelled')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(), closed_at timestamptz,
 cancel_reason text, closing_error text,
 check((top_club_id is null and top_amount is null) or (top_club_id is not null and top_amount>=initial_amount and top_amount<=1000000000000 and top_amount=trunc(top_amount)))
);
create unique index if not exists auctions_one_open_player on public.auctions(pes_id) where status='open';
create index if not exists auctions_due on public.auctions(ends_at) where status='open';
create index if not exists auctions_season on public.auctions(season_id,created_at);
create table if not exists public.auction_bids (
 id bigserial primary key, auction_id uuid not null references public.auctions(id) on delete cascade,
 club_id uuid not null references public.clubs(id), manager_id uuid references auth.users(id) on delete set null,
 club_name text not null, manager_name text not null,
 amount numeric not null check(amount>0 and amount<=1000000000000 and amount=trunc(amount)),
 placed_at timestamptz not null, previous_end timestamptz not null, resulting_end timestamptz not null
);
create index if not exists auction_bids_history on public.auction_bids(auction_id,id);
create table if not exists public.auction_events (
 id bigserial primary key, auction_id uuid not null references public.auctions(id) on delete cascade,
 kind text not null, details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;
alter table public.auction_events enable row level security;
drop policy if exists auctions_read on public.auctions;
create policy auctions_read on public.auctions for select using(true);
drop policy if exists auction_bids_read on public.auction_bids;
create policy auction_bids_read on public.auction_bids for select using(true);
drop policy if exists auction_events_read on public.auction_events;
create policy auction_events_read on public.auction_events for select using(true);
grant select on public.auctions,public.auction_bids,public.auction_events to anon,authenticated;
revoke insert,update,delete on public.auctions,public.auction_bids,public.auction_events from anon,authenticated;
create unique index if not exists auction_money_once on public.transactions(ref_id,coalesce(club_id,'00000000-0000-0000-0000-000000000000'::uuid)) where kind='auction';
create unique index if not exists auction_queue_once on public.transfer_queue(ref_id) where kind='auction';

-- Disponibilidad real de cupos: cada jugador se cuenta UNA vez en su destino
-- proyectado, también mientras se ejecuta un paquete/cola; las pujas líderes
-- reservan un lugar adicional. No se descuentan ni mueven jugadores al contar.
create or replace function public.auction_projected_owner(p_player uuid,p_season uuid) returns uuid
language sql stable security definer set search_path=public as $$
 select case when q.kind='release' then null when q.id is not null then q.club_id
   when o.id is not null then case when p.id=any(o.players_ask) then o.buyer_club_id else o.seller_club_id end
   else p.club_id end
 from public.players p
 left join lateral(select * from public.transfer_queue q where q.player_id=p.id and q.season_id=p_season and q.status='pending' and q.kind in ('release','free_sign','auction','raffle') order by q.created_at desc,q.id limit 1) q on true
 left join lateral(select * from public.offers o where o.season_id=p_season and o.status='accepted' and (p.id=any(o.players_ask) or p.id=any(o.players_give)) order by o.created_at desc,o.id limit 1) o on true
 where p.id=p_player
$$;
create or replace function public.squad_count(p_club uuid,p_season uuid) returns int
language sql stable security definer set search_path=public as $$
 select (select count(*) from public.players p where not p.archived and not p.retired and public.auction_projected_owner(p.id,p_season)=p_club)::int
  +(select count(*) from public.auctions a where a.season_id=p_season and a.status='open' and a.top_club_id=p_club)::int
$$;
create or replace function public.auction_scheduler_ready() returns boolean
language plpgsql stable security definer set search_path=public as $$
declare ready boolean:=false;
begin
 if to_regclass('cron.job') is null then return false; end if;
 execute 'select exists(select 1 from cron.job where jobname=$1 and active and database=current_database() and command=$2)' into ready using 'uml-auctions-close','select public.auction_close_due();';
 return ready;
end $$;
create or replace function public.auction_guard_budget() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.budget<old.budget and new.budget<new.reserved then raise exception 'Saldo insuficiente: hay dinero reservado en acuerdos o subastas.';end if;
 if new.reserved<0 then raise exception 'La reserva de dinero no puede quedar negativa.'; end if;
 if new.reserved>old.reserved and new.reserved>new.budget then raise exception 'Saldo insuficiente: el dinero ya está comprometido.'; end if;
 if new.reserved>=old.reserved
  and public.squad_count(new.club_id,new.season_id)>coalesce((public.season_cfg(new.season_id)->>'squad_limit')::int,32) then
  raise exception 'No hay cupos disponibles, considerando acuerdos y subastas ganadoras.';
 end if;
 return new;
end $$;
drop trigger if exists auction_guard_budget on public.season_teams;
create trigger auction_guard_budget before update of budget,reserved on public.season_teams for each row execute function public.auction_guard_budget();

create or replace function public.auction_guard_player() returns trigger
language plpgsql security definer set search_path=public as $$
declare a public.auctions; st record; extra int;
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.auctions where status='open' and (player_id=old.id or pes_id=old.option_file_id))
    or exists(select 1 from public.transfer_queue where player_id=old.id and kind='auction' and status='pending') then
   raise exception 'El jugador está reservado en una subasta o incorporación ya pagada.';
  end if;
  return old;
 end if;
 select * into a from public.auctions where status='open' and (pes_id=new.option_file_id or (tg_op='UPDATE' and (player_id=new.id or pes_id=old.option_file_id))) limit 1;
 if found and current_setting('uml.auction_finalizing',true) is distinct from a.id::text then
  if tg_op='INSERT' then raise exception 'Este ID del Option File está reservado para una subasta.'; end if;
  if new.club_id is distinct from old.club_id or new.option_file_id is distinct from old.option_file_id or new.archived is distinct from old.archived or new.retired is distinct from old.retired or new.pending_club_id is distinct from old.pending_club_id or new.loan_from_club_id is distinct from old.loan_from_club_id then
   raise exception 'El jugador está reservado para una subasta. Sus datos deportivos sí pueden actualizarse.';
  end if;
 end if;
 if tg_op='UPDATE' and exists(select 1 from public.transfer_queue q where q.player_id=old.id and q.kind='auction' and q.status='pending') then
  if new.club_id is distinct from old.club_id or new.pending_club_id is distinct from old.pending_club_id or new.archived is distinct from old.archived or new.retired is distinct from old.retired or new.option_file_id is distinct from old.option_file_id then
   if current_setting('uml.auction_delivering',true) is distinct from 'true' or new.club_id is distinct from old.pending_club_id or new.pending_club_id is not null then
    raise exception 'La incorporación ya está pagada y se entrega al abrir el mercado.';
   end if;
  end if;
 end if;
 if new.club_id is not null and (tg_op='INSERT' or new.club_id is distinct from old.club_id) and not new.archived and not new.retired then
  for st in select t.club_id,t.season_id from public.season_teams t join public.seasons s on s.id=t.season_id where t.club_id=new.club_id and not s.historical and s.status<>'closed' order by t.season_id for update of t loop
   extra:=case when public.auction_projected_owner(new.id,st.season_id)=new.club_id then 0 else 1 end;
   if public.squad_count(new.club_id,st.season_id)+extra>coalesce((public.season_cfg(st.season_id)->>'squad_limit')::int,32) then raise exception 'Plantel lleno: hay cupos comprometidos en acuerdos o subastas.'; end if;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists auction_guard_player on public.players;
create trigger auction_guard_player before insert or update or delete on public.players for each row execute function public.auction_guard_player();
create or replace function public.auction_guard_queue() returns trigger
language plpgsql security definer set search_path=public as $$
declare a public.auctions; st public.season_teams;
begin
 if tg_op='DELETE' then
  if old.kind='auction' and old.status='pending' then raise exception 'No se puede borrar una incorporación de subasta ya pagada.'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and old.kind='auction' and old.status='pending' and (new.status is distinct from old.status or new.club_id is distinct from old.club_id or new.player_id is distinct from old.player_id or new.ref_id is distinct from old.ref_id) and current_setting('uml.auction_delivering',true) is distinct from 'true' then
  raise exception 'La incorporación de subasta se procesa al abrir el mercado.';
 end if;
 if new.status='pending' and new.player_id is not null then
  if exists(select 1 from public.auctions live join public.players p on p.option_file_id=live.pes_id where live.status='open' and p.id=new.player_id) then raise exception 'El jugador está reservado para una subasta.'; end if;
  if new.kind='auction' then
   select * into a from public.auctions where id=new.ref_id;
   if not found or a.status<>'awarded' or a.player_id is distinct from new.player_id or a.top_club_id is distinct from new.club_id or current_setting('uml.auction_finalizing',true) is distinct from a.id::text then
    raise exception 'La incorporación de subasta debe proceder de una adjudicación pagada.';
   end if;
  end if;
  if tg_op='INSERT' and new.kind in ('free_sign','raffle','auction') then
   select * into st from public.season_teams where season_id=new.season_id and club_id=new.club_id for update;
   if st.id is null or public.squad_count(new.club_id,new.season_id)+(case when public.auction_projected_owner(new.player_id,new.season_id)=new.club_id then 0 else 1 end)>coalesce((public.season_cfg(new.season_id)->>'squad_limit')::int,32) then raise exception 'No hay cupos disponibles para esa incorporación.'; end if;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists auction_guard_queue on public.transfer_queue;
create trigger auction_guard_queue before insert or update or delete on public.transfer_queue for each row execute function public.auction_guard_queue();

create or replace function public.auction_save(p_season uuid,p_pes_id bigint,p_initial numeric,p_increment numeric,p_starts timestamptz,p_ends timestamptz,p_id uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare s public.seasons; a public.auctions; e public.option_file_entries; pl public.players; v_id uuid;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 perform pg_advisory_xact_lock(13300013);
 select * into s from public.seasons where id=p_season for update;
 if not found or s.status<>'active' or s.historical then raise exception 'Las subastas se publican en una temporada activa.'; end if;
 if not public.auction_scheduler_ready() then raise exception 'Falta activar el cierre automático. Aplicá la consulta de configuración del planificador de subastas.'; end if;
 if p_initial is null or p_increment is null or p_initial::text in ('NaN','Infinity','-Infinity') or p_increment::text in ('NaN','Infinity','-Infinity') or p_initial<>trunc(p_initial) or p_increment<>trunc(p_increment) or p_initial not between 1 and 1000000000000 or p_increment not between 1 and 1000000000000 then raise exception 'Precio inicial e incremento deben ser enteros positivos.'; end if;
 if p_starts is null or p_ends is null or not isfinite(p_starts) or not isfinite(p_ends) or p_ends<=p_starts or p_ends<=clock_timestamp() then raise exception 'Revisá las fechas: el cierre debe estar en el futuro y después del inicio.'; end if;
 if p_id is not null then
  select * into a from public.auctions where id=p_id for update;
  if not found or a.season_id<>p_season or a.status<>'open' or a.ends_at<=clock_timestamp() then raise exception 'Subasta no editable.'; end if;
  if exists(select 1 from public.auction_bids where auction_id=a.id) then raise exception 'Las condiciones quedan bloqueadas después de la primera puja.'; end if;
  if a.pes_id<>p_pes_id then raise exception 'Para cambiar de jugador, cancelá esta subasta y creá otra.'; end if;
 else
  if exists(select 1 from public.auctions where pes_id=p_pes_id and status='open') then raise exception 'Ese jugador ya tiene una subasta activa.'; end if;
 end if;
 select e1.* into e from public.option_file_entries e1 join public.option_file_versions v on v.id=e1.version_id where v.status='active' and e1.pes_id=p_pes_id;
 if not found then raise exception 'El jugador no está en el Option File vigente.'; end if;
 select * into pl from public.players where option_file_id=p_pes_id and not archived for update;
 if found then
  if pl.club_id is not null or pl.retired or pl.loan_from_club_id is not null or pl.pending_club_id is not null or exists(select 1 from public.transfer_queue where player_id=pl.id and status='pending') or exists(select 1 from public.offers where status in ('pending','accepted') and (pl.id=any(players_ask) or pl.id=any(players_give))) then raise exception 'El jugador ya tiene equipo, una operación pendiente o no está disponible.'; end if;
 elsif exists(select 1 from public.players where not archived and public.of_normalize(name)=public.of_normalize(e.name) and option_file_id is null) then
  raise exception 'Existe un jugador manual con ese nombre. Vinculalo al Option File antes de subastarlo.';
 end if;
 if p_id is null then
  insert into public.auctions(season_id,pes_id,player_id,player_snapshot,initial_amount,min_increment,starts_at,ends_at,initial_ends_at,created_by)
  values(s.id,e.pes_id,pl.id,e.data,p_initial,p_increment,p_starts,p_ends,p_ends,auth.uid()) returning id into v_id;
 else
  update public.auctions set initial_amount=p_initial,min_increment=p_increment,starts_at=p_starts,ends_at=p_ends,initial_ends_at=p_ends,player_snapshot=e.data where id=p_id returning id into v_id;
 end if;
 insert into public.auction_events(auction_id,kind,details) values(v_id,case when p_id is null then 'created' else 'edited' end,jsonb_build_object('initial',p_initial,'increment',p_increment,'starts_at',p_starts,'ends_at',p_ends));
 return v_id;
end $$;

create or replace function public.auction_bid(p_auction uuid,p_club uuid,p_amount numeric) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.auctions; s public.seasons; st public.season_teams; v_now timestamptz; new_end timestamptz; minimum numeric;
begin
 if auth.uid() is null then raise exception 'Ingresá para pujar.'; end if;
 perform pg_advisory_xact_lock(13300013);
 select s1.* into s from public.seasons s1 join public.auctions a1 on a1.season_id=s1.id where a1.id=p_auction for update of s1;
 select * into a from public.auctions where id=p_auction for update;
 if not found or s.status<>'active' or s.historical then raise exception 'La subasta o temporada no está disponible.'; end if;
 if not public.manages_club(p_club,a.season_id) then raise exception 'Solo el DT asignado puede pujar por ese club.'; end if;
 if not public.auction_scheduler_ready() then raise exception 'El cierre automático necesita revisión. Las nuevas pujas están pausadas.'; end if;
 -- Bloquear ambas reservas en orden estable antes de comprobar el dinero/cupo.
 perform 1 from public.season_teams where season_id=a.season_id and club_id in (p_club,a.top_club_id) order by club_id for update;
 select * into st from public.season_teams where season_id=a.season_id and club_id=p_club;
 v_now:=clock_timestamp();
 if a.status<>'open' or v_now<a.starts_at or v_now>=a.ends_at then raise exception 'La subasta no admite pujas en este momento.'; end if;
 minimum:=case when a.top_club_id is null then a.initial_amount else a.top_amount+a.min_increment end;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>trunc(p_amount) or p_amount<minimum or p_amount>1000000000000 then raise exception 'La oferta mínima actual es %.',minimum; end if;
 if st.budget-st.reserved+(case when a.top_club_id=p_club then a.top_amount else 0 end)<p_amount then raise exception 'Saldo disponible insuficiente.'; end if;
 if public.squad_count(p_club,a.season_id)+(case when a.top_club_id=p_club then 0 else 1 end)>coalesce((public.season_cfg(a.season_id)->>'squad_limit')::int,32) then raise exception 'No hay cupos para otra incorporación: revisá plantel, acuerdos y subastas ganadoras.'; end if;
 new_end:=case when a.ends_at-v_now<=interval '5 minutes' then v_now+interval '5 minutes' else a.ends_at end;
 update public.auctions set top_club_id=p_club,top_amount=p_amount,ends_at=new_end where id=a.id;
 if a.top_club_id is not null then update public.season_teams set reserved=reserved-a.top_amount where season_id=a.season_id and club_id=a.top_club_id; end if;
 update public.season_teams set reserved=reserved+p_amount where id=st.id;
 insert into public.auction_bids(auction_id,club_id,manager_id,club_name,manager_name,amount,placed_at,previous_end,resulting_end)
 values(a.id,p_club,auth.uid(),(select name from public.clubs where id=p_club),coalesce((select username from public.profiles where id=auth.uid()),'DT'),p_amount,v_now,a.ends_at,new_end);
 if new_end>a.ends_at then insert into public.auction_events(auction_id,kind,details) values(a.id,'extended',jsonb_build_object('previous_end',a.ends_at,'ends_at',new_end,'club_id',p_club)); end if;
 return jsonb_build_object('amount',p_amount,'ends_at',new_end,'extended',new_end>a.ends_at);
end $$;

create or replace function public.auction_settle(p_auction uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare a public.auctions; s public.seasons; st public.season_teams; pl public.players; d jsonb; current_version uuid;
begin
 perform pg_advisory_xact_lock(13300013);
 select s1.* into s from public.seasons s1 join public.auctions a1 on a1.season_id=s1.id where a1.id=p_auction for update of s1;
 select * into a from public.auctions where id=p_auction for update;
 if not found or a.status<>'open' or clock_timestamp()<a.ends_at then return false; end if;
 if a.top_club_id is null then
  update public.auctions set status='no_bids',closed_at=clock_timestamp(),closing_error=null where id=a.id;
  insert into public.auction_events(auction_id,kind) values(a.id,'no_bids');return true;
 end if;
 if s.status<>'active' or s.historical then raise exception 'La temporada ya no está activa: revisar adjudicación.'; end if;
 select * into st from public.season_teams where season_id=a.season_id and club_id=a.top_club_id for update;
 if not found or st.reserved<a.top_amount then raise exception 'Falta la reserva del ganador: revisar adjudicación.'; end if;
 if public.squad_count(a.top_club_id,a.season_id)>coalesce((public.season_cfg(a.season_id)->>'squad_limit')::int,32) then raise exception 'El ganador no tiene el cupo reservado: revisar adjudicación.'; end if;
 select * into pl from public.players where option_file_id=a.pes_id and not archived for update;
 if found and (pl.club_id is not null or pl.retired or pl.pending_club_id is not null or pl.loan_from_club_id is not null or exists(select 1 from public.transfer_queue where player_id=pl.id and status='pending')) then raise exception 'El jugador dejó de estar disponible: revisar adjudicación.'; end if;
 if pl.id is null and exists(select 1 from public.players where not archived and option_file_id is null and public.of_normalize(name)=public.of_normalize(a.player_snapshot->>'name')) then raise exception 'Hay un jugador manual sin vincular: revisar antes de adjudicar.'; end if;
 select e.data,e.version_id into d,current_version from public.option_file_entries e join public.option_file_versions v on v.id=e.version_id where v.status='active' and e.pes_id=a.pes_id;
 if d is null then d:=a.player_snapshot;current_version:=null;end if;
 perform 1 from public.settings where key='bank' for update;
 if not found then raise exception 'Falta la cuenta UML Bank: revisar configuración.';end if;
 perform set_config('uml.auction_finalizing',a.id::text,true);
 -- Quitar el cupo de puja antes de transformarlo en jugador o incorporación;
 -- todas las escrituras, cobros y asientos se confirman en la misma transacción.
 update public.auctions set status='awarded',closed_at=clock_timestamp(),closing_error=null where id=a.id;
 if pl.id is null then
  insert into public.players(name,position,age,overall,value,club_id,pending_club_id,stats,pes2013_cards,option_file_id,option_file_data,option_file_version_id)
  values(d->>'name',d->>'position',(d->>'age')::int,(d->>'overall')::int,a.top_amount,case when s.market_open then a.top_club_id else null end,case when s.market_open then null else a.top_club_id end,public.of_stats(d->'abilities'),d->'cards',a.pes_id,d,current_version) returning * into pl;
 else
  update public.players set value=a.top_amount,number=null,transfer_listed=false,loan_listed=false,club_id=case when s.market_open then a.top_club_id else null end,pending_club_id=case when s.market_open then null else a.top_club_id end where id=pl.id returning * into pl;
 end if;
 update public.auctions set player_id=pl.id,player_snapshot=d where id=a.id;
 update public.season_teams set reserved=reserved-a.top_amount where id=st.id;
 perform public.money_move(a.season_id,a.top_club_id,-a.top_amount,'auction','Subasta · '||pl.name,a.id);
 perform public.money_move(a.season_id,null,a.top_amount,'auction','Subasta · '||pl.name||' · '||(select name from public.clubs where id=a.top_club_id),a.id);
 if not s.market_open then insert into public.transfer_queue(season_id,kind,ref_id,club_id,player_id) values(a.season_id,'auction',a.id,a.top_club_id,pl.id); end if;
 insert into public.auction_events(auction_id,kind,details) values(a.id,'awarded',jsonb_build_object('club_id',a.top_club_id,'amount',a.top_amount,'market_open',s.market_open,'player_id',pl.id));
 perform set_config('uml.auction_finalizing','',true);
 return true;
end $$;
create or replace function public.auction_close_due() returns int
language plpgsql security definer set search_path=public as $$
declare a record; n int:=0; message text;
begin
 perform pg_advisory_xact_lock(13300013);
 for a in select id from public.auctions where status='open' and ends_at<=clock_timestamp() order by ends_at,id loop
  begin
   if public.auction_settle(a.id) then n:=n+1;end if;
  exception when others then
   message:=sqlerrm;
   update public.auctions set closing_error=message where id=a.id and closing_error is distinct from message;
   if found then insert into public.auction_events(auction_id,kind,details) values(a.id,'close_error',jsonb_build_object('message','El cierre requiere revisión administrativa.'));end if;
  end;
 end loop;
 return n;
end $$;
create or replace function public.auction_cancel(p_auction uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare a public.auctions;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 if coalesce(length(btrim(p_reason)),0) not between 3 and 500 then raise exception 'Indicá el motivo de la cancelación (3 a 500 caracteres).'; end if;
 perform pg_advisory_xact_lock(13300013);
 select * into a from public.auctions where id=p_auction for update;
 if not found or a.status<>'open' then raise exception 'Solo se puede cancelar una subasta sin adjudicar.'; end if;
 update public.auctions set status='cancelled',closed_at=clock_timestamp(),cancel_reason=btrim(p_reason),closing_error=null where id=a.id;
 if a.top_club_id is not null then update public.season_teams set reserved=reserved-a.top_amount where season_id=a.season_id and club_id=a.top_club_id;end if;
 insert into public.auction_events(auction_id,kind,details) values(a.id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'actor',auth.uid()));
end $$;

-- Envolver, no reemplazar, las reglas existentes de mercado/cierre de temporada.
do $$ begin
 if to_regprocedure('public.set_market_before_auctions(uuid,boolean,text)') is null then alter function public.set_market(uuid,boolean,text) rename to set_market_before_auctions;end if;
 if to_regprocedure('public.close_season_before_auctions(uuid)') is null then alter function public.close_season(uuid) rename to close_season_before_auctions;end if;
end $$;
create or replace function public.set_market(p_season uuid,p_open boolean,p_label text default null) returns int
language plpgsql security definer set search_path=public as $$
declare n int;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 perform pg_advisory_xact_lock(13300013);
 if not exists(select 1 from public.seasons where id=p_season and status<>'closed' and not historical) then raise exception 'La temporada no admite cambios de mercado.';end if;
 perform public.auction_close_due();
 perform set_config('uml.auction_delivering','true',true);
 n:=public.set_market_before_auctions(p_season,p_open,p_label);
 perform set_config('uml.auction_delivering','',true);
 return n;
end $$;
create or replace function public.close_season(p_season uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 perform pg_advisory_xact_lock(13300013);
 perform public.auction_close_due();
 if exists(select 1 from public.auctions where season_id=p_season and status='open') then raise exception 'Primero resolvé o cancelá las subastas abiertas.';end if;
 if exists(select 1 from public.transfer_queue where season_id=p_season and kind='auction' and status='pending') then raise exception 'Abrí el mercado para entregar las subastas ya pagadas antes de cerrar la temporada.';end if;
 return public.close_season_before_auctions(p_season);
end $$;
create or replace function public.auction_guard_season_delete() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.auctions where season_id=old.id and status='open') or exists(select 1 from public.transfer_queue where season_id=old.id and kind='auction' and status='pending') then raise exception 'Primero cancelá las subastas abiertas y entregá las adjudicaciones ya pagadas.';end if;
 return old;
end $$;
drop trigger if exists auction_guard_season_delete on public.seasons;
create trigger auction_guard_season_delete before delete on public.seasons for each row execute function public.auction_guard_season_delete();

create or replace function public.auction_feed(p_season uuid,p_auction uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 -- Complementa el cron cuando alguien consulta; no reemplaza la tarea desatendida.
 perform public.auction_close_due();
 return jsonb_build_object('server_now',clock_timestamp(),'automatic_close_ready',public.auction_scheduler_ready(),
 'auctions',coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('bid_count',(select count(*) from public.auction_bids b where b.auction_id=a.id),'top_club',(select name from public.clubs where id=a.top_club_id),'delivered',a.player_id is not null and exists(select 1 from public.players p where p.id=a.player_id and p.club_id=a.top_club_id),'queue_pending',exists(select 1 from public.transfer_queue q where q.kind='auction' and q.ref_id=a.id and q.status='pending')) order by a.created_at desc) from public.auctions a where a.season_id=p_season and (p_auction is null or a.id=p_auction)),'[]'),
 'bids',case when p_auction is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(b) order by b.id desc) from public.auction_bids b where b.auction_id=p_auction),'[]') end,
 'events',case when p_auction is null then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from public.auction_events e where e.auction_id=p_auction),'[]') end,
 'teams',coalesce((select jsonb_agg(jsonb_build_object('club_id',t.club_id,'manager_id',t.manager_id,'budget',t.budget,'reserved',t.reserved,'count',public.squad_count(t.club_id,t.season_id),'limit',(public.season_cfg(t.season_id)->>'squad_limit')::int)) from public.season_teams t where t.season_id=p_season),'[]'));
end $$;
create or replace function public.auction_candidates(p_search text default '',p_team text default '',p_page int default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare current_id uuid;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.';end if;
 select id into current_id from public.option_file_versions where status='active';
 return jsonb_build_object('version_id',current_id,'players',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select e.pes_id,e.name,e.edit_team,e.position,e.overall,
 case when exists(select 1 from public.auctions where pes_id=e.pes_id and status='open') then 'Ya tiene subasta'
 when exists(select 1 from public.players p where p.option_file_id=e.pes_id and not p.archived and (p.club_id is not null or p.retired or p.pending_club_id is not null or p.loan_from_club_id is not null or exists(select 1 from public.transfer_queue q where q.player_id=p.id and q.status='pending') or exists(select 1 from public.offers o where o.status in ('pending','accepted') and (p.id=any(o.players_ask) or p.id=any(o.players_give))))) then 'Ya pertenece a UML o tiene una operación pendiente'
 when exists(select 1 from public.players p where not p.archived and p.option_file_id is null and public.of_normalize(p.name)=public.of_normalize(e.name)) then 'Vincular primero al jugador manual' else null end unavailable
 from public.option_file_entries e where e.version_id=current_id and (p_team='' or e.edit_team=p_team) and (p_search='' or position(public.of_normalize(p_search) in e.search_name)>0 or e.pes_id::text=p_search)
 order by e.name,e.pes_id limit 20 offset greatest(0,least(p_page,1500))*20) x),'[]'));
end $$;

-- Las tablas de subastas solo se escriben mediante estas funciones validadas.
revoke all on function public.auction_projected_owner(uuid,uuid),public.auction_scheduler_ready(),public.auction_guard_budget(),public.auction_guard_player(),public.auction_guard_queue(),public.auction_settle(uuid),public.auction_close_due(),public.auction_guard_season_delete(),public.set_market_before_auctions(uuid,boolean,text),public.close_season_before_auctions(uuid) from public,anon,authenticated;
revoke all on function public.auction_save(uuid,bigint,numeric,numeric,timestamptz,timestamptz,uuid),public.auction_bid(uuid,uuid,numeric),public.auction_cancel(uuid,text),public.auction_candidates(text,text,int),public.set_market(uuid,boolean,text),public.close_season(uuid) from public,anon;
grant execute on function public.auction_save(uuid,bigint,numeric,numeric,timestamptz,timestamptz,uuid),public.auction_bid(uuid,uuid,numeric),public.auction_cancel(uuid,text),public.auction_candidates(text,text,int),public.set_market(uuid,boolean,text),public.close_season(uuid) to authenticated;
revoke all on function public.auction_feed(uuid,uuid) from public;
grant execute on function public.auction_feed(uuid,uuid) to anon,authenticated;
commit;
