"""Solid stroke ownership, frozen physics, release modes and touch cancellation."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def serve(route):
    path = ROOT / (route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404)

def setup(page, material=3, paused=False):
    return page.evaluate('''([material,paused])=>{
      const {world:w,state:s,renderer:r}=sandlab;w.clear();r.resetView();
      s.tool="paint";s.material=material;s.radius=2;s.erase=false;s.paused=paused;
      r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width;
      const p=r.project(w.width*.4,w.height*.3);
      return {x:b.x+p.x/d,y:b.y+p.y/d};
    }''', [material,paused])

def frozen(page):
    assert page.evaluate('sandlab.state.paused')
    before = page.evaluate('({tick:sandlab.world.tick,cells:Array.from(sandlab.world.cells)})')
    page.wait_for_timeout(150)
    assert page.evaluate('({tick:sandlab.world.tick,cells:Array.from(sandlab.world.cells)})') == before

def centroid(page):
    return page.evaluate('''()=>{
      const w=sandlab.world;let n=0,sum=0;
      for(let i=0;i<w.length;i++)if(w.cells[i]){n++;sum+=(i%w.width)*w.gravityX+Math.floor(i/w.width)*w.gravityY;}
      return sum/n;
    }''')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        context = browser.new_context(viewport=dict(width=width,height=height), is_mobile=touch, has_touch=touch)
        context.route('http://sandlab.test/**', serve)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
        page.evaluate('sandlab.settings.set("autosave",false)')
        session = context.new_cdp_session(page) if touch else None
        def down(pos):
            if touch:
                session.send('Input.dispatchTouchEvent', dict(type='touchStart',touchPoints=[dict(**pos,id=1)]))
                page.wait_for_timeout(140)
            else:
                page.mouse.move(**pos);page.mouse.down()
        def move(pos):
            if touch:
                session.send('Input.dispatchTouchEvent', dict(type='touchMove',touchPoints=[dict(**pos,id=1)]))
            else: page.mouse.move(**pos,steps=6)
        def up():
            if touch: session.send('Input.dispatchTouchEvent', dict(type='touchEnd',touchPoints=[]))
            else: page.mouse.up()
        # Every moving solid uses the same pause rule; other physical groups do not.
        ids = page.evaluate('''async()=>{
          const {paletteMaterials}=await import('./src/sim/material-families.js');
          return paletteMaterials.filter(m=>m.rigid).map(m=>m.id);
        }''')
        for material in ids:
            pos=setup(page,material);down(pos);frozen(page);up()
            assert not page.evaluate('sandlab.state.paused'),material
        for material in [1,2,9,13,94]:  # Sand, Water, Smoke, Gunpowder, Wall.
            pos=setup(page,material);down(pos)
            assert not page.evaluate('sandlab.state.paused'),material
            up()
        # A continuous shape stays in place and only begins falling after release.
        pos=setup(page);down(pos);move(dict(x=pos['x']+35,y=pos['y']+15));frozen(page)
        before=centroid(page);up();page.wait_for_timeout(350)
        assert centroid(page)>before+2,(width,before,centroid(page))
        # A stationary frozen stroke does not repaint every animation frame,
        # but increasing its radius while held still expands the shape immediately.
        pos=setup(page)
        page.evaluate('''()=>{
          const w=sandlab.world;window.originalBrush=w.brush;window.brushCalls=0;
          w.brush=function(...args){brushCalls++;return originalBrush.apply(this,args);};
        }''')
        down(pos);frozen(page)
        assert page.evaluate('brushCalls')<=8
        count=page.evaluate('sandlab.world.count')
        page.evaluate('sandlab.state.setRadius(6)');page.wait_for_timeout(150)
        assert page.evaluate('sandlab.world.count')>count
        calls=page.evaluate('brushCalls');page.wait_for_timeout(150)
        assert page.evaluate('brushCalls')==calls
        up();page.evaluate('()=>{sandlab.world.brush=originalBrush;}')
        # Choosing Hold through the real Settings UI persists and requires Play.
        if page.evaluate('document.body.classList.contains("canvas-focus")'):
            page.locator('#mobile-exit-focus').click()
        page.locator('#settings-btn').click();page.locator('#settings-tab-brush').click()
        page.locator('#setting-solidDrawRelease').select_option('hold')
        page.locator('#settings-dialog .dialog-close').click()
        pos=setup(page);down(pos);move(dict(x=pos['x']+30,y=pos['y']));up();frozen(page)
        if touch: page.locator('#controls-toggle').click()
        page.locator('#play-btn').click();assert not page.evaluate('sandlab.state.paused')
        if touch: page.locator('#controls-toggle').click()
        page.reload();page.wait_for_function('!!window.sandlab')
        assert page.evaluate('sandlab.settings.get("solidDrawRelease")')=='hold'
        page.evaluate('sandlab.settings.set("solidDrawRelease","resume")')
        # Previously paused worlds remain paused after drawing.
        pos=setup(page,paused=True);down(pos);up();frozen(page)
        if touch:
            # Pinch navigation cancels an active draw and restores playback.
            pos=setup(page);down(pos);frozen(page)
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(**pos,id=1),dict(x=pos['x']+40,y=pos['y'],id=2)]))
            assert not page.evaluate('sandlab.state.paused')
            up()
            # A canceled touch cannot strand playback in the temporary stop.
            pos=setup(page);down(pos)
            session.send('Input.dispatchTouchEvent',dict(type='touchCancel',touchPoints=[]))
            assert not page.evaluate('sandlab.state.paused')
        else:
            # Geometric strokes also pause, and Escape discards their preview.
            for key in ['Shift','Control']:
                pos=setup(page);page.keyboard.down(key);down(pos)
                move(dict(x=pos['x']+40,y=pos['y']+25));frozen(page)
                assert page.evaluate('sandlab.world.count')==0
                up();page.keyboard.up(key)
                assert not page.evaluate('sandlab.state.paused')
                assert page.evaluate('sandlab.world.count')>0
            pos=setup(page);page.keyboard.down('Shift');down(pos);page.keyboard.press('Escape');up();page.keyboard.up('Shift')
            assert page.evaluate('!sandlab.state.paused && sandlab.world.count===0')
            # Playback shortcuts cannot move a shape mid-stroke or resume over an explicit pause.
            pos=setup(page);down(pos);page.keyboard.press('Space');frozen(page);up();frozen(page)
            pos=setup(page);down(pos);page.keyboard.press('.');frozen(page);up();frozen(page)
            # A real pen pointer shares the same drawing lifecycle as a mouse.
            pos=setup(page);pen=context.new_cdp_session(page)
            pen.send('Input.dispatchMouseEvent',dict(type='mousePressed',pointerType='pen',button='left',buttons=1,clickCount=1,**pos))
            frozen(page)
            pen.send('Input.dispatchMouseEvent',dict(type='mouseReleased',pointerType='pen',button='left',buttons=0,clickCount=1,**pos))
            assert not page.evaluate('sandlab.state.paused')
            pos=setup(page);down(pos);page.evaluate('window.dispatchEvent(new Event("blur"))');up()
            assert not page.evaluate('sandlab.state.paused')
            pos=setup(page);page.mouse.move(**pos);page.mouse.down(button='right')
            assert not page.evaluate('sandlab.state.paused')
            page.mouse.up(button='right')
        assert not errors,errors
        print(f'Solid drawing passed: {width}x{height}, {len(ids)} moving solids, release/hold, settings persistence and cancellation.',flush=True)
        context.close()
    browser.close()
