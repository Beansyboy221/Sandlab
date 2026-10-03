"""Playable stickmen through real drawing, keyboard, mobile joystick and jump."""
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
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
        page.evaluate('sandlab.settings.set("autosave",false);sandlab.state.paused=true')
        assert page.evaluate("(async()=>{const{bindingsFor}=await import('./src/shortcuts.js');return bindingsFor('playerJump',sandlab.settings.get('shortcuts')).length===0})()")
        if not touch:page.evaluate("sandlab.settings.set('shortcuts',{playerLeft:['a'],playerRight:['d'],playerJump:['w'],playerCrouch:['s']})")
        if touch:page.locator('#palette-toggle').click()
        page.locator('#entities-tab').click()
        page.get_by_role('button',name='Player',exact=True).click()
        pos=page.evaluate('''async()=>{
          const {M}=await import('./src/sim/materials.js');const {world:w,renderer:r}=sandlab;w.clear();r.resetView();
          const gx=w.gravityX,gy=w.gravityY,across=gy?w.width:w.height,down=gx?w.width:w.height;
          const map=(u,v)=>({x:gy*u+gx*v+(gy<0||gx<0?w.width-1:0),y:-gx*u+gy*v+(gx>0||gy<0?w.height-1:0)});
          const floor=Math.floor(down*.68);
          for(let u=0;u<across;u++)for(let v=floor;v<floor+3;v++){const q=map(u,v);w.set(q.y*w.width+q.x,M.Wall);}
          const q=map(Math.floor(across*.3),floor-2);window.playerSpawn=q;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(q.x+.5,q.y+.5);
          return {x:b.x+p.x/d,y:b.y+p.y/d};
        }''')
        if touch:page.touchscreen.tap(**pos)
        else:page.mouse.click(**pos)
        page.wait_for_function('!!sandlab.world.stickmen.player')
        page.locator('.player-controls').wait_for(state='visible')
        assert page.evaluate('sandlab.world.stickmen.bodies.length')==1
        page.evaluate('sandlab.state.paused=false')
        page.wait_for_timeout(650)
        assert page.evaluate('sandlab.world.stickmen.player.grounded')
        if not touch:
            page.locator('#about-btn').focus();page.keyboard.press('Space')
            assert page.locator('#about-dialog').is_visible()
            page.locator('#about-dialog .dialog-close').click()
            assert not page.evaluate('sandlab.state.paused')
        def position():return page.evaluate('''()=>{const w=sandlab.world,a=w.stickmen.player;return {across:a.x[2]*w.gravityY-a.y[2]*w.gravityX,down:a.x[2]*w.gravityX+a.y[2]*w.gravityY};}''')
        before=position(); walking_tick=page.evaluate("sandlab.world.tick")
        if touch:
            session=context.new_cdp_session(page);box=page.locator('.player-joystick').bounding_box()
            x=box['x']+box['width']/2;y=box['y']+box['height']/2
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=x+24,y=y,id=1)]))
            page.wait_for_function("tick=>sandlab.world.tick>=tick+40",arg=walking_tick)
            session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
            assert page.evaluate('sandlab.world.stickmen.controls.move')==0
        else:
            page.locator('#world').focus();page.keyboard.down('d');page.wait_for_function('tick=>sandlab.world.tick>=tick+40',arg=walking_tick);page.keyboard.up('d')
        after=position();assert after['across']>before['across']+5,(width,before,after)
        assert page.evaluate('sandlab.world.stickmen.bodies.length')==1
        page.wait_for_timeout(80);assert page.evaluate('sandlab.world.stickmen.controls.move')==0
        page.wait_for_timeout(450);stopped=position();page.wait_for_timeout(900)
        assert abs(position()['across']-stopped['across'])<.08,(width,stopped,position())
        if not touch:
            page.keyboard.down('a');page.wait_for_timeout(550);page.keyboard.up('a')
            page.wait_for_timeout(80);assert page.evaluate('sandlab.world.stickmen.controls.move')==0
            page.wait_for_timeout(450);stopped=position();page.wait_for_timeout(900)
            assert abs(position()['across']-stopped['across'])<.08,(width,stopped,position())
        # Space pauses an active Player and never jumps.
        if not touch:
            page.locator('#world').focus();page.keyboard.press('Space')
            assert page.evaluate('sandlab.state.paused && !sandlab.world.stickmen.controls.jump')
            page.keyboard.press('Space');assert not page.evaluate('sandlab.state.paused')
        # The custom jump key remains independent from movement and pause.
        before=position()
        if touch:
            assert page.locator('.player-jump').count()==0
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=x+24,y=y,id=1)]))
            session.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[dict(x=x+24,y=y-24,id=1)]))
            page.wait_for_timeout(30)
            assert page.evaluate('sandlab.world.stickmen.controls.move')>.5
            session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
        else:page.keyboard.press('w')
        page.wait_for_timeout(150);after=position()
        assert not page.evaluate('sandlab.state.paused')
        assert after['down']<before['down']-4,(width,before,after)
        page.wait_for_timeout(900)
        # Releasing the joystick re-arms jump; the custom desktop jump binding works again.
        before=position()
        if touch:
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=x,y=y-24,id=1)]))
            page.wait_for_timeout(30)
            session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
        else:page.keyboard.press('w')
        page.wait_for_timeout(150);after=position()
        assert after['down']<before['down']-4,(width,before,after)
        assert not page.evaluate('sandlab.state.paused')
        page.wait_for_timeout(900)
        # Walk over a real pixel staircase using keyboard/joystick input. Keep
        # the fixture gravity-relative so phone landscape tests the same climb.
        page.evaluate('''async()=>{
          sandlab.state.paused=true;
          const {M}=await import('./src/sim/materials.js');const w=sandlab.world;w.clear();
          const gx=w.gravityX,gy=w.gravityY,across=gy?w.width:w.height,down=gx?w.width:w.height;
          const map=(u,v)=>({x:gy*u+gx*v+(gy<0||gx<0?w.width-1:0),y:-gx*u+gy*v+(gx>0||gy<0?w.height-1:0)});
          const floor=Math.floor(down*.68),start=Math.floor(across*.3);
          for(let u=0;u<across;u++) {
            const height=Math.min(6,Math.max(0,Math.floor((u-start-5)/2)));
            for(let v=floor-height;v<down;v++){const q=map(u,v);w.set(q.y*w.width+q.x,M.Wall);}
          }
          const q=map(start,floor-2);w.stickmen.spawn(q.x,q.y,M.Player);
          for(let t=0;t<90;t++)w.step();sandlab.state.paused=false;
        }''')
        before=position()
        if touch:
            box=page.locator('.player-joystick').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=x+32,y=y,id=1)]))
        else:page.locator('#world').focus();page.keyboard.down('d')
        page.wait_for_function('target=>sandlab.world.tick>=target',arg=page.evaluate('sandlab.world.tick')+240,timeout=20000)
        if touch:session.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
        else:page.keyboard.up('d')
        after=position()
        assert after['across']>before['across']+12,(width,'Slope movement',before,after)
        assert after['down']<before['down']-3,(width,'Slope climb',before,after)
        assert page.evaluate('sandlab.world.stickmen.player.bonds.every(Boolean)')
        page.wait_for_function('target=>sandlab.world.tick>=target',arg=page.evaluate('sandlab.world.tick')+120,timeout=15000);stopped=position();page.wait_for_function('target=>sandlab.world.tick>=target',arg=page.evaluate('sandlab.world.tick')+60,timeout=10000)
        assert abs(position()['across']-stopped['across'])<.08,(width,'Slope braking',stopped,position())
        if not touch:
            page.locator('#player-control-toggle').click();page.locator('#world').focus();page.keyboard.press('Space')
            assert page.evaluate('sandlab.state.paused')
            page.keyboard.press('Space');assert not page.evaluate('sandlab.state.paused')
            page.locator('#player-control-toggle').click()
        # Pause and restore exact actor state through the app's save path.
        page.evaluate('sandlab.state.paused=true')
        actors=page.evaluate('sandlab.snapshot().stickmen')
        page.evaluate('()=>{const data=sandlab.snapshot();sandlab.world.clear();sandlab.restore(data);}')
        assert page.evaluate('sandlab.snapshot().stickmen')==actors
        # The new-canvas picker makes the playground usable without developer APIs.
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#new-canvas-btn').click();page.locator('#level-starter').select_option('stickmen');page.locator('#level-submit').click()
        assert page.evaluate('sandlab.world.stickmen.bodies.length')==2
        assert page.evaluate('sandlab.world.name')=='Stickman playground'
        page.wait_for_timeout(250)
        page.screenshot(path=str(ARTIFACTS/f'stickmen-{width}x{height}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'Player drawing, slope climbing, braking, jumping, controls ownership, rendering and saves passed: {width}x{height}',flush=True)
        context.close()
    browser.close()
