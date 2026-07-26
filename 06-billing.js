/* ============================================================
   06-billing.js
   Billing comparison module

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ================================================================================
   ===== v11.0 — ESTIMATES & BILLING (the demand this project was started for) =====
   ===== + GATE OUT + HOLDUP MOBILE CARDS.  Everything below is ADDITIVE.       =====
   ================================================================================ */

/* ---------- ESTIMATES & BILLING ---------- */
let BL_DATA=[], BL_STATUS=null, BL_SA_FILTER='';
let BL_VIEW=''; // '' | 'billed' | 'unbilled' | 'deviation' — set by tapping a KPI tile (Ravi 26-Jul-2026)
let BL_ROWS_CURRENT=[], BL_LEAK_OPEN=false, BL_UNMATCHED=null; // leakage report state (Ravi 08-Jul)

/* ===== LEAKAGE REPORT (Fable-doc priority #4: "This will show leakage immediately") ===
   Three leakage directions, all in one panel, all obeying the active filters above:
   1. BILLED LOWER THAN ESTIMATE  — work was quoted, bill came in lower. Lost ₹ = gap.
   2. ESTIMATE BUT NO BILL (>2 days old) — quoted, vehicle likely left, never billed.
   3. BILL BUT NO ESTIMATE (backend join) — DMS billed a JC the app never estimated:
      pure process leakage, SA bypassed the estimate flow entirely.               */
