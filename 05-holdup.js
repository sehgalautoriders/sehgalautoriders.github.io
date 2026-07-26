/* ============================================================
   05-holdup.js
   Holdup module + Master Data screens + home overrides

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ================= MASTER DATA MODULE ================= */
let MD_TABLES=[], MD_CURRENT=null, MD_COLUMNS=[], MD_ROWS=[], MD_NTCOLS=[];

function mdBoot(){ jget('master_list', {}, function(res){ MD_TABLES=(res&&res.tables)||[]; mdRenderTableList(); }); }
function mdRenderTableList(){
  const box=document.getElementById('md-tablelist');
  if(!MD_TABLES.length){ box.innerHTML='<div class="hint">No tables yet. Create your first one below.</div>'; return; }
  box.innerHTML=MD_TABLES.map(t=>`<div class="tablebtn ${t===MD_CURRENT?'sel':''}" onclick="mdSelectTable('${t.replace(/'/g,"\\'")}')"><span>${t}</span></div>`).join('');
}
function mdSelectTable(name){
  MD_CURRENT=name; mdRenderTableList();
  document.getElementById('md-tabletitle').textContent=name;
  document.getElementById('md-tabletools').style.display='flex';
  document.getElementById('md-tablearea').innerHTML='<div class="hint">Loading…</div>';
  jget('master_table', {name:name}, function(res){ MD_COLUMNS=(res&&res.columns)||[]; MD_ROWS=(res&&res.rows)||[]; mdRenderGrid(); });
}
function mdRenderGrid(){
  const area=document.getElementById('md-tablearea');
  if(!MD_COLUMNS.length){ area.innerHTML='<div class="empty"><div class="cond">No columns yet</div><p style="margin-top:8px">Click "+ Column" above to start.</p></div>'; return; }
  let html='<div style="overflow-x:auto"><table class="gridtable"><thead><tr>';
  MD_COLUMNS.forEach(c=>{ html+=`<th>${c}<button class="rmcol" onclick="mdRemoveColumn('${c.replace(/'/g,"\\'")}')" title="Delete column">✕</button></th>`; });
  html+='<th style="width:40px"></th></tr></thead><tbody>';
  MD_ROWS.forEach((row,ri)=>{
    html+='<tr>';
    MD_COLUMNS.forEach(c=>{ const v=(row[c]!==undefined&&row[c]!==null)?String(row[c]).replace(/"/g,'&quot;'):'';
      html+=`<td><input value="${v}" onchange="mdCellChanged(${ri},'${c.replace(/'/g,"\\'")}',this.value)"></td>`; });
    html+=`<td><button class="rmrow" onclick="mdRemoveRow(${ri})" title="Delete row">✕</button></td></tr>`;
  });
  html+='</tbody></table></div><button class="btn ghost block" style="margin-top:8px" onclick="mdAddRow()">+ Add Row</button> <span id="md-saveflag" class="hint" style="color:var(--ok)"></span>';
  area.innerHTML=html;
}
function mdFlag(msg){ const f=document.getElementById('md-saveflag'); if(f){ f.textContent=msg; setTimeout(()=>{ if(f) f.textContent=''; },2000); } }
function mdCellChanged(ri,col,value){ MD_ROWS[ri][col]=value; jpost({type:'master_updaterow',table:MD_CURRENT,row:MD_ROWS[ri]._row,values:{[col]:value}}); mdFlag('Saved'); }
function mdAddRow(){ const blank={}; MD_COLUMNS.forEach(c=>blank[c]=''); jpost({type:'master_addrow',table:MD_CURRENT,values:blank});
  MD_ROWS.push(Object.assign({_row:MD_ROWS.length+2},blank)); mdRenderGrid(); }
function mdRemoveRow(ri){ const row=MD_ROWS[ri]; if(!confirm('Delete this row?')) return; jpost({type:'master_deleterow',table:MD_CURRENT,row:row._row}); MD_ROWS.splice(ri,1); mdRenderGrid(); mdFlag('Deleted'); }
function mdRemoveColumn(col){ if(!confirm('Delete column "'+col+'"? This removes it for every row.')) return;
  jpost({type:'master_deletecolumn',table:MD_CURRENT,column:col}); MD_COLUMNS=MD_COLUMNS.filter(c=>c!==col); MD_ROWS.forEach(r=>delete r[col]); mdRenderGrid(); }
function mdOpenAddColumn(){ document.getElementById('ac-name').value=''; document.getElementById('modal-addcolumn').style.display='flex'; }
function mdAddColumn(){ const name=val('ac-name'); if(!name) return; jpost({type:'master_addcolumn',table:MD_CURRENT,column:name});
  MD_COLUMNS.push(name); MD_ROWS.forEach(r=>r[name]=''); mdCloseModal('modal-addcolumn'); mdRenderGrid(); }
function mdDeleteCurrentTable(){ if(!confirm('Delete the entire table "'+MD_CURRENT+'"? This cannot be undone.')) return;
  jpost({type:'master_deletetable',table:MD_CURRENT}); MD_TABLES=MD_TABLES.filter(t=>t!==MD_CURRENT); MD_CURRENT=null; MD_COLUMNS=[]; MD_ROWS=[];
  document.getElementById('md-tabletitle').textContent='Select a table'; document.getElementById('md-tabletools').style.display='none';
  document.getElementById('md-tablearea').innerHTML='<div class="empty"><div class="cond">No table selected</div><p style="margin-top:8px">Pick a table on the left, or create a new one.</p></div>'; mdRenderTableList(); }
function mdOpenNewTable(){ document.getElementById('nt-name').value=''; document.getElementById('nt-col').value=''; MD_NTCOLS=[]; mdRenderNtCols(); document.getElementById('modal-newtable').style.display='flex'; }
function ntAddCol(){ const v=val('nt-col'); if(!v) return; MD_NTCOLS.push(v); document.getElementById('nt-col').value=''; mdRenderNtCols(); }
function mdRenderNtCols(){ document.getElementById('nt-cols').innerHTML=MD_NTCOLS.map((c,i)=>`<span class="coltag">${c}<span onclick="ntRemoveCol(${i})">✕</span></span>`).join(''); }
function ntRemoveCol(i){ MD_NTCOLS.splice(i,1); mdRenderNtCols(); }
function mdCreateTable(){ const name=val('nt-name'); if(!name){ alert('Enter a table name.'); return; }
  jpost({type:'master_createtable',table:name,columns:MD_NTCOLS}); MD_TABLES.push(name); mdCloseModal('modal-newtable'); mdRenderTableList(); mdSelectTable(name); }
function mdCloseModal(id){ document.getElementById(id).style.display='none'; }

/* ================= CONTROL ROOM MODULE (WM / GM / CEO visibility) ================= */
let CTL_DATA=null, CTL_TAB='pending', CTL_EST_LIST=[];
function ctlBoot(){
  document.getElementById('ctl-list').innerHTML='<div class="hint">Loading…</div>';
  ctlLoad();
}
function ctlLoad(){
  jgetReliable('report_today', {}, function(res, isStale){
    if(!res || res.ok===false){
      if(!CTL_DATA) document.getElementById('ctl-list').innerHTML='<div class="hint" style="color:var(--signal-d)">Still trying to reach the server — this can take a moment on a slow connection. Tap ↻ Refresh to retry now.</div>';
      return;
    }
    CTL_DATA=res;
    const list=allowedWsList();
    let wsSet=new Set();
    (res.gateEntries||[]).forEach(g=>{ if(g.location) wsSet.add(aliasWs(normWs(g.location))); });
    (res.estimates||[]).forEach(e=>{ if(e.ws) wsSet.add(aliasWs(normWs(e.ws))); });
    let opts = list ? list : [...wsSet];
    const sel=document.getElementById('ctl-ws');
    const prev=sel.value;
    sel.innerHTML='<option value="ALL">All allowed workshops</option>'+opts.map(o=>`<option>${o}</option>`).join('');
    if(prev && [...sel.options].some(o=>o.value===prev)) sel.value=prev;
    ctlRender();
    const staleNote=document.getElementById('ctl-stale-note');
    if(staleNote) staleNote.style.display = isStale ? 'block' : 'none';
  });
}
function ctlSetTab(t,btn){ CTL_TAB=t; document.querySelectorAll('.ctlfilters .tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); ctlRender(); }
document.getElementById('ctl-ws').addEventListener('change', ctlRender);
function ctlWsFilter(list, field){
  const pick=val('ctl-ws');
  return (list||[]).filter(x=>{
    const w=String(x[field]||'').trim();
    if(!wsAllowed(w)) return false;
    if(pick && pick!=='ALL' && aliasWs(normWs(w))!==aliasWs(normWs(pick))) return false;
    return true;
  });
}
function ctlRender(){
  if(!CTL_DATA) return;
  const gates=ctlWsFilter(CTL_DATA.gateEntries,'location');
  const est=ctlWsFilter(CTL_DATA.estimates,'ws');
  const pend=ctlWsFilter(CTL_DATA.pending,'location');
  document.getElementById('ctl-stats').innerHTML=`
    <div class="statc"><div class="n">${gates.length}</div><div class="t">Gate entries today</div></div>
    <div class="statc"><div class="n">${est.length}</div><div class="t">Estimates today</div></div>
    <div class="statc"><div class="n">${pend.length}</div><div class="t">Pending estimate</div></div>`;
  const arr = CTL_TAB==='gate' ? gates : CTL_TAB==='estimate' ? est : pend;
  const list=document.getElementById('ctl-list');
  if(!arr.length){ list.innerHTML='<div class="hint">No records for this filter.</div>'; return; }
  if(CTL_TAB==='estimate'){
    const canEdit = (typeof isTopMgmtUser==='function' && isTopMgmtUser());
    list.innerHTML=arr.map((e,i)=>`<div class="ctlitem" style="cursor:pointer;flex-direction:column;align-items:stretch" onclick="ctlToggleEst(${i})">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div class="big"><span class="dot green"></span>${e.reg||''} · ${e.model||''} <span class="badge" style="background:#eef2ff;color:#3730a3;font-size:11px;margin-left:4px">${e.service||'—'}</span></div>
        <div class="small">${e.name||''} · ${e.ws||''} · ${e.empname||''}</div>
        <div class="small" style="font-family:'Roboto Mono';font-size:11.5px;margin-top:2px">Oil ${inr(e.oil||0)} · Parts ${inr(e.parts||0)} · Labour ${inr(e.labour||0)}${e.discount>0?` · Disc −${inr(e.discount)}`:''}</div></div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="badge done">${inr(e.total||0)}</span>
        ${canEdit?`<button class="navbtn" onclick="event.stopPropagation();raviEditEstimate(${i})" title="Edit amounts (WM/GM/CEO only)">✏ Edit</button>`:''}
        <button class="navbtn" onclick="event.stopPropagation();showEstimatePreview(CTL_EST_LIST[${i}],'${(e.reg||'').replace(/'/g,"\\'")}','${(e.name||'').replace(/'/g,"\\'")}','${e.mob||''}')">👁 Preview</button></div>
      </div>
      <div id="ctl-est-${i}" style="display:none;margin-top:10px;border-top:1px dashed var(--line);padding-top:10px"></div>
    </div>`).join('');
    CTL_EST_LIST=arr;
  } else {
    list.innerHTML=arr.map(g=>{
      const done=g.estimateDone;
      const gateMs=new Date(g.time).getTime()||0;
      const pendingHrs=gateMs?((Date.now()-gateMs)/3600000).toFixed(1):0;
      const dotClass=done?'green':pendingHrs>2?'red':'orange';
      return `<div class="ctlitem"><div><div class="big"><span class="dot ${dotClass}"></span>${g.token||''} ${g.reg||''}</div>
        <div class="small">${g.name||''} · ${g.model||''} · ${g.location||''} · ${g.guard||g.empname||''}</div>
        ${!done&&pendingHrs>0?`<div class="small" style="color:${dotClass==='red'?'var(--signal-d)':'var(--steel)'}">${pendingHrs}h since gate-in</div>`:''}</div>
        <div>${done?'<span class="badge done">Estimate Done</span>':'<span class="badge pend">Pending</span>'}</div></div>`;
    }).join('');
  }
}

/* Editable estimates — WM / GM / CEO only (per project note "Editable Estimates …
   Editable at WM, GM and CEO only"). Edits the four money heads; GST is recomputed
   at the estimate's own effective rate so tax stays consistent; the same Estimate No
   row is UPDATED in the backend (not appended), with Edited By/At stamped. */
/* Estimate rights per Ravi: WM can edit ALL parameters (customer, mobile, reg, model,
   km and the amounts) but can NOT delete. Delete is reserved for GM only — and CEO
   (superadmin/admin) has everything. */
window.canDeleteEstimate=function(){
  return !!USER && (isAdmin() || /\b(GM\d*|GENERAL MANAGER|CEO\d*)\b/.test(raviUserText()));
};
window.raviEditEstimate=function(i){
  const e=CTL_EST_LIST[i]; if(!e) return;
  if(!(typeof isTopMgmtUser==='function' && isTopMgmtUser())){ alert('Only WM / GM / CEO can edit estimates.'); return; }
  const modal=document.getElementById('ravi-kpi-modal'), body=document.getElementById('ravi-kpi-body'), title=document.getElementById('ravi-kpi-title');
  if(!modal) return;
  title.textContent='Edit Estimate — '+(e.reg||e.id);
  const f=(id,lab,v)=>`<div class="fld" style="margin-bottom:8px"><label>${lab}</label><input id="${id}" inputmode="numeric" value="${Number(v||0)}" oninput="raviEditEstRecalc()"></div>`;
  const t=(id,lab,v)=>`<div class="fld" style="margin-bottom:8px"><label>${lab}</label><input id="${id}" value="${raviEsc(String(v||''))}"></div>`;
  const mlist=(typeof ES_MODEL_LIST!=='undefined' && ES_MODEL_LIST.length)?ES_MODEL_LIST:[];
  const modelOpts=mlist.map(m=>`<option ${m===e.model?'selected':''}>${m}</option>`).join('');
  body.innerHTML=`
    <div class="small" style="margin-bottom:10px">${raviEsc(e.service||'')} · SA: ${raviEsc(e.empname||'')} · ${raviEsc(e.id||'')}</div>
    ${t('ree-name','Customer Name',e.name)}${t('ree-mob','Mobile',e.mob)}${t('ree-reg','Reg No',e.reg)}
    <div class="fld" style="margin-bottom:8px"><label>Model</label>${modelOpts?`<select id="ree-model">${modelOpts}</select>`:`<input id="ree-model" value="${raviEsc(String(e.model||''))}">`}</div>
    ${t('ree-km','Odometer (km)',e.km||'')}
    ${f('ree-oil','Engine Oil (₹)',e.oil)}${f('ree-parts','Parts (₹)',e.parts)}${f('ree-labour','Labour (₹)',e.labour)}${f('ree-disc','Discount (₹)',e.discount)}
    <div class="live" style="margin-top:6px"><div class="l">New total (incl. GST)</div><div class="v" id="ree-total"><small>₹</small>0</div></div>
    <button class="btn" style="margin-top:12px" onclick="raviEditEstSave(${i})">Save Changes</button>
    ${canDeleteEstimate()?`<button class="btn" style="margin-top:8px;background:var(--signal-d)" onclick="raviDeleteEstimate(${i})">🗑 Delete Estimate (GM/CEO only)</button>`:''}
    <div id="ree-msg" class="hint" style="margin-top:8px"></div>`;
  modal.style.display='block';
  // effective GST rate of THIS estimate (falls back to 18% if old row had no breakup)
  const base=(Number(e.subtotal)|| (Number(e.oil||0)+Number(e.parts||0)+Number(e.labour||0)-Number(e.discount||0)));
  window.__REE_RATE = base>0 && Number(e.gst)>=0 ? Number(e.gst)/base : 0.18;
  raviEditEstRecalc();
};
window.raviDeleteEstimate=function(i){
  const e=CTL_EST_LIST[i]; if(!e) return;
  if(!canDeleteEstimate()){ alert('Deleting an estimate is reserved for GM / CEO.'); return; }
  if(!confirm('Delete estimate '+(e.id||'')+' for '+(e.reg||'')+'?\n\nThis removes the row from the backend permanently.')) return;
  if(!confirm('FINAL CONFIRMATION — this cannot be undone. Delete '+(e.id||'')+'?')) return;
  const msg=document.getElementById('ree-msg'); if(msg){ msg.style.color='var(--steel)'; msg.textContent='Deleting…'; }
  jpost({type:'delete_estimate', estNo:e.id, deletedBy:(USER&&(USER.personName||USER.empno))||''}).then(()=>{
    CTL_EST_LIST.splice(i,1);
    if(msg){ msg.style.color='var(--ok)'; msg.textContent='Deleted.'; }
    setTimeout(function(){ raviCloseKpiModal(); if(typeof ctlRender==='function') ctlRender(); },700);
  }).catch(()=>{ if(msg){ msg.style.color='var(--signal-d)'; msg.textContent='Could not delete — check connection and backend deployment (needs delete_estimate).'; } });
};
window.raviEditEstRecalc=function(){
  const n=id=>Number((document.getElementById(id)||{}).value||0);
  const sub=Math.max(0, n('ree-oil')+n('ree-parts')+n('ree-labour')-n('ree-disc'));
  const gst=Math.round(sub*(window.__REE_RATE||0.18));
  const el=document.getElementById('ree-total'); if(el) el.innerHTML='<small>₹</small>'+(sub+gst).toLocaleString('en-IN');
  window.__REE_CALC={sub:sub,gst:gst,total:sub+gst};
};
window.raviEditEstSave=function(i){
  const e=CTL_EST_LIST[i]; if(!e) return;
  const n=id=>Number((document.getElementById(id)||{}).value||0);
  raviEditEstRecalc();
  const c=window.__REE_CALC||{};
  const msg=document.getElementById('ree-msg'); if(msg){ msg.style.color='var(--steel)'; msg.textContent='Saving…'; }
  const tv=id=>String((document.getElementById(id)||{}).value||'').trim();
  jpost({type:'edit_estimate', estNo:e.id, oil:n('ree-oil'), parts:n('ree-parts'), labour:n('ree-labour'), discount:n('ree-disc'),
    subtotal:c.sub, gst:c.gst, total:c.total,
    name:tv('ree-name'), mob:tv('ree-mob'), reg:tv('ree-reg').toUpperCase(), model:tv('ree-model'), km:tv('ree-km'),
    editedBy:(USER&&(USER.personName||USER.empno))||''}).then(()=>{
    // reflect immediately in the open deck
    e.oil=n('ree-oil'); e.parts=n('ree-parts'); e.labour=n('ree-labour'); e.discount=n('ree-disc');
    e.subtotal=c.sub; e.gst=c.gst; e.total=c.total;
    e.name=tv('ree-name'); e.mob=tv('ree-mob'); e.reg=tv('ree-reg').toUpperCase(); e.model=tv('ree-model'); e.km=tv('ree-km');
    if(msg){ msg.style.color='var(--ok)'; msg.textContent='Saved. Estimate updated in the backend.'; }
    setTimeout(function(){ raviCloseKpiModal(); if(typeof ctlRender==='function') ctlRender(); },900);
  }).catch(()=>{ if(msg){ msg.style.color='var(--signal-d)'; msg.textContent='Could not save — check connection and the backend deployment (needs edit_estimate).'; } });
};

function ctlToggleEst(i){
  const box=document.getElementById('ctl-est-'+i); if(!box) return;
  if(box.style.display!=='none'){ box.style.display='none'; return; }
  const e=CTL_EST_LIST[i]; if(!e) return;
  const items=e.items||{};
  const rows=(t,a)=>{ a=a||[]; if(!a.length) return ''; return esGrp(t,a); };
  box.innerHTML = (rows('Engine Oil',items.oil)+rows('Parts',items.parts)+rows('Labour',items.labour))
    || '<div class="hint">No itemised breakup saved for this estimate (older estimate, or summary-only).</div>';
  box.innerHTML += `<div class="totals" style="margin-top:6px"><div class="trow"><span>Sub-total</span><span class="mono">${inr(e.subtotal||0)}</span></div>
    ${e.discount>0?`<div class="trow disc"><span>Discount</span><span class="mono">−${inr(e.discount)}</span></div>`:''}
    <div class="trow"><span>GST</span><span class="mono">${inr(e.gst||0)}</span></div></div>`;
  box.style.display='block';
}

/* ================= HOLDUP MODULE ================= */
/* Reads the Hero DMS Holdup Excel file (Sheet1), parses it in-browser using SheetJS,
   stores it in localStorage, and renders a filterable dashboard. No backend call needed
   for the data itself — upload is local. Optionally pushes a CSV to MD_Holdup via
   master_upload_csv for cross-device access. */
const HU_STORE_KEY = 'sehgal_holdup_data';
const HU_COLS = {
  code:'Code', date:'JC Date', supervisor:'Supervisor ID', jcNo:'Job Card Number',
  reg:'Vehicle Registration Number', model:'Model', orderDate:'Order Date ',
  status:'Order Status ', type:'Job Card Type', pendingDays:'Pending Days '
};
// Dealer code → workshop name mapping
const HU_CODE_MAP = {'10307':'Sehgal (10307)','23490':'Sehgal Auto (23490)','17057':'Premia (17057)'};
// Maps dealer code → actual workshop name as used in MD_Login "WS Name" column.
// This is the link WM/GM logins need — without it their allowedWsList() never matches
// a dealer-code label like "Sehgal Auto (23490)", which is why the screen was blank.
const HU_CODE_TO_WS = {'10307':'CHINCHWAD','23490':'CHINCHWAD','17057':'PREMIA'};
let HU_DATA=[], HU_DATA_ENRICHED=[], HU_REASONS=[], HU_IS_PARTS_PERSON=false; // parsed rows
let HU_SELECTED=new Set(); // row indices currently checked for bulk ops
let HU_SA_FILTER='ALL'; // advisor slicer active filter
let HU_DRS_FILTER=null; // {name, vals[]} set by bar-chart click — FIX: old code set hu-f-status (Order Status) which never matched
let HU_MATRIX_ORDERCOLS=[];
let HU_MATRIX_FILTER=null; // {type, order, upd} set by clicking a cell in the JC-Type × Order-Status summary matrix (Ravi 08-Jul)
let HU_LAST_CLICKED_ROW=-1; // for shift+click range selection

/* ===== DAILY REVIEW STATUS (DRS) — the single consolidated status column =====
   SOURCE (Ravi 26-Jul-2026): MD_HoldupReasons ("Reason" column, in sheet order).
   The list below is now only a FALLBACK, used if the master is empty or the phone
   is offline on first open — the screen must never lose its dropdown. Whatever
   rows are in MD_HoldupReasons is exactly what the WM will see. Add, remove or
   re-order there; nothing needs changing in the app. */
let HU_DRS_OPTIONS=[
  'Not Allocated','Work In Progress','Major Work - Parts Available','Major Work - Pending for Parts','Minor Job - Pending for Parts',
  'Warranty Approval','Insurance Approval','Additional Approval from Customer','Ready - Not Picked Up by Customer','Ready - DMS Billing Issue',
  'Vehicle Physically Delivered - JC Closure Pending','Shifted to Bodyshop / Service','Other Remarks'
];
const HU_ETA_OPTIONS=['Today','Tomorrow','4-5 Days','Above 5 Days'];
let HU_DRS_COLORS={
  'Not Allocated':'#6b7280','Work In Progress':'#2563eb',
  'Major Work - Parts Available':'#dc2626','Major Work - Pending for Parts':'#b91c1c','Minor Job - Pending for Parts':'#ef4444',
  'Warranty Approval':'#7c3aed','Insurance Approval':'#4f46e5','Additional Approval from Customer':'#0891b2',
  'Ready - Not Picked Up by Customer':'#16a34a','Ready - DMS Billing Issue':'#15803d','Vehicle Physically Delivered - JC Closure Pending':'#166534',
  'Shifted to Bodyshop / Service':'#92400e','Other Remarks':'#9ca3af'
};
// Old-status → DRS display labels (so old saved values still render cleanly)
const HU_OLD_TO_DRS={'PENDING_PARTS':'Major Work - Pending for Parts','PARTS_ORDERED':'Major Work - Pending for Parts','PARTS_RECEIVED':'Major Work - Parts Available','WIP':'Work In Progress','INSURANCE_PENDING':'Insurance Approval','CUSTOMER_PENDING':'Additional Approval from Customer','READY':'Ready - Not Picked Up by Customer','CLEAR':'Vehicle Physically Delivered - JC Closure Pending','UNREGISTERED':'Not Allocated','GATE_MATCHED':'Not Allocated','Warranty Approval Pending':'Warranty Approval','Insurance Approval Pending':'Insurance Approval','Additional Approval from Customer Pending':'Additional Approval from Customer','Ready - Not Picked by Customer':'Ready - Not Picked Up by Customer'};
function huNormalizeDrs(s){ s=String(s||'').trim(); if(!s) return ''; return HU_DRS_OPTIONS.includes(s)?s:(HU_OLD_TO_DRS[s]||HU_OLD_TO_DRS[s.toUpperCase()]||s); }
/* ===== SINGLE SOURCE OF TRUTH for the Home holdup KPI (v11.1 fix) =====
   The count was fluctuating (75 / 90 / 123) across loads because loadHomeStats /
   loadPriorityList each read whatever snapshot happened to be in localStorage at that
   instant — sometimes a stale pre-session copy, sometimes a freshly hydrated one, and
   the holdup count (unlike every other KPI) was NOT workshop-filtered and NOT deduped.
   Two DMS uploads for the same vehicle at different dealer codes, or a stale local copy,
   inflated it differently every time. This helper makes the number deterministic:
   dedupe by JC+Dealer composite key, drop delivered/clear, apply the SAME wsAllowed()
   filter as the rest of the dashboard. onReady triggers a one-time backend hydrate when
   local data is absent so the KPI can't render off an empty/stale store. */
function huComputeHomeCounts(onReady){
  function tally(){
    const active=huActiveFromStore();
    return {
      hu:active.length,
      parts:active.filter(r=>huIsPartStatus(huStatusText(r))).length,
      appr:active.filter(r=>huIsApprovalStatus(huStatusText(r))).length
    };
  }
  /* Count from the same backend row set the Holdup screen uses, never from a
     stale local copy. (Ravi 26-Jul-2026) The shared fetch guard means this does
     not add a second backend call when Home loads its panels together. */
  huHydrateFromBackend(function(){ onReady(tally()); });
}
/* ===== ONE SHARED COUNTING RULE FOR EVERY SUMMARY (Ravi 26-Jul-2026) =========
   Before this, five panels each counted holdup their own way:
     Home KPI tile, Home priority panel, Home snapshot, SA dashboard, Holdup screen.
   Some deduped, some did not. Some applied the workshop filter, some did not. Some
   read Status only, others Status + Reason. That is why no two summaries on the
   same screen ever agreed. Everything now calls huActiveRows / huIsPartStatus below. */
function huActiveRows(rows, opts){
  opts=opts||{};
  const seen={}, out=[];
  (rows||[]).forEach(function(r){
    const st=String(r['Holdup Status']||'').toUpperCase();
    if(!opts.includeClosed && (st==='DELIVERED'||st==='CLEAR')) return;
    if(!opts.skipWs){
      const ws=HU_CODE_TO_WS[String(r[HU_COLS.code]||'').trim()]||r[HU_COLS.code]||'';
      if(!wsAllowed(ws)) return;
    }
    // Same vehicle can hold two genuinely separate open job cards (Service + Bodyshop)
    // at two dealer codes, so the key must be JC Number + Dealer Code, never Reg alone.
    const jc=String(r[HU_COLS.jcNo]||'').trim().toUpperCase();
    const dc=String(r[HU_COLS.code]||'').trim().toUpperCase();
    const key=jc?(jc+'|'+dc):('REG:'+String(r[HU_COLS.reg]||'').trim().toUpperCase()+'|'+dc);
    if(!key||seen[key]) return; seen[key]=true;
    out.push(r);
  });
  return out;
}
/* Reads the local cache through the shared rule. Callers that need it fresh should
   call huHydrateFromBackend first — every summary panel now does. */
function huActiveFromStore(){
  let rows=[]; try{ rows=JSON.parse(localStorage.getItem(HU_STORE_KEY)||'[]'); }catch(e){ rows=[]; }
  return huActiveRows(rows);
}
/* Status + Reason together, always. A vehicle whose Status is blank but whose Reason
   says "part not available" is a parts case, and was being missed. */
function huStatusText(r){ return String((r&&r['Holdup Status'])||'')+' '+String((r&&r['Holdup Reason'])||''); }

/* ARITHMETIC FIX (Ravi 26-Jul-2026): the old test matched any text containing "part",
   so "Major Work - Parts Available" and "Parts Received" — vehicles whose parts have
   ALREADY ARRIVED — were being counted as Parts Pending. That inflated the parts
   figure on every screen. Available/received/fitted are now explicitly excluded. */
function huIsPartStatus(s){
  s=String(s||''); const t=s.toLowerCase();
  if(!(t.includes('part')||t.includes('pna'))) return ['PENDING_PARTS','PARTS_ORDERED'].includes(s);
  // Check the negatives FIRST. "part not available-first order under processing" is the
  // commonest genuine parts case and it contains the word "available" inside "not
  // available" — testing for "available" before this line wrongly cleared it.
  if(t.includes('not available')||t.includes('unavailable')||t.includes('not received')) return true;
  if(t.includes('available')||t.includes('received')||t.includes('fitted')||t.includes('issued')) return false;
  return true;
}
function huIsApprovalStatus(s){ s=String(s||''); return s.toLowerCase().includes('approval')||s.toLowerCase().includes('warranty')||['INSURANCE_PENDING','CUSTOMER_PENDING'].includes(s); }
function huIsReadyStatus(s){ s=String(s||''); return s.toLowerCase().includes('ready')||s.toLowerCase().includes('delivered')||['READY','CLEAR'].includes(s); }
function huDrsColor(s){ s=huNormalizeDrs(s); return HU_DRS_COLORS[s]||'#6b7280'; }
/* Builds the status <option> list for one vehicle. (Ravi 26-Jul-2026)
   Important safety point: vehicles already carry statuses saved under the OLD
   hardcoded list. If the master no longer contains that exact wording, the row
   would render as blank and the WM would think the update was lost. So the
   vehicle's own current status is always added at the top when it is not in the
   master list, marked (existing), until he changes it to a standard one. */
function huDrsOptionsHtml(cur){
  cur=String(cur||'').trim();
  let html='';
  if(cur && !HU_DRS_OPTIONS.some(o=>String(o).trim().toLowerCase()===cur.toLowerCase())){
    html+=`<option value="${cur}" selected>${cur} (existing)</option>`;
  }
  html+=HU_DRS_OPTIONS.map(o=>`<option value="${o}"${String(o).trim().toLowerCase()===cur.toLowerCase()?' selected':''}>${o}</option>`).join('');
  return html;
}

/* ===== EXCEL-LIKE ROW SELECTION ===== */
function huRowClick(event, rowIdx){
  // Rules: clicking on interactive controls must NOT toggle selection
  const el=event.target;
  if(el.closest('select,input,button,a,label,.hu-req-photo-btn,.hu-wa-btn,.hu-hist-btn')) return;
  // Shift+click: select range from last clicked to this row
  if(event.shiftKey && HU_LAST_CLICKED_ROW>=0){
    const s=Math.min(HU_LAST_CLICKED_ROW,rowIdx), e=Math.max(HU_LAST_CLICKED_ROW,rowIdx);
    for(let i=s;i<=e;i++){ HU_SELECTED.add(i); huApplyRowSel(i,true); }
  } else {
    const nowSel=!HU_SELECTED.has(rowIdx);
    huToggleRow(rowIdx, nowSel);
    HU_LAST_CLICKED_ROW=rowIdx;
  }
  huUpdateBulkBar();
}
function huApplyRowSel(i, sel){
  const tr=document.getElementById('hu-tr-'+i); if(!tr) return;
  if(sel){ HU_SELECTED.add(i); tr.classList.add('hu-selected'); }
  else{ HU_SELECTED.delete(i); tr.classList.remove('hu-selected'); }
  const cb=tr.querySelector('input[type=checkbox]'); if(cb) cb.checked=sel;
}
function huSelectAllFiltered(checked){
  HU_ROWS_CURRENT.forEach((r,i)=>huApplyRowSel(i,checked));
  if(!checked) HU_SELECTED.clear();
  huUpdateBulkBar();
}

/* ===== WHATSAPP + EMAIL CONTACT MODAL ===== */
const HU_WM_CONTACT='Rajesh Sardar — 9881241460';
const HU_GM_CONTACT='Malvinder Singh — 9890086667';
function huBuildWaMsg(r){
  const reg=String(r[HU_COLS.reg]||''), model=String(r[HU_COLS.model]||'');
  const jcNo=String(r[HU_COLS.jcNo]||''), jcDate=r[HU_COLS.date]?new Date(r[HU_COLS.date]).toLocaleDateString('en-IN'):'—';
  const status=String(r['Holdup Status']||''), eta=String(r['Parts ETA']||'—');
  return `Dear Customer,\n\nYour vehicle *${reg}* (${model}) is at *Sehgal Hero MotoCorp Workshop*, Chinchwad.\n\nJob Card No: ${jcNo}\nOpen Date: ${jcDate}\nCurrent Status: ${status}\nExpected ETA: ${eta}\n\nKindly acknowledge. For queries, contact:\nWM: ${HU_WM_CONTACT}\nGM: ${HU_GM_CONTACT}\n\n— Team Sehgal Autoriders`;
}
function huBuildEmailBody(r){
  const reg=String(r[HU_COLS.reg]||''), model=String(r[HU_COLS.model]||'');
  const jcNo=String(r[HU_COLS.jcNo]||''), jcDate=r[HU_COLS.date]?new Date(r[HU_COLS.date]).toLocaleDateString('en-IN'):'—';
  const status=String(r['Holdup Status']||''), eta=String(r['Parts ETA']||'—');
  return `Dear Customer,

Your vehicle ${reg} (${model}) is currently at Sehgal Hero MotoCorp Workshop, Chinchwad.

Job Card No: ${jcNo}
Open Date: ${jcDate}
Current Status: ${status}
Expected ETA: ${eta}

Kindly acknowledge this communication at your earliest convenience.

For escalation please contact:
Workshop Manager: ${HU_WM_CONTACT}
General Manager: ${HU_GM_CONTACT}

Regards,
Team Sehgal Autoriders
Chinchwad, Pune`;
}
function huCustomerActionBtns(r, i){
  const enriched=HU_DATA_ENRICHED&&HU_DATA_ENRICHED.find(e=>e&&e.reg===String(r[HU_COLS.reg]||'').trim().toUpperCase());
  const mob=enriched&&enriched.mob?String(enriched.mob).replace(/\D/g,''):'';
  // WhatsApp SVG icon button
  const waSvg=`<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
  return `<button class="hu-wa-btn wa" onclick="huOpenWa(${i})" title="${mob?'WhatsApp +91'+mob:'Enter mobile to send WhatsApp'}">${waSvg}</button><button class="hu-wa-btn mail" onclick="huOpenEmail(${i})" title="Draft email to customer" style="margin-left:3px">✉</button>`;
}
let HU_CONTACT_ROW=null;
function huFindEnrichedForRow(r){
  const rowVin=huGetVin(r), rowReg=String(r[HU_COLS.reg]||'').trim().toUpperCase();
  return HU_DATA_ENRICHED&&HU_DATA_ENRICHED.find(e=>e&&((rowVin&&e.vin===rowVin)||(rowReg&&e.reg===rowReg)));
}
function huOpenWa(rowIdx){
  HU_CONTACT_ROW=HU_ROWS_CURRENT[rowIdx]; if(!HU_CONTACT_ROW) return;
  const enriched=huFindEnrichedForRow(HU_CONTACT_ROW);
  const mob=enriched&&enriched.mob?String(enriched.mob).replace(/\D/g,'').slice(-10):'';
  const msg=huBuildWaMsg(HU_CONTACT_ROW);
  const reg=String(HU_CONTACT_ROW[HU_COLS.reg]||'');
  if(mob && mob.length===10){ window.open('https://wa.me/91'+mob+'?text='+encodeURIComponent(msg),'_blank','noopener'); return; }
  const body=document.getElementById('hu-cm-body');
  document.getElementById('hu-cm-title').textContent='WhatsApp — '+reg;
  body.innerHTML=`<p style="font-size:12px;color:var(--steel);margin-bottom:10px">No mobile on file for this vehicle. Enter the customer's 10-digit number.</p>
    <label>Customer mobile</label>
    <input id="hu-cm-mob-input" type="tel" inputmode="numeric" maxlength="10" placeholder="e.g. 9876543210" style="width:100%;margin:6px 0 12px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--steel);margin-bottom:6px">Message Preview</div>
    <pre id="hu-cm-wa-preview" style="font-size:11px;background:#f0fdf4;padding:10px;border-radius:6px;white-space:pre-wrap;max-height:160px;overflow-y:auto;border:1px solid #86efac"></pre>
    <button class="btn wa" style="margin-top:10px" onclick="huSendWaManual()">Open WhatsApp</button>`;
  document.getElementById('hu-cm-wa-preview').textContent=msg;
  document.getElementById('hu-contact-modal').style.display='flex';
}
function huSendWaManual(){
  const r=HU_CONTACT_ROW; if(!r) return;
  const m=(document.getElementById('hu-cm-mob-input').value||'').replace(/\D/g,'').slice(-10);
  if(m.length!==10){ alert('Enter a valid 10-digit number'); return; }
  window.open('https://wa.me/91'+m+'?text='+encodeURIComponent(huBuildWaMsg(r)),'_blank','noopener');
  document.getElementById('hu-contact-modal').style.display='none';
}
function huOpenEmail(rowIdx){
  HU_CONTACT_ROW=HU_ROWS_CURRENT[rowIdx]; if(!HU_CONTACT_ROW) return;
  const reg=String(HU_CONTACT_ROW[HU_COLS.reg]||'');
  const subject='Vehicle Service Update — '+reg;
  const emailBody=huBuildEmailBody(HU_CONTACT_ROW);
  const body=document.getElementById('hu-cm-body');
  document.getElementById('hu-cm-title').textContent='Email — '+reg;
  body.innerHTML=`<p style="font-size:12px;color:var(--steel);margin-bottom:10px">Enter customer email, then tap open email app.</p>
    <label>Customer email address</label>
    <input id="hu-cm-email-input" type="email" placeholder="customer@example.com" style="width:100%;margin:6px 0 12px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--steel);margin-bottom:6px">Email Preview</div>
    <pre id="hu-cm-email-preview" style="font-size:11px;background:#eff6ff;padding:10px;border-radius:6px;white-space:pre-wrap;max-height:180px;overflow-y:auto;border:1px solid #93c5fd"></pre>
    <button class="btn dark" style="margin-top:10px" onclick="huSendEmailManual()">Open Email App</button>`;
  document.getElementById('hu-cm-email-preview').textContent=emailBody;
  document.getElementById('hu-contact-modal').style.display='flex';
}
function huSendEmailManual(){
  const r=HU_CONTACT_ROW; if(!r) return;
  const em=(document.getElementById('hu-cm-email-input').value||'').trim();
  if(!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ alert('Enter a valid email address'); return; }
  const reg=String(r[HU_COLS.reg]||'');
  const subject='Vehicle Service Update — '+reg;
  window.location.href='mailto:'+encodeURIComponent(em)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(huBuildEmailBody(r));
  document.getElementById('hu-contact-modal').style.display='none';
}

let HU_SA_MAP={}; // Supervisor ID (uppercase) -> real SA Name. SOURCE: MD_SA_Master ONLY (Ravi 26-Jul-2026)
function huBoot(){
  /* MD_HoldupReasons is now the ONLY source of the standard reason list. (Ravi 26-Jul-2026)
     It feeds two things:
       1. HU_REASONS      — the separate "Reason" dropdown, filtered by Service Type.
       2. HU_DRS_OPTIONS  — the Daily Review Status dropdown the WM uses on every row.
                            This used to be a hardcoded list of 13 inside the app, which
                            is why the sheet and the screen could disagree. Whatever rows
                            are in the master, in sheet order, is what now shows.
     Colour comes from the master's "Order Status" column, so a new reason is coloured
     correctly the moment it is added — no code change needed.
     If the master is empty or unreachable the built-in fallback list stays in place, so
     the dropdown can never come up blank. */
  jget('master_table', {name:'HoldupReasons'}, function(res){
    const mrows=(res&&res.rows)||[];
    HU_REASONS=mrows.map(function(r){
      return {type:String(r['Service Type']||'').trim(), reason:String(r['Reason']||r[Object.keys(r).find(k=>k!=='_row')]||'').trim()};
    }).filter(function(r){ return r.reason&&r.reason!==''; });

    // Order Status -> colour. Anything unknown falls back to neutral grey.
    const ORD_COLOR={
      'ON HOLD':'#b91c1c','ORDER PENDING':'#dc2626','ORDER PLACED':'#ea580c',
      'IN PROGRESS':'#2563eb','READY':'#16a34a','DELIVERED':'#166534','CLOSED':'#166534'
    };
    const opts=[], colors={}, seen={};
    mrows.forEach(function(r){
      const reason=String(r['Reason']||'').trim();
      if(!reason) return;
      const k=reason.toUpperCase();
      if(seen[k]) return; seen[k]=true;
      opts.push(reason);
      const ord=String(r['Order Status']||'').trim().toUpperCase();
      colors[reason]=ORD_COLOR[ord]||'#6b7280';
    });
    if(opts.length){
      HU_DRS_OPTIONS=opts;
      // Keep the old built-in colours as a base so any legacy status still saved on a
      // vehicle keeps its colour; master values are layered on top.
      HU_DRS_COLORS=Object.assign({}, HU_DRS_COLORS, colors);
    }
    huRender(); // re-render so the dropdown shows the master list straight away
  });
  /* Supervisor ID -> SA Name for the Holdup report. (Ravi 26-Jul-2026)
     SOURCE IS MD_SA_Master ONLY. MD_Login is no longer read for this.
     Reason: MD_Login's "SA Code" column is an incomplete copy. It was missing
     10307PAT (Suryakant Patil), so those vehicles showed the raw code in the SA
     column AND created a second advisor button, splitting one man's count in two.
     MD_SA_Master is the real advisor register — code, name, emp no, location.
     Rows with no SA Code are skipped. Inactive advisors are still mapped on
     purpose, so old job cards keep showing a name instead of a bare code. */
  jget('master_table', {name:'SA_Master'}, function(res){
    HU_SA_MAP={};
    ((res&&res.rows)||[]).forEach(function(r){
      const saCode=String(r['SA Code']||'').trim();
      const name=String(r['SA Name']||'').trim();
      if(!saCode||!name) return;
      saCode.split(',').forEach(function(code){
        code=code.trim().toUpperCase();
        if(code) HU_SA_MAP[code]=name;
      });
    });
    huRender(); // re-render once mapping is ready so SA names show correctly
  });
  // Parts Person login: auto-restrict to vehicles pending for parts only
  HU_IS_PARTS_PERSON = isPartsPerson();
  let loadedLocal=false;
  try{
    const raw=localStorage.getItem(HU_STORE_KEY);
    if(raw){ HU_DATA=JSON.parse(raw); huRender(); loadedLocal=true; }
  }catch(e){}
  if(!loadedLocal){
    const ks=document.getElementById('hu-kpi-row'); if(ks) ks.innerHTML='';
    document.getElementById('hu-filters').style.display='none';
    // THE FIX for "holdup not visible in any login / vanishes on mobile": the data
    // was only ever in the UPLOADER's localStorage. Every other user/device found
    // nothing locally and stopped here. Now: no local data → hydrate the FULL rows
    // from the backend Holdup sheet (the actual source of truth, written by upsert
    // on every upload) and render. Works for SA, WM, GM, CEO, Parts, mobile — all.
    huHydrateFromBackend(function(n){ if(n>0){ huRender(); } });
  }
  /* Always re-read the row set from the backend Holdup sheet on every open, for
     every user INCLUDING the person who uploaded. (Ravi 26-Jul-2026)
     The old code only merged status fields onto this device's own stale copy of
     the uploaded file, so the uploader's row list never changed again. Anything
     shown from localStorage above is only there to avoid a blank screen for the
     half second the fetch takes; the backend answer replaces it. */
  huHydrateFromBackend(function(n){ if(n>0) huRender(); });
}
function huJcKey(jcNo, dealerCode){
  const jc=String(jcNo||'').trim().toUpperCase();
  const dc=String(dealerCode||'').trim().toUpperCase();
  if(!jc) return '';
  return jc+'|'+dc;
}
/* Build HU_DATA from the backend Holdup sheet when this device has no local copy.
   Backend columns (holdupHeaders in Apps Script) differ from the DMS-export column
   names the frontend uses (HU_COLS), so map them across. Persisted to localStorage
   so the Home snapshot / KPI cards (which read HU_STORE_KEY) also work. */
/* ===== ONE SOURCE OF TRUTH FOR THE HOLDUP ROW SET (Ravi 26-Jul-2026) ========
   Ravi's rule: the holdup list changes ONLY when the raw DMS file is uploaded
   through Upload Holdup. Nothing in Gate Entry or Estimate may add, remove or
   re-order a holdup row.
   What was actually going wrong: the device that did the upload kept that Excel
   file in its own localStorage and rendered from it forever after. Every OTHER
   device hydrated the real row set from the backend Holdup sheet. Re-opening the
   screen on the uploader's machine only patched Status/Reason/ETA onto its own
   stale rows — it never re-read which rows exist. So two people looking at the
   same day saw two different totals, and the uploader never saw rows from
   anybody else's later upload. That is the fluctuation.
   From now on the backend Holdup sheet is the only row set, for everyone.
   localStorage is a display cache so the screen is not blank while the fetch
   runs; it is never treated as the truth.
   HU_FRESH_MS + HU_FETCH_WAITERS collapse the Home snapshot, the Home KPI tile
   and the Holdup screen opening together into ONE backend call instead of three. */
let HU_HYDRATE_TRIED=false;
let HU_LAST_FETCH=0, HU_FETCH_WAITERS=null;
const HU_FRESH_MS=20000;
function huHydrateFromBackend(cb, force){
  // Already fetched a moment ago — reuse it, don't hit the backend again.
  if(!force && HU_DATA.length && (Date.now()-HU_LAST_FETCH)<HU_FRESH_MS){ if(cb) cb(HU_DATA.length); return; }
  // A fetch is already in flight — join it instead of starting a second one.
  if(HU_FETCH_WAITERS){ if(cb) HU_FETCH_WAITERS.push(cb); return; }
  HU_FETCH_WAITERS=cb?[cb]:[];
  jget('holdup_summary', {}, function(res){
    HU_HYDRATE_TRIED=true;
    const rows=(res&&res.rows)||[];
    const waiters=HU_FETCH_WAITERS||[]; HU_FETCH_WAITERS=null;
    if(!rows.length){ waiters.forEach(function(f){ try{ f(0); }catch(e){} }); return; }
    HU_DATA=rows.map(function(r){
      const o={};
      o[HU_COLS.reg]=String(r['Reg No']||'');
      o['VIN']=String(r['VIN']||'');
      o[HU_COLS.jcNo]=String(r['JC Number']||'');
      o[HU_COLS.model]=String(r['Model']||'');
      o[HU_COLS.type]=String(r['JC Type']||'');
      o[HU_COLS.status]=String(r['Order Status']||'');
      o[HU_COLS.pendingDays]=String(r['Pending Days']||'');
      o[HU_COLS.supervisor]=String(r['Supervisor ID']||'');
      o[HU_COLS.date]=String(r['JC Date']||'');
      o[HU_COLS.code]=String(r['Dealer Code']||'');
      o['Entry ID']=String(r['Entry ID']||'');
      o['Token No']=String(r['Token No']||'');
      o['Customer Name']=String(r['Customer Name']||'');
      o['Mobile']=String(r['Mobile']||'');
      o['Holdup Status']=String(r['Holdup Status']||'');
      o['Holdup Reason']=String(r['Holdup Reason']||'');
      o['Parts ETA']=String(r['Parts ETA']||'');
      o['Remarks']=String(r['Remarks']||'');
      o['Parts Updated At']=String(r['Parts Updated At']||'');
      o['Parts Updated By']=String(r['Parts Updated By']||'');
      o['Requisition Photo URL']=String(r['Requisition Photo URL']||'');
      o['Status History']=String(r['Status History']||'[]');
      return o;
    });
    HU_LAST_FETCH=Date.now();
    try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
    waiters.forEach(function(f){ try{ f(HU_DATA.length); }catch(e){} });
  });
}
function huSyncStatusFromBackend(){
  jget('holdup_summary', {}, function(res){
    if(!res||!res.rows||!res.rows.length) return;
    const mapByJc={}, mapByVin={}, mapByReg={};
    res.rows.forEach(function(r){
      const reg=String(r['Reg No']||'').trim().toUpperCase();
      const vin=String(r['VIN']||'').trim().toUpperCase();
      const jcKey=huJcKey(r['JC Number'], r['Dealer Code']);
      const entry={status:r['Holdup Status']||'',reason:r['Holdup Reason']||'',eta:r['Parts ETA']||'',remarks:r['Remarks']||'',history:r['Status History']||'[]',updAt:r['Parts Updated At']||'',updBy:r['Parts Updated By']||'',reqPhoto:String(r['Requisition Photo URL']||'')};
      if(jcKey) mapByJc[jcKey]=entry;
      if(vin) mapByVin[vin]=entry;
      if(reg) mapByReg[reg]=entry;
    });
    let changed=false;
    HU_DATA.forEach(function(r){
      const vin=huGetVin(r);
      const reg=String(r[HU_COLS.reg]||'').trim().toUpperCase();
      const jcKey=huJcKey(r[HU_COLS.jcNo], r[HU_COLS.code]);
      // Prefer the JC-keyed match (correctly distinguishes two concurrent job cards on
      // the same vehicle); fall back to VIN/Reg only when no JC Number exists.
      const m=(jcKey&&mapByJc[jcKey])||(!jcKey&&vin&&mapByVin[vin])||(!jcKey&&reg&&mapByReg[reg]);
      if(m){
        if(r['Holdup Status']!==m.status||r['Holdup Reason']!==m.reason||r['Parts ETA']!==m.eta||r['Remarks']!==m.remarks||r['Status History']!==m.history||String(r['Parts Updated At']||'')!==String(m.updAt||'')||String(r['Requisition Photo URL']||'')!==String(m.reqPhoto||'')) changed=true;
        r['Holdup Status']=m.status; r['Holdup Reason']=m.reason; r['Parts ETA']=m.eta; r['Remarks']=m.remarks; r['Status History']=m.history;
        r['Parts Updated At']=m.updAt||''; r['Parts Updated By']=m.updBy||'';
        r['Requisition Photo URL']=m.reqPhoto||'';
      }
    });
    if(changed){
      try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
      huRender();
    }
  });
}
function huRoundTripValue(rec, names){
  for(const n of names){ if(rec[n]!==undefined && rec[n]!==null && String(rec[n]).trim()!=='') return rec[n]; }
  return '';
}
function huIsRoundTripRows(rows){
  return rows.some(r=>String(r['__RoundTrip']||r['Upload Mode']||r['Export Type']||'').toUpperCase().includes('HOLDUP_ROUNDTRIP')) ||
         (rows.length && (rows[0]['Daily Review Status']!==undefined || rows[0]['ETA']!==undefined));
}
function huRoundTripKey(rec){
  const jc=String(huRoundTripValue(rec,['JC Number','Job Card Number'])).trim().toUpperCase();
  const dc=String(huRoundTripValue(rec,['Dealer Code','Code'])).trim().toUpperCase();
  const vin=String(huRoundTripValue(rec,['VIN','Asset Number','Chassis No','Chassis Number'])).trim().toUpperCase();
  const reg=String(huRoundTripValue(rec,['Reg No Key','Reg No','Vehicle Registration Number'])).trim().toUpperCase();
  return jc?('JC:'+jc+'|'+dc):(vin?('VIN:'+vin):('REG:'+reg));
}
function huApplyRoundTripRowsLocal(rows){
  const map={}; rows.forEach(r=>{ const k=huRoundTripKey(r); if(k) map[k]=r; });
  let changed=0;
  HU_DATA.forEach(r=>{
    const k=huRoundTripKey({'JC Number':r[HU_COLS.jcNo],'Dealer Code':r[HU_COLS.code],'VIN':huGetVin(r),'Reg No':r[HU_COLS.reg]});
    const u=map[k]; if(!u) return;
    const st=huNormalizeDrs(huRoundTripValue(u,['Daily Review Status','Holdup Status']));
    const eta=huRoundTripValue(u,['ETA','Parts ETA']);
    const rem=huRoundTripValue(u,['Remarks','Remark']);
    if(st!==undefined) r['Holdup Status']=st;
    if(eta!==undefined) r['Parts ETA']=eta;
    if(rem!==undefined) r['Remarks']=rem;
    changed++;
  });
  try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
  if(changed) huRender();
  return changed;
}
async function huDownload(){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_huDownload){ heroEnsureLibs('all', function(ok){ if(!ok) return; window.__heroLibsOK_huDownload=1; huDownload(); window.__heroLibsOK_huDownload=0; }); return; }

  const rows=(HU_ROWS_CURRENT&&HU_ROWS_CURRENT.length?HU_ROWS_CURRENT:HU_DATA)||[];
  if(!rows.length){ alert('No holdup data loaded to download.'); return; }
  const fileName='Holdup_Reupload_'+new Date().toISOString().slice(0,10)+'.xlsx';
  if(!window.ExcelJS){
    alert('Excel engine is still loading. Try again in 5 seconds.');
    return;
  }
  const wb=new ExcelJS.Workbook();
  wb.creator='Sehgal Hero App'; wb.created=new Date();
  const ws=wb.addWorksheet('Holdup Update');
  const lists=wb.addWorksheet('Lists'); lists.state='veryHidden';
  HU_DRS_OPTIONS.forEach((v,i)=>lists.getCell(i+1,1).value=v);
  HU_ETA_OPTIONS.forEach((v,i)=>lists.getCell(i+1,2).value=v);
  ws.columns=[
    {header:'Reg No',key:'reg',width:16},{header:'Model',key:'model',width:18},{header:'Pending Days',key:'days',width:12},
    {header:'SA',key:'sa',width:18},{header:'Daily Review Status',key:'status',width:36},{header:'ETA',key:'eta',width:16},{header:'Remarks',key:'remarks',width:42},
    {header:'JC Number',key:'jc',width:18},{header:'Dealer Code',key:'dealer',width:12},{header:'VIN',key:'vin',width:22},{header:'__RoundTrip',key:'marker',width:18}
  ];
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF15181C'}};
  ws.views=[{state:'frozen',ySplit:1}];
  rows.forEach(r=>{
    const sa=HU_SA_MAP[String(r[HU_COLS.supervisor]||'').trim().toUpperCase()]||String(r[HU_COLS.supervisor]||'').trim();
    ws.addRow({
      reg:String(r[HU_COLS.reg]||''), model:String(r[HU_COLS.model]||''), days:r.__days>=0?r.__days:'', sa:sa,
      status:huNormalizeDrs(r['Holdup Status']||''), eta:r['Parts ETA']||'', remarks:r['Remarks']||'',
      jc:String(r[HU_COLS.jcNo]||''), dealer:String(r[HU_COLS.code]||''), vin:huGetVin(r), marker:'HOLDUP_ROUNDTRIP'
    });
  });
  const lastRow=ws.rowCount;
  for(let r=2;r<=lastRow;r++){
    ws.getCell(r,5).dataValidation={type:'list',allowBlank:true,formulae:[`Lists!$A$1:$A$${HU_DRS_OPTIONS.length}`],showErrorMessage:true,errorTitle:'Invalid Status',error:'Select status from dropdown only.'};
    ws.getCell(r,6).dataValidation={type:'list',allowBlank:true,formulae:[`Lists!$B$1:$B$${HU_ETA_OPTIONS.length}`],showErrorMessage:true,errorTitle:'Invalid ETA',error:'Select ETA from dropdown only.'};
    [5,6,7].forEach(c=>{ ws.getCell(r,c).protection={locked:false}; });
  }
  // VIN / JC Number / Dealer Code stay VISIBLE (locked, but visible) — when Reg No is
  // blank these are the only way the person filling the sheet can identify the vehicle.
  // Only the internal __RoundTrip marker column stays hidden.
  ws.getColumn(11).hidden=true;
  ws.autoFilter={from:'A1',to:'J1'};
  ws.eachRow(row=>row.eachCell(cell=>{ if(!cell.protection) cell.protection={locked:true}; }));
  await ws.protect('sehgalhero',{selectLockedCells:false,selectUnlockedCells:true,formatCells:false,formatColumns:false,formatRows:false,insertRows:false,deleteRows:false,sort:true,autoFilter:true});
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileName; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
}

function huHandleFile(input){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_huHandleFile){ heroEnsureLibs('xlsx', function(ok){ if(!ok) return; window.__heroLibsOK_huHandleFile=1; huHandleFile(input); window.__heroLibsOK_huHandleFile=0; }); return; }

  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array', cellDates:true});
      // Try Sheet1 first, fall back to first sheet
      const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
      const ws=wb.Sheets[sheetName];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!rows.length){ huShowInfo('No data rows found in the file.','error'); return; }
      if(huIsRoundTripRows(rows)){
        const changed=huApplyRoundTripRowsLocal(rows);
        huShowInfo('Applying '+rows.length+' Excel updates · '+changed+' matched on this screen · Sending to server…','ok');
        jpost({type:'bulk_update_holdup',records:rows,updatedBy:USER.personName||USER.empno}).then(()=>{
          huShowInfo('✓ Excel updates sent to server. New vehicles in the morning file are not touched.','ok');
          setTimeout(huSyncStatusFromBackend,1500);
        }).catch(()=>{ huShowInfo('⚠ Excel updates could not be sent — check connection. Local screen has been updated.','error'); });
        return;
      }
      HU_DATA=rows;
      try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
      const uploadDate=new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      huShowInfo('Loaded '+rows.length+' rows locally · Sending to server…','ok');
      huRender();
      // Push to backend for gate entry + estimate ID enrichment (upsert_holdup)
      jpost({type:'upsert_holdup',records:rows}).then(()=>{
        huVerifyUpload(rows.length, uploadDate, 0);
      }).catch(()=>{
        huShowInfo('⚠ Upload to server failed — check connection and try again. Your file is still loaded locally.','error');
      });
    }catch(err){ huShowInfo('Could not parse file: '+err.message,'error'); }
  };
  reader.readAsArrayBuffer(file);
  input.value=''; // reset so same file can be re-uploaded
}
/* Verifies the upload actually landed on the server (the old code just assumed success
   and could leave the banner stuck on "matching..." forever if the write silently
   failed). Polls holdup_summary with retries, with an honest failure message if it
   genuinely never lands — fixes the "doesn't sync, even after 10-15 min" report. */
function huCheckErrors(){
  huShowInfo('Checking server for the last upload error log…','ok');
  jgetRaw('last_upload_error', {}, function(res){
    if(res && res.error){
      huShowInfo('⚠ Last server error ('+(res.error.time||'unknown time')+'): '+(res.error.error||JSON.stringify(res.error)),'error');
    } else {
      huShowInfo('✓ No server-side error logged for the last upload. If data still looks wrong, the issue is most likely in the file itself, not the upload pipeline.','ok');
    }
  }, 15000);
}
function huVerifyUpload(expectedCount, uploadDate, attempt){
  huShowInfo('Loaded '+expectedCount+' rows · Verifying server received them… (check '+(attempt+1)+'/4)','ok');
  jgetRaw('holdup_summary', {}, function(res){
    const gotCount = (res&&res.rows)?res.rows.length:0;
    // Real check: backend should have at least ~80% of what we sent (allows for a few
    // legitimately-skipped malformed rows, but catches "basically nothing landed").
    // The old check here was a no-op bug — it was always true whenever gotCount>0.
    if(gotCount >= Math.ceil(expectedCount*0.8)){
      // Build enrichment map — VIN first (more reliable, never blank/reused), Reg No fallback
      const enrichMap={};
      const statusMapByJc={}, statusMapByVin={}, statusMapByReg={};
      (res.rows||[]).forEach(function(r){
        const reg=String(r['Reg No']||'').trim().toUpperCase();
        const vin=String(r['VIN']||'').trim().toUpperCase();
        const jcKey=huJcKey(r['JC Number'], r['Dealer Code']);
        const entry={reg:reg,vin:vin,entryId:r['Entry ID'],mob:r['Mobile'],sa:r['Estimate SA']||''};
        if(vin) enrichMap['VIN:'+vin]=entry;
        if(reg) enrichMap['REG:'+reg]=entry;
        // THE ACTUAL FIX: this is the data the backend confirmed it has (and correctly
        // preserved from before) — but it was never being pulled back into the locally
        // rendered table before. The old code only used res.rows for the gate-entry
        // dot/SA enrichment above, never for the editable fields themselves, so a
        // freshly re-parsed Excel file's blank Status/Reason/ETA/Remarks were shown
        // even though the server genuinely had the real data the whole time.
        const statusEntry={status:r['Holdup Status']||'',reason:r['Holdup Reason']||'',eta:r['Parts ETA']||'',remarks:r['Remarks']||'',history:r['Status History']||'[]'};
        if(jcKey) statusMapByJc[jcKey]=statusEntry;
        if(vin) statusMapByVin[vin]=statusEntry;
        if(reg) statusMapByReg[reg]=statusEntry;
      });
      HU_DATA_ENRICHED=HU_DATA.map(function(r){
        const vin=huGetVin(r);
        const reg=String(r[HU_COLS.reg]||'').trim().toUpperCase();
        return (vin&&enrichMap['VIN:'+vin]) || (reg&&enrichMap['REG:'+reg]) || {};
      });
      HU_DATA.forEach(function(r){
        const vin=huGetVin(r);
        const reg=String(r[HU_COLS.reg]||'').trim().toUpperCase();
        const jcKey=huJcKey(r[HU_COLS.jcNo], r[HU_COLS.code]);
        // JC-keyed match first — correctly distinguishes two concurrent job cards on
        // the same vehicle (e.g. Service + Bodyshop open at once)
        const s=(jcKey&&statusMapByJc[jcKey])||(!jcKey&&vin&&statusMapByVin[vin])||(!jcKey&&reg&&statusMapByReg[reg]);
        if(s){ r['Holdup Status']=s.status; r['Holdup Reason']=s.reason; r['Parts ETA']=s.eta; r['Remarks']=s.remarks; r['Status History']=s.history; }
      });
      try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
      const matched=HU_DATA_ENRICHED.filter(e=>e.entryId).length;
      huShowInfo('✓ Loaded '+expectedCount+' rows · Confirmed saved to server ('+gotCount+' rows on backend) · '+matched+' matched to gate entries · '+uploadDate,'ok');
      clearMasterCache();
      huRender();
      /* The uploader must end up on exactly the same row set as everyone else.
         Until now this screen kept the locally parsed Excel rows, which is how the
         uploading machine drifted away from every other device. Force one read of
         the backend Holdup sheet — the row set the server actually stored. */
      huHydrateFromBackend(function(n){ if(n>0) huRender(); }, true);
    } else if(attempt<3){
      setTimeout(()=>huVerifyUpload(expectedCount, uploadDate, attempt+1), 3000);
    } else {
      // Genuinely failed — go fetch the real server-side error instead of guessing
      jgetRaw('last_upload_error', {}, function(errRes){
        const serverErr = errRes && errRes.error ? (errRes.error.error||JSON.stringify(errRes.error)) : null;
        huShowInfo('⚠ Upload did not reach the server properly (backend shows '+gotCount+' rows, expected '+expectedCount+').'+(serverErr?' Server error: '+serverErr:' No server error was logged — this may be a network/deployment issue.')+' Your file is still visible here locally — tap "↻ Sync Now" to retry, or re-upload.','error');
      }, 15000);
    }
  });
}
function huGetVin(row){
  return String(row['Asset Number']||row['VIN']||row['VIN No']||row['VIN Number']||row['Chassis No']||row['Chassis Number']||'').trim().toUpperCase();
}

function huShowInfo(msg,type){
  const el=document.getElementById('hu-upload-info');
  el.style.display='block';
  el.style.color=type==='error'?'#b91c1c':type==='ok'?'var(--ok)':'var(--steel)';
  el.style.background=type==='error'?'#fef2f2':type==='ok'?'#f0fdf4':'#f8f7f5';
  el.style.border=type==='error'?'1px solid #fca5a5':type==='ok'?'1px solid #86efac':'1px solid var(--line)';
  el.textContent=msg;
}

function huVal(id){ return (document.getElementById(id)||{}).value||''; }

function huRender(){
  if(!HU_DATA.length){
    /* ARITHMETIC FIX (Ravi 26-Jul-2026): this used to just return, leaving the
       PREVIOUS summary numbers on screen with an empty table under them. So after a
       filter wiped everything out, the chips still showed yesterday's counts. */
    const k=document.getElementById('hu-kpi-row'); if(k) k.innerHTML='';
    const w=document.getElementById('hu-table-wrap');
    if(w) w.innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)"><div style="font-size:32px;margin-bottom:8px">📄</div><div style="font-weight:700">No holdup data yet</div><div style="font-size:12px;margin-top:4px">Upload today\'s Holdup file to load vehicles.</div></div>';
    return;
  }
  // Parts login: no filter bar — the table is already auto-restricted to parts-pending
  // vehicles (HU_IS_PARTS_PERSON), so dealer/type/SA/status filters are just noise.
  document.getElementById('hu-filters').style.display = HU_IS_PARTS_PERSON ? 'none' : 'flex';

  // Build filter options
  huPopulateFilter('hu-f-code',[...new Set(HU_DATA.map(r=>String(r[HU_COLS.code]||'')).filter(Boolean))],v=>HU_CODE_MAP[v]||v);
  huPopulateFilter('hu-f-type',[...new Set(HU_DATA.map(r=>String(r[HU_COLS.type]||'')).filter(Boolean))]);
  huPopulateFilter('hu-f-status',[...new Set(HU_DATA.map(r=>String(r[HU_COLS.status]||'')).filter(Boolean))]);
  const supervisorIds=[...new Set(HU_DATA.map(r=>String(r[HU_COLS.supervisor]||'').trim()).filter(Boolean))];
  const saDisplayNames=[...new Set(supervisorIds.map(id=>HU_SA_MAP[id.toUpperCase()]||id))];
  huPopulateFilter('hu-f-sa', saDisplayNames);

  // Build advisor slicer buttons
  const slicerBox=document.getElementById('hu-slicer');
  if(slicerBox){
    slicerBox.style.display='flex';
    const saCounts={};
    HU_DATA.filter(r=>String(r['Holdup Status']||'').toUpperCase()!=='DELIVERED').forEach(r=>{
      const name=HU_SA_MAP[String(r[HU_COLS.supervisor]||'').trim().toUpperCase()]||String(r[HU_COLS.supervisor]||'').trim();
      if(name) saCounts[name]=(saCounts[name]||0)+1;
    });
    const totalActive=HU_DATA.filter(r=>String(r['Holdup Status']||'').toUpperCase()!=='DELIVERED').length;
    let html='<span class="hu-slicer-label">Advisor:</span>';
    html+=`<button class="hu-sl-btn${HU_SA_FILTER==='ALL'?' active':''}" onclick="huSetSaFilter('ALL')">All <span class="sl-count">${totalActive}</span></button>`;
    html+=Object.entries(saCounts).sort((a,b)=>b[1]-a[1]).map(([name,cnt])=>`<button class="hu-sl-btn${HU_SA_FILTER===name?' active':''}" onclick="huSetSaFilter('${name.replace(/'/g,"\\'")}')">${name} <span class="sl-count">${cnt}</span></button>`).join('');
    slicerBox.innerHTML=html;
  }

  const fCode=huVal('hu-f-code'), fType=huVal('hu-f-type'), fStatus=huVal('hu-f-status');
  const fDays=huVal('hu-f-days'), fSearch=huVal('hu-f-search').toLowerCase().trim(), fSa=huVal('hu-f-sa');
  const showDelivered=document.getElementById('hu-f-delivered')&&document.getElementById('hu-f-delivered').checked;
  const allowed=allowedWsList();

  let rows=HU_DATA.filter((r)=>{
    if(!showDelivered && String(r['Holdup Status']||'').toUpperCase()==='DELIVERED') return false;
    const code=String(r[HU_COLS.code]||'');
    const realWs=HU_CODE_TO_WS[code]||'';
    if(allowed){ const ok=allowed.some(a=>sameWsJs(a,realWs)); if(!ok) return false; }
    if(fCode && code!==fCode) return false;
    if(fType && String(r[HU_COLS.type]||'')!==fType) return false;
    if(fStatus && String(r[HU_COLS.status]||'')!==fStatus) return false;
    if(fDays){ // FIX: match the range buckets against real computed pending days (old exact-string compare never matched)
      const jd=r[HU_COLS.date]; let dd=null;
      if(jd instanceof Date && !isNaN(jd.getTime())) dd=Math.floor((Date.now()-jd.getTime())/86400000);
      else{ const d2=new Date(jd); if(!isNaN(d2.getTime())) dd=Math.floor((Date.now()-d2.getTime())/86400000); }
      if(dd===null) return false;
      if(fDays==='>5 Days' && !(dd>5)) return false;
      if(fDays==='2 - 5 Days' && !(dd>=2&&dd<=5)) return false;
      if(fDays==='<2 Days' && !(dd<2)) return false;
    }
    if(HU_DRS_FILTER && HU_DRS_FILTER.vals){
      const drs=huNormalizeDrs(r['Holdup Status']||'Not Set')||'Not Set';
      if(!HU_DRS_FILTER.vals.some(v=>v.toLowerCase()===drs.toLowerCase())) return false;
    }
    // Advisor slicer filter (both the dropdown and the slicer buttons)
    if(HU_SA_FILTER!=='ALL'||fSa){
      const supId=String(r[HU_COLS.supervisor]||'').trim();
      const dispName=HU_SA_MAP[supId.toUpperCase()]||supId;
      if(HU_SA_FILTER!=='ALL' && dispName!==HU_SA_FILTER) return false;
      if(fSa && dispName!==fSa) return false;
    }
    if(HU_IS_PARTS_PERSON){
      const flagText=((r['Holdup Status']||'')+' '+(r['Holdup Reason']||'')+' '+(r[HU_COLS.status]||'')+' '+(r['Remarks']||'')+' '+(r['Part No']||'')+' '+(r['Parts ETA']||'')).toUpperCase();
      if(!(/PART|PNA|SPARE|BACK ORDER|ORDER/.test(flagText))) return false;
    }
    if(fSearch){
      const reg=String(r[HU_COLS.reg]||'').toLowerCase();
      const model=String(r[HU_COLS.model]||'').toLowerCase();
      const jcNo=String(r[HU_COLS.jcNo]||'').toLowerCase();
      const vin=huGetVin(r).toLowerCase();
      if(!reg.includes(fSearch)&&!model.includes(fSearch)&&!jcNo.includes(fSearch)&&!vin.includes(fSearch)) return false;
    }
    return true;
  });

  // Compute exact pending days
  rows.forEach(r=>{
    const jd=r[HU_COLS.date];
    let days=null;
    if(jd instanceof Date && !isNaN(jd.getTime())) days=Math.floor((Date.now()-jd.getTime())/86400000);
    else{ const d=new Date(jd); if(!isNaN(d.getTime())) days=Math.floor((Date.now()-d.getTime())/86400000); }
    r.__days=days===null?-1:days;
  });
  rows.sort((a,b)=>b.__days-a.__days);

  // RAVI 08-Jul: the ETA-centric tiles (Today ETA / Tomorrow / Carry Forward) are gone.
  // The summary is now: JC-Type categories → branching by DMS Order Status → what's
  // been updated today. It is computed on the FULL filtered set (so drilling into a
  // cell never collapses the matrix itself), then the table narrows to the clicked cell.
  huRenderSummary(rows);
  if(HU_MATRIX_FILTER){
    rows=rows.filter(r=>{
      if(HU_MATRIX_FILTER.type && String(r[HU_COLS.type]||'').trim()!==HU_MATRIX_FILTER.type) return false;
      if(HU_MATRIX_FILTER.order){
        const o=String(r[HU_COLS.status]||'').trim();
        if(HU_MATRIX_FILTER.order==='__OTHER__'){
          // "Other" = everything outside the six Order Status columns actually shown.
          // This cell used to be plain text with no tap at all, so the vehicles hidden
          // inside it were unreachable from the summary.
          if((HU_MATRIX_ORDERCOLS||[]).includes(o||'(Blank)')) return false;
        } else if(o!==HU_MATRIX_FILTER.order) return false;
      }
      if(HU_MATRIX_FILTER.upd){ const u=huUpdatedToday(r); if(HU_MATRIX_FILTER.upd==='YES'&&!u) return false; if(HU_MATRIX_FILTER.upd==='NO'&&u) return false; }
      // Chip drill-down. Uses the SAME test the chip count uses, so the number on the
      // chip and the number of rows you land on can never disagree.
      if(HU_MATRIX_FILTER.grp){
        const t=huStatusText(r);
        if(HU_MATRIX_FILTER.grp==='PARTS' && !huIsPartStatus(t)) return false;
        if(HU_MATRIX_FILTER.grp==='APPR'  && !huIsApprovalStatus(t)) return false;
        if(HU_MATRIX_FILTER.grp==='READY' && !huIsReadyStatus(t)) return false;
      }
      return true;
    });
  }

  if(!rows.length){ document.getElementById('hu-table-wrap').innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)"><div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-weight:700">No records match the current filters</div><div style="font-size:12px;margin-top:4px">Try clearing some filters or check "Show delivered"</div></div>'; return; }
  HU_ROWS_CURRENT=rows;

  // v11: Operations-Hub card layout on mobile — the wide table needed endless
  // left-right scrolling and confused WMs about which vehicle they were updating
  if(window.innerWidth<=760){
    huRenderMobileCards(rows);
    huUpdateBulkBar();
    const bottomElM=document.getElementById('hu-bottom-panels');
    if(bottomElM){ bottomElM.style.display='grid'; huRenderBarChart(rows); huRenderPhotoGallery(); }
    return;
  }

  // Build DRS select options (HTML fragment reused per row)
  const drsOpts=HU_DRS_OPTIONS.map(o=>`<option value="${o}" __SEL__>${o}</option>`);

  document.getElementById('hu-table-wrap').innerHTML=`<table class="hu-excel-table">
    <thead><tr>
      <th style="width:32px" title="Select vehicles one by one for bulk update"></th>
      <th style="width:14px">●</th><th>Reg No</th><th>Model</th><th>Days</th><th>JC Type</th><th>Order Status</th><th>SA</th>
      <th style="min-width:190px">Daily Review Status</th>
      <th style="min-width:110px">ETA</th><th style="min-width:180px">Remarks</th>
      <th style="width:44px">📷</th><th style="width:64px">Action</th><th style="width:40px">📅</th>
    </tr></thead>
    <tbody>${rows.map((r,i)=>{
      const days=r.__days;
      const dClass=days>5?'td-days-gt5':days>=2?'td-days-25':'td-days-lt2';
      const rowVin=huGetVin(r);
      const rowReg=String(r[HU_COLS.reg]||'').trim().toUpperCase();
      const reg=rowReg||rowVin||'';
      const regIsVin=!rowReg&&!!rowVin;
      const matched=HU_DATA_ENRICHED&&HU_DATA_ENRICHED.find(e=>e&&((rowVin&&e.vin===rowVin)||(rowReg&&e.reg===rowReg)));
      const dotCls=matched&&matched.entryId?'green':'red';
      const canEdit=canEditHoldup();
      const curHS=huNormalizeDrs(r['Holdup Status']||''), curEta=r['Parts ETA']||'', curRemarks=r['Remarks']||'';
      const isPartFlag=huIsPartStatus(curHS)||curHS.toLowerCase().includes('pna');
      const isSel=HU_SELECTED.has(i);
      const saName=HU_SA_MAP[String(r[HU_COLS.supervisor]||'').trim().toUpperCase()]||String(r[HU_COLS.supervisor]||'').trim();
      let histCount=0; try{ histCount=JSON.parse(r['Status History']||'[]').length; }catch(e){}
      // Build DRS select with correct option selected
      const drsOptsHtml=huDrsOptionsHtml(curHS);
      // ETA options
      const etaOpts=HU_ETA_OPTIONS.map(o=>`<option value="${o}"${o===curEta?' selected':''}>${o}</option>`).join('');
      // DRS color badge for read-only view
      const drsColor=huDrsColor(curHS);
      return `<tr id="hu-tr-${i}" class="${isSel?'hu-selected':''} ${isPartFlag?'hu-row-part-flag':''}" onclick="huRowClick(event,${i})" style="cursor:pointer">
        <td style="width:32px;text-align:center" onclick="event.stopPropagation()"><input type="checkbox" ${isSel?'checked':''} onchange="huToggleRow(${i},this.checked)"></td>
        <td style="width:18px;text-align:center;pointer-events:none"><span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${dotCls==='green'?'var(--ok)':'var(--signal-d)'}"></span></td>
        <td class="td-reg" style="min-width:100px;cursor:pointer;color:#2563eb;text-decoration:underline dotted" onclick="event.stopPropagation();huShowDetail(${i})" title="Open vehicle detail window">${reg||'—'}${regIsVin?'<span style="font-size:9px;color:var(--steel);display:block">(VIN)</span>':''}</td>
        <td style="font-size:12px;white-space:nowrap">${r[HU_COLS.model]||'—'}</td>
        <td class="td-days ${dClass}">${days>=0?days+'d':'—'}</td>
        <td style="font-size:11px;white-space:nowrap">${r[HU_COLS.type]||'—'}</td>
        <td style="font-size:11px;white-space:nowrap">${r[HU_COLS.status]||'—'}</td>
        <td style="font-size:11px;color:var(--steel);white-space:nowrap">${saName||'—'}</td>
        <td onclick="event.stopPropagation()">${canEdit
          ?`<select class="drs-select" onchange="huInlineUpdate(${i},'status',this.value)" style="color:${drsColor};font-weight:600"><option value="">Select status…</option>${drsOptsHtml}</select>`
          :`<span class="drs-badge" style="background:${drsColor}15;color:${drsColor};border:1px solid ${drsColor}40;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600">${curHS||'—'}</span>`}</td>
        <td onclick="event.stopPropagation()">${canEdit
          ?`<select class="hu-eta-select" onchange="huInlineUpdate(${i},'eta',this.value)"><option value="">ETA…</option>${etaOpts}</select>`
          :`<span style="font-size:11px">${curEta||'—'}</span>`}</td>
        <td onclick="event.stopPropagation()">${canEdit
          ?`<input class="hu-remarks-in" type="text" value="${(curRemarks+'').replace(/"/g,'&quot;')}" placeholder="${isPartFlag?'Order no / vendor / ETA':'Next action / customer update'}" onblur="huInlineUpdate(${i},'remarks',this.value)">`
          :`<span style="font-size:11px">${curRemarks||'—'}</span>`}</td>
        <td style="text-align:center" onclick="event.stopPropagation()">${huReqPhotoCell(r,i)}</td>
        <td style="text-align:center;white-space:nowrap" onclick="event.stopPropagation()">${huCustomerActionBtns(r,i)}</td>
        <td style="white-space:nowrap" onclick="event.stopPropagation()"><button class="hu-hist-btn" onclick="huShowHistory(${i})" title="Day-wise status history">📅<sup class="hu-hist-count">${histCount||''}</sup></button></td>
      </tr>`;
    }).join('')}</tbody></table>`;
  huUpdateBulkBar();
  // Render bottom panels
  const bottomEl=document.getElementById('hu-bottom-panels');
  if(bottomEl){ bottomEl.style.display='grid'; huRenderBarChart(rows); huRenderPhotoGallery(); }
}

function huSetSaFilter(name){
  HU_SA_FILTER=name;
  huRender();
}

/* ===== RAVI 08-Jul SUMMARY ENGINE =====================================
   "I need how many vehicles of each category are there, Paid, General repair etc,
    then in that branching, how much of each category are pending, Completed,
    allocated for repair as per DMS order status. Then what I have updated."
   - Chips row: Total · Parts Pending · Approval · Ready · Updated Today · Not Updated Today
   - Matrix: JC Type rows × DMS Order Status columns + Upd-Today split per category
   - Every cell is clickable → drills the table to exactly those vehicles; click again to clear
   - Re-rendered live after every inline update, so the numbers ALWAYS move immediately */
let HU_SUMMARY_ROWS=null;   // full filtered set (pre matrix drill) — live references into HU_DATA
let HU_MATRIX_CELLS=[];     // click registry — avoids quote-escaping bugs in onclick strings
function huUpdatedToday(r){
  const d=r['Parts Updated At']; if(!d) return false;
  const dt=d instanceof Date?d:new Date(d); if(isNaN(dt.getTime())) return false;
  const t=new Date();
  return dt.getFullYear()===t.getFullYear()&&dt.getMonth()===t.getMonth()&&dt.getDate()===t.getDate();
}
function huMatrixClickIdx(idx){
  const c=HU_MATRIX_CELLS[idx]; if(!c) return;
  const same=HU_MATRIX_FILTER&&HU_MATRIX_FILTER.type===c.type&&HU_MATRIX_FILTER.order===c.order&&HU_MATRIX_FILTER.upd===c.upd;
  HU_MATRIX_FILTER=same?null:{type:c.type,order:c.order,upd:c.upd};
  huRender();
}
function huMatrixCell(n,type,order,upd,extraStyle){
  if(!n) return `<td class="hu-mx-cell zero">·</td>`;
  const idx=HU_MATRIX_CELLS.length;
  HU_MATRIX_CELLS.push({type:type||'',order:order||'',upd:upd||''});
  const active=HU_MATRIX_FILTER&&HU_MATRIX_FILTER.type===(type||'')&&HU_MATRIX_FILTER.order===(order||'')&&HU_MATRIX_FILTER.upd===(upd||'');
  return `<td class="hu-mx-cell${active?' active':''}" style="${extraStyle||''}" onclick="huMatrixClickIdx(${idx})" title="Click to show only these vehicles">${n}</td>`;
}
function huRenderSummary(rows){
  const kpiEl=document.getElementById('hu-kpi-row'); if(!kpiEl) return;
  HU_SUMMARY_ROWS=rows;
  HU_MATRIX_CELLS=[];
  const total=rows.length;
  const parts=rows.filter(r=>huIsPartStatus(huStatusText(r))).length;
  const appr=rows.filter(r=>huIsApprovalStatus(huStatusText(r))).length;
  const ready=rows.filter(r=>huIsReadyStatus(huStatusText(r))).length;
  const updToday=rows.filter(huUpdatedToday).length;
  const notUpd=total-updToday;

  // JC Type buckets and Order Status columns — both dynamic from live data
  const typeMap={};
  rows.forEach(r=>{
    const t=String(r[HU_COLS.type]||'').trim()||'(No JC Type)';
    (typeMap[t]=typeMap[t]||[]).push(r);
  });
  const orderCounts={};
  rows.forEach(r=>{ const o=String(r[HU_COLS.status]||'').trim()||'(Blank)'; orderCounts[o]=(orderCounts[o]||0)+1; });
  const orderCols=Object.entries(orderCounts).sort((a,b)=>b[1]-a[1]).map(e=>e[0]).slice(0,6);
  HU_MATRIX_ORDERCOLS=orderCols; // remembered so the 'Other' cell can filter to everything NOT shown
  const hasOther=Object.keys(orderCounts).length>orderCols.length;

  const types=Object.entries(typeMap).sort((a,b)=>b[1].length-a[1].length);
  const chipsActive=(u)=>HU_MATRIX_FILTER&&!HU_MATRIX_FILTER.type&&!HU_MATRIX_FILTER.order&&!HU_MATRIX_FILTER.grp&&HU_MATRIX_FILTER.upd===u;
  const grpActive=(g)=>HU_MATRIX_FILTER&&HU_MATRIX_FILTER.grp===g;

  let html=`<div class="hu-sum-wrap">
    <div class="hu-sum-chips">
      <span class="hu-chip total${HU_MATRIX_FILTER?'':' active'}" onclick="HU_MATRIX_FILTER=null;huRender()">🚗 Total <b>${total}</b></span>
      <span class="hu-chip clickable${grpActive('PARTS')?' active':''}" style="--cc:#7e22ce" onclick="huMatrixToggleGrp('PARTS')">🔧 Parts Pending <b>${parts}</b></span>
      <span class="hu-chip clickable${grpActive('APPR')?' active':''}" style="--cc:#4f46e5" onclick="huMatrixToggleGrp('APPR')">🛡 Approval <b>${appr}</b></span>
      <span class="hu-chip clickable${grpActive('READY')?' active':''}" style="--cc:#166534" onclick="huMatrixToggleGrp('READY')">🟢 Ready / Not Delivered <b>${ready}</b></span>
      <span class="hu-chip clickable${chipsActive('YES')?' active':''}" style="--cc:#0e7490" onclick="huMatrixToggleUpd('YES')">✏️ Updated Today <b>${updToday}</b></span>
      <span class="hu-chip clickable${chipsActive('NO')?' active':''}" style="--cc:#b91c1c" onclick="huMatrixToggleUpd('NO')">⏳ Not Updated <b>${notUpd}</b></span>
      ${HU_MATRIX_FILTER?`<span class="hu-chip clear" onclick="HU_MATRIX_FILTER=null;huRender()">✕ Clear drill-down</span>`:''}
    </div>
    <div class="hu-mx-scroll"><table class="hu-matrix">
      <thead><tr><th class="hu-mx-type">Category (JC Type)</th><th>Total</th>${orderCols.map(o=>`<th>${o}</th>`).join('')}${hasOther?'<th>Other</th>':''}<th class="hu-mx-upd">✏️ Upd Today</th><th class="hu-mx-upd">⏳ Not Upd</th></tr></thead>
      <tbody>`;
  types.forEach(([t,list])=>{
    const byOrder={}; let other=0;
    list.forEach(r=>{ const o=String(r[HU_COLS.status]||'').trim()||'(Blank)'; if(orderCols.includes(o)) byOrder[o]=(byOrder[o]||0)+1; else other++; });
    const u=list.filter(huUpdatedToday).length;
    const typeRaw=t==='(No JC Type)'?'':t;
    html+=`<tr><td class="hu-mx-type">${t}</td>`
      +huMatrixCell(list.length,typeRaw,'','','font-weight:800')
      +orderCols.map(o=>huMatrixCell(byOrder[o]||0,typeRaw,o==='(Blank)'?'':o,'')).join('')
      +(hasOther?huMatrixCell(other,typeRaw,'__OTHER__',''):'')
      +huMatrixCell(u,typeRaw,'','YES','color:#0e7490')
      +huMatrixCell(list.length-u,typeRaw,'','NO','color:#b91c1c')
      +`</tr>`;
  });
  // TOTAL row
  const totByOrder={}; let totOther=0;
  rows.forEach(r=>{ const o=String(r[HU_COLS.status]||'').trim()||'(Blank)'; if(orderCols.includes(o)) totByOrder[o]=(totByOrder[o]||0)+1; else totOther++; });
  html+=`<tr class="hu-mx-total"><td class="hu-mx-type">ALL</td>`
    +huMatrixCell(total,'','','','font-weight:800')
    +orderCols.map(o=>huMatrixCell(totByOrder[o]||0,'',o==='(Blank)'?'':o,'')).join('')
    +(hasOther?huMatrixCell(totOther,'','__OTHER__',''):'')
    +huMatrixCell(updToday,'','','YES','color:#0e7490')
    +huMatrixCell(notUpd,'','','NO','color:#b91c1c')
    +`</tr></tbody></table></div></div>`;
  kpiEl.innerHTML=html;
}
function huMatrixToggleUpd(v){
  const same=HU_MATRIX_FILTER&&!HU_MATRIX_FILTER.type&&!HU_MATRIX_FILTER.order&&HU_MATRIX_FILTER.upd===v;
  HU_MATRIX_FILTER=same?null:{type:'',order:'',upd:v};  huRender();
}
/* Drill-down for the Parts Pending / Approval / Ready chips. (Ravi 26-Jul-2026)
   These three showed a number but did nothing when tapped — three dead taps sitting
   next to three live ones, which is exactly why the summary felt broken. Tapping now
   filters the table to those vehicles; tapping the same chip again clears it. */
function huMatrixToggleGrp(g){
  const same=HU_MATRIX_FILTER&&HU_MATRIX_FILTER.grp===g;
  HU_MATRIX_FILTER=same?null:{type:'',order:'',upd:'',grp:g};
  huRender();
}

/* ===== VEHICLE DETAIL WINDOW (Ravi 08-Jul: "The vehicle on click should be able
   to see in next window") — tap the Reg No anywhere → full picture of that vehicle:
   identity, DMS state, our daily-review state, customer contact, requisition photo,
   and the complete day-wise history timeline. */
function huShowDetail(rowIdx){
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const reg=String(r[HU_COLS.reg]||'').trim().toUpperCase()||huGetVin(r)||'—';
  const days=r.__days>=0?r.__days+'d':'—';
  const dColor=r.__days>5?'#dc2626':r.__days>=2?'#d97706':'#16a34a';
  const curHS=huNormalizeDrs(r['Holdup Status']||'')||'Not Updated';
  const enriched=(HU_DATA_ENRICHED||[]).find(e=>e&&((huGetVin(r)&&e.vin===huGetVin(r))||(e.reg===reg)));
  const mob=enriched&&enriched.mob?String(enriched.mob).replace(/\D/g,''):'';
  const photo=huGetPhoto(r);
  let hist=[]; try{ hist=JSON.parse(r['Status History']||'[]'); }catch(e){}
  const kv=(l,v,style)=>`<div class="hu-dt-kv"><span>${l}</span><b style="${style||''}">${esc(v)||'—'}</b></div>`;
  document.getElementById('preview-title').textContent='Vehicle — '+reg;
  document.getElementById('preview-body').innerHTML=`
    <div class="hu-dt-head"><div><div class="hu-dt-reg">${esc(reg)}</div><div class="hu-dt-model">${esc(r[HU_COLS.model]||'')}</div></div>
      <span class="hu-dt-days" style="color:${dColor};border-color:${dColor}">${days}</span></div>
    <div class="hu-dt-grid">
      ${kv('JC Number',r[HU_COLS.jcNo])}${kv('JC Date',r[HU_COLS.date]?new Date(r[HU_COLS.date]).toLocaleDateString('en-IN'):'')}
      ${kv('JC Type (Category)',r[HU_COLS.type])}${kv('DMS Order Status',r[HU_COLS.status])}
      ${kv('Dealer',HU_CODE_MAP[String(r[HU_COLS.code]||'').trim()]||r[HU_COLS.code])}${kv('SA',HU_SA_MAP[String(r[HU_COLS.supervisor]||'').trim().toUpperCase()]||r[HU_COLS.supervisor])}
      ${kv('Daily Review Status',curHS,'color:'+huDrsColor(curHS))}${kv('ETA',r['Parts ETA'])}
      ${kv('Customer',enriched&&enriched.name?enriched.name:'')}${kv('Mobile',mob?'+91 '+mob:'')}
    </div>
    ${r['Remarks']?`<div class="hu-dt-rem">💬 ${esc(r['Remarks'])}</div>`:''}
    ${photo?`<div style="margin:10px 0"><div class="hu-dt-sec">📷 Requisition Slip</div><img src="${huDrivePhotoSrc(photo)}" style="max-width:100%;border-radius:8px;cursor:pointer" onclick="huViewPhoto(${rowIdx})"></div>`:''}
    <div class="hu-dt-sec">📅 Day-wise History (${hist.length})</div>
    ${hist.length?`<div class="hu-dt-hist">${hist.slice().reverse().map(h=>`<div class="hu-dt-hrow"><span class="hd">${esc(h.date)}</span><span class="hs" style="color:${huDrsColor(huNormalizeDrs(h.status))}">${esc(h.status)}</span>${h.eta?`<span class="he">ETA: ${esc(h.eta)}</span>`:''}${h.remarks?`<span class="hr">${esc(h.remarks)}</span>`:''}<span class="hb">${esc(h.by)}</span></div>`).join('')}</div>`:'<div style="color:var(--steel);font-size:12px">No updates recorded yet.</div>'}
    <div class="hu-dt-actions">
      ${mob?`<a class="btn sm" style="background:#16a34a;text-decoration:none" href="tel:+91${mob}">📞 Call</a>
      <a class="btn sm" style="background:#059669;text-decoration:none" target="_blank" href="https://wa.me/91${mob}?text=${encodeURIComponent('Dear Customer, update regarding your vehicle '+reg+' at Sehgal Hero Workshop: '+curHS+(r['Parts ETA']?' | Expected: '+r['Parts ETA']:''))}">🟢 WhatsApp</a>`:''}
      ${canEditHoldup()?`<button class="btn sm" onclick="document.getElementById('preview-modal').style.display='none';${window.innerWidth<=760?`huMobSheetOpen(${rowIdx})`:`huScrollToRow(${rowIdx})`}">✏️ Update</button>`:''}
      <button class="btn sm ghost" onclick="huShowHistory(${rowIdx})">📅 Full History</button>
    </div>`;
  document.getElementById('preview-modal').style.display='block';
}
function huScrollToRow(i){
  const tr=document.getElementById('hu-tr-'+i);
  if(tr){ tr.scrollIntoView({behavior:'smooth',block:'center'}); tr.style.outline='2px solid #2563eb'; setTimeout(()=>{ tr.style.outline=''; },2500); }
}
function huToggleRow(i, checked){
  if(checked) HU_SELECTED.add(i); else HU_SELECTED.delete(i);
  const tr=document.getElementById('hu-tr-'+i);
  if(tr) tr.className=tr.className.replace(/hu-selected/g,'').trim()+(checked?' hu-selected':'');
  huUpdateBulkBar();
}
function huToggleAll(checked){
  HU_ROWS_CURRENT.forEach((r,i)=>{ if(checked) HU_SELECTED.add(i); else HU_SELECTED.delete(i); const tr=document.getElementById('hu-tr-'+i); if(tr) tr.className=tr.className.replace(/hu-selected/g,'').trim()+(checked?' hu-selected':''); });
  huUpdateBulkBar();
}
function huClearSelection(){
  // #13: No automatic clear — this only runs when explicitly called
  HU_SELECTED.clear();
  document.querySelectorAll('.hu-excel-table input[type=checkbox]').forEach(cb=>cb.checked=false);
  document.querySelectorAll('.hu-excel-table tr.hu-selected').forEach(tr=>tr.classList.remove('hu-selected'));
  huUpdateBulkBar();
}

/* ===== REQUISITION PHOTOS ===== */
const HU_PHOTO_KEY_PREFIX='huphoto:';
function huDrivePhotoSrc(u){
  u=String(u||'');
  if(!u.startsWith('http')) return u;
  const m=u.match(/\/d\/([A-Za-z0-9_-]+)/)||u.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m?('https://drive.google.com/thumbnail?id='+m[1]+'&sz=w1600'):u;
}
/* ===== IN-APP PHOTO VIEWER (Ravi 15-Jul) — the AppSheet way ======================
   Photos open INSIDE the app: full-screen overlay, pinch-zoomable, no new tab and
   never a Google account picker. Load order: (1) device cache — instant on repeat
   views, this is how AppSheet feels fast; (2) direct Drive thumbnail (public files);
   (3) our backend photo_b64 proxy (works even for old, un-shared files).           */
const HERO_PHOTO_CACHE_PREFIX='sehgal_photo:';
function heroPhotoId(u){ const m=String(u||'').match(/\/d\/([A-Za-z0-9_-]+)/)||String(u||'').match(/[?&]id=([A-Za-z0-9_-]+)/); return m?m[1]:''; }
function heroPhotoCacheGet(id){ try{ return localStorage.getItem(HERO_PHOTO_CACHE_PREFIX+id); }catch(e){ return null; } }
function heroPhotoCachePut(id,dataUrl){
  try{
    // Keep at most 12 cached photos (LRU by insertion) to respect localStorage limits.
    const keys=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.indexOf(HERO_PHOTO_CACHE_PREFIX)===0) keys.push(k); }
    while(keys.length>=12){ localStorage.removeItem(keys.shift()); }
    localStorage.setItem(HERO_PHOTO_CACHE_PREFIX+id,dataUrl);
  }catch(e){}
}
function heroPhotoView(url,label){
  let ov=document.getElementById('hero-photo-ov');
  if(!ov){
    ov=document.createElement('div'); ov.id='hero-photo-ov';
    ov.style.cssText='position:fixed;inset:0;background:rgba(10,12,16,.96);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px';
    ov.innerHTML='<div id="hero-photo-cap" style="color:#cbd5e1;font-size:13px;font-weight:700;margin-bottom:8px"></div>'
      +'<div id="hero-photo-box" style="flex:1;width:100%;display:flex;align-items:center;justify-content:center;overflow:auto"></div>'
      +'<button style="margin-top:10px;padding:10px 26px;border-radius:10px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-weight:800" onclick="document.getElementById(\'hero-photo-ov\').style.display=\'none\'">✕ Close</button>';
    ov.addEventListener('click',function(ev){ if(ev.target===ov) ov.style.display='none'; });
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  document.getElementById('hero-photo-cap').textContent=label||'';
  const box=document.getElementById('hero-photo-box');
  box.innerHTML='<div style="color:#94a3b8;font-size:13px">Loading photo…</div>';
  const id=heroPhotoId(url);
  const show=(src)=>{ box.innerHTML='<img src="'+src+'" style="max-width:100%;max-height:100%;border-radius:10px" alt="">'; };
  const cached=id?heroPhotoCacheGet(id):null;
  if(cached){ show(cached); return; }
  // Try the direct public thumbnail; if Drive refuses (old un-shared file), fall
  // back to our backend proxy which reads the file server-side.
  const direct=id?('https://drive.google.com/thumbnail?id='+id+'&sz=w1600'):url;
  const probe=new Image();
  let settled=false;
  probe.onload=function(){ if(settled)return; settled=true; show(direct);
    try{ const c=document.createElement('canvas'); c.width=probe.naturalWidth; c.height=probe.naturalHeight; c.getContext('2d').drawImage(probe,0,0); heroPhotoCachePut(id,c.toDataURL('image/jpeg',0.7)); }catch(e){} };
  probe.onerror=function(){ if(settled)return; settled=true; heroPhotoProxy(id,url,show,box); };
  setTimeout(function(){ if(!settled){ settled=true; heroPhotoProxy(id,url,show,box); } },6000);
  probe.crossOrigin='anonymous';
  probe.src=direct;
}
function heroPhotoProxy(id,url,show,box){
  if(typeof jgetRaw!=='function'){ box.innerHTML='<a style="color:#93c5fd" href="'+url+'" target="_blank">Open photo</a>'; return; }
  jgetRaw('photo_b64',{id:id||'',url:url||''},function(res){
    if(res&&res.ok&&res.b64){ const src='data:'+(res.ct||'image/jpeg')+';base64,'+res.b64; show(src); if(id) heroPhotoCachePut(id,src); }
    else box.innerHTML='<div style="color:#94a3b8;font-size:13px">Could not load — <a style="color:#93c5fd" href="'+url+'" target="_blank">open in Drive</a><br><span style="font-size:11px">(photo_b64 needs the next backend deploy)</span></div>';
  },20000);
}
function huPhotoKey(r){ return HU_PHOTO_KEY_PREFIX+String(r[HU_COLS.jcNo]||'').trim()+'|'+String(r[HU_COLS.code]||'').trim(); }
function huGetPhoto(r){ 
  const serverUrl=String(r['Requisition Photo URL']||'').trim();
  if(serverUrl && serverUrl.startsWith('http')) return serverUrl;
  try{ return localStorage.getItem(huPhotoKey(r)); }catch(e){ return null; }
}
function huSetPhoto(r, dataUrl){ 
  try{ localStorage.setItem(huPhotoKey(r), dataUrl); }catch(e){}
  jpost({type:'upload_requisition_photo', jcNo:String(r[HU_COLS.jcNo]||'').trim(), 
    dealer:String(r[HU_COLS.code]||'').trim(), reg:String(r[HU_COLS.reg]||'').trim(), photoData:dataUrl}).catch(()=>{});
}

function huReqPhotoCell(r, i){
  const isPartCase=((r['Holdup Status']||'').toUpperCase().indexOf('PART')>-1||(r['Holdup Reason']||'').toUpperCase().indexOf('PNA')>-1);
  const photo=huGetPhoto(r);
  if(photo){
    const canDel=(typeof isTopMgmtUser==='function' && isTopMgmtUser());
    return `<img src="${huDrivePhotoSrc(photo)}" class="hu-req-thumb" onclick="huViewPhoto(${i})" title="Click to view full photo"><br><button class="hu-req-photo-btn has-photo" onclick="huUploadPhoto(${i})" style="font-size:10px;padding:2px 6px;margin-top:2px">📷 Change</button>${canDel?`<button class="hu-req-photo-btn" onclick="huDeletePhoto(${i})" title="Delete requisition photo (WM/GM/CEO only)" style="font-size:10px;padding:2px 6px;margin-top:2px;color:#dc2626;border-color:#fecaca">🗑</button>`:''}`;
  }
  // Per project note: the requisition-photo option must be available ALL the time —
  // not only after a parts status is saved (that link appeared too late). Parts cases
  // get a highlighted button so the missing slip stands out.
  return `<button class="hu-req-photo-btn${isPartCase?' has-photo':''}" onclick="huUploadPhoto(${i})" title="Upload requisition slip photo">📷${isPartCase?'<span style="font-size:9px;color:#dc2626;font-weight:800">!</span>':''}</button>`;
}
function huUploadPhoto(rowIdx){
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.capture='environment';
  inp.onchange=function(){
    const file=inp.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=function(e){
      huSetPhoto(r, e.target.result);
      huRenderPhotoGallery();
      huRender(); // refresh row to show thumbnail
      // RAVI 08-Jul: "Requisition should pop out immediately" — show the captured slip
      // full-screen the instant it's taken, so the WM/SA can verify it's readable
      // before moving on (a blurred slip discovered next morning is useless).
      const regLbl=String(r[HU_COLS.reg]||'').trim().toUpperCase()||huGetVin(r)||'';
      setTimeout(function(){ huViewPhotoByUrl(e.target.result, regLbl+'|'); }, 120);
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}
function huViewPhoto(rowIdx){
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const photo=huGetPhoto(r); if(!photo) return;
  const reg=String(r[HU_COLS.reg]||'');
  const canDel=(typeof isTopMgmtUser==='function' && isTopMgmtUser());
  document.getElementById('preview-title').textContent='Requisition Photo — '+reg;
  document.getElementById('preview-body').innerHTML=`<img src="${huDrivePhotoSrc(photo)}" style="max-width:100%;border-radius:8px"><div style="font-size:12px;color:var(--steel);margin-top:8px;text-align:center">${reg} · ${r[HU_COLS.model]||''}${String(photo).startsWith('http')?` · <a href="${photo}" target="_blank" style="color:#2563eb">Open in Drive</a>`:''}</div>${canDel?`<div style="text-align:center;margin-top:10px"><button class="btn sm" style="background:#dc2626" onclick="huDeletePhoto(${rowIdx});document.getElementById('preview-modal').style.display='none'">🗑 Delete Photo (WM/GM/CEO)</button></div>`:''}`;
  document.getElementById('preview-modal').style.display='block';
}
/* Per project note (Requisition addition / editable): requisition photos must be
   deletable — restricted to top management (WM / GM / CEO) per Ravi's latest scope.
   Photos live in this device's localStorage, so deletion is per-device. */
function huDeletePhoto(rowIdx){
  if(!(typeof isTopMgmtUser==='function' && isTopMgmtUser())){ alert('Only WM / GM / CEO can delete requisition photos.'); return; }// v11.1: server-side deletion can be added later
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const reg=String(r[HU_COLS.reg]||'')||huGetVin(r);
  if(!confirm('Delete the requisition photo for '+reg+'?\n\nThis removes it for ALL users (Parts Desk included). To replace instead, use 📷 Change.')) return;
  try{ localStorage.removeItem(huPhotoKey(r)); }catch(e){}
  if(String(r['Requisition Photo URL']||'').startsWith('http')){
    jpost({type:'delete_requisition_photo', jcNo:String(r[HU_COLS.jcNo]||'').trim(),
      dealer:String(r[HU_COLS.code]||'').trim(), reg:String(r[HU_COLS.reg]||'').trim(), empno:USER.empno, empname:USER.personName}).catch(()=>{});
  }
  r['Requisition Photo URL']='';
  try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
  huRenderPhotoGallery();
  huRender();
}

/* ===== WHATSAPP + EMAIL CUSTOMER ACTIONS ===== */
function huCustomerActionCell(r){
  const enriched=HU_DATA_ENRICHED&&HU_DATA_ENRICHED.find(e=>e&&(e.reg===String(r[HU_COLS.reg]||'').trim().toUpperCase()));
  const mob=enriched&&enriched.mob?String(enriched.mob).replace(/\D/g,''):'';
  const reg=String(r[HU_COLS.reg]||'');
  const model=String(r[HU_COLS.model]||'');
  const jcNo=String(r[HU_COLS.jcNo]||'');
  const jcDate=String(r[HU_COLS.date]||'');
  const reason=String(r['Holdup Reason']||r['Holdup Status']||'pending');
  const eta=String(r['Parts ETA']||'—');
  const waMsg=encodeURIComponent(`Dear Customer, your vehicle *${reg}* (${model}) is at *Sehgal Hero MotoCorp Workshop*, Chinchwad.\n\nJC No: ${jcNo}\nOpen Date: ${jcDate}\nStatus: ${reason}\nExpected ETA: ${eta}\n\nKindly acknowledge this message. For any queries call us.\n\n— Team Sehgal Autoriders`);
  const mailSubj=encodeURIComponent(`Vehicle Service Update — ${reg}`);
  const mailBody=encodeURIComponent(`Dear Customer,\n\nYour vehicle ${reg} (${model}) is currently at Sehgal Hero MotoCorp Workshop.\n\nJob Card No: ${jcNo}\nOpen Date: ${jcDate}\nCurrent Status: ${reason}\nExpected ETA: ${eta}\n\nKindly acknowledge this communication or contact us for further details.\n\nRegards,\nTeam Sehgal Autoriders\nChinchwad`);
  const waLink=mob?`https://wa.me/91${mob}?text=${waMsg}`:'#';
  return `<a href="${waLink}" target="_blank" class="hu-wa-btn wa" title="${mob?'WhatsApp: +91'+mob:'No mobile on file — open WhatsApp'}" ${!mob?'style="opacity:.4"':''}>🟢</a> <a href="mailto:?subject=${mailSubj}&body=${mailBody}" class="hu-wa-btn mail" title="Draft email to customer">✉</a>`;
}

/* ===== SOFT VALIDATION WARNING (#2) ===== */
function huSoftValidate(r, newStatus){
  const warns=[];
  if(newStatus.includes('Pending for Parts')&&!String(r['Remarks']||'').trim()) warns.push('Add order no / vendor in Remarks for Parts cases.');
  if(newStatus.includes('Vehicle Physically Delivered')) warns.push('This marks vehicle as physically delivered — confirm hand-over is complete.');
  if((newStatus.includes('Ready')||newStatus.includes('Delivered'))&&huIsPartStatus(String(r['Holdup Status']||''))) warns.push('Previous status was Parts Pending — confirm all parts issues are resolved first.');
  if(!warns.length) return;
  const el=document.getElementById('hu-soft-warn'), msg=document.getElementById('hu-sw-msg');
  if(!el||!msg) return;
  msg.textContent=warns.join(' | ');
  el.style.display='block';
  setTimeout(()=>{ if(el) el.style.display='none'; }, 8000);
}

/* ===== BAR CHART (#3, #9) ===== */
/* dead huRenderBarChart() removed 22-Jul-2026 (s15a). Live version is the window.huRenderBarChart override in a later patch block. */

/* ===== PHOTO GALLERY (#11) ===== */
/* dead huRenderPhotoGallery() removed 22-Jul-2026 (s15a). Live version is the window.huRenderPhotoGallery override in a later patch block. */
function huViewPhotoByUrl(dataUrl,label){
  document.getElementById('preview-title').textContent='Requisition Photo — '+label.split('|')[0];
  document.getElementById('preview-body').innerHTML=`<img src="${dataUrl}" style="max-width:100%;border-radius:8px">`;
  document.getElementById('preview-modal').style.display='block';
}


function huUpdateBulkBar(){
  const bar=document.getElementById('hu-bulk-bar');
  const cnt=document.getElementById('hu-bulk-count');
  if(!bar||!cnt) return;
  const n=HU_SELECTED.size;
  bar.className='hu-bulk-bar'+(n>0?' visible':'');
  cnt.textContent=n+' vehicle'+(n!==1?'s':'')+' selected';
}
function huBulkUpdateStatus(value){
  if(!value||!HU_SELECTED.size) return;
  HU_SELECTED.forEach(i=>{ huInlineUpdate(i,'status',value); });
  huRender();
}
function huBulkUpdateETA(value){
  if(!value||!HU_SELECTED.size) return;
  HU_SELECTED.forEach(i=>{ huInlineUpdate(i,'eta',value); });
  huRender();
}

/* Recompute and apply the faint-red Part/PNA highlight on just one row, instantly,
   right after an inline update — no full table re-render needed */
function huRefreshRowHighlight(rowIdx){
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const tr=document.getElementById('hu-tr-'+rowIdx); if(!tr) return;
  const isFlag=huIsPartStatus(r['Holdup Status']||'');
  tr.classList.toggle('hu-row-part-flag', isFlag);
}
let HU_ROWS_CURRENT=[];
function huReasonsFor(cat){
  let list=HU_REASONS.filter(r=>!r.type||r.type===cat).map(r=>r.reason);
  if(!list.length){
    list=cat==='Bodyshop'?['Ins.Approval awaited-Claim not intimated','Ins.Approval awaited-Claim intimated','Work not Started-Customer Approval Awaited','PNA-First Order under processing','PNA-Back order','Total Loss Declared by Insurance Company','WIP-Denting','WIP-Painting','WIP-Fitting','Vehicle ready-Not picked up by customer','NA']
      :['Delay due to claim Approval from MSIL','Work not Started-Customer Approval Awaited','Part not available-First Order under processing','Part not available-Back order','WIP-Engine/Transmission Repair','Vehicle ready-Not picked up by customer','Vehicle ready-Shifted to Bodyshop','NA'];
  }
  return list;
}
function huInlineSelect(rowIdx,field,current,customList){
  let opts;
  if(field==='status'){
    opts=['','PENDING_PARTS','PARTS_ORDERED','PARTS_RECEIVED','INSURANCE_PENDING','CUSTOMER_PENDING','WIP','READY','CLEAR'];
    return `<select style="font-size:10px;padding:3px;width:100px" onchange="huInlineUpdate(${rowIdx},'status',this.value)">`+
      opts.map(o=>`<option value="${o}" ${o===current?'selected':''}>${o||'Select…'}</option>`).join('')+`</select>`;
  }
  if(field==='eta'){
    opts=['','Today afternoon','Tomorrow morning','Day after tomorrow','3–4 days','Next week','Unknown / Checking'];
    return `<select style="font-size:10px;padding:3px;width:100px" onchange="huInlineUpdate(${rowIdx},'eta',this.value)">`+
      opts.map(o=>`<option value="${o}" ${o===current?'selected':''}>${o||'ETA…'}</option>`).join('')+`</select>`;
  }
  if(field==='reason'){
    opts=customList||[];
    return `<select style="font-size:10px;padding:3px;width:120px" onchange="huInlineUpdate(${rowIdx},'reason',this.value)">`+
      `<option value="">Reason…</option>`+opts.map(o=>`<option value="${o.replace(/"/g,'&quot;')}" ${o===current?'selected':''}>${o}</option>`).join('')+`</select>`;
  }
  return '';
}
function huShowHistory(rowIdx){
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const reg=String(r[HU_COLS.reg]||'')||huGetVin(r)||'Vehicle';
  let hist=[];
  try{ hist=JSON.parse(r['Status History']||'[]'); }catch(e){ hist=[]; }
  document.getElementById('preview-title').textContent='Status History — '+reg+' ('+hist.length+' entries)';
  const body=document.getElementById('preview-body');
  if(!hist.length){
    body.innerHTML='<div class="hint">No status updates recorded yet. Updates from this point will appear here, one entry per 10-minute window per user.</div>';
  } else {
    body.innerHTML='<div style="font-size:11px;color:var(--steel);margin-bottom:12px">Most recent first · Updates within 10 min by same user are merged into one entry</div>'+hist.slice().reverse().map(h=>`
      <div style="border-left:3px solid var(--signal);padding:8px 0 8px 12px;margin-bottom:10px;background:#fff;border-radius:0 6px 6px 0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:700;font-size:13px">${h.date||''}</div>
          ${h.merged>1?`<span style="font-size:9px;background:#f0fdf4;border:1px solid #86efac;border-radius:999px;padding:1px 7px;color:var(--ok);font-weight:700">${h.merged} edits merged</span>`:''}
        </div>
        <div style="font-size:12px;color:var(--ink);margin-top:4px;font-weight:600">${h.status||'—'}${h.reason?'<span style="color:var(--steel);font-weight:400"> · '+h.reason+'</span>':''}</div>
        ${h.eta?`<div style="font-size:11px;color:var(--steel);margin-top:2px">ETA: ${h.eta}</div>`:''}
        ${h.remarks?`<div style="font-size:11px;color:var(--steel)">Remarks: ${h.remarks}</div>`:''}
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">— ${h.by||'unknown'}</div>
      </div>`).join('');
  }
  document.getElementById('preview-modal').style.display='block';
}
function huInlineUpdate(rowIdx,field,value){
  const r=HU_ROWS_CURRENT[rowIdx]; if(!r) return;
  const reg=String(r[HU_COLS.reg]||'');
  const vin=huGetVin(r);
  const jcNo=String(r[HU_COLS.jcNo]||'');
  const dealerCode=String(r[HU_COLS.code]||'');
  if(!reg && !vin) return;
  // jcNo+dealerCode is the PRIMARY identifier sent — disambiguates the case where the
  // same vehicle has two job cards open at once (e.g. Service + Bodyshop)
  const payload={type:'update_holdup',reg,vin,jcNo,dealerCode,updatedBy:USER.personName};
  if(field==='status'){ value=huNormalizeDrs(value); payload.holdupStatus=value; r['Holdup Status']=value; huSoftValidate(r, value); }
  if(field==='reason'){ payload.holdupReason=value; r['Holdup Reason']=value; }
  if(field==='eta'){ payload.partsEta=value; r['Parts ETA']=value; }
  if(field==='remarks'){ payload.remarks=value; r['Remarks']=value; }
  // Stamp the update locally too — the "Not Updated Today" KPI reads this field, and
  // without a local stamp the updater's own screen kept counting the row as not updated
  // until the next backend hydrate (root cause of "even after updating, shows not updated")
  r['Parts Updated At']=new Date().toISOString();
  r['Parts Updated By']=USER.personName||USER.empno||'';
  // Optimistically append a history entry locally too, in the exact same shape the
  // backend writes — so the History modal is accurate immediately, without waiting
  // for a round-trip or a screen navigation to re-sync.
  try{
    let hist=[]; try{ hist=JSON.parse(r['Status History']||'[]'); }catch(e){ hist=[]; }
    hist.push({
      date:new Date().toLocaleString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',',''),
      status:r['Holdup Status']||'', reason:r['Holdup Reason']||'', eta:r['Parts ETA']||'', remarks:r['Remarks']||'',
      by:USER.personName||''
    });
    if(hist.length>50) hist=hist.slice(hist.length-50);
    r['Status History']=JSON.stringify(hist);
  }catch(e){}
  // r is the SAME object reference as inside HU_DATA (filter() returns references, not
  // copies), so this mutation is already reflected there — just need to persist it.
  try{ localStorage.setItem(HU_STORE_KEY, JSON.stringify(HU_DATA)); }catch(e){}
  huRefreshRowHighlight(rowIdx); // instant Part/PNA highlight update — no full re-render
  // RAVI 08-Jul FIX ("I have updated the holdup myself. the summary nos doesnot change"):
  // the summary/KPI area was only rebuilt on a full huRender — inline edits deliberately
  // avoid a full re-render (it would blow away input focus), so the numbers froze.
  // The row objects are live references into the summary set, so recomputing the summary
  // alone is cheap and makes every count (Updated Today, Parts, Ready, matrix cells)
  // move the moment a status/ETA/remark is saved.
  try{ if(HU_SUMMARY_ROWS) huRenderSummary(HU_SUMMARY_ROWS); }catch(e){}
  // Requisition-slip discipline: the moment anything PARTS-related is set on a vehicle
  // (status or reason mentioning parts/PNA) and there is no requisition photo yet,
  // prompt right away to attach the slip — offer to open the camera immediately.
  if((field==='status'||field==='reason') && huIsPartStatus(String(r['Holdup Status']||'')+' '+String(r['Holdup Reason']||'')) && !huGetPhoto(r)){
    setTimeout(function(){
      if(confirm('📷 Parts-related update saved for '+(reg||vin)+'.\n\nRequisition slip photo is NOT attached yet.\n\nUpload the requisition slip photo now?')){
        huUploadPhoto(rowIdx);
      }
    }, 150);
  }
  jpost(payload).catch(()=>{
    const msgEl=document.getElementById('hu-upload-info');
    if(msgEl){ msgEl.style.display='block'; msgEl.style.color='var(--signal-d)'; msgEl.textContent='⚠ Update for '+(reg||vin)+' may not have saved to the server — check connection.'; }
  });
}

function huOpenPartsUpdate(reg, rowIdx){
  const panel=document.getElementById('hu-parts-panel');
  const body=document.getElementById('hu-parts-body');
  if(!panel||!body) return;
  panel.style.display='block';
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});

  // Determine the JC type for this row so we show the right reason list
  const rowData=HU_DATA[rowIdx]||{};
  const jcType=String(rowData[HU_COLS.type]||'').trim(); // "Paid Service","FSC","General Repair","Accidental","PDI","Joyride"
  // Map to reason category: Accidental → Bodyshop, everything else → Service
  const reasonCat=(['Accidental'].includes(jcType))?'Bodyshop':'Service';
  const categoryLabel=reasonCat==='Bodyshop'?'Bodyshop / Accidental':'Service';

  // Filter HU_REASONS by type; fall back to all if table not loaded yet
  let filteredReasons=HU_REASONS.filter(function(r){ return !r.type||r.type===reasonCat; }).map(function(r){ return r.reason; });
  if(!filteredReasons.length){
    // Fallback hardcoded — always available even if master table not set up yet
    filteredReasons=reasonCat==='Bodyshop'?[
      'Ins.Approval awaited-Claim not intimated','Ins.Approval awaited-Claim intimated',
      'Ins.Approval awaited-Claim Under Investigation','Ins.Approval awaited-Com doc not submitted by customer',
      'Work not Started-Customer Approval Awaited','Work on hold-Manpower Shortfall/High Hold up',
      'Add work Identified: Suppl Claim approval awaited','Add Work identified: Cust approval awaited',
      'PNA-First Order under processing','PNA-Back order','PNA-Order yet to be placed to MSIL',
      'PNA-Suppl Order under process','Delay due to diagnosis of defect',
      'Total Loss Declared by Insurance Company','DO Awaited from Insurance company',
      'Ins Claim Rejected-Customer not Picking vehicle','Vehicle ready-Not picked up by customer',
      'WIP-Denting','WIP-Painting','WIP-Fitting','WIP-Mechanical Work',
      'Ready/Delivered-JC Closure problem in DMS','NA'
    ]:[
      'Delay due to claim Approval from MSIL','Work not Started-Customer Approval Awaited',
      'Work on hold-Manpower Shortfall/High Hold up','Delay due to diagnosis of defect',
      'Part not available-First Order under processing','Part not available-Back order',
      'Part not available-Order yet to be placed to MSIL','PNA-Suppl Order under process',
      'Add. work identified-Customer approval awaited','WIP-Additional work Approved by customer',
      'WIP-Engine/Transmission Repair','Ready/Delivered-JC Closure problem in DMS',
      'Vehicle ready-Not picked up by customer','Vehicle ready-Shifted to Bodyshop','NA'
    ];
  }

  const model=String(rowData[HU_COLS.model]||'');
  body.innerHTML=`
    <div style="font-weight:700;margin-bottom:4px">Update Holdup — ${reg} · ${model}</div>
    <div style="font-size:12px;color:var(--steel);margin-bottom:12px">Category: <strong>${categoryLabel}</strong> (JC Type: ${jcType||'Unknown'})</div>
    <div class="row2">
      <div class="fld"><label>Holdup Status</label>
        <select id="hup-status">
          <option value="">Select…</option>
          ${HU_DRS_OPTIONS.map(o=>`<option value="${o}">${o}</option>`).join('')}
        </select>
      </div>
      <div class="fld"><label>Reason</label>
        <select id="hup-reason">
          <option value="">Select reason…</option>
          ${filteredReasons.map(function(r){ return `<option>${r}</option>`; }).join('')}
        </select>
      </div>
    </div>
    <div class="fld"><label>Parts ETA</label>
      <select id="hup-eta">
        <option value="">Select ETA…</option>
        ${HU_ETA_OPTIONS.map(o=>`<option>${o}</option>`).join('')}
      </select>
    </div>
    <button class="btn" onclick="huSavePartsUpdate('${reg.replace(/'/g,"\\'")}')">Save Update</button>
    <button class="btn ghost" style="margin-top:8px" onclick="document.getElementById('hu-parts-panel').style.display='none'">Cancel</button>
    <div id="hup-msg" class="hint" style="margin-top:8px"></div>`;
}

