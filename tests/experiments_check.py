"""Rendering, bloom, and preset checks in a real browser."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts'
ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    prefix='http://sandlab.test/'
    if not route.request.url.startswith(prefix):route.abort();return
    path=ROOT/(route.request.url[len(prefix):].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.route('**/*',serve)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://sandlab.test/')
    page.wait_for_function('() => (window.sandlab !== undefined)')
    page.evaluate('sandlab.state.paused=true')
    for id in ['storm','garden','foundry','phase','acid','firebreak','absorption','reactions','pottery']:
        page.evaluate('''id=>{sandlab.loadPreset(id);for(let n=0;n<180;n++)sandlab.world.step();sandlab.renderer.draw();}''',id)
        page.locator('#world').screenshot(path=str(ARTIFACTS/f'preset-{id}.png'))
    result=page.evaluate('''()=>{
      const {world:w,renderer:r}=sandlab;w.clear();w.brush(160,100,8,5);r.bloom=false;r.draw();
      const before=r.context.getImageData(0,0,r.canvas.width,r.canvas.height).data;
      r.bloom=true;r.draw();const after=r.context.getImageData(0,0,r.canvas.width,r.canvas.height).data;
      let brighter=0;for(let i=0;i<before.length;i+=4)if(after[i]>before[i] || after[i+1]>before[i+1])brighter++;
      const times=[];for(let n=0;n<40;n++){let start=performance.now();r.draw();times.push(performance.now()-start);}
      times.sort((a,b)=>a-b);r.mode='heat';r.draw();const heatOn=r.canvas.toDataURL();r.bloom=false;r.draw();const heatOff=r.canvas.toDataURL();
      return {brighterPixels:brighter,meanRenderMs:times.reduce((a,b)=>a+b)/times.length,p95RenderMs:times[38],heatUnchanged:heatOn===heatOff};
    }''')
    assert result['brighterPixels']>100
    assert result['heatUnchanged']
    assert not errors,errors
    print(json.dumps({'presets':'pass','bloom':result,'runtime_errors':errors}))
    browser.close()
