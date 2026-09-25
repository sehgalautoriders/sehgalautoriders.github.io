"""Build /sandbox/ from the live app (Ravi 25-09-2026, CEO sandbox — migration 0094).

    python sandbox/build.py

Run it after EVERY release of index.html, so the sandbox always shows exactly the
build the staff are running. It writes, inside sandbox/ only:
  index.html          the live index.html + the sandbox layer loaded first in <head>
                      (sandbox.js is the layer itself; the tag carries ?v=<hash>)
  sw.js               a do-nothing service worker for scope /sandbox/ — it takes the
                      sandbox out of the live worker's cache-first hands and answers
                      the app's "which build are you?" question with the same build
Nothing outside sandbox/ is touched, so staff phones see no new version.
"""
import hashlib, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def read(p):
    return io.open(p, encoding="utf-8", newline="").read()


def write(p, s):
    io.open(p, "w", encoding="utf-8", newline="").write(s)


app = read(os.path.join(ROOT, "index.html"))
m = re.search(r"HERO_BUILD = '([^']+)'", app)
if not m:
    sys.exit("HERO_BUILD not found in index.html")
build = m.group(1)

src = read(os.path.join(HERE, "sandbox.js"))
ver = hashlib.sha256(src.encode("utf-8")).hexdigest()[:10]

head = re.search(r"<head[^>]*>", app, re.I)
if not head:
    sys.exit("<head> not found")
tag = '<script charset="utf-8" src="sandbox.js?v=%s"></script>' % ver
out = app[:head.end()] + tag + app[head.end():]
out = re.sub(r"<title>[^<]*</title>", "<title>SANDBOX · Sehgal Hero</title>", out, count=1)
out = re.sub(r'<link[^>]+rel="manifest"[^>]*>', "", out, count=1)   # never installable as the real app
# pictures, fonts and icons stay where the live app keeps them (one level up)
out = re.sub(r"([\"'(])(assets/|icon-[a-z0-9-]+\.png)", lambda k: k.group(1) + "../" + k.group(2), out)
write(os.path.join(HERE, "index.html"), out)

write(os.path.join(HERE, "sw.js"), """/* Sandbox service worker — does nothing but own scope /sandbox/ (see build.py). */
const HERO_BUILD = '%s';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', function (event) {
  if (event.data === 'HERO_SKIP_WAITING') self.skipWaiting();
  if (event.data === 'HERO_BUILD?' && event.source) event.source.postMessage({ heroBuild: HERO_BUILD });
});
""" % build)
print("sandbox built:", build, "sandbox.js v=" + ver)
