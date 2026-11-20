import {database,sql,seed} from './sponsors-support.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const PES=createRequire(import.meta.url)('../js/pes13.js');
const db=await database();for(const f of ['20261109_option_file.sql','20261118_auctions.sql','20261118_player_photos.sql','20261120_community.sql'])await db.exec(sql('supabase/migrations/'+f));

const {sid,clubs,league,championship,cup}=await seed(db);
const user=async(name)=>(await db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),$1,'{}') returning id",[name+'@test.local'])).rows[0].id;
const admin=await user('community-admin'),dts=[];for(let i=0;i<16;i++){dts.push(await user('dt'+i));await db.query('update season_teams set manager_id=$1,budget=100000000 where season_id=$2 and club_id=$3',[dts[i],sid,clubs[i]]);}
const actor=async(uid=admin,adminRole=true)=>{await db.query("select set_config('test.uid',$1,false),set_config('test.admin',$2,false)",[uid||'',String(adminRole)]);};
await actor();await db.query("update seasons set status='active',market_open=false,config=jsonb_set(config,'{squad_limit}','1') where id=$1",[sid]);await db.exec("update settings set value=jsonb_set(value,'{balance}','100000000') where key='bank'");
const base=id=>({pes_id:id,name:'OF '+id,edit_team:'Club del EDIT',age:20,height:180,weight:75,nationality:'Argentina',foot:'R',source_position:'CF',position:'DC',positions:['DC'],form:6,weak_accuracy:4,weak_frequency:4,injury:'B',attack_awareness:3,defence_awareness:2,number:null,abilities:Object.fromEntries(Object.keys(PES.ABILITIES).map(k=>[k,97])),cards:{playing_styles:[],special_skills:[]}});
const rows=[base(991001),base(991002),base(991003)];const ver=(await db.query("select of_begin('Comunidad','test.csv',$1,3) v",['e'.repeat(64)])).rows[0].v;await db.query('select of_stage_batch($1,$2)',[ver.id,rows]);await db.query('select of_activate($1)',[ver.id]);
const roster=[];for(let i=0;i<16;i++)roster.push((await db.query("insert into players(name,club_id,position,age,overall,stats,pes2013_cards) values($1,$2,'DC',20,$3,$4,$5) returning id",['Plantel '+i,clubs[i],PES.rating(rows[0].abilities,'CF'),PES.stats(rows[0].abilities),rows[0].cards])).rows[0].id);
const prize=(kind,config)=>({kind,config});const save=(ps,name='Sorteo mixto',id=null)=>db.query('select raffle_save($1,$2,$3,$4) id',[sid,name,ps,id]).then(r=>r.rows[0].id);
await assert.rejects(()=>save([prize('gym',{max_age:20.5,boost:3})]),/inválid/);
await assert.rejects(()=>save([prize('player',{pes_id:991001})]),/valor inicial/);
const lot=await save([prize('player',{pes_id:991001,value:45000000}),prize('money',{amount:1000000}),prize('gym',{max_age:21,boost:3}),prize('card',{mode:'fixed',code:'P01'}),prize('card',{mode:'choice'})]);
const balances=async()=>(await db.query('select club_id,budget from season_teams where season_id=$1 order by club_id',[sid])).rows;
const bank=async()=>(await db.query("select (value->>'balance')::numeric b from settings where key='bank'")).rows[0].b;
const beforeBalance=await balances();await db.query('select raffle_draw($1)',[lot]);
const awards=(await db.query('select a.*,p.kind,p.config from raffle_awards a join raffle_prizes p on p.id=a.prize_id where a.raffle_id=$1',[lot])).rows;
assert.equal(awards.length,5);assert.equal(new Set(awards.map(a=>a.club_id)).size,5);assert.equal((await db.query('select jsonb_array_length(participants) n from raffles where id=$1',[lot])).rows[0].n,16);
const won=kind=>awards.find(a=>a.kind===kind);assert.equal(await bank(),'99000000');assert.equal((await db.query("select count(*) n from transactions where kind='raffle'")).rows[0].n,2);
await assert.rejects(()=>db.query('select raffle_draw($1)',[lot]),/ya se ejecutó/);assert.equal(await bank(),'99000000');
const money=won('money'),afterBalance=await balances();for(let i=0;i<beforeBalance.length;i++)assert.equal(Number(afterBalance[i].budget)-Number(beforeBalance[i].budget),beforeBalance[i].club_id===money.club_id?1000000:0);
const playerAward=won('player');const reserv=(await db.query('select * from raffle_reserves where award_id=$1',[playerAward.id])).rows[0];assert.equal(reserv.status,'pending');
assert.equal((await db.query('select value from players where id=$1',[reserv.player_id])).rows[0].value,'45000000');
await assert.rejects(()=>db.query('update players set club_id=$1,pending_club_id=null where id=$2',[clubs.find(c=>c!==reserv.club_id),reserv.player_id]));
await assert.rejects(()=>db.query('select sign_free_agent($1,$2,$3)',[sid,reserv.player_id,clubs.find(c=>c!==reserv.club_id)]));
await db.query('select set_market($1,true,null)',[sid]);assert.equal((await db.query('select status from raffle_reserves where id=$1',[reserv.id])).rows[0].status,'pending');
const winningIndex=clubs.indexOf(reserv.club_id);await actor(dts[winningIndex],false);await db.query('select release_player($1,$2)',[sid,roster[winningIndex]]);
assert.equal((await db.query('select status from raffle_reserves where id=$1',[reserv.id])).rows[0].status,'delivered');assert.equal((await db.query('select club_id from players where id=$1',[reserv.player_id])).rows[0].club_id,reserv.club_id);
// Every gym/card award remains a separate, single-use entitlement.
const gym=won('gym'),gi=clubs.indexOf(gym.club_id);await actor();await db.query('select of_link_player($1,991003)',[roster[gi]]);await actor(dts[(gi+1)%16],false);await assert.rejects(()=>db.query('select prize_use($1,$2,$3,null)',[sid,gym.id,roster[gi]]),/Solo el DT/);
await actor();await db.query('update players set age=22 where id=$1',[roster[gi]]);await actor(dts[gi],false);await assert.rejects(()=>db.query('select prize_use($1,$2,$3,null)',[sid,gym.id,roster[gi]]),/edad máxima/);
await actor();await db.query('update players set age=21 where id=$1',[roster[gi]]);await actor(dts[gi],false);await db.query('select prize_use($1,$2,$3,null)',[sid,gym.id,roster[gi]]);
const trained=(await db.query('select stats,overall from players where id=$1',[roster[gi]])).rows[0];assert(Object.values(trained.stats).every(v=>v===99));assert.equal(trained.overall,PES.rating(Object.fromEntries(Object.keys(PES.ABILITIES).map(k=>[k,99])),'CF'));
await assert.rejects(()=>db.query('select prize_use($1,$2,$3,null)',[sid,gym.id,roster[gi]]),/ya se utilizó/);
for(const a of awards.filter(a=>a.kind==='card')){const i=clubs.indexOf(a.club_id);await actor(dts[i],false);if(a.config.mode==='choice')await assert.rejects(()=>db.query("select prize_use($1,$2,$3,'S99')",[sid,a.id,roster[i]]),/Tarjeta inválida/);await db.query('select prize_use($1,$2,$3,$4)',[sid,a.id,roster[i],a.config.mode==='fixed'?'P02':'S26']);const c=(await db.query('select pes2013_cards from players where id=$1',[roster[i]])).rows[0].pes2013_cards;assert(c[a.config.mode==='fixed'?'playing_styles':'special_skills'].includes(a.config.mode==='fixed'?'P01':'S26'));}
assert.equal((await db.query('select count(*) n from edit_changes where award_id is not null')).rows[0].n,3);
await actor();const log=(await db.query('select * from edit_changes where award_id=$1',[gym.id])).rows[0];assert.equal(log.details.boost,3);assert.equal(log.actor_id,dts[gi]);
const nextVersion=(await db.query("select of_begin('EDIT pendiente','next.csv',$1,3) v",['f'.repeat(64)])).rows[0].v;
await db.query('select of_stage_batch($1,$2)',[nextVersion.id,rows]);await assert.rejects(()=>db.query('select of_activate($1)',[nextVersion.id]),/mejoras pendientes/);
await db.query('select edit_change_mark($1,true)',[[log.id]]);await db.query('select of_activate($1)',[nextVersion.id]);assert((await db.query('select exported_at from edit_changes where id=$1',[log.id])).rows[0].exported_at);
// Insufficient bank funds abort the whole draw, preserving draft and no partial awards.
const expensive=await save([prize('money',{amount:1000000000})]);await assert.rejects(()=>db.query('select raffle_draw($1)',[expensive]),/Bank no tiene saldo/);assert.equal((await db.query('select status from raffles where id=$1',[expensive])).rows[0].status,'draft');assert.equal((await db.query('select count(*) n from raffle_awards where raffle_id=$1',[expensive])).rows[0].n,0);
// League rounds are paired; a partial fixture cannot complete a turn.
const turn=(await db.query("select sim_turn_save($1,'league',null,'league',1,null,null) id",[sid])).rows[0].id;
const cupTurn=(await db.query("select sim_turn_save($1,'competition',$2,'group',1,null,null) id",[sid,cup])).rows[0].id;
const qfTurn=(await db.query("select sim_turn_save($1,'competition',$2,'qf',99,null,null) id",[sid,cup])).rows[0].id;
for(let i=0;i<4;i++)await db.query("insert into matches(competition_id,round,stage,home_club_id,away_club_id,status) values($1,4,'qf',$2,$3,'pending')",[cup,clubs[i*2],clubs[i*2+1]]);
const turnData=async()=>(await db.query('select sim_turn_data($1) t',[sid])).rows[0].t;
const matches=[];for(let i=0;i<8;i++){const comp=i<4?league:championship,offset=i<4?i*2:8+(i-4)*2;matches.push((await db.query("insert into matches(competition_id,round,stage,home_club_id,away_club_id,status) values($1,1,'league',$2,$3,'pending') returning id",[comp,clubs[offset],clubs[offset+1]])).rows[0].id);}
assert.equal((await turnData()).find(t=>t.id===qfTurn).total,4);assert.equal((await turnData()).find(t=>t.id===qfTurn).round,1);await db.query('select sim_publish($1)',[sid]);await db.query("update matches set status='played',home_goals=1,away_goals=0 where id=any($1)",[matches.slice(0,4)]);assert.equal((await turnData())[0].state,'in_progress');
await db.query("update matches set status='played',home_goals=1,away_goals=0 where id=any($1)",[matches.slice(4)]);assert.equal((await turnData())[0].state,'completed');assert.equal((await turnData())[1].state,'undefined');
assert.equal((await db.query("select count(*) n from app_notifications where event_key like $1",['turn:'+cupTurn+':%'])).rows[0].n,16);
await db.query("select sim_turn_action($1,'up')",[cupTurn]);assert.equal((await turnData())[0].id,cupTurn);
const fixtureCount=(await db.query('select count(*) n from matches')).rows[0].n;await db.query("select sim_turn_action($1,'delete')",[cupTurn]);assert.equal((await db.query('select count(*) n from matches')).rows[0].n,fixtureCount);
// Existing paid gyms now update abilities, not overall directly; closed-market use is logged on delivery.
await actor();await db.query('select set_market($1,false,null)',[sid]);
const pi=clubs.findIndex((c,i)=>c!==reserv.club_id&&i!==gi);await actor(dts[pi],false);
const paidId=roster[pi];const paidBefore=(await db.query('select overall from players where id=$1',[paidId])).rows[0].overall;
await db.query('select train_player($1,$2,false)',[sid,paidId]);assert.equal((await db.query('select overall from players where id=$1',[paidId])).rows[0].overall,paidBefore);
await actor();await db.query('select set_market($1,true,null)',[sid]);assert.equal((await db.query("select count(*) n from edit_changes where player_id=$1 and source like 'Gimnasio habitual%'",[paidId])).rows[0].n,1);
const paidAfter=(await db.query('select overall from players where id=$1',[paidId])).rows[0].overall;await db.query('select set_market($1,true,null)',[sid]);assert.equal((await db.query('select overall from players where id=$1',[paidId])).rows[0].overall,paidAfter);
// A reserve survives the originating season and enters a subsequent open market with room.
await db.query('select set_market($1,false,null)',[sid]);const carryLot=await save([prize('player',{pes_id:991002,value:5000000})],'Jugador para próxima temporada');await db.query('select raffle_draw($1)',[carryLot]);
const carry=(await db.query('select * from raffle_reserves where award_id in(select id from raffle_awards where raffle_id=$1)',[carryLot])).rows[0];assert.equal(carry.status,'pending');
await db.query("update seasons set status='closed' where id=$1",[sid]);
const nextSid=(await db.query("insert into seasons(name,status,market_open,config) values('Siguiente','draft',false,'{\"squad_limit\":2}') returning id")).rows[0].id;
await db.query('insert into season_teams(season_id,club_id,manager_id,budget) select $1,club_id,manager_id,budget from season_teams where season_id=$2',[nextSid,sid]);await db.query('select set_market($1,true,null)',[nextSid]);assert.equal((await db.query('select status from raffle_reserves where id=$1',[carry.id])).rows[0].status,'delivered');
// One authenticated user with several sessions is only counted once.
await actor(dts[0],false);const ss1=randomUUID(),ss2=randomUUID();await db.query('select online_ping($1,false),online_ping($2,false)',[ss1,ss2]);assert.equal((await db.query('select community_online() x')).rows[0].x.length,1);await db.query('select online_ping($1,true)',[ss1]);assert.equal((await db.query('select community_online() x')).rows[0].x.length,1);
await actor(dts[1],false);await db.query('select online_ping($1,false)',[ss2]);assert.equal((await db.query('select user_id from online_sessions where id=$1',[ss2])).rows[0].user_id,dts[0]);
await assert.rejects(()=>db.query("select announcement_save('Título','Texto',false,null)"),/Solo administradores/);
await actor();await db.query("select announcement_save('Oficial','Texto <script>no ejecutar</script>',true,null)");
await actor(dts[0],false);await db.exec('set role authenticated;');assert.equal((await db.query('select count(*) n from edit_changes')).rows[0].n,0);const notices=(await db.query('select * from app_notifications')).rows;assert(notices.every(n=>n.user_id===dts[0]));await assert.rejects(()=>db.query('select raffle_deliver($1)',[sid]),/permission denied/);await assert.rejects(()=>db.exec('delete from raffle_awards'),/permission denied/);
await db.exec('reset role;set role anon;');const f=(await db.query('select community_feed($1) f',[sid])).rows[0].f;assert.equal(f.announcements[0].title,'Oficial');assert(f.raffles.length>=1);await assert.rejects(()=>db.query('select raffle_draw($1)',[lot]),/permission denied/);await db.exec('reset role;');
await actor();const beforeReinstall=await bank();await db.exec(sql('supabase/migrations/20261120_community.sql'));assert.equal(await bank(),beforeReinstall);
console.log('PASS: mixed prizes, all 16 participants/unique winners, bank-funded atomic/idempotent draw, pending/full squad reserve and automatic delivery after release, separate age/boost gyms and PES recalculation, fixed/choice cards, single use/roles, EDIT audit and marking, combined league calendar and notifications, session dedup/ownership, public read/private writes and migration rerun.');
await db.close();
