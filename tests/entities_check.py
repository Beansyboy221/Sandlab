"""Catalog, guide gestures, mode controls and persistence on desktop and touch."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, mimetypes
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    prefix='http://sandlab.test/'
    if not route.request.url.startswith(prefix):route.abort();return
    path=ROOT/(route.request.url[len(prefix):].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def point(page,x,y):
    return page.evaluate('''p=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),v=r.project(p.x+.5,p.y+.5),d=r.canvas.width/b.width;return{x:b.x+v.x/d,y:b.y+v.y/d};}''',{'x':x,'y':y})
def open_palette(page,mobile):
    if mobile and not page.locator('#palette').evaluate("e=>e.classList.contains('open')"):page.locator('#palette-toggle').click()
def controls(page,mobile,opened):
    if mobile and (page.locator('#controls-toggle').get_attribute('aria-expanded')=='true')!=opened:page.locator('#controls-toggle').click()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    results=[]
    for width,height,mobile in [(1440,900,False),(390,844,True),(844,390,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=mobile,is_mobile=mobile,device_scale_factor=3 if mobile else 1)
        context.route('**/*',serve);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab')
        if not page.evaluate('sandlab.state.paused'):page.locator('#play-btn').click()
        page.evaluate("async()=>{window.M=(await import('./src/sim/materials.js')).M;sandlab.world.clear();}")
        open_palette(page,mobile)
        assert page.locator('#catalog-total').inner_text()=='71'
        assert page.locator('#materials .material').count()==71
        names=set(page.locator('.material-name').all_text_contents())
        assert {'Fuel','Metal Dust','Sawdust','Glue','Cloud'}<=names
        assert not {'Kerosene','Steel Powder','Wood Chips','Storm','Liquid Glue'}&names
        assert not set(page.locator('.material-name').all_text_contents()) & {'Player','Cat','Drone','Battery'}
        page.locator('#entities-tab').click()
        assert page.locator('#entities-tab').get_attribute('aria-selected')=='true'
        assert page.locator('#materials').get_attribute('aria-labelledby')=='entities-tab'
        assert page.locator('#catalog-title').inner_text()=='Entities'
        assert page.locator('#materials .material').count()==23
        assert not set(page.locator('.material-name').all_text_contents()) & {'Sand','Water','Wood','Rope'}
        page.locator('[data-group=missiles]').click()
        assert set(page.locator('.material-name').all_text_contents())=={'Seeking Missile','Guided Missile','Missile'}
        page.locator('#search').fill('guided');assert page.locator('.material-name').all_text_contents()==['Guided Missile']
        page.locator('#materials').get_by_role('button',name='Guided Missile',exact=True).click()
        assert page.evaluate('sandlab.state.material===M["Guided Missile"]&&sandlab.state.tool==="paint"')
        if mobile:assert not page.locator('#palette').evaluate("e=>e.classList.contains('open')")
        target=point(page,35,35)
        if mobile:page.touchscreen.tap(**target)
        else:page.mouse.click(**target)
        assert page.evaluate('sandlab.world.missiles.items.length')==1
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=guide]').click()
        assert not page.locator('#palette-toggle').is_visible()
        assert page.locator('#tool-picker-toggle').get_attribute('aria-label')=='Tool: Guide'
        controls(page,mobile,False)
        page.evaluate('sandlab.world.set(65*sandlab.world.width+70,M.Sand);window.original=JSON.stringify(sandlab.snapshot())')
        target=point(page,70,65)
        if mobile:page.touchscreen.tap(**target)
        else:page.mouse.click(**target)
        assert page.evaluate('Math.floor(sandlab.world.missiles.guidance.cursor.x)')==70
        assert page.evaluate('JSON.stringify(sandlab.snapshot())===original')
        assert page.evaluate('sandlab.state.tool')=='guide'
        page.evaluate('sandlab.world.missiles.step()')
        assert page.evaluate('sandlab.world.missiles.items[0].targetKind')=='cursor'
        # Reading a creature/device uses the Entities catalog; the guide never copies.
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=paint]').click();open_palette(page,mobile)
        page.locator('#materials-tab').click();assert page.locator('#search').input_value()==''
        assert not page.locator('[data-group=missiles]').count()
        page.locator('#materials-tab').focus();page.keyboard.press('ArrowRight')
        assert page.locator('#entities-tab').evaluate('e=>e===document.activeElement')
        page.keyboard.press('Home');assert page.locator('#materials-tab').get_attribute('aria-selected')=='true'
        if mobile:page.locator('#palette-close').click()
        if mobile and page.locator('#mobile-exit-focus').is_visible():page.locator('#mobile-exit-focus').click()
        controls(page,mobile,True)
        page.locator('#new-canvas-btn').click();page.locator('#level-name').fill('Orbital Lab')
        assert page.locator('#level-canvasMode option').count()==6
        page.locator('#level-canvasMode').select_option('planet')
        page.locator('#level-modeStrength').evaluate("e=>{e.value=150;e.dispatchEvent(new Event('input',{bubbles:true}));}")
        assert page.locator('#level-modeStrength-value').inner_text()=='150%'
        page.locator('#level-submit').click()
        assert page.evaluate('sandlab.world.canvasMode')=='planet'
        assert page.evaluate('sandlab.world.modeStrength')==1.5
        page.evaluate('''()=>{const w=sandlab.world;w.set(30*w.width+30,M.Sand);w.step();window.before=JSON.stringify(sandlab.snapshot());}''')
        page.locator('#level-properties-btn').click()
        assert page.locator('#level-canvasMode').input_value()=='planet'
        assert page.locator('#level-modeStrength-value').inner_text()=='150%'
        page.locator('#level-canvasMode').select_option('zero');page.locator('#level-submit').click()
        assert page.evaluate('sandlab.world.canvasMode')=='zero'
        page.locator('#undo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())===before'), page.evaluate('''()=>{const a=JSON.parse(before),b=sandlab.snapshot();return Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>[k,k==='arrays'?Object.keys(a.arrays).filter(n=>JSON.stringify(a.arrays[n])!==JSON.stringify(b.arrays[n])):k==='atmosphere'?Object.keys(a.atmosphere).filter(n=>JSON.stringify(a.atmosphere[n])!==JSON.stringify(b.atmosphere[n])):[a[k],b[k]]]);}''')
        page.locator('#redo-btn').click();assert page.evaluate('sandlab.world.canvasMode')=='zero'
        exact=page.evaluate('''async()=>{const p=await import('./src/persistence.js');const s=p.snapshot(sandlab.world);p.restore(sandlab.world,p.unpack(p.pack(s)));return JSON.stringify(p.snapshot(sandlab.world))===JSON.stringify(s)}''')
        assert exact
        page.locator('#settings-btn').click();page.locator('#settings-tab-devices').click()
        assert page.locator('#setting-laserGuidance').is_checked()
        page.locator('#setting-laserGuidance').uncheck();assert not page.evaluate('sandlab.world.mechanics.laserGuidance')
        page.locator('#settings-tab-performance').click();assert page.locator('#setting-fragmentParticles').is_checked()
        page.locator('#setting-fragmentParticles').uncheck();assert not page.evaluate('sandlab.world.mechanics.fragmentParticles')
        page.locator('#settings-dialog .dialog-close').click()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        page.screenshot(path=str(ARTIFACTS/f'entities-{width}x{height}.png'))
        results.append({'viewport':f'{width}x{height}','catalogs':'pass','guide':'pass','canvas_modes':'pass','history_and_save':'pass','runtime_errors':errors});context.close()
    browser.close();print(json.dumps(results))
