-- Formación interactiva; aplicar después de 20261108_formation_instructions.sql.
begin;
create or replace function public.save_tactics_v2(p_season uuid, p_club uuid, p_lineup jsonb, p_bench jsonb default null, p_roles jsonb default null, p_instructions text default null, p_favorite jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item jsonb; pid uuid; seen uuid[] := '{}'; season_status text; is_historical boolean; role_key text; starter_ids uuid[] := '{}'; legacy_roles boolean := p_roles is null;
  previous jsonb; old_roles jsonb; candidate jsonb; comparable jsonb; favorite_key text;
begin
  if auth.uid() is null then raise exception 'Ingresá para guardar la formación.'; end if;
  -- Serializar con el cierre de temporada y proteger las referencias al plantel.
  select status, historical into season_status, is_historical from public.seasons where id = p_season for update;
  if not found or season_status = 'closed' or is_historical then raise exception 'La temporada no permite editar la formación.'; end if;
  select coalesce(tactics,'{}'::jsonb) into previous from public.season_teams where season_id = p_season and club_id = p_club for update;
  if not found then raise exception 'El club no participa en esta temporada.'; end if;
  if not (public.is_admin() or public.manages_club(p_club, p_season)) then raise exception 'Solo el DT del club o un administrador pueden guardar la formación.'; end if;
  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' then raise exception 'La alineación debe ser una lista.'; end if;
  if jsonb_array_length(p_lineup) > 11 then raise exception 'Solo podés colocar once jugadores.'; end if;
  for item in select value from jsonb_array_elements(p_lineup) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['player_id','position','x','y']) then raise exception 'Ficha incompleta.'; end if;
    if item ? 'short_name' and (jsonb_typeof(item->'short_name') is distinct from 'string' or char_length(item->>'short_name')>32) then raise exception 'La etiqueta del jugador admite hasta 32 caracteres.';end if;
    pid := (item->>'player_id')::uuid;
    if pid is null or pid = any(seen) then raise exception 'No se puede repetir un jugador.'; end if;
    perform 1 from public.players where id = pid and club_id = p_club and not retired and not archived for share;
    if not found then raise exception 'Un jugador ya no está disponible en el plantel. Quitalo de la formación.'; end if;
    seen := array_append(seen, pid);
    starter_ids := array_append(starter_ids, pid);
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
  old_roles := coalesce(previous->'roles','{}'::jsonb);
  if old_roles ? 'free_kicks' and not old_roles ? 'free_kicks_short' then
    old_roles := old_roles || jsonb_build_object('free_kicks_short',old_roles->'free_kicks');
  end if;
  old_roles := jsonb_strip_nulls(old_roles-'free_kicks');

  if p_roles is null then p_roles:=old_roles;end if;
  if jsonb_typeof(p_roles)<>'object' then raise exception 'Los responsables deben ser una lista de funciones.';end if;
  if p_roles ? 'free_kicks' then
    if not p_roles ? 'free_kicks_short' then p_roles:=p_roles||jsonb_build_object('free_kicks_short',p_roles->'free_kicks');end if;
    p_roles:=p_roles-'free_kicks';
  end if;
  -- Los clientes anteriores no pueden editar un rol que no conocen.
  if p_favorite is null and old_roles ? 'free_kicks_long' and not p_roles ? 'free_kicks_long'
     and (old_roles->>'free_kicks_long')::uuid=any(starter_ids) then
    p_roles:=p_roles||jsonb_build_object('free_kicks_long',old_roles->'free_kicks_long');
  end if;
  for role_key,item in select key,value from jsonb_each(p_roles) loop
    if role_key not in ('captain','penalties','free_kicks_short','free_kicks_long','corners_left','corners_right') then raise exception 'Función de responsable no válida.';end if;
    if item='null'::jsonb then continue;end if;
    if jsonb_typeof(item)<>'string' then raise exception 'Elegí un titular como responsable.';end if;
    pid:=(item #>> '{}')::uuid;
    if not (pid=any(starter_ids)) then
      if legacy_roles then p_roles:=p_roles-role_key;
      else raise exception 'El capitán y los ejecutantes deben estar entre los titulares. Podés dejar la función sin asignar.';end if;
    end if;
  end loop;
  p_roles:=jsonb_strip_nulls(p_roles);
  if p_instructions is null then
    select coalesce(tactics->>'instructions','') into p_instructions from public.season_teams where season_id=p_season and club_id=p_club;
  end if;
  if char_length(p_instructions)>4000 then raise exception 'Las indicaciones pueden tener hasta 4000 caracteres.';end if;
  if p_favorite is null then
    p_favorite:=coalesce(previous->'favorite','{}'::jsonb);
  else
    if jsonb_typeof(p_favorite) is distinct from 'object' or exists(
      select 1 from jsonb_object_keys(p_favorite) as f(key) where key not in ('scheme','type','points')
    ) then raise exception 'Táctica favorita inválida.';end if;
    if p_favorite ? 'scheme' and coalesce(p_favorite->>'scheme','') not in ('4-4-2','4-3-3','4-3-1-2','4-2-3-1','4-2-1-3','4-3-2-1','4-1-2-3','3-2-3-2','3-1-4-2','3-2-2-3','5-2-2-1') then
      raise exception 'Formación inválida.';
    end if;
    if p_favorite ? 'type' and coalesce(p_favorite->>'type','') not in ('Normal','Posesión','Contraataques rápidos','Balones largos a la contra','Todos a atacar','Defensa total') then raise exception 'Tipo de táctica inválido.';end if;
    if p_favorite ? 'points' then
      if jsonb_typeof(p_favorite->'points') is distinct from 'object' then raise exception 'Ajustes tácticos inválidos.';end if;
      for favorite_key,item in select key,value from jsonb_each(p_favorite->'points') loop
        if favorite_key not in ('passSupport','supportArea','positionSwitch','attackStyle','pressing','defensiveLine','compactness')
          or jsonb_typeof(item) is distinct from 'number' then raise exception 'Ajuste táctico inválido.';end if;
        if (item #>> '{}')::numeric not between 0 and 20 or trunc((item #>> '{}')::numeric)<>(item #>> '{}')::numeric then
          raise exception 'Cada ajuste debe ser un número entero de 0 a 20.';
        end if;
      end loop;
      if p_favorite->'points'='{}'::jsonb then p_favorite:=p_favorite-'points';end if;
    end if;
  end if;

  candidate:=jsonb_build_object('lineup',p_lineup,'bench',p_bench,'roles',p_roles,'instructions',p_instructions,'favorite',p_favorite);
  comparable:=jsonb_build_object('lineup',coalesce(previous->'lineup','[]'),'bench',coalesce(previous->'bench','[]'),
    'roles',old_roles,'instructions',coalesce(previous->>'instructions',''),'favorite',coalesce(previous->'favorite','{}'));
  if candidate=comparable then return jsonb_build_object('changed',false,'tactics',previous);end if;

  -- Guardar con el reloj del servidor solo cuando cambia el contenido.
  if p_roles ? 'free_kicks_short' then
    candidate:=jsonb_set(candidate,'{roles,free_kicks}',p_roles->'free_kicks_short',true);
  end if;
  candidate:=previous || candidate || jsonb_build_object('updated_at',clock_timestamp());
  update public.season_teams set tactics=candidate where season_id=p_season and club_id=p_club;
  return jsonb_build_object('changed',true,'tactics',candidate);
end $$;

create or replace function public.save_tactics(p_season uuid,p_club uuid,p_lineup jsonb,p_bench jsonb default null,p_roles jsonb default null,p_instructions text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.save_tactics_v2(p_season,p_club,p_lineup,p_bench,p_roles,p_instructions,null);
end $$;

revoke all on function public.save_tactics_v2(uuid,uuid,jsonb,jsonb,jsonb,text,jsonb) from public,anon;
grant execute on function public.save_tactics_v2(uuid,uuid,jsonb,jsonb,jsonb,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
