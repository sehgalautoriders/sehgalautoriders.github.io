/* ============================================================
   04-estimate.js
   Estimate module (pricing engine, PDF, labour map)

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ================= ESTIMATE MODULE ================= */
const ES_APP='Estimate';
const ES_FIELDS=[{key:'Model',label:'Model',def:{table:'MODEL',column:'MODEL'}}];
let ES_CONFIG={}, ES_TABLES=[], ES_MODEL_LIST=[], ES_MISSING=[];
/* Master-data driven tables — loaded in esBoot, fall back to hardcoded if empty */
let ES_PRICE_LAB=[], ES_PM_LAB=[], ES_LOCAL_PARTS=[], ES_PM_KITS=[], ES_MODEL_KIT_PARTS=[], ES_PART_LABOUR_MAP=[];
let ES_MODEL_PART=[], ES_PART_INDEX={cats:{}, all:[]}, ES_PART_SHOWALL=false;
/* Part → labour auto-link, driven by the REAL MD_PartLabourMap already in
   HeroMasterSheet (schema: Part Name | Labour 1 | Amount 1 | Job Code 1 | Labour 2 |
   Amount 2 | Job Code 2 | Labour 3 | Amount 3 | Job Code 3 | Complaint Code — actual
   Hero DMS job codes and complaint codes). One part can map to up to THREE labour
   lines (e.g. Front Fork Oil → seal + RH fork + LH fork; Battery → fitment + charging).
   Each returned labour carries its DMS job code and the complaint code, which flow
   into the estimate rows, the PDF, and the saved Items JSON for the billing executive. */
function esFindLinkedLabours(partLabel){
  const up=String(partLabel||'').toUpperCase().trim();
  if(!up) return null;
  for(const r of ES_PART_LABOUR_MAP){
    const key=String(r['Part Name']||r['Part']||'').trim().toUpperCase();
    if(!key) continue;
    if(up.indexOf(key)>-1 || key.indexOf(up)>-1){
      const cc=String(r['Complaint Code']||'').trim();
      const outL=[];
      [1,2,3].forEach(n=>{
        const l=String(r['Labour '+n]||'').trim();
        if(!l) return;
        outL.push({l:l, p:Number(r['Amount '+n]||0), code:String(r['Job Code '+n]||'').trim(), cc:cc});
      });
      if(outL.length) return {labours:outL, cc:cc, part:String(r['Part Name']||'').trim()};
    }
  }
  return null;
}

/* EXACT match on Part Name — used ONLY for the Demanded Repair dropdown, whose value is
   already the exact Part Name from MD_PartLabourMap. The fuzzy esFindLinkedLabours above
   is for free-typed part labels; using it for demanded repairs matched the wrong row and
   returned unrelated ("random") labour. This picks the exact row's labour + complaint code. */
function esFindDemandedLabours(name){
  const want=String(name||'').trim().toUpperCase();
  if(!want) return null;
  for(const r of ES_PART_LABOUR_MAP){
    if(String(r['Part Name']||'').trim().toUpperCase()!==want) continue;
    const cc=String(r['Complaint Code']||'').trim();
    const outL=[];
    [1,2,3].forEach(n=>{
      const l=String(r['Labour '+n]||'').trim();
      if(!l) return;
      outL.push({l:l, p:Number(r['Amount '+n]||0), code:String(r['Job Code '+n]||'').trim(), cc:cc});
    });
    if(outL.length) return {labours:outL, cc:cc, part:String(r['Part Name']||'').trim()};
  }
  return null;
}

