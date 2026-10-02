"""Predator/seeker UI and touch joystick placement, rotation and input cancellation."""
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
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
        page.evaluate('sandlab.settings.set("autosave",false);sandlab.state.paused=true')
        if touch:page.locator('#palette-toggle').click()
        names=page.locator('.material-name').all_text_contents()
        assert all(n in names for n in ['Wolf','Shark','Heat-Seeking Missile'])
        page.get_by_role('button',name='Heat-Seeking Missile',exact=True).click()
        q=page.evaluate('''async()=>{window.M=(await import('./src/sim/materials.js')).M;const {world:w,renderer:r}=sandlab;w.clear();r.resetView();r.resize();const b=r.canvas.getBoundingClientRect(),p=r.project(w.width*.2,w.height*.4),d=r.canvas.width/b.width;return {x:b.x+p.x/d,y:b.y+p.y/d};}''')
        if touch:page.touchscreen.tap(**q)
        else:page.mouse.click(**q)
        assert page.evaluate('sandlab.world.missiles.items.length')==1
        saved=page.evaluate('sandlab.snapshot().missiles');page.evaluate('()=>{const save=sandlab.snapshot();sandlab.world.clear();sandlab.restore(save);}')
        assert page.evaluate('sandlab.snapshot().missiles')==saved
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#settings-btn').click();page.locator('#settings-tab-wildlife').click()
        page.locator('#setting-predation').uncheck();assert not page.evaluate('sandlab.world.mechanics.predation')
        page.locator('#settings-tab-devices').click();page.locator('#setting-missileHoming').uncheck()
        assert page.locator('#setting-missileHeat').is_disabled()
        assert not page.evaluate('sandlab.world.mechanics.missileHoming')
        page.locator('#settings-tab-player').click();page.locator('#setting-joystickSide').select_option('right')
        page.locator('#setting-joystickSize').evaluate('e=>{e.value=100;e.dispatchEvent(new Event("input",{bubbles:true}));}')
        page.locator('#setting-joystickRaise').evaluate('e=>{e.value=24;e.dispatchEvent(new Event("input",{bubbles:true}));}')
        page.locator('#settings-dialog .dialog-close').click()
        page.evaluate('''()=>{const w=sandlab.world;w.clear();w.stickmen.spawn(w.width*.3,w.height*.6,M.Player);sandlab.playerControls.sync();}''')
        page.wait_for_timeout(300)
        if touch:
            def check_layout(allow_hidden=False):
                if page.locator(".player-joystick").is_hidden():
                    assert allow_hidden
                    return None
                j=page.locator('.player-joystick').bounding_box();c=page.locator('#world').bounding_box();d=page.locator('.toolbox').bounding_box()
                assert abs(j['width']-100)<2,j
                assert j['x']>=c['x'] and j['y']>=c['y'],(j,c)
                assert j['x']+j['width']<=c['x']+c['width']+1 and j['y']+j['height']<=c['y']+c['height']+1,(j,c)
                assert j['x']+j['width']<=d['x']+1 or j['y']+j['height']<=d['y']+1 or j['x']>=d['x']+d['width']-1,(j,d)
                assert page.evaluate('document.elementFromPoint(...(()=>{const b=document.querySelector(".player-joystick").getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];})()).closest(".player-joystick")!==null')
                return j
            j=check_layout();session=context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=j['x']+j['width']*.8,y=j['y']+j['height']*.5,id=1)]))
            page.wait_for_timeout(50);assert page.evaluate('sandlab.playerControls.touchMove')>.5
            # Changing position during a hold releases captured movement safely.
            page.evaluate('sandlab.settings.set("joystickSide","left")');assert page.evaluate('sandlab.playerControls.touchMove')==0
            session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]));page.wait_for_timeout(100);check_layout()
            page.locator('#controls-toggle').click();page.wait_for_timeout(400);check_layout(allow_hidden=True)
            page.locator('#controls-toggle').click();page.wait_for_timeout(300)
            page.set_viewport_size(dict(width=height,height=width));page.wait_for_timeout(650);check_layout()
        # Presets are available through the normal new-canvas dialog.
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        for preset in ['reserve','missiles']:
            page.locator('#new-canvas-btn').click();page.locator('#level-starter').select_option(preset);page.locator('#level-submit').click()
            page.evaluate('sandlab.state.paused=true');page.wait_for_timeout(150)
            assert page.evaluate('sandlab.world.stickmen.bodies.length' if preset=='reserve' else 'sandlab.world.missiles.items.length')==(5 if preset=='reserve' else 3)
        page.screenshot(path=str(ARTIFACTS/f'moving-mechanics-{width}x{height}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'Seeker drawing/saves, mechanic settings, joystick positioning and new presets: {width}x{height}',flush=True)
        context.close()
    browser.close()
