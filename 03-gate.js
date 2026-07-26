/* ============================================================
   03-gate.js
   Gate Entry module

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ================= GATE ENTRY MODULE ================= */
const GE_APP='GateEntry';
const GE_FIELDS=[
  {key:'Location',label:'Location',def:{table:'Location',column:'Location'}},
  {key:'Model',label:'Model',def:{table:'MODEL',column:'MODEL'}}
];
let GE_CONFIG={}, GE_TABLES=[], GE_OPTIONS={}, GE_MISSING=[], GE_PURPOSE='', GE_SVC_TYPE='', GE_GUARD_LOCKED=false;
const GE_SIDES=[{k:'front',l:'Front'},{k:'back',l:'Back'},{k:'odo',l:'Odometer'},{k:'dicky',l:'Dicky (if any)'}];
let GE_PHOTOS={front:'',back:'',right:'',left:'',odo:'',dicky:''};
let GE_AI_RESULT=null; // last Gemini recognition result
let GE_AI_AUTORAN=false; // recognition already auto-fired for this vehicle

function geBoot(){
  if(window.GE_BOOTED){ geAfterCheck(); return; } // loaded this session — show form instantly; Sync Now clears this (Ravi 20-Jul)
  let pending=2, configRes=null, listRes=null;
  const proceed=()=>{
    GE_CONFIG = (configRes && configRes.config) || {};
    GE_FIELDS.forEach(f=>{ if(!GE_CONFIG[f.key] || !GE_CONFIG[f.key].table) GE_CONFIG[f.key]=f.def; });
    GE_TABLES = (listRes && listRes.tables) || [];
    window.GE_BOOTED=true;
    geCheckAndLoad();
  };
  jget('app_config', {app:GE_APP}, function(res){ configRes=res; if(--pending===0) proceed(); });
  jget('master_list', {}, function(res2){ listRes=res2; if(--pending===0) proceed(); });
}
function geCheckAndLoad(){
  GE_MISSING=[]; GE_OPTIONS={};
  let pending = GE_FIELDS.length;
  if(pending===0){ geAfterCheck(); return; }
  GE_FIELDS.forEach(f=>{
    const conf = GE_CONFIG[f.key];
    if(!conf || !conf.table || !conf.column){ GE_MISSING.push(f.key); pending--; if(pending===0) geAfterCheck(); return; }
    jget('master_table', {name:conf.table}, function(res){
      const rows=(res&&res.rows)||[];
      const opts=[...new Set(rows.map(r=>String(r[conf.column]||'').trim()).filter(v=>v!==''))];
      if(opts.length===0) GE_MISSING.push(f.key); else GE_OPTIONS[f.key]=opts;
      pending--; if(pending===0) geAfterCheck();
    });
  });
}
function geAfterCheck(){
  document.getElementById('ge-cfgbtn').style.display = isAdmin() ? 'inline-block' : 'none';
  const aikey=document.getElementById('ge-aikeybtn'); if(aikey) aikey.style.display = isAdmin() ? 'inline-block' : 'none';
  if(GE_MISSING.length>0){
    if(isAdmin()) geOpenSetup(false);
    else {
      document.getElementById('ge-form-view').style.display='none';
      document.getElementById('ge-setup-view').style.display='none';
      const wrap=document.getElementById('ge-setup-view').parentNode;
      let ban=document.getElementById('ge-noaccess');
      if(!ban){ ban=document.createElement('div'); ban.id='ge-noaccess'; ban.className='missing'; wrap.appendChild(ban); }
      ban.style.display='block';
      ban.textContent='This module is not fully set up yet ('+GE_MISSING.join(', ')+'). Ask your administrator to configure it.';
    }
  } else geShowForm();
}

function geOpenSetup(cancellable){
  document.getElementById('ge-form-view').style.display='none';
  document.getElementById('ge-setup-view').style.display='block';
  document.getElementById('ge-setup-cancel').style.display = cancellable?'block':'none';
  const box = document.getElementById('ge-setup-fields'); box.innerHTML='';
  GE_FIELDS.forEach(f=>{
    const conf = GE_CONFIG[f.key]||{};
    const div=document.createElement('div'); div.className='setup-field';
    div.innerHTML=`<div class="ttl">${f.label}</div><label>Master Table</label>
      <select id="gesu-table-${f.key}" onchange="geOnSetupTableChange('${f.key}')">
        <option value="">Select table…</option>${GE_TABLES.map(t=>`<option value="${t}" ${t===conf.table?'selected':''}>${t}</option>`).join('')}</select>
      <label>Column to show</label><select id="gesu-col-${f.key}"><option value="">Select table first…</option></select>`;
    box.appendChild(div);
    if(conf.table) geLoadColsForSetup(f.key, conf.table, conf.column);
  });
}
function geOnSetupTableChange(key){
  const table=val('gesu-table-'+key);
  if(!table){ document.getElementById('gesu-col-'+key).innerHTML='<option value="">Select table first…</option>'; return; }
  geLoadColsForSetup(key, table, null);
}
function geLoadColsForSetup(key, table, pre){
  jget('master_table', {name:table}, function(res){
    const cols=(res&&res.columns)||[];
    document.getElementById('gesu-col-'+key).innerHTML='<option value="">Select column…</option>'+cols.map(c=>`<option value="${c}" ${c===pre?'selected':''}>${c}</option>`).join('');
  });
}
function geSaveSetup(){
  const msg=document.getElementById('ge-setup-msg'); let ok=true; const toSave=[];
  GE_FIELDS.forEach(f=>{ const table=val('gesu-table-'+f.key), col=val('gesu-col-'+f.key);
    if(!table||!col) ok=false; else toSave.push({app:GE_APP,type:'set_app_config',field:f.key,table,column:col}); });
  if(!ok){ msg.style.color='var(--signal-d)'; msg.textContent='Please choose a table and column for every field.'; return; }
  msg.style.color='var(--steel)'; msg.textContent='Saving…';
  Promise.all(toSave.map(s=>jpost(s))).then(()=>{ msg.textContent='Saved. Reloading…'; setTimeout(geBoot,600); });
}
function geCloseSetup(){ if(GE_MISSING.length>0) return; document.getElementById('ge-setup-view').style.display='none'; geShowForm(); }

