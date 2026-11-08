import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
export const root=new URL('../',import.meta.url);
export const sql=p=>readFileSync(new URL(p,root),'utf8');
export const migrations=['20261107_tactics.sql','20261107_tactics_bench.sql','20261107_ticket_income_fix.sql','20261107_season_balance_continuity.sql','20261107_unified_player_value.sql','20261108_cup_groups.sql','20261108_sponsors_and_stadium.sql','20261108_neutral_gate.sql','20261108_media_uploads.sql','20261108_competition_logos.sql'];
export async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 await db.exec(sql('supabase/schema_v2.sql').replace('create extension if not exists pgcrypto;',''));
 await db.exec(sql('20261106_club_archive_and_new_game.sql'));
 for(const m of migrations)await db.exec(sql('supabase/migrations/'+m));
 await db.exec(`create or replace function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true)='true',false)$$;select set_config('test.admin','true',false);`);
 return db;
}
export async function seed(db){
 const sid=(await db.query("insert into seasons(name,mode) values('Prueba','two') returning id")).rows[0].id;
 const clubs=[];
 for(let i=0;i<16;i++)clubs.push((await db.query('insert into clubs(name,stadium_capacity) values($1,20000) returning id',['Club '+String(i+1).padStart(2,'0')])).rows[0].id);
 for(let i=0;i<16;i++)await db.query('insert into season_teams(season_id,club_id,tier) values($1,$2,$3)',[sid,clubs[i],i<8?1:2]);
 const comps=[];
 for(let i=0;i<3;i++){
  const c=(await db.query("insert into competitions(season_id,kind,tier,name,promote_direct,relegate_direct,promotion_slots,format,sort_order) values($1,$2,$3,$4,$5,$6,0,$7,$3) returning id",[sid,i===2?'cup':'league',i===1?2:1,['Premier','Championship','Cup'][i],i===1?2:0,i===0?2:0,JSON.stringify(i===2?{groups:true,legs:1,neutral_knockout:true,neutral_capacity:40000,penalties:true}:{rounds:'double'})])).rows[0].id;
  comps.push(c);
  for(const club of i===2?clubs:clubs.slice(i*8,i*8+8))await db.query('insert into competition_teams(competition_id,club_id) values($1,$2)',[c,club]);
 }
 return {sid,clubs,league:comps[0],championship:comps[1],cup:comps[2]};
}
