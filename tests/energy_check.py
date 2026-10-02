"""Icon picker accessibility, touch, energy rendering, and real canvas input."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    prefix='http://sandlab.test/'
    if not route.request.url.startswith(prefix):route.abort();return
    file=ROOT/(route.request.url[len(prefix):].split('?')[0] or 'index.html')
    route.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'text/plain') if file.is_file() else route.fulfill(status=404)
def init(browser,width,height,touch=False):
    context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,device_scale_factor=3 if touch else 1)
    context.route('**/*',serve);page=context.new_page();errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab')
    page.locator('#play-btn').click()
    page.evaluate("async()=>{window.energyM=(await import('./src/sim/materials.js')).M}")
    return context,page,errors

def cell(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),s=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return {x:b.x+p.x/s,y:b.y+p.y/s}}''',[x,y])

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context,page,errors=init(browser,1440,900)
    assert page.locator('.material').count()==80
    page.locator('#tool-picker-toggle').focus();page.keyboard.press('Space')
    assert page.evaluate('sandlab.state.paused')
    assert page.locator('#tool-picker-menu [role=option]').count()==14
    assert page.locator('#tool-picker-menu [role=option] > svg').count()==14
    assert page.locator('#tool-picker-menu svg[stroke-width="1.65"]').count()==14
    assert page.locator('#tool-picker-toggle').get_attribute('aria-expanded')=='true'
    page.screenshot(path=str(ARTIFACTS/'tool-icons-desktop.png'))
    page.keyboard.press('End');assert page.locator('[data-tool-option=squeeze]').evaluate('e=>e===document.activeElement')
    page.keyboard.press('Home');page.keyboard.press('ArrowDown');page.keyboard.press('ArrowDown');page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft');page.keyboard.press('Enter')
    assert page.evaluate('sandlab.state.tool')=='warm'
    assert page.locator('#tool-picker-toggle').get_attribute('aria-label')=='Tool: Warm'
    page.keyboard.press('b');assert page.locator('#tool-picker-toggle').get_attribute('aria-label')=='Tool: Draw'
    page.locator('#tool-picker-toggle').click();page.keyboard.press('f');page.keyboard.press('f');page.keyboard.press('Enter');assert page.evaluate('sandlab.state.tool')=='fan'
    page.locator('#tool-picker-toggle').click();page.keyboard.press('Escape');assert not page.locator('#tool-picker-menu').is_visible()
    page.locator('#tool-picker-toggle').click();page.locator('#world-name').click();assert not page.locator('#tool-picker-menu').is_visible()
    page.locator('#categories').get_by_role('button',name='Fiction',exact=True).click()
    assert page.locator('.material').count()==3
    page.locator('#categories').get_by_role('button',name='All',exact=True).click()
    page.locator('#search').fill('Laser');page.get_by_role('button',name='Laser',exact=True).click()
    a=cell(page,100,80);b=cell(page,100,90)
    page.mouse.move(**a);page.mouse.down();page.mouse.move(**b,steps=5);page.mouse.up()
    assert page.evaluate('sandlab.world.heading[90*sandlab.world.width+100]')==2
    page.locator('#search').fill('Lightning');page.get_by_role('button',name='Lightning',exact=True).click()
    assert page.locator('#brush-label').inner_text()=='Rate'
    assert page.locator('#brush').get_attribute('aria-label')=='Lightning strike frequency'
    page.evaluate("""()=>{const w=sandlab.world;window.strikeCount=0;const step=w.step.bind(w);w.step=()=>{step();if(w.lastStrikeTick===w.tick)strikeCount++;};}""")
    strike_counts=[]
    for radius in [1,30]:
        page.locator('#brush').evaluate('(e,r)=>{e.value=r;e.dispatchEvent(new Event("input",{bubbles:true}));}',radius)
        page.evaluate('sandlab.world.clear();sandlab.world.lastStrikeTick=-1;strikeCount=0')
        page.locator('#play-btn').click()
        target=cell(page,160,12);page.mouse.move(**target);page.mouse.down();page.wait_for_timeout(1100);page.mouse.up()
        page.locator('#play-btn').click();strike_counts.append(page.evaluate('strikeCount'))
    assert 1<=strike_counts[0]<=3,strike_counts
    assert strike_counts[1]>=6 and strike_counts[1]>strike_counts[0]*2,strike_counts
    page.locator('#search').fill('Laser');page.get_by_role('button',name='Laser',exact=True).click()
    assert page.locator('#brush-label').inner_text()=='Size'
    page.evaluate('''()=>{
      const w=sandlab.world,M=energyM;w.clear();
      for(let y=40;y<135;y++)w.set(y*w.width+200,M.Mirror);
      for(let y=55;y<120;y++)w.set(y*w.width+140,M.Glass);
      for(let y=65;y<110;y+=3){w.set(y*w.width+65,M.Laser);w.heading[y*w.width+65]=0;}
      for(let y=110;y<155;y++)for(let x=230;x<255;x++)w.set(y*w.width+x,M.Water);
      w.brush(230,108,4,M.Cooler);w.brush(260,110,4,M.Fire);
      w.brush(60,150,8,M.Laser);
      for(let n=0;n<22;n++)w.step();sandlab.renderer.draw();
    }''')
    page.screenshot(path=str(ARTIFACTS/'energy-materials-desktop.png'))
    assert page.evaluate('sandlab.world.cells.some(id=>id===energyM.Laser)')
    assert page.evaluate('sandlab.world.cells.some(id=>id===energyM.Fire)')
    benchmark=page.evaluate('''()=>{const w=sandlab.world,r=sandlab.renderer,M=energyM;w.clear();for(let y=20;y<180;y+=2)for(let x=10;x<310;x+=2)w.set(y*w.width+x,M.Laser);const times=[];for(let n=0;n<20;n++){const t=performance.now();w.step();times.push(performance.now()-t);}r.draw();return {particles:w.count,meanTickMs:times.reduce((a,b)=>a+b,0)/times.length};}''')
    assert page.evaluate('sandlab.world.count===sandlab.world.chunks.reduce((a,b)=>a+b,0)')
    assert not errors,errors
    context.close()
    context,page,errors=init(browser,360,780,True)
    page.locator('#tool-picker-toggle').tap()
    assert page.locator('#tool-picker-menu').is_visible()
    assert page.locator('#tool-picker-menu').evaluate('e=>{const b=e.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}')
    for item in page.locator('#tool-picker-menu [role=option]').all():
        assert item.bounding_box()['height']>=44
    page.screenshot(path=str(ARTIFACTS/'tool-icons-mobile.png'))
    page.locator('[data-tool-option=eyedropper]').tap();assert page.evaluate('sandlab.state.tool')=='eyedropper'
    page.locator('#tool-picker-toggle').tap();page.locator('[data-tool-option=paint]').tap()
    page.locator('#palette-toggle').tap();page.locator('#categories').get_by_role('button',name='Fiction',exact=True).tap()
    assert page.locator('.material').count()==3
    page.get_by_role('button',name='Antimatter',exact=True).tap()
    assert not page.locator('#palette').evaluate('e=>e.classList.contains("open")')
    target=cell(page,100,140);page.touchscreen.tap(target['x'],target['y'])
    page.wait_for_function('sandlab.world.cells.some(id=>id===energyM.Antimatter)')
    page.set_viewport_size({'width':844,'height':390})
    page.locator('#tool-picker-toggle').tap()
    assert page.locator('#tool-picker-menu').evaluate('e=>{const b=e.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(ARTIFACTS/'tool-icons-landscape.png'))
    page.locator('[data-tool-option=fan]').tap();assert page.evaluate('sandlab.state.tool')=='fan'
    assert not errors,errors
    browser.close()
    print(json.dumps({'tool_icons':'pass','keyboard':'pass','touch':'pass','fiction_filter':'pass','energy_rendering':'pass','energy_benchmark':benchmark,'lightning_strikes':strike_counts,'runtime_errors':errors}))