function geShowForm(){
  document.getElementById('ge-setup-view').style.display='none';
  document.getElementById('ge-form-view').style.display='block';
  const ban=document.getElementById('ge-missingban');
  if(GE_MISSING.length>0){ ban.style.display='block'; ban.textContent='Some fields have no data yet: '+GE_MISSING.join(', ')+'. Ask admin, or tap ⚙ Configure.'; }
  else ban.style.display='none';
  geFillSelect('ge-loc', GE_OPTIONS.Location||[]);
  geFillSelect('ge-model', GE_OPTIONS.Model||[]);
  // Auto-preset location for single-workshop logins
  const list=allowedWsList();
  if(list && list.length===1){
    const sel=document.getElementById('ge-loc');
    for(const o of sel.options){ if(aliasWs(normWs(o.value))===list[0]){ sel.value=o.value; break; } }
  }
  // Guard name always comes from logged-in user — no dropdown needed
  document.getElementById('ge-guard').value = USER.personName || '';
  GE_GUARD_LOCKED=true;
  geLoadMyDashboard();
}
/* Gate Entry Guard Dashboard — total guard function: ALL guards' entries today are
   visible in every guard login (2 guards → both see both). Rows carry full details
   so tapping an entry shows real data, not "—". */
let GE_MY_LIST=[];
function geLoadMyDashboard(){
  jgetReliable('today', {}, function(res, isStale){
    if(!res || res.ok===false){ if(!isStale){ const box=document.getElementById('ge-mylist'); if(box) box.innerHTML='<div class="hint" style="color:var(--signal-d)">Could not load — still retrying in the background.</div>'; } return; }
    const all=((res&&res.entries)||[]).filter(g=>wsAllowed(g.location));
    GE_MY_LIST=all.slice().reverse();
    GE_TODAY_COUNT=all.filter(g=>String(g.empno||'')===String(USER.empno||'')).length;
    const title=document.getElementById('ge-mylist-title');
    if(title) title.textContent="Today's Gate Entries — All Guards";
    geUpdateMyCount(all.length);
    geRenderMyList();
  });
}
function geUpdateMyCount(total){ const el=document.getElementById('ge-mycount'); if(el) el.textContent=(total!==undefined?total:GE_MY_LIST.length)+(GE_TODAY_COUNT?' · '+GE_TODAY_COUNT+' by me':''); }
function geAddMyEntry(e){ GE_MY_LIST.unshift(e); GE_TODAY_COUNT++; geUpdateMyCount(GE_MY_LIST.length); geRenderMyList(); }
function geRenderMyList(){
  const box=document.getElementById('ge-mylist'); if(!box) return;
  if(!GE_MY_LIST.length){ box.innerHTML='<div class="hint">No entries logged yet today — saved entries from all guards will appear here.</div>'; return; }
  box.innerHTML=GE_MY_LIST.map((g,i)=>{
    const t=g.time instanceof Date?g.time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):String(g.time||'').slice(11,16)||'';
    const mine=String(g.empno||'')===String(USER.empno||'');
    return `<div class="ctlitem" style="cursor:pointer;flex-direction:column;align-items:stretch${mine?'':';opacity:.9'}" onclick="geToggleMyEntry(${i})">
      <div style="display:flex;justify-content:space-between;align-items:center"><div><div class="big">${i+1}. ${raviEsc(g.token||'')} ${raviEsc(g.reg||'')}</div>
      <div class="small">${raviEsc(g.model||'')} · ${raviEsc(g.name||'—')} · ${t}</div></div>
      <span class="badge ${mine?'done':''}" style="font-size:10px">${mine?'Me':raviEsc(g.guard||g.empname||'')}</span></div>
      <div id="ge-mydetail-${i}" style="display:none;margin-top:8px;border-top:1px dashed var(--line);padding-top:8px;font-size:12px"></div>
    </div>`;
  }).join('');
}
function geToggleMyEntry(i){
  const box=document.getElementById('ge-mydetail-'+i); if(!box) return;
  if(box.style.display!=='none'){ box.style.display='none'; return; }
  const g=GE_MY_LIST[i]; if(!g) return;
  box.innerHTML=geEntryDetailHtml(g);
  box.style.display='block';
}
/* Shared gate-entry detail (today's list + month/date history): full info + tappable
   photo thumbnails opening the in-app viewer. */
