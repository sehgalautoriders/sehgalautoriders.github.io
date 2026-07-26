/* ============================================================
   02-core.js
   Shared core: network, cache, auth, offline queue, helpers

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

const SHEET_URL = "https://script.google.com/macros/s/AKfycbyqpp3MpPyshEtIrBuu5vpHe-PGtFc2JI_GwKqGvqJh7-IXL5k16kZPVl7qGCHpRK6n/exec";
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const num=n=>Math.round(n).toLocaleString('en-IN');
const val=id=>document.getElementById(id).value.trim();

/* ---------- JSONP / fetch helpers (shared by all modules) ---------- */
/* Cache slow-changing lookups (master tables, app config) in localStorage so the
   app boots fast even after the tab is closed and reopened — same idea as AppSheet's
   server caching. Live/time-sensitive data ('today','report_today','estimates_today')
   is never cached. Refresh Master Data button in Master view busts the cache manually. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // C2a (17-Jul): 12 hours, was 30 min — masters now live on the phone
const CACHEABLE_ACTIONS = ['master_list','master_table','app_config','labour_for_model'];
/* CACHE NAMESPACE (Ravi 15-Jul): the rvp9192-era app and the sehgal app, opened in
   the same browser, were SHARING cache keys — summaries bled across accounts even
   after clearing data on one. Every cached item is now keyed by a hash of the
   backend deployment URL, so two backends can never read each other's cache. */
const BACKEND_NS=(function(){ let h=0; const s=String(typeof SHEET_URL!=='undefined'?SHEET_URL:''); for(let i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h).toString(36); })();
function cacheKey(action, params){ return 'sehgal_cache:'+BACKEND_NS+':'+action+':'+JSON.stringify(params); }
/* ═══ C2a — PHONE DATABASE (Claude, 17-Jul-2026) ══════════════════════════════
   MEASURED root cause: localStorage allows ~5 MB total, but one master alone is
   bigger — master_table JSON sizes from the live V3 book:
       MD_PriceMaster_Labour  8.8 MB   MD_Parts_v3      4.6 MB
       MD_CustomerMaster      4.7 MB   MD_ModelPart     2.7 MB
   So setCache for the big masters silently FAILED every time (the try/catch ate
   the quota error) and the estimate screen re-downloaded 8.8 MB again and again.
   Fix: all cached data now lives in IndexedDB (the phone's real database, no
   practical size limit for us), fronted by an in-memory Map so every existing
   getCache/getLastGood caller stays synchronous and untouched. On boot the Map
   preloads from IndexedDB; old localStorage entries are migrated once. */
const HKV = new Map();
let __hkvReady = false;
const __hkvDbP = (function(){
  if(typeof indexedDB==='undefined') return Promise.resolve(null);
  return new Promise(function(res){
    try{
      const r = indexedDB.open('hero-cache-'+BACKEND_NS, 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ res(null); };
    }catch(e){ res(null); }
  });
})();
const __hkvPreload = __hkvDbP.then(function(db){
  if(!db) return;
  return new Promise(function(res){
    try{
      const req = db.transaction('kv').objectStore('kv').openCursor();
      req.onsuccess = function(e){
        const c = e.target.result;
        if(c){ HKV.set(String(c.key), c.value); c.continue(); } else res();
      };
      req.onerror = function(){ res(); };
    }catch(e){ res(); }
  });
}).then(function(){
  // one-time migration of the old localStorage cache so nothing re-downloads
  try{
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && (k.indexOf('sehgal_cache:')===0 || k.indexOf('sehgal_lastgood:')===0) && !HKV.has(k)){
        try{ const v=JSON.parse(localStorage.getItem(k)); HKV.set(k,v); hkvPut(k,v); }catch(e){}
      }
    }
  }catch(e){}
  __hkvReady = true;
});
function hkvPut(k,v){ __hkvDbP.then(function(db){ if(!db) return; try{ db.transaction('kv','readwrite').objectStore('kv').put(v,k); }catch(e){} }); }
function hkvDel(k){ __hkvDbP.then(function(db){ if(!db) return; try{ db.transaction('kv','readwrite').objectStore('kv').delete(k); }catch(e){} }); }
function getCache(action, params){
  if(CACHEABLE_ACTIONS.indexOf(action)===-1) return null;
  const obj = HKV.get(cacheKey(action,params));
  if(!obj) return null;
  /* STEP 1 (19-Jul): masters no longer expire on their own. They live on the phone
     until a manual full-refresh (↻ Refresh in Tables, or Sync Now in the top bar),
     or until any master edit made through the app clears the cache. This is the
     AppSheet behaviour: keep the phone copy, do not re-download for nothing.
     (The old 12-hour CACHE_TTL_MS check was removed here. Automatic change-checking
     comes in step 3.) */
  return obj.v;
}
function setCache(action, params, value){
  if(CACHEABLE_ACTIONS.indexOf(action)===-1) return;
  const k = cacheKey(action,params);
  const obj = {t:Date.now(), v:value};
  HKV.set(k,obj); hkvPut(k,obj);
}

/* ═══ MASTER CHANGE DETECTION — the missing "step 3" (Ravi 26-Jul-2026) ═══════
   Where we were: masters already live in IndexedDB and already survive a close, and
   they deliberately never expire. That is fast, but it left one real hole — if you
   uploaded a new parts master or edited a price in the sheet, every phone kept the
   OLD copy until somebody happened to press Sync Now. Fast, but capable of being
   quietly wrong, which is worse.

   What this adds: one very small call on open — master_stamps — which returns the
   master workbook's last-modified time. A few dozen bytes.
     - Unchanged since last time (the normal day)  -> nothing is downloaded at all.
     - Changed                                     -> the phone copies are dropped and
                                                       re-pulled once, in the background.

   This is delta sync, but keyed on a stamp WE control rather than AppSheet guessing
   from timestamp columns. That guessing is exactly why you turned AppSheet's delta
   sync off, and this version does not share that flaw.

   It degrades safely. If the backend has not been redeployed with getMasterStamps
   yet, the call simply fails, nothing is cleared, and the app behaves exactly as it
   does today. Nothing breaks while you deploy. */
const HERO_STAMP_KEY='hero_master_stamp';
let HERO_STAMP_CHECKED=false;
function heroCheckMasterStamps(force){
  if(HERO_STAMP_CHECKED && !force) return;
  HERO_STAMP_CHECKED=true;
  // jgetRaw, never jget — this check must never be served from the very cache it polices.
  try{
    jgetRaw('master_stamps', {}, function(res){
      if(!res || res.ok===false || !res.master) return;   // backend not deployed yet — leave everything alone
      let prev=null;
      try{ prev=localStorage.getItem(HERO_STAMP_KEY); }catch(e){}
      const now=String(res.master);
      if(prev && prev===now) return;                       // nothing changed — no downloads at all
      try{ localStorage.setItem(HERO_STAMP_KEY, now); }catch(e){}
      if(!prev) return;                                    // first run: just record it, do not throw away a good cache
      // The master book genuinely changed since this phone last looked.
      try{ clearMasterCache(); }catch(e){}
      try{ prefetchMasterData(); }catch(e){}                // quietly re-pull in the background
      if(typeof heroLibToast==='function'){ heroLibToast('Master data updated'); setTimeout(function(){ if(typeof heroLibToastHide==='function') heroLibToastHide(); },2200); }
    }, 8000);
  }catch(e){}
}


