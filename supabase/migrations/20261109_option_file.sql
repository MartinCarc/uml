-- Option File PES 2013. Nueva migración: conserva todos los datos UML.
begin;
alter table public.players add column if not exists pes2013_cards jsonb;
create or replace function public.valid_pes2013_cards(cards jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare item jsonb; category text; pattern text;
begin
  if cards is null then return true; end if;
  if jsonb_typeof(cards) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(cards)) <> 2 then return false; end if;
  foreach category in array array['playing_styles','special_skills'] loop
    if jsonb_typeof(cards->category) is distinct from 'array' then return false; end if;
    pattern := case category when 'playing_styles' then '^P(0[1-9]|1[0-8])$' else '^S(0[1-9]|1[0-9]|2[0-6])$' end;
    for item in select value from jsonb_array_elements(cards->category) loop
      if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ pattern then return false; end if;
    end loop;
    if (select count(*) <> count(distinct value) from jsonb_array_elements(cards->category)) then return false; end if;
  end loop;
  return true;
end;
$$;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.players'::regclass and conname='players_pes2013_cards_valid') then
    alter table public.players add constraint players_pes2013_cards_valid check (public.valid_pes2013_cards(pes2013_cards));
  end if;
end;
$$;

create table if not exists public.option_file_versions (
 id uuid primary key default gen_random_uuid(), name text not null, filename text not null,
 source_hash text unique not null check(source_hash ~ '^[0-9a-f]{64}$'),
 expected_count int not null check(expected_count between 1 and 30000),
 status text not null default 'staging' check(status in ('staging','active','superseded')),
 base_id uuid references public.option_file_versions(id),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 activated_at timestamptz, summary jsonb
);
create unique index if not exists option_file_one_active on public.option_file_versions(status) where status='active';
create table if not exists public.option_file_entries (
 version_id uuid not null references public.option_file_versions(id), pes_id bigint not null,
 name text not null, search_name text not null, edit_team text not null,
 position text not null, age int not null, overall int not null, data jsonb not null,
 primary key(version_id,pes_id)
);
create index if not exists option_file_search on public.option_file_entries(version_id,search_name);
create index if not exists option_file_teams on public.option_file_entries(version_id,edit_team);
alter table public.players add column if not exists option_file_id bigint;
alter table public.players add column if not exists option_file_version_id uuid references public.option_file_versions(id);
alter table public.players add column if not exists option_file_data jsonb;
create unique index if not exists players_current_option_file_id on public.players(option_file_id) where not archived;
alter table public.option_file_versions enable row level security;
alter table public.option_file_entries enable row level security;
drop policy if exists option_file_versions_read on public.option_file_versions;
create policy option_file_versions_read on public.option_file_versions for select using(status<>'staging' or public.is_admin());
drop policy if exists option_file_entries_read on public.option_file_entries;
create policy option_file_entries_read on public.option_file_entries for select using(exists(select 1 from public.option_file_versions v where v.id=version_id and (v.status='active' or public.is_admin())));
grant select on public.option_file_versions,public.option_file_entries to anon,authenticated;
revoke insert,update,delete on public.option_file_versions,public.option_file_entries from anon,authenticated;

create or replace function public.of_normalize(value text) returns text language sql immutable as $$
 select translate(lower(coalesce(value,'')),'áéíóúüñàèìòùâêîôûäëïöÿç','aeiouunaeiouaeiouaeioyc')
