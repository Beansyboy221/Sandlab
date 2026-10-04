"""Creature palette, audible stereo output, Echolocation and mobile layout."""
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
        if touch:page.locator('#palette-toggle').click()
        page.locator('[data-catalog=entities]').click()
        names=page.locator('.material-name').all_text_contents()
        assert all(name in names for name in ['Cat','Rabbit','Fish','Bird'])
        assert 'Sound' not in names and 'Light' not in names
        # Trusted interaction unlocks Web Audio; no autoplay bypass flag is used.
        page.get_by_role('button',name='Cat',exact=True).click()
        page.wait_for_function('sandlab.audio.context?.state==="running"')
        if touch and page.locator('#controls-toggle').get_attribute('aria-expanded')=='false':page.locator('#controls-toggle').click()
        page.locator('#view').select_option('echo');assert page.evaluate('sandlab.renderer.mode')=='echo'
        page.evaluate('''async()=>{const {M}=await import('./src/sim/materials.js');window.M=M;sandlab.world.clear();sandlab.renderer.resetView();sandlab.settings.set('autosave',false);sandlab.state.paused=false;}''')
        # Verify samples from the actual stereo graph, not just event diagnostics.
        page.evaluate('''()=>{const a=sandlab.audio,c=a.context;const split=c.createChannelSplitter(2);a.master.connect(split);window.meters=[c.createAnalyser(),c.createAnalyser()];meters.forEach((m,n)=>{m.fftSize=2048;split.connect(m,n);});}''')
        def explosion(u):
            page.evaluate('''u=>{sandlab.world.clear();sandlab.audio.lastVoices.length=0;const w=sandlab.world;const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),q=r.point(b.left+b.width*u,b.top+b.height*.4);w.explode(Math.max(1,Math.min(w.width-2,Math.floor(q.x))),Math.max(1,Math.min(w.height-2,Math.floor(q.y))),5);}''',u)
            page.wait_for_timeout(60)
            return page.evaluate('''()=>meters.map(m=>{const data=new Float32Array(m.fftSize);m.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);})''')
        left=explosion(.03);assert left[0]>.00005 and left[0]>left[1]*1.5,(width,left)
        page.wait_for_timeout(850)
        right=explosion(.97);assert right[1]>.00005 and right[1]>right[0]*1.5,(width,right)
        assert page.evaluate('sandlab.world.sound.active')
        page.screenshot(path=str(ARTIFACTS/f'echolocation-{width}x{height}.png'))
        # Player-relative panning follows the visual screen even after phone rotation.
        page.wait_for_timeout(850)
        pan=page.evaluate('''()=>{const w=sandlab.world;w.clear();const px=w.width*.3,py=w.height*.6;w.stickmen.spawn(px,py,M.Player);sandlab.playerControls.sync();sandlab.playerControls.enabled=false;const a=w.stickmen.player;const source={kind:'explosion',...(()=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),p=r.project(a.x[0],a.y[0]),d=r.canvas.width/b.width;return r.point(b.left+(p.x+100)/d,b.top+p.y/d);})(),strength:1,mass:4,tick:w.tick};w.sound.events.push(source);sandlab.audio.update(false);return sandlab.audio.lastVoices.at(-1).pan;}''')
        assert pan>.05,(width,pan)
        # Mute persists and leaves wave visualization working.
        page.evaluate('sandlab.settings.set("sound",false);sandlab.world.explode(20,20,5)');played=page.evaluate('sandlab.audio.played')
        page.wait_for_timeout(150);assert page.evaluate('sandlab.audio.played')==played
        assert page.evaluate('sandlab.world.sound.active')
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        page.locator('#new-canvas-btn').click();page.locator('#level-starter').select_option('wildlife');page.locator('#level-submit').click()
        assert page.evaluate('sandlab.world.stickmen.bodies.length')==4
        if touch and page.locator('#controls-toggle').get_attribute('aria-expanded')=='true':page.locator('#controls-toggle').click()
        page.wait_for_timeout(350)
        page.evaluate('sandlab.state.paused=true;sandlab.settings.set("view","normal")')
        bodies=page.evaluate('sandlab.snapshot().stickmen');page.evaluate('()=>{const save=sandlab.snapshot();sandlab.world.clear();sandlab.restore(save);}')
        assert page.evaluate('sandlab.snapshot().stickmen')==bodies
        page.screenshot(path=str(ARTIFACTS/f'creatures-{width}x{height}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        print(f'Creatures, audible stereo, player listener, Echolocation, mute and saves passed: {width}x{height}',flush=True)
        context.close()
    browser.close()
