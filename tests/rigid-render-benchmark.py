"""Full scene rendering across optional checkouts, with identical bodies and viewport."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,mimetypes,sys
ROOT=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[-1].split('?')[0]or'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0]or'text/plain')if path.is_file()else route.fulfill(status=404)
with sync_playwright()as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
    context.route('http://sandlab.test/**',serve);page=context.new_page();page.goto('http://sandlab.test/');page.wait_for_function('()=>!!window.sandlab')
    result=page.evaluate('''async()=>{
      const {M}=await import('./src/sim/materials.js');const {world:w,renderer:r}=sandlab;
      sandlab.state.paused=true;r.mode='heat';r.bloom=false;r.cursor=null;
      const results=[];
      for(const material of [M.Steel,M.Rubber]){
        w.clear();for(let y=10;y<110;y++)for(let x=50;x<210;x++)w.set(y*w.width+x,material);
        w.rigid.rebuild();const times=[];
        for(let frame=0;frame<90;frame++){const start=performance.now();r.draw();if(frame>=20)times.push(performance.now()-start);}
        times.sort((a,b)=>a-b);results.push({material,particles:w.count,samples:times.length,meanMs:times.reduce((a,b)=>a+b)/times.length,p95Ms:times[Math.floor(times.length*.95)]});
      }return results;
    }''')
    browser.close()
print(json.dumps(result))