function huSavePartsUpdate(reg){
  const msg=document.getElementById('hup-msg');
  const status=huNormalizeDrs(val('hup-status')), reason=val('hup-reason'), eta=val('hup-eta');
  if(!status){ msg.style.color='var(--signal-d)'; msg.textContent='Select a status.'; return; }
  msg.style.color='var(--steel)'; msg.textContent='Saving…';
  jpost({type:'update_holdup',reg,holdupStatus:status,holdupReason:reason,partsEta:eta,updatedBy:USER.personName}).then(()=>{
    msg.style.color='var(--ok)'; msg.textContent='Updated successfully.';
    setTimeout(()=>{ document.getElementById('hu-parts-panel').style.display='none'; clearMasterCache(); },1200);
    // Same requisition-slip discipline as inline edits: parts-related status saved
    // with no requisition photo on file → prompt to attach it immediately.
    if(huIsPartStatus(status+' '+reason)){
      const idx=(HU_ROWS_CURRENT||[]).findIndex(function(r){ return String(r[HU_COLS.reg]||'').trim().toUpperCase()===String(reg||'').trim().toUpperCase(); });
      if(idx>-1 && !huGetPhoto(HU_ROWS_CURRENT[idx])){
        setTimeout(function(){
          if(confirm('📷 Parts-related update saved for '+reg+'.\n\nRequisition slip photo is NOT attached yet.\n\nUpload the requisition slip photo now?')){
            huUploadPhoto(idx);
          }
        }, 1300);
      }
    }
  }).catch(()=>{ msg.style.color='var(--signal-d)'; msg.textContent='Could not save — check connection.'; });
}

