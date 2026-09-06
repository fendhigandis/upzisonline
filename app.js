// =====================================================================
// --- 1. INISIALISASI FIREBASE (MODULAR SDK) & MODE OFFLINE ---
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, enableIndexedDbPersistence, collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc as fsGetDoc, updateDoc, query, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail,
    setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBpsQLNhyFL-agq2Iwmw2TU42F51LrvkHI",
    authDomain: "upzis-lazisnu.firebaseapp.com",
    projectId: "upzis-lazisnu",
    storageBucket: "upzis-lazisnu.firebasestorage.app",
    messagingSenderId: "1284852623",
    appId: "1:1284852623:web:a2b24c2e261273c59099fa",
    measurementId: "G-L9Q1Z2XELY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Mode Offline Silent (Tanpa Warning Kuning di Console)
enableIndexedDbPersistence(db).catch((err) => {
    console.log('[Sistem] Berjalan di mode memory cache karena limitasi browser.');
});

const auth = getAuth(app);

window.db = db;
window.auth = auth;
window.authServices = { 
    signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail,
    setPersistence, browserLocalPersistence, browserSessionPersistence
};
window.fs = { collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc: fsGetDoc, updateDoc, query, orderBy, onSnapshot };

// =====================================================================
// --- 2. VARIABEL GLOBAL, PAGINASI, & STATE APLIKASI ---
// =====================================================================
let isMusicPlaying = false;
let warningInterval = null;
let asalRanting = ""; 
let isRegisterMode = false;
window.activeKontenText = null;

let transactions = [];
let dbMustahik = [];
let logsData = [];
let currentUserRole = 'bendahara';

// Paginasi Buku Besar
let currentPage = 1; 
const itemsPerPage = 15; 
let totalPages = 1;

let unsubProfile = null;
let unsubTrx = null;
let unsubMustahik = null;
let unsubLogs = null;

let profileSettings = {
    lembaga: 'UPZIS Ranting Karangdowo', periode: '2024-2029', 
    ketua: 'H. Fulan, S.Ag', bendahara: 'Muhamad Efendhi, S. Ak', 
    username: 'bendahara', password: 'admin', 
    relawan: ['Mustaqim', 'Ana / Jariyah', 'Fatimah', 'Novi', 'Yusuf', "Rofi'ah", 'Watik / Har / Bu Parno', 'Geger / Ujang'], 
    anggota: [],
    logoBase64: 'icon-192.png', // Logo anti-gagal menggunakan file lokal
    activeYear: new Date().getFullYear(),
    teleBotToken: '',
    teleChatId: ''
};

// =====================================================================
// --- 3. FITUR KEAMANAN ENTERPRISE: AUTO-LOGOUT & ERROR LOGGER ---
// =====================================================================
let idleTime = 0;
function resetIdleTimer() { idleTime = 0; }
setInterval(() => {
    if (currentUserRole && !document.getElementById('app-screen').classList.contains('hidden')) {
        idleTime++;
        if (idleTime >= 15) { 
            showToast("Sesi berakhir karena tidak ada aktivitas (15 Menit).", "error"); 
            window.logout(); 
        }
    }
}, 60000);
['mousemove', 'keydown', 'touchstart', 'scroll'].forEach(e => window.addEventListener(e, resetIdleTimer));

window.addEventListener('error', async function(event) {
    console.error("[Auto-Logger System Error]: ", event.message);
    if(window.fs && currentUserRole && currentUserRole !== '') {
        try { await window.fs.addDoc(getCol("logs"), { time: new Date().toISOString(), user: currentUserRole, action: 'SYSTEM_ERROR', detail: event.message }); } catch(e){}
    }
});

function applyRBAC() {
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = (currentUserRole === 'bendahara') ? '' : 'none';
    });
}

// =====================================================================
// --- 4. FUNGSI UTILITAS & UI DASAR ---
// =====================================================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
        this.beginPath(); this.moveTo(x+r, y); this.arcTo(x+w, y, x+w, y+h, r);
        this.arcTo(x+w, y+h, x, y+h, r); this.arcTo(x, y+h, x, y, r); this.arcTo(x, y, x+w, y, r);
        this.closePath(); return this;
    }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' '), line = '';
    for(var n = 0; n < words.length; n++) {
        var testLine = line + words[n] + ' ';
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight;
        } else { line = testLine; }
    }
    ctx.fillText(line, x, y);
}

function initAudioPlayer() {
    const audio = document.getElementById('bg-music');
    if(audio) {
        audio.volume = 0.20; 
        const playOnInteraction = () => {
            if(audio.paused) { audio.play().catch(() => {}); }
            ['click', 'touchstart', 'keydown'].forEach(evt => document.removeEventListener(evt, playOnInteraction));
        };
        audio.play().catch(e => {
            ['click', 'touchstart', 'keydown'].forEach(evt => document.addEventListener(evt, playOnInteraction, { once: true }));
        });
    }
}

function playSuccessSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
}

