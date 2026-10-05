"""Real creature drawing, flock controls, new world, inspection and saves on desktop/mobile."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests/artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    path=ROOT/(route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        context=browser.new_context(viewport=dict(width=width,height=height),has_touch=touch,is_mobile=touch,device_scale_factor=2)
        context.route('http://sandlab.test/**',serve);page=context.new_page();errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://sandlab.test/');page.wait_for_function('()=> (!!window.sandlab)')
        page.evaluate('sandlab.settings.set("autosave",false);sandlab.state.paused=true;sandlab.world.clear();sandlab.renderer.resetView()')
        if touch:page.locator('#palette-toggle').click()
        page.locator('#entities-tab').click()
        page.get_by_role('button',name='Bird',exact=True).click()
        positions=page.evaluate('''()=>{const {world:w,renderer:r}=sandlab;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width;
          return [[-14,0],[0,-10],[14,0]].map(([dx,dy])=>{const q=r.project(w.width*.5+dx,w.height*.4+dy);return {x:b.x+q.x/d,y:b.y+q.y/d};});}''')
        for point in positions:
            if touch:page.touchscreen.tap(**point)
            else:page.mouse.click(**point)
        assert page.evaluate('sandlab.world.stickmen.bodies.length')==3
        page.evaluate('sandlab.state.paused=false')
        page.wait_for_function('()=> (sandlab.world.stickmen.bodies.every(a=>a.behavior==="Flocking"&&a.flockSize===3))')
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#level-properties-btn').click();page.locator('.world-setting-group').filter(has=page.get_by_text('Wildlife',exact=True)).evaluate('e=>e.open=true')
        assert page.locator('#world-setting-flocking').is_checked()
        page.locator('#world-setting-flocking').uncheck()
        assert page.locator('#world-setting-flockRange').is_disabled()
        assert page.locator('#world-setting-flockMinimum').is_disabled()
        page.locator('#level-submit').click()
        page.wait_for_function('()=> (sandlab.world.stickmen.bodies.every(a=>a.flockSize===0))')
        page.locator('#level-properties-btn').click();page.locator('.world-setting-group').filter(has=page.get_by_text('Wildlife',exact=True)).evaluate('e=>e.open=true')
        page.locator('#world-setting-flocking').check()
        page.locator('#world-setting-flockMinimum').evaluate('e=>{e.value=4;e.dispatchEvent(new Event("input",{bubbles:true}));}')
        assert page.evaluate('sandlab.levelEditor.rules.settings.get("flockMinimum")')==4
        page.locator('#world-setting-flockMinimum').evaluate('e=>{e.value=3;e.dispatchEvent(new Event("input",{bubbles:true}));}')
        page.locator('#world-setting-flockRange').evaluate('e=>{e.value=48;e.dispatchEvent(new Event("input",{bubbles:true}));}')
        assert page.evaluate('sandlab.levelEditor.rules.settings.get("flockRange")')==48
        page.locator('#level-submit').click()
        assert page.evaluate('sandlab.world.mechanics.flockRange')==48
        page.locator('#new-canvas-btn').click();page.locator('#level-starter').select_option('flocks');page.locator('#level-submit').click()
        page.evaluate('sandlab.state.paused=false')
        page.wait_for_function('()=> (sandlab.world.stickmen.bodies.length===6&&sandlab.world.stickmen.bodies.every(a=>a.flockSize===3))',timeout=10000)
        page.evaluate('sandlab.state.paused=true')
        assert page.evaluate('sandlab.world.name')=='Flocks and schools'
        inspection=page.evaluate('''async()=>{const {cellProperties}=await import('./src/inspector.js');return sandlab.world.stickmen.bodies.map(a=>cellProperties(sandlab.world,{x:a.x[0],y:a.y[0]}).rows);}''')
        assert all(any(label=='Group' and value=='3 creatures' for label,value in rows) for rows in inspection)
        saved=page.evaluate('sandlab.snapshot().stickmen');page.evaluate('()=>{const data=sandlab.snapshot();sandlab.world.clear();sandlab.restore(data);}')
        assert page.evaluate('sandlab.snapshot().stickmen')==saved
        page.evaluate('sandlab.state.paused=false');page.wait_for_function('()=> (sandlab.world.stickmen.bodies.every(a=>a.flockSize===3))')
        page.wait_for_timeout(800);page.screenshot(path=str(ARTIFACTS/f'flocking-{width}x{height}.png'))
        # A new world uses its own defaults, independent of the prior world's rules.
        page.reload();page.wait_for_function('()=> (!!window.sandlab)')
        assert page.evaluate('sandlab.world.mechanics.flockRange')==40
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'Bird drawing, flocking/schooling, settings, inspection, saves and layout passed: {width}x{height}',flush=True)
        context.close()
    browser.close()
