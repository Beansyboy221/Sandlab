"""Real UI checks for grouping, electrical drawing, machines and mobile layout."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    prefix='http://sandlab.test/'
    if not route.request.url.startswith(prefix):route.abort();return
    path=ROOT/(route.request.url[len(prefix):].split('?')[0] or 'index.html')
    if path.is_file():route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:route.fulfill(status=404,body='not found')
def point(page,x,y):
    return page.evaluate('''p=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),v=r.project(p.x+.5,p.y+.5),d=r.canvas.width/b.width;return{x:b.x+v.x/d,y:b.y+v.y/d};}''',{'x':x,'y':y})
def palette(page,mobile):
    if mobile and not page.locator('#palette').evaluate("e=>e.classList.contains('open')"):
        page.locator('#palette-toggle').click()
def choose_material(page,mobile,name):
    palette(page,mobile)
    page.locator('#categories [data-group="all"]').click()
    page.locator('#search').fill(name)
    page.locator('#materials').get_by_role('button',name=name,exact=True).click()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    results=[]
    for width,height,mobile in [(1440,900,False),(390,844,True),(844,390,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=mobile,is_mobile=mobile)
        context.route('**/*',serve)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab')
        page.evaluate("async()=>{window.deviceM=(await import('./src/sim/materials.js')).M;}")
        palette(page,mobile)
        assert page.locator('.palette-heading h1').inner_text().startswith('Materials')
        assert 'Elements' not in page.locator('#palette').inner_text()
        assert not page.locator('[data-group="explosive"], [data-group="fiction"]').count()
        page.locator('[data-group="devices"]').click()
        names=page.locator('#materials .material-name').all_text_contents()
        assert set(['Drone','Rover','Battery','Wire','AND Gate','OR Gate','NOT Gate','XOR Gate','Toggle Gate','Delay Gate','Signal Lamp','Electric Fan','Heat-Seeking Missile'])==set(names)
        assert 'Heater' not in names and 'Repulsor' not in names
        page.locator('[data-group="static"]').click()
        assert {'Heater','Cooler','Fan','Clone','Void','Repulsor','Black Hole','Lamp','Wall'}<=set(page.locator('#materials .material-name').all_text_contents())
        page.locator('#groups-btn').click();page.locator('#group-name').fill('My Lab')
        for name in ['Sand','Water']:page.locator('#group-materials').get_by_role('button',name=name,exact=True).click()
        assert page.locator('#group-count').inner_text()=='2 selected'
        page.locator('#group-save').click();page.wait_for_function('() => !document.querySelector("#groups-dialog").open')
        assert page.locator('#materials .material-name').all_text_contents()==['Sand','Water']
        page.locator('#groups-btn').click();page.locator('#group-name').fill('My Powders')
        page.locator('#group-materials').get_by_role('button',name='Water',exact=True).click();page.locator('#group-save').click()
        assert page.locator('#materials .material-name').all_text_contents()==['Sand']
        page.reload();page.wait_for_function('() => !!window.sandlab');palette(page,mobile)
        page.locator('[data-group="custom-1"]').click();assert page.locator('#category-title').text_content()=='My Powders', (page.locator('#category-title').inner_text(),page.evaluate('sandlab.materialGroups.groups'),errors)
        page.locator('#groups-btn').click();page.locator('#group-delete').click()
        assert page.locator('#group-select').input_value()==''
        assert not page.locator('[data-group="custom-1"]').count()
        page.locator('#group-name').fill('<img src=x onerror=alert(1)>');page.locator('#group-save').click()
        assert page.locator('#categories img').count()==0
        assert page.locator('[data-group="custom-1"]').text_content()=='<img src=x onerror=alert(1)>'
        page.locator('#groups-btn').click();page.locator('#group-delete').click();page.locator('#groups-dialog .dialog-close').click()
        page.locator('[data-group="all"]').click()
        if mobile:page.locator('#palette-close').click()
        page.evaluate("async()=>{window.deviceM=(await import('./src/sim/materials.js')).M;sandlab.world.clear();}")
        choose_material(page,mobile,'AND Gate')
        if mobile:page.locator('#controls-toggle').click()
        assert page.locator('#device-facing-property').is_visible()
        page.locator('#device-facing').select_option('6')
        # Close expanded controls before the canvas gesture on mobile.
        if mobile:page.locator('#controls-toggle').click()
        target=point(page,50,50)
        if mobile:page.touchscreen.tap(**target)
        else:page.mouse.click(**target)
        assert page.evaluate('sandlab.world.cells[50*sandlab.world.width+50]===deviceM["AND Gate"] && sandlab.world.heading[50*sandlab.world.width+50]===6')
        choose_material(page,mobile,'Drone')
        target=point(page,80,50)
        if mobile:page.touchscreen.tap(**target)
        else:page.mouse.click(**target)
        page.wait_for_function('() => sandlab.world.missiles.items.some(a=>a.material===deviceM.Drone)')
        page.evaluate("() => {sandlab.loadPreset('logic');}")
        assert page.evaluate('sandlab.world.circuits.locations.size')==10
        page.evaluate("() => {sandlab.loadPreset('machines');}")
        assert page.evaluate('sandlab.world.missiles.items.length')==2
        exact=page.evaluate("async()=>{const p=await import('./src/persistence.js');const saved=p.snapshot(sandlab.world);p.restore(sandlab.world,p.unpack(p.pack(saved)));return JSON.stringify(p.snapshot(sandlab.world))===JSON.stringify(saved);}")
        assert exact
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        page.screenshot(path=str(ARTIFACTS/f'devices-{width}x{height}.png'))
        results.append({'viewport':f'{width}x{height}','group_crud':'pass','devices':'pass','runtime_errors':errors})
        context.close()
    browser.close();print(json.dumps(results))
