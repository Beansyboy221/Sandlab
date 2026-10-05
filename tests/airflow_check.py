"""Wind controls, atmospheric persistence and diagnostic rendering on desktop and phones."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,mimetypes
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'tests'/'artifacts';ART.mkdir(exist_ok=True)
def serve(route):
    prefix='http://sandlab.test/'
    if not route.request.url.startswith(prefix):route.abort();return
    file=ROOT/(route.request.url[len(prefix):].split('?')[0] or 'index.html')
    if file.is_file():route.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'text/plain')
    else:route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    results=[]
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        c=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,device_scale_factor=2)
        c.route('**/*',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab')
        page.evaluate('sandlab.settings.set("autosave",false)')
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option="wind"]').click()
        if touch and page.locator('#controls-toggle').get_attribute('aria-expanded')!='true':page.locator('#controls-toggle').click()
        assert page.locator('#direction-property').count()==0
        assert page.locator('#power-property').is_visible()
        assert page.locator('#palette-toggle').is_hidden()
        if not page.evaluate('sandlab.state.paused'):page.locator('#play-btn').click()
        page.evaluate('sandlab.world.clear();sandlab.state.setRadius(8)')
        if touch:page.locator('#controls-toggle').click()
        def point(x,y):
            return page.evaluate('''([x,y])=>{const r=sandlab.renderer,b=r.canvas.getBoundingClientRect(),p=r.project(x,y),d=r.canvas.width/b.width;return{x:b.x+p.x/d,y:b.y+p.y/d}}''',[x,y])
        a=point(60,60);b=point(90,74)
        air=lambda:page.evaluate('JSON.stringify({pressure:sandlab.snapshot().pressure,atmosphere:sandlab.snapshot().atmosphere})')
        before=air()
        if touch:
            session=c.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(a,id=1)]})
        else:page.mouse.move(**a);page.mouse.down()
        page.wait_for_timeout(100)
        assert air()==before,'A stationary Blow press must leave the air unchanged'
        assert page.locator('#undo-btn').is_disabled(),'A stationary press must not add history'
        if touch:
            for n in range(1,6):
                q={k:a[k]+(b[k]-a[k])*n/5 for k in a}
                session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dict(q,id=1)]})
        else:page.mouse.move(**b,steps=5)
        page.wait_for_function('''b=>{const target=sandlab.renderer.point(b.x,b.y);return Array.from(sandlab.controller.input.pointers.values()).some(p=>Math.hypot(p.x-target.x,p.y-target.y)<.5)}''',arg=b)
        moving=air()
        assert moving!=before and page.evaluate('sandlab.world.count===0'), {'viewport':[width,height],'air_changed':moving!=before,'state':page.evaluate('({tool:sandlab.state.tool,paused:sandlab.state.paused,count:sandlab.world.count,mechanics:sandlab.world.mechanics})'),'points':[a,b]}
        page.wait_for_timeout(100)
        assert air()==moving,'Holding after a stroke must not repeat the last impulse'
        if touch:session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        else:page.mouse.up()
        page.wait_for_timeout(100);assert air()==moving
        if touch:page.locator('#controls-toggle').click()
        page.locator('#undo-btn').click();assert air()==before
        page.locator('#redo-btn').click();assert air()==moving
        if touch:page.locator('#controls-toggle').click()
        assert page.locator('#tool-picker-toggle').get_attribute('aria-label')=='Tool: Blow'
        if touch and page.locator('#mobile-exit-focus').is_visible():page.locator('#mobile-exit-focus').click()
        page.locator('#settings-btn').click();page.locator('#settings-tab-atmosphere').click()
        page.locator('#setting-windStrength').fill('1');page.locator('#setting-windStrength').dispatch_event('input')
        page.locator('#setting-windDirection').select_option('left')
        assert page.evaluate('sandlab.world.mechanics.windStrength===1 && sandlab.world.mechanics.windDirection==="left"')
        page.locator('#setting-windStrength').fill('0');page.locator('#setting-windStrength').dispatch_event('input')
        page.keyboard.press('Escape')
        if touch:page.locator('#controls-toggle').click()
        page.locator('#view').select_option('wind')
        if touch:page.locator('#controls-toggle').click()
        data=page.evaluate('''async()=>{sandlab.loadPreset('vent');const w=sandlab.world;const right=Math.floor((w.width-60)*.4)+59;const {M}=await import('./src/sim/materials.js');let escaped=false;for(let n=0;n<350;n++){w.step();escaped ||=w.cells.some((v,i)=>i%w.width>right&&[M.Fire,M.Smoke].includes(v));}sandlab.renderer.draw();const {snapshot,restore}=await import('./src/persistence.js');const s=snapshot(w);restore(w,s);const p=Array.from(sandlab.renderer.data.data);return{escaped,pressure:Math.max(...w.fields.pressure),roundtrip:JSON.stringify(snapshot(w))===JSON.stringify(s),mode:sandlab.renderer.mode,colors:new Set(p).size}}''')
        assert data['escaped'] and data['pressure']>1 and data['roundtrip'] and data['mode']=='wind' and data['colors']>10,data
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        page.screenshot(path=str(ART/f'airflow-{width}x{height}.png'))
        results.append({'viewport':f'{width}x{height}','wind_input':'pass','vented_fire':'pass','airflow_view':'pass','errors':errors})
        c.close()
    browser.close();print(json.dumps(results))
