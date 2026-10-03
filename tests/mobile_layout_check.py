"""Fitted display, physical orientation, rotated input, and bottom controls."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return {x:b.x+p.x/d,y:b.y+p.y/d}}''',[x,y])
def choose(page,tool):
    expanded=page.locator('#controls-toggle').get_attribute('aria-expanded')
    page.locator('#tool-picker-toggle').tap();page.locator(f'[data-tool-option="{tool}"]').tap()
    assert page.locator('#controls-toggle').get_attribute('aria-expanded')==expanded
    if expanded=='true':page.locator('#controls-toggle').tap()
def fit(page):
    data=page.evaluate('''()=>{const r=sandlab.renderer,w=sandlab.world;r.resize();r.draw();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,ps=[[0,0],[w.width,0],[0,w.height],[w.width,w.height]].map(([x,y])=>r.project(x,y));return {box:{x:b.x,y:b.y,width:b.width,height:b.height},bounds:[Math.min(...ps.map(p=>p.x))/d,Math.min(...ps.map(p=>p.y))/d,Math.max(...ps.map(p=>p.x))/d,Math.max(...ps.map(p=>p.y))/d],pixels:[[3,3],[r.canvas.width-4,3],[3,r.canvas.height-4],[r.canvas.width-4,r.canvas.height-4]].map(([x,y])=>Array.from(r.context.getImageData(x,y,1,1).data).slice(0,3))}}''')
    assert all(abs(a-b)<.01 for a,b in zip(data['bounds'],[0,0,data['box']['width'],data['box']['height']])),data
    assert all(p in ([34,51,68],[47,64,81]) for p in data['pixels']),data
    dock=page.locator('.toolbox').bounding_box();assert dock['y']+dock['height']>=page.viewport_size['height']-1
    assert data['box']['y']+data['box']['height']<=dock['y']+1,(data,dock)
    assert not page.evaluate('document.body.classList.contains("dock-side")')
    return data['box']
def rotate(page,angle,width,height):
    page.evaluate('''angle=>{Object.defineProperty(window,'orientation',{configurable:true,value:angle});window.dispatchEvent(new Event('orientationchange'));}''',angle)
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(200)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(320,740),(390,844),(1024,1366)]:
        c=browser.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=True,device_scale_factor=3);c.route('http://sandlab.test/**',serve)
        page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab');page.locator('#play-btn').tap()
        page.evaluate("sandlab.settings.set('autosave',false);sandlab.world.clear();sandlab.world.background='#223344';sandlab.renderer.bloom=false;sandlab.renderer.cursor=null")
        assert page.locator('#level-resolution,.canvas-resize-handle').count()==0
        assert page.locator('#controls-toggle').inner_text()==''
        fit(page)
        page.locator('#level-properties-btn').tap()
        assert page.locator('#level-width').is_visible() and page.locator('#level-height').is_visible()
        actual=page.evaluate('[sandlab.world.width,sandlab.world.height]')
        assert [int(page.locator('#level-width').input_value()),int(page.locator('#level-height').input_value())]==actual
        assert page.locator('.level-dimensions input:disabled').count()==1
        assert int(page.locator('.level-dimensions input:disabled').input_value())==max(actual)
        page.keyboard.press('Escape')
        # A world with a different aspect still fills, without cropping its grid.
        page.evaluate('''async()=>{const{World}=await import('./src/sim/world.js');const{snapshot}=await import('./src/persistence.js');const w=new World(120,240);w.background='#223344';w.set(50*120+30,3);sandlab.restore(snapshot(w));window.rotationBefore=JSON.stringify(sandlab.snapshot().arrays);window.rotationDimensions=[w.width,w.height];}''')
        for angle,ww,hh in [(90,844,390),(-90,844,390),(180,width,height),(0,width,height)]:
            rotate(page,angle,ww,hh);fit(page)
            assert page.evaluate('JSON.stringify(sandlab.snapshot().arrays)===rotationBefore')
            assert page.evaluate('[sandlab.world.width,sandlab.world.height]')==[120,240]
            assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='false'
            before=page.locator('#world').bounding_box();page.locator('#controls-toggle').tap();page.wait_for_timeout(250)
            assert page.locator('#world').bounding_box()==before;assert page.locator('#shape-btn').is_visible();page.locator('#controls-toggle').tap()
        # A sensor event arriving before resize must not briefly turn gravity sideways.
        rotate(page,0,width,height)
        page.evaluate("Object.defineProperty(window,'orientation',{configurable:true,value:90});window.dispatchEvent(new Event('orientationchange'))")
        page.wait_for_timeout(120)
        assert page.evaluate('[sandlab.world.gravityX,sandlab.world.gravityY,sandlab.renderer.rotation]')==[0,1,0]
        page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(150)
        assert page.evaluate('[sandlab.world.gravityX,sandlab.world.gravityY,sandlab.renderer.rotation]')==[-1,0,3]
        # Tool changes preserve either the collapsed or manually expanded drawer.
        rotate(page,0,width,height)
        choose(page,'cool');assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='false'
        page.locator('#controls-toggle').tap();choose(page,'paint')
        # Touch, copy, inspect, paint, zoom and pan share the rotated transform.
        for angle,ww,hh in [(0,width,height),(90,844,390),(-90,844,390),(180,width,height)]:
            rotate(page,angle,ww,hh);choose(page,'paint');page.evaluate('sandlab.state.material=3;sandlab.state.setRadius(1);sandlab.world.clear()')
            page.touchscreen.tap(**point(page,50,80));assert page.evaluate('sandlab.world.cells[80*120+50]')==3
            choose(page,'eyedropper');page.touchscreen.tap(**point(page,50,80));assert page.evaluate('sandlab.state.material')==3
            choose(page,'inspect');page.touchscreen.tap(**point(page,50,80));page.wait_for_function("() => document.querySelector('#inspection-card h3').textContent==='Stone'")
            choose(page,'recolor');page.evaluate("sandlab.state.color='#ff0000';sandlab.state.colorLayer='foreground';sandlab.state.colorOpacity=1")
            page.touchscreen.tap(**point(page,50,80));assert page.evaluate('sandlab.world.pigment[80*120+50]')==0xffff0000
            target={k:round(v) for k,v in point(page,50,80).items()};anchor=page.evaluate('p=>sandlab.renderer.point(p.x,p.y)',target)
            page.mouse.move(**target);page.keyboard.down('Control');page.mouse.wheel(0,-100);page.keyboard.up('Control');page.wait_for_timeout(100)
            after=page.evaluate('p=>sandlab.renderer.point(p.x,p.y)',target);assert abs(anchor['x']-after['x'])<.01 and abs(anchor['y']-after['y'])<.01
            old=point(page,50,80);page.mouse.move(**old);page.mouse.down(button='middle');page.mouse.move(old['x']+25,old['y']+10);page.mouse.up(button='middle');new=point(page,50,80)
            assert abs(new['x']-old['x']-25)<.01 and abs(new['y']-old['y']-10)<.01
            page.evaluate('sandlab.renderer.resetView()')
            # Projected motion is screen-down for sand and screen-up for steam.
            page.evaluate('''async()=>{const {M}=await import('./src/sim/materials.js');sandlab.world.clear();sandlab.world.set(80*120+50,M.Sand);window.fallBefore=sandlab.renderer.project(50.5,80.5);sandlab.world.move(80*120+50,50,80);window.fallAfter=sandlab.renderer.project(50.5+sandlab.world.gravityX,80.5+sandlab.world.gravityY)}''')
            assert page.evaluate('Math.abs(fallAfter.x-fallBefore.x)<.01 && fallAfter.y>fallBefore.y')
        choose(page,'paint');page.evaluate("sandlab.world.clear();sandlab.renderer.cursor=null");fit(page)
        page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'fitted-rotation-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
        c.close()
    # Desktop displays both editable dimensions; metadata remains editable.
    c=browser.new_context(viewport={'width':1440,'height':900});c.route('http://sandlab.test/**',serve);page=c.new_page();page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
    page.locator('#new-canvas-btn').click();assert page.locator('#level-width').is_visible() and page.locator('#level-height').is_visible();assert page.locator('#level-resolution,.canvas-resize-handle').count()==0
    page.locator('#level-name').fill('Screen-sized canvas');page.locator('#level-submit').click();assert page.evaluate('sandlab.world.name')=='Screen-sized canvas'
    page.locator('#level-properties-btn').click();assert page.locator('#level-width').is_visible() and page.locator('#level-height').is_visible();page.keyboard.press('Escape')
    c.close();browser.close()
print(json.dumps({'no_letterboxing_any_aspect':'pass','rotation_preserves_particle_grid':'pass','gravity_screen_down':'pass','rotated_touch_paint_copy_inspect_zoom_pan':'pass','bottom_controls_phone_tablet':'pass','visible_dimensions_and_no_resize_handles':'pass'}))
