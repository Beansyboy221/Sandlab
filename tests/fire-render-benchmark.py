"""Compare complete fire rendering across checkouts, without concurrent tests.

Usage: python3 tests/fire-render-benchmark.py [checkout-directory] [--live]
The seeded simulation is prepared once; optical changes invalidate cached lighting
for every measured frame. No wall-clock thresholds belong in regression tests.
"""
from pathlib import Path
import json
import mimetypes
import sys
from playwright.sync_api import sync_playwright

arguments=[a for a in sys.argv[1:] if a != '--live']
ROOT = Path(arguments[0]).resolve() if arguments else Path(__file__).resolve().parents[1]
LIVE = '--live' in sys.argv[1:]

def serve(route):
    relative = route.request.url.split('sandlab.test/', 1)[-1].split('?')[0]
    path = ROOT / (relative or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport=dict(width=1280, height=800))
    context.route('http://sandlab.test/**', serve)
    page = context.new_page()
    page.goto('http://sandlab.test/')
    page.wait_for_function('!!window.sandlab')
    result = page.evaluate('''async (live) => {
      sandlab.state.paused = true;
      const {World} = await import('./src/sim/world.js');
      const {M} = await import('./src/sim/materials.js');
      const {Renderer} = await import('./src/renderer.js');
      const canvas = document.createElement('canvas');
      canvas.style.cssText='width:1000px;height:625px';
      document.body.append(canvas);
      const results=[];
      for (const scene of ['Fire plume', 'Dense fire and smoke', 'Burning wood']) {
        const w = new World(320, 200);
        w.ambientLight=0.1;
        for(let x=0;x<320;x++) w.set(190*320+x,M.Wall);
        if(scene==='Burning wood')
          for(let y=155;y<190;y++)for(let x=20;x<300;x++)w.set(y*320+x,M.Wood);
        for(let y=80;y<150;y++)for(let x=40;x<280;x++)
          if((x+y)%3===0)w.set(y*320+x,scene==='Fire plume'?M.Smoke:M.Fire);
        if(scene==='Fire plume')for(let x=100;x<220;x+=5)w.set(148*320+x,M.Fire);
        for(let t=0;t<30;t++)w.step();
        const r=new Renderer(canvas,w);r.profile.enabled=true;
        let emitter=w.cells.findIndex(id=>id===M.Fire);
        const times=[], ticks=[], stages=new Float64Array(10);
        const optical={};
        for(const name of ['gather','illuminate','bounce']) {const fn=r.lighting.field[name];r.lighting.field[name]=function(...args){const t=performance.now();const result=fn.apply(this,args);optical[name]=(optical[name]||0)+performance.now()-t;return result}}
        let traces=0;const trace=r.lighting.field.trace;
        r.lighting.field.trace=function(...args){traces++;return trace.apply(this,args)};
        for(let frame=0;frame<70;frame++) {
          if(live) {
            // Renew a small plume so moving-smoke timings stay comparable after
            // the initial free flames expire, rather than timing an empty scene.
            if(frame%4===0)for(let x=100;x<220;x+=8)if(!w.cells[148*320+x])w.set(148*320+x,M.Fire);
            const tickStart=performance.now();w.step();if(frame>=10)ticks.push(performance.now()-tickStart);
          } else if(emitter>=0)w.temp[emitter]=frame%2?650:2000;
          r.lighting.frame=1; // A real optical update, never a half-rate/cache hit.
          const start=performance.now();r.draw();
          if(frame>=10){times.push(performance.now()-start);for(let s=0;s<10;s++)stages[s]+=r.profile.times[s]}
        }
        times.sort((a,b)=>a-b);
        results.push({scene,particles:w.count,sources:r.lighting.field.sourceCount,
          meanMs:times.reduce((a,b)=>a+b,0)/times.length,simulationMs:ticks.length?ticks.reduce((a,b)=>a+b,0)/ticks.length:null,p95Ms:times[Math.floor(times.length*.95)],
          stages:Object.fromEntries(r.profile.labels.map((label,s)=>[label,stages[s]/times.length])),
          optical:Object.fromEntries(Object.entries(optical).map(([k,v])=>[k,v/70])),tracesPerFrame:traces/70, shadow:{filtered:r.lighting.field.shadows.filtered, exact:r.lighting.field.shadows.exactQueries, samples:r.lighting.field.shadows.samples, steps:r.lighting.field.shadows.raySteps}});
        r.resizeObserver.disconnect();
      }
      canvas.remove();return results;
    }''',LIVE)
    browser.close()
print(json.dumps(result, indent=2))
