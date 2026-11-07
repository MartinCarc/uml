import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), db = new PGlite();
const sql = (path) => readFileSync(new URL(path,root),'utf8');
await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);`);
await db.exec(sql('supabase/schema_v2.sql').replace('create extension if not exists pgcrypto;',''));
await db.exec(sql('20261106_club_archive_and_new_game.sql'));
await db.exec(`create or replace function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true)='true',true)$$;`);
const migration=sql('supabase/migrations/20261107_season_balance_continuity.sql');
await db.exec(migration);await db.exec(migration);
const [a,b,c,d] = (await db.query("insert into clubs(name) values('A'),('B'),('C'),('D') returning id")).rows.map(r=>r.id);
async function create(name, teams){
 const sid=(await db.query("insert into seasons(name,status) values($1,'draft') returning id",[name])).rows[0].id;
 for(const [cid,tier] of teams)await db.query('insert into season_teams(season_id,club_id,tier) values($1,$2,$3)',[sid,cid,tier]);
 return sid;
}
const start=sid=>db.query('select start_season($1)',[sid]);
const close=sid=>db.query("update seasons set status='closed',closed_at=now() where id=$1",[sid]);
const balance=async(sid,cid)=>Number((await db.query('select budget from season_teams where season_id=$1 and club_id=$2',[sid,cid])).rows[0].budget);
const ledger=async(sid,cid)=>(await db.query('select kind,amount from transactions where season_id=$1 and club_id=$2 order by created_at',[sid,cid])).rows;
const adjust=(sid,cid,n)=>db.query("select adjust_budget($1,$2,$3,'Prueba')",[sid,cid,n]);
const s1=await create('Temporada 1',[[a,1],[b,2],[d,1]]);
await start(s1);assert.equal(await balance(s1,a),260000000);assert.equal(await balance(s1,b),190000000);
await assert.rejects(()=>start(s1),/ya fue iniciada/);
await adjust(s1,a,-230000000); // Ends with 30 M.
await adjust(s1,b,-195000000); // Ends owing 5 M.
await adjust(s1,d,-260000000); // Zero is also carried, without another initial budget.
const s2=await create('Temporada 2',[[a,2],[b,1],[c,1],[d,2]]);
await assert.rejects(()=>start(s2),/cerrá/);
await close(s1);
await adjust(s2,a,2000000); // Already-recorded preparation movements are retained.
await start(s2);
assert.equal(await balance(s2,a),72000000); // 30 M + 2 M adjustment + 40 M TV after relegation.
assert.equal(await balance(s2,b),55000000); // -5 M + 60 M TV after promotion.
assert.equal(await balance(s2,c),60000000); // New in season 2: no initial budget.
assert.equal(await balance(s2,d),40000000);
assert.equal(await balance(s1,a),30000000); // Historical ledger/balance unchanged.
assert.equal((await ledger(s2,a)).filter(t=>t.kind==='initial').length,0);
assert.equal((await ledger(s2,a)).filter(t=>t.kind==='carryover').length,1);
assert.equal((await ledger(s2,a)).filter(t=>t.kind==='tv').length,1);
await assert.rejects(()=>start(s2),/ya fue iniciada/);
assert.equal(await balance(s2,a),72000000);
await db.exec(migration);assert.equal(await balance(s2,a),72000000); // Re-applying never pays again.
await close(s2);
const s3=await create('Temporada 3',[[b,1],[c,2]]);await start(s3);await close(s3);
const s4=await create('Temporada 4',[[a,1],[b,1]]);await start(s4);
assert.equal(await balance(s4,a),132000000); // Returning club retains its last participation's balance.
await close(s4);
// A deliberate new stage restarts at season 1 without carrying old-stage money.
await db.query("select start_new_game('NUEVA ETAPA')");
await db.query("select manage_club($1,'restore')",[a]);
await db.query("select manage_club($1,'restore')",[b]);
const fresh=await create('Nueva etapa - temporada 1',[[a,1],[b,2]]);
await db.exec("select set_config('test.admin','false',false)");
await assert.rejects(()=>start(fresh),/administradores/);
await db.exec("select set_config('test.admin','true',false)");
await start(fresh);assert.equal(await balance(fresh,a),260000000);assert.equal(await balance(fresh,b),190000000);
assert.equal((await ledger(fresh,a)).filter(t=>t.kind==='carryover').length,0);
console.log('PASS: first-season-only initial, TV every season/current division, positive/zero/negative carryover, late and returning clubs, existing adjustments, immutable prior balances, duplicate-start/active-season/permission guards, migration rerun, new-stage reset.');
await db.close();
