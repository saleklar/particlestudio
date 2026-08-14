// CDP test: saturation slider up/down on a coloured object
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9230;

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('no CDP target');
}

(async () => {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
    '--user-data-dir=' + process.env.TEMP + '/sattest',
    'about:blank'
  ], {stdio: 'ignore'});
  try {
    const wsUrl = await getWs();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = {};
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
      else if (m.method === 'Runtime.exceptionThrown') {
        console.log('[pageerror]', JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      }
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({id: i, method, params})); });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true});
      if (r.result.exceptionDetails) return {ERROR: r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)};
      return r.result.result.value;
    };

    await send('Runtime.enable', {});
    await send('Page.enable', {});
    await send('Page.navigate', {url: 'http://localhost:8000/simple.html'});
    await new Promise(r => setTimeout(r, 3500));

    console.log('open:', await evalJs(`(function(){try{mesh3dOpen();return 'ok';}catch(e){return 'THROW: '+e.message;}})()`));
    await new Promise(r => setTimeout(r, 800));

    const helpers = `function colf(cnv){var c=document.createElement('canvas');c.width=cnv.width;c.height=cnv.height;
      var g=c.getContext('2d');g.drawImage(cnv,0,0);
      var d=g.getImageData(0,0,c.width,c.height).data,s=0,n=0,r=0,gg=0,b=0;
      for(var i=0;i<d.length;i+=8){if(d[i+3]<16)continue;
        var mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);
        s+=mx-mn;r+=d[i];gg+=d[i+1];b+=d[i+2];n++;}
      return n?{spread:+(s/n).toFixed(2),r:(r/n)|0,g:(gg/n)|0,b:(b/n)|0}:null;}
      function setSlider(lbl,v){var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent===lbl;});
        var inp=rows[0].children[1];inp.value=v;inp.oninput&&inp.oninput();}
      function setColour(){var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent==='Colour';});
        rows[0].children[1].value='#cc4422';}`;

    console.log('red sat=1:', JSON.stringify(await evalJs(`(function(){${helpers}
      setColour();return colf(_m3._frame(0.1));})()`)));

    console.log('red sat=3:', JSON.stringify(await evalJs(`(function(){${helpers}
      setSlider('Saturation',3);return colf(_m3._frame(0.1));})()`)));

    console.log('red sat=0:', JSON.stringify(await evalJs(`(function(){${helpers}
      setSlider('Saturation',0);return colf(_m3._frame(0.1));})()`)));

    console.log('red sat=0.5 + glow:', JSON.stringify(await evalJs(`(function(){${helpers}
      setSlider('Saturation',0.5);setSlider('Glow',1.5);return colf(_m3._frame(0.1));})()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
