/* ============================================================
   00-boot.js
   PWA registration + compulsory update flow

   Part of the Sehgal Hero App. Loaded IN ORDER by index.html; all files
   share one global scope exactly as the single file did. Order matters —
   08-late.js overrides functions defined earlier, so it loads last.
   Split 26-Jul-2026: a straight cut at the existing <script> boundaries.
   No code was rewritten. Verified byte-for-byte against the original.
   ============================================================ */

/* ===== PWA STEP A — SERVICE WORKER REGISTRATION (Claude, 16-Jul-2026) =========
   Pairs with sw.js. Upload BOTH files to GitHub together, every deploy, and the
   build string below must match the HERO_BUILD line in sw.js.
   Does nothing at all unless the page is served over https, so opening the file
   from Downloads / content:// / file:// behaves exactly as it does today.       */
window.HERO_BUILD = 'set44-2026.07.26-s26';
window.HERO_FRONTEND_PATCH = 'S02-ESTIMATE-UI-POLISH-2026.07.20';
(function () {
  if (!('serviceWorker' in navigator)) return;
  var ok = (location.protocol === 'https:') || location.hostname === 'localhost';
  if (!ok) return;

  /* ═══ COMPULSORY UPDATE (Ravi 26-Jul-2026) ══════════════════════════════════
     Ravi: "The user doesn't even know he has to press update. Make it compulsory
     so the app doesn't run without update, and the restart should be visible."
     He is right. A dismissible bar at the bottom of the screen is an invitation,
     and on a workshop floor nobody accepts an invitation. Half the phones stayed
     on old code, which is why fixes kept "not working".
     How it behaves now:
       - The moment a newer build is detected, a FULL SCREEN blocking cover appears.
         There is no Later, no close, no way past it. The app underneath cannot be
         used until the update finishes.
       - It starts by itself. Nobody has to find or press anything.
       - The restart is visible and announced, then the app comes back and confirms
         which build it landed on in green.
     Safety built in:
       - Anything sitting in the offline queue is flushed first, so a gate entry
         made without signal is not lost by the reload.
       - If the service worker refuses to hand over (this genuinely happens on some
         Android browsers), after 8 seconds a Restart Now button appears, and it
         clears the app's stored copy before reloading so the phone is forced to
         fetch fresh files instead of serving the same old ones back.
       - A reload counter stops it looping forever if the server is still serving the
         old file. After two tries it stops and says so plainly instead of spinning. */

  var reloading = false;
  var HERO_UPD_CSS =
      '@keyframes heroUpdSlide{0%{left:-45%}100%{left:100%}}'
    + '@keyframes heroUpdFade{from{opacity:0}to{opacity:1}}'
    + '#hero-updcover{position:fixed;inset:0;z-index:2147483647;background:#0b1120;'
    + 'display:flex;align-items:center;justify-content:center;padding:24px;'
    + 'font-family:Inter,system-ui,sans-serif;animation:heroUpdFade .18s ease-out}'
    + '#hero-updcard{width:100%;max-width:380px;text-align:center;color:#fff}'
    + '#hero-updcard h2{margin:0 0 8px;font-size:19px;font-weight:800;letter-spacing:.2px}'
    + '#hero-updcard p{margin:0;font-size:13px;line-height:1.5;color:#93a3b8}'
    + '#hero-updtrack{position:relative;height:5px;border-radius:99px;background:#1e293b;'
    + 'overflow:hidden;margin:22px 0 14px}'
    + '#hero-updtrack i{position:absolute;top:0;height:5px;width:45%;border-radius:99px;'
    + 'background:linear-gradient(90deg,#2563eb,#60a5fa);animation:heroUpdSlide 1.05s linear infinite}'
    + '#hero-updbtn{margin-top:20px;background:#c0392b;border:0;color:#fff;border-radius:10px;'
    + 'font:700 14px Inter,sans-serif;padding:12px 22px;width:100%;cursor:pointer}'
    + '#hero-updstep{margin-top:14px;font-size:12px;color:#64748b;letter-spacing:.3px}';

  function heroInjectCss() {
    if (document.getElementById('hero-upd-css')) return;
    var s = document.createElement('style');
    s.id = 'hero-upd-css'; s.textContent = HERO_UPD_CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* Green confirmation shown once, after the app comes back up. */
  function heroShowUpdatedToast() {
    var from;
    try { from = localStorage.getItem('hero_updating_from'); } catch (e) { return; }
    if (!from) return;
    try { localStorage.removeItem('hero_updating_from'); localStorage.removeItem('hero_upd_tries'); } catch (e) {}
    if (from === window.HERO_BUILD) return;
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:#14532d;'
      + 'color:#fff;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;'
      + 'gap:10px;font:600 13px Inter,sans-serif;box-shadow:0 -2px 12px rgba(0,0,0,.35)';
    t.innerHTML = '<span>&#10003; App updated &middot; now on ' + (window.HERO_BUILD || '') + '</span>'
      + '<button style="background:none;border:0;color:#bbf7d0;font:700 13px Inter,sans-serif;padding:8px 10px">OK</button>';
    t.querySelector('button').onclick = function () { t.remove(); };
    (document.body || document.documentElement).appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 7000);
  }

  /* Wipe this app's stored copy so the next load is forced to come from the server.
     Note: sw.js matches its cache with ignoreSearch, so adding ?v=123 to the URL
     does NOT bypass it. Clearing the shell cache is the only thing that actually works. */
  function heroHardReload() {
    if (reloading) return; reloading = true;
    var done = function () { location.reload(); };
    if (!window.caches || !caches.keys) return done();
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return (k.indexOf('hero-shell-') === 0) ? caches.delete(k) : null;
        }));
      })
      .then(done, done);
  }

  function heroCover() {
    var c = document.getElementById('hero-updcover');
    if (c) return c;
    heroInjectCss();
    c = document.createElement('div');
    c.id = 'hero-updcover';
    c.innerHTML =
        '<div id="hero-updcard">'
      + '<h2 id="hero-updtitle">Updating Sehgal Hero App</h2>'
      + '<p id="hero-updmsg">A newer version is required. This takes a few seconds.<br>Please do not close the app.</p>'
      + '<div id="hero-updtrack"><i></i></div>'
      + '<div id="hero-updstep">Applying update&hellip;</div>'
      + '</div>';
    (document.body || document.documentElement).appendChild(c);
    // Block scrolling and any stray interaction underneath.
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
    return c;
  }
  function heroStep(txt) {
    var e = document.getElementById('hero-updstep'); if (e) e.textContent = txt;
  }
  function heroOfferRestart(msg) {
    var card = document.getElementById('hero-updcard'); if (!card) return;
    if (document.getElementById('hero-updbtn')) return;
    var m = document.getElementById('hero-updmsg'); if (m) m.innerHTML = msg;
    var b = document.createElement('button');
    b.id = 'hero-updbtn'; b.textContent = 'Restart now';
    b.onclick = function () { b.disabled = true; b.textContent = 'Restarting…'; heroHardReload(); };
    card.appendChild(b);
  }

  /* The one entry point. Blocking, self-starting, cannot be dismissed. */
  var forcing = false;
  function heroForceUpdate(reg) {
    if (forcing) return; forcing = true;
    heroCover();

    // Count attempts so a server still serving the old file cannot loop us forever.
    var tries = 0;
    try { tries = parseInt(localStorage.getItem('hero_upd_tries') || '0', 10) || 0; } catch (e) {}
    if (tries >= 2) {
      heroStep('');
      heroOfferRestart('The update could not finish automatically.<br>Check your internet connection, then restart.');
      return;
    }
    try {
      localStorage.setItem('hero_upd_tries', String(tries + 1));
      localStorage.setItem('hero_updating_from', window.HERO_BUILD || '');
    } catch (e) {}

    // Send anything queued offline BEFORE reloading, so no gate entry is lost.
    var proceed = function () {
      heroStep('Applying update…');
      if (reg && reg.waiting) { reg.waiting.postMessage('HERO_SKIP_WAITING'); }
      else if (reg && reg.update) { try { reg.update(); } catch (e) {} setTimeout(function () {
        if (reg.waiting) reg.waiting.postMessage('HERO_SKIP_WAITING');
      }, 1200); }
      // Worker did not hand over — give the user a visible way out.
      setTimeout(function () {
        if (!reloading) { heroStep(''); heroOfferRestart('Almost done. Tap below to finish the update.'); }
      }, 8000);
      // Last resort, so a phone is never stuck on this screen.
      setTimeout(function () { if (!reloading) heroHardReload(); }, 20000);
    };
    if (typeof window.flushQueue === 'function') {
      heroStep('Saving your pending work…');
      try { Promise.resolve(window.flushQueue()).then(proceed, proceed); } catch (e) { proceed(); }
    } else { proceed(); }
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading) return; reloading = true;
    heroStep('Restarting…');
    setTimeout(function () { location.reload(); }, 350); // let the word "Restarting" be seen
  });

  window.addEventListener('load', function () {
    heroShowUpdatedToast();
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      // A build was downloaded in an earlier session and is sitting ready — apply now.
      if (reg.waiting && navigator.serviceWorker.controller) heroForceUpdate(reg);

      // A build finished downloading while the app is open — apply now, blocking.
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) heroForceUpdate(reg);
        });
      });

      window.heroCheckForUpdate = function () { try { reg.update(); } catch (e) {} };
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) window.heroCheckForUpdate();
      });
      window.heroCheckForUpdate();

      /* Belt and braces: ask the worker that is actually controlling this page which
         build IT is. If the page and the worker are on different builds, this tab is
         running mixed code — force the update even if 'updatefound' never fired.
         This is the case that used to leave a phone quietly stuck on old code. */
      try {
        if (navigator.serviceWorker.controller) {
          var ch = function (ev) {
            var b = ev && ev.data && ev.data.heroBuild;
            if (b && window.HERO_BUILD && b !== window.HERO_BUILD) heroForceUpdate(reg);
          };
          navigator.serviceWorker.addEventListener('message', ch);
          navigator.serviceWorker.controller.postMessage('HERO_BUILD?');
        }
      } catch (e) {}
    }).catch(function (e) { console.warn('SW register failed', e); });
  });
})();