function showToast(msg, type='info') {
    let container = document.getElementById('toast-container');
    if(!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div'); toast.className = 'toast';
    let icon = '<i class="fa-solid fa-circle-info" style="color:var(--accent-blue); font-size:18px;"></i>';
    if (type === 'success') { icon = '<i class="fa-solid fa-circle-check" style="color:#4ade80; font-size:18px;"></i>'; playSuccessSound(); } 
    else if (type === 'error') { icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger); font-size:18px;"></i>'; }
    toast.innerHTML = `${icon} <span>${msg}</span>`; container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOut 0.4s forwards'; setTimeout(() => toast.remove(), 400); }, 3500);
}

const formatRp = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

function formatTanggalIndo(dateString) {
    if (!dateString) return '-';
    const opsi = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateObj = new Date(dateString);
    return isNaN(dateObj) ? dateString : dateObj.toLocaleDateString('id-ID', opsi);
}

function getCol(colName) {
    return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.collection(window.db, colName) : window.fs.collection(window.db, "ranting", asalRanting.toLowerCase(), colName);
}

function getFirestoreDoc(colName, docId) {
    return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.doc(window.db, colName, docId) : window.fs.doc(window.db, "ranting", asalRanting.toLowerCase(), colName, docId);
}

function getDynamicCategories() {
    let inList = [ { code: '101', name: 'Saldo Awal Kas' }, { code: '120', name: 'Pindah Buku Rekening Bank ke tunai' }, { code: '220', name: 'Pindah Tunai ke Rekening' } ];
    if(profileSettings.relawan && profileSettings.relawan.length > 0) {
        profileSettings.relawan.forEach((rel, idx) => { inList.push({ code: String(111 + idx), name: `Setoran Bulanan dari Relawan ${rel}` }); });
    }
    inList.push({ code: '199', name: 'Penerimaan / Donasi Lainnya' }, { code: '301', name: 'Penerimaan Zakat Fitrah' }, { code: '302', name: 'Penerimaan Zakat Mal' });
    let outList = [
        { code: '201', name: 'Santunan Kematian (Duka)' }, { code: '202', name: 'Santunan Kesehatan' }, { code: '203', name: 'Santunan Pendidikan' },
        { code: '204', name: 'Klaim Operasional Ambulan' }, { code: '205', name: 'Akomodasi (Transport)' }, { code: '206', name: 'Konsumsi (Rapat)' },
        { code: '207', name: 'Setoran ke LAZISNU Cabang' }, { code: '208', name: 'Santunan Tanggap Bencana' }, { code: '299', name: 'Penyaluran Lainnya' },
        { code: '401', name: 'Penyaluran Zakat Fitrah' }, { code: '402', name: 'Penyaluran Zakat Mal' }
    ];
    return { in: inList, out: outList };
}

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width, height = img.height; const maxDim = 800;
            if (width > maxDim || height > maxDim) {
                if (width > height) { height *= maxDim / width; width = maxDim; } else { width *= maxDim / height; height = maxDim; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// =====================================================================
// --- 5. NAVIGASI, TEMA & AUTHENTICATION ---
// =====================================================================
window.togglePasswordVisibility = function() {
    const passInput = document.getElementById('l-pass'), eyeIcon = document.getElementById('eye-icon');
    if(passInput.type === 'password') { passInput.type = 'text'; eyeIcon.className = 'fa-solid fa-eye-slash'; } 
    else { passInput.type = 'password'; eyeIcon.className = 'fa-solid fa-eye'; }
}

window.toggleModeAuth = function(e) {
    e.preventDefault(); isRegisterMode = !isRegisterMode;
    const groupRanting = document.getElementById('group-ranting'), btnSubmit = document.getElementById('btn-auth-submit'), linkToggle = document.getElementById('link-toggle-auth');
    if(isRegisterMode) {
        groupRanting.style.display = 'block'; btnSubmit.innerHTML = '<i class="fa-solid fa-user-plus"></i> Daftarkan Ranting Baru';
        linkToggle.innerText = 'Sudah punya akun? Masuk di sini'; document.getElementById('l-ranting').required = true;
    } else {
        groupRanting.style.display = 'none'; btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem Terpadu';
        linkToggle.innerText = 'Belum punya akun Ranting? Daftar di sini'; document.getElementById('l-ranting').required = false;
    }
}

window.recoverPasswordEmail = async function() {
    let email = document.getElementById('l-user').value.trim();
    if(!email) { email = prompt("MASUKKAN EMAIL PEMULIHAN:\nSilakan ketik alamat email Anda yang terdaftar pada sistem."); if(!email) return; }
    try { showToast("Memproses...", "info"); await window.authServices.sendPasswordResetEmail(window.auth, email); showToast("BERHASIL! Link dikirim ke " + email, "success");
    } catch(e) { showToast("Gagal memulihkan sandi. Pastikan email terdaftar.", "error"); }
}

window.logout = async function() {
    try {
        if (unsubProfile) unsubProfile(); if (unsubTrx) unsubTrx(); if (unsubMustahik) unsubMustahik(); if (unsubLogs) unsubLogs();
        await window.authServices.signOut(window.auth); sessionStorage.removeItem('upzis_role');
        transactions = []; dbMustahik = []; logsData = []; asalRanting = ""; 
        document.getElementById('app-screen').classList.add('hidden'); document.getElementById('auth-screen').classList.remove('hidden');
        showToast("Berhasil keluar dengan aman.", "info");
    } catch (err) { showToast("Gagal logout.", "error"); }
}

window.toggleSidebar = function() {
    document.getElementById('app-sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

window.initThemeMode = function() {
    const savedTheme = localStorage.getItem('upzis_theme') || 'light';
    const body = document.body; const icon = document.getElementById('theme-icon'); const text = document.getElementById('theme-text');
    if (savedTheme === 'dark') { body.classList.add('dark-mode'); if (icon) icon.className = 'fa-solid fa-sun'; if (text) text.innerText = 'Light'; } 
    else { body.classList.remove('dark-mode'); if (icon) icon.className = 'fa-solid fa-moon'; if (text) text.innerText = 'Dark'; }
}

window.toggleThemeMode = function() {
    const body = document.body; const isDark = body.classList.toggle('dark-mode');
    localStorage.setItem('upzis_theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('theme-icon'); const text = document.getElementById('theme-text');
    if (isDark) { if (icon) icon.className = 'fa-solid fa-sun'; if (text) text.innerText = 'Light'; showToast("Mode Gelap Aktif", "info"); } 
    else { if (icon) icon.className = 'fa-solid fa-moon'; if (text) text.innerText = 'Dark'; showToast("Mode Terang Aktif", "info"); }
}

// RESTORASI PENUH: FUNGSI PINDAH TAB & TRIGGER RENDER
window.switchTab = function(evt, tabId) {
    document.querySelectorAll('.panel').forEach(el => el.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); 
    document.getElementById(tabId).classList.remove('hidden'); 
    
    if(evt && evt.currentTarget) evt.currentTarget.classList.add('active'); 
    
    if(window.innerWidth <= 1024) { 
        document.getElementById('app-sidebar').classList.remove('mobile-open'); 
        document.getElementById('sidebar-overlay').classList.remove('active'); 
    }
    
    // PEMICU RENDER GRAFIK & KONTEN (Inilah yang sebelumnya membuat menu terlihat kosong)
    if(tabId === 'v-dashboard' || tabId === 'v-histori') refreshUI();
    if(tabId === 'v-laporan') buildReport(); 
    if(tabId === 'v-poster') buildPoster();
    if(tabId === 'v-analitik') renderCharts(); 
    if(tabId === 'v-pengurus') renderBagan(); 
    if(tabId === 'v-konten') renderKontenHarian();
}

function showApp() {
    document.getElementById('auth-screen').classList.add('hidden'); 
    document.getElementById('app-screen').classList.remove('hidden'); 
    document.getElementById('badge-role-text').innerText = currentUserRole === 'bendahara' ? 'Bendahara (Penuh)' : 'Ketua / Pengawas';
    
    refreshUI(); renderMustahik(); renderLogs(); checkYearEnd();
    window.switchTab(null, 'v-dashboard');
}

// =====================================================================
// --- 6. LOGIKA TRANSAKSI, UI REFRESH, & TELEGRAM BOT ---
// =====================================================================
window.ubahHalaman = function(arah) {
    if (arah === -1 && currentPage > 1) currentPage--;
    else if (arah === 1 && currentPage < totalPages) currentPage++;
    refreshUI();
}

async function kirimTelegram(jenis, nominal, desc) {
    if(!profileSettings.teleBotToken || !profileSettings.teleChatId) return;
    const pesan = `*INFO MUTASI UPZIS*\n\n🔹 *Tipe:* ${jenis}\n🔹 *Nominal:* Rp ${formatRp(nominal)}\n🔹 *Ket:* ${desc}\n🔹 *Kasir:* ${currentUserRole.toUpperCase()}`;
    const url = `https://api.telegram.org/bot${profileSettings.teleBotToken}/sendMessage?chat_id=${profileSettings.teleChatId}&text=${encodeURIComponent(pesan)}&parse_mode=Markdown`;
    try { await fetch(url); } catch(e) {}
}

window.simpanTelegram = function() {
    if(currentUserRole !== 'bendahara') return;
    profileSettings.teleBotToken = document.getElementById('tg-token').value.trim();
    profileSettings.teleChatId = document.getElementById('tg-chatid').value.trim();
    window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings);
    showToast("Koneksi Telegram Disimpan!", "success");
}

function refreshUI() {
    applyRBAC();
    let grandIn = 0, grandOut = 0, saldoTunai = 0, saldoBank = 0; 
    const tbody = document.getElementById('table-body'); 
    if(tbody) tbody.innerHTML = '';
    
    const cats = getDynamicCategories(), allCats = [...cats.in, ...cats.out];

    transactions.forEach(t => {
        const amt = Number(t.amount || 0);
        if(t.type === 'in') { 
            if (t.code === '120') { saldoTunai += amt; saldoBank -= amt; }
            else if (t.code === '220') { saldoBank += amt; saldoTunai -= amt; }
            else { grandIn += amt; t.source.includes('Bank') ? saldoBank += amt : saldoTunai += amt; }
        }
        if(t.type === 'out') { 
            if(t.code !== '120' && t.code !== '220') grandOut += amt;
            t.source.includes('Bank') ? saldoBank -= amt : saldoTunai -= amt;
        }
    });

    const keyword = (document.getElementById('search-keyword')?.value || '').toLowerCase();
    const start = document.getElementById('filter-start-date')?.value || '';
    const end = document.getElementById('filter-end-date')?.value || '';
    const fType = document.getElementById('filter-type')?.value || '';

    let globalBalance = 0;
    
    // Sortir & Hitung Saldo Kumulatif
    let allSortedTrx = [...transactions].sort((a,b) => (new Date(a.date || 0) - new Date(b.date || 0)) || ((a.timestamp || 0) - (b.timestamp || 0))).map(t => {
        const amt = Number(t.amount || 0);
        if (t.type === 'in' && t.code !== '120' && t.code !== '220') globalBalance += amt;
        if (t.type === 'out' && t.code !== '120' && t.code !== '220') globalBalance -= amt;
        return { ...t, currentBalance: globalBalance };
    }).filter(t => {
        const catObj = allCats.find(c => c.code === t.code), catName = catObj ? (catObj.name || '').toLowerCase() : '';
        const matchK = (t.desc || '').toLowerCase().includes(keyword) || catName.includes(keyword) || (t.code || '').toLowerCase().includes(keyword);
        return matchK && (!start || t.date >= start) && (!end || t.date <= end) && (!fType || t.type === fType);
    });

    // Terapkan Paginasi
    totalPages = Math.ceil(allSortedTrx.length / itemsPerPage);
    if(currentPage > totalPages) currentPage = totalPages || 1;
    const paginatedTrx = allSortedTrx.slice().reverse().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if(tbody) {
        paginatedTrx.forEach(t => {
            const catObj = allCats.find(c => c.code === t.code), catName = catObj ? catObj.name : 'Lainnya';
            const proofHtml = t.proof ? `<a href="${t.proof}" target="_blank" class="btn-action"><i class="fa-solid fa-image" style="color:var(--accent-blue);"></i></a>` : '-';
            let actionBtns = `<div style="display:flex; gap:6px;"><button class="btn-action" onclick="openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt" style="color:var(--nu-gold-dark);"></i></button>`;
            if(currentUserRole === 'bendahara') { actionBtns += `<button class="btn-action admin-only" onclick="editTrx('${t.idFirebase}')"><i class="fa-solid fa-pen-to-square" style="color:var(--accent-blue);"></i></button><button class="btn-action btn-delete-sm admin-only" onclick="hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash"></i></button>`; }
            tbody.innerHTML += `<tr><td>${formatTanggalIndo(t.date)}</td><td><span class="badge ${t.source.includes('Bank') ? 'badge-bank' : ''}" style="${!t.source.includes('Bank') ? 'background:#e2e8f0; color:#334155;' : ''}">${t.source || 'Kas Tunai'}</span></td><td><span class="${t.type === 'in' ? 'badge badge-in' : 'badge badge-out'}">${t.code}</span><br><strong>${catName}</strong><br><small>${t.desc || '-'}</small></td><td style="color:#15803d; font-weight:800;">${t.type === 'in' ? formatRp(t.amount) : '-'}</td><td style="color:#b91c1c; font-weight:800;">${t.type === 'out' ? formatRp(t.amount) : '-'}</td><td style="color:var(--nu-gold-dark); font-weight:800;">${formatRp(t.currentBalance)}</td><td style="text-align:center;">${proofHtml}</td><td>${actionBtns}</div></td></tr>`;
        });
        const ind = document.getElementById('page-indicator'); if(ind) ind.innerText = `Halaman ${currentPage} dari ${totalPages}`;
    }

    if(document.getElementById('sum-tunai')) document.getElementById('sum-tunai').innerText = formatRp(saldoTunai); 
    if(document.getElementById('sum-bank')) document.getElementById('sum-bank').innerText = formatRp(saldoBank); 
    if(document.getElementById('sum-masuk')) document.getElementById('sum-masuk').innerText = formatRp(grandIn); 
    if(document.getElementById('sum-keluar')) document.getElementById('sum-keluar').innerText = formatRp(grandOut);
}

// Validasi Form Real-Time
const tAmountObj = document.getElementById('t-amount');
if(tAmountObj) {
    tAmountObj.addEventListener('input', function(e) {
        let val = this.value.replace(/[^0-9]/g, ''); 
        this.value = val ? parseInt(val, 10).toLocaleString('id-ID') : '';
        this.style.borderColor = (parseInt(val) <= 0) ? 'red' : 'var(--nu-gold)';
    });
}

window.updateCategories = function() { 
    const typeObj = document.getElementById('t-type'); if(!typeObj) return;
    const type = typeObj.value, cats = getDynamicCategories();
    document.getElementById('t-category').innerHTML = cats[type].map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`).join(''); 
}

window.cancelEditTrx = function() {
    document.getElementById('form-trx').reset(); document.getElementById('t-edit-id').value = '';
    document.getElementById('t-date').valueAsDate = new Date(); document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-check"></i> Rekam Transaksi';
    document.getElementById('btn-cancel-edit').classList.add('hidden'); window.updateCategories(); showToast("Edit dibatalkan", "info");
}

window.editTrx = function(idFirebase) {
    if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
    const trx = transactions.find(t => t.idFirebase === idFirebase); if(!trx) return;
    document.getElementById('t-edit-id').value = trx.idFirebase; document.getElementById('t-type').value = trx.type; window.updateCategories();
    document.getElementById('t-source').value = trx.source || 'Kas Tunai'; document.getElementById('t-category').value = trx.code;
    document.getElementById('t-date').value = trx.date; document.getElementById('t-amount').value = parseInt(trx.amount).toLocaleString('id-ID');
    document.getElementById('t-desc').value = trx.desc;
    document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Transaksi';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    window.switchTab(null, 'v-dashboard'); window.scrollTo({ top: 400, behavior: 'smooth' }); showToast("Mode Edit Transaksi Aktif", "info");
}

window.hapusTrx = async function(idFirebase) { 
    if(currentUserRole !== 'bendahara') return alert("Akses terbatas!");
    if(confirm('Hapus permanen dari Cloud?')) { 
        try { await window.fs.deleteDoc(getFirestoreDoc("transactions", idFirebase)); showToast("Transaksi dihapus.", "success"); saveLog('HAPUS TRANSAKSI', `Menghapus transaksi ID ${idFirebase}`); } catch (err) { showToast("Gagal menghapus.", "error"); }
    } 
}

const formTrxObj = document.getElementById('form-trx');
if(formTrxObj) {
    formTrxObj.addEventListener('submit', function(e) {
        e.preventDefault(); 
        if(currentUserRole !== 'bendahara') return alert("Akses terbatas!");
        
        const editId = document.getElementById('t-edit-id').value;
        const type = document.getElementById('t-type').value;
        const code = document.getElementById('t-category').value;
        const dateInput = document.getElementById('t-date').value;
        const descInput = document.getElementById('t-desc').value.trim();
        const sourceInput = document.getElementById('t-source').value;
        const amountInput = parseFloat(document.getElementById('t-amount').value.replace(/\./g, ''));

        if (!dateInput || isNaN(amountInput) || amountInput <= 0 || !descInput) return showToast("Data tidak valid!", "error");

        const proofInput = document.getElementById('t-proof').files[0];
        const btnSubmit = document.getElementById('btn-submit-trx');
        btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
        
        const saveProcess = async (proofBase64 = null) => {
            try {
                showToast("Menyimpan ke Cloud...", "info");
                const exactTimestamp = Date.now(); 

                if (editId) {
                    const updateData = { type, source: sourceInput, code, date: dateInput, amount: amountInput, desc: descInput };
                    if(proofBase64) updateData.proof = proofBase64;
                    await window.fs.updateDoc(getFirestoreDoc("transactions", editId), updateData);
                    window.cancelEditTrx(); showToast("Data diperbarui!", "success"); saveLog('EDIT TRANSAKSI', `ID ${editId} diperbarui`);
                } else {
                    const dt = { type, source: sourceInput, code, date: dateInput, amount: amountInput, desc: descInput, proof: proofBase64, timestamp: exactTimestamp };
                    await window.fs.addDoc(getCol("transactions"), dt);
                    document.getElementById('t-amount').value = ''; document.getElementById('t-desc').value = ''; document.getElementById('t-proof').value = '';
                    showToast("Transaksi disimpan!", "success"); saveLog('TAMBAH TRANSAKSI', `Mencatat ${type==='in'?'Masuk':'Keluar'} Rp ${formatRp(amountInput)}`);
                    kirimTelegram(type==='in'?'PEMASUKAN':'PENGELUARAN', amountInput, descInput);
                }
            } catch (err) { showToast("Gagal menyimpan.", "error"); } finally {
                btnSubmit.disabled = false; btnSubmit.innerHTML = editId ? '<i class="fa-solid fa-floppy-disk"></i> Update' : '<i class="fa-solid fa-check"></i> Rekam';
            }
        };
        
        if (proofInput) compressImage(proofInput, (base64) => saveProcess(base64)); else saveProcess();
    });
}

// =====================================================================
// --- 7. RENDER GRAFIK & ANALITIK (CHART.JS) ---
// =====================================================================
function renderCharts() {
    if (typeof Chart === 'undefined') return;
    let monthlyData = {}; let totalInAll = 0, totalOutAll = 0; let categoryOutCount = {};

    transactions.forEach(t => {
        if (!t || !t.date) return;
        const monthKey = t.date.slice(0, 7), amt = Number(t.amount || 0);
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { in: 0, out: 0 };
        if (t.type === 'in' && t.code !== '120' && t.code !== '220') { monthlyData[monthKey].in += amt; totalInAll += amt; } 
        else if (t.type === 'out' && t.code !== '120' && t.code !== '220') { monthlyData[monthKey].out += amt; totalOutAll += amt; categoryOutCount[t.code] = (categoryOutCount[t.code] || 0) + amt; }
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const labelMonths = sortedMonths.map(m => { const [y, mm] = m.split('-'); return new Date(y, mm - 1, 1).toLocaleString('id-ID', { month: 'short', year: 'numeric' }); });
    const dataInValues = sortedMonths.map(m => monthlyData[m].in), dataOutValues = sortedMonths.map(m => monthlyData[m].out);
    const nuGreen = '#005a2b', dangerRed = '#ef4444', colorPalette = ['#0284c7', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

    const ctxTren = document.getElementById('chartTrenBulanan');
    if (ctxTren) {
        if (window.myChartTren) window.myChartTren.destroy();
        window.myChartTren = new Chart(ctxTren.getContext('2d'), { type: 'line', data: { labels: labelMonths.length > 0 ? labelMonths : ['Belum ada data'], datasets: [ { label: 'Pemasukan (Rp)', data: dataInValues.length > 0 ? dataInValues : [0], borderColor: nuGreen, backgroundColor: 'rgba(0, 90, 43, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }, { label: 'Penyaluran (Rp)', data: dataOutValues.length > 0 ? dataOutValues : [0], borderColor: dangerRed, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 3, fill: true, tension: 0.3 } ] }, options: { responsive: true, maintainAspectRatio: false } });
    }

    const ctxArus = document.getElementById('chartArusKas');
    if (ctxArus) {
        if (window.myChartArus) window.myChartArus.destroy();
        window.myChartArus = new Chart(ctxArus.getContext('2d'), { type: 'bar', data: { labels: ['Total Keseluruhan'], datasets: [ { label: 'Total Pemasukan', data: [totalInAll], backgroundColor: nuGreen, borderRadius: 8 }, { label: 'Total Penyaluran', data: [totalOutAll], backgroundColor: dangerRed, borderRadius: 8 } ] }, options: { responsive: true, maintainAspectRatio: false } });
    }

    const ctxPenyaluran = document.getElementById('chartPenyaluran');
    if (ctxPenyaluran) {
        if (window.myChartPenyaluran) window.myChartPenyaluran.destroy();
        const cats = getDynamicCategories(); let catLabels = [], catValues = [];
        for (const [code, val] of Object.entries(categoryOutCount)) { const foundCat = cats.out.find(c => c.code === code); catLabels.push(foundCat ? foundCat.name : `Akun ${code}`); catValues.push(val); }
        window.myChartPenyaluran = new Chart(ctxPenyaluran.getContext('2d'), { type: 'doughnut', data: { labels: catLabels.length > 0 ? catLabels : ['Belum ada penyaluran'], datasets: [{ data: catValues.length > 0 ? catValues : [1], backgroundColor: catValues.length > 0 ? colorPalette : ['#e2e8f0'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
}

// =====================================================================
// --- 8. PEMBUATAN LAPORAN PDF & POSTER ---
// =====================================================================
window.clearFilters = function() { ['search-keyword','filter-start-date','filter-end-date','filter-type'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; }); refreshUI(); showToast("Filter pencarian direset.", "info"); }
window.bukaKalkulatorAmil = function() {
    let totalInfaqZakat = 0; const currentMonth = new Date().toISOString().slice(0, 7);
    transactions.forEach(t => { if(t.type === 'in' && t.code !== '120' && t.code !== '220' && t.code !== '101' && t.date.slice(0, 7) === currentMonth) totalInfaqZakat += Number(t.amount || 0); });
    document.getElementById('amil-total').innerText = formatRp(totalInfaqZakat); document.getElementById('amil-hak').innerText = formatRp(totalInfaqZakat * 0.125);
    document.getElementById('modal-amil').classList.remove('hidden');
}

function buildReport() {
    let filterStr = document.getElementById('filter-month')?.value;
    if(!filterStr) { filterStr = new Date().toISOString().slice(0, 7); if(document.getElementById('filter-month')) document.getElementById('filter-month').value = filterStr; }
    
    const yearVal = filterStr.split('-')[0], monthVal = parseInt(filterStr.split('-')[1], 10) - 1;
    if(document.getElementById('lap-periode')) document.getElementById('lap-periode').innerText = `Bulan Pelaporan: ${new Date(yearVal, monthVal, 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`;
    if(document.getElementById('lap-tanggal-cetak')) document.getElementById('lap-tanggal-cetak').innerText = `Karangdowo, ${formatTanggalIndo(new Date().toISOString().slice(0, 10))}`;
    
    const cats = getDynamicCategories(); let sums = { in: {}, out: {} }, fMasuk = 0, fKeluar = 0, saldoAwalBulan = 0, saldoTunai = 0, saldoBank = 0;
    
    transactions.forEach(t => { 
        if(t && t.date) {
            const monthTrx = t.date.slice(0, 7), amt = Number(t.amount || 0);
            if(monthTrx < filterStr) { if(t.type === 'in' && t.code !== '120' && t.code !== '220') saldoAwalBulan += amt; if(t.type === 'out' && t.code !== '120' && t.code !== '220') saldoAwalBulan -= amt; }
            if(monthTrx <= filterStr) { if(t.type === 'in') { if(t.code === '120') { saldoTunai += amt; saldoBank -= amt; } else if(t.code === '220') { saldoBank += amt; saldoTunai -= amt; } else { t.source.includes('Bank') ? saldoBank += amt : saldoTunai += amt; } } if(t.type === 'out') { t.source.includes('Bank') ? saldoBank -= amt : saldoTunai -= amt; } }
            if(monthTrx === filterStr) { if(t.type === 'in') { sums.in[t.code] = (sums.in[t.code] || 0) + amt; if(t.code !== '120' && t.code !== '220') fMasuk += amt; } if(t.type === 'out') { sums.out[t.code] = (sums.out[t.code] || 0) + amt; if(t.code !== '120' && t.code !== '220') fKeluar += amt; } }
        }
    });

    const barisMasuk = cats.in.filter(c => c.code !== '120' && c.code !== '220' && (sums.in[c.code] > 0)).map(c => `<tr><td style="text-align:center;">${c.code}</td><td>${c.name}</td><td style="text-align:right;">${formatRp(sums.in[c.code])}</td></tr>`).join('');
    const barisKeluar = cats.out.filter(c => sums.out[c.code] > 0).map(c => `<tr><td style="text-align:center;">${c.code}</td><td>${c.name}</td><td style="text-align:right;">${formatRp(sums.out[c.code])}</td></tr>`).join('');

    if(document.getElementById('lap-tbl-masuk')) document.getElementById('lap-tbl-masuk').innerHTML = barisMasuk || `<tr><td colspan="3" style="text-align:center;">Tidak ada penerimaan</td></tr>`;
    if(document.getElementById('lap-tbl-keluar')) document.getElementById('lap-tbl-keluar').innerHTML = barisKeluar || `<tr><td colspan="3" style="text-align:center;">Tidak ada penyaluran</td></tr>`;
    
    if(document.getElementById('lap-saldo-awal')) document.getElementById('lap-saldo-awal').innerText = formatRp(saldoAwalBulan);
    if(document.getElementById('lap-tot-masuk')) document.getElementById('lap-tot-masuk').innerText = formatRp(fMasuk); 
    if(document.getElementById('lap-tot-keluar')) document.getElementById('lap-tot-keluar').innerText = `(${formatRp(fKeluar)})`; 
    if(document.getElementById('lap-saldo-tunai')) document.getElementById('lap-saldo-tunai').innerText = formatRp(saldoTunai); 
    if(document.getElementById('lap-saldo-bank')) document.getElementById('lap-saldo-bank').innerText = formatRp(saldoBank); 
    if(document.getElementById('lap-saldo-akhir')) document.getElementById('lap-saldo-akhir').innerText = formatRp(saldoTunai + saldoBank);
}

window.cetakPDF = function() {
    buildReport(); const element = document.getElementById('print-area'), panelLaporan = document.getElementById('v-laporan'); if(!panelLaporan) return;
    const wasHidden = panelLaporan.classList.contains('hidden'); if (wasHidden) panelLaporan.classList.remove('hidden');
    const opt = { margin: 8, filename: `Laporan_${document.getElementById('filter-month').value}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } };
    showToast("Memproses PDF Laporan...", "info");
    setTimeout(() => { html2pdf().set(opt).from(element).save().then(() => { if (wasHidden) panelLaporan.classList.add('hidden'); showToast("Berhasil diunduh!", "success"); }); }, 150);
}

window.cetakBukuBesarPDF = function() {
    const element = document.getElementById('buku-besar-area'), wrapper = document.getElementById('hidden-buku-besar-print');
    const tbody = document.getElementById('table-body');
    document.getElementById('bb-table-rows').innerHTML = tbody.innerHTML; // Menyalin isi tabel yang terfilter
    document.getElementById('bb-lap-periode').innerText = `Dicetak pada: ${formatTanggalIndo(new Date().toISOString().slice(0, 10))}`;
    wrapper.classList.remove('hidden');
    const opt = { margin: 10, filename: `BukuBesar_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } };
    showToast("Menyiapkan PDF Buku Besar...", "info");
    html2pdf().set(opt).from(element).save().then(() => { wrapper.classList.add('hidden'); showToast("Berhasil diunduh!", "success"); });
}

function buildPoster() {
    const start = document.getElementById('poster-start').value, end = document.getElementById('poster-end').value;
    let tIn = 0, perRelawan = {};
    if(profileSettings.relawan) { profileSettings.relawan.forEach((rel, idx) => { perRelawan[String(111 + idx)] = { name: rel, amount: 0 }; }); }
    perRelawan['other'] = { name: 'Donasi Lainnya', amount: 0 };

    transactions.forEach(t => {
        let match = true; if(start && t.date < start) match = false; if(end && t.date > end) match = false;
        if(match && t.type === 'in' && t.code !== '101' && t.code !== '120' && t.code !== '220') { const amt = Number(t.amount || 0); tIn += amt; if(perRelawan[t.code]) { perRelawan[t.code].amount += amt; } else { perRelawan['other'].amount += amt; } }
    });

    if(document.getElementById('poster-in')) document.getElementById('poster-in').innerText = formatRp(tIn); 
    if(document.getElementById('poster-periode-text')) document.getElementById('poster-periode-text').innerText = (start && end) ? `Periode: ${formatTanggalIndo(start)} s/d ${formatTanggalIndo(end)}` : "Seluruh Periode";
    
    let breakdownHtml = '', chartLabels = [], chartData = [], chartColors = ['#d4af37', '#0284c7', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];
    Object.keys(perRelawan).forEach((key) => {
        if(perRelawan[key].amount > 0) { breakdownHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed rgba(255,255,255,0.15); padding-bottom:6px;"><span style="color:white;">${perRelawan[key].name}</span><span style="font-weight:800; color:var(--nu-gold-light);">${formatRp(perRelawan[key].amount)}</span></div>`; chartLabels.push(perRelawan[key].name); chartData.push(perRelawan[key].amount); }
    });
    
    if(document.getElementById('poster-breakdown')) document.getElementById('poster-breakdown').innerHTML = breakdownHtml || '<div style="color:white;">Belum ada data.</div>';
    
    if (typeof Chart !== 'undefined' && document.getElementById('posterChart')) {
        if(window.posterChartInstance) window.posterChartInstance.destroy(); 
        window.posterChartInstance = new Chart(document.getElementById('posterChart').getContext('2d'), { type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartData.length > 0 ? chartData : [1], backgroundColor: chartData.length > 0 ? chartColors : ['#e2e8f0'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } } }); 
    }
}
window.resetPosterFilter = function() { document.getElementById('poster-start').value = ''; document.getElementById('poster-end').value = ''; buildPoster(); showToast("Filter direset.", "info"); }
window.cetakPosterPDF = function() { buildPoster(); const element = document.getElementById('poster-print-area'); html2pdf().set({ margin: 5, filename: `Poster_${Date.now()}.pdf`, html2canvas: { scale: 3, useCORS: true }, jsPDF: { format: 'a4', orientation: 'portrait' } }).from(element).save(); }

// =====================================================================
// --- 9. STUDIO KONTEN & VIDEO SOSIALISASI ---
// =====================================================================
function renderKontenHarian() {
    const container = document.getElementById('konten-harian-container'); if(!container) return;
    container.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:25px;">
        <div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color);">
            <h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-pen-to-square"></i> Konfigurasi Pesan</h4>
            <div class="form-group"><label>Pilih Tema</label><select id="kategori-kampanye" onchange="updateKampanyePreview()"><option value="sedekah">Keutamaan Sedekah</option><option value="zakat">Kewajiban Zakat</option><option value="motivasi">Motivasi</option></select></div>
            <div class="form-group"><label>Pratinjau Teks (Bisa diedit)</label><textarea id="teks-kampanye" rows="5"></textarea></div>
            <div style="display:flex; gap:10px;"><button onclick="salinTeksKampanye()" class="btn btn-outline" style="flex:1;">Salin</button><a id="btn-wa-kampanye" href="#" target="_blank" class="btn btn-primary" style="flex:2; background:#25d366; color:white; border:none;">Bagikan WA</a></div>
        </div>
        <div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color); text-align:center;">
            <h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-film"></i> Pratinjau Video AI</h4>
            <canvas id="video-canvas" width="800" height="800" style="width:100%; max-width:280px; border-radius:12px; background:#012a14; margin-bottom:20px;"></canvas>
            <button id="btn-download-video" onclick="downloadCanvasAsVideo()" class="btn btn-primary" style="width:100%;">Unduh Video MP4</button>
        </div>
    </div>`;
    window.updateKampanyePreview();
}

window.updateKampanyePreview = function() {
    const dbKonten = {
        'sedekah': { judul: "Pahala Berlipat", teks: "Perumpamaan orang yang menginfakkan hartanya di jalan Allah seperti sebutir biji yang menumbuhkan tujuh tangkai... (Al-Baqarah: 261)" },
        'zakat': { judul: "Pembersih Harta", teks: "Ambillah zakat dari sebagian harta mereka, dengan zakat itu kamu membersihkan dan menyucikan mereka... (At-Taubah: 103)" },
        'motivasi': { judul: "Tolak Bala", teks: "Bersegeralah bersedekah, sebab bala bencana tidak pernah bisa mendahului sedekah. (HR. Thabrani)" }
    };
    const kat = document.getElementById('kategori-kampanye').value; const data = dbKonten[kat]; window.activeKontenText = data; 
    const textLengkap = `*${data.judul}*\n\n"${data.teks}"\n\nMari sucikan harta melalui UPZIS Ranting ${asalRanting ? asalRanting.toUpperCase() : 'KITA'}.\n\n_Sistem Bendahara Terpadu_`;
    document.getElementById('teks-kampanye').value = textLengkap; document.getElementById('btn-wa-kampanye').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(textLengkap)}`;
    startVideoAnimation();
}

