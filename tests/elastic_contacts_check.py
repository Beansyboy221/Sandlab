"""Elastic pixel rendering, cuts, and live physics."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return {x:b.x+p.x/d,y:b.y+p.y/d}}''',[x,y])
def choose(page,tool):
    page.locator('#tool-picker-toggle').click();page.locator(f'[data-tool-option="{tool}"]').click()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=2)
    c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab');page.locator('#play-btn').click()
    page.evaluate("()=>{sandlab.settings.set('autosave',false);sandlab.world.clear();sandlab.world.set(30*sandlab.world.width+30,3)}")
    assert page.locator('.canvas-resize-handle').count()==0
    # Continuous joints and bridges share the material ImageData and composed view.
    page.evaluate('''async()=>{const {M}=await import('./src/sim/materials.js');window.elasticM=M;const w=sandlab.world;w.clear();w.set(50*w.width+40,M.Jelly);w.set(50*w.width+41,M.Jelly);w.swap(50*w.width+41,50*w.width+45);sandlab.state.setRadius(1);sandlab.renderer.cursor=null;sandlab.renderer.bloom=false;sandlab.renderer.draw();}''')
    assert page.evaluate("()=>{const r=sandlab.renderer,i=50*sandlab.world.width+40;return r.data.data[i*4]!==17||r.data.data[i*4+1]!==27||r.data.data[i*4+2]!==32}")
    def bridge_color():
      return page.evaluate('''()=>{const r=sandlab.renderer,p=r.project(43.5,50.5);return Array.from(r.context.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data).slice(0,3)}''')
    assert bridge_color()!=[17,27,32]
    # Lens and previews must still see the composed elastic layer.
    assert page.evaluate("()=>{const c=sandlab.renderer.worldImage().getContext('2d');return c.getImageData(43,50,1,1).data[0]>30}")
    page.locator('#view').select_option('heat');page.wait_for_timeout(100);assert bridge_color()!=[17,27,32]
    page.locator('#view').select_option('normal');choose(page,'erase')
    page.mouse.click(**point(page,43,50));page.evaluate('sandlab.renderer.cursor=null;sandlab.renderer.draw()')
    assert page.evaluate('sandlab.world.elastic.measure(50*sandlab.world.width+40).connections')==0
    assert page.evaluate('sandlab.world.count')==2
    assert bridge_color()==[17,27,32],bridge_color()
    page.locator('#undo-btn').click();assert page.evaluate('sandlab.world.elastic.measure(50*sandlab.world.width+40).connections')==1
    page.locator('#redo-btn').click();assert page.evaluate('sandlab.world.elastic.measure(50*sandlab.world.width+40).connections')==0
    page.evaluate('''()=>{const w=sandlab.world;w.clear();for(let y=10;y<20;y++)for(let x=100;x<115;x++)w.set(y*w.width+x,elasticM.Rubber);for(let n=0;n<130;n++)w.step();sandlab.renderer.draw();}''')
    assert page.evaluate('Math.min(...[...sandlab.world.elastic.locations.values()].map(i=>Math.floor(i/sandlab.world.width)))')>115
    page.screenshot(path=str(ROOT/'tests'/'artifacts'/'elastic-contact-motion.png'))
    assert not errors,errors;c.close()
    c=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    c.route('http://sandlab.test/**',serve);page=c.new_page();page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab')
    assert page.locator('.canvas-resize-handle:visible').count()==0
    page.locator('#palette-toggle').tap();page.locator('#categories').get_by_role('button',name='Powders',exact=True).tap()
    assert page.get_by_role('button',name='Fertilizer',exact=True).is_visible()
    page.locator('#categories').get_by_role('button',name='Flora',exact=True).tap();assert page.get_by_role('button',name='Fertilizer',exact=True).count()==0
    c.close();browser.close()
print(json.dumps({'shared_pixel_elastic_rendering':'pass','visible_link_cutting_and_history':'pass','thick_body_continuous_motion':'pass','mobile_palette_category':'pass'}))
