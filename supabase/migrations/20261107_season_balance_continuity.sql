-- Continuidad económica: inicial solo en la primera temporada de la etapa;
-- saldo final conservado y TV por temporada. No modifica saldos ya acreditados.
begin;
create or replace function public.start_season(p_season uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; team record; season_row public.seasons; previous record;
  first_season boolean;
begin
  if not public.is_admin() then raise exception 'Solo administradores.'; end if;
  -- Evitar dos inicios simultáneos y coordinar con cambios de etapa/eliminaciones.
  lock table public.seasons in share row exclusive mode;
  select * into season_row from public.seasons where id = p_season for update;
  if not found then raise exception 'Temporada inexistente.'; end if;
  if season_row.historical or season_row.status <> 'draft' then
    raise exception 'La temporada ya fue iniciada o pertenece a una etapa archivada.';
  end if;
  if exists (select 1 from public.seasons where id <> p_season and not historical and status = 'active') then
    raise exception 'Primero cerrá la temporada en curso para conservar sus saldos finales.';
  end if;
  if not exists (select 1 from public.season_teams where season_id = p_season) then
    raise exception 'Agregá los equipos antes de iniciar la temporada.';
  end if;
  cfg := public.season_cfg(p_season);
  first_season := not exists (select 1 from public.seasons where not historical and status = 'closed');
  for team in select * from public.season_teams where season_id = p_season order by club_id for update loop
    if first_season then
      perform public.money_move(p_season, team.club_id,
        case when team.tier = 2 then (cfg->>'budget_tier2')::numeric else (cfg->>'budget_tier1')::numeric end,
        'initial', 'Presupuesto inicial · primera temporada');
    else
      -- Si el club se ausentó una temporada, conservar su último saldo de la etapa.
      select st.budget, s.id, s.name into previous
      from public.season_teams st join public.seasons s on s.id = st.season_id
      where st.club_id = team.club_id and not s.historical and s.status = 'closed'
      order by s.closed_at desc nulls last, s.created_at desc, s.id desc limit 1;
      if found then
        perform public.money_move(p_season, team.club_id, previous.budget, 'carryover',
          'Saldo de la temporada anterior · ' || previous.name, previous.id);
      end if;
    end if;
    perform public.money_move(p_season, team.club_id,
      case when team.tier = 2 then (cfg->>'tv_tier2')::numeric else (cfg->>'tv_tier1')::numeric end,
      'tv', 'Derechos de TV · ' || season_row.name);
  end loop;
  update public.seasons set status = 'active' where id = p_season;
  perform public.audit('start_season', 'seasons', p_season::text,
    jsonb_build_object('first_season', first_season));
end $$;
revoke all on function public.start_season(uuid) from public, anon;
grant execute on function public.start_season(uuid) to authenticated;
commit;