/* --- Labour-code helpers: mapped from MD_PriceMaster_Labour / MD_PartLabourMap only --- */
function esLabCleanCode(v){
  return String(v==null?'':v).trim().replace(/\.0$/,'');
}
function esLabMoney(v){
  const n=Number(String(v==null?'':v).replace(/[₹,\s]/g,''));
  return isNaN(n)?0:n;
}
function esLabNorm(s){
  return String(s||'').toUpperCase()
    .replace(/&/g,' AND ')
    .replace(/\bR\s*\/\s*R\s*\/\s*C\b/g,' REMOVE REFIT CLEAN ')
    .replace(/\bR\s*\/\s*R\b/g,' REMOVE REFIT ')
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
const ES_LAB_STOPWORDS=new Set(['AND','THE','A','AN','OF','FOR','WITH','CHECK','INSPECTION','ADJUSTMENT','SERVICE','LABOUR','COMP','ASSY','ASSEMBLY','REMOVE','REFIT','CLEAN','R','I','CT']);
function esLabTokens(s){
  return esLabNorm(s).split(' ').filter(function(t){ return t && !ES_LAB_STOPWORDS.has(t) && t.length>1; });
}
function esLabModelScore(row, modelName){
  const m=String(modelName||val('es-model')||'').trim().toUpperCase();
  const rm=String(row['Model']||'').trim().toUpperCase();
  if(!m||!rm) return 0;
  if(rm===m) return 20;
  if(rm.replace(/\s+/g,'')===m.replace(/\s+/g,'')) return 18;
  if(rm.indexOf(m)>-1 || m.indexOf(rm)>-1) return 10;
  return 0;
}
function esFindPriceLabour(label, modelName){
  const want=esLabTokens(label);
  const raw=esLabNorm(label);
  if(!raw || !ES_PRICE_LAB.length) return null;
  let best=null, bestScore=0;
  ES_PRICE_LAB.forEach(function(r){
    const code=esLabCleanCode(r['Labour Code']);
    const desc=String(r['Labour Description']||'').trim();
    if(!code||!desc) return;
    const dn=esLabNorm(desc); if(!dn) return;
    const dt=esLabTokens(desc);
    const common=want.filter(function(t){ return dt.indexOf(t)>-1; }).length;
    let score=0;
    if(dn===raw) score=100;
    else if((dn.indexOf(raw)>-1 || raw.indexOf(dn)>-1) && Math.min(want.length,dt.length)>=2) score=80+Math.min(want.length,dt.length);
    else if(common>=2) score=40+common;
    // Do not accept one-token matches like THROTTLE/CABLE or CLUTCH/CABLE. That would show wrong DMS codes.
    if(!score) return;
    score += esLabModelScore(r, modelName);
    if(score>bestScore){
      bestScore=score;
      best={l:desc, p:esLabMoney(r['Latest Rate (PreGST)']||r['Default Price']||0), code:code, model:String(r['Model']||'').trim()};
    }
  });
  return bestScore>=40 ? best : null;
}
function esPriceLabourOptions(){
  // Manual Add Labour dropdown: direct DMS labour master only. No MD_VariableLabour.
  const byKey={};
  ES_PRICE_LAB.forEach(function(r){
    const code=esLabCleanCode(r['Labour Code']);
    const desc=String(r['Labour Description']||'').trim();
    if(!code||!desc||/_OLD$/i.test(code)) return;
    const price=esLabMoney(r['Latest Rate (PreGST)']||r['Default Price']||0);
    const item={k:'pl_'+Object.keys(byKey).length,l:desc,p:price,code:code,model:String(r['Model']||'').trim(),_score:esLabModelScore(r),_used:esLabMoney(r['Times Used']||0)};
    const key=code+'|'+esLabNorm(desc);
    const old=byKey[key];
    if(!old || item._score>old._score || (item._score===old._score && item._used>old._used)) byKey[key]=item;
  });
  // Organised by Labour Description (Ravi 20-Jul): the old score/usage order looked random.
  // The dedup above still keeps the best-matched row per code+description; here we simply
  // list them alphabetically so the SA can scan it like the DMS labour master.
  return Object.values(byKey).sort(function(a,b){ return a.l.localeCompare(b.l); });
}
function esFindPartLabourMappedCode(label){
  const raw=esLabNorm(label);
  const want=esLabTokens(label);
  if(!raw||!ES_PART_LABOUR_MAP.length) return '';
  for(const r of ES_PART_LABOUR_MAP){
    for(const n of [1,2,3]){
      const code=esLabCleanCode(r['Job Code '+n]);
      if(!code) continue;
      const candidates=[String(r['Labour '+n]||''), String(r['Part Name']||'')];
      for(const c of candidates){
        const cn=esLabNorm(c); if(!cn) continue;
        const ct=esLabTokens(c);
        const common=want.filter(t=>ct.indexOf(t)>-1).length;
        if(cn===raw || cn.indexOf(raw)>-1 || raw.indexOf(cn)>-1 || common>=2) return code;
      }
    }
  }
  return '';
}
function esMdVarItems(){
  // Ravi surgical edit: ignore MD_VariableLabour completely. Optional labour choices
  // are allowed only when the label can be mapped to a real Hero DMS row in
  // MD_PriceMaster_Labour. This prevents VL001/VL002-style dummy codes from appearing.
  const out=[];
  VAR.forEach(function(v){
    const m=esFindPriceLabour(v.l);
    if(!m) return;
    out.push({k:v.k,l:v.l,p:m.p,code:m.code});
  });
  return out;
}
function esMdPmLabour(serviceTypeFull){
  // serviceTypeFull e.g. "Free Service III", "Paid Service", "General Repair"
  if(!ES_PM_LAB.length) return null;
  const row=ES_PM_LAB.find(function(r){ return String(r['Service Type']||'').trim()===serviceTypeFull; });
  if(!row) return null;
  return {l:String(row['Labour Description']||'Preventive Maintenance Labour').trim(), p:Number(row['Default Labour']||0)};
}
function esMdLocalParts(){
  if(!ES_LOCAL_PARTS.length) return [];
  return ES_LOCAL_PARTS.map(function(r){ return {l:String(r['Description']||'').trim(),p:Number(r['Price']||0)}; }).filter(function(r){ return r.l; });
}
function esServiceBucket(dec){
  // Maps the app's service decision to the kit table's two buckets.
  // Free I/II/III = light kit; Free IV/V and Paid = heavier kit (matches the real
  // Hero FSC schedule: 1st/2nd/3rd get a cheap kit, 4th/5th/Paid get the bigger one).
  if(dec.type==='paid') return 'PAID_4_5_ONWARDS';
  if(dec.type==='free'){
    const n=dec.stage?dec.stage.n:'I';
    return (n==='IV'||n==='V') ? 'PAID_4_5_ONWARDS' : 'FREE_1_2_3';
  }
  return null; // joyride/general/accidental don't use the PM kit table
}
function esMdKitParts(modelName, serviceBucket){
  // FIX (price inflation bug): the old logic fuzzy-matched model words against a
  // "Model Group" column (e.g. "Glamour / Super Splendor"), so ONE model could match
  // MULTIPLE kit-group rows simultaneously, stacking 2-3 kits into one estimate and
  // pushing Paid Service past ₹6000. This now does an EXACT (Model, ServiceBucket)
  // lookup against MD_ModelKitParts — exactly one kit, every time, no stacking.
  if(!modelName||!serviceBucket) return [];
  const mUp=modelName.trim().toUpperCase();
  if(ES_MODEL_KIT_PARTS.length){
    const rows=ES_MODEL_KIT_PARTS.filter(function(r){
      return String(r['Model']||'').trim().toUpperCase()===mUp && String(r['ServiceBucket']||'').trim().toUpperCase()===serviceBucket;
    });
    if(rows.length) return rows.map(function(r){ return {l:String(r['Description']||'').trim(),p:Number(r['Price']||0)}; }).filter(function(r){ return r.l&&r.p>0; });
    // No exact match for this model (not yet in the corrected table) — fall through
  }
  // Fallback only if MD_ModelKitParts has no row for this model yet — still take just
  // the FIRST matching Model Group, never stack multiple groups together.
  if(!ES_PM_KITS.length) return [];
  const words=mUp.split(/[\s\/\(\)]+/).filter(function(w){ return w.length>=4; });
  if(!words.length) return [];
  const firstMatch=ES_PM_KITS.find(function(r){
    const mg=String(r['Model Group']||'').toUpperCase();
    const mgWords=mg.split(/[\s\/\(\)]+/).filter(function(w){return w.length>=4;});
    return words.some(function(w){ return mgWords.some(function(mw){ return mw===w||mw.includes(w)||w.includes(mw); }); });
  });
  if(!firstMatch) return [];
  const matchedGroup=firstMatch['Model Group'];
  return ES_PM_KITS.filter(function(r){ return r['Model Group']===matchedGroup; })
    .map(function(r){ return {l:String(r['Description']||'').trim(),p:Number(r['Price']||0)}; }).filter(function(r){ return r.l&&r.p>0; });
}
function esRebuildLabDropdown(){
  const sel=document.getElementById('es-add-lab');
  if(!sel) return;
  const items=esPriceLabourOptions();
  sel.innerHTML=items.length ? '<option value="">Select mapped DMS labour…</option>' : '<option value="">MD_PriceMaster_Labour not loaded — tap ↻ Sync Now</option>';
  items.forEach(function(v,i){ const code=v.code?` [${v.code}]`:''; sel.insertAdjacentHTML('beforeend',`<option value="${i}">${v.l}${code} — ${inr(v.p)}</option>`); });
}

const GST=0.18;
const OIL={o1000:{l:'Engine Oil 10W30 · 1000 ml',p:373},o1200:{l:'Engine Oil 10W30 · 1200 ml',p:441},
  s750:{l:'Scooter Oil · 750 ml',p:295},s700:{l:'Scooter Oil · 700 ml',p:275},s800:{l:'Scooter Oil · 800 ml',p:314},syn:{l:'Synthetic Oil · 1250 ml',p:1017}};
function partsForKm(km){
  const P=[];
  if(km>=3000) P.push({l:'Air Filter Check / Clean',p:60});
  if(km>=6000) P.push({l:'Air Cleaner Element (Replace)',p:147});
  if(km>=6000) P.push({l:'Spark Plug (Replace)',p:105});
  if(km>=9000) P.push({l:'Oil Filter Element',p:85});
  if(km>=18000) P.push({l:'Brake Cable Set',p:140});
  // NOTE: Brake Shoe Kit & Drive Chain Sprocket Kit deliberately removed from automatic
  // addition — these are wear-and-tear items now shown as optional add-on toggles
  // (see WEARTEAR array) so SA/customer must explicitly opt in. Fixes bug where they
  // were being charged compulsorily on every visit.
  return P;
}
const FORTY=[{l:'Engine Oil Drain & Refill',p:0},{l:'Oil Filter Change',p:0},{l:'Air Filter Check',p:0},{l:'Spark Plug Check',p:0},{l:'40-Point Vehicle Inspection',p:120}];
const VAR=[
  {k:'chain', l:'Drive Chain Cleaning & Lubrication', p:230},{k:'throttle', l:'Throttle Body Cleaning', p:180},
  {k:'carb', l:'Carburettor Cleaning', p:220},{k:'brakeshoe', l:'Brake Pad / Shoe Replacement Check', p:190},
  {k:'brakefluid', l:'Brake Fluid Flush & Bleeding', p:250},{k:'bearing', l:'Wheel Bearing Inspection', p:200},
  {k:'drum', l:'Drum Mechanism Greasing', p:150},{k:'valve', l:'Valve Clearance Adjustment', p:280},
  {k:'oilpump', l:'Oil Pump Inspection & Adjustment', p:160},{k:'horn', l:'Horn Tuning', p:60},
  {k:'fuse', l:'Fuse Check & Replacement', p:50},{k:'battery', l:'Electrical & Battery Check', p:140},
  {k:'fidiag', l:'FI Diagnostic Scanner Check', p:300},{k:'decarb', l:'Engine Internal Cleaning', p:250},
  {k:'ppt', l:'Paint / Surface Protection', p:300},{k:'n2', l:'Nitrogen Filling', p:50},
  {k:'joyride', l:'Joyride Membership', p:150},{k:'silencer', l:'Silencer Coat', p:180},
  {k:'enginecoat', l:'Engine Coat', p:200},{k:'rustcleaner', l:'Rust Cleaner Treatment', p:170},
  {k:'wash', l:'Premium Vehicle Wash', p:100},{k:'polish', l:'Body Polish', p:250},
  {k:'underbody', l:'Underbody Coating', p:350},{k:'wiring', l:'Wiring Harness Check', p:120},
];
// Wear-and-tear optional add-ons — NOT auto-included, SA ticks on per customer agreement
const WEARTEAR=[
  {k:'wt_brakeshoe', l:'Brake Shoe Kit (Front+Rear)', p:226},
  {k:'wt_chainkit', l:'Drive Chain Sprocket Kit', p:420},
  {k:'wt_clutch', l:'Clutch Plate Kit', p:380},
  {k:'wt_brakepad', l:'Brake Pads (Front+Rear)', p:240},
];
const PRESET={free:['chain','battery','horn'],paid:['chain','throttle','brakefluid','fidiag'],joyride:['chain','battery'],general:['fidiag','battery'],accidental:[]};
const FLOOR={free:300, paid:2400, joyride:1800, general:300, accidental:2500}; // base minimums; PAID is now model-scaled via FAM.paidFloor below (Ravi: Splendor ~4000 → Xtreme 6500 → Harley/Maverick 7000, linear by tier)
// Paid-service TOTAL-BILL floors by family tier. Root cause of the "Harley 3400 / Splendor 4240"
// complaint: a flat paid floor ignored model tier, so costlier bikes quoted lower. These make the
// auto paid estimate rise linearly with model value. Applied ONLY to paid service; other types unchanged.
const PAID_FLOOR_BY_FAM={A:4000, B:4200, C:4300, D:4000, E:5200, F:4300, G:6500};
// Specific high-end overrides where the family bucket is too coarse (exact model match, upper-cased)
const PAID_FLOOR_BY_MODEL={'HARLEY X440':7000,'HARLEY-DAVIDSON X440':7000,'X440':7000,'MAVRICK 440':7000,'MAVERICK 440':7000,'MAVRICK440':7000,'KARIZMA XMR':6000,'KARIZMA':5500,'XPULSE 200':5500,'XPULSE 200 4V':5500,'XTREME 250R':6500,'XTREME 250':6500,'XTREME 200S':5800,'XTREME 160R 4V':5200,'XTREME 160R':5200};
function esPaidFloor(modelName, fam){
  const m=String(modelName||'').toUpperCase().trim();
  if(PAID_FLOOR_BY_MODEL[m]!==undefined) return PAID_FLOOR_BY_MODEL[m];
  const key=KNOWN_MODELS[m];
  if(key && PAID_FLOOR_BY_FAM[key]!==undefined) return PAID_FLOOR_BY_FAM[key];
  return 4200; // safe default for any unmapped model — never below the old flat 2400
}
const FAM={A:{name:'100-110cc Motorcycle',oil:'o1000',sched:'f4_6',paid:600},
  B:{name:'125cc Motorcycle',oil:'o1000',sched:'f4_6',paid:650},
  C:{name:'125cc (Glamour X / Xtreme 125R)',oil:'o1000',sched:'f5_3',paid:650},
  D:{name:'Scooter (up to 125cc)',oil:'s750',sched:'f5_3',paid:650},
  E:{name:'160-200cc Motorcycle',oil:'o1200',sched:'f4_6',paid:750},
  F:{name:'XOOM 160 Scooter',oil:'s800',sched:'f4_4',paid:700},
  G:{name:'Premium (Karizma / Xpulse / 250R / 440)',oil:'syn',sched:'f3_6',paid:1300}};
const KNOWN_MODELS={'SPLENDOR +':'A','SPLENDOR+ XTEC':'A','SPLENDOR+ XTEC 2.0':'A','SPLENDOR PRO':'A','SPLENDOR ISMART':'A',
  'HF DELUXE':'A','HF 100':'A','PASSION +':'A','PASSION PRO':'A','PASSION XTEC':'A','CD DELUXE':'A',
  'SUPER SPLENDOR':'B','SUPER SPLENDOR XTEC':'B','GLAMOUR':'B','GLAMOUR XTEC':'B','GLAMOUR X':'C','XTREME 125R':'C',
  'PLEASURE+':'D','PLEASURE+ XTEC':'D','PLEASURE':'D','DESTINI 125':'D','DESTINI PRIME':'D','DESTINI 110':'D',
  'MAESTRO EDGE':'D','MAESTRO EDGE 125':'D','DUET':'D','XOOM':'D','XOOM 125':'D',
  'XTREME 160R':'E','XTREME 160R 4V':'E','XPULSE 200 4V':'E','XPULSE 200':'E','XTREME 200S':'E',
  'XOOM 160':'F','KARIZMA XMR':'G','XPULSE 210':'G','XTREME 250R':'G','MAVRICK 440':'G','HARLEY X440':'G','H-D X440 T':'G'};

/* ===== HERO MODEL INCREMENTAL ESTIMATE PRICE MODEL (Ravi Excel, 07-Jul-2026) =====
   Two protections are used:
   1) Initial estimate price: shown immediately after Model + Service Type selection.
   2) Floor price: after SA edits/deletes lines, the subtotal cannot fall below this.
   The adjustment is VISIBLE as a separate Estimate Protection line, so parts/labour deletions
   and edited amounts still recalculate honestly instead of becoming a hidden fixed value. */
const HERO_INCREMENTAL_ESTIMATE_MODEL={"ACHIEVER":{"name":"Hero Achiever 150","approx":68594,"floor":{"paid":2500,"joyride":2500,"general":2500,"free":2500,"accidental":2500},"initial":{"paid":4700,"joyride":4700,"general":4700,"free":4700,"accidental":4700}},"CD 100":{"name":"Hero Honda CD100","approx":37500,"floor":{"paid":2100,"joyride":2100,"general":2100,"free":2100,"accidental":2100},"initial":{"paid":4200,"joyride":4200,"general":4200,"free":4200,"accidental":4200}},"CD DAWN":{"name":"Hero Honda / Hero CD Dawn / HF Dawn","approx":38468,"floor":{"paid":2100,"joyride":2100,"general":2100,"free":2100,"accidental":2100},"initial":{"paid":4200,"joyride":4200,"general":4200,"free":4200,"accidental":4200}},"CD DELUXE":{"name":"Hero Honda CD Deluxe","approx":42500,"floor":{"paid":2200,"joyride":2200,"general":2200,"free":2200,"accidental":2200},"initial":{"paid":4300,"joyride":4300,"general":4300,"free":4300,"accidental":4300}},"CD 100 SS":{"name":"Hero Honda CD100SS","approx":42500,"floor":{"paid":2200,"joyride":2200,"general":2200,"free":2200,"accidental":2200},"initial":{"paid":4300,"joyride":4300,"general":4300,"free":4300,"accidental":4300}},"DESTINI 110":{"name":"Hero Destini 110","approx":75500,"floor":{"paid":2500,"joyride":2500,"general":2500,"free":2500,"accidental":2500},"initial":{"paid":4800,"joyride":4800,"general":4800,"free":4800,"accidental":4800}},"DESTINI 125":{"name":"Hero Destini 125","approx":79434,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}},"DESTINI PRIME":{"name":"Hero Destini Prime","approx":76904,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4800,"joyride":4800,"general":4800,"free":4800,"accidental":4800}},"DUET":{"name":"Hero Duet","approx":49972,"floor":{"paid":2200,"joyride":2200,"general":2200,"free":2200,"accidental":2200},"initial":{"paid":4400,"joyride":4400,"general":4400,"free":4400,"accidental":4400}},"GLAMOUR":{"name":"Hero Glamour","approx":84925,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}},"GLAMOUR FI":{"name":"Hero Glamour FI","approx":69929,"floor":{"paid":2500,"joyride":2500,"general":2500,"free":2500,"accidental":2500},"initial":{"paid":4700,"joyride":4700,"general":4700,"free":4700,"accidental":4700}},"GLAMOUR X":{"name":"Hero Glamour X 125","approx":92668,"floor":{"paid":2700,"joyride":2700,"general":2700,"free":2700,"accidental":2700},"initial":{"paid":5100,"joyride":5100,"general":5100,"free":5100,"accidental":5100}},"HF 100":{"name":"Hero HF 100","approx":59054,"floor":{"paid":2300,"joyride":2300,"general":2300,"free":2300,"accidental":2300},"initial":{"paid":4500,"joyride":4500,"general":4500,"free":4500,"accidental":4500}},"HF DELUXE":{"name":"Hero HF Deluxe","approx":65295,"floor":{"paid":2400,"joyride":2400,"general":2400,"free":2400,"accidental":2400},"initial":{"paid":4600,"joyride":4600,"general":4600,"free":4600,"accidental":4600}},"MAESTRO":{"name":"Hero Maestro","approx":49968,"floor":{"paid":2200,"joyride":2200,"general":2200,"free":2200,"accidental":2200},"initial":{"paid":4400,"joyride":4400,"general":4400,"free":4400,"accidental":4400}},"MAESTRO EDGE":{"name":"Hero Maestro Edge 110 / 125","approx":73030,"floor":{"paid":2500,"joyride":2500,"general":2500,"free":2500,"accidental":2500},"initial":{"paid":4800,"joyride":4800,"general":4800,"free":4800,"accidental":4800}},"PASSION PLUS":{"name":"Hero Passion Plus","approx":81739,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}},"PASSION PRO":{"name":"Hero Passion PRO i3s","approx":55943,"floor":{"paid":2300,"joyride":2300,"general":2300,"free":2300,"accidental":2300},"initial":{"paid":4500,"joyride":4500,"general":4500,"free":4500,"accidental":4500}},"PASSION XPRO":{"name":"Hero Passion XPro","approx":59251,"floor":{"paid":2300,"joyride":2300,"general":2300,"free":2300,"accidental":2300},"initial":{"paid":4500,"joyride":4500,"general":4500,"free":4500,"accidental":4500}},"PLEASURE":{"name":"Hero Pleasure","approx":48668,"floor":{"paid":2200,"joyride":2200,"general":2200,"free":2200,"accidental":2200},"initial":{"paid":4400,"joyride":4400,"general":4400,"free":4400,"accidental":4400}},"PLEASURE PLUS":{"name":"Hero Pleasure Plus / Xtec","approx":74063,"floor":{"paid":2500,"joyride":2500,"general":2500,"free":2500,"accidental":2500},"initial":{"paid":4800,"joyride":4800,"general":4800,"free":4800,"accidental":4800}},"SPLENDOR":{"name":"Hero Splendor / Splendor Plus equivalent","approx":79115,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}},"SPLENDOR +":{"name":"Hero Splendor Plus / Xtec","approx":79115,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}},"SPLENDOR ISMART":{"name":"Hero Splendor iSmart 110","approx":65638,"floor":{"paid":2400,"joyride":2400,"general":2400,"free":2400,"accidental":2400},"initial":{"paid":4600,"joyride":4600,"general":4600,"free":4600,"accidental":4600}},"SPLENDOR PRO":{"name":"Hero Splendor PRO","approx":50660,"floor":{"paid":2300,"joyride":2300,"general":2300,"free":2300,"accidental":2300},"initial":{"paid":4400,"joyride":4400,"general":4400,"free":4400,"accidental":4400}},"SUPER SPLENDOR":{"name":"Hero Super Splendor Xtec / Xtec 2.0","approx":84927,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}},"XTREME 125":{"name":"Hero Xtreme 125R","approx":98422,"floor":{"paid":2800,"joyride":2800,"general":2800,"free":2800,"accidental":2800},"initial":{"paid":5200,"joyride":5200,"general":5200,"free":5200,"accidental":5200}},"XTREME 160":{"name":"Hero Xtreme 160R / 160R 4V","approx":125217,"floor":{"paid":3100,"joyride":3100,"general":3100,"free":3100,"accidental":3100},"initial":{"paid":5600,"joyride":5600,"general":5600,"free":5600,"accidental":5600}},"XTREME 200":{"name":"Hero Xtreme 200R / 200S / 200S 4V","approx":118163,"floor":{"paid":3000,"joyride":3000,"general":3000,"free":3000,"accidental":3000},"initial":{"paid":5500,"joyride":5500,"general":5500,"free":5500,"accidental":5500}},"XPULSE 200":{"name":"Hero Xpulse 200 4V","approx":143828,"floor":{"paid":3300,"joyride":3300,"general":3300,"free":3300,"accidental":3300},"initial":{"paid":5900,"joyride":5900,"general":5900,"free":5900,"accidental":5900}},"XPULSE 210":{"name":"Hero Xpulse 210","approx":166780,"floor":{"paid":3600,"joyride":3600,"general":3600,"free":3600,"accidental":3600},"initial":{"paid":6200,"joyride":6200,"general":6200,"free":6200,"accidental":6200}},"XTREME 250":{"name":"Hero Xtreme 250R","approx":172525,"floor":{"paid":3600,"joyride":3600,"general":3600,"free":3600,"accidental":3600},"initial":{"paid":6300,"joyride":6300,"general":6300,"free":6300,"accidental":6300}},"MAVERICK440":{"name":"Hero Mavrick 440","approx":226556,"floor":{"paid":4300,"joyride":4300,"general":4300,"free":4300,"accidental":4300},"initial":{"paid":7200,"joyride":7200,"general":7200,"free":7200,"accidental":7200}},"HARLEY":{"name":"Harley-Davidson X440","approx":247000,"floor":{"paid":4500,"joyride":4500,"general":4500,"free":4500,"accidental":4500},"initial":{"paid":7500,"joyride":7500,"general":7500,"free":7500,"accidental":7500}},"ZOOM160":{"name":"Hero Xoom 160","approx":140677,"floor":{"paid":3300,"joyride":3300,"general":3300,"free":3300,"accidental":3300},"initial":{"paid":5800,"joyride":5800,"general":5800,"free":5800,"accidental":5800}},"ZOOM125":{"name":"Hero Xoom 125","approx":83857,"floor":{"paid":2600,"joyride":2600,"general":2600,"free":2600,"accidental":2600},"initial":{"paid":4900,"joyride":4900,"general":4900,"free":4900,"accidental":4900}}};

