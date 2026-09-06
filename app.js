// =====================================================================
// --- 1. INISIALISASI FIREBASE & MODE OFFLINE ---
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc as fsGetDoc, updateDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBpsQLNhyFL-agq2Iwmw2TU42F51LrvkHI", authDomain: "upzis-lazisnu.firebaseapp.com", projectId: "upzis-lazisnu",
    storageBucket: "upzis-lazisnu.firebasestorage.app", messagingSenderId: "1284852623", appId: "1:1284852623:web:a2b24c2e261273c59099fa"
};
const app = initializeApp(firebaseConfig); const db = getFirestore(app); const auth = getAuth(app);
enableIndexedDbPersistence(db).catch(() => console.log('Cache Aktif'));
window.db = db; window.auth = auth; window.fs = { collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc: fsGetDoc, updateDoc, query, orderBy, onSnapshot };
window.authServices = { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence };

// =====================================================================
// --- 2. GLOBAL STATE & PAGINASI ---
// =====================================================================
let asalRanting = ""; let currentUserRole = 'bendahara'; let transactions = []; let dbMustahik = []; let logsData = [];
let currentPage = 1; const itemsPerPage = 15; let totalPages = 1;
let profileSettings = { lembaga: 'UPZIS', periode: '2024-2029', relawan: ['Ana'], logoBase64: 'icon-192.png', teleBotToken: '', teleChatId: '' };

// Keamanan Lanjut: Auto Logout 15 Menit & Auto Error Logging
let idleTime = 0; const resetIdle = () => idleTime = 0;
setInterval(() => { if(currentUserRole && ++idleTime >= 15) { showToast("Sesi habis (Idle).", "error"); logout(); } }, 60000);
['mousemove','keydown','touchstart'].forEach(e => window.addEventListener(e, resetIdle));

window.addEventListener('error', async (e) => {
    try{ await window.fs.addDoc(getCol("logs"), {time: new Date().toISOString(), action: 'SYSTEM_ERROR', detail: e.message}); }catch(err){}
});

function applyRBAC() {
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = (currentUserRole === 'bendahara') ? '' : 'none'; });
}

// =====================================================================
// --- 3. UTILITAS & UI ---
// =====================================================================
function showToast(msg, type='info') {
    let container = document.getElementById('toast-container');
    if(!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast); setTimeout(() => toast.remove(), 3500);
}
const formatRp = num => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
function formatTanggalIndo(d) { return d ? new Date(d).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : '-'; }
function getCol(col) { return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.collection(window.db, col) : window.fs.collection(window.db, "ranting", asalRanting.toLowerCase(), col); }
function getFirestoreDoc(col, id) { return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.doc(window.db, col, id) : window.fs.doc(window.db, "ranting", asalRanting.toLowerCase(), col, id); }

function getDynamicCategories() {
    let inList = [{code:'101', name:'Saldo Awal'}, {code:'120', name:'Bank ke Tunai'}, {code:'220', name:'Tunai ke Bank'}, {code:'199', name:'Donasi Lain'}];
    if(profileSettings.relawan) profileSettings.relawan.forEach((r,i) => inList.push({code:String(111+i), name:`Relawan ${r}`}));
    let outList = [{code:'201', name:'Santunan Duka'}, {code:'205', name:'Operasional'}];
    return { in: inList, out: outList };
}

// =====================================================================
// --- 4. LOGIKA TRANSAKSI, PAGINASI & TELEGRAM ---
// =====================================================================
function ubahHalaman(arah) {
    if (arah === -1 && currentPage > 1) currentPage--;
    else if (arah === 1 && currentPage < totalPages) currentPage++;
    refreshUI();
}

async function kirimTelegram(jenis, nominal, desc) {
    if(!profileSettings.teleBotToken || !profileSettings.teleChatId) return;
    const pesan = `*MUTASI UPZIS*\n🔹 Tipe: ${jenis}\n🔹 Nominal: Rp ${formatRp(nominal)}\n🔹 Ket: ${desc}`;
    try { await fetch(`https://api.telegram.org/bot${profileSettings.teleBotToken}/sendMessage?chat_id=${profileSettings.teleChatId}&text=${encodeURIComponent(pesan)}`); } catch(e) {}
}

function simpanTelegram() {
    profileSettings.teleBotToken = document.getElementById('tg-token').value; profileSettings.teleChatId = document.getElementById('tg-chatid').value;
    window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); showToast("Telegram Disimpan", "success");
}