function huPopulateFilter(id, vals, labelFn){
  const sel=document.getElementById(id); if(!sel) return;
  const cur=sel.value;
  const first=sel.options[0]; // the "All…" option
  sel.innerHTML=''; sel.appendChild(first);
  vals.sort().forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=labelFn?labelFn(v):v; sel.appendChild(o); });
  if(cur) sel.value=cur;
}

/* ================= CHANGE PASSWORD ================= */
function openChangePassword(){
  const m=document.getElementById('chgpass-modal');
  document.getElementById('cp-emp').value=USER.empno||'';
  document.getElementById('cp-old').value='';
  document.getElementById('cp-new').value='';
  document.getElementById('cp-conf').value='';
  document.getElementById('cp-msg').textContent='';
  m.style.display='block';
}
function cpSave(){
  const msg=document.getElementById('cp-msg');
  const emp=USER.empno||'', oldp=val('cp-old'), newp=val('cp-new'), conf=val('cp-conf');
  if(!oldp||!newp||!conf){ msg.style.color='var(--signal-d)'; msg.textContent='All fields required.'; return; }
  if(newp!==conf){ msg.style.color='var(--signal-d)'; msg.textContent='New passwords do not match.'; return; }
  if(newp.length<4){ msg.style.color='var(--signal-d)'; msg.textContent='New password must be at least 4 characters.'; return; }
  msg.style.color='var(--steel)'; msg.textContent='Saving…';
  jpost({type:'change_password',emp,oldPass:oldp,newPass:newp}).then(()=>{
    // no-cors means we can't read the response, so assume success if no error thrown
    msg.style.color='var(--ok)'; msg.textContent='Password changed successfully. Please log in again.';
    setTimeout(()=>{ document.getElementById('chgpass-modal').style.display='none'; logout(); },2000);
  }).catch(()=>{ msg.style.color='var(--signal-d)'; msg.textContent='Could not reach server — check connection.'; });
}

