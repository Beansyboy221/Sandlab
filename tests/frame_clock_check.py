"""Drive real app RAF callbacks at reproducible high refresh rates."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes, json
ROOT = Path(__file__).resolve().parents[1]

def serve(route):
    prefix = 'http://sandlab.test/'
    if not route.request.url.startswith(prefix):
        route.abort(); return
    path = ROOT / (route.request.url[len(prefix):].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else: route.fulfill(status=404, body='not found')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--no-sandbox', '--disable-dev-shm-usage'])
    results=[]
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width':390 if mobile else 1440, 'height':844 if mobile else 900},
            is_mobile=mobile, has_touch=mobile)
        context.route('**/*',serve)
        context.add_init_script("""(() => {
          let time=0, sequence=0, queue=new Map();
          performance.now=()=>time;
          window.requestAnimationFrame=callback=>{queue.set(++sequence,callback);return sequence;};
          window.cancelAnimationFrame=id=>queue.delete(id);
          window.advanceFrame=dt=>{time+=dt;const callbacks=[...queue.values()];queue.clear();for(const cb of callbacks)cb(time);};
          localStorage.setItem('sandlab.settings.v1',JSON.stringify({speed:2,restoreLast:false,autosave:false}));
        })();""")
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/')
        page.wait_for_function('() => !!window.sandlab')
        assert page.evaluate('sandlab.state.speed')==1
        page.evaluate("() => {window.draws=0;const draw=sandlab.renderer.draw.bind(sandlab.renderer);sandlab.renderer.draw=()=>{draws++;draw();};}")
        for refresh in [60,120,144]:
            result=page.evaluate("""refresh => {
              const tick=sandlab.world.tick, render=draws;
              for(let i=0;i<refresh*2;i++)advanceFrame(1000/refresh);
              return {refresh,frames:draws-render,ticks:sandlab.world.tick-tick};
            }""",refresh)
            assert 119<=result['frames']<=120, result
            assert 119<=result['ticks']<=120, result
            results.append({'mobile':mobile,**result})
        page.locator('#play-btn').evaluate('e=>e.click()')
        result=page.evaluate("() => {const tick=sandlab.world.tick;for(let i=0;i<120;i++)advanceFrame(1000/120);return sandlab.world.tick-tick;}")
        assert result==0
        tick_before=page.evaluate('sandlab.world.tick')
        page.locator('#step-btn').evaluate('e=>e.click()')
        assert page.evaluate('sandlab.world.tick')==tick_before+1
        assert page.evaluate('sandlab.state.paused')
        result=page.evaluate("() => {const tick=sandlab.world.tick;advanceFrame(1000);return {ticks:sandlab.world.tick-tick,paused:sandlab.state.paused};}")
        assert result=={'ticks':0,'paused':True}
        page.locator('#speed').evaluate("e=>{e.value='0.5';e.dispatchEvent(new Event('change'));}")
        page.locator('#play-btn').evaluate('e=>e.click()')
        result=page.evaluate("() => {const tick=sandlab.world.tick;for(let i=0;i<240;i++)advanceFrame(1000/120);return sandlab.world.tick-tick;}")
        assert result==60,result
        result=page.evaluate("""() => {
          const tick=sandlab.world.tick, render=draws;
          Object.defineProperty(document,'hidden',{configurable:true,value:true});
          document.dispatchEvent(new Event('visibilitychange'));
          advanceFrame(100000);
          const unchanged=sandlab.world.tick===tick && draws===render;
          Object.defineProperty(document,'hidden',{configurable:true,value:false});
          document.dispatchEvent(new Event('visibilitychange'));
          return unchanged;
        }""")
        assert result
        result=page.evaluate("() => {const tick=sandlab.world.tick;advanceFrame(1000/60);return sandlab.world.tick-tick;}")
        assert result<=1
        assert not errors,errors
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        context.close()
    browser.close()
    print(json.dumps(results))
