-- Sponsors y fotos de estadios. Aplicar después de las migraciones anteriores.
-- No acredita sponsors retroactivamente ni modifica contratos de temporadas iniciadas.
begin;
alter table public.clubs add column if not exists stadium_photo_url text;
create table if not exists public.sponsors (
 id uuid primary key default gen_random_uuid(), code text unique not null check(code in ('A','B','C','D')),
 name text not null default '', image_url text,
 payment_tier1 numeric check(payment_tier1>=0), payment_tier2 numeric check(payment_tier2>=0),
 enabled boolean not null default false
);
insert into public.sponsors(code) values('A'),('B'),('C'),('D') on conflict(code) do nothing;
alter table public.sponsors enable row level security;
drop policy if exists sponsors_read on public.sponsors;
create policy sponsors_read on public.sponsors for select using(true);
drop policy if exists sponsors_admin on public.sponsors;
create policy sponsors_admin on public.sponsors for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.sponsors to anon,authenticated;
grant update on public.sponsors to authenticated;
drop trigger if exists audit_sponsors on public.sponsors;
create trigger audit_sponsors after update on public.sponsors for each row execute function public.audit_row_change();

create table if not exists public.team_sponsor_contracts (
 id uuid primary key default gen_random_uuid(), season_id uuid not null, club_id uuid not null,
 sponsor_id uuid not null references public.sponsors(id), code text not null, tier int not null,
 name text not null,image_url text, amount numeric not null check(amount>=0), rules jsonb not null,
 paid_at timestamptz,settled_at timestamptz,bonus numeric not null default 0,fine numeric not null default 0,assessment jsonb,
 unique(season_id,club_id),
 foreign key(season_id,club_id) references public.season_teams(season_id,club_id) on delete cascade
);
alter table public.team_sponsor_contracts enable row level security;
drop policy if exists sponsor_contracts_read on public.team_sponsor_contracts;
create policy sponsor_contracts_read on public.team_sponsor_contracts for select using(true);
grant select on public.team_sponsor_contracts to anon,authenticated;

create or replace function public.sponsor_rules(p_code text,p_tier int) returns jsonb
language plpgsql immutable set search_path=public as $$
declare r jsonb;
begin
 if p_code='A' then r:=jsonb_build_object('main','goals','target',case when p_tier=1 then 15 else 12 end,'cup','group_wins','cup_target',case when p_tier=1 then 2 else 1 end,'bonus',15,'fine',10);
 elsif p_code='B' then r:=jsonb_build_object('main','position','target',5,'cup','qf','bonus',20,'fine',20,'promotion_fine',30,'relegation_fine',40,'bottom_fine',30);
 elsif p_code='C' then r:=jsonb_build_object('main',case when p_tier=1 then 'position' else 'promotion_or_up' end,'target',4,'cup',case when p_tier=1 then 'sf' else 'qf' end,'bonus',30,'fine',35,'promotion_fine',45,'relegation_fine',55,'bottom_fine',45);
 elsif p_code='D' then r:=jsonb_build_object('main',case when p_tier=1 then 'champion' else 'promoted' end,'cup',case when p_tier=1 then 'champion' else 'final' end,'bonus',40,'fine',50,'promotion_fine',60,'relegation_fine',70,'bottom_fine',60);
 else raise exception 'Sponsor no válido.'; end if;
 return r||jsonb_build_object('tier',p_tier);
end $$;