function heroNormModel(s){
  return String(s||'').toUpperCase()
    .replace(/HERO|HONDA|MOTOCORP|BIKE|MOTORCYCLE|SCOOTER/g,' ')
    .replace(/XOOM/g,'ZOOM')
    .replace(/MAVRICK/g,'MAVERICK')
    .replace(/DESTINY/g,'DESTINI')
    .replace(/PLUS/g,'+')
    .replace(/[^A-Z0-9+]/g,'')
    .replace(/\+/g,'PLUS');
}
function heroIncrementalKey(modelName){
  const raw=String(modelName||'').trim(); if(!raw) return '';
  const n=heroNormModel(raw);
  const aliases={
    'SPLENDORPLUS':'SPLENDOR +','SPLENDORPLUSTEC':'SPLENDOR +','SPLENDORPLUSXTEC':'SPLENDOR +','SPLENDORPLUSXTEC20':'SPLENDOR +',
    'PASSIONPLUS':'PASSION PLUS','PASSIONPRO':'PASSION PRO','PASSIONXPRO':'PASSION XPRO','PASSIONXTEC':'PASSION PLUS',
    'PLEASUREPLUS':'PLEASURE PLUS','PLEASUREPLUSXTEC':'PLEASURE PLUS','PLEASUREXTEC':'PLEASURE PLUS',
    'XTREME125R':'XTREME 125','XTREME125':'XTREME 125','XTREME160R':'XTREME 160','XTREME160R4V':'XTREME 160','XTREME200R':'XTREME 200','XTREME200S':'XTREME 200','XTREME250R':'XTREME 250','XTREME250':'XTREME 250',
    'XPULSE2004V':'XPULSE 200','XPULSE200':'XPULSE 200','XPULSE210':'XPULSE 210',
    'XPLUSE200':'XPULSE 200','XPLUSE210':'XPULSE 210',
    'MAVERICK440':'MAVERICK440','MAVRICK440':'MAVERICK440','MAVERICK':'MAVERICK440','MAVRICK':'MAVERICK440',
    'HARLEYDAVIDSONX440':'HARLEY','HARLEYX440':'HARLEY','HDX440':'HARLEY','X440':'HARLEY',
    'ZOOM160':'ZOOM160','XOOM160':'ZOOM160','ZOOM125':'ZOOM125','XOOM125':'ZOOM125','XOOM':'ZOOM125',
    'MAESTROEDGE125':'MAESTRO EDGE','MAESTROEDGE':'MAESTRO EDGE',
    'DESTINI125':'DESTINI 125','DESTINI110':'DESTINI 110','DESTINIPRIME':'DESTINI PRIME',
    'CD100SS':'CD 100 SS','CD100':'CD 100','CDDAWN':'CD DAWN','CDDELUXE':'CD DELUXE',
    'HF100':'HF 100','HFDELUXE':'HF DELUXE','SUPERSPENDOR':'SUPER SPLENDOR','SUPERSPLENDOR':'SUPER SPLENDOR',
    'GLAMOURFI':'GLAMOUR FI','GLAMOURX':'GLAMOUR X','GLAMOURXTEC':'GLAMOUR X'
  };
  if(aliases[n] && HERO_INCREMENTAL_ESTIMATE_MODEL[aliases[n]]) return aliases[n];
  for(const k in HERO_INCREMENTAL_ESTIMATE_MODEL){ if(heroNormModel(k)===n) return k; }
  // Last safe fallback: longer model names from master often contain suffixes like XTEC/2.0/4V.
  let best='', bestLen=0;
  for(const k in HERO_INCREMENTAL_ESTIMATE_MODEL){
    const kn=heroNormModel(k);
    if((n.indexOf(kn)>-1 || kn.indexOf(n)>-1) && kn.length>bestLen){ best=k; bestLen=kn.length; }
  }
  return best;
}
function heroIncrementalPrice(modelName, serviceType){
  const k=heroIncrementalKey(modelName); if(!k) return null;
  const row=HERO_INCREMENTAL_ESTIMATE_MODEL[k]; if(!row) return null;
  const t=String(serviceType||'').toLowerCase();
  return {key:k, name:row.name, approx:row.approx, floor:row.floor[t]||0, initial:row.initial[t]||0};
}
/* ===== EDITABLE PRICE MASTER — MD_EstimatePrices (Ravi 08-Jul, URGENT) ==============
   "The floor prices and direct estimate prices should be editable... prepare a backend
   sheet in the master file — again and again modifying the html is not good."
   HOW IT WORKS: HeroMasterSheet gets a sheet named  MD_EstimatePrices  with columns:
     Model Key | Model Name | Approx Price | Floor | Initial Estimate |
     Floor Free | Floor Paid | Floor General | Floor Joyride | Floor Accidental |
     Initial Free | Initial Paid | Initial General | Initial Joyride | Initial Accidental
   Rules:
     - 'Floor' / 'Initial Estimate' fill ALL five service types in one go; the per-type
       columns (optional) override individual types on top of that.
     - A row whose Model Key is DEFAULT sets the global service-type minimums (the old
       hardcoded FLOOR table) via its per-type Floor columns.
     - A Model Key not already known ADDS a new model to the price model.
     - Blank cells change nothing — the hardcoded value stays, so a half-filled sheet
       can never zero-out pricing. ₹0 floors are ignored for the same reason.
   The sheet is fetched on estimate boot (cached by jget, so it also works offline with
   the last-synced copy). Editing the sheet + tapping ↻ Sync Now in the app applies new
   prices WITHOUT touching the HTML or spending a Netlify deploy. */
const HERO_SVC_TYPES=['free','paid','general','joyride','accidental'];
let HERO_PRICES_FROM_MASTER=false;
function heroNum(v){ const n=parseFloat(String(v==null?'':v).replace(/[₹,\s]/g,'')); return isNaN(n)?null:n; }
function heroApplyPriceMaster(rows){
  if(!rows||!rows.length) return;
  let applied=0;
  rows.forEach(function(r){
    const keyRaw=String(r['Model Key']||'').trim(); if(!keyRaw) return;
    const floorAll=heroNum(r['Floor']), initAll=heroNum(r['Initial Estimate']);
    if(keyRaw.toUpperCase()==='DEFAULT'){
      HERO_SVC_TYPES.forEach(t=>{
        const f=heroNum(r['Floor '+t.charAt(0).toUpperCase()+t.slice(1)]);
        if(f!==null && f>=0) FLOOR[t]=f; else if(floorAll!==null && floorAll>=0) FLOOR[t]=floorAll;
      });
      applied++; return;
    }
    // Match existing key (exact, or via the alias/normalised resolver); else ADD as new model
    let key=HERO_INCREMENTAL_ESTIMATE_MODEL[keyRaw.toUpperCase()]?keyRaw.toUpperCase():heroIncrementalKey(keyRaw);
    if(!key||!HERO_INCREMENTAL_ESTIMATE_MODEL[key]){
      key=keyRaw.toUpperCase();
      HERO_INCREMENTAL_ESTIMATE_MODEL[key]={name:String(r['Model Name']||keyRaw),approx:heroNum(r['Approx Price'])||0,floor:{},initial:{}};
    }
    const m=HERO_INCREMENTAL_ESTIMATE_MODEL[key];
    if(String(r['Model Name']||'').trim()) m.name=String(r['Model Name']).trim();
    const ap=heroNum(r['Approx Price']); if(ap&&ap>0) m.approx=ap;
    HERO_SVC_TYPES.forEach(t=>{
      const cap=t.charAt(0).toUpperCase()+t.slice(1);
      const f=heroNum(r['Floor '+cap]), iv=heroNum(r['Initial '+cap]);
      if(f!==null && f>=0) m.floor[t]=f; else if(floorAll!==null && floorAll>=0) m.floor[t]=floorAll;
      if(iv!==null && iv>=0) m.initial[t]=iv; else if(initAll!==null && initAll>=0) m.initial[t]=initAll;
      if(m.floor[t]==null) m.floor[t]=floorAll||0;      // new-model safety
      if(m.initial[t]==null) m.initial[t]=initAll||m.floor[t]||0;
    });
    applied++;
  });
  if(applied){ HERO_PRICES_FROM_MASTER=true; console.log('[EstimatePrices] applied '+applied+' rows from MD_EstimatePrices'); }
}
function heroLoadPriceMaster(){
  // Non-blocking on purpose: if the sheet doesn't exist yet or the network is down,
  // estimates keep working on the built-in table — nothing can break.
  try{
    jget('master_table',{name:'EstimatePrices'},function(res){
      try{ heroApplyPriceMaster(res&&res.rows); }catch(e){ console.warn('EstimatePrices apply failed',e); }
    });
  }catch(e){}
}
function esHasCommercialChange(){
  return ES_REMOVED.size>0 || Object.keys(ES_PRICE_OVERRIDES||{}).length>0 || Object.keys(ES_LINE_DISCOUNTS||{}).length>0 || ES_ADDLAB.length>0 || ES_ADDPART.length>0 || ES_DEMANDED.length>0;
}

function famFor(modelName){ const key=KNOWN_MODELS[String(modelName).toUpperCase()]; return FAM[key] || FAM['B']; }
/* ===== MODEL-SPECIFIC OIL PRICING (Ravi 09-Jul, URGENT) ============================
   "Harley oil coming as ₹373 which is wrong." Root cause: oil price came from the coarse
   FAM table (7 buckets), so a ₹2500 Harley oil fell into the generic ₹373 bucket.
   Fix: MD_ModelOilMap (Model | Oil Part No | Oil Description | Oil MRP | Oil Volume ML),
   scraped from 3 years of Engine_oil_Month_wise invoices — the dominant oil SKU each
   model is ACTUALLY billed, at real MRP. Harley/Mavrick ₹2500-2700, Xpulse/Karizma
   ₹1350, Splendor ₹456-570. Loaded on estimate boot, cached, offline-safe. Editable in
   the sheet → Sync Now → live, no HTML change. */