window.salinTeksKampanye = function() { navigator.clipboard.writeText(document.getElementById('teks-kampanye').value).then(() => { showToast("Teks disalin!", "success"); }); }

function startVideoAnimation() {
    const canvas = document.getElementById('video-canvas'); if(!canvas) return; 
    const ctx = canvas.getContext('2d'); let frame = 0; const logoImg = new Image(); logoImg.src = 'icon-192.png';
    function draw() {
        frame++; const grad = ctx.createLinearGradient(0, 0, 800, 800); grad.addColorStop(0, '#012a14'); grad.addColorStop(1, '#005a2b'); ctx.fillStyle = grad; ctx.fillRect(0,0,800,800); ctx.fillStyle = 'rgba(212, 175, 55, 0.3)';
        for(let i=0; i<30; i++) { const x = (Math.sin(frame*0.01 + i*10) * 400) + 400, y = (Math.cos(frame*0.015 + i*10) * 400) + 400; ctx.beginPath(); ctx.arc(x, y, 3 + Math.sin(frame*0.05+i), 0, Math.PI*2); ctx.fill(); }
        if(logoImg.complete && logoImg.width) ctx.drawImage(logoImg, 50, 50, 100, 100);
        ctx.fillStyle = '#d4af37'; ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left'; ctx.fillText("LAZISNU", 170, 90); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif'; ctx.fillText("RANTING " + (asalRanting ? asalRanting.toUpperCase() : ""), 170, 130);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.beginPath(); ctx.roundRect(50, 220, 700, 420, 20); ctx.fill(); ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)'; ctx.lineWidth = 2; ctx.stroke();
        if(window.activeKontenText) { ctx.textAlign = 'center'; ctx.fillStyle = '#d4af37'; ctx.font = 'bold 36px "Cinzel", serif'; wrapText(ctx, window.activeKontenText.judul, 400, 300 + Math.sin(frame*0.05)*5, 640, 45); ctx.fillStyle = '#e2e8f0'; ctx.font = 'italic 26px "Plus Jakarta Sans", sans-serif'; wrapText(ctx, `"${window.activeKontenText.teks}"`, 400, 450, 600, 38); }
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif'; ctx.fillText("Mari Salurkan Infaq & Sedekah Anda", 400, 720); window.animationFrameId = requestAnimationFrame(draw);
    }
    if(window.animationFrameId) cancelAnimationFrame(window.animationFrameId); draw();
}

