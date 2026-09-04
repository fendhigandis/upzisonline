// ==========================================
// PENGATURAN SERVICE WORKER (CACHE)
// ==========================================

// Variabel untuk menamai versi penyimpanan (cache). 
// Jika Anda memperbarui desain/kode, ubah 'v1' menjadi 'v2' agar HP pengguna mengunduh ulang yang baru.
const CACHE_NAME = 'upzis-kas-cache-v1';

// Daftar file yang WAJIB disimpan di memori HP agar aplikasi memuat lebih cepat
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    // Pustaka eksternal (Library) yang kita gunakan di HTML
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ------------------------------------------
// PROSES 1: INSTALASI (Menyimpan File Pertama Kali)
// ------------------------------------------
self.addEventListener('install', (event) => {
    // Memaksa proses instalasi menunggu sampai semua aset inti selesai diunduh dan disimpan
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Menyimpan aset inti ke memori (Caching)...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Langsung aktifkan Service Worker baru tanpa menunggu tab ditutup
    self.skipWaiting();
});

// ------------------------------------------
// PROSES 2: AKTIVASI (Pembersihan Memori Lama)
// ------------------------------------------
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    // Jika ada nama cache yang tidak sama dengan versi saat ini (CACHE_NAME), hapus!
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Menghapus memori (cache) versi lama:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    // Mengambil alih kontrol klien (browser) segera setelah aktif
    self.clients.claim();
});

// ------------------------------------------
// PROSES 3: MENGAMBIL DATA (Fetch Strategy)
// ------------------------------------------
self.addEventListener('fetch', (event) => {
    const requestUrl = event.request.url;

    // PENGECUALIAN PENTING: 
    // Jangan pernah simpan (cache) permintaan jaringan yang mengarah ke server Firebase.
    // Ini memastikan data transaksi Anda selalu real-time, bukan data usang!
    if (requestUrl.includes('firestore.googleapis.com') || 
        requestUrl.includes('identitytoolkit.googleapis.com') ||
        requestUrl.includes('firebasestorage.googleapis.com')) {
        return; // Biarkan browser yang menangani secara default (langsung ke internet)
    }

    // STRATEGI: "Cache First, fallback to Network" 
    // Artinya: Cari file di dalam HP (Cache) dulu. Jika tidak ada, baru unduh dari Internet.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Jika file ditemukan di cache, gunakan itu
            if (cachedResponse) {
                return cachedResponse;
            }

            // Jika tidak ada di cache, ambil dari internet
            return fetch(event.request).then((networkResponse) => {
                // Simpan respons jaringan baru ke cache (khusus untuk sumber daya statis gambar/font)
                return caches.open(CACHE_NAME).then((cache) => {
                    // Hanya simpan request tipe GET (bukan POST seperti form login)
                    if (event.request.method === 'GET' && !requestUrl.startsWith('chrome-extension')) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            });
        }).catch(() => {
            // Jika HP tidak ada sinyal internet dan file belum pernah disimpan di cache,
            // (Opsional: Anda bisa mengarahkan ke halaman khusus "Offline" jika nanti dibuat)
            console.log('[Service Worker] Gagal mengambil data, status OFFLINE.');
        })
    );
});