function geEntryDetailHtml(g){
  const ph=g.photos||{}; const legacy=(g.photo&&String(g.photo).indexOf('http')===0)?g.photo:'';
  // Odometer photo hidden from the SA (Ravi 20-Jul) so the SA records the reading himself;
  // WM/CEO still see it (gate history) to compare gate vs SA readings.
  const sides=(typeof isSAUser==='function' && isSAUser())
    ? [['front','Front'],['back','Back'],['dicky','Dicky']]
    : [['front','Front'],['back','Back'],['right','Right'],['left','Left'],['odo','Odometer'],['dicky','Dicky']];
  const pics=sides.map(([k,l])=>{
    const u=(ph[k]&&String(ph[k]).indexOf('http')===0)?ph[k]:(k==='front'?legacy:'');
    return u?`<div onclick="heroPhotoView('${String(u).replace(/'/g,'')}','${l} — ${raviEsc(g.reg||'')}')" style="flex:0 0 auto;text-align:center;cursor:pointer">
      <img src="${huDrivePhotoSrc(u)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="width:104px;height:78px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">
      <div style="display:none;width:104px;height:78px;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:8px;font-size:10px;color:var(--steel)">📷 view</div>
      <div style="font-size:9px;color:var(--steel)">${l}</div></div>`:''; }).join('');
  return `<div class="ge-det">
    <div class="modal-row"><span class="k">Customer</span><span class="v">${raviEsc(g.name||'—')}</span></div>
    <div class="modal-row"><span class="k">Mobile</span><span class="v">${raviEsc(g.mob||'—')}</span></div>
    <div class="modal-row"><span class="k">Alt. Contact</span><span class="v">${raviEsc(g.alt||'—')}</span></div>
    <div class="modal-row"><span class="k">Purpose</span><span class="v">${raviEsc(g.purpose||'—')}</span></div>
    ${(typeof isSAUser==='function' && isSAUser())?'':`<div class="modal-row"><span class="k">KM at Gate</span><span class="v">${raviEsc(g.km||'—')}</span></div>`}
    <div class="modal-row"><span class="k">Guard</span><span class="v">${raviEsc(g.guard||g.empname||'—')}</span></div>
    ${pics?`<div class="hero-photostrip" style="margin-top:8px">${pics}</div>`:'<div class="hint" style="margin-top:6px">No photos on this entry.</div>'}</div>`;
}
function geFillSelect(id, options){
  document.getElementById(id).innerHTML = '<option value="">Select…</option>'+options.map(o=>`<option value="${o}">${o}</option>`).join('');
}
document.querySelectorAll('#ge-purpose-grid .pill').forEach(p=>{
  p.addEventListener('click',()=>{ document.querySelectorAll('#ge-purpose-grid .pill').forEach(x=>x.classList.remove('sel')); p.classList.add('sel'); GE_PURPOSE=p.dataset.v; geSyncPurposeUI(); });
});
document.querySelectorAll('#ge-svc-grid .pill').forEach(p=>{
  p.addEventListener('click',()=>{ document.querySelectorAll('#ge-svc-grid .pill').forEach(x=>x.classList.remove('sel')); p.classList.add('sel'); GE_SVC_TYPE=p.dataset.v; });
});
function geSyncPurposeUI(){
  const svc=document.getElementById('ge-svc-wrap'), oth=document.getElementById('ge-other-wrap');
  if(svc) svc.style.display = GE_PURPOSE==='Service' ? 'block' : 'none';
  if(oth) oth.style.display = GE_PURPOSE==='Other' ? 'block' : 'none';
}
/* Final purpose string saved to backend — SA can edit later during estimate */
function geFinalPurpose(){
  if(GE_PURPOSE==='Service') return 'Service - '+GE_SVC_TYPE;
  if(GE_PURPOSE==='Other'){ const d=val('ge-other'); return d?('Other: '+d):'Other'; }
  return GE_PURPOSE;
}
/* ---- photo capture: Front / Back / Odometer (mandatory) + optional Dicky ---- */
const GE_MANDATORY_PHOTOS=['front','back','odo'];
function geRenderPhotoGrid(){
  const grid=document.getElementById('ge-photo-grid'); if(!grid) return;
  grid.innerHTML=GE_SIDES.map(s=>{
    const img=GE_PHOTOS[s.k];
    const need=GE_MANDATORY_PHOTOS.includes(s.k);
    const star=need?'<span style="color:#dc2626">*</span>':'';
    return `<div class="photobox" style="min-height:80px;${need&&!img?'outline:1.5px dashed #fca5a5':''}" onclick="document.getElementById('ge-photo-${s.k}').click()">
      ${img?`<img src="${img}" style="width:100%;height:80px;object-fit:cover;border-radius:8px"><button class="rm" onclick="event.stopPropagation();geRemovePhoto('${s.k}')">✕</button><div style="position:absolute;bottom:2px;left:4px;font-size:9px;background:rgba(0,0,0,.6);color:#fff;padding:1px 5px;border-radius:4px">${s.l}</div>`
           :`<div class="lbl" style="font-size:11px">📷 ${s.l}${star}</div>`}
      <input id="ge-photo-${s.k}" type="file" accept="image/*" capture="environment" style="display:none" onchange="geOnPhotoChange(event,'${s.k}')">
    </div>`;
  }).join('');
  // Show recognise button once all 5 mandatory photos are captured
  const btn=document.getElementById('ge-recognise-btn');
  if(btn){ const ready=GE_MANDATORY_PHOTOS.every(k=>GE_PHOTOS[k]); btn.style.display=ready?'block':'none'; }
}
function geOnPhotoChange(e, side){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){
    const img=new Image();
    img.onload=function(){
      // Payload diet (Ravi 15-Jul, save was >1 min): front & odo stay sharper for AI;
      // sides/dicky are evidence shots — smaller & lighter cuts upload time hard.
      const critical=(side==='front'||side==='odo');
      const maxW=critical?900:760; let w=img.width,h=img.height; if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      GE_PHOTOS[side]=canvas.toDataURL('image/jpeg',critical?0.6:0.5);
      geRenderPhotoGrid();
      // AUTO-READ (Ravi 14-Jul): no button press. The moment the plate photo (front)
      // AND the odometer photo both exist, recognition fires by itself — guard keeps
      // shooting the remaining sides while AI fills reg + km in the background.
      if(!GE_AI_AUTORAN && !GE_AI_RESULT && GE_PHOTOS.front && GE_PHOTOS.odo){
        GE_AI_AUTORAN=true; try{ geRecognise(); }catch(e){}
      }
      geApplyPhotoGate();
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
function geRemovePhoto(side){
  if(side){ GE_PHOTOS[side]=''; }
  else { GE_PHOTOS={front:'',back:'',right:'',left:'',odo:'',dicky:''}; GE_AI_RESULT=null; GE_AI_AUTORAN=false;
    ['ge-ai-status','ge-ai-card'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';}); }
  geRenderPhotoGrid();
  geApplyPhotoGate();
}
geRenderPhotoGrid();
geApplyPhotoGate();
geSyncPurposeUI();

/* ===== GATE AI: 5-photo → plate read → backend customer auto-fill (Ravi 09-Jul) ======
   Flow:
   1. Guard captures 5 photos. Tap "Read Plate & Auto-Fill".
   2. ONLY 2 photos go to Gemini (cost control, Ravi 14-Jul): plate photo (front,
      back only as fallback) + odometer photo → reg number, visual model guess AND
      the KM reading auto-filled. Sides/dicky are stored, never sent to AI.
   3. Reg looked up in MD_CustomerMaster (backend, 6,800+ vehicles) → VIN, Model,
      Customer Name, Mobile auto-filled. Guard just verifies and saves.
   4. Not in backend / new vehicle → Gemini's visual model guess pre-fills Model, guard
      types name + mobile. Everything stays editable.
   Gemini key is set once (Settings), stored on the device only — mirrors the reference
   ANPR tool Ravi provided. No key printed anywhere, no server round-trip for the image. */
const GE_GEMINI_MODEL='gemini-2.5-flash';
const GE_GEMINI_BASE='https://generativelanguage.googleapis.com/v1beta/models/';
/* ===== UNIVERSAL API KEY (Ravi 09-Jul) =============================================
   The Gemini key is now an APP-WIDE setting entered once by the CEO/superadmin, stored
   on the server (AppSettings sheet) and pushed to every device at login. No guard or SA
   ever types it. We keep a local mirror only so recognition works instantly and offline;
   the server copy is the source of truth and refreshes on every login / Sync Now.
   Same key will power requisition OCR, part-number ID and defect detection later. */
let APP_SETTINGS={};
function geGeminiKey(){
  // server-provided value wins; fall back to local mirror (offline / pre-first-sync)
  return String(APP_SETTINGS.GEMINI_API_KEY || localStorage.getItem('app_gemini_key') || '').trim();
}
function loadAppSettings(cb){
  try{
    jget('app_settings', {}, function(res){
      if(res && res.settings){
        APP_SETTINGS=res.settings;
        if(APP_SETTINGS.GEMINI_API_KEY){ try{ localStorage.setItem('app_gemini_key', APP_SETTINGS.GEMINI_API_KEY); }catch(e){} }
      }
      if(cb) cb();
    });
  }catch(e){ if(cb) cb(); }
}
/* CEO/superadmin-only: set the key for the WHOLE app (all devices). */
function geSetGeminiKey(){
  if(!isAdmin()){ alert('Only the CEO / superadmin can set the app API key.\n\nOnce they set it, it works on every device automatically — you don\'t need to enter anything.'); return; }
  const cur=geGeminiKey();
  const v=prompt('Enter the Google Gemini API key for the WHOLE app (all devices).\nGet a free key at aistudio.google.com/apikey\n\nStored on the server — entered once, used everywhere.', cur);
  if(v===null) return;
  const key=v.trim();
  APP_SETTINGS.GEMINI_API_KEY=key;
  try{ localStorage.setItem('app_gemini_key', key); }catch(e){}
  // persist to server so every other device gets it
  jpost({type:'set_app_setting', key:'GEMINI_API_KEY', value:key, by:(USER&&USER.personName)||''})
    .then(()=>{ geAiStatus(key?'✅ App API key saved — now active on every device.':'Key cleared.', key?'ok':'warn'); })
    .catch(()=>{ geAiStatus('⚠️ Saved on this device but server save failed — check connection and retry.','error'); });
}
function geAiStatus(msg,kind){
  const el=document.getElementById('ge-ai-status'); if(!el) return;
  el.style.display='block';
  const c={ok:['#065f46','#d1fae5'],warn:['#92400e','#fef3c7'],error:['#991b1b','#fee2e2'],info:['#3730a3','#e0e7ff']}[kind]||['#374151','#f3f4f6'];
  el.style.color=c[0]; el.style.background=c[1]; el.innerHTML=msg;
}
function geNormPlate(s){
  return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'')
    .replace(/^([A-Z]{2})(\d)/,'$1$2'); // keep compact; display formatting done later
}
async function geCompressForAi(dataUrl){
  return new Promise(res=>{
    const img=new Image();
    img.onload=function(){
      const maxW=1000; let w=img.width,h=img.height; if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      res(c.toDataURL('image/jpeg',0.7).split(',')[1]);
    };
    img.src=dataUrl;
  });
}
async function geRecognise(){
  const key=geGeminiKey();
  if(!key){
    if(isAdmin()) geAiStatus('No app API key set yet. <a href="#" onclick="geSetGeminiKey();return false" style="font-weight:700">Tap to set it once for the whole app</a>.','warn');
    else geAiStatus('Photo recognition isn\'t switched on yet. Ask the CEO/admin to set the app API key — then it works here automatically. You can still type the reg number to auto-fill.','warn');
    return;
  }
  const btn=document.getElementById('ge-recognise-btn'); if(btn){ btn.disabled=true; }
  geAiStatus('⏳ Reading number plate from photos…','info');
  try{
    // COST CONTROL (Ravi 14-Jul): max 2 images per read — ONE plate photo (front
    // preferred, back as fallback) + the odometer photo for an automatic KM read.
    // Sides/dicky are stored only, never sent to AI.
    const plateSlot = GE_PHOTOS.front ? 'front' : (GE_PHOTOS.back ? 'back' : '');
    const aiSlots=[]; if(plateSlot) aiSlots.push(plateSlot); if(GE_PHOTOS.odo) aiSlots.push('odo');
    const parts=[];
    for(const slot of aiSlots){
      const b64=await geCompressForAi(GE_PHOTOS[slot]);
      parts.push({text:'PHOTO — '+(slot==='odo'?'ODOMETER':slot.toUpperCase())});
      parts.push({inline_data:{mime_type:'image/jpeg',data:b64}});
    }
    const prompt=`You are reading photos of a two-wheeler at an Indian Hero MotoCorp service centre gate.
1. Read the registration plate exactly (format like MH14AB1234). If not readable, empty string.
2. From the ODOMETER photo (if given): read the TOTAL km as a whole number — the main large digits. Ignore trip meter, clock, fuel bars. If digital and showing something else, or unreadable, return 0.
Return ONLY JSON, no markdown:
{"registration_number":"","odometer_km":0,"confidence_percent":0}`;
    const url=GE_GEMINI_BASE+GE_GEMINI_MODEL+':generateContent?key='+encodeURIComponent(key);
    const body={contents:[{parts:[{text:prompt},...parts]}],generationConfig:{temperature:0,response_mime_type:'application/json'}};
    let r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.status===429){ geAiStatus('⏳ Gemini busy, retrying…','info'); await new Promise(s=>setTimeout(s,4000)); r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
    if(!r.ok){ let t=''; try{t=await r.text();}catch(e){} throw new Error('Gemini error '+r.status+': '+t.slice(0,180)); }
    const j=await r.json();
    const txt=((((j.candidates||[])[0]||{}).content||{}).parts||[]).map(p=>p.text||'').join('');
    let g={}; try{ let s=txt.trim().replace(/^```json\s*/i,'').replace(/```$/,''); const a=s.indexOf('{'),b=s.lastIndexOf('}'); if(a>=0)s=s.slice(a,b+1); g=JSON.parse(s); }catch(e){ throw new Error('Could not parse AI reply.'); }
    GE_AI_RESULT=g;
    let plate=geNormPlate(g.registration_number);
    // Fallback (only when the front plate wasn't readable): one extra call with the
    // BACK photo, plate-only. Rare, so the 2-image budget holds on normal reads.
    if(!plate && plateSlot==='front' && GE_PHOTOS.back){
      geAiStatus('⏳ Front plate unclear — trying the back photo…','info');
      try{
        const b2=await geCompressForAi(GE_PHOTOS.back);
        const body2={contents:[{parts:[{text:'Read the Indian vehicle registration plate in this photo exactly (format like MH14AB1234). Return ONLY JSON: {"registration_number":""}'},{inline_data:{mime_type:'image/jpeg',data:b2}}]}],generationConfig:{temperature:0,response_mime_type:'application/json'}};
        const r2=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body2)});
        if(r2.ok){ const j2=await r2.json(); const t2=((((j2.candidates||[])[0]||{}).content||{}).parts||[]).map(p=>p.text||'').join('');
          try{ const g2=JSON.parse(t2.trim().replace(/^```json\s*/i,'').replace(/```$/,'')); plate=geNormPlate(g2.registration_number)||''; if(plate) g.registration_number=plate; }catch(e2){}
        }
      }catch(e2){}
    }
    // FULL PLATES ONLY (Ravi 15-Jul): a partial read like "MH12HH" must never enter
    // the reg field, never be looked up, never be saved, never be taught. If the AI
    // read is incomplete, the popup asks the guard to TYPE the reg — records are
    // fetched from the backend with the typed number. That's it.
    const plateFull = plate && raviValidReg(plate);
    if(plateFull) document.getElementById('ge-reg').value=plate;
    // KM auto-fill from the odometer photo — guard can still correct it by hand.
    const kmRead=Math.round(Number(g.odometer_km)||0);
    const kmEl=document.getElementById('ge-km');
    let kmMsg='';
    if(kmEl && kmRead>0 && kmRead<400000){
      if(!String(kmEl.value||'').trim()){ kmEl.value=kmRead; kmMsg=' · KM read: <b>'+kmRead.toLocaleString('en-IN')+'</b> (verify)'; }
      else if(Number(kmEl.value)!==kmRead){ kmMsg=' · ⚠ Photo shows <b>'+kmRead.toLocaleString('en-IN')+'</b> km, you typed '+kmEl.value; }
    }
    else if(GE_PHOTOS.odo){ kmMsg=' · KM not readable — please type it'; }
    geAiStatus('🔎 Plate read: <b>'+(plateFull?plate:(plate?plate+' (incomplete)':'not clear'))+'</b>'+kmMsg+' · '+(g.confidence_percent||0)+'% confidence.'+(plateFull?' Checking records…':''),plateFull?'info':'warn');
    // Backend lookup — full plates only
    if(plateFull){
      heroCustLookup(plate,function(res){   /* phone first, server fallback (Ravi 26-Jul-2026) */
        geHandleLookup(res, g);
      }, 15000);
    } else {
      geRevealDetails();
      geAskModel(plate||'', '', null, true); // opens in reg-first mode (partial prefilled for editing)
    }
  }catch(e){
    geAiStatus('⚠️ '+String(e.message||e)+' — you can still type details manually.','error');
  }finally{ if(btn) btn.disabled=false; }
}
/* ===== INSTANT REG LOOKUP (Ravi 09-Jul) ===========================================
   Either path fills the form instantly from the backend:
     • Photos-first  → Gemini reads plate → geHandleLookup fills fields.
     • Reg-first     → guard types OR pastes a reg → same backend lookup fills the rest.
   Typing is debounced ~450 ms; a complete-looking plate (>=8 chars) or blur fires it
   immediately. Uses the same 6,800-vehicle MD_CustomerMaster the photo path uses. */
