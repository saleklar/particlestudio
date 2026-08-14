/* Minimal Parallax Animator - preview + PSD import + export to Spine-like JSON */

const psdFile = document.getElementById('psdFile');
const imgFiles = document.getElementById('imgFiles');
const scanBtn = document.getElementById('scanBtn');
const importBtn = document.getElementById('importBtn');
const layerList = document.getElementById('layerList');
const previewBtn = document.getElementById('previewBtn');
const exportBtn = document.getElementById('exportBtn');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const psdNotice = document.getElementById('psdNotice');

const depthScaleEl = document.getElementById('depthScale');
const depthScaleVal = document.getElementById('depthScaleVal');
const motionType = document.getElementById('motionType');
const amplitude = document.getElementById('amplitude');
const ampVal = document.getElementById('ampVal');
const speed = document.getElementById('speed');
const speedVal = document.getElementById('speedVal');
const fade = document.getElementById('fade');
const fadeVal = document.getElementById('fadeVal');

let parsedLayers = []; // {id,name,depth,image,canvas}
let importedLayers = []; // subset for preview
let playing = false;
let t0 = 0;
let rafId = null;
let selectedLayerIndex = -1;
let cameraZ = 0;
let lastNow = 0;

function resizeCanvas(){
  canvas.width = window.innerWidth - 320;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

depthScaleEl.oninput = ()=> depthScaleVal.textContent = parseFloat(depthScaleEl.value).toFixed(2);
amplitude.oninput = ()=> ampVal.textContent = amplitude.value;
speed.oninput = ()=> speedVal.textContent = parseFloat(speed.value).toFixed(2);
fade.oninput = ()=> fadeVal.textContent = parseFloat(fade.value).toFixed(2);

scanBtn.onclick = async ()=>{
  parsedLayers = [];
  layerList.innerHTML = '';
  const hasPsdFile = psdFile.files && psdFile.files[0];
  const hasImgs = imgFiles.files && imgFiles.files.length;
  // If a PSD was selected but PSD.js is not available, warn and fall back to images if any
  if (hasPsdFile){
    if (typeof PSD === 'undefined'){
      // Try to be helpful: allow image fallback otherwise show clear error
      if (hasImgs){
        alert('PSD.js not available in this environment — falling back to image imports.\nTo enable PSD import, run a local server and ensure PSD.js is reachable.');
      } else {
        alert('PSD.js is not loaded, so PSD import cannot run. Serve the folder or include psd.min.js and try again.');
        return;
      }
    }
  }
  if (hasPsdFile && typeof PSD !== 'undefined'){
    const f = psdFile.files[0];
    try{
      const array = await f.arrayBuffer();
      const psd = PSD.fromArrayBuffer(array);
      psd.parse();
      const tree = psd.tree();
      const nodes = tree.descendants();
      // collect visible leaf nodes with images
      let id = 0;
      for (const n of nodes){
        if (!n.isGroup() && n.visible && n.layer && n.layer.visible){
          try{
            const imgEl = n.toPng();
            // convert canvas to image
            const cv = document.createElement('canvas'); cv.width = imgEl.width; cv.height = imgEl.height;
            const cctx = cv.getContext('2d'); cctx.drawImage(imgEl,0,0);
            parsedLayers.push({id:id++,name:n.name,depth: n.depth || 0,canvas:cv});
          }catch(e){/* skip layer */}
        }
      }
    }catch(e){alert('PSD parse failed: '+(e && e.message?e.message:e));}
  }
  // If no PSD result, try image files fallback
  if (parsedLayers.length === 0 && hasImgs){
    let id=0;
    for (const f of imgFiles.files){
      try{
        if (psdNotice) psdNotice.textContent = 'Loading image: ' + f.name;
        const img = await fileToImage(f);
        const cv = document.createElement('canvas'); cv.width=img.width; cv.height=img.height; cv.getContext('2d').drawImage(img,0,0);
        parsedLayers.push({id:id++,name:f.name,depth:0,canvas:cv});
      }catch(e){
        console.error('Failed to load image', f.name, e);
        if (psdNotice) psdNotice.textContent = 'Failed to load: '+f.name;
      }
    }
  }
  if (parsedLayers.length === 0){ alert('No layers found. Choose a PSD (with visible layers) or image files.'); return; }
  renderLayerList();
}

function ensureLayerProps(l){
  if (!('tx' in l)) l.tx = 0;
  if (!('ty' in l)) l.ty = 0;
  if (!('tz' in l)) l.tz = 0;
  if (!('rot' in l)) l.rot = 0;
  if (!('pscale' in l)) l.pscale = 1;
}

// Utility: load image FileList (or Array) into parsedLayers immediately
async function loadImages(files){
  if (!files || files.length===0) return;
  parsedLayers = [];
  layerList.innerHTML = '';
  let id=0;
  for (const f of files){
    try{
      if (psdNotice) psdNotice.textContent = 'Loading image: ' + f.name;
      const img = await fileToImage(f);
      const cv = document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
      cv.getContext('2d').drawImage(img,0,0);
      parsedLayers.push({id:id++,name:f.name,depth:0,canvas:cv});
    }catch(e){
      console.error('Failed to load image', f.name, e);
      if (psdNotice) psdNotice.textContent = 'Failed to load: '+f.name;
    }
  }
  if (parsedLayers.length>0){
    renderLayerList();
    if (psdNotice) psdNotice.textContent = parsedLayers.length + ' layer(s) loaded from images.';
  }
}

// Auto-load when selecting images
if (imgFiles) imgFiles.addEventListener('change', (e)=> loadImages(e.target.files));

// Drag-and-drop support onto the stage
const stage = document.getElementById('stage');
if (stage){
  stage.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
  stage.addEventListener('drop', (e)=>{
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length) loadImages(files);
  });
}