const HERO_MODEL_OIL={}; // reg-normalised model key -> {part, desc, mrp, vol}
let HERO_OIL_MAP_LOADED=false;
function heroOilKey(m){ return String(m||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function heroApplyOilMap(rows){
  if(!rows||!rows.length) return;
  let n=0;
  rows.forEach(function(r){
    const k=heroOilKey(r['Model']); if(!k) return;
    const mrp=parseFloat(String(r['Oil MRP']||'').replace(/[₹,\s]/g,''));
    if(isNaN(mrp)||mrp<=0) return;
    HERO_MODEL_OIL[k]={part:String(r['Oil Part No']||''),desc:String(r['Oil Description']||'Engine Oil'),mrp:Math.round(mrp),vol:parseInt(r['Oil Volume ML'],10)||0};
    n++;
  });
  if(n){ HERO_OIL_MAP_LOADED=true; console.log('[ModelOilMap] '+n+' models loaded'); }
}
function heroLoadOilMap(){
  try{ jget('master_table',{name:'ModelOilMap'},function(res){ try{ heroApplyOilMap(res&&res.rows); }catch(e){} }); }catch(e){}
}
/* Returns the correct oil line for a model, or null to fall back to the FAM bucket.
   Exact match first, then longest-prefix (so "SPLENDOR + XTEC" still finds "SPLENDOR +"). */
function heroOilForModel(modelName){
  const k=heroOilKey(modelName); if(!k) return null;
  if(HERO_MODEL_OIL[k]) return HERO_MODEL_OIL[k];
  let best=null, bestLen=0;
  for(const mk in HERO_MODEL_OIL){
    if((k.indexOf(mk)===0||mk.indexOf(k)===0) && mk.length>bestLen){ best=HERO_MODEL_OIL[mk]; bestLen=mk.length; }
  }
  return best;
}
const REPAIR=[{l:'Front Brake Shoe (R/R)',p:190},{l:'Rear Brake Shoe (R/R)',p:190},{l:'Throttle Cable (R/R)',p:140},
  {l:'Clutch Cable (R/R)',p:100},{l:'Front Brake Cable (R/R)',p:140},{l:'Speedometer Cable (R/R)',p:140},
  {l:'Key Set (R/R)',p:410},{l:'Indicator / Winker (R/R)',p:100},{l:'Head Light Bulb (R/R)',p:150},
  {l:'Cam Sprocket (R/R)',p:420},{l:'Drive Chain Set (R/R)',p:420},{l:'Clutch Overhaul',p:350},
  {l:'Starter Motor (Dismantle/Assemble)',p:170},{l:'Handle Cover (R/R)',p:250},{l:'Front Visor (R/R)',p:130},
  {l:'Front Fender (R/R)',p:100},{l:'Pillion Step (R/R)',p:65},{l:'Muffler Cover (R/R)',p:120},
  {l:'Horn (R/R)',p:80},{l:'Battery (R/R)',p:90},{l:'Steering Stem Greasing',p:490},{l:'Engine Overhaul',p:2700},
  {l:'Fork Dismantle / Assemble',p:300},{l:'Engine Oil Top-up (beyond quota)',p:150}];
const SCHED={f4_6:{free:[{n:'I',km:750,mo:2},{n:'II',km:6000,mo:8},{n:'III',km:12000,mo:14},{n:'IV',km:18000,mo:20}],pm:6},
  f5_3:{free:[{n:'I',km:750,mo:2},{n:'II',km:3000,mo:5},{n:'III',km:6000,mo:9},{n:'IV',km:9000,mo:12},{n:'V',km:12000,mo:15}],pm:3},
  f4_4:{free:[{n:'I',km:1000,mo:1},{n:'II',km:4000,mo:6},{n:'III',km:8000,mo:10},{n:'IV',km:12000,mo:14}],pm:4},
  f3_6:{free:[{n:'I',km:750,mo:2},{n:'II',km:6000,mo:8},{n:'III',km:12000,mo:14}],pm:6}};

// Labour dropdown is built dynamically in esRebuildLabDropdown() after master data loads

function esBoot(){
  // ALWAYS start with a clean form (Ravi 21-Jul): a half-filled estimate must never survive
  // pressing Home and coming back — that risks the wrong estimate being generated. This is
  // separate from the s10 speed fix below, which only skips re-fetching master DATA, not the
  // in-progress entry.
  if(typeof esNewEstimate==='function') esNewEstimate();
  if(window.ES_BOOTED){
    // Already loaded this session — masters, price/oil maps and dropdowns are in memory.
    // Show the form instantly instead of re-fetching and re-processing 9 tables. A Sync Now
    // or admin setup-save clears this flag (via clearMasterCache) so fresh data reloads. (Ravi 20-Jul)
    esAfterCheck(); return;
  }
  ES_PRICE_LAB=[]; ES_LABOUR_MODEL='';
  let pending=9, configRes=null, listRes=null;
  const done=()=>{ if(--pending===0) proceed(); };
  const proceed=()=>{
    ES_CONFIG=(configRes&&configRes.config)||{};
    ES_FIELDS.forEach(f=>{ if(!ES_CONFIG[f.key]||!ES_CONFIG[f.key].table) ES_CONFIG[f.key]=f.def; });
    ES_TABLES=(listRes&&listRes.tables)||[];
    esRebuildLabDropdown();
    esRebuildDemandedDropdown();
    window.ES_BOOTED=true;
    esCheckAndLoad();
  };
  jget('app_config',{app:ES_APP},function(res){ configRes=res; done(); });
  jget('master_list',{},function(res){ listRes=res; done(); });
  jget('master_table',{name:'PreventiveMaintenanceLabour'},function(res){ ES_PM_LAB=(res&&res.rows)||[]; done(); });
  jget('master_table',{name:'LocalPartsPack'},function(res){ ES_LOCAL_PARTS=(res&&res.rows)||[]; done(); });
  jget('master_table',{name:'PreventiveMaintenanceKits'},function(res){ ES_PM_KITS=(res&&res.rows)||[]; done(); });
  jget('master_table',{name:'ModelKitParts'},function(res){ ES_MODEL_KIT_PARTS=(res&&res.rows)||[]; done(); });
  jget('master_table',{name:'PartLabourMap'},function(res){ ES_PART_LABOUR_MAP=(res&&res.rows)||[]; done(); });
  jget('master_table',{name:'EstimatePrices'},function(res){ try{ heroApplyPriceMaster(res&&res.rows); }catch(e){} done(); });
  jget('master_table',{name:'ModelOilMap'},function(res){ try{ heroApplyOilMap(res&&res.rows); }catch(e){} done(); });
}
let ES_LABOUR_REQ=0, ES_LABOUR_MODEL='';
function esLoadLabourForSelectedModel(modelName){
  modelName=String(modelName||'').trim();
  const req=++ES_LABOUR_REQ;
  const sel=document.getElementById('es-add-lab');
  if(!modelName){ ES_PRICE_LAB=[]; ES_LABOUR_MODEL=''; esRebuildLabDropdown(); return; }
  ES_PRICE_LAB=[]; ES_LABOUR_MODEL='';
  if(sel) sel.innerHTML='<option value="">Loading mapped labour for this model…</option>';
  jget('labour_for_model',{model:modelName},function(res){
    if(req!==ES_LABOUR_REQ || val('es-model')!==modelName) return;
    ES_PRICE_LAB=(res&&res.rows)||[];
    ES_LABOUR_MODEL=modelName;
    esRebuildLabDropdown();
    esRenderVariable();
  });
}
let ES_PARTS_READY=false, ES_PARTS_LOADING=false;
function esEnsurePartsReady(){
  if(ES_PARTS_READY){
    // Build the category list only ONCE. Re-rendering it on every tap/focus reset the
    // selection on Android and broke the dependent sub-category dropdown. (Ravi 20-Jul)
    const s=document.getElementById('es-add-pcat');
    if(s && s.options.length<=1) esRenderPartCategoryDropdown();
    return;
  }
  if(ES_PARTS_LOADING) return;
  ES_PARTS_LOADING=true;
  const sel=document.getElementById('es-add-pcat');
  if(sel){ sel.disabled=true; sel.innerHTML='<option value="">Loading parts master…</option>'; }
  jget('master_table',{name:'ModelPart'},function(res){
    ES_MODEL_PART=(res&&res.rows)||[];
    esBuildPartIndexAsync(function(){
      ES_PARTS_READY=true; ES_PARTS_LOADING=false;
      if(sel) sel.disabled=false;
      esRenderPartCategoryDropdown();
    });
  });
}
function esLoadModelPartBackground(){ esEnsurePartsReady(); }
function esCheckAndLoad(){
  ES_MISSING=[]; ES_MODEL_LIST=[];
  const conf = ES_CONFIG['Model'];
  if(!conf || !conf.table || !conf.column){ ES_MISSING.push('Model'); esAfterCheck(); return; }
  jget('master_table', {name:conf.table}, function(res){
    const rows=(res&&res.rows)||[];
    ES_MODEL_LIST=[...new Set(rows.map(r=>String(r[conf.column]||'').trim()).filter(v=>v!==''))];
    if(ES_MODEL_LIST.length===0) ES_MISSING.push('Model');
    esAfterCheck();
  });
}
function esAfterCheck(){
  document.getElementById('es-cfgbtn').style.display = isAdmin() ? 'inline-block' : 'none';
  if(ES_MISSING.length>0){
    if(isAdmin()) esOpenSetup(false);
    else {
      document.getElementById('es-form-view').style.display='none';
      document.getElementById('es-setup-view').style.display='none';
      const wrap=document.getElementById('es-setup-view').parentNode;
      let ban=document.getElementById('es-noaccess');
      if(!ban){ ban=document.createElement('div'); ban.id='es-noaccess'; ban.className='missing'; wrap.appendChild(ban); }
      ban.style.display='block';
      ban.textContent='This module is not fully set up yet. Ask your administrator to configure it.';
    }
  } else esShowForm();
}

function esOpenSetup(cancellable){
  document.getElementById('es-form-view').style.display='none';
  document.getElementById('es-setup-view').style.display='block';
  document.getElementById('es-setup-cancel').style.display=cancellable?'block':'none';
  const box=document.getElementById('es-setup-fields'); box.innerHTML='';
  ES_FIELDS.forEach(f=>{
    const conf=ES_CONFIG[f.key]||{};
    const div=document.createElement('div'); div.className='setup-field';
    div.innerHTML=`<div class="ttl">${f.label}</div><label>Master Table</label>
      <select id="essu-table-${f.key}" onchange="esOnSetupTableChange('${f.key}')">
        <option value="">Select table…</option>${ES_TABLES.map(t=>`<option value="${t}" ${t===conf.table?'selected':''}>${t}</option>`).join('')}</select>
      <label>Column to show</label><select id="essu-col-${f.key}"><option value="">Select table first…</option></select>`;
    box.appendChild(div);
    if(conf.table) esLoadColsForSetup(f.key, conf.table, conf.column);
  });
}
function esOnSetupTableChange(key){
  const table=val('essu-table-'+key);
  if(!table){ document.getElementById('essu-col-'+key).innerHTML='<option value="">Select table first…</option>'; return; }
  esLoadColsForSetup(key, table, null);
}
function esLoadColsForSetup(key, table, pre){
  jget('master_table', {name:table}, function(res){
    const cols=(res&&res.columns)||[];
    document.getElementById('essu-col-'+key).innerHTML='<option value="">Select column…</option>'+cols.map(c=>`<option value="${c}" ${c===pre?'selected':''}>${c}</option>`).join('');
  });
}
function esSaveSetup(){
  const msg=document.getElementById('es-setup-msg'); let ok=true; const toSave=[];
  ES_FIELDS.forEach(f=>{ const table=val('essu-table-'+f.key), col=val('essu-col-'+f.key);
    if(!table||!col) ok=false; else toSave.push({app:ES_APP,type:'set_app_config',field:f.key,table,column:col}); });
  if(!ok){ msg.style.color='var(--signal-d)'; msg.textContent='Please choose a table and column.'; return; }
  msg.style.color='var(--steel)'; msg.textContent='Saving…';
  Promise.all(toSave.map(s=>jpost(s))).then(()=>{ msg.textContent='Saved. Reloading…'; setTimeout(esBoot,600); });
}
function esCloseSetup(){ if(ES_MISSING.length>0) return; document.getElementById('es-setup-view').style.display='none'; esShowForm(); }

function esShowForm(){
  document.getElementById('es-setup-view').style.display='none';
  document.getElementById('es-form-view').style.display='block';
  const ban=document.getElementById('es-missingban');
  if(ES_MISSING.length>0){ ban.style.display='block'; ban.textContent='Model list has no data yet. Ask admin, or tap ⚙ Configure.'; }
  else ban.style.display='none';
  const msel=document.getElementById('es-model');
  msel.innerHTML='<option value="">Select model…</option>'+ES_MODEL_LIST.map(m=>`<option value="${m}">${m}</option>`).join('');
  esTickDateTime();
  esRenderVariable();
  esLoadGateEntries();
  esUpdateLive();
}
function esTickDateTime(){ const el=document.getElementById('es-dt'); if(el) el.value=new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
setInterval(()=>{ if(document.getElementById('view-estimate').style.display!=='none') esTickDateTime(); }, 30000);

/* Typeable dd-mm-yyyy date fields (English-India) — identical on mobile and laptop,
   auto-inserts dashes as digits are typed. Used by Date of Sale (and any future
   date field given class="date-dmy"). */
function raviParseDMY(s){
  s=String(s||'').trim();
  const m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if(!m) return new Date(NaN);
  const d=+m[1], mo=+m[2]-1, y=+m[3];
  const dt=new Date(y,mo,d);
  return (dt.getFullYear()===y && dt.getMonth()===mo && dt.getDate()===d) ? dt : new Date(NaN);
}
function raviDateMask(el){
  let v=el.value.replace(/[^\d]/g,'').slice(0,8);
  if(v.length>=5) v=v.slice(0,2)+'-'+v.slice(2,4)+'-'+v.slice(4);
  else if(v.length>=3) v=v.slice(0,2)+'-'+v.slice(2);
  el.value=v;
}
document.addEventListener('input', function(ev){
  if(ev.target && ev.target.classList && ev.target.classList.contains('date-dmy')) raviDateMask(ev.target);
});
function esMonthsSince(dos){ if(!dos) return 0; const d=raviParseDMY(dos); if(isNaN(d.getTime())) return 0; const n=new Date(); return Math.max(0,(n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth())); }
function esDecide(fam,type,freeStage){
  if(type==='paid') return{type:'paid',label:'Paid Service'};
  if(type==='joyride') return{type:'joyride',label:'Joyride'};
  if(type==='general') return{type:'general',label:'General Repair'};
  if(type==='accidental') return{type:'accidental',label:'Accidental Repair'};
  if(type==='free'){ const sc=SCHED[fam.sched]; const stage=sc.free.find(f=>f.n===freeStage)||sc.free[0]; return{type:'free',stage,label:'Free Service '+stage.n}; }
  return null;
}
function esDetectedType(){ return val('es-type'); }
function esRenderVariable(){
  const type=esDetectedType(), box=document.getElementById('es-varbox');
  esResetRemoved(); // new service-type selection clears any per-line removals from before
  if(!type){ box.innerHTML='<div class="hint">Select a service type first.</div>'; esUpdateLive(); return; }
  if(type==='accidental'){ box.innerHTML='<div class="hint">Accidental jobs are added below as parts/labour per the estimate of damage.</div>'; esUpdateLive(); return; }
  const items=esMdVarItems();
  const presetKeys=PRESET[type]||[]; // used for hardcoded VAR; for MD items, use description keywords
  const usingMd=ES_PRICE_LAB.length>0;
  const varHtml=items.map(function(v){
    let checked=false;
    if(PRESET[type] && PRESET[type].includes(v.k)){ checked=true; }
    else if(usingMd){
      const ll=v.l.toLowerCase();
      if(type==='free') checked=ll.includes('chain')||ll.includes('battery')||ll.includes('horn');
      else if(type==='paid') checked=ll.includes('chain')||ll.includes('brake fluid')||ll.includes('fi diagnostic')||ll.includes('throttle');
      else if(type==='joyride') checked=ll.includes('chain')||ll.includes('battery');
    }
    return `<div class="vrow"><input type="checkbox" id="esvc-${v.k}" onchange="esUpdateLive()" ${checked?'checked':''}><span class="vl">${v.l}${v.code?' <span class=\"mono\" style=\"font-size:10px;color:var(--steel)\">['+v.code+']</span>':''}</span><span class="vp">${inr(v.p)}</span></div>`;
  }).join('');
  const wtHtml = type==='general' ? '' : `<div class="hint" style="margin:10px 0 4px">Wear &amp; tear add-ons (only if customer agrees)</div>`+
    WEARTEAR.map(function(v){
      return `<div class="vrow"><input type="checkbox" id="eswt-${v.k}" onchange="esUpdateLive()"><span class="vl">${v.l}</span><span class="vp">${inr(v.p)}</span></div>`;
    }).join('');
  box.innerHTML=varHtml+wtHtml;
  esUpdateLive();
}
document.getElementById('es-type').addEventListener('change',()=>{
  document.getElementById('es-freestage-wrap').style.display=val('es-type')==='free'?'block':'none';
  esRenderVariable();
});
document.getElementById('es-freestage').addEventListener('change',()=>{ esRenderVariable(); });
document.getElementById('es-model').addEventListener('change',()=>{
  esResetRemoved();
  esLoadLabourForSelectedModel(val('es-model'));
  esEnsurePartsReady(); // preload parts now so Category is ready and fast when the SA reaches it
  esUpdateLive();
});
let __esLiveTimer=null;
function esUpdateLiveDebounced(){
  if(__esLiveTimer) clearTimeout(__esLiveTimer);
  __esLiveTimer=setTimeout(function(){ __esLiveTimer=null; esUpdateLive(); },350);
}
['es-name','es-mob','es-reg','es-km','es-dos'].forEach(function(id){
  const el=document.getElementById(id); if(el) el.addEventListener('change',esUpdateLive);
});
['es-disc','es-disc-lab','es-disc-parts'].forEach(function(id){
  const el=document.getElementById(id); if(el) el.addEventListener('input',esUpdateLiveDebounced);
});

let ES_ADDLAB=[], ES_ADDPART=[];
function esAddLabourFn(){
  const i=+val('es-add-lab');
  const items=esPriceLabourOptions();
  const row=items[i]; if(!row) return;
  ES_ADDLAB.push({l:row.l,p:row.p,code:row.code||''});
  esDrawChips();
}
/* ===== DEMANDED REPAIRS (customer voice) — DMS-style =====
   SA picks what the customer demanded (options come straight from MD_PartLabourMap's
   Part Name column). The row's Complaint Code is recorded on the estimate and the
   mapped labour line(s) with their Hero DMS job codes are auto-applied — exactly the
   complaint → complaint code → labour code chain the billing executive needs. */
let ES_DEMANDED=[];
function esRebuildDemandedDropdown(){
  const sel=document.getElementById('es-add-dem'); if(!sel) return;
  const names=[...new Set(ES_PART_LABOUR_MAP.map(r=>String(r['Part Name']||'').trim()).filter(Boolean))];
  sel.innerHTML='<option value="">Select demanded repair…</option>'+names.map(n=>`<option value="${n.replace(/"/g,'&quot;')}">${n}</option>`).join('');
  if(!names.length) sel.innerHTML='<option value="">MD_PartLabourMap not loaded — tap ↻ Sync Now</option>';
}
function esAddDemandedFn(){
  const name=val('es-add-dem'); if(!name){ alert('Select a demanded repair first.'); return; }
  if(ES_DEMANDED.some(d=>d.name===name)){ alert('Already added.'); return; }
  const map=esFindDemandedLabours(name);
  if(!map){ alert('No labour mapping found for this repair in MD_PartLabourMap.'); return; }
  ES_DEMANDED.push({name:name, cc:map.cc});
  let added=[];
  map.labours.forEach(lb=>{
    if(!ES_ADDLAB.some(x=>x.l.toLowerCase()===lb.l.toLowerCase())){ ES_ADDLAB.push({l:lb.l,p:lb.p,code:lb.code,cc:lb.cc}); added.push(lb.l); }
  });
  document.getElementById('es-add-dem').value='';
  esDrawDemChips(); esDrawChips();
  const msg=document.getElementById('es-msg');
  if(msg){ msg.style.color='var(--ok)'; msg.textContent='Complaint code '+(map.cc||'—')+' recorded'+(added.length?' · labour applied: '+added.join(', '):'')+'.'; setTimeout(()=>{ if(msg.textContent.indexOf('Complaint code')>-1) msg.textContent=''; },7000); }
}
function esRemoveDemanded(i){
  ES_DEMANDED.splice(i,1); esDrawDemChips();
}
function esDrawDemChips(){
  const c=document.getElementById('es-dem-chips'); if(!c) return;
  c.innerHTML=ES_DEMANDED.map((d,i)=>`<div class="chip" style="background:#eff6ff"><span>🗣 ${d.name} <b style="font-size:10.5px;color:var(--steel)">[${d.cc||'—'}]</b></span><span style="cursor:pointer;color:var(--signal-d)" onclick="esRemoveDemanded(${i});esUpdateLive()">✕</span></div>`).join('');
}
/* Category → common parts picker — replaces free-text part entry (fixes #4):
   floor staff pick a broad category, then a specific common part from a short list,
   instead of typing a part name and number which "nobody will do". */
/* ===== PARTS UNIVERSE (MD_ModelPart, 16,066 parts) — replaces the old hardcoded
   PART_CATEGORIES. One row per part with Category, Sub Category, MRP, Rate PreGST,
   GST %, Models Used On (pipe-separated). SA picks Category -> Sub Category -> Part.
   Default list is filtered to the vehicle's model; "Show all" opens the whole
   universe for accidental jobs. Price auto-fills where known, typed where blank. ===== */

function esPU(r, keys){ for(var ki=0;ki<keys.length;ki++){ var v=r[keys[ki]]; if(v!==undefined&&v!==null&&String(v).trim()!=='') return String(v).trim(); } return ''; }
function esPUnum(v){ var n=Number(String(v==null?'':v).replace(/[₹,\s]/g,'')); return isNaN(n)?0:n; }

function esBuildPartIndex(){
  var cats={}, all=[];
  (ES_MODEL_PART||[]).forEach(function(r){
    var pn=esPU(r,['Part No','Part Number']);
    var desc=esPU(r,['Description','Part Description']);
    if(!pn && !desc) return;
    var cat=esPU(r,['Category'])||'Other';
    var sub=esPU(r,['Sub Category','SubCategory'])||'General';
    var mrp=esPUnum(esPU(r,['MRP']));
    var rate=esPUnum(esPU(r,['Rate PreGST','Rate Pre GST']));
    var models=esPU(r,['Models Used On']).toUpperCase();
    var price = mrp>0 ? mrp : (rate>0 ? rate : 0);
    var item={pn:pn, l:desc||pn, price:price, cat:cat, sub:sub, models:models};
    if(!cats[cat]) cats[cat]={};
    if(!cats[cat][sub]) cats[cat][sub]=[];
    cats[cat][sub].push(item);
    all.push(item);
  });
  ES_PART_INDEX={cats:cats, all:all};
}
function esBuildPartIndexAsync(done){
  const rows=ES_MODEL_PART||[], cats={}, all=[];
  let i=0;
  function chunk(){
    const end=Math.min(i+350,rows.length);
    for(;i<end;i++){
      const r=rows[i];
      const pn=esPU(r,['Part No','Part Number']);
      const desc=esPU(r,['Description','Part Description']);
      if(!pn&&!desc) continue;
      const cat=esPU(r,['Category'])||'Other';
      const sub=esPU(r,['Sub Category','SubCategory'])||'General';
      const mrp=esPUnum(esPU(r,['MRP']));
      const rate=esPUnum(esPU(r,['Rate PreGST','Rate Pre GST']));
      const models=esPU(r,['Models Used On']).toUpperCase();
      const price=mrp>0?mrp:(rate>0?rate:0);
      const item={pn:pn,l:desc||pn,price:price,cat:cat,sub:sub,models:models};
      if(!cats[cat]) cats[cat]={};
      if(!cats[cat][sub]) cats[cat][sub]=[];
      cats[cat][sub].push(item); all.push(item);
    }
    if(i<rows.length){ setTimeout(chunk,0); return; }
    ES_PART_INDEX={cats:cats,all:all};
    if(done) done();
  }
  chunk();
}

function esCurrentModelUP(){
  var el=document.getElementById('es-model');
  return String((el&&el.value)||'').trim().toUpperCase();
}
function esPartMatchesModel(item){
  if(ES_PART_SHOWALL) return true;
  if(!item.models) return true;
  const m=heroOilKey(esCurrentModelUP());
  if(!m) return true;
  return String(item.models).split('|').some(function(x){ return heroOilKey(x)===m; });
}

function esRenderPartCategoryDropdown(){
  var sel=document.getElementById('es-add-pcat'); if(!sel) return;
  var cats=Object.keys(ES_PART_INDEX.cats).sort();
  sel.innerHTML='<option value="">Category…</option>'+cats.map(function(c){return '<option value="'+c+'">'+c+'</option>';}).join('');
  var sub=document.getElementById('es-add-psub'); if(sub) sub.innerHTML='<option value="">Sub-category…</option>';
  var nm=document.getElementById('es-add-pname'); if(nm) nm.innerHTML='<option value="">Part…</option>';
  var amt=document.getElementById('es-add-pamt'); if(amt){ amt.value=''; amt.readOnly=false; }
}

function esRenderPartSubDropdown(){
  var cat=val('es-add-pcat');
  var sub=document.getElementById('es-add-psub');
  var nm=document.getElementById('es-add-pname');
  var amt=document.getElementById('es-add-pamt'); if(amt) amt.value='';
  if(!sub) return;
  if(!cat){ sub.innerHTML='<option value="">Sub-category…</option>'; sub.style.display=''; if(nm) nm.innerHTML='<option value="">Part…</option>'; return; }
  var subs=Object.keys(ES_PART_INDEX.cats[cat]||{}).sort();
  // If the parts data has no real sub-categories (only the fallback 'General'), skip the
  // sub-category step and go straight to the parts list — otherwise the SA gets stuck on an
  // empty sub dropdown. When the master DOES carry sub-categories, they show normally. (Ravi 20-Jul)
  var realSubs=subs.filter(function(s){ return s && s!=='General'; });
  if(realSubs.length===0){
    var only=subs[0]||'General';
    sub.innerHTML='<option value="'+only+'">'+only+'</option>';
    sub.value=only; sub.style.display='none';
    esRenderPartDropdown();
    return;
  }
  sub.style.display='';
  sub.innerHTML='<option value="">Sub-category…</option>'+subs.map(function(x){return '<option value="'+x+'">'+x+'</option>';}).join('');
  if(nm) nm.innerHTML='<option value="">Select sub-category…</option>';
}

function esRenderPartDropdown(){
  var cat=val('es-add-pcat'), sub=val('es-add-psub');
  var nm=document.getElementById('es-add-pname');
  var amt=document.getElementById('es-add-pamt');
  if(!nm) return;
  if(!cat || !sub){ nm.innerHTML='<option value="">Select sub-category first…</option>'; if(amt) amt.value=''; return; }
  var items=((ES_PART_INDEX.cats[cat]||{})[sub]||[]).filter(esPartMatchesModel);
  var seen={}; items=items.filter(function(x){ var k=x.pn+'|'+x.l; if(seen[k]) return false; seen[k]=1; return true; });
  items.sort(function(a,b){ return a.l>b.l?1:-1; });
  nm._items=items;
  if(!items.length){
    nm.innerHTML='<option value="">No parts for this model — tick Show all</option>';
  } else {
    nm.innerHTML='<option value="">Select part…</option>'+items.map(function(p,i){
      var pr=p.price>0?(' — '+inr(p.price)):' — ₹ type';
      return '<option value="'+i+'" data-price="'+p.price+'">'+p.l+(p.pn?(' ['+p.pn+']'):'')+pr+'</option>';
    }).join('');
  }
  nm.onchange=function(){
    var it=(nm._items||[])[+nm.value];
    if(!it){ if(amt){ amt.value=''; amt.readOnly=false; } return; }
    if(amt){ amt.value = it.price>0 ? it.price : ''; amt.readOnly=false; }
  };
  if(amt) amt.value='';
}

function esTogglePartShowAll(cb){
  ES_PART_SHOWALL = !!(cb && cb.checked);
  esRenderPartDropdown();
}
function esAddPartFn(){
  const nm=document.getElementById('es-add-pname');
  const idx=+(nm&&nm.value);
  const items=(nm&&nm._items)||[];
  const row=items[idx]; if(!row){ alert('Pick category, sub-category and part first.'); return; }
  const typed=esPUnum(val('es-add-pamt'));
  const price=typed>0?typed:row.price;
  if(price<=0){ alert('Type the price for this part.'); return; }
  ES_ADDPART.push({l:row.l, p:price, pn:row.pn, _typed:(typed>0 && typed!==row.price)});
  // Learn-back (fire-and-forget): teach the master this part's price for this model,
  // and tag the model onto the part. Fills the blank 64% over real use. Never blocks.
  try{
    if(row.pn){
      jpost({type:'learn_part', pn:row.pn, model:esCurrentModelUP(),
             price:(typed>0?typed:0), by:(USER&&(USER.personName||USER.empno))||''});
    }
  }catch(e){}
  // DMS-style: adding a part auto-adds its mapped fitment labour(s) — up to 3 lines
  // (e.g. Front Fork Oil → 3 labours), each with its Hero DMS job code, never duplicated
  const map=esFindLinkedLabours(row.l);
  if(map){
    let added=[];
    map.labours.forEach(lb=>{
      if(!ES_ADDLAB.some(x=>x.l.toLowerCase()===lb.l.toLowerCase())){ ES_ADDLAB.push({l:lb.l,p:lb.p,code:lb.code,cc:lb.cc,_fromPart:row.l}); added.push(lb.l+' ('+inr(lb.p)+')'); }
    });
    const msg=document.getElementById('es-msg');
    if(msg && added.length){ msg.style.color='var(--ok)'; msg.textContent='🔗 Linked labour added: '+added.join(', ')+'. It will be removed automatically if the part is removed.'; setTimeout(()=>{ if(msg.textContent.indexOf('Linked labour')>-1) msg.textContent=''; },7000); }
  }
  document.getElementById('es-add-pcat').value='';
  var _sub=document.getElementById('es-add-psub'); if(_sub) _sub.innerHTML='<option value="">Sub-category…</option>';
  document.getElementById('es-add-pname').innerHTML='<option value="">Part…</option>';
  document.getElementById('es-add-pamt').value='';
  var _sa=document.getElementById('es-add-showall'); if(_sa){ _sa.checked=false; ES_PART_SHOWALL=false; }
  esDrawChips();
}
esRenderPartCategoryDropdown();

function esDrawChips(){
  const c=document.getElementById('es-chips');
  c.innerHTML=[...ES_ADDLAB.map((x,i)=>({...x,t:'L',i})),...ES_ADDPART.map((x,i)=>({...x,t:'P',i}))]
    .map(x=>`<div class="chip"><span>${x.t==='L'?'🔧':'⚙️'} ${x.l}${x.code?' <b style="font-size:10px;color:var(--steel)">['+x.code+']</b>':''}</span><span><b>${inr(x.p)}</b> <span class="x" onclick="esRmChip('${x.t}',${x.i})">✕</span></span></div>`).join('');
  esUpdateLive();
}
function esRmChip(t,i){
  if(t==='L'){ ES_ADDLAB.splice(i,1); }
  else {
    const removed=ES_ADDPART[i];
    ES_ADDPART.splice(i,1);
    // Reverse of the DMS auto-link: when a part is removed, drop the labour(s) it
    // auto-added — but ONLY if no other still-present part also maps to that labour
    // (shared fitment labour must survive) and the SA hasn't manually kept it.
    if(removed){
      const stillMappedLabours=new Set();
      ES_ADDPART.forEach(p=>{ const m=esFindLinkedLabours(p.l); if(m) m.labours.forEach(lb=>stillMappedLabours.add(lb.l.toLowerCase())); });
      const dropped=[];
      ES_ADDLAB=ES_ADDLAB.filter(lb=>{
        const wasAutoFromThisPart = lb._fromPart && lb._fromPart.toLowerCase()===removed.l.toLowerCase();
        if(wasAutoFromThisPart && !stillMappedLabours.has(lb.l.toLowerCase())){ dropped.push(lb.l); return false; }
        return true;
      });
      if(dropped.length){
        const msg=document.getElementById('es-msg');
        if(msg){ msg.style.color='var(--steel)'; msg.textContent='🔗 Linked labour removed with the part: '+dropped.join(', ')+'.'; setTimeout(()=>{ if(msg.textContent.indexOf('Linked labour removed')>-1) msg.textContent=''; },5000); }
      }
    }
  }
  esDrawChips();
}

function esBuild(fam, dec, km, modelName){
  const type=dec.type;
  const L={oil:[],parts:[],labour:[]};
  // Oil: model-specific price from MD_ModelOilMap (real MRP per model) wins over the
  // coarse FAM bucket — this is the ₹373-Harley fix. Falls back to FAM only if the model
  // isn't in the oil map.
  const oil=()=>{
    const mo=heroOilForModel(modelName);
    if(mo){ const vol=mo.vol?(' · '+mo.vol+' ml'):''; L.oil.push({l:'Engine Oil'+vol+(mo.part?' ('+mo.part+')':''),p:mo.mrp}); }
  };
  const checkedVar=()=>esMdVarItems().filter(function(v){ const el=document.getElementById('esvc-'+v.k); return el&&el.checked; });
  const checkedWearTear=()=>WEARTEAR.filter(function(v){ const el=document.getElementById('eswt-'+v.k); return el&&el.checked; });
  // Base PM labour from master table or fallback
  const addPmLab=(svcTypeFull, fallbackLabel, fallbackPrice, isFree)=>{
    const ml=esMdPmLabour(svcTypeFull);
    const item=ml?{l:ml.l,p:ml.p}:{l:fallbackLabel,p:fallbackPrice};
    if(isFree) item.free=true;
    L.labour.push(item);
  };
  // ADDITIVE: both the model-specific kit parts (master data) AND the km-based
  // random parts logic run together — previously one replaced the other, which
  // dropped the total too low (was ~4200, fell to ~3081). Deduped by label so the
  // same part isn't double-charged if it appears in both sources.
  const addKitParts=()=>{
    const seen={};
    const bucket=esServiceBucket(dec);
    const kitParts=esMdKitParts(modelName,bucket);
    if(kitParts.length){
      kitParts.forEach(k=>{ if(!seen[k.l.toLowerCase()]){ seen[k.l.toLowerCase()]=true; L.parts.push(k); } });
    }
  };
  // Small consumable bundle from local parts master (nut/bolt/O-ring etc) — always added
  const addLocalBundle=()=>esMdLocalParts().forEach(p=>L.parts.push(p));
  // Optional wear-and-tear parts SA ticked on (Brake Shoe Kit, Chain Kit, Clutch, Brake Pads)
  const addWearTear=()=>checkedWearTear().forEach(v=>L.parts.push({l:v.l,p:v.p}));

  if(type==='free'){
    const stage=dec.stage?dec.stage.n:'I';
    addPmLab('Free Service '+stage,'Scheduled Free Service (labour waived)',0,true);
    oil(); addKitParts(); addLocalBundle(); addWearTear();
    checkedVar().forEach(v=>L.labour.push({l:v.l,p:v.p,code:v.code||''}));
  }
  else if(type==='paid'){
    FORTY.forEach(f=>L.labour.push({...f}));
    addPmLab('Paid Service','Paid Service Labour (PM)',fam.paid||820,false);
    oil(); addKitParts(); addLocalBundle(); addWearTear();
    checkedVar().forEach(v=>L.labour.push({l:v.l,p:v.p,code:v.code||''}));
  }
  else if(type==='joyride'){
    const ml=esMdPmLabour('Joyride');
    L.labour.push(ml||{l:'Joyride Service Labour',p:100});
    oil(); addLocalBundle(); addWearTear();
    checkedVar().forEach(v=>L.labour.push({l:v.l,p:v.p,code:v.code||''}));
  }
  else if(type==='accidental'){
    const ml=esMdPmLabour('Accidental Repair');
    L.labour.push(ml||{l:'Accidental Repair Labour (per estimate)',p:FLOOR.accidental});
  }
  else if(type==='general'){
    checkedVar().forEach(v=>L.labour.push({l:v.l,p:v.p,code:v.code||''}));
    if(!L.labour.length){
      const ml=esMdPmLabour('General Repair');
      L.labour.push(ml||{l:'General Repair Labour',p:FLOOR.general});
    }
    addLocalBundle(); addWearTear();
  }
  ES_ADDLAB.forEach(x=>L.labour.push({...x}));
  ES_ADDPART.forEach(x=>L.parts.push({...x}));
  // Fix #4: apply SA-removed line items (delete option on PM/kit parts)
  if(ES_REMOVED.size){
    L.oil=L.oil.filter(p=>!ES_REMOVED.has(p.l)); // FIX: oil rows were not deletable — filter was missing for L.oil
    L.parts=L.parts.filter(p=>!ES_REMOVED.has(p.l));
    L.labour=L.labour.filter(p=>!ES_REMOVED.has(p.l)||p.free); // never let SA accidentally remove the waived base labour line
  }
  return L;
}
let ES_REMOVED=new Set(); // labels of PM/kit items the SA has explicitly removed for this estimate
/* SA-editable amounts (URGENT per Ravi): oil/kit/labour prices sometimes lag the real
   current price (e.g. Xtreme/Xpulse oil up ₹60 vs the coded ₹373). The SA can tap ✏ on
   ANY line in the live draft and type the correct amount. Overrides are keyed by item
   label, applied AFTER esBuild — so the floor minimums still apply on the edited total,
   and a New Estimate always starts clean at master prices. */
let ES_PRICE_OVERRIDES={};
let ES_LINE_DISCOUNTS={}; // key = section|label
let ES_UNDO_STACK=[]; // one-step-back snapshots for the estimate builder (Ctrl+Z for SAs)
function esEditPrice(label){
  if(ES.locked) return;
  const c=esComputeCurrent(); if(!c) return;
  const all=[...c.items.oil,...c.items.parts,...c.items.labour];
  const it=all.find(x=>x.l===label); if(!it) return;
  if(it.free){ alert('This line is free of charge for this service type — amount cannot be edited.'); return; }
  const v=prompt('Enter the correct amount (₹) for:\n'+label,it.baseP!==undefined?it.baseP:it.p);
  if(v===null) return;
  const n=Number(String(v).replace(/[₹,\s]/g,''));
  if(isNaN(n)||n<0){ alert('Enter a valid amount.'); return; }
  ES_PRICE_OVERRIDES[label]=Math.round(n);
  esUpdateLive();
}
function esDiscountLine(label,kind){
  if(ES.locked) return;
  const c=esComputeCurrent(); if(!c) return;
  const arr=(kind&&c.items[kind])||[...c.items.oil,...c.items.parts,...c.items.labour];
  const it=arr.find(x=>x.l===label); if(!it||it.free) return;
  const key=(kind||'line')+'|'+label;
  const old=ES_LINE_DISCOUNTS[key];
  const def=old?(old.mode==='pct'?old.value+'%':old.value):'';
  const v=prompt('Line discount for:\n'+label+'\n\nType 5% or an amount such as 50. Leave blank to remove.',def);
  if(v===null) return;
  const raw=String(v).trim();
  if(!raw||raw==='0'||raw==='0%'){ delete ES_LINE_DISCOUNTS[key]; esUpdateLive(); return; }
  const pct=raw.endsWith('%');
  const n=Number(raw.replace(/[%₹,\s]/g,''));
  if(isNaN(n)||n<0){ alert('Enter a valid discount.'); return; }
  ES_LINE_DISCOUNTS[key]={mode:pct?'pct':'amt',value:n};
  esUpdateLive();
}
function esApplyPriceOverrides(L){
  ['oil','parts','labour'].forEach(k=>{
    L[k].forEach(it=>{
      if(!it.free && ES_PRICE_OVERRIDES[it.l]!==undefined) it.p=ES_PRICE_OVERRIDES[it.l];
      it.baseP=+it.p||0;
      const d=ES_LINE_DISCOUNTS[k+'|'+it.l];
      let off=0;
      if(!it.free&&d) off=d.mode==='pct'?(it.baseP*d.value/100):d.value;
      it.lineDiscount=Math.max(0,Math.min(it.baseP,Math.round(off)));
      it.netP=Math.max(0,it.baseP-it.lineDiscount);
    });
  });
  return L;
}
/* ===== HERO DMS PART NOS + LABOUR CODES ON THE ESTIMATE =====
   Parts still get their Hero Part Nos from the parts masters. Labour codes now come
   from MD_PriceMaster_Labour first, with MD_PartLabourMap used only for mapped
   part-linked labour lines. MD_VariableLabour is not used anywhere in estimate flow. */
function esDmsLabourCode(label, dec, freeStage, modelName){
  const up=String(label||'').toUpperCase();
  // First source only: real billing labour master MD_PriceMaster_Labour.
  // For PM labour the estimate label is friendly, so map it to the DMS label first.
  if(up.indexOf('PREVENTIVE MAINTENANCE')>-1){
    if(dec && (dec.type==='paid'||dec.type==='joyride')){
      const pm=esFindPriceLabour('REGULAR SERVICE (PAID)', modelName);
      if(pm&&pm.code) return pm.code;
      return '202001'; // safe PM fallback only if the master was not loaded
    }
    if(dec && dec.type==='free'){
      const n={I:1,II:2,III:3,IV:4,V:5}[(dec.stage&&dec.stage.n)||freeStage||'I']||1;
      return '20100'+n; // free-service DMS base code is not present in MD_PriceMaster_Labour
    }
  }
  if(up.indexOf('ACCIDENTAL')>-1){
    const ac=esFindPriceLabour(label, modelName);
    return (ac&&ac.code) ? ac.code : '102032';
  }
  if(up.indexOf('GENERAL REPAIR LABOUR')>-1) return ''; // no single mapped DMS code
  const pm=esFindPriceLabour(label, modelName);
  if(pm&&pm.code) return pm.code;
  const mapped=esFindPartLabourMappedCode(label);
  if(mapped) return mapped;
  return '';
}
function esPartNo(desc, modelName){
  /* Punctuation-proof matching: MD_ModelKitParts says "FSC Kit (5th) 100CC" while
     MD_PreventiveMaintenanceKits says "FSC Kit 5th 100CC" — raw substring matching
     silently dropped the PN on 7 kit lines. Both sides are normalized (letters+digits
     only) with a token-subset fallback for word-order differences ("Oil Filter
     Element" vs "Element Oil Filter"). PN sources, in order: PreventiveMaintenanceKits
     (model-group aware), LocalPartsPack (has its own Part No column), and — if a
     'Part No' column is ever added to MD_PartLabourMap — that too, automatically. */
  const raw=String(desc||'').trim(); if(!raw) return '';
  const AL={'AIRCLEANERELEMENT':'ELEMENTCOMPAIRC','AIRCLEANERELEMENTREPLACE':'ELEMENTCOMPAIRC','AIRFILTERELEMENT':'ELEMENTCOMPAIRC'}; // same physical part, different naming
  const nm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tk=s=>new Set(String(s||'').toUpperCase().match(/[A-Z0-9]+/g)||[]);
  const sub=(a,b)=>{ for(const x of a) if(!b.has(x)) return false; return a.size>0; };
  let n=nm(raw); if(AL[n]) n=AL[n];
  const t=tk(raw);
  const mWords=String(modelName||'').toUpperCase().split(/[^A-Z0-9]+/).filter(w=>w.length>2);
  const srcs=[];
  ES_PM_KITS.forEach(r=>{ const pn=String(r['Part No']||'').trim(); if(pn) srcs.push({d:String(r['Description']||''),pn:pn,grp:String(r['Model Group']||'').toUpperCase()}); });
  ES_LOCAL_PARTS.forEach(r=>{ const pn=String(r['Part No']||'').trim(); if(pn) srcs.push({d:String(r['Description']||''),pn:pn,grp:''}); });
  ES_PART_LABOUR_MAP.forEach(r=>{ const pn=String(r['Part No']||'').trim(); if(pn) srcs.push({d:String(r['Part Name']||''),pn:pn,grp:''}); });
  let firstHit='';
  for(const s of srcs){
    const dn=nm(s.d); if(!dn) continue;
    if(dn===n || n.indexOf(dn)>-1 || dn.indexOf(n)>-1){
      if(!firstHit) firstHit=s.pn;
      if(s.grp && mWords.some(w=>s.grp.indexOf(w)>-1)) return s.pn; // model-group specific PN wins
    }
  }
  if(firstHit) return firstHit;
  for(const s of srcs){ const dt=tk(s.d); if(sub(dt,t)||sub(t,dt)) return s.pn; } // word-order fallback
  return '';
}
function esAnnotateDmsCodes(L, dec, freeStage, modelName){
  L.labour.forEach(it=>{ if(!it.code){ const c=esDmsLabourCode(it.l, dec, freeStage, modelName); if(c) it.code=c; } });
  L.parts.forEach(it=>{ if(!it.pn){ const pn=esPartNo(it.l, modelName); if(pn) it.pn=pn; } });
  return L;
}
function esRemoveItem(label){
  const c=esComputeCurrent();
  const linked=c&&c.items.labour.find(x=>x.l===label&&x._fromPart);
  if(linked){ alert('This labour is linked to a selected part. Remove the part to remove its labour.'); return; }
  ES_UNDO_STACK.push({removed:new Set(ES_REMOVED),overrides:{...ES_PRICE_OVERRIDES},lineDiscounts:JSON.parse(JSON.stringify(ES_LINE_DISCOUNTS||{})),label:label});
  if(ES_UNDO_STACK.length>10) ES_UNDO_STACK.shift();
  ES_REMOVED.add(label);
  // Removing a manually selected part must also remove only the labour that this part
  // introduced, unless another still-visible part needs the same labour.
  const removedPart=c&&c.items.parts.find(x=>x.l===label);
  if(removedPart){
    const stillNeeded=new Set();
    c.items.parts.filter(x=>x.l!==label&&!ES_REMOVED.has(x.l)).forEach(function(p){
      const map=esFindLinkedLabours(p.l);
      if(map) map.labours.forEach(lb=>stillNeeded.add(String(lb.l||'').toLowerCase()));
    });
    ES_ADDLAB.forEach(function(lb){
      if(lb._fromPart && String(lb._fromPart).toLowerCase()===String(label).toLowerCase() && !stillNeeded.has(String(lb.l||'').toLowerCase())) ES_REMOVED.add(lb.l);
    });
  }
  esUpdateLive();
  esRenderUndoBtn();
}
function esUndoLast(){
  if(!ES_UNDO_STACK.length) return;
  const snap=ES_UNDO_STACK.pop();
  ES_REMOVED=new Set(snap.removed);
  ES_PRICE_OVERRIDES=snap.overrides||{};
  ES_LINE_DISCOUNTS=snap.lineDiscounts||{};
  esUpdateLive();
  esRenderUndoBtn();
  const msg=document.getElementById('es-msg');
  if(msg){ msg.style.color='#166534'; msg.textContent='↩ Last change undone'+(snap.label?' ('+snap.label+')':'')+'.'; setTimeout(()=>{ if(msg.textContent.indexOf('undone')>-1) msg.textContent=''; },2500); }
}
function esRenderUndoBtn(){
  const b=document.getElementById('es-undo-btn'); if(!b) return;
  b.style.display=ES_UNDO_STACK.length?'inline-flex':'none';
  b.textContent='↩ Undo last change'+(ES_UNDO_STACK.length>1?' ('+ES_UNDO_STACK.length+')':'');
}
function esResetRemoved(){ ES_REMOVED=new Set(); }

function esComputeCurrent(){
  const modelName=val('es-model'); if(!modelName) return null;
  const fam=famFor(modelName);
  const ftype=val('es-type'); if(!ftype) return null;
  const km=+val('es-km')||0, dos=val('es-dos'), freeStage=val('es-freestage');
  const dec=esDecide(fam,ftype,freeStage); if(!dec) return null;
  const items=esAnnotateDmsCodes(esApplyPriceOverrides(esBuild(fam,dec,km,modelName)),dec,freeStage,modelName);
  if(!items.protection) items.protection=[];
  const sumGross=a=>a.reduce((x,y)=>x+(+y.baseP||+y.p||0),0);
  const sumNet=a=>a.reduce((x,y)=>x+(y.netP!==undefined?+y.netP:(+y.p||0)),0);
  const sumLine=a=>a.reduce((x,y)=>x+(+y.lineDiscount||0),0);
  let parts=sumGross(items.parts), oil=sumGross(items.oil), labour=sumGross(items.labour);
  const netService=sumNet(items.parts)+sumNet(items.oil)+sumNet(items.labour);
  const lineDisc=sumLine(items.parts)+sumLine(items.oil)+sumLine(items.labour);
  const express=document.getElementById('es-express')&&document.getElementById('es-express').checked;
  const expressFee=express?80:0;
  const inc=(dec.type==='paid')?heroIncrementalPrice(modelName,dec.type):null;
  const oldFloor=(dec.type==='paid')?esPaidFloor(modelName,fam):(FLOOR[dec.type]||0);
  const floor=(inc&&inc.floor!==undefined&&inc.floor!==null)?inc.floor:oldFloor;
  const initial=(inc&&inc.initial!==undefined&&inc.initial!==null)?inc.initial:Math.max(oldFloor,parts+oil+labour);
  const changed=esHasCommercialChange();
  items.protection=[];
  const rawPre=parts+oil+labour;
  const belowFloor=netService>0?(netService<floor):true;
  const protectionTotal=0, protectionLabel='';
  items.express=expressFee>0?[{l:'Express Delivery (priority same-day)',p:expressFee,baseP:expressFee,netP:expressFee,lineDiscount:0,locked:true}]:[];
  const pre=rawPre+expressFee;
  let discLab=+val('es-disc-lab')||0, discParts=+val('es-disc-parts')||0;
  let requestedDisc=discLab+discParts; if(!requestedDisc) requestedDisc=+val('es-disc')||0;
  const maxOtherDisc=Math.max(0,netService-floor);
  let otherDisc=Math.min(requestedDisc,maxOtherDisc);
  if(otherDisc<requestedDisc&&requestedDisc>0){
    const ratio=requestedDisc?otherDisc/requestedDisc:1;
    discLab=Math.round(discLab*ratio); discParts=Math.max(0,otherDisc-discLab);
  }
  const disc=lineDisc+otherDisc;
  const afterDisc=Math.max(0,pre-disc), tax=afterDisc*GST, total=afterDisc+tax;
  const count=items.oil.length+items.parts.length+items.labour.length+(expressFee>0?1:0);
  return {modelName,fam,km,dos,dec,items,parts,oil,labour,pre,rawPre,protection:protectionTotal,protectionLabel,floor,initial,inc,disc,lineDisc,otherDisc,requestedDisc,discLab,discParts,expressFee,tax,total,count,type:dec.type,changed,belowFloor};
}
function esUpdateLive(){
  try{
    if(ES.locked) return; // a generated estimate is locked on screen — live preview no longer overwrites it
    const c=esComputeCurrent();
    const note=document.getElementById('es-disc-note');
    if(!c){
      document.getElementById('es-liveval').innerHTML='<small>₹</small>0';
      document.getElementById('es-livecount').textContent='0 items';
      if(note) note.style.display='none';
      document.getElementById('es-out').innerHTML='<div class="empty"><div class="cond">No estimate yet</div><p style="margin-top:8px">Select a model and service type to see the live price breakup.</p></div>';
      return;
    }
    document.getElementById('es-liveval').innerHTML='<small>₹</small>'+num(c.total);
    document.getElementById('es-livecount').textContent=c.count+' line item'+(c.count===1?'':'s');
    // Floor gate (Ravi 15-Jul): SA can delete anything, but under the model floor the
    // Generate button fades and won't click. No synthetic line on the estimate — ever.
    const gbtn=document.getElementById('es-genbtn');
    if(gbtn && !ES.locked){
      gbtn.disabled=!!c.belowFloor||!ONLINE;
      gbtn.style.opacity='';
      gbtn.removeAttribute('title');
    }
    const fmsg=document.getElementById('es-msg');
    if(fmsg && /minimum|model floor|below the/i.test(fmsg.textContent||'')) fmsg.textContent='';
    // Live oil / labour / parts / total summary (requested: "only total running value is
    // coming. Can it be divided into oil, labour, parts summary and then total bill")
    const bd=document.getElementById('es-breakdown');
    if(bd){
      const labTotal=c.labour; // actual visible labour only; model floor shown separately
      bd.style.display='block';
      bd.innerHTML=`<div style="display:flex;justify-content:space-between;padding:2px 0"><span>🛢 Oil</span><b class="mono">${inr(c.oil)}</b></div>`+
        `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>🔧 Labour${c.topup>0?' <span style=\"font-size:10px;color:#b45309\">(incl. service min)</span>':''}</span><b class="mono">${inr(labTotal)}</b></div>`+
        `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>⚙️ Parts</span><b class="mono">${inr(c.parts)}</b></div>`+
        (c.protection>0?`<div style="display:flex;justify-content:space-between;padding:2px 0;color:#92400e"><span>🛡 ${c.protectionLabel}</span><b class="mono">${inr(c.protection)}</b></div>`:'')+
        (c.lineDisc>0?`<div style="display:flex;justify-content:space-between;padding:2px 0;color:#b45309"><span>Line discounts</span><b class="mono">−${inr(c.lineDisc)}</b></div>`:'')+
        (c.expressFee>0?`<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--signal-d)"><span>⚡ Express delivery</span><b class="mono">${inr(c.expressFee)}</b></div>`:'')+
        (c.disc>0?`<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--signal-d)"><span>− Discount${c.discLab&&c.discParts?' (L '+inr(c.discLab)+' + P '+inr(c.discParts)+')':''}</span><b class="mono">−${inr(c.disc)}</b></div>`:'')+
        `<div style="display:flex;justify-content:space-between;padding:4px 0 2px;border-top:1px dashed var(--line);margin-top:3px"><span>Sub-total</span><b class="mono">${inr(c.pre-c.disc)}</b></div>`+
        `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>GST @ 18%</span><b class="mono">${inr(c.tax)}</b></div>`+
        `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:800"><span>Total</span><b class="mono">${inr(c.total)}</b></div>`;
    }
    const typedDisc = (+val('es-disc')||0)+(+val('es-disc-lab')||0)+(+val('es-disc-parts')||0);
    if(note){
      if(typedDisc > c.otherDisc){ note.style.display='block'; note.textContent='Discount adjusted to the permitted amount.'; }
      else note.style.display='none';
    }
    esRenderDraft(c);
  }catch(e){
    const lv=document.getElementById('es-liveval'); if(lv) lv.innerHTML='<small>₹</small>0';
    const lc=document.getElementById('es-livecount'); if(lc) lc.textContent='0 items';
  }
}
/* Full itemised breakup shown LIVE before the estimate is generated/locked —
   uses the exact same grouped layout as the final estimate, just unlocked. */
function esRenderDraft(c){
  document.getElementById('es-out').innerHTML=`
  <div class="estimate" style="opacity:.92">
    <div class="e-head">
      <div class="e-top"><div class="e-dealer">Sehgal Auto<span>Authorised Hero MotoCorp Workshop · ${USER.ws}</span></div>
      <div class="e-doc">Live Preview<small>Not yet generated</small></div></div>
      <div class="e-meta">
        <div><div class="k">Customer</div><div class="v">${val('es-name')||'—'}</div></div>
        <div><div class="k">Service</div><div class="v" style="color:var(--signal-d)">${c.dec.label}</div></div>
        <div><div class="k">Model</div><div class="v">${c.modelName}</div></div>
        <div><div class="k">Reg. No</div><div class="v mono">${val('es-reg')||'—'}</div></div>
        <div><div class="k">Advisor</div><div class="v">${USER.personName}</div></div>
      </div>
    </div>
    <div class="e-body">${ES_DEMANDED.length?`<div style="font-size:12px;font-weight:700;color:#1e40af;background:#eff6ff;border-radius:6px;padding:6px 10px;margin-bottom:8px">🗣 Demanded repairs: ${ES_DEMANDED.map(x=>`${x.name} <span class=\"mono\" style=\"font-size:10.5px\">[${x.cc||'—'}]</span>`).join(' · ')}</div>`:''}${esGrpEditable('Engine Oil',c.items.oil,'oil')}${esGrpEditable('Parts',c.items.parts,'parts')}${esGrpEditable('Labour',c.items.labour,'labour')}${esGrp('Estimate Protection',c.items.protection||[])}${esGrp('Express Delivery',c.items.express||[])}</div>
    <div class="totals"><div class="trow"><span>Sub-total</span><span class="mono">${inr(c.pre)}</span></div>
      ${c.disc>0?`<div class="trow disc"><span>Discount</span><span class="mono">−${inr(c.disc)}</span></div>`:''}
      <div class="trow"><span>GST @ 18%</span><span class="mono">${inr(c.tax)}</span></div></div>
    <div class="grand"><div class="lab">Running Total (draft)</div><div class="val"><small>₹</small>${Math.round(c.total).toLocaleString('en-IN')}</div></div>
    <div class="e-note">Use Discount, Edit or ✕ against an individual line before generating. Labour linked to a selected part is removed only when that part is removed.</div>
  </div>`;
}

let ES = {current:null, locked:false, gateId:'', token:'', location:''};
/* ===== COMPULSORY FIELDS (v11.4) — shared by Gate Entry + Estimate =====
   Ravi's spec (items 4 & 10): Reg No, Mobile, Customer Name, Model, Odometer/KM are
   compulsory in BOTH; Service Type is additionally compulsory on the Estimate. On a
   blank field, Save is BLOCKED and a popup lists only what's missing. */
function reqShowMissing(missing){
  const ul=document.getElementById('req-list'); if(!ul) return;
  ul.innerHTML=missing.map(m=>`<li>${m}</li>`).join('');
  document.getElementById('req-modal').style.display='flex';
}
function reqCheck(fields){
  const missing=[];
  fields.forEach(f=>{
    const v=String(f.v||'').trim();
    if(!v){ missing.push(f.label); return; }
    if(f.mobile){ const digits=v.replace(/\D/g,''); if(digits.length!==10) missing.push(f.label+' (10 digits)'); }
  });
  return missing;
}

function esGenerate(){
  if(ES.locked) return;
  if(!ONLINE){ document.getElementById('es-msg').style.color='var(--signal-d)'; document.getElementById('es-msg').textContent='No internet connection — cannot generate.'; return; }
  // Floor gate — even if the button state was bypassed somehow, generation refuses.
  const cchk=esComputeCurrent();
  if(cchk && cchk.belowFloor) return;
  const msg=document.getElementById('es-msg'); msg.style.color='var(--steel)'; msg.textContent='';
  // v11.4 compulsory fields — block + popup listing only what's missing
  const missing=reqCheck([
    {v:val('es-reg'), label:'Reg No'},
    {v:val('es-mob'), label:'Mobile No', mobile:true},
    {v:val('es-name'), label:'Customer Name'},
    {v:val('es-model'), label:'Model'},
    {v:val('es-km'), label:'Odometer (km)'},
    {v:val('es-type'), label:'Service Type'},
    {v:val('es-dos'), label:'Date of sale'}
  ]);
  if(missing.length){ reqShowMissing(missing); return; }
  const c=esComputeCurrent();
  if(!c){ msg.textContent='Select a model and a service type.'; return; }
  ES.current={id:'EST'+Date.now().toString().slice(-7),ts:Date.now(),name:val('es-name'),mob:val('es-mob'),reg:val('es-reg').toUpperCase(),
    model:c.modelName,fam:c.fam.name,km:c.km,mo:esMonthsSince(c.dos),service:c.dec.label,type:c.type,items:{...c.items,demanded:ES_DEMANDED.slice()},demanded:ES_DEMANDED.slice(),
    parts:c.parts,oil:c.oil,labour:c.labour,protection:c.protection,initial:c.initial,pre:c.pre,disc:c.disc,lineDiscount:c.lineDisc||0,tax:c.tax,total:c.total,floor:c.floor};
  esRender(ES.current); esLockForm(true); esPushSheet(ES.current);
}
function esCodeHtml(x){
  if(x.pn) return `<div style="font-size:11px;color:#0f766e;font-family:'Roboto Mono';font-weight:800;margin-top:2px">PART NO: ${x.pn}</div>`;
  if(x.code) return `<div style="font-size:11px;color:#1d4ed8;font-family:'Roboto Mono';font-weight:800;margin-top:2px">LABOUR CODE: ${x.code}</div>`;
  return '';
}
function esAmountHtml(x){
  if(x.free) return 'No charge';
  if(x.lineDiscount>0) return `<div>${inr(x.baseP)}</div><div style="font-size:10px;color:#b45309">−${inr(x.lineDiscount)} · Net ${inr(x.netP)}</div>`;
  return inr(x.baseP!==undefined?x.baseP:x.p);
}
function esRows(a){ return a.map(x=>`<tr><td>${x.l}${esCodeHtml(x)}</td><td class="amt">${esAmountHtml(x)}</td></tr>`).join(''); }
function esGrp(t,a){ if(!a.length) return ''; const total=a.reduce((x,y)=>x+(+y.baseP||+y.p||0),0); return `<div class="grp"><div class="grp-h"><span>${t}</span><span class="mono" style="font-size:13px">${inr(total)}</span></div><table class="li">${esRows(a)}</table></div>`; }
function esRowsEditable(a,kind){ return a.map(x=>{
  const safe=String(x.l).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const stock=x.pn?` <button type="button" class="es-stock-link" onclick="pfQuickCheck('${String(x.pn).replace(/'/g,'')}')" title="Check all-India stock">🔎 Check stock</button>`:'';
  const marks=(ES_PRICE_OVERRIDES[x.l]!==undefined?' <span class="es-line-state">Edited</span>':'')+(x.lineDiscount>0?' <span class="es-line-state">Discounted</span>':'');
  const del=x._fromPart?'<span class="es-line-act es-line-lock" title="Remove the selected part to remove this labour">🔒 <span>Linked</span></span>':`<button type="button" class="es-line-act es-line-remove" onclick="esRemoveItem('${safe}')" title="Remove this item"><span aria-hidden="true">✕</span><span>Remove</span></button>`;
  return `<tr class="es-edit-row"><td class="es-item-cell"><div class="es-item-name">${x.l}</div><div class="es-item-meta">${stock}${marks}</div>${esCodeHtml(x)}</td><td class="amt es-item-amt">${esAmountHtml(x)}</td><td class="es-item-actions"><button type="button" class="es-line-act es-line-disc" onclick="esDiscountLine('${safe}','${kind||''}')" title="Discount this line"><span aria-hidden="true">%</span><span>Discount</span></button><button type="button" class="es-line-act es-line-edit" onclick="esEditPrice('${safe}')" title="Correct amount"><span aria-hidden="true">✎</span><span>Edit</span></button>${del}</td></tr>`;
}).join(''); }
function esGrpEditable(t,a,kind){ if(!a.length) return ''; const total=a.reduce((x,y)=>x+(+y.baseP||+y.p||0),0); return `<div class="grp"><div class="grp-h"><span>${t}</span><span class="mono" style="font-size:13px">${inr(total)}</span></div><table class="li es-edit-table">${esRowsEditable(a,kind)}</table></div>`; }
function esRender(d){
  const dt=new Date(d.ts).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('es-out').innerHTML=`
  <div class="estimate">
    <div class="e-head">
      <div class="e-top"><div class="e-dealer">Sehgal Auto<span>Authorised Hero MotoCorp Workshop · ${USER.ws}</span></div>
      <div class="e-doc">Estimate<small>${d.id}</small></div></div>
      <div class="e-meta">
        <div><div class="k">Date &amp; time</div><div class="v">${dt}</div></div>
        <div><div class="k">Service</div><div class="v" style="color:var(--signal-d)">${d.service}</div></div>
        <div><div class="k">Customer</div><div class="v">${d.name||'—'}</div></div>
        <div><div class="k">Mobile</div><div class="v mono">${d.mob||'—'}</div></div>
        <div><div class="k">Model</div><div class="v">${d.model}</div></div>
        <div><div class="k">Reg. No</div><div class="v mono">${d.reg||'—'}</div></div>
        <div><div class="k">Odometer</div><div class="v mono">${d.km.toLocaleString('en-IN')} km</div></div>
        <div><div class="k">Advisor</div><div class="v">${USER.personName}</div></div>
      </div>
    </div>
    <div class="e-body">${(d.demanded&&d.demanded.length)?`<div style="font-size:12px;font-weight:700;color:#1e40af;background:#eff6ff;border-radius:6px;padding:6px 10px;margin-bottom:8px">🗣 Demanded repairs: ${d.demanded.map(x=>`${x.name} <span class=\"mono\" style=\"font-size:10.5px\">[${x.cc||'—'}]</span>`).join(' · ')}</div>`:''}${esGrp('Engine Oil',d.items.oil)}${esGrp('Parts',d.items.parts)}${esGrp('Labour',d.items.labour)}${esGrp('Estimate Protection',d.items.protection||[])}${esGrp('Express Delivery',d.items.express||[])}</div>
    <div class="totals"><div class="trow"><span>Sub-total</span><span class="mono">${inr(d.pre)}</span></div>
      ${d.disc>0?`<div class="trow disc"><span>Discount</span><span class="mono">−${inr(d.disc)}</span></div>`:''}
      <div class="trow"><span>GST @ 18%</span><span class="mono">${inr(d.tax)}</span></div></div>
    <div class="grand"><div class="lab">Total Estimate</div><div class="val"><small>₹</small>${Math.round(d.total).toLocaleString('en-IN')}</div></div>
    <div class="sign"><div>Service Advisor</div><div>Customer signature</div></div>
    <div class="e-note">Estimate prepared on the basis of the vehicle's service schedule, odometer reading and date of sale. Final amount may vary depending on the vehicle's condition at the time of service.</div>
  </div>`;
}
function esLockForm(on){ ES.locked=on;
  ['es-name','es-mob','es-reg','es-model','es-km','es-dos','es-type','es-freestage','es-add-lab','es-add-pcat','es-add-pname','es-add-pamt','es-add-dem','es-disc','es-disc-lab','es-disc-parts','es-express'].forEach(i=>{const el=document.getElementById(i); if(el) el.disabled=on;});
  document.querySelectorAll('#es-varbox input').forEach(c=>c.disabled=on);
  document.getElementById('es-genbtn').disabled=on||!ONLINE;
  ['es-watxt','es-pdfbtn','es-wapdf','es-newbtn'].forEach(i=>document.getElementById(i).disabled=!on);
  document.getElementById('es-lockban').style.display=on?'block':'none';
}
function esNewEstimate(){
  ['es-name','es-mob','es-reg','es-km','es-dos','es-add-pname','es-add-pamt','es-disc','es-disc-lab','es-disc-parts'].forEach(i=>{const el=document.getElementById(i); if(el) el.value='';});
  document.getElementById('es-model').value=''; document.getElementById('es-type').value=''; const pcat=document.getElementById('es-add-pcat'); if(pcat) pcat.value='';
  const exch=document.getElementById('es-express'); if(exch) exch.checked=false; // FIX: express fee no longer silently carries into the next estimate
  document.getElementById('es-freestage-wrap').style.display='none';
  ES_ADDLAB=[]; ES_ADDPART=[]; ES_DEMANDED=[]; ES_PRICE_OVERRIDES={}; ES_LINE_DISCOUNTS={}; ES_REMOVED=new Set(); ES_UNDO_STACK=[]; esRenderUndoBtn&&esRenderUndoBtn(); esDrawChips(); esDrawDemChips(); ES.current=null; esLockForm(false);
  ES_MODEL_CTX={reg:'',gateModel:''}; const emf=document.getElementById('es-model-flag'); if(emf){ emf.style.display='none'; emf.innerHTML=''; } const emm=document.getElementById('es-gate-photos'); if(emm){ emm.style.display='none'; }
  esRenderVariable(); esUpdateLive();
  document.getElementById('es-out').innerHTML='<div class="empty"><div class="cond">No estimate yet</div><p style="margin-top:8px">Enter the vehicle details and press <b>Generate estimate</b>.</p></div>';
  document.getElementById('es-msg').textContent='';
}
function esWaNum(m){ let n=(m||'').replace(/\D/g,''); if(n.length===10) n='91'+n; else if(n.length===11&&n[0]==='0') n='91'+n.slice(1); return n; }
function esWaText(){
  const d=ES.current; const L=['*Sehgal Auto — Service Estimate*',d.id+'  |  '+new Date(d.ts).toLocaleString('en-IN'),
    d.model+(d.reg?'  ('+d.reg+')':''),d.km.toLocaleString('en-IN')+' km  |  '+d.service,''];
  [['Engine Oil',d.items.oil],['Parts',d.items.parts],['Labour',d.items.labour],['Estimate Protection',d.items.protection||[]],['Express Delivery',d.items.express||[]]].forEach(([t,a])=>a.forEach(x=>L.push('• '+x.l+' — '+(x.free?'No charge':inr(x.p)))));
  L.push('','Sub-total: '+inr(d.pre)); if(d.disc>0) L.push('Discount: -'+inr(d.disc));
  L.push('GST 18%: '+inr(d.tax),'*Total Estimate: '+inr(d.total)+'*','','Sehgal Auto, '+USER.ws);
  return L.join('\n');
}
function esSendWAtext(){ if(!ES.current) return; const n=esWaNum(ES.current.mob); if(n.length<11){ document.getElementById('es-msg').textContent='Enter a valid 10-digit mobile number.'; return; }
  window.open('https://wa.me/'+n+'?text='+encodeURIComponent(esWaText()),'_blank'); }
function esBuildPDF(){

  const d=ES.current; const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'}); const W=doc.internal.pageSize.getWidth();
  doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(21,24,28); doc.text('SEHGAL AUTO',40,52);
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(91,100,112); doc.text('Authorised Hero MotoCorp Workshop · '+USER.ws,40,66);
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(192,57,43); doc.text('SERVICE ESTIMATE',W-40,52,{align:'right'});
  doc.setFont('courier','normal'); doc.setFontSize(11); doc.setTextColor(21,24,28); doc.text(d.id,W-40,68,{align:'right'});
  doc.setDrawColor(21,24,28); doc.setLineWidth(1.5); doc.line(40,80,W-40,80);
  const dt=new Date(d.ts).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  let y=100; doc.setFontSize(10);
  [['Date & time',dt,'Service',d.service],['Customer',d.name||'-','Mobile',d.mob||'-'],['Model',d.model,'Reg. No',d.reg||'-'],['Odometer',d.km.toLocaleString('en-IN')+' km','Advisor',USER.personName]].forEach(r=>{
    doc.setFont('helvetica','normal'); doc.setTextColor(91,100,112); doc.text(r[0].toUpperCase(),40,y); doc.text(r[2].toUpperCase(),320,y);
    doc.setFont('helvetica','bold'); doc.setTextColor(21,24,28); doc.text(String(r[1]),130,y); doc.text(String(r[3]),400,y); y+=18; });
  const body=[]; const add=(t,a)=>{ if(!a.length) return; body.push([{content:t,colSpan:2,styles:{fontStyle:'bold',fillColor:[241,238,232],textColor:[21,24,28]}}]); a.forEach(x=>body.push([x.l+(x.pn?'  PN '+x.pn:'')+(x.code?'  ['+x.code+']':''),x.free?'No charge':num(x.p)])); };
  if(d.demanded&&d.demanded.length){ body.push([{content:'DEMANDED REPAIRS: '+d.demanded.map(x=>x.name+' ['+(x.cc||'-')+']').join(' | '),colSpan:2,styles:{fontStyle:'bold',fillColor:[239,246,255],textColor:[30,64,175]}}]); }
  add('ENGINE OIL',d.items.oil); add('PARTS',d.items.parts); add('LABOUR',d.items.labour); add('ESTIMATE PROTECTION',d.items.protection||[]); add('EXPRESS DELIVERY',d.items.express||[]);
  doc.autoTable({startY:y+6,head:[['Description','Amount (Rs.)']],body,theme:'grid',headStyles:{fillColor:[21,24,28],halign:'left'},columnStyles:{1:{halign:'right',font:'courier',cellWidth:95}},styles:{fontSize:10,cellPadding:5},margin:{left:40,right:40}});
  let yy=doc.lastAutoTable.finalY+16; doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40);
  doc.text('Sub-total',W-160,yy); doc.text(num(d.pre),W-40,yy,{align:'right'}); yy+=16;
  if(d.disc>0){ doc.setTextColor(31,122,77); doc.text('Discount',W-160,yy); doc.text('-'+num(d.disc),W-40,yy,{align:'right'}); doc.setTextColor(40,40,40); yy+=16; }
  doc.text('GST @ 18%',W-160,yy); doc.text(num(d.tax),W-40,yy,{align:'right'}); yy+=10;
  doc.setFillColor(21,24,28); doc.rect(40,yy,W-80,34,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
  doc.setFontSize(13); doc.text('TOTAL ESTIMATE (Rs.)',52,yy+22); doc.setFontSize(15); doc.text(num(d.total),W-52,yy+22,{align:'right'});
  yy+=62; doc.setTextColor(120,120,120); doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text('Estimate based on service schedule, odometer and date of sale. Final amount may vary with vehicle condition.',40,yy);
  doc.line(60,yy+48,200,yy+48); doc.line(W-200,yy+48,W-60,yy+48);
  doc.setTextColor(91,100,112); doc.text('Service Advisor',60,yy+60); doc.text('Customer signature',W-200,yy+60);
  return doc;
}
/* SPEED 1: esBuildPDF returns a document the caller chains onto, so the library
   guard lives HERE, not inside the builder. */
function esDownloadPDF(){ if(!ES.current) return;
  heroEnsureLibs('pdf', function(ok){ if(!ok) return; esBuildPDF().save('Estimate_'+ES.current.id+'.pdf'); });
}
async function esSharePDF(){
  if(!ES.current) return; const m=document.getElementById('es-msg');
  const libsOk=await heroEnsureLibs('pdf'); if(!libsOk) return;
  const blob=esBuildPDF().output('blob'); const file=new File([blob],'Estimate_'+ES.current.id+'.pdf',{type:'application/pdf'});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:'Service Estimate',text:'Sehgal Auto — your service estimate'}); }catch(e){} }
  else{ esBuildPDF().save('Estimate_'+ES.current.id+'.pdf'); m.textContent='PDF downloaded. Open WhatsApp and attach it (file-sharing works directly on a phone).'; }
}
async function esPushSheet(d){
  const rec={id:d.id,ts:d.ts,name:d.name,mob:d.mob,reg:d.reg,model:d.model,km:d.km,mo:d.mo,service:d.service,
    parts:Math.round(d.parts),oil:Math.round(d.oil),labour:Math.round(d.labour),discount:Math.round(d.disc),
    pre:Math.round(d.pre),tax:Math.round(d.tax),total:Math.round(d.total),floor:d.floor,items:d.items,
    gateId:ES.gateId||'', token:ES.token||'', location:ES.location||USER.ws,
    empno:USER.empno, empname:USER.personName, ws:USER.ws};
  const m=document.getElementById('es-msg');
  if(!SHEET_URL){ m.textContent='Estimate '+d.id+' ready.'; return; }
  try{ await fetch(SHEET_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(rec)});
    m.style.color='var(--ok)'; m.textContent='Estimate '+d.id+' saved to sheet.'; }
  catch(e){ m.textContent='Estimate '+d.id+' ready (saved locally).'; }
}

