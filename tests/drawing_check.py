"""Real input gestures, camera mapping, and the mobile controls sheet."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def open_page(browser,width=1440,height=900,touch=False):
    c=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
    c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab');page.locator('#play-btn').click()
    page.evaluate("()=>{sandlab.settings.set('autosave',false);sandlab.world.clear();sandlab.state.material=3;sandlab.state.setRadius(1)}")
    return c,page,errors
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),v=r.viewport,d=r.canvas.width/b.width;return {x:b.x+(v.x+(x+.5)*v.scale)/d,y:b.y+(v.y+(y+.5)*v.scale)/d}}''',[x,y])
def gesture(page,key,a,b):
    page.keyboard.down(key);page.mouse.move(**point(page,*a));page.mouse.down();page.mouse.move(**point(page,*b),steps=5)
    assert page.evaluate('sandlab.world.count')==0
    assert page.evaluate('!!sandlab.renderer.gesture')
    page.mouse.up();page.keyboard.up(key)
def occupied(page,x,y):return page.evaluate('([x,y])=>sandlab.world.cells[y*sandlab.world.width+x]===3',[x,y])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c,page,errors=open_page(browser)
    gesture(page,'Shift',(40,50),(100,80))
    assert occupied(page,70,65) and not occupied(page,70,50)
    page.locator('#undo-btn').click();assert page.evaluate('sandlab.world.count')==0
    page.locator('#redo-btn').click();assert occupied(page,70,65)
    page.evaluate('sandlab.world.clear();sandlab.state.shape="square"')
    gesture(page,'Control',(40,50),(100,80))
    assert occupied(page,40,65) and occupied(page,70,50) and occupied(page,100,65) and occupied(page,70,80)
    assert not occupied(page,70,65)
    page.evaluate('sandlab.world.clear();sandlab.state.shape="circle"')
    gesture(page,'Control',(90,90),(110,90))
    assert occupied(page,90,70) and occupied(page,70,90) and occupied(page,90,110) and not occupied(page,90,90)
    page.evaluate('sandlab.world.clear()')
    page.keyboard.down('Shift');page.mouse.move(**point(page,20,20));page.mouse.down();page.mouse.move(**point(page,50,50));page.keyboard.press('Escape');page.mouse.up();page.keyboard.up('Shift')
    assert page.evaluate('sandlab.world.count===0 && !sandlab.renderer.gesture')
    anchor=point(page,130,100);anchor={k:round(v) for k,v in anchor.items()};page.mouse.move(**anchor);page.mouse.wheel(0,-100)
    assert page.evaluate('sandlab.state.radius')==2
    before=page.evaluate('p=>sandlab.renderer.point(p.x,p.y)',anchor)
    page.keyboard.down('Control');page.mouse.wheel(0,-100);page.wait_for_timeout(80);page.keyboard.up('Control')
    after=page.evaluate('p=>sandlab.renderer.point(p.x,p.y)',anchor)
    assert page.evaluate('sandlab.renderer.zoom')>1
    assert abs(after['x']-before['x'])<.01 and abs(after['y']-before['y'])<.01
    assert page.evaluate('sandlab.state.radius')==2
    page.mouse.click(**point(page,130,100));assert occupied(page,130,100)
    page.locator('#reset-view-btn').click();assert page.evaluate('sandlab.renderer.zoom')==1
    assert not errors,errors;c.close();browser.close()
    for width,height in [(320,740),(360,780),(390,844),(844,390)]:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        c,page,errors=open_page(browser,width,height,True);print('Checking mobile',width,flush=True)
        assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='false'
        assert page.locator('#world').bounding_box()['height']>height*(.64 if height>500 else .50),(width,page.locator('#world').bounding_box())
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        target=point(page,100,100);page.touchscreen.tap(**target);page.wait_for_function('() => sandlab.world.cells[100*sandlab.world.width+100]===3');assert occupied(page,100,100)
        box=page.locator('#world').bounding_box()
        page.locator('#controls-toggle').tap();assert page.locator('#shape-btn').is_visible()
        assert page.locator('#world').bounding_box()==box
        page.locator('#zoom-in-btn').tap();assert page.evaluate('sandlab.renderer.zoom')>1
        page.locator('#zoom-fit-btn').tap();assert page.evaluate('sandlab.renderer.zoom')==1
        if width<=700:
            a=page.locator('#clear-btn').bounding_box();b=page.locator('#view').bounding_box()
            assert a['x']+a['width']<=b['x']
        page.locator('#fullscreen-btn').tap();page.wait_for_function('() => document.body.classList.contains("canvas-focus")')
        page.locator('#controls-toggle').tap();page.locator('#exit-focus-btn').tap();page.wait_for_function('() => !document.body.classList.contains("canvas-focus")')
        page.locator('#palette-toggle').tap();page.get_by_role('button',name='Water',exact=True).tap()
        assert not page.locator('#palette').evaluate('e=>e.classList.contains("open")')
        page.locator('#controls-toggle').tap()
        h=page.locator('#controls-toggle').bounding_box();session=c.new_cdp_session(page)
        x=h['x']+h['width']/2;y=h['y']+h['height']/2
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-50,'id':1}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='true'
        page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'drawing-mobile-{width}.png'))
        assert not errors,errors;c.close();browser.close()
print(json.dumps({'line_circle_rectangle':'pass','preview_cancel_history':'pass','wheel_and_zoom_mapping':'pass','touch_and_mobile_sheet':'pass','safari_focus_fallback':'pass'}))
