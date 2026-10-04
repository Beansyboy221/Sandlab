"""Creature palette, audible stereo output, Echolocation and mobile layout."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests/artifacts';ARTIFACTS.mkdir(exist_ok=True)
def serve(route):
    path=ROOT/(route.request.url.split('http://sandlab.test/')[-1].split('?')[0] or 'index.html')
    route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'text/plain') if path.is_file() else route.fulfill(status=404)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context();context.route('http://sandlab.test/**',serve)
    page=context.new_page();page.goto('http://sandlab.test/');page.wait_for_function('!!window.sandlab')
    page.evaluate('sandlab.state.paused=true')
    result=page.evaluate('''async()=>{
      const {GameAudio,soundPosition}=await import('./src/audio.js');
      const {AudioOutput}=await import('./src/audio-output.js');
      async function render(cutoff,reflections,outputMode){
        const c=new OfflineAudioContext(2,48000*2,48000),a=Object.create(GameAudio.prototype);
        Object.assign(a,{context:c,buffers:new Map(),active:new Set(),played:0,lastVoices:[],master:c.createGain()});
        if(outputMode)new AudioOutput(c,a.master,outputMode);else a.master.connect(c.destination);a.play({kind:'splash',strength:1,mass:1},{pan:0,gain:1},{cutoff,clarity:1,reflections});
        const buffer=await c.startRendering(),data=buffer.getChannelData(0);
        const rms=(lo,hi)=>Math.sqrt(data.slice(lo*48000,hi*48000).reduce((n,v)=>n+v*v,0)/((hi-lo)*48000));
        let high=0;for(let i=1;i<48000*.38;i++)high+=(data[i]-data[i-1])**2;
        return {rms:rms(0,.38),high,tail:rms(.42,.7),peak:data.reduce((a,v)=>Math.max(a,Math.abs(v)),0),active:a.active.size};
      }
      const dry=await render(16000,[]),muffled=await render(450,[]),room=await render(16000,[{delay:.22,gain:.12}]);
      const w=sandlab.world,M=(await import('./src/sim/materials.js')).M;w.clear();w.stickmen.spawn(30,30,M.Player);
      const s=w.sound;w.fields.rebuildBarriers(w);s.rebuildAbsorption(w);s.listener.prepare(w,30,30);const open=s.listener.sample(90,30);
      for(let y=0;y<w.height;y++)w.set(y*w.width+60,M.Wall);
      w.fields.rebuildBarriers(w);s.rebuildAbsorption(w);s.listener.prepare(w,30,30);const wall=s.listener.sample(90,30);
      const balanced=await render(16000,[],'balanced'),speakers=await render(16000,[],'speakers');
      const portrait=soundPosition({x:195,y:100},{canvas:{width:390,height:844},project:(x,y)=>({x,y})});
      const landscape=soundPosition({x:100,y:195},{canvas:{width:844,height:390},project:(x,y)=>({x,y})});
      return {dry,muffled,room,open,wall,balanced,speakers,portrait,landscape};
    }''')
    assert result['muffled']['high']<result['dry']['high']*.2,result
    assert result['muffled']['rms']<result['dry']['rms'],result
    assert result['room']['tail']>result['dry']['tail']+.0001,result
    assert all(result[k]['active']==0 for k in ['dry','muffled','room']),result
    assert result['wall']['cutoff']<result['open']['cutoff']*.1,result
    assert result['speakers']['rms']>result['balanced']['rms']*1.2,result
    assert result['speakers']['peak']<1 and result['balanced']['peak']<1,result
    assert abs(result['portrait']['gain']-result['landscape']['gain'])<1e-6,result
    print(result)
    browser.close()
