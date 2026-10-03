"""Read-only input, live inspection, and keyboard preferences in a real browser."""
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
    path = ROOT / (route.request.url[len(prefix):].split('?')[0] or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404, body='not found')

def init(browser, width, height, touch=False):
    context = browser.new_context(viewport={'width':width, 'height':height}, device_scale_factor=3 if touch else 1, has_touch=touch, is_mobile=touch)
    context.route('**/*', serve)
    page = context.new_page(); errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://sandlab.test/')
    page.wait_for_function('() => !!window.sandlab')
    if page.locator('#mobile-exit-focus').is_visible(): page.locator('#mobile-exit-focus').tap()
    page.locator('#play-btn').click()
    page.evaluate('''() => {
      sandlab.world.clear();
      sandlab.settings.set('autosave', false);
      const w = sandlab.world, i = 80 * w.width + 100;
      w.set(i, 3, 153.5);
      w.life[i] = 22;
      w.charge[i] = 5;
      w.fields.add(100, 80, 2);
      window.inspectionBefore = JSON.stringify(sandlab.snapshot());
    }''')
    return context, page, errors

def point(page, x=100, y=80):
    return page.evaluate('''([x,y]) => {
      const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(), ratio=r.canvas.width/b.width,p=r.project(x+.5,y+.5);
      return {x:b.left+p.x/ratio,y:b.top+p.y/ratio};
    }''', [x,y])

def choose(page, tool):
    page.locator('#tool-picker-toggle').click()
    page.locator(f'[data-tool-option="{tool}"]').click()
    if page.locator("#controls-toggle").is_visible() and page.locator("#controls-toggle").get_attribute("aria-expanded")=="true":page.locator("#controls-toggle").click()

