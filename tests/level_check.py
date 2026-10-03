"""Automatic canvas sizing, metadata, positioned mobile resolution, persistence."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    file=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'text/plain') if file.is_file() else route.fulfill(status=404)
def init(browser,width,height,touch=False):
    c=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=3 if touch else 1,has_touch=touch,is_mobile=touch);c.route('http://sandlab.test/**',serve)
    page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://sandlab.test/');page.wait_for_function('() => !!window.sandlab');page.locator('#play-btn').click()
    if touch:page.locator('#controls-toggle').click()
    return c,page,errors
def fill(page,name,border='solid',background='#112233',resolution=None):
    page.locator('#level-name').fill(name);page.locator('#level-border').select_option(border)
    page.locator('#level-background').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',background)
    if resolution is not None:page.locator('.level-dimensions input:not(:disabled)').first.fill(str(resolution))
def verify(page,name,dimensions,border='solid',background='#112233'):
    actual=page.evaluate('()=>{const w=sandlab.world;return [w.name,w.width,w.height,w.border,w.background]}')
    assert actual==[name,dimensions['width'],dimensions['height'],border,background],(actual,page.locator('#level-error').inner_text())
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const e=sandlab.levelEditor,b=e.preview.getBoundingClientRect(),d=e.preview.width/b.width,v=e.viewport,[a,k,c,f,tx,ty]=e.previewMatrix;const px=v.x+x*v.scale,py=v.y+y*v.scale;return {x:b.x+(a*px+c*py+tx)/d,y:b.y+(k*px+f*py+ty)/d}}''',[x,y])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c,page,errors=init(browser,1440,900)
    assert page.locator('#experiments-btn,#level-resolution,.canvas-resize-handle').count()==0
    page.locator('#new-canvas-btn').click();fill(page,'Pocket lab','looping');page.locator('#level-width').fill('96');page.locator('#level-height').fill('80');assert page.locator('#level-width').is_visible() and page.locator('#level-height').is_visible();assert page.locator('#level-width').is_enabled() and page.locator('#level-height').is_enabled()
    dimensions=page.evaluate('sandlab.levelEditor.dimensions()');page.locator('#level-submit').click();verify(page,'Pocket lab',dimensions,'looping');assert page.evaluate('sandlab.world.count')==0
    page.evaluate('''()=>{const w=sandlab.world,i=8*w.width+12;w.set(i,3,87);w.life[i]=123;w.fields.temperature[w.fields.index(12,8)]=200;window.before=JSON.stringify(sandlab.snapshot())}''')
    page.locator('#level-properties-btn').click();assert page.locator('#level-width').input_value()=='96' and page.locator('#level-height').input_value()=='80';fill(page,'Named lab','void','#224466');page.locator('#level-submit').click();verify(page,'Named lab',dimensions,'void','#224466')
    page.evaluate('window.after=JSON.stringify(sandlab.snapshot())');page.locator('#undo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())===before');page.locator('#redo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())===after')
    page.locator('#new-canvas-btn').click();fill(page,'Cancelled');page.keyboard.press('Escape');assert page.evaluate('JSON.stringify(sandlab.snapshot())===after')
    page.locator('#save-btn').click();page.locator('#save-name').fill('Saved slot');page.locator('#save-form button').click()
    with page.expect_download() as download:page.locator('#export-btn').click()
    file=ARTIFACTS/'canvas-properties.sandlab';download.value.save_as(str(file));page.locator('#saves-dialog .dialog-close').click()
    page.locator('#new-canvas-btn').click();fill(page,'Replacement');page.locator('#level-submit').click()
    page.locator('#save-btn').click();page.locator('.save-row .quiet-button').click();verify(page,'Named lab',dimensions,'void','#224466')
    page.locator('#new-canvas-btn').click();fill(page,'Replacement');page.locator('#level-submit').click();page.locator('#save-btn').click();page.locator('#import-file').set_input_files(str(file));page.wait_for_function('() => !document.querySelector("#saves-dialog").open');verify(page,'Named lab',dimensions,'void','#224466')
    page.evaluate('sandlab.settings.set("startPaused",true);window.dispatchEvent(new Event("pagehide"))');page.reload();page.wait_for_function('() => !!window.sandlab');verify(page,'Named lab',dimensions,'void','#224466');assert page.evaluate('sandlab.world.fields.temperature[sandlab.world.fields.index(12,8)]===200');assert not errors,errors;c.close()
    c,page,errors=init(browser,390,844,True);page.locator('#new-canvas-btn').tap();assert page.locator('#level-width').is_visible() and page.locator('#level-height').is_visible();assert page.locator('#level-width').is_enabled() and page.locator('#level-height').is_disabled();fill(page,'Phone lab','void','#081820',64)
    dimensions=page.evaluate('sandlab.levelEditor.dimensions()');assert dimensions['width']==64 and dimensions['height']>64;page.screenshot(path=str(ARTIFACTS/'canvas-dimensions-mobile.png'));page.locator('#level-submit').tap();verify(page,'Phone lab',dimensions,'void','#081820')
    page.evaluate('''()=>{const w=sandlab.world,i=10*w.width+10;w.set(i,3,87);w.life[i]=123;w.pigment[i]=0xffff0000;w.backgroundPaint[i]=0xff00ff00;w.fields.temperature[w.fields.index(10,10)]=300;window.before=JSON.stringify(sandlab.snapshot())}''')
    page.locator('#level-properties-btn').tap();fill(page,'Invalid',resolution=32);fill(page,'Invalid',resolution=64);assert page.evaluate('!sandlab.levelEditor.sizeChanged()');fill(page,'Invalid',resolution=512);page.locator('#level-submit').tap();assert page.locator('#level-error').inner_text();assert page.evaluate('JSON.stringify(sandlab.snapshot())===before');page.keyboard.press('Escape')
    page.locator('#level-properties-btn').tap();fill(page,'Phone crop','looping','#081820',32);cropped=page.evaluate('sandlab.levelEditor.dimensions()');page.locator('#level-submit').tap();assert page.locator('#resize-panel').is_visible()
    # Real touch moves the crop window. Cancelling leaves the complete world untouched.
    pos=page.evaluate('({x:sandlab.levelEditor.placement.positionX,y:sandlab.levelEditor.placement.positionY})');a=point(page,pos['x']+8,pos['y']+8);b=point(page,pos['x']+5,pos['y']+6)
    session=c.new_cdp_session(page);session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[dict(a,id=1)]});session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[dict(b,id=1)]});session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert page.evaluate('sandlab.levelEditor.placement.positionX')==pos['x']-3;assert page.evaluate('sandlab.levelEditor.placement.positionY')==pos['y']-2
    page.keyboard.press('Escape');assert page.evaluate('JSON.stringify(sandlab.snapshot())===before')
    page.locator('#level-properties-btn').tap();fill(page,'Phone crop','looping','#081820',32);page.locator('#level-submit').tap();page.locator('#resize-x').fill('4');page.locator('#resize-y').fill('4');page.locator('#level-submit').tap();verify(page,'Phone crop',cropped,'looping','#081820')
    assert page.evaluate('''()=>{const w=sandlab.world,i=6*w.width+6;return w.count===1&&w.cells[i]===3&&w.life[i]===123&&w.temp[i]===87&&w.pigment[i]===0xffff0000&&w.backgroundPaint[i]===0xff00ff00&&w.fields.temperature[w.fields.index(6,6)]===300}''')
    page.evaluate('window.after=JSON.stringify(sandlab.snapshot())');page.locator('#undo-btn').tap();assert page.evaluate('JSON.stringify(sandlab.snapshot())===before');page.locator('#redo-btn').tap();assert page.evaluate('JSON.stringify(sandlab.snapshot())===after')
    page.locator('#level-properties-btn').tap();fill(page,'Expanded','solid','#081820',64);expanded=page.evaluate('sandlab.levelEditor.dimensions()');page.locator('#level-submit').tap();page.locator('#resize-x').fill('7');page.locator('#resize-y').fill('3');page.locator('#resize-preview').focus();page.keyboard.press('ArrowRight');assert page.locator('#resize-x').input_value()=='8';page.locator('#level-submit').tap();verify(page,'Expanded',expanded,'solid','#081820');assert page.evaluate('sandlab.world.cells[9*sandlab.world.width+14]===3')
    page.evaluate('Object.defineProperty(window,"orientation",{configurable:true,value:90});window.dispatchEvent(new Event("orientationchange"))');page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(200)
    if page.locator('#mobile-exit-focus').is_visible():page.locator('#mobile-exit-focus').tap()
    if page.locator('#controls-toggle').get_attribute('aria-expanded')=='false':page.locator('#controls-toggle').tap()
    page.locator('#level-properties-btn').tap();fill(page,'Rotated crop','solid','#081820',32);page.locator('#level-submit').tap();assert page.evaluate('sandlab.levelEditor.previewMatrix[1]===-1');a=point(page,20,20);b=point(page,18,22);page.mouse.move(**a);page.mouse.down();page.mouse.move(**b);page.mouse.up();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(ARTIFACTS/'rotated-crop.png'));page.keyboard.press('Escape')
    assert not errors,errors;c.close();browser.close()
print('PASS: automatic sizes, metadata, touch crop/expansion, cancellation, undo/redo, paint/heat preservation, local saves/export/import/autosave and rotated previews.')