/* ================= ESTIMATE PREVIEW MODAL ================= */
function closePreview(){ document.getElementById('preview-modal').style.display='none'; }
function showEstimatePreview(est, reg, name, mob){
  document.getElementById('preview-title').textContent='Estimate — '+(reg||'');
  const body=document.getElementById('preview-body');
  if(!est){ body.innerHTML='<div class="hint">No estimate found for this vehicle yet.</div>'; document.getElementById('preview-modal').style.display='block'; return; }
  const mobClean=(mob||'').replace(/\D/g,'');
  const waLink=mobClean.length===10?`<a class="wa-btn" href="https://wa.me/91${mobClean}" target="_blank">💬 WhatsApp Customer</a>`:'';
  const items=est.items||{};
  const oilRows=(items.oil||[]).map(i=>`<div class="modal-row"><span class="k">${i.l}</span><span class="v">${i.free?'No charge':inr(i.p||0)}</span></div>`).join('');
  const partRows=(items.parts||[]).map(i=>`<div class="modal-row"><span class="k">${i.l}</span><span class="v">${i.free?'No charge':inr(i.p||0)}</span></div>`).join('');
  const labRows=(items.labour||[]).map(i=>`<div class="modal-row"><span class="k">${i.l}</span><span class="v">${i.free?'No charge':inr(i.p||0)}</span></div>`).join('');
  body.innerHTML=`
    <div class="modal-row"><span class="k">Customer</span><span class="v">${name||est.name||'—'}</span></div>
    <div class="modal-row"><span class="k">Model</span><span class="v">${est.model||'—'}</span></div>
    <div class="modal-row"><span class="k">Service</span><span class="v">${est.service||'—'}</span></div>
    <div class="modal-row"><span class="k">Advisor</span><span class="v">${est.empname||'—'}</span></div>
    ${oilRows}${partRows}${labRows}
    <div class="modal-row" style="margin-top:6px"><span class="k">Sub-total</span><span class="v">${inr(est.subtotal||0)}</span></div>
    ${est.discount>0?`<div class="modal-row"><span class="k">Discount</span><span class="v">−${inr(est.discount)}</span></div>`:''}
    <div class="modal-row"><span class="k">GST</span><span class="v">${inr(est.gst||0)}</span></div>
    <div class="modal-row" style="font-size:15px;font-weight:800"><span class="k">Total</span><span class="v" style="color:var(--ink)">${inr(est.total||0)}</span></div>
    ${waLink}`;
  document.getElementById('preview-modal').style.display='block';
}


