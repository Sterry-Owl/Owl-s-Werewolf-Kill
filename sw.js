const CACHE_NAME = 'bloodmoon-v1.1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/account.js', // [新增] 將帳號模組納入靜態資源快取
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
    // 1. 僅快取 GET 請求，POST、PUT 等具有副作用的請求直接放行，避免 Cache API 報錯
    if (event.request.method !== 'GET') {
        return;
    }

    // 2. 排除 Firebase 驗證與 Firestore API，避免快取動態會員狀態
    const url = new URL(event.request.url);
    if (url.origin.includes('googleapis.com') || url.origin.includes('firebaseio.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 確保僅在收到有效 HTTP 回應時才寫入快取
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const resClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
