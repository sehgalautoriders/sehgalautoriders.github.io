/* ============================================================
   08-late.js
   Late overrides and patches — MUST load last

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

(function(){
  /* Surgical correction requested by Ravi:
     - Estimates & Billing must be an all-date register, not only today.
     - SA sees only own estimates. WM/GM/CEO/Billing/Parts can see assigned workshop/all scope.
     - Month and day filters remain, and the table is grouped day-wise.
     - If the Holdup sheet says the registration number is delivered/clear, hide that estimate.
       If the same reg still has another active holdup row, keep it visible. */

  const OLD_CAN_USE = window.canUseModule;
  window.canUseModule = function(m){
    const cm = (typeof canonicalModule==='function') ? canonicalModule(m) : String(m||'');
    if(cm==='BillingComparison'){
      if(typeof isSAUser==='function' && isSAUser()) return true;
      if(typeof isPartsPerson==='function' && isPartsPerson()) return true;
      if(typeof isTopMgmtUser==='function' && isTopMgmtUser()) return true;
      if(typeof hasModule==='function' && (hasModule('BillingComparison')||hasModule('Billing')||hasModule('ControlRoom')||hasModule('HoldupMonitor'))) return true;
    }
    return OLD_CAN_USE ? OLD_CAN_USE(m) : false;
  };

  window.RAVI_BL_RAW_DATA = [];
  window.RAVI_BL_HU_DELIVERED = {};
  window.RAVI_BL_HU_ACTIVE = {};
  window.RAVI_BL_HU_LOADED = false;
  window.RAVI_BL_HIDDEN_DELIVERED_COUNT = 0;

  function esc(s){
    if(typeof raviEsc==='function') return raviEsc(s);
    return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];});
  }
  function nreg(v){
    if(typeof raviNormalizeReg==='function') return raviNormalizeReg(v);
    return String(v||'').toUpperCase().replace(/[\s\-]/g,'').replace(/[^A-Z0-9]/g,'').trim();
  }
  function regOfHoldupRow(r){
    if(!r) return '';
    let val='';
    try{ if(typeof HU_COLS!=='undefined' && HU_COLS && HU_COLS.reg) val=r[HU_COLS.reg]; }catch(e){}
    return nreg(val || r['Reg No'] || r['Registration Number'] || r['Vehicle Registration Number'] || r['RegNo'] || '');
  }
  function regOfEstimate(e){ return nreg((e&&e.reg) || (e&&e['Reg No']) || (e&&e.registration) || ''); }
  function deliveredStatus(s){
    s=String(s||'').toUpperCase().trim();
    if(!s) return false;
    return s==='DELIVERED' || s==='CLEAR' || s==='CLEARED' || s==='OUT' ||
           s.indexOf('DELIVERED')>=0 || s.indexOf('GATE OUT')>=0 || s.indexOf('GATEOUT')>=0;
  }
  function statusOfHoldupRow(r){
    if(!r) return '';
    let st = r['Holdup Status'] || r['Daily Review Status'] || r['Vehicle Status'] || '';
    if(!st) st = r['Order Status'] || r['Order Status '] || '';
    try{ if(!st && typeof HU_COLS!=='undefined' && HU_COLS && HU_COLS.status) st=r[HU_COLS.status]||''; }catch(e){}
    return String(st||'');
  }
  function collectLocalHoldupRows(){
    let out=[];
    try{ if(Array.isArray(window.HU_DATA)) out=out.concat(window.HU_DATA); }catch(e){}
    try{ const a=JSON.parse(localStorage.getItem(typeof HU_STORE_KEY!=='undefined'?HU_STORE_KEY:'sehgal_holdup_data')||'[]'); if(Array.isArray(a)) out=out.concat(a); }catch(e){}
    return out;
  }
  function buildHoldupMaps(rows){
    const delivered={}, active={};
    (rows||[]).forEach(function(r){
      const rg=regOfHoldupRow(r); if(!rg) return;
      const st=statusOfHoldupRow(r);
      if(deliveredStatus(st)) delivered[rg]=true;
      else active[rg]=true;
    });
    window.RAVI_BL_HU_DELIVERED = delivered;
    window.RAVI_BL_HU_ACTIVE = active;
  }
  function loadHoldupMaps(cb){
    buildHoldupMaps(collectLocalHoldupRows());
    if(typeof jgetRaw!=='function'){ window.RAVI_BL_HU_LOADED=true; if(cb) cb(); return; }
    jgetRaw('holdup_summary', {}, function(res){
      if(res && res.ok!==false && Array.isArray(res.rows)){
        const mapped=res.rows.map(function(r){
          return {
            'Reg No':r['Reg No']||'',
            'Registration Number':r['Registration Number']||'',
            'Holdup Status':r['Holdup Status']||r['Daily Review Status']||'',
            'Order Status':r['Order Status']||''
          };
        });
        buildHoldupMaps(collectLocalHoldupRows().concat(mapped));
      }
      window.RAVI_BL_HU_LOADED=true;
      if(cb) cb();
    }, 18000);
  }
  function dateKeyOf(e){
    if(e && e.dateKey) return String(e.dateKey).slice(0,10);
    const raw=(e&& (e.date || e.time || e.ts || e.createdAt)) || '';
    if(!raw) return '';
    const d = (typeof raw==='number') ? new Date(raw) : new Date(String(raw));
    if(isNaN(d.getTime())) return String(raw).slice(0,10);
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  }
  function normalizeEstimate(e){
    e=e||{};
    const x=Object.assign({}, e);
    x.dateKey=dateKeyOf(x);
    x.total=Number(x.total||x.grandTotal||x.GrandTotal||0);
    x.billed=Number(x.billed||x.billTotal||x.actualBill||0);
    x.ws=x.ws||x.location||x.workshop||'';
    x.empname=x.empname||x.empName||x.preparedBy||x.advisor||x.sa||'';
    x.empno=x.empno||x.empNo||x.EmpNo||'';
    x.name=x.name||x.customer||x.customerName||'';
    x.service=x.service||x.serviceType||'';
    x.jcNo=x.jcNo||x.jc||x.JCNo||'';
    return x;
  }
  function estimateMine(e){
    if(typeof raviEstimateIsMine==='function') return raviEstimateIsMine(e);
    if(!window.USER) return false;
    return String(e.empno||'')===String(USER.empno||'') || String(e.empname||'').toUpperCase()===String(USER.personName||'').toUpperCase();
  }
  function applyDeliveredFilter(){
    const scoped=(typeof blIsScoped==='function' && blIsScoped());
    let hidden=0;
    let rows=(window.RAVI_BL_RAW_DATA||[]).map(normalizeEstimate).filter(function(e){
      if(typeof wsAllowed==='function' && !wsAllowed(e.ws)) return false;
      if(scoped && !estimateMine(e)) return false;
      const rg=regOfEstimate(e);
      if(rg && window.RAVI_BL_HU_DELIVERED[rg] && !window.RAVI_BL_HU_ACTIVE[rg]){ hidden++; return false; }
      return true;
    });
    rows.sort(function(a,b){
      const ad=String(a.dateKey||''), bd=String(b.dateKey||'');
      if(ad!==bd) return bd.localeCompare(ad);
      return Number(b.ts||Date.parse(b.time||'')||0)-Number(a.ts||Date.parse(a.time||'')||0);
    });
    window.RAVI_BL_HIDDEN_DELIVERED_COUNT=hidden;
    window.BL_DATA=rows;
  }
  function fmtDate(dk, longForm){
    const d=new Date(String(dk||'')+'T00:00:00');
    if(isNaN(d.getTime())) return dk||'No Date';
    return longForm ? d.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}) : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
  }
  function money(v){ return (typeof inr==='function') ? inr(v||0) : ('₹'+Math.round(Number(v||0)).toLocaleString('en-IN')); }
  function devPct(e){ return (typeof blDevPct==='function') ? blDevPct(e) : null; }
  function devColor(p){ return (typeof blDevColor==='function') ? blDevColor(p) : '#6b7280'; }
  function getVal(id){ return (document.getElementById(id)||{}).value||''; }
  function monthKey(dk){ return String(dk||'').slice(0,7); }
  function filteredRows(){
    const fWs=getVal('bl-f-ws'), fSa=getVal('bl-f-sa'), fSvc=getVal('bl-f-service'), fM=getVal('bl-f-month'), fD=getVal('bl-f-day'), fB=getVal('bl-f-billed');
    const fS=String(getVal('bl-f-search')).toLowerCase().trim();
    return (window.BL_DATA||[]).filter(function(e){
      if(fWs && String(e.ws||'')!==fWs) return false;
      if(fSa && String(e.empname||'')!==fSa) return false;
      if(window.BL_SA_FILTER && String(e.empname||'')!==window.BL_SA_FILTER) return false;
      if(fSvc && String(e.service||'')!==fSvc) return false;
      if(fM && monthKey(e.dateKey)!==fM) return false;
      if(fD && e.dateKey!==fD) return false;
      const billed=Number(e.billed||0)>0;
      if(fB==='billed' && !billed) return false;
      if(fB==='unbilled' && billed) return false;
      if(fB==='dev'){ const p=devPct(e); if(p===null||Math.abs(p)<=25) return false; }
      if(fS){ const hay=(String(e.reg||'')+' '+String(e.name||'')+' '+String(e.jcNo||'')+' '+String(e.model||'')+' '+String(e.empname||'')).toLowerCase(); if(!hay.includes(fS)) return false; }
      return true;
    });
  }
  function renderKpis(rows){
    const krow=document.getElementById('bl-kpi-row'); if(!krow) return;
    const estTot=rows.reduce((s,e)=>s+Number(e.total||0),0);
    const billedRows=rows.filter(e=>Number(e.billed||0)>0);
    const billTot=billedRows.reduce((s,e)=>s+Number(e.billed||0),0);
    const estOfBilled=billedRows.reduce((s,e)=>s+Number(e.total||0),0);
    const p=estOfBilled>0?Math.round(((billTot-estOfBilled)/estOfBilled)*1000)/10:null;
    const fmt=v=>v>=100000?(Math.round(v/10000)/10)+' L':money(v);
    krow.innerHTML=[
      {ic:'🧾',n:rows.length,label:'Visible Estimates',color:'#2563eb'},
      {ic:'₹',n:fmt(estTot),label:'Estimate Value',color:'#7c3aed'},
      {ic:'✅',n:billedRows.length,label:'Billed',color:'#16a34a'},
      {ic:'💰',n:fmt(billTot),label:'Billed Value',color:'#166534'},
      {ic:'📉',n:rows.length-billedRows.length,label:'Unbilled / Pending',color:'#d97706'},
      {ic:'🚫',n:window.RAVI_BL_HIDDEN_DELIVERED_COUNT||0,label:'Delivered Hidden',color:'#64748b'}
    ].map(k=>`<div class="hu-kpi-tile" style="--ktc:${k.color}"><span class="kt-ic">${k.ic}</span><div class="kt-body"><div class="kt-n">${k.n}</div><div class="kt-label">${k.label}</div></div></div>`).join('');
  }
  function renderSaStrip(rows){
    const strip=document.getElementById('bl-sa-strip'); if(!strip) return;
    if(typeof blIsScoped==='function' && blIsScoped()){ strip.style.display='none'; return; }
    const by={}; rows.forEach(function(e){ const n=String(e.empname||'—'); if(!by[n]) by[n]={c:0,est:0,bill:0}; by[n].c++; by[n].est+=Number(e.total||0); by[n].bill+=Number(e.billed||0); });
    strip.style.display='flex';
    strip.innerHTML='<span class="hu-slicer-label">SA-wise:</span>'+Object.entries(by).sort((a,b)=>b[1].est-a[1].est).map(function(pair){
      const n=pair[0], v=pair[1];
      return `<button class="hu-sl-btn${window.BL_SA_FILTER===n?' active':''}" onclick="blSetSa('${String(n).replace(/'/g,"\\'")}')" title="Estimate ${money(v.est)} · Billed ${money(v.bill)}">${esc(n)} <span class="sl-count">${v.c}</span></button>`;
    }).join('');
  }

  const OLD_BL_BUILD_FILTERS=window.blBuildFilters;
  window.blBuildFilters=function(){
    if(OLD_BL_BUILD_FILTERS) OLD_BL_BUILD_FILTERS();
    const note=document.getElementById('bl-delivered-note');
    if(!note){
      const info=document.getElementById('bl-info');
      if(info && info.parentNode){
        const d=document.createElement('div'); d.id='bl-delivered-note'; d.className='bl-hidden-note';
        info.parentNode.insertBefore(d, info.nextSibling);
      }
    }
    const el=document.getElementById('bl-delivered-note');
    if(el){
      el.textContent=(blIsScoped()?'Your estimates only':'All estimates, all advisors')+' — month-wise and day-wise. Delivered/Clear vehicles found in Holdup are hidden automatically. Hidden now: '+(window.RAVI_BL_HIDDEN_DELIVERED_COUNT||0)+'.';
    }
  };

  window.blBoot=function(){
    window.BL_SA_FILTER=''; window.BL_UNMATCHED=null;
    const h=document.querySelector('#view-billing h2');
    if(h) h.textContent = blIsScoped() ? 'My Estimates Register' : 'All Estimates Register';
    const wrap=document.getElementById('bl-table-wrap');
    if(wrap) wrap.innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)">Loading all estimates month-wise / day-wise…</div>';
    const scoped=(typeof blIsScoped==='function' && blIsScoped());
    const up=document.getElementById('bl-upload-btns');
    if(up){ up.querySelectorAll('label').forEach(function(l){ l.style.display=scoped?'none':'inline-flex'; }); }
    loadHoldupMaps(function(){
      const params={days:370};
      if(scoped && window.USER) params.empno=USER.empno;
      if(typeof jgetReliable!=='function'){ if(wrap) wrap.innerHTML='<div class="hint">Backend connector not ready.</div>'; return; }
      jgetReliable('estimates_all', params, function(res,isStale){
        if(!res||res.ok===false){
          if(!isStale && wrap) wrap.innerHTML='<div style="text-align:center;padding:40px;color:var(--signal-d)"><b>Could not load all estimates.</b><br>Backend must support <span class="mono">estimates_all</span>. Deploy latest Apps Script and tap Refresh.</div>';
          return;
        }
        window.RAVI_BL_RAW_DATA=(res.entries||[]);
        applyDeliveredFilter();
        window.blBuildFilters();
        window.blRender();
      }, 25000);
    });
    if(typeof jgetRaw==='function') jgetRaw('billing_status', {}, function(st){ window.BL_STATUS=st; if(typeof blRenderStatusLine==='function') blRenderStatusLine(); }, 15000);
  };

  window.blRender=function(){
    const rows=filteredRows();
    window.BL_ROWS_CURRENT=rows;
    if(typeof BL_LEAK_OPEN!=='undefined' && BL_LEAK_OPEN && typeof blRenderLeakage==='function') blRenderLeakage();
    renderKpis(rows); renderSaStrip(rows);
    const wrap=document.getElementById('bl-table-wrap'); if(!wrap) return;
    if(!rows.length){ wrap.innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)"><div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-weight:700">No estimates match the current filters</div></div>'; return; }
    let activeRegs={};
    try{ Object.keys(window.RAVI_BL_HU_ACTIVE||{}).forEach(k=>activeRegs[k]=true); }catch(e){}
    const dayStats={};
    rows.forEach(function(e){ const dk=e.dateKey||'No Date'; if(!dayStats[dk]) dayStats[dk]={c:0,est:0,bill:0}; dayStats[dk].c++; dayStats[dk].est+=Number(e.total||0); dayStats[dk].bill+=Number(e.billed||0); });
    if(window.innerWidth<=760){
      let html='', last='';
      rows.forEach(function(e){
        const dk=e.dateKey||'No Date', ds=dayStats[dk];
        if(dk!==last){ html+=`<div class="bl-day-head"><span>${esc(fmtDate(dk,true))}</span><span class="meta">${ds.c} est · ${money(ds.est)}</span></div>`; last=dk; }
        const p=devPct(e), c=devColor(p), billed=Number(e.billed||0), inHu=activeRegs[regOfEstimate(e)];
        html+=`<div class="blm-card" style="border-left-color:${c}">
          <div class="blm-top"><div><span class="blm-reg">${esc(e.reg||'—')}</span><span class="blm-model"> · ${esc(e.model||'')}</span>${inHu?'<span class="blm-hu">HOLDUP</span>':''}</div><span class="blm-date">${esc(fmtDate(e.dateKey,false))}</span></div>
          <div class="blm-mid">${esc(e.name||'')} · ${esc(e.service||'')} · <b>${esc(e.empname||'')}</b> · ${esc(e.ws||'')}</div>
          <div class="blm-amts"><span>Est <b>${money(e.total||0)}</b></span><span>Billed <b style="color:${billed?'#166534':'#9ca3af'}">${billed?money(billed):'—'}</b></span><span style="color:${c};font-weight:800">${p===null?'':(p>0?'+':'')+p+'%'}</span></div>
          ${e.jcNo?`<div class="blm-jc">JC ${esc(e.jcNo)}</div>`:''}
        </div>`;
      });
      wrap.innerHTML=html; return;
    }
    let body='', last='';
    rows.forEach(function(e){
      const dk=e.dateKey||'No Date', ds=dayStats[dk];
      if(dk!==last){ body+=`<tr class="bl-day-row"><td colspan="13">${esc(fmtDate(dk,true))} <span style="font-family:'Roboto Mono';font-size:11px;color:#64748b;margin-left:10px">${ds.c} estimates · Est ${money(ds.est)} · Billed ${money(ds.bill)}</span></td></tr>`; last=dk; }
      const p=devPct(e), c=devColor(p), billed=Number(e.billed||0), varr=billed?billed-Number(e.total||0):null, inHu=activeRegs[regOfEstimate(e)];
      body+=`<tr>
        <td style="white-space:nowrap;font-size:11px">${esc(fmtDate(e.dateKey,false))}</td>
        <td class="td-reg">${esc(e.reg||'—')}</td>
        <td style="font-size:12px;white-space:nowrap">${esc(e.model||'—')}</td>
        <td style="font-size:12px">${esc(e.name||'—')}</td>
        <td style="font-size:11px;white-space:nowrap">${esc(e.service||'—')}</td>
        <td style="font-size:11px;white-space:nowrap">${esc(e.empname||'—')}</td>
        <td style="font-size:11px">${esc(e.ws||'—')}</td>
        <td style="text-align:right;font-weight:700;white-space:nowrap">${money(e.total||0)}</td>
        <td style="text-align:right;font-weight:700;white-space:nowrap;color:${billed?'#166534':'#9ca3af'}">${billed?money(billed):'—'}</td>
        <td style="text-align:right;white-space:nowrap;color:${varr===null?'#9ca3af':varr>=0?'#166534':'#b91c1c'}">${varr===null?'—':(varr>0?'+':'')+money(varr)}</td>
        <td style="text-align:right;font-weight:800;color:${c}">${p===null?'—':(p>0?'+':'')+p+'%'}</td>
        <td style="font-size:10px;color:var(--steel);white-space:nowrap">${esc(e.jcNo||'—')}</td>
        <td style="text-align:center">${inHu?'<span title="Vehicle currently in active holdup" style="font-size:13px">⛔</span>':''}</td>
      </tr>`;
    });
    wrap.innerHTML=`<table class="hu-excel-table"><thead><tr>
      <th>Date</th><th>Reg No</th><th>Model</th><th>Customer</th><th>Service</th><th>SA</th><th>WS</th>
      <th style="text-align:right">Estimate ₹</th><th style="text-align:right">Billed ₹</th><th style="text-align:right">Var ₹</th><th style="text-align:right">Dev %</th><th>JC Number</th><th>⛔</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  };

  /* Parts and SA quick links should no longer open today's-only popups. */
  window.raviOpenPartsEstimates=function(){ window.blBoot(); if(typeof showView==='function') showView('billing'); };
  const OLD_RAVI_OPEN_SA_KPI=window.raviOpenSaKpi;
  window.raviOpenSaKpi=function(kind){
    if(kind==='estimates' || kind==='estvalue'){
      // INSTANT, from today's already-loaded data — no new fetch, no 92/180-day pull.
      // (Ravi 21-Jul: an estimate from 15-Jul was showing under "Today" because the old
      // path opened a 92-day history view under the "Today" label. Now "Today" really
      // means today, and is instant because the data is already in memory from the
      // home-screen KPI calculation.)
      const m=heroModal(); if(!m.modal) return;
      const mine=window.RAVI_TODAY_EST_CACHE||[];
      m.title.textContent = kind==='estvalue' ? "Today's Estimate Value" : 'My Estimates Today';
      const histBtn='<button class="btn ghost sm" style="width:100%;margin-bottom:8px" onclick="window.blBoot();if(typeof showView===\'function\')showView(\'billing\')">📅 All My Estimates — full history</button>';
      if(!mine.length){ m.body.innerHTML=histBtn+'<div class="hint">No estimates prepared by you yet today.</div>'; m.modal.style.display='block'; return; }
      if(kind==='estvalue'){
        const total=mine.reduce((s,e)=>s+esEntryTotal(e),0);
        m.body.innerHTML=histBtn+`<div class="ctlitem"><div><div class="big">${mine.length} estimate(s) today</div><div class="small">Total value so far</div></div><div><span class="badge done">${inr(total)}</span></div></div>`;
      } else {
        m.body.innerHTML=histBtn+mine.map((e,i)=>`<div class="ctlitem"><div><div class="big">${i+1}. ${raviEsc(e.reg||'')} · ${raviEsc(e.model||'')}</div>
          <div class="small">${raviEsc(e.name||'')} · ${raviEsc(e.service||'')}</div></div><div><span class="badge done">${inr(esEntryTotal(e))}</span></div></div>`).join('');
      }
      m.modal.style.display='block';
      return;
    }
    if(OLD_RAVI_OPEN_SA_KPI) return OLD_RAVI_OPEN_SA_KPI(kind);
  };
})();