/* ================= RAVI V12 ROLE + UX PATCHES ================= */
(function(){
  const STATE_CODES = new Set('AN AP AR AS BR CG CH DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD PB PY RJ SK TG TN TR TS UK UP WB'.split(' ')); // FIX: added TG (Telangana)
  window.raviEsc = function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); };
  window.raviNormalizeReg = function(v){ return String(v||'').toUpperCase().replace(/[\s\-]/g,'').trim(); };
  window.raviValidReg = function(v){
    const n=raviNormalizeReg(v);
    if(/^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(n)) return true; // FIX: accept Bharat (BH) series — gate entry was hard-blocking these vehicles
    if(!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(n)) return false; // FIX 15-Jul: exactly 4 trailing digits — 'MH21B4' style half-plates no longer pass
    return STATE_CODES.has(n.slice(0,2));
  };
  window.raviUserText = function(){
    return (((USER&&USER.designation)||'')+' '+((USER&&USER.level)||'')+' '+((USER&&USER.personName)||'')+' '+((USER&&USER.modules)||[]).join(' ')).toUpperCase();
  };
  /* ROOT-CAUSE FIX: designations in MD_Login are "Guard1", "Guard2", "SA2" etc.
     \bGUARD\b FAILS on "GUARD1" because a digit touching the word removes the
     word boundary — so isGuardUser() returned false and guards fell through to
     the full dashboard (estimates, holdup, everything). \d* after each keyword
     tolerates the numeric suffix. */
  window.isSAUser = function(){ return !!USER && /\b(SA\d*|SERVICE ADVISOR\d*|ADVISOR\d*)\b/.test(raviUserText()) && !/\b(WM\d*|GM\d*|CEO\d*|ADMIN|PARTS\d*|GUARD\d*)\b/.test(raviUserText()); };
  window.isGuardUser = function(){ return !!USER && /\b(GUARD\d*|SECURITY\d*|GATE\d*)\b/.test(raviUserText()) && !/\b(WM\d*|GM\d*|CEO\d*|ADMIN)\b/.test(raviUserText()); };
  window.isTopMgmtUser = function(){ return !!USER && (isAdmin() || /\b(CEO\d*|GM\d*|WM\d*|WORKSHOP MANAGER|GENERAL MANAGER|DEALERADMIN|SUPERADMIN)\b/.test(raviUserText())); };
  /* Employee numbers come back from Sheets as floats — 5004 arrives as "5004.0".
     (Ravi 26-Jul-2026) The same trap that broke the labour-rate lookup earlier.
     A plain string compare of "5004" against "5004.0" fails, so an SA's own
     estimates and holdup rows silently counted as somebody else's, and his Home
     tiles read 0. Every identity compare goes through this now. */
  window.raviEmpKey = function(v){
    let s=String(v==null?'':v).trim().toUpperCase();
    if(/^\d+\.0+$/.test(s)) s=s.replace(/\.0+$/,'');   // 5004.0 -> 5004
    return s;
  };
  window.raviAssignedToMe = function(r){
    if(!USER || !r) return false;
    const candidates = [
      r['Supervisor ID'], r['SA'], r['SA Name'], r['Service Advisor'], r['Advisor'],
      r['Estimate SA'], r['Prepared By'], r['Updated By']
    ].map(raviEmpKey).filter(Boolean);
    const myEmp = raviEmpKey(USER.empno);
    const myName = raviEmpKey(USER.personName);
    const mySaCodes = [];
    try{
      Object.entries(HU_SA_MAP||{}).forEach(([code,name])=>{ if(raviEmpKey(name)===myName) mySaCodes.push(raviEmpKey(code)); });
    }catch(e){}
    return candidates.some(c => c===myEmp || c===myName || mySaCodes.includes(c));
  };
  window.raviEstimateIsMine = function(e){
    if(!USER||!e) return false;
    const norm=s=>raviEmpKey(s).replace(/\s+/g,' ');
    const emp=norm(e.empno||e.empNo||e.EmpNo||e['Emp No']||e['SA Empno']);
    const name=norm(e.empname||e.empName||e.preparedBy||e.advisor||e.sa||e.SA||e['Prepared By']||e['Service Advisor']||e['SA Name']);
    return (!!emp && emp===norm(USER.empno)) || (!!name && name===norm(USER.personName));
  };
  window.raviRowsAllowedForUser = function(rows, wsField){
    rows=rows||[];
    return rows.filter(r=>wsAllowed(r[wsField]||r.location||r.ws||''));
  };

  const oldShowView = showView;
  window.showView = function(name){
    oldShowView(name);
    if(USER && name!=='login'){
      const roleEl=document.getElementById('who-role');
      if(roleEl) roleEl.textContent = USER.designation || USER.level || '';
      document.querySelectorAll('#whobox .navbtn').forEach(function(b){
        if((b.textContent||'').trim()==='🔒 Pwd') b.textContent='🔒 Password';
      });
    }
  };

  const oldCanUseModule = canUseModule;
  window.canUseModule = function(m){
    const cm=canonicalModule(m);
    if(cm==='HoldupMonitor' && isSAUser()) return true; // SA read-only own holdup view
    if(cm==='Targets' && (isSAUser() || isTopMgmtUser())) return true;
    if(cm==='Documents' && (isSAUser() || isTopMgmtUser())) return true;
    if((cm==='HoldupMonitor' || cm==='PartsDesk') && isPartsPerson()) return true; // Parts exec needs the parts-pending vehicle view
    return oldCanUseModule(m);
  };
  window.canEditHoldup = function(){
    return !!(USER && (isAdmin() || (!isSAUser() && hasModule('HoldupMonitor'))));
  };

  window.setHomeMode = function(mode){
    document.body.classList.toggle('compact-home', mode==='compact');
    document.querySelectorAll('.ops-view-btn').forEach(b=>b.classList.remove('active'));
    const btn=document.querySelector('.ops-view-btn[data-mode="'+mode+'"]');
    if(btn) btn.classList.add('active');
    try{ localStorage.setItem('sehgal_home_mode', mode); }catch(e){}
  };

  window.renderHomeTiles = function(){
    const nameEl=document.getElementById('hg-name-val');
    if(nameEl) nameEl.textContent=USER.personName||USER.empno||'there';
    const dateEl=document.getElementById('hg-date');
    function raviTickClock(){
      if(!dateEl) return;
      const now=new Date();
      dateEl.innerHTML=now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'<br><span style="font-size:14px;color:var(--steel)">'+now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</span>';
    }
    raviTickClock();
    if(window.__raviClockTimer) clearInterval(window.__raviClockTimer);
    window.__raviClockTimer=setInterval(raviTickClock,1000);
    const comfort=document.querySelector('.ops-view-btn:nth-child(1)'), compact=document.querySelector('.ops-view-btn:nth-child(2)');
    if(comfort){ comfort.dataset.mode='comfort'; comfort.onclick=function(){setHomeMode('comfort')}; }
    if(compact){ compact.dataset.mode='compact'; compact.onclick=function(){setHomeMode('compact')}; }
    try{ setHomeMode(localStorage.getItem('sehgal_home_mode')||'comfort'); }catch(e){}

    const isSA=isSAUser(), isGuard=isGuardUser();
    let defs=[
      {key:'GateEntry',id:'gate',ic:'🚗',tt:isGuard?'Gate Entry / My Entries':'Gate Entry',dd:isGuard?'Enter vehicle and review your entries today.':'New vehicle entry, customer & vehicle registration.',c:'#2563eb',bg:'#eff6ff',live:true,force:isGuard},
      // Reports moved OUT of the forms (Ravi 16-Jul): a form is a form. Registers and
      // history live on the home screen, where a report belongs.
      {key:'GateEntry',id:'gatehistory',ic:'📅',tt:'All Gate Entries — Month & Date wise',dd:'Every gate entry of every day. Month → date → vehicle → photos.',c:'#2563eb',bg:'#eff6ff',live:true,force:true},
      {key:'Estimate',id:'esthistory',ic:'📅',tt:'My Estimates — Month & Date wise',dd:'Your estimates of every day. Month → date → estimate → PDF/WhatsApp.',c:'#16a34a',bg:'#ecfdf5',live:true,force:isSA},
      {key:'Estimate',id:'estimate',ic:'📋',tt:isSA?'Estimate Preparation / My Estimates':'Estimate Preparation',dd:isSA?'Prepare estimates and resend PDF/WhatsApp any time today.':'Prepare, review & send estimates quickly.',c:'#16a34a',bg:'#ecfdf5',live:true},
      {key:'HoldupMonitor',id:'holdup',ic:'⛔',tt:isSA?'My Holdup Cases':'Holdup Monitor',dd:isSA?'Read-only status, ETA, history and customer update for your vehicles.':'Track holdup cases, reasons, ETA & status in real time.',c:'#dc2626',bg:'#fef2f2',live:true,force:isSA},
      {key:'Targets',id:'targets',ic:'🎯',tt:isSA?'My Targets':'Targets',dd:'Labour and load target tracking. More parameters can be added later.',c:'#0f766e',bg:'#f0fdfa',live:false,force:isSA||isTopMgmtUser()},
      {key:'BillingComparison',id:'billing',ic:'₹',tt:isSA?'My Estimates & Billing':'Estimates & Billing',dd:isSA?'All your estimates, actual billing done and your deviation %.':'All estimates of all dates + actual DMS billing comparison & deviation %.',c:'#7c3aed',bg:'#f5f3ff',live:true,force:isSA||isTopMgmtUser()},
      {key:'PartFinder',id:'partfinder',ic:'🔎',tt:'All-India Part Finder',dd:'Find any part across all Hero dealers. Nearest-first — tell the customer with confidence.',c:'#0891b2',bg:'#ecfeff',live:true,force:true},
      {key:'PartsDesk',id:'partsdesk',ic:'📦',tt:'Parts Desk',dd:'Parts-pending vehicles from Holdup — status, ETA & requisition photos.',c:'#0891b2',bg:'#ecfeff',live:true,force:isPartsPerson()},
      {key:'CRM',id:'crm',ic:'👥',tt:'Customer Actions',dd:'WhatsApp, email and follow-ups for assigned customers.',c:'#334155',bg:'#f1f5f9',live:false,force:isSA},
      {key:'ControlRoom',id:'control',ic:'📡',tt:'Top Management Control Room',dd:"Today's gate entries, estimates, billing and exceptions.",c:'#0f766e',bg:'#f0fdfa',live:true},
      {key:'MasterData',id:'master',ic:'🗂️',tt:'Master Data',dd:'Users, designations, levels, modules, models and dropdown masters.',c:'#475569',bg:'#f8fafc',live:true}
    ];
    if(isGuard){
      defs.push({key:'GateOut',id:'gateout',ic:'🏁',tt:'Gate Out',dd:'Mark vehicle exit — KM, remark and guard-wise out records.',c:'#dc2626',bg:'#fef2f2',live:true,force:true});
      // Guard sees ONLY what a guard needs — Gate Entry + Gate Out. Nothing else.
      defs=defs.filter(d=>d.id==='gate'||d.id==='gateout');
    }
    const visible=defs.filter(d=>d.force||canUseModule(d.key));
    const box=document.getElementById('home-tiles');
    if(!visible.length){ box.innerHTML='<div class="hint">No modules assigned to your login yet. Contact admin.</div>'; return; }
    box.innerHTML=visible.map(t=>`<div class="mod-tile ops ${t.live?'':'placeholder'}" style="--tile-c:${t.c};--tile-bg:${t.bg}" onclick="${t.live?`openModule('${t.id}')`:`placeholderToast('${raviEsc(t.tt).replace(/'/g,"\\'")}')`}"><div class="mt-ic">${t.ic}</div><div><div class="mt-tt">${t.tt}</div><div class="mt-dd">${t.dd}</div>${t.live?'':'<span class="mt-badge" style="background:#94a3b8">Coming Soon</span>'}</div><div class="mt-arrow">›</div></div>`).join('');
    renderQuickActions();
    const pp=document.getElementById('priority-panel'); if(pp) pp.style.display=(!isGuard&&(isTopMgmtUser()||canUseModule('ControlRoom')))?'block':'none';
    const snap=document.getElementById('holdup-snapshot'); if(snap) snap.style.display=(!isGuard&&canUseModule('HoldupMonitor'))?'block':'none';
    if(!isGuard){ loadPriorityPanel(); loadHoldupSnapshot(); }
    loadRecentActivity();
  };

  window.renderQuickActions = function(){
    const q=document.getElementById('quick-actions'); if(!q) return;
    // Guard doesn't need quick actions at all — hide the whole panel, keep the app light.
    const qPanel=q.closest('.ops-panel');
    if(isGuardUser()){ if(qPanel) qPanel.style.display='none'; q.innerHTML=''; return; }
    if(qPanel) qPanel.style.display='';
    let actions;
    if(typeof isPartsPerson==='function' && isPartsPerson() && !isTopMgmtUser()){
      actions=[
        {ok:true,ic:'📦',t:'Parts Desk',fn:"openModule('partsdesk')"},
        {ok:true,ic:'🧾',t:"Today's Estimates — Parts",fn:"raviOpenPartsEstimates()"},
        {ok:true,ic:'↻',t:'Sync Now',fn:"globalSyncNow()"}
      ];
    } else if(isSAUser()){
      actions=[
        {ok:true,ic:'📋',t:'Create Estimate',fn:"openModule('estimate')"},
        {ok:true,ic:'🧾',t:'My Estimates',fn:"raviOpenSaKpi('estimates')"},
        {ok:true,ic:'⛔',t:'My Holdup',fn:"openModule('holdup')"},
        {ok:true,ic:'🟢',t:'WhatsApp Customer',fn:"raviQuickCustomer('wa')"},
        {ok:true,ic:'✉️',t:'Email Customer',fn:"raviQuickCustomer('mail')"},
        {ok:true,ic:'☁️',t:'Upload Documents',fn:"raviOpenDocModal()"},
        {ok:true,ic:'🎯',t:'Targets',fn:"placeholderToast('Targets')"},
        {ok:true,ic:'↻',t:'Sync Now',fn:"globalSyncNow()"}
      ];
    } else {
      actions=[
        {ok:canUseModule('GateEntry'),ic:'🚗',t:'New Gate Entry',fn:"openModule('gate')"},
        {ok:canUseModule('Estimate'),ic:'📋',t:'Create Estimate',fn:"openModule('estimate')"},
        {ok:canUseModule('HoldupMonitor'),ic:'⛔',t:'Holdup Dashboard',fn:"openModule('holdup')"},
        {ok:canUseModule('ControlRoom'),ic:'📡',t:'Pending Work',fn:"openModule('control')"},
        {ok:true,ic:'🔧',t:'Check Backend',fn:"checkBackendVersion()"},
        {ok:true,ic:'↻',t:'Sync Now',fn:"globalSyncNow()"},
        {ok:true,ic:'☁️',t:'Upload Documents',fn:"raviOpenDocModal()"}
      ];
    }
    q.innerHTML=actions.map(a=>`<button class="ops-quick ${a.ok?'':'disabled'}" onclick="${a.ok?a.fn:'return false'}"><span class="qic">${a.ic}</span><span>${a.t}</span></button>`).join('');
  };

  /* Robust estimate total (Ravi 20-Jul): summaries showed ₹0 while the estimate opened
     inside showed the real value. The 'Total Estimate' value was coming through blank in
     the summary, so we read the total from any likely field, parse ₹/comma text, and if it
     is still blank, compute it from the parts + oil + labour + GST − discount the row has. */
  function esEntryTotal(e){
    if(!e) return 0;
    const num=v=>{ const n=Number(String(v==null?'':v).replace(/[₹,\s]/g,'')); return isNaN(n)?0:n; };
    let t=num(e.total)||num(e.grandTotal)||num(e['Total Estimate'])||num(e.totalEstimate);
    if(t>0) return t;
    const gst=num(e.gst||e.GST), disc=num(e.discount||e.Discount);
    const sub=num(e.subtotal||e.SubTotal||e['Sub-total']);
    if(sub>0) return Math.round(sub+gst-disc);
    const base=num(e.parts)+num(e.oil)+num(e.labour);
    if(base>0) return Math.round(base+gst-disc);
    return t;
  }

