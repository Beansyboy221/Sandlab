"""Elastic input, phase-family palette, and uniformly sized grouped mobile UI."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes,json
ROOT=Path(__file__).resolve().parents[1]
def serve(route):
    path=ROOT/(route.request.url.split('sandlab.test/',1)[1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
def point(page,x,y):
    return page.evaluate('''([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return {x:b.x+p.x/d,y:b.y+p.y/d}}''',[x,y])
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,touch in [(1440,900,False),(320,740,True),(390,844,True),(844,390,True)]:
        c=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
        c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab');page.locator('#play-btn').click()
        page.evaluate("()=>{sandlab.settings.set('autosave',false);sandlab.world.clear()}")
        if touch:
            page.locator('#controls-toggle').tap();page.wait_for_timeout(300)
            assert page.locator('.play-controls').get_attribute('aria-label')=='Playback'
            assert page.locator('.edit-controls').get_attribute('aria-label')=='Edit'
            edit=page.locator('.edit-controls').bounding_box();draw=page.locator('.draw-controls').bounding_box()
            assert edit['y']+edit['height']<=draw['y']
            for id in ['undo-btn','redo-btn','clear-btn','step-btn','play-btn']:
                assert page.locator('#'+id).bounding_box()['height']>=44
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.locator('#palette-toggle').tap();page.wait_for_timeout(300)
            tiles=page.locator('.material').evaluate_all('es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))')
            assert max(t['w'] for t in tiles)-min(t['w'] for t in tiles)<1
            assert max(t['h'] for t in tiles)-min(t['h'] for t in tiles)<1
            assert min(t['h'] for t in tiles)==76
            page.screenshot(path=str(ROOT/'tests'/'artifacts'/f'elastic-palette-{width}.png'))
        assert page.locator('.material').count()==79
        for name in ['Molten Salt','Molten Copper','Steam','Ice','Liquid Nitrogen']:
            assert page.get_by_role('button',name=name,exact=True).count()==0
        page.locator('#search').fill('molten salt');assert page.locator('.material').count()==1
        assert page.locator('.material-name').inner_text()=='Salt';page.locator('#search').fill('')
        page.get_by_role('button',name='Salt',exact=True).click()
        assert page.locator('#draw-temperature').count()==0
        if touch and page.locator('#controls-toggle').get_attribute('aria-expanded')=='true':page.locator('#controls-toggle').tap()
        target=point(page,50,45);page.mouse.click(**target)
        assert page.evaluate("async()=>{const {M}=await import('./src/sim/materials.js');return sandlab.world.cells[45*sandlab.world.width+50]===M.Salt && sandlab.world.temp[45*sandlab.world.width+50]===20}")
        if touch:page.locator('#palette-toggle').tap();page.wait_for_timeout(250)
        page.locator('#categories').get_by_role('button',name='Elastics',exact=True).click()
        assert page.locator('.material').count()==3
        assert set(page.locator('.material-name').all_inner_texts())=={'Rope','Rubber','Jelly'}
        page.get_by_role('button',name='Rope',exact=True).click()
        if touch:page.locator('#controls-toggle').tap()
        page.evaluate('sandlab.world.clear();sandlab.state.setRadius(1)')
        page.mouse.move(**point(page,50,50));page.mouse.down();page.mouse.move(**point(page,85,50),steps=20);page.mouse.up()
        result=page.evaluate('''()=>{const w=sandlab.world;const count=w.count,ids=[...w.elastic.locations.keys()];const initial=[...w.elastic.locations.values()].reduce((sum,i)=>sum+(i%w.width)*w.gravityX+Math.floor(i/w.width)*w.gravityY,0)/count;let links=0;for(const i of w.elastic.locations.values())for(const b of w.elastic.bonds)if(w.elastic.locations.has(b[i]))links++;for(let n=0;n<90;n++)w.step();sandlab.renderer.draw();return {count,after:w.count,ids:ids.every(id=>w.elastic.locations.has(id)),links,travel:[...w.elastic.locations.values()].reduce((sum,i)=>sum+(i%w.width)*w.gravityX+Math.floor(i/w.width)*w.gravityY,0)/count-initial};}''')
        assert result['count']>36 and result['count']==result['after'] and result['ids'] and result['links']>35 and result['travel']>2,result
        if not touch:
            page.locator('#undo-btn').click();assert page.evaluate('sandlab.world.count')==0
            page.locator('#redo-btn').click();assert page.evaluate('sandlab.world.elastic.locations.size')==result['count']
        assert not errors,errors;c.close()
    browser.close()
print(json.dumps({'elastic_drawing_and_history':'pass','single_substance_palette':'pass','default_material_temperature':'pass','grouped_mobile_controls':'pass','equal_mobile_tiles':'pass'}))
