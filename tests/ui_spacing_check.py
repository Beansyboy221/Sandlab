"""Touch target, spacing, and overflow checks for settings, tools and palette."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes, json
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'tests'/'artifacts'; ART.mkdir(exist_ok=True)
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[-1].split('?')[0] or 'index.html')
    if path.is_file():route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:route.fulfill(status=404)
def choose(page, tool):
    page.locator('#tool-picker-toggle').click()
    page.locator(f'[data-tool-option="{tool}"]').click()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,mobile in [(1440,900,False),(1024,768,False),(320,740,True),(390,844,True),(844,390,True),(768,1024,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=mobile,is_mobile=mobile,device_scale_factor=2 if mobile else 1)
        context.route('http://sandlab.test/**',serve)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('()=>!!window.sandlab')
        page.locator('#play-btn').click()
        if mobile:page.locator('#controls-toggle').click()
        page.wait_for_timeout(250)
        page.screenshot(path=str(ART/f'spacing-toolbar-{width}.png'))
        for tool in ['paint','select','recolor','pressure']:
            choose(page,tool)
            assert not page.evaluate('()=>document.documentElement.scrollWidth>innerWidth')
            issues=page.locator('.draw-controls').evaluate('''e=>[...e.querySelectorAll('button,select,input[type="range"],.draw-replace')].filter(n=>n.getClientRects().length && getComputedStyle(n).display!=='none' && n.id!=='brush-tool').flatMap(n=>{const r=n.getBoundingClientRect();return r.height<43.9||r.x<0||r.right>innerWidth+1?[{id:n.id,width:r.width,height:r.height,x:r.x}]:[]})''')
            assert not issues,(width,tool,issues)
        choose(page,'paint')
        speed=page.locator('#speed').evaluate('e=>({height:e.getBoundingClientRect().height,padding:parseFloat(getComputedStyle(e).paddingLeft)})')
        assert speed['height']>=44 and speed['padding']>=10,(width,speed)
        if not page.locator('#settings-btn').is_visible():page.locator('#mobile-exit-focus').click()
        page.locator('#settings-btn').click()
        reset=page.locator('#reset-settings').bounding_box();tabs=page.locator('.settings-tabs').bounding_box()
        assert reset['y']+reset['height']<=tabs['y'],(width,reset,tabs)
        assert page.locator('#settings-storage-status').inner_text()==''
        assert not page.locator('#settings-storage-status').is_visible()
        for category in ['rendering','simulation','brush','atmosphere','audio','performance','keyboard']:
            tab=page.locator('#settings-tab-'+category);tab.scroll_into_view_if_needed();tab.click()
            issues=page.locator('#settings-panel-'+category).evaluate('''e=>[...e.querySelectorAll('select,input[type="range"]')].filter(n=>n.getClientRects().length).flatMap(n=>{const r=n.getBoundingClientRect(),panel=e.getBoundingClientRect();return r.height<43.9||r.x<panel.x-1||r.right>panel.right+1?[{id:n.id,height:r.height,x:r.x,right:r.right,panelRight:panel.right}]:[]})''')
            assert not issues,(width,category,issues)
        page.locator('#settings-tab-simulation').scroll_into_view_if_needed();page.locator('#settings-tab-simulation').click()
        page.screenshot(path=str(ART/f'spacing-settings-{width}.png'))
        # Reset remains accessible while categories/panels scroll independently.
        page.locator('#reset-settings').click()
        assert page.evaluate('sandlab.settings.get("speed")')==1
        page.locator('#settings-dialog .dialog-close').click()
        if mobile or width<=1100:
            if page.locator('#controls-toggle').is_visible() and page.locator('#controls-toggle').get_attribute('aria-expanded')=='false':page.locator('#controls-toggle').click()
            page.locator('#palette-toggle').click()
        elif page.locator('body').evaluate('e=>e.classList.contains("palette-hidden")'):
            page.locator('#palette-toggle').click()
        page.screenshot(path=str(ART/f'spacing-palette-{width}.png'))
        assert page.locator('.material-detail').count()==0
        boxes=page.locator('#materials .material').evaluate_all('es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
        assert boxes and min(b['height'] for b in boxes)>=56
        assert max(b['width'] for b in boxes)-min(b['width'] for b in boxes)<1
        assert not page.evaluate('()=>document.documentElement.scrollWidth>innerWidth')
        assert not errors,errors
        context.close()
    browser.close()
print(json.dumps({'settings_and_toolbar_targets':'pass','reset_at_top_no_storage_slogan':'pass','speed_padding':'pass','six_desktop_mobile_sizes':'pass'}))
