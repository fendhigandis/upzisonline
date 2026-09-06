// =====================================================================
// --- 1. INISIALISASI FIREBASE & MODE OFFLINE ---
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc as fsGetDoc, updateDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence, EmailAuthProvider, reauthenticateWithCredential, updatePassword, GoogleAuthProvider, linkWithPopup } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBpsQLNhyFL-agq2Iwmw2TU42F51LrvkHI", authDomain: "upzis-lazisnu.firebaseapp.com", projectId: "upzis-lazisnu",
    storageBucket: "upzis-lazisnu.firebasestorage.app", messagingSenderId: "1284852623", appId: "1:1284852623:web:a2b24c2e261273c59099fa"
};
const app = initializeApp(firebaseConfig); const db = getFirestore(app); const auth = getAuth(app);
enableIndexedDbPersistence(db).catch(() => console.log('Cache Aktif'));
window.db = db; window.auth = auth; window.fs = { collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc: fsGetDoc, updateDoc, query, orderBy, onSnapshot };
window.authServices = { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword, GoogleAuthProvider, linkWithPopup };

// =====================================================================
// --- 2. GLOBAL STATE & FITUR DATABASE BARU ---
// =====================================================================
let asalRanting = ""; let currentUserRole = 'bendahara'; let isRegisterMode = false; window.activeKontenText = null;
let transactions = []; let dbMustahik = []; let logsData = []; 
let dbInventaris = []; let dbAgenda = []; let dbTodos = []; 
let currentPage = 1; const itemsPerPage = 15; let totalPages = 1; 
let profileSettings = { lembaga: 'UPZIS', periode: '2024-2029', relawan: ['Ana'], logoBase64: 'icon-192.png', teleBotToken: '', teleChatId: '', anggota: [] };

let idleTime = 0; const resetIdle = () => idleTime = 0;
setInterval(() => { if(currentUserRole && ++idleTime >= 15) { showToast("Sesi habis (Idle).", "error"); window.logout(); } }, 60000);
['mousemove','keydown','touchstart','scroll'].forEach(e => window.addEventListener(e, resetIdle));

window.addEventListener('error', async (e) => { try{ await window.fs.addDoc(getCol("logs"), {time: new Date().toISOString(), action: 'SYSTEM_ERROR', detail: e.message}); }catch(err){} });
function applyRBAC() { document.querySelectorAll('.admin-only').forEach(el => { el.style.display = (currentUserRole === 'bendahara') ? '' : 'none'; }); }

// =====================================================================
// --- 3. UTILITAS DASAR ---
// =====================================================================
function showToast(msg, type='info') {
    let container = document.getElementById('toast-container');
    if(!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast); setTimeout(() => toast.remove(), 3500);
}
const formatRp = num => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
function formatTanggalIndo(d) { return d ? new Date(d).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : '-'; }
// getCol/getFirestoreDoc: perbaikan path saat menggunakan "ranting" subcollections
function getCol(col) { 
    try {
        if(!asalRanting || asalRanting.toLowerCase() === "karangdowo") return window.fs.collection(window.db, col);
        return window.fs.collection(window.db, "ranting", asalRanting.toLowerCase(), col);
    } catch(err) { console.error('getCol error', err); return window.fs.collection(window.db, col); }
}
function getFirestoreDoc(col, id) { 
    try {
        if(!asalRanting || asalRanting.toLowerCase() === "karangdowo") return window.fs.doc(window.db, col, id);
        return window.fs.doc(window.db, "ranting", asalRanting.toLowerCase(), col, id);
    } catch(err) { console.error('getFirestoreDoc error', err); return window.fs.doc(window.db, col, id); }
}

function getDynamicCategories() {
    let inList = [{code:'101', name:'Saldo Awal'}, {code:'120', name:'Bank ke Tunai'}, {code:'220', name:'Tunai ke Bank'}, {code:'199', name:'Donasi Lain'}];
    if(profileSettings.relawan) profileSettings.relawan.forEach((r,i) => inList.push({code:String(111+i), name:`Relawan ${r}`}));
    let outList = [{code:'201', name:'Santunan Duka'}, {code:'205', name:'Operasional'}];
    return { in: inList, out: outList };
}

function compressImageBase64(file, callback) {
    const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); let w = img.width, h = img.height; if (w > 1200) { h = Math.round(h * (1200 / w)); w = 1200; } canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h); const quality = 0.8; const base64 = canvas.toDataURL('image/jpeg', quality); callback(base64); }; img.src = e.target.result; }; reader.readAsDataURL(file); }

// =====================================================================
// --- 4. LOGIKA TRANSAKSI UTAMA, FILTER, & PAGINASI ---
// =====================================================================
window.ubahHalaman = function(arah) { if (arah === -1 && currentPage > 1) currentPage--; else if (arah === 1 && currentPage < totalPages) currentPage++; refreshUI(); }
async function kirimTelegram(jenis, nominal, desc) {
    if(!profileSettings.teleBotToken || !profileSettings.teleChatId) return;
    const pesan = `*MUTASI UPZIS*\n🔹 Tipe: ${jenis}\n🔹 Nominal: ${formatRp(nominal)}\n🔹 Ket: ${desc}`;
    try { await fetch(`https://api.telegram.org/bot${profileSettings.teleBotToken}/sendMessage?chat_id=${profileSettings.teleChatId}&text=${encodeURIComponent(pesan)}`); } catch(e) {}
}
window.simpanTelegram = function() { try{ profileSettings.teleBotToken = document.getElementById('tg-token').value; profileSettings.teleChatId = document.getElementById('tg-chatid').value; window.fs.setDoc(getFirestoreDoc("settings","profile"), profileSettings);}catch(e){} }