// Show PSD availability notice in the UI (if the element exists)
window.addEventListener('load', ()=>{
  const noticeEl = document.getElementById('psdNotice');
  if (!noticeEl) return;
  if (typeof PSD === 'undefined'){
    noticeEl.textContent = 'PSD.js not found locally — PSD import is disabled. Use image files or place psd.min.js next to this HTML file.';
    noticeEl.style.color = '#f88';
  } else {
    noticeEl.textContent = 'PSD import enabled.';
    noticeEl.style.color = '#8f8';
  }
});

function renderLayerList(){
  layerList.innerHTML='';
  parsedLayers.forEach(l=>{
    const el = document.createElement('div'); el.className='layer-item';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = true; cb.dataset.id = l.id;
    const name = document.createElement('div'); name.className='name'; name.textContent = l.name;
    const depth = document.createElement('input'); depth.type='number'; depth.value = l.depth||0; depth.style.width='60px'; depth.dataset.id = l.id;
    el.appendChild(cb); el.appendChild(name); el.appendChild(depth);
    layerList.appendChild(el);
  });
  // populate perspective layer selector
  const layerSel = document.getElementById('layerSel');
  if (layerSel){
    layerSel.innerHTML = '';
    parsedLayers.forEach((l,idx)=>{ ensureLayerProps(l); if (!('baseDepth' in l)) l.baseDepth = l.depth || 0; const opt = document.createElement('option'); opt.value = idx; opt.textContent = l.name; layerSel.appendChild(opt); });
    if (parsedLayers.length>0){ layerSel.selectedIndex = 0; selectedLayerIndex = 0; updatePerspControls(); }
    layerSel.onchange = ()=>{ selectedLayerIndex = parseInt(layerSel.value); updatePerspControls(); };
  }
}

importBtn.onclick = ()=>{
  importedLayers = [];
  const items = layerList.querySelectorAll('.layer-item');
  for (const it of items){
    const cb = it.querySelector('input[type=checkbox]');
    const id = parseInt(cb.dataset.id);
    if (cb.checked){
      const l = parsedLayers.find(x=>x.id===id);
      const depthInput = it.querySelector('input[type=number]');
      const depth = parseFloat(depthInput.value)||0;
      const copy = Object.assign({},l,{depth});
      ensureLayerProps(copy);
      if (!('baseDepth' in copy)) copy.baseDepth = depth;
      importedLayers.push(copy);
    }
  }
  // sort by depth (far to near: larger depth means farther)
  importedLayers.sort((a,b)=> (a.depth - b.depth));
  centerPreview();
  // populate perspective selector from imported layers
  const layerSel = document.getElementById('layerSel');
  if (layerSel){
    layerSel.innerHTML='';
    importedLayers.forEach((l,idx)=>{ const opt=document.createElement('option'); opt.value=idx; opt.textContent=l.name; layerSel.appendChild(opt); });
    if (importedLayers.length>0){ selectedLayerIndex=0; layerSel.selectedIndex=0; updatePerspControls(); }
    layerSel.onchange = ()=>{ selectedLayerIndex = parseInt(layerSel.value); updatePerspControls(); };
  }
}

function centerPreview(){
  // compute canvas fit based on largest layer
  if (importedLayers.length===0) return;
  const maxW = Math.max(...importedLayers.map(l=>l.canvas.width));
  const maxH = Math.max(...importedLayers.map(l=>l.canvas.height));
  // set virtual stage to fit
}

