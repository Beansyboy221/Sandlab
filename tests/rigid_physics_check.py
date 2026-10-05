"""Paint and render a rolling solid using the actual desktop/mobile app."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests/artifacts'
ARTIFACTS.mkdir(exist_ok=True)

def serve(route):
    path = ROOT / (route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height, touch in [(1440,900,False), (390,844,True), (844,390,True)]:
        context = browser.new_context(viewport=dict(width=width,height=height), is_mobile=touch, has_touch=touch, device_scale_factor=2)
        context.route('http://sandlab.test/**', serve)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://sandlab.test/')
        page.wait_for_function('() => !!window.sandlab')
        page.evaluate('sandlab.state.paused=true;sandlab.settings.set("autosave",false)')
        page.wait_for_timeout(200)
        start = page.evaluate('''async()=>{
          const {M}=await import('./src/sim/materials.js');window.mat=M;
          const {world:w,renderer:r,state:s}=sandlab;w.clear();r.resetView();
          const gx=w.gravityX,gy=w.gravityY,uSize=gy?w.width:w.height,vSize=gx?w.width:w.height;
          window.gravity=[gx,gy];
          const map=(u,v)=>({x:gy*u+gx*v+(gy<0||gx<0?w.width-1:0),y:-gx*u+gy*v+(gx>0||gy<0?w.height-1:0)});
          for(let u=0;u<uSize;u++)for(let v=Math.floor(vSize*.45+u*.22);v<vSize;v++){const p=map(u,v);w.set(p.y*w.width+p.x,M.Wall);}
          s.tool="paint";s.material=M.Steel;s.radius=6;s.shape="circle";
          const pos=map(30,15);r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(pos.x+.5,pos.y+.5);
          return {x:b.x+p.x/d,y:b.y+p.y/d};
        }''')
        if touch:
            page.touchscreen.tap(**start)
        else:
            page.mouse.click(**start)
        assert page.evaluate('sandlab.world.rigid.locations.size') == 113
        result = page.evaluate('''()=>{
          const w=sandlab.world;w.rigid.rebuild();const body=w.rigid.bodies[0],start=w.rigid.pose(body);
          let angle=start.angle,turn=0;
          for(let n=0;n<130;n++){w.step();const pose=w.rigid.pose(body);turn+=Math.atan2(Math.sin(pose.angle-angle),Math.cos(pose.angle-angle));angle=pose.angle;}
          const pose=w.rigid.pose(body),[gx,gy]=gravity;sandlab.renderer.draw();
          return {across:(pose.x-start.x)*gy-(pose.y-start.y)*gx,turn,nodes:w.rigid.locations.size};
        }''')
        assert result['across'] > 20 and abs(result['turn']) > 2, (width,result)
        assert result['nodes'] == 113
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(ARTIFACTS / f'rolling-solids-{width}x{height}.png'))
        assert not errors, errors
        context.close()
    browser.close()
print('Drawing and continuous rigid rendering passed for rolling solids on desktop, portrait and rotated landscape mobile.')
