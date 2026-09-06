// ==========================================
// PENGATURAN SERVICE WORKER (PWA) PROFESIONAL
// ==========================================
const CACHE_NAME = 'upzis-kas-pro-v5';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Cinzel:wght@600;700;800&display=swap'
];

// 1. Install Event: Menyimpan aset ke cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. Activate Event: Menghapus cache versi lama yang sudah tidak dipakai
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. Fetch Event: Strategi Cache-First untuk aset statis, abaikan request Firebase API
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const requestUrl = event.request.url;

    // Biarkan permintaan ke server Firebase berjalan langsung lewat jaringan (network)
    if (requestUrl.includes('firestore.googleapis.com') || 
        requestUrl.includes('identitytoolkit.googleapis.com') ||
        requestUrl.includes('securetoken.googleapis.com') ||
        requestUrl.includes('firebasestorage.googleapis.com')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    if (!requestUrl.startsWith('chrome-extension') && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            });
        }).catch(() => {
            // Fallback jika benar-benar offline total
            console.log('[PWA] Mode offline aktif.');
        })
    );
});
