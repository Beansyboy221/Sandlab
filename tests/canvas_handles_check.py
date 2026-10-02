"""Desktop canvas handles, elastic vector rendering, cuts, and live physics."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),v=r.viewport,d=r.canvas.width/b.width;return {x:b.x+(v.x+(x+.5)*v.scale)/d,y:b.y+(v.y+(y+.5)*v.scale)/d}}''',[x,y])
def choose(page,tool):
    page.locator('#tool-picker-toggle').click();page.locator(f'[data-tool-option="{tool}"]').click()
def drag_handle(page,handle,dx,dy,cancel=False,shift=False):
    page.wait_for_timeout(120)
    b=page.locator(f'[data-resize-handle="{handle}"]').bounding_box();assert b
    scale=page.evaluate('sandlab.renderer.viewport.scale / (sandlab.renderer.canvas.width / sandlab.renderer.canvas.getBoundingClientRect().width)')
    start={'x':b['x']+b['width']/2,'y':b['y']+b['height']/2}
    page.mouse.move(**start);page.mouse.down()
    if shift:page.keyboard.down('Shift')
    page.mouse.move(start['x']+dx*scale,start['y']+dy*scale,steps=5)
    assert page.locator('.canvas-resize-outline').is_visible()
    if cancel:page.keyboard.press('Escape')
    page.mouse.up()
    if shift:page.keyboard.up('Shift')
    page.wait_for_timeout(150)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=2)
    c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab');page.locator('#play-btn').click()
    page.evaluate("()=>{sandlab.settings.set('autosave',false);sandlab.world.clear();sandlab.world.set(30*sandlab.world.width+30,3)}")
    assert page.locator('.canvas-resize-handle:visible').count()==8
    before=page.evaluate('JSON.stringify(sandlab.snapshot())')
    drag_handle(page,'e',-20,0);assert page.evaluate('sandlab.world.width')==300
    assert page.evaluate('sandlab.world.cells[30*300+30]')==3
    page.locator('#undo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())')==before
    page.locator('#redo-btn').click();assert page.evaluate('sandlab.world.width')==300
    page.locator('#undo-btn').click()
    drag_handle(page,'nw',10,8);assert page.evaluate('[sandlab.world.width,sandlab.world.height]')==[310,192]
    assert page.evaluate('sandlab.world.cells[22*310+20]')==3
    page.locator('#undo-btn').click();drag_handle(page,'se',-12,-10,cancel=True)
    assert page.evaluate('JSON.stringify(sandlab.snapshot())')==before
    assert not page.locator('.canvas-resize-outline').is_visible()
    page.locator('[data-resize-handle="s"]').focus();page.keyboard.press('Enter');assert page.locator('#level-dialog').is_visible();page.locator('#level-dialog .dialog-close').first.click()
    # Continuous joints and bridges are absent from the powder ImageData but present in the composed view.
    page.evaluate('''async()=>{const {M}=await import('./src/sim/materials.js');window.elasticM=M;const w=sandlab.world;w.clear();w.set(50*w.width+40,M.Jelly);w.set(50*w.width+41,M.Jelly);w.swap(50*w.width+41,50*w.width+45);sandlab.state.setRadius(1);sandlab.renderer.cursor=null;sandlab.renderer.bloom=false;sandlab.renderer.draw();}''')
    assert page.evaluate("()=>{const r=sandlab.renderer,i=50*sandlab.world.width+40;return r.data.data[i*4]===17&&r.data.data[i*4+1]===27&&r.data.data[i*4+2]===32}")
    def bridge_color():
      return page.evaluate('''()=>{const r=sandlab.renderer,v=r.viewport;return Array.from(r.context.getImageData(Math.floor(v.x+43.5*v.scale),Math.floor(v.y+50.5*v.scale),1,1).data).slice(0,3)}''')
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
    page.screenshot(path=str(ROOT/'tests'/'artifacts'/'elastic-motion-handles.png'))
    assert not errors,errors;c.close()
    c=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    c.route('http://sandlab.test/**',serve);page=c.new_page();page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
    assert page.locator('.canvas-resize-handle:visible').count()==0
    page.locator('#palette-toggle').tap();page.locator('#categories').get_by_role('button',name='Powders',exact=True).tap()
    assert page.get_by_role('button',name='Fertilizer',exact=True).is_visible()
    page.locator('#categories').get_by_role('button',name='Life',exact=True).tap();assert page.get_by_role('button',name='Fertilizer',exact=True).count()==0
    c.close();browser.close()
print(json.dumps({'desktop_edge_corner_drag':'pass','crop_expansion_history_cancel':'pass','separate_continuous_elastic_rendering':'pass','visible_link_cutting_and_history':'pass','thick_body_continuous_motion':'pass','mobile_palette_category':'pass'}))