/* ═══ NO-FLICKER PANELS (Ravi 26-Jul-2026) ═══════════════════════════════════
   Ravi: "Why should the UI disappear from the app. It should quietly edit the nos
   in the background. The arithmetic, not the structure."
   Exactly right, and this is what was happening: every refresh threw away the whole
   tile row and wrote "Loading…" in its place, so the cards vanished and came back a
   second later. On a slow connection that gap was several seconds of empty screen.
   Three rules from now on:
     1. The card structure is built ONCE. After that only the number text changes.
     2. The last numbers are remembered per user, so on the next open the tiles are
        already there with yesterday's figures while today's are fetched behind them.
        You never look at an empty box.
     3. A failed refresh changes nothing on screen. The old numbers simply stay, with
        a small dot to say they are not fresh. It never wipes back to "Could not load". */
function heroKpiCacheKey(boxId){
  var who='';
  try{ who=String((USER&&(USER.empno||USER.personName))||''); }catch(e){}
  return 'hero_kpi:'+boxId+':'+who;
}
function heroKpiCardHtml(k){
  return '<div class="kpi-card ops" data-k="'+raviEsc(k.key)+'" style="--kpi-color:'+k.color+(k.click?';cursor:pointer':'')+'"'
    + (k.click?' onclick="'+k.click+'"':'') + '>'
    + '<div class="kpi-ic">'+k.ic+'</div>'
    + '<div class="kpi-n" data-n="1" title="'+raviEsc(k.n)+'">'+k.n+'</div>'
    + '<div class="kpi-t">'+k.t+'</div>'
    + '<div class="kpi-sub">'+k.sub+'</div></div>';
}
/* cards: [{key, ic, n, t, sub, color, click}]. Structure is rebuilt only when the SET
   of cards changes (role switch); otherwise just the numbers are written. */
