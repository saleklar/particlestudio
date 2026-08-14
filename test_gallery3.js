// CDP test: burst/loop scene — does a gallery click retexture live particles now?
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9226;

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
    '--user-data-dir=' + process.env.TEMP + '/galtest3',
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

    // burst + loop, spawn a burst of 'glow', then click 'spark' thumb + deselect 'glow'
    console.log('burst retex:', JSON.stringify(await evalJs(`(function(){
      document.getElementById('loopOn').checked=true;
      document.getElementById('mode').value='burst';onModeChange();restartLoop();
      var before=particles.map(function(p){return p.texName;});
      var th=[].slice.call(document.querySelectorAll('#tex-gallery .tex-thumb'));
      th.filter(function(d){return /^spark$/.test(d.title);})[0].click();
      var th2=[].slice.call(document.querySelectorAll('#tex-gallery .tex-thumb'));
      th2.filter(function(d){return /^glow$/.test(d.title);})[0].click();
      var after=particles.map(function(p){return p.texName;});
      return {aliveBefore:before.slice(0,5),aliveAfter:after.slice(0,5),
              allSpark:after.length>0&&after.every(function(n){return n==='spark';})};
    })()`)));

    // sequence pick over live static particles
    console.log('seq retex:', JSON.stringify(await evalJs(`(function(){
      var th=[].slice.call(document.querySelectorAll('#tex-gallery .tex-thumb'));
      th.filter(function(d){return /gemspin/.test(d.title);})[0].click();
      var th2=[].slice.call(document.querySelectorAll('#tex-gallery .tex-thumb'));
      th2.filter(function(d){return /^spark$/.test(d.title);})[0].click();
      var after=particles.map(function(p){return p.texName+(p.seq?'(seq)':'');});
      return {aliveAfter:after.slice(0,5),allSeq:particles.every(function(p){return !!p.seq;})};
    })()`)));

    // node override hint present?
    console.log('node hint:', JSON.stringify(await evalJs(`(function(){
      var em=emitters[emIdx];
      linkNodes.push({kind:'image',texSel:{flare:true},x:0,y:0,links:[em]});
      nodesApply();rebuildGallery();
      var hint=document.querySelector('#tex-gallery div');
      return {hint:hint?hint.textContent.slice(0,40):null};
    })()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
