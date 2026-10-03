"""Portal draw/link lifecycle, history, touch, rotation and tool layout."""
from pathlib import Path
import json, mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

def serve(route):
    path = ROOT / (route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)

def point(page, x, y):
    return page.evaluate('''p=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),v=r.project(p.x+.5,p.y+.5),d=r.canvas.width/b.width;return{x:b.x+v.x/d,y:b.y+v.y/d}}''', dict(x=x,y=y))

def stroke(page, context, a, b, mobile):
    if mobile:
        session = context.new_cdp_session(page)
        session.send('Input.dispatchTouchEvent', dict(type='touchStart',touchPoints=[dict(**a,id=1)]))
        page.wait_for_timeout(100)
        for n in range(1,9):
            p = dict(x=a['x']+(b['x']-a['x'])*n/8,y=a['y']+(b['y']-a['y'])*n/8,id=1)
            session.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[p]))
        session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
        session.detach()
    else:
        page.mouse.move(**a);page.mouse.down();page.mouse.move(**b,steps=8);page.mouse.up()
    page.wait_for_timeout(100)

def controls(page, mobile, opened):
    if mobile and (page.locator('#controls-toggle').get_attribute('aria-expanded') == 'true') != opened:
        page.locator('#controls-toggle').click()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    results=[]
    for width,height,mobile in [(1440,900,False),(390,844,True),(844,390,True),(768,1024,True)]:
        context=browser.new_context(viewport=dict(width=width,height=height),is_mobile=mobile,has_touch=mobile,device_scale_factor=3 if mobile else 1)
        context.route('http://sandlab.test/**',serve)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('()=>!!window.sandlab')
        page.evaluate('''async()=>{window.M=(await import('./src/sim/materials.js')).M;sandlab.settings.set('autosave',false);sandlab.world.clear();sandlab.state.paused=true;sandlab.settings.set('brushSize',1);sandlab.settings.set('brushShape','square')}''')
        if mobile:page.locator('#palette-toggle').click()
        page.locator('[data-group=static]').click()
        assert 'Portal' in page.locator('.material-name').all_text_contents()
        page.locator('#materials').get_by_role('button',name='Portal',exact=True).click()
        if mobile:assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='false'
        if mobile:assert not page.locator('#portal-properties').is_visible()
        size=page.evaluate('({w:sandlab.world.width,h:sandlab.world.height})')
        x1,x2=int(size['w']*.18),int(size['w']*.37)
        y1=int(size['h']*.55)
        x3=int(size['w']*.70);y2,y3=int(size['h']*.14),int(size['h']*.38)
        a,b=point(page,x1,y1),point(page,x2,y1)
        c,d=point(page,x3,y2),point(page,x3,y3)
        stroke(page,context,a,b,mobile);stroke(page,context,c,d,mobile)
        assert page.evaluate('sandlab.world.portals.shapes.size')==2
        before=page.evaluate('sandlab.world.count')
        stroke(page,context,a,c,mobile)
        assert page.evaluate('sandlab.world.count')==before
        assert page.evaluate('''()=>{const w=sandlab.world;return w.portalLink[w.index(%d,%d)]===w.portalId[w.index(%d,%d)]&&w.portalLink[w.index(%d,%d)]===w.portalId[w.index(%d,%d)]}'''%(x1,y1,x3,y2,x3,y2,x1,y1))
        controls(page,mobile,True)
        assert page.locator('#portal-properties').is_visible()
        assert page.locator('#portal-properties').evaluate('e=>!!e.closest(".draw-controls")')
        page.locator('#undo-btn').click()
        assert not page.evaluate('sandlab.world.portalLink.some(Boolean)')
        page.locator('#redo-btn').click()
        assert page.evaluate('sandlab.world.portalLink.some(Boolean)')
        page.locator('#portal-unlink').click();controls(page,mobile,False)
        a=point(page,x1,y1)
        if mobile:page.touchscreen.tap(**a)
        else:page.mouse.click(**a)
        page.wait_for_timeout(100)
        assert not page.evaluate('sandlab.world.portalLink.some(Boolean)')
        controls(page,mobile,True);page.locator('#portal-link').click();controls(page,mobile,False)
        a,c=point(page,x1,y1),point(page,x3,y2)
        stroke(page,context,a,c,mobile)
        assert page.evaluate('sandlab.world.portalLink.some(Boolean)')
        controls(page,mobile,True)
        page.locator('#portal-facing').select_option('4')
        assert page.evaluate('sandlab.state.portalFacing')==4
        controls(page,mobile,False)
        # Cancelled drags and a two-finger takeover never relink or draw.
        page.wait_for_timeout(250)
        a,c=point(page,x1,y1),point(page,x3,y2)
        if mobile:
            baseline=page.evaluate('JSON.stringify(sandlab.snapshot())')
            session=context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(**a,id=1)]))
            page.wait_for_timeout(200)
            assert page.evaluate('!!sandlab.renderer.portalDrag'), page.evaluate('''p=>{const s=sandlab,q=s.renderer.point(p.x,p.y);return{point:p,worldPoint:q,hit:s.world.portals.hit(q),tool:s.state.tool,material:s.state.material,mode:s.state.portalMode,top:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,150),viewport:[innerWidth,innerHeight],message:document.querySelector('#toast')?.textContent}}''',a)
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(**a,id=1),dict(**c,id=2)]))
            session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
            assert not page.evaluate('!!sandlab.renderer.portalDrag')
            assert page.evaluate('JSON.stringify(sandlab.snapshot())')==baseline
            session.detach()
            page.set_viewport_size(dict(width=height,height=width));page.wait_for_timeout(250)
            assert not page.evaluate('!!sandlab.renderer.portalDrag')
            assert page.evaluate('JSON.stringify(sandlab.snapshot())')==baseline
            assert page.evaluate('visualViewport.scale===1 && scrollY===0')
            assert not page.locator('#portal-properties').is_visible()
        else:
            page.mouse.move(**a);page.mouse.down();page.mouse.move(**c,steps=3)
            page.evaluate("window.dispatchEvent(new Event('blur'))")
            page.mouse.up()
            assert not page.evaluate('!!sandlab.renderer.portalDrag')
        assert page.evaluate('''async()=>{const p=await import('./src/persistence.js'),w=sandlab.world,s=p.snapshot(w);p.restore(w,p.unpack(p.pack(s)));return JSON.stringify(s)===JSON.stringify(p.snapshot(w))}''')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        page.screenshot(path=str(ARTIFACTS/f'portals-{width}x{height}.png'))
        results.append(dict(viewport=f'{width}x{height}',draw_link='pass',history_save='pass',cancel_rotation='pass',runtime_errors=errors))
        context.close()
    browser.close()
    print(json.dumps(results))