/* Gate-entry picker: pending-only, scoped to this user's allowed workshops */
let ES_GATE_ENTRIES=[];
function esLoadGateEntries(){
  // FIX 15-Jul: while a vehicle is picked, never rebuild the list — earlier guard sat in a
  // wrapper that internal callers (refresh timer) bypassed, so the selection kept vanishing.
  if(typeof ES!=='undefined' && ES && (ES.gateId||ES.token)) return;
  const sel0=document.getElementById('es-gate-pick');
  if(!getLastGood('report_today',{})) sel0.innerHTML='<option value="">Loading vehicles…</option>';
  jgetReliable('report_today', {}, function(res, isStale){
    if(!res || res.ok===false){
      if(!isStale) document.getElementById('es-gate-pick').innerHTML='<option value="">— Could not load (tap to retry) —</option>';
      return;
    }
    // ALL DAYS, NOT JUST TODAY (Ravi 16-Jul): advisors open JCs next day when a lot of
    // vehicles come in together. pendingAll comes from the backend when available;
    // pending (today) is the fallback until that deploy.
    let entries=(res&&(res.pendingAll||res.pending))||[];
    entries = entries.filter(e => wsAllowed(e.location));
    ES_GATE_ENTRIES=entries;
    const sel=document.getElementById('es-gate-pick');
    const hint=document.getElementById('es-gate-hint');
    if(!entries.length){
      // The app knows. It should not ask the SA to go and check a list.
      sel.innerHTML='<option value="">— Nothing pending —</option>';
      if(hint) hint.innerHTML='✅ All gate-entered vehicles are estimated. Nothing is pending.<br>'
        +'If a vehicle is standing in your workshop and not in this list, its gate entry was not done. '
        +'<b>Do the gate entry yourself now</b> and inform your WM — the missed entry is recorded against the guard.'
        +'<br><button class="btn ghost sm" style="margin-top:6px" onclick="openModule(\'gate\')">Do the missing Gate Entry</button>';
      return;
    }
    if(hint) hint.textContent='Compulsory. No manual estimates. '+entries.length+' vehicle'+(entries.length===1?'':'s')+' pending.';
    sel.innerHTML='<option value="">— Select vehicle from Gate Entry —</option>'+entries.map((g,i)=>{
      const t=g.token?g.token+' · ':'';
      const d=new Date(g.time);
      const today=new Date();
      let day='';
      if(!isNaN(d.getTime()) && d.toDateString()!==today.toDateString()){
        day=' · '+d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}); // older day — say so
      }
      return `<option value="${i}">${t}${g.reg} · ${g.name||'Unknown'} (${g.model})${day}</option>`;
    }).join('');
  });
}
document.getElementById('es-gate-pick').addEventListener('click', function(){
  if(this.options.length<=1 || (this.options[0] && this.options[0].textContent.indexOf('retry')>-1)) esLoadGateEntries();
});
/* SINGLE gate-pick handler (Ravi 15-Jul). Root cause of "nothing seen after selecting
   vehicle" + "Xtreme showing Splendor labour": a later FIFO-warning listener used
   stopImmediatePropagation and its own PARTIAL fill — form reveal, photos, service
   type, per-model labour reload and model-confirm never ran. Now BOTH listeners call
   this one function. */
