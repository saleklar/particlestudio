// CDP-based headless test for the 3D Mesh Generator in simple.html
const {spawn} = require('child_process');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9223;

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
    '--user-data-dir=' + process.env.TEMP + '/m3dtest',
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
      else if (m.method === 'Runtime.consoleAPICalled') {
        const args = (m.params.args||[]).map(a => a.value !== undefined ? a.value : a.description).join(' ');
        console.log('[console]', args);
      } else if (m.method === 'Runtime.exceptionThrown') {
        console.log('[pageerror]', JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      }
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({id: i, method, params})); });
    const evalJs = async (expr, awaitP) => {
      const r = await send('Runtime.evaluate', {expression: expr, awaitPromise: !!awaitP, returnByValue: true});
      if (r.result.exceptionDetails) return {ERROR: r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)};
      return r.result.result.value;
    };

    await send('Runtime.enable', {});
    await send('Page.enable', {});
    await send('Page.navigate', {url: 'http://localhost:8791/simple.html'});
    await new Promise(r => setTimeout(r, 3500));

    console.log('page ready:', await evalJs('typeof mesh3dOpen'));

    // 1. open the dialog
    console.log('open:', JSON.stringify(await evalJs(`(function(){
      try { mesh3dOpen(); return 'opened'; } catch(e) { return 'THROW: '+e.message+'\\n'+e.stack; }
    })()`)));
    await new Promise(r => setTimeout(r, 800));

    // 2. inspect dialog + preview canvas pixels
    console.log('preview:', JSON.stringify(await evalJs(`(function(){
      var ovs=document.querySelectorAll('div[style*="z-index"]');
      var dlgOpen=!!_m3;
      var cvs=document.querySelectorAll('canvas');
      var glcv=null;
      cvs.forEach(function(c){ if(c.width===240&&c.height===240&&(c.getContext('webgl2')||c.getContext('webgl'))) glcv=c; });
      if(!glcv) return {dlgOpen:dlgOpen, glcv:false};
      var g=glcv.getContext('webgl2')||glcv.getContext('webgl');
      var px=new Uint8Array(240*240*4);
      g.readPixels(0,0,240,240,g.RGBA,g.UNSIGNED_BYTE,px);
      var nonzero=0, sum=0;
      for(var i=3;i<px.length;i+=4){ if(px[i]>0){nonzero++; sum+=px[i];} }
      return {dlgOpen:dlgOpen, glcv:true, nonzeroAlphaPx:nonzero, avgA:nonzero?(sum/nonzero).toFixed(1):0,
              shaderLog: (function(){ return window.__m3err||null; })()};
    })()`)));

    // 3. coin shape + env map chooser + OBJ import + dims
    console.log('coin+env:', JSON.stringify(await evalJs(`(function(){
      try{
        var g=m3Geo('coin');
        var sels=[].slice.call(document.querySelectorAll('select'));
        var envSel=sels.filter(function(s){return /#studio/.test(s.innerHTML);})[0];
        var shapeSel=sels.filter(function(s){return /coin/.test(s.innerHTML);})[0];
        if(shapeSel){shapeSel.value='coin';shapeSel.onchange();}
        var r={coinVerts:g.pos.length/3, coinTris:g.n/3, envSel:!!envSel, coinOption:!!shapeSel};
        if(envSel){envSel.value='';envSel.onchange();envSel.value='#studio';envSel.onchange();r.envSwitch=true;}
        return r;
      }catch(e){return 'THROW: '+e.message;}
    })()`)));
    await new Promise(r => setTimeout(r, 400));

    console.log('obj+dims:', JSON.stringify(await evalJs(`(function(){
      try{
        var obj='v 0 0 0\\nv 1 0 0\\nv 1 1 0\\nv 0 1 0\\nv 0 0 1\\nv 1 0 1\\nv 1 1 1\\nv 0 1 1\\nf 1 2 3 4\\nf 5 8 7 6\\nf 1 5 6 2\\nf 2 6 7 3\\nf 3 7 8 4\\nf 5 1 4 8\\n';
        var geo=m3ParseOBJ(obj);
        return {verts:geo.pos.length/3, tris:geo.n/3, hasNormals:geo.nrm.some(function(v){return v!==0;}),
                dims:['dimX','dimY','dimZ'].every(function(k){
                  return !![].slice.call(document.querySelectorAll('input[type=range]')).length;})};
      }catch(e){return 'THROW: '+e.message;}
    })()`)));

    console.log('render:', JSON.stringify(await evalJs(`(function(){
      var btns=[].slice.call(document.querySelectorAll('button')).filter(function(b){return /Render sequence/.test(b.textContent);});
      if(!btns.length) return 'no render button';
      var before=textures.length;
      try { btns[0].click(); } catch(e) { return 'THROW: '+e.message; }
      return {texturesBefore: before};
    })()`)));
    await new Promise(r => setTimeout(r, 2500));

    console.log('after:', JSON.stringify(await evalJs(`(function(){
      var seqTex=textures.filter(function(t){return /^mesh3d_\\d+$/.test(t.name);});
      var groups=seqGroups();
      var pool=emFor(emitters[emIdx],'image').pool;
      // check first frame has visible pixels
      var vis=null;
      if(seqTex.length){
        var c=document.createElement('canvas');c.width=seqTex[0].img.width;c.height=seqTex[0].img.height;
        var g=c.getContext('2d');g.drawImage(seqTex[0].img,0,0);
        var d=g.getImageData(0,0,c.width,c.height).data,nz=0;
        for(var i=3;i<d.length;i+=4)if(d[i]>8)nz++;
        vis=nz;
      }
      return {frames:seqTex.length, seqEnabled:seqEnabled['mesh3d']||false,
              grouped:(groups['mesh3d']||[]).length, poolUnits:pool.length,
              poolHasSeq:pool.some(function(u){return !!u.seq;}), firstFrameVisiblePx:vis};
    })()`)));

    ws.close();
  } finally {
    chrome.kill();
  }
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