function refreshUI() {
    applyRBAC(); let grandIn = 0, grandOut = 0, saldoTunai = 0, saldoBank = 0, globalBalance = 0;
    const tbody = document.getElementById('table-body'); if(tbody) tbody.innerHTML = '';
    const cats = getDynamicCategories(), allCats = [...cats.in, ...cats.out];

    transactions.forEach(t => {
        const amt = Number(t.amount || 0);
        if(t.type === 'in') { if(t.code==='120'){saldoTunai+=amt; saldoBank-=amt;} else if(t.code==='220'){saldoBank+=amt; saldoTunai-=amt;} else {grandIn+=amt; if(t.source && t.source.includes('Bank')) saldoBank+=amt; else saldoTunai+=amt;} }
        if(t.type === 'out') { if(t.code!=='120' && t.code!=='220') grandOut+=amt; if(t.source && t.source.includes('Bank')) saldoBank-=amt; else saldoTunai-=amt; }
    });

    const key = (document.getElementById('search-keyword')?.value||'').toLowerCase();
    const st = document.getElementById('filter-start-date')?.value||'', en = document.getElementById('filter-end-date')?.value||'';
    const ft = document.getElementById('filter-type')?.value||'';
    const minNom = parseFloat(document.getElementById('filter-min')?.value) || 0;
    const maxNom = parseFloat(document.getElementById('filter-max')?.value) || Infinity;

    let sortedTrx = [...transactions].sort((a,b) => new Date(a.date)-new Date(b.date) || a.timestamp-b.timestamp).map(t => {
        const amt = Number(t.amount || 0);
        if(t.type==='in' && t.code!=='120' && t.code!=='220') globalBalance += amt;
        if(t.type==='out' && t.code!=='120' && t.code!=='220') globalBalance -= amt;
        return { ...t, currentBalance: globalBalance };
    }).filter(t => {
        const catName = allCats.find(c => c.code === t.code)?.name.toLowerCase() || '';
        const matchK = (t.desc||'').toLowerCase().includes(key) || catName.includes(key);
        return matchK && (!st || t.date >= st) && (!en || t.date <= en) && (!ft || t.type === ft) && (t.amount >= minNom && t.amount <= maxNom);
    });

    totalPages = Math.ceil(sortedTrx.length / itemsPerPage) || 1;
    if(currentPage > totalPages) currentPage = totalPages;
    const paginated = sortedTrx.slice().reverse().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if(tbody) {
        paginated.forEach(t => {
            const catName = allCats.find(c => c.code === t.code)?.name || 'Lainnya';
            let act = `<button class="btn-action" onclick="window.openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt"></i></button>`;
            if(currentUserRole === 'bendahara') act += `<button class="btn-action admin-only" onclick="window.hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button>`;
            tbody.innerHTML += `<tr><td>${formatTanggalIndo(t.date)}</td><td>${t.source}</td><td>[${t.code}] ${catName}<br><small>${t.desc}</small></td><td style="color:green;">${t.type==='in'?formatRp(t.amount):'-'}</td><td style="color:red;">${t.type==='out'?formatRp(t.amount):'-'}</td><td>${formatRp(t.currentBalance||0)}</td><td>${act}</td></tr>`;
        });
        const pgIndicator = document.getElementById('page-indicator'); if(pgIndicator) pgIndicator.innerText = `Hal ${currentPage} dari ${totalPages}`;
    }
    ['sum-tunai','sum-bank','sum-masuk','sum-keluar'].forEach((id,i) => { const el = document.getElementById(id); if(el) el.innerText = formatRp([saldoTunai,saldoBank,grandIn,grandOut][i]); });
}

const amtInput = document.getElementById('t-amount');
if(amtInput) amtInput.addEventListener('input', function() {
    let val = this.value.replace(/[^0-9]/g, ''); this.value = val ? parseInt(val).toLocaleString('id-ID') : '';
    this.style.borderColor = (parseInt(val||0) <= 0) ? 'red' : 'var(--nu-gold)';
});

const formTrx = document.getElementById('form-trx');
if(formTrx) formTrx.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const type=document.getElementById('t-type').value, code=document.getElementById('t-category').value, src=document.getElementById('t-source').value;
    const date=document.getElementById('t-date').value, desc=document.getElementById('t-desc').value, amt=parseFloat((amtInput?.value||'').replace(/\./g,''));
    if(!amt || amt <= 0) return showToast("Nominal salah!", "error");
    const btnSubmit = document.getElementById('btn-submit-trx'); if(btnSubmit) btnSubmit.disabled = true;
    try { await window.fs.addDoc(getCol("transactions"), { type, source:src, code, date, amount:amt, desc, timestamp: Date.now() });
        if(amtInput) amtInput.value=''; if(document.getElementById('t-desc')) document.getElementById('t-desc').value=''; showToast("Tersimpan!", "success"); kirimTelegram(type==='in'?'Masuk':'Keluar', amt, desc);
    } catch(err) { showToast("Gagal", "error"); } finally { if(btnSubmit) btnSubmit.disabled = false; }
});
window.hapusTrx = async function(id) { if(confirm("Hapus?")) { try{ await window.fs.deleteDoc(getFirestoreDoc("transactions", id)); showToast("Dihapus", "success"); }catch(e){ showToast("Gagal Hapus", "error"); } } }