function esOnGatePick(g){
  if(!g) return;
  // Clean first, then fill (Ravi 15-Jul): nothing from the previous vehicle should
  // stay behind — km, date of sale, photos, and added items all belong to ONE row.
  const newId=g.entryId||g.id||('TOKEN:'+(g.token||''));
  const switching = ES.gateId && ES.gateId!==newId;
  const kmEl=document.getElementById('es-km'); if(kmEl) kmEl.value='';
  const dosEl0=document.getElementById('es-dos'); if(dosEl0) dosEl0.value='';
  const phBox=document.getElementById('es-gate-photos'); if(phBox){ phBox.innerHTML=''; phBox.style.display='none'; }
  if(switching){
    // Different vehicle chosen mid-way: old parts/labour must not carry over.
    // Clear item state directly (not via esNewEstimate — that reloads the list
    // and would wipe this very selection).
    ES_ADDLAB=[]; ES_ADDPART=[]; ES_DEMANDED=[]; ES_PRICE_OVERRIDES={}; ES_LINE_DISCOUNTS={}; ES_REMOVED=new Set(); ES_UNDO_STACK=[];
    if(typeof esRenderUndoBtn==='function') esRenderUndoBtn();
    esDrawChips(); esDrawDemChips(); ES.current=null; esLockForm(false);
    ['es-disc','es-disc-lab','es-disc-parts','es-add-pname','es-add-pamt'].forEach(i=>{const el=document.getElementById(i); if(el) el.value='';});
    const exch=document.getElementById('es-express'); if(exch) exch.checked=false;
    document.getElementById('es-out').innerHTML='<div class="empty"><div class="cond">No estimate yet</div><p style="margin-top:8px">Enter the vehicle details and press <b>Generate estimate</b>.</p></div>';
    document.getElementById('es-msg').textContent='';
  }
  document.getElementById('es-name').value=g.name||'';
  document.getElementById('es-mob').value=g.mob||'';
  document.getElementById('es-reg').value=(typeof raviNormalizeReg==='function'?raviNormalizeReg(g.reg||''):(g.reg||''));
  ES.gateId=g.entryId||g.id||''; ES.token=g.token||''; ES.location=g.location||'';
  if(!ES.gateId && ES.token) ES.gateId='TOKEN:'+ES.token; // never stay locked because backend omitted entryId
  esApplyPickLock();
  // Service type is left OPEN for the SA to choose (Ravi 20-Jul): the gate purpose no
  // longer preselects it. The SA physically sees the vehicle and decides the service type.
  try{
    heroCustLookup(g.reg,function(res){   /* phone first, server fallback (Ravi 26-Jul-2026) */
      const v=(res&&res.found&&res.vehicle)||null; if(!v) return;
      const pd=v['Purchase Date']||v['Date of Sale']||v['Sale Date']||'';
      const dosEl=document.getElementById('es-dos');
      if(pd && dosEl && !dosEl.value.trim()){
        const d=new Date(pd);
        dosEl.value=isNaN(d.getTime())?String(pd):(('0'+d.getDate()).slice(-2)+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+d.getFullYear());
        esUpdateLive();
      }
    });
  }catch(e){}
  const msel=document.getElementById('es-model');
  let matched=false;
  for(const opt of msel.options){ if(opt.value.toUpperCase()===String(g.model||'').toUpperCase()){ msel.value=opt.value; matched=true; break; } }
  // CRITICAL: fire the change event — the per-model labour list reloads on it.
  // Setting .value silently left the PREVIOUS model's labour on screen.
  if(matched) msel.dispatchEvent(new Event('change'));
  esRenderGatePhotos(g);
  ES_MODEL_CTX={reg:(g.reg||'').toUpperCase().replace(/[^A-Z0-9]/g,''), gateModel:g.model||''};
  esMaybeAskModel(g);
  esUpdateLive();
}
document.getElementById('es-gate-pick').addEventListener('change', function(){
  const i=this.value;
  if(i===''){
    // Nothing selected → everything returns to the first screen (Ravi 15-Jul):
    // fields, photos, items all cleared, picker list refreshed, form hidden.
    if(typeof esNewEstimate==='function') esNewEstimate(); else { ES.gateId=''; esApplyPickLock(); }
    return;
  }
  esOnGatePick(ES_GATE_ENTRIES[+i]);
});
/* Compulsory gate pick (Ravi 15-Jul): toggle the CSS lock that hides the whole
   estimate form until a Gate Entry vehicle is selected. */