/* ═══ CUSTOMER MASTER ON THE PHONE (Ravi 26-Jul-2026) ═════════════════════════
   The problem, measured on the real sheet: MD_CustomerMaster has 51,610 rows.
   Every reg lookup went to Apps Script, and 51% of those rows carry no
   registration number at all — they are vehicles sold but not yet registered,
   identified only by VIN. The old server index skipped every one of them while
   building, so half the customer base was not slow to find, it was unfindable.

   What this does: the whole customer master is held on the phone in IndexedDB,
   with indexes on registration, VIN and mobile. A lookup is a single indexed
   read — it jumps straight to the record. It does not care whether the customer
   sits at row 3 or row 51,000, and it works with no signal at all.

   On Ravi's "give each cell the same unique id" idea: the goal was right, the
   shape would have hurt. One record per cell turns 51,610 customers into about
   413,000 fragments, each repeating the id and the column name — eight reads and
   a reassembly for every lookup, and far more storage. IndexedDB already keeps
   whole records with separate indexes beside them, which is the same instant
   lookup with one record per customer.

   Cost: about 10 MB, downloaded ONCE in blocks with a visible progress bar, then
   never again until the customer sheet actually changes (customer_stamp decides).
   That stamp is deliberately separate from the general master stamp, so editing
   some unrelated master does not throw away a 10 MB download.

   Degrades safely: if the backend has not been redeployed with Hotfix_Customers,
   the sync stays off and lookups fall through to the server exactly as today. */
const CUST_DB='hero_cust_v1', CUST_STORE='cust';
const CUST_STAMP_KEY='hero_cust_stamp', CUST_COUNT_KEY='hero_cust_count';
let __custDbP=null;

function custNormReg(s){ return String(s==null?'':s).toUpperCase().replace(/[^A-Z0-9]/g,''); }
function custNormMob(s){ let d=String(s==null?'':s).replace(/\D/g,''); if(d.length>10) d=d.slice(-10); return d.length===10?d:''; }

function custDb(){
  if(__custDbP) return __custDbP;
  __custDbP=new Promise(function(res){
    try{
      const rq=indexedDB.open(CUST_DB,1);
      rq.onupgradeneeded=function(e){
        const db=e.target.result;
        if(!db.objectStoreNames.contains(CUST_STORE)){
          const st=db.createObjectStore(CUST_STORE,{keyPath:'id',autoIncrement:true});
          // These three indexes are the whole point — each turns a 51,610-row
          // scan into one direct hit.
          st.createIndex('reg','reg',{unique:false});
          st.createIndex('vin','vin',{unique:false});
          st.createIndex('vt','vt',{unique:false});   // VIN last 6, what the counter reads off the frame
          st.createIndex('mob','mob',{unique:false});
        }
      };
      rq.onsuccess=function(){ res(rq.result); };
      rq.onerror=function(){ res(null); };
    }catch(e){ res(null); }
  });
  return __custDbP;
}

/* One indexed read per attempt, in the order a service advisor actually tries. */
function heroCustFind(query, cb){
  const q=String(query||'').trim();
  if(!q){ cb(null); return; }
  const rk=custNormReg(q), mk=custNormMob(q);
  custDb().then(function(db){
    if(!db){ cb(null); return; }
    let tx;
    try{ tx=db.transaction(CUST_STORE,'readonly'); }catch(e){ cb(null); return; }
    const st=tx.objectStore(CUST_STORE);
    const tries=[];
    if(rk) tries.push(['reg',rk,'reg'], ['vin',rk,'vin']);
    if(mk) tries.push(['mob',mk,'mobile']);
    if(rk.length>=6) tries.push(['vt',rk.slice(-6),'vin-last6']);
    let i=0;
    (function next(){
      if(i>=tries.length){ cb(null); return; }
      const t=tries[i++];
      let r;
      try{ r=st.index(t[0]).get(t[1]); }catch(e){ next(); return; }
      r.onsuccess=function(){
        const v=r.result;
        if(v){ cb({found:true, how:t[2], fuzzy:t[2].indexOf('last6')>-1, vehicle:{
          reg:v.reg||'', vin:v.vin||'', model:v.mdl||'', name:v.nm||'',
          mob:v.mob||'', alt:v.alt||'', location:v.loc||''}}); }
        else next();
      };
      r.onerror=function(){ next(); };
    })();
  });
}

/* Local first, server second. Never leaves the user with nothing. */
function heroCustLookup(query, cb){
  heroCustFind(query, function(local){
    if(local && local.found){ local.source='phone'; cb(local); return; }
    jgetRaw('customer_find', {q:String(query||'')}, function(res){
      if(res && res.ok && res.found){ res.source='server'; cb(res); }
      else cb({found:false, source: (res&&res.ok)?'server':'offline'});
    }, 12000);
  });
}

function custWriteBatch(db, rows){
  return new Promise(function(res){
    let tx;
    try{ tx=db.transaction(CUST_STORE,'readwrite'); }catch(e){ res(false); return; }
    const st=tx.objectStore(CUST_STORE);
    rows.forEach(function(r){
      const reg=custNormReg(r.r), vin=custNormReg(r.v);
      try{ st.put({ reg:reg, vin:vin, vt:vin?vin.slice(-6):'',
        mob:custNormMob(r.p), alt:custNormMob(r.a),
        mdl:r.m||'', nm:r.n||'', loc:r.l||'' }); }catch(e){}
    });
    tx.oncomplete=function(){ res(true); };
    tx.onerror=function(){ res(false); };
    tx.onabort=function(){ res(false); };
  });
}
function custClear(db){
  return new Promise(function(res){
    try{ const tx=db.transaction(CUST_STORE,'readwrite');
      tx.objectStore(CUST_STORE).clear();
      tx.oncomplete=function(){ res(true); }; tx.onerror=function(){ res(false); };
    }catch(e){ res(false); }
  });
}

let CUST_SYNCING=false;
/* Downloads the customer master in blocks. Runs once; after that the stamp says
   "unchanged" and nothing is fetched. Shows progress because 10 MB is not
   instant and a silent 40-second wait is how apps get called broken. */
function heroCustSync(force, onDone){
  if(CUST_SYNCING) return;
  jgetRaw('customer_stamp', {}, function(st){
    if(!st || st.ok===false || !st.stamp){ if(onDone) onDone(false,'backend not deployed'); return; }
    let prev=null, prevN=0;
    try{ prev=localStorage.getItem(CUST_STAMP_KEY); prevN=parseInt(localStorage.getItem(CUST_COUNT_KEY)||'0',10)||0; }catch(e){}
    if(!force && prev===st.stamp && prevN>0){ if(onDone) onDone(true,'already current'); return; }

    CUST_SYNCING=true;
    const total=Number(st.count||0), chunk=Number(st.chunk||5000);
    let got=0;
    const bar=custProgressBar(total);
    custDb().then(function(db){
      if(!db){ CUST_SYNCING=false; bar.done('Could not open phone storage'); if(onDone) onDone(false); return; }
      custClear(db).then(function(){
        (function pull(offset){
          jgetRaw('customer_chunk', {offset:offset, limit:chunk}, function(res){
            if(!res || res.ok===false || !res.rows){
              CUST_SYNCING=false; bar.done('Stopped — check connection'); if(onDone) onDone(false); return;
            }
            custWriteBatch(db, res.rows).then(function(){
              got+=res.rows.length;
              bar.set(got);
              if(res.done || !res.rows.length){
                try{ localStorage.setItem(CUST_STAMP_KEY, st.stamp); localStorage.setItem(CUST_COUNT_KEY, String(got)); }catch(e){}
                CUST_SYNCING=false;
                bar.done(got.toLocaleString('en-IN')+' customers now on this phone');
                if(onDone) onDone(true);
              } else pull(offset+res.rows.length);
            });
          }, 30000);
        })(0);
      });
    });
  }, 10000);
}

