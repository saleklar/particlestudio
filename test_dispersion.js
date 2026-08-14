// CDP test: dispersion strength — colour fringe spread on the diamond
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9229;

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
    '--user-data-dir=' + process.env.TEMP + '/dsptest',
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

    // colourfulness metric: mean per-pixel channel spread (max-min of RGB), weighted by alpha
    const stats = `function colf(cnv){var c=document.createElement('canvas');c.width=cnv.width;c.height=cnv.height;
      var g=c.getContext('2d');g.drawImage(cnv,0,0);
      var d=g.getImageData(0,0,c.width,c.height).data,s=0,n=0;
      for(var i=0;i<d.length;i+=8){if(d[i+3]<16)continue;
        var mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);
        s+=mx-mn;n++;}
      return n?+(s/n).toFixed(2):0;}
      function pickDiamond(){var sels=[].slice.call(document.querySelectorAll('select'));
        var sh=sels.filter(function(s){return /diamond/.test(s.innerHTML)&&/Ball/.test(s.innerHTML);})[0];
        sh.value='diamond';sh.onchange();
        var ev=new Event('change');sh.dispatchEvent(ev);}
      function setSlider(lbl,v){var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent===lbl;});
        var inp=rows[0].children[1];inp.value=v;inp.oninput&&inp.oninput();}`;

    console.log('diamond disp=0:', JSON.stringify(await evalJs(`(function(){${stats}
      pickDiamond();setSlider('Dispersion',0);
      return colf(_m3._frame(0.13));})()`)));

    console.log('diamond disp=1:', JSON.stringify(await evalJs(`(function(){${stats}
      setSlider('Dispersion',1);
      return colf(_m3._frame(0.13));})()`)));

    console.log('diamond disp=1.6 (preset):', JSON.stringify(await evalJs(`(function(){${stats}
      setSlider('Dispersion',1.6);
      return colf(_m3._frame(0.13));})()`)));

    console.log('diamond disp=2:', JSON.stringify(await evalJs(`(function(){${stats}
      setSlider('Dispersion',2);
      return colf(_m3._frame(0.13));})()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
