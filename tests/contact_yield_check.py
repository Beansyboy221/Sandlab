"""Timed mouse/touch Grab throws and pixel contacts on desktop and phones."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, mimetypes

ROOT = Path(__file__).resolve().parents[1]

def serve(route):
    path = ROOT / (route.request.url.split('http://sandlab.test/', 1)[1].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    results = []
    for width, height, touch in [(1440, 900, False), (390, 844, True), (844, 390, True)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=touch, has_touch=touch)
        context.route('http://sandlab.test/**', serve)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://sandlab.test/')
        page.wait_for_function('() => !!window.sandlab')
        page.locator('#tool-picker-toggle').click()
        page.locator('[data-tool-option="grab"]').click()
        page.evaluate('''async()=>{
          sandlab.settings.set('autosave',false);sandlab.state.paused=true;
          const {throwScene}=await import('./tests/contact-scenes.js');
          const {snapshot,restore}=await import('./src/persistence.js');
          restore(sandlab.world,snapshot(throwScene()));
          const w=sandlab.world;w.environment.sample=()=>{w.environment.x=w.environment.y=0;};
          sandlab.state.setRadius(12);sandlab.state.shape='square';sandlab.renderer.resize();
        }''')
        def point(x, y):
            return page.evaluate('''([x,y])=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return{x:b.x+p.x/d,y:b.y+p.y/d}}''', [x, y])
        a, b = point(35, 48), point(55, 48)
        if touch:
            session = context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [dict(a, id=1)]})
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [dict(b, id=1)]})
            page.wait_for_function('''b=>{const q=sandlab.renderer.point(b.x,b.y);return Array.from(sandlab.controller.input.pointers.values()).some(p=>Math.hypot(p.x-q.x,p.y-q.y)<.5)}''', arg=b)
            session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        else:
            page.mouse.move(**a);page.mouse.down();page.mouse.move(**b);page.mouse.up()
        page.wait_for_function('() => !sandlab.controller.input.pointers.size')
        data = page.evaluate('''async()=>{
          const {M}=await import('./src/sim/materials.js');const w=sandlab.world,r=sandlab.renderer;
          const body=w.rigid.bodies.find(b=>w.cells[w.rigid.locations.get(b.ids[0])]===M.Steel);
          const speed=w.rigid.pose(body).vx, before=w.count;
          for(let n=0;n<100;n++)w.step();r.draw();
          let mismatch=0;for(let i=0;i<w.length;i++)if(w.cells[i]===M.Steel){const at=i*4;if(!r.data.data[at]&&!r.data.data[at+1]&&!r.data.data[at+2])mismatch++;}
          return {speed,before,count:w.count,steel:w.cells.filter(v=>v===M.Steel).length,sawdust:w.cells.filter(v=>v===M.Sawdust).length,
            pieces:w.rigid.bodies.filter(b=>w.cells[w.rigid.locations.get(b.ids[0])]===M.Wood).length,mismatch,
            finite:w.velocityX.every(Number.isFinite)&&w.velocityY.every(Number.isFinite)};
        }''')
        assert data['speed'] > .3 and data['speed'] <= 2.51, data
        assert data['sawdust'] > 0 and data['pieces'] >= 2 and data['steel'] == 145, data
        assert data['count'] == data['before'] and data['mismatch'] == 0 and data['finite'], data
        assert not errors, errors
        results.append({'viewport': [width, height], **data})
        context.close()
    browser.close()
    print(json.dumps(results))