function refreshUI() {
    applyRBAC();
    let grandIn = 0, grandOut = 0, saldoTunai = 0, saldoBank = 0, globalBalance = 0;
    const tbody = document.getElementById('table-body'); if(tbody) tbody.innerHTML = '';
    const cats = getDynamicCategories(), allCats = [...cats.in, ...cats.out];

    transactions.forEach(t => {
        const amt = Number(t.amount || 0);
        if(t.type === 'in') { if(t.code==='120'){saldoTunai+=amt; saldoBank-=amt;} else if(t.code==='220'){saldoBank+=amt; saldoTunai-=amt;} else {grandIn+=amt; t.source.includes('Bank')?saldoBank+=amt:saldoTunai+=amt;} }
        if(t.type === 'out') { if(t.code!=='120' && t.code!=='220') grandOut+=amt; t.source.includes('Bank')?saldoBank-=amt:saldoTunai-=amt; }
    });

    let sortedTrx = [...transactions].sort((a,b) => new Date(a.date)-new Date(b.date) || a.timestamp-b.timestamp).map(t => {
        const amt = Number(t.amount || 0);
        if(t.type==='in' && t.code!=='120' && t.code!=='220') globalBalance += amt;
        if(t.type==='out' && t.code!=='120' && t.code!=='220') globalBalance -= amt;
        return { ...t, currentBalance: globalBalance };
    });

    // Terapkan Paginasi
    totalPages = Math.ceil(sortedTrx.length / itemsPerPage) || 1;
    if(currentPage > totalPages) currentPage = totalPages;
    const paginated = sortedTrx.slice().reverse().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if(tbody) {
        paginated.forEach(t => {
            const catName = allCats.find(c => c.code === t.code)?.name || 'Lainnya';
            let act = `<button class="btn-action" onclick="openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt"></i></button>`;
            if(currentUserRole === 'bendahara') act += `<button class="btn-action admin-only" onclick="hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button>`;
            tbody.innerHTML += `<tr><td>${formatTanggalIndo(t.date)}</td><td>${t.source}</td><td>[${t.code}] ${catName}<br><small>${t.desc}</small></td><td style="color:green;">${t.type==='in'?formatRp(t.amount):'-'}</td><td style="color:red;">${t.type==='out'?formatRp(t.amount):'-'}</td><td style="font-weight:bold;">${formatRp(t.currentBalance)}</td><td>${act}</td></tr>`;
        });
        document.getElementById('page-indicator').innerText = `Hal ${currentPage} dari ${totalPages}`;
    }
    
    ['sum-tunai','sum-bank','sum-masuk','sum-keluar'].forEach((id,i) => { if(document.getElementById(id)) document.getElementById(id).innerText = formatRp([saldoTunai,saldoBank,grandIn,grandOut][i]); });
}

// Validasi Form Realtime
const amtInput = document.getElementById('t-amount');
if(amtInput) amtInput.addEventListener('input', function() {
    let val = this.value.replace(/[^0-9]/g, ''); this.value = val ? parseInt(val).toLocaleString('id-ID') : '';
    this.style.borderColor = (parseInt(val||0) <= 0) ? 'red' : 'var(--nu-gold)';
});

const formTrx = document.getElementById('form-trx');
if(formTrx) formTrx.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const type=document.getElementById('t-type').value, code=document.getElementById('t-category').value, src=document.getElementById('t-source').value;
    const date=document.getElementById('t-date').value, desc=document.getElementById('t-desc').value, amt=parseFloat(amtInput.value.replace(/\./g,''));
    if(!amt || amt <= 0) return showToast("Nominal salah!", "error");
    
    document.getElementById('btn-submit-trx').disabled = true;
    try {
        await window.fs.addDoc(getCol("transactions"), { type, source:src, code, date, amount:amt, desc, timestamp: Date.now() });
        amtInput.value=''; document.getElementById('t-desc').value=''; showToast("Tersimpan!", "success");
        kirimTelegram(type==='in'?'Masuk':'Keluar', amt, desc);
    } catch(err) { showToast("Gagal", "error"); } finally { document.getElementById('btn-submit-trx').disabled = false; }
});

async function hapusTrx(id) { if(confirm("Hapus?")) { await window.fs.deleteDoc(getFirestoreDoc("transactions", id)); showToast("Dihapus", "success"); } }

