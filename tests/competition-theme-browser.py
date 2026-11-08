"""Competition themes, contrast, navigation reset and staff logo uploads; mock data only."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import ast,base64,os,shutil
ROOT=Path(__file__).resolve().parents[1]
module=ast.parse((ROOT/'tests/sponsors-browser.py').read_text())
fixture=next(ast.literal_eval(node.value) for node in module.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fixture' for t in node.targets))
extra=r'''
comps[0].name='UML Premier';
comps.push({id:uid(6),season_id:sid,kind:'league',tier:2,name:'UML Championship',status:'draft',format:{rounds:'double'},points_win:3,points_draw:1});
comps.push({id:uid(7),season_id:sid,kind:'supercup',tier:1,name:'UML Supercup',status:'active',format:{}});
comps.push({id:uid(8),season_id:sid,kind:'promotion',tier:1,name:'UML Promociones',status:'active',format:{}});
for(const c of clubs.slice(8))cteams.push({competition_id:uid(6),club_id:c.id});
matches.push({id:uid(310),competition_id:uid(7),round:1,stage:'final',home_club_id:clubs[0].id,away_club_id:clubs[8].id,status:'pending'});
matches.push({id:uid(311),competition_id:uid(8),round:1,stage:'promotion',home_club_id:clubs[1].id,away_club_id:clubs[9].id,status:'pending'});
'''
fixture=fixture.replace("window.addEventListener('hashchange',U.route);U.route();",extra+"window.addEventListener('hashchange',U.route);U.route();")
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
output=Path('/workspace/entregas/temas-preview');output.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('UML_CHROMIUM') or shutil.which('chromium')
 if exe:launch['executable_path']=exe
 browser=p.chromium.launch(**launch)
 page=browser.new_page(viewport={'width':1200,'height':900});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort())
 page.route('**/js/app.js',lambda r:r.fulfill(body=fixture,content_type='application/javascript'))
 page.goto(f'http://127.0.0.1:{server.server_port}/#/s/10000000-0000-0000-0000-000000000001/tabla/10000000-0000-0000-0000-000000000003')
 contrast=r'''() => {
 const c=getComputedStyle(document.documentElement);
 const rgb=s=>{s=s.trim();return s.startsWith('#')?[0,2,4].map(i=>parseInt(s.slice(i+1,i+3),16)):s.match(/[\d.]+/g).slice(0,3).map(Number)};
 const lum=s=>rgb(s).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{a=lum(a);b=lum(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 return [ratio(c.getPropertyValue('--blue'),'#ffffff'),ratio(c.getPropertyValue('--text'),c.getPropertyValue('--bg')),ratio(c.getPropertyValue('--muted'),'#ffffff'),ratio(c.getPropertyValue('--competition-nav-ink'),c.getPropertyValue('--navy'))];
 }'''
 cases=[('premier','tabla',3),('championship','tabla',6),('cup','fixture',4),('supercup','fixture',7),('promotion','fixture',8)]
 for key,route,number in cases:
  page.evaluate(f"location.hash='#/s/'+sid+'/{route}/'+uid({number})")
  page.wait_for_function(f"document.documentElement.dataset.competition==='{key}'")
  page.locator('.competition-head').wait_for()
  assert all(n>=4.5 for n in page.evaluate(contrast)),(key,page.evaluate(contrast))
  assert page.locator('.competition-head h1').count()==1
  page.evaluate('scrollTo(0,0)');page.screenshot(path=str(output/f'{key}.png'))
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),key
  page.set_viewport_size({'width':1200,'height':900})
 page.evaluate("location.hash='#/s/'+sid+'/partido/'+uid(310)")
 page.wait_for_function("document.documentElement.dataset.competition==='supercup'")
 assert page.locator('.competition-match-logo').count()==1
 page.evaluate("location.hash='#/s/'+sid+'/stats'")
 page.wait_for_function('!document.documentElement.dataset.competition')
 page.evaluate('A.statsComp(cupid)')
 page.wait_for_function("document.documentElement.dataset.competition==='cup'")
 page.evaluate("A.statsComp('')")
 page.wait_for_function('!document.documentElement.dataset.competition')
 page.evaluate("location.hash='#/s/'+sid+'/mercado'")
 page.wait_for_function('!document.documentElement.dataset.competition')
 assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--navy').trim()")=='#0A2A66'
 # Admin logo upload writes the selected competition and preserves the image's own colors.
 page.evaluate("U.S.profile.is_admin=true;location.hash='#/s/'+sid+'/admin'")
 page.get_by_role('button',name='Competencias',exact=True).click()
 detail=page.locator('details').filter(has=page.locator('summary',has_text='Logo de la competencia')).first
 detail.locator('summary').click()
 image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=')
 detail.locator('[name=logo_file]').set_input_files({'name':'premier.png','mimeType':'image/png','buffer':image})
 detail.locator('[type=submit]').click()
 page.wait_for_function('!!comps[0].logo_url')
 assert page.evaluate("uploads.at(-1).path.startsWith('competitions/')")
 page.evaluate("location.hash='#/s/'+sid+'/tabla/'+lid")
 page.locator('.competition-heading img').wait_for()
 assert page.locator('.competition-heading img').get_attribute('src').endswith('/assets/logo.png')
 assert page.locator('.competition-heading img').evaluate("e=>getComputedStyle(e).objectFit")=='contain'
 # A dead logo URL falls back without a broken image.
 page.evaluate("comps[0].logo_url='/not-found-logo.png';U.route()")
 page.wait_for_function("document.querySelector('.competition-heading img').hidden")
 assert page.locator('.competition-heading .competition-placeholder').is_visible()
 assert not errors,errors
 print('PASS: all five identities, WCAG AA text/button contrast, desktop/mobile, match/stats themes, general UML reset, logo upload and full-image containment, failed-image fallback; no JS errors.')
 browser.close()
server.shutdown()
