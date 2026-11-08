"""Formation responsibilities/notes with a simulated Supabase client."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import ast,os,shutil
ROOT=Path(__file__).resolve().parents[1]
module=ast.parse((ROOT/'tests/sponsors-browser.py').read_text())
fixture=next(ast.literal_eval(n.value) for n in module.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fixture' for t in n.targets))
extra="""
data.players=Array.from({length:4},(_,i)=>({id:uid(700+i),name:['Arquero de prueba','Delantero de prueba','Suplente de prueba','Otro jugador'][i],position:i===0?'ARQ':'DC',club_id:clubs[0].id,age:22}));U.S.players=data.players;
teams[0].tactics={lineup:[{player_id:uid(700),position:'ARQ',x:50,y:86},{player_id:uid(701),position:'DC',x:50,y:20}],bench:[uid(702)]};clubs[0].color='#ffffff';clubs[0].secondary_color='#000000';
"""
fixture=fixture.replace("window.addEventListener('hashchange',U.route);U.route();",extra+"window.addEventListener('hashchange',U.route);U.route();")
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']};exe=os.environ.get('UML_CHROMIUM') or shutil.which('chromium')
 if exe:launch['executable_path']=exe
 b=p.chromium.launch(**launch);page=b.new_page(viewport={'width':1280,'height':1000});page.set_default_timeout(10000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort());page.route('**/js/app.js',lambda r:r.fulfill(body=fixture,content_type='application/javascript'))
 page.goto(f'http://127.0.0.1:{server.server_port}/#/s/10000000-0000-0000-0000-000000000001/pizarra/10000000-0000-0000-0000-000000000100')
 page.get_by_role('heading',name='Formación',exact=True).wait_for()
 assert page.locator('[data-role]').count()==5
 assert page.locator('#tactics-role-captain option').count()==3
 assert page.locator('#tactics-role-captain option[value="10000000-0000-0000-0000-000000000702"]').count()==0
 page.locator('#tactics-role-captain').select_option('10000000-0000-0000-0000-000000000700')
 page.locator('#tactics-role-penalties').select_option('10000000-0000-0000-0000-000000000701')
 page.locator('#tactics-role-free_kicks').select_option('10000000-0000-0000-0000-000000000701')
 notes='Minuto 60: si vamos perdiendo, ingresar al suplente.\n<img src=x onerror="window.injected=true">'
 page.locator('#tactics-instructions').fill(notes)
 assert page.locator('#tactics-instructions').get_attribute('maxlength')=='4000'
 # Rerendering the lineup does not lose the text or chosen roles.
 page.locator('#tactics-player').select_option('10000000-0000-0000-0000-000000000703')
 page.locator('#tactics-add button').click()
 assert page.locator('#tactics-instructions').input_value()==notes
 assert page.locator('#tactics-role-captain').input_value()=='10000000-0000-0000-0000-000000000700'
 page.locator('#tactics-save-instructions').click()
 page.wait_for_function("document.querySelector('#tactics-status').textContent.includes('publicada')")
 args=page.evaluate('calls.at(-1).args')
 assert args['p_instructions']==notes and args['p_roles']['captain'].endswith('700')
 assert args['p_roles']['penalties']==args['p_roles']['free_kicks']
 assert len(args['p_lineup'])==3 and len(args['p_bench'])==1
 page.evaluate('U.route()')
 assert page.locator('#tactics-instructions').input_value()==notes
 assert page.locator('#tactics-role-penalties').input_value().endswith('701')
 # Removing the captain clears that responsibility, without touching the notes.
 page.locator('[data-remove="0"]').click()
 assert page.locator('#tactics-role-captain').input_value()==''
 assert page.locator('#tactics-instructions').input_value()==notes
 # A failed save leaves the user's edits intact and re-enables both save buttons.
 page.evaluate("window.oldRpc=U.client().rpc;U.client().rpc=async()=>({data:null,error:{message:'Error de prueba'}})")
 page.locator('#tactics-save-instructions').click()
 page.wait_for_function("document.querySelector('#tactics-status').textContent.includes('No se pudo')")
 assert page.locator('#tactics-instructions').input_value()==notes
 assert page.locator('#tactics-save').is_enabled() and page.locator('#tactics-save-instructions').is_enabled()
 page.evaluate('U.client().rpc=window.oldRpc')
 page.locator('#tactics-save').click()
 page.wait_for_function("document.querySelector('#tactics-status').textContent.includes('publicada')")
 # Simulator view, escaped text and mobile layout.
 page.evaluate("U.S.user={id:uid(999)};U.route()")
 assert page.locator('[data-role]').count()==0
 assert page.locator('#tactics-instructions').count()==0
 assert page.locator('.tactics-instructions').text_content()==notes
 assert page.locator('.tactics-instructions img').count()==0
 assert not page.evaluate('!!window.injected')
 assert 'Delantero de prueba' in page.locator('#tactics-responsibilities').text_content()
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('PASS: starting-player selectors, shared duties, notes/roles persist through edits and reload, captain cleanup, atomic payload with bench, failed-save retention, read-only simulator, literal HTML text, mobile layout; no JS errors.')
 b.close()
server.shutdown()
