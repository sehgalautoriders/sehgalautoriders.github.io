/* ============================================================
   07-partsfinder.js
   All-India Part Finder module

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ================================================================================
   ===== v11.2 — ALL-INDIA PART FINDER (frontend) ================================
   ===== Data path 1: daily stock upload -> backend PartStock -> instant lookup.
   ===== Data path 2: live Power BI "Copy as fetch" (manual token, phase-1).
   ===== Embedded in SA estimate via a "Check All-India stock" button per part.
   ================================================================================ */
let PF_RESULT=null, PF_PART='';
function pfInfo(msg,kind){
  const el=document.getElementById('pf-info'); if(!el) return;
  el.style.display='block';
  el.style.background=kind==='error'?'#fef2f2':(kind==='warn'?'#fff7ed':'#ecfeff');
  el.style.color=kind==='error'?'#b91c1c':(kind==='warn'?'#b45309':'#0e7490');
  el.textContent=msg;
}
function pfBoot(){
  jgetRaw('part_stock_status',{},function(st){
    if(!st||st.ok===false) return;
    if(!st.rows){ pfInfo('No stock uploaded yet — upload your daily stock export (Final_Stock.xlsx) once to search instantly.','warn'); }
    else pfInfo('Stock loaded: '+st.rows+' rows · Stock date '+(st.stockDate||'—')+' · Last upload '+(st.lastUpload||'—'),'ok');
  },15000);
}
function pfVal(id){ return (document.getElementById(id)||{}).value||''; }

/* ---- daily stock upload ---- */
function pfLocalDate(v){
  if(v instanceof Date && !isNaN(v)) return v.getFullYear()+'-'+('0'+(v.getMonth()+1)).slice(-2)+'-'+('0'+v.getDate()).slice(-2);
  const s=String(v||'').trim(); if(!s) return '';
  const d=new Date(s); return isNaN(d)?s:d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
async function pfPostChunks(records, wipeFirst){
  const CH=500;
  for(let i=0;i<records.length;i+=CH){
    await jpost({type:'upsert_part_stock', records:records.slice(i,i+CH), wipeFirst: (i===0 && wipeFirst)});
    pfInfo('Uploading stock… '+Math.min(i+CH,records.length)+' / '+records.length+' rows','warn');
  }
}
function pfTownFromDealer(dealer, town){
  if(town) return town;
  return ''; // stock file may carry Town separately; else blank
}
function pfHandleStockFile(input){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_pfHandleStockFile){ heroEnsureLibs('xlsx', function(ok){ if(!ok) return; window.__heroLibsOK_pfHandleStockFile=1; pfHandleStockFile(input); window.__heroLibsOK_pfHandleStockFile=0; }); return; }

  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    try{
      const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array',cellDates:true});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
      if(!rows.length || rows[0]['Part Number']===undefined || rows[0]['Curr Qty']===undefined){
        pfInfo('This does not look like a stock export — "Part Number" / "Curr Qty" columns not found.','error'); return;
      }
      const recs=rows.map(r=>({
        pn:String(r['Part Number']||'').trim(),
        desc:String(r['Part Description']||r['Parts Description']||''),
        dealerCode:String(r['Dealer Code']||'').trim(),
        dealer:String(r['Dealer Name']||''),
        zonal:String(r['Zonal Office']||''),
        area:String(r['Area Office']||''),
        town:String(r['Town']||r['Dealer City']||''),
        loc:String(r['Inventory Location']||''),
        ptype:String(r['Product Type']||''),
        pcat:String(r['Product Category']||''),
        qty:Number(r['Curr Qty']||0),
        dlc:Number(r['Curr DLC']||0),
        dlcVal:Number(r['DLC Value']||0),
        date:pfLocalDate(r['Date'])
      })).filter(r=>r.pn);
      if(!recs.length){ pfInfo('No part rows found in the file.','error'); return; }
      pfInfo('Read '+recs.length+' stock rows · uploading (this replaces the previous stock)…','warn');
      await pfPostChunks(recs, true);
      pfInfo('✓ Stock uploaded: '+recs.length+' rows. You can now search any part instantly.','ok');
    }catch(err){ pfInfo('Could not parse file: '+err.message,'error'); }
  };
  reader.readAsArrayBuffer(file);
  input.value='';
}

