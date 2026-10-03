"""Fit/stretch bounds, input, camera anchoring and toolbar reachability."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes, json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[-1].split('?')[0] or 'index.html')
    if path.is_file():route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,mobile in [(1440,900,False),(320,740,True),(390,844,True),(844,390,True)]:
        c=browser.new_context(viewport={'width':width,'height':height},has_touch=mobile,is_mobile=mobile,device_scale_factor=2)
        c.route('http://sandlab.test/**',serve)
        page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
        page.evaluate('''async()=>{sandlab.state.paused=true;sandlab.settings.set('autosave',false);const {World}=await import('./src/sim/world.js');const {snapshot}=await import('./src/persistence.js');sandlab.restore(snapshot(new World(120,240)));sandlab.renderer.resize();sandlab.state.material=94;sandlab.state.setRadius(1);}''')
        button=page.locator('#canvas-fill-btn')
        assert button.is_visible()
        b=button.bounding_box();full=page.locator('#fullscreen-btn').bounding_box()
        if full:assert b['x']+b['width']<=full['x']+1
        assert b['x']>=0 and b['x']+b['width']<=width
        previous=button.inner_html()
        for mode in ['fit','stretch']:
            button.click();assert page.evaluate('sandlab.renderer.fill')==mode
            assert button.inner_html()!=previous;previous=button.inner_html()
            assert page.evaluate('sandlab.renderer.zoom')==1
            result=page.evaluate('''()=>{const r=sandlab.renderer,w=sandlab.world,points=[[0,0],[w.width,0],[0,w.height],[w.width,w.height]].map(([x,y])=>r.project(x,y));const xs=points.map(p=>p.x),ys=points.map(p=>p.y),m=r.view.matrix;return{left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys),width:r.canvas.width,height:r.canvas.height,sx:Math.hypot(m[0],m[1]),sy:Math.hypot(m[2],m[3])}}''')
            assert result['left']>=-.01 and result['top']>=-.01 and result['right']<=result['width']+.01 and result['bottom']<=result['height']+.01,result
            if mode=='fit':assert abs(result['sx']-result['sy'])<.001
            else:assert abs(result['left'])+abs(result['top'])+abs(result['right']-result['width'])+abs(result['bottom']-result['height'])<.01
            # Test a point in the lower world, away from the mobile floating HUD.
            q=page.evaluate('''()=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),p=r.project(60,160),scale=r.canvas.width/b.width;return{x:b.x+p.x/scale,y:b.y+p.y/scale}}''')
            page.evaluate('sandlab.world.clear();sandlab.state.tool="paint";sandlab.state.material=94')
            if mobile:page.touchscreen.tap(**q)
            else:page.mouse.click(**q)
            assert page.evaluate('sandlab.world.cells[160*120+60]')==94
            # Zoom keeps the point under the pointer fixed with either matrix.
            anchored=page.evaluate('''q=>{const r=sandlab.renderer,a=r.point(q.x,q.y);r.zoomAt(1.5,q.x,q.y);const b=r.point(q.x,q.y);return Math.hypot(a.x-b.x,a.y-b.y)}''',q)
            assert anchored<.001
            if mobile:
                page.evaluate('sandlab.renderer.resetView();sandlab.world.clear()')
                session=c.new_cdp_session(page)
                a=page.evaluate('q=>sandlab.renderer.point(q.x,q.y)',q)
                def fingers(span, shift=0):
                    return [{'x':q['x']-span+shift,'y':q['y'],'id':1},{'x':q['x']+span+shift,'y':q['y'],'id':2}]
                session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':fingers(25)})
                session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':fingers(35,8)})
                b=page.evaluate('q=>sandlab.renderer.point(q.x+8,q.y)',q)
                assert abs(a['x']-b['x'])<.1 and abs(a['y']-b['y'])<.1,(mode,a,b)
                assert abs(page.evaluate('sandlab.renderer.zoom')-1.4)<.01
                session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                assert page.evaluate('sandlab.world.count')==0
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        # Fit remembers the setting and resets the camera when toggled.
        button.click();assert page.evaluate('sandlab.renderer.zoom')==1
        page.reload();page.wait_for_function('!!window.sandlab')
        assert page.evaluate('sandlab.renderer.fill')=='fit'
        assert 'Canvas display: Fit' in button.get_attribute('aria-label')
        assert not errors,errors
        c.close()
    browser.close()
print(json.dumps({'fit_stretch_input_and_bounds':'pass','zoom_anchor_and_persistence':'pass','desktop_mobile_toolbar':'pass'}))
