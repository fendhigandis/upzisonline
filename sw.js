// Service Worker Sederhana untuk memenuhi syarat Install PWA
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Berhasil di-install');
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[Service Worker] Aktif dan siap berjalan');
    return self.clients.claim();
});

// Membiarkan aplikasi mengambil data dari internet (Firebase) secara normal
self.addEventListener('fetch', (e) => {
    // Tidak melakukan caching lokal agar data kas selalu Real-Time
});
