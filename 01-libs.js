/* ============================================================
   01-libs.js
   On-demand loader for the heavy export libraries

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ═══ SPEED 1 — HEAVY LIBRARIES ARE NO LONGER LOADED AT STARTUP ═══════════════
   (Ravi 26-Jul-2026)
   These four files — jsPDF, jsPDF-autotable, SheetJS and ExcelJS — total roughly
   2.2 MB. They used to sit as plain <script src> tags right here, which means the
   browser had to download and parse ALL of them before it would even paint the
   login screen. A security guard, who never exports anything in his life, was
   paying that 2.2 MB every single time he opened the app.
   Now: nothing is fetched at startup. They are pulled in the first time something
   actually needs them (Upload, Download, PDF), and pre-warmed quietly a few
   seconds after the app is idle so the first Export tap still feels instant.
   heroEnsureLibs(group, cb) is the single entry point — see the call sites in
   huDownload, huHandleFile, esBuildPDF, blHandleJcFile, blHandleBillFile,
   pfDownload, pfHandleStockFile and pfLiveFetch. */
(function(){
  var LIBS = {
    xlsx:   ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
    exceljs:['https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'],
    pdf:    ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
             'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js']
  };
  var loaded = {}, inflight = {};

  function one(url){
    if (loaded[url]) return Promise.resolve();
    if (inflight[url]) return inflight[url];
    inflight[url] = new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = url; s.async = false;
      s.onload = function(){ loaded[url] = true; res(); };
      s.onerror = function(){ inflight[url] = null; rej(new Error('Could not load '+url)); };
      document.head.appendChild(s);
    });
    return inflight[url];
  }

  /* group: 'xlsx' | 'exceljs' | 'pdf' | 'all'. cb runs once the group is ready.
     On failure cb(false) is called so the caller can show a real message instead
     of throwing "XLSX is not defined" at the user. */
  window.heroEnsureLibs = function(group, cb){
    var urls = group === 'all'
      ? LIBS.xlsx.concat(LIBS.exceljs, LIBS.pdf)
      : (LIBS[group] || []);
    var pending = urls.filter(function(u){ return !loaded[u]; });
    if (!pending.length) { if (cb) cb(true); return Promise.resolve(true); }
    // Only show the wait message if it is actually taking a moment.
    var slow = setTimeout(function(){
      if (typeof window.heroLibToast === 'function') window.heroLibToast('Preparing…');
    }, 400);
    var p = Promise.all(urls.map(one))
      .then(function(){ clearTimeout(slow); if (typeof window.heroLibToastHide==='function') window.heroLibToastHide(); if (cb) cb(true); return true; })
      .catch(function(e){ clearTimeout(slow); if (typeof window.heroLibToastHide==='function') window.heroLibToastHide();
        try{ alert('Could not load the file tools. Check your internet and try again.'); }catch(x){}
        if (cb) cb(false); return false; });
    return p;
  };

  /* Quiet pre-warm once the app has settled, so the first Export still feels instant.
     requestIdleCallback where available; a plain timer otherwise. */
  window.addEventListener('load', function(){
    var warm = function(){ window.heroEnsureLibs('all'); };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 6000 });
    else setTimeout(warm, 4000);
  });
})();
/* Small non-blocking "Preparing…" chip, used only if a library is genuinely slow. */
(function(){
  var el=null;
  window.heroLibToast=function(msg){
    if(!el){ el=document.createElement('div');
      el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:99998;'
        +'background:#1e293b;color:#fff;padding:9px 16px;border-radius:99px;'
        +'font:600 12px Inter,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)';
      document.body.appendChild(el); }
    el.textContent=msg||'Preparing…'; el.style.display='block';
  };
  window.heroLibToastHide=function(){ if(el) el.style.display='none'; };
})();
