"""Category rail bounds, expansion, scroll and mixtures on desktop and touch layouts."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,mobile in [(1440,900,False),(390,844,True),(844,390,True),(320,568,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile)
        context.route('http://sandlab.test/**',serve)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab');page.evaluate('sandlab.state.paused=true')
        if mobile:
            page.locator('#controls-toggle').click();page.locator('#palette-toggle').click()
        page.locator('#palette-browser').wait_for(state='visible')
        page.wait_for_timeout(300)
        toggle=page.locator('#category-rail-toggle')
        assert toggle.get_attribute('aria-expanded')=='false'
        names=page.locator('.material-name').all_text_contents()
        assert not set(names)&{'Brine','Soapy Water','Mud','Wet Clay'}
        assert {'Soap','Water','Clay','Dirt','Salt'}<=set(names)
        for expanded in [False,True]:
            if expanded:
                toggle.click();page.wait_for_timeout(250)
            geometry=page.evaluate('''()=>{
                const grid=document.querySelector('#materials').getBoundingClientRect(),rail=document.querySelector('.category-rail').getBoundingClientRect();
                const tabs=[...document.querySelectorAll('#categories button')].map(e=>({x:e.offsetLeft,y:e.offsetTop,w:e.offsetWidth,h:e.offsetHeight}));
                return {grid:{left:grid.left,right:grid.right,width:grid.width,bottom:grid.bottom},rail:{left:rail.left,right:rail.right,bottom:rail.bottom},tabs,overflow:document.documentElement.scrollWidth>innerWidth};
            }''')
            assert geometry['rail']['left']>=geometry['grid']['right'],geometry
            assert geometry['rail']['right']<=width and geometry['rail']['bottom']<=height+1,geometry
            assert not geometry['overflow'] and geometry['grid']['width']>100,geometry
            assert all(t['h']>=44 for t in geometry['tabs']),geometry
            assert len(set(t['x'] for t in geometry['tabs']))==1,geometry
            assert page.locator('#categories button span').first.is_visible()==expanded, page.evaluate("()=>({expanded:document.querySelector('#palette-browser').className,display:getComputedStyle(document.querySelector('#categories button span')).display,html:document.querySelector('#categories button').outerHTML})")
        assert page.locator('#categories button').last.get_attribute('id')=='groups-btn'
        before=page.locator('#categories [data-group]').count()
        page.locator('#groups-btn').click()
        if mobile: assert float(page.locator('#group-name').evaluate("e=>parseFloat(getComputedStyle(e).fontSize)"))>=16
        page.locator('#group-name').fill('Favorites')
        page.locator('#group-materials').get_by_role('button',name='Sand',exact=True).click()
        page.locator('#group-save').click()
        page.wait_for_function('!document.querySelector("#groups-dialog").open')
        assert page.locator('#categories [data-group]').count()==before+1
        assert page.locator('#categories button').nth(-2).get_attribute('data-group')=='custom-1'
        assert page.locator('#categories button').last.get_attribute('id')=='groups-btn'
        assert page.locator('#category-title').text_content()=='Favorites'
        page.locator('#groups-edit-toggle').click()
        assert page.locator('#categories [data-group="all"]').is_disabled()
        page.get_by_role('button',name='Delete Favorites group',exact=True).click()
        assert not page.locator('#categories [data-group="custom-1"]').count()
        assert page.locator('#category-title').text_content()=='All materials'
        page.locator('#categories [data-group="powder"]').click()
        assert not page.locator('#categories [data-group="powder"]').count()
        assert page.locator('#groups-restore').is_visible()
        page.reload();page.wait_for_function('!!window.sandlab');page.evaluate('sandlab.state.paused=true')
        if mobile:
            page.locator('#controls-toggle').click();page.locator('#palette-toggle').click()
        page.wait_for_timeout(300)
        assert not page.locator('#categories [data-group="powder"]').count()
        page.locator('#groups-restore').click()
        assert page.locator('#categories [data-group="powder"]').count()==1
        assert not page.locator('#groups-restore').is_visible()
        assert page.locator('#categories button').last.get_attribute('id')=='groups-btn'
        page.locator('#categories [data-group="liquid"]').click()
        assert page.locator('.material').count()>0
        page.locator('#entities-tab').click();assert page.locator('.material').count()==23
        assert not errors,errors
        page.screenshot(path=str(ROOT/'tests/artifacts'/f'palette-rail-{width}.png'))
        print(f'Palette rail, groups and mixtures: {width}x{height} passed')
        context.close()
    browser.close()
