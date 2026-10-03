from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests/artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
 p=ROOT/(route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
 if p.is_file(): route.fulfill(body=p.read_bytes(),content_type=mimetypes.guess_type(p)[0] or 'text/plain')
 else: route.fulfill(status=404,body='not found')
def choose(page,tool):
 page.locator('#tool-picker-toggle').click();page.locator('[data-tool-option="'+tool+'"]').click()
def point(page,x,y):
 return page.evaluate('([x,y])=>{const r=sandlab.renderer;r.resize();const b=r.canvas.getBoundingClientRect(),d=r.canvas.width/b.width,p=r.project(x+.5,y+.5);return {x:b.x+p.x/d,y:b.y+p.y/d}}',[x,y])
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  context=browser.new_context(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=2)
  context.route('http://sandlab.test/**',serve);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://sandlab.test/');page.wait_for_function('()=>!!window.sandlab');page.evaluate('sandlab.state.paused=true;sandlab.settings.set("autosave",false)')
  if touch:page.locator('#controls-toggle').click()
  page.evaluate('''async()=>{const {M}=await import('./src/sim/materials.js');window.mat=M;const w=sandlab.world;w.clear();for(let y=20;y<=40;y++)for(let x=20;x<=50;x++)if(x===20||x===50||y===20||y===40)w.set(y*w.width+x,M.Wall);sandlab.state.material=M.Sand}''')
  choose(page,'fill');assert page.locator('#brush-control').is_hidden();assert page.locator('#shape-btn').is_hidden();assert page.locator('#fill-layer').is_visible();assert page.locator('#palette-toggle').is_visible()
  # Close the mobile overlay before touching the drawing surface.
  if touch:page.locator('#controls-toggle').click()
  start=point(page,25,25)
  if touch:page.touchscreen.tap(**start)
  else:
   page.mouse.move(**start);page.mouse.down();page.mouse.move(**point(page,15,15),steps=10);page.wait_for_timeout(150);page.mouse.up()
  assert page.evaluate('sandlab.world.cells.filter(id=>id===mat.Sand).length')==551
  if touch:page.locator('#controls-toggle').click()
  page.locator('#undo-btn').click();assert page.evaluate('sandlab.world.cells.includes(mat.Sand)')==False
  page.locator('#redo-btn').click();assert page.evaluate('sandlab.world.cells.filter(id=>id===mat.Sand).length')==551
  page.locator('#fill-layer').select_option('foreground');assert page.locator('#paint-color').is_visible();assert page.locator('#palette-toggle').is_hidden()
  page.evaluate('sandlab.state.color="#ff2244";sandlab.state.colorOpacity=.5')
  if touch:page.locator('#controls-toggle').click()
  if touch:page.touchscreen.tap(**start)
  else:page.mouse.click(**start)
  assert page.evaluate('sandlab.world.pigment.filter(Boolean).length')==551
  if touch:page.locator('#controls-toggle').click()
  page.locator('#fill-layer').select_option('background')
  if touch:page.locator('#controls-toggle').click()
  if touch:page.touchscreen.tap(**start)
  else:page.mouse.click(**start)
  assert page.evaluate('sandlab.world.backgroundPaint.every(Boolean)')
  # The static tab includes Wall and Portal; acids have one tile.
  if touch:page.locator('#controls-toggle').click()
  choose(page,'paint')
  palette_open = page.locator('#palette').evaluate("e=>e.classList.contains('open')") if touch else page.evaluate("!document.body.classList.contains('palette-hidden')")
  if not palette_open:page.locator('#palette-toggle').click()
  page.locator('#categories button').filter(has_text="Static").click();page.wait_for_function('()=>document.querySelectorAll(".material").length===3')
  page.locator('#categories button').filter(has_text="All").click();page.locator('#search').fill('acid');page.wait_for_function('()=>document.querySelectorAll(".material").length===1')
  page.locator('#search').fill('');assert page.locator('.material').count()==63
  if touch:page.locator('#palette-close').click()
  page.evaluate('''()=>{const w=sandlab.world;w.clear();for(let x=0;x<w.width;x++)w.set((w.height-20)*w.width+x,mat.Wall);for(let y=15;y<23;y++)for(let x=30;x<55;x++)w.set(y*w.width+x,mat.Steel);for(let n=0;n<25;n++)w.step();sandlab.renderer.draw()}''')
  assert page.evaluate('sandlab.world.rigid.locations.size')==200
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path=str(ARTIFACTS/f'fill-bodies-{width}x{height}.png'))
  assert not errors,errors
  context.close()
 browser.close()
print('Bucket input, Undo/Redo, color fills, Acid/Static palette, and body rendering passed on desktop, portrait and landscape mobile.')