function blToggleLeakage(){
  BL_LEAK_OPEN=!BL_LEAK_OPEN;
  const el=document.getElementById('bl-leakage');
  const btn=document.getElementById('bl-leak-btn');
  if(el) el.style.display=BL_LEAK_OPEN?'block':'none';
  if(btn) btn.style.background=BL_LEAK_OPEN?'#7f1d1d':'#b91c1c';
  if(BL_LEAK_OPEN){
    blRenderLeakage();
    if(BL_UNMATCHED===null && !blIsScoped()){
      BL_UNMATCHED='loading';
      jgetRaw('leakage_unmatched',{days:30},function(res){
        BL_UNMATCHED=(res&&res.ok!==false)?res:{rows:[],count:0,totalValue:0,error:res&&res.error};
        if(BL_LEAK_OPEN) blRenderLeakage();
      },20000);
    }
  }
}
function blRenderLeakage(){
  const el=document.getElementById('bl-leakage'); if(!el) return;
  const rows=BL_ROWS_CURRENT||[];
  const inrL=v=>{v=Math.round(v); return v>=100000?('₹'+(Math.round(v/1000)/100)+' L'):('₹'+v.toLocaleString('en-IN'));};
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const today=new Date(); today.setHours(0,0,0,0);
  const ageDays=e=>{ const d=new Date(String(e.dateKey||'')+'T00:00:00'); return isNaN(d)?0:Math.floor((today-d)/86400000); };
  // Direction 1: billed lower than estimate
  const under=rows.filter(e=>Number(e.billed||0)>0 && Number(e.billed)<Number(e.total||0));
  const lostUnder=under.reduce((s,e)=>s+(Number(e.total||0)-Number(e.billed||0)),0);
  // Direction 2: estimate, no bill, older than 2 days (today/yesterday = still WIP, not leakage)
  const nobill=rows.filter(e=>Number(e.billed||0)<=0 && ageDays(e)>2);
  const nobillVal=nobill.reduce((s,e)=>s+Number(e.total||0),0);
  // Recovery %
  const billedRows=rows.filter(e=>Number(e.billed||0)>0);
  const billTot=billedRows.reduce((s,e)=>s+Number(e.billed||0),0);
  const estOfBilled=billedRows.reduce((s,e)=>s+Number(e.total||0),0);
  const recovery=estOfBilled>0?Math.round(billTot/estOfBilled*1000)/10:null;
  // Direction 3 (backend)
  const um=BL_UNMATCHED;
  const umReady=um&&um!=='loading'&&!um.error;

  // SA-wise leakage table
  const bySa={};
  rows.forEach(e=>{
    const n=String(e.empname||'—');
    if(!bySa[n]) bySa[n]={est:0,estV:0,bill:0,billV:0,under:0,lost:0,nb:0,nbV:0};
    const s=bySa[n]; s.est++; s.estV+=Number(e.total||0);
    if(Number(e.billed||0)>0){
      s.bill++; s.billV+=Number(e.billed||0);
      if(Number(e.billed)<Number(e.total||0)){ s.under++; s.lost+=Number(e.total||0)-Number(e.billed); }
    } else if(ageDays(e)>2){ s.nb++; s.nbV+=Number(e.total||0); }
  });
  const saRows=Object.entries(bySa).sort((a,b)=>(b[1].lost+b[1].nbV)-(a[1].lost+a[1].nbV));

  const worstUnder=under.slice().sort((a,b)=>(Number(b.total)-Number(b.billed))-(Number(a.total)-Number(a.billed))).slice(0,15);
  const worstNb=nobill.slice().sort((a,b)=>Number(b.total||0)-Number(a.total||0)).slice(0,15);

  el.innerHTML=`
  <div style="border:2px solid #fecaca;border-radius:12px;padding:14px;background:#fff;margin-bottom:16px">
    <div style="font-weight:800;font-size:14px;margin-bottom:10px">🔍 Leakage Report <span style="font-weight:600;color:var(--steel);font-size:11px">— respects the filters above (${rows.length} estimates in view)</span></div>
    <div class="hu-sum-chips">
      <span class="hu-chip" style="--cc:#b91c1c">📉 Bill &lt; Estimate <b>${under.length}</b>&nbsp;<span style="font-size:11px;color:#b91c1c">${inrL(lostUnder)} lost</span></span>
      <span class="hu-chip" style="--cc:#d97706">🕳 Estimate, NO bill &gt;2d <b>${nobill.length}</b>&nbsp;<span style="font-size:11px;color:#d97706">${inrL(nobillVal)} at risk</span></span>
      <span class="hu-chip" style="--cc:#7c3aed">💸 Bill, NO estimate (30d) <b>${um==='loading'?'…':(umReady?um.count:'—')}</b>&nbsp;<span style="font-size:11px;color:#7c3aed">${umReady?inrL(um.totalValue):''}</span></span>
      <span class="hu-chip" style="--cc:${recovery===null?'#6b7280':recovery>=95?'#166534':recovery>=85?'#d97706':'#b91c1c'}">⚖️ Recovery <b>${recovery===null?'—':recovery+'%'}</b></span>
    </div>
    <div class="hu-mx-scroll" style="margin-bottom:12px"><table class="hu-matrix" style="min-width:760px">
      <thead><tr><th class="hu-mx-type">SA-wise Leakage</th><th>Est #</th><th>Est ₹</th><th>Billed #</th><th>Billed ₹</th><th>Bill&lt;Est</th><th>Lost ₹</th><th>No-bill &gt;2d</th><th>At-risk ₹</th></tr></thead>
      <tbody>${saRows.map(([n,s])=>`<tr><td class="hu-mx-type">${esc(n)}</td>
        <td>${s.est}</td><td>${inrL(s.estV)}</td><td>${s.bill}</td><td>${inrL(s.billV)}</td>
        <td style="color:#b91c1c;font-weight:800">${s.under||'·'}</td><td style="color:#b91c1c;font-weight:800">${s.lost?inrL(s.lost):'·'}</td>
        <td style="color:#d97706;font-weight:800">${s.nb||'·'}</td><td style="color:#d97706;font-weight:800">${s.nbV?inrL(s.nbV):'·'}</td></tr>`).join('')||'<tr><td colspan="9" style="text-align:center;color:var(--steel)">No estimates in current filter</td></tr>'}</tbody>
    </table></div>
    ${worstUnder.length?`<div class="hu-dt-sec">📉 Worst — billed lower than estimate</div>
    <div class="hu-mx-scroll" style="margin-bottom:12px"><table class="hu-matrix" style="min-width:640px">
      <thead><tr><th class="hu-mx-type">Reg No</th><th>Date</th><th>SA</th><th>Estimate</th><th>Billed</th><th>Gap</th></tr></thead>
      <tbody>${worstUnder.map(e=>`<tr><td class="hu-mx-type">${esc(e.reg)}</td><td>${esc(e.dateKey)}</td><td>${esc(e.empname)}</td>
        <td>${inrL(e.total)}</td><td>${inrL(e.billed)}</td><td style="color:#b91c1c;font-weight:800">−${inrL(Number(e.total)-Number(e.billed)).replace('₹','₹ ')}</td></tr>`).join('')}</tbody>
    </table></div>`:''}
    ${worstNb.length?`<div class="hu-dt-sec">🕳 Estimated but never billed (&gt;2 days)</div>
    <div class="hu-mx-scroll" style="margin-bottom:12px"><table class="hu-matrix" style="min-width:640px">
      <thead><tr><th class="hu-mx-type">Reg No</th><th>Date</th><th>Age</th><th>SA</th><th>Estimate value</th></tr></thead>
      <tbody>${worstNb.map(e=>`<tr><td class="hu-mx-type">${esc(e.reg)}</td><td>${esc(e.dateKey)}</td><td style="color:#d97706;font-weight:800">${ageDays(e)}d</td><td>${esc(e.empname)}</td><td>${inrL(e.total)}</td></tr>`).join('')}</tbody>
    </table></div>`:''}
    ${!blIsScoped()?(um==='loading'?'<div style="font-size:12px;color:var(--steel)">Loading bills-with-no-estimate from server…</div>'
      :umReady&&um.rows.length?`<div class="hu-dt-sec">💸 Billed in DMS but NO estimate in app (last ${um.days}d — process bypass)</div>
    <div class="hu-mx-scroll"><table class="hu-matrix" style="min-width:700px">
      <thead><tr><th class="hu-mx-type">JC Number</th><th>Reg No</th><th>Model</th><th>Supervisor</th><th>Job</th><th>Billed</th><th>Inv Date</th></tr></thead>
      <tbody>${um.rows.slice(0,40).map(r=>`<tr><td class="hu-mx-type">${esc(r.jc)}</td><td>${esc(r.reg)}</td><td>${esc(r.model)}</td><td>${esc(r.sup)}</td><td style="font-size:11px">${esc(r.job||r.jcType)}</td><td style="font-weight:800">${inrL(r.total)}</td><td>${esc(r.invDate)}</td></tr>`).join('')}</tbody>
    </table>${um.rows.length>40?`<div style="font-size:11px;color:var(--steel);padding:6px 10px">Showing top 40 of ${um.count} by value.</div>`:''}</div>`
      :umReady?'<div style="font-size:12px;color:#166534;font-weight:700">✅ Every billed JC in the last 30 days has an estimate in the app — no process bypass.</div>'
      :um&&um.error?'<div style="font-size:12px;color:#b91c1c">Bills-with-no-estimate check failed: '+esc(um.error)+' — deploy backend v11.6 first.</div>':''):''}
  </div>`;
}
function blShowInfo(msg,kind){
  const el=document.getElementById('bl-info'); if(!el) return;
  el.style.display='block';
  el.style.background=kind==='error'?'#fef2f2':'#ecfdf5';
  el.style.color=kind==='error'?'#b91c1c':'#166534';
  el.textContent=msg;
}
function blIsScoped(){ return (typeof isSAUser==='function' && isSAUser()) && !isTopMgmtUser() && !isAdmin(); }
/* dead blBoot() removed 22-Jul-2026 (s15a). Live version is the window.blBoot override in a later patch block. */
function blRenderStatusLine(){
  if(!BL_STATUS||BL_STATUS.ok===false) return;
  if(!BL_STATUS.billRows && !BL_STATUS.jcRows) { blShowInfo('No DMS billing uploaded yet — upload Daily JC Summary + Total Bill Value (both from Hero DMS) to activate comparison.','error'); return; }
  blShowInfo('Server billing data: '+(BL_STATUS.jcRows||0)+' JCs mapped · '+(BL_STATUS.billRows||0)+' JCs billed · Last billing upload: '+(BL_STATUS.lastBillingUpload||'—'),'ok');
}
function blVal(id){ return (document.getElementById(id)||{}).value||''; }
function blMonthKey(dk){ return String(dk||'').slice(0,7); }
function blBuildFilters(){
  document.getElementById('bl-filters').style.display='flex';
  const scoped=blIsScoped();
  document.getElementById('bl-f-sa').style.display=scoped?'none':'';
  const fill=(id,vals,fmt)=>{ const el=document.getElementById(id); if(!el) return; const cur=el.value;
    el.innerHTML=el.options[0].outerHTML+vals.map(v=>`<option value="${v}">${fmt?fmt(v):v}</option>`).join('');
    if([...el.options].some(o=>o.value===cur)) el.value=cur; };
  fill('bl-f-ws',[...new Set(BL_DATA.map(e=>String(e.ws||'')).filter(Boolean))]);
  fill('bl-f-sa',[...new Set(BL_DATA.map(e=>String(e.empname||'')).filter(Boolean))]);
  fill('bl-f-service',[...new Set(BL_DATA.map(e=>String(e.service||'')).filter(Boolean))]);
  const months=[...new Set(BL_DATA.map(e=>blMonthKey(e.dateKey)).filter(Boolean))].sort().reverse();
  fill('bl-f-month',months,m=>{ const d=new Date(m+'-01T00:00:00'); return isNaN(d)?m:d.toLocaleDateString('en-IN',{month:'long',year:'numeric'}); });
  blMonthChanged(true);
}
function blMonthChanged(skipRender){
  const m=blVal('bl-f-month');
  const dayEl=document.getElementById('bl-f-day');
  const days=[...new Set(BL_DATA.filter(e=>!m||blMonthKey(e.dateKey)===m).map(e=>e.dateKey).filter(Boolean))].sort().reverse();
  const cur=dayEl.value;
  dayEl.innerHTML='<option value="">All Days</option>'+days.map(d=>{ const dt=new Date(d+'T00:00:00'); const lbl=isNaN(dt)?d:dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',weekday:'short'}); return `<option value="${d}">${lbl}</option>`; }).join('');
  if([...dayEl.options].some(o=>o.value===cur)) dayEl.value=cur;
  if(!skipRender) blRender();
}
function blDevPct(e){ const t=Number(e.total||0), b=Number(e.billed||0); if(!t||!b) return null; return Math.round(((b-t)/t)*1000)/10; }
function blDevColor(p){ if(p===null) return '#6b7280'; const a=Math.abs(p); return a<=10?'#16a34a':a<=25?'#d97706':'#dc2626'; }
function blSetSa(name){ BL_SA_FILTER=(BL_SA_FILTER===name)?'':name; blRender(); }
/* Tap a billing KPI tile -> narrow the list. Tapping the same tile again clears it. */
function blSetView(v){ BL_VIEW=(BL_VIEW===v)?'':v; blRender(); }
function blRender(){
  const fWs=blVal('bl-f-ws'), fSa=blVal('bl-f-sa'), fSvc=blVal('bl-f-service'), fM=blVal('bl-f-month'), fD=blVal('bl-f-day'), fB=blVal('bl-f-billed');
  const fS=blVal('bl-f-search').toLowerCase().trim();
  let rows=BL_DATA.filter(e=>{
    if(fWs && String(e.ws||'')!==fWs) return false;
    if(fSa && String(e.empname||'')!==fSa) return false;
    if(BL_SA_FILTER && String(e.empname||'')!==BL_SA_FILTER) return false;
    if(fSvc && String(e.service||'')!==fSvc) return false;
    if(fM && blMonthKey(e.dateKey)!==fM) return false;
    if(fD && e.dateKey!==fD) return false;
    const billed=Number(e.billed||0)>0;
    if(fB==='billed' && !billed) return false;
    if(fB==='unbilled' && billed) return false;
    if(fB==='dev'){ const p=blDevPct(e); if(p===null||Math.abs(p)<=25) return false; }
    if(fS){
      const hay=(String(e.reg||'')+' '+String(e.name||'')+' '+String(e.jcNo||'')+' '+String(e.model||'')).toLowerCase();
      if(!hay.includes(fS)) return false;
    }
    return true;
  });
  BL_ROWS_CURRENT=rows; // leakage panel computes from the SAME filtered set, so month/SA/type filters apply to it naturally
  if(typeof BL_LEAK_OPEN!=='undefined'&&BL_LEAK_OPEN) blRenderLeakage();

  // KPIs
  const estTot=rows.reduce((s,e)=>s+Number(e.total||0),0);
  const billedRows=rows.filter(e=>Number(e.billed||0)>0);
  const billTot=billedRows.reduce((s,e)=>s+Number(e.billed||0),0);
  const estOfBilled=billedRows.reduce((s,e)=>s+Number(e.total||0),0);
  const devPct=estOfBilled>0?Math.round(((billTot-estOfBilled)/estOfBilled)*1000)/10:null;
  const fmtL=v=>v>=100000?(Math.round(v/10000)/10)+' L':inr(v);
  document.getElementById('bl-kpi-row').innerHTML=[
    /* Ravi 26-Jul-2026: all six of these showed a number and did nothing when tapped.
       Each one now filters the list underneath it. Value tiles drill to the same set
       as the count tile beside them, so the number and the list always agree. */
    {ic:'🧾',n:rows.length,label:'Estimates',color:'#2563eb',go:"blSetView('all')"},
    {ic:'₹',n:fmtL(estTot),label:'Estimate Value',color:'#7c3aed',go:"blSetView('all')"},
    {ic:'✅',n:billedRows.length,label:'Billed (matched)',color:'#16a34a',go:"blSetView('billed')"},
    {ic:'💰',n:fmtL(billTot),label:'Billed Value',color:'#166534',go:"blSetView('billed')"},
    {ic:'📉',n:rows.length-billedRows.length,label:'Unbilled / Pending',color:'#d97706',go:"blSetView('unbilled')"},
    {ic:'⚖️',n:devPct===null?'—':(devPct>0?'+':'')+devPct+'%',label:'Overall Deviation',color:blDevColor(devPct),go:"blSetView('deviation')"}
  ].map(k=>`<div class="hu-kpi-tile${k.go?' clickable':''}" style="--ktc:${k.color}${k.go?';cursor:pointer':''}" ${k.go?`onclick="${k.go}"`:''} ${k.go?'title="Tap to filter the list below"':''}><span class="kt-ic">${k.ic}</span><div class="kt-body"><div class="kt-n">${k.n}</div><div class="kt-label">${k.label}</div></div></div>`).join('');

  // SA-wise summary strip (reports, not vehicle details — per SA-login idea)
  const strip=document.getElementById('bl-sa-strip');
  if(strip && !blIsScoped()){
    const bySa={};
    rows.forEach(e=>{ const n=String(e.empname||'—'); if(!bySa[n]) bySa[n]={c:0,est:0,bill:0,estB:0};
      bySa[n].c++; bySa[n].est+=Number(e.total||0);
      if(Number(e.billed||0)>0){ bySa[n].bill+=Number(e.billed||0); bySa[n].estB+=Number(e.total||0); } });
    strip.style.display='flex';
    strip.innerHTML='<span class="hu-slicer-label">SA-wise:</span>'+Object.entries(bySa).sort((a,b)=>b[1].est-a[1].est).map(([n,v])=>{
      const p=v.estB>0?Math.round(((v.bill-v.estB)/v.estB)*100):null;
      return `<button class="hu-sl-btn${BL_SA_FILTER===n?' active':''}" onclick="blSetSa('${n.replace(/'/g,"\\'")}')" title="Estimates ${inr(v.est)} · Billed ${inr(v.bill)}">${n} <span class="sl-count">${v.c}</span>${p===null?'':` <span style="color:${blDevColor(p)};font-weight:800">${p>0?'+':''}${p}%</span>`}</button>`;
    }).join('');
  } else if(strip) strip.style.display='none';

  /* KPI-tile drill-down. (Ravi 26-Jul-2026) Applied here, AFTER the tiles have been
     computed, so the tiles keep showing the full picture while the table narrows to
     what you tapped. The tests match the tile arithmetic exactly. */
  if(BL_VIEW==='billed')    rows=rows.filter(e=>Number(e.billed||0)>0);
  else if(BL_VIEW==='unbilled') rows=rows.filter(e=>!(Number(e.billed||0)>0));
  else if(BL_VIEW==='deviation') rows=rows.filter(e=>Number(e.billed||0)>0 && Number(e.billed)!==Number(e.total||0));
  const vbar=document.getElementById('bl-viewbar');
  if(vbar){
    const names={billed:'Billed (matched)',unbilled:'Unbilled / Pending',deviation:'Estimate vs Billed differs'};
    vbar.innerHTML = BL_VIEW&&names[BL_VIEW]
      ? '<span class="hu-chip clear" onclick="blSetView(\'\')">\u2715 Showing: '+names[BL_VIEW]+' ('+rows.length+') \u00b7 tap to clear</span>' : '';
    vbar.style.display = BL_VIEW&&names[BL_VIEW] ? 'flex' : 'none';
  }

  const wrap=document.getElementById('bl-table-wrap');
  if(!rows.length){ wrap.innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)"><div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-weight:700">No estimates match the current filters</div></div>'; return; }

  // Holdup badge: reg present in local holdup data & not delivered
  let huRegs={};
  try{ (JSON.parse(localStorage.getItem(HU_STORE_KEY)||'[]')).forEach(r=>{ const st=String(r['Holdup Status']||'').toUpperCase(); if(st!=='DELIVERED'&&st!=='CLEAR'){ const rg=String(r[HU_COLS.reg]||'').toUpperCase().replace(/[^A-Z0-9]/g,''); if(rg) huRegs[rg]=true; } }); }catch(e){}

  const fmtDate=dk=>{ const d=new Date(dk+'T00:00:00'); return isNaN(d)?dk:d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}); };
  if(window.innerWidth<=760){
    wrap.innerHTML=rows.map(e=>{
      const p=blDevPct(e), c=blDevColor(p), billed=Number(e.billed||0);
      const inHu=huRegs[String(e.reg||'').toUpperCase().replace(/[^A-Z0-9]/g,'')];
      return `<div class="blm-card" style="border-left-color:${c}">
        <div class="blm-top"><div><span class="blm-reg">${e.reg||'—'}</span><span class="blm-model"> · ${e.model||''}</span>${inHu?'<span class="blm-hu">HOLDUP</span>':''}</div>
        <span class="blm-date">${fmtDate(e.dateKey)}</span></div>
        <div class="blm-mid">${e.name||''} · ${e.service||''} · <b>${e.empname||''}</b> · ${e.ws||''}</div>
        <div class="blm-amts"><span>Est <b>${inr(e.total||0)}</b></span><span>Billed <b style="color:${billed?'#166534':'#9ca3af'}">${billed?inr(billed):'—'}</b></span>
        <span style="color:${c};font-weight:800">${p===null?'':(p>0?'+':'')+(p===null?'':p+'%')}</span></div>
        ${e.jcNo?`<div class="blm-jc">JC ${e.jcNo}</div>`:''}
      </div>`;
    }).join('');
    return;
  }
  wrap.innerHTML=`<table class="hu-excel-table"><thead><tr>
    <th>Date</th><th>Reg No</th><th>Model</th><th>Customer</th><th>Service</th><th>SA</th><th>WS</th>
    <th style="text-align:right">Estimate ₹</th><th style="text-align:right">Billed ₹</th><th style="text-align:right">Var ₹</th><th style="text-align:right">Dev %</th><th>JC Number</th><th>⛔</th>
  </tr></thead><tbody>${rows.map(e=>{
    const p=blDevPct(e), c=blDevColor(p), billed=Number(e.billed||0), varr=billed?billed-Number(e.total||0):null;
    const inHu=huRegs[String(e.reg||'').toUpperCase().replace(/[^A-Z0-9]/g,'')];
    return `<tr>
      <td style="white-space:nowrap;font-size:11px">${fmtDate(e.dateKey)}</td>
      <td class="td-reg">${e.reg||'—'}</td>
      <td style="font-size:12px;white-space:nowrap">${e.model||'—'}</td>
      <td style="font-size:12px">${e.name||'—'}</td>
      <td style="font-size:11px;white-space:nowrap">${e.service||'—'}</td>
      <td style="font-size:11px;white-space:nowrap">${e.empname||'—'}</td>
      <td style="font-size:11px">${e.ws||'—'}</td>
      <td style="text-align:right;font-weight:700;white-space:nowrap">${inr(e.total||0)}</td>
      <td style="text-align:right;font-weight:700;white-space:nowrap;color:${billed?'#166534':'#9ca3af'}">${billed?inr(billed):'—'}</td>
      <td style="text-align:right;white-space:nowrap;color:${varr===null?'#9ca3af':varr>=0?'#166534':'#b91c1c'}">${varr===null?'—':(varr>0?'+':'')+inr(varr)}</td>
      <td style="text-align:right;font-weight:800;color:${c}">${p===null?'—':(p>0?'+':'')+p+'%'}</td>
      <td style="font-size:10px;color:var(--steel);white-space:nowrap">${e.jcNo||'—'}</td>
      <td style="text-align:center">${inHu?'<span title="Vehicle currently in holdup" style="font-size:13px">⛔</span>':''}</td>
    </tr>`; }).join('')}</tbody></table>`;
}

