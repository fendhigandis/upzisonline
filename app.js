// =====================================================================
// --- 1. INISIALISASI FIREBASE (MODULAR SDK) & MODE OFFLINE ---
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, enableIndexedDbPersistence, collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc, query, orderBy, onSnapshot 
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

// Menghidupkan Mode Offline dengan Silent Catch (Tanpa Warning Kuning di Console)
enableIndexedDbPersistence(db).catch((err) => {
    console.log('[Sistem] Berjalan di mode memory cache karena limitasi browser/tab.');
});

const auth = getAuth(app);

window.db = db;
window.auth = auth;
window.authServices = { 
    signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail,
    setPersistence, browserLocalPersistence, browserSessionPersistence
};
window.fs = { collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc, updateDoc, query, orderBy, onSnapshot };

// =====================================================================
// --- 2. VARIABEL GLOBAL & STATE ---
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

// Variabel Pembersih Memori Latar Belakang (Unsubscribe Listeners)
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
    logoBase64: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Nahdlatul_Ulama_Logo.svg',
    activeYear: new Date().getFullYear()
};

// =====================================================================
// --- 3. FUNGSI UTILITAS & BANTUAN ---
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

function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('realtime-clock');
    if(clockEl) {
        clockEl.innerHTML = `<span>${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span> | <span style="color:var(--nu-gold);">${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>`;
    }
    const yearEl = document.getElementById('copyright-year');
    if(yearEl) yearEl.innerText = now.getFullYear();
}
setInterval(updateClock, 1000); updateClock();

function getCol(colName) {
    return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.collection(window.db, colName) : window.fs.collection(window.db, "ranting", asalRanting.toLowerCase(), colName);
}

// PERBAIKAN: Penamaan fungsi khusus agar tidak bentrok dengan keyword getDoc Firebase
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

// =====================================================================
// --- 4. AUTHENTICATION & LOGIN ---
// =====================================================================
function togglePasswordVisibility() {
    const passInput = document.getElementById('l-pass'), eyeIcon = document.getElementById('eye-icon');
    if(passInput.type === 'password') { passInput.type = 'text'; eyeIcon.className = 'fa-solid fa-eye-slash'; } 
    else { passInput.type = 'password'; eyeIcon.className = 'fa-solid fa-eye'; }
}