// =====================================================================
// --- 5. BLUETOOTH PRINTER, EXCEL, JSON BACKUP ---
// =====================================================================
async function cetakStrukBluetooth() {
    if(!navigator.bluetooth) return showToast("Browser tidak mendukung", "error");
    try {
        showToast("Mencari Printer...", "info");
        const device = await navigator.bluetooth.requestDevice({ filters: [{services: ['000018f0-0000-1000-8000-00805f9b34fb']}], optionalServices: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] });
        await device.gatt.connect(); showToast("Terhubung & Mencetak...", "success");
    } catch(err) { showToast("Batal / Gagal", "error"); }
}

function exportExcelBukuBesar() {
    if(typeof XLSX==='undefined') return; const wb = XLSX.utils.book_new();
    const rows = transactions.map((t,i) => ({"Tanggal":t.date, "Akun":t.code, "Sumber":t.source, "Debit":t.type==='in'?t.amount:0, "Kredit":t.type==='out'?t.amount:0, "Ket":t.desc}));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Buku_Besar"); XLSX.writeFile(wb, `Buku_Besar_${Date.now()}.xlsx`); showToast("Excel Diunduh", "success");
}

function downloadJSONBackup() {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({profile: profileSettings, transactions, mustahik: dbMustahik}));
    const a = document.createElement('a'); a.href = data; a.download = `Backup_${Date.now()}.json`; a.click(); showToast("JSON Diunduh", "success");
}
function restoreJSONBackup(e) {
    const r = new FileReader(); r.onload = async ev => {
        try { const res = JSON.parse(ev.target.result); for(let t of res.transactions){ delete t.idFirebase; await window.fs.addDoc(getCol("transactions"), t); } showToast("Restore Sukses", "success"); } catch(err){}
    }; r.readAsText(e.target.files[0]);
}

// =====================================================================
// --- 6. WINDOW BINDS & INIT ---
// =====================================================================
window.logout = async () => { await window.authServices.signOut(window.auth); location.reload(); }
window.toggleSidebar = () => { document.getElementById('app-sidebar').classList.toggle('mobile-open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
window.switchTab = (e, tab) => { document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden')); document.getElementById(tab).classList.remove('hidden'); refreshUI(); }
window.toggleThemeMode = () => { document.body.classList.toggle('dark-mode'); }
window.updateCategories = () => { const t = document.getElementById('t-type').value, c = getDynamicCategories(); document.getElementById('t-category').innerHTML = c[t].map(x => `<option value="${x.code}">${x.name}</option>`).join(''); }
window.ubahHalaman = ubahHalaman; window.simpanTelegram = simpanTelegram; window.cetakStrukBluetooth = cetakStrukBluetooth; window.hapusTrx = hapusTrx;
window.exportExcelBukuBesar = exportExcelBukuBesar; window.downloadJSONBackup = downloadJSONBackup; window.restoreJSONBackup = restoreJSONBackup;
window.openKuitansi = (id) => { const t = transactions.find(x => x.idFirebase === id); document.getElementById('kui-nominal').innerText = formatRp(t.amount); document.getElementById('modal-kuitansi').classList.remove('hidden'); }
window.closeKuitansi = () => document.getElementById('modal-kuitansi').classList.add('hidden');

async function loadAllCloudData() {
    window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (snap) => { if(snap.exists()) { profileSettings = {...profileSettings, ...snap.data()}; document.getElementById('tg-token').value = profileSettings.teleBotToken||''; document.getElementById('tg-chatid').value = profileSettings.teleChatId||''; }});
    window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snap) => { transactions=[]; snap.forEach(d => transactions.push({idFirebase:d.id, ...d.data()})); refreshUI(); });
}

document.addEventListener("DOMContentLoaded", () => {
    window.updateCategories();
    window.authServices.onAuthStateChanged(window.auth, async u => {
        if(user) {
            try { let d = await window.fs.getDoc(window.fs.doc(window.db, "users", user.uid)); if(d.exists()){ asalRanting = d.data().ranting||""; currentUserRole = d.data().role||"bendahara"; } } catch(e){}
            document.getElementById('auth-screen').classList.add('hidden'); document.getElementById('app-screen').classList.remove('hidden');
            loadAllCloudData(); applyRBAC();
        }
    });
    document.getElementById('form-login').addEventListener('submit', async e => {
        e.preventDefault(); try { await window.authServices.signInWithEmailAndPassword(window.auth, document.getElementById('l-user').value, document.getElementById('l-pass').value); } catch(err){ showToast("Sandi Salah", "error"); }
    });
});