window.downloadCanvasAsVideo = function() {
    const canvas = document.getElementById('video-canvas'); if(!canvas) return; let mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm; codecs=vp9'; const stream = canvas.captureStream(30), mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType }), chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => { const blob = new Blob(chunks, { type: mimeType }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `Kampanye_${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); showToast("Video dirender!", "success"); document.getElementById('btn-download-video').disabled = false; };
    mediaRecorder.start(); showToast("Merender Video... (Tunggu 6 detik)", "info"); document.getElementById('btn-download-video').disabled = true; setTimeout(() => { mediaRecorder.stop(); }, 6000);
}

// =====================================================================
// --- 10. MUSTAHIK, PENGURUS, LOGS & CLOUD DATA ---
// =====================================================================
const formMustahik = document.getElementById('form-mustahik');
if(formMustahik) {
    formMustahik.addEventListener('submit', async (e) => {
        e.preventDefault(); if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
        const m = { nama: document.getElementById('m-nama').value, nik: document.getElementById('m-nik').value || '-', kategori: document.getElementById('m-kategori').value, hp: document.getElementById('m-hp').value || '-', alamat: document.getElementById('m-alamat').value || '-' };
        try { showToast("Menyimpan ke Cloud...", "info"); await window.fs.addDoc(getCol("mustahik"), m); e.target.reset(); showToast("Data Warga disimpan.", "success"); } catch (err) { showToast("Gagal menyimpan.", "error"); }
    });
}
window.hapusMustahik = async function(id) { if(currentUserRole === 'bendahara' && confirm('Hapus warga?')) { await window.fs.deleteDoc(getFirestoreDoc("mustahik", id)); showToast("Dihapus.", "success"); } }
function renderMustahik() { const tbody = document.getElementById('table-mustahik'); if(!tbody) return; tbody.innerHTML = dbMustahik.map(m => `<tr><td><strong>${m.nama}</strong><br><small>NIK: ${m.nik}</small></td><td><span class="badge" style="background:#f1f5f9; color:#334155;">${m.kategori}</span></td><td><button class="btn-action admin-only" onclick="hapusMustahik('${m.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button></td></tr>`).join(''); }

