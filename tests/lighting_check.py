"""Lighting pixels and ambient canvas controls on desktop and rotated touch layouts."""
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
        page.evaluate('sandlab.settings.set("autosave",false);sandlab.state.paused=true;sandlab.settings.set("bloom",false)')
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#new-canvas-btn').click();page.locator('#level-name').fill('Night lab')
        page.locator('#level-ambientLight').fill('0');assert page.locator('#level-ambientLight-value').inner_text()=='0%'
        page.locator('#level-submit').click();page.evaluate('sandlab.state.paused=true');assert page.evaluate('sandlab.world.ambientLight')==0
        if touch:page.locator('#palette-toggle').click()
        page.get_by_role('button',name='Lamp',exact=True).click()
        point=page.evaluate('''async()=>{window.M=(await import('./src/sim/materials.js')).M;const w=sandlab.world,r=sandlab.renderer;r.resetView();const p=r.project(w.width*.35,w.height*.45),b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width;return {x:b.x+p.x/d,y:b.y+p.y/d};}''')
        if touch:page.touchscreen.tap(**point)
        else:page.mouse.click(**point)
        assert page.evaluate('sandlab.world.cells.includes(M.Lamp)')
        # Read the composite used by Inspect and thumbnails. Lighting must include
        # both painted backgrounds and continuous bodies, not just powder pixels.
        values=page.evaluate('''()=>{
          const w=sandlab.world,r=sandlab.renderer;w.clear();
          const x=Math.floor(w.width*.35),y=Math.floor(w.height*.45);window.lightPosition={x,y};
          w.set(y*w.width+x,M.Lamp);
          for(let yy=0;yy<w.height;yy++)w.set(yy*w.width+x+32,M.Wall);
          for(const [xx,yy] of [[x+8,y],[x+44,y]])w.set(yy*w.width+xx,M.Sand);
          w.background='#336699';w.backgroundPaint[(y-8)*w.width+x+8]=0xffbb8855;
          w.stickmen.spawn(x+18,y+14,M.Cat);w.stickmen.spawn(x+65,y+14,M.Cat);
          for(let i=0;i<2;i++)r.draw();
          const c=r.worldImage().getContext('2d');window.pixel=(x,y)=>Array.from(c.getImageData(x,y,1,1).data).slice(0,3);
          return {lit:pixel(x+8,y),shadow:pixel(x+44,y),dark:pixel(w.width-8,8),source:pixel(x,y),litActor:pixel(Math.floor(w.stickmen.bodies[0].x[0]),Math.floor(w.stickmen.bodies[0].y[0])),darkActor:pixel(Math.floor(w.stickmen.bodies[1].x[0]),Math.floor(w.stickmen.bodies[1].y[0])),paint:pixel(x+8,y-8)};
        }''')
        assert max(values['dark'])==0,values
        assert max(values['shadow'])<=3,values
        assert max(values['source'])>100 and max(values['lit'])>40,values
        assert max(values['litActor'])>15 and max(values['darkActor'])<=3,values
        assert max(values['paint'])>10,values
        page.screenshot(path=str(ARTIFACTS/f'lighting-dark-{width}x{height}.png'))
        # Ambient updates in Canvas properties must be an undoable metadata edit.
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#level-properties-btn').click();page.locator('#level-ambientLight').fill('10');page.locator('#level-submit').click()
        assert page.evaluate('sandlab.world.ambientLight')==.1
        if touch and page.locator('#controls-toggle').get_attribute('aria-expanded')=='false':page.locator('#controls-toggle').click()
        page.locator('#undo-btn').click();assert page.evaluate('sandlab.world.ambientLight')==0
        page.locator('#redo-btn').click();assert page.evaluate('sandlab.world.ambientLight')==.1
        page.evaluate('()=>{const saved=sandlab.snapshot();sandlab.world.clear();sandlab.restore(saved);}')
        assert page.evaluate('sandlab.world.ambientLight')==.1
        # The bounce amount is independent from bloom, and persists as a browser preference.
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#settings-btn').click();page.locator('#settings-tab-rendering').click()
        page.locator('#setting-lightBounces').fill('0');assert page.evaluate('sandlab.renderer.lightBounces')==0
        page.locator('#setting-lightBounces').fill('0.15');assert abs(page.evaluate('sandlab.renderer.lightBounces')-.15)<1e-9
        page.locator('#settings-dialog .dialog-close').click()
        # Diagnostic temperature colors stay readable at zero ambient.
        bright=page.evaluate('''()=>{sandlab.world.ambientLight=0;sandlab.renderer.mode='heat';sandlab.renderer.draw();sandlab.renderer.worldImage();return pixel(sandlab.world.width-8,8);}''')
        assert max(bright)>60,bright
        if touch:
            page.set_viewport_size(dict(width=height,height=width));page.wait_for_timeout(350)
            assert page.evaluate('sandlab.world.ambientLight')==0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'Radial light, shadows, dark particles/actors/background, canvas ambient, history and settings: {width}x{height}',flush=True)
        context.close()
    browser.close()
