"""Radial liquid settling and render integration on desktop and rotated touch layouts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, mimetypes
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

def serve(route):
    prefix = 'http://sandlab.test/'
    if not route.request.url.startswith(prefix):
        route.abort(); return
    path = ROOT / (route.request.url[len(prefix):].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                               args=['--no-sandbox', '--disable-dev-shm-usage'])
    results = []
    for width, height, mobile in [(1440,900,False),(390,844,True)]:
        context = browser.new_context(viewport={'width':width,'height':height},
                                      has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1)
        context.route('**/*',serve)
        page = context.new_page(); errors = []
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/')
        page.wait_for_function('() => !!window.sandlab')
        page.evaluate('''async()=>{
          sandlab.state.paused=true;sandlab.settings.set('autosave',false);sandlab.settings.set('canvasFill','fit');
          const {World}=await import('./src/sim/world.js');
          const {M}=await import('./src/sim/materials.js');
          const {snapshot}=await import('./src/persistence.js');
          const w=new World(120,100);w.canvasMode='planet';w.environment.update();
          for(let y=30;y<70;y++)for(let x=40;x<80;x++)w.set(y*120+x,M.Water);
          sandlab.restore(snapshot(w));sandlab.world.mechanics.temperatureSimulation=false;
          for(let n=0;n<700;n++)sandlab.world.step();
          window.poolMetrics=()=>{const w=sandlab.world,radii=new Float64Array(16);let count=0;
            for(let i=0;i<w.length;i++)if(w.cells[i]===M.Water){
              const x=i%w.width+.5-w.width/2,y=Math.floor(i/w.width)+.5-w.height/2;
              const sector=((Math.atan2(y,x)+Math.PI)*8/Math.PI)|0;
              radii[sector]=Math.max(radii[sector],Math.hypot(x,y));count++;
            }return{count,spread:Math.max(...radii)-Math.min(...radii),gravity:[w.gravityX,w.gravityY]};};
          sandlab.renderer.resize();sandlab.renderer.draw();
        }''')
        result = page.evaluate('poolMetrics()')
        assert result['count']==1600 and result['spread']<3,result
        page.screenshot(path=str(ARTIFACTS / ('planet-mobile-portrait.png' if mobile else 'planet-desktop.png')))
        results.append({'viewport':[width,height],**result})
        if mobile:
            page.set_viewport_size({'width':844,'height':390})
            page.wait_for_timeout(300)
            page.evaluate('''()=>{for(let n=0;n<150;n++)sandlab.world.step();sandlab.renderer.draw();}''')
            rotated = page.evaluate('poolMetrics()')
            assert rotated['count']==1600 and rotated['spread']<3,rotated
            assert rotated['gravity']!=result['gravity']
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(ARTIFACTS / 'planet-mobile-landscape.png'))
            results.append({'viewport':[844,390],**rotated})
        assert not errors,errors
        context.close()
    browser.close()
print(json.dumps(results))