function heroKpiPaint(boxId, cards, isStale){
  var box=document.getElementById(boxId); if(!box) return;
  cards=(cards||[]).map(function(k,i){ k.key=k.key||k.t||('k'+i); return k; });
  var sig=cards.map(function(k){ return k.key; }).join('|');
  if(box.getAttribute('data-sig')!==sig){
    box.innerHTML=cards.map(heroKpiCardHtml).join('');
    box.setAttribute('data-sig',sig);
  } else {
    cards.forEach(function(k){
      var card=box.querySelector('.kpi-card[data-k="'+String(k.key).replace(/"/g,'')+'"]');
      if(!card) return;
      var n=card.querySelector('[data-n]');
      if(n && n.textContent!==String(k.n)){ n.textContent=k.n; n.setAttribute('title',k.n); }
    });
  }
  box.classList.toggle('kpi-stale', !!isStale);
  if(!isStale){
    try{ localStorage.setItem(heroKpiCacheKey(boxId), JSON.stringify(cards)); }catch(e){}
  }
}
/* Draw last-known numbers instantly so the box is never empty while we fetch. */
function heroKpiFromCache(boxId){
  try{
    var raw=localStorage.getItem(heroKpiCacheKey(boxId));
    if(!raw) return false;
    var cards=JSON.parse(raw);
    if(!cards || !cards.length) return false;
    heroKpiPaint(boxId, cards, true);
    return true;
  }catch(e){ return false; }
}
/* Only fill a container if it is genuinely empty. Never overwrite real content with
   the word "Loading". */
function heroSoftPlaceholder(el, html){
  if(!el) return;
  var t=(el.textContent||'').trim();
  if(!t || /^Loading/i.test(t)) el.innerHTML=html;
}

  window.loadHomeStats = function(){
    const box=document.getElementById('home-stats');
    const upd=document.getElementById('ops-updated'); if(upd) upd.textContent='Last updated: Today '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    if(!box) return;
    // Show last-known figures at once. Never blank the row. (Ravi 26-Jul-2026)
    heroKpiFromCache('home-stats');
    /* C1 (17-Jul): guard home now uses ONE light call — home_summary — instead of
       report_today (full rows + photo URLs) plus gate_history (entire sheet, 12-32s,
       and a missing ok-check that printed a false 0 on timeout: the "0 vs 2" bug).
       home_summary returns only per-location counts: a few hundred bytes.
       On failure it shows "Could not load", never a fake 0. */
    if(isGuardUser()){
      jgetReliable('home_summary', {}, function(sres, sStale){
        // A failed refresh leaves the previous numbers exactly where they are.
        if(!sres || sres.ok===false){ box.classList.add('kpi-stale'); if(!sStale && !box.getAttribute('data-sig')) heroKpiPaint('home-stats',[{key:'x',ic:'\u26A0',n:'\u2014',t:'Could not load',sub:'Tap \u21bb Sync Now',color:'#64748b'}],true); return; }
        const mine=(sres.locations||[]).filter(L=>wsAllowed(L.location));
        const todayN=mine.reduce((s,L)=>s+Number(L.today||0),0);
        const allN=mine.reduce((s,L)=>s+Number(L.allDays||0),0);
        const cardsG=[
          {ic:'🚗',n:todayN,t:'Gate Entries Today',sub:'All guards combined · tap to view',color:'#2563eb',click:"raviOpenGateHistory()"},
          {ic:'📅',n:allN,t:'All Entries — All days',sub:'Every guard · tap to see by month & date',color:'#16a34a',click:"raviOpenGateHistory()"},
          {ic:'↻',n:getQueue().length,t:'Pending Sync',sub:'Offline saves waiting',color:'#7c3aed'}
        ];
        heroKpiPaint('home-stats', cardsG, !!sStale);
      });
      return;
    }
    jgetReliable('report_today', {}, function(res, isStale){
      // A failed refresh leaves the previous numbers exactly where they are.
      if(!res || res.ok===false){ box.classList.add('kpi-stale'); if(!isStale && !box.getAttribute('data-sig')) heroKpiPaint('home-stats',[{key:'x',ic:'\u26A0',n:'\u2014',t:'Could not load',sub:'Tap \u21bb Sync Now',color:'#64748b'}],true); return; }
      /* C1 (17-Jul): guard branch moved above to the light home_summary call — this
         callback now serves SA/WM/GM/CEO only. */
      let gates=raviRowsAllowedForUser(res.gateEntries||[],'location');
      let pending=raviRowsAllowedForUser(res.pending||[],'location');
      let est=raviRowsAllowedForUser(res.estimates||[],'ws');
      if(isSAUser()){
        est=est.filter(raviEstimateIsMine);
        // Today's gate queue remains only a reminder; it is not shown as all-workshop performance.
        pending=pending.filter(function(g){ return String(g.empno||'')===String(USER.empno||'') || String(g.sa||g.advisor||'').toUpperCase()===String(USER.personName||'').toUpperCase(); });
      }
      const estTotal=est.reduce((s,e)=>s+esEntryTotal(e),0);
      window.RAVI_TODAY_EST_CACHE=est; // today's estimates, already correctly filtered — reused by the instant 'My Estimates Today' tap (Ravi 21-Jul)
      // v11.1 stability fix: dedupe by JC+Dealer and drop delivered/clear so the count
      // can't fluctuate (75/90/123) between loads from stale or duplicated local rows.
      /* Counted through the ONE shared rule (huActiveRows), same as the priority
         panel, the snapshot and the Holdup screen. This block used to carry its own
         private copy of the dedupe/workshop logic, which is why the Home tile and
         the Holdup screen could show different numbers on the same phone. */
      let huRows=huActiveFromStore();
      if(isSAUser()) huRows=huRows.filter(raviAssignedToMe);
      const hu=huRows.length, appr=huRows.filter(r=>huIsApprovalStatus(huStatusText(r))).length;
      const billing = estTotal>=100000 ? (Math.round(estTotal/10000)/10)+' L' : inr(estTotal);
      let cards;
      if(typeof isPartsPerson==='function' && isPartsPerson() && !isTopMgmtUser()){
        // Parts login: only what a parts executive acts on. No gate/estimate-value/
        // approval totals — those belong to WM/GM/CEO views.
        // Same shared rule as every other panel — this branch previously skipped the
        // dedupe and the workshop filter entirely, so a parts executive saw a higher
        // parts figure on Home than on the Parts Desk he then opened.
        const partsPending=huActiveFromStore().filter(r=>huIsPartStatus(huStatusText(r))).length;
        cards=[
          {ic:'📦',n:partsPending,t:'Parts Pending Vehicles',sub:'Tap to open Parts Desk',color:'#0891b2',click:"openModule('partsdesk')"},
          {ic:'🧾',n:est.length,t:"Today's Estimates",sub:'Tap to see parts to issue',color:'#16a34a',click:"raviOpenPartsEstimates()"},
          {ic:'↻',n:getQueue().length,t:'Pending Sync',sub:'Offline saves waiting',color:'#7c3aed'}
        ];
      } else if(isSAUser()){
        cards=[
          {ic:'📋',n:est.length,t:'My Estimates Today',sub:'Prepared by me — tap to view',color:'#16a34a',click:"raviOpenSaKpi('estimates')"},
          {ic:'₹',n:billing,t:'My Estimate Value',sub:'Tap for day-wise value',color:'#7c3aed',click:"raviOpenSaKpi('estvalue')"},
          {ic:'⛔',n:hu,t:'My Holdup Cases',sub:'Tap to view — read-only',color:'#dc2626',click:"raviOpenSaKpi('holdup')"},
          {ic:'☑',n:appr,t:'My Pending Approvals',sub:'Warranty / insurance / customer',color:'#0891b2',click:"raviOpenSaKpi('approvals')"}
        ];
      } else {
        cards=[
          {ic:'🚗',n:gates.length,t:'Gate Entries Today',sub:'Tap to view — Live from Gate Entry',color:'#2563eb',click:"raviOpenGateHistory()"},
          {ic:'📋',n:pending.length,t:'Estimates Pending',sub:'Gate done, estimate pending · tap',color:'#16a34a',click:"openModule('control')"},
          {ic:'🧾',n:est.length,t:'Estimates Prepared',sub:'Tap to view — Saved today',color:'#f59e0b',click:"openModule('control')"},
          {ic:'₹',n:billing,t:'Estimate Value Today',sub:'Tap to view — value till now',color:'#7c3aed',click:"openModule('control')"},
          {ic:'⛔',n:hu,t:'Holdup Cases',sub:'Tap to view — Active DMS holdup',color:'#dc2626',click:"openModule('holdup')"},
          {ic:'☑',n:appr,t:'Pending Approvals',sub:'Warranty / insurance / customer · tap',color:'#0891b2',click:"openModule('holdup')"}
        ];
      }
      heroKpiPaint('home-stats', cards, !!isStale);
    });
  };

  window.loadSaDashboard = function(){
    // Keep whatever is on screen while refreshing. (Ravi 26-Jul-2026)
    const box=document.getElementById('sa-myest'); heroSoftPlaceholder(box,'<div class="hint">Loading…</div>');
    jgetReliable('report_today', {}, function(res, isStale){
      if(!box) return;
      if(!res || res.ok===false){ if(!isStale) box.innerHTML='<div class="hint" style="color:var(--signal-d)">Could not load — tap ↻ Sync Now if this persists.</div>'; return; }
      const mine=((res&&res.estimates)||[]).filter(raviEstimateIsMine);
      if(!mine.length){ box.innerHTML='<div class="hint">No estimates prepared by you yet today.</div>'; return; }
      box.innerHTML=(isStale?'<div class="hint" style="margin-bottom:6px">⏳ Refreshing…</div>':'')+
        mine.map((e,i)=>`<div class="ctlitem"><div><div class="big">${i+1}. ${raviEsc(e.reg||'')} · ${raviEsc(e.model||'')}</div>
        <div class="small">${raviEsc(e.name||'')} · ${raviEsc(e.service||'')} · ${inr(esEntryTotal(e))}</div>
        <div class="ravi-actions">
          <button onclick="raviUseExistingEstimate(${i},'view')">View</button>
          <button class="pdf" onclick="raviUseExistingEstimate(${i},'pdf')">Download PDF</button>
          <button class="wa" onclick="raviUseExistingEstimate(${i},'wa')">WhatsApp Text</button>
          <button class="wa" onclick="raviUseExistingEstimate(${i},'wapdf')">Send PDF</button>
        </div></div><div><span class="badge done">${inr(esEntryTotal(e))}</span></div></div>`).join('');
      window.RAVI_SA_EST_CACHE=mine;
    });
    const box2=document.getElementById('sa-myholdup'); if(!box2) return;
    try{
      // Shared rule, so this list length matches the "My Holdup Cases" tile above it.
      // It used to skip the dedupe, so the tile said one number and the list another.
      const mineHu=huActiveFromStore().filter(raviAssignedToMe);
      if(!mineHu.length){ box2.innerHTML='<div class="hint">No holdup vehicles currently assigned to you.</div>'; return; }
      box2.innerHTML=mineHu.slice(0,10).map((r,i)=>`<div class="ctlitem"><div><div class="big">${i+1}. ${raviEsc(r[HU_COLS.reg]||r['Reg No']||huGetVin(r)||'')} · ${raviEsc(r[HU_COLS.model]||r['Model']||'')}</div>
        <div class="small">${raviEsc(huNormalizeDrs(r['Holdup Status']||'')||'Not updated')} · ETA: ${raviEsc(r['Parts ETA']||'—')}</div></div>
        <div class="ravi-actions"><button onclick="openModule('holdup')">Open</button></div></div>`).join('');
    }catch(e){ box2.innerHTML="<div class='hint'>Upload today's Holdup file to see your assigned vehicles here.</div>"; }
  };

  function normalizeStoredEstimate(e){
    if(!e) return null;
    let items=e.items||{};
    if(typeof items==='string'){ try{ items=JSON.parse(items); }catch(err){ items={}; } }
    items.oil=items.oil||[]; items.parts=items.parts||[]; items.labour=items.labour||[];
    const pre=Number(e.pre||e.subtotal||e.SubTotal||0);
    const tax=Number(e.tax||e.gst||e.GST||0);
    const total=Number(e.total||e.grandTotal||0);
    return {
      id:e.id||e.estimateId||('EST'+Date.now().toString().slice(-7)), ts:Number(e.ts||Date.parse(e.date||e.time)||Date.now()),
      name:e.name||e.customer||'', mob:e.mob||e.mobile||'', reg:raviNormalizeReg(e.reg||''), model:e.model||'',
      fam:'', km:Number(e.km||0), mo:Number(e.mo||0), service:e.service||'', type:e.type||'', items:items,
      parts:Number(e.parts||0), oil:Number(e.oil||0), labour:Number(e.labour||0), pre:pre, disc:Number(e.discount||e.disc||0), tax:tax, total:total, floor:Number(e.floor||0)
    };
  }
  window.raviUseExistingEstimate = function(i, action){
    const e=(window.RAVI_SA_EST_CACHE||[])[i]; const d=normalizeStoredEstimate(e);
    if(!d){ alert('Estimate not found. Sync and try again.'); return; }
    const prev=ES.current;
    ES.current=d;
    if(action==='view'){ showEstimatePreview(Object.assign({}, e, {subtotal:d.pre,gst:d.tax,total:d.total,items:d.items,model:d.model,service:d.service,empname:USER.personName}), d.reg, d.name, d.mob); return; }
    if(action==='pdf'){ esDownloadPDF(); ES.current=prev; return; }
    if(action==='wa'){ esSendWAtext(); ES.current=prev; return; }
    if(action==='wapdf'){ esSharePDF().finally(()=>{ ES.current=prev; }); return; }
  };

  window.raviOpenDocModal = function(reg){
    const m=document.getElementById('ravi-doc-modal');
    if(!m){ alert('Document upload screen not loaded.'); return; }
    document.getElementById('ravi-doc-reg').value=reg?String(reg).toUpperCase():'';
    document.getElementById('ravi-doc-type').value='';
    document.getElementById('ravi-doc-purpose').value='';
    document.getElementById('ravi-doc-file').value='';
    document.getElementById('ravi-doc-msg').textContent='';
    m.style.display='flex';
  };
  window.raviCloseDocModal=function(){ const m=document.getElementById('ravi-doc-modal'); if(m) m.style.display='none'; };
  window.raviSaveDocUpload=function(){
    const reg=raviNormalizeReg(val('ravi-doc-reg')), typ=val('ravi-doc-type'), purpose=val('ravi-doc-purpose'), file=document.getElementById('ravi-doc-file').files[0], msg=document.getElementById('ravi-doc-msg');
    if(!reg||!typ){ msg.style.color='var(--signal-d)'; msg.textContent='Vehicle number and document type are required.'; return; }
    if(!file){ msg.style.color='var(--signal-d)'; msg.textContent='Select a file/photo.'; return; }
    msg.style.color='var(--steel)'; msg.textContent='Saving tag…';
    const reader=new FileReader();
    reader.onload=function(){
      const rec={type:'upload_document',reg,docType:typ,purpose,fileName:file.name,mime:file.type,size:file.size,dataUrl:reader.result,uploadedBy:USER.personName,empno:USER.empno,ws:USER.ws,ts:Date.now()};
      try{
        const arr=JSON.parse(localStorage.getItem('sehgal_doc_uploads')||'[]'); arr.unshift(rec); localStorage.setItem('sehgal_doc_uploads', JSON.stringify(arr.slice(0,100)));
      }catch(e){}
      jpost(rec).then(()=>{ msg.style.color='var(--ok)'; msg.textContent='Document tagged. It will sync when backend supports upload_document.'; setTimeout(raviCloseDocModal,900); });
    };
    reader.readAsDataURL(file);
  };

  window.raviCloseKpiModal=function(){ const m=document.getElementById('ravi-kpi-modal'); if(m) m.style.display='none'; };

  /* Parts login: today's estimates with the exact parts (and oil) to issue per vehicle,
     itemised from each estimate's saved breakup. This is the parts executive's work
     queue — SA prepares the estimate, parts person issues against it. */
  window.raviOpenPartsEstimates=function(){
    const modal=document.getElementById('ravi-kpi-modal'), body=document.getElementById('ravi-kpi-body'), title=document.getElementById('ravi-kpi-title');
    if(!modal||!body||!title) return;
    title.textContent="Today's Estimates — Parts to Issue";
    body.innerHTML='<div class="hint">Loading…</div>'; modal.style.display='block';
    jgetReliable('estimates_today', {}, function(res){
      if(!res || res.ok===false){ body.innerHTML='<div class="hint">Could not load — tap ↻ Sync Now if this persists.</div>'; return; }
      const arr=raviRowsAllowedForUser(res.entries||[], 'ws');
      if(!arr.length){ body.innerHTML='<div class="hint">No estimates prepared yet today.</div>'; return; }
      body.innerHTML=arr.map(function(e,i){
        const items=e.items||{};
        const parts=(items.parts||[]).concat(items.oil||[]);
        const partsHtml = parts.length
          ? '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px">'+parts.map(p=>`<tr style="border-top:1px solid var(--line)"><td style="padding:4px 2px">${raviEsc(p.l||'')}</td><td style="padding:4px 2px;text-align:right;font-family:'Roboto Mono';white-space:nowrap">${p.free?'No charge':inr(p.p||0)}</td></tr>`).join('')+'</table>'
          : '<div class="hint" style="margin-top:4px">No itemised parts saved for this estimate.</div>';
        return `<div class="ctlitem" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div><div class="big">${i+1}. ${raviEsc(e.reg||'')} · ${raviEsc(e.model||'')}</div>
            <div class="small">${raviEsc(e.service||'')} · SA: ${raviEsc(e.empname||'')} · Token ${raviEsc(e.token||'—')}</div></div>
            <span class="badge done">${parts.length} part${parts.length===1?'':'s'}</span>
          </div>${partsHtml}</div>`;
      }).join('');
    });
  };

  /* Estimates history — same pattern: months, then dates, then that day's
     estimates with their View / PDF / WhatsApp buttons. */
  function esHistDayItemsHtml(list){
    window.RAVI_SA_EST_CACHE=list;
    return list.map((e,i)=>`<div class="ctlitem"><div><div class="big">${i+1}. ${raviEsc(e.reg||'')} · ${raviEsc(e.model||'')}</div>
      <div class="small">${raviEsc(e.name||'')} · ${raviEsc(e.service||'')} · ${inr(e.total||0)}</div>
      <div class="ravi-actions">
        <button onclick="raviUseExistingEstimate(${i},'view')">View</button>
        <button class="pdf" onclick="raviUseExistingEstimate(${i},'pdf')">Download PDF</button>
        <button class="wa" onclick="raviUseExistingEstimate(${i},'wa')">WhatsApp Text</button>
        <button class="wa" onclick="raviUseExistingEstimate(${i},'wapdf')">Send PDF</button>
      </div></div><div><span class="badge done">${inr(e.total||0)}</span></div></div>`).join('');
  }
  window.esOpenMyEstHistory=function(){
    const m=heroModal(); if(!m.modal) return;
    m.title.textContent='My Estimates'; m.body.innerHTML='<div class="hint">Loading…</div>'; m.modal.style.display='block';
    jget('my_estimates_daywise', {empno:USER.empno, days:180}, function(res){
      if(!res || res.ok===false){ m.body.innerHTML='<div class="hint">Could not load. If this repeats, the backend needs a redeploy.</div>'; return; }
      window.ES_HIST_DAYS=(res.days||[]);
      if(!window.ES_HIST_DAYS.length){ m.body.innerHTML='<div class="hint">No estimates prepared by you yet.</div>'; return; }
      esHistShowMonths();
    });
  };
  window.esHistShowMonths=function(){
    const m=heroModal(); const days=window.ES_HIST_DAYS||[];
    const months=[], mIdx={};
    days.forEach(function(d){
      const t=new Date(d.dateKey);
      const mKey=isNaN(t.getTime())?String(d.dateKey||'').slice(0,7):(t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2));
      const mLbl=isNaN(t.getTime())?mKey:t.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
      if(!(mKey in mIdx)){ mIdx[mKey]=months.length; months.push({key:mKey,label:mLbl,days:[]}); }
      months[mIdx[mKey]].days.push(d);
    });
    window.ES_HIST_MONTHS=months;
    m.title.textContent='My Estimates — Months';
    m.body.innerHTML=months.map(function(mo,mi){
      const cnt=mo.days.reduce((s,d)=>s+(d.count||((d.estimates||[]).length)),0);
      const tot=mo.days.reduce((s,d)=>s+(+d.total||0),0);
      return '<div class="hero-drill-row" onclick="esHistShowDates('+mi+')"><div style="font-weight:800">🗓 '+raviEsc(mo.label)+'</div><div><span class="badge done">'+cnt+' · '+inr(tot)+'</span> ›</div></div>';
    }).join('');
  };
  window.esHistShowDates=function(mi){
    const m=heroModal(); const mo=(window.ES_HIST_MONTHS||[])[mi]; if(!mo) return;
    m.title.textContent=mo.label;
    m.body.innerHTML='<span class="hero-drill-back" onclick="esHistShowMonths()">‹ Back to months</span>'
      +mo.days.map(function(d,di){
        const t=new Date(d.dateKey);
        const lbl=isNaN(t.getTime())?String(d.dateKey||''):t.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'});
        return '<div class="hero-drill-row" onclick="esHistShowDay('+mi+','+di+')"><div style="font-weight:800">'+raviEsc(lbl)+'</div><div><span class="badge done">'+(d.count||((d.estimates||[]).length))+' · '+inr(d.total||0)+'</span> ›</div></div>';
      }).join('');
  };
  window.esHistShowDay=function(mi,di){
    const m=heroModal(); const mo=(window.ES_HIST_MONTHS||[])[mi]; const d=mo&&mo.days[di]; if(!d) return;
    const t=new Date(d.dateKey);
    m.title.textContent=mo.label+' · '+(isNaN(t.getTime())?String(d.dateKey||''):t.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'}));
    m.body.innerHTML='<span class="hero-drill-back" onclick="esHistShowDates('+mi+')">‹ Back to '+raviEsc(mo.label)+'</span>'
      +esHistDayItemsHtml(d.estimates||[]);
  };
  window.raviOpenSaKpi=function(kind){
    const modal=document.getElementById('ravi-kpi-modal'), body=document.getElementById('ravi-kpi-body'), title=document.getElementById('ravi-kpi-title');
    if(!modal||!body||!title) return;
    body.innerHTML='<div class="hint">Loading…</div>'; modal.style.display='block';
    if(kind==='estimates' || kind==='estvalue'){
      title.textContent = kind==='estvalue' ? 'My Estimate Value — Day-wise' : 'My Estimates — Today';
      jget('my_estimates_daywise', {empno:USER.empno, days:180}, function(res){
        const days=(res&&res.days)||[];
        if(!res || res.ok===false){ body.innerHTML='<div class="hint">Could not load. If this repeats, the backend needs a redeploy.</div>'; return; }
        if(!days.length){ body.innerHTML='<div class="hint">No estimates prepared by you yet.</div>'; return; }
        window.ES_HIST_DAYS=days;
        if(kind==='estimates'){
          const histBtn='<button class="btn ghost sm" style="width:100%;margin-bottom:8px" onclick="esHistShowMonths()">📅 All My Estimates — Month &amp; Date wise</button>';
          /* ARITHMETIC FIX (Ravi 26-Jul-2026): days[0] is the most recent day that HAS
             estimates — not necessarily today. The window was titled "My Estimates
             Today" and then listed an estimate from an earlier date, while the Home
             tile correctly counted today and showed 0. Top said 0, inside said 1.
             Now the date is checked and named honestly. */
          const todayKeyLocal=(function(){ const d=new Date(); const p=n=>String(n).padStart(2,'0');
            return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); })();
          const d0=days[0]||{};
          const d0key=String(d0.dateKey||d0.date||'').slice(0,10);
          const isToday=(d0key===todayKeyLocal);
          const list=(isToday && d0.estimates)||[];
          window.RAVI_SA_EST_CACHE=list;
          if(!list.length){
            const latest=(d0.estimates||[]).length;
            const note = latest
              ? '<div class="hint">No estimates prepared by you today.<br>Your most recent was on <b>'+raviEsc(d0key||'an earlier date')+'</b> ('+latest+').</div>'
              : '<div class="hint">No estimates prepared by you yet.</div>';
            body.innerHTML=histBtn+note; return;
          }
          body.innerHTML=histBtn+esHistDayItemsHtml(list);
        } else {
          body.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:13px">'+
            '<tr style="text-align:left;color:var(--steel);font-size:11px;text-transform:uppercase"><th style="padding:6px 4px">Date</th><th style="padding:6px 4px">Vehicles</th><th style="padding:6px 4px;text-align:right">Estimate Value</th></tr>'+
            days.map(d=>`<tr style="border-top:1px solid var(--line)"><td style="padding:6px 4px">${raviEsc(d.dateKey||'')}</td><td style="padding:6px 4px">${d.count}</td><td style="padding:6px 4px;text-align:right;font-family:'Roboto Mono'">${inr(d.total||0)}</td></tr>`).join('')+
            '</table>';
        }
      });
    } else if(kind==='holdup' || kind==='approvals'){
      title.textContent = kind==='approvals' ? 'My Pending Approvals' : 'My Holdup Cases';
      let rows=[]; try{ rows=JSON.parse(localStorage.getItem(HU_STORE_KEY)||'[]'); }catch(e){}
      rows=rows.filter(raviAssignedToMe).filter(r=>String(r['Holdup Status']||'').toUpperCase()!=='DELIVERED'&&String(r['Holdup Status']||'').toUpperCase()!=='CLEAR');
      if(kind==='approvals') rows=rows.filter(r=>huIsApprovalStatus(String(r['Holdup Status']||'')));
      if(!rows.length){ body.innerHTML='<div class="hint">'+(kind==='approvals'?'No pending approvals for your vehicles.':'No holdup vehicles currently assigned to you.')+'</div>'; return; }
      body.innerHTML=rows.map((r,i)=>`<div class="ctlitem"><div><div class="big">${i+1}. ${raviEsc(r[HU_COLS.reg]||r['Reg No']||huGetVin(r)||'')} · ${raviEsc(r[HU_COLS.model]||r['Model']||'')}</div>
        <div class="small">${raviEsc(huNormalizeDrs(r['Holdup Status']||'')||'Not updated')} · ETA: ${raviEsc(r['Parts ETA']||'—')}</div></div>
        <div class="ravi-actions"><button onclick="raviCloseKpiModal();openModule('holdup')">Open</button></div></div>`).join('');
    }
  };

  /* Gate history, AppSheet style (Ravi 15-Jul): first months. Tap a month, dates
     open. Tap a date, that day's entries open time-wise. Tap an entry, full detail
     with photos. Back link on every level. */
  window.GE_HIST=null;
  function heroModal(){ return {modal:document.getElementById('ravi-kpi-modal'), body:document.getElementById('ravi-kpi-body'), title:document.getElementById('ravi-kpi-title')}; }
  window.raviOpenGateHistory=function(){
    const m=heroModal(); if(!m.modal) return;
    m.title.textContent='All Gate Entries'; m.body.innerHTML='<div class="hint">Loading…</div>'; m.modal.style.display='block';
    jget('gate_history', {days:45}, function(res){
      if(!res || res.ok===false){ m.body.innerHTML='<div class="hint">Could not load. If this repeats, the backend needs a redeploy.</div>'; return; }
      const entries=res.entries||[];
      if(!entries.length){ m.body.innerHTML='<div class="hint">No gate entries yet.</div>'; return; }
      // Build months → dates → items
      const months=[], mIdx={};
      entries.forEach(function(g){
        const t=new Date(g.time);
        const mKey=isNaN(t.getTime())?'Unknown':(t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2));
        const mLbl=isNaN(t.getTime())?'Unknown':t.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
        const dKey=isNaN(t.getTime())?(g.dateKey||'—'):t.toISOString().slice(0,10);
        const dLbl=isNaN(t.getTime())?(g.dateKey||'—'):t.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'});
        if(!(mKey in mIdx)){ mIdx[mKey]=months.length; months.push({key:mKey,label:mLbl,dates:[],dIdx:{}}); }
        const mo=months[mIdx[mKey]];
        if(!(dKey in mo.dIdx)){ mo.dIdx[dKey]=mo.dates.length; mo.dates.push({key:dKey,label:dLbl,items:[]}); }
        mo.dates[mo.dIdx[dKey]].items.push(g);
      });
      window.GE_HIST=months;
      geHistShowMonths();
    });
  };
  window.geHistShowMonths=function(){
    const m=heroModal(); m.title.textContent='All Gate Entries — Months';
    m.body.innerHTML=(window.GE_HIST||[]).map(function(mo,mi){
      const total=mo.dates.reduce((s,d)=>s+d.items.length,0);
      return '<div class="hero-drill-row" onclick="geHistShowDates('+mi+')"><div style="font-weight:800">🗓 '+raviEsc(mo.label)+'</div><div><span class="badge done">'+total+' entries</span> ›</div></div>';
    }).join('');
  };
  window.geHistShowDates=function(mi){
    const m=heroModal(); const mo=window.GE_HIST[mi]; if(!mo) return;
    m.title.textContent=mo.label;
    m.body.innerHTML='<span class="hero-drill-back" onclick="geHistShowMonths()">‹ Back to months</span>'
      +mo.dates.map(function(d,di){
        return '<div class="hero-drill-row" onclick="geHistShowDay('+mi+','+di+')"><div style="font-weight:800">'+raviEsc(d.label)+'</div><div><span class="badge done">'+d.items.length+'</span> ›</div></div>';
      }).join('');
  };
  window.geHistShowDay=function(mi,di){
    const m=heroModal(); const mo=window.GE_HIST[mi]; const d=mo&&mo.dates[di]; if(!d) return;
    m.title.textContent=mo.label+' · '+d.label;
    window.GE_HIST_DAY=d.items;
    m.body.innerHTML='<span class="hero-drill-back" onclick="geHistShowDates('+mi+')">‹ Back to '+raviEsc(mo.label)+'</span>'
      +d.items.map(function(g,idx){
        const tt=new Date(g.time); const timeStr=isNaN(tt.getTime())?'':tt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
        const mine=String(g.empno||'')===String((USER&&USER.empno)||'');
        return '<div class="ctlitem" style="cursor:pointer;flex-direction:column;align-items:stretch" onclick="geHistToggle('+idx+')">'
          +'<div style="display:flex;justify-content:space-between;align-items:center"><div><div class="big">'+raviEsc(timeStr)+' · '+raviEsc(g.token||'')+' '+raviEsc(g.reg||'')+'</div>'
          +'<div class="small">'+raviEsc(g.model||'')+' · '+raviEsc(g.name||'—')+' · 📍'+raviEsc(g.location||'')+'</div></div>'
          +'<span class="badge '+(mine?'done':'')+'" style="font-size:10px">'+(mine?'Me':raviEsc(g.guard||g.empname||''))+'</span></div>'
          +'<div id="ge-histdetail-'+idx+'" style="display:none;margin-top:8px;border-top:1px dashed var(--line);padding-top:8px;font-size:12px"></div></div>';
      }).join('');
  };
  window.geHistToggle=function(idx){
    const box=document.getElementById('ge-histdetail-'+idx); if(!box) return;
    if(box.style.display!=='none'){ box.style.display='none'; return; }
    const g=(window.GE_HIST_DAY||[])[idx]; if(!g) return;
    box.innerHTML=geEntryDetailHtml(g);
    box.style.display='block';
  };

  window.raviQuickCustomer=function(kind){
    const reg=prompt('Enter Registration No / customer mobile / customer email to continue:');
    if(!reg) return;
    if(kind==='wa'){
      const n=reg.replace(/\D/g,'').slice(-10);
      if(n.length===10){
        // window.open() gets blocked by many mobile browsers when the call isn't a
        // direct tap handler (this comes after a prompt()). Anchor-click with a
        // location.href fallback opens the WhatsApp app reliably — same fix as the
        // Holdup module's WA button.
        const waLink='https://wa.me/91'+n;
        const a=document.createElement('a'); a.href=waLink; a.target='_blank'; a.rel='noopener';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ try{ location.href=waLink; }catch(e){} }, 400);
      } else alert('Open vehicle in My Estimates / My Holdup to WhatsApp the linked customer.');
    }else{
      if(reg.includes('@')) location.href='mailto:'+reg; else alert('Open vehicle in My Estimates / My Holdup to email the linked customer.');
    }
  };

  const oldOpenModule = openModule;
  window.openModule = function(id){
    if(id==='targets'){ placeholderToast('Targets'); return; }
    if(id==='gateout'){ goBoot(); showView('gateout'); return; }
    if(id==='billing'){ blBoot(); showView('billing'); return; }
    if(id==='partfinder'){ pfBoot(); showView('partfinder'); return; }
    if(id==='holdup' && isSAUser()){ huBoot(); showView('holdup'); return; }
    if(id==='partsdesk'){ huBoot(); showView('holdup'); return; } // Parts Desk = parts-filtered Holdup (HU_IS_PARTS_PERSON auto-restricts)
    oldOpenModule(id);
  };

  const oldEsLoadGateEntries = esLoadGateEntries;
  window.esLoadGateEntries = function(){
    // PICK PERSISTENCE (Ravi 15-Jul): the background refresh was rebuilding the
    // dropdown mid-estimate and showing "Select vehicle…" again. While a vehicle
    // is picked, the list simply does not reload — it refreshes on New Estimate.
    if(ES && (ES.gateId||ES.token)){ return; }
    oldEsLoadGateEntries();
  };

  // Capture the gate picker before the old anonymous listener. This preserves selection
  // and warns when a later token is selected before older pending tokens.
  const gatePick=document.getElementById('es-gate-pick');
  function raviHandleGatePick(sel){
    const i=sel.value;
    if(i===''){ if(typeof esNewEstimate==='function') esNewEstimate(); else { ES.gateId=''; if(typeof esApplyPickLock==='function') esApplyPickLock(); } return; }
    const g=ES_GATE_ENTRIES[+i]; if(!g) return;
    if(+i>0){
      const earlier=ES_GATE_ENTRIES.slice(0,+i).map(x=>(x.token?x.token+' · ':'')+(x.reg||'')+' '+(x.model||'')).join('\n');
      if(!confirm('Earlier pending token(s) are still not estimated:\n\n'+earlier+'\n\nYou can continue, but check why the earlier vehicle is skipped. Continue with this vehicle?')){
        sel.value=''; if(typeof esNewEstimate==='function') esNewEstimate(); else { ES.gateId=''; if(typeof esApplyPickLock==='function') esApplyPickLock(); } return;
      }
    }
    // Full pick logic lives in ONE place now — form reveal, photos, service type,
    // model change event (labour reload), DOS fetch, SA model confirm.
    esOnGatePick(g);
    raviShowRegHelp('es-reg');
  }
  if(gatePick){
    gatePick.onchange=null;
    gatePick.addEventListener('change', function(ev){
      ev.stopImmediatePropagation();
      raviHandleGatePick(this);
    }, true);
  }

  function probableRegs(reg){
    const n=raviNormalizeReg(reg); if(!n) return [];
    const pool=[];
    try{ (JSON.parse(localStorage.getItem(HU_STORE_KEY)||'[]')||[]).forEach(r=>{ const x=raviNormalizeReg(r[HU_COLS.reg]||r['Reg No']||''); if(x) pool.push(x); }); }catch(e){}
    try{ const last=getLastGood('report_today',{}); ((last&&last.gateEntries)||[]).forEach(g=>{ const x=raviNormalizeReg(g.reg||''); if(x) pool.push(x); }); ((last&&last.estimates)||[]).forEach(g=>{ const x=raviNormalizeReg(g.reg||''); if(x) pool.push(x); }); }catch(e){}
    const unique=[...new Set(pool)];
    function score(a,b){ let s=0; for(let i=0;i<Math.min(a.length,b.length);i++) if(a[i]===b[i]) s++; if(a.slice(-4)===b.slice(-4)) s+=4; if(a.slice(0,4)===b.slice(0,4)) s+=3; return s; }
    return unique.map(x=>({x,score:score(n,x)})).filter(o=>o.score>=Math.max(5,Math.min(n.length,8))).sort((a,b)=>b.score-a.score).slice(0,5).map(o=>o.x);
  }

  const oldEsGenerate=esGenerate;
  window.esGenerate=function(){
    const reg=raviNormalizeReg(val('es-reg'));
    const msg=document.getElementById('es-msg');
    if(reg){
      document.getElementById('es-reg').value=reg;
      if(!raviValidReg(reg)){
        const probs=probableRegs(reg);
        const ptxt=probs.length?'\n\nProbable matching numbers:\n'+probs.join('\n'):'';
        if(!confirm('Please check registration number before generating estimate.\n\nEntered: '+reg+'\n\nIt does not look like a valid Indian registration number.'+ptxt+'\n\nContinue anyway?')){
          if(msg){ msg.style.color='var(--signal-d)'; msg.textContent='Estimate not generated. Correct registration number first.'; }
          return;
        }
      } else {
        const probs=probableRegs(reg).filter(x=>x!==reg);
        if(probs.length && !confirm('Registration number check:\n\nEntered: '+reg+'\n\nSimilar numbers found in today/Holdup records:\n'+probs.join('\n')+'\n\nPlease compare with uploaded gate photo / vehicle plate. Continue?')) return;
      }
    }
    oldEsGenerate();
  };
  const oldEsNewEstimate=esNewEstimate;
  window.esNewEstimate=function(){
    oldEsNewEstimate();
    ES.gateId=''; ES.token=''; ES.location='';
    const sel=document.getElementById('es-gate-pick'); if(sel) sel.value='';
    if(typeof esApplyPickLock==='function') esApplyPickLock(); // compulsory pick returns
    try{ esLoadGateEntries(); }catch(e){} // list refresh happens here, never mid-estimate
  };

  function attachRegHelpers(){
    ['ge-reg','es-reg'].forEach(id=>{
      const el=document.getElementById(id); if(!el||el.dataset.raviRegAttached) return;
      el.dataset.raviRegAttached='1';
      el.addEventListener('input',function(){ const old=this.value; const n=raviNormalizeReg(old); if(old!==n) this.value=n; raviShowRegHelp(id); });
      el.addEventListener('blur',function(){ this.value=raviNormalizeReg(this.value); raviShowRegHelp(id); });
      const help=document.createElement('div'); help.className='reg-help'; help.id=id+'-help'; el.parentNode.appendChild(help);
    });
  }
  window.raviShowRegHelp=function(id){
    const el=document.getElementById(id), h=document.getElementById(id+'-help'); if(!el||!h) return;
    const n=raviNormalizeReg(el.value);
    if(!n){ h.textContent=''; h.className='reg-help'; return; }
    h.textContent = raviValidReg(n) ? 'Normalized: '+n : 'Please enter a valid Indian vehicle registration number.';
    h.className='reg-help '+(raviValidReg(n)?'':'bad');
  };
  attachRegHelpers();

  const oldGeSaveEntry=geSaveEntry;
  window.geSaveEntry=function(){
    const reg=raviNormalizeReg(val('ge-reg'));
    document.getElementById('ge-reg').value=reg;
    if(!raviValidReg(reg)){
      const msg=document.getElementById('ge-msg'); if(msg){ msg.style.color='var(--signal-d)'; msg.textContent='Please enter a valid Indian vehicle registration number.'; }
      raviShowRegHelp('ge-reg');
      return;
    }
    oldGeSaveEntry();
  };

  // Holdup read-only / role-filter wrapper
  const oldHuRender=huRender;
  window.huRender=function(){
    const view=document.getElementById('view-holdup');
    // Rule (Ravi 16-Jul): an SA is a Sehgal employee — he sees ALL gate entries,
    // but ONLY his own estimates and ONLY his own holdup. Same scoping rule as the
    // estimate register (blIsScoped), so the two can never drift apart.
    const restrict = isSAUser() && !isTopMgmtUser() && !isAdmin();
    if(view) view.classList.toggle('readonly-holdup', restrict || !canEditHoldup());
    if(restrict){
      const original=HU_DATA;
      HU_DATA=original.filter(raviAssignedToMe);
      try{ oldHuRender(); } finally { HU_DATA=original; }
    } else {
      oldHuRender();
    }
    raviMarkActiveHoldupFilters();
  };

  window.raviMarkActiveHoldupFilters=function(){
    const ids=['hu-f-code','hu-f-type','hu-f-status','hu-f-sa','hu-f-days','hu-f-search'];
    let chips=[];
    ids.forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      const active = id==='hu-f-search' ? !!String(el.value||'').trim() : !!el.value;
      el.classList.toggle('ravi-filter-active', active);
      if(active){
        const label=(el.options&&el.selectedIndex>=0)?el.options[el.selectedIndex].textContent:el.value;
        chips.push('<span class="chipf">'+raviEsc(label)+'</span>');
      }
    });
    if(HU_DRS_FILTER){ chips.push('<span class="chipf">Status: '+raviEsc(HU_DRS_FILTER.name)+'</span>'); }
    const del=document.getElementById('hu-f-delivered');
    if(del && del.checked){ chips.push('<span class="chipf">Delivered visible</span>'); }
    let bar=document.getElementById('hu-active-filters');
    const filters=document.getElementById('hu-filters');
    if(filters && !bar){ bar=document.createElement('div'); bar.id='hu-active-filters'; bar.className='hu-active-filters'; filters.parentNode.insertBefore(bar, filters.nextSibling); }
    if(bar){ bar.className='hu-active-filters '+(chips.length?'show':''); bar.innerHTML=chips.length?'<span>Active filters:</span>'+chips.join('')+'<button class="navbtn" style="padding:4px 8px" onclick="raviClearHoldupFilters()">Clear</button>':''; }
  };
  window.raviClearHoldupFilters=function(){
    ['hu-f-code','hu-f-type','hu-f-status','hu-f-sa','hu-f-days'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const s=document.getElementById('hu-f-search'); if(s) s.value='';
    const d=document.getElementById('hu-f-delivered'); if(d) d.checked=false;
    HU_SA_FILTER='ALL'; HU_DRS_FILTER=null; huRender();
  };

  window.huRenderBarChart=function(rows){
    const el=document.getElementById('hu-bar-chart'); if(!el) return;
    if(!rows||!rows.length){ el.innerHTML='<div style="font-size:12px;color:var(--steel)">No data</div>'; return; }
    const groups={
      'Not Allocated':['Not Allocated','UNREGISTERED','GATE_MATCHED','Not Set'],
      'Work In Progress':['Work In Progress','WIP'],
      'Diagnosis Pending':['Diagnosis Pending'],
      'Parts Pending':['Major Work - Parts Available','Major Work - Pending for Parts','Minor Job - Pending for Parts','Minor Work - Pending for Parts','PENDING_PARTS','PARTS_ORDERED','PARTS_RECEIVED'],
      'Warranty Approval':['Warranty Approval','Warranty Approval Pending'],
      'Insurance Approval':['Insurance Approval','Insurance Approval Pending','INSURANCE_PENDING'],
      'Customer Approval':['Additional Approval from Customer','Additional Approval from Customer Pending','CUSTOMER_PENDING'],
      'Ready / Not Delivered':['Ready - Not Picked Up by Customer','Ready - DMS Billing Issue','Ready - Not Picked by Customer','Vehicle Physically Delivered - JC Closure Pending','READY','CLEAR'],
      'Shifted':['Shifted to Bodyshop / Service'],
      'Other':['Other - See Remarks']
    };
    const palette={'Not Allocated':'#9ca3af','Work In Progress':'#2563eb','Diagnosis Pending':'#d97706','Parts Pending':'#b91c1c','Warranty Approval':'#7c3aed','Insurance Approval':'#4f46e5','Customer Approval':'#0891b2','Ready / Not Delivered':'#16a34a','Shifted':'#92400e','Other':'#6b7280'};
    const counts={}; Object.keys(groups).forEach(g=>counts[g]=0);
    rows.forEach(r=>{
      const s=huNormalizeDrs(r['Holdup Status']||'Not Set'); let found=false;
      Object.entries(groups).forEach(([g,vals])=>{ if(!found && vals.some(v=>v.toLowerCase()===s.toLowerCase())){ counts[g]++; found=true; } });
      if(!found) counts['Other']++;
    });
    const sorted=Object.entries(counts).filter(e=>e[1]>0).sort((a,b)=>b[1]-a[1]);
    const max=Math.max(...sorted.map(e=>e[1]),1), maxH=70;
    el.innerHTML=sorted.map(([g,n])=>`<div class="hu-bar-item" title="${g}: ${n} vehicles" onclick="raviFilterHoldupBar('${g.replace(/'/g,"\\'")}')"><span class="hu-bar-n">${n}</span><div class="hu-bar" style="height:${Math.max(4,Math.round(n/max*maxH))}px;background:${palette[g]||'#6b7280'}"></div><span class="hu-bar-label">${g}</span></div>`).join('');
  };
  window.raviFilterHoldupBar=function(group){
    // FIX: filter on Daily Review Status directly (old code set the Order Status dropdown to a value it never contained)
    const map={
      'Not Allocated':['Not Allocated','UNREGISTERED','GATE_MATCHED','Not Set'],
      'Work In Progress':['Work In Progress','WIP'],
      'Diagnosis Pending':['Diagnosis Pending'],
      'Parts Pending':['Major Work - Parts Available','Major Work - Pending for Parts','Minor Job - Pending for Parts','Minor Work - Pending for Parts','PENDING_PARTS','PARTS_ORDERED','PARTS_RECEIVED'],
      'Warranty Approval':['Warranty Approval','Warranty Approval Pending'],
      'Insurance Approval':['Insurance Approval','Insurance Approval Pending','INSURANCE_PENDING'],
      'Customer Approval':['Additional Approval from Customer','Additional Approval from Customer Pending','CUSTOMER_PENDING'],
      'Ready / Not Delivered':['Ready - Not Picked Up by Customer','Ready - DMS Billing Issue','Ready - Not Picked by Customer','Vehicle Physically Delivered - JC Closure Pending','READY','CLEAR'],
      'Shifted':['Shifted to Bodyshop / Service'],
      'Other':['Other - See Remarks','Other Remarks']
    };
    if(HU_DRS_FILTER && HU_DRS_FILTER.name===group){ HU_DRS_FILTER=null; } // tap same bar again = clear
    else if(map[group]) HU_DRS_FILTER={name:group, vals:map[group]};
    huRender();
  };

  // Better photo gallery labels: include vehicle, model, update timestamp and gate/estimate hint when available.
  window.huRenderPhotoGallery=function(){
    const el=document.getElementById('hu-photo-gallery'); const countEl=document.getElementById('hu-photo-count'); if(!el) return;
    const photos=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key && key.indexOf(HU_PHOTO_KEY_PREFIX)===0){
          const dataUrl=localStorage.getItem(key);
          const jcKey=key.replace(HU_PHOTO_KEY_PREFIX,'');
          const row=(HU_DATA||[]).find(r=>huPhotoKey(r)===key)||{};
          photos.push({dataUrl,label:(row[HU_COLS.reg]||huGetVin(row)||jcKey),model:row[HU_COLS.model]||'',date:row[HU_COLS.date]||'',updated:row['Parts Updated At']||''});
        }
      }
    }catch(e){}
    if(countEl) countEl.textContent=photos.length?photos.length+' photo(s)':'';
    if(!photos.length){ el.innerHTML='<div class="hu-gallery-empty">No requisition photos uploaded yet.</div>'; return; }
    el.innerHTML=photos.slice(0,12).map(p=>`<div class="hu-gallery-item" onclick="huViewPhotoByUrl('${p.dataUrl}','${raviEsc(p.label)}')"><img src="${p.dataUrl}"><div class="gal-label">${raviEsc(p.label)} · ${raviEsc(p.model)}</div><div class="gal-label">${p.updated?'Upd: '+raviEsc(String(p.updated).slice(0,16)):'JC: '+raviEsc(String(p.date).slice(0,10))}</div></div>`).join('');
  };

  // Module alias extension after original canonical mapping.
  MODULE_ALIASES['TARGETS']='Targets'; MODULE_ALIASES['TARGET']='Targets'; MODULE_ALIASES['DOCUMENTS']='Documents'; MODULE_ALIASES['GATEOUT']='GateOut'; MODULE_ALIASES['GATE OUT']='GateOut';
})();


/* ================= BOOT ================= */
/* Trap browser back button inside the app instead of leaving to the bare host page */
history.pushState({app:true}, '', location.href);
window.addEventListener('popstate', function(){
  history.pushState({app:true}, '', location.href);
  if(USER){
    const homeVisible = document.getElementById('view-home').style.display !== 'none';
    if(!homeVisible) goHome();
  }
});

loadUser();
/* Boot immediately so login and home appear at once. Masters are still served from the
   phone (not re-downloaded) — that waiting now happens only inside jget for master
   tables, not for the whole app. See the jget preload-gate. */
if(USER){ showView('home'); goHome(); } else { showView('login'); }