// =====================================================================
// --- 5. RENDER MENU GRAFIK, LAPORAN & KONTEN AUTO 12-JAM ---
// =====================================================================
function renderCharts() {
    if (typeof Chart === 'undefined') return;
    let md = {}; let tIn = 0, tOut = 0; let cOut = {};
    transactions.forEach(t => {
        if (!t || !t.date) return; const m = t.date.slice(0, 7), amt = Number(t.amount || 0);
        if (!md[m]) md[m] = { in: 0, out: 0 };
        if (t.type === 'in' && t.code !== '120' && t.code !== '220') { md[m].in += amt; tIn += amt; } 
        else if (t.type === 'out' && t.code !== '120' && t.code !== '220') { md[m].out += amt; tOut += amt; cOut[t.code] = (cOut[t.code] || 0) + amt; }
    });
    const sm = Object.keys(md).sort(); const lm = sm.map(m => new Date(m.split('-')[0], m.split('-')[1]-1, 1).toLocaleString('id-ID', {month:'short', year:'numeric'}));
    const di = sm.map(m => md[m].in), doOut = sm.map(m => md[m].out);
    
    const c1 = document.getElementById('chartTrenBulanan');
    if(c1) { if(window.mc1) window.mc1.destroy(); window.mc1 = new Chart(c1.getContext('2d'), { type:'line', data:{labels:lm.length?lm:['Kosong'], datasets:[{label:'Masuk', data:di.length?di:[0], backgroundColor:'#0ea5a2', borderColor:'#047857', fill:false}]}, options:{responsive:true}}); }
    const c2 = document.getElementById('chartArusKas');
    if(c2) { if(window.mc2) window.mc2.destroy(); window.mc2 = new Chart(c2.getContext('2d'), { type:'bar', data:{labels:['Total'], datasets:[{label:'Masuk', data:[tIn], backgroundColor:'#005a2b'},{label:'Keluar', data:[tOut], backgroundColor:'#b91c1c'}]}, options:{responsive:true}}); }
    const c3 = document.getElementById('chartPenyaluran');
    if(c3) { if(window.mc3) window.mc3.destroy(); window.mc3 = new Chart(c3.getContext('2d'), { type:'doughnut', data:{labels:Object.keys(cOut).length?Object.keys(cOut):['Kosong'], datasets:[{data:Object.values(cOut).length?Object.values(cOut):[1], backgroundColor:['#ef4444','#f59e0b','#10b981']}]} ); }
}

window.buildReport = function() {
    let fStr = document.getElementById('filter-month')?.value;
    if(!fStr) { fStr = new Date().toISOString().slice(0, 7); if(document.getElementById('filter-month')) document.getElementById('filter-month').value = fStr; }
    if(document.getElementById('lap-periode')) document.getElementById('lap-periode').innerText = `Bulan: ${fStr}`;
    let sIn={}, sOut={}, tIn=0, tOut=0, sAw=0, sT=0, sB=0;
    transactions.forEach(t => {
        const m=t.date.slice(0,7), amt=Number(t.amount||0);
        if(m<fStr) { if(t.type==='in'&&t.code!=='120'&&t.code!=='220')sAw+=amt; if(t.type==='out'&&t.code!=='120'&&t.code!=='220')sAw-=amt; }
        if(m<=fStr){ if(t.type==='in'){ if(t.code==='120'){sT+=amt;sB-=amt;}else if(t.code==='220'){sB+=amt;sT-=amt;}else{t.source&&t.source.includes('Bank')?sB+=amt:sT+=amt;} } if(t.type==='out'){t.source&&t.source.includes('Bank')?sB-=amt:sT-=amt; } }
        if(m===fStr){ if(t.type==='in'){ sIn[t.code]=(sIn[t.code]||0)+amt; if(t.code!=='120'&&t.code!=='220')tIn+=amt; } if(t.type==='out'){ sOut[t.code]=(sOut[t.code]||0)+amt; if(t.code!=='120'&&t.code!=='220')tOut+=amt; } }
    });
    if(document.getElementById('lap-saldo-awal')) document.getElementById('lap-saldo-awal').innerText = formatRp(sAw);
    if(document.getElementById('lap-tot-masuk')) document.getElementById('lap-tot-masuk').innerText = formatRp(tIn); 
    if(document.getElementById('lap-tot-keluar')) document.getElementById('lap-tot-keluar').innerText = formatRp(tOut); 
    if(document.getElementById('lap-saldo-akhir')) document.getElementById('lap-saldo-akhir').innerText = formatRp(sT+sB);
}

window.buildPoster = function() {
    let tIn = 0; transactions.forEach(t => { if(t.type === 'in' && t.code !== '120' && t.code !== '220' && t.code !== '101') tIn += Number(t.amount || 0); });
    if(document.getElementById('poster-in')) document.getElementById('poster-in').innerText = formatRp(tIn);
}

// SOSIALISASI AUTO-12 HOURS
function renderKontenHarian() {
    const c = document.getElementById('konten-harian-container');
    if(!c || c.innerHTML.includes('select')) return; 
    c.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:25px;">
        <div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color);">
            <h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-pen-to-square"></i> Konten Harian (Auto)</h4>
            <div class="form-group"><label>Pratinjau Teks Edukasi Terkini</label><textarea id="teks-kampanye" rows="6"></textarea></div>
            <div style="display:flex; gap:10px;"><button onclick="window.navigator.clipboard.writeText(document.getElementById('teks-kampanye').value); showToast('Disalin!','success');" class="btn btn-outline">Salin</button><a id="btn-wa-kampanye" class="btn btn-primary" href="#" target="_blank">Bagikan WA</a></div>
        </div>
        <div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color); text-align:center;">
            <h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-film"></i> Pratinjau Video AI</h4>
            <canvas id="video-canvas" width="800" height="800" style="width:100%; max-width:280px; border-radius:12px; background:#012a14; margin-bottom:20px;"></canvas>
            <button id="btn-download-video" onclick="window.downloadCanvasAsVideo()" class="btn btn-primary" style="width:100%;">Unduh Video MP4</button>
        </div>
    </div>`;
    window.updateKampanyePreview();
}

window.updateKampanyePreview = function() {
    const templates = [
        { judul: "Pahala Berlipat", teks: "Perumpamaan orang yang menginfakkan hartanya di jalan Allah seperti sebutir biji... (Al-Baqarah: 261)" },
        { judul: "Pembersih Harta", teks: "Ambillah zakat dari sebagian harta mereka, dengan zakat itu kamu membersihkan mereka... (At-Taubah: 103)" },
        { judul: "Tolak Bala", teks: "Bersegeralah bersedekah, sebab bala bencana tidak pernah bisa mendahului sedekah. (HR. Thabrani)" },
        { judul: "Sedekah Subuh", teks: "Tiada pagi hari melainkan dua malaikat turun untuk mendoakan orang yang bersedekah... (Muttafaqun Alaih)" }
    ];
    const hourSegment = Math.floor(new Date().getHours() / 12); // Pagi (0) dan Malam (1)
    const index = (new Date().getDate() + hourSegment) % templates.length; // Otomatis rotasi 12 Jam
    window.activeKontenText = templates[index]; 
    
    const txt = `*${templates[index].judul}*\n\n"${templates[index].teks}"\n\nMari salurkan ZIS Anda via UPZIS Ranting.`;
    if(document.getElementById('teks-kampanye')) document.getElementById('teks-kampanye').value = txt; 
    if(document.getElementById('btn-wa-kampanye')) document.getElementById('btn-wa-kampanye').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`;
    
    const cvs = document.getElementById('video-canvas'); if(!cvs) return; const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#012a14'; ctx.fillRect(0,0,800,800); ctx.fillStyle = '#d4af37'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(templates[index].judul, 400, 400);
}