function esApplyPickLock(){
  const fv=document.getElementById('es-form-view'); if(!fv) return;
  fv.classList.toggle('es-nopick', !(ES&&ES.gateId));
}
esApplyPickLock(); // form starts locked — picker only, until a gate vehicle is chosen
/* ===== SA MODEL CONFIRMATION (Ravi 09-Jul) — Stage 2, overrides the guard ============
   The SA sees the vehicle physically + its service history, so their model call beats the
   guard's. We prompt on gate-pick (and the SA can re-open it any time from the model flag).
   The confirmed model is taught to the backend at SA authority — a later guard guess can't
   undo it; only the DMS bill can. */
let ES_MODEL_CTX={reg:'',gateModel:''};
function esModelOptionsHtml(preselect){
  const sel=document.getElementById('es-model');
  let html='<option value="">— Select model —</option>';
  if(sel){ for(const o of sel.options){ if(!o.value) continue;
    const s=(preselect && heroOilKey(o.value)===heroOilKey(preselect))?' selected':'';
    html+=`<option value="${o.value.replace(/"/g,'&quot;')}"${s}>${o.value.replace(/</g,'&lt;')}</option>`; } }
  return html;
}
function esResolveModel(model){
  if(!model||model==='Unknown') return '';
  const sel=document.getElementById('es-model'); if(!sel) return '';
  const want=heroOilKey(model);
  for(const o of sel.options){ if(o.value && heroOilKey(o.value)===want) return o.value; }
  for(const o of sel.options){ const k=heroOilKey(o.value); if(k&&(k.indexOf(want)===0||want.indexOf(k)===0)) return o.value; }
  return '';
}
function esMaybeAskModel(g){
  const reg=(g&&g.reg||'').toUpperCase().replace(/[^A-Z0-9]/g,''); if(!reg) return;
  // Preselect whatever the gate recorded (already set in es-model by the picker)
  const gateModel=g.model||document.getElementById('es-model').value||'';
  esOpenModelModal(reg, gateModel);
}
function esOpenModelModal(reg, presel){
  const modal=document.getElementById('es-model-modal'); if(!modal) return;
  const resolved=esResolveModel(presel)||presel;
  document.getElementById('es-model-modal-reg').value=reg||'';
  document.getElementById('es-model-modal-select').innerHTML=esModelOptionsHtml(resolved);
  document.getElementById('es-model-modal-sub').innerHTML= presel
    ? `Gate recorded <b>${(resolved||presel).replace(/</g,'&lt;')}</b>. Confirm it's correct, or fix it — you're looking at the vehicle.`
    : `Select the correct model for this vehicle.`;
  modal.style.display='flex';
}
function esCloseModelModal(){ const m=document.getElementById('es-model-modal'); if(m) m.style.display='none'; }
function esModelConfirm(){
  const chosen=document.getElementById('es-model-modal-select').value;
  if(!chosen){ document.getElementById('es-model-modal-hint').textContent='Please pick a model first.'; return; }
  document.getElementById('es-model').value=chosen;
  document.getElementById('es-model').dispatchEvent(new Event('change'));
  const reg=document.getElementById('es-model-modal-reg').value;
  // Teach at SA authority
  try{ jpost({type:'learn_vehicle', reg:(reg||'').toUpperCase().replace(/[^A-Z0-9]/g,''), model:chosen, stage:'SA', by:(USER&&USER.personName)||''}); }catch(e){}
  esCloseModelModal();
  // Show a small confirmation flag under the model field, with re-open option
  const flag=document.getElementById('es-model-flag');
  if(flag){ flag.style.display='block'; flag.style.color='#059669';
    const wasChanged=ES_MODEL_CTX.gateModel && heroOilKey(ES_MODEL_CTX.gateModel)!==heroOilKey(chosen);
    flag.innerHTML='✅ Model confirmed'+(wasChanged?' (corrected from gate entry)':'')+' · <a href="#" onclick="esOpenModelModal(document.getElementById(\'es-model-modal-reg\').value||\'\',document.getElementById(\'es-model\').value);return false" style="font-weight:700">change</a>'; }
  esResetRemoved(); esUpdateLive();
}
/* Gate photos visible to SA during estimate prep (Ravi 09-Jul) — front/back/right/left/
   odometer/dicky captured at the gate, so the SA quotes against the actual vehicle
   condition and can verify the odometer reading without walking to the vehicle. */