$$;
create or replace function public.of_rating(abilities jsonb, p_position text) returns int
language plpgsql immutable set search_path=public as $fn$
declare formulas jsonb := $formulas${"GK":{"base":40.0,"terms":[{"ability":"BodyBalance","weight":0.218},{"ability":"Responsiveness","weight":0.356},{"ability":"ExplosivePower","weight":0.16},{"ability":"GoalKeepingSkill","weight":0.501}]},"SWP":{"base":25.0,"terms":[{"ability":"Defence","weight":0.45},{"ability":"BodyBalance","weight":0.45},{"ability":"Stamina","weight":0.3},{"ability":"TopSpeed","weight":0.2},{"ability":"HeaderAccuracy","weight":0.1},{"ability":"Jump","weight":0.3}]},"CB":{"base":25.0,"terms":[{"ability":"Defence","weight":0.48},{"ability":"BodyBalance","weight":0.44},{"ability":"Stamina","weight":0.3},{"ability":"Responsiveness","weight":0.16},{"ability":"TopSpeed","weight":0.1},{"ability":"Jump","weight":0.3}]},"SB":{"base":25.0,"terms":[{"ability":"Attack","weight":0.15},{"ability":"Defence","weight":0.2},{"ability":"BodyBalance","weight":0.15},{"ability":"TopSpeed","weight":0.22},{"ability":"Stamina","weight":0.22},{"ability":"DribbleAccuracy","weight":0.24},{"ability":"DribbleSpeed","weight":0.24},{"ability":"LongPassAccuracy","weight":0.2},{"ability":"LongPassSpeed","weight":0.15},{"ability":"ExplosivePower","weight":0.15},{"ability":"Responsiveness","weight":0.12}]},"LB":{"base":25.0,"terms":[{"ability":"Attack","weight":0.15},{"ability":"Defence","weight":0.2},{"ability":"BodyBalance","weight":0.15},{"ability":"TopSpeed","weight":0.22},{"ability":"Stamina","weight":0.22},{"ability":"DribbleAccuracy","weight":0.24},{"ability":"DribbleSpeed","weight":0.24},{"ability":"LongPassAccuracy","weight":0.2},{"ability":"LongPassSpeed","weight":0.15},{"ability":"ExplosivePower","weight":0.15},{"ability":"Responsiveness","weight":0.12}]},"RB":{"base":25.0,"terms":[{"ability":"Attack","weight":0.15},{"ability":"Defence","weight":0.2},{"ability":"BodyBalance","weight":0.15},{"ability":"TopSpeed","weight":0.22},{"ability":"Stamina","weight":0.22},{"ability":"DribbleAccuracy","weight":0.24},{"ability":"DribbleSpeed","weight":0.24},{"ability":"LongPassAccuracy","weight":0.2},{"ability":"LongPassSpeed","weight":0.15},{"ability":"ExplosivePower","weight":0.15},{"ability":"Responsiveness","weight":0.12}]},"WB":{"base":25.0,"terms":[{"ability":"Attack","weight":0.15},{"ability":"Defence","weight":0.2},{"ability":"BodyBalance","weight":0.15},{"ability":"TopSpeed","weight":0.22},{"ability":"Stamina","weight":0.22},{"ability":"DribbleAccuracy","weight":0.24},{"ability":"DribbleSpeed","weight":0.24},{"ability":"LongPassAccuracy","weight":0.2},{"ability":"LongPassSpeed","weight":0.15},{"ability":"ExplosivePower","weight":0.15},{"ability":"Responsiveness","weight":0.12}]},"DMF":{"base":18.0,"terms":[{"ability":"Attack","weight":0.1},{"ability":"Defence","weight":0.24},{"ability":"BodyBalance","weight":0.17},{"ability":"Stamina","weight":0.34},{"ability":"DribbleAccuracy","weight":0.15},{"ability":"DribbleSpeed","weight":0.15},{"ability":"ShortPassAccuracy","weight":0.2},{"ability":"ShortPassSpeed","weight":0.2},{"ability":"LongPassAccuracy","weight":0.24},{"ability":"LongPassSpeed","weight":0.24},{"ability":"Jump","weight":0.05},{"ability":"BallControl","weight":0.1}]},"CMF":{"base":16.0,"terms":[{"ability":"Attack","weight":0.1},{"ability":"Defence","weight":0.17},{"ability":"BodyBalance","weight":0.22},{"ability":"Stamina","weight":0.34},{"ability":"DribbleAccuracy","weight":0.27},{"ability":"DribbleSpeed","weight":0.24},{"ability":"ShortPassAccuracy","weight":0.22},{"ability":"ShortPassSpeed","weight":0.2},{"ability":"LongPassAccuracy","weight":0.22},{"ability":"LongPassSpeed","weight":0.15},{"ability":"BallControl","weight":0.12}]},"SMF":{"base":16.0,"terms":[{"ability":"Attack","weight":0.22},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.2},{"ability":"TopSpeed","weight":0.29},{"ability":"DribbleAccuracy","weight":0.2},{"ability":"DribbleSpeed","weight":0.22},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.12},{"ability":"LongPassAccuracy","weight":0.24},{"ability":"LongPassSpeed","weight":0.1},{"ability":"BallControl","weight":0.05},{"ability":"ExplosivePower","weight":0.24}]},"LMF":{"base":16.0,"terms":[{"ability":"Attack","weight":0.22},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.2},{"ability":"TopSpeed","weight":0.29},{"ability":"DribbleAccuracy","weight":0.2},{"ability":"DribbleSpeed","weight":0.22},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.12},{"ability":"LongPassAccuracy","weight":0.24},{"ability":"LongPassSpeed","weight":0.1},{"ability":"BallControl","weight":0.05},{"ability":"ExplosivePower","weight":0.24}]},"RMF":{"base":16.0,"terms":[{"ability":"Attack","weight":0.22},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.2},{"ability":"TopSpeed","weight":0.29},{"ability":"DribbleAccuracy","weight":0.2},{"ability":"DribbleSpeed","weight":0.22},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.12},{"ability":"LongPassAccuracy","weight":0.24},{"ability":"LongPassSpeed","weight":0.1},{"ability":"BallControl","weight":0.05},{"ability":"ExplosivePower","weight":0.24}]},"AMF":{"base":13.0,"terms":[{"ability":"Attack","weight":0.2},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.2},{"ability":"TopSpeed","weight":0.15},{"ability":"DribbleAccuracy","weight":0.24},{"ability":"DribbleSpeed","weight":0.15},{"ability":"ShortPassAccuracy","weight":0.24},{"ability":"ShortPassSpeed","weight":0.24},{"ability":"LongPassAccuracy","weight":0.1},{"ability":"LongPassSpeed","weight":0.1},{"ability":"BallControl","weight":0.27},{"ability":"KickingPower","weight":0.1}]},"WF":{"base":17.0,"terms":[{"ability":"Attack","weight":0.1},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.1},{"ability":"TopSpeed","weight":0.22},{"ability":"ExplosivePower","weight":0.22},{"ability":"DribbleAccuracy","weight":0.22},{"ability":"DribbleSpeed","weight":0.22},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.1},{"ability":"LongPassAccuracy","weight":0.15},{"ability":"LongPassSpeed","weight":0.1},{"ability":"KickingPower","weight":0.22},{"ability":"ShotAccuracy","weight":0.15}]},"LWF":{"base":17.0,"terms":[{"ability":"Attack","weight":0.1},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.1},{"ability":"TopSpeed","weight":0.22},{"ability":"ExplosivePower","weight":0.22},{"ability":"DribbleAccuracy","weight":0.22},{"ability":"DribbleSpeed","weight":0.22},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.1},{"ability":"LongPassAccuracy","weight":0.15},{"ability":"LongPassSpeed","weight":0.1},{"ability":"KickingPower","weight":0.22},{"ability":"ShotAccuracy","weight":0.15}]},"RWF":{"base":17.0,"terms":[{"ability":"Attack","weight":0.1},{"ability":"BodyBalance","weight":0.15},{"ability":"Stamina","weight":0.1},{"ability":"TopSpeed","weight":0.22},{"ability":"ExplosivePower","weight":0.22},{"ability":"DribbleAccuracy","weight":0.22},{"ability":"DribbleSpeed","weight":0.22},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.1},{"ability":"LongPassAccuracy","weight":0.15},{"ability":"LongPassSpeed","weight":0.1},{"ability":"KickingPower","weight":0.22},{"ability":"ShotAccuracy","weight":0.15}]},"SS":{"base":11.0,"terms":[{"ability":"Attack","weight":0.12},{"ability":"BodyBalance","weight":0.1},{"ability":"TopSpeed","weight":0.2},{"ability":"DribbleAccuracy","weight":0.22},{"ability":"DribbleSpeed","weight":0.15},{"ability":"ShortPassAccuracy","weight":0.17},{"ability":"ShortPassSpeed","weight":0.17},{"ability":"ShotAccuracy","weight":0.27},{"ability":"BallControl","weight":0.2},{"ability":"Responsiveness","weight":0.1},{"ability":"ExplosivePower","weight":0.24},{"ability":"KickingPower","weight":0.2}]},"CF":{"base":11.0,"terms":[{"ability":"Attack","weight":0.2},{"ability":"BodyBalance","weight":0.32},{"ability":"TopSpeed","weight":0.2},{"ability":"DribbleAccuracy","weight":0.17},{"ability":"DribbleSpeed","weight":0.1},{"ability":"ShotAccuracy","weight":0.22},{"ability":"KickingPower","weight":0.27},{"ability":"HeaderAccuracy","weight":0.15},{"ability":"Jump","weight":0.15},{"ability":"ShortPassAccuracy","weight":0.12},{"ability":"ShortPassSpeed","weight":0.12},{"ability":"BallControl","weight":0.12}]}}$formulas$::jsonb; f jsonb; term jsonb; result double precision;
begin
 f:=formulas->p_position;
 if f is null then raise exception 'Posición del EDIT desconocida: %',p_position; end if;
 result:=(f->>'base')::double precision;
 for term in select value from jsonb_array_elements(f->'terms') loop
  result:=result+((abilities->>(term->>'ability'))::double precision-50)*(term->>'weight')::double precision;
 end loop;
 -- round(float8), como .NET Math.Round a cero decimales: empates al par.
 return round(result)::int;
