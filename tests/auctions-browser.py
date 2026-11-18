"""UI integration with fixture RPCs; SQL/payment behavior is tested in auctions.mjs."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import shutil,os
ROOT=Path(__file__).resolve().parents[1]
fixture=r'''
const uid=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const sid=uid(1),me=uid(2),dt=uid(3),cid=uid(4),aid=uid(5);
const clubs=[{id:cid,name:'Fulham'}],teams=[{club_id:cid,manager_id:dt,budget:100000000,reserved:0,count:0,limit:32}];
const season={id:sid,name:'Prueba local',status:'active',market_open:false,config:{squad_limit:32}};
const p={pes_id:54360,name:'Bernd Leno',edit_team:'FULHAM',position:'ARQ',positions:['ARQ'],overall:76,age:33,height:189,weight:83,foot:'R',nationality:'Germany',abilities:Object.fromEntries(Object.keys(PES13.ABILITIES).map(k=>[k,76])),cards:{playing_styles:[],special_skills:['S26']}};
let auctions=[],bids=[],events=[],ready=true;window.calls=[];
class Query {constructor(t){this.t=t;}select(){return this}eq(){return this}order(){return this}in(){return this}then(ok,no){return Promise.resolve({data:this.t==='seasons'?[season]:this.t==='season_teams'?teams:this.t==='clubs'?clubs:[],error:null}).then(ok,no)}}
U.setClient({from:t=>new Query(t),rpc:async(fn,a)=>{calls.push({fn,args:a});let data=null;
 if(fn==='auction_feed')data={server_now:new Date().toISOString(),automatic_close_ready:ready,auctions:a.p_auction?auctions.filter(x=>x.id===a.p_auction):auctions,bids,events,teams};
 if(fn==='of_facets')data={teams:['FULHAM']};
 if(fn==='auction_candidates')data={version_id:uid(10),players:[p,{...p,pes_id:1,name:'No disponible',unavailable:'Ya pertenece a UML'}]};
 if(fn==='auction_save'){data=aid;auctions=[{id:aid,season_id:sid,pes_id:p.pes_id,player_snapshot:p,initial_amount:a.p_initial,min_increment:a.p_increment,starts_at:a.p_starts,ends_at:a.p_ends,status:'open',bid_count:0,created_at:new Date().toISOString()}];}
 if(fn==='auction_bid'){const lot=auctions[0];lot.top_amount=a.p_amount;lot.top_club_id=cid;lot.top_club='Fulham';lot.bid_count++;lot.ends_at=new Date(Date.now()+300000).toISOString();teams[0].reserved=a.p_amount;teams[0].count=1;bids.unshift({id:bids.length+1,club_name:'Fulham',manager_name:'DT de prueba',amount:a.p_amount,placed_at:new Date().toISOString()});events.unshift({kind:'extended',created_at:new Date().toISOString(),details:{ends_at:lot.ends_at}});data={extended:true};}
 if(fn==='auction_cancel'){auctions[0].status='cancelled';auctions[0].cancel_reason=a.p_reason;teams[0].reserved=0;}
 return {data,error:null};}});
Object.assign(U.S,{sid,season,user:{id:me},profile:{id:me,username:'Administrador',is_admin:true},myClub:null,clubs,seasonTeams:teams,compTeams:[],competitions:[],matches:[],players:[],events:[],sanctions:[],offers:[],queue:[],profiles:[]});
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
 page.goto(f'http://127.0.0.1:{server.server_port}/#/s/10000000-0000-0000-0000-000000000001/mercado')
 page.get_by_role('button',name='Subastas',exact=True).click()
 page.get_by_role('button',name='Nueva subasta').click()
 page.get_by_text('Bernd Leno',exact=True).wait_for()
 assert page.locator('[data-au-pick="1"]').is_disabled()
 page.locator('[data-au-pick="54360"]').click()
 page.locator('[name=initial]').fill('10000000');page.locator('[name=increment]').fill('1000000')
 # Explicit timezone conversion must not depend on browser timezone.
 page.locator('[name=starts]').fill('2026-11-17T20:00');page.locator('[name=ends]').fill('2099-11-17T21:00')
 page.get_by_role('button',name='Publicar subasta').click()
 page.locator('#auction-summary').wait_for()
 assert page.evaluate("calls.find(x=>x.fn==='auction_save').args.p_starts")=='2026-11-17T23:00:00.000Z'
 assert page.locator('#auction-bid-form').count()==0 # Admin cannot bid without DT assignment.
 assert page.locator('#auction-personal').inner_text().find('189')>=0
 assert page.locator('#auction-abilities .pes-rating').count()==23
 assert 'S26' in page.locator('#auction-cards').inner_text()
 page.evaluate("U.S.user={id:dt};U.S.profile={id:dt,username:'DT de prueba',is_admin:false};U.route()")
 page.locator('#auction-bid-form').wait_for()
 assert page.get_by_role('button',name='Nueva subasta').count()==0
 page.locator('#auction-bid-amount').fill('10000000');page.locator('#auction-bid-submit').click()
 page.locator('#auction-public-bids').get_by_text('DT de prueba',exact=True).wait_for()
 assert '11.000.000' in page.locator('#auction-minimum').inner_text()
 assert '5 minutos' in page.locator('#auction-events').inner_text()
 # Polling keeps typed input instead of rebuilding the form.
 page.locator('#auction-bid-amount').fill('12000000');page.wait_for_timeout(4300)
 assert page.locator('#auction-bid-amount').input_value()=='12000000'
 # Responsive detail and catalogue, public roles and completed states.
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 page.screenshot(path='/workspace/scratch/auctions-mobile.png',full_page=True)
 page.evaluate("U.S.user=null;U.S.profile=null;U.route()")
 page.get_by_text('Pujas públicas',exact=True).wait_for()
 assert page.locator('#auction-bid-form').count()==0
 assert 'DT de prueba' in page.locator('#auction-public-bids').inner_text()
 page.evaluate("auctions[0].status='awarded';auctions[0].queue_pending=true;U.route()")
 page.get_by_text('La incorporación espera la apertura del mercado; no se volverá a cobrar.',exact=False).wait_for()
 page.evaluate("auctions[0].status='open';U.S.user={id:me};U.S.profile={is_admin:true};U.route()")
 page.get_by_role('button',name='Cancelar con motivo').click();page.locator('[name=reason]').fill('Prueba de cancelación')
 page.get_by_role('button',name='Confirmar cancelación').click()
 page.get_by_text('Motivo de cancelación: Prueba de cancelación',exact=True).wait_for()
 page.evaluate("ready=false;U.route()")
 page.get_by_text('El cierre automático necesita configuración.',exact=False).wait_for()
 assert page.get_by_role('button',name='Nueva subasta').is_disabled()
 assert not errors,errors
 browser.close()
server.shutdown()
print('PASS: auction navigation, admin Option File picker/conditions, Argentina times, DT-only bid form, public bids/extensions, input preserved across polling, mobile width, paid pending state, cancellation and scheduler warning; no production connections.')
