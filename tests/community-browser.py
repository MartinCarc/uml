"""Community UI integration; fixture-only Supabase. SQL behavior is in community.mjs."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import ast,shutil
ROOT=Path(__file__).resolve().parents[1]
m=ast.parse((ROOT/'tests/player-photos-browser.py').read_text())
fixture=next(ast.literal_eval(n.value) for n in m.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fixture' for t in n.targets))
extra=r'''
player.archived=false;player.retired=false;
for(let i=1;i<16;i++){const c={id:uid(100+i),name:'Equipo '+i};clubs.push(c);}
const allTeams=[team,...clubs.slice(2).map((c,i)=>({season_id:sid,club_id:c.id,manager_id:uid(300+i),tier:i<7?1:2,budget:100000000,reserved:0}))];
allTeams.push({season_id:sid,club_id:clubs[1].id,manager_id:uid(399),tier:2,budget:100000000,reserved:0});tables.season_teams=allTeams;U.S.seasonTeams=allTeams;
tables.profiles=[{id:me,username:'Admin local',is_admin:true},...allTeams.slice(1).map((t,i)=>({id:t.manager_id,username:'DT '+i}))];U.S.profiles=tables.profiles;
tables.competition_teams=U.S.compTeams;
tables.offers=[];tables.transfer_queue=[];tables.active_sanctions=[];
tables.edit_changes=[];
tables.app_notifications=[{id:uid(600),user_id:me,kind:'offer',title:'Tenés una oferta por responder',link:'#/s/'+sid+'/mercado',created_at:new Date().toISOString(),read_at:null}];
Query.prototype.gte=function(){return this};Query.prototype.lte=function(){return this};Query.prototype.not=function(){return this};
const C={announcements:[{id:uid(500),title:'Bienvenidos',body:'Comunicado <script>window.bad=1</script>',pinned:true,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),author_name:'Admin local'}],online:[{id:me,username:'Admin local'}],raffles:[],prizes:[],awards:[],reserves:[],turns:[{id:uid(700),competition_name:'Premier + Championship',kind:'league',stage:'league',round:1,sort_order:1,expected:8,played:0,state:'pending',matches:[]} ]};
const channel={handlers:[],on(type,event,fn){this.handlers.push(fn);return this},subscribe(fn){queueMicrotask(()=>fn('SUBSCRIBED'));return this},track(){this.handlers.forEach(f=>f());return Promise.resolve()},untrack(){return Promise.resolve()},presenceState(){return {me:[{user_id:me},{user_id:me}]}}};
U.client().channel=()=>channel;U.client().removeChannel=async()=>{};
const previousRPC=U.client().rpc;
U.client().rpc=async(fn,a)=>{calls.push({fn,args:a});let data=null;
 if(fn==='community_feed')data=C;
 else if(fn==='community_pulse')data={turns:C.turns.filter(t=>t.state!=='completed').slice(0,1)};
 else if(fn==='community_online')data=C.online;
 else if(fn==='online_ping')data=null;
 else if(fn==='announcement_save'){const row={id:a.p_id||uid(501),title:a.p_title,body:a.p_body,pinned:a.p_pinned,author_name:'Admin local',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};C.announcements=C.announcements.filter(r=>r.id!==row.id);C.announcements.unshift(row);}
 else if(fn==='announcement_delete')C.announcements=C.announcements.filter(r=>r.id!==a.p_id);
 else if(fn==='auction_candidates')data={version_id:version.id,players:[{...d,pes_id:54361,name:'Jugador disponible'}]};
 else if(fn==='squad_count')data=32;
 else if(fn==='raffle_save'){const id=a.p_id||uid(800);C.raffles=[{id,season_id:sid,name:a.p_name,status:'draft'}];C.prizes=a.p_prizes.map((p,i)=>({...p,id:uid(810+i),raffle_id:id}));data=id;}
 else if(fn==='raffle_draw'){const r=C.raffles.find(r=>r.id===a.p_id);r.status='drawn';r.drawn_at=new Date().toISOString();r.participants=allTeams;C.awards=C.prizes.map((p,i)=>({id:uid(830+i),prize_id:p.id,raffle_id:r.id,season_id:sid,club_id:allTeams[i].club_id,created_at:new Date().toISOString()}));}
 else if(fn==='prize_use'){const award=C.awards.find(r=>r.id===a.p_award);award.used_at=new Date().toISOString();award.used_player_id=a.p_player;const p=C.prizes.find(p=>p.id===award.prize_id);tables.edit_changes.push({id:uid(900),season_id:sid,player_id:pid,pes_id:54360,player_name:player.name,club_id:cid,club_name:'Fulham',actor_name:'Admin local',kind:p.kind,source:'Sorteo de prueba',before_data:{stats:player.stats,overall:76,cards:d.cards},after_data:{stats:player.stats,overall:79,cards:d.cards},details:{boost:p.config.boost},created_at:new Date().toISOString(),exported_at:null});}
 else if(fn==='edit_change_mark')tables.edit_changes.forEach(r=>r.exported_at=a.p_done?new Date().toISOString():null);
 else if(fn==='sim_turn_save'){data=uid(701);C.turns.push({id:data,kind:a.p_kind,competition_id:a.p_competition,competition_name:'UML Cup',stage:a.p_stage,round:a.p_round,state:'undefined',sort_order:2,expected:8,played:0,matches:[]});}
 else if(fn==='sim_turn_action'){if(a.p_action==='up')C.turns.reverse();if(a.p_action==='delete')C.turns=C.turns.filter(t=>t.id!==a.p_id);}
 else if(fn==='sim_publish')data=null;
 else if(fn==='notifications_read')tables.app_notifications.forEach(n=>n.read_at=new Date().toISOString());
 else return previousRPC(fn,a);
 return {data,error:null};
};
'''
fixture=fixture.replace("window.addEventListener('hashchange',U.route);U.route();",extra+"window.addEventListener('hashchange',U.route);U.route();")
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(12000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort());page.route('**/js/app.js',lambda r:r.fulfill(body=fixture,content_type='application/javascript'))
 page.goto(f'http://127.0.0.1:{server.server_port}/#/s/20000000-0000-0000-0000-000000000001')
 page.get_by_role('heading',name='Comunicados oficiales').wait_for();assert page.locator('#home-online .list-item').count()==1
 assert page.evaluate('window.bad===undefined')
 assert 'Premier + Championship' in page.locator('#home-tools').inner_text()
 assert page.get_by_role('heading',name='Últimos resultados',exact=True).count()==1
 page.screenshot(path='/workspace/scratch/community-home-desktop.png',full_page=True)
 page.get_by_role('button',name='Nuevo comunicado',exact=True).click();page.locator('#news-form [name=title]').fill('Novedad');page.locator('#news-form [name=body]').fill('Mensaje oficial');page.get_by_role('button',name='Guardar comunicado').click();page.get_by_role('heading',name='Novedad',exact=True).wait_for()
 page.locator('#nav').get_by_role('link',name='Sorteos',exact=True).click();page.get_by_role('button',name='Nuevo sorteo').click();page.locator('#raffle-name').fill('Sorteo de prueba')
 # Two independent gyms, fixed/choice cards, player value and money in one draw.
 for i,kind in enumerate(['gym','gym','card','card','player','money']):
  page.get_by_role('button',name='Agregar premio',exact=True).click();page.locator(f'[data-prize-kind="{i}"]').select_option(kind)
  row=page.locator(f'[data-prize-index="{i}"]')
  if kind=='gym':row.locator('[name=age]').fill('35' if i==0 else '25');row.locator('[name=boost]').fill('3' if i==0 else '2')
  if kind=='card':row.locator('[name=mode]').select_option('fixed' if i==2 else 'choice')
  if kind=='player':row.get_by_role('button',name='Elegir del Option File').click();page.locator('[data-raffle-pick="54361"]').click();page.locator(f'[data-prize-index="{i}"] [name=value]').fill('45000000')
  if kind=='money':row.locator('[name=amount]').fill('5000000')
 page.get_by_role('button',name='Guardar sorteo',exact=True).click();page.get_by_role('heading',name='Sorteo de prueba').wait_for()
 configs=page.evaluate("calls.find(c=>c.fn==='raffle_save').args.p_prizes")
 assert configs[0]['config']=={'max_age':35,'boost':3};assert configs[1]['config']=={'max_age':25,'boost':2};assert configs[3]['config']['mode']=='choice';assert configs[4]['config']['value']==45000000
 page.get_by_role('button',name='Revisar y sortear').click();page.get_by_text('Los jugadores esperan en reserva',exact=False).wait_for();page.get_by_role('button',name='Ejecutar sorteo',exact=True).click();page.get_by_text('Realizado ·',exact=False).wait_for()
 page.get_by_role('link',name='Mis premios',exact=True).click();page.get_by_role('button',name='Usar premio').click();page.locator('#prize-use-form [name=player]').select_option('20000000-0000-0000-0000-000000000004');page.get_by_role('button',name='Aplicar premio').click();page.get_by_text('Utilizado:',exact=False).wait_for()
 page.evaluate("location.hash='#/s/'+sid+'/registro-edit'");page.get_by_text('Gimnasio +3',exact=True).first.wait_for();page.locator('[data-edit-id]').check();page.get_by_role('button',name='Marcar seleccionados como trasladados').click();page.wait_for_timeout(150)
 page.locator('#edit-filters [name=state]').select_option('all');page.get_by_role('button',name='Filtrar',exact=True).click();page.get_by_text('Trasladado ·',exact=False).wait_for()
 with page.expect_download() as download:page.get_by_role('button',name='Exportar detalle CSV',exact=True).click()
 assert download.value.suggested_filename=='cambios-edit.csv'
 page.locator('#nav').get_by_role('link',name='Calendario',exact=True).click();page.get_by_text('Premier + Championship · Fecha 1',exact=False).first.wait_for()
 page.get_by_role('button',name='Agregar turno',exact=True).click();page.get_by_role('button',name='Guardar turno',exact=True).click();page.get_by_role('button',name='Publicar / avisar próximo turno').click()
 assert page.evaluate("calls.some(c=>c.fn==='sim_publish')")
 # Public views keep results but cannot configure or use benefits.
 page.evaluate("U.S.user=null;U.S.profile=null;location.hash='#/s/'+sid+'/sorteos'");page.get_by_role('heading',name='Sorteo de prueba').wait_for();assert page.get_by_role('button',name='Nuevo sorteo').count()==0
 for width in [390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000});page.evaluate("location.hash='#/s/'+sid");page.get_by_role('heading',name='Comunicados oficiales').wait_for();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 page.screenshot(path='/workspace/scratch/community-home-final.png',full_page=True)
 assert not errors,errors
 browser.close()
server.shutdown()
print('PASS: Home panels/no duplicate results/XSS escaping, online tab dedup, announcement editor, six independent mixed prizes, OF picker/value, draw review, DT inventory/use, private EDIT filters/mark/CSV, calendar controls, public permissions, desktop/mobile. Fixture RPCs only; financial/permissions logic tested separately with PostgreSQL.')