end;
$fn$;
create or replace function public.of_stats(abilities jsonb) returns jsonb
language sql immutable as $fn$
 select jsonb_object_agg(label,abilities->key) from (values
 ('Attack','Ataque'),('Defence','Defensa'),('BodyBalance','Equilibrio'),('Stamina','Resistencia'),('TopSpeed','Velocidad máxima'),('Responsiveness','Respuesta'),('ExplosivePower','Explosividad'),('DribbleAccuracy','Precisión regate'),('DribbleSpeed','Velocidad regate'),('ShortPassAccuracy','Precisión pase corto'),('ShortPassSpeed','Velocidad pase corto'),('LongPassAccuracy','Precisión pase largo'),('LongPassSpeed','Velocidad pase largo'),('ShotAccuracy','Precisión disparo'),('KickingPower','Potencia de disparo'),('PlaceKicking','Balón parado'),('Swerve','Efecto'),('HeaderAccuracy','Cabeceo'),('Jump','Salto'),('BallControl','Control de balón'),('Tenacity','Tenacidad'),('GoalKeepingSkill','Portería'),('Teamwork','Trabajo en equipo')) fields(key,label)
$fn$;
create or replace function public.of_validate(d jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare key text; limits int[]; a jsonb; pos text; mapped text;
begin
 if jsonb_typeof(d) is distinct from 'object' then raise exception 'Registro inválido.'; end if;
 if coalesce(length(btrim(d->>'name')),0) not between 1 and 200 or coalesce(length(d->>'edit_team'),0)>200 then raise exception 'Nombre/equipo inválido.'; end if;
 foreach key in array array['pes_id','age','height','weight','form','weak_accuracy','weak_frequency','attack_awareness','defence_awareness'] loop
  limits:=case key when 'pes_id' then array[1,2147483647] when 'age' then array[15,65] when 'height' then array[100,250] when 'weight' then array[30,200] when 'form' then array[1,8] when 'weak_accuracy' then array[1,8] when 'weak_frequency' then array[1,8] else array[1,3] end;
  if jsonb_typeof(d->key) is distinct from 'number' or (d->>key)::numeric<>trunc((d->>key)::numeric) or (d->>key)::numeric not between limits[1] and limits[2] then raise exception 'Campo % inválido.',key; end if;
 end loop;
 if coalesce(d->>'foot','') not in ('R','L') or coalesce(d->>'injury','') not in ('A','B','C') then raise exception 'Pie o tolerancia inválidos.'; end if;
 pos:=d->>'source_position';
 mapped:=case pos when 'GK' then 'ARQ' when 'SWP' then 'DFC' when 'CB' then 'DFC' when 'LB' then 'LI' when 'RB' then 'LD' when 'DMF' then 'MCD' when 'CMF' then 'MC' when 'LMF' then 'MI' when 'RMF' then 'MD' when 'AMF' then 'MCO' when 'LWF' then 'EI' when 'RWF' then 'ED' when 'SS' then 'SD' when 'CF' then 'DC' end;
 if mapped is null then raise exception 'Posición inválida.'; end if;
 if jsonb_typeof(d->'positions') is distinct from 'array' then raise exception 'Posiciones alternativas inválidas.'; end if;
 if exists(select 1 from jsonb_array_elements_text(d->'positions') p where p not in ('ARQ','DFC','LI','LD','MCD','MC','MI','MD','MCO','EI','ED','SD','DC')) then raise exception 'Posición alternativa desconocida.'; end if;
 if not public.valid_pes2013_cards(d->'cards') or d->'cards' is null then raise exception 'Tarjetas inválidas.'; end if;
 a:=d->'abilities';
 if jsonb_typeof(a) is distinct from 'object' then raise exception 'Faltan habilidades.'; end if;
 if exists(select 1 from jsonb_each(public.of_stats(a)) x where jsonb_typeof(x.value)<>'number' or x.value='null'::jsonb) then raise exception 'Faltan habilidades numéricas.'; end if;
 for key in select jsonb_object_keys(a) loop
  if jsonb_typeof(a->key) is distinct from 'number' or (a->>key)::numeric<>trunc((a->>key)::numeric) or (a->>key)::numeric not between 0 and 99 then raise exception 'Habilidad % inválida.',key; end if;
 end loop;
 if public.of_rating(a,pos) not between 0 and 199 then raise exception 'Media fuera de rango.'; end if;
 if jsonb_typeof(d->'nationality') is distinct from 'string' or length(d->>'nationality')>100 then raise exception 'Nacionalidad inválida.'; end if;
 if d->'number' is not null and d->'number'<>'null'::jsonb and (jsonb_typeof(d->'number')<>'number' or (d->>'number')::numeric<>trunc((d->>'number')::numeric) or (d->>'number')::int not between 0 and 99) then raise exception 'Dorsal inválido.'; end if;
 -- No se guardan campos técnicos descartados ni una media enviada por el cliente.
 return jsonb_build_object('pes_id',(d->>'pes_id')::bigint,'name',btrim(d->>'name'),'edit_team',coalesce(d->>'edit_team',''),'age',(d->>'age')::int,'height',(d->>'height')::int,'weight',(d->>'weight')::int,'nationality',d->>'nationality','foot',d->>'foot','source_position',pos,'position',mapped,'positions',d->'positions','form',(d->>'form')::int,'weak_accuracy',(d->>'weak_accuracy')::int,'weak_frequency',(d->>'weak_frequency')::int,'injury',d->>'injury','attack_awareness',(d->>'attack_awareness')::int,'defence_awareness',(d->>'defence_awareness')::int,'number',d->'number','abilities',a,'cards',d->'cards','overall',public.of_rating(a,pos));
end $$;

create or replace function public.of_begin(p_name text,p_filename text,p_hash text,p_count int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v public.option_file_versions; current_id uuid;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 if length(btrim(p_name)) not between 1 and 100 or length(p_filename)>200 then raise exception 'Nombre de versión inválido.'; end if;
 perform pg_advisory_xact_lock(13300013);
 select id into current_id from public.option_file_versions where status='active';
 select * into v from public.option_file_versions where source_hash=p_hash;
 if found then
  if v.status='staging' and v.created_by is distinct from auth.uid() then raise exception 'Otro administrador está preparando este archivo.'; end if;
  if v.status='staging' then
   delete from public.option_file_entries where version_id=v.id;
   update public.option_file_versions set base_id=current_id,expected_count=p_count,name=btrim(p_name),filename=p_filename where id=v.id returning * into v;
  end if;
  return to_jsonb(v);
 end if;
 insert into public.option_file_versions(name,filename,source_hash,expected_count,base_id,created_by) values(btrim(p_name),p_filename,p_hash,p_count,current_id,auth.uid()) returning * into v;
 return to_jsonb(v);
end $$;
create or replace function public.of_stage_batch(p_version uuid,p_players jsonb) returns int
language plpgsql security definer set search_path=public as $$
declare v public.option_file_versions; item jsonb; d jsonb; n int:=0;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 select * into v from public.option_file_versions where id=p_version for update;
 if not found or v.status<>'staging' or v.created_by is distinct from auth.uid() then raise exception 'Versión no disponible para cargar.'; end if;
 if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players) not between 1 and 500 then raise exception 'Lote inválido.'; end if;
 for item in select value from jsonb_array_elements(p_players) loop
  d:=public.of_validate(item);
  insert into public.option_file_entries(version_id,pes_id,name,search_name,edit_team,position,age,overall,data)
  values(v.id,(d->>'pes_id')::bigint,d->>'name',public.of_normalize(d->>'name'),d->>'edit_team',d->>'position',(d->>'age')::int,(d->>'overall')::int,d)
  on conflict(version_id,pes_id) do update set name=excluded.name,search_name=excluded.search_name,edit_team=excluded.edit_team,position=excluded.position,age=excluded.age,overall=excluded.overall,data=excluded.data;
  n:=n+1;
 end loop;
 return n;
end $$;
create or replace function public.of_preview(p_version uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v public.option_file_versions; old_id uuid; differences jsonb; missing jsonb;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 select * into v from public.option_file_versions where id=p_version;
 if not found then raise exception 'Versión inexistente.'; end if;
 select id into old_id from public.option_file_versions where status='active';
 select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'pes_id',p.option_file_id,'name',p.name,'uml_team',c.name,'edit_team',e.edit_team,'pending',exists(select 1 from public.transfer_queue q left join public.offers o on q.kind='offer' and o.id=q.ref_id where q.status='pending' and (q.player_id=p.id or p.id=any(o.players_ask) or p.id=any(o.players_give))))),'[]') into differences
 from public.players p left join public.clubs c on c.id=p.club_id join public.option_file_entries e on e.version_id=v.id and e.pes_id=p.option_file_id
 where not p.archived and not p.retired and public.of_normalize(coalesce(c.name,''))<>public.of_normalize(e.edit_team);
 select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'pes_id',p.option_file_id,'name',p.name)),'[]') into missing from public.players p where not p.archived and not p.retired and p.option_file_id is not null and not exists(select 1 from public.option_file_entries e where e.version_id=v.id and e.pes_id=p.option_file_id);
 return jsonb_build_object('version',to_jsonb(v),'loaded',(select count(*) from public.option_file_entries where version_id=v.id),'new',(select count(*) from public.option_file_entries e where e.version_id=v.id and not exists(select 1 from public.option_file_entries old where old.version_id=old_id and old.pes_id=e.pes_id)), 'changed',(select count(*) from public.option_file_entries e join public.option_file_entries old on old.version_id=old_id and old.pes_id=e.pes_id where e.version_id=v.id and e.data<>old.data),'removed',(select count(*) from public.option_file_entries old where old.version_id=old_id and not exists(select 1 from public.option_file_entries e where e.version_id=v.id and e.pes_id=old.pes_id)),'linked',(select count(*) from public.players p join public.option_file_entries e on e.version_id=v.id and e.pes_id=p.option_file_id where not p.archived and not p.retired),'team_differences',differences,'missing_links',missing);
