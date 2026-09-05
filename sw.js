// ==========================================
// PENGATURAN SERVICE WORKER (CACHE) v2
// ==========================================

// PERBAIKAN: Ubah menjadi v2 agar browser segera mengunduh versi terbaru yang sudah diperbaiki
const CACHE_NAME = 'upzis-kas-cache-v2';

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
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Menyimpan aset inti ke memori (Caching)...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Menghapus memori (cache) versi lama:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // -------------------------------------------------------------
    // 🌟 PERBAIKAN UTAMA (Mencegah Error 405 Method Not Allowed)
    // -------------------------------------------------------------
    // Secara otomatis biarkan browser mengurus semua operasi pengiriman 
    // data (POST, PUT, DELETE) ke server luar (seperti Firebase/Analytics).
    if (event.request.method !== 'GET') {
        return; 
    }

    const requestUrl = event.request.url;

    // Abaikan juga request Firebase API meskipun itu metode GET
    if (requestUrl.includes('firestore.googleapis.com') || 
        requestUrl.includes('identitytoolkit.googleapis.com') ||
        requestUrl.includes('securetoken.googleapis.com') || // Tambahan pengamanan auth
        requestUrl.includes('firebasestorage.googleapis.com')) {
        return; 
    }

    // Eksekusi sistem Cache untuk sisa file (HTML, CSS, JS, Gambar)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    if (!requestUrl.startsWith('chrome-extension')) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            });
        }).catch(() => {
            console.log('[Service Worker] Gagal mengambil data, status OFFLINE.');
        })
    );
});