// =====================================================================
// --- 6. LOGIKA 10 FITUR BARU ENTERPRISE (ARSIP DOWNLOAD, GOOGLE AUTH, PENGURUS KOMPLEKS) ---
// =====================================================================

// FITUR BARU: Download Arsip Terpusat
window.loadArsip = async function() {
    const year = document.getElementById('input-arsip-year')?.value; if(!year) return; showToast(`Mencari arsip ${year}...`, "info");
    try { 
        const snap = await window.fs.getDocs(window.fs.query(getCol(`arsip_${year}_transactions`), window.fs.orderBy("date", "asc"))); 
        let html = ''; snap.forEach(d => { const t = d.data(); html += `<tr><td>${t.date}</td><td>${t.source}</td><td>${t.desc}</td><td>${t.type==='in'?formatRp(t.amount):'-'}</td><td>${t.type==='out'?formatRp(t.amount):'-'}</td></tr>`; });
        const tbody = document.getElementById('table-arsip-body'); if(tbody) tbody.innerHTML = html || '<tr><td colspan="5">Tidak ada arsip</td></tr>';
        if(!snap.empty) { const bar = document.getElementById('arsip-action-bar'); if(bar) bar.classList.remove('hidden'); }
        window.currentArsipYear = year; window.currentArsipData = snap.docs.map(d => d.data());
        showToast("Arsip dimuat.", "success"); 
    } catch(e) { showToast("Gagal memuat arsip.", "error"); }
}

window.downloadArsip = function(format) {
    if(!window.currentArsipData || window.currentArsipData.length === 0) return;
    if(confirm(`Konfirmasi: Anda yakin ingin mengunduh arsip ${window.currentArsipYear} dalam format ${format.toUpperCase()}?`)) {
        const data = window.currentArsipData;
        if(format === 'csv') {
            const csv = "Tanggal,Sumber,Ket,Debit,Kredit\n" + data.map(t => `${t.date},${t.source},${t.desc},${t.type==='in'?t.amount:0},${t.type==='out'?t.amount:0}`).join("\n");
            const a = document.createElement('a'); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = `Arsip_${window.currentArsipYear}.csv`; a.click();
        } else if(format === 'excel' && typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Arsip"); XLSX.writeFile(wb, `Arsip_${window.currentArsipYear}.xlsx`);
        } else if(format === 'json') {
            const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = `Arsip_${window.currentArsipYear}.json`; a.click();
        }
        showToast(`Arsip ${format.toUpperCase()} berhasil diunduh.`, "success");
    }
}

// FITUR BARU: Cetak Warga Mustahik ke PDF
window.cetakMustahikPDF = function() {
    const el = document.getElementById('mustahik-print-area'); if(!el) return showToast('Tidak ada data untuk dicetak','error');
    html2pdf().set({ margin: 10, filename: `Data_Warga_${Date.now()}.pdf`, jsPDF: { format: 'a4', orientation: 'portrait' } }).from(el).save();
}

// FITUR BARU: Email Kuitansi
window.kirimKuitansiEmail = function() {
    const nominal = document.getElementById('kui-nominal')?.innerText, ket = document.getElementById('kui-ket')?.innerText;
    window.location.href = `mailto:?subject=Bukti Kuitansi UPZIS&body=Telah diterima/disalurkan uang sejumlah ${nominal} untuk ${ket}. Terima kasih.`;
}

// FITUR BARU: Mode Fullscreen
window.toggleFullScreen = function() {
    const fsIcon = document.getElementById('fs-icon');
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); if(fsIcon) fsIcon.className = "fa-solid fa-compress"; } 
    else if (document.exitFullscreen) { document.exitFullscreen(); if(fsIcon) fsIcon.className = "fa-solid fa-expand"; }
}

// FITUR BARU: Hubungkan Google
window.hubungkanGoogle = async function() {
    if(!window.auth.currentUser) return;
    try {
        const provider = new GoogleAuthProvider();
        await linkWithPopup(window.auth, provider);
        showToast("Berhasil terhubung ke Akun Google!", "success");
        loadAllCloudData();
    } catch(e) { showToast("Batal / Gagal menghubungkan Google.", "error"); }
}

// FITUR BARU: Ganti Sandi Butuh Sandi Lama
const formPass = document.getElementById('form-password');
if(formPass) formPass.addEventListener('submit', async e => {
    e.preventDefault();
    const oldPw = document.getElementById('pw-old').value;
    const newPw = document.getElementById('pw-new').value;
    if(!window.auth.currentUser) return;
    try {
        const cred = EmailAuthProvider.credential(window.auth.currentUser.email, oldPw);
        await reauthenticateWithCredential(window.auth, cred);
        await updatePassword(window.auth.currentUser, newPw);
        showToast("Kata Sandi berhasil diperbarui!", "success");
        e.target.reset();
    } catch (error) {
        showToast("Sandi Lama salah atau proses ditolak.", "error");
    }
});

