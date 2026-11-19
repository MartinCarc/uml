import assert from 'node:assert/strict';
import {database,sql} from './sponsors-support.mjs';
import {createRequire} from 'node:module';
const PES=createRequire(import.meta.url)('../js/pes13.js');
const db=await database();await db.exec(sql('supabase/migrations/20261109_option_file.sql'));
await db.exec(sql('supabase/migrations/20261118_auctions.sql'));
const uid=(await db.query("insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),'photo-admin@test.local','{}') returning id")).rows[0].id;
await db.query("select set_config('test.uid',$1,false)",[uid]);
const club=(await db.query("insert into clubs(name) values('Fotos prueba') returning id")).rows[0].id;
const entry={pes_id:991001,name:'Jugador con cara',edit_team:'FULHAM',age:23,height:180,weight:75,nationality:'Argentina',foot:'R',source_position:'CF',position:'DC',positions:['DC'],form:6,weak_accuracy:4,weak_frequency:4,injury:'B',attack_awareness:3,defence_awareness:2,number:null,abilities:Object.fromEntries(Object.keys(PES.ABILITIES).map(k=>[k,75])),cards:{playing_styles:[],special_skills:[]}};
const publish=async(hash,row)=>{const v=(await db.query("select of_begin('Fotos','test.csv',$1,1) v",[hash.repeat(64)])).rows[0].v;await db.query('select of_stage_batch($1,$2)',[v.id,[row]]);await db.query('select of_activate($1)',[v.id]);};
await publish('c',entry);
const linked=(await db.query("insert into players(name,position,option_file_id,photo_url,club_id,value) values('Jugador con cara','DC',991001,'https://images.test/original.png',$1,1234) returning id",[club])).rows[0].id;
await db.exec(sql('supabase/migrations/20261118_player_photos.sql'));
const photo=async()=> (await db.query('select photo_url from player_portraits where pes_id=991001')).rows[0]?.photo_url;
const row=async()=> (await db.query('select * from players where id=$1',[linked])).rows[0];
assert.equal(await photo(),'https://images.test/original.png');
const baseline=await row();const cash=(await db.query('select * from transactions')).rows;
await db.query('select set_player_photo($1,991001,$2)',[linked,'https://images.test/new.png']);assert.equal(await photo(),'https://images.test/new.png');assert.equal((await row()).photo_url,await photo());
const after=await row();for(const key of ['id','club_id','value','overall','position','stats','option_file_id'])assert.deepEqual(after[key],baseline[key]);
// Sports updates and club moves preserve the portrait, value and financial history.
await publish('d',{...entry,age:24,abilities:{...entry.abilities,Attack:80}});assert.equal(await photo(),'https://images.test/new.png');assert.equal((await row()).photo_url,await photo());
await db.query('update players set club_id=null where id=$1',[linked]);assert.equal((await row()).photo_url,await photo());assert.equal((await row()).value,'1234');assert.deepEqual((await db.query('select * from transactions')).rows,cash);
// Existing admin editor synchronizes the central portrait as well.
await db.query('update players set photo_url=$1 where id=$2',['https://images.test/admin.png',linked]);assert.equal(await photo(),'https://images.test/admin.png');
for(const url of ['javascript:alert(1)','data:image/png;base64,xx','https://','https://images.test/bad image.png','https://images.test/"bad.png','x'.repeat(2049)])await assert.rejects(()=>db.query('select set_player_photo($1,null,$2)',[linked,url]),/HTTP o HTTPS/);
await assert.rejects(()=>db.query('select set_player_photo($1,991002,$2)',[linked,'https://images.test/x.png']),/no corresponde/);
const manual=(await db.query("insert into players(name,position,value) values('Manual','MC',456) returning id")).rows[0].id;
await db.query('select set_player_photo($1,null,$2)',[manual,'https://images.test/manual.png']);assert.equal((await db.query('select photo_url from players where id=$1',[manual])).rows[0].photo_url,'https://images.test/manual.png');
// Removing a photo removes both representations; repeated install preserves removal.
await db.query('select set_player_photo($1,991001,null)',[linked]);assert.equal(await photo(),undefined);assert.equal((await row()).photo_url,null);
await db.exec(sql('supabase/migrations/20261118_player_photos.sql'));assert.equal(await photo(),undefined);
// Photos may be set on catalogue-only players and inherited by a later UML import.
await db.query('select set_player_photo(null,991001,$1)',['https://images.test/catalogue.png']);
await db.query('update players set archived=true where id=$1',[linked]);
const replacement=(await db.query("insert into players(name,position,option_file_id) values('Nueva etapa','DC',991001) returning photo_url")).rows[0];assert.equal(replacement.photo_url,'https://images.test/catalogue.png');
await assert.rejects(()=>db.query('select set_player_photo($1,null,null)',[linked]),/archivado/);
await db.exec("select set_config('test.admin','false',false);set role authenticated;");
await assert.rejects(()=>db.query('select set_player_photo(null,991001,null)'),/Solo administradores/);
await assert.rejects(()=>db.exec("update player_portraits set photo_url='https://bad.test/x.png'"),/permission denied/);
await db.exec('reset role;set role anon;');assert.equal((await db.query('select photo_url from player_portraits')).rows[0].photo_url,'https://images.test/catalogue.png');await assert.rejects(()=>db.query('select set_player_photo(null,991001,null)'),/permission denied/);
await db.exec('reset role;');await db.close();console.log('PASS: portraits migration, old-photo preservation, linked/manual/catalogue editing, URL validation, deletion, OF publication and transfer persistence, unchanged values/money/UUIDs, future import inheritance, archived guard, RLS/admin-only writes and repeat install.');