def properties(page):
    return page.locator('#inspection-card dl').inner_text()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    context, page, errors = init(browser, 1440, 900)
    target = point(page)
    choose(page, 'inspect')
    page.mouse.move(**target)
    page.wait_for_function("() => document.querySelector('#inspection-card h3').textContent === 'Stone'")
    assert '153.5°C' in properties(page) and '22 ticks' in properties(page) and '5 ticks' in properties(page)
    assert not page.locator('#brush-control').is_visible() and not page.locator('#shape-btn').is_visible()
    assert not page.locator('#palette-toggle').is_visible()
    page.mouse.down(); page.mouse.up()
    assert page.evaluate('sandlab.inspector.pinned')
    page.mouse.move(**point(page, 120, 90))
    assert page.locator('#inspection-card h3').inner_text() == 'Stone'
    page.evaluate('sandlab.world.temp[80*sandlab.world.width+100]=166.75')
    page.wait_for_function("() => document.querySelector('#inspection-card dl').textContent.includes('166.8°C')")
    page.evaluate('sandlab.world.temp[80*sandlab.world.width+100]=153.5')
    page.locator('#inspect-zoom').select_option('12')
    assert page.evaluate('sandlab.inspector.zoom') == 12
    page.screenshot(path=str(ARTIFACTS/'inspection-desktop.png'))
    page.locator('#inspect-hold').click()
    page.mouse.move(**point(page, 120, 90))
    page.wait_for_function("() => document.querySelector('#inspection-card h3').textContent === 'Empty'")
    # Edge clipping must retain the center cell at all zoom levels.
    page.mouse.move(**point(page, 0, 0))
    for zoom in ['4','8','12']:
        page.locator('#inspect-zoom').select_option(zoom)
        page.mouse.move(**point(page, 0, 0)); page.wait_for_timeout(120)
    page.mouse.click(**target, button='right')
    assert page.locator('#undo-btn').is_disabled()
    assert page.evaluate('JSON.stringify(sandlab.snapshot()) === inspectionBefore')
    choose(page, 'eyedropper')
    page.mouse.move(**target); page.mouse.down(); page.mouse.move(**point(page, 125, 105), steps=8)
    page.wait_for_timeout(150); page.mouse.up()
    assert page.locator('#brush-tool').input_value() == 'paint'
    assert page.evaluate('sandlab.state.material === 3 && JSON.stringify(sandlab.snapshot()) === inspectionBefore')
    assert page.locator('#undo-btn').is_disabled()
    choose(page, 'eyedropper'); page.mouse.click(**point(page, 150, 100))
    assert page.locator('#brush-tool').input_value() == 'eyedropper'
    assert page.locator('#undo-btn').is_disabled()
    # Rebinding, conflict handling, modifier dispatch, toolbar hints, persistence, reset.
    page.locator('#settings-btn').click(); page.locator('#settings-tab-keyboard').click()
    page.locator('#binding-pause-1').click(); page.keyboard.press('b')
    assert 'Already assigned to Draw' in page.locator('.binding-status').inner_text()
    page.keyboard.press('j')
    assert page.evaluate("sandlab.settings.get('shortcuts').pause[1] === 'j'")
    page.locator('#binding-undo-0').click(); page.keyboard.press('Control+u')
    page.screenshot(path=str(ARTIFACTS/'keyboard-desktop.png'))
    # Closing and pressing a binding in the same task must not race the queued close event.
    page.evaluate("""()=>{document.querySelector('#settings-dialog .dialog-close').click();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'j',bubbles:true}));}""")
    assert not page.evaluate('sandlab.state.paused')
    page.keyboard.press('j'); assert page.evaluate('sandlab.state.paused')
    page.keyboard.press('p'); assert page.evaluate('sandlab.state.paused')
    page.keyboard.press('j'); assert not page.evaluate('sandlab.state.paused')
    page.keyboard.press('j'); assert page.evaluate('sandlab.state.paused')
    page.keyboard.press('m'); assert page.locator('#brush-tool').input_value() == 'inspect'
    page.keyboard.press('i'); assert page.locator('#brush-tool').input_value() == 'eyedropper'
    page.locator('#about-btn').click()
    assert page.locator('#about-dialog').is_visible()
    assert page.locator('#about-dialog kbd, #shortcut-list').count() == 0
    assert page.locator('#play-btn').get_attribute('title') == 'Pause / play (Space / J)'
    page.locator('#about-dialog .dialog-close').click()
    page.keyboard.press('b')
    page.mouse.click(**point(page, 130, 130))
    assert page.evaluate('sandlab.world.count > 1')
    page.keyboard.press('Control+z'); assert page.evaluate('sandlab.world.count > 1')
    page.keyboard.press('Control+u'); assert page.evaluate('sandlab.world.count === 1')
    # Text entry preserves literal rebound keys.
    page.locator('#search').fill('j'); assert page.evaluate('sandlab.state.paused')
    page.reload(); page.wait_for_function('() => !!window.sandlab')
    assert page.evaluate("sandlab.settings.get('shortcuts').pause[1] === 'j'")
    page.locator('#settings-btn').click(); page.locator('#settings-tab-keyboard').click()
    page.locator('#binding-inspect-0').click(); page.keyboard.press('Escape')
    assert not page.locator('#binding-inspect-0').get_attribute('class').endswith('capturing')
    page.locator('#reset-shortcuts').click()
    assert page.evaluate("JSON.stringify(sandlab.settings.get('shortcuts')) === '{}'")
    page.locator('#settings-dialog .dialog-close').click()
    assert not errors, errors
    context.close()
    for width,height in [(390,844),(360,740),(844,390)]:
        context,page,errors = init(browser,width,height,True)
        choose(page,'inspect'); target=point(page)
        page.touchscreen.tap(**target)
        page.wait_for_function("() => document.querySelector('#inspection-card h3').textContent === 'Stone'")
        assert page.evaluate('sandlab.inspector.pinned')
        assert '153.5°C' in properties(page)
        # Drag inspection follows the finger without painting or erasing.
        session = context.new_cdp_session(page)
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':target['x'],'y':target['y'],'id':7}]})
        edge=point(page,0,0)
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':edge['x'],'y':edge['y'],'id':7}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        page.wait_for_function("() => document.querySelector('#inspection-card h3').textContent === 'Empty'")
        assert page.evaluate('JSON.stringify(sandlab.snapshot()) === inspectionBefore')
        page.touchscreen.tap(**target); page.wait_for_timeout(120)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('#world').bounding_box()['height'] > 150
        page.screenshot(path=str(ARTIFACTS/f'inspection-{width}.png'))
        choose(page,'eyedropper'); page.touchscreen.tap(**target)
        assert page.evaluate('sandlab.state.material === 3 && JSON.stringify(sandlab.snapshot()) === inspectionBefore')
        assert page.locator('#undo-btn').is_disabled()
        page.locator('#settings-btn').click(); page.locator('#settings-tab-keyboard').click()
        assert page.evaluate("document.querySelector('.settings-panels').scrollWidth <= document.querySelector('.settings-panels').clientWidth")
        page.locator('#binding-pause-1').click(); page.keyboard.press('j')
        assert page.evaluate("sandlab.settings.get('shortcuts').pause[1] === 'j'")
        page.screenshot(path=str(ARTIFACTS/f'keyboard-{width}.png'))
        assert not errors, errors
        context.close()
    browser.close()
print('Inspection and binding checks passed: desktop, touch, edge zoom, no mutation/history, modifiers, conflicts, persistence/reset, and responsive layouts.')
