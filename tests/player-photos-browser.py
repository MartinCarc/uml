"""Public portrait rendering and admin URL editor; no production connections."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import shutil,os
ROOT=Path(__file__).resolve().parents[1]
fixture=r'''
const uid=n=>'20000000-0000-0000-0000-'+String(n).padStart(12,'0');
const sid=uid(1),me=uid(2),cid=uid(3),pid=uid(4),lid=uid(5),mid=uid(6);
const d={pes_id:54360,name:'Bernd Leno',edit_team:'FULHAM',position:'ARQ',positions:['ARQ'],overall:76,age:33,height:189,weight:83,foot:'R',nationality:'Germany',form:6,weak_accuracy:4,weak_frequency:4,injury:'B',attack_awareness:2,defence_awareness:2,abilities:Object.fromEntries(Object.keys(PES13.ABILITIES).map(k=>[k,76])),cards:{playing_styles:[],special_skills:[]}};
const player={...d,id:pid,option_file_id:54360,option_file_data:d,stats:PES13.stats(d.abilities),pes2013_cards:d.cards,club_id:cid,value:1000000,photo_url:null,number:1};
const clubs=[{id:cid,name:'Fulham',stadium_capacity:28000},{id:uid(7),name:'Rival'}];
const team={season_id:sid,club_id:cid,manager_id:me,budget:100000000,reserved:0,tier:1,tactics:{lineup:[{player_id:pid,position:'ARQ',x:50,y:80}],bench:[],roles:{},instructions:''}};
const season={id:sid,name:'Fotos locales',status:'active',market_open:true,config:{squad_limit:32}};
const comps=[{id:lid,name:'Premier',kind:'league',season_id:sid,points_win:3,points_draw:1,status:'active',tier:1}];
const matches=[{id:mid,competition_id:lid,home_club_id:cid,away_club_id:uid(7),home_goals:1,away_goals:0,round:1,stage:'league',status:'played',mvp_player_id:pid,save_player_id:pid}];
const events=[{id:uid(8),match_id:mid,club_id:cid,player_id:pid,type:'goal',matches:{competition_id:lid}}];
const version={id:uid(9),name:'OF local',status:'active',expected_count:1,activated_at:new Date().toISOString()};
let portraits=[],failSave=false;window.calls=[];
const catalogue=[{...d,version_id:version.id,data:d}];
const tables={players:[player],clubs,seasons:[season],season_teams:[team],competitions:comps,matches,match_events:events,option_file_versions:[version],option_file_entries:catalogue};
class Query{constructor(t){this.t=t;this.filters=[];this.one=false;this.start=0;this.end=999;}select(){return this}eq(k,v){this.filters.push([k,v]);return this}is(k,v){return this.eq(k,v)}in(){return this}or(){return this}order(){return this}limit(){return this}range(a,b){this.start=a;this.end=b;return this}single(){this.one=true;return this}maybeSingle(){this.one=true;return this}then(ok,no){let rows=(this.t==='player_portraits'?portraits:tables[this.t]||[]).filter(r=>this.filters.every(([k,v])=>k.includes('.')||r[k]===v));return Promise.resolve({data:this.one?rows[0]||null:rows.slice(this.start,this.end+1),count:rows.length,error:null}).then(ok,no)}}
U.setClient({from:t=>new Query(t),rpc:async(fn,a)=>{calls.push({fn,args:a});let data=null;
 if(fn==='set_player_photo'){if(failSave)return {data:null,error:{message:'Error de guardado de prueba'}};portraits=a.p_url?[{pes_id:54360,photo_url:a.p_url}]:[];player.photo_url=a.p_url;}
 if(fn==='of_facets')data={teams:['FULHAM']};if(fn==='of_uml_links')data=[{pes_id:54360,club:'Fulham',player_id:pid,season_id:sid}];
 if(fn==='auction_feed')data={server_now:new Date().toISOString(),automatic_close_ready:true,auctions:[{id:uid(10),pes_id:54360,player_snapshot:d,status:'open',initial_amount:1000000,min_increment:100000,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),bid_count:0}],bids:[],events:[],teams:[{...team,count:1,limit:32}]};
 return {data,error:null};}});
Object.assign(U.S,{sid,season,user:{id:me},profile:{id:me,username:'Admin local',is_admin:true},myClub:cid,clubs,seasonTeams:[team],competitions:comps,compTeams:[{competition_id:lid,club_id:cid},{competition_id:lid,club_id:uid(7)}],matches,players:[player],events,sanctions:[],offers:[],queue:[],profiles:[]});
window.addEventListener('hashchange',U.route);U.route();
'''
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('UML_CHROMIUM') or shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':1000});page.set_default_timeout(12000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort())
 page.route('**/js/app.js',lambda r:r.fulfill(body=fixture,content_type='application/javascript'))
 origin=f'http://127.0.0.1:{server.server_port}'
 page.goto(origin+'/#/s/20000000-0000-0000-0000-000000000001/jugador/20000000-0000-0000-0000-000000000004')
 page.get_by_role('button',name='Agregar foto',exact=True).click()
 page.locator('#player-photo-url').fill(origin+'/assets/logo.png')
 page.locator('#player-photo-preview img').wait_for()
 page.get_by_role('button',name='Guardar foto',exact=True).click()
 page.get_by_role('button',name='Cambiar foto',exact=True).wait_for()
 assert page.locator('#app .player-face img').first.get_attribute('src')==origin+'/assets/logo.png'
 assert page.evaluate("calls.find(c=>c.fn==='set_player_photo').args.p_player===pid")
 paths=[('equipo/'+ '20000000-0000-0000-0000-000000000003','Plantel'),('stats','Estadísticas'),('partido/'+ '20000000-0000-0000-0000-000000000006','Resumen'),('pizarra/'+ '20000000-0000-0000-0000-000000000003','Campo de juego'),('subastas','Subastas')]
 for path,title in paths:
  page.evaluate('(hash)=>location.hash=hash','#/s/20000000-0000-0000-0000-000000000001/'+path)
  page.get_by_text(title,exact=True).first.wait_for()
  page.locator('#app .player-face img').first.wait_for()
  assert all(u==origin+'/assets/logo.png' for u in page.locator('#app .player-face img').evaluate_all('(imgs)=>imgs.map(i=>i.src)'))
 page.evaluate("location.hash='#/option-file'")
 page.locator('#of-results .player-face img').wait_for()
 page.evaluate("location.hash='#/option-file/54360'")
 page.get_by_role('button',name='Cambiar foto',exact=True).wait_for()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 # Unloadable links are rejected before persistence, including the reported 403.
 page.route('https://cdn.sofifa.net/**',lambda r:r.fulfill(status=403,body='Forbidden'))
 page.get_by_role('button',name='Cambiar foto',exact=True).click()
 page.locator('#player-photo-url').fill('javascript:alert(1)')
 n=page.evaluate("calls.filter(c=>c.fn==='set_player_photo').length")
 assert page.get_by_role('button',name='Guardar foto',exact=True).is_disabled()
 page.locator('#player-photo-url').fill('https://cdn.sofifa.net/players/192/563/27_120.png')
 page.get_by_text('No se pudo cargar la imagen.',exact=False).wait_for()
 assert page.get_by_role('button',name='Guardar foto',exact=True).is_disabled()
 assert page.evaluate("calls.filter(c=>c.fn==='set_player_photo').length")==n
 assert page.evaluate('player.photo_url')==origin+'/assets/logo.png'
 # A stale request cannot approve a newer failing URL, or reject a newer valid URL.
 held=[]
 page.route('**/slow-portrait.png',lambda r:held.append(r))
 page.locator('#player-photo-url').fill(origin+'/slow-portrait.png')
 page.wait_for_function("document.querySelector('#player-photo-status').textContent.includes('Comprobando')")
 page.wait_for_timeout(100)
 page.locator('#player-photo-url').fill(origin+'/assets/logo.png?updated=1')
 page.get_by_text('Imagen cargada. Ya podés guardarla.',exact=True).wait_for()
 for r in held:r.fulfill(status=403,body='Forbidden')
 assert page.get_by_role('button',name='Guardar foto',exact=True).is_enabled()
 # A failed persistence request preserves a valid link for retry.
 page.evaluate('failSave=true')
 page.get_by_role('button',name='Guardar foto',exact=True).click()
 page.get_by_text('Error de guardado de prueba',exact=True).wait_for()
 assert page.locator('#player-photo-url').input_value()==origin+'/assets/logo.png?updated=1'
 assert page.locator('#player-photo-url').is_enabled()
 page.evaluate('failSave=false')
 page.get_by_role('button',name='Guardar foto',exact=True).click()
 page.get_by_role('button',name='Cambiar foto',exact=True).wait_for()
 # Existing broken links retain the initial but show a useful error when edited.
 page.evaluate("portraits=[{pes_id:54360,photo_url:location.origin+'/missing-face.png'}];player.photo_url=location.origin+'/missing-face.png';U.loadPlayerPhotos(true).then(()=>U.route())")
 page.get_by_role('button',name='Cambiar foto',exact=True).wait_for()
 page.wait_for_function("document.querySelectorAll('#app .player-face img').length===0")
 # Removing applies to the catalogue and UML, including subsequent navigation.
 page.get_by_role('button',name='Cambiar foto',exact=True).click();page.locator('#player-photo-url').fill('')
 page.get_by_role('button',name='Guardar foto',exact=True).click();page.get_by_role('button',name='Agregar foto',exact=True).wait_for()
 assert page.evaluate('player.photo_url') is None
 page.evaluate("U.S.user=null;U.S.profile=null;U.route()")
 page.get_by_text('Plantel UML',exact=True).wait_for()
 assert page.locator('[data-player-photo]').count()==0
 assert not errors,errors
 browser.close()
server.shutdown()
print('PASS: admin URL preview/save/remove, UUID/PES identity, shared photos in team/stats/match/formation/auction/Option File, mobile layout, 403/image preview validation, stale-request protection, broken-image fallback, unsafe URL rejection, failed-save retention and public read-only UI; no production connections.')
