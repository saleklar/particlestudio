// CDP test: gallery selection with sequences, loop/burst, and node overrides
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9225;

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
    '--user-data-dir=' + process.env.TEMP + '/galtest2',
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

    // A: select the gemspin sequence thumb, deselect the default
    console.log('A seq-select:', JSON.stringify(await evalJs(`(function(){
      function names(){var pool=emFor(emitters[emIdx],'image').pool;return pool.map(function(u){return u.name+(u.seq?'(seq)':'');});}
      var th=document.querySelectorAll('#tex-gallery .tex-thumb');
      // find gemspin thumb by title
      var gs=[].slice.call(th).filter(function(d){return /gemspin/.test(d.title);})[0];
      if(!gs)return 'no gemspin thumb';
      gs.click();
      // deselect whatever else is selected (glow)
      var th2=[].slice.call(document.querySelectorAll('#tex-gallery .tex-thumb'));
      th2.filter(function(d){return /^glow$/.test(d.title);}).forEach(function(d){d.click();});
      particles.length=0;
      for(var i=0;i<6;i++)spawn(emitters[emIdx]);
      return {pool:names(),spawned:particles.map(function(p){return p.texName;})};
    })()`)));

    // B: loop mode ON + burst mode — does the change show without restart?
    console.log('B loop+burst:', JSON.stringify(await evalJs(`(function(){
      document.getElementById('loopOn').checked=true;
      document.getElementById('mode').value='burst';onModeChange();restartLoop();
      // pick spark only
      textures.forEach(function(t){t.sel=(t.name==='spark');});
      ensureOneSelected();rebuildGallery();
      // simulate what the gallery click does — no restartLoop call
      var alive=particles.map(function(p){return p.texName;});
      return {aliveAfterPick:alive.slice(0,8),poolNow:emFor(emitters[emIdx],'image').pool.map(function(u){return u.name;})};
    })()`)));

    // C: node override — image node wired to the emitter
    console.log('C node override:', JSON.stringify(await evalJs(`(function(){
      var em=emitters[emIdx];
      linkNodes.push({kind:'image',texSel:{flare:true},x:0,y:0,links:[em]});
      nodesApply();
      // user now clicks the gallery to pick 'star'
      textures.forEach(function(t){t.sel=(t.name==='star');});
      ensureOneSelected();rebuildGallery();
      particles.length=0;
      for(var i=0;i<6;i++)spawn(em);
      return {spawned:particles.map(function(p){return p.texName;}),
              galleryPick:'star',nodeDrives:JSON.stringify(_nodeTexOv.get(em))};
    })()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
