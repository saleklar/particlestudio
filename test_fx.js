// CDP test: FX photo filters + glow colour in the 3D Mesh Generator
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9227;

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
    '--user-data-dir=' + process.env.TEMP + '/fxtest',
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

    // helper to grab avg RGB of the composited frame
    const stats = `function stats(cnv){var c=document.createElement('canvas');c.width=cnv.width;c.height=cnv.height;
      var g=c.getContext('2d');g.drawImage(cnv,0,0);
      var d=g.getImageData(0,0,c.width,c.height).data,r=0,gg=0,b=0,n=0;
      for(var i=0;i<d.length;i+=4)if(d[i+3]>16){r+=d[i];gg+=d[i+1];b+=d[i+2];n++;}
      return n?{r:(r/n)|0,g:(gg/n)|0,b:(b/n)|0,px:n}:null;}`;

    console.log('neutral:', JSON.stringify(await evalJs(`(function(){${stats}
      return stats(_m3._frame(0.1));})()`)));

    console.log('desat:', JSON.stringify(await evalJs(`(function(){${stats}
      var sl=[].slice.call(document.querySelectorAll('input[type=range]'));
      // find via labels: set Saturation to 0
      var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent==='Saturation';});
      var inp=rows[0].children[1];inp.value=0;inp.oninput&&inp.oninput();
      var s=stats(_m3._frame(0.1));
      inp.value=1;inp.oninput&&inp.oninput();
      return s;})()`)));

    console.log('hue180:', JSON.stringify(await evalJs(`(function(){${stats}
      var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent==='Hue °';});
      var inp=rows[0].children[1];inp.value=180;inp.oninput&&inp.oninput();
      var s=stats(_m3._frame(0.1));
      inp.value=0;inp.oninput&&inp.oninput();
      return s;})()`)));

    console.log('glow picked red:', JSON.stringify(await evalJs(`(function(){${stats}
      var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent==='Glow';});
      var inp=rows[0].children[1];inp.value=2;inp.oninput&&inp.oninput();
      var gcRows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent==='Glow colour';});
      var sel=gcRows[0].children[1],col=gcRows[0].children[2];
      sel.value='pick';col.value='#ff0000';
      var s=stats(_m3._frame(0.1));
      sel.value='';inp.value=0;inp.oninput&&inp.oninput();
      return s;})()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