create or replace function public.choose_sponsor(p_season uuid,p_club uuid,p_code text) returns void
language plpgsql security definer set search_path=public as $$
declare ss public.seasons; team public.season_teams; sp public.sponsors; amount numeric;
begin
 select * into ss from public.seasons where id=p_season for update;
 if not found or ss.status<>'draft' or ss.historical then raise exception 'El sponsor se elige antes de iniciar la temporada.'; end if;
 select * into team from public.season_teams where season_id=p_season and club_id=p_club for update;
 if not found then raise exception 'El equipo no participa.'; end if;
 if not coalesce(public.is_admin() or public.manages_club(p_club,p_season),false) then raise exception 'Solo el DT del equipo o un administrador pueden elegir.'; end if;
 if exists(select 1 from public.team_sponsor_contracts where season_id=p_season and club_id=p_club and paid_at is not null) then raise exception 'El contrato ya fue pagado y no puede cambiarse.';end if;
 if p_code is null then
  delete from public.team_sponsor_contracts where season_id=p_season and club_id=p_club;
  update public.season_teams set sponsor_id=null where id=team.id;return;
 end if;
 select * into sp from public.sponsors where code=p_code for share;
 amount:=case when team.tier=1 then sp.payment_tier1 else sp.payment_tier2 end;
 if not found or not sp.enabled or trim(sp.name)='' or amount is null then raise exception 'El administrador todavía no habilitó este sponsor para tu división.'; end if;
 insert into public.team_sponsor_contracts(season_id,club_id,sponsor_id,code,tier,name,image_url,amount,rules)
 values(p_season,p_club,sp.id,sp.code,team.tier,sp.name,sp.image_url,amount,public.sponsor_rules(sp.code,team.tier))
 on conflict(season_id,club_id) do update set sponsor_id=excluded.sponsor_id,code=excluded.code,tier=excluded.tier,name=excluded.name,image_url=excluded.image_url,amount=excluded.amount,rules=excluded.rules;
 update public.season_teams set sponsor_id=sp.id where id=team.id;
 perform public.audit('choose_sponsor','season_teams',team.id::text,jsonb_build_object('code',p_code));
end $$;