function custProgressBar(total){
  let el=document.getElementById('hero-custbar');
  if(!el){
    el=document.createElement('div'); el.id='hero-custbar';
    el.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99997;background:#0f172a;color:#fff;'
      +'padding:10px 14px;font:600 12px Inter,sans-serif;box-shadow:0 -2px 12px rgba(0,0,0,.35)';
    el.innerHTML='<div id="hero-custtxt">Preparing customer list…</div>'
      +'<div style="height:4px;background:#1e293b;border-radius:99px;margin-top:7px;overflow:hidden">'
      +'<div id="hero-custfill" style="height:4px;width:0%;background:linear-gradient(90deg,#2563eb,#60a5fa);transition:width .25s"></div></div>';
    document.body.appendChild(el);
  }
  const txt=document.getElementById('hero-custtxt'), fill=document.getElementById('hero-custfill');
  return {
    set:function(n){
      const pct=total?Math.min(100,Math.round(n*100/total)):0;
      if(fill) fill.style.width=pct+'%';
      if(txt) txt.textContent='Saving customers to this phone — '+n.toLocaleString('en-IN')+' of '+total.toLocaleString('en-IN')+' ('+pct+'%)';
    },
    done:function(msg){
      if(fill) fill.style.width='100%';
      if(txt) txt.textContent=msg;
      setTimeout(function(){ if(el&&el.parentNode) el.parentNode.removeChild(el); }, 3500);
    }
  };
}

/* Offer the one-time download rather than just taking 10 MB of somebody's data
   plan without asking. (Ravi 26-Jul-2026) Shown once per phone to the people who
   actually look customers up — guard, SA, WM. Answer is remembered either way.
   "Not now" is honest: search still works, it just goes to the server each time. */
function heroCustOffer(){
  try{
    if(!USER) return;
    if(localStorage.getItem(CUST_STAMP_KEY)) { heroCustSync(false); return; } // already have it: quiet stamp check only
    if(localStorage.getItem('hero_cust_declined')==='1') return;
    const needs = (typeof isGuardUser==='function'&&isGuardUser())
               || (typeof isSAUser==='function'&&isSAUser())
               || (typeof isTopMgmtUser==='function'&&isTopMgmtUser());
    if(!needs) return;
    if(document.getElementById('hero-custoffer')) return;
    const b=document.createElement('div');
    b.id='hero-custoffer';
    b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99996;background:#0f172a;color:#fff;'
      +'padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;'
      +'font:600 12px Inter,sans-serif;box-shadow:0 -2px 12px rgba(0,0,0,.35)';
    b.innerHTML='<span style="line-height:1.45">Keep the customer list on this phone?<br>'
      +'<span style="color:#94a3b8;font-weight:500">Instant search by number, chassis or mobile — even with no signal. About 10 MB, one time.</span></span>'
      +'<span style="white-space:nowrap"><button id="hero-custno" style="background:none;border:0;color:#94a3b8;font:600 12px Inter,sans-serif;padding:8px 10px">Not now</button>'
      +'<button id="hero-custyes" style="background:#2563eb;border:0;color:#fff;border-radius:8px;font:700 12px Inter,sans-serif;padding:9px 16px">Download</button></span>';
    document.body.appendChild(b);
    document.getElementById('hero-custno').onclick=function(){
      try{ localStorage.setItem('hero_cust_declined','1'); }catch(e){}
      b.remove();
    };
    document.getElementById('hero-custyes').onclick=function(){ b.remove(); heroCustSync(true); };
  }catch(e){}
}

window.heroCustSync=heroCustSync;
window.heroCustOffer=heroCustOffer;
window.heroCustLookup=heroCustLookup;
window.heroCustFind=heroCustFind;

function clearMasterCache(){
  const dead=[];
  HKV.forEach(function(v,k){ if(k.indexOf('sehgal_cache:')===0) dead.push(k); });
  dead.forEach(function(k){ HKV.delete(k); hkvDel(k); });
  try{ const keys=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf('sehgal_cache:')===0) keys.push(k); } keys.forEach(k=>localStorage.removeItem(k)); }catch(e){}
  // Force the Gate and Estimate screens to reload fresh next time they open (Ravi 20-Jul).
  window.ES_BOOTED=false; window.GE_BOOTED=false;
}

function checkBackendVersion(){
  const el=document.getElementById('ver-badge');
  el.textContent='Checking…';
  jget('version', {}, function(res){
    if(!res||res.ok===false){
      el.textContent='Backend: unreachable — '+((res&&(res.detail||res.error))||'no reply');
      el.style.color='var(--signal-d)';
      el.title=(res&&(res.detail||res.error))||'no reply';
      return;
    }
    el.textContent='Backend '+(res.version||'?')+' · Server today: '+(res.todayKey||'?')+' · '+(res.tz||'?');
    el.style.color = res.version==='v12.5-2026.07.17' ? 'var(--ok)' : 'var(--signal-d)';
    if(res.version!=='v12.5-2026.07.17') alert('⚠ Your deployed Apps Script backend is OUTDATED.\n\nThe latest version (Billing Comparison engine + Gate Out + estimates_all) is NOT live yet.\n\nGo to Apps Script → Deploy → Manage Deployments → Edit → New Version → Deploy, using the latest Heroappentry.gs file.\n\nServer reports: '+(res.version||'no version field — very old backend')+'\nServer date: '+res.todayKey);
  });
}
/* Global progress bar — gives constant visual feedback during any network call instead
   of a silent hang (fixes "click... wait... feels broken" complaint). Tracks concurrent
   in-flight requests so it only hides once everything settles. */
let GP_INFLIGHT=0;
function gpStart(){
  GP_INFLIGHT++;
  /* RED LINE REMOVED (20-Jul, Ravi): the top progress bar jumped to 70% and sat there
     ("always half full") whenever any background call was in flight, so the app always
     looked like it was loading. The in-flight counter stays (harmless), but the bar is
     never shown. */
}
function gpEnd(){
  GP_INFLIGHT=Math.max(0,GP_INFLIGHT-1);
}
function gpStart_OLD_unused(){
  GP_INFLIGHT++;
  const bar=document.getElementById('global-progress'); if(!bar) return;
  bar.style.display='block';
  bar.style.width='0%';
  requestAnimationFrame(()=>{ bar.style.width='70%'; });
}
function gpEnd_OLD_unused(){
  GP_INFLIGHT=Math.max(0,GP_INFLIGHT-1);
  const bar=document.getElementById('global-progress'); if(!bar) return;
  if(GP_INFLIGHT>0) return; // other calls still running — keep it visible
  bar.style.width='100%';
  setTimeout(()=>{ if(GP_INFLIGHT===0){ bar.style.display='none'; bar.style.width='0%'; } }, 250);
}
/* ===== MOBILE "network" FIX (14-Jul-2026) — fetch fallback for every JSONP read =====
   Symptom it fixes: the app works on a PC but every read dies with the bare word
   "network" on a phone. Cause: reads were delivered by ONE mechanism only — injecting a
   cross-origin <script> tag pointing at the Apps Script /exec URL. Some mobile browsers
   refuse that script (the /exec -> googleusercontent.com redirect, MIME sniffing, or an
   aggressive cache layer), fire script.onerror, and the app had no second route — it just
   reported 'network' and stopped.
   Fix: Apps Script serves /exec with Access-Control-Allow-Origin: * on GET, so a plain
   fetch() of the SAME url (minus the &callback= param, so the backend returns raw JSON via
   its existing jsonp() branch) works cross-origin from any browser. If the script tag
   fails OR times out, we now silently retry the identical call over fetch() before giving
   up — and if that fails too, we report the REAL error text instead of "network".
   Purely additive: jget/jgetRaw keep the same names, signatures and callback contract, so
   every existing caller in the app is untouched. */