window.simpanProfil = async function() { if(currentUserRole !== 'bendahara') return; profileSettings.lembaga = document.getElementById(`p-lembaga`).value; profileSettings.periode = document.getElementById(`p-periode`).value; await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); showToast("Identitas disimpan.", "success"); }
window.tambahAnggota = async function() { const nama = document.getElementById('input-anggota-nama').value.trim(), jabatan = document.getElementById('input-anggota-jabatan').value.trim() || 'Relawan'; if(nama) { profileSettings.anggota.push({ id: Date.now(), nama: nama, jabatan: jabatan }); await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); document.getElementById('input-anggota-nama').value = ''; showToast("Anggota ditambahkan.", "success"); } }
window.hapusAnggota = async function(id) { if(confirm("Hapus anggota ini?")) { profileSettings.anggota = profileSettings.anggota.filter(a => a.id !== id); await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); } }
function renderAnggota() { document.getElementById('list-anggota').innerHTML = profileSettings.anggota.map((a) => `<div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; margin-bottom:5px;"><div><div style="font-size:10px; color:var(--nu-gold-dark);">${a.jabatan}</div><div style="font-weight:800;">${a.nama}</div></div><button class="btn-action" onclick="hapusAnggota(${a.id})"><i class="fa-solid fa-xmark"></i></button></div>`).join(''); renderBagan(); }
function renderBagan() { const list = profileSettings.anggota || [], pimpinan = list.filter(a => (a.jabatan || '').toLowerCase().includes('ketua')), bendahara = list.filter(a => (a.jabatan || '').toLowerCase().includes('bendahara')), relawan = list.filter(a => !(a.jabatan || '').toLowerCase().includes('ketua') && !(a.jabatan || '').toLowerCase().includes('bendahara')); const makeCard = (a) => `<div style="background:var(--glass-gradient); border:2px solid var(--nu-gold); padding:10px; border-radius:10px; text-align:center; min-width:120px; margin:5px;"><div style="font-size:10px;">${a.jabatan}</div><div style="font-size:12px; font-weight:bold;">${a.nama}</div></div>`; let html = ''; if(pimpinan.length > 0) html += `<div style="display:flex; justify-content:center;">${pimpinan.map(makeCard).join('')}</div>`; if(bendahara.length > 0) html += `<div style="display:flex; justify-content:center;">${bendahara.map(makeCard).join('')}</div>`; if(relawan.length > 0) html += `<div style="display:flex; justify-content:center; flex-wrap:wrap;">${relawan.map(makeCard).join('')}</div>`; document.getElementById('org-chart-container').innerHTML = html; }