let GE_REG_TIMER=null, GE_LAST_REG_LOOKED='';
function geRegStatus(msg,kind){
  const el=document.getElementById('ge-reg-status'); if(!el) return;
  if(!msg){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  const c={ok:'#059669',warn:'#b45309',error:'#b91c1c',info:'#4f46e5'}[kind]||'#6b7280';
  el.style.color=c; el.innerHTML=msg;
}
function geRegInput(){
  const raw=(document.getElementById('ge-reg').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(GE_REG_TIMER) clearTimeout(GE_REG_TIMER);
  if(raw.length<6){ geRegStatus('',''); return; }
  // Fire immediately once it looks like a full plate; otherwise wait for a pause in typing
  const delay=raw.length>=9?0:450;
  GE_REG_TIMER=setTimeout(()=>geRegLookup(false), delay);
}
function geRegLookup(isBlur){
  const raw=(document.getElementById('ge-reg').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(raw.length<6){ return; }
  if(raw===GE_LAST_REG_LOOKED) return; // don't repeat the same lookup
  GE_LAST_REG_LOOKED=raw;
  geRegStatus('⏳ Looking up records…','info');
  heroCustLookup(raw,function(res){     /* phone first, server fallback (Ravi 26-Jul-2026) */
    if(res && res.found && res.vehicle){
      geFillFromVehicle(res.vehicle, res.fuzzy);
      geRegStatus(res.fuzzy?'✅ Close match found — details filled. Double-check the reg.':'✅ Found — details auto-filled. Please verify.','ok');
    } else if(res && res.found===false){
      // New vehicle typed in by hand — reveal Step 2 and ask which model (no AI guess available)
      geRegStatus('🆕 Not in records — new vehicle. Confirm the model &amp; enter details.','warn');
      geRevealDetails();
      geAskModel(raw, '', null, false);
    } else {
      geRegStatus('',''); // lookup unavailable — but still let the guard proceed manually
      geRevealDetails();
    }
  }, 15000);
}
/* Reveal Step-2 fields once the vehicle is known (or explicitly marked new). Until then
   the guard sees only photos + reg — nothing else. */
function geRevealDetails(){
  const b=document.getElementById('ge-details-block');
  if(b && b.style.display==='none'){
    b.style.display='block';
    b.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}
/* PHOTOS FIRST (Ravi 16-Jul): the reg box stays locked until all 5 photos are taken.
   The guard was able to type a reg with no photos at all — the photos are the whole
   point of gate entry, so they come first, always. */
function geApplyPhotoGate(){
  const el=document.getElementById('ge-reg'); if(!el) return;
  const missing=GE_MANDATORY_PHOTOS.filter(k=>!GE_PHOTOS[k]);
  const ok=missing.length===0;
  el.disabled=!ok;
  el.placeholder = ok ? 'MH14 ____' : 'Take the photos first';
  el.style.background = ok ? '' : '#f1f5f9';
  const lock=document.getElementById('ge-photo-lock');
  if(lock){
    lock.style.display = ok ? 'none' : 'block';
    lock.textContent = '📷 Take the required photos first — then the reg number opens. Still needed: '+missing.join(', ');
  }
}
/* Shared fill used by BOTH the photo path and the reg path (records match found). */
function geFillFromVehicle(v, fuzzy){
  if(!v) return;
  if(v.name) document.getElementById('ge-name').value=v.name;
  if(v.mob) document.getElementById('ge-mob').value=v.mob;
  if(v.alt){ const a=document.getElementById('ge-alt'); if(a) a.value=v.alt; }
  if(v.reg) document.getElementById('ge-reg').value=v.reg;
  // Model is known from records — set it silently (no need to ask), but let the guard change it.
  geApplyModelToDropdown(v.model);
  const card=document.getElementById('ge-ai-card');
  if(card){ card.style.display='block'; card.innerHTML=
    `<div style="font-weight:800;font-size:13px;margin-bottom:4px">👤 ${(v.name||'—').replace(/</g,'&lt;')}</div>
     <div style="font-size:12px;line-height:1.6">
     📱 ${v.mob?('+91 '+v.mob):'—'}${v.alt?(' · '+v.alt):''}<br>
     🏍 ${(v.model||'—').replace(/</g,'&lt;')}${v.vin?(' · VIN '+v.vin):''}<br>
     🔖 ${(v.reg||'—').replace(/</g,'&lt;')}</div>
     <div style="font-size:11px;color:var(--steel);margin-top:6px">${fuzzy?'⚠️ Close-matched — verify the reg.':'From service records. Correct any field above if needed.'}</div>`; }
  geRevealDetails();
}

/* Model detection ON DEMAND (Ravi 15-Jul): only runs when the backend does NOT know
   the vehicle. Known vehicles never spend AI credits on model identification. */
async function geDetectModelAI(){
  try{
    if(!GE_PHOTOS.front && !GE_PHOTOS.back) return null;
    const key=geGeminiKey();
    if(!key) return null;
    const url=GE_GEMINI_BASE+GE_GEMINI_MODEL+':generateContent?key='+encodeURIComponent(key);
    const modelList=Object.keys(KNOWN_MODELS).slice(0,40).join(', ');
    const b64=await geCompressForAi(GE_PHOTOS.front||GE_PHOTOS.back);
    const body={contents:[{parts:[
      {text:'Identify the most likely Hero MotoCorp two-wheeler model from visual badges/body shape. Known models: '+modelList+'. Also the colour. Return ONLY JSON: {"model":"","colour":"","confidence_percent":0}. If unsure, model "Unknown".'},
      {inline_data:{mime_type:'image/jpeg',data:b64}}]}],
      generationConfig:{temperature:0,response_mime_type:'application/json'}};
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) return null;
    const j=await r.json();
    const t=((((j.candidates||[])[0]||{}).content||{}).parts||[]).map(p=>p.text||'').join('');
    let s=t.trim().replace(/^```json\s*/i,'').replace(/```$/,''); const a=s.indexOf('{'),b=s.lastIndexOf('}'); if(a>=0)s=s.slice(a,b+1);
    return JSON.parse(s);
  }catch(e){ return null; }
}

function geHandleLookup(res, g){
  const plate=geNormPlate((g&&g.registration_number)||document.getElementById('ge-reg').value);
  if(res&&res.found&&res.vehicle){
    // Known vehicle → fill everything, model is trusted from records.
    geFillFromVehicle(res.vehicle, res.fuzzy);
    geAiStatus('✅ Vehicle found — details filled. Please verify with the customer.'+(res.fuzzy?' <b>(plate close-matched — check reg)</b>':''),'ok');
  } else {
    // NEW vehicle, not in records. Only NOW spend AI on model identification
    // (known vehicles skip this entirely — Ravi 15-Jul). Then ask the guard.
    geAiStatus('🆕 New vehicle — identifying model…','warn');
    const card=document.getElementById('ge-ai-card');
    if(card){ card.style.display='block'; card.innerHTML=
      `<div style="font-weight:800;font-size:13px;margin-bottom:4px">🆕 New / unregistered vehicle</div>
       <div style="font-size:12px;line-height:1.6">🔖 Plate read: ${plate||'not clear'}</div>`; }
    geRevealDetails();
    geDetectModelAI().then(function(md){
      if(md && GE_AI_RESULT){ GE_AI_RESULT.model=md.model||''; }
      geAiStatus('🆕 New vehicle — please confirm the model.','warn');
      geAskModel(plate, (md&&md.model)||'', (md&&md.confidence_percent)||null, true);
    });
  }
}

/* ===== MODEL CONFIRMATION + LEARNING (Ravi 09-Jul) =================================
   When the vehicle is new (or the AI guessed a model), never fill silently. Pop up:
   "Is this the model?" with the guess pre-selected in a dropdown of our MODEL master.
   • Yes  → accept, and if it came from AI, teach the backend (reg → model) so next time
            the same reg resolves instantly from records.
   • Change → guard picks the right model from the dropdown; that choice is taught too. */
let GE_MODEL_LEARN={reg:'',guess:'',fromAi:false};
function geModelOptionsHtml(preselect){
  const sel=document.getElementById('ge-model');
  let html='<option value="">— Select model —</option>';
  if(sel){ for(const o of sel.options){ if(!o.value) continue;
    const s=(preselect && heroOilKey(o.value)===heroOilKey(preselect))?' selected':'';
    html+=`<option value="${o.value.replace(/"/g,'&quot;')}"${s}>${o.value.replace(/</g,'&lt;')}</option>`; } }
  return html;
}
function geAskModel(reg, guessModel, conf, fromAi){
  // If the reg field ALREADY holds a valid, looked-up number, a late AI partial read
  // must not interfere (Ravi 16-Jul: popup was opening over an already-found vehicle).
  const liveReg=raviNormalizeReg((document.getElementById('ge-reg')||{}).value||'');
  if(fromAi && !raviValidReg(reg||'') && raviValidReg(liveReg)) return;
  GE_MODEL_LEARN={reg:reg||'', guess:guessModel||'', fromAi:!!fromAi};
  const modal=document.getElementById('ge-model-modal'); if(!modal) return;
  const regEl=document.getElementById('ge-model-modal-reg');
  const regOk=raviValidReg(reg||'');
  // BLANK, NOT JUNK (Ravi 16-Jul): a half read like MH14HH0 must never be prefilled.
  // Nothing fetched = empty box.
  regEl.value = regOk ? reg : '';
  // REG-FIRST MODE (Ravi 15-Jul): if the plate is missing or incomplete, ask ONLY for
  // the reg number and fetch the vehicle from records with it. The model question
  // comes later, and only if records don't know the vehicle.
  const modelWrap=document.getElementById('ge-model-modal-modelwrap');
  const fetchBtn=document.getElementById('ge-model-modal-fetch');
  if(!regOk){
    if(modelWrap) modelWrap.style.display='none';
    if(fetchBtn) fetchBtn.style.display='block';
    document.getElementById('ge-model-modal-sub').innerHTML=
      `Could not read the plate clearly from the photo. Please type the full reg number — we will fetch the vehicle from records.`;
    setTimeout(()=>{ try{ regEl.focus(); }catch(e){} },150);
  } else {
    if(modelWrap) modelWrap.style.display='block';
    if(fetchBtn) fetchBtn.style.display='none';
    const resolved=geResolveModel(guessModel);
    document.getElementById('ge-model-modal-select').innerHTML=geModelOptionsHtml(resolved||guessModel);
    document.getElementById('ge-model-modal-sub').innerHTML= guessModel
      ? `We think this is <b>${(resolved||guessModel).replace(/</g,'&lt;')}</b>${conf?(' ('+conf+'% sure)'):''}. Confirm or change it.`
      : `Couldn't read the model from the photo. Please select it.`;
  }
  document.getElementById('ge-model-modal-hint').textContent='';
  modal.style.display='flex';
}
/* Fetch-from-records with the typed reg: valid → close popup, fill reg field, run the
   SAME records lookup the manual typing path uses. Found → fills silently. Not found →
   the model question reopens, now with a proper reg attached. */
function geModalFetchReg(){
  const regEl=document.getElementById('ge-model-modal-reg');
  const r=raviNormalizeReg(regEl?regEl.value:'');
  const hint=document.getElementById('ge-model-modal-hint');
  if(!raviValidReg(r)){ if(hint){ hint.textContent='Please type the full reg number, e.g. MH14AB1234.'; hint.style.color='var(--signal-d)'; } return; }
  document.getElementById('ge-reg').value=r;
  if(typeof raviShowRegHelp==='function') raviShowRegHelp('ge-reg');
  GE_MODEL_LEARN.reg=r;
  geCloseModelModal();
  GE_LAST_REG_LOOKED=''; // force a fresh lookup even if same text was tried before
  geRegLookup(true);
}
function geCloseModelModal(){ const m=document.getElementById('ge-model-modal'); if(m) m.style.display='none'; }
function geModelConfirm(){
  const chosen=document.getElementById('ge-model-modal-select').value;
  if(!chosen){ document.getElementById('ge-model-modal-hint').textContent='Please pick a model first.'; return; }
  geApplyModelToDropdown(chosen);
  // Do NOT write to the backend here (Ravi 20-Jul, issue 1). Teaching reg→model at confirm
  // time wrote the vehicle to the customer master BEFORE Save — and again if the model was
  // corrected. The model still saves with the gate entry; it is now taught once, only after
  // the entry is actually saved (see geAfterToken).
  geCloseModelModal();
  geAiStatus('✅ Model set to <b>'+chosen.replace(/</g,'&lt;')+'</b>. Complete the remaining fields.','ok');
}
function geModelReject(){
  // Same dropdown; guard just changes the selection then confirms. Nudge them to it.
  const hint=document.getElementById('ge-model-modal-hint');
  hint.textContent='Pick the correct model above, then tap “Yes, correct”.';
  hint.style.color='var(--signal-d)';
}
/* Teach the backend: reg → model. Fire-and-forget; the customer master gains this reg so
   the next gate entry for this vehicle resolves instantly. */
function geTeachModel(reg, model){
  if(!raviValidReg(reg)) return; // FIX 15-Jul: half plates were polluting the customer master
  const r=(reg||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!r || !model) return;
  try{ jpost({type:'learn_vehicle', reg:r, model:model, stage:'GUARD', by:(USER&&USER.personName)||''}); }catch(e){}
}
/* Apply a model string to the hidden Step-2 dropdown, matching against the MODEL master. */
function geApplyModelToDropdown(model){
  const resolved=geResolveModel(model);
  const sel=document.getElementById('ge-model'); if(!sel) return;
  if(resolved){ sel.value=resolved; return; }
  // Records said THIS model but it isn't in our dropdown list (naming drift).
  // Trust the records (Ravi 15-Jul): add it as an option so it never comes up
  // blank and never triggers the "confirm model" popup for a KNOWN vehicle.
  const m=String(model||'').trim();
  if(m && m!=='Unknown'){
    const o=document.createElement('option'); o.value=m; o.textContent=m+' (records)';
    sel.appendChild(o); sel.value=m;
  }
}
/* Resolve a loose model string to an exact option in the MODEL master (exact → prefix). */
function geResolveModel(model){
  if(!model||model==='Unknown') return '';
  const sel=document.getElementById('ge-model'); if(!sel) return '';
  const want=heroOilKey(model);
  for(const o of sel.options){ if(o.value && heroOilKey(o.value)===want) return o.value; }
  for(const o of sel.options){ const k=heroOilKey(o.value); if(k&&(k.indexOf(want)===0||want.indexOf(k)===0)) return o.value; }
  return '';
}
function geWaNum(m){ return (m||'').replace(/\D/g,''); }

let GE_TODAY_COUNT=0;
function geSaveEntry(){
  const msg=document.getElementById('ge-msg'); msg.style.color='var(--steel)'; msg.textContent='';
  document.getElementById('ge-okban').style.display='none';
  if(!ONLINE){ msg.style.color='var(--signal-d)'; msg.textContent='No internet — cannot save.'; return; }
  const name=val('ge-name'), mob=val('ge-mob'), reg=val('ge-reg').toUpperCase(), loc=val('ge-loc'), model=val('ge-model'), alt=val('ge-alt'), km=val('ge-km');
  const purpose=geFinalPurpose();
  const photos={...GE_PHOTOS};
  const aiSnap=GE_AI_RESULT; // snapshot BEFORE the instant reset nulls it — else aiPlate/aiModel save empty
  const guard = USER.personName || val('ge-guard') || '';
  // v11.4 compulsory fields (items 4 & 10): Reg, Mobile, Name, Model, KM + Location.
  // Blank → block Save and show a popup listing only the missing items.
  const missing=reqCheck([
    {v:reg, label:'Reg No'},
    {v:mob, label:'Mobile No', mobile:true},
    {v:name, label:'Customer Name'},
    {v:model, label:'Model'},
    {v:km, label:'Odometer / KM'},
    {v:loc, label:'Location'}
  ]);
  if(!GE_PURPOSE) missing.push('Visit purpose');
  if(GE_PURPOSE==='Service' && !GE_SVC_TYPE) missing.push('Service type');
  if(GE_PURPOSE==='Other' && !val('ge-other')) missing.push('What other work');
  // PHOTOS ARE COMPULSORY (Ravi 14-Jul): guards were saving with 2–3 photos because
  // only text fields were checked. All 5 mandatory shots must exist before Save.
  const GE_PHOTO_LABELS={front:'Front photo',back:'Back photo',right:'Right photo',left:'Left photo',odo:'Odometer photo'};
  GE_MANDATORY_PHOTOS.forEach(k=>{ if(!GE_PHOTOS[k]) missing.push(GE_PHOTO_LABELS[k]||('Photo: '+k)); });
  if(missing.length){ reqShowMissing(missing); return; }

  // INSTANT RESET — don't wait on any network call. The save happens in the background;
  // this is what makes it feel like AppSheet (tap, gone, next form, ready in milliseconds).
  document.getElementById('ge-okban').style.display='block';
  document.getElementById('ge-okban').textContent='Saving in background…';
  ['ge-name','ge-mob','ge-alt','ge-reg','ge-km','ge-other'].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=''; });
  document.getElementById('ge-model').value='';
  document.querySelectorAll('#ge-purpose-grid .pill').forEach(x=>x.classList.remove('sel'));
  document.querySelectorAll('#ge-svc-grid .pill').forEach(x=>x.classList.remove('sel'));
  GE_PURPOSE=''; GE_SVC_TYPE=''; geSyncPurposeUI(); geRemovePhoto();
  GE_LAST_REG_LOOKED=''; geRegStatus('',''); geCloseModelModal();
  // Back to photos-only for the next vehicle: hide Step 2 and the identity card again.
  const db=document.getElementById('ge-details-block'); if(db) db.style.display='none';
  const aic=document.getElementById('ge-ai-card'); if(aic){ aic.style.display='none'; aic.innerHTML=''; }
  const ais=document.getElementById('ge-ai-status'); if(ais){ ais.style.display='none'; ais.innerHTML=''; }

  // Background save — UI never waits on this
  // TOKEN FIX (Ravi 14-Jul): the old fallback minted 'WS-'+Date.now() when next_token
  // timed out. The backend counts the largest trailing number for the day, so ONE such
  // row poisoned every token after it (the "CHIN-4635756" mystery). Now: retry once,
  // and the last-resort fallback ends in letters so /(\d+)$/ can never count it.
  const geMintFallbackToken=function(){
    const d=new Date();
    return ((loc||'WS').replace(/[^A-Za-z]/g,'').substring(0,4).toUpperCase()||'WS')+'-'
      +('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2)
      +String.fromCharCode(65+Math.floor(Math.random()*26))+'X';
  };
  const geAfterToken=function(tres){
    const entryId=(tres&&tres.entryId)||('GE'+Date.now());
    const token=(tres&&tres.token)||geMintFallbackToken();
    const rec={type:'gate', entryId, token, location:loc, name, mob, alt, reg, model, km,
      purpose, guard, photo:photos.front||'', photoBack:photos.back||'', photoRight:photos.right||'', photoLeft:photos.left||'',
      photoOdo:photos.odo||'', photoDicky:photos.dicky||'',
      aiPlate:aiSnap?geNormPlate(aiSnap.registration_number):'', aiModel:aiSnap?(aiSnap.model||''):'',
      empno:USER.empno, empname:USER.personName};
    jpost(rec).then(()=>{
      const ban=document.getElementById('ge-okban');
      if(ban) { ban.textContent='Saved — '+reg+' · Token: '+token; }
      // Teach reg→model ONCE, only now that the entry is actually saved (issue 1 fix).
      try{ geTeachModel(reg, model); }catch(e){}
      geAddMyEntry({reg,model,token,time:new Date(),name,mob,alt,purpose,km,guard,empno:USER.empno,empname:USER.personName});
    }).catch(()=>{
      const ban=document.getElementById('ge-okban');
      if(ban){ ban.style.color='var(--signal-d)'; ban.textContent='⚠ Could not confirm save for '+reg+' — check connection, may need re-entry.'; }
    });
  };
  jget('next_token', {location:loc}, function(t1){
    if(t1 && t1.token){ geAfterToken(t1); return; }
    if(t1 && t1.error==='network'){ geAfterToken(t1); return; } // network is clearly down — use the safe fallback token now, don't make the guard wait through a second 20s timeout
    jget('next_token', {location:loc}, function(t2){ geAfterToken(t2); }); // one retry only when the first reply wasn't a network failure
  });
}