end $$;
create or replace function public.of_activate(p_version uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v public.option_file_versions; current_id uuid; report_json jsonb; s record;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 perform pg_advisory_xact_lock(13300013);
 select * into v from public.option_file_versions where id=p_version for update;
 if not found then raise exception 'Versión inexistente.'; end if;
 if v.status='active' then return v.summary; end if;
 if v.status<>'staging' or v.created_by is distinct from auth.uid() then raise exception 'Versión no disponible para publicar.'; end if;
 select id into current_id from public.option_file_versions where status='active';
 if current_id is distinct from v.base_id then raise exception 'El catálogo cambió durante la carga. Volvé a preparar el archivo sobre la versión vigente.'; end if;
 if (select count(*) from public.option_file_entries where version_id=v.id)<>v.expected_count then raise exception 'Carga incompleta: no se publicó ni sincronizó nada.'; end if;
 lock table public.players in share row exclusive mode;
 for s in select id from public.seasons where status='closed' and not historical loop perform public.capture_season_snapshot(s.id); end loop;
 report_json:=public.of_preview(v.id);
 update public.players p set name=e.name,age=e.age,position=e.position,overall=e.overall,stats=public.of_stats(e.data->'abilities'),pes2013_cards=e.data->'cards',option_file_data=e.data,option_file_version_id=v.id
 from public.option_file_entries e where e.version_id=v.id and e.pes_id=p.option_file_id and not p.archived and not p.retired;
 update public.option_file_versions set status='superseded' where status='active';
 update public.option_file_versions set status='active',activated_at=now(),summary=report_json where id=v.id;
 return report_json;
end $$;
create or replace function public.of_facets() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('teams',coalesce(jsonb_agg(team order by team),'[]')) from (select distinct e.edit_team team from public.option_file_entries e join public.option_file_versions v on v.id=e.version_id where v.status='active') t
$$;
create or replace function public.of_uml_links(p_ids bigint[]) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'pes_id',p.option_file_id,'club_id',p.club_id,'club',c.name,'retired',p.retired,'season_id',(select st.season_id from public.season_teams st join public.seasons s on s.id=st.season_id where not s.historical and s.status<>'closed' and (p.club_id is null or st.club_id=p.club_id) order by s.created_at desc limit 1))),'[]') from public.players p left join public.clubs c on c.id=p.club_id where not p.archived and p.option_file_id=any(p_ids)
$$;
create or replace function public.of_link_player(p_player uuid,p_pes_id bigint) returns void
language plpgsql security definer set search_path=public as $$
declare e public.option_file_entries; p public.players; s record;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 perform pg_advisory_xact_lock(13300013);
 select * into p from public.players where id=p_player for update;
 if not found or p.archived or p.retired then raise exception 'Jugador no disponible.'; end if;
 if p.option_file_id is not null and p.option_file_id<>p_pes_id then raise exception 'El jugador ya tiene otro ID. Revisá la vinculación.'; end if;
 select e1.* into e from public.option_file_entries e1 join public.option_file_versions v on v.id=e1.version_id where v.status='active' and e1.pes_id=p_pes_id;
 if not found then raise exception 'ID no encontrado en el Option File vigente.'; end if;
 for s in select id from public.seasons where status='closed' and not historical loop perform public.capture_season_snapshot(s.id); end loop;
 update public.players set option_file_id=p_pes_id,name=e.name,age=e.age,position=e.position,overall=e.overall,stats=public.of_stats(e.data->'abilities'),pes2013_cards=e.data->'cards',option_file_data=e.data,option_file_version_id=e.version_id where id=p_player;