function updatePerspControls(){
  const idx = selectedLayerIndex;
  if (idx<0) return;
  const l = importedLayers[idx] || parsedLayers[idx];
  if (!l) return;
  ensureLayerProps(l);
  // set control values
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = v; const val=document.getElementById(id+'Val'); if(val) val.textContent = (typeof v==='number'? (Math.round(v*100)/100):v); };
  set('tx', l.tx||0); set('ty', l.ty||0); set('tz', l.tz||0); set('rot', l.rot||0); set('pscale', l.pscale||1);
}

// wire controls
['tx','ty','tz','rot','pscale'].forEach(id=>{
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', ()=>{
    const idx = selectedLayerIndex; if (idx<0) return;
    const l = importedLayers[idx] || parsedLayers[idx]; if(!l) return; ensureLayerProps(l);
    const v = (id==='pscale' || id==='tz')? parseFloat(el.value): parseFloat(el.value);
    l[id === 'pscale' ? 'pscale' : id] = v;
    const val = document.getElementById(id+'Val'); if(val) val.textContent = (Math.round(v*100)/100);
  });
});

const resetBtn = document.getElementById('resetLayer');
if (resetBtn) resetBtn.addEventListener('click', ()=>{
  const idx = selectedLayerIndex; if (idx<0) return; const l = importedLayers[idx] || parsedLayers[idx]; if(!l) return; l.tx=0; l.ty=0; l.tz=0; l.rot=0; l.pscale=1; updatePerspControls();
});
const applyAllBtn = document.getElementById('applyAll');
if (applyAllBtn) applyAllBtn.addEventListener('click', ()=>{
  if (selectedLayerIndex<0) return; const src = importedLayers[selectedLayerIndex] || parsedLayers[selectedLayerIndex]; if(!src) return;
  for (let i=0;i<importedLayers.length;i++){ importedLayers[i].tx = src.tx; importedLayers[i].ty = src.ty; importedLayers[i].tz = src.tz; importedLayers[i].rot = src.rot; importedLayers[i].pscale = src.pscale; }
});

previewBtn.onclick = ()=>{
  playing = !playing;
  previewBtn.textContent = playing? 'Stop Preview':'Toggle Preview';
  if (playing){ t0 = performance.now(); lastNow = performance.now(); cameraZ = 0; loop(); } else { cancelAnimationFrame(rafId); lastNow = 0; }
}

function loop(){
  const now = performance.now();
  const elapsed = (now - t0)/1000;
  const dt = (lastNow === 0) ? (1/60) : (now - lastNow)/1000;
  lastNow = now;
  drawFrame(elapsed, dt);
  rafId = requestAnimationFrame(loop);
}

