-- Entradas en estadio neutral: aforo configurado, ocupación completa, reparto 50/50.
-- Mantiene la corrección de ingresos al editar resultados. No cambia movimientos previos.
begin;
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
  -- Retirar la acreditación anterior antes de reemplazar el asiento.
  -- La fila del partido ya está bloqueada: dos correcciones no se pisan.
  update public.season_teams st set budget = st.budget - previous.amount
  from (
    select season_id, club_id, sum(amount) as amount from public.transactions
    where ref_id = p_match and kind = 'tickets' and club_id is not null
    group by season_id, club_id
  ) previous
  where st.season_id = previous.season_id and st.club_id = previous.club_id;
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
  for cid in select unnest(case when m.neutral or stage_mult = 'final' then array[m.home_club_id, m.away_club_id] else array[m.home_club_id] end) loop
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
    if m.neutral then
      if coalesce((comp.format->>'neutral_capacity')::int,0)<=0 then raise exception 'Falta la capacidad del estadio neutral.';end if;
      income:=round((comp.format->>'neutral_capacity')::numeric*(cfg->>'ticket_price')::numeric*mult)/2;
      perform public.money_move(comp.season_id,cid,income,'tickets',
        format('Entradas · %s vs %s · estadio neutral %s espectadores × %s × %s · 50 %%',home_name,away_name,comp.format->>'neutral_capacity',cfg->>'ticket_price',mult),p_match);
    else
    select round(stadium_capacity * (cfg->>'ticket_price')::numeric * occ * mult) into income from public.clubs where id = cid;
    perform public.money_move(comp.season_id, cid, income, 'tickets',
      format('Entradas · %s vs %s · %s × %s × %s%% × %s', home_name, away_name, (select stadium_capacity from public.clubs where id = cid), cfg->>'ticket_price', round(occ*100), mult), p_match);
    end if;
  end loop;

  perform public.audit('set_result', 'matches', p_match::text, jsonb_build_object('home', p_home, 'away', p_away, 'events', p_events));
end $$;
commit;
