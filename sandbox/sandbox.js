/* ===========================================================================
   Sehgal Hero — CEO SANDBOX layer. Loaded FIRST, and only, by /sandbox/index.html
   (built from the live index.html by sandbox/build.py — the app itself is the
   same byte-for-byte build the staff are running).

   Ravi 25-09-2026: "Make a sandbox of my login 275506. I can login as a guard, sa
   or anyone from any location. The simulation would involve exactly how the actual
   person is receiving the app. In my sandbox even if I do a gate entry or an
   estimate only I will see that and not else. But I can see everybody's estimates
   done. A omnipotent layer in the app."

   What this file does, before any app code runs:
     1. Storage — the sandbox keeps its own copy of everything the app stores on the
        phone (localStorage / sessionStorage / IndexedDB / caches get an "sbx:"
        prefix), so it never touches the real app's login or data on the same phone.
     2. Sign-in — the CEO signs in once (real password). After that the app's own
        login screen accepts ANY login code (GUARD1, SA.5004, WM.CHINCHWAD …) with
        any password, and the app becomes that person.
     3. Server — every app function goes through hero_sbx_call (migration 0094):
        answered as that person, over the CEO's sandbox rows, never saved for
        anyone else. Gate / estimate saves go to hero-sandbox. WhatsApp codes are
        never sent (code 123456). Direct table writes are dropped.
     4. Where / what — a top strip sets the place (Chinchwad, outside, location off,
        real GPS — Chakan has no pin yet) and the device (this phone, Android, iPhone,
        Windows PC).
   =========================================================================== */