function toggleModeAuth(e) {
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

async function recoverPasswordEmail() {
    let email = document.getElementById('l-user').value.trim();
    if(!email) { email = prompt("MASUKKAN EMAIL PEMULIHAN:\nSilakan ketik alamat email Anda yang terdaftar pada sistem."); if(!email) return; }
    try { showToast("Memproses...", "info"); await window.authServices.sendPasswordResetEmail(window.auth, email); showToast("BERHASIL! Link dikirim ke " + email, "success");
    } catch(e) { showToast("Gagal memulihkan sandi. Pastikan email terdaftar.", "error"); }
}

async function logout() {
    try {
        if (unsubProfile) unsubProfile();
        if (unsubTrx) unsubTrx();
        if (unsubMustahik) unsubMustahik();
        if (unsubLogs) unsubLogs();

        await window.authServices.signOut(window.auth); 
        sessionStorage.removeItem('upzis_role');
        
        transactions = []; dbMustahik = []; logsData = [];
        profileSettings = { lembaga: '', periode: '', ketua: '', bendahara: '', username: 'bendahara', password: 'admin', relawan: [], anggota: [], logoBase64: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Nahdlatul_Ulama_Logo.svg', activeYear: new Date().getFullYear() };
        asalRanting = ""; 
        if(warningInterval) clearInterval(warningInterval);
        
        document.getElementById('app-screen').classList.add('hidden'); 
        document.getElementById('auth-screen').classList.remove('hidden');
        showToast("Berhasil keluar dengan bersih.", "info");
    } catch (err) { 
        showToast("Gagal logout.", "error"); 
    }
}

// =====================================================================
// --- 5. LOGIKA UI & DASHBOARD ---
// =====================================================================
function toggleSidebar() {
    document.getElementById('app-sidebar').classList.toggle('mobile-open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function switchTab(evt, tabId) {
    document.querySelectorAll('.panel').forEach(el => el.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); 
    document.getElementById(tabId).classList.remove('hidden'); 
    if(evt && evt.currentTarget) evt.currentTarget.classList.add('active'); 
    
    if(window.innerWidth <= 1024) { 
        document.getElementById('app-sidebar').classList.remove('mobile-open'); 
        document.getElementById('sidebar-overlay').classList.remove('active'); 
    }
    
    // PEMICU RENDER OTOMATIS
    if(tabId === 'v-laporan') buildReport(); 
    if(tabId === 'v-poster') buildPoster();
    if(tabId === 'v-analitik') renderCharts(); 
    if(tabId === 'v-pengurus') renderBagan(); 
    if(tabId === 'v-konten') renderKontenHarian();
}

function updateFirebaseIndicator(isOnline) {
    const led = document.getElementById('firebase-led'), badge = document.getElementById('sync-badge');
    if (led && badge) {
        if (isOnline) { led.className = 'led-light led-green'; badge.innerText = 'ONLINE'; badge.style.background = 'rgba(74, 222, 128, 0.15)'; badge.style.color = '#4ade80'; } 
        else { led.className = 'led-light led-red'; badge.innerText = 'OFFLINE'; badge.style.background = 'rgba(239, 68, 68, 0.15)'; badge.style.color = '#ef4444'; }
    }
}
window.addEventListener('online', () => updateFirebaseIndicator(true));
window.addEventListener('offline', () => updateFirebaseIndicator(false));

function updateStorageIndicator() {
    const totalBytes = new Blob([JSON.stringify(transactions) + JSON.stringify(dbMustahik) + JSON.stringify(profileSettings) + JSON.stringify(logsData)]).size;
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
    const storageText = document.getElementById('storage-info-text');
    const storageFill = document.getElementById('storage-bar-fill');
    if(storageText && storageFill) {
        storageText.innerText = `Storage: ${totalMb} MB / 1 GB`;
        storageFill.style.width = `${Math.max((totalMb / 1024) * 100, 0.5)}%`;
    }
}

function showApp() {
    document.getElementById('auth-screen').classList.add('hidden'); 
    document.getElementById('app-screen').classList.remove('hidden'); 
    document.getElementById('badge-role-text').innerText = currentUserRole === 'bendahara' ? 'Bendahara (Penuh)' : 'Ketua / Pengawas';
    
    refreshUI(); renderMustahik(); renderLogs(); buildReport(); buildPoster(); renderKontenHarian(); updateStorageIndicator(); checkYearEnd();
    switchTab(null, 'v-dashboard');
}

// =====================================================================
// --- 6. SINKRONISASI LAPORAN & REFRESH UI ---
// =====================================================================
function buildReport() {
    let filterStr = document.getElementById('filter-month')?.value;
    if(!filterStr) { filterStr = new Date().toISOString().slice(0, 7); if(document.getElementById('filter-month')) document.getElementById('filter-month').value = filterStr; }
    
    const yearVal = filterStr.split('-')[0], monthVal = parseInt(filterStr.split('-')[1], 10) - 1;
    const lapPeriode = document.getElementById('lap-periode');
    const lapTglCetak = document.getElementById('lap-tanggal-cetak');
    
    if(lapPeriode) lapPeriode.innerText = `Bulan Pelaporan: ${new Date(yearVal, monthVal, 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`;
    if(lapTglCetak) lapTglCetak.innerText = `Karangdowo, ${formatTanggalIndo(new Date().toISOString().slice(0, 10))}`;
    
    const cats = getDynamicCategories();
    let sums = { in: {}, out: {} }, fMasuk = 0, fKeluar = 0, saldoAwalBulan = 0, saldoTunai = 0, saldoBank = 0;
    
    transactions.forEach(t => { 
        if(t && t.date) {
            const monthTrx = t.date.slice(0, 7), amt = Number(t.amount || 0);
            
            if(monthTrx < filterStr) {
                if(t.type === 'in' && t.code !== '120' && t.code !== '220') saldoAwalBulan += amt;
                if(t.type === 'out' && t.code !== '120' && t.code !== '220') saldoAwalBulan -= amt;
            }
            if(monthTrx <= filterStr) { 
                if(t.type === 'in') { 
                    if(t.code === '120') { saldoTunai += amt; saldoBank -= amt; }
                    else if(t.code === '220') { saldoBank += amt; saldoTunai -= amt; }
                    else { t.source.includes('Bank') ? saldoBank += amt : saldoTunai += amt; } 
                } 
                if(t.type === 'out') { t.source.includes('Bank') ? saldoBank -= amt : saldoTunai -= amt; } 
            }
            if(monthTrx === filterStr) {
                if(t.type === 'in') { 
                    sums.in[t.code] = (sums.in[t.code] || 0) + amt;
                    if(t.code !== '120' && t.code !== '220') fMasuk += amt; 
                } 
                if(t.type === 'out') { 
                    sums.out[t.code] = (sums.out[t.code] || 0) + amt;
                    if(t.code !== '120' && t.code !== '220') fKeluar += amt; 
                } 
            }
        }
    });

    const barisMasuk = cats.in.filter(c => c.code !== '120' && c.code !== '220' && (sums.in[c.code] > 0)).map(c => `<tr><td style="text-align:center;">${c.code}</td><td>${c.name}</td><td style="text-align:right;">${formatRp(sums.in[c.code])}</td></tr>`).join('');
    const barisKeluar = cats.out.filter(c => sums.out[c.code] > 0).map(c => `<tr><td style="text-align:center;">${c.code}</td><td>${c.name}</td><td style="text-align:right;">${formatRp(sums.out[c.code])}</td></tr>`).join('');

    const tblMasuk = document.getElementById('lap-tbl-masuk');
    const tblKeluar = document.getElementById('lap-tbl-keluar');
    
    if(tblMasuk) tblMasuk.innerHTML = barisMasuk || `<tr><td colspan="3" style="text-align:center; font-style:italic;">Tidak ada penerimaan pada periode ini</td></tr>`;
    if(tblKeluar) tblKeluar.innerHTML = barisKeluar || `<tr><td colspan="3" style="text-align:center; font-style:italic;">Tidak ada penyaluran pada periode ini</td></tr>`;
    
    if(document.getElementById('lap-saldo-awal')) document.getElementById('lap-saldo-awal').innerText = formatRp(saldoAwalBulan);
    if(document.getElementById('lap-tot-masuk')) document.getElementById('lap-tot-masuk').innerText = formatRp(fMasuk); 
    if(document.getElementById('lap-tot-keluar')) document.getElementById('lap-tot-keluar').innerText = `(${formatRp(fKeluar)})`; 
    if(document.getElementById('lap-saldo-tunai')) document.getElementById('lap-saldo-tunai').innerText = formatRp(saldoTunai); 
    if(document.getElementById('lap-saldo-bank')) document.getElementById('lap-saldo-bank').innerText = formatRp(saldoBank); 
    if(document.getElementById('lap-saldo-akhir')) document.getElementById('lap-saldo-akhir').innerText = formatRp(saldoTunai + saldoBank);
}

function refreshUI() {
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
    const start = document.getElementById('filter-start-date')?.value || '', end = document.getElementById('filter-end-date')?.value || '';
    const fType = document.getElementById('filter-type')?.value || '';

    let globalBalance = 0;
    
    const allSortedTrx = [...transactions].sort((a,b) => {
        const dateDiff = new Date(a.date || 0) - new Date(b.date || 0);
        return dateDiff !== 0 ? dateDiff : ((a.timestamp || 0) - (b.timestamp || 0));
    });
    
    if(tbody) {
        allSortedTrx.map(t => {
            const amt = Number(t.amount || 0);
            if (t.type === 'in' && t.code !== '120' && t.code !== '220') globalBalance += amt;
            if (t.type === 'out' && t.code !== '120' && t.code !== '220') globalBalance -= amt;
            return { ...t, currentBalance: globalBalance };
        }).filter(t => {
            const catObj = allCats.find(c => c.code === t.code), catName = catObj ? (catObj.name || '').toLowerCase() : '';
            const matchK = (t.desc || '').toLowerCase().includes(keyword) || catName.includes(keyword) || (t.code || '').toLowerCase().includes(keyword);
            return matchK && (!start || t.date >= start) && (!end || t.date <= end) && (!fType || t.type === fType);
        }).sort((a,b) => {
            const dateDiff = new Date(b.date || 0) - new Date(a.date || 0);
            return dateDiff !== 0 ? dateDiff : ((b.timestamp || 0) - (a.timestamp || 0));
        }).forEach(t => {
            const catObj = allCats.find(c => c.code === t.code), catName = catObj ? catObj.name : 'Lainnya';
            const proofHtml = t.proof ? `<a href="${t.proof}" target="_blank" class="btn-action"><i class="fa-solid fa-image" style="color:var(--accent-blue);"></i></a>` : '-';
            let actionBtns = `<div style="display:flex; gap:6px;"><button class="btn-action" onclick="openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt" style="color:var(--nu-gold-dark);"></i></button>`;
            if(currentUserRole === 'bendahara') { actionBtns += `<button class="btn-action" onclick="editTrx('${t.idFirebase}')"><i class="fa-solid fa-pen-to-square" style="color:var(--accent-blue);"></i></button><button class="btn-action btn-delete-sm" onclick="hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash"></i></button>`; }
            tbody.innerHTML += `<tr><td>${formatTanggalIndo(t.date)}</td><td><span class="badge ${t.source.includes('Bank') ? 'badge-bank' : ''}" style="${!t.source.includes('Bank') ? 'background:#e2e8f0; color:#334155;' : ''}">${t.source || 'Kas Tunai'}</span></td><td><span class="${t.type === 'in' ? 'badge badge-in' : 'badge badge-out'}">${t.code}</span><br><strong>${catName}</strong><br><small>${t.desc || '-'}</small></td><td style="color:#15803d; font-weight:800;">${t.type === 'in' ? formatRp(t.amount) : '-'}</td><td style="color:#b91c1c; font-weight:800;">${t.type === 'out' ? formatRp(t.amount) : '-'}</td><td style="color:var(--nu-gold-dark); font-weight:800;">${formatRp(t.currentBalance)}</td><td style="text-align:center;">${proofHtml}</td><td>${actionBtns}</div></td></tr>`;
        });
    }

    if(document.getElementById('sum-tunai')) document.getElementById('sum-tunai').innerText = formatRp(saldoTunai); 
    if(document.getElementById('sum-bank')) document.getElementById('sum-bank').innerText = formatRp(saldoBank); 
    if(document.getElementById('sum-masuk')) document.getElementById('sum-masuk').innerText = formatRp(grandIn); 
    if(document.getElementById('sum-keluar')) document.getElementById('sum-keluar').innerText = formatRp(grandOut);
}

// =====================================================================
// --- GRAFIK & ANALITIK (FUNGSI PROFESIONAL) ---
// =====================================================================
function renderCharts() {
    if (typeof Chart === 'undefined') return;

    let monthlyData = {};
    let totalInAll = 0, totalOutAll = 0;
    let categoryOutCount = {};

    transactions.forEach(t => {
        if (!t || !t.date) return;
        const monthKey = t.date.slice(0, 7);
        const amt = Number(t.amount || 0);

        if (!monthlyData[monthKey]) monthlyData[monthKey] = { in: 0, out: 0 };

        if (t.type === 'in' && t.code !== '120' && t.code !== '220') {
            monthlyData[monthKey].in += amt;
            totalInAll += amt;
        } else if (t.type === 'out' && t.code !== '120' && t.code !== '220') {
            monthlyData[monthKey].out += amt;
            totalOutAll += amt;
            categoryOutCount[t.code] = (categoryOutCount[t.code] || 0) + amt;
        }
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const labelMonths = sortedMonths.map(m => {
        const [y, mm] = m.split('-');
        return new Date(y, mm - 1, 1).toLocaleString('id-ID', { month: 'short', year: 'numeric' });
    });
    const dataInValues = sortedMonths.map(m => monthlyData[m].in);
    const dataOutValues = sortedMonths.map(m => monthlyData[m].out);

    const nuGreen = '#005a2b', nuGold = '#d4af37', dangerRed = '#ef4444';
    const colorPalette = ['#0284c7', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];

    const ctxTren = document.getElementById('chartTrenBulanan');
    if (ctxTren) {
        if (window.myChartTren) window.myChartTren.destroy();
        window.myChartTren = new Chart(ctxTren.getContext('2d'), {
            type: 'line',
            data: { labels: labelMonths.length > 0 ? labelMonths : ['Belum ada data'], datasets: [ { label: 'Pemasukan (Rp)', data: dataInValues.length > 0 ? dataInValues : [0], borderColor: nuGreen, backgroundColor: 'rgba(0, 90, 43, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }, { label: 'Penyaluran (Rp)', data: dataOutValues.length > 0 ? dataOutValues : [0], borderColor: dangerRed, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 3, fill: true, tension: 0.3 } ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: function(value) { return 'Rp ' + value.toLocaleString('id-ID'); } } } } }
        });
    }

    const ctxArus = document.getElementById('chartArusKas');
    if (ctxArus) {
        if (window.myChartArus) window.myChartArus.destroy();
        window.myChartArus = new Chart(ctxArus.getContext('2d'), {
            type: 'bar',
            data: { labels: ['Total Keseluruhan'], datasets: [ { label: 'Total Pemasukan', data: [totalInAll], backgroundColor: nuGreen, borderRadius: 8 }, { label: 'Total Penyaluran', data: [totalOutAll], backgroundColor: dangerRed, borderRadius: 8 } ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: function(value) { return 'Rp ' + value.toLocaleString('id-ID'); } } } } }
        });
    }

    const ctxPenyaluran = document.getElementById('chartPenyaluran');
    if (ctxPenyaluran) {
        if (window.myChartPenyaluran) window.myChartPenyaluran.destroy();
        const cats = getDynamicCategories();
        let catLabels = [], catValues = [];

        for (const [code, val] of Object.entries(categoryOutCount)) {
            const foundCat = cats.out.find(c => c.code === code);
            catLabels.push(foundCat ? foundCat.name : `Akun ${code}`);
            catValues.push(val);
        }

        window.myChartPenyaluran = new Chart(ctxPenyaluran.getContext('2d'), {
            type: 'doughnut',
            data: { labels: catLabels.length > 0 ? catLabels : ['Belum ada penyaluran'], datasets: [{ data: catValues.length > 0 ? catValues : [1], backgroundColor: catValues.length > 0 ? colorPalette : ['#e2e8f0'], borderWidth: 2, borderColor: '#ffffff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

// =====================================================================
// --- 7. TRANSAKSI (CREATE, UPDATE, DELETE) ---
// =====================================================================
function updateCategories() { 
    const typeObj = document.getElementById('t-type');
    if(!typeObj) return;
    const type = typeObj.value, cats = getDynamicCategories();
    document.getElementById('t-category').innerHTML = cats[type].map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`).join(''); 
}

function cancelEditTrx() {
    document.getElementById('form-trx').reset(); document.getElementById('t-edit-id').value = '';
    document.getElementById('t-date').valueAsDate = new Date(); document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-check"></i> Rekam Transaksi';
    document.getElementById('btn-cancel-edit').classList.add('hidden'); updateCategories(); showToast("Edit dibatalkan", "info");
}

function editTrx(idFirebase) {
    if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
    const trx = transactions.find(t => t.idFirebase === idFirebase); if(!trx) return;
    document.getElementById('t-edit-id').value = trx.idFirebase; document.getElementById('t-type').value = trx.type; updateCategories();
    document.getElementById('t-source').value = trx.source || 'Kas Tunai'; document.getElementById('t-category').value = trx.code;
    document.getElementById('t-date').value = trx.date; document.getElementById('t-amount').value = parseInt(trx.amount).toLocaleString('id-ID');
    document.getElementById('t-desc').value = trx.desc;
    document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Transaksi';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    switchTab(null, 'v-dashboard'); window.scrollTo({ top: 400, behavior: 'smooth' }); showToast("Mode Edit Transaksi Aktif", "info");
}

const tAmountObj = document.getElementById('t-amount');
if(tAmountObj) {
    tAmountObj.addEventListener('input', function(e) {
        let val = this.value.replace(/[^0-9]/g, ''); this.value = val ? parseInt(val, 10).toLocaleString('id-ID') : '';
    });
}

const formTrxObj = document.getElementById('form-trx');
if(formTrxObj) {
    formTrxObj.addEventListener('submit', function(e) {
        e.preventDefault(); 
        if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
        
        const editId = document.getElementById('t-edit-id').value;
        const type = document.getElementById('t-type').value;
        const code = document.getElementById('t-category').value;
        const dateInput = document.getElementById('t-date').value;
        const descInput = document.getElementById('t-desc').value.trim();
        const sourceInput = document.getElementById('t-source').value;
        const amountInput = parseFloat(document.getElementById('t-amount').value.replace(/\./g, ''));

        if (!dateInput || isNaN(amountInput) || amountInput <= 0 || !descInput) {
            return showToast("Data transaksi tidak valid!", "error");
        }

        const proofInput = document.getElementById('t-proof').files[0];
        const btnSubmit = document.getElementById('btn-submit-trx');
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
        
        const saveProcess = async (proofBase64 = null) => {
            try {
                showToast("Menyimpan ke Cloud...", "info");
                const exactTimestamp = Date.now(); 

                if (editId) {
                    const updateData = { type, source: sourceInput, code, date: dateInput, amount: amountInput, desc: descInput };
                    if(proofBase64) updateData.proof = proofBase64;
                    // PERBAIKAN: Menggunakan getFirestoreDoc custom
                    await window.fs.updateDoc(getFirestoreDoc("transactions", editId), updateData);
                    cancelEditTrx(); showToast("Data diperbarui!", "success"); saveLog('EDIT TRANSAKSI', `Transaksi ID ${editId} diperbarui`);
                } else {
                    const dt = { type, source: sourceInput, code, date: dateInput, amount: amountInput, desc: descInput, proof: proofBase64, timestamp: exactTimestamp };
                    await window.fs.addDoc(getCol("transactions"), dt);
                    document.getElementById('t-amount').value = ''; document.getElementById('t-desc').value = ''; document.getElementById('t-proof').value = '';
                    showToast("Transaksi disimpan!", "success"); saveLog('TAMBAH TRANSAKSI', `Mencatat ${type==='in'?'Pemasukan':'Pengeluaran'} Rp ${formatRp(amountInput)} (${code})`);
                }
            } catch (err) { 
                showToast("Gagal menyimpan ke Cloud.", "error"); 
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = editId ? '<i class="fa-solid fa-floppy-disk"></i> Update Transaksi' : '<i class="fa-solid fa-check"></i> Rekam Transaksi';
            }
        };
        
        if (proofInput) { compressImage(proofInput, (compressedBase64) => saveProcess(compressedBase64)); } else { saveProcess(); }
    });
}

async function hapusTrx(idFirebase) { 
    if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
    if(confirm('Hapus permanen dari Cloud?')) { 
        try { 
            // PERBAIKAN: Menggunakan getFirestoreDoc custom
            await window.fs.deleteDoc(getFirestoreDoc("transactions", idFirebase)); 
            showToast("Transaksi dihapus.", "success"); 
            saveLog('HAPUS TRANSAKSI', `Menghapus transaksi ID ${idFirebase}`); 
        } catch (err) { 
            showToast("Gagal menghapus.", "error"); 
        }
    } 
}

// =====================================================================
// --- 8. FITUR TAMBAHAN (KALKULATOR, CETAK BUKU BESAR) ---
// =====================================================================
function bukaKalkulatorAmil() {
    let totalInfaqZakat = 0; const currentMonth = new Date().toISOString().slice(0, 7);
    transactions.forEach(t => { if(t.type === 'in' && t.code !== '120' && t.code !== '220' && t.code !== '101' && t.date.slice(0, 7) === currentMonth) totalInfaqZakat += Number(t.amount || 0); });
    document.getElementById('amil-total').innerText = formatRp(totalInfaqZakat); document.getElementById('amil-hak').innerText = formatRp(totalInfaqZakat * 0.125);
    document.getElementById('modal-amil').classList.remove('hidden');
}

function clearFilters() {
    ['search-keyword','filter-start-date','filter-end-date','filter-type'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    refreshUI(); showToast("Filter pencarian direset.", "info");
}

function cetakPDF() {
    buildReport(); const element = document.getElementById('print-area'), panelLaporan = document.getElementById('v-laporan');
    if(!panelLaporan) return;
    const wasHidden = panelLaporan.classList.contains('hidden');
    if (wasHidden) panelLaporan.classList.remove('hidden');
    const opt = { margin: [8,8,8,8], filename: `Laporan_Keuangan_UPZIS_${document.getElementById('filter-month').value}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.signature-area', '.report-header'] } };
    showToast("Memproses PDF Laporan Keuangan...", "info");
    setTimeout(() => { html2pdf().set(opt).from(element).save().then(() => { if (wasHidden) panelLaporan.classList.add('hidden'); showToast("Berhasil diunduh!", "success"); }); }, 150);
}

function cetakBukuBesarPDF() {
    const startDate = document.getElementById('filter-start-date')?.value || '';
    const endDate = document.getElementById('filter-end-date')?.value || '';
    const filterType = document.getElementById('filter-type')?.value || '';
    const keyword = (document.getElementById('search-keyword')?.value || '').toLowerCase();
    const cats = getDynamicCategories();
    const allCats = [...cats.in, ...cats.out];

    let globalBalancePDF = 0;
    const allSortedTrx = [...transactions].sort((a,b) => {
        const dateDiff = new Date(a.date || 0) - new Date(b.date || 0);
        return dateDiff !== 0 ? dateDiff : ((a.timestamp || 0) - (b.timestamp || 0));
    });
    
    const trxWithTrueBalancePDF = allSortedTrx.map(t => {
        const amt = Number(t.amount || 0);
        if (t.type === 'in' && t.code !== '120' && t.code !== '220') globalBalancePDF += amt;
        if (t.type === 'out' && t.code !== '120' && t.code !== '220') globalBalancePDF -= amt;
        return { ...t, currentBalance: globalBalancePDF };
    });

    let initialRunningBalance = 0;
    if(startDate) {
        const trxBeforeStart = trxWithTrueBalancePDF.filter(t => t.date < startDate);
        if(trxBeforeStart.length > 0) { initialRunningBalance = trxBeforeStart[trxBeforeStart.length - 1].currentBalance; }
    }

    const filteredTrx = trxWithTrueBalancePDF.filter(t => {
        const catObj = allCats.find(c => c.code === t.code), catName = catObj ? (catObj.name || '').toLowerCase() : '';
        const matchKeyword = (t.desc || '').toLowerCase().includes(keyword) || catName.includes(keyword) || (t.code || '').toLowerCase().includes(keyword) || (t.source || '').toLowerCase().includes(keyword);
        let matchDateAndType = true;
        if (startDate && t.date < startDate) matchDateAndType = false;
        if (endDate && t.date > endDate) matchDateAndType = false;
        if (filterType && t.type !== filterType) matchDateAndType = false;
        return matchKeyword && matchDateAndType;
    });

    if(filteredTrx.length === 0) { showToast("Tidak ada transaksi untuk dicetak pada filter saat ini.", "error"); return; }

    document.getElementById('bb-lap-periode').innerText = startDate ? `Periode: Sejak ${formatTanggalIndo(startDate)}` : "Seluruh Riwayat Transaksi";
    document.getElementById('bb-lap-tanggal-cetak').innerText = `Karangdowo, ${formatTanggalIndo(new Date().toISOString().slice(0, 10))}`;

    let rowsHtml = '', totalDeb = 0, totalKre = 0;

    if(startDate) {
        rowsHtml += `<tr style="background:#f8fafc; font-weight:bold;"><td colspan="5" style="text-align:right;">SALDO AWAL KAS (Akumulasi Sebelum ${formatTanggalIndo(startDate)}):</td><td style="text-align:right; color:var(--nu-gold-dark);">${formatRp(initialRunningBalance)}</td></tr>`;
    }

    [...filteredTrx].sort((a,b) => {
        const dateDiff = new Date(a.date || 0) - new Date(b.date || 0);
        return dateDiff !== 0 ? dateDiff : ((a.timestamp || 0) - (b.timestamp || 0));
    }).forEach(t => {
        const catObj = allCats.find(c => c.code === t.code), catName = catObj ? catObj.name : 'Lainnya', amt = Number(t.amount || 0);
        if(t.type === 'in' && t.code !== '120' && t.code !== '220') totalDeb += amt; 
        if(t.type === 'out' && t.code !== '120' && t.code !== '220') totalKre += amt; 
        rowsHtml += `<tr><td style="text-align:center;">${formatTanggalIndo(t.date)}</td><td>${t.source || 'Kas Tunai'}</td><td><strong>[${t.code}] ${catName}</strong><br><small style="color:#475569;">${t.desc || '-'}</small></td><td style="text-align:right;">${t.type === 'in' ? formatRp(amt) : '-'}</td><td style="text-align:right;">${t.type === 'out' ? formatRp(amt) : '-'}</td><td style="text-align:right; font-weight:bold;">${formatRp(t.currentBalance)}</td></tr>`;
    });

    const finalBalanceToPrint = filteredTrx[filteredTrx.length - 1].currentBalance;
    rowsHtml += `<tr style="background:#f1f5f9; font-weight:bold;"><td colspan="3" style="text-align:right;">TOTAL MUTASI & SALDO AKHIR:</td><td style="text-align:right; color:#15803d;">${formatRp(totalDeb)}</td><td style="text-align:right; color:#b91c1c;">${formatRp(totalKre)}</td><td style="text-align:right; color:var(--nu-gold-dark);">${formatRp(finalBalanceToPrint)}</td></tr>`;

    document.getElementById('bb-table-rows').innerHTML = rowsHtml;
    const element = document.getElementById('buku-besar-area'), wrapper = document.getElementById('hidden-buku-besar-print');
    wrapper.classList.remove('hidden');

    const opt = { margin: 10, filename: `Buku_Besar_UPZIS_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, windowWidth: 1100 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.signature-area', '.report-header'] } };
    showToast("Menyiapkan dokumen PDF Buku Besar A4 Landscape...", "info");
    html2pdf().set(opt).from(element).save().then(() => { wrapper.classList.add('hidden'); showToast("Buku Besar berhasil diunduh!", "success"); }).catch(err => { wrapper.classList.add('hidden'); showToast("Gagal mencetak Buku Besar.", "error"); });
}

// =====================================================================
// --- 9. PENGAMBILAN DATA (REAL-TIME LISTENER AUTO-SYNC) ---
// =====================================================================
async function loadAllCloudData() {
    try {
        unsubProfile = window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (docSnap) => {
            if (docSnap.exists()) profileSettings = { ...profileSettings, ...docSnap.data() };
            applyProfileData();
        });
        
        unsubTrx = window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snapshot) => {
            transactions = []; snapshot.forEach(d => { transactions.push({ idFirebase: d.id, ...d.data() }); });
            
            // AUTO-SYNC UI: Menjalankan pembaruan data secara real-time tanpa perlu klik ulang!
            refreshUI(); 
            updateStorageIndicator();
            
            // Auto Update Panel yang Aktif Saja
            const panelLap = document.getElementById('v-laporan');
            const panelPos = document.getElementById('v-poster');
            const panelChart = document.getElementById('v-analitik');
            
            if (panelLap && !panelLap.classList.contains('hidden')) buildReport();
            if (panelPos && !panelPos.classList.contains('hidden')) buildPoster();
            if (panelChart && !panelChart.classList.contains('hidden')) renderCharts();
        });
        
        unsubMustahik = window.fs.onSnapshot(getCol("mustahik"), (snapshot) => {
            dbMustahik = []; snapshot.forEach(d => { dbMustahik.push({ idFirebase: d.id, ...d.data() }); }); 
            renderMustahik();
        });
        
        unsubLogs = window.fs.onSnapshot(window.fs.query(getCol("logs"), window.fs.orderBy("time", "asc")), (snapshot) => {
            logsData = []; snapshot.forEach(d => { logsData.push({ idFirebase: d.id, ...d.data() }); }); 
            renderLogs();
        });
        
        updateFirebaseIndicator(navigator.onLine);
    } catch (err) { 
        updateFirebaseIndicator(false); 
    }
}

// =====================================================================
// --- 10. SISA FUNGSI PENDUKUNG (MUSTAHIK, POSTER, VIDEO, CLOUD) ---
// =====================================================================
const formMustahik = document.getElementById('form-mustahik');
if(formMustahik) {
    formMustahik.addEventListener('submit', async (e) => {
        e.preventDefault(); if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
        const m = { nama: document.getElementById('m-nama').value, nik: document.getElementById('m-nik').value || '-', kategori: document.getElementById('m-kategori').value, hp: document.getElementById('m-hp').value || '-', alamat: document.getElementById('m-alamat').value || '-' };
        try { showToast("Menyimpan ke Cloud...", "info"); const docRef = await window.fs.addDoc(getCol("mustahik"), m); m.idFirebase = docRef.id; dbMustahik.push(m); e.target.reset(); renderMustahik(); updateStorageIndicator(); saveLog('TAMBAH WARGA', `Mendaftarkan warga/mustahik: ${m.nama}`); showToast("Data Warga disimpan.", "success"); } catch (err) { showToast("Gagal menyimpan data warga.", "error"); }
    });
}

async function hapusMustahik(idFirebase) { 
    if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!");
    if(confirm('Hapus data warga ini dari Cloud?')) { 
        try { await window.fs.deleteDoc(getFirestoreDoc("mustahik", idFirebase)); dbMustahik = dbMustahik.filter(m => m.idFirebase !== idFirebase); renderMustahik(); updateStorageIndicator(); saveLog('HAPUS WARGA', `Menghapus data mustahik ID ${idFirebase}`); showToast("Data dihapus.", "success"); } catch (err) { showToast("Gagal menghapus data warga.", "error"); }
    } 
}

function renderMustahik() { 
    const tbody = document.getElementById('table-mustahik'); if(!tbody) return;
    tbody.innerHTML = dbMustahik.map(m => `<tr><td><strong style="font-size:13px;">${m.nama}</strong><br><small style="color:gray; font-weight:600;">NIK: ${m.nik}</small></td><td><span class="badge" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#334155;">${m.kategori}</span></td><td>${m.hp !== '-' ? `<i class="fa-brands fa-whatsapp" style="color:var(--wa-color);"></i> <strong>${m.hp}</strong><br>` : ''}<small style="color:var(--text-muted);">${m.alamat || '-'}</small></td><td>${currentUserRole === 'bendahara' ? `<button class="btn-action btn-delete-sm" onclick="hapusMustahik('${m.idFirebase}')"><i class="fa-solid fa-trash"></i></button>` : '<span style="color:gray; font-size:11px;">Read-Only</span>'}</td></tr>`).join(''); 
}

function resetPosterFilter() { document.getElementById('poster-start').value = ''; document.getElementById('poster-end').value = ''; buildPoster(); showToast("Filter poster direset.", "info"); }

function buildPoster() {
    const start = document.getElementById('poster-start').value, end = document.getElementById('poster-end').value;
    let tIn = 0, perRelawan = {};
    if(profileSettings.relawan && profileSettings.relawan.length > 0) { profileSettings.relawan.forEach((rel, idx) => { perRelawan[String(111 + idx)] = { name: rel, amount: 0 }; }); }
    perRelawan['other'] = { name: 'Pemasukan Donasi Lainnya', amount: 0 };

    transactions.forEach(t => {
        let match = true; if(start && t.date < start) match = false; if(end && t.date > end) match = false;
        if(match && t.type === 'in' && t.code !== '101' && t.code !== '120' && t.code !== '220') { const amt = Number(t.amount || 0); tIn += amt; if(perRelawan[t.code]) { perRelawan[t.code].amount += amt; } else { perRelawan['other'].amount += amt; } }
    });

    if(document.getElementById('poster-in')) document.getElementById('poster-in').innerText = formatRp(tIn); 
    if(document.getElementById('poster-periode-text')) document.getElementById('poster-periode-text').innerText = (start && end) ? `Periode: ${formatTanggalIndo(start)} s/d ${formatTanggalIndo(end)}` : "Seluruh Periode";
    
    let breakdownHtml = '', chartLabels = [], chartData = [], chartColors = ['#d4af37', '#0284c7', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e'];
    Object.keys(perRelawan).forEach((key) => {
        if(perRelawan[key].amount > 0) { breakdownHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed rgba(255,255,255,0.15); padding-bottom:6px;"><span style="color:white; font-weight:600;">${perRelawan[key].name}</span><span style="font-weight:800; color:var(--nu-gold-light);">${formatRp(perRelawan[key].amount)}</span></div>`; chartLabels.push(perRelawan[key].name); chartData.push(perRelawan[key].amount); }
    });
    
    if(document.getElementById('poster-breakdown')) document.getElementById('poster-breakdown').innerHTML = breakdownHtml || '<div style="text-align:center; padding:10px; color:white; opacity:0.7;">Belum ada data infak pada periode ini.</div>';
    
    if (typeof Chart !== 'undefined') {
        if(window.posterChartInstance) window.posterChartInstance.destroy(); const ctxPoster = document.getElementById('posterChart');
        if(ctxPoster) { window.posterChartInstance = new Chart(ctxPoster.getContext('2d'), { type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartData.length > 0 ? chartData : [1], backgroundColor: chartData.length > 0 ? chartData.map((_, i) => chartColors[i % chartColors.length]) : ['#e2e8f0'], borderWidth: 2, borderColor: '#ffffff' }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } } }); }
    }
}

function cetakPosterPDF() { buildPoster(); const element = document.getElementById('poster-print-area'); const opt = { margin: 5, filename: `Poster_Transparansi_UPZIS_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 1.0 }, html2canvas: { scale: 3, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }; showToast("Menyiapkan Poster Laporan Transparansi...", "info"); html2pdf().set(opt).from(element).save(); }

function renderKontenHarian() {
    const kontenList = [ { judul: "Pahala Berlipat Ganda", teks: "Perumpamaan orang yang menginfakkan hartanya di jalan Allah seperti sebutir biji yang menumbuhkan tujuh tangkai... (Al-Baqarah: 261)" }, { judul: "Sedekah Penolak Bala", teks: "Bersegeralah bersedekah, sebab bala bencana tidak pernah bisa mendahului sedekah. (HR. Thabrani)" }, { judul: "Sedekah Tak Kurangi Harta", teks: "Rasulullah SAW bersabda: Sedekah itu tidak akan mengurangi harta... (HR. Muslim)" } ];
    const kontenAktif = kontenList[Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % kontenList.length]; window.activeKontenText = kontenAktif;
    const container = document.getElementById('konten-harian-container'); if(!container) return; const waText = encodeURIComponent(`*${kontenAktif.judul}*\n\n${kontenAktif.teks}\n\nMari salurkan ZIS Anda melalui UPZIS Ranting ${asalRanting.toUpperCase()}.\n_Sistem Bendahara Terpadu_`);
    container.innerHTML = `<div style="background: white; padding: 20px; border-radius: 16px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); text-align:center;"><canvas id="video-canvas" width="800" height="800" style="width:100%; max-width:400px; border-radius:12px; box-shadow:var(--shadow-md); background:#012a14;"></canvas><div style="display:flex; flex-direction:column; gap:10px; margin-top:20px;"><button id="btn-download-video" onclick="downloadCanvasAsVideo()" class="btn btn-outline" style="width:100%; padding:14px; font-size:13px;"><i class="fa-solid fa-video"></i> Render & Unduh Video MP4</button><a href="https://api.whatsapp.com/send?text=${waText}" target="_blank" class="btn btn-primary" style="width:100%; padding:14px; font-size:13px; background:var(--wa-color); border:none; text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> Bagikan WA (Otomatis Teks)</a></div></div><div style="display:flex; flex-direction:column; justify-content:center;"><div style="background:var(--nu-green-light); padding:20px; border-radius:16px; border:1px solid var(--nu-green);"><h4 style="color:var(--nu-green-dark); margin-bottom:12px; font-size:14px; font-weight:800;"><i class="fa-solid fa-lightbulb"></i> Cara Penggunaan Studio Video</h4><ul style="font-size:12px; color:var(--text-dark); padding-left:15px; line-height:1.8; font-weight:500;"><li>Sistem ini <b>otomatis merender Video Animasi</b> dari HP/Laptop Anda tanpa aplikasi tambahan!</li><li>Klik tombol <b>Render & Unduh Video</b> untuk menyimpan video ke Galeri (proses sekitar 5 detik).</li><li>Sangat cocok untuk dijadikan <i>Status WhatsApp</i> rutin setiap pagi.</li></ul></div></div>`; startVideoAnimation();
}

function startVideoAnimation() {
    const canvas = document.getElementById('video-canvas'); if(!canvas) return; const ctx = canvas.getContext('2d'); let frame = 0; const logoImg = new Image(); logoImg.src = profileSettings.logoBase64;
    function draw() {
        frame++; const grad = ctx.createLinearGradient(0, 0, 800, 800); grad.addColorStop(0, '#012a14'); grad.addColorStop(1, '#005a2b'); ctx.fillStyle = grad; ctx.fillRect(0,0,800,800); ctx.fillStyle = 'rgba(212, 175, 55, 0.3)';
        for(let i=0; i<30; i++) { const x = (Math.sin(frame*0.01 + i*10) * 400) + 400, y = (Math.cos(frame*0.015 + i*10) * 400) + 400; ctx.beginPath(); ctx.arc(x, y, 3 + Math.sin(frame*0.05+i), 0, Math.PI*2); ctx.fill(); }
        if(logoImg.complete && logoImg.width) ctx.drawImage(logoImg, 50, 50, 100, 100);
        ctx.fillStyle = '#d4af37'; ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left'; ctx.fillText("LAZISNU", 170, 90); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif'; ctx.fillText("RANTING " + (asalRanting ? asalRanting.toUpperCase() : "KARANGDOWO"), 170, 130);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.beginPath(); ctx.roundRect(50, 220, 700, 420, 20); ctx.fill(); ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)'; ctx.lineWidth = 2; ctx.stroke();
        if(window.activeKontenText) { ctx.textAlign = 'center'; ctx.fillStyle = '#d4af37'; ctx.font = 'bold 36px "Cinzel", serif'; wrapText(ctx, window.activeKontenText.judul, 400, 300 + Math.sin(frame*0.05)*5, 640, 45); ctx.fillStyle = '#e2e8f0'; ctx.font = 'italic 26px "Plus Jakarta Sans", sans-serif'; wrapText(ctx, `"${window.activeKontenText.teks}"`, 400, 450, 600, 38); }
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif'; ctx.fillText("Mari Salurkan Infaq & Sedekah Anda", 400, 720); window.animationFrameId = requestAnimationFrame(draw);
    }
    if(window.animationFrameId) cancelAnimationFrame(window.animationFrameId); draw();
}

function downloadCanvasAsVideo() {
    const canvas = document.getElementById('video-canvas'); if(!canvas) return; let mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm; codecs=vp9'; const stream = canvas.captureStream(30), mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType }), chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => { const blob = new Blob(chunks, { type: mimeType }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `Kampanye_LAZISNU_${asalRanting}_${Date.now()}.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); showToast("Video berhasil dirender!", "success"); const btn = document.getElementById('btn-download-video'); if(btn) { btn.innerHTML = '<i class="fa-solid fa-video"></i> Render & Unduh Video MP4'; btn.disabled = false; } };
    mediaRecorder.start(); showToast("Merender Video Animasi... (Mohon tunggu 6 detik)", "info"); const btn = document.getElementById('btn-download-video'); if(btn) { btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Rendering Video...'; btn.disabled = true; } setTimeout(() => { mediaRecorder.stop(); }, 6000);
}

function importDataFromFile(event) {
    const file = event.target.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = async function(e) {
        try { const data = new Uint8Array(e.target.result), workbook = XLSX.read(data, {type: 'array'}); let importedTrx = [], importedWarga = [];
            workbook.SheetNames.forEach(sheetName => { const jsonSheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]); if(sheetName.toLowerCase().includes('trx') || jsonSheet.some(r => r.Nominal || r.Jenis)) { importedTrx = jsonSheet.map(r => ({ date: r.Tanggal || r.date || new Date().toISOString().slice(0,10), type: (r.Jenis === 'Pemasukan' || r.type === 'in') ? 'in' : 'out', code: String(r.Akun_Kode || r.code || '199'), source: r.Sumber_Dana || r.source || 'Kas Tunai', amount: Number(r.Nominal || r.amount || 0), desc: r.Keterangan || r.desc || 'Import Data', timestamp: Date.now() })); } else if(sheetName.toLowerCase().includes('warga') || jsonSheet.some(r => r.NIK || r.Nama_Lengkap)) { importedWarga = jsonSheet.map(r => ({ nama: r.Nama_Lengkap || r.nama || 'Tanpa Nama', nik: String(r.NIK || r.nik || '-'), kategori: r.Kategori || r.kategori || 'Bantuan Umum', hp: String(r.No_HP || r.hp || '-'), alamat: r.Alamat || r.alamat || '-' })); } });
            if(importedTrx.length > 0 || importedWarga.length > 0) { if(confirm(`Ditemukan ${importedTrx.length} data transaksi dan ${importedWarga.length} data warga. Lakukan import?`)) { showToast("Mengimpor data ke Cloud...", "info"); for(let t of importedTrx) { const docRef = await window.fs.addDoc(getCol("transactions"), t); t.idFirebase = docRef.id; transactions.push(t); } for(let w of importedWarga) { const docRef = await window.fs.addDoc(getCol("mustahik"), w); w.idFirebase = docRef.id; dbMustahik.push(w); } refreshUI(); renderMustahik(); updateStorageIndicator(); saveLog('IMPORT DATA', `Berhasil import data dari ${file.name}`); showToast("Data berhasil diimport!", "success"); } } else { showToast("Format file tidak dikenali.", "error"); }
        } catch(err) { showToast("Gagal membaca file import.", "error"); }
    }; reader.readAsArrayBuffer(file);
}

async function syncCloudDrive(providerName) {
    if(currentUserRole !== 'bendahara') return alert("Hanya Bendahara yang diizinkan!"); showToast(`Memulai otorisasi ke ${providerName}...`, "info");
    setTimeout(() => { const wb = XLSX.utils.book_new(); const wsTrx = XLSX.utils.json_to_sheet(transactions.map(t => ({ "ID": t.idFirebase, "Tanggal": t.date, "Jenis": t.type === 'in' ? 'Pemasukan' : 'Pengeluaran', "Akun_Kode": t.code, "Sumber_Dana": t.source, "Nominal": t.amount, "Keterangan": t.desc }))); XLSX.utils.book_append_sheet(wb, wsTrx, "Data_Transaksi"); XLSX.writeFile(wb, `Cloud_Sync_${providerName.replace(/\s/g,'_')}_UPZIS.xlsx`); saveLog('CLOUD SYNC', `Sinkronisasi ke ${providerName}`); showToast(`Berhasil diamankan di ${providerName} Cloud.`, "success"); }, 3800);
}

function backupData(format) {
    const currentY = new Date().getFullYear(); if (format === 'pdf') { cetakBukuBesarPDF(); } else if (format === 'excel') { const wb = XLSX.utils.book_new(), wsTrx = XLSX.utils.json_to_sheet(transactions.map(t => ({ "ID": t.idFirebase, "Tanggal": t.date, "Jenis": t.type === 'in' ? 'Pemasukan' : 'Pengeluaran', "Kode": t.code, "Nominal": t.amount, "Ket": t.desc }))); XLSX.utils.book_append_sheet(wb, wsTrx, "Transaksi"); XLSX.writeFile(wb, `Backup_UPZIS_${currentY}.xlsx`); showToast("Backup Excel diunduh!", "success"); } else if (format === 'csv') { const wsTrx = XLSX.utils.json_to_sheet(transactions), csv = XLSX.utils.sheet_to_csv(wsTrx), blob = new Blob([csv], {type: "text/csv;charset=utf-8;"}), link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Backup_UPZIS_${currentY}.csv`; link.click(); showToast("Backup CSV diunduh!", "success"); }
}

async function eksekusiTutupBuku() {
    if(currentUserRole !== 'bendahara') return alert("Hanya Bendahara!"); const nextYear = new Date().getFullYear(), pass = prompt(`PERINGATAN!\nData akan dipindah ke Arsip.\nKetik sandi Anda:`);
    if (pass === profileSettings.password) wipeAllDataForNewYear(nextYear); else if (pass !== null) showToast("Kata sandi salah.", "error");
}

async function wipeAllDataForNewYear(newYear) {
    const activeYear = profileSettings.activeYear || new Date().getFullYear(); showToast(`Menghitung saldo dan mengarsipkan tahun ${activeYear}...`, "info");
    try {
        let sisaTunai = 0, sisaBank = 0;
        transactions.forEach(t => { const amt = Number(t.amount || 0); if(t.type === 'in') { if (t.code === '120') { sisaTunai += amt; sisaBank -= amt; } else if (t.code === '220') { sisaBank += amt; sisaTunai -= amt; } else { t.source.includes('Bank') ? sisaBank += amt : sisaTunai += amt; } } if(t.type === 'out') { t.source.includes('Bank') ? sisaBank -= amt : sisaTunai -= amt; } });
        const deletePromises = []; const trxSnap = await window.fs.getDocs(getCol("transactions"));
        trxSnap.forEach(d => { deletePromises.push(window.fs.setDoc(getFirestoreDoc(`arsip_${activeYear}_transactions`, d.id), d.data())); deletePromises.push(window.fs.deleteDoc(getFirestoreDoc("transactions", d.id))); }); await Promise.all(deletePromises);
        profileSettings.activeYear = newYear; await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings);
        const firstDayOfNewYear = `${newYear}-01-01`;
        if (sisaTunai > 0) { await window.fs.addDoc(getCol("transactions"), { type: 'in', source: 'Kas Tunai', code: '101', date: firstDayOfNewYear, amount: sisaTunai, desc: `Saldo Awal Bawaan dari Tahun ${activeYear}`, timestamp: Date.now() }); }
        if (sisaBank > 0) { await window.fs.addDoc(getCol("transactions"), { type: 'in', source: 'Rekening Bank BRI', code: '101', date: firstDayOfNewYear, amount: sisaBank, desc: `Saldo Awal Bawaan dari Tahun ${activeYear}`, timestamp: Date.now() + 1000 }); }
        transactions = []; dbMustahik = []; logsData = []; saveLog('SISTEM', `Tutup buku tahun ${activeYear} dan membawa saldo ke ${newYear}`); showToast("Tutup Buku berhasil! Saldo dipindahkan ke tahun baru.", "success");
    } catch(e) { showToast("Gagal melakukan tutup buku.", "error"); }
}

async function loadArsip() {
    const year = document.getElementById('input-arsip-year').value; if(!year) return showToast("Masukkan tahun!", "error"); showToast(`Mencari arsip ${year}...`, "info"); const tbody = document.getElementById('table-arsip-body');
    try { const snap = await window.fs.getDocs(window.fs.query(getCol(`arsip_${year}_transactions`), window.fs.orderBy("date", "asc"))); if(snap.empty) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Data arsip ${year} tidak ditemukan.</td></tr>`; return; } let html = ''; snap.forEach(d => { const t = d.data(); html += `<tr><td>${t.date}</td><td>${t.source}</td><td>[${t.code}] ${t.desc}</td><td>${t.type==='in'?formatRp(t.amount):'-'}</td><td>${t.type==='out'?formatRp(t.amount):'-'}</td></tr>`; }); tbody.innerHTML = html; showToast("Arsip dimuat.", "success"); } catch(e) { showToast("Gagal memuat arsip.", "error"); }
}

function checkYearEnd() { const now = new Date(), currentYear = now.getFullYear(); if(!profileSettings.activeYear) { profileSettings.activeYear = currentYear; window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); } const warningBanner = document.getElementById('year-end-warning'), menuBtn = document.getElementById('nav-tutup-buku'); if(currentYear > profileSettings.activeYear) { if(warningBanner) warningBanner.classList.remove('hidden'); if(menuBtn) menuBtn.classList.add('blink-warning'); } }

async function saveLog(action, detail) { const logEntry = { time: new Date().toISOString(), user: currentUserRole, action: action, detail: detail }; try { const docRef = await window.fs.addDoc(getCol("logs"), logEntry); logEntry.idFirebase = docRef.id; logsData.push(logEntry); if(logsData.length > 500) { logsData.sort((a,b) => new Date(a.time) - new Date(b.time)); const toDelete = logsData[0]; await window.fs.deleteDoc(getFirestoreDoc("logs", toDelete.idFirebase)); logsData.shift(); } renderLogs(); } catch(e) { console.error("Log error"); } }
function renderLogs() { const tbody = document.getElementById('table-logs'); if(!tbody) return; tbody.innerHTML = logsData.sort((a,b) => new Date(b.time) - new Date(a.time)).map(l => `<tr><td>${formatTanggalIndo((l.time||'').slice(0,10))}</td><td><span class="badge" style="background:#e2e8f0; color:#334155;">${(l.user||'Sistem').toUpperCase()}</span></td><td><strong>${l.action||'Info'}</strong></td><td><small>${l.detail||'-'}</small></td></tr>`).join(''); }

function applyProfileData() {
    const defaultNama = "UPZIS RANTING " + (asalRanting ? asalRanting.toUpperCase() : ""); ['p-lembaga'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = profileSettings.lembaga || defaultNama; }); ['p-periode'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = profileSettings.periode; }); ['nav-title', 'pdf-nama-lembaga', 'bb-pdf-nama-lembaga', 'kui-lembaga', 'poster-lembaga'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = (profileSettings.lembaga || defaultNama).toUpperCase(); }); ['nav-logo','navbar-logo','preview-logo','pdf-logo','bb-pdf-logo','kui-logo','poster-logo'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).src = profileSettings.logoBase64; });
    const currKetua = profileSettings.anggota.find(a => (a.jabatan || '').toLowerCase().includes('ketua') && !(a.jabatan || '').toLowerCase().includes('wakil'))?.nama || profileSettings.ketua, currBendahara = profileSettings.anggota.find(a => (a.jabatan || '').toLowerCase().includes('bendahara'))?.nama || profileSettings.bendahara; ['pdf-ttd-ketua','bb-pdf-ttd-ketua'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = currKetua; }); ['pdf-ttd-bendahara','bb-pdf-ttd-bendahara'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerText = currBendahara; });
    renderAnggota(); updateCategories();
}

async function simpanProfil() { if(currentUserRole !== 'bendahara') return alert("Akses terbatas untuk Bendahara!"); profileSettings.lembaga = document.getElementById(`p-lembaga`).value; profileSettings.periode = document.getElementById(`p-periode`).value; await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); applyProfileData(); saveLog('EDIT PROFIL', 'Data lembaga diperbarui'); showToast("Identitas Lembaga disimpan.", "success"); }
function renderAnggota() { const list = profileSettings.anggota || []; const container = document.getElementById('list-anggota'); if(container) container.innerHTML = list.map((a) => `<div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px; border-radius:12px; border:1px solid var(--border-color);"><div><div style="font-size:10px; font-weight:800; color:var(--nu-gold-dark);">${a.jabatan}</div><div style="font-weight:800;">${a.nama}</div></div><button class="btn-action btn-delete-sm" onclick="hapusAnggota(${a.id})"><i class="fa-solid fa-xmark"></i></button></div>`).join(''); renderBagan(); }
async function tambahAnggota() { const nama = document.getElementById('input-anggota-nama').value.trim(), jabatan = document.getElementById('input-anggota-jabatan').value.trim() || 'Relawan'; if(nama) { if(!profileSettings.anggota) profileSettings.anggota = []; profileSettings.anggota.push({ id: Date.now(), nama: nama, jabatan: jabatan }); syncCoreFromAnggota(); await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); document.getElementById('input-anggota-nama').value = ''; document.getElementById('input-anggota-jabatan').value = ''; renderAnggota(); updateCategories(); saveLog('EDIT PENGURUS', `Menambahkan ${jabatan}: ${nama}`); showToast("Anggota ditambahkan.", "success"); } }
async function hapusAnggota(id) { if(confirm("Hapus anggota ini?")) { profileSettings.anggota = profileSettings.anggota.filter(a => a.id !== id); syncCoreFromAnggota(); await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); renderAnggota(); updateCategories(); } }
function syncCoreFromAnggota() { const ketua = profileSettings.anggota.find(a => (a.jabatan || '').toLowerCase().includes('ketua') && !(a.jabatan || '').toLowerCase().includes('wakil')), bendahara = profileSettings.anggota.find(a => (a.jabatan || '').toLowerCase().includes('bendahara')); if(ketua) profileSettings.ketua = ketua.nama; if(bendahara) profileSettings.bendahara = bendahara.nama; profileSettings.relawan = profileSettings.anggota.filter(a => (a.jabatan || '').toLowerCase().includes('relawan')).map(a => a.nama); }
function renderBagan() { const list = profileSettings.anggota || [], pimpinan = list.filter(a => (a.jabatan || '').toLowerCase().includes('ketua')), bendahara = list.filter(a => (a.jabatan || '').toLowerCase().includes('bendahara')), relawan = list.filter(a => (a.jabatan || '').toLowerCase().includes('relawan')); const makeCard = (a) => `<div style="background:var(--glass-gradient); border:2px solid var(--nu-gold); padding:12px; border-radius:14px; text-align:center; min-width:140px;"><div style="font-size:10px; font-weight:800;">${a.jabatan}</div><div style="font-size:13px; font-weight:700;">${a.nama}</div></div>`; let html = ''; if(pimpinan.length > 0) html += `<div style="display:flex; justify-content:center; margin-bottom:15px; gap:15px;">${pimpinan.map(makeCard).join('')}</div>`; if(bendahara.length > 0) html += `<div style="display:flex; justify-content:center; gap:15px; margin-bottom:25px;">${bendahara.map(makeCard).join('')}</div>`; if(relawan.length > 0) html += `<div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">${relawan.map(makeCard).join('')}</div>`; const container = document.getElementById('org-chart-container'); if(container) container.innerHTML = html || '<div style="text-align:center; color:gray; font-size:12px;">Data belum lengkap.</div>'; }

