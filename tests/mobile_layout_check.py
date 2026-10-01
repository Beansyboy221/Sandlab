"""Phone rotation, fitted canvas placement, dock direction, and a persistent exit."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def fit(page):
    return page.evaluate('''()=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),v=r.viewport,d=r.canvas.width/b.width;return {x:b.x+v.x/d,y:b.y+v.y/d,width:sandlab.world.width*v.scale/d,height:sandlab.world.height*v.scale/d};}''')
def resize(page,width,height):
    page.set_viewport_size({'width':width,'height':height})
    page.wait_for_timeout(250)
def world(page,width,height):
    page.evaluate('''async([width,height])=>{const {World}=await import('./src/sim/world.js');Object.assign(sandlab.world,new World(width,height));sandlab.world.set(5*width+5,3);sandlab.mobileDock.layout();sandlab.renderer.draw();}''',[width,height])
with sync_playwright() as p:
    for portrait in [(320,740),(390,844)]:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        c=browser.new_context(viewport={'width':portrait[0],'height':portrait[1]},has_touch=True,is_mobile=True,device_scale_factor=3)
        c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab');page.locator('#play-btn').tap()
        page.evaluate("sandlab.settings.set('autosave',false)")
        assert page.locator('#controls-toggle').inner_text()==''
        assert page.locator('#controls-toggle').bounding_box()['width']>=44
        assert page.locator('#world').bounding_box()['height']>portrait[1]*.72
        page.locator('#fullscreen-btn').tap();page.wait_for_function('() => document.body.classList.contains("canvas-focus")')
        assert page.locator('#mobile-exit-focus').is_visible()
        assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='false'
        page.locator('#mobile-exit-focus').tap();page.wait_for_function('() => !document.body.classList.contains("canvas-focus")')
        assert page.locator('#settings-btn').is_visible()
        world(page,200,300);before=page.evaluate('JSON.stringify(sandlab.snapshot())')
        resize(page,844,390)
        assert page.evaluate('document.body.classList.contains("canvas-focus") && document.body.classList.contains("dock-side")')
        area=fit(page);dock=page.locator('.toolbox').bounding_box()
        assert area['x']<8 and area['height']>=375,area
        assert area['x']+area['width']<dock['x']
        assert page.evaluate('JSON.stringify(sandlab.snapshot())')==before
        page.locator('#controls-toggle').tap();page.wait_for_timeout(250)
        assert page.locator('#shape-btn').is_visible()
        assert page.locator('#tool-picker-toggle').bounding_box()['height']>=44
        page.locator('#mobile-exit-focus').tap();page.wait_for_function('() => !document.body.classList.contains("canvas-focus")')
        page.locator('#settings-btn').tap();page.locator('#settings-dialog .dialog-close').tap()
        # A wide world gains more fitted area with the bottom dock.
        resize(page,*portrait);world(page,400,140);resize(page,844,390)
        assert page.evaluate('document.body.classList.contains("canvas-focus") && !document.body.classList.contains("dock-side")')
        assert fit(page)['width']>820
        assert page.locator('#mobile-exit-focus').is_visible()
        assert page.locator('#controls-toggle').inner_text()==''
        page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'rotated-horizontal-{portrait[0]}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('#mobile-exit-focus').tap();page.wait_for_function('() => !document.body.classList.contains("canvas-focus")')
        resize(page,*portrait)
        assert not page.evaluate('document.body.classList.contains("dock-side")')
        assert page.locator('#palette-toggle').is_visible()
        # Keep raw CDP gestures last: mixing their synthetic click queue with touchscreen.tap can suppress the next tap in Chromium.
        world(page,200,300);resize(page,844,390);area=fit(page)
        page.locator('#controls-toggle').tap();page.wait_for_timeout(250)
        # A horizontal swipe opens a side panel without shifting the world.
        page.locator('#controls-toggle').tap();page.wait_for_timeout(250)
        box=page.locator('#controls-toggle').bounding_box();session=c.new_cdp_session(page)
        x=box['x']+box['width']/2;y=box['y']+box['height']/2
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-60,'y':y,'id':1}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        page.wait_for_function("() => document.querySelector('#controls-toggle').getAttribute('aria-expanded')==='true'")
        page.wait_for_timeout(300)
        page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'rotated-vertical-{portrait[0]}.png'))
        assert fit(page)==area
        assert not errors,errors;c.close();browser.close()
print(json.dumps({'handle_without_text':'pass','persistent_exit':'pass','vertical_left_and_side_dock':'pass','horizontal_fullscreen_and_bottom_dock':'pass','rotation_preserves_world':'pass','touch_swipe':'pass'}))