function jUrl_(action, params, cbName){
  let url = SHEET_URL + (SHEET_URL.indexOf('?')>-1?'&':'?') + 'action=' + action;
  if(cbName) url += '&callback=' + cbName;
  for(const k in params){ url += '&' + k + '=' + encodeURIComponent(params[k]); }
  return url;
}
function jFetchFallback_(action, params, done, why){
  let killed = false;
  const hard = setTimeout(function(){ killed = true; done({ok:false, error:'network', detail:(why||'')+' | fetch timed out'}); }, 20000);
  fetch(jUrl_(action, params, null), {method:'GET', mode:'cors', credentials:'omit', cache:'no-store'})
    .then(function(r){ return r.text(); })
    .then(function(t){
      if(killed) return;
      clearTimeout(hard);
      var j = null;
      try{ j = JSON.parse(t); }
      catch(e){
        var m = String(t).match(/^[^(]*\((.*)\)\s*;?\s*$/); // tolerate a callback wrapper if one sneaks in
        if(m){ try{ j = JSON.parse(m[1]); }catch(e2){} }
      }
      if(j) done(j);
      else done({ok:false, error:'network', detail:(why||'')+' | server replied non-JSON: '+String(t).slice(0,140)});
    })
    .catch(function(err){
      if(killed) return;
      clearTimeout(hard);
      done({ok:false, error:'network', detail:(why||'')+' | fetch: '+String((err && err.message) || err)});
    });
}
function jget(action, params, cb){
  /* SPEED (20-Jul): for master tables only, wait for the phone database to finish
     loading into memory BEFORE deciding phone-copy-vs-server. This keeps the app itself
     instant (boot is never blocked) while still serving masters from the phone instead
     of re-downloading them. Live data (today / estimates / holdup) is not a cacheable
     action, so it is never delayed here — it always goes straight to the server. */
  if(CACHEABLE_ACTIONS.indexOf(action)!==-1 && typeof __hkvReady!=='undefined' && !__hkvReady
     && typeof __hkvPreload!=='undefined' && __hkvPreload && __hkvPreload.then){
    __hkvPreload.then(function(){ jget(action, params, cb); });
    return;
  }
  const cached = getCache(action, params);
  if(cached){ cb(cached); return; }
  gpStart();
  const cbName = 'hcb' + Date.now() + Math.floor(Math.random()*1000);
  let done = false;
  const finish = (res) => { if(done) return; done = true; clearTimeout(timer); delete window[cbName]; if(script.parentNode) script.parentNode.removeChild(script);
    if(res && res.ok!==false) setCache(action, params, res);
    gpEnd();
    cb(res); };
  window[cbName] = finish;
  let url = jUrl_(action, params, cbName);
  const script = document.createElement('script');
  script.src = url;
  script.onerror = () => { clearTimeout(timer); jFetchFallback_(action, params, finish, 'jsonp script blocked'); };
  const timer = setTimeout(() => { jFetchFallback_(action, params, finish, 'jsonp timeout 12s'); }, 12000);
  document.body.appendChild(script);
}
/* ================= OFFLINE WRITE QUEUE ================= */
/* AppSheet-style guarantee: a save made while offline (or during a flaky connection)
   is never lost. Every write (gate entry, estimate, holdup update, password change...)
   goes through jpost(). If the network call fails, it's queued in localStorage instead
   of silently dropped, and automatically retried: the moment the browser reports
   "online" again, every 20 seconds in the background while the app is open, and once
   right after login/app boot. The person sees exactly how many updates are still
   waiting via a small badge in the nav bar — nothing is invisible or lost. */
const OFFLINE_QUEUE_KEY='sehgal_offline_queue';
function getQueue(){ try{ return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||'[]'); }catch(e){ return []; } }
function setQueue(q){ try{ localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); }catch(e){} updateQueueBadge(); }
function queueWrite(body){ const q=getQueue(); q.push({id:'q'+Date.now()+Math.random().toString(36).slice(2), body, ts:Date.now()}); setQueue(q); }
function updateQueueBadge(){
  const n=getQueue().length;
  const el=document.getElementById('sync-badge');
  if(!el) return;
  if(n>0){ el.style.display='inline-flex'; el.textContent='⏳ '+n+' pending sync'; }
  else el.style.display='none';
}
let FLUSHING=false;
async function flushQueue(){
  if(FLUSHING || !navigator.onLine) return;
  let q=getQueue();
  if(!q.length) return;
  FLUSHING=true;
  const remaining=[];
  for(const item of q){
    try{
      await fetch(SHEET_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(item.body)});
    }catch(e){ remaining.push(item); }
  }
  setQueue(remaining);
  FLUSHING=false;
}
async function globalSyncNow(){
  const btn=event&&event.target;
  const orig=btn?btn.textContent:'';
  if(btn) btn.textContent='Syncing…';
  await flushQueue(); // send anything that was waiting offline, first
  clearMasterCache(); // forget cached master tables
  if(typeof jrClearFresh==='function') jrClearFresh();
  try{ HERO_STAMP_CHECKED=false; heroCheckMasterStamps(true); }catch(e){} // Sync Now must genuinely re-ask, not reuse the 4-second window
  prefetchMasterData(); // re-pull everything fresh in the background
  /* Sync Now must re-read the full holdup ROW SET, not only the status fields.
     (Ravi 26-Jul-2026) The old call only patched status/reason/ETA onto whatever
     rows this device already had, so pressing Sync Now on the uploader's machine
     never picked up rows from a later upload done elsewhere. Forced, so it
     ignores the 20-second freshness window — the user asked for it explicitly. */
  if(typeof huHydrateFromBackend==='function'){
    huHydrateFromBackend(function(n){
      const v=document.getElementById('view-holdup');
      if(n>0 && v && v.style.display!=='none' && typeof huRender==='function') huRender();
    }, true);
  }
  setTimeout(()=>{ if(btn) btn.textContent=orig||'↻ Sync Now'; renderHomeTiles(); loadHomeStats(); }, 1200);
}
window.addEventListener('online', flushQueue);
updateQueueBadge(); // reflect any queue left over from a previous offline session, immediately on load
setInterval(flushQueue, 20000); // background retry every 20s while the app is open

