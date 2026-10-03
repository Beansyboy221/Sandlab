"""Measure only rigid drawing, with the same scene across optional checkouts.

Usage: python3 tests/rigid-render-benchmark.py [checkout-directory]
Requires the browser test environment (Playwright and /usr/bin/chromium).
"""
from pathlib import Path
import json
import mimetypes
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]


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
    context = browser.new_context()
    context.route('http://sandlab.test/**', serve)
    page = context.new_page()
    page.goto('http://sandlab.test/')
    page.wait_for_function('!!window.sandlab')
    result = page.evaluate('''async () => {
      sandlab.state.paused = true;
      const {World} = await import('./src/sim/world.js');
      const {M} = await import('./src/sim/materials.js');
      const {drawRigidBodies} = await import('./src/sim/rigid-renderer.js');
      const w = new World(320, 200);
      for (let y = 10; y < 110; y++)
        for (let x = 50; x < 210; x++) w.set(y * 320 + x, M.Steel);
      w.rigid.rebuild();
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      const colors = new Uint8ClampedArray(w.length * 3);
      for (let i = 0; i < colors.length; i++) colors[i] = 80 + i % 140;
      const viewport = {x: 0, y: 0, scale: 4};
      const times = [];
      for (let frame = 0; frame < 120; frame++) {
        const start = performance.now();
        drawRigidBodies(ctx, w, viewport, colors);
        if (frame >= 20) times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return {
        cells: w.rigid.locations.size,
        samples: times.length,
        meanMs: times.reduce((sum, value) => sum + value, 0) / times.length,
        p95Ms: times[Math.floor(times.length * 0.95)],
      };
    }''')
    browser.close()

print(json.dumps(result))
