"""Actual mouse/touch stamps use the displayed canvas-pixel diameter."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def serve(route):
    relative = route.request.url.split('sandlab.test/', 1)[-1].split('?')[0]
    path = ROOT / (relative or 'index.html')
    if path.is_file():
        route.fulfill(body=path.read_bytes(),
                      content_type=mimetypes.guess_type(path)[0] or 'text/plain')
    else:
        route.fulfill(status=404)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height, touch in [(1440, 900, False), (390, 844, True), (844, 390, True)]:
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      is_mobile=touch, has_touch=touch, device_scale_factor=2)
        context.route('http://sandlab.test/**', serve)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://sandlab.test/')
        page.wait_for_function('!!window.sandlab')
        page.evaluate('''async () => {
          sandlab.state.paused = true;
          sandlab.settings.set('autosave', false);
          const {M} = await import('./src/sim/materials.js');
          sandlab.state.material = M.Wall;
          sandlab.state.tool = 'paint';
        }''')
        for size in [1, 2, 3, 4, 5, 8, 13, 31, 61]:
            for shape in ['circle', 'square']:
                point = page.evaluate('''([size, shape]) => {
                  const {world: w, renderer: r, state: s} = sandlab;
                  w.clear(); s.shape = shape;
                  const slider = document.querySelector('#brush');
                  slider.value = size;
                  slider.dispatchEvent(new Event('input', {bubbles: true}));
                  r.resetView(); r.resize();
                  const rect = r.canvas.getBoundingClientRect();
                  const ratio = r.canvas.width / rect.width;
                  const point = r.project(Math.floor(w.width / 2) + 0.5,
                                          Math.floor(w.height / 2) + 0.5);
                  return {x: rect.x + point.x / ratio, y: rect.y + point.y / ratio};
                }''', [size, shape])
                if touch:
                    page.touchscreen.tap(**point)
                else:
                    page.mouse.click(**point)
                result = page.evaluate('''() => {
                  const w = sandlab.world;
                  let minX = w.width, minY = w.height, maxX = -1, maxY = -1;
                  for (let i = 0; i < w.length; i++) if (w.cells[i]) {
                    minX = Math.min(minX, i % w.width);
                    maxX = Math.max(maxX, i % w.width);
                    minY = Math.min(minY, Math.floor(i / w.width));
                    maxY = Math.max(maxY, Math.floor(i / w.width));
                  }
                  return {width: maxX - minX + 1, height: maxY - minY + 1,
                    size: +document.querySelector('#brush-value').value,
                    stored: sandlab.settings.get('brushSize')};
                }''')
                assert result == {'width': size, 'height': size, 'size': size, 'stored': size}, (width, shape, result)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        context.close()
    browser.close()

print('Exact odd/even brush diameters passed for mouse, portrait touch and landscape touch.')
