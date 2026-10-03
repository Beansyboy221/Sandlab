"""Desktop organization and standard Gamepad API integration on touch and mouse."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'tests/artifacts';ART.mkdir(exist_ok=True)
def serve(route):
    path=ROOT/(route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height,mobile in [(1440,900,False),(1024,768,False),(390,844,True),(844,390,True)]:
        c=b.new_context(viewport=dict(width=width,height=height),has_touch=mobile,is_mobile=mobile,device_scale_factor=2)
        c.route('http://sandlab.test/**',serve);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script("""window.testPad={index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[testPad]});""")
        page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab?.controller')
        page.evaluate("""async()=>{window.M=(await import('./src/sim/materials.js')).M;sandlab.settings.set('autosave',false);sandlab.state.paused=true;
          window.controlFrame=(buttons=[],axes=[0,0,0,0])=>{testPad.buttons.forEach((b,n)=>{b.pressed=buttons.includes(n);b.value=b.pressed?1:0});testPad.axes=axes;sandlab.controller.focused=true;sandlab.controller.update(1000/60);sandlab.controller.input.update();sandlab.playerControls.update();};controlFrame();}""")
        if page.evaluate('document.body.classList.contains("canvas-focus")'):page.locator('#mobile-exit-focus').click()
        # Desktop drop-down collapses the actual sidebar and expands drawing room.
        if width>1100:
            before=page.locator('#world').bounding_box()['width'];page.locator('#palette-toggle').click();page.wait_for_timeout(100)
            assert not page.locator('#palette').is_visible()
            assert page.locator('#palette-toggle').get_attribute('aria-expanded')=='false'
            assert page.locator('#world').bounding_box()['width']>before
            page.locator('#palette-toggle').click();assert page.locator('#palette').is_visible()
            assert page.locator('.play-controls .control-caption').is_visible()
        assert page.locator('#zoom-in-btn,#zoom-out-btn,#world-resolution').count()==0
        assert page.locator('.draw-controls').get_attribute('aria-label')=='Tool'
        assert page.locator('.draw-controls > .control-caption').inner_text()=='Tool'
        assert page.locator('.draw-controls #tool-properties,.draw-controls #deselect-selection,.draw-controls #replace-property,.draw-controls #device-facing-property').count()==4
        assert page.locator('.topline-right #view').count()==1
        assert page.locator('.toolbox #view,.toolbox > .utility-controls,.toolbox > .camera-controls').count()==0
        assert page.locator('#view').is_visible()
        if mobile:page.locator('#controls-toggle').click()
        # Every tool's visible properties stay inside the Tool border on each layout.
        for tool in ['paint','fill','recolor','erase','select','grab','warm','cool','wind','pressure','vacuum','inspect','guide','eyedropper']:
            page.locator('#tool-picker-toggle').click();page.locator(f'[data-tool-option="{tool}"]').click()
            if mobile:assert page.locator('#controls-toggle').get_attribute('aria-expanded')=='true'
            assert page.locator('.draw-controls').evaluate("group=>[...group.querySelectorAll('button,input,select,label')].filter(e=>e.getClientRects().length).every(e=>{const g=group.getBoundingClientRect(),b=e.getBoundingClientRect();return b.left>=g.left-1&&b.right<=g.right+1&&b.top>=g.top-1&&b.bottom<=g.bottom+1})"),tool
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=paint]').click()
        if mobile:page.locator('#controls-toggle').click()

        assert page.locator('.draw-controls #brush-control').count()==1
        assert page.locator('#speed').evaluate("e=>parseFloat(getComputedStyle(e).borderTopWidth)>0")
        assert page.locator('#categories button').evaluate_all("tabs=>tabs.every(t=>t.querySelector('svg[aria-hidden=true]') && !t.style.getPropertyValue('--color'))")
        page.locator('#tool-picker-toggle').click()
        assert page.locator('[data-tool-option=fan],[data-tool-option=squeeze]').count()==0
        assert page.locator('[data-tool-option=eyedropper]').inner_text()=='Pick'
        page.locator('[data-tool-option=eyedropper]').click()
        assert page.locator('#tool-picker-toggle').get_attribute('aria-label')=='Tool: Pick'
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=paint]').click()
        page.locator('#tool-picker-toggle').click()
        assert page.locator('.tool-picker-heading').all_text_contents()==['Create','Arrange','Environment','Inspect & Guide']
        assert page.locator('#tool-picker-menu [role=option]').count()==14
        assert page.locator('.tool-picker-group').evaluate_all("groups=>groups.every(g=>parseFloat(getComputedStyle(g).borderTopWidth)>0 && [...g.querySelectorAll('button')].every(b=>{const p=g.getBoundingClientRect(),c=b.getBoundingClientRect();return c.left>=p.left && c.right<=p.right+.5}))")
        page.keyboard.press('Escape')
        if width>1100:
            assert page.locator('.play-controls,.edit-controls,.draw-controls,.material-controls').evaluate_all("groups=>groups.every(g=>parseFloat(getComputedStyle(g).borderTopWidth)>0 && g.querySelector('.control-caption').getBoundingClientRect().top>=g.getBoundingClientRect().top)")
        assert page.locator('.header-actions [data-icon=help]').count()==0
        assert page.locator('#about-btn').evaluate("e=>e.tagName==='BUTTON' && e.classList.contains('brand') && e.getBoundingClientRect().height>=44")
        # About lives on both halves of the logo, without a page reload or lost world.
        page.locator('#about-btn .brand-mark').click()
        assert page.locator('#about-dialog').is_visible()
        page.locator('#about-dialog .dialog-close').click()
        assert page.locator('#about-btn').evaluate('e=>e===document.activeElement')
        page.locator('#about-btn > span:last-child').click();assert not page.locator('#about-dialog .small-print').count()
        interaction_count=page.evaluate("async()=> (await import('./src/sim/chemistry.js')).interactionCount")
        assert page.locator('#app-content-count').inner_text().endswith(f'{interaction_count} interactions') and interaction_count>0
        assert page.locator('#changelog-btn').evaluate("e=>getComputedStyle(e).backgroundColor!='rgba(0, 0, 0, 0)' && e.getBoundingClientRect().height>=44")
        assert page.locator('#changelog-btn').evaluate("e=>Math.abs(e.getBoundingClientRect().right-e.parentElement.getBoundingClientRect().right)<1")
        page.locator('#about-dialog .dialog-close').click()
        page.locator('#save-btn').click()
        assert page.locator('#export-btn').inner_text()=='Export'
        assert page.locator('#import-btn').inner_text()=='Import'
        assert not page.locator('#saves-dialog .small-print').count()
        page.locator('#saves-dialog .dialog-close').click()
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=recolor]').click();assert page.locator('#tool-picker-toggle').get_attribute('aria-label')=='Tool: Color'
        page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option=paint]').click()
        page.locator('#settings-btn').click();page.locator('#settings-tab-keyboard').click()
        assert not page.locator('#settings-panel-keyboard .settings-note').count()
        page.locator('#settings-tab-simulation').click()
        for key in ['windSimulation','pressureSimulation','temperatureSimulation']:
            toggle=page.locator('#setting-'+key);assert toggle.is_checked();toggle.click()
            assert page.evaluate('key=>sandlab.world.mechanics[key]===false',key)
            toggle.click();assert page.evaluate('key=>sandlab.world.mechanics[key]===true',key)
        page.locator('#settings-dialog .dialog-close').click()
        page.evaluate("sandlab.world.clear();sandlab.controller.navigation=null;sandlab.controller.position={x:.5,y:.5};sandlab.controller.input.canvas.focus();controlFrame();controlFrame([7]);controlFrame([7],[1,0,0,0]);controlFrame();")
        count=page.evaluate('sandlab.world.count');assert count>0
        page.evaluate('controlFrame([6]);controlFrame();');erased=page.evaluate('sandlab.world.count');assert erased<count
        assert page.evaluate('sandlab.controller.input.pointers.size')==0
        page.evaluate('document.querySelector("#undo-btn").click()');assert page.evaluate('sandlab.world.count')==count
        page.evaluate('document.querySelector("#redo-btn").click()');assert page.evaluate('sandlab.world.count')==erased
        # Holding Start toggles once; menu navigation uses real tool callbacks.
        paused=page.evaluate('sandlab.state.paused');page.evaluate('controlFrame([9]);controlFrame([9]);');assert page.evaluate('sandlab.state.paused')!=paused
        page.evaluate('controlFrame();controlFrame([9]);controlFrame();');assert page.evaluate('sandlab.state.paused')==paused
        radius=page.evaluate('sandlab.state.radius');page.evaluate('controlFrame([12]);controlFrame();');assert page.evaluate('sandlab.state.radius')==radius+1
        page.evaluate('controlFrame([3]);controlFrame();');assert page.locator('#tool-picker-menu').is_visible()
        page.evaluate('controlFrame([13]);controlFrame();controlFrame([0]);controlFrame();');assert page.evaluate('sandlab.state.tool')=='fill'
        page.evaluate('controlFrame([4,5]);controlFrame();');assert page.locator('#settings-dialog').is_visible()
        page.locator('#settings-tab-controller').click()
        old_zone=page.evaluate("sandlab.settings.get('controllerDeadzone')")
        page.locator('#setting-controllerDeadzone').focus()
        page.evaluate('controlFrame([14]);controlFrame();');assert page.evaluate("sandlab.settings.get('controllerDeadzone')")<old_zone
        page.evaluate('controlFrame([1]);controlFrame();');assert not page.locator('#settings-dialog').is_visible()
        # Switch back to Draw, then exercise automatic pause through virtual input.
        page.evaluate("document.querySelector('#brush-tool').value='paint';document.querySelector('#brush-tool').dispatchEvent(new Event('change'));sandlab.state.material=M.Copper;sandlab.state.paused=false;controlFrame();controlFrame([7]);")
        assert page.evaluate('sandlab.state.paused')
        page.evaluate('controlFrame();');assert not page.evaluate('sandlab.state.paused')
        page.evaluate("sandlab.settings.set('solidDrawRelease','hold');controlFrame();controlFrame([7]);controlFrame();")
        assert page.evaluate('sandlab.state.paused')
        # Player movement/jump, editing mode and disconnect safety.
        player=page.evaluate("()=>{const w=sandlab.world;w.clear();w.stickmen.spawn(w.width*.5,w.height*.5,M.Player);sandlab.state.paused=false;controlFrame();controlFrame([],[.8,0,0,0]);controlFrame([],[.8,0,0,0]);const move=w.stickmen.controls.move;controlFrame();const stopped=w.stickmen.controls.move;controlFrame([0]);return{move,stopped,jump:w.stickmen.controls.jump};}")
        assert player['move']>.5 and player['stopped']==0 and player['jump'],player
        page.evaluate('controlFrame();controlFrame([8]);controlFrame();');assert page.evaluate('sandlab.controller.playing')==False
        page.evaluate('testPad.connected=false;controlFrame();');assert page.evaluate('sandlab.controller.input.pointers.size')==0
        assert page.evaluate('sandlab.world.stickmen.controls.move')==0
        assert not page.locator('.controller-hud').is_visible()
        page.locator('#about-btn').focus();page.keyboard.press('Space')
        assert page.locator('#about-dialog').is_visible()
        page.locator('#about-dialog .dialog-close').click()
        assert not errors,errors
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(ART/f'controller-{width}x{height}.png'))
        print(f'Categories, palette, About, controller drawing/history/menus/player/disconnect: {width}x{height}',flush=True);c.close()
    b.close()