async function jpost(body){
  if(body && typeof body.type==='string' && body.type.indexOf('master_')===0) clearMasterCache();
  if(body && body.type==='set_app_config') clearMasterCache();
  if(!SHEET_URL) return;
  /* QUEUE FIRST, ALWAYS (Ravi 21-Jul). Writing to localStorage is synchronous and near-
     instant — this line runs and completes before any network call is even attempted, so
     the entry is durably on the phone the moment Save is pressed. Even if the app is
     refreshed or closed a millisecond later, nothing is lost: the queue already has it,
     and the existing background retry (flushQueue every 20s, plus the 'online' listener)
     delivers it the moment a connection exists. This also removes the old "wait for the
     network, then decide" delay — Save now confirms instantly, syncing happens quietly
     after. */
  const qid='q'+Date.now()+Math.random().toString(36).slice(2);
  const q=getQueue(); q.push({id:qid, body, ts:Date.now()}); setQueue(q);
  if(!navigator.onLine) return; // stays queued; background retry sends it once online
  try{
    await fetch(SHEET_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
    setQueue(getQueue().filter(x=>x.id!==qid)); // sent — remove only this item, not the whole queue
  }catch(e){
    // stays queued — background retry will pick it up, nothing lost
  }
}

/* ---------- Reliable read wrapper for heavy/live actions (today, report_today,
   estimates_today) ---------- */
/* These reads are NOT cached normally (CACHEABLE_ACTIONS excludes them, by design,
   since they're time-sensitive). But that means a single slow/failed Apps Script
   response shows the person nothing at all, even after tapping Refresh — which is
   exactly the "stuck / lost / 2-3 minutes" complaint. Fix: always remember the LAST
   successful response (no expiry) and show it immediately while a fresh one is
   fetched in the background; if the fresh fetch fails, retry automatically up to
   three times with a longer timeout before giving up — the person is never staring
   at a blank error screen if we have ANY recent data to show. */
const LASTGOOD_PREFIX='sehgal_lastgood:'+(typeof BACKEND_NS!=='undefined'?BACKEND_NS+':':'');
/* C2a: last-good snapshots also live in the phone database now (same Map + IndexedDB),
   so report_today / estimates_all stale-then-fresh survives phone restarts and has no
   size ceiling. Key format unchanged so old localStorage values migrate cleanly. */
function getLastGood(action, params){
  const v = HKV.get(LASTGOOD_PREFIX+action+':'+JSON.stringify(params));
  return v===undefined?null:v;
}
function setLastGood(action, params, value){
  const k = LASTGOOD_PREFIX+action+':'+JSON.stringify(params);
  HKV.set(k,value); hkvPut(k,value);
}
function jgetRaw(action, params, cb, timeoutMs){
  gpStart();
  const cbName = 'hcb' + Date.now() + Math.floor(Math.random()*1000);
  let done = false;
  const finish = (res) => { if(done) return; done = true; clearTimeout(timer); delete window[cbName]; if(script.parentNode) script.parentNode.removeChild(script); gpEnd(); cb(res); };
  window[cbName] = finish;
  let url = jUrl_(action, params, cbName);
  const script = document.createElement('script');
  script.src = url;
  script.onerror = () => { clearTimeout(timer); jFetchFallback_(action, params, finish, 'jsonp script blocked'); };
  const timer = setTimeout(() => { jFetchFallback_(action, params, finish, 'jsonp timeout'); }, timeoutMs||25000);
  document.body.appendChild(script);
}
/* ═══ SPEED 3+4 — SINGLE-FLIGHT / SHARED RESULT (Ravi 26-Jul-2026) ════════════
   MEASURED problem: opening Home fired report_today FOUR separate times —
   loadPriorityPanel, loadRecentActivity, loadHomeStats and loadSaDashboard each
   asked for it independently. Same heavy joined read, four round trips, four waits.
   Now: the first caller does the work, everyone else who asks in the same moment
   is attached to that same request, and for a few seconds afterwards the answer is
   handed back straight from memory. Callers did not change at all — the sharing
   happens inside here, so nothing else in the app had to be touched.
   IN_FLIGHT_MS is deliberately short. This is live data, not a cache; it only
   collapses the burst of calls that happen together on one screen open. */
const JR_FRESH_MS = 4000;
const JR_INFLIGHT = {}, JR_RECENT = {};
function jrKey(action, params){ return action+':'+JSON.stringify(params||{}); }
function jgetReliable(action, params, cb){
  const key = jrKey(action, params);

  // Answered a moment ago on this same screen — reuse it, no network at all.
  const recent = JR_RECENT[key];
  if(recent && (Date.now()-recent.at) < JR_FRESH_MS){ cb(recent.res, false); return; }

  // Someone else already asked and is still waiting — ride along with them.
  if(JR_INFLIGHT[key]){ JR_INFLIGHT[key].push(cb); return; }
  JR_INFLIGHT[key] = [cb];
  const fanout = (res, isStale) => {
    const list = JR_INFLIGHT[key] || [];
    if(!isStale){ JR_INFLIGHT[key] = null; JR_RECENT[key] = {at:Date.now(), res:res}; }
    list.forEach(function(f){ try{ f(res, isStale); }catch(e){} });
  };

  const stale = getLastGood(action, params);
  if(stale) fanout(stale, true); // show instantly, mark as "stale" (2nd arg)
  let attempt=0;
  const tryFetch=()=>{
    attempt++;
    jgetRaw(action, params, function(res){
      if(res && res.ok!==false){
        setLastGood(action, params, res);
        fanout(res, false);
      } else if(attempt<3){
        setTimeout(tryFetch, 1500*attempt); // brief backoff, then retry
      } else if(!stale){
        fanout(res, false); // genuinely failed and we have nothing to fall back on
      } else {
        JR_INFLIGHT[key] = null; // failed, but stale data is already on screen — leave it
      }
    }, 25000); // generous timeout for these heavier joined reads
  };
  tryFetch();
}
/* Sync Now must ignore the freshness window and genuinely re-ask. */
function jrClearFresh(){ for(const k in JR_RECENT) delete JR_RECENT[k]; }

/* ---------- Online status (shared) ---------- */
let ONLINE = navigator.onLine;
function setNet(on){
  ONLINE = on;
  document.getElementById('netbadge').className = 'net ' + (on?'on':'off');
  document.getElementById('nettxt').textContent = on?'Online':'Offline';
  const geOff=document.getElementById('ge-offlineban'); if(geOff) geOff.style.display = on?'none':'block';
  const esOff=document.getElementById('es-offlineban'); if(esOff) esOff.style.display = on?'none':'block';
  const geBtn=document.getElementById('ge-savebtn'); if(geBtn) geBtn.disabled = !on;
  const esBtn=document.getElementById('es-genbtn'); if(esBtn){ const esLocked = (typeof ES!=='undefined' && ES.locked); if(!esLocked) esBtn.disabled = !on; }
}
window.addEventListener('online',()=>setNet(true));
window.addEventListener('offline',()=>setNet(false));
setNet(navigator.onLine);
async function pingCheck(){
  if(!navigator.onLine){ setNet(false); return; }
  try{ await fetch('https://www.gstatic.com/generate_204',{mode:'no-cors',cache:'no-store'}); setNet(true); }
  catch(e){ setNet(navigator.onLine); }
}
pingCheck(); setInterval(pingCheck,15000);

/* ================= AUTH ================= */
let USER = null;
const SESSION_MAX_DAYS=30;
function loadUser(){
  try{
    // STAY LOGGED IN (Ravi 15-Jul): the old tab-close auto-logout frustrated guards
    // and SAs — one accidental swipe-out meant logging in again. Sessions now
    // persist on the device for 30 days; Logout button still works instantly.
    const raw = localStorage.getItem('sehgalhero_user'); if(raw) USER = JSON.parse(raw);
    const ts = Number(localStorage.getItem('sehgalhero_user_ts')||0);
    if(USER && ts && (Date.now()-ts) > SESSION_MAX_DAYS*86400000){ USER=null; localStorage.removeItem('sehgalhero_user'); }
  }catch(e){}
}
function saveUser(u){ USER = u; try{ localStorage.setItem('sehgalhero_user', JSON.stringify(u)); localStorage.setItem('sehgalhero_user_ts', String(Date.now())); }catch(e){} }
/* Cross-account safety (Ravi 20-Jul): the last-good snapshots (report_today, estimates,
   home summary) are user-visible and role-specific. They must NOT survive a logout, or a
   CEO summary flashes briefly under the next Guard login on the same phone. Shared master
   tables are NOT user-specific, so those are left in place (no needless 8 MB re-download). */
function clearVolatileUserCache(){
  try{
    const dead=[];
    HKV.forEach(function(v,k){ if(k.indexOf('sehgal_lastgood:')===0) dead.push(k); });
    dead.forEach(function(k){ HKV.delete(k); if(typeof hkvDel==='function') hkvDel(k); });
  }catch(e){}
  try{
    const rm=[];
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf('sehgal_lastgood:')===0) rm.push(k); }
    rm.forEach(function(k){ localStorage.removeItem(k); });
  }catch(e){}
}
function logout(){ USER = null; try{ localStorage.removeItem('sehgalhero_user'); localStorage.removeItem('sehgalhero_user_ts'); }catch(e){} clearVolatileUserCache(); showView('login'); }

