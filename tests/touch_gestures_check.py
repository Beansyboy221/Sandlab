"""Real multitouch pointer lifecycle, camera anchoring, and tool regressions."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
def serve(route):
    path = ROOT / (route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)

def touch(x, y, id=1):
    return dict(x=x, y=y, id=id)

def dispatch(session, kind, points):
    session.send('Input.dispatchTouchEvent', dict(type='touch'+kind, touchPoints=points))

def camera(page):
    return page.evaluate('({zoom:sandlab.renderer.zoom,center:{...sandlab.renderer.center}})')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(390,844), (844,390), (768,1024)]:
        context = browser.new_context(viewport=dict(width=width,height=height), is_mobile=True, has_touch=True, device_scale_factor=3)
        context.route('http://sandlab.test/**', serve)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://sandlab.test/'); page.wait_for_function('!!window.sandlab')
        page.evaluate('sandlab.state.paused=true;sandlab.settings.set("autosave",false);sandlab.world.clear();sandlab.renderer.resetView()')
        page.wait_for_timeout(200)
        session = context.new_cdp_session(page)
        box = page.locator('#world').bounding_box()
        x, y = box['x']+box['width']/2, box['y']+box['height']*.4
        # Two simultaneous fingers must never draw, fill, erase, or recolor.
        for tool in ['paint','fill','erase','recolor','warm','cool','fan','grab','select','inspect','eyedropper']:
            page.evaluate('(tool)=>{sandlab.state.tool=tool;sandlab.renderer.resetView()}', tool)
            anchor = page.evaluate('([x,y])=>sandlab.renderer.point(x,y)', [x,y])
            dispatch(session,'Start',[touch(x-40,y,1),touch(x+40,y,2)])
            dispatch(session,'Move',[touch(x-60+16,y+12,1),touch(x+60+16,y+12,2)])
            current = camera(page)
            assert abs(current['zoom']-1.5)<.01, (tool,current)
            end_anchor = page.evaluate('([x,y])=>sandlab.renderer.point(x,y)', [x+16,y+12])
            assert abs(end_anchor['x']-anchor['x'])<.1 and abs(end_anchor['y']-anchor['y'])<.1, (anchor,end_anchor)
            dispatch(session,'End',[touch(x-60+16,y+12,1)])
            dispatch(session,'Move',[touch(x+35,y+30,1)])
            page.wait_for_timeout(120)
            dispatch(session,'End',[])
            assert page.evaluate('sandlab.world.count')==0, tool
            assert page.evaluate('!sandlab.world.backgroundPaint.some(Boolean)'), tool
            assert page.locator('#undo-btn').is_disabled(), tool
            assert page.evaluate('visualViewport.scale===1 && scrollY===0')
        # Single taps and continuous strokes still work and preserve Undo/Redo.
        page.evaluate('sandlab.state.tool="paint";sandlab.state.material=1;sandlab.state.radius=2;sandlab.renderer.resetView()')
        page.touchscreen.tap(x,y)
        count = page.evaluate('sandlab.world.count'); assert count>0
        dispatch(session,'Start',[touch(x,y+40)])
        dispatch(session,'Move',[touch(x+50,y+40)])
        dispatch(session,'End',[])
        page.wait_for_timeout(120)
        assert page.evaluate('sandlab.world.count')>count
        # Use the real dock controls, which should still respond to touch after navigation.
        page.locator('#controls-toggle').click()
        page.locator('#undo-btn').click(); assert page.evaluate('sandlab.world.count')==count
        page.locator('#redo-btn').click(); assert page.evaluate('sandlab.world.count')>count
        page.locator('#controls-toggle').click()
        page.wait_for_timeout(300)
        page.evaluate('sandlab.world.clear()')
        # Canceled pending touches must not fire their delayed drawing callback.
        dispatch(session,'Start',[touch(x,y)])
        dispatch(session,'Cancel',[])
        page.wait_for_timeout(180)
        assert page.evaluate('sandlab.world.count')==0
        # A third finger and changing the controlling pair cannot resume drawing.
        dispatch(session,'Start',[touch(x-40,y,1),touch(x+40,y,2)])
        dispatch(session,'Start',[touch(x-40,y,1),touch(x+40,y,2),touch(x,y+45,3)])
        dispatch(session,'End',[touch(x+40,y,2),touch(x,y+45,3)])
        dispatch(session,'Move',[touch(x+45,y+10,2),touch(x+5,y+55,3)])
        dispatch(session,'End',[])
        assert page.evaluate('sandlab.world.count')==0
        page.touchscreen.tap(x,y); assert page.evaluate('sandlab.world.count')>0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors, errors
        context.close()
    browser.close()
print('Two-finger pan/pinch, anchoring, all tools, touch cancellation, third fingers and single-finger Undo/Redo passed in portrait, landscape and tablet layouts.')
