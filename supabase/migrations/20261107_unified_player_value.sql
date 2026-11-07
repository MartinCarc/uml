-- Un único valor editable por el DT. Mantiene el parámetro p_price para
-- compatibilidad con la firma del RPC anterior; ahora escribe players.value.
begin;
-- Conservar el último importe elegido por el DT, si ya lo había fijado.
-- Los jugadores archivados y las copias históricas quedan intactos.
update public.players set value = price, price = null
where not archived and price is not null;

create or replace function public.update_my_player(p_player uuid, p_season uuid, p_price numeric, p_number int, p_transfer boolean, p_loan boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pl public.players%rowtype; season_row public.seasons;
begin
  select * into season_row from public.seasons where id = p_season for share;
  if not found or season_row.status = 'closed' or season_row.historical then
    raise exception 'La temporada no permite editar jugadores.';
  end if;
  select * into pl from public.players where id = p_player for update;
  if not found or pl.club_id is null or pl.archived or pl.retired then raise exception 'Jugador no disponible en el plantel.'; end if;
  if not coalesce(public.manages_club(pl.club_id, p_season) or public.is_admin(), false) then raise exception 'No dirigís ese equipo.'; end if;
  if not exists (select 1 from public.season_teams where season_id = p_season and club_id = pl.club_id) then raise exception 'El equipo no participa en esta temporada.'; end if;
  if p_price is null or p_price < 0 or p_price::text in ('NaN','Infinity','-Infinity') then raise exception 'El valor debe ser un número mayor o igual a cero.'; end if;
  if p_number is not null and (p_number < 1 or p_number > 99) then raise exception 'El dorsal debe estar entre 1 y 99.'; end if;
  if p_number is not null and exists (select 1 from public.players where club_id = pl.club_id and number = p_number and id <> p_player and not retired and not archived) then raise exception 'Ese dorsal ya está en uso.'; end if;
  update public.players set value = p_price, price = null, number = p_number,
    transfer_listed = coalesce(p_transfer, false), loan_listed = coalesce(p_loan, false) where id = p_player;
end $$;
revoke all on function public.update_my_player(uuid, uuid, numeric, int, boolean, boolean) from public, anon;
grant execute on function public.update_my_player(uuid, uuid, numeric, int, boolean, boolean) to authenticated;
commit;