/* ---- search (backend stock) ---- */
function pfSearch(){
  const pn=pfVal('pf-partno').trim().toUpperCase();
  if(!pn){ pfInfo('Enter a part number first.','warn'); return; }
  PF_PART=pn;
  document.getElementById('pf-table-wrap').innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)">Searching all-India stock for '+pn+'…</div>';
  jgetRaw('find_part_stock',{pn:pn},function(res){
    if(!res||res.ok===false){ pfInfo('Search failed — check connection.','error'); return; }
    PF_RESULT=res;
    if(!res.rows.length){ pfInfo('No stock found for '+pn+' in the uploaded data. Try the live Power BI fetch below for all-India availability.','warn'); }
    else pfInfo('Found '+pn+(res.summary.desc?' — '+res.summary.desc:'')+' at '+res.summary.dealers+' dealers.','ok');
    pfBuildFilters(); pfRender();
  },20000);
}

/* ---- Live Power BI via server-side auto-login (v11.3) ---- */
function pfLiveAuto(){
  const pn=pfVal('pf-partno').trim().toUpperCase();
  if(!pn){ pfInfo('Enter a part number first.','warn'); return; }
  PF_PART=pn;
  document.getElementById('pf-table-wrap').innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)">⚡ Logging in to Hero BI and fetching all-India stock for '+pn+'…<div style="font-size:12px;margin-top:6px">First fetch after idle can take 10–20 seconds.</div></div>';
  pfInfo('⚡ Auto-login + live fetch for '+pn+'…','warn');
  jgetRaw('find_part_live',{pn:pn},function(res){
    if(!res){ pfInfo('No response — check connection and retry.','error'); return; }
    if(res.ok===false){
      let msg='Live fetch failed: '+(res.error||'unknown');
      if(res.error==='LOGIN_FAILED') msg='Auto-login not enabled/allowed yet. Run pbiLoginTest() in Apps Script once to see why, or use the manual fallback below.';
      else if(res.error==='TOKEN_REJECTED') msg='Power BI rejected the login token. Re-run pbiLoginTest() in Apps Script.';
      else if(String(res.error).indexOf('SETUP')>-1) msg=res.error;
      else if(res.detail) msg+=' — '+res.detail;
      pfInfo(msg,'error');
      document.getElementById('pf-table-wrap').innerHTML='<div style="text-align:center;padding:36px;color:var(--steel)"><div style="font-size:30px">🔐</div><div style="font-weight:700;margin-top:6px">Live auto-login not available yet</div><div style="font-size:12px;margin-top:4px;max-width:460px;margin-left:auto;margin-right:auto">'+msg+'</div></div>';
      return;
    }
    PF_RESULT=res;
    if(!res.rows.length) pfInfo('Live: no stock anywhere in India for '+pn+' right now.','warn');
    else pfInfo('✓ LIVE all-India stock for '+pn+(res.summary.desc?' — '+res.summary.desc:'')+' · '+res.summary.dealers+' dealers · fetched just now.','ok');
    pfBuildFilters(); pfRender();
  },45000);
}
/* ---- Live Power BI via manual paste (fallback) ---- */
function pfParseFetch(text){
  const m=text.match(/fetch\(\s*(['"])(.*?)\1/s); if(!m) throw new Error('Paste a Chrome "Copy as fetch" block.');
  const url=m[2];
  let headers={};
  const hi=text.indexOf('"headers"');
  if(hi>=0){ // balanced object extract
    let i=text.indexOf('{',hi), depth=0, inStr=false, esc=false, end=-1;
    for(let j=i;j<text.length;j++){ const c=text[j];
      if(inStr){ if(esc)esc=false; else if(c==='\\')esc=true; else if(c==='"')inStr=false; }
      else { if(c==='"')inStr=true; else if(c==='{')depth++; else if(c==='}'){depth--; if(depth===0){end=j;break;}} } }
    if(end>0){ try{ headers=JSON.parse(text.slice(i,end+1)); }catch(e){} }
  }
  const bm=text.match(/"body"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  let body=null; if(bm){ try{ body=JSON.parse(JSON.parse('"'+bm[1]+'"')); }catch(e){} }
  return {url,headers,body};
}
function pfReplacePartFilter(node, pn){
  let n=0;
  (function walk(x){
    if(x&&typeof x==='object'){
      if(x.Literal&&typeof x.Literal.Value==='string'){
        const inner=x.Literal.Value.replace(/^'|'$/g,'');
        if(/^[A-Z0-9]{8,18}$/.test(inner)){ x.Literal.Value="'"+pn+"'"; n++; }
      }
      for(const k in x) walk(x[k]);
    } else if(Array.isArray(x)) x.forEach(walk);
  })(node);
  return n;
}
async function pfLiveFetch(){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_pfLiveFetch){ heroEnsureLibs('xlsx', function(ok){ if(!ok) return; window.__heroLibsOK_pfLiveFetch=1; pfLiveFetch(); window.__heroLibsOK_pfLiveFetch=0; }); return; }

  const pn=pfVal('pf-partno').trim().toUpperCase();
  if(!pn){ pfInfo('Enter a part number first.','warn'); return; }
  const raw=pfVal('pf-fetch').trim();
  if(!raw){ pfInfo('Paste the Power BI "Copy as fetch" block first.','warn'); return; }
  let parsed; try{ parsed=pfParseFetch(raw); }catch(e){ pfInfo(e.message,'error'); return; }
  if(!parsed.body){ pfInfo('Could not read the request body from that fetch. Re-copy it from the export/xlsx request.','error'); return; }
  const body=JSON.parse(JSON.stringify(parsed.body));
  const cnt=pfReplacePartFilter(body, pn);
  if(!cnt){ pfInfo('Could not find a part-number filter in that request — copy the fetch from the export/xlsx call that returned the stock table.','error'); return; }
  // clean headers browsers refuse to set
  const headers={}; Object.keys(parsed.headers||{}).forEach(k=>{ const kl=k.toLowerCase();
    if(['content-length','host','connection','accept-encoding'].includes(kl)||kl.startsWith(':')||kl.startsWith('sec-')) return; headers[k]=parsed.headers[k]; });
  headers['content-type']=headers['content-type']||'application/json;charset=UTF-8';
  PF_PART=pn;
  pfInfo('Fetching live from Power BI for '+pn+'… (token expires ~1h; re-paste if this fails)','warn');
  try{
    const r=await fetch(parsed.url,{method:'POST',headers,body:JSON.stringify(body),credentials:'include'});
    if(!r.ok){ const t=await r.text().catch(()=>''); pfInfo('Power BI returned '+r.status+(r.status===401||r.status===403?' — session expired. Re-copy a fresh "Copy as fetch" and paste again.':(': '+t.slice(0,120))),'error'); return; }
    const buf=await r.arrayBuffer();
    const wb=XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    pfResultFromRows(rows, pn);
    pfInfo('✓ Live all-India stock fetched for '+pn+' — '+rows.length+' rows.','ok');
  }catch(e){ pfInfo('Live fetch blocked by the browser (CORS) or network. Use the daily stock upload, or the standalone finder, then upload that Excel here.','error'); }
}
/* Build the same result shape from raw exported rows (live or uploaded excel) */
function pfResultFromRows(rows, pn){
  const OWN={'23490':1,'17057':1,'10307':1};
  const out=[]; let totalQty=0; const dealers={}; const byZonal={};
  rows.forEach(r=>{
    const qty=Number(r['Curr Qty']||0); if(qty<=0) return;
    const dc=String(r['Dealer Code']||'').trim();
    const area=String(r['Area Office']||''); const zonal=String(r['Zonal Office']||'');
    out.push({pn:pn, desc:String(r['Part Description']||r['Parts Description']||''), dealerCode:dc,
      dealer:String(r['Dealer Name']||''), zonal, area, town:String(r['Town']||r['Dealer City']||''),
      loc:String(r['Inventory Location']||''), ptype:String(r['Product Type']||''), pcat:String(r['Product Category']||''),
      qty, dlc:Number(r['Curr DLC']||0), dlcVal:Number(r['DLC Value']||0), date:String(r['Date']||''),
      own:!!OWN[dc], pune:/pune/i.test(area)});
    totalQty+=qty; dealers[dc]=1;
    if(!byZonal[zonal]) byZonal[zonal]={qty:0,dealers:{}}; byZonal[zonal].qty+=qty; byZonal[zonal].dealers[dc]=1;
  });
  out.sort((a,b)=> a.own!==b.own?(a.own?-1:1) : a.pune!==b.pune?(a.pune?-1:1) : b.qty-a.qty);
  PF_RESULT={ok:true,pn:pn,rows:out,summary:{rows:out.length,totalQty,dealers:Object.keys(dealers).length,
    desc:out.length?out[0].desc:'',
    zonal:Object.keys(byZonal).map(z=>({zonal:z,qty:byZonal[z].qty,dealers:Object.keys(byZonal[z].dealers).length})).sort((a,b)=>b.qty-a.qty)}};
  pfBuildFilters(); pfRender();
}

function pfBuildFilters(){
  if(!PF_RESULT) return;
  document.getElementById('pf-filters').style.display='flex';
  const rows=PF_RESULT.rows;
  const fill=(id,vals)=>{ const el=document.getElementById(id); if(!el) return; const cur=el.value;
    el.innerHTML=el.options[0].outerHTML+[...new Set(vals.filter(Boolean))].sort().map(v=>`<option value="${v}">${v}</option>`).join('');
    if([...el.options].some(o=>o.value===cur)) el.value=cur; };
  fill('pf-f-area',rows.map(r=>r.area));
  fill('pf-f-town',rows.map(r=>r.town));
  fill('pf-f-zonal',rows.map(r=>r.zonal));
}
function pfFiltered(){
  if(!PF_RESULT) return [];
  const fA=pfVal('pf-f-area'), fT=pfVal('pf-f-town'), fZ=pfVal('pf-f-zonal');
  const own=document.getElementById('pf-f-own')&&document.getElementById('pf-f-own').checked;
  const q=pfVal('pf-f-search').toLowerCase().trim();
  return PF_RESULT.rows.filter(r=>{
    if(fA&&r.area!==fA) return false;
    if(fT&&r.town!==fT) return false;
    if(fZ&&r.zonal!==fZ) return false;
    if(own&&!r.own) return false;
    if(q&&!((r.dealer+' '+r.town+' '+r.area).toLowerCase().includes(q))) return false;
    return true;
  });
}
function pfRender(){
  if(!PF_RESULT){ return; }
  const rows=pfFiltered();
  const totalQty=rows.reduce((s,r)=>s+r.qty,0);
  const dealers=new Set(rows.map(r=>r.dealerCode)).size;
  const ownQty=rows.filter(r=>r.own).reduce((s,r)=>s+r.qty,0);
  const puneQty=rows.filter(r=>r.pune).reduce((s,r)=>s+r.qty,0);
  document.getElementById('pf-kpi-row').innerHTML=[
    {ic:'📦',n:totalQty,label:'Total Qty (India)',color:'#0891b2'},
    {ic:'🏢',n:dealers,label:'Dealers',color:'#2563eb'},
    {ic:'🏠',n:ownQty,label:'Sehgal Own Stock',color:'#16a34a'},
    {ic:'📍',n:puneQty,label:'Pune Area Qty',color:'#7c3aed'},
    {ic:'🧾',n:rows.length,label:'Locations',color:'#d97706'}
  ].map(k=>`<div class="hu-kpi-tile" style="--ktc:${k.color}"><span class="kt-ic">${k.ic}</span><div class="kt-body"><div class="kt-n">${k.n}</div><div class="kt-label">${k.label}</div></div></div>`).join('');

  const strip=document.getElementById('pf-zonal-strip');
  if(strip && PF_RESULT.summary && PF_RESULT.summary.zonal){
    strip.style.display='flex';
    strip.innerHTML='<span class="hu-slicer-label">Zonal:</span>'+PF_RESULT.summary.zonal.map(z=>`<span class="hu-sl-btn" style="cursor:default">${z.zonal||'—'} <span class="sl-count">${z.qty}</span> · ${z.dealers}d</span>`).join('');
  }

  const wrap=document.getElementById('pf-table-wrap');
  if(!rows.length){ wrap.innerHTML='<div style="text-align:center;padding:40px;color:var(--steel)"><div style="font-size:32px;margin-bottom:8px">🔍</div><div style="font-weight:700">No stock rows match the current filters</div></div>'; return; }
  if(window.innerWidth<=760){
    wrap.innerHTML=rows.map(r=>`<div class="blm-card" style="border-left-color:${r.own?'#16a34a':r.pune?'#7c3aed':'#0891b2'}">
      <div class="blm-top"><div><span class="blm-reg" style="font-size:14px">${r.dealer||r.dealerCode}</span>${r.own?'<span class="blm-hu" style="background:#dcfce7;color:#166534;border-color:#86efac">SEHGAL</span>':r.pune?'<span class="blm-hu" style="background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe">PUNE</span>':''}</div><span style="font-weight:800;color:#0891b2">${r.qty} pc</span></div>
      <div class="blm-mid">${r.town||''} · ${r.area||''} · ${r.loc||''}</div>
      <div class="blm-mid" style="font-size:10px">DLC ₹${r.dlc} · Value ₹${Math.round(r.dlcVal)}</div>
    </div>`).join('');
    return;
  }
  wrap.innerHTML=`<table class="hu-excel-table"><thead><tr>
    <th>Dealer</th><th>Town</th><th>Area Office</th><th>Zonal</th><th>Inventory Location</th><th style="text-align:right">Qty</th><th style="text-align:right">DLC ₹</th><th></th>
  </tr></thead><tbody>${rows.map(r=>`<tr${r.own?' style="background:#f0fdf4"':(r.pune?' style="background:#faf5ff"':'')}>
    <td class="td-reg" style="font-size:12px">${r.dealer||r.dealerCode}${r.own?' <span style="font-size:9px;background:#dcfce7;color:#166534;border-radius:4px;padding:1px 4px;font-weight:800">SEHGAL</span>':''}</td>
    <td style="font-size:12px">${r.town||'—'}</td>
    <td style="font-size:11px">${r.area||'—'}</td>
    <td style="font-size:11px">${(r.zonal||'').replace('Zonal Office - ','')||'—'}</td>
    <td style="font-size:11px">${r.loc||'—'}</td>
    <td style="text-align:right;font-weight:800;color:#0891b2">${r.qty}</td>
    <td style="text-align:right;font-size:12px">${inr(r.dlc)}</td>
    <td style="text-align:center">${r.town?`<a href="tel:" onclick="return false" title="Phone directory coming in next phase" style="opacity:.4">📞</a>`:''}</td>
  </tr>`).join('')}</tbody></table>`;
}
function pfDownload(){
  /* SPEED 1 (26-Jul-2026): the export libraries are no longer loaded at startup.
     Make sure this one's tools are in memory, then run the real work. Costs nothing
     when they are already warm, which they normally are. */
  if(!window.__heroLibsOK_pfDownload){ heroEnsureLibs('xlsx', function(ok){ if(!ok) return; window.__heroLibsOK_pfDownload=1; pfDownload(); window.__heroLibsOK_pfDownload=0; }); return; }

  const rows=pfFiltered(); if(!rows.length){ alert('Nothing to download.'); return; }
  if(!window.XLSX){ alert('Excel engine still loading, try again in a moment.'); return; }
  const aoa=[['Part Number','Description','Dealer Code','Dealer Name','Town','Area Office','Zonal Office','Inventory Location','Qty','Curr DLC','DLC Value','Stock Date']];
  rows.forEach(r=>aoa.push([r.pn,r.desc,r.dealerCode,r.dealer,r.town,r.area,r.zonal,r.loc,r.qty,r.dlc,r.dlcVal,r.date]));
  const ws=XLSX.utils.aoa_to_sheet(aoa), wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'PartStock');
  XLSX.writeFile(wb,'PartFinder_'+PF_PART+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* ---- Embedded quick-check from the SA estimate (per part row) ---- */
function pfQuickCheck(partNo){
  if(!partNo){ alert('This item has no Hero part number to search.'); return; }
  openModule('partfinder');
  setTimeout(()=>{ const inp=document.getElementById('pf-partno'); if(inp){ inp.value=partNo; pfSearch(); } },250);
}
