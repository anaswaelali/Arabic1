/* Keeps the last working copy of the app for offline use and refreshes it when the network works.
   Only a real app page (HTTP 200, text/html, with the app marker) is ever saved or shown from the network. */
var PREFIX = 'hana-malek-';
var CACHE = PREFIX + 'v1';
var MARKER = 'data-app-id="hana-malek"';
var START = new Request(self.registration.scope);
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
var TIMEOUT_MS = 4000;

function isAppPage(res) {
  if (!res || res.status !== 200) return Promise.resolve(false);
  var ct = res.headers.get('content-type') || '';
  if (ct.indexOf('text/html') < 0) return Promise.resolve(false);
  return res.clone().text().then(function (t) { return t.indexOf(MARKER) >= 0; }).catch(function () { return false; });
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return fetch(START.url, { cache: 'reload' }).then(function (r) {
      return isAppPage(r).then(function (ok) { if (ok) return c.put(START, r.clone()); });
    }).catch(function () {});
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(e, req) {
  return caches.open(CACHE).then(function (cache) {
    return new Promise(function (resolve) {
      var done = false;
      function fallback() {
        if (done) return;
        cache.match(START, { ignoreSearch: true }).then(function (hit) {
          if (done) return;
          done = true;
          resolve(hit || fetch(req).catch(function () { return Response.error(); }));
        });
      }
      var timer = setTimeout(fallback, TIMEOUT_MS);
      var work = fetch(req, { cache: 'no-store' }).then(function (res) {
        clearTimeout(timer);
        return isAppPage(res).then(function (ok) {
          if (ok) {
            var saved = cache.put(START, res.clone());
            if (!done) { done = true; resolve(res); }
            return saved;
          }
          fallback();
        });
      }).catch(function () { clearTimeout(timer); fallback(); });
      e.waitUntil(work);
    });
  });
}

function fontCache(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit || Response.error(); });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin && url.href.indexOf(self.registration.scope) === 0) {
    e.respondWith(networkFirst(e, req));
  } else if (FONT_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith(fontCache(req));
  }
});