end $$;
create or replace function public.of_import_squad(p_season uuid,p_club uuid,p_players jsonb,p_version uuid) returns int
language plpgsql security definer set search_path=public as $$
declare s public.seasons; e public.option_file_entries; item jsonb; n int:=0; lim int; current_id uuid;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo administradores.'; end if;
 perform pg_advisory_xact_lock(13300013);
 select * into s from public.seasons where id=p_season for update;
 if not found or s.status<>'draft' or s.historical then raise exception 'Los planteles iniciales se importan en una temporada en preparación.'; end if;
 if not exists(select 1 from public.season_teams where season_id=p_season and club_id=p_club) or not exists(select 1 from public.clubs where id=p_club and not archived) then raise exception 'El club no participa en esta temporada.'; end if;
 if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players) not between 1 and 32 then raise exception 'Seleccioná entre 1 y 32 jugadores.'; end if;
 lock table public.players in share row exclusive mode;
 lim:=coalesce((public.season_cfg(p_season)->>'squad_limit')::int,32);
 if (select count(*) from public.players where club_id=p_club and not archived and not retired)+jsonb_array_length(p_players)>lim then raise exception 'Se supera el límite de % jugadores del plantel.',lim; end if;
 select id into current_id from public.option_file_versions where status='active';
 if current_id is distinct from p_version then raise exception 'El Option File cambió. Volvé a revisar la selección.'; end if;
 for item in select value from jsonb_array_elements(p_players) loop
  select * into e from public.option_file_entries where version_id=current_id and pes_id=(item->>'pes_id')::bigint;
  if not found then raise exception 'Jugador no encontrado en el Option File vigente.'; end if;
  if exists(select 1 from public.players where option_file_id=e.pes_id and not archived) then raise exception '% ya existe en UML. Usá su ficha existente para evitar duplicados.',e.name; end if;
  if exists(select 1 from public.players where not archived and option_file_id is null and public.of_normalize(name)=public.of_normalize(e.name)) then raise exception '% ya tiene un jugador manual sin vincular. Vinculalo desde su ficha de Option File antes de continuar.',e.name; end if;
  if jsonb_typeof(item->'value') is distinct from 'number' or (item->>'value')::numeric<0 or (item->>'value')::numeric>1000000000000 then raise exception 'Valor económico inválido.'; end if;
  if item->'number' is not null and item->'number'<>'null'::jsonb and (jsonb_typeof(item->'number')<>'number' or (item->>'number')::numeric<>trunc((item->>'number')::numeric) or (item->>'number')::int not between 1 and 99) then raise exception 'Dorsal inválido.'; end if;
  insert into public.players(name,club_id,position,age,overall,value,number,stats,pes2013_cards,option_file_id,option_file_version_id,option_file_data)
  values(e.name,p_club,e.position,e.age,e.overall,(item->>'value')::numeric,(item->>'number')::int,public.of_stats(e.data->'abilities'),e.data->'cards',e.pes_id,e.version_id,e.data);
  n:=n+1;
 end loop;
 return n;
