"""Collision-aligned solids and shared pixel bodies on desktop and rotated touch."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,mimetypes
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    prefix='http://sandlab.test/'
    if not route.request.url.startswith(prefix):route.abort();return
    path=ROOT/(route.request.url[len(prefix):].split('?')[0]or'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0]or'text/plain')if path.is_file()else route.fulfill(status=404)
with sync_playwright()as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    results=[]
    for width,height,mobile in [(1440,900,False),(390,844,True),(844,390,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=mobile,is_mobile=mobile,device_scale_factor=2)
        context.route('**/*',serve);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('()=>!!window.sandlab')
        result=page.evaluate('''async()=>{
          const {M}=await import('./src/sim/materials.js');const {world:w,renderer:r}=sandlab;
          sandlab.state.paused=true;sandlab.settings.set('autosave',false);sandlab.settings.set('canvasFill','fit');
          w.clear();r.bloom=false;r.mode='heat';r.cursor=null;w.setGravity(0,1);
          for(let y=20;y<28;y++)for(let x=40;x<55;x++)w.set(y*w.width+x,M.Steel,800);
          w.rigid.rebuild();const body=w.rigid.bodies[0],pose=w.rigid.pose(body);pose.angle=.43;pose.x+=.27;
          if(w.rigid.plan(body,pose))throw Error('Unexpected body contact');w.rigid.commit(body,pose);
          const snapshot=sandlab.snapshot();r.draw();let mismatches=0;
          const actual=r.ctx.getImageData(0,0,w.width,w.height).data;
          for(let i=0;i<w.length;i++)if(w.cells[i]===M.Steel)for(let c=0;c<3;c++)if(actual[i*4+c]!==r.data.data[i*4+c])mismatches++;
          const id=body.ids[20],i=w.rigid.locations.get(id);w.set(i,0);r.draw();
          const cut=r.ctx.getImageData(i%w.width,Math.floor(i/w.width),1,1).data;
          const hole=Array.from(cut).slice(0,3).every((value,c)=>value===r.data.data[i*4+c]);
          const colorAt=[...w.rigid.locations.values()][0];w.pigment[colorAt]=0xffff0033;r.mode='normal';r.draw();
          const painted=r.ctx.getImageData(colorAt%w.width,Math.floor(colorAt/w.width),1,1).data;
          for(let x=75;x<88;x++)w.set(24*w.width+x,M.Rope);
          w.stickmen.spawn(100,60,M.Player);w.stickmen.spawn(120,60,M.Cat);
          w.missiles.spawn(135,50,1,0,M.Drone);w.missiles.spawn(160,50,1,0,M['Guided Missile']);
          let screenPaths=0,bodyPaths=0;
          const proto=CanvasRenderingContext2D.prototype,original=proto.ellipse;
          proto.ellipse=function(...args){if(this===r.context)screenPaths++;if(this===r.ctx)bodyPaths++;return original.apply(this,args);};
          r.draw();proto.ellipse=original;
          const before=JSON.stringify(sandlab.snapshot());r.draw();r.worldImage();const unchanged=JSON.stringify(sandlab.snapshot())===before;
          const exports=r.worldImage();const sameResolution=exports.width===w.width&&exports.height===w.height;
          r.profile.enabled=true;r.draw();
          return{mismatches,hole,painted:Array.from(painted),screenPaths,bodyPaths,unchanged,sameResolution,solidCells:w.rigid.locations.size,renderTimes:Array.from(r.profile.times)};
        }''')
        assert result['mismatches']==0 and result['hole'],result
        assert result['painted'][0]>result['painted'][1],result
        assert result['screenPaths']==0 and result['bodyPaths']>0,result
        assert result['unchanged'] and result['sameResolution'],result
        assert all(v>=0 for v in result['renderTimes']),result
        assert not errors,errors
        page.screenshot(path=str(ARTIFACTS/f'unified-scene-{width}x{height}.png'))
        results.append({'viewport':[width,height],**result});context.close()
    browser.close()
print(json.dumps(results))
