"""Material family palette, fracture inspection, legacy saves and touch drawing."""
from pathlib import Path
import mimetypes, json
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]

def serve(route):
    prefix = 'http://sandlab.test/'
    if not route.request.url.startswith(prefix):
        route.abort(); return
    path = ROOT / (route.request.url[len(prefix):].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)

def point(page, x, y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return{x:b.x+p.x/d,y:b.y+p.y/d}}''', [x,y])

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    results = []
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        c=browser.new_context(viewport=dict(width=width,height=height),is_mobile=touch,has_touch=touch,device_scale_factor=2)
        c.route('**/*',serve); page=c.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/'); page.wait_for_function('!!window.sandlab')
        page.evaluate('''async()=>{window.M=(await import('./src/sim/materials.js')).M;sandlab.settings.set('autosave',false);sandlab.state.paused=true;sandlab.world.clear();sandlab.state.setRadius(1)}''')
        if touch:page.locator('#palette-toggle').tap()
        page.locator('#materials-tab').click();page.locator('[data-group=all]').click()
        names=page.locator('.material-name').all_text_contents()
        assert len(names)==66,names
        for removed in ['Rubble','Metal Dust','Rust','Sawdust','Glass Shards']:
            assert removed not in names,removed
        page.locator('#search').fill('Metal Dust')
        assert page.locator('.material-name').all_text_contents()==['Steel']
        page.get_by_role('button',name='Steel',exact=True).click()
        target=point(page,30,30)
        if touch:page.touchscreen.tap(**target)
        else:page.mouse.click(**target)
        assert page.evaluate('sandlab.world.cells[30*sandlab.world.width+30]===M.Steel')
        page.evaluate("""async()=>{const {fracture}=await import('./src/sim/body-collisions.js');const {fractureWork}=await import('./src/sim/fracture-energy.js');const w=sandlab.world,i=40*w.width+40;w.set(i,M.Steel);w.oxidationLevel[i]=128;w.pigment[i]=0xffccaa77;fracture(w.rigid,i,fractureWork(w,i)*1.1);sandlab.renderer.draw();}""")
        assert page.evaluate('sandlab.world.cells[40*sandlab.world.width+40]===M["Metal Dust"]')
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=inspect]').click()
        if touch:assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='false'
        target=point(page,40,40)
        if touch:page.touchscreen.tap(**target)
        else:page.mouse.move(**target)
        page.wait_for_function('() => document.querySelector("#inspection-card h3").textContent==="Metal Dust"')
        details=page.locator('#inspection-card dl').inner_text()
        assert 'Base Material' in details and 'Steel' in details and 'fragment' in details and '50%' in details,details
        page.evaluate("""async()=>{const {restore,snapshot}=await import('./src/persistence.js');const w=sandlab.world,data=snapshot(w);data.arrays.cells[20*w.width+20]=95;restore(w,data);if(w.cells[20*w.width+20]!==M['Stone Gravel'])throw Error('Legacy Rubble failed');sandlab.renderer.draw();}""")
        assert not errors,errors
        results.append(dict(viewport=f'{width}x{height}',families='pass',fracture_inspection='pass',legacy_rubble='pass',runtime_errors=errors))
        c.close()
    browser.close();print(json.dumps(results))
