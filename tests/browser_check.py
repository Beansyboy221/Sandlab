"""Real-browser checks with local request interception; no server or external requests."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, mimetypes
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)

def serve(route):
    prefix = 'http://sandlab.test/'
    if not route.request.url.startswith(prefix):
        route.abort()
        return
    path = ROOT / (route.request.url[len(prefix):].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404, body='not found')

def choose(page, tool):
    page.locator('#tool-picker-toggle').click()
    page.locator(f'[data-tool-option="{tool}"]').click()

def init(context):
    context.route('**/*', serve)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://sandlab.test/')
    page.wait_for_function('() => (window.sandlab !== undefined)')
    if page.locator('body').evaluate("e=>e.classList.contains('mobile-layout')"):
        page.locator('#controls-toggle').click()
    return page, errors

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                args=['--no-sandbox', '--disable-dev-shm-usage'])
    desktop = browser.new_context(viewport={'width':1440, 'height':900}, device_scale_factor=1)
    page, errors = init(desktop)
    page.wait_for_timeout(1200)
    assert page.locator('.material').count() == 85
    assert page.locator('.tagline, .canvas-note, .palette-foot').count() == 0
    assert page.locator('.material-detail p, .material[title]').count() == 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'desktop.png'))
    assert page.locator('#bloom-btn').count() == 0
    page.locator('#settings-btn').click()
    assert page.locator('#settings-dialog').is_visible()
    assert page.evaluate('sandlab.state.paused')
    assert page.locator('#settings-tab-rendering').get_attribute('aria-selected') == 'true'
    page.locator('#setting-bloom').uncheck()
    assert page.evaluate('!sandlab.renderer.bloom')
    assert page.locator('#setting-bloomIntensity').is_disabled()
    page.locator('#setting-bloom').check()
    assert page.evaluate('sandlab.renderer.bloom')
    assert not page.locator('#setting-bloomIntensity').is_disabled()
    page.locator('#setting-bloomIntensity').evaluate("e=>{e.value=.5;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    assert page.evaluate('sandlab.renderer.bloomIntensity') == .5
    page.locator('#setting-grid').check()
    assert page.evaluate('sandlab.renderer.grid')
    page.locator('#setting-view').select_option('heat')
    assert page.locator('#view').input_value() == 'heat'
    page.locator('#settings-tab-simulation').click()
    page.locator('#setting-speed').select_option('0.5')
    assert page.locator('#speed').input_value() == '0.5'
    page.locator('#setting-startPaused').check()
    page.locator('#settings-tab-brush').click()
    page.locator('#setting-brushSize').evaluate("e=>{e.value=9;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    assert page.evaluate('sandlab.state.radius') == 9
    page.locator('#setting-brushShape').select_option('square')
    assert page.evaluate("sandlab.state.shape === 'square'")
    page.locator('#setting-brushOutline').uncheck()
    assert not page.evaluate('sandlab.renderer.brushOutline')
    page.locator('#settings-tab-storage').click()
    page.locator('#setting-autosave').uncheck()
    assert page.locator('#setting-autosaveInterval').is_disabled()
    page.locator('#setting-restoreLast').uncheck()
    page.evaluate('window.dispatchEvent(new Event("pagehide"))')
    assert page.evaluate('localStorage.getItem("sandlab.autosave.v1")') is None
    page.locator('#settings-tab-performance').click()
    page.locator('#setting-displayQuality').select_option('1')
    assert page.evaluate('sandlab.renderer.displayQuality') == 1
    page.locator('#setting-showFps').uncheck()
    assert not page.locator('#fps-label').is_visible()
    page.locator('#setting-debug').check()
    page.screenshot(path=str(ARTIFACTS / 'settings-desktop.png'))
    page.locator('#settings-dialog .dialog-close').click()
    page.wait_for_function('() => (!sandlab.state.paused)')
    assert not page.evaluate('sandlab.state.paused')
    assert page.locator('#debug-panel').is_visible()
    page.reload();page.wait_for_function('() => (window.sandlab !== undefined)')
    assert page.evaluate('sandlab.state.paused && !sandlab.renderer.brushOutline && sandlab.state.radius === 9')
    assert page.evaluate('sandlab.renderer.bloomIntensity === .5 && sandlab.renderer.grid && sandlab.renderer.displayQuality === 1')
    page.locator('#settings-btn').click()
    page.locator('#settings-tab-rendering').focus()
    page.keyboard.press('ArrowRight')
    assert page.locator('#settings-tab-simulation').get_attribute('aria-selected') == 'true'
    page.keyboard.press('End')
    assert page.locator('#settings-tab-performance').get_attribute('aria-selected') == 'true'
    page.locator('#reset-settings').click()
    assert page.evaluate('sandlab.renderer.bloomIntensity === 1 && !sandlab.renderer.grid && sandlab.renderer.displayQuality === 2 && sandlab.state.radius === 6')
    page.locator('#settings-dialog .dialog-close').click()
    assert page.evaluate('sandlab.state.paused')  # closing restores the previous run state
    page.locator('#play-btn').click()
    fps = page.locator('#fps').inner_text()
    page.locator('#play-btn').click()
    assert page.evaluate('sandlab.state.paused')
    page.locator('#search').fill('mercury')
    assert page.locator('.material').count() == 1
    page.locator('.material').click()
    assert page.evaluate('sandlab.state.material') == 22
    page.locator('#search').fill('')
    page.locator('#world').focus()
    page.keyboard.press('1')
    before = page.evaluate('sandlab.world.count')
    box = page.locator('#world').bounding_box()
    page.mouse.move(box['x']+box['width']*.48, box['y']+box['height']*.28)
    page.mouse.down()
    page.mouse.move(box['x']+box['width']*.58, box['y']+box['height']*.32, steps=12)
    page.mouse.up()
    assert page.evaluate('sandlab.world.count') > before
    painted = page.evaluate('sandlab.world.count')
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.count') == before
    assert not page.locator('#redo-btn').is_disabled()
    page.locator('#redo-btn').click()
    assert page.evaluate('sandlab.world.count') == painted
    page.locator('#world').focus()
    page.keyboard.press('Control+z')
    assert page.evaluate('sandlab.world.count') == before
    page.keyboard.press('Control+Shift+z')
    assert page.evaluate('sandlab.world.count') == painted
    page.keyboard.press('Control+z')
    page.keyboard.press('Control+y')
    assert page.evaluate('sandlab.world.count') == painted
    page.keyboard.press('Control+z')
    assert page.evaluate('sandlab.world.count') == before
    page.locator('#about-btn').click()
    assert page.locator('#about-heading').inner_text() == 'About Sandlab'
    assert page.locator('#app-version').inner_text() == 'Version ' + json.loads((ROOT/'package.json').read_text())['version']
    assert page.locator('#app-content-count').inner_text() == '85 materials'
    assert page.locator('#about-dialog kbd, #shortcut-list').count() == 0
    page.screenshot(path=str(ARTIFACTS / 'about-desktop.png'))
    page.locator('#changelog-btn').click()
    assert page.locator('#changelog-dialog').is_visible()
    assert page.locator('.changelog-release').count() == 11
    page.locator('#changelog-dialog .dialog-close').click()
    assert page.evaluate('sandlab.state.paused')
    radius=page.evaluate('sandlab.state.radius')
    page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.3)
    page.mouse.wheel(0,-120)
    page.wait_for_function('(r) => sandlab.state.radius === r', arg=radius+1)
    page.locator('#view').select_option('heat')
    assert page.locator('#view-legend').is_visible()
    page.locator('#view').select_option('normal')
    page.locator('#step-btn').click()
    page.locator('#save-btn').click()
    page.locator('#save-name').fill('Browser validation world')
    page.locator('#save-form button').click()
    assert page.locator('.save-row').count() == 1
    page.locator('.save-row .icon-button').click()
    assert page.locator('#delete-save-dialog').is_visible()
    page.locator('#delete-save-dialog .dialog-close').first.click()
    assert page.locator('.save-row').count() == 1
    assert page.evaluate('sandlab.state.paused')
    saved_count=page.evaluate('sandlab.world.count')
    with page.expect_download() as download:
        page.locator('#export-btn').click()
    export=ARTIFACTS / 'roundtrip.sandlab'
    download.value.save_as(str(export))
    page.locator('#saves-dialog .dialog-close').click()
    page.locator('#clear-btn').click()
    page.locator('#confirm-clear').click()
    assert page.evaluate('sandlab.world.count') == 0
    page.locator('#save-btn').click()
    page.locator('.save-row .quiet-button').click()
    assert page.evaluate('sandlab.world.count') == saved_count
    page.locator('#save-btn').click()
    page.locator('#import-file').set_input_files(str(export))
    page.wait_for_function('() => (!document.getElementById("saves-dialog").open)')
    assert page.evaluate('sandlab.world.count') == saved_count
    assert page.locator('#experiments-btn, #experiments-dialog').count() == 0
    page.evaluate("sandlab.loadPreset('chemistry')")
    assert page.locator('#world-name').inner_text() == 'Density column'
    before=page.evaluate('sandlab.world.count')
    page.set_viewport_size({'width':820,'height':600})
    assert page.evaluate('sandlab.world.count') == before
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.set_viewport_size({'width':1440,'height':900})
    page.locator('#search').fill('')
    page.evaluate('''() => {const w=sandlab.world;w.clear();for(let y=150;y<165;y++)for(let x=45;x<275;x++)w.set(y*w.width+x,4);for(let x=60;x<270;x+=25)w.set(149*w.width+x,5);for(let n=0;n<120;n++)w.step();sandlab.renderer.draw();}''')
    assert page.evaluate('sandlab.world.cells.some(v=>v===9)')
    assert page.evaluate('sandlab.world.cells.some(v=>v===5)')
    page.screenshot(path=str(ARTIFACTS / 'fire-surfaces.png'))
    page.evaluate("() => {sandlab.state.paused=true;const w=sandlab.world;w.clear();w.set(100*w.width+160,2);}")
    point=page.evaluate("""()=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),v=r.viewport,s=r.canvas.width/b.width;return {x:b.left+(v.x+160*v.scale)/s,y:b.top+(v.y+100*v.scale)/s};}""")
    choose(page, 'warm')
    page.mouse.click(point['x'],point['y'])
    assert page.evaluate('sandlab.world.temp[100*sandlab.world.width+160]') > 20
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.temp[100*sandlab.world.width+160]') == 20
    choose(page, 'cool')
    page.mouse.click(point['x'],point['y'])
    assert page.evaluate('sandlab.world.temp[100*sandlab.world.width+160]') < 20
    page.evaluate("() => {const w=sandlab.world;w.clear();w.set(100*w.width+160,51);w.storedLiquid[100*w.width+160]=2;w.storedAmount[100*w.width+160]=10;}")
    choose(page, 'grab')
    page.mouse.move(point['x'],point['y']);page.mouse.down()
    scale=page.evaluate('sandlab.renderer.viewport.scale / (sandlab.renderer.canvas.width / sandlab.renderer.canvas.getBoundingClientRect().width)')
    page.mouse.move(point['x']+5*scale,point['y'],steps=5);page.mouse.up()
    assert page.evaluate('sandlab.world.storedAmount[100*sandlab.world.width+165]') == 10
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.storedAmount[100*sandlab.world.width+160]') == 10
    choose(page, 'squeeze')
    page.mouse.click(point['x'],point['y'])
    assert page.evaluate('sandlab.world.cooldown[100*sandlab.world.width+160]') > 0
    choose(page, 'vacuum')
    page.mouse.click(point['x'],point['y'])
    assert page.evaluate('sandlab.world.fields.pressure.some(v=>v<0)')
    choose(page, 'paint')
    assert page.locator('#palette #brush-tool').count() == 0
    assert page.locator('.toolbox #tool-picker-toggle').is_visible()
    choose(page, 'select')
    assert page.evaluate('sandlab.state.paused')
    assert page.locator('#selection-properties').is_visible()
    assert not page.locator('#brush-control').is_visible()
    page.evaluate("() => {const w=sandlab.world;w.clear();w.set(90*w.width+140,4);w.set(91*w.width+140,51,42);w.storedLiquid[91*w.width+140]=2;w.storedAmount[91*w.width+140]=7;w.set(90*w.width+141,41);w.clone[90*w.width+141]=21;}")
    def cell(page,x,y):
        return page.evaluate("""([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),v=r.viewport,s=r.canvas.width/b.width;return {x:b.left+(v.x+(x+.5)*v.scale)/s,y:b.top+(v.y+(y+.5)*v.scale)/s};}""",[x,y])
    start,end=cell(page,139,89),cell(page,142,92)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y'],steps=5);page.mouse.up()
    assert page.evaluate('sandlab.world.count') == 3
    page.locator('#world').focus();page.keyboard.press('Control+c')
    assert page.evaluate('sandlab.selection.clipboard.width') == 4
    page.keyboard.press('Control+v')
    assert page.evaluate('sandlab.selection.placing')
    target=cell(page,202,132)
    page.mouse.move(target['x'],target['y'])
    page.screenshot(path=str(ARTIFACTS / 'selection-preview-desktop.png'))
    page.mouse.click(target['x'],target['y'])
    assert page.evaluate('sandlab.world.count') == 6
    assert page.evaluate('sandlab.world.storedAmount[133*sandlab.world.width+202]') == 7
    assert page.evaluate('sandlab.world.clone[132*sandlab.world.width+203]') == 21
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.count') == 3
    page.evaluate('sandlab.world.set(132*sandlab.world.width+202,3)')
    page.locator('#paste-selection').click();page.mouse.click(target['x'],target['y'])
    assert page.evaluate('sandlab.world.cells[132*sandlab.world.width+202]') == 3
    page.locator('#undo-btn').click()
    page.locator('#paste-replace').check()
    page.locator('#paste-selection').click();page.mouse.click(target['x'],target['y'])
    assert page.evaluate('sandlab.world.cells[132*sandlab.world.width+202]') == 4
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.cells[132*sandlab.world.width+202]') == 3
    count=page.evaluate('sandlab.world.count')
    page.locator('#paste-selection').click();page.locator('#paste-selection').click()
    assert not page.evaluate('sandlab.selection.placing')
    page.locator('#paste-selection').click();page.keyboard.press('Escape')
    assert not page.evaluate('sandlab.selection.placing')
    assert page.evaluate('sandlab.world.count') == count
    # Refine a marquee with a circle, then copy through the erased hole.
    page.evaluate("() => {sandlab.selection.clear();const w=sandlab.world;w.clear();for(let y=95;y<=105;y++)for(let x=145;x<=155;x++)w.set(y*w.width+x,4);}")
    start,end=cell(page,145,95),cell(page,155,105)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y']);page.mouse.up()
    assert page.evaluate('sandlab.selection.mask.count') == 121
    page.locator('#shape-btn').click()
    assert page.evaluate("sandlab.state.selectionShape === 'circle'")
    assert page.locator('#brush-control').is_visible()
    assert page.locator('#selection-erase').is_visible()
    page.locator('#brush').evaluate("e=>{e.value=2;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    center=cell(page,150,100)
    page.mouse.click(center['x'],center['y'],button='right')
    assert page.evaluate('sandlab.selection.mask.count') == 108
    assert page.evaluate('sandlab.world.count') == 121
    assert page.evaluate('sandlab.selection.mask.data[100*sandlab.world.width+150]') == 0
    page.screenshot(path=str(ARTIFACTS / 'selection-mask-desktop.png'))
    page.locator('#copy-selection').click()
    assert page.evaluate('sandlab.selection.clipboard.arrays.cells.filter(Boolean).length') == 108
    page.locator('#paste-selection').click()
    dest=cell(page,220,130);page.mouse.click(dest['x'],dest['y'])
    assert page.evaluate('sandlab.world.count') == 229
    assert page.evaluate('sandlab.world.cells[130*sandlab.world.width+220]') == 0
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.count') == 121
    # Circle is a continuous brush and the wheel still adjusts its radius.
    page.locator('#brush').evaluate("e=>{e.value=1;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    start,end=cell(page,145,100),cell(page,155,100)
    page.keyboard.down('Shift')
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y']);page.mouse.up()
    page.keyboard.up('Shift')
    for x in range(145,156):
        assert page.evaluate('(x)=>sandlab.selection.mask.data[100*sandlab.world.width+x]',x) == 1
    page.mouse.wheel(0,-120)
    page.wait_for_function('() => (sandlab.state.radius === 2)')
    page.locator('#selection-erase').click()
    page.mouse.click(center['x'],center['y'])
    assert page.evaluate('sandlab.selection.mask.data[100*sandlab.world.width+150]') == 0
    assert page.evaluate('sandlab.world.count') == 121
    # Move a refined selection from selected empty space; keep holes and source state.
    page.locator('#shape-btn').click()  # square also resets the selection eraser
    page.locator('#deselect-selection').click()
    page.evaluate("() => {const w=sandlab.world;w.clear();w.set(100*w.width+147,4);w.set(100*w.width+148,51,87);w.storedLiquid[100*w.width+148]=6;w.storedAmount[100*w.width+148]=12;w.set(100*w.width+151,12);}")
    start,end=cell(page,147,98),cell(page,153,102)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y']);page.mouse.up()
    page.locator('#shape-btn').click()  # refine the rectangle using a circle
    hole=cell(page,151,100)
    page.locator('#brush').evaluate("e=>{e.value=1;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.mouse.click(hole['x'],hole['y'],button='right')
    start,end=cell(page,148,98),cell(page,178,118)
    page.mouse.move(start['x'],start['y'])
    assert page.locator('#world').evaluate("e=>getComputedStyle(e).cursor") == 'grab'
    page.mouse.down();page.mouse.move(end['x'],end['y'],steps=6)
    assert page.evaluate('!!sandlab.selection.dragging')
    assert page.evaluate('sandlab.world.storedAmount[100*sandlab.world.width+148]') == 12
    assert page.locator('#world').evaluate("e=>getComputedStyle(e).cursor") == 'grabbing'
    page.screenshot(path=str(ARTIFACTS / 'selection-drag-desktop.png'))
    page.mouse.up()
    assert page.evaluate('sandlab.world.storedAmount[120*sandlab.world.width+178]') == 12
    assert page.evaluate('sandlab.world.cells[100*sandlab.world.width+148]') == 0
    assert page.evaluate('sandlab.world.cells[100*sandlab.world.width+151]') == 12
    assert page.evaluate('sandlab.selection.mask.data[120*sandlab.world.width+181]') == 0
    assert page.evaluate('sandlab.world.count') == 3
    page.locator('#copy-selection').click()
    clip=page.evaluate('sandlab.selection.clipboard.arrays.cells.filter(Boolean).length')
    page.locator('#deselect-selection').click()
    assert page.evaluate('sandlab.selection.box === null')
    assert page.locator('#copy-selection').is_disabled()
    assert not page.locator('#paste-selection').is_disabled()
    assert page.evaluate('sandlab.selection.clipboard.arrays.cells.filter(Boolean).length') == clip
    assert page.evaluate('sandlab.world.count') == 3
    page.locator('#undo-btn').click()
    assert page.evaluate('sandlab.world.storedAmount[100*sandlab.world.width+148]') == 12
    page.locator('#world').focus()
    page.keyboard.press('Control+a')
    assert page.evaluate('sandlab.selection.mask.count') == page.evaluate('sandlab.world.length')
    page.keyboard.press('Control+x')
    assert page.evaluate('sandlab.world.count') == 0
    assert page.evaluate('sandlab.selection.clipboard.arrays.cells.filter(Boolean).length') == 3
    page.keyboard.press('Control+z')
    assert page.evaluate('sandlab.world.count') == 3
    page.keyboard.press('Control+y')
    assert page.evaluate('sandlab.world.count') == 0
    page.keyboard.press('Control+z')
    assert page.evaluate('sandlab.world.count') == 3
    # Escape cancels an active move, then a second Escape deselects.
    page.locator('#shape-btn').click()
    start,end=cell(page,147,98),cell(page,149,102)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y']);page.mouse.up()
    start,end=cell(page,148,99),cell(page,190,130)
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y'])
    page.keyboard.press('Escape');page.mouse.up()
    assert not page.evaluate('!!sandlab.selection.dragging')
    assert page.evaluate('sandlab.world.storedAmount[100*sandlab.world.width+148]') == 12
    assert page.evaluate('sandlab.selection.box !== null')
    page.keyboard.press('Escape')
    assert page.evaluate('sandlab.selection.box === null')
    page.mouse.move(start['x'],start['y']);page.mouse.down();page.mouse.move(end['x'],end['y']);page.mouse.up()
    page.locator('#world').focus();page.keyboard.press('Control+d')
    assert page.evaluate('sandlab.selection.box === null')
    assert page.evaluate('sandlab.world.count') == 3
    choose(page, 'paint')
    assert page.locator('#clear-btn').is_visible()
    assert not page.locator('#deselect-selection').is_visible()
    assert not errors, errors
    print(json.dumps({'desktop':'pass','starter_fps':fps,'runtime_errors':errors,'save_roundtrip':'pass'}))

    mobile = browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,
                                 is_mobile=True,has_touch=True)
    phone, mobile_errors = init(mobile)
    phone.locator('#about-btn').tap()
    assert phone.locator('#about-dialog').is_visible()
    about=phone.locator('#about-dialog').bounding_box()
    assert about['x'] >= 0 and about['x']+about['width'] <= 390
    assert phone.locator('#about-dialog kbd, #shortcut-list').count() == 0
    phone.screenshot(path=str(ARTIFACTS / 'about-mobile.png'))
    phone.locator('#about-dialog .dialog-close').tap()
    phone.locator('#play-btn').tap()
    phone.locator('#settings-btn').tap()
    assert phone.locator('#settings-btn').bounding_box()['width'] >= 44
    phone.locator('#setting-bloom').uncheck()
    assert not phone.evaluate('sandlab.renderer.bloom')
    phone.screenshot(path=str(ARTIFACTS / 'settings-mobile.png'))
    for category in ['simulation','brush','storage','performance']:
        phone.locator('#settings-tab-'+category).scroll_into_view_if_needed()
        phone.locator('#settings-tab-'+category).tap()
        assert phone.locator('#settings-panel-'+category).is_visible()
    phone.locator('#setting-displayQuality').select_option('1')
    expected=phone.locator('#world').bounding_box()['width']
    assert abs(phone.evaluate('sandlab.renderer.canvas.width') - expected) <= 1
    phone.set_viewport_size({'width':360,'height':640})
    phone.wait_for_timeout(150)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert phone.locator('#settings-dialog .dialog-close').is_visible()
    phone.set_viewport_size({'width':844,'height':390})
    phone.wait_for_timeout(150)
    assert phone.locator('#settings-dialog .dialog-close').bounding_box()['y'] >= 0
    footer=phone.locator('.settings-footer').bounding_box()
    assert phone.locator('.settings-panels').bounding_box()['y'] + phone.locator('.settings-panels').bounding_box()['height'] <= footer['y']
    assert phone.locator('.settings-tabs').bounding_box()['y'] + phone.locator('.settings-tabs').bounding_box()['height'] <= footer['y']
    phone.screenshot(path=str(ARTIFACTS / 'settings-mobile-landscape.png'))
    phone.locator('#reset-settings').tap()
    phone.locator('#settings-dialog .dialog-close').tap()
    phone.set_viewport_size({'width':390,'height':844})
    phone.wait_for_timeout(150)
    assert phone.evaluate('sandlab.state.paused')
    assert phone.locator('#view').is_visible()
    phone.screenshot(path=str(ARTIFACTS / 'mobile.png'))
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    phone.locator('#palette-toggle').tap()
    assert 'open' in phone.locator('#palette').get_attribute('class')
    phone.wait_for_timeout(300)
    panel = phone.locator('#palette').bounding_box()
    grid = phone.locator('#materials').bounding_box()
    assert abs(panel['y']) < 1
    assert abs(panel['height'] - 844) < 1
    assert grid['height'] > 500
    assert phone.evaluate("getComputedStyle(document.getElementById('palette')).transitionProperty === 'transform'")
    phone.locator('.material').last.scroll_into_view_if_needed()
    assert phone.locator('.material').last.is_visible()
    assert phone.locator('#palette-close').bounding_box()['y'] < 80
    assert phone.evaluate('scrollY') == 0
    phone.locator('#materials').evaluate('(element) => element.scrollTop = 0')
    phone.screenshot(path=str(ARTIFACTS / 'mobile-palette.png'))
    phone.locator('#palette-close').tap()
    phone.wait_for_timeout(300)
    choose(phone, 'cool')
    assert not phone.locator('#palette-toggle').is_visible()
    assert phone.locator('#tool-properties').is_visible()
    assert phone.evaluate("sandlab.state.tool === 'cool'")
    assert 'open' not in phone.locator('#palette').get_attribute('class')
    phone.wait_for_timeout(300)
    phone.evaluate("() => {const w=sandlab.world;w.clear();w.set(150*w.width+100,2);}")
    point=phone.evaluate("""()=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),v=r.viewport,s=r.canvas.width/b.width;return {x:b.left+(v.x+100*v.scale)/s,y:b.top+(v.y+150*v.scale)/s};}""")
    phone.touchscreen.tap(point['x'],point['y'])
    assert phone.evaluate('sandlab.world.temp[150*sandlab.world.width+100]') < 20
    choose(phone, 'paint')
    phone.locator('#palette-toggle').tap()
    phone.wait_for_timeout(300)
    phone.locator('.material').filter(has_text='Water').first.tap()
    assert 'open' not in phone.locator('#palette').get_attribute('class')
    phone.wait_for_timeout(300)
    before = phone.evaluate('sandlab.world.count')
    canvas = phone.locator('#world').bounding_box()
    session = mobile.new_cdp_session(phone)
    touches=[{'x':canvas['x']+canvas['width']*.35,'y':canvas['y']+canvas['height']*.45,'id':1},
             {'x':canvas['x']+canvas['width']*.65,'y':canvas['y']+canvas['height']*.45,'id':2}]
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':touches})
    for touch in touches: touch['y']+=30
    session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':touches})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert phone.evaluate('sandlab.world.count') > before
    assert phone.evaluate('scrollY') == 0
    painted = phone.evaluate('sandlab.world.count')
    phone.locator('#undo-btn').tap()
    assert phone.evaluate('sandlab.world.count') == before
    phone.locator('#redo-btn').tap()
    assert phone.evaluate('sandlab.world.count') == painted
    assert phone.locator('#redo-btn').bounding_box()['width'] >= 44
    assert phone.locator('#redo-btn').bounding_box()['height'] >= 44
    phone.locator('#undo-btn').tap()
    phone.set_viewport_size({'width':844,'height':390})
    phone.wait_for_timeout(200)
    phone.screenshot(path=str(ARTIFACTS / 'mobile-landscape.png'))
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert phone.locator('#world').bounding_box()['height'] > 150
    phone.set_viewport_size({'width':390,'height':844})
    phone.wait_for_timeout(200)
    choose(phone, 'select')
    phone.wait_for_timeout(100)
    assert not phone.locator('#palette-toggle').is_visible()
    assert phone.locator('#copy-selection').is_visible()
    phone.evaluate("() => {const w=sandlab.world;w.clear();for(let x=88;x<93;x++)w.set(130*w.width+x,4);}")
    start,end=cell(phone,87,129),cell(phone,93,131)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start['x'],'y':start['y'],'id':4}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':end['x'],'y':end['y'],'id':4}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert phone.evaluate('sandlab.world.count') == 5
    assert phone.evaluate('sandlab.selection.box !== null'), {'start':start,'end':end,'canvas':phone.locator('#world').bounding_box()}
    phone.locator('#copy-selection').tap()
    phone.locator('#paste-selection').tap()
    target=cell(phone,130,170)
    phone.touchscreen.tap(target['x'],target['y'])
    assert phone.evaluate('sandlab.world.count') == 10
    phone.screenshot(path=str(ARTIFACTS / 'selection-mobile.png'))
    phone.locator('#undo-btn').tap()
    assert phone.evaluate('sandlab.world.count') == 5
    # The circle can paint and erase selection with a touch-friendly toggle.
    phone.locator('#shape-btn').tap()
    assert phone.locator('#brush-control').is_visible()
    phone.locator('#brush').evaluate("e=>{e.value=3;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    point=cell(phone,90,130)
    phone.touchscreen.tap(point['x'],point['y'])
    assert phone.evaluate('sandlab.selection.mask.count') == 29
    assert phone.evaluate('sandlab.world.count') == 5
    phone.locator('#selection-erase').tap()
    assert phone.locator('#selection-erase').get_attribute('aria-pressed') == 'true'
    phone.locator('#brush').evaluate("e=>{e.value=1;e.dispatchEvent(new Event('input',{bubbles:true}));}")
    phone.touchscreen.tap(point['x'],point['y'])
    assert phone.evaluate('sandlab.selection.mask.count') == 24
    assert phone.evaluate('sandlab.world.count') == 5
    assert phone.evaluate('scrollY') == 0
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not phone.locator('#palette-toggle').is_visible()
    phone.screenshot(path=str(ARTIFACTS / 'selection-mask-mobile.png'))
    phone.set_viewport_size({'width':360,'height':640})
    phone.wait_for_timeout(150)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert phone.locator('#selection-erase').bounding_box()['height'] >= 44
    assert phone.locator('#copy-selection').is_visible()
    phone.set_viewport_size({'width':390,'height':844})
    # Touch drag translates the selected particles, with undo and touch cancellation.
    phone.locator('#selection-erase').tap()
    phone.locator('#deselect-selection').tap()
    assert phone.evaluate('sandlab.selection.mask.count') == 0
    phone.wait_for_timeout(120)
    point=cell(phone,90,130);phone.touchscreen.tap(point['x'],point['y'])
    before=phone.evaluate('sandlab.world.count')
    start,end=cell(phone,90,130),cell(phone,115,155)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start['x'],'y':start['y'],'id':7}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':end['x'],'y':end['y'],'id':7}]})
    assert phone.evaluate('!!sandlab.selection.dragging')
    assert phone.evaluate('sandlab.world.cells[130*sandlab.world.width+90]') == 4
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert phone.evaluate('sandlab.world.cells[155*sandlab.world.width+115]') == 4
    assert phone.evaluate('sandlab.world.cells[130*sandlab.world.width+90]') == 0
    assert phone.evaluate('sandlab.world.count') == before
    assert phone.evaluate('scrollY') == 0
    phone.screenshot(path=str(ARTIFACTS / 'selection-drag-mobile.png'))
    # An OS-cancelled gesture leaves the moved scene in place.
    start,end=cell(phone,115,155),cell(phone,150,185)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start['x'],'y':start['y'],'id':8}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':end['x'],'y':end['y'],'id':8}]})
    session.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
    assert not phone.evaluate('!!sandlab.selection.dragging')
    assert phone.evaluate('sandlab.world.cells[155*sandlab.world.width+115]') == 4
    phone.locator('#undo-btn').tap()
    assert phone.evaluate('sandlab.world.cells[130*sandlab.world.width+90]') == 4
    phone.set_viewport_size({'width':360,'height':640})
    phone.wait_for_timeout(150)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert phone.locator('#deselect-selection').is_visible()
    assert phone.locator('#deselect-selection').bounding_box()['height'] >= 44
    phone.set_viewport_size({'width':390,'height':844})
    choose(phone, 'fan')
    assert phone.locator('#fan-direction').is_visible()
    phone.locator('#fan-direction').select_option('up')
    assert phone.evaluate("sandlab.state.fanDirection === 'up'")
    choose(phone, 'paint')
    assert phone.locator('#palette-toggle').is_visible()
    phone.set_viewport_size({'width':360,'height':640})
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    phone.locator('#palette-toggle').tap()
    phone.wait_for_timeout(300)
    assert abs(phone.locator('#palette').bounding_box()['y']) < 1
    assert phone.locator('#materials').bounding_box()['height'] > 300
    phone.locator('#palette-close').tap()
    phone.wait_for_timeout(300)
    phone.locator('#save-btn').tap()
    phone.locator('#import-file').set_input_files(str(export))
    phone.wait_for_function('() => (!document.getElementById("saves-dialog").open)')
    assert phone.evaluate('sandlab.world.width') == 320
    assert phone.evaluate('sandlab.world.count') == saved_count
    phone.wait_for_function('() => (sandlab.renderer.buffer.width === 320)')
    assert not mobile_errors, mobile_errors
    print(json.dumps({'touch_and_multitouch':'pass','mobile_portrait_and_landscape':'pass','runtime_errors':mobile_errors}))
    browser.close()
