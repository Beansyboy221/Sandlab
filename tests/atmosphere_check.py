"""Rendered CO2 reactions and atmospheric views on desktop and touch phones."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    file=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'text/plain') if file.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,touch in [(1440,900,False),(390,844,True),(320,640,True)]:
        c=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,device_scale_factor=2);c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab');page.locator('#play-btn').click()
        assert page.locator('#draw-temperature').count()==0
        assert page.locator('#palette #replace').count()==0
        assert page.locator('.material-controls #replace').count()==1
        assert page.locator('#replace-property').is_visible()
        page.evaluate('sandlab.world.clear();sandlab.state.material=1;sandlab.state.setRadius(1);sandlab.world.brush(50,80,2,3)')
        def target():return page.evaluate('''()=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),p=r.project(50.5,80.5),d=r.canvas.width/b.width;return {x:b.x+p.x/d,y:b.y+p.y/d}}''')
        page.mouse.click(**target());assert page.evaluate('sandlab.world.cells[80*sandlab.world.width+50]')==3
        page.locator('#replace-property').click();assert page.locator('#replace').is_checked();page.mouse.click(**target());assert page.evaluate('sandlab.world.cells[80*sandlab.world.width+50]')==1
        page.locator('#replace-property').click();page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option="wind"]').click();assert page.locator('#replace-property').is_hidden()
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option="paint"]').click()
        if touch and page.locator('#controls-toggle').get_attribute('aria-expanded')=='true':page.locator('#controls-toggle').click()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.evaluate('sandlab.settings.set("autosave",false);sandlab.loadPreset("reactions")')
        data=page.evaluate('''async()=>{const {M}=await import('./src/sim/materials.js');for(let n=0;n<30;n++)sandlab.world.step();sandlab.renderer.draw();const w=sandlab.world;return {co2:w.cells.filter(v=>v===M['CO2']).length,pressure:Math.max(...w.fields.pressure),fire:w.cells.filter(v=>v===M.Fire).length}}''')
        assert data['co2']>10 and data['pressure']>1,data
        assert page.locator('button.material').filter(has_text='Methane').count()==1
        assert page.get_by_role('button',name='Gas',exact=True).count()==0
        page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'co2-reactions-{width}.png'))
        page.evaluate('''async()=>{const{snapshot,restore}=await import('./src/persistence.js');window.foamBefore=JSON.stringify(snapshot(sandlab.world));const save=snapshot(sandlab.world);sandlab.world.clear();restore(sandlab.world,save);if(JSON.stringify(snapshot(sandlab.world))!==foamBefore)throw Error('Reaction lost its particles or air temperature');sandlab.world.clear();const w=sandlab.world;w.fields.temperature[w.fields.index(20,20)]=400;sandlab.renderer.mode='heat';sandlab.renderer.draw();}''')
        pixel=page.evaluate('()=>{const r=sandlab.renderer,o=(20*r.world.width+20)*4;return Array.from(r.data.data.slice(o,o+3))}');far=page.evaluate('Array.from(sandlab.renderer.data.data.slice(0,3))');assert pixel!=far
        page.evaluate("sandlab.renderer.mode='pressure';sandlab.world.fields.add(20,20,20);sandlab.renderer.draw()");assert not errors,errors
        c.close()
    browser.close()
print(json.dumps({'gas_generating_reaction_visuals':'pass','specific_material_palette':'pass','co2_and_air_state_roundtrip':'pass','empty_air_temperature_and_pressure_views':'pass','desktop_mobile':'pass'}))
