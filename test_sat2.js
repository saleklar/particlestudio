// CDP test: dragging main-editor FX Saturation auto-enables the FX panel
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9231;

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
    '--user-data-dir=' + process.env.TEMP + '/sattest2',
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
    await new Promise(r => setTimeout(r, 3000));

    console.log('drag sat:', JSON.stringify(await evalJs(`(function(){
      var on=document.getElementById('fxOn'),sat=document.getElementById('fxSat');
      var before=on.checked;
      sat.value=200;
      sat.dispatchEvent(new Event('input',{bubbles:true}));   // what a real drag fires
      return {fxOnBefore:before,fxOnAfter:on.checked,fxActive:fxActive()};
    })()`)));

    console.log('preset reset keeps off:', JSON.stringify(await evalJs(`(function(){
      fxApplyPreset('reset');
      return {fxOnAfterReset:document.getElementById('fxOn').checked,fxActive:fxActive()};
    })()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
