// CDP-based headless test: does clicking a gallery thumbnail change what spawns?
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9224;

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
    '--user-data-dir=' + process.env.TEMP + '/galtest',
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

    console.log('page ready:', await evalJs('typeof rebuildGallery'));

    console.log('initial:', JSON.stringify(await evalJs(`(function(){
      var pool=emFor(emitters[emIdx],'image').pool;
      return {sel:textures.filter(function(t){return t.sel;}).map(function(t){return t.name;}),
              pool:pool.map(function(u){return u.name;}),
              thumbs:document.querySelectorAll('#tex-gallery .tex-thumb').length};
    })()`)));

    // click the 3rd thumbnail (a static builtin) then click the 1st (gemspin) to deselect it
    console.log('click new thumb:', JSON.stringify(await evalJs(`(function(){
      var th=document.querySelectorAll('#tex-gallery .tex-thumb');
      th[2].click();
      var th2=document.querySelectorAll('#tex-gallery .tex-thumb');
      th2[0].click();  // deselect gemspin
      var pool=emFor(emitters[emIdx],'image').pool;
      return {sel:textures.filter(function(t){return t.sel;}).map(function(t){return t.name;}),
              pool:pool.map(function(u){return u.name;}),
              texSel:JSON.stringify(emFor(emitters[emIdx],'image').texSel)};
    })()`)));

    // now spawn a few particles and see which textures they use
    console.log('spawned:', JSON.stringify(await evalJs(`(function(){
      particles.length=0;
      for(var i=0;i<10;i++)spawn(emitters[emIdx]);
      return particles.map(function(p){return p.texName;});
    })()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