// FITUR KUITANSI OTOMATIS
function openKuitansi(idFirebase) {
    const trx = transactions.find(t => t.idFirebase === idFirebase); if(!trx) return;
    const cats = getDynamicCategories(), allCats = [...cats.in, ...cats.out], catObj = allCats.find(c => c.code === trx.code);
    document.getElementById('kui-logo').src = profileSettings.logoBase64; document.getElementById('kui-lembaga').innerText = profileSettings.lembaga.toUpperCase(); document.getElementById('kui-periode').innerText = `Masa Khidmat: ${profileSettings.periode}`; document.getElementById('kui-no').innerText = `NO: KUI/${trx.idFirebase.slice(0, 8).toUpperCase()}`; document.getElementById('kui-tipe').innerText = trx.type === 'in' ? 'PEMASUKAN (DONASI / SETORAN)' : 'PENYALURAN (BANTUAN / OPERASIONAL)'; document.getElementById('kui-nominal').innerText = formatRp(trx.amount); document.getElementById('kui-ket').innerText = `[${trx.code} - ${catObj ? catObj.name : ''}] ${trx.desc || '-'}`; document.getElementById('kui-sumber').innerText = trx.source; document.getElementById('kui-tgl').innerText = `Karangdowo, ${formatTanggalIndo(trx.date)}`; document.getElementById('kui-ttd').innerText = profileSettings.anggota.find(a => (a.jabatan || '').toLowerCase().includes('bendahara'))?.nama || profileSettings.bendahara; document.getElementById('modal-kuitansi').classList.remove('hidden');
}
function closeKuitansi() { document.getElementById('modal-kuitansi').classList.add('hidden'); }
function cetakKuitansiPDF() { const element = document.getElementById('kuitansi-print-area'); html2pdf().set({ margin: 10, filename: `Kuitansi_LAZISNU_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' } }).from(element).save(); }
function kirimKuitansiWA() {
    const nominal = document.getElementById('kui-nominal').innerText, ket = document.getElementById('kui-ket').innerText, tgl = document.getElementById('kui-tgl').innerText, no = document.getElementById('kui-no').innerText, lembaga = document.getElementById('kui-lembaga').innerText;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`*KUITANSI RESMI ${lembaga}*\n\n${no}\nTanggal: ${tgl}\n\nTerima kasih atas partisipasi dan kepercayaan Anda.\n\n*Telah diterima/disalurkan:* ${nominal}\n*Keterangan:* ${ket}\n\nSemoga menjadi amal yang berkah dan diridhai Allah SWT. Aamiin.\n\n_Sistem Bendahara Terpadu_`)}`, '_blank');
}

// =====================================================================
// --- 11. MENDAFTARKAN SEMUA FUNGSI KE WINDOW ---
// =====================================================================
window.togglePasswordVisibility = togglePasswordVisibility; window.toggleModeAuth = toggleModeAuth; window.recoverPasswordEmail = recoverPasswordEmail;
window.switchTab = switchTab; window.toggleSidebar = toggleSidebar; window.logout = logout; window.loadAllCloudData = loadAllCloudData;
window.bukaKalkulatorAmil = bukaKalkulatorAmil; window.updateCategories = updateCategories; window.cancelEditTrx = cancelEditTrx;
window.refreshUI = refreshUI; window.clearFilters = clearFilters; window.cetakBukuBesarPDF = cetakBukuBesarPDF; window.buildReport = buildReport;
window.cetakPDF = cetakPDF; window.editTrx = editTrx; window.hapusTrx = hapusTrx; window.hapusMustahik = hapusMustahik;
window.resetPosterFilter = resetPosterFilter; window.buildPoster = buildPoster; window.cetakPosterPDF = cetakPosterPDF;
window.downloadCanvasAsVideo = downloadCanvasAsVideo; window.importDataFromFile = importDataFromFile; window.syncCloudDrive = syncCloudDrive;
window.backupData = backupData; window.eksekusiTutupBuku = eksekusiTutupBuku; window.loadArsip = loadArsip; window.simpanProfil = simpanProfil;
window.tambahAnggota = tambahAnggota; window.hapusAnggota = hapusAnggota; window.openKuitansi = openKuitansi; window.closeKuitansi = closeKuitansi;
window.cetakKuitansiPDF = cetakKuitansiPDF; window.kirimKuitansiWA = kirimKuitansiWA;

// =====================================================================
// --- 12. MENJALANKAN APLIKASI SAAT DOM SIAP ---
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
    initAudioPlayer();
    const tDateObj = document.getElementById('t-date');
    if(tDateObj) tDateObj.valueAsDate = new Date();
    
    const filterMonthObj = document.getElementById('filter-month');
    if(filterMonthObj) filterMonthObj.value = new Date().toISOString().slice(0, 7);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js?v=pro4')
            .then((reg) => console.log('Sistem PWA Pro aktif.', reg))
            .catch((err) => console.error('PWA gagal dimuat.', err));
    }

    async function prosesLogin() {
        const email = document.getElementById('l-user').value.trim().toLowerCase();
        const pass = document.getElementById('l-pass').value;
        const rantingName = document.getElementById('l-ranting') ? document.getElementById('l-ranting').value.trim() : "";
        const rememberObj = document.getElementById('remember-me');
        const remember = rememberObj ? rememberObj.checked : false;

        if(!email || !pass) {
            showToast("Harap isi Email dan Kata Sandi terlebih dahulu!", "error");
            return;
        }

        try {
            const btnSubmit = document.getElementById('btn-auth-submit');
            if(btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
            
            const persistenceType = remember ? window.authServices.browserLocalPersistence : window.authServices.browserSessionPersistence;
            await window.authServices.setPersistence(window.auth, persistenceType);

            if (isRegisterMode) {
                localStorage.setItem('temp_ranting', rantingName);
                const userCredential = await window.authServices.createUserWithEmailAndPassword(window.auth, email, pass);
                await window.fs.setDoc(window.fs.doc(window.db, "users", userCredential.user.uid), { email: email, ranting: rantingName, role: 'bendahara' });
                showToast("Pendaftaran Berhasil!", "success");
            } else {
                await window.authServices.signInWithEmailAndPassword(window.auth, email, pass);
            }
        } catch (error) {
            const btnSubmit = document.getElementById('btn-auth-submit');
            if(btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem Terpadu';
            
            let errMsg = "Email / Sandi tidak tepat.";
            if(error.code === 'auth/invalid-credential') errMsg = "Kredensial tidak valid.";
            else if(error.code === 'auth/network-request-failed') errMsg = "Koneksi internet terputus.";
            
            showToast(errMsg, "error");
        }
    }

    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            await prosesLogin();
        });
    }

    const btnSubmit = document.getElementById('btn-auth-submit');
    if (btnSubmit) {
        btnSubmit.addEventListener('click', async (e) => {
            e.preventDefault();
            await prosesLogin();
        });
    }

    window.authServices.onAuthStateChanged(window.auth, async (user) => {
        if (user) {
            try {
                let userDoc = await window.fs.getDoc(window.fs.doc(window.db, "users", user.uid));
                if(userDoc.exists()) {
                    asalRanting = userDoc.data().ranting || "Karangdowo"; currentUserRole = userDoc.data().role || "bendahara"; localStorage.removeItem('temp_ranting'); 
                } else { asalRanting = localStorage.getItem('temp_ranting') || "Karangdowo"; currentUserRole = 'bendahara'; }
            } catch(e) { asalRanting = localStorage.getItem('temp_ranting') || "Karangdowo"; currentUserRole = 'bendahara'; }
            
            sessionStorage.setItem('upzis_role', currentUserRole);
            const dt = document.getElementById('desktop-date'); if(dt) dt.innerText = "SISTEM BENDAHARA TERPADU - UPZIS RANTING " + asalRanting.toUpperCase();
            
            showApp(); loadAllCloudData();
        } else {
            document.getElementById('app-screen').classList.add('hidden'); document.getElementById('auth-screen').classList.remove('hidden');
        }
    });

    const formUsername = document.getElementById('form-username');
    if (formUsername) formUsername.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        showToast('Fitur ubah Username sedang dalam tahap pengembangan.', 'info'); 
    });

    const formPassword = document.getElementById('form-password');
    if (formPassword) formPassword.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        showToast('Fitur ubah Password sedang dalam tahap pengembangan.', 'info'); 
    });
});

// =====================================================================
// --- 13. SISTEM PEMANTAU EROR GLOBAL (GLOBAL ERROR HANDLER) ---
// =====================================================================
window.addEventListener('error', function(event) {
    console.error("[Sistem Error]: ", event.message);
});

window.addEventListener('unhandledrejection', function(event) {
    if (typeof showToast === "function") {
        console.warn("[Background Process]: Sedang memproses...");
    }
});