// FITUR BARU: PENGURUS KOMPLEKS (DENGAN UPLOAD GAMBAR)
window.simpanProfil = async function() { 
    if(currentUserRole !== 'bendahara') return; 
    profileSettings.lembaga = document.getElementById('p-lembaga')?.value || profileSettings.lembaga; 
    profileSettings.periode = document.getElementById('p-periode')?.value || profileSettings.periode; 
    const logoInput = document.getElementById('p-logo')?.files && document.getElementById('p-logo').files[0];
    if(logoInput) {
        compressImageBase64(logoInput, async (base64) => {
            profileSettings.logoBase64 = base64;
            await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings);
            showToast("Identitas & Logo disimpan.", "success");
        });
    } else {
        await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); 
        showToast("Identitas disimpan.", "success"); 
    }
}
window.tambahAnggota = async function() { 
    const nama = document.getElementById('input-anggota-nama')?.value.trim(), jabatan = document.getElementById('input-anggota-jabatan')?.value.trim() || 'Relawan'; 
    const fotoInput = document.getElementById('input-anggota-foto')?.files && document.getElementById('input-anggota-foto').files[0];
    if(nama) { 
        if(!profileSettings.anggota) profileSettings.anggota = [];
        const saveAnggota = async (fotoB64 = "") => {
            profileSettings.anggota.push({ id: Date.now(), nama: nama, jabatan: jabatan, foto: fotoB64 }); 
            await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); 
            if(document.getElementById('input-anggota-nama')) document.getElementById('input-anggota-nama').value = '';
            if(document.getElementById('input-anggota-foto')) document.getElementById('input-anggota-foto').value = '';
            showToast("Anggota ditambahkan.", "success"); 
        };
        if(fotoInput) { compressImageBase64(fotoInput, saveAnggota); } else { saveAnggota(); }
    } 
}
window.hapusAnggota = async function(id) { if(confirm("Hapus anggota ini?")) { profileSettings.anggota = profileSettings.anggota.filter(a => a.id !== id); await window.fs.setDoc(getFirestoreDoc("settings","profile"), profileSettings); renderAnggota(); showToast('Dihapus','success'); } }
function renderAnggota() { 
    if(!profileSettings.anggota) return;
    const listElem = document.getElementById('list-anggota'); if(!listElem) return;
    listElem.innerHTML = profileSettings.anggota.map((a) => `<div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; margin-bottom:8px;">${a.nama} <em>${a.jabatan}</em> <button class="btn btn-outline" onclick="window.hapusAnggota(${a.id})">Hapus</button></div>`).join('');
    renderBagan(); 
}
function renderBagan() { 
    const list = profileSettings.anggota || [], pimpinan = list.filter(a => (a.jabatan || '').toLowerCase().includes('ketua')), bendahara = list.filter(a => (a.jabatan || '').toLowerCase().includes('bendahara'));
    const makeCard = (a) => `<div style="background:var(--glass-gradient); border:2px solid var(--nu-gold); padding:10px; border-radius:10px; text-align:center; min-width:120px; margin:5px;">${a.nama}<br><small>${a.jabatan}</small></div>`;
    let html = ''; if(pimpinan.length > 0) html += `<div style="display:flex; justify-content:center;">${pimpinan.map(makeCard).join('')}</div>`; if(bendahara.length > 0) html += `<div style="display:flex; justify-content:center;">${bendahara.map(makeCard).join('')}</div>`;
    const c = document.getElementById('org-chart-container'); if(c) c.innerHTML = html; 
}


// FITUR BARU: CRUD Inventaris
const formInv = document.getElementById('form-inventaris');
if(formInv) formInv.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const item = { nama: document.getElementById('i-nama')?.value, qty: document.getElementById('i-qty')?.value, kondisi: document.getElementById('i-kondisi')?.value };
    await window.fs.addDoc(getCol("inventaris"), item); e.target.reset(); showToast("Aset Disimpan", "success");
});
window.hapusInv = async function(id) { if(confirm("Hapus Aset?")) { await window.fs.deleteDoc(getFirestoreDoc("inventaris", id)); showToast("Dihapus", "success"); } }
function renderInventaris() {
    const tb = document.getElementById('table-inventaris'); if(!tb) return;
    tb.innerHTML = dbInventaris.map(i => `<tr><td><strong>${i.nama}</strong></td><td>${i.qty}</td><td><span class="badge" style="background:#e2e8f0; color:black;">${i.kondisi}</span></td><td><button class="btn btn-outline" onclick="window.hapusInv('${i.id}')">Hapus</button></td></tr>`).join('');
}

// FITUR BARU: CRUD Agenda Rapat
const formAgenda = document.getElementById('form-agenda');
if(formAgenda) formAgenda.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const ag = { tgl: document.getElementById('a-tgl')?.value, judul: document.getElementById('a-judul')?.value, hasil: document.getElementById('a-hasil')?.value };
    await window.fs.addDoc(getCol("agenda"), ag); e.target.reset(); showToast("Agenda Dicatat", "success");
});
window.hapusAgenda = async function(id) { if(confirm("Hapus Agenda?")) { await window.fs.deleteDoc(getFirestoreDoc("agenda", id)); showToast("Dihapus", "success"); } }
function renderAgenda() {
    const tb = document.getElementById('table-agenda'); if(!tb) return;
    tb.innerHTML = dbAgenda.sort((a,b)=>new Date(b.tgl)-new Date(a.tgl)).map(a => `<tr><td>${formatTanggalIndo(a.tgl)}</td><td><strong>${a.judul}</strong></td><td><small>${a.hasil}</small></td><td><button class="btn btn-outline" onclick="window.hapusAgenda('${a.id}')">Hapus</button></td></tr>`).join('');
}
// FITUR BARU: CRUD Warga (Mustahik / Relawan)
const formMustahik = document.getElementById('form-mustahik');
if(formMustahik) {
    formMustahik.addEventListener('submit', async e => {
        e.preventDefault();
        if(currentUserRole !== 'bendahara') return;
        
        const nama = document.getElementById('m-nama')?.value.trim();
        const kategori = document.getElementById('m-kategori')?.value;
        
        if(!nama) return;
        
        try {
            await window.fs.addDoc(getCol("mustahik"), { nama: nama, kategori: kategori, timestamp: Date.now() });
            e.target.reset();
            showToast("Data warga ditambahkan", "success");
        } catch (error) {
            showToast("Gagal menambah data", "error");
        }
    });
}

window.hapusMustahik = async function(id) { 
    if(confirm("Hapus warga ini dari daftar?")) { 
        await window.fs.deleteDoc(getFirestoreDoc("mustahik", id)); 
        showToast("Warga dihapus", "success"); 
    } 
}

