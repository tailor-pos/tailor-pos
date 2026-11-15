// Tailor POS service worker: lets the installed app open without internet.
// The app page is fetched fresh when online (so updates arrive) and from the cache when offline, or when the
// network does not answer within 4 seconds (Wi-Fi without internet); the fresh copy is still kept when it arrives.
// Database traffic (Firestore, Supabase) is never touched here; only the app and its libraries are cached.
const CACHE = 'tailorpos-4e37e186dd';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png', './favicon.png'];
const SDK = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.103.1"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(CORE);
    await Promise.all(SDK.map((u) => fetch(u, { mode: 'cors' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tailorpos-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // network first, cache as fallback (also when the network is slow to answer)
    const net = fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); return caches.open(CACHE).then((c) => c.put(req, copy)).then(() => r, () => r); }
      return r;
    });
    const kept = () => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'));
    e.waitUntil(net.catch(() => null));
    e.respondWith(Promise.race([net, new Promise((res) => setTimeout(res, 4000)).then(kept).then((r) => r || net)])
      .catch(() => kept().then((r) => r || Response.error())));
    return;
  }
  if (url.hostname === 'www.gstatic.com' || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // versioned libraries and fonts: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return r;
    })));
  }
});