function esRenderGatePhotos(g){
  const box=document.getElementById('es-gate-photos'); if(!box) return;
  const ph=(g&&g.photos)||{};
  const order=[['front','Front'],['back','Back'],['dicky','Dicky']];
  const pics=order.filter(([k])=>ph[k]&&String(ph[k]).indexOf('http')===0);
  box.style.display='block';
  if(!pics.length){
    // Diagnostic (Ravi 14-Jul): never hide silently — tell the SA (and us) WHY.
    // If this line shows, the deployed backend isn't sending photo URLs in the
    // pending list → the pending .gs update fixes it, not the frontend.
    box.innerHTML='<div style="font-size:11px;color:var(--steel);margin:8px 0 4px">📷 Gate photos: none received from server for this vehicle'+(g&&g.photo?'':' (backend update pending)')+'</div>';
    return;
  }
  box.innerHTML=`<div style="font-size:11px;font-weight:800;color:var(--steel);margin:8px 0 4px">📷 GATE PHOTOS — vehicle as received${g.aiPlate?(' · plate read: '+g.aiPlate):''} <span style="font-weight:400">· tap any photo to zoom</span></div>
    <div class="hero-photostrip">${pics.map(([k,l])=>
      `<div onclick="heroPhotoView('${String(ph[k]).replace(/'/g,'')}','${l} — as received at gate')" style="flex:0 0 auto;text-align:center;cursor:pointer">
        <img src="${huDrivePhotoSrc?huDrivePhotoSrc(ph[k]):ph[k]}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="width:150px;height:112px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">
        <div style="display:none;width:150px;height:112px;align-items:center;justify-content:center;border:1px dashed var(--line);border-radius:10px;font-size:11px;color:var(--steel)">📷 tap to view</div>
        <div style="font-size:10px;color:var(--steel);margin-top:2px">${l}</div></div>`).join('')}</div>`;
}
