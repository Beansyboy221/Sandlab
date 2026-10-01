"""Canvas creation, positioned resizing, persistence, and touch in Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

def serve(route):
    prefix = 'http://sandlab.test/'
    if not route.request.url.startswith(prefix):
        route.abort(); return
    file = ROOT / (route.request.url[len(prefix):].split('?')[0] or 'index.html')
    route.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(file)[0] or 'text/plain') if file.is_file() else route.fulfill(status=404)

def init(browser, width, height, touch=False):
    context = browser.new_context(viewport={'width':width,'height':height}, device_scale_factor=3 if touch else 1, has_touch=touch, is_mobile=touch)
    context.route('**/*',serve)
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://sandlab.test/')
    page.wait_for_function('() => !!window.sandlab')
    if page.locator('body').evaluate("e=>e.classList.contains('mobile-layout')"):
        page.locator('#controls-toggle').click()
    page.locator('#play-btn').click()
    return context,page,errors

def fill(page, name, width, height, border='solid', background='#112233'):
    page.locator('#level-name').fill(name)
    page.locator('#level-width').fill(str(width))
    page.locator('#level-height').fill(str(height))
    page.locator('#level-border').select_option(border)
    page.locator('#level-background').evaluate('(e,value)=>{e.value=value;e.dispatchEvent(new Event("input",{bubbles:true}));}',background)

def point(page,x,y):
    return page.evaluate('''([x,y])=>{const editor=sandlab.levelEditor, b=editor.preview.getBoundingClientRect(), ratio=editor.preview.width/b.width, v=editor.viewport;return {x:b.x+(v.x+x*v.scale)/ratio,y:b.y+(v.y+y*v.scale)/ratio};}''',[x,y])

def verify(page,name,width,height,border,background):
    page.wait_for_function("expected => {const w=sandlab.world;return JSON.stringify([w.name,w.width,w.height,w.border,w.background])===JSON.stringify(expected)}",arg=[name,width,height,border,background])
    actual=page.evaluate('''()=>{const w=sandlab.world;return [w.name,w.width,w.height,w.border,w.background];}''')
    assert actual == [name,width,height,border,background], (actual,page.locator('#level-error').inner_text(),page.locator('#level-dialog').get_attribute('open'))
    assert page.locator('#world-name').inner_text()==name
    assert page.locator('#world-resolution').inner_text()==f'{width} × {height}'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context,page,errors=init(browser,1440,900)
    assert page.locator('#experiments-btn, #experiments-dialog').count()==0
    page.locator('#new-canvas-btn').click()
    assert page.locator('#level-heading').inner_text()=='New canvas'
    fill(page,'Pocket lab',32,24,'looping')
    page.screenshot(path=str(ARTIFACTS/'new-canvas-desktop.png'))
    page.locator('#level-submit').click()
    verify(page,'Pocket lab',32,24,'looping','#112233')
    assert page.evaluate('sandlab.world.count')==0
    assert page.evaluate('''()=>{sandlab.renderer.draw();return Array.from(sandlab.renderer.data.data.slice(4,8));}''')==[17,34,51,255]
    # Invalid settings and cancelled dialogs cannot replace the live world.
    page.evaluate('''()=>{const w=sandlab.world;w.set(8*32+12,3,87);w.life[8*32+12]=123;w.set(1,4);window.levelBefore=JSON.stringify(sandlab.snapshot());}''')
    page.locator('#new-canvas-btn').click();fill(page,'Invalid',512,512)
    page.locator('#level-submit').click()
    assert '200,000' in page.locator('#level-error').inner_text()
    assert page.evaluate('JSON.stringify(sandlab.snapshot())===levelBefore')
    page.keyboard.press('Escape')
    # Shrink: drag the crop window, cancel it, then choose an exact crop.
    page.locator('#level-properties-btn').click();fill(page,'Cropped lab',16,16,'void','#aabbcc')
    page.locator('#level-submit').click()
    assert page.locator('#resize-panel').is_visible()
    assert page.evaluate('JSON.stringify(sandlab.snapshot())===levelBefore')
    start=point(page,12,8);finish=point(page,16,11)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(finish['x'],finish['y'],steps=8);page.mouse.up()
    assert page.evaluate('sandlab.levelEditor.placement.positionX')==12
    assert page.evaluate('sandlab.levelEditor.placement.positionY')==7
    page.keyboard.press('Escape')
    assert page.evaluate('JSON.stringify(sandlab.snapshot())===levelBefore')
    page.locator('#level-properties-btn').click();fill(page,'Cropped lab',16,16,'void','#aabbcc');page.locator('#level-submit').click()
    page.locator('#resize-x').fill('8');page.locator('#resize-y').fill('4')
    assert 'Keep 1 particles' in page.locator('#resize-summary').inner_text()
    page.screenshot(path=str(ARTIFACTS/'resize-crop-desktop.png'))
    page.locator('#level-submit').click();verify(page,'Cropped lab',16,16,'void','#aabbcc')
    assert page.evaluate('sandlab.world.cells[4*16+4]===3 && sandlab.world.life[4*16+4]===123 && sandlab.world.temp[4*16+4]===87 && sandlab.world.count===1')
    page.evaluate('window.levelAfter=JSON.stringify(sandlab.snapshot())')
    page.locator('#undo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())===levelBefore')
    page.locator('#redo-btn').click();assert page.evaluate('JSON.stringify(sandlab.snapshot())===levelAfter')
    # Expand: moving the old canvas inside the new canvas preserves coordinates.
    page.locator('#level-properties-btn').click();fill(page,'Expanded lab',32,24,'solid','#aabbcc');page.locator('#level-submit').click()
    page.locator('#resize-x').fill('7');page.locator('#resize-y').fill('3')
    page.locator('#resize-preview').focus();page.keyboard.press('ArrowRight')
    assert page.locator('#resize-x').input_value()=='8'
    page.screenshot(path=str(ARTIFACTS/'resize-expand-desktop.png'))
    page.locator('#level-submit').click()
    verify(page,'Expanded lab',32,24,'solid','#aabbcc')
    assert page.evaluate('sandlab.world.cells[7*32+12]===3 && sandlab.world.count===1')
    # Metadata-only changes apply immediately and are undoable.
    page.locator('#level-properties-btn').click();fill(page,'Named lab',32,24,'looping','#224466')
    assert page.locator('#level-submit').inner_text()=='Apply changes'
    page.locator('#level-submit').click();verify(page,'Named lab',32,24,'looping','#224466')
    page.locator('#undo-btn').click();verify(page,'Expanded lab',32,24,'solid','#aabbcc')
    page.locator('#redo-btn').click();verify(page,'Named lab',32,24,'looping','#224466')
    page.locator('#save-btn').click();page.locator('#save-name').fill('Saved slot');page.locator('#save-form button').click()
    with page.expect_download() as download:page.locator('#export-btn').click()
    exported=ARTIFACTS/'canvas-properties.sandlab';download.value.save_as(str(exported))
    page.locator('#saves-dialog .dialog-close').click()
    page.locator('#new-canvas-btn').click();fill(page,'Replacement',16,16);page.locator('#level-submit').click()
    page.locator('#save-btn').click();page.locator('.save-row .quiet-button').click();verify(page,'Named lab',32,24,'looping','#224466')
    page.locator('#new-canvas-btn').click();fill(page,'Replacement',16,16);page.locator('#level-submit').click()
    page.locator('#save-btn').click();page.locator('#import-file').set_input_files(str(exported))
    page.wait_for_function('() => !document.getElementById("saves-dialog").open')
    verify(page,'Named lab',32,24,'looping','#224466')
    page.evaluate('sandlab.settings.set("startPaused",true);window.dispatchEvent(new Event("pagehide"))')
    page.reload();page.wait_for_function('() => !!window.sandlab')
    verify(page,'Named lab',32,24,'looping','#224466')
    assert page.evaluate('sandlab.world.cells[7*32+12]===3 && sandlab.world.life[7*32+12]===123')
    assert not errors,errors
    context.close()
    # High-DPI phone: real touch drag plus portrait/landscape dialog sizing.
    context,page,errors=init(browser,360,780,True)
    page.locator('#new-canvas-btn').tap();fill(page,'Phone lab',48,40,'void','#081820')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(ARTIFACTS/'new-canvas-mobile.png'))
    page.locator('#level-submit').tap();verify(page,'Phone lab',48,40,'void','#081820')
    page.evaluate('sandlab.world.set(20*48+24,3)')
    page.locator('#level-properties-btn').tap();fill(page,'Phone crop',32,24,'looping','#081820');page.locator('#level-submit').tap()
    page.locator('#resize-preview').scroll_into_view_if_needed()
    start=point(page,16,12);finish=point(page,21,15)
    session=context.new_cdp_session(page)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start['x'],'y':start['y'],'id':1}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':finish['x'],'y':finish['y'],'id':1}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert page.evaluate('sandlab.levelEditor.placement.positionX===13 && sandlab.levelEditor.placement.positionY===11')
    page.screenshot(path=str(ARTIFACTS/'resize-crop-mobile.png'))
    page.wait_for_timeout(500)  # Allow the compositor to finish the touch-drag gesture.
    page.locator('#level-submit').tap()
    verify(page,'Phone crop',32,24,'looping','#081820')
    assert page.evaluate('sandlab.world.cells[9*32+11]===3')
    page.set_viewport_size({'width':844,'height':390})
    page.locator('#level-properties-btn').tap()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#level-background').scroll_into_view_if_needed()
    page.screenshot(path=str(ARTIFACTS/'canvas-properties-landscape.png'))
    page.locator('#level-submit').tap()
    verify(page,'Phone crop',32,24,'looping','#081820')
    assert not errors,errors
    browser.close()
    print('PASS: new/edit canvas, invalid sizes, crop and expansion placement, undo/redo, saves/export/import/autosave, high-DPI touch, portrait/landscape; no runtime errors.')
