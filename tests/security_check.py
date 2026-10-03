"""Exercise the real browser's policy and hostile saved-world inputs."""
import json, mimetypes, struct
from urllib.parse import urljoin
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                               args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    requests, external, errors = [], [], []
    def serve(route):
        url = route.request.url
        requests.append(url)
        if not url.startswith('http://sandlab.test/'):
            external.append(url)
            route.abort()
            return
        if url == 'http://sandlab.test/security-probe.js':
            route.fulfill(content_type='text/javascript', body="""
                window.blockedEval = 0;
                try { eval('window.securityMarker=4'); } catch { window.blockedEval++; }
                try { new Function('window.securityMarker=5')(); } catch { window.blockedEval++; }
            """)
            return
        path = ROOT / (url.removeprefix('http://sandlab.test/').split('?')[0] or 'index.html')
        if path.is_file():
            route.fulfill(body=path.read_bytes(), content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        else:
            route.fulfill(status=404, body='missing')
    context.route('**/*', serve)
    context.add_init_script("""document.addEventListener('securitypolicyviolation', e => {
        (window.policyBlocks ||= []).push(e.effectiveDirective);
    });""")
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://sandlab.test/')
    page.wait_for_function('() => (window.sandlab !== undefined)')
    page.locator('#play-btn').click()
    page.evaluate("""() => {
      window.securityMarker = 0;
      const probe = document.createElement('script');
      probe.src = '/security-probe.js'; document.body.append(probe);
      const inline = document.createElement('script');
      inline.textContent = 'window.securityMarker=1'; document.body.append(inline);
      const remote = document.createElement('script');
      remote.src = 'https://example.invalid/probe.js'; document.body.append(remote);
      const img = document.createElement('img');
      img.setAttribute('onerror','window.securityMarker=2');
      img.src = 'data:image/png;base64,broken'; document.body.append(img);
      fetch('https://example.invalid/probe').catch(()=>{});
      const frame = document.createElement('iframe');
      frame.src='https://example.invalid/'; document.body.append(frame);
    }""")
    page.wait_for_function('() => window.blockedEval === 2')
    page.wait_for_timeout(300)
    assert page.evaluate('window.securityMarker') == 0
    blocked = page.evaluate('window.policyBlocks')
    for directive in ['script-src-elem', 'script-src-attr', 'connect-src', 'frame-src']:
        assert directive in blocked, blocked
    assert not external, external
    page.evaluate("""() => {
      localStorage.setItem('sandlab.saves.v1', JSON.stringify([{
        id:1, name:'<img id="injected-save" src=x onerror="window.securityMarker=3">',
        date:'2026-10-01', data:{}, thumbnail:'https://example.invalid/tracker'
      }]));
    }""")
    page.locator('#save-btn').click()
    assert page.locator('#injected-save').count() == 0
    assert '<img' in page.locator('.save-copy h3').inner_text()
    assert page.locator('.save-row img').get_attribute('src') is None
    before = page.evaluate('sandlab.world.count')
    page.locator('#import-file').set_input_files({
        'name':'malformed.sandlab', 'mimeType':'application/json',
        'buffer':json.dumps({'version':1,'width':-8,'height':-8,'encoding':'rle'}).encode()
    })
    page.wait_for_function("() => (document.getElementById('toast').textContent.includes('unsupported'))")
    assert page.evaluate('sandlab.world.count') == before
    assert page.evaluate('window.securityMarker') == 0
    # A valid-sized but corrupt save must not discard redo while validation fails.
    page.locator('#saves-dialog .dialog-close').click()
    page.evaluate("() => {sandlab.loadPreset('blank');sandlab.world.set(100,1);}")
    page.locator('#undo-btn').click()
    assert not page.locator('#redo-btn').is_disabled()
    page.locator('#save-btn').click()
    corrupt = page.evaluate('() => sandlab.snapshot()')
    corrupt['pressure'][0] = 1e300
    page.locator('#import-file').set_input_files({
        'name':'bad-pressure.sandlab','mimeType':'application/json',
        'buffer':json.dumps(corrupt).encode()
    })
    page.wait_for_function("() => document.getElementById('toast').textContent.includes('pressure')")
    assert not page.locator('#redo-btn').is_disabled()
    assert page.evaluate('sandlab.world.count') == 0
    assert not errors, errors
    assert not external, external
    print(json.dumps({'browser_policy':'pass','hostile_saves':'pass',
                      'unexpected_external_requests':external,'runtime_errors':errors}))
    context.close()
    # Read the built release under the real GitHub Pages path, not just root URLs.
    installed = browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    prefix='https://sandlab.test/Sandlab/'
    missing=[]
    def release(route):
        path=ROOT/'dist'/(route.request.url.removeprefix(prefix).split('?')[0] or 'index.html')
        if path.is_file():
            route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
        else:
            missing.append(route.request.url);route.fulfill(status=404)
    installed.route(prefix+'**',release)
    app=installed.new_page();app.goto(prefix);app.wait_for_function('!!window.sandlab')
    manifest=installed.new_cdp_session(app).send('Page.getAppManifest')
    assert not manifest['errors'],manifest['errors']
    assert manifest['url']==prefix+'public/manifest.webmanifest'
    settings=json.loads(manifest['data']);assert settings['display']=='standalone'
    for key in ['id','start_url','scope']:
        assert urljoin(manifest['url'],settings[key])==prefix
    assets=[(app.locator('link[rel=apple-touch-icon]').get_attribute('href'),180),(app.locator('link[rel=icon]').get_attribute('href'),32)]
    assert app.locator('meta[name=apple-mobile-web-app-capable]').get_attribute('content')=='yes'
    assert app.locator('meta[name=apple-mobile-web-app-title]').get_attribute('content')=='Sandlab'
    for item in settings['icons']:
        assets.append((urljoin(manifest['url'],item['src']),int(item['sizes'].split('x')[0])))
        assert item['purpose']=='any maskable' and item['type']=='image/png'
    for path,size in assets:
        url=urljoin(prefix,path)
        decoded=app.evaluate('''async url=>{const image=new Image();image.src=url;await image.decode();return [image.naturalWidth,image.naturalHeight]}''',url)
        assert decoded==[size,size]
        png=(ROOT/'dist'/url.removeprefix(prefix)).read_bytes();assert png[:8]==b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II',png[16:24])==(size,size)
    if app.locator('#mobile-exit-focus').is_visible():app.locator('#mobile-exit-focus').tap()
    app.locator('#about-btn').focus();app.keyboard.press('Enter');assert app.locator('#about-dialog').is_visible()
    app.locator('#changelog-btn').tap();assert app.locator('#changelog-dialog').is_visible()
    app.locator('#changelog-dialog .dialog-close').tap()
    assert app.locator('#about-btn').evaluate('e=>e===document.activeElement')
    app.keyboard.press('Space');assert app.locator('#about-dialog').is_visible()
    assert not missing,missing
    print('Built /Sandlab/ manifest, icon dimensions, standalone metadata, keyboard logo access and modal focus restoration passed.')
    installed.close();browser.close()
