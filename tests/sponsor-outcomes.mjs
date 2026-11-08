import assert from 'node:assert/strict';
import {database,seed} from './sponsors-support.mjs';
const db=await database(),{sid,clubs,league,championship,cup}=await seed(db);
// Deterministic single-round standings: 1st to 8th in each division.
for(const [l,list] of [[league,clubs.slice(0,8)],[championship,clubs.slice(8)]]){
 for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)await db.query("insert into matches(competition_id,round,stage,home_club_id,away_club_id,home_goals,away_goals,status) values($1,1,'league',$2,$3,2,0,'played')",[l,list[i],list[j]]);
 await db.query("update competitions set status='finished',champion_club_id=$2,promotion_slots=1 where id=$1",[l,list[0]]);
}
const promo=(await db.query("insert into competitions(season_id,kind,name,status,format) values($1,'promotion','Promoción','finished',$2) returning id",[sid,JSON.stringify({winners:[clubs[10]]})])).rows[0].id;
const assess=async(i,code)=>(await db.query('select sponsor_assessment($1,$2,sponsor_rules($3,$4)) r',[sid,clubs[i],code,i<8?1:2])).rows[0].r;
// Premier 6th loses the promotion; Championship 3rd wins it.
assert.equal((await assess(5,'B')).fine_percent,40);
assert.equal((await assess(5,'C')).fine_percent,55);
assert.equal((await assess(5,'D')).fine_percent,70);
assert.equal((await assess(10,'C')).primary_met,true);
assert.equal((await assess(10,'D')).primary_met,true);
await db.query('update competitions set format=$2 where id=$1',[promo,JSON.stringify({winners:[clubs[5]]})]);
assert.equal((await assess(5,'B')).fine_percent,30);
assert.equal((await assess(5,'C')).fine_percent,45);
assert.equal((await assess(5,'D')).fine_percent,60);
assert.equal((await assess(10,'C')).primary_met,true); // Reaching promotion is enough.
assert.equal((await assess(10,'D')).primary_met,false);assert.equal((await assess(10,'D')).fine_percent,50);
// Exact goal thresholds, both divisions, independent of Cup goals.
for(const [i,target] of [[0,15],[8,12]]){
 const l=i===0?league:championship;
 await db.query("update matches set home_goals=0,away_goals=0 where competition_id=$1 and $2 in(home_club_id,away_club_id)",[l,clubs[i]]);
 const match=(await db.query('select id,home_club_id from matches where competition_id=$1 and $2 in(home_club_id,away_club_id) limit 1',[l,clubs[i]])).rows[0];
 const col=match.home_club_id===clubs[i]?'home_goals':'away_goals';
 await db.query(`update matches set ${col}=$2 where id=$1`,[match.id,target-1]);assert.equal((await assess(i,'A')).primary_met,false);
 await db.query(`update matches set ${col}=$2 where id=$1`,[match.id,target]);assert.equal((await assess(i,'A')).primary_met,true);
}
await db.query('select cancel_competition($1)',[cup]);
let a=await assess(0,'A');assert.equal(a.cup_cancelled,true);assert.equal(a.cup_met,null);assert.equal(a.bonus_percent,0);assert.equal(a.fine_percent,0);
await db.query('select cancel_competition($1)',[league]);a=await assess(0,'D');assert.equal(a.primary_met,null);assert.equal(a.primary_cancelled,true);assert.equal(a.fine_percent,0);
// Anonymous/DT direct writes cannot manufacture contracts or upload staff media.
await db.exec("select set_config('test.admin','false',false);set role authenticated");
await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('uml-media','stadiums/test.png')"),/row-level security/);
await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('uml-media','competitions/logo.png')"),/row-level security/);
await assert.rejects(()=>db.query('insert into team_sponsor_contracts default values'),/permission denied/);
await db.exec('reset role');
await db.exec("select set_config('test.admin','true',false);set role authenticated");
await db.query("insert into storage.objects(bucket_id,name) values('uml-media','stadiums/test.png')");
await db.query("insert into storage.objects(bucket_id,name) values('uml-media','competitions/logo.png')");
await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('uml-media','other/test.png')"),/row-level security/);
await db.exec('reset role');
console.log('PASS: promotion won/lost by either division, correct greatest penalties, exact 15/12 goal thresholds, cancelled conditions, no bonus without both, media and contract write permissions.');
await db.close();