(function () {
  'use strict';
  var SB = 'https://tiwfuwfzjxcsbrifcdpu.supabase.co';
  var ANON = 'sb_publishable_slimmjt0POF4fhAnTAfLyQ_P1jYG9Xh';
  var NS = 'sbx:';
  var CODE = '123456';
  window.HERO_SANDBOX = true;

  /* ------------------------------------------------------------ 1. storage */
  var SP = Storage.prototype;
  var rawGet = SP.getItem, rawSet = SP.setItem, rawRem = SP.removeItem, rawKey = SP.key;
  var rawLen = Object.getOwnPropertyDescriptor(SP, 'length').get;
  function nsKeys(st) {
    var out = [], n = rawLen.call(st);
    for (var i = 0; i < n; i++) { var k = rawKey.call(st, i); if (k && k.indexOf(NS) === 0) out.push(k.slice(NS.length)); }
    return out;
  }
  SP.getItem = function (k) { return rawGet.call(this, NS + k); };
  SP.setItem = function (k, v) { return rawSet.call(this, NS + k, v); };
  SP.removeItem = function (k) { return rawRem.call(this, NS + k); };
  SP.key = function (i) { var a = nsKeys(this); return i < a.length ? a[i] : null; };
  SP.clear = function () { var self = this; nsKeys(this).forEach(function (k) { rawRem.call(self, NS + k); }); };
  Object.defineProperty(SP, 'length', { configurable: true, get: function () { return nsKeys(this).length; } });
  /* the sandbox's own settings live outside the app's namespace */
  function own(k, v) {
    if (arguments.length === 1) { try { return JSON.parse(rawGet.call(localStorage, 'sbx.' + k) || 'null'); } catch (e) { return null; } }
    if (v == null) rawRem.call(localStorage, 'sbx.' + k); else rawSet.call(localStorage, 'sbx.' + k, JSON.stringify(v));
  }

  try {
    var IDB = window.indexedDB;
    if (IDB) {
      var oOpen = IDB.open.bind(IDB), oDel = IDB.deleteDatabase.bind(IDB), oDbs = IDB.databases && IDB.databases.bind(IDB);
      IDB.open = function (n, v) { return v === undefined ? oOpen(NS + n) : oOpen(NS + n, v); };
      IDB.deleteDatabase = function (n) { return oDel(NS + n); };
      if (oDbs) IDB.databases = function () {
        return oDbs().then(function (a) {
          return a.filter(function (d) { return d.name && d.name.indexOf(NS) === 0; })
                  .map(function (d) { return { name: d.name.slice(NS.length), version: d.version }; });
        });
      };
    }
  } catch (e) {}
  try {
    var C = window.caches;
    if (C) {
      var cOpen = C.open.bind(C), cDel = C.delete.bind(C), cHas = C.has.bind(C), cKeys = C.keys.bind(C);
      C.open = function (n) { return cOpen(NS + n); };
      C.delete = function (n) { return cDel(NS + n); };
      C.has = function (n) { return cHas(NS + n); };
      C.keys = function () {
        return cKeys().then(function (a) {
          return a.filter(function (k) { return k.indexOf(NS) === 0; }).map(function (k) { return k.slice(NS.length); });
        });
      };
    }
  } catch (e) {}

  /* ----------------------------------------------------- 4a. device (early) */
  var UA = {
    android: 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/151.0.0.0 Mobile/15E148 Safari/604.1',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  };
  var DEVICE = own('device') || 'real';
  if (UA[DEVICE]) {
    try { Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function () { return UA[DEVICE]; } }); } catch (e) {}
  }

  /* ------------------------------------------------------- 2. owner session */
  var rawFetch = window.fetch.bind(window);
  function jres(obj, status) {
    return new Response(obj === undefined ? '' : JSON.stringify(obj),
      { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }
  function owner() { return own('owner'); }
  var refreshing = null;
  function ownerRefresh() {
    if (refreshing) return refreshing;
    var o = owner();
    if (!o || !o.rt) return Promise.reject(new Error('sandbox-signed-out'));
    refreshing = rawFetch(SB + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: o.rt })
    }).then(function (r) {
      return r.json().then(function (s) {
        if (!r.ok || !s.access_token) { own('owner', null); throw new Error('sandbox-signed-out'); }
        keepOwner(s); return s;
      });
    }).finally(function () { refreshing = null; });
    return refreshing;
  }
  function keepOwner(s) {
    var o = owner() || {};
    o.at = s.access_token; o.rt = s.refresh_token;
    o.exp = Date.now() + ((s.expires_in || 3600) - 60) * 1000;
    if (s.user && s.user.id && !o.uid) o.uid = s.user.id;
    own('owner', o);
  }
  function ownerToken() {
    var o = owner();
    if (o && o.at && Date.now() < o.exp) return Promise.resolve(o.at);
    return ownerRefresh().then(function (s) { return s.access_token; });
  }
  function acting() { return own('acting'); }
  var PEOPLE = null;
  function people(force) {
    if (PEOPLE && !force) return Promise.resolve(PEOPLE);
    return ownerToken().then(function (t) {
      return rawFetch(SB + '/rest/v1/rpc/hero_sbx_people', {
        method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}'
      });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.message) || 'Sandbox is only for the CEO login.');
      PEOPLE = j.people || []; return PEOPLE;
    });
  }
  /* the session the app gets: the CEO's tokens, wearing the chosen person's id */
  /* Ravi 25-09-2026: staff log in with their plain employee number (5004, 1001, 275506),
     never the SA.5004-style code - the list, the strip and the login all use the number. */
  function asPerson(s, p) {
    var out = JSON.parse(JSON.stringify(s));
    out.user = Object.assign({}, out.user || {}, { id: p.id, email: p.email || '' });
    return out;
  }

  /* --------------------------------------------------------- 3. the router */
  var UPLOADED = {};
  function hdrs(h) {
    var o = {};
    if (!h) return o;
    if (typeof h.forEach === 'function' && !(h instanceof Array)) { h.forEach(function (v, k) { o[k] = v; }); return o; }
    for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) o[k] = h[k];
    return o;
  }
  function body(init) {
    try { return init && init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch (e) { return {}; }
  }
  function withOwner(url, init, extra) {
    return ownerToken().then(function (t) {
      var h = Object.assign(hdrs(init.headers), { apikey: ANON, Authorization: 'Bearer ' + t }, extra || {});
      return rawFetch(url, Object.assign({}, init, { headers: h }));
    });
  }
  function note(kind, what) { try { console.info('[SANDBOX] ' + kind + ': ' + what); } catch (e) {} }

  function route(url, init) {
    var path = url.slice(SB.length), q = path.indexOf('?'), base = q >= 0 ? path.slice(0, q) : path;
    var method = String(init.method || 'GET').toUpperCase();

    /* ---- sign-in */
    if (base === '/auth/v1/token') {
      var grant = /grant_type=([a-z_]+)/.exec(path); grant = grant && grant[1];
      if (grant === 'password') {
        var email = String(body(init).email || '').toLowerCase();
        return people().then(function (list) {
          var p = list.filter(function (x) { return String(x.email || '').toLowerCase() === email; })[0];
          if (!p) return jres({ error: 'invalid_grant', error_description: 'Sandbox: no such login' }, 400);
          own('acting', { id: p.id, code: p.empno || p.code, name: p.name, role: p.role, ws: p.ws });
          return ownerRefresh().then(function (s) { paintStrip(); return jres(asPerson(s, p)); });
        }).catch(function (e) { return jres({ error: 'invalid_grant', error_description: String(e.message || e) }, 400); });
      }
      if (grant === 'refresh_token') {
        return ownerRefresh().then(function (s) {
          var a = acting(); return jres(a ? asPerson(s, { id: a.id, email: s.user && s.user.email }) : s);
        }).catch(function () { return jres({ error: 'invalid_grant' }, 400); });
      }
    }
    if (base === '/auth/v1/logout') return Promise.resolve(new Response(null, { status: 204 }));
    if (base === '/auth/v1/user') {
      return withOwner(url, init).then(function (r) {
        return r.json().then(function (u) { var a = acting(); if (a && u) u.id = a.id; return jres(u, r.status); });
      });
    }
    if (base.indexOf('/auth/v1/') === 0) { note('auth dropped', base); return Promise.resolve(jres({})); }

    /* ---- app functions: always through the sandbox door */
    var m = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(base);
    if (m) {
      var fn = m[1];
      if (fn === 'resolve_login' || fn.indexOf('hero_sbx') === 0) return rawFetch(url, init);
      var args = method === 'GET' ? {} : body(init);
      if (method === 'GET' && q >= 0) new URLSearchParams(path.slice(q + 1)).forEach(function (v, k) { args[k] = v; });
      var a = acting(), o = owner();
      return withOwner(SB + '/rest/v1/rpc/hero_sbx_call', { method: 'POST', signal: init.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_as: (a && a.id) || (o && o.uid), p_fn: fn, p_args: args }) });
    }

    /* ---- direct table access: reads go through, writes are dropped */
    if (base.indexOf('/rest/v1/') === 0) {
      if (method === 'GET' || method === 'HEAD') return rawFetch(url, init);
      note('table write dropped', method + ' ' + base);
      if (method === 'POST') {
        var b = body(init), rows = Array.isArray(b) ? b : [b];
        rows = rows.map(function (r) { return Object.assign({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) }, r); });
        return Promise.resolve(jres(rows, 201));
      }
      return Promise.resolve(jres([], 200));
    }

    /* ---- functions */
    if (base === '/functions/v1/gate-capture') {
      var gb = body(init);
      if (gb.op === 'ping') return rawFetch(url, init);
      var ga = acting();
      return withOwner(SB + '/functions/v1/hero-sandbox', { method: 'POST', signal: init.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: gb.op, rec: gb.rec || {}, as: ga && ga.id }) });
    }
    if (base === '/functions/v1/hero-otp') {
      return withOwner(SB + '/functions/v1/hero-sandbox', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'otp', rec: body(init) }) });
    }
    if (/^\/functions\/v1\/(read-text|identify-part|vision-annotate|wa-status|ezviz)$/.test(base)) return rawFetch(url, init);
    if (base.indexOf('/functions/v1/') === 0) { note('function dropped', base); return Promise.resolve(jres({ ok: true, sandbox: true })); }

    /* ---- photos: sandbox uploads live under <bucket>/sandbox/ */
    var st = /^\/storage\/v1\/object\/(sign\/)?([^/]+)\/(.+)$/.exec(base);
    if (st && method !== 'GET' && method !== 'HEAD') {
      var bucket = st[2], p2 = st[3];
      if (!st[1]) { UPLOADED[bucket + '/' + p2] = 1; return rawFetch(SB + '/storage/v1/object/' + bucket + '/sandbox/' + p2 + (q >= 0 ? path.slice(q) : ''), init); }
      if (UPLOADED[bucket + '/' + p2]) return rawFetch(SB + '/storage/v1/object/sign/' + bucket + '/sandbox/' + p2 + (q >= 0 ? path.slice(q) : ''), init);
    }
    return rawFetch(url, init);
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.href) || '';
    if (!url || url.indexOf(SB) !== 0) return rawFetch(input, init);
    return route(url, init || {});
  };

  /* ------------------------------------------------------ 4b. where am I? */
  var PLACES = {
    chinchwad: { label: 'Chinchwad workshop', lat: 18.647853, lng: 73.805557, acc: 12 },
    outside: { label: 'Outside (5 km away)', lat: 18.692853, lng: 73.805557, acc: 20 },
    off: { label: 'Location OFF (refused)' },
    real: { label: 'Real GPS of this phone' }
  };
  function place() { return own('place') || 'chinchwad'; }
  try {
    var G = navigator.geolocation;
    if (G) {
      var rGet = G.getCurrentPosition.bind(G), rWatch = G.watchPosition.bind(G);
      var fakeFix = function (ok, err, opts, watch) {
        var k = place();
        if (k === 'real') return watch ? rWatch(ok, err, opts) : rGet(ok, err, opts);
        setTimeout(function () {
          if (k === 'off') { if (err) err({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); return; }
          var p = PLACES[k] || PLACES.chinchwad;
          ok({ coords: { latitude: p.lat + (Math.random() - 0.5) * 0.00008, longitude: p.lng + (Math.random() - 0.5) * 0.00008,
                         accuracy: p.acc, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
        }, 400);
        return 1;
      };
      G.getCurrentPosition = function (ok, err, opts) { fakeFix(ok, err, opts, false); };
      G.watchPosition = function (ok, err, opts) { return fakeFix(ok, err, opts, true); };
    }
  } catch (e) {}

  /* ------------------------------------------------------------ 5. screens */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var CSS = '#sbx-strip{position:fixed;left:0;right:0;top:0;z-index:2147483000;height:28px;display:flex;align-items:center;gap:8px;padding:0 10px;' +
    'background:#c2410c;color:#fff;font:700 12px/1 system-ui,Roboto,sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap;overflow:hidden}' +
    '#sbx-strip b{background:#fff;color:#c2410c;border-radius:4px;padding:2px 5px}#sbx-strip span{overflow:hidden;text-overflow:ellipsis}' +
    'html.sbx-on body{margin-top:28px!important}' +
    '#sbx-panel,#sbx-gate{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto}' +
    '#sbx-panel .bx,#sbx-gate .bx{background:#fff;color:#0f172a;border-radius:14px;max-width:440px;width:100%;padding:16px;font:14px/1.45 system-ui,Roboto,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
    '.sbx-h{font-weight:800;font-size:17px;margin:0 0 4px}.sbx-s{color:#475569;font-size:12.5px;margin-bottom:10px}' +
    '.sbx-l{font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin:12px 0 5px}' +
    '.sbx-i{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:15px system-ui;margin-bottom:6px;background:#fff;color:#0f172a}' +
    '.sbx-b{display:block;width:100%;padding:11px;border:0;border-radius:9px;background:#c2410c;color:#fff;font:800 15px system-ui;margin-top:8px;cursor:pointer}' +
    '.sbx-g{background:#e2e8f0;color:#0f172a}.sbx-r{display:flex;flex-wrap:wrap;gap:6px}' +
    '.sbx-c{padding:7px 10px;border:1px solid #cbd5e1;border-radius:999px;font:700 12.5px system-ui;background:#fff;color:#0f172a;cursor:pointer}' +
    '.sbx-c.on{background:#0f172a;color:#fff;border-color:#0f172a}.sbx-m{font-size:12.5px;margin-top:8px;min-height:16px}';
  function ready(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }

  function paintStrip() {
    ready(function () {
      var s = document.getElementById('sbx-strip');
      if (!s) {
        var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        s = el('<div id="sbx-strip" title="Sandbox settings"></div>');
        document.body.appendChild(s); document.documentElement.classList.add('sbx-on');
        s.onclick = openPanel;
      }
      var a = acting();
      s.innerHTML = '<b>🧪 SANDBOX</b><span>' + (a ? esc(a.code) + ' · ' + esc(a.name || '') : 'not logged in') +
        ' · 📍 ' + esc((PLACES[place()] || PLACES.chinchwad).label) + (DEVICE !== 'real' ? ' · 📱 ' + esc(DEVICE) : '') + ' ▾</span>';
    });
  }

  function openGate(msg) {
    ready(function () {
      paintStrip();
      if (document.getElementById('sbx-gate')) return;
      var g = el('<div id="sbx-gate"><div class="bx">' +
        '<div class="sbx-h">🧪 Sehgal Hero — Sandbox</div>' +
        '<div class="sbx-s">Only for the CEO login. Sign in once with your own password; then log in as anybody. ' +
        'What you save here is seen only by you. Nothing is sent to customers or staff.</div>' +
        '<div class="sbx-l">Your employee no</div><input class="sbx-i" id="sbx-emp" value="275506" autocomplete="username">' +
        '<div class="sbx-l">Your password</div><input class="sbx-i" id="sbx-pw" type="password" autocomplete="current-password">' +
        '<button class="sbx-b" id="sbx-go">Open sandbox</button><div class="sbx-m" id="sbx-gm"></div></div></div>');
      document.body.appendChild(g);
      var say = function (t, bad) { var m = document.getElementById('sbx-gm'); m.style.color = bad ? '#b91c1c' : '#475569'; m.textContent = t; };
      if (msg) say(msg, true);
      document.getElementById('sbx-go').onclick = function () {
        var emp = document.getElementById('sbx-emp').value.trim(), pw = document.getElementById('sbx-pw').value;
        if (!emp || !pw) { say('Enter employee no and password.', true); return; }
        say('Checking…');
        rawFetch(SB + '/rest/v1/rpc/resolve_login', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: emp.toLowerCase() }) })
          .then(function (r) { return r.ok ? r.json() : ''; })
          .then(function (email) {
            if (!email) throw new Error('Unknown employee no.');
            return rawFetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: pw }) });
          })
          .then(function (r) { return r.json().then(function (s) { if (!r.ok || !s.access_token) throw new Error('Wrong employee no or password.'); return s; }); })
          .then(function (s) { own('owner', { uid: s.user && s.user.id }); keepOwner(s); return people(true); })
          .then(function () { g.remove(); paintStrip(); })
          .catch(function (e) { own('owner', null); say(String(e.message || e), true); });
      };
    });
  }

  function openPanel() {
    if (document.getElementById('sbx-panel')) return;
    var a = acting(), k = place();
    var chips = function (name, opts, cur) {
      return '<div class="sbx-r">' + opts.map(function (o) {
        return '<button class="sbx-c' + (o[0] === cur ? ' on' : '') + '" data-' + name + '="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    };
    var p = el('<div id="sbx-panel"><div class="bx">' +
      '<div class="sbx-h">🧪 Sandbox</div>' +
      '<div class="sbx-s">Now: <b>' + (a ? esc(a.code) + ' — ' + esc(a.name) + ' (' + esc(a.role) + ')' : 'not logged in') + '</b></div>' +
      '<div class="sbx-l">Be this person</div><select class="sbx-i" id="sbx-who"><option value="">Loading…</option></select>' +
      '<button class="sbx-b" id="sbx-be">Log in as this person</button>' +
      '<div class="sbx-l">Where the phone is</div>' +
      chips('place', Object.keys(PLACES).map(function (x) { return [x, PLACES[x].label]; }), k) +
      '<div class="sbx-l">Device</div>' +
      chips('dev', [['real', 'This device'], ['android', 'Android phone'], ['iphone', 'iPhone (Chrome)'], ['windows', 'Windows PC']], DEVICE) +
      '<div class="sbx-l">My sandbox entries</div><div class="sbx-s" id="sbx-cnt">…</div>' +
      '<div class="sbx-s">WhatsApp codes are never sent from the sandbox — type <b>' + CODE + '</b>.</div>' +
      '<button class="sbx-b sbx-g" id="sbx-wipe">Clear my sandbox entries</button>' +
      '<button class="sbx-b sbx-g" id="sbx-out">Sign out of sandbox</button>' +
      '<button class="sbx-b" id="sbx-close">Close</button><div class="sbx-m" id="sbx-pm"></div></div></div>');
    document.body.appendChild(p);
    var say = function (t) { document.getElementById('sbx-pm').textContent = t; };
    p.onclick = function (e) { if (e.target === p) p.remove(); };
    document.getElementById('sbx-close').onclick = function () { p.remove(); };
    people().then(function (list) {
      var sel = document.getElementById('sbx-who');
      sel.innerHTML = list.filter(function (x) { return x.active !== false; }).map(function (x) {
        return '<option value="' + esc(x.empno || x.code) + '"' + (a && a.id === x.id ? ' selected' : '') + '>' +
          esc(x.empno || x.code) + ' — ' + esc(x.name || '') + ' (' + esc(x.role || '') + (x.ws ? ', ' + esc(x.ws) : '') + ')</option>';
      }).join('');
    }).catch(function (e) { say(String(e.message || e)); });
    status();
    function status() {
      ownerToken().then(function (t) {
        return rawFetch(SB + '/rest/v1/rpc/hero_sbx_status', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' });
      }).then(function (r) { return r.json(); }).then(function (j) {
        document.getElementById('sbx-cnt').textContent = j && j.ok
          ? j.gate + ' gate entries · ' + j.estimates + ' estimates · ' + j.hidden + ' hidden · ' + j.writes + ' saves tried' : '—';
      }).catch(function () {});
    }
    document.getElementById('sbx-be').onclick = function () {
      var code = document.getElementById('sbx-who').value; if (!code) return;
      p.remove(); becomePerson(code);
    };
    Array.prototype.forEach.call(p.querySelectorAll('[data-place]'), function (b) {
      b.onclick = function () {
        own('place', b.getAttribute('data-place')); p.remove(); paintStrip();
        try { if (typeof window.heroGeoCheck === 'function') window.heroGeoCheck(true); } catch (e) {}
      };
    });
    Array.prototype.forEach.call(p.querySelectorAll('[data-dev]'), function (b) {
      b.onclick = function () { own('device', b.getAttribute('data-dev')); location.reload(); };
    });
    document.getElementById('sbx-wipe').onclick = function () {
      if (!confirm('Remove every gate entry and estimate you made in the sandbox?')) return;
      ownerToken().then(function (t) {
        return rawFetch(SB + '/rest/v1/rpc/hero_sbx_reset', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' });
      }).then(function (r) { return r.json(); }).then(function (j) { say('Removed ' + ((j && j.removed) || 0) + '.'); status(); });
    };
    document.getElementById('sbx-out').onclick = function () {
      own('owner', null); own('acting', null);
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      location.reload();
    };
  }

  /* log in through the app's OWN login screen, exactly as the person would */
  function becomePerson(code) {
    try { if (typeof window.logout === 'function') window.logout(); } catch (e) {}
    own('acting', null);
    var tries = 0;
    (function fill() {
      var emp = document.getElementById('li-emp'), pw = document.getElementById('li-pass');
      if (!emp || !pw || !emp.offsetParent) { if (++tries < 40) return setTimeout(fill, 150); return; }
      emp.value = code; pw.value = 'sandbox';
      try { window.doLogin(); } catch (e) {}
    })();
  }

  /* ------------------------------------------------------------------ boot */
  if (!owner()) openGate();
  else { people().catch(function (e) { own('owner', null); openGate(String(e.message || e)); }); paintStrip(); }
  window.heroSandbox = { become: becomePerson, panel: openPanel, acting: acting, place: place };
})();