/* --- Daily JC Summary upload: header row is the 3rd row of the DMS export --- */
function blLocalDateStr(v){
  if(v instanceof Date && !isNaN(v.getTime())) return v.getFullYear()+'-'+('0'+(v.getMonth()+1)).slice(-2)+'-'+('0'+v.getDate()).slice(-2);
  const s=String(v||'').trim(); if(!s) return '';
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if(m) return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
  const d=new Date(s); return isNaN(d.getTime())?'':d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
async function blPostChunks(type, records, extra){
  const CH=400;
  for(let i=0;i<records.length;i+=CH){
    await jpost(Object.assign({type:type,records:records.slice(i,i+CH)},extra||{}));
  }
}
function blHandleJcFile(input){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_blHandleJcFile){ heroEnsureLibs('xlsx', function(ok){ if(!ok) return; window.__heroLibsOK_blHandleJcFile=1; blHandleJcFile(input); window.__heroLibsOK_blHandleJcFile=0; }); return; }

  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      let hi=-1;
      for(let i=0;i<Math.min(aoa.length,8);i++){ if(aoa[i].some(c=>String(c).trim()==='Jobcard No.')){ hi=i; break; } }
      if(hi<0){ blShowInfo('This does not look like a Daily JC Summary export — "Jobcard No." column not found in the first rows.','error'); return; }
      const H=aoa[hi].map(c=>String(c).trim());
      const col=n=>H.indexOf(n);
      const cJc=col('Jobcard No.'), cReg=col('Registration Number'), cVin=col('VIN'), cMod=col('Model'),
            cJob=col('Nature of Job'), cOp=col('Jobcard Open Dt'), cCl=col('Jobcard Close Dt'), cSt=col('Jobcard Status'),
            cSup=col('Supervisor Name'), cTec=col('Technician Name'), cInv=col('Invoice No.'), cIs=col('Invoice Status'), cOd=col('Odometer Reading');
      const recs=[];
      for(let i=hi+1;i<aoa.length;i++){
        const r=aoa[i], jc=String(r[cJc]||'').trim();
        if(!jc||!/RJC/i.test(jc)) continue;
        recs.push({jc:jc, dealer:jc.split('-')[0]||'', reg:String(r[cReg]||''), vin:String(r[cVin]||''),
          model:String(r[cMod]||''), job:String(r[cJob]||''), openDt:blLocalDateStr(r[cOp]), closeDt:blLocalDateStr(r[cCl]),
          jcStatus:String(r[cSt]||''), supervisor:String(r[cSup]||''), technician:String(r[cTec]||''),
          invoiceNo:String(r[cInv]||''), invStatus:String(r[cIs]||''), odo:String(r[cOd]||'')});
      }
      if(!recs.length){ blShowInfo('No JC rows found in the file.','error'); return; }
      blShowInfo('Read '+recs.length+' JCs from Daily JC Summary · Sending to server in batches…','ok');
      await blPostChunks('upsert_jcmaster',recs);
      blShowInfo('✓ '+recs.length+' JCs sent. Now upload Total Bill Value — the matcher runs automatically after it.','ok');
      jgetRaw('billing_status', {}, function(st){ BL_STATUS=st; blRenderStatusLine(); }, 15000);
    }catch(err){ blShowInfo('Could not parse file: '+err.message,'error'); }
  };
  reader.readAsArrayBuffer(file);
  input.value='';
}
/* --- Total Bill Value upload: aggregate line items → one row per JC, incl. GST --- */
function blHandleBillFile(input){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_blHandleBillFile){ heroEnsureLibs('xlsx', function(ok){ if(!ok) return; window.__heroLibsOK_blHandleBillFile=1; blHandleBillFile(input); window.__heroLibsOK_blHandleBillFile=0; }); return; }

  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array',cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!rows.length||rows[0]['Narration']===undefined||rows[0]['Assessable Value']===undefined){
        blShowInfo('This does not look like a Total Bill Value export — "Narration" / "Assessable Value" columns not found.','error'); return;
      }
      const agg={};
      rows.forEach(r=>{
        const jc=String(r['Narration']||'').trim();
        if(!jc||!/RJC/i.test(jc)) return;
        const dc=String(r['Dealer Code']||jc.split('-')[0]||'').trim();
        const k=jc+'|'+dc;
        const gst=(Number(r['SGST %'])||0)+(Number(r['CGST %'])||0)+(Number(r['IGST %'])||0)+(Number(r['UT GST %'])||0);
        const line=(Number(r['Assessable Value'])||0)*(1+gst/100);
        if(!agg[k]) agg[k]={jc:jc,dealer:dc,jcType:String(r['Job Card Type']||''),labour:0,parts:0,total:0,lines:0,invDate:'',invs:{}};
        const a=agg[k];
        if(String(r['JOB/PART']).toUpperCase()==='JOB') a.labour+=line; else a.parts+=line;
        a.total+=line; a.lines++;
        const inv=String(r['Invoice Number']||'').trim(); if(inv) a.invs[inv]=true;
        const idt=blLocalDateStr(r['Invoice Date']); if(idt && idt>a.invDate) a.invDate=idt;
      });
      const recs=Object.values(agg).map(a=>({jc:a.jc,dealer:a.dealer,jcType:a.jcType,invDate:a.invDate,
        invNos:Object.keys(a.invs).join(','),labour:Math.round(a.labour*100)/100,parts:Math.round(a.parts*100)/100,
        total:Math.round(a.total*100)/100,lines:a.lines}));
      if(!recs.length){ blShowInfo('No billable JC lines found (Narration column had no RJC numbers).','error'); return; }
      blShowInfo('Aggregated '+rows.length+' invoice lines into '+recs.length+' JCs · Sending & matching to estimates…','ok');
      await blPostChunks('upsert_billing',recs);
      blShowInfo('✓ Billing sent for '+recs.length+' JCs. Matcher has run on the server — refreshing table…','ok');
      setTimeout(blBoot,2500);
    }catch(err){ blShowInfo('Could not parse file: '+err.message,'error'); }
  };
  reader.readAsArrayBuffer(file);
  input.value='';
}