function drawFrame(t, dt){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (importedLayers.length===0) return;
  const centerX = canvas.width/2;
  const centerY = canvas.height/2;
  const ds = parseFloat(depthScaleEl.value);
  const mot = motionType.value;
  const amp = parseFloat(amplitude.value);
  const sp = parseFloat(speed.value);
  const fadeS = parseFloat(fade.value);
  // compute loop period so motion is seamless: use 1/sp as period base (avoid zero)
  const period = sp>0? (2*Math.PI)/sp : 6.28318;

  // compute apparent depths (baseDepth - cameraZ) for normalization (closest => 1, farthest => 0)
  const appDepths = importedLayers.map(l => (('baseDepth' in l) ? (l.baseDepth - cameraZ) : l.depth));
  let minApp = Infinity, maxApp = -Infinity;
  for (const d of appDepths){ if (d < minApp) minApp = d; if (d > maxApp) maxApp = d; }
  const appRange = Math.max(0.0001, maxApp - minApp);

  // update looping Z motion (per-layer curDepth) if requested
  if (mot === 'loop_z_in' || mot === 'loop_z_out'){
    // camera moves along Z; layers have fixed baseDepth; apparentDepth = baseDepth - cameraZ
    // initialize baseDepth if missing
    importedLayers.forEach(l=>{ if (!('baseDepth' in l)) l.baseDepth = l.depth || 0; });
    // compute min/max baseDepth
    let minBase = Infinity, maxBase = -Infinity;
    importedLayers.forEach(l=>{ minBase = Math.min(minBase, l.baseDepth); maxBase = Math.max(maxBase, l.baseDepth); });
    const wrapGap = Math.max(1, (maxBase - minBase) * 0.2);
    // advance cameraZ
    const dir = (mot === 'loop_z_in')? 1 : -1; // camera moves forward increases cameraZ (approach)
    const camDelta = (sp * (dt || 1/60)) * (1 + parseFloat(depthScaleEl.value) * 2) * dir * 0.5;
    cameraZ += camDelta;
    // lifecycle: when a layer reaches near plane, animate fade/scale out, then move to far side and fade/scale in
    const nearThreshold = 0.2; // when apparentDepth < nearThreshold, the layer is near camera
    const farThreshold = maxBase + wrapGap - 0.2;
    const fadeSecs = Math.max(0.05, parseFloat(fade.value) || 0.6);
    for (const l of importedLayers){
      let apparent = l.baseDepth - cameraZ;
      // initialize anim state container
      if (!l._anim) l._anim = {phase:'none', t:0};
      // Start fade-out when near (for loop_z_in) or when far (for loop_z_out)
      if (mot === 'loop_z_in'){
        if (apparent < nearThreshold && l._anim.phase === 'none'){
          l._anim = {phase:'fadeOut', t:0, duration: fadeSecs};
        }
      } else if (mot === 'loop_z_out'){
        if (apparent > farThreshold && l._anim.phase === 'none'){
          l._anim = {phase:'fadeOut', t:0, duration: fadeSecs};
        }
      }
      // advance anim timer if active
      if (l._anim.phase !== 'none'){
        l._anim.t += (dt || 1/60);
        if (l._anim.phase === 'fadeOut'){
          // when fadeOut completes, teleport layer to far/near side and start fadeIn
          if (l._anim.t >= l._anim.duration){
            // move baseDepth across range
            if (mot === 'loop_z_in'){
              l.baseDepth += (maxBase - minBase) + wrapGap;
            } else {
              l.baseDepth -= (maxBase - minBase) + wrapGap;
            }
            // reset camera-relative timers and start fadeIn
            l._anim = {phase:'fadeIn', t:0, duration: fadeSecs};
          }
        } else if (l._anim.phase === 'fadeIn'){
          if (l._anim.t >= l._anim.duration){ l._anim = {phase:'none', t:0}; }
        }
      }
    }
    // sort by apparentDepth (far -> near)
    importedLayers.sort((a,b)=> ((b.baseDepth - cameraZ) - (a.baseDepth - cameraZ)));
  }

  for (let i=0;i<importedLayers.length;i++){
    const l = importedLayers[i];
    const depth = ('baseDepth' in l) ? (l.baseDepth - cameraZ) : l.depth; // apparent depth (larger = farther)
    // normalized motion factor: 1 = nearest, 0 = farthest
    const motionFactor = 1 - Math.max(0, Math.min(1, (depth - minApp) / appRange));
    // include manual Z offset (tz) when computing base scale
    let baseScale = (1 / (1 + (depth + (l.tz||0))*ds)) * (l.pscale || 1);
    // If looping in Z, amplify scale based on relative depth so near layers scale up strongly
    let scale = baseScale;
    if (mot === 'loop_z_in' || mot === 'loop_z_out'){
      const strength = 1 + Math.min(6, parseFloat(depthScaleEl.value) * 4); // tuneable multiplier
      scale = baseScale * (1 + motionFactor * (strength - 1));
    }
    // position offset from center depends on depth
    let x = centerX - l.canvas.width*scale/2 + (l.tx||0);
    let y = centerY - l.canvas.height*scale/2 + (l.ty||0);
    // motion
    let offX = 0; let offScale = 1; let alpha = 1;
    if (mot==='lr'){
      // wobble left-right: closer layers move more
      offX = Math.sin(t*sp + i*0.2) * (amp * motionFactor);
    } else if (mot==='fb'){
      // wobble forward/back (scale): closer layers pulse more
      offScale = 1 + Math.sin(t*sp + i*0.4) * (0.08 * motionFactor);
    } else if (mot==='const_lr' || mot==='const_rl'){
      // constant horizontal motion; closer layers move faster (parallax)
      const dir = (mot==='const_lr')? 1 : -1;
      offX = (t * sp * dir) * motionFactor * 0.5;
    } else if (mot==='const_z_in' || mot==='const_z_out'){
      // constant Z movement: adjust scale over time to simulate approach/retreat
      const dir = (mot==='const_z_in')? 1 : -1; // positive dir moves camera forward increasing apparent approach
      const tzDelta = (t * sp * 0.02 * dir);
      // temporarily treat tz as added offset for this frame
      const frameScale = (1 / (1 + (depth + (l.tz||0) + tzDelta)*ds));
      // override scale for this frame; compute multiplier so final scale == frameScale * pscale
      offScale = (frameScale * (l.pscale || 1)) / scale;
    }
    // per-layer animation overrides (fade in/out during wrapping)
    if (l._anim && l._anim.phase !== 'none'){
      const p = l._anim;
      if (p.phase === 'fadeOut'){
        const frac = Math.max(0, Math.min(1, p.t / p.duration));
        alpha = 1 - frac;
        // scale up while fading out to emphasize approach
        const up = 1 + frac * 1.5 * (parseFloat(depthScaleEl.value) || 1);
        scale *= up;
      } else if (p.phase === 'fadeIn'){
        const frac = Math.max(0, Math.min(1, p.t / p.duration));
        alpha = frac;
        // scale down from a slightly smaller to normal during fade in
        const down = 0.8 + 0.2 * frac;
        scale *= down;
      }
    } else {
      // loop fade: alpha ramps near start/end of period (skip for continuous Z loops)
      if (!(mot === 'loop_z_in' || mot === 'loop_z_out')){
        if (period>0 && fadeS>0){
          const localT = (t % period) / period; // 0..1
          const f = fadeS/period; // fraction
          if (localT < f) alpha = localT / f;
          else if (localT > 1-f) alpha = (1-localT)/f;
        }
      }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + offX + l.canvas.width*scale/2, y + l.canvas.height*scale/2);
    ctx.rotate((l.rot||0) * Math.PI/180);
    ctx.scale(scale * offScale, scale * offScale);
    ctx.drawImage(l.canvas, -l.canvas.width/2, -l.canvas.height/2);
    ctx.restore();
  }
}

