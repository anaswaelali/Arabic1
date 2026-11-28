/* Hana & Malek app worker v2.
   Opens the saved copy at once, then checks for a newer one in the background (conditional request).
   If a newer real app page is found it is saved and the page is told, so it can show an "update" banner.
   Only a real app page (HTTP 200, text/html, with the app marker) is ever saved or shown. */
var PREFIX = 'hana-malek-';
var CACHE = PREFIX + 'v1';
var MARKER = 'data-app-id="hana-malek"';
var START = new Request(self.registration.scope);
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function isAppPage(res) {
  if (!res || res.status !== 200) return Promise.resolve(false);
  var ct = res.headers.get('content-type') || '';
  if (ct.indexOf('text/html') < 0) return Promise.resolve(false);
  return res.clone().text().then(function (t) { return t.indexOf(MARKER) >= 0; }).catch(function () { return false; });
}
function tag(res) { return res ? (res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length') || '') : ''; }

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.match(START).then(function (have) {
      if (have) return;
      return fetch(START.url).then(function (r) {
        return isAppPage(r).then(function (ok) { if (ok) return c.put(START, r.clone()); });
      }).catch(function () {});
    });
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function tellClients() {
  return self.clients.matchAll({ type: 'window' }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage({ type: 'hm-update' }); });
  });
}

function refresh(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(START, { ignoreSearch: true }).then(function (old) {
      return fetch(req.url, { cache: 'no-cache' }).then(function (res) {
        return isAppPage(res).then(function (ok) {
          if (!ok) return null;
          var changed = old && tag(old) !== tag(res);
          return cache.put(START, res.clone()).then(function () { return changed ? tellClients() : null; });
        });
      }).catch(function () { return null; });
    });
  });
}

function openFast(e, req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(START, { ignoreSearch: true }).then(function (hit) {
      if (hit) { e.waitUntil(refresh(req)); return hit; }
      return fetch(req).then(function (res) {
        isAppPage(res).then(function (ok) { if (ok) cache.put(START, res.clone()); });
        return res;
      });
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
    e.respondWith(openFast(e, req));
  } else if (FONT_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith(fontCache(req));
  }
});