end $$;

-- Vinculaciones verificadas del Fulham de prueba; no se crean jugadores ni se cambia su equipo.
update public.players p set option_file_id=x.pes_id from jsonb_to_recordset($links$[{"id": "adb8d19c-5091-443b-9622-af81ec416813", "name": "Alex Iwobi", "pes_id": 42575}, {"id": "484d1f2a-773d-4955-9a6e-a3ef4462c1e3", "name": "Antonee Robinson", "pes_id": 53589}, {"id": "c8bf0914-e8ad-44f1-a63e-06149748a7ff", "name": "Benjamin Lecomte", "pes_id": 42821}, {"id": "51ac5ab7-c004-4420-a102-ccdc400c6fb9", "name": "Bernd Leno", "pes_id": 54360}, {"id": "bb50ed5d-d73a-4e93-ae49-0e7a8183fc5c", "name": "Calvin Bassey", "pes_id": 47329}, {"id": "d37d574a-b245-48f7-ad6b-2208632712ef", "name": "Chukwueze", "pes_id": 46828}, {"id": "7d6f2826-4172-4d6e-9de5-fa0ab856185b", "name": "Gonzalo García", "pes_id": 55470}, {"id": "6cc55a95-d037-47f4-9de0-8c6e175ef3b9", "name": "Harrison Reed", "pes_id": 4252}, {"id": "41e9f012-ae21-4b26-af6d-9525d58a88ed", "name": "Harry Wilson", "pes_id": 118082}, {"id": "e280cb15-b913-4ad5-b7dc-9c1860ed47cc", "name": "Issa Diop", "pes_id": 1913}, {"id": "9f966c3a-a403-46fe-a303-424ee3c8cbad", "name": "Joachim Andersen", "pes_id": 53425}, {"id": "f5cdf144-5359-428b-9a57-ec78feab6d17", "name": "Jonah Kusi-Asare", "pes_id": 55849}, {"id": "8c1081b9-42f0-4018-a865-70a338a85e00", "name": "Jorge Cuenca", "pes_id": 6259}, {"id": "6aa17263-d4de-4503-b2be-5fa2b0d0021d", "name": "Josh King", "pes_id": 117561}, {"id": "0b43c437-9f39-4caa-8461-6c34c6b2a3b1", "name": "Kenny Tete", "pes_id": 37995}, {"id": "e06465e9-31e7-4939-b537-57b19cca3e69", "name": "Kevin", "pes_id": 46094}, {"id": "28e74ecc-14ce-4364-8d8c-192abf6a7436", "name": "Oscar Bobb", "pes_id": 115937}, {"id": "b80d1916-c384-4f62-b1ea-c1ae0e6d892b", "name": "Raul Jiménez", "pes_id": 46919}, {"id": "1e3387fd-c7ec-4609-8614-dc099ac7e8e3", "name": "Rodrigo Muniz", "pes_id": 8479}, {"id": "89270ece-40c4-4928-9cd0-5a0ce34cd382", "name": "Ryan Sessegnon", "pes_id": 35496}, {"id": "7c066528-25fd-42c4-9f03-d29dcdd51640", "name": "Sander Berge", "pes_id": 6080}, {"id": "526d55ca-22eb-4051-87e0-c1fbc54ef557", "name": "Sasa Lukic", "pes_id": 103437}, {"id": "85dc2c9a-01e5-496e-a64e-9e6a2117d716", "name": "Smith Rowe", "pes_id": 38297}, {"id": "968f9b69-8b27-4b78-9a8e-007ac237f902", "name": "Timothy Castagne", "pes_id": 118212}, {"id": "5f92172b-98c8-4647-a6f4-4843e1258d57", "name": "Tom Cairney", "pes_id": 54296}]$links$::jsonb) as x(id uuid,name text,pes_id bigint) where p.id=x.id and p.name=x.name and p.club_id='1e653b01-52b5-44f6-be9d-5047e6d8af30'::uuid and not p.archived and p.option_file_id is null and not exists(select 1 from public.players other where not other.archived and other.option_file_id=x.pes_id and other.id<>p.id);
revoke all on function public.of_begin(text,text,text,int) from public,anon;
grant execute on function public.of_begin(text,text,text,int) to authenticated;
revoke all on function public.of_stage_batch(uuid,jsonb) from public,anon;
grant execute on function public.of_stage_batch(uuid,jsonb) to authenticated;
revoke all on function public.of_preview(uuid) from public,anon;
grant execute on function public.of_preview(uuid) to authenticated;
revoke all on function public.of_activate(uuid) from public,anon;
grant execute on function public.of_activate(uuid) to authenticated;
revoke all on function public.of_link_player(uuid,bigint) from public,anon;
grant execute on function public.of_link_player(uuid,bigint) to authenticated;
revoke all on function public.of_import_squad(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.of_import_squad(uuid,uuid,jsonb,uuid) to authenticated;
grant execute on function public.of_facets() to anon,authenticated;
grant execute on function public.of_uml_links(bigint[]) to anon,authenticated;
commit;