function fpOpen(){
  document.getElementById('fp-modal').style.display='block';
  document.getElementById('fp-step1').style.display='block';
  document.getElementById('fp-step2').style.display='none';
  document.getElementById('fp-emp').value=val('li-emp')||'';
  document.getElementById('fp-msg').textContent='';
}
function fpClose(){ document.getElementById('fp-modal').style.display='none'; }
function fpSendOtp(){
  const emp=val('fp-emp'), msg=document.getElementById('fp-msg');
  if(!emp){ msg.style.color='var(--signal-d)'; msg.textContent='Enter your Employee No.'; return; }
  msg.style.color='var(--steel)'; msg.textContent='Sending OTP…';
  jget('send_otp', {emp}, function(res){
    if(!res||res.ok===false){ msg.style.color='var(--signal-d)'; msg.textContent=(res&&res.error)||'Could not send OTP.'; return; }
    document.getElementById('fp-step1').style.display='none';
    document.getElementById('fp-step2').style.display='block';
    document.getElementById('fp-emailmsg').textContent='OTP sent to '+(res.maskedEmail||'your registered email')+'. It expires in 10 minutes.';
    msg.textContent='';
  });
}
function fpResetPassword(){
  const emp=val('fp-emp'), otp=val('fp-otp'), newp=val('fp-new'), conf=val('fp-conf'), msg=document.getElementById('fp-msg');
  if(!otp||!newp||!conf){ msg.style.color='var(--signal-d)'; msg.textContent='All fields required.'; return; }
  if(newp!==conf){ msg.style.color='var(--signal-d)'; msg.textContent='Passwords do not match.'; return; }
  if(newp.length<4){ msg.style.color='var(--signal-d)'; msg.textContent='Password must be at least 4 characters.'; return; }
  msg.style.color='var(--steel)'; msg.textContent='Resetting…';
  jget('reset_password_otp', {emp,otp,newPass:newp}, function(res){
    if(!res||res.ok===false){ msg.style.color='var(--signal-d)'; msg.textContent=(res&&res.error)||'Could not reset password.'; return; }
    msg.style.color='var(--ok)'; msg.textContent='Password reset! You can now log in.';
    setTimeout(fpClose,1800);
  });
}
const MODULE_ALIASES={
  'GATEENTRY':'GateEntry','GATE ENTRY':'GateEntry','GATE':'GateEntry',
  'ESTIMATE':'Estimate','SERVICEESTIMATE':'Estimate','SERVICE ESTIMATE':'Estimate','ESTIMATEPREPARATION':'Estimate','ESTIMATE PREPARATION':'Estimate',
  'CONTROLROOM':'ControlRoom','CONTROL ROOM':'ControlRoom','CONTROL':'ControlRoom',
  'HOLDUPMONITOR':'HoldupMonitor','HOLDUP MONITOR':'HoldupMonitor','HOLDUP':'HoldupMonitor',
  'MASTERDATA':'MasterData','MASTER DATA':'MasterData','MASTER':'MasterData',
  'BILLINGCOMPARISON':'BillingComparison','BILLING COMPARISON':'BillingComparison','BILLING':'BillingComparison',
  'PENDINGREPORTS':'PendingReports','PENDING REPORTS':'PendingReports','REPORTS':'PendingReports',
  'PARTSDESK':'PartsDesk','PARTS DESK':'PartsDesk','PARTS':'PartsDesk',
  'CRM':'CRM','CUSTOMERACTIONS':'CRM','CUSTOMER ACTIONS':'CRM',
  'FINANCE':'Finance','ALL':'ALL'
};
function canonicalModule(m){
  const raw=String(m||'').trim(); if(!raw) return '';
  const key=raw.toUpperCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim();
  const tight=key.replace(/\s+/g,'');
  return MODULE_ALIASES[key]||MODULE_ALIASES[tight]||raw;
}
function isPartsPerson(){
  const t=((USER&&USER.designation)||'')+' '+((USER&&USER.level)||'')+' '+((USER&&USER.personName)||'');
  const txt=String(t).toUpperCase();
  const mods=((USER&&USER.modules)||[]).map(canonicalModule);
  // IMPORTANT: do not use hasModule('PartsDesk') here.
  // hasModule() returns true for ALL-module users, so CEO/Admin logins were wrongly
  // treated as Parts Person and Holdup was filtered down to only parts rows.
  const seniorLogin = isAdmin() || mods.includes('ALL') || /\b(CEO|GM|WM|ADMIN|SUPERADMIN|WORKSHOP MANAGER|GENERAL MANAGER)\b/.test(txt);
  const explicitPartsModule = mods.includes('PartsDesk'); // exact module only, no ALL expansion
  const explicitPartsText = /\bPARTS?\b|\bSPARE\b/.test(txt);
  return !seniorLogin && (explicitPartsModule || explicitPartsText);
}
function canUseModule(m){ return isAdmin() || hasModule(m); }
/* dead canEditHoldup() removed 22-Jul-2026 (s15a). Live version is the window.canEditHoldup override in a later patch block. */
function placeholderToast(name){ alert(name+' is a placeholder for the next version. Current live modules are Gate Entry, Estimate, Control Room, Holdup Monitor and Master Data.'); }

