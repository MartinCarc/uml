-- Banco de hasta 12 suplentes. Ejecutar después de 20261107_tactics.sql. Conserva las pizarras existentes.
begin;
drop function if exists public.save_tactics(uuid, uuid, jsonb);

create or replace function public.save_tactics(p_season uuid, p_club uuid, p_lineup jsonb, p_bench jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare item jsonb; pid uuid; seen uuid[] := '{}'; season_status text; is_historical boolean;
begin
  if auth.uid() is null then raise exception 'Ingresá para guardar la pizarra.'; end if;
  -- Serializar con el cierre de temporada y proteger las referencias al plantel.
  select status, historical into season_status, is_historical from public.seasons where id = p_season for update;
  if not found or season_status = 'closed' or is_historical then raise exception 'La temporada no permite editar la pizarra.'; end if;
  perform 1 from public.season_teams where season_id = p_season and club_id = p_club for update;
  if not found then raise exception 'El club no participa en esta temporada.'; end if;
  if not (public.is_admin() or public.manages_club(p_club, p_season)) then raise exception 'Solo el DT del club o un administrador pueden guardar la pizarra.'; end if;
  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' then raise exception 'La alineación debe ser una lista.'; end if;
  if jsonb_array_length(p_lineup) > 11 then raise exception 'Solo podés colocar once jugadores.'; end if;
  for item in select value from jsonb_array_elements(p_lineup) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['player_id','position','x','y']) then raise exception 'Ficha incompleta.'; end if;
    pid := (item->>'player_id')::uuid;
    if pid is null or pid = any(seen) then raise exception 'No se puede repetir un jugador.'; end if;
    perform 1 from public.players where id = pid and club_id = p_club and not retired and not archived for share;
    if not found then raise exception 'Un jugador ya no está disponible en el plantel. Quitalo de la pizarra.'; end if;
    seen := array_append(seen, pid);
    if item->>'position' is null or item->>'position' not in ('ARQ','DFC','LD','LI','MCD','MC','MD','MI','MCO','DC','SD','ED','EI') then raise exception 'Posición no válida.'; end if;
    if jsonb_typeof(item->'x') <> 'number' or jsonb_typeof(item->'y') <> 'number'
       or (item->>'x')::numeric not between 9 and 91 or (item->>'y')::numeric not between 7 and 91 then raise exception 'La ficha debe estar dentro del campo.'; end if;
  end loop;
  -- Las versiones anteriores de la web conservan el banco ya publicado.
  if p_bench is null then
    select coalesce(tactics->'bench', '[]'::jsonb) into p_bench from public.season_teams where season_id = p_season and club_id = p_club;
  end if;
  if jsonb_typeof(p_bench) <> 'array' then raise exception 'El banco debe ser una lista.'; end if;
  if jsonb_array_length(p_bench) > 12 then raise exception 'Solo podés elegir doce suplentes.'; end if;
  for item in select value from jsonb_array_elements(p_bench) loop
    if jsonb_typeof(item) <> 'string' then raise exception 'Suplente no válido.'; end if;
    pid := (item #>> '{}')::uuid;
    if pid is null or pid = any(seen) then raise exception 'Un jugador no puede repetirse entre titulares y suplentes.'; end if;
    perform 1 from public.players where id = pid and club_id = p_club and not retired and not archived for share;
    if not found then raise exception 'Un suplente ya no está disponible en el plantel. Quitalo del banco.'; end if;
    seen := array_append(seen, pid);
  end loop;
  update public.season_teams set tactics = jsonb_build_object('lineup', p_lineup, 'bench', p_bench, 'updated_at', now())
    where season_id = p_season and club_id = p_club;
end $$;
revoke all on function public.save_tactics(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_tactics(uuid, uuid, jsonb, jsonb) to authenticated;
commit;
