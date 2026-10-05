"""World rules, unified detail input, conservation and phone orientation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
        context.route('http://sandlab.test/**',serve)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
        page.evaluate('sandlab.settings.set("startPaused",true);sandlab.state.paused=true')
        page.locator('#level-properties-btn').click()
        page.locator('#world-setting-temperatureSimulation').uncheck()
        page.locator('#level-submit').click()
        assert page.evaluate('!sandlab.world.mechanics.temperatureSimulation')
        page.evaluate('''()=>{const w=sandlab.world;w.clear();w.set(Math.floor(w.height/2)*w.width+Math.floor(w.width/2),3,87);w.pigment[w.cells.indexOf(3)]=0xffabcdef;window.count=w.count;window.oldWidth=w.width;window.oldHeight=w.height;}''')
        canvas=page.locator('#world');box=canvas.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
        page.keyboard.down('Control');page.mouse.wheel(0,-100);page.keyboard.up('Control')
        page.wait_for_function('sandlab.renderer.zoom>1')
        zoom=page.evaluate('sandlab.renderer.zoom');assert page.evaluate('sandlab.world.metersPerPixel')==.0625
        page.wait_for_function('document.querySelector("#zoom-value").value!=="100%"')
        page.keyboard.down('Alt');page.mouse.wheel(0,100);page.keyboard.up('Alt')
        page.wait_for_function('sandlab.world.metersPerPixel===.125')
        assert page.evaluate('sandlab.renderer.zoom')==1
        assert page.evaluate('sandlab.world.width===oldWidth && sandlab.world.height===oldHeight && sandlab.world.count===count')
        assert page.evaluate('sandlab.world.temp[sandlab.world.cells.indexOf(3)]===87')
        assert page.evaluate('!sandlab.world.mechanics.temperatureSimulation')
        page.locator('#level-properties-btn').click()
        assert page.locator('#level-metersPerPixel').input_value()=='0.125'
        assert page.locator('#level-width').is_visible() and page.locator('#level-height').is_visible()
        page.keyboard.press('Escape')
        page.locator('#settings-btn').click();page.locator('#settings-tab-performance').click()
        page.locator('#setting-maxCacheMB').select_option('4')
        assert page.evaluate('sandlab.settings.get("maxCacheMB")')==4
        page.locator('#settings-dialog .dialog-close').click()
        # Zoom defaults to uninterrupted playback, then opt-in pause stays paused.
        page.evaluate('sandlab.state.paused=false')
        page.locator('#settings-btn').click();page.locator('#settings-tab-simulation').click()
        assert not page.locator('#setting-pauseWhenZooming').is_checked()
        page.locator('#setting-pauseWhenZooming').check()
        page.locator('#settings-dialog .dialog-close').click()
        assert not page.evaluate('sandlab.state.paused')
        box=canvas.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
        page.keyboard.down('Control');page.mouse.wheel(0,-100);page.keyboard.up('Control')
        page.wait_for_function('sandlab.world.metersPerPixel===.0625 && sandlab.state.paused')
        tick=page.evaluate('sandlab.world.tick');page.wait_for_timeout(150)
        assert page.evaluate('sandlab.world.tick')==tick
        # World-settings zoom follows the same option, including dialog close.
        page.evaluate('sandlab.state.paused=false')
        page.locator('#level-properties-btn').click()
        page.locator('#level-metersPerPixel').select_option('0.125')
        page.locator('#level-submit').click()
        page.wait_for_timeout(50)
        assert page.evaluate('sandlab.state.paused && sandlab.world.metersPerPixel===.125')
        page.locator('#play-btn').click();assert not page.evaluate('sandlab.state.paused')
        page.evaluate('sandlab.settings.set("pauseWhenZooming",false)')
        box=canvas.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
        page.keyboard.down('Alt');page.mouse.wheel(0,100);page.keyboard.up('Alt')
        page.wait_for_function('sandlab.world.metersPerPixel===.25')
        assert not page.evaluate('sandlab.state.paused')
        page.evaluate('sandlab.state.paused=true')
        if mobile:
            page.evaluate('Object.defineProperty(window,"orientation",{configurable:true,value:90});window.dispatchEvent(new Event("orientationchange"))')
            page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(200)
            assert page.evaluate('sandlab.world.width===oldWidth && sandlab.world.metersPerPixel===.25')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not errors,errors
        context.close()
    browser.close()
print('PASS: world-owned rules, percentage Zoom, unified Ctrl/Alt+scroll zoom, content/temperature conservation, unified simulation zoom and mobile rotation.')
