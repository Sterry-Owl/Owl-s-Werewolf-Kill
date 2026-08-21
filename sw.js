const CACHE_NAME = 'bloodmoon-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/config.js',
    './js/engine.js',
    './js/role.js',
    './js/phases.js',
    './js/host.js',
    './js/ui.js',
    './js/player.js',
    './js/app.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const resClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
