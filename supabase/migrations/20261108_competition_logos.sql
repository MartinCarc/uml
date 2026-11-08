-- Extender la carga de medios del administrador a los logos de competencias.
-- Requiere la migración 20261108_media_uploads.sql. No modifica datos existentes.
begin;
drop policy if exists uml_media_admin_upload on storage.objects;
create policy uml_media_admin_upload on storage.objects for insert to authenticated
with check(bucket_id='uml-media' and public.is_admin() and split_part(name,'/',1) in ('sponsors','stadiums','competitions'));
commit;
