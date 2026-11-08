import assert from 'node:assert/strict';
import {database,seed,migrations,sql} from './sponsors-support.mjs';
const db=await database();const {sid,clubs,league,championship,cup}=await seed(db);
console.log('Migrations compiled; fixture ready.');
await db.exec("update sponsors set name='Marca '||code,payment_tier1=100000000,payment_tier2=80000000,enabled=true");
const choose=(cid,code)=>db.query('select choose_sponsor($1,$2,$3)',[sid,cid,code]);
const balance=async(cid)=>Number((await db.query('select budget from season_teams where season_id=$1 and club_id=$2',[sid,cid])).rows[0].budget);
await db.exec("select set_config('test.admin','false',false)");await assert.rejects(()=>choose(clubs[0],'A'),/Solo el DT/);
await db.exec("select set_config('test.admin','true',false)");
for(let i=0;i<16;i++)await choose(clubs[i],['A','B','C','D'][i%4]);
assert.equal((await db.query('select count(*) n from team_sponsor_contracts')).rows[0].n,16);
// Draft changes are allowed; only the selected contract is paid.
await choose(clubs[0],'B');await choose(clubs[0],'A');
await db.query('select generate_league_fixture($1)',[league]);await db.query('select generate_league_fixture($1)',[championship]);
await db.query('select generate_cup_groups($1)',[cup]);
assert.equal((await db.query("select count(*) n from matches where competition_id=$1 and stage='group'",[cup])).rows[0].n,24);
for(const id of clubs){
 const rows=(await db.query('select home_club_id,away_club_id from matches where competition_id=$1 and $2 in(home_club_id,away_club_id)',[cup,id])).rows;
 assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.home_club_id===id?r.away_club_id:r.home_club_id)).size,3);
 const homes=rows.filter(r=>r.home_club_id===id).length;assert(homes===1||homes===2);
}
await assert.rejects(()=>db.query('select generate_cup_round($1)',[cup]),/24 partidos/);
await db.query('select start_season($1)',[sid]);assert.equal(await balance(clubs[0]),360000000);assert.equal(await balance(clubs[8]),270000000);
await assert.rejects(()=>choose(clubs[0],'B'),/antes de iniciar/);
await assert.rejects(()=>db.query('select start_season($1)',[sid]),/ya fue iniciada/);
assert.equal((await db.query("select count(*) n from transactions where kind='sponsor'")).rows[0].n,16);
await assert.rejects(()=>db.query('select close_season($1)',[sid]),/Finalizá/);
// Finish the actual group fixture. Draws are allowed and have no penalty shoot-out.
for(const m of (await db.query("select id from matches where competition_id=$1 and stage='group'",[cup])).rows)await db.query('select set_result($1,1,0)',[m.id]);
const g=(await db.query("select id from matches where competition_id=$1 and stage='group' limit 1",[cup])).rows[0].id;
await assert.rejects(()=>db.query("select set_result($1,1,1,'[]',null,null,null,4,3)",[g]),/grupos/);
await db.query('select generate_cup_round($1)',[cup]);
assert.equal((await db.query("select count(*) n from matches where competition_id=$1 and stage='qf' and neutral",[cup])).rows[0].n,4);
await assert.rejects(()=>db.query('select set_result($1,0,0)',[g]),/fase posterior/);
const qf=(await db.query("select * from matches where competition_id=$1 and stage='qf' limit 1",[cup])).rows[0];
await assert.rejects(()=>db.query('select set_result($1,1,1)',[qf.id]),/penales/);
await db.query("select set_result($1,1,1,'[]',null,null,null,5,4)",[qf.id]);
let gates=(await db.query("select amount from transactions where ref_id=$1 and kind='tickets'",[qf.id])).rows;
assert.equal(gates.length,2);assert.equal(Number(gates[0].amount),1150000);assert.equal(Number(gates[1].amount),1150000);
await db.query("select set_result($1,1,1,'[]',null,null,null,5,4)",[qf.id]);
assert.equal((await db.query("select count(*) n from transactions where ref_id=$1 and kind='tickets'",[qf.id])).rows[0].n,2);
for(let r=0;r<3;r++){
 for(const m of (await db.query("select id from matches where competition_id=$1 and stage<>'group' and status='pending'",[cup])).rows)await db.query('select set_result($1,2,0)',[m.id]);
 await db.query('select generate_cup_round($1)',[cup]);
}
assert.equal((await db.query('select status from competitions where id=$1',[cup])).rows[0].status,'finished');
assert.equal((await db.query('select count(*) n from matches where competition_id=$1',[cup])).rows[0].n,31);
assert.equal((await db.query("select count(*) n from matches where competition_id=$1 and stage<>'group' and neutral",[cup])).rows[0].n,7);
// Finish leagues deterministically; set final winners from the computed table.
for(const m of (await db.query("select * from matches where competition_id in($1,$2)",[league,championship])).rows){
 const home=clubs.indexOf(m.home_club_id),away=clubs.indexOf(m.away_club_id);
 await db.query('select set_result($1,$2,$3)',[m.id,home<away?2:0,home<away?0:2]);
}
for(const id of [league,championship]){
 const winner=(await db.query('select club_id from standings($1) where pos=1',[id])).rows[0].club_id;
 await db.query("update competitions set status='finished',champion_club_id=$2 where id=$1",[id,winner]);
}
// Frozen contract terms survive edits to the staff catalogue.
await db.exec("update sponsors set payment_tier1=1,name='Nueva marca'");
const reports=(await db.query('select club_id,rules,amount,sponsor_assessment(season_id,club_id,rules) report from team_sponsor_contracts')).rows;
// Known league outcomes: 1st..8th score 28,24,20,16,12,8,4,0 goals.
const expectedMain=[true,true,true,false,false,false,false,false,true,true,false,false,true,false,false,false];
const expectedFine=[0,0,0,50,10,20,55,70,0,0,35,50,0,30,45,60];
for(let i=0;i<16;i++){
 const report=reports.find(r=>r.club_id===clubs[i]).report;
 assert.equal(report.primary_met,expectedMain[i],`primary club ${i}`);
 assert.equal(report.fine_percent,expectedFine[i],`fine club ${i}`);
}
await assert.rejects(()=>db.query('update season_teams set tier=2 where season_id=$1 and club_id=$2',[sid,clubs[0]]),/queda fija/);
await db.query('select close_season($1)',[sid]);
for(const ct of reports){
 const saved=(await db.query('select * from team_sponsor_contracts where season_id=$1 and club_id=$2',[sid,ct.club_id])).rows[0];
 assert(saved.settled_at);assert.equal(Number(saved.bonus),Number(ct.amount)*ct.report.bonus_percent/100);assert.equal(Number(saved.fine),Number(ct.amount)*ct.report.fine_percent/100);
 assert(Number(saved.bonus)===0||Number(saved.fine)===0);assert.notEqual(saved.name,'Nueva marca');
}
await assert.rejects(()=>db.query('select close_season($1)',[sid]),/activa/);
await assert.rejects(()=>db.query('select set_result($1,3,0)',[qf.id]),/cerrada/);
// Re-running deployment migrations cannot replay sponsor payments.
const count=(await db.query("select count(*) n from transactions where kind like 'sponsor%' ")).rows[0].n;
for(const m of migrations)if(m.startsWith('20261108'))await db.exec(sql('supabase/migrations/'+m));
assert.equal((await db.query("select count(*) n from transactions where kind like 'sponsor%'")).rows[0].n,count);
console.log('PASS: sponsors all codes/tiers, draft changes, start-once payment, frozen contracts, finish guards, settlement/no double charge; 24 group matches, balanced home fixtures, 8 qualifiers, 7 neutral knockout matches, extra-time/penalties, 50/50 gate and correction, migration rerun.');
await db.close();
