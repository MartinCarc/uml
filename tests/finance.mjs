import { PGlite } from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);`);
await db.exec(readFileSync(new URL('supabase/schema_v2.sql',root),'utf8').replace('create extension if not exists pgcrypto;',''));
await db.exec(readFileSync(new URL('20261106_club_archive_and_new_game.sql',root),'utf8'));
await db.exec(`create or replace function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true)='true',true)$$;`);
const sid='10000000-0000-0000-0000-000000000001',cid='20000000-0000-0000-0000-000000000001',away='20000000-0000-0000-0000-000000000002',lid='30000000-0000-0000-0000-000000000001',mid='40000000-0000-0000-0000-000000000001';
await db.query("insert into seasons(id,name,status) values ($1,'Prueba','draft')",[sid]);
await db.query("insert into clubs(id,name,stadium_capacity) values($1,'Fulham',28107),($2,'Rival',20000)",[cid,away]);
await db.query('insert into season_teams(season_id,club_id,tier) values($1,$2,1),($1,$3,2)',[sid,cid,away]);
await db.query("insert into competitions(id,season_id,kind,name) values ($1,$2,'league','Liga')",[lid,sid]);
await db.query('insert into competition_teams(competition_id,club_id) values($1,$2),($1,$3)',[lid,cid,away]);
await db.query("insert into matches(id,competition_id,round,stage,home_club_id,away_club_id) values($1,$2,1,'league',$3,$4)",[mid,lid,cid,away]);
const result=()=>db.query('select set_result($1,1,0)',[mid]);
const budget=async(id=cid)=>(await db.query('select budget from season_teams where club_id=$1',[id])).rows[0].budget;
const total=async(id=cid)=>(await db.query('select coalesce(sum(amount),0) as n from transactions where season_id=$1 and club_id=$2',[sid,id])).rows[0].n;
const near=(a,b)=>assert.equal(Number(a),Number(b));
// Reproduce the real mismatch with the previous function.
await result();await result();near(await budget(),2810700);near(await total(),1405350);
const migration=readFileSync(new URL('supabase/migrations/20261107_ticket_income_fix.sql',root),'utf8');
await db.exec(migration);near(await budget(),1405350);
for(let i=0;i<3;i++){await result();near(await budget(),1405350);near(await budget(),await total());}
await db.exec(readFileSync(new URL('supabase/migrations/20261107_season_balance_continuity.sql',root),'utf8'));
// Start adds each division's budget and TV once and preserves existing tickets.
await db.query('select start_season($1)',[sid]);near(await budget(),261405350);near(await budget(away),190000000);
await assert.rejects(()=>db.query('select start_season($1)',[sid]),/ya fue iniciada/);
near(await budget(),261405350);
await db.query("select adjust_budget($1,$2,-500000,'Ajuste de prueba')",[sid,cid]);
await result();near(await budget(),260905350);near(await budget(),await total());
// Changed stadium capacity replaces income rather than accumulating it.
await db.query('update clubs set stadium_capacity=30000 where id=$1',[cid]);
await result();near(await budget(),261000000);near(await budget(),await total());
await db.exec(migration);near(await budget(),261000000);
// A final pays both clubs, and correcting it still keeps exactly one credit each.
await db.query("update matches set stage='final' where id=$1",[mid]);
await result();near(await budget(),261750000);near(await budget(away),191500000);
await result();near(await budget(),261750000);near(await budget(away),191500000);
// No unrelated/historical balances are touched by the repair.
await db.exec("update seasons set status='closed',historical=true");
await db.exec(migration);near(await budget(),261750000);
await db.exec("select set_config('test.admin','false',false)");
await assert.rejects(result,/permiso/);
console.log('PASS: reproduced double credit, migration repairs and re-runs safely, repeated result edits, changed ticket income, both final clubs, initial+TV by division, start-once, adjustments preserved, historical season excluded, unauthorized edits denied.');
await db.close();
