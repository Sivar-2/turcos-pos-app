const CACHE_NAME = 'turco-pos-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './js/app.js',
    'https://cdn.tailwindcss.com',
    'https://cdn-icons-png.flaticon.com/512/763/763056.png',
    // We cache the ESM CDN files to ensure offline modules work
    'https://esm.sh/preact@10.19.2',
    'https://esm.sh/preact@10.19.2/hooks',
    'https://esm.sh/htm@3.1.1/preact'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

self.addEventListener('fetch', (event) => {
    // For Firestore requests, we let the JS SDK handle offline persistence.
    // For everything else (static assets), we try network first, fall back to cache.
    // simpler strategy: Cache First for static assets for speed

    if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
        return; // Let browser/SDK handle API requests
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((response) => {
                // Optional: Cache new requests dynamicallly
                return response;
            });
        })
    );
});