// FITUR BARU: ToDo List
const formTodo = document.getElementById('form-todo');
if(formTodo) formTodo.addEventListener('submit', async e => {
    e.preventDefault(); const task = document.getElementById('td-task')?.value; if(!task) return;
    await window.fs.addDoc(getCol("todos"), { task: task, done: false, time: Date.now() }); e.target.reset();
});
window.toggleTodo = async function(id, state) { await window.fs.updateDoc(getFirestoreDoc("todos", id), { done: !state }); }
window.hapusTodo = async function(id) { await window.fs.deleteDoc(getFirestoreDoc("todos", id)); }
function renderTodos() {
    const c = document.getElementById('list-todo'); if(!c) return;
    c.innerHTML = dbTodos.sort((a,b)=>b.time-a.time).map(t => `<div style="display:flex; justify-content:space-between; padding:15px; background:white; border-radius:10px; border:1px solid var(--border-color); margin-bottom:8px;"><div><strong>${t.task}</strong><br><small>${new Date(t.time).toLocaleString()}</small></div><div><input type="checkbox" ${t.done?"checked":""} onchange="window.toggleTodo('${t.id}', ${t.done})"></div></div>`).join('');
}

// FITUR BARU: Leaderboard Relawan (Otomatis dari Transaksi)
function renderLeaderboard() {
    const c = document.getElementById('table-leaderboard'); if(!c) return;
    const currentM = new Date().toISOString().slice(0,7); let stats = {};
    transactions.forEach(t => {
        if(t.date && t.date.slice(0,7) === currentM && t.type === 'in' && parseInt(t.code) >= 111 && parseInt(t.code) <= 198) {
            stats[t.code] = (stats[t.code] || 0) + Number(t.amount);
        }
    });
    const sorted = Object.keys(stats).sort((a,b) => stats[b] - stats[a]);
    if(sorted.length > 0) {
        const topCode = sorted[0]; const cat = getDynamicCategories().in.find(x => x.code === topCode);
        const elTop = document.getElementById('leaderboard-top1'); if(elTop) elTop.innerText = (cat ? cat.name.replace('Setoran Bulanan dari Relawan ','') : 'Relawan') + ` (${formatRp(stats[topCode])})`;
    } else { const elTop = document.getElementById('leaderboard-top1'); if(elTop) elTop.innerText = "Belum Ada Data Bulan Ini"; }
    c.innerHTML = sorted.map((code, i) => {
        const cat = getDynamicCategories().in.find(x => x.code === code);
        return `<tr><td>#${i+1}</td><td><strong>${cat ? cat.name.replace('Setoran Bulanan dari Relawan ','') : code}</strong></td><td style="color:var(--nu-green); font-weight:bold;">${formatRp(stats[code])}</td></tr>`;
    }).join('');
}

function renderLogs() { const tbody = document.getElementById('table-logs'); if(!tbody) return; tbody.innerHTML = logsData.sort((a,b) => new Date(b.time) - new Date(a.time)).map(l => `<tr><td>${formatTanggalIndo(l.time)}</td><td><strong>${l.action}</strong></td><td><small>${l.detail||''}</small></td></tr>`).join(''); }

// =====================================================================
// --- 7. WINDOW BINDS UTAMA (TOMBOL KLIK HTML) ---
// =====================================================================
window.toggleSidebar = () => { const sb=document.getElementById('app-sidebar'); const ov=document.getElementById('sidebar-overlay'); if(sb) sb.classList.toggle('mobile-open'); if(ov) ov.classList.toggle('active'); }
window.toggleThemeMode = () => { document.body.classList.toggle('dark-mode'); }
window.updateCategories = () => { const t = document.getElementById('t-type')?.value || 'in', c = getDynamicCategories(); const sel = document.getElementById('t-category'); if(sel) sel.innerHTML = (c[t]||[]).map(x => `<option value="${x.code}">${x.code} - ${x.name}</option>`).join(''); }

// PENGHUBUNG TAB YANG MENJAMIN GRAFIK TAMPIL
window.switchTab = (e, tab) => { 
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById(tab); if(panel) panel.classList.remove('hidden'); 
    if(e && e.currentTarget) e.currentTarget.classList.add('active');
    if(window.innerWidth <= 1024) { const sb=document.getElementById('app-sidebar'); const ov=document.getElementById('sidebar-overlay'); if(sb) sb.classList.remove('mobile-open'); if(ov) ov.classList.remove('active'); }
    
    // RENDER GRAFIS
    if(tab === 'v-dashboard' || tab === 'v-histori') refreshUI();
    if(tab === 'v-laporan') window.buildReport();
    if(tab === 'v-poster') window.buildPoster();
    if(tab === 'v-analitik') renderCharts();
    if(tab === 'v-konten') renderKontenHarian();
    if(tab === 'v-leaderboard') renderLeaderboard();
}