function renderLogs() { const tbody = document.getElementById('table-logs'); if(!tbody) return; tbody.innerHTML = logsData.sort((a,b) => new Date(b.time) - new Date(a.time)).map(l => `<tr><td>${formatTanggalIndo((l.time||'').slice(0,10))}</td><td><span class="badge" style="background:#e2e8f0; color:#334155;">${(l.user||'Sistem').toUpperCase()}</span></td><td><strong>${l.action||'Info'}</strong></td><td><small>${l.detail||'-'}</small></td></tr>`).join(''); }
async function saveLog(action, detail) { try { await window.fs.addDoc(getCol("logs"), { time: new Date().toISOString(), user: currentUserRole, action: action, detail: detail }); } catch(e) {} }

// =====================================================================
// --- 11. EXCEL, JSON BACKUP & PRINTER THERMAL ---
// =====================================================================
window.exportExcelBukuBesar = function() {
    if(typeof XLSX==='undefined') return; const wb = XLSX.utils.book_new();
    const rows = transactions.map((t,i) => ({"Tanggal":t.date, "Akun":t.code, "Sumber":t.source, "Debit":t.type==='in'?t.amount:0, "Kredit":t.type==='out'?t.amount:0, "Ket":t.desc}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Buku_Besar"); XLSX.writeFile(wb, `Buku_Besar_${Date.now()}.xlsx`); showToast("Excel Diunduh", "success");
}

window.downloadJSONBackup = function() {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({profile: profileSettings, transactions, mustahik: dbMustahik}));
    const a = document.createElement('a'); a.href = data; a.download = `Backup_${Date.now()}.json`; a.click(); showToast("JSON Diunduh", "success");
}

window.restoreJSONBackup = function(e) {
    const r = new FileReader(); r.onload = async ev => {
        try { const res = JSON.parse(ev.target.result); for(let t of res.transactions){ delete t.idFirebase; await window.fs.addDoc(getCol("transactions"), t); } showToast("Restore Sukses", "success"); } catch(err){}
    }; r.readAsText(e.target.files[0]);
}

window.cetakStrukBluetooth = async function() {
    if(!navigator.bluetooth) return showToast("Browser tidak mendukung Web Bluetooth", "error");
    try {
        showToast("Mencari Printer Thermal...", "info");
        const device = await navigator.bluetooth.requestDevice({ filters: [{services: ['000018f0-0000-1000-8000-00805f9b34fb']}], optionalServices: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] });
        await device.gatt.connect(); showToast("Terhubung & Mencetak Struk...", "success");
    } catch(err) { showToast("Batal koneksi printer.", "error"); }
}