function doLogin(){
  const emp = val('li-emp'), pass = val('li-pass'), msg = document.getElementById('li-msg');
  msg.style.color='var(--steel)'; msg.textContent='Checking…';
  if(!emp || !pass){ msg.style.color='var(--signal-d)'; msg.textContent='Enter employee number and password.'; return; }
  jget('login', {emp, pass}, function(res){
    if(!res || res.ok===false){
      msg.style.color='var(--signal-d)';
      msg.textContent = (res && res.error==='timeout') ? 'Server is slow — check internet and try again.'
        : (res && res.error) ? res.error : 'Could not reach the server. Check your connection and try again.';
      return;
    }
    const u = res.user;
    const modulesRaw = String(u.modules || '').trim();
    const modules = modulesRaw.toUpperCase()==='ALL' ? ['ALL'] : modulesRaw.split(',').map(canonicalModule).filter(Boolean);
    saveUser({
      id: u.empno || '', empno: u.empno || emp,
      personName: u.name || '',
      ws: String(u.ws || 'ALL').trim().toUpperCase(),
      designation: u.designation || u.level || '',
      level: String(u.level || '').trim().toLowerCase(),
      modules: modules
    });
    msg.textContent='';
    goHome();
  });
}
function hasModule(name){
  if(!USER) return false;
  const target=canonicalModule(name);
  const mods=(USER.modules||[]).map(canonicalModule);
  if(mods.includes('ALL')) return true;
  return mods.includes(target);
}
function isAdmin(){ return USER && (USER.level==='superadmin' || USER.level==='admin'); }
function normWs(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function aliasWs(s){ const a={CHINCHWAND:'CHINCHWAD',MANJARI:'MANJRI'}; return a[s]||s; }
function allowedWsList(){
  if(!USER||!USER.ws) return [];
  if(USER.ws.trim().toUpperCase()==='ALL') return null; // null = no restriction
  return USER.ws.split(',').map(s=>aliasWs(normWs(s.trim()))).filter(Boolean);
}
function sameWsJs(a,b){ a=aliasWs(normWs(a)); b=aliasWs(normWs(b)); return a&&b&&a===b; }
function wsAllowed(ws){
  const list=allowedWsList();
  if(list===null) return true;
  return list.some(w=>sameWsJs(w,ws));
}

/* ================= NAVIGATION ================= */
function showView(name){
  ['login','home','gate','estimate','master','control','holdup','billing','gateout','partfinder'].forEach(v=>{
    const el = document.getElementById('view-'+v);
    if(el) el.style.display = (v===name) ? 'block' : 'none';
  });
  const whobox = document.getElementById('whobox');
  const pwdBtn = document.getElementById('topright-pwd-btn');
  if(name==='login'){ whobox.style.display='none'; if(pwdBtn) pwdBtn.style.display='none'; }
  else if(USER){
    whobox.style.display='flex';
    if(pwdBtn) pwdBtn.style.display='inline-block';
    document.getElementById('who-name').textContent = USER.personName || USER.empno;
    document.getElementById('who-role').textContent = USER.level || USER.designation || '';
    document.getElementById('who-ws').textContent = USER.ws;
  }
}
function goHome(){
  showView('home');
  renderHomeTiles();
  loadHomeStats();
  try{ heroCustOffer(); }catch(e){}
  scheduleMasterWarmup(); // ordered light warm-up; large labour/parts masters load only when needed
  // SA Dashboard — shown for users without Control Room access (typically Service Advisors)
  // so their daily work (estimates made, holdup vehicles assigned to them) is visible
  const saDash=document.getElementById('sa-dash');
  if(saDash){
    if(!isCtlUser() && hasModule('Estimate')){ saDash.style.display='block'; loadSaDashboard(); }
    else saDash.style.display='none';
  }
}
/* dead loadSaDashboard() removed 22-Jul-2026 (s15a). Live version is the window.loadSaDashboard override in a later patch block. */
/* Fires all slow-changing lookups in the background right after login so they're
   already in localStorage cache by the time the user opens a module — same idea as
   AppSheet's "sync on start". Errors are silently ignored; modules still fetch live
   on open if a prefetch failed, this is purely a speed optimization. */
let MASTER_WARMUP_TIMER=null;
function scheduleMasterWarmup(){
  if(MASTER_WARMUP_TIMER) clearTimeout(MASTER_WARMUP_TIMER);
  MASTER_WARMUP_TIMER=setTimeout(function(){ MASTER_WARMUP_TIMER=null; prefetchMasterData(); },1200);
}
function prefetchMasterData(){
  try{ loadAppSettings(); }catch(e){}
  /* ═══ SPEED 5 — ROLE-AWARE, PARALLEL WARM-UP (Ravi 26-Jul-2026) ══════════════
     Before: seven backend calls, fired one after another with a 120 ms gap between
     each, identical for every role. A security guard — who only ever fills a gate
     form — was downloading the estimate price master and the model-oil map on every
     single open, and waiting through all seven before anything felt ready.
     Now: each role pulls only what its own screens actually use, and they go out
     together instead of in a queue. The guard drops from 7 calls to 3.
     Nothing is removed from anyone who needs it — an SA/WM/GM/CEO still gets the
     full set; they just get it in parallel. */
  const needEstimate = (typeof hasModule==='function' && hasModule('Estimate'))
                     || (typeof isAdmin==='function' && isAdmin())
                     || (typeof isTopMgmtUser==='function' && isTopMgmtUser());
  const isGuard = (typeof isGuardUser==='function') && isGuardUser();

  const jobs=[
    ['master_list',{}],
    ['master_table',{name:'MODEL'}],
    ['master_table',{name:'Location'}],
    ['app_config',{app:'GateEntry'}]
  ];
  if(!isGuard){
    // Holdup / advisor names — needed by every non-guard screen that shows an SA.
    jobs.push(['master_table',{name:'SA_Master'}]);
    jobs.push(['master_table',{name:'HoldupReasons'}]);
  }
  if(needEstimate){
    jobs.push(['master_table',{name:'EstimatePrices'}]);
    jobs.push(['master_table',{name:'ModelOilMap'}]);
    jobs.push(['app_config',{app:'Estimate'}]);
  }
  try{ heroCheckMasterStamps(); }catch(e){}
  jobs.forEach(function(j){
    jget(j[0],j[1],function(res){
      try{
        if(j[0]==='master_table' && j[1].name==='EstimatePrices') heroApplyPriceMaster(res&&res.rows);
        if(j[0]==='master_table' && j[1].name==='ModelOilMap') heroApplyOilMap(res&&res.rows);
      }catch(e){}
    });
  });
}
function isCtlUser(){ return isAdmin() || hasModule('ControlRoom') || hasModule('HoldupMonitor'); }
/* dead renderHomeTiles() removed 22-Jul-2026 (s15a). Live version is the window.renderHomeTiles override in a later patch block. */
/* dead renderQuickActions() removed 22-Jul-2026 (s15a). Live version is the window.renderQuickActions override in a later patch block. */
function loadRecentActivity(){
  const box=document.getElementById('recent-list'); if(!box) return;
  jgetReliable('report_today', {}, function(res){
    if(!res||!res.ok){ heroSoftPlaceholder(box,'<div class="hint">No recent activity loaded yet.</div>'); return; }
    // Show the Estimate section only if this login can actually prepare estimates
    // (permission-based, not a designation-text guess — same fragility class as B1-2 fix).
    const canSeeEst=(typeof canUseModule==='function')&&(canUseModule('Estimate')||canUseModule('ControlRoom'));
    const gates=(res.gateEntries||[]).filter(g=>wsAllowed(g.location)).slice(-5).reverse().map(g=>({title:(g.reg||g.token||'Gate Entry')+' — '+(g.model||''),sub:'Gate entry by '+(g.guard||g.empname||'team')}));
    const est=canSeeEst?(res.estimates||[]).filter(e=>wsAllowed(e.ws)).slice(-5).reverse().map(e=>({title:(e.reg||'Estimate')+' — '+(e.model||''),sub:'Estimate prepared — '+inr(e.total||0)})):[];
    // Separated feed (Ravi 20-Jul): Gate Entry and Estimate shown as two distinct sections,
    // no longer mixed into one list.
    const rowHtml=(r,tag,cls)=>`<div class="ops-list-row"><div><div class="ops-list-title">${r.title}</div><div class="ops-list-sub">${r.sub}</div></div><span class="ops-pill ${cls}" style="font-size:10px">${tag}</span></div>`;
    const section=(label,rows,tag,cls)=>`<div style="font-size:11px;font-weight:800;color:var(--steel);text-transform:uppercase;letter-spacing:.4px;margin:8px 2px 4px">${label}</div>`+(rows.length?rows.map(r=>rowHtml(r,tag,cls)).join(''):'<div class="hint" style="margin:0 2px 8px">Nothing yet today.</div>');
    let html=section('Gate Entry', gates.slice(0,5), 'Gate', 'blue');
    if(canSeeEst) html+=section('Estimate', est.slice(0,4), 'Estimate', 'green');
    box.innerHTML=html;
  });
}
function loadHoldupSnapshot(){
  const totalEl=document.getElementById('snap-hu-total'), list=document.getElementById('snap-hu-list'); if(!totalEl||!list) return;
  let rows=[]; try{ rows=JSON.parse(localStorage.getItem(HU_STORE_KEY)||'[]'); }catch(e){ rows=[]; }
  /* Same row set as the Holdup screen. (Ravi 26-Jul-2026) Previously this panel
     rendered off whatever happened to be in this device's localStorage, so Home
     and the Holdup screen could show different totals on the same phone.
     Loop guard: remember the fetch stamp before asking. If the data was already
     fresh the stamp will not move and we do not re-render, so this cannot recurse. */
  const snapSeen=(typeof HU_LAST_FETCH==="number")?HU_LAST_FETCH:0;
  if(typeof huHydrateFromBackend==='function'){
    huHydrateFromBackend(function(n){ if(n>0 && HU_LAST_FETCH!==snapSeen) loadHoldupSnapshot(); });
  }
  rows=huActiveRows(rows);
  totalEl.textContent=rows.length;
  const buckets=[
    ['Warranty Approval', r=>String(r['Holdup Status']||'').toLowerCase().includes('warranty'),'red'],
    ['Parts Pending', r=>huIsPartStatus(String(r['Holdup Status']||'')+' '+String(r['Holdup Reason']||'')),'orange'],
    ['Not Allocated', r=>!String(r['Holdup Status']||'').trim()||String(r['Holdup Status']||'')==='Not Allocated','blue'],
    ['Approval Pending', r=>huIsApprovalStatus(String(r['Holdup Status']||'')),'green'],
    ['Others', r=>true,'gray']
  ];
  const used=new Set(); const out=[];
  buckets.forEach(([label,fn,cls])=>{ let c=0; rows.forEach((r,i)=>{ if(!used.has(i)&&fn(r)){ used.add(i); c++; } }); out.push({label,c,cls}); });
  // SA: whole-workshop number + his own number + his % contribution — summary only,
  // per the SA-login notes (not details of every vehicle in the workshop).
  let myLine='';
  if(typeof isSAUser==='function' && isSAUser() && typeof raviAssignedToMe==='function'){
    const mine=rows.filter(raviAssignedToMe).length;
    const pct=rows.length ? Math.round((mine/rows.length)*100) : 0;
    myLine=`<div class="ops-list-row" style="background:#f0fdfa;border-radius:8px;padding:6px 8px;margin-bottom:6px"><div class="ops-list-title">Whole WS: <b>${rows.length}</b> · My Holdup: <b>${mine}</b> (${pct}%)</div></div>`;
  }
  window.RAVI_HU_BUCKETS=buckets; window.RAVI_HU_ROWS=rows;
  list.innerHTML=myLine+out.map((x,bi)=>`<div class="ops-list-row" style="cursor:pointer" onclick="raviOpenHoldupBucket(${bi})"><div class="ops-list-title">${x.label}</div><span class="ops-pill ${x.cls}">${x.c}</span></div>`).join('');
}
window.raviOpenHoldupBucket=function(bi){
  const buckets=window.RAVI_HU_BUCKETS||[], rows=window.RAVI_HU_ROWS||[];
  const b=buckets[bi]; if(!b) return;
  const used=new Set(); let matched=[];
  buckets.forEach(([label,fn],idx)=>{ rows.forEach((r,i)=>{ if(!used.has(i)&&fn(r)){ used.add(i); if(idx===bi) matched.push(r); } }); });
  const modal=document.getElementById('ravi-kpi-modal'), body=document.getElementById('ravi-kpi-body'), title=document.getElementById('ravi-kpi-title');
  if(!modal||!body||!title) return;
  title.textContent=b[0]; modal.style.display='block';
  if(!matched.length){ body.innerHTML='<div class="hint">No vehicles in this bucket.</div>'; return; }
  body.innerHTML=matched.map((r,i)=>`<div class="ctlitem"><div><div class="big">${i+1}. ${raviEsc(r[HU_COLS.reg]||r['Reg No']||huGetVin(r)||'')} · ${raviEsc(r[HU_COLS.model]||r['Model']||'')}</div>
    <div class="small">${raviEsc(huNormalizeDrs(r['Holdup Status']||'')||'Not updated')} · ETA: ${raviEsc(r['Parts ETA']||'—')}</div></div>
    <div class="ravi-actions"><button onclick="raviCloseKpiModal();openModule('holdup')">Open</button></div></div>`).join('');
};

function loadPriorityPanel(){
  const box=document.getElementById('priority-list'); if(!box) return;
  jgetReliable('report_today', {}, function(res){
    if(!res||!res.ok) return;
    const pending=(res.pending||[]).filter(g=>wsAllowed(g.location)).length;
    const entries=(res.gateEntries||[]).filter(g=>wsAllowed(g.location)).length;
    const ests=(res.estimates||[]).filter(e=>wsAllowed(e.ws)).length;
    huComputeHomeCounts(function(c){
      const hu=c.hu, parts=c.parts;
      /* Every row is now tappable. (Ravi 26-Jul-2026) This whole panel showed five
         numbers and none of them opened anything — you could see a problem but not
         reach it. Two labels were also wrong and have been corrected:
           "Estimates pending for approval" counted gate-done-estimate-NOT-YET-MADE,
              which is a different thing entirely — now "Estimates not yet prepared".
           "Estimates to be delivered" counted every estimate made today — now
              "Estimates prepared today", which is what the number actually is. */
      const items=[
        {label:'Holdup cases pending update', sub:'Needs immediate attention', n:hu, cls:hu>0?'red':'green', go:"openModule('holdup')"},
        {label:'Estimates not yet prepared', sub:'Gate entry done, estimate pending', n:pending, cls:pending>0?'orange':'green', go:"openModule('control')"},
        {label:'Parts requests pending issue', sub:'Affecting workshop progress', n:parts, cls:parts>0?'blue':'green', go:"raviOpenHoldupBucket('parts')"},
        {label:'Vehicles in workshop', sub:'Gate entries today', n:entries, cls:'blue', go:"raviOpenGateHistory()"},
        {label:'Estimates prepared today', sub:'Saved today across the workshop', n:ests, cls:'green', go:"openModule('control')"}
      ];
      /* Build the rows once, then only rewrite the pill numbers. (Ravi 26-Jul-2026)
         This used to re-write the whole panel on every refresh, so the five rows
         blinked out and back. */
      const sig=items.map(p=>p.label).join('|');
      if(box.getAttribute('data-sig')!==sig){
        box.innerHTML=items.map(p=>`<div class="priority-item" data-p="${raviEsc(p.label)}" style="cursor:pointer" onclick="${p.go}" title="Tap to open"><div><div class="pi-label">${p.label}</div><div class="pi-sub">${p.sub}</div></div><div class="ops-pill ${p.cls}">${p.n}</div></div>`).join('');
        box.setAttribute('data-sig',sig);
      } else {
        items.forEach(p=>{
          const row=box.querySelector('.priority-item[data-p="'+String(p.label).replace(/"/g,'')+'"]');
          if(!row) return;
          const pill=row.querySelector('.ops-pill');
          if(pill){ if(pill.textContent!==String(p.n)) pill.textContent=p.n; pill.className='ops-pill '+p.cls; }
        });
      }
    });
  });
}

function openModule(id){
  // Report tiles open their window straight from home — no module screen behind them.
  if(id==='gatehistory'){ raviOpenGateHistory(); return; }
  if(id==='esthistory'){ esOpenMyEstHistory(); return; }
  const moduleMap={gate:'GateEntry',estimate:'Estimate',master:'MasterData',control:'ControlRoom',holdup:'HoldupMonitor'};
  // Policy (Ravi 15-Jul): estimates are gate-pick-only, so every SA must be able to
  // create the missing gate entry themselves — Gate Entry is always open to SAs.
  const saGateException=(id==='gate' && typeof isSAUser==='function' && isSAUser());
  if(moduleMap[id] && !canUseModule(moduleMap[id]) && !saGateException){ alert('This module is not assigned to your login. Ask admin to add '+moduleMap[id]+' in MD_Login → Modules.'); return; }
  if(id==='gate') geBoot();
  if(id==='estimate') esBoot();
  if(id==='master') mdBoot();
  if(id==='control') ctlBoot();
  if(id==='holdup') huBoot();
  if(id==='billing') blBoot();
  if(id==='partfinder') pfBoot();
  if(id==='gateout') goBoot();
  showView(id);
}
/* dead loadHomeStats() removed 22-Jul-2026 (s15a). Live version is the window.loadHomeStats override in a later patch block. */