window.exportExcelBukuBesar = () => { if(typeof XLSX === 'undefined') return showToast('XLSX tidak tersedia','error'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions.map(t=>({"Tanggal":t.date,"Akun":t.code,"Sumber":t.source,"Keterangan":t.desc,"Jenis":t.type,"Nominal":t.amount}))), "BukuBesar"); XLSX.writeFile(wb, `BukuBesar_${Date.now()}.xlsx`); }
window.downloadJSONBackup = () => { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({profile: profileSettings, transactions, mustahik: dbMustahik, inventaris: dbInventaris, agenda: dbAgenda, todos: dbTodos})); a.download = `Backup_UPZIS_${Date.now()}.json`; a.click(); }
window.restoreJSONBackup = (e) => { const r = new FileReader(); r.onload = async ev => { try { const res = JSON.parse(ev.target.result); for(let t of res.transactions||[]){ delete t.idFirebase; await window.fs.addDoc(getCol('transactions'), t); } showToast('Backup dipulihkan', 'success'); } catch(err){ showToast('Gagal restore', 'error'); } }; if(e && e.target && e.target.files && e.target.files[0]) r.readAsText(e.target.files[0]); }
window.cetakStrukBluetooth = async () => { try { const device = await navigator.bluetooth.requestDevice({ filters: [{services: ['000018f0-0000-1000-8000-00805f9b34fb']}] }); await device.gatt.connect(); showToast('Terkoneksi ke printer (demo)', 'success'); } catch(e){ showToast('Printer Bluetooth tidak tersedia', 'error'); } }
window.cetakBukuBesarPDF = () => { const el = document.getElementById('buku-besar-area'); if(!el) return showToast('Tidak ada data untuk dicetak','error'); html2pdf().set({ margin:10, filename:`BukuBesar_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'landscape'} }).from(el).save(); }
window.cetakPDF = () => { window.buildReport(); const el = document.getElementById('print-area'); if(!el) return showToast('Tidak ada data untuk dicetak','error'); html2pdf().set({ margin:8, filename:`Laporan_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'landscape'} }).from(el).save(); }
window.cetakPosterPDF = () => { window.buildPoster(); const el = document.getElementById('poster-area'); if(!el) return showToast('Tidak ada data untuk dicetak','error'); html2pdf().set({ margin:5, filename:`Poster_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'portrait'} }).from(el).save(); }
window.openKuitansi = (id) => { 
    const t = transactions.find(x => x.idFirebase === id); 
    if(!t) return;
    if(document.getElementById('kui-nominal')) document.getElementById('kui-nominal').innerText = formatRp(t.amount); 
    if(document.getElementById('kui-tipe')) document.getElementById('kui-tipe').innerText = t.type === 'in' ? 'Donatur / Penerimaan' : 'Penyaluran / Mustahik';
    if(document.getElementById('kui-ket')) document.getElementById('kui-ket').innerText = t.desc || '-';
    if(document.getElementById('kui-sumber')) document.getElementById('kui-sumber').innerText = t.source || '-';
    if(document.getElementById('kui-tgl')) document.getElementById('kui-tgl').innerText = formatTanggalIndo(t.date);
    if(document.getElementById('kui-no')) document.getElementById('kui-no').innerText = "TRX-" + (t.timestamp || Date.now()).toString().slice(-6);
    if(document.getElementById('kui-lembaga')) document.getElementById('kui-lembaga').innerText = profileSettings.lembaga || 'UPZIS';
    if(document.getElementById('kui-periode')) document.getElementById('kui-periode').innerText = profileSettings.periode || '';
    if(document.getElementById('kui-ttd')) document.getElementById('kui-ttd').innerText = (profileSettings.anggota && profileSettings.anggota.find(a => (a.jabatan||'').toLowerCase().includes('bendahara'))?.nama) || 'Bendahara Sistem';
    window.currentKuitansiData = t; // Simpan untuk PDF & WA
    const modal = document.getElementById('modal-kuitansi'); if(modal) modal.classList.remove('hidden'); 
}

window.closeKuitansi = () => { const modal = document.getElementById('modal-kuitansi'); if(modal) modal.classList.add('hidden'); };
window.bukaKalkulatorAmil = () => { const m = document.getElementById('modal-amil'); if(m) m.classList.remove('hidden'); };
// --- FUNGSI TAMBAHAN PERBAIKAN BUG ---

// 1. Fungsi Cetak PDF Kuitansi
window.cetakKuitansiPDF = () => {
    const el = document.getElementById('kuitansi-print-area'); if(!el) return showToast('Tidak ada kuitansi','error');
    html2pdf().set({ margin: 5, filename: `Kuitansi_${Date.now()}.pdf`, jsPDF: { format: 'a5', orientation: 'landscape' } }).from(el).save();
}

// 2. Fungsi Kirim Kuitansi ke WhatsApp
window.kirimKuitansiWA = () => {
    const t = window.currentKuitansiData;
    if(!t) return showToast("Buka kuitansi terlebih dahulu", "error");
    const text = `*KUITANSI UPZIS*\nNomor: TRX-${(t.timestamp||Date.now()).toString().slice(-6)}\nTanggal: ${formatTanggalIndo(t.date)}\nNominal: ${formatRp(t.amount)}\nKeterangan: ${t.desc}\n\nTerima kasih atas dukungan Anda.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

// 3. Fungsi Filter Buku Besar
window.clearFilters = function() {
    if(document.getElementById('search-keyword')) document.getElementById('search-keyword').value = '';
    if(document.getElementById('filter-type')) document.getElementById('filter-type').value = '';
    if(document.getElementById('filter-start-date')) document.getElementById('filter-start-date').value = '';
    if(document.getElementById('filter-end-date')) document.getElementById('filter-end-date').value = '';
    if(document.getElementById('filter-min')) document.getElementById('filter-min').value = '';
    if(document.getElementById('filter-max')) document.getElementById('filter-max').value = '';
    currentPage = 1;
    refreshUI();
}

// 4. Fungsi Tutup Buku (Reset Data Tahunan)
window.eksekusiTutupBuku = async () => {
    if(currentUserRole !== 'bendahara') return showToast("Akses ditolak", "error");
    const year = new Date().getFullYear();
    if(confirm(`PERINGATAN! Anda yakin ingin menutup buku tahun ${year}?\nSemua transaksi akan dipindah ke Arsip dan Dashboard akan dikosongkan.`)) {
        try {
            for(let t of transactions) {
                await window.fs.addDoc(getCol(`arsip_${year}_transactions`), t);
                try{ await window.fs.deleteDoc(getFirestoreDoc("transactions", t.idFirebase)); }catch(e){}
            }
            showToast("Tutup buku berhasil! Data dipindah ke Arsip.", "success");
        } catch(e) {
            showToast("Gagal menutup buku", "error");
        }
    }
}

// 5. Fungsi Batal Edit Transaksi
window.cancelEditTrx = () => {
    const form = document.getElementById('form-trx'); if(form) form.reset();
    const editId = document.getElementById('t-edit-id'); if(editId) editId.value = '';
    const btnCancel = document.getElementById('btn-cancel-edit'); if(btnCancel) btnCancel.classList.add('hidden');
    const btnSubmit = document.getElementById('btn-submit-trx'); if(btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-check"></i> Rekam Transaksi';
}

// 6. Fungsi Unduh Video Canvas (fallback friendly)
window.downloadCanvasAsVideo = () => {
    showToast("Maaf, fitur konversi Canvas ke MP4 di browser membutuhkan server pihak ketiga (FFmpeg). Silakan gunakan Screen Record.", "info");
}

// =====================================================================
// --- 8. STARTUP & SINKRONISASI LOGIN ---
// =====================================================================
async function loadAllCloudData() {
    try{
        // profile settings (doc)
        window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (snap) => { if(snap && snap.exists && snap.exists()) { profileSettings = {...profileSettings, ...snap.data()}; if(document.getElementById('tg-token')) document.getElementById('tg-token').value = profileSettings.teleBotToken || ''; if(document.getElementById('tg-chatid')) document.getElementById('tg-chatid').value = profileSettings.teleChatId || ''; renderAnggota(); } });
        // transactions
        window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snap) => { transactions=[]; snap.forEach(d => transactions.push({idFirebase:d.id, ...d.data()})); refreshUI(); renderCharts(); renderLeaderboard(); });
        window.fs.onSnapshot(getCol("inventaris"), (snap) => { dbInventaris=[]; snap.forEach(d => dbInventaris.push({id:d.id, ...d.data()})); renderInventaris(); });
        window.fs.onSnapshot(getCol("agenda"), (snap) => { dbAgenda=[]; snap.forEach(d => dbAgenda.push({id:d.id, ...d.data()})); renderAgenda(); });
        window.fs.onSnapshot(getCol("todos"), (snap) => { dbTodos=[]; snap.forEach(d => dbTodos.push({id:d.id, ...d.data()})); renderTodos(); });
        window.fs.onSnapshot(getCol("mustahik"), (snap) => { dbMustahik=[]; snap.forEach(d => dbMustahik.push({idFirebase:d.id, ...d.data()})); const tb = document.getElementById('table-mustahik'); if(tb) tb.innerHTML = dbMustahik.map(m=>`<tr><td>${m.nama}</td><td>${m.kategori}</td><td><button class="btn btn-outline" onclick="window.hapusMustahik('${m.idFirebase}')">Hapus</button></td></tr>`).join(''); });
        window.fs.onSnapshot(window.fs.query(getCol("logs"), window.fs.orderBy("time", "asc")), (snap) => { logsData=[]; snap.forEach(d => logsData.push(d.data())); renderLogs(); });
    }catch(e){console.error('loadAllCloudData error',e);}    
}

window.togglePasswordVisibility = () => { const p=document.getElementById('l-pass'), i=document.getElementById('eye-icon'); if(p){ if(p.type==='password'){p.type='text'; if(i) i.className='fa-solid fa-eye-slash'; } else { p.type='password'; if(i) i.className='fa-solid fa-eye'; } } }
window.toggleModeAuth = (e) => { if(e) e.preventDefault(); isRegisterMode = !isRegisterMode; const grp=document.getElementById('group-ranting'); if(grp) grp.style.display = isRegisterMode ? 'block' : 'none'; const btn=document.getElementById('btn-auth-submit'); if(btn) btn.innerHTML = isRegisterMode ? '<i class="fa-solid fa-user-plus"></i> Daftar Baru' : '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem Terpadu'; }
window.recoverPasswordEmail = async () => { let em = document.getElementById('l-user')?.value; if(!em) em = prompt("Masukkan Email Anda:"); if(!em) return; try{ await sendPasswordResetEmail(window.auth, em); showToast('Permintaan reset dikirim','success'); }catch(e){ showToast('Gagal mengirim reset','error'); } }
window.logout = async () => { try{ await signOut(window.auth); location.reload(); }catch(e){ location.reload(); } }

// --- PERBAIKAN 1: FUNGSI TOMBOL YANG HILANG ---

// (Beberapa definisi fungsi sudah dirapikan di atas - tidak ada duplikasi yang tersisa)

document.addEventListener("DOMContentLoaded", () => {
    window.updateCategories();

    async function prosesLogin() {
        const email = document.getElementById('l-user')?.value.trim();
        const pass = document.getElementById('l-pass')?.value;
        const rantingName = document.getElementById('l-ranting') ? document.getElementById('l-ranting').value.trim() : "";
        const remember = document.getElementById('remember-me') ? document.getElementById('remember-me').checked : false;
        const btnSubmit = document.getElementById('btn-auth-submit');

        if(!email || !pass) return showToast("Harap isi Email dan Sandi!", "error");
        if(btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
        
        try {
            const persistenceType = remember ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(window.auth, persistenceType);

            if (isRegisterMode) {
                const userCredential = await createUserWithEmailAndPassword(window.auth, email, pass);
                await setDoc(doc(window.db, "users", userCredential.user.uid), { email: email, ranting: rantingName, role: 'bendahara' });
                showToast("Pendaftaran Berhasil!", "success");
            } else {
                await signInWithEmailAndPassword(window.auth, email, pass);
            }
        } catch (error) {
            showToast("Sandi Salah / Periksa Koneksi", "error");
        } finally {
            if(btnSubmit) btnSubmit.innerHTML = isRegisterMode ? '<i class="fa-solid fa-user-plus"></i> Daftar Baru' : '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem Terpadu';
        }
    }

    const formLogin = document.getElementById('form-login');
    if(formLogin) { formLogin.addEventListener('submit', async e => { e.preventDefault(); await prosesLogin(); }); }

    onAuthStateChanged(window.auth, async user => {
        if(user) {
            try { 
                let d = await fsGetDoc(doc(window.db, "users", user.uid)); 
                if(d && d.exists()){ asalRanting = d.data().ranting||""; currentUserRole = d.data().role||"bendahara"; } 
            } catch(e){}
            const authScreen = document.getElementById('auth-screen'); if(authScreen) authScreen.classList.add('hidden'); 
            const appScreen = document.getElementById('app-screen'); if(appScreen) appScreen.classList.remove('hidden');
            loadAllCloudData(); applyRBAC();
        }
    });
});
// Mendaftarkan Service Worker (tetap aman jika ganda)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            console.log('PWA ServiceWorker terdaftar dengan scope: ', registration.scope);
        }).catch((err) => {
            console.log('Registrasi PWA ServiceWorker gagal: ', err);
        });
    });
}
