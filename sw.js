// Network first, so a deploy shows up on the next load; the cache only
// serves when offline.
const CACHE = 'rubik';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'worker.js',
  'js/app.js', 'js/cube.js', 'js/color.js', 'js/view3d.js', 'js/snap.js', 'js/detect.js', 'js/detect-worker.js',
  'vendor/cubejs/cube.js', 'vendor/cubejs/solve.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
