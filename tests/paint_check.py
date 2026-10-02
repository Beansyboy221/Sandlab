"""Paint layers, picker inputs, opacity, history, geometry, and mobile touch."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,mimetypes
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return {x:b.x+p.x/d,y:b.y+p.y/d}}''',[x,y])
def choose(page,tool,touch=False):
    action='tap' if touch else 'click'
    getattr(page.locator('#tool-picker-toggle'),action)();getattr(page.locator(f'[data-tool-option="{tool}"]'),action)()
def pixel(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.cursor=null;r.draw();const c=document.createElement('canvas');c.width=sandlab.world.width;c.height=sandlab.world.height;const ctx=c.getContext('2d');ctx.drawImage(r.buffer,0,0);r.drawElastics(ctx,{x:0,y:0,scale:1});return Array.from(ctx.getImageData(x,y,1,1).data.slice(0,3))}''',[x,y])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=2);c.route('http://sandlab.test/**',serve)
    page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab');page.locator('#play-btn').click()
    page.evaluate('''async()=>{const{M}=await import('./src/sim/materials.js');window.paintM=M;const w=sandlab.world;w.clear();sandlab.settings.set('autosave',false);for(let x=30;x<70;x++)w.set(40*w.width+x,M.Stone);sandlab.state.setRadius(2);}''')
    choose(page,'recolor');assert page.locator('#palette-toggle').is_hidden();assert page.locator('#paint-color').is_visible()
    page.locator('#paint-color').click();assert page.locator('#color-dialog').is_visible()
    page.locator('#color-hex').fill('#f03');assert page.evaluate('sandlab.state.color')=='#ff0033'
    page.locator('#color-hex').fill('nones');assert page.locator('#color-hex').get_attribute('aria-invalid')=='true';assert page.evaluate('sandlab.state.color')=='#ff0033'
    page.locator('#color-hex').fill('#ff0033');page.locator('#color-opacity').fill('50');assert page.evaluate('sandlab.state.colorOpacity')==.5
    page.locator('#color-dialog .dialog-close').last.click()
    before=page.evaluate('JSON.stringify(sandlab.snapshot())');empty=point(page,25,30);page.mouse.click(**empty)
    assert page.evaluate('sandlab.world.pigment.some(Boolean)')==False;assert page.evaluate('sandlab.world.count')==40
    start=point(page,35,40);end=point(page,60,40);page.mouse.move(**start);page.mouse.down();page.mouse.move(**end,steps=35);page.wait_for_timeout(100);page.mouse.up()
    alpha=page.evaluate('Array.from(sandlab.world.pigment).filter(Boolean).map(c=>c>>>24)');assert alpha and set(alpha)=={128},set(alpha)
    count=page.evaluate('sandlab.world.count');painted=page.evaluate('JSON.stringify(sandlab.snapshot())')
    page.locator('#undo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())')==before
    page.locator('#redo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())')==painted
    natural=pixel(page,50,40);assert natural[0]>natural[1]+35,natural
    page.locator('#view').select_option('heat');heat=pixel(page,50,40)
    page.evaluate('window.coat=sandlab.world.pigment[40*sandlab.world.width+50];sandlab.world.pigment[40*sandlab.world.width+50]=0')
    assert pixel(page,50,40)==heat
    page.evaluate('sandlab.world.pigment[40*sandlab.world.width+50]=coat');page.locator('#view').select_option('normal')
    page.mouse.click(**point(page,50,40),button='right');assert page.evaluate('sandlab.world.pigment[40*sandlab.world.width+50]')==0;assert page.evaluate('sandlab.world.count')==count
    page.locator('#paint-layer').select_option('background');page.locator('#paint-color').click();page.locator('#color-hex').fill('#00ff00');page.locator('#color-opacity').fill('100');page.locator('#color-dialog .dialog-close').last.click()
    page.mouse.click(**point(page,50,60));assert pixel(page,50,60)==[0,255,0]
    background=page.evaluate('JSON.stringify(Array.from(sandlab.world.backgroundPaint))');page.evaluate('for(let n=0;n<20;n++)sandlab.world.step()')
    assert page.evaluate('JSON.stringify(Array.from(sandlab.world.backgroundPaint))')==background
    page.locator('#paint-erase').click();page.mouse.click(**point(page,50,60));assert pixel(page,50,60)==[17,27,32];assert page.evaluate('sandlab.world.count')==count
    page.locator('#undo-btn').click();assert pixel(page,50,60)==[0,255,0];page.locator('#paint-erase').click()
    # Shape shortcuts must also paint without creating matter.
    page.keyboard.down('Shift');page.mouse.move(**point(page,80,70));page.mouse.down();page.mouse.move(**point(page,110,70));page.mouse.up();page.keyboard.up('Shift')
    assert page.evaluate('sandlab.world.backgroundPaint[70*sandlab.world.width+100]')==0xff00ff00
    assert page.evaluate('sandlab.world.count')==count
    # Palette, RGB inputs, sliders and wheel all synchronize the selected color.
    page.locator('#paint-color').click();page.locator('[data-color-tab="palette"]').click();page.get_by_role('button',name='#edcd77',exact=True).click();assert page.evaluate('sandlab.state.color')=='#edcd77'
    page.locator('[data-color-tab="picker"]').click();page.locator('#color-r').fill('10');page.locator('#color-g').fill('20');page.locator('#color-b').fill('30');assert page.evaluate('sandlab.state.color')=='#0a141e'
    page.locator('#color-v').fill('100');page.locator('#color-s').fill('100');page.locator('#color-h').fill('240');assert page.evaluate('sandlab.state.color')=='#0000ff'
    wheel=page.locator('#color-wheel').bounding_box();page.mouse.click(wheel['x']+wheel['width']*.95,wheel['y']+wheel['height']*.5);assert page.evaluate('sandlab.state.color').startswith('#ff')
    page.screenshot(path=str(ROOT/'tests'/'artifacts'/'paint-picker-desktop.png'));page.locator('#color-dialog .dialog-close').last.click()
    # Export/import and image previews include the exact two layers.
    page.evaluate('''async()=>{const{pack,unpack}=await import('./src/persistence.js');const saved=sandlab.snapshot();sandlab.world.clear();sandlab.restore(unpack(pack(saved)));window.paintSaved=saved;}''')
    assert page.evaluate('JSON.stringify(sandlab.snapshot())===JSON.stringify(paintSaved)')
    assert page.evaluate("()=>{const c=sandlab.renderer.worldImage().getContext('2d');sandlab.renderer.draw();return c.getImageData(100,70,1,1).data[1]===255}")
    page.keyboard.press('b');assert page.evaluate('sandlab.state.tool')=='paint';page.keyboard.press('o');assert page.evaluate('sandlab.state.tool')=='recolor'
    assert not errors,errors;c.close()
    for width,height in [(390,844),(844,390),(320,640)]:
        c=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,device_scale_factor=3);c.route('http://sandlab.test/**',serve)
        page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
        if page.evaluate('!sandlab.state.paused'):page.locator('#play-btn').tap()
        choose(page,'recolor',True);assert page.locator('#paint-color').is_visible();page.locator('#paint-layer').select_option('background')
        page.locator('#paint-color').tap();wheel=page.locator('#color-wheel').bounding_box();page.touchscreen.tap(wheel['x']+wheel['width']*.9,wheel['y']+wheel['height']*.5)
        page.locator('#color-hex').fill('#8040ff');page.locator('#color-opacity').fill('60')
        page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'paint-picker-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        dialog=page.locator('#color-dialog').bounding_box();assert dialog['x']>=0 and dialog['x']+dialog['width']<=width+1
        page.locator('#color-dialog .dialog-close').last.tap()
        # Expand/collapse preserves a large reachable painting area.
        page.locator('#controls-toggle').tap();page.evaluate('sandlab.world.clear();sandlab.state.setRadius(3)')
        page.touchscreen.tap(**point(page,50,50));assert page.evaluate('sandlab.world.backgroundPaint.some(Boolean)');assert page.evaluate('sandlab.world.count')==0
        c.close()
    browser.close();assert not errors,errors
print(json.dumps({'foreground_and_background':'pass','opacity_physics_history':'pass','picker_rgb_hex_hsv_palette':'pass','paint_erase_geometry_shortcuts':'pass','export_import_previews':'pass','touch_portrait_landscape_small_phone':'pass'}))
