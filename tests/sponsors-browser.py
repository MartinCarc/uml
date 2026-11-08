"""Browser smoke test with fake Supabase; never connects to the production database."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import base64, os, shutil
ROOT=Path(__file__).resolve().parents[1]
fixture=r'''
const uid=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const sid=uid(1), me=uid(2), lid=uid(3), cupid=uid(4);
const clubs=Array.from({length:16},(_,i)=>({id:uid(100+i),name:'Club '+(i+1),stadium_name:'Estadio del Club '+(i+1),stadium_capacity:40000,stadium_photo_url:null}));
const teams=clubs.map((c,i)=>({id:uid(200+i),season_id:sid,club_id:c.id,tier:i<8?1:2,manager_id:i===0?me:null,budget:260000000,sponsor_id:null}));
const comps=[{id:lid,season_id:sid,kind:'league',tier:1,name:'Premier',status:'draft',format:{},points_win:3,points_draw:1},{id:cupid,season_id:sid,kind:'cup',tier:1,name:'UML Cup',status:'active',format:{groups:true,neutral_capacity:40000},points_win:3,points_draw:1}];
const cteams=clubs.flatMap((c,i)=>[{competition_id:cupid,club_id:c.id,group_name:'ABCD'[Math.floor(i/4)]},...(i<8?[{competition_id:lid,club_id:c.id}]:[])]);
const matches=Array.from({length:4},(_,i)=>({id:uid(300+i),competition_id:cupid,round:1,stage:'group',home_club_id:clubs[i*4].id,away_club_id:clubs[i*4+1].id,status:'pending'}));
const season={id:sid,name:'Temporada de prueba',status:'draft',mode:'two',market_open:true,config:{}};
const sponsors='ABCD'.split('').map((code,i)=>({id:uid(400+i),code,name:'Marca '+code,image_url:location.origin+'/assets/logo.png',payment_tier1:100000000+i*1000000,payment_tier2:80000000,enabled:true}));
const data={seasons:[season],clubs,season_teams:teams,competitions:comps,competition_teams:cteams,matches,players:[],match_events:[],active_sanctions:[],offers:[],transfer_queue:[],profiles:[{id:me,username:'DT de prueba',is_admin:false}],transactions:[],sponsors,team_sponsor_contracts:[]};
window.calls=[];window.uploads=[];
class Query {
 constructor(table){this.table=table;this.filters=[];this.one=false;this.patch=null;}
 select(){return this} order(){return this} limit(){return this} or(){return this}
 eq(k,v){this.filters.push([k,v]);return this} in(){return this}
 update(p){this.patch=p;return this} single(){this.one=true;return this} maybeSingle(){this.one=true;return this}
 then(resolve,reject){let rows=(data[this.table]||[]).filter(r=>this.filters.every(([k,v])=>k.includes('.')||r[k]===v));if(this.patch)rows.forEach(r=>Object.assign(r,this.patch));return Promise.resolve({data:this.one?(rows[0]||null):rows,error:null}).then(resolve,reject)}
}
U.setClient({from:t=>new Query(t),rpc:async(fn,args)=>{
 calls.push({fn,args});let result=null;
 if(fn==='choose_sponsor'){
  data.team_sponsor_contracts=data.team_sponsor_contracts.filter(r=>r.club_id!==args.p_club);
  if(args.p_code){const sp=sponsors.find(s=>s.code===args.p_code);const team=teams.find(t=>t.club_id===args.p_club);data.team_sponsor_contracts.push({id:uid(500),season_id:sid,club_id:team.club_id,sponsor_id:sp.id,code:sp.code,tier:team.tier,name:sp.name,image_url:sp.image_url,amount:team.tier===1?sp.payment_tier1:sp.payment_tier2,rules:{},paid_at:null,settled_at:null});}
 }
 if(fn==='cup_group_table')result=cteams.filter(t=>t.competition_id===cupid).map((t,i)=>({club_id:t.club_id,group_name:t.group_name,pos:i%4+1,pj:0,gf:0,gc:0,pts:0}));
 if(fn==='sponsor_assessment')result={primary_met:null,cup_met:null,league_goals:0,league_position:1,group_wins:0};
 return {data:result,error:null};
},storage:{from:()=>({upload:async(path,file,opts)=>{uploads.push({path,type:file.type,size:file.size});return {data:{path},error:null}},getPublicUrl:()=>({data:{publicUrl:location.origin+'/assets/logo.png'}})})}});
Object.assign(U.S,{sid,season,user:{id:me},profile:data.profiles[0],myClub:clubs[0].id,clubs,seasonTeams:teams,compTeams:cteams,competitions:comps,matches,players:[],events:[],sanctions:[],offers:[],queue:[],profiles:data.profiles});
window.addEventListener('hashchange',U.route);U.route();
'''
with TemporaryDirectory() as output:
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
 Thread(target=server.serve_forever,daemon=True).start()
 with sync_playwright() as p:
  launch={'headless':True,'args':['--no-sandbox']}
  executable=os.environ.get('UML_CHROMIUM') or shutil.which('chromium')
  if executable: launch['executable_path']=executable
  browser=p.chromium.launch(**launch)
  page=browser.new_page(viewport={'width':1280,'height':1000});page.set_default_timeout(15000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda r:r.abort())
  page.route('**/js/app.js',lambda r:r.fulfill(body=fixture,content_type='application/javascript'))
  page.goto(f'http://127.0.0.1:{server.server_port}/#/s/10000000-0000-0000-0000-000000000001/equipo/10000000-0000-0000-0000-000000000100')
  page.get_by_text('Sin sponsor seleccionado.',exact=True).wait_for()
  assert page.get_by_text('Estadio del Club 1',exact=True).count()>=1
  page.locator('select[onchange^="A.chooseSponsor"]').select_option('A')
  page.get_by_text('Marca A',exact=False).first.wait_for()
  assert '15 goles' in page.locator('#app').text_content()
  assert '100 M' in page.locator('#app').text_content()
  assert page.get_by_text('En juego',exact=False).count()>0
  assert page.get_by_role('button',name='Editar estadio').count()==0
  # A second DT can view but cannot edit another team's contract.
  page.evaluate("U.S.user={id:uid(999)};U.route()")
  assert page.locator('select[onchange^="A.chooseSponsor"]').count()==0
  # Admin stadium upload and persisted team card.
  page.evaluate("U.S.profile.is_admin=true;U.route()")
  page.get_by_role('button',name='Editar estadio').click()
  image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=')
  page.locator('#modal input[name=stadium_file]').set_input_files({'name':'estadio.png','mimeType':'image/png','buffer':image})
  page.locator('#modal button[type=submit]').click()
  page.locator('.stadium-photo').wait_for()
  assert page.evaluate("uploads[0].path.startsWith('stadiums/')")
  assert page.locator('.stadium-photo').get_attribute('src').endswith('/assets/logo.png')
  # Staff catalogue upload and payments per division.
  page.evaluate("location.hash='#/s/'+sid+'/admin'")
  page.get_by_role('button',name='Sponsors',exact=True).click()
  form=page.locator('form[onsubmit^="A.saveSponsor"]').first
  form.locator('[name=name]').fill('Marca personalizada')
  form.locator('[name=payment_tier1]').fill('125000000')
  form.locator('[name=image_file]').set_input_files({'name':'sponsor.png','mimeType':'image/png','buffer':image})
  form.locator('button[type=submit]').click()
  page.wait_for_function("data.sponsors[0].name==='Marca personalizada'")
  assert page.evaluate("uploads.at(-1).path.startsWith('sponsors/')")
  assert page.evaluate('data.sponsors[0].payment_tier1')==125000000
  # Mobile does not overflow.
  page.evaluate("location.hash='#/s/'+sid+'/equipo/'+clubs[0].id")
  page.locator('.stadium-photo').wait_for()
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  # Snapshot image for human visual review.
  page.evaluate('scrollTo(0,0)');page.screenshot(path='/tmp/uml-sponsors-mobile.png',full_page=True)
  page.set_viewport_size({'width':1280,'height':1000});page.evaluate('scrollTo(0,0)');page.screenshot(path='/tmp/uml-sponsors-desktop.png',full_page=True)
  # Contract controls disappear once the season starts.
  page.evaluate("season.status='active';U.route()")
  assert page.locator('select[onchange^="A.chooseSponsor"]').count()==0
  # Cup view exposes all four group tables. Group results have no penalties.
  page.evaluate("location.hash='#/s/'+sid+'/fixture/'+cupid")
  page.get_by_role('heading',name='Grupo A',exact=True).wait_for()
  assert page.get_by_role('heading',name='Grupo D',exact=True).count()==1
  page.evaluate('A.resultModal(matches[0].id)')
  assert page.locator('#modal input[name=home_pens]').count()==0
  page.evaluate("U.closeModal();matches[0].stage='qf';matches[0].neutral=true;A.resultModal(matches[0].id)")
  assert page.locator('#modal input[name=home_pens]').count()==1
  assert not errors,errors
  print('PASS: DT choice and permissions, sponsor/stadium cards, admin image uploads and catalogue values, mobile layout, active contract locked, four Cup groups, penalties only for knockout; no JavaScript errors.')
  browser.close()
 server.shutdown()