/* ---------- GATE OUT ---------- */
let GO_DATA=[], GO_SEL=null;
function goShowInfo(msg,kind){
  const el=document.getElementById('go-info'); if(!el) return;
  el.style.display='block';
  el.style.background=kind==='error'?'#fef2f2':'#ecfdf5';
  el.style.color=kind==='error'?'#b91c1c':'#166534';
  el.textContent=msg;
}
function goBoot(){
  const list=document.getElementById('go-list');
  if(list) list.innerHTML='<div class="hint">Loading vehicles inside the workshop…</div>';
  // empno:'' → all guards' entries (a vehicle entered by Guard1 can exit on Guard2 shift)
  jgetReliable('gate_history', {days:7, empno:''}, function(res,isStale){
    if(!res||res.ok===false){ if(!isStale) goShowInfo('Could not load gate entries — tap ↻ Refresh.','error'); return; }
    GO_DATA=(res.entries||[]).filter(g=>String(g.status||'OPEN').toUpperCase()!=='OUT' && wsAllowed(g.location));
    goRenderList();
  }, 20000);
}
function goRenderList(){
  const list=document.getElementById('go-list'); if(!list) return;
  const q=(document.getElementById('go-search').value||'').toLowerCase().trim();
  const rows=GO_DATA.filter(g=>{
    if(!q) return true;
    return (String(g.reg||'')+' '+String(g.token||'')+' '+String(g.name||'')+' '+String(g.model||'')).toLowerCase().includes(q);
  });
  if(!rows.length){ list.innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)"><div style="font-size:32px;margin-bottom:8px">🏁</div><div style="font-weight:700">No vehicles pending Gate Out</div><div style="font-size:12px;margin-top:4px">All entries of the last 7 days are already out, or none match the search.</div></div>'; return; }
  list.innerHTML=rows.map((g,i)=>{
    const t=new Date(g.time), when=isNaN(t)?'':t.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div class="blm-card" style="border-left-color:#dc2626;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="min-width:0;flex:1 1 auto;overflow-wrap:break-word">
        <div><span class="blm-reg">${g.reg||'—'}</span><span class="blm-model"> · ${g.model||''}</span> <span style="font-size:10px;background:#eff6ff;color:#2563eb;border-radius:5px;padding:1px 6px;font-weight:700">Token ${g.token||'—'}</span></div>
        <div class="blm-mid">${g.name||''} · ${g.purpose||''} · In: ${when} · ${g.location||''}</div>
      </div>
      <button class="btn sm" style="background:#dc2626;flex:0 0 auto;width:auto;white-space:nowrap" onclick="goOpenSheet(${GO_DATA.indexOf(g)})">🏁 Gate Out</button>
    </div>`; }).join('');
}
function goOpenSheet(i){
  GO_SEL=GO_DATA[i]; if(!GO_SEL) return;
  document.getElementById('go-sheet-veh').textContent=(GO_SEL.reg||'—')+' · '+(GO_SEL.model||'')+' · '+(GO_SEL.name||'');
  document.getElementById('go-km').value='';
  document.getElementById('go-remark').value='';
  document.getElementById('go-sheet').style.display='flex';
}
function goConfirm(){
  if(!GO_SEL) return;
  const km=document.getElementById('go-km').value, remark=document.getElementById('go-remark').value;
  jpost({type:'gate_out', entryId:GO_SEL.entryId, reg:GO_SEL.reg, km:km, remark:remark, empno:USER.empno, empname:USER.personName});
  // optimistic: remove from list immediately (jpost queues offline, never lost)
  GO_DATA=GO_DATA.filter(g=>g!==GO_SEL);
  GO_SEL=null;
  document.getElementById('go-sheet').style.display='none';
  goShowInfo('✓ Gate Out recorded. It will sync to the server (queued automatically if offline).','ok');
  goRenderList();
}

/* ---------- HOLDUP MOBILE CARDS (Operations Hub design) ---------- */
function huMobCall(i){
  const r=HU_ROWS_CURRENT[i]; if(!r) return;
  const mob=String(r['Mobile']||r['Mobile No']||r['Contact Number']||r['Customer Mobile']||'').replace(/\D/g,'').slice(-10);
  if(mob.length===10) window.location.href='tel:+91'+mob;
  else alert('No customer mobile number available in the holdup data for this vehicle.');
}
function huRenderMobileCards(rows){
  const canEdit=canEditHoldup();
  document.getElementById('hu-table-wrap').innerHTML=rows.map((r,i)=>{
    const days=r.__days;
    const bc=days>5?'#dc2626':days>=2?'#f59e0b':'#16a34a';
    const dbg=days>5?'#fef2f2':days>=2?'#fff7ed':'#ecfdf5';
    const reg=String(r[HU_COLS.reg]||'').trim().toUpperCase()||huGetVin(r)||'—';
    const saName=HU_SA_MAP[String(r[HU_COLS.supervisor]||'').trim().toUpperCase()]||String(r[HU_COLS.supervisor]||'').trim();
    const curHS=huNormalizeDrs(r['Holdup Status']||'')||'Not Updated';
    const drsColor=huDrsColor(curHS);
    const eta=r['Parts ETA']||'—', rem=r['Remarks']||'';
    return `<div class="hum-card" style="border-left-color:${bc}">
      <div class="hum-top">
        <div onclick="huShowDetail(${i})" style="cursor:pointer"><div class="hum-reg" style="color:#2563eb;text-decoration:underline dotted">${reg}</div><div class="hum-model">${r[HU_COLS.model]||''}</div></div>
        <span class="hum-days" style="background:${dbg};color:${bc}">${days>=0?days+'d':'—'}</span>
      </div>
      <div class="hum-grid">
        <div><span class="hum-lbl">👤 SA</span>${saName||'—'}</div>
        <div><span class="hum-lbl">🔧 JC Type</span>${r[HU_COLS.type]||'—'}</div>
        <div><span class="hum-lbl">● Status</span><span style="color:${drsColor};font-weight:700">${curHS}</span></div>
        <div><span class="hum-lbl">📅 ETA</span>${eta}</div>
      </div>
      ${rem?`<div class="hum-rem">💬 ${String(rem).replace(/</g,'&lt;')}</div>`:''}
      <div class="hum-actions">
        ${canEdit?`<button class="hum-btn upd" style="background:${bc}" onclick="huMobSheetOpen(${i})">✏️ Quick Update</button>`:''}
        <button class="hum-btn" onclick="huMobCall(${i})">📞 Call</button>
        <button class="hum-btn" onclick="huShowHistory(${i})">📅</button>
        ${huReqPhotoCell(r,i)}
      </div>
    </div>`;
  }).join('');
}
let HUM_SEL=-1;
function huMobSheetOpen(i){
  HUM_SEL=i;
  const r=HU_ROWS_CURRENT[i]; if(!r) return;
  const reg=String(r[HU_COLS.reg]||'').trim().toUpperCase()||huGetVin(r)||'—';
  const curHS=huNormalizeDrs(r['Holdup Status']||''), curEta=r['Parts ETA']||'', curRem=r['Remarks']||'';
  document.getElementById('hum-sheet-title').textContent='Quick Update';
  document.getElementById('hum-sheet-veh').innerHTML=reg+' · '+(r[HU_COLS.model]||'')+' <span style="color:'+(r.__days>5?'#dc2626':'#d97706')+';font-weight:800">'+(r.__days>=0?r.__days+'d':'')+'</span>';
  document.getElementById('hum-status').innerHTML='<option value="">Select status…</option>'+huDrsOptionsHtml(curHS);
  document.getElementById('hum-eta').innerHTML='<option value="">ETA…</option>'+HU_ETA_OPTIONS.map(o=>`<option value="${o}"${o===curEta?' selected':''}>${o}</option>`).join('');
  document.getElementById('hum-remarks').value=curRem;
  document.getElementById('hum-sheet').style.display='flex';
}
function huMobSheetSave(){
  const i=HUM_SEL; const r=HU_ROWS_CURRENT[i];
  if(!r){ document.getElementById('hum-sheet').style.display='none'; return; }
  const st=document.getElementById('hum-status').value, eta=document.getElementById('hum-eta').value, rem=document.getElementById('hum-remarks').value;
  if(st && st!==huNormalizeDrs(r['Holdup Status']||'')) huInlineUpdate(i,'status',st);
  if(eta && eta!==(r['Parts ETA']||'')) huInlineUpdate(i,'eta',eta);
  if(rem!==(r['Remarks']||'')) huInlineUpdate(i,'remarks',rem);
  document.getElementById('hum-sheet').style.display='none';
  huRender();
}
