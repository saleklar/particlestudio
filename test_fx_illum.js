// CDP test: illumination glow kind — glow should concentrate on the LIT side
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9228;

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
    '--user-data-dir=' + process.env.TEMP + '/fxtest2',
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

    // brightness centroid x + total glow energy of the composited frame
    const stats = `function stats(cnv){var c=document.createElement('canvas');c.width=cnv.width;c.height=cnv.height;
      var g=c.getContext('2d');g.drawImage(cnv,0,0);
      var d=g.getImageData(0,0,c.width,c.height).data,sum=0,sx=0;
      for(var y=0;y<c.height;y+=2)for(var x=0;x<c.width;x+=2){var i=(y*c.width+x)*4;
        var l=(d[i]+d[i+1]+d[i+2])/3*(d[i+3]/255);sum+=l;sx+=l*x;}
      return {energy:(sum/1000)|0, cx:+(sx/sum/c.width).toFixed(3)};}
      function setSlider(lbl,v){var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent===lbl;});
        var inp=rows[0].children[1];inp.value=v;inp.oninput&&inp.oninput();}
      function setKind(v){var rows=[].slice.call(document.querySelectorAll('div')).filter(function(d){return d.firstChild&&d.firstChild.textContent==='Glow kind';});
        rows[0].children[1].value=v;}`;

    // light comes from yaw -40 → lit side is LEFT of centre. Illum glow centroid should sit further toward the lit side than emission glow.
    console.log('emission:', JSON.stringify(await evalJs(`(function(){${stats}
      setSlider('Glow',2);setSlider('Glow size',30);setKind('');setSlider('Threshold',0);
      return stats(_m3._frame(0.1));})()`)));

    console.log('illum T0:', JSON.stringify(await evalJs(`(function(){${stats}
      setKind('illum');setSlider('Threshold',0);
      return stats(_m3._frame(0.1));})()`)));

    console.log('illum T0.5:', JSON.stringify(await evalJs(`(function(){${stats}
      setKind('illum');setSlider('Threshold',0.5);
      return stats(_m3._frame(0.1));})()`)));

    console.log('illum T0.9:', JSON.stringify(await evalJs(`(function(){${stats}
      setKind('illum');setSlider('Threshold',0.9);
      return stats(_m3._frame(0.1));})()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
