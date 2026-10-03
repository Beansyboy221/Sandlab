"""Cached rigid textures retain live color, holes, splits and fallback geometry."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import mimetypes
ROOT = Path(__file__).resolve().parents[1]
def serve(route):
 path=ROOT/(route.request.url.split('sandlab.test/',1)[-1].split('?')[0] or 'index.html')
 route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
 b = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
 c = b.new_context(viewport={'width': 1440, 'height': 900})
 c.route('http://sandlab.test/**', serve)
 page = c.new_page()
 errors = []
 page.on('pageerror', lambda e: errors.append(str(e)))
 page.goto('http://sandlab.test/')
 page.wait_for_function('!!window.sandlab')
 result=page.evaluate('''async()=>{
 sandlab.state.paused=true;
 const {World}=await import('./src/sim/world.js'),{M}=await import('./src/sim/materials.js'),{drawRigidBodies}=await import('./src/sim/rigid-renderer.js'),{rigidTextureWork}=await import('./src/sim/rigid-textures.js');
 const w=new World(64,64);
 for(let y=10;y<18;y++)for(let x=10;x<22;x++)w.set(y*64+x,M.Steel);
 w.rigid.rebuild();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d'),view={x:0,y:0,scale:4},colors=new Uint8ClampedArray(w.length*3);
 for(let i=0;i<w.length;i++){colors[i*3]=150;colors[i*3+1]=80;colors[i*3+2]=20;}
 const draw=()=>{ctx.clearRect(0,0,256,256);drawRigidBodies(ctx,w,view,colors);return {...rigidTextureWork};}, pixel=(x,y)=>Array.from(ctx.getImageData(x*4+2,y*4+2,1,1).data);
 const first=draw(), original=pixel(14,14), second=draw();colors[(14*64+14)*3]=33;
 const changed=draw(), recolored=pixel(14,14);
 w.set(14*64+14,0);
 const cut=draw(), hole=pixel(14,14);
 for(let y=10;y<18;y++)w.set(y*64+16,0);
 const split=draw();
 const body=w.rigid.bodies[0], i=w.rigid.locations.get(body.ids[0]);
 w.restX[i]+=.25;
 w.rigid.dirty=true;
 const fallback=draw();
 sandlab.world.clear();
 sandlab.world.set(40*sandlab.world.width+40,M.Steel);
 sandlab.world.profile.enabled=sandlab.renderer.profile.enabled=true;
 sandlab.world.step();
 sandlab.renderer.draw();
 return {first,second,changed,cut,split,fallback,original,recolored,hole,renderTimes:Array.from(sandlab.renderer.profile.times),simTimes:Array.from(sandlab.world.profile.times)};
 }''')
 assert result['first']['uploads']==1 and result['first']['draws']==1,result
 assert result['second']['uploads']==0 and result['second']['fallbackCells']==0,result
 assert result['original']==[150,80,20,255] and result['recolored']==[33,80,20,255],result
 assert result['changed']['uploads']==1 and result['hole'][3]==0,result
 assert result['split']['draws']==2 and result['fallback']['fallbackCells']>0,result
 assert all(v>=0 for v in result['renderTimes']+result['simTimes']) and sum(result['renderTimes'])>0,result
 assert not errors,errors
 b.close()
print(json.dumps({'texture_reuse_live_color_cuts_splits':'pass','non_grid_geometry_fallback':'pass','stage_diagnostics':'pass'}))
