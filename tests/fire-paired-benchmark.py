"""Alternate two renderers on identical moving worlds to isolate optical cost.

Usage: python3 tests/fire-paired-benchmark.py /path/to/baseline
Run alone; browser timing is evidence, never a regression-test threshold.
"""
from pathlib import Path
import json
import mimetypes
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(sys.argv[1]).resolve()

def serve(route):
    old = route.request.url.startswith('http://sandlab.test/baseline/')
    name = route.request.url.split('.test/', 1)[-1].split('?')[0] or 'index.html'
    if old: name=name.removeprefix('baseline/')
    path = (BASELINE if old else ROOT) / name
    route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain',
                  headers={'Access-Control-Allow-Origin': '*'}) if path.is_file() else route.fulfill(status=404)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport=dict(width=1280, height=800))
    context.route('http://sandlab.test/**', serve)
    page = context.new_page()
    page.goto('http://sandlab.test/')
    page.wait_for_function('!!window.sandlab')
    result = page.evaluate('''async()=>{
      sandlab.state.paused=true;
      const {World}=await import('./src/sim/world.js'),{M}=await import('./src/sim/materials.js');
      const constructors=[(await import('./baseline/src/renderer.js')).Renderer,(await import('./src/renderer.js')).Renderer];
      const results=[];
      for(const scene of ['Fire plume','Dense fire and smoke','Burning wood']){
        const w=new World(320,200);w.ambientLight=.1;
        for(let x=0;x<320;x++)w.set(190*320+x,M.Wall);
        if(scene==='Burning wood')for(let y=155;y<190;y++)for(let x=20;x<300;x++)w.set(y*320+x,M.Wood);
        for(let y=80;y<150;y++)for(let x=40;x<280;x++)if((x+y)%3===0)w.set(y*320+x,scene==='Fire plume'?M.Smoke:M.Fire);
        if(scene==='Fire plume')for(let x=100;x<220;x+=5)w.set(148*320+x,M.Fire);
        for(let n=0;n<30;n++)w.step();
        const renderers=constructors.map(R=>{const c=document.createElement('canvas');c.style.cssText='width:1000px;height:625px';document.body.append(c);return new R(c,w)});
        const times=[[],[]];
        for(let frame=0;frame<70;frame++){
          if(frame%4===0)for(let x=100;x<220;x+=8)if(!w.cells[148*320+x])w.set(148*320+x,M.Fire);
          w.step();
          for(const k of frame%2?[1,0]:[0,1]){
            const r=renderers[k];r.lighting.frame=1;
            const start=performance.now();r.draw();if(frame>=10)times[k].push(performance.now()-start);
          }
        }
        const metric=values=>{values.sort((a,b)=>a-b);return {meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:values[Math.floor(values.length*.95)]}};
        results.push({scene,particles:w.count,before:metric(times[0]),after:metric(times[1])});
        for(const r of renderers){r.resizeObserver.disconnect();r.canvas.remove()}
      }
      return results;
    }''')
    browser.close()
print(json.dumps(result, indent=2))