function fileToImage(file){
  return new Promise((res,rej)=>{
    const r = new FileReader(); r.onload = ()=>{
      const img = new Image(); img.onload = ()=> res(img); img.onerror = rej; img.src = r.result;
    }; r.onerror = rej; r.readAsDataURL(file);
  });
}

// Show file selection counts for debugging/help
if (imgFiles) imgFiles.addEventListener('change', ()=>{
  if (!psdNotice) return;
  psdNotice.textContent = imgFiles.files.length + ' image file(s) selected.';
});
if (psdFile) psdFile.addEventListener('change', ()=>{
  if (!psdNotice) return;
  psdNotice.textContent = psdFile.files.length + ' PSD file selected.';
});

exportBtn.onclick = ()=>{
  if (importedLayers.length===0){ alert('No imported layers'); return; }
  // build Spine-like JSON: images as base64, bones for each layer with translation+scale, simple skin attachments
  const out = {skeleton:{hash:'parallax',spine:'4.0.0'},bones:[],slots:[],skins:{default:{}},animations:{}};
  for (let i=0;i<importedLayers.length;i++){
    const l = importedLayers[i];
    const name = sanitizeName(l.name || ('layer'+i));
    const bone = {name:name, x:0,y:0,scaleX:1,scaleY:1};
    out.bones.push(bone);
    out.slots.push({name:name+'-slot',bone:name,attachment:name});
    // attachments: export image data
    const imgData = l.canvas.toDataURL('image/png');
    out.skins.default[name] = {};
    out.skins.default[name][name] = {name:name, width:l.canvas.width, height:l.canvas.height, image:imgData};
    // set transform to simulate depth and initial scale
    const scale = 1 / (1 + l.depth*parseFloat(depthScaleEl.value));
    bone.scaleX = scale; bone.scaleY = scale;
  }
  // simple animation: if motion set, create translate or scale keys that loop
  const mot = motionType.value; const sp = parseFloat(speed.value); const amp = parseFloat(amplitude.value);
  if (mot!=='none'){
    out.animations['parallax'] = {bones:{}};
    for (let i=0;i<importedLayers.length;i++){
      const l = importedLayers[i]; const name = sanitizeName(l.name||('layer'+i));
      if (mot==='lr'){
        out.animations.parallax.bones[name] = {translate:[{time:0,x:-amp*(1-l.depth*0.15)},{time:1,x:amp*(1-l.depth*0.15)}]};
      } else {
        out.animations.parallax.bones[name] = {scale:[{time:0,x:1},{time:1,x:1.05}]};
      }
    }
  }
  const blob = new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'parallax_spine.json'; a.click(); URL.revokeObjectURL(url);
}

function sanitizeName(s){ return s.replace(/[^a-zA-Z0-9_\-]/g,'_'); }

// initial instructions: if PSD.js not yet loaded, user may need to allow CORS or run local server
console.log('Parallax Animator ready');
