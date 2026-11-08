-- Imágenes públicas de sponsors y estadios; solo administradores pueden subirlas.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('uml-media','uml-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists uml_media_read on storage.objects;
create policy uml_media_read on storage.objects for select using(bucket_id='uml-media');
drop policy if exists uml_media_admin_upload on storage.objects;
create policy uml_media_admin_upload on storage.objects for insert to authenticated
with check(bucket_id='uml-media' and public.is_admin() and split_part(name,'/',1) in ('sponsors','stadiums'));
commit;