window.openKuitansi = function(id) { const t = transactions.find(x => x.idFirebase === id); document.getElementById('kui-nominal').innerText = formatRp(t.amount); document.getElementById('modal-kuitansi').classList.remove('hidden'); }
window.closeKuitansi = function() { document.getElementById('modal-kuitansi').classList.add('hidden'); }
window.cetakKuitansiPDF = function() { html2pdf().set({ margin: 10, filename: `Kuitansi_${Date.now()}.pdf`, jsPDF: { format: 'a5', orientation: 'landscape' } }).from(document.getElementById('kuitansi-print-area')).save(); }
window.kirimKuitansiWA = function() { window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`*KUITANSI UPZIS*\n\nTerima kasih atas partisipasi Anda.\nNominal: ${document.getElementById('kui-nominal').innerText}`)}`, '_blank'); }

window.eksekusiTutupBuku = async function() {
    if(currentUserRole !== 'bendahara') return; const nextYear = new Date().getFullYear();
    if (prompt(`Ketik sandi Anda untuk Tutup Buku:`) === profileSettings.password) {
        showToast("Mengarsipkan...", "info");
        let sTunai = 0, sBank = 0; transactions.forEach(t => { const a=Number(t.amount); if(t.type==='in'){t.source.includes('Bank')?sBank+=a:sTunai+=a;}else{t.source.includes('Bank')?sBank-=a:sTunai-=a;} });
        const batch = []; const snap = await window.fs.getDocs(getCol("transactions"));
        snap.forEach(d => { window.fs.setDoc(getFirestoreDoc(`arsip_${profileSettings.activeYear}_transactions`, d.id), d.data()); window.fs.deleteDoc(getFirestoreDoc("transactions", d.id)); });
        profileSettings.activeYear = nextYear; window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings);
        if(sTunai>0) window.fs.addDoc(getCol("transactions"), { type: 'in', source: 'Kas Tunai', code: '101', date: `${nextYear}-01-01`, amount: sTunai, desc: `Saldo Awal Tahun`, timestamp: Date.now() });
        showToast("Tutup Buku Selesai!", "success");
    } else showToast("Sandi salah.", "error");
}

window.loadArsip = async function() {
    const year = document.getElementById('input-arsip-year').value; if(!year) return; showToast(`Mencari arsip ${year}...`, "info");
    try { const snap = await window.fs.getDocs(window.fs.query(getCol(`arsip_${year}_transactions`), window.fs.orderBy("date", "asc"))); let html = ''; snap.forEach(d => { const t = d.data(); html += `<tr><td>${t.date}</td><td>${t.source}</td><td>${t.desc}</td><td>${t.type==='in'?formatRp(t.amount):'-'}</td><td>${t.type==='out'?formatRp(t.amount):'-'}</td></tr>`; }); document.getElementById('table-arsip-body').innerHTML = html || '<tr><td colspan="5">Tidak ada arsip</td></tr>'; showToast("Arsip dimuat.", "success"); } catch(e) { showToast("Gagal memuat arsip.", "error"); }
}

function checkYearEnd() { const y = new Date().getFullYear(); if(!profileSettings.activeYear) { profileSettings.activeYear = y; window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); } if(y > profileSettings.activeYear) { document.getElementById('year-end-warning')?.classList.remove('hidden'); document.getElementById('nav-tutup-buku')?.classList.add('blink-warning'); } }

window.loadAllCloudData = async function() {
    window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (snap) => { if(snap.exists()) { profileSettings = {...profileSettings, ...snap.data()}; document.getElementById('tg-token').value = profileSettings.teleBotToken||''; document.getElementById('tg-chatid').value = profileSettings.teleChatId||''; document.getElementById('p-lembaga').value = profileSettings.lembaga; document.getElementById('p-periode').value = profileSettings.periode; renderAnggota(); }});
    window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snap) => { transactions=[]; snap.forEach(d => transactions.push({idFirebase:d.id, ...d.data()})); refreshUI(); const p1=document.getElementById('v-laporan'), p2=document.getElementById('v-poster'), p3=document.getElementById('v-analitik'); if(p1&&!p1.classList.contains('hidden'))buildReport(); if(p2&&!p2.classList.contains('hidden'))buildPoster(); if(p3&&!p3.classList.contains('hidden'))renderCharts(); });
    window.fs.onSnapshot(getCol("mustahik"), (snap) => { dbMustahik=[]; snap.forEach(d => dbMustahik.push({idFirebase:d.id, ...d.data()})); renderMustahik(); });
    window.fs.onSnapshot(window.fs.query(getCol("logs"), window.fs.orderBy("time", "asc")), (snap) => { logsData=[]; snap.forEach(d => logsData.push(d.data())); renderLogs(); });
}

// =====================================================================
// --- 12. MENJALANKAN APLIKASI SAAT DOM SIAP ---
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
    window.initThemeMode();
    window.updateCategories();
    
    // PEMANTAU LOGIN: MEMASTIKAN VARIABEL USER VALID
    window.authServices.onAuthStateChanged(window.auth, async user => {
        if(user) {
            try { 
                let d = await window.fs.getDoc(window.fs.doc(window.db, "users", user.uid)); 
                if(d.exists()){ asalRanting = d.data().ranting||""; currentUserRole = d.data().role||"bendahara"; } 
            } catch(e){}
            document.getElementById('auth-screen').classList.add('hidden'); 
            document.getElementById('app-screen').classList.remove('hidden');
            window.loadAllCloudData(); applyRBAC(); checkYearEnd();
        }
    });
    
    document.getElementById('form-login').addEventListener('submit', async e => {
        e.preventDefault(); 
        const email = document.getElementById('l-user').value.trim();
        const pass = document.getElementById('l-pass').value;
        const rantingName = document.getElementById('l-ranting') ? document.getElementById('l-ranting').value.trim() : "";
        const remember = document.getElementById('remember-me') ? document.getElementById('remember-me').checked : false;
        const btnSubmit = document.getElementById('btn-auth-submit');
        
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
        try { 
            const persistenceType = remember ? window.authServices.browserLocalPersistence : window.authServices.browserSessionPersistence;
            await window.authServices.setPersistence(window.auth, persistenceType);

            if (isRegisterMode) {
                const userCredential = await window.authServices.createUserWithEmailAndPassword(window.auth, email, pass);
                await window.fs.setDoc(window.fs.doc(window.db, "users", userCredential.user.uid), { email: email, ranting: rantingName, role: 'bendahara' });
                showToast("Pendaftaran Berhasil!", "success");
            } else {
                await window.authServices.signInWithEmailAndPassword(window.auth, email, pass); 
            }
        } catch(err){ 
            showToast("Sandi Salah / Periksa Koneksi", "error"); 
        } finally {
            btnSubmit.innerHTML = isRegisterMode ? '<i class="fa-solid fa-user-plus"></i> Daftar Baru' : '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem';
        }
    });
});
