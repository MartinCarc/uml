import {database,sql} from './sponsors-support.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const PES=createRequire(import.meta.url)('../js/pes13.js');
const db=await database();
await db.exec(sql('supabase/migrations/20261109_option_file.sql'));
await db.exec(sql('supabase/migrations/20261118_auctions.sql'));
await db.exec(sql('supabase/migrations/20261118_player_photos.sql'));
const admin=(await db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'auction-admin@test.local','{}') returning id")).rows[0].id;
const dt1=(await db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'dt1@test.local','{}') returning id")).rows[0].id;
const dt2=(await db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'dt2@test.local','{}') returning id")).rows[0].id;
const actor=async(id,isAdmin=false)=>{await db.query("select set_config('test.uid',$1,false)",[id||'']);await db.query("select set_config('test.admin',$1,false)",[String(isAdmin)]);};
await actor(admin,true);
const sid=(await db.query("insert into seasons(name,status,market_open) values('Subastas prueba','active',false) returning id")).rows[0].id;
const c1=(await db.query("insert into clubs(name) values('Fulham prueba') returning id")).rows[0].id;
const c2=(await db.query("insert into clubs(name) values('Chelsea prueba') returning id")).rows[0].id;
await db.query('insert into season_teams(season_id,club_id,manager_id,budget) values($1,$2,$3,100000000),($1,$4,$5,100000000)',[sid,c1,dt1,c2,dt2]);
const base=(id)=>({pes_id:id,name:'Jugador OF '+id,edit_team:'CLUB DEL EDIT',age:23,height:180,weight:75,nationality:'Argentina',foot:'R',source_position:'CF',position:'DC',positions:['DC','SD'],form:6,weak_accuracy:4,weak_frequency:4,injury:'B',attack_awareness:3,defence_awareness:2,number:null,abilities:Object.fromEntries(Object.keys(PES.ABILITIES).map(k=>[k,75])),cards:{playing_styles:['P16'],special_skills:['S01']}});
const fileRows=Array.from({length:12},(_,i)=>base(900001+i));
const version=(await db.query("select of_begin('OF para subastas','test.csv',$1,$2) v",['a'.repeat(64),fileRows.length])).rows[0].v;
await db.query('select of_stage_batch($1,$2)',[version.id,fileRows]);await db.query('select of_activate($1)',[version.id]);
const create=(id,initial=10000000,increment=1000000,starts=new Date(Date.now()-60000).toISOString(),ends=new Date(Date.now()+3600000).toISOString(),edit=null)=>db.query('select auction_save($1,$2,$3,$4,$5,$6,$7) id',[sid,id,initial,increment,starts,ends,edit]).then(r=>r.rows[0].id);
const bid=(a,c,n)=>db.query('select auction_bid($1,$2,$3) r',[a,c,n]).then(r=>r.rows[0].r);
const auction=async a=>(await db.query('select * from auctions where id=$1',[a])).rows[0];
const team=async c=>(await db.query('select budget,reserved from season_teams where season_id=$1 and club_id=$2',[sid,c])).rows[0];
const transactions=async a=>(await db.query('select * from transactions where ref_id=$1 order by club_id nulls last',[a])).rows;
const expire=async a=>db.query("update auctions set starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()-interval '1 second' where id=$1",[a]);
const settle=async()=> (await db.query('select auction_close_due() n')).rows[0].n;
const count=async c=>(await db.query('select squad_count($1,$2) n',[c,sid])).rows[0].n;
assert.equal((await db.query('select auction_scheduler_ready() r')).rows[0].r,false);
await assert.rejects(()=>create(900001),/cierre automático/);
// PGlite has no pg_cron. Fake its metadata only; invoke the real worker explicitly.
await db.exec("create schema cron;create table cron.job(jobname text,active boolean,database text,command text);insert into cron.job values('uml-auctions-close',false,current_database(),'select public.auction_close_due();');");
assert.equal((await db.query('select auction_scheduler_ready() r')).rows[0].r,false);
await db.exec('update cron.job set active=true');
assert.equal((await db.query('select auction_scheduler_ready() r')).rows[0].r,true);
for(const [initial,increment] of [[0,1],[-1,1],[1,0],[1,-1],[1.5,1],['NaN',1],['Infinity',1]])await assert.rejects(()=>create(900001,initial,increment),/enteros positivos/);
const a=await create(900001,10000000,1000000,new Date(Date.now()-60000).toISOString(),new Date(Date.now()+120000).toISOString());
await assert.rejects(()=>create(900001),/subasta activa/);
await actor(null);await assert.rejects(()=>bid(a,c1,10000000),/Ingresá/);
await actor(admin,true);await assert.rejects(()=>bid(a,c1,10000000),/DT asignado/);
await actor(dt1);await assert.rejects(()=>bid(a,c2,10000000),/DT asignado/);
await assert.rejects(()=>bid(a,c1,9000000),/mínima/);
const b1=await bid(a,c1,10000000);assert.equal(b1.extended,true);assert.equal(await count(c1),1);
const history=(await db.query('select * from auction_bids where auction_id=$1 order by id',[a])).rows;
assert(Math.abs(new Date(history[0].resulting_end)-new Date(history[0].placed_at)-300000)<2);
assert.deepEqual(await team(c1),{budget:'100000000',reserved:'10000000'});
assert.equal((await transactions(a)).length,0);
await assert.rejects(()=>db.query('update season_teams set budget=1 where season_id=$1 and club_id=$2',[sid,c1]),/dinero reservado/);
const beforeInvalid=await auction(a);await assert.rejects(()=>bid(a,c1,10000000),/mínima/);assert.deepEqual(await auction(a),beforeInvalid);
await actor(dt2);await bid(a,c2,12000000);assert.equal((await team(c1)).reserved,'0');assert.equal((await team(c2)).reserved,'12000000');
await bid(a,c2,14000000);assert.equal((await team(c2)).reserved,'14000000');assert.equal((await db.query('select count(*) n from auction_bids where auction_id=$1',[a])).rows[0].n,3);
await actor(admin,true);await assert.rejects(()=>create(900001,20000000,1000000,undefined,undefined,a),/bloqueadas/);
// Leading bids reserve slots against other auctions, direct assignments and free signing.
await db.query("update seasons set config=jsonb_set(config,'{squad_limit}','1') where id=$1",[sid]);
const second=await create(900002);await actor(dt2);await assert.rejects(()=>bid(second,c2,10000000),/cupos/);
await actor(admin,true);
await assert.rejects(()=>db.query("insert into players(name,club_id,position) values('Directo',$1,'DC')",[c2]),/cupos comprometidos/);
const free=(await db.query("insert into players(name,position) values('Libre','DC') returning id")).rows[0].id;
await actor(dt2);await assert.rejects(()=>db.query('select sign_free_agent($1,$2,$3)',[sid,free,c2]),/Plantel lleno/);
await actor(admin,true);await db.query("update seasons set config=jsonb_set(config,'{squad_limit}','32') where id=$1",[sid]);
// IDs in an active auction cannot be imported or linked via another endpoint.
await assert.rejects(()=>db.query("insert into players(name,option_file_id,position) values('Duplicado',900001,'DC')"),/reservado/);
// No visitors, no user identity, no admin role: same worker run by server cron closes it.
await expire(a);await actor(dt2);await assert.rejects(()=>bid(a,c2,15000000),/no admite/);await actor(null,false);assert.equal(await settle(),1,JSON.stringify(await auction(a)));
const won=await auction(a);assert.equal(won.status,'awarded');assert(won.player_id);
assert.deepEqual(await team(c2),{budget:'86000000',reserved:'0'});
const cash=await transactions(a);assert.equal(cash.length,2);assert.equal(cash[0].amount,'-14000000');assert.equal(cash[1].amount,'14000000');assert.equal(cash[1].club_id,null);
const paid=(await db.query('select * from players where id=$1',[won.player_id])).rows[0];assert.equal(paid.club_id,null);assert.equal(paid.pending_club_id,c2);assert.equal(paid.value,'14000000');
assert.equal((await db.query("select count(*) n from transfer_queue where kind='auction' and ref_id=$1",[a])).rows[0].n,1);
assert.equal(await settle(),0);assert.deepEqual(await transactions(a),cash);
await actor(admin,true);await assert.rejects(()=>db.query('select auction_cancel($1,$2)',[a,'Intentar revertir']),/sin adjudicar/);
await assert.rejects(()=>db.query('select close_season($1)',[sid]),/subastas abiertas/); // second still open
await db.query('select auction_cancel($1,$2)',[second,'Se retira este lote']);
await assert.rejects(()=>db.query('select close_season($1)',[sid]),/ya pagadas/);
await assert.rejects(()=>db.query('select delete_current_season($1,$2)',[sid,'ELIMINAR Subastas prueba']),/adjudicaciones ya pagadas/);
await assert.rejects(()=>db.query('delete from transfer_queue where ref_id=$1',[a]),/ya pagada/);
await assert.rejects(()=>db.query('update players set club_id=$1 where id=$2',[c1,paid.id]),/ya está pagada/);
// Opening the market delivers once, without changing either ledger or budgets.
await db.query("select set_market($1,true,'Abierto')",[sid]);
const delivered=(await db.query('select * from players where id=$1',[paid.id])).rows[0];assert.equal(delivered.club_id,c2);assert.equal(delivered.pending_club_id,null);
assert.equal((await db.query("select status from transfer_queue where ref_id=$1",[a])).rows[0].status,'executed');
assert.deepEqual(await transactions(a),cash);assert.deepEqual(await team(c2),{budget:'86000000',reserved:'0'});
await db.query("select set_market($1,true,'Abierto otra vez')",[sid]);assert.deepEqual(await transactions(a),cash);
// Cancellation keeps bid history and releases every reservation, without a payment.
const cancel=await create(900003);await actor(dt1);await bid(cancel,c1,10000000);await actor(admin,true);
await assert.rejects(()=>db.query('select auction_cancel($1,$2)',[cancel,'']),/motivo/);
await db.query('select auction_cancel($1,$2)',[cancel,'Cambio de planificación']);assert.equal((await team(c1)).reserved,'0');assert.equal(await count(c1),0);assert.equal((await transactions(cancel)).length,0);
assert.equal((await db.query('select count(*) n from auction_bids where auction_id=$1',[cancel])).rows[0].n,1);
// No bids: no player is manufactured and no money is moved.
const empty=await create(900004);const beforePlayers=(await db.query('select count(*) n from players')).rows[0].n;await expire(empty);await settle();assert.equal((await auction(empty)).status,'no_bids');assert.equal((await transactions(empty)).length,0);assert.equal((await db.query('select count(*) n from players')).rows[0].n,beforePlayers);
// Scheduled start, editing before bids, and immediate delivery when market is open.
const scheduled=await create(900005,5000000,500000,new Date(Date.now()+600000).toISOString(),new Date(Date.now()+3600000).toISOString());
await actor(dt1);await assert.rejects(()=>bid(scheduled,c1,5000000),/no admite/);
await actor(admin,true);await create(900005,6000000,500000,new Date(Date.now()-60000).toISOString(),new Date(Date.now()+3600000).toISOString(),scheduled);
await actor(dt1);await bid(scheduled,c1,6000000);await expire(scheduled);await actor(null);await settle();
const open=(await auction(scheduled));assert.equal((await db.query('select club_id from players where id=$1',[open.player_id])).rows[0].club_id,c1);assert.equal((await transactions(scheduled)).length,2);assert.equal((await db.query('select count(*) n from transfer_queue where ref_id=$1',[scheduled])).rows[0].n,0);
// Existing free player: preserve UUID, allow sports updates from OF while open.
await actor(admin,true);const data=base(900006);
const existing=(await db.query("insert into players(name,position,option_file_id,stats,value) values($1,'DC',900006,'{}',999) returning id",[data.name])).rows[0].id;
const reuse=await create(900006);
const updatedRows=fileRows.map(row=>row.pes_id===900006?{...row,age:24,abilities:{...row.abilities,Attack:80}}:row);
const nextVersion=(await db.query("select of_begin('OF actualizado durante subasta','next.csv',$1,$2) v",['b'.repeat(64),updatedRows.length])).rows[0].v;
const priorCash=(await db.query('select * from transactions order by id')).rows;
await db.query('select of_stage_batch($1,$2)',[nextVersion.id,updatedRows]);await db.query('select of_activate($1)',[nextVersion.id]);
const synced=(await db.query('select age,stats,club_id,value from players where id=$1',[existing])).rows[0];assert.equal(synced.age,24);assert.equal(synced.stats.Ataque,80);assert.equal(synced.club_id,null);assert.equal(synced.value,'999');
assert.deepEqual((await db.query('select * from transactions order by id')).rows,priorCash);
await assert.rejects(()=>db.query('select sign_free_agent($1,$2,$3)',[sid,existing,c1]),/reservado/);
await actor(dt1);await bid(reuse,c1,10000000);await expire(reuse);await settle();assert.equal((await auction(reuse)).player_id,existing);assert.equal((await db.query('select value from players where id=$1',[existing])).rows[0].value,'10000000');
// Ordinary exchanges still execute at the squad cap with auction slots reserved.
await actor(admin,true);
const held=await create(900007);await actor(dt1);await bid(held,c1,10000000);
await actor(admin,true);await db.query("update seasons set config=jsonb_set(config,'{squad_limit}','3') where id=$1",[sid]);
const give=open.player_id,ask=paid.id;
const offer=(await db.query('select create_offer($1,$2,$3,$4,$5,0,0,false) id',[sid,c1,c2,[ask],[give]])).rows[0].id;
await db.query('select respond_offer($1,true)',[offer]);
assert.equal((await db.query('select status from offers where id=$1',[offer])).rows[0].status,'executed');
assert.equal(await count(c1),3);assert.equal((await team(c1)).reserved,'10000000');
await db.query('select auction_cancel($1,$2)',[held,'Fin de la prueba de intercambio']);
await db.query("update seasons set config=jsonb_set(config,'{squad_limit}','32') where id=$1",[sid]);
// Read permissions include all public history; browser clients cannot invoke workers or write tables.
await db.exec('set role anon;');const feed=(await db.query('select auction_feed($1,$2) r',[sid,a])).rows[0].r;assert.equal(feed.bids.length,3);assert.equal(feed.auctions[0].status,'awarded');
await assert.rejects(()=>db.query('select auction_close_due()'),/permission denied/);
await assert.rejects(()=>db.query('select auction_settle($1)',[a]),/permission denied/);
await assert.rejects(()=>db.exec('delete from auction_bids'),/permission denied/);
await assert.rejects(()=>db.query('select auction_save($1,900007,1,1,now(),now()+interval \'1 hour\',null)',[sid]),/permission denied/);
await db.exec('reset role;');await actor(dt1);await db.exec('set role authenticated;');await assert.rejects(()=>create(900007),/Solo administradores/);await db.exec('reset role;');
// Migration rerun preserves ledgers and wraps the prior market function only once.
await actor(admin,true);const cashBefore=(await db.query("select * from transactions where kind='auction' order by id")).rows;
await db.exec(sql('supabase/migrations/20261118_auctions.sql'));assert.deepEqual((await db.query("select * from transactions where kind='auction' order by id")).rows,cashBefore);
console.log('PASS: public timed auctions, scheduler guard, first/minimum/own/outbid reservations, 5-minute extensions, frozen conditions, cancellation, projected cupos and identity guards; unattended closure pays club→bank exactly once; closed-market delivery and repeated opening do not charge again; no-bid/no-player side effects, free UUID reuse, OF sports updates, roles/RLS/private workers, season/delete guards and rerun persistence.');
await db.close();