create or replace function public.sponsor_assessment(p_season uuid,p_club uuid,p_rules jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
 lg public.competitions; cup public.competitions; promo public.competitions; team public.season_teams;
 row_stats record; n int; main_ok boolean; cup_ok boolean; group_wins int:=0;
 pos int; goals int:=0; direct_up boolean:=false; promotion_zone boolean:=false; relegated boolean:=false; promoted boolean:=false;
 fine_pct int:=0; main_cancelled boolean:=false; cup_cancelled boolean:=false;
begin
 select * into team from public.season_teams where season_id=p_season and club_id=p_club;
 team.tier:=coalesce((p_rules->>'tier')::int,team.tier);
 select c.* into lg from public.competitions c join public.competition_teams ct on ct.competition_id=c.id and ct.club_id=p_club where c.season_id=p_season and c.kind='league' limit 1;
 select * into cup from public.competitions where season_id=p_season and kind='cup' order by sort_order,id limit 1;
 select * into promo from public.competitions where season_id=p_season and kind='promotion' order by sort_order,id limit 1;
 main_cancelled:=lg.id is null or coalesce((lg.format->>'cancelled')::boolean,false);
 cup_cancelled:=cup.id is null or coalesce((cup.format->>'cancelled')::boolean,false);
 select * into row_stats from public.standings(lg.id) where club_id=p_club;
 pos:=row_stats.pos;goals:=coalesce(row_stats.gf,0);
 select count(*) into n from public.competition_teams where competition_id=lg.id;
 if team.tier=1 then
  promotion_zone:=pos>n-lg.relegate_direct-lg.promotion_slots and pos<=n-lg.relegate_direct;
  relegated:=pos>n-lg.relegate_direct or (promotion_zone and promo.status='finished' and not coalesce((promo.format->'winners') ? p_club::text,false));
 else
  direct_up:=pos<=lg.promote_direct;
  promotion_zone:=pos>lg.promote_direct and pos<=lg.promote_direct+lg.promotion_slots;
  promoted:=direct_up or (promotion_zone and promo.status='finished' and coalesce((promo.format->'winners') ? p_club::text,false));
 end if;
 if not main_cancelled and lg.status='finished' then
  main_ok:=case p_rules->>'main'
   when 'goals' then goals>=(p_rules->>'target')::int
   when 'position' then pos<=(p_rules->>'target')::int
   when 'champion' then coalesce(lg.champion_club_id=p_club,false)
   when 'promotion_or_up' then direct_up or promotion_zone
   when 'promoted' then promoted else false end;
  if p_rules->>'main'='promoted' and promotion_zone and coalesce((promo.format->>'cancelled')::boolean,false) then main_ok:=null;main_cancelled:=true;end if;
 end if;
 if not cup_cancelled then
  select count(*) into group_wins from public.matches where competition_id=cup.id and stage='group' and status='played'
   and ((home_club_id=p_club and home_goals>away_goals) or (away_club_id=p_club and away_goals>home_goals));
  if cup.status='finished' then
   cup_ok:=case p_rules->>'cup'
    when 'group_wins' then group_wins>=(p_rules->>'cup_target')::int
    when 'champion' then coalesce(cup.champion_club_id=p_club,false)
    else exists(select 1 from public.matches where competition_id=cup.id and stage=p_rules->>'cup' and p_club in(home_club_id,away_club_id)) end;
  end if;
 end if;
 if main_ok=false then
  fine_pct:=(p_rules->>'fine')::int;
  if team.tier=1 then
   if promotion_zone then fine_pct:=greatest(fine_pct,coalesce((p_rules->>'promotion_fine')::int,0));end if;
   if relegated then fine_pct:=greatest(fine_pct,coalesce((p_rules->>'relegation_fine')::int,0));end if;
  elsif pos>n-3 then fine_pct:=greatest(fine_pct,coalesce((p_rules->>'bottom_fine')::int,0));end if;
 end if;
 return jsonb_build_object('primary_met',main_ok,'cup_met',cup_ok,'league_goals',goals,'league_position',pos,'group_wins',group_wins,
  'promotion_zone',promotion_zone,'relegated',relegated,'promoted',promoted,'fine_percent',fine_pct,
  'bonus_percent',case when main_ok and cup_ok then (p_rules->>'bonus')::int else 0 end,
  'primary_cancelled',main_cancelled,'cup_cancelled',cup_cancelled);
end $$;

create or replace function public.sponsor_season_payments() returns trigger
language plpgsql security definer set search_path=public as $$
declare ct public.team_sponsor_contracts;sp public.sponsors;team public.season_teams; report jsonb;v_bonus numeric;v_fine numeric;
begin
 if old.status='draft' and new.status='active' then
  for ct in select * from public.team_sponsor_contracts where season_id=new.id for update loop
   select * into team from public.season_teams where season_id=new.id and club_id=ct.club_id;
   select * into sp from public.sponsors where id=ct.sponsor_id for share;
   ct.amount:=case when team.tier=1 then sp.payment_tier1 else sp.payment_tier2 end;
   if not sp.enabled or trim(sp.name)='' or ct.amount is null then raise exception 'Revisá el sponsor de un equipo antes de iniciar: fue deshabilitado o le falta el pago.';end if;
   if ct.paid_at is not null then raise exception 'El sponsor ya fue pagado.';end if;
   update public.team_sponsor_contracts set tier=team.tier,name=sp.name,image_url=sp.image_url,amount=ct.amount,rules=public.sponsor_rules(sp.code,team.tier),paid_at=now() where id=ct.id;
   perform public.money_move(new.id,ct.club_id,ct.amount,'sponsor','Sponsor · '||sp.name,ct.id);
  end loop;
 elsif old.status='active' and new.status='closed' and exists(select 1 from public.team_sponsor_contracts where season_id=new.id) then
  if exists(select 1 from public.competitions where season_id=new.id and kind in('league','cup','promotion') and status<>'finished' and not coalesce((format->>'cancelled')::boolean,false)) then
   raise exception 'Finalizá las ligas, la copa y las promociones antes de liquidar sponsors.';
  end if;
  if exists(select 1 from public.matches m join public.competitions c on c.id=m.competition_id
    where c.season_id=new.id and c.kind in('league','cup','promotion') and m.status<>'played' and not coalesce((c.format->>'cancelled')::boolean,false)) then
    raise exception 'Hay partidos pendientes antes de liquidar los sponsors.';
  end if;
  if exists(select 1 from public.competitions where season_id=new.id and kind='league' and promotion_slots>0 and not coalesce((format->>'cancelled')::boolean,false))
   and not exists(select 1 from public.competitions where season_id=new.id and kind='promotion' and status='finished') then
   raise exception 'Creá y resolvé la promoción antes de cerrar la temporada.';
  end if;
  for ct in select * from public.team_sponsor_contracts where season_id=new.id and settled_at is null and paid_at is not null for update loop
   report:=public.sponsor_assessment(new.id,ct.club_id,ct.rules);
   v_bonus:=round(ct.amount*(report->>'bonus_percent')::numeric/100,2);
   v_fine:=round(ct.amount*(report->>'fine_percent')::numeric/100,2);
   if v_bonus>0 then perform public.money_move(new.id,ct.club_id,v_bonus,'sponsor_bonus','Bonus de sponsor · '||ct.name,ct.id);end if;
   if v_fine>0 then perform public.money_move(new.id,ct.club_id,-v_fine,'sponsor_fine','Incumplimiento de sponsor · '||ct.name,ct.id);end if;
   update public.team_sponsor_contracts set assessment=report,bonus=v_bonus,fine=v_fine,settled_at=now() where id=ct.id;
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists sponsor_season_payments on public.seasons;
create trigger sponsor_season_payments before update of status on public.seasons for each row execute function public.sponsor_season_payments();

create or replace function public.cancel_competition(p_competition uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.competitions;
begin
 if not public.is_admin() then raise exception 'Solo administradores.';end if;
 select * into c from public.competitions where id=p_competition for update;
 if not found or exists(select 1 from public.seasons where id=c.season_id and (status='closed' or historical)) then raise exception 'La temporada está cerrada.';end if;
 update public.competitions set status='finished',champion_club_id=null,runnerup_club_id=null,format=format||'{"cancelled":true}'::jsonb where id=c.id;
 perform public.audit('cancel_competition','competitions',c.id::text,null);
end $$;

-- Cerrar la temporada también fija sus resultados para que no cambien premios ya liquidados.
create or replace function public.protect_sponsor_results() returns trigger
language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 if tg_table_name='matches' then
  if tg_op<>'DELETE' and exists(select 1 from public.competitions where id=new.competition_id and coalesce((format->>'cancelled')::boolean,false)) then raise exception 'La competencia fue anulada y sus partidos se conservan solo para consulta.';end if;
  select season_id into sid from public.competitions where id=case when tg_op='DELETE' then old.competition_id else new.competition_id end;
 else sid:=case when tg_op='DELETE' then old.season_id else new.season_id end;end if;
 perform 1 from public.seasons where id=sid for share;
 if exists(select 1 from public.seasons where id=sid and status='closed') and exists(select 1 from public.team_sponsor_contracts where season_id=sid and settled_at is not null) then raise exception 'La temporada está cerrada y sus sponsors ya fueron liquidados.';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
drop trigger if exists protect_sponsor_results on public.matches;
create trigger protect_sponsor_results before insert or update or delete on public.matches for each row execute function public.protect_sponsor_results();
drop trigger if exists protect_sponsor_results on public.competitions;
create trigger protect_sponsor_results before insert or update or delete on public.competitions for each row execute function public.protect_sponsor_results();
create or replace function public.protect_sponsor_tier() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.tier is distinct from old.tier and exists(select 1 from public.team_sponsor_contracts where season_id=old.season_id and club_id=old.club_id and paid_at is not null) then
  raise exception 'La división del contrato queda fija al iniciar la temporada.';
 end if;return new;
end $$;
drop trigger if exists protect_sponsor_tier on public.season_teams;
create trigger protect_sponsor_tier before update of tier on public.season_teams for each row execute function public.protect_sponsor_tier();
revoke all on function public.choose_sponsor(uuid,uuid,text),public.cancel_competition(uuid) from public,anon;
grant execute on function public.choose_sponsor(uuid,uuid,text),public.cancel_competition(uuid) to authenticated;
grant execute on function public.sponsor_rules(text,int),public.sponsor_assessment(uuid,uuid,jsonb) to anon,authenticated;
commit;
