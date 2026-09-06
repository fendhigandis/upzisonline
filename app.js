// =====================================================================
// --- 1. INISIALISASI FIREBASE & MODE OFFLINE ---
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc as fsGetDoc, updateDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence, GoogleAuthProvider, linkWithPopup, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBpsQLNhyFL-agq2Iwmw2TU42F51LrvkHI", authDomain: "upzis-lazisnu.firebaseapp.com", projectId: "upzis-lazisnu",
    storageBucket: "upzis-lazisnu.firebasestorage.app", messagingSenderId: "1284852623", appId: "1:1284852623:web:a2b24c2e261273c59099fa"
};
const app = initializeApp(firebaseConfig); const db = getFirestore(app); const auth = getAuth(app);
enableIndexedDbPersistence(db).catch(() => console.log('Cache Aktif'));
window.db = db; window.auth = auth; window.fs = { collection, addDoc, getDocs, doc, setDoc, deleteDoc, getDoc: fsGetDoc, updateDoc, query, orderBy, onSnapshot };
window.authServices = { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, linkWithPopup, EmailAuthProvider, reauthenticateWithCredential, updatePassword };

// =====================================================================
// --- 2. GLOBAL STATE & FITUR DATABASE BARU ---
// =====================================================================
let asalRanting = ""; let currentUserRole = 'bendahara'; let isRegisterMode = false; window.activeKontenText = null;
let transactions = []; let dbMustahik = []; let logsData = []; 
let dbInventaris = []; let dbAgenda = []; let dbTodos = []; let dbProker = [];
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
function getCol(col) { return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.collection(window.db, col) : window.fs.collection(window.db, "ranting", asalRanting.toLowerCase(), col); }
function getFirestoreDoc(col, id) { return (!asalRanting || asalRanting.toLowerCase() === "karangdowo") ? window.fs.doc(window.db, col, id) : window.fs.doc(window.db, "ranting", asalRanting.toLowerCase(), col, id); }

function getDynamicCategories() {
    let inList = [{code:'101', name:'Saldo Awal'}, {code:'120', name:'Bank ke Tunai'}, {code:'220', name:'Tunai ke Bank'}, {code:'199', name:'Donasi Lain'}];
    if(profileSettings.relawan) profileSettings.relawan.forEach((r,i) => inList.push({code:String(111+i), name:`Relawan ${r}`}));
    let outList = [{code:'201', name:'Santunan Duka'}, {code:'205', name:'Operasional'}];
    return { in: inList, out: outList };
}

function compressImageBase64(file, callback) {
    const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); let w = img.width, h = img.height; if (w > 300) { h *= 300 / w; w = 300; } canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h); callback(canvas.toDataURL('image/jpeg', 0.8)); }; img.src = e.target.result; }; reader.readAsDataURL(file);
}

// =====================================================================
// --- 4. LOGIKA TRANSAKSI UTAMA, FILTER, & PAGINASI ---
// =====================================================================
window.ubahHalaman = function(arah) { if (arah === -1 && currentPage > 1) currentPage--; else if (arah === 1 && currentPage < totalPages) currentPage++; refreshUI(); }
async function kirimTelegram(jenis, nominal, desc) {
    if(!profileSettings.teleBotToken || !profileSettings.teleChatId) return;
    const pesan = `*MUTASI UPZIS*\n📝 Tipe: ${jenis}\n💰 Nominal: Rp ${formatRp(nominal)}\n📌 Ket: ${desc}`;
    try { await fetch(`https://api.telegram.org/bot${profileSettings.teleBotToken}/sendMessage?chat_id=${profileSettings.teleChatId}&text=${encodeURIComponent(pesan)}`); } catch(e) {}
}
window.simpanTelegram = function() { profileSettings.teleBotToken = document.getElementById('tg-token').value; profileSettings.teleChatId = document.getElementById('tg-chatid').value; window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); showToast("Telegram Disimpan", "success"); }

// PERBAIKAN: Fungsi Filter Reset
window.clearFilters = function() {
    if(document.getElementById('search-keyword')) document.getElementById('search-keyword').value = '';
    if(document.getElementById('filter-type')) document.getElementById('filter-type').value = '';
    if(document.getElementById('filter-start-date')) document.getElementById('filter-start-date').value = '';
    if(document.getElementById('filter-end-date')) document.getElementById('filter-end-date').value = '';
    if(document.getElementById('filter-min')) document.getElementById('filter-min').value = '';
    if(document.getElementById('filter-max')) document.getElementById('filter-max').value = '';
    refreshUI();
}

function refreshUI() {
    applyRBAC(); let grandIn = 0, grandOut = 0, saldoTunai = 0, saldoBank = 0, globalBalance = 0;
    const tbody = document.getElementById('table-body'); if(tbody) tbody.innerHTML = '';
    const cats = getDynamicCategories(), allCats = [...cats.in, ...cats.out];

    transactions.forEach(t => {
        const amt = Number(t.amount || 0);
        if(t.type === 'in') { if(t.code==='120'){saldoTunai+=amt; saldoBank-=amt;} else if(t.code==='220'){saldoBank+=amt; saldoTunai-=amt;} else {grandIn+=amt; t.source.includes('Bank')?saldoBank+=amt:saldoTunai+=amt;} }
        if(t.type === 'out') { if(t.code!=='120' && t.code!=='220') grandOut+=amt; t.source.includes('Bank')?saldoBank-=amt:saldoTunai-=amt; }
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
            let act = `<button class="btn-action" title="Cetak Kuitansi" onclick="window.openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt"></i></button>`;
            // PERBAIKAN: Menambahkan Tombol Edit
            if(currentUserRole === 'bendahara') {
                act += `<button class="btn-action admin-only" title="Edit Transaksi" onclick="window.editTrx('${t.idFirebase}')"><i class="fa-solid fa-pen" style="color:#0284c7;"></i></button>`;
                act += `<button class="btn-action admin-only" title="Hapus" onclick="window.hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button>`;
            }
            tbody.innerHTML += `<tr><td>${formatTanggalIndo(t.date)}</td><td>${t.source}</td><td>[${t.code}] ${catName}<br><small>${t.desc}</small></td><td style="color:green;">${t.type==='in'?formatRp(t.amount):'-'}</td><td style="color:red;">${t.type==='out'?formatRp(t.amount):'-'}</td><td style="font-weight:bold;">${formatRp(t.currentBalance)}</td><td style="display:flex; gap:5px;">${act}</td></tr>`;
        });
        document.getElementById('page-indicator').innerText = `Hal ${currentPage} dari ${totalPages}`;
    }
    ['sum-tunai','sum-bank','sum-masuk','sum-keluar'].forEach((id,i) => { if(document.getElementById(id)) document.getElementById(id).innerText = formatRp([saldoTunai,saldoBank,grandIn,grandOut][i]); });
    renderProker(); // Perbarui proker jika ada perubahan trx
}

const amtInput = document.getElementById('t-amount');
if(amtInput) amtInput.addEventListener('input', function() {
    let val = this.value.replace(/[^0-9]/g, ''); this.value = val ? parseInt(val).toLocaleString('id-ID') : '';
    this.style.borderColor = (parseInt(val||0) <= 0) ? 'red' : 'var(--nu-gold)';
});

// PERBAIKAN: Logika Simpan dan Edit
window.editTrx = function(id) {
    const t = transactions.find(x => x.idFirebase === id);
    if(!t) return;
    document.getElementById('t-edit-id').value = t.idFirebase;
    document.getElementById('t-type').value = t.type;
    window.updateCategories();
    document.getElementById('t-category').value = t.code;
    document.getElementById('t-source').value = t.source;
    document.getElementById('t-date').value = t.date;
    document.getElementById('t-amount').value = t.amount.toLocaleString('id-ID');
    document.getElementById('t-desc').value = t.desc;
    
    document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-save"></i> Perbarui';
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    window.scrollTo({ top: document.getElementById('form-trx').offsetTop - 100, behavior: 'smooth' });
}

window.cancelEditTrx = function() {
    document.getElementById('form-trx').reset();
    document.getElementById('t-edit-id').value = '';
    document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-check"></i> Rekam Transaksi';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
}

const formTrx = document.getElementById('form-trx');
if(formTrx) formTrx.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const editId = document.getElementById('t-edit-id').value;
    const type=document.getElementById('t-type').value, code=document.getElementById('t-category').value, src=document.getElementById('t-source').value;
    const date=document.getElementById('t-date').value, desc=document.getElementById('t-desc').value, amt=parseFloat(amtInput.value.replace(/\./g,''));
    if(!amt || amt <= 0) return showToast("Nominal salah!", "error");
    
    document.getElementById('btn-submit-trx').disabled = true;
    try {
        const payload = { type, source:src, code, date, amount:amt, desc, timestamp: Date.now() };
        if(editId) {
            await window.fs.updateDoc(getFirestoreDoc("transactions", editId), payload);
            showToast("Transaksi diperbarui!", "success");
            cancelEditTrx();
        } else {
            await window.fs.addDoc(getCol("transactions"), payload);
            showToast("Transaksi tersimpan!", "success");
            kirimTelegram(type==='in'?'Masuk':'Keluar', amt, desc);
            amtInput.value=''; document.getElementById('t-desc').value='';
        }
    } catch(err) { showToast("Gagal memproses", "error"); } 
    finally { document.getElementById('btn-submit-trx').disabled = false; }
});
window.hapusTrx = async function(id) { if(confirm("Hapus transaksi permanen?")) { await window.fs.deleteDoc(getFirestoreDoc("transactions", id)); showToast("Dihapus", "success"); } }

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
    if(c1) { if(window.mc1) window.mc1.destroy(); window.mc1 = new Chart(c1.getContext('2d'), { type:'line', data:{labels:lm.length?lm:['Kosong'], datasets:[{label:'Masuk', data:di.length?di:[0], borderColor:'#005a2b'}, {label:'Keluar', data:doOut.length?doOut:[0], borderColor:'#ef4444'}]}, options:{responsive:true, maintainAspectRatio:false} }); }
    const c2 = document.getElementById('chartArusKas');
    if(c2) { if(window.mc2) window.mc2.destroy(); window.mc2 = new Chart(c2.getContext('2d'), { type:'bar', data:{labels:['Total'], datasets:[{label:'Masuk', data:[tIn], backgroundColor:'#005a2b'}, {label:'Keluar', data:[tOut], backgroundColor:'#ef4444'}]}, options:{responsive:true, maintainAspectRatio:false} }); }
    const c3 = document.getElementById('chartPenyaluran');
    if(c3) { if(window.mc3) window.mc3.destroy(); window.mc3 = new Chart(c3.getContext('2d'), { type:'doughnut', data:{labels:Object.keys(cOut), datasets:[{data:Object.values(cOut), backgroundColor:['#0284c7','#10b981','#f59e0b','#ec4899']}]}, options:{responsive:true, maintainAspectRatio:false} }); }
}

// PERBAIKAN: Menulis Uraian ke Tabel PDF
window.buildReport = function() {
    let fStr = document.getElementById('filter-month')?.value;
    if(!fStr) { fStr = new Date().toISOString().slice(0, 7); if(document.getElementById('filter-month')) document.getElementById('filter-month').value = fStr; }
    if(document.getElementById('lap-periode')) document.getElementById('lap-periode').innerText = `Bulan: ${fStr}`;
    
    let sIn={}, sOut={}, tIn=0, tOut=0, sAw=0, sT=0, sB=0;
    
    // Reset rincian tabel
    let htmlMasuk = '', htmlKeluar = '';

    transactions.forEach(t => {
        const m=t.date.slice(0,7), amt=Number(t.amount||0);
        if(m<fStr) { if(t.type==='in'&&t.code!=='120'&&t.code!=='220')sAw+=amt; if(t.type==='out'&&t.code!=='120'&&t.code!=='220')sAw-=amt; }
        if(m<=fStr){ if(t.type==='in'){ if(t.code==='120'){sT+=amt;sB-=amt;}else if(t.code==='220'){sB+=amt;sT-=amt;}else{t.source.includes('Bank')?sB+=amt:sT+=amt;} } if(t.type==='out'){t.source.includes('Bank')?sB-=amt:sT-=amt;} }
        if(m===fStr){ 
            if(t.type==='in'){ 
                sIn[t.code]=(sIn[t.code]||0)+amt; 
                if(t.code!=='120'&&t.code!=='220') {
                    tIn+=amt; 
                    htmlMasuk += `<tr><td>${t.code}</td><td>${t.desc}</td><td>${formatRp(amt)}</td></tr>`;
                } 
            } 
            if(t.type==='out'){ 
                sOut[t.code]=(sOut[t.code]||0)+amt; 
                if(t.code!=='120'&&t.code!=='220') {
                    tOut+=amt;
                    htmlKeluar += `<tr><td>${t.code}</td><td>${t.desc}</td><td>${formatRp(amt)}</td></tr>`;
                } 
            } 
        }
    });
    
    // Inject ke view PDF HTML
    if(document.getElementById('lap-tbl-masuk')) document.getElementById('lap-tbl-masuk').innerHTML = htmlMasuk || '<tr><td colspan="3" style="text-align:center;">Nihil</td></tr>';
    if(document.getElementById('lap-tbl-keluar')) document.getElementById('lap-tbl-keluar').innerHTML = htmlKeluar || '<tr><td colspan="3" style="text-align:center;">Nihil</td></tr>';

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
            <div style="display:flex; gap:10px;"><button onclick="window.navigator.clipboard.writeText(document.getElementById('teks-kampanye').value); showToast('Disalin!','success');" class="btn btn-outline" style="flex:1;">Salin</button><a id="btn-wa-kampanye" href="#" target="_blank" class="btn btn-primary" style="flex:2; background:#25d366; color:white; border:none;">Bagikan WA</a></div>
        </div>
        <div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color); text-align:center;">
            <h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-film"></i> Pratinjau Gambar Sosialisasi</h4>
            <canvas id="video-canvas" width="800" height="800" style="width:100%; max-width:280px; border-radius:12px; background:#012a14; margin-bottom:20px;"></canvas>
            <button id="btn-download-video" onclick="window.downloadCanvasAsVideo()" class="btn btn-primary" style="width:100%;">Unduh Gambar (JPG)</button>
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
    const hourSegment = Math.floor(new Date().getHours() / 12); 
    const index = (new Date().getDate() + hourSegment) % templates.length;
    window.activeKontenText = templates[index]; 
    
    const txt = `*${templates[index].judul}*\n\n"${templates[index].teks}"\n\nMari salurkan ZIS Anda via UPZIS Ranting.`;
    if(document.getElementById('teks-kampanye')) document.getElementById('teks-kampanye').value = txt; 
    if(document.getElementById('btn-wa-kampanye')) document.getElementById('btn-wa-kampanye').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`;
    
    const cvs = document.getElementById('video-canvas'); if(!cvs) return; const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#012a14'; ctx.fillRect(0,0,800,800); ctx.fillStyle = '#d4af37'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(templates[index].judul, 400, 400);
}

// PERBAIKAN: Fungsi Unduh Visual Canvas
window.downloadCanvasAsVideo = function() {
    const canvas = document.getElementById('video-canvas');
    if(!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg');
    a.download = `Media_Edukasi_${Date.now()}.jpg`;
    a.click();
    showToast("Gambar terunduh!", "success");
}

// =====================================================================
// --- 6. LOGIKA FITUR ENTERPRISE (ARSIP DOWNLOAD, GOOGLE AUTH, PENGURUS KOMPLEKS) ---
// =====================================================================

window.loadArsip = async function() {
    const year = document.getElementById('input-arsip-year').value; if(!year) return; showToast(`Mencari arsip ${year}...`, "info");
    try { 
        const snap = await window.fs.getDocs(window.fs.query(getCol(`arsip_${year}_transactions`), window.fs.orderBy("date", "asc"))); 
        let html = ''; snap.forEach(d => { const t = d.data(); html += `<tr><td>${t.date}</td><td>${t.source}</td><td>${t.desc}</td><td>${t.type==='in'?formatRp(t.amount):'-'}</td><td>${t.type==='out'?formatRp(t.amount):'-'}</td></tr>`; }); 
        document.getElementById('table-arsip-body').innerHTML = html || '<tr><td colspan="5">Tidak ada arsip</td></tr>'; 
        if(!snap.empty) document.getElementById('arsip-action-bar').classList.remove('hidden'); 
        window.currentArsipYear = year; window.currentArsipData = snap.docs.map(d => d.data());
        showToast("Arsip dimuat.", "success"); 
    } catch(e) { showToast("Gagal memuat arsip.", "error"); }
}

window.downloadArsip = function(format) {
    if(!window.currentArsipData || window.currentArsipData.length === 0) return;
    if(confirm(`Unduh arsip ${window.currentArsipYear} dalam format ${format.toUpperCase()}?`)) {
        const data = window.currentArsipData;
        if(format === 'csv') {
            const csv = "Tanggal,Sumber,Ket,Debit,Kredit\n" + data.map(t => `${t.date},${t.source},${t.desc},${t.type==='in'?t.amount:0},${t.type==='out'?t.amount:0}`).join("\n");
            const a = document.createElement('a'); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = `Arsip_${window.currentArsipYear}.csv`; a.click();
        } else if(format === 'excel' && typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Arsip"); XLSX.writeFile(wb, `Arsip_${window.currentArsipYear}.xlsx`);
        } else if(format === 'json') {
            const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data)); a.download = `Arsip_${window.currentArsipYear}.json`; a.click();
        }
        showToast(`Arsip berhasil diunduh.`, "success");
    }
}

// PERBAIKAN: Fitur Tutup Buku
window.eksekusiTutupBuku = async function() {
    const year = prompt("Ketik TAHUN (Contoh: 2025) transaksi yang ingin direkap & dipindah ke Arsip:");
    if(!year) return;
    
    const trxsToArchive = transactions.filter(t => t.date.startsWith(year));
    if(trxsToArchive.length === 0) return showToast(`Tidak ada transaksi aktif di tahun ${year}.`, "error");

    if(confirm(`BAHAYA! Proses ini akan memindahkan ${trxsToArchive.length} transaksi tahun ${year} ke arsip dan menghapusnya dari Buku Besar berjalan. Lanjutkan?`)) {
        showToast("Memproses tutup buku...", "info");
        try {
            // Melakukan iterasi migrasi (Disarankan memantau koneksi agar tidak terputus)
            for(let t of trxsToArchive) {
                const arsipData = { ...t }; delete arsipData.idFirebase; 
                await window.fs.addDoc(getCol(`arsip_${year}_transactions`), arsipData);
                await window.fs.deleteDoc(getFirestoreDoc("transactions", t.idFirebase));
            }
            showToast(`Tutup Buku ${year} sukses!`, "success");
        } catch(e) {
            showToast("Gagal memindahkan data. Periksa koneksi.", "error");
        }
    }
}

// FITUR BARU PROFESIONAL: CRUD Target & Program Kerja
const formProker = document.getElementById('form-proker');
if(formProker) formProker.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const pk = { nama: document.getElementById('pk-nama').value, target: parseFloat(document.getElementById('pk-target').value) };
    await window.fs.addDoc(getCol("proker"), pk); e.target.reset(); showToast("Program Disimpan", "success");
});

window.hapusProker = async function(id) { if(confirm("Hapus Program ini?")) { await window.fs.deleteDoc(getFirestoreDoc("proker", id)); showToast("Dihapus", "success"); } }

function renderProker() {
    const list = document.getElementById('list-proker'); if(!list) return;
    let html = '';
    
    dbProker.forEach(p => {
        // Otomatis hitung total penyaluran pada nama program yang sama di desc transaksi
        let terkumpul = 0;
        transactions.forEach(t => { 
            if(t.type === 'out' && t.desc.toLowerCase().includes(p.nama.toLowerCase())) { terkumpul += Number(t.amount); }
        });
        
        let persen = (terkumpul / p.target) * 100;
        if(persen > 100) persen = 100;
        
        html += `<div style="background:white; padding:20px; border-radius:15px; border:1px solid var(--border-color); position:relative;">
            <button class="btn-action admin-only" onclick="window.hapusProker('${p.id}')" style="position:absolute; top:15px; right:15px; color:red;"><i class="fa-solid fa-trash"></i></button>
            <h4 style="margin-bottom:10px; padding-right:20px;">${p.nama}</h4>
            <div style="font-size:12px; color:gray; display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>Tersalur: ${formatRp(terkumpul)}</span>
                <span>Target: ${formatRp(p.target)}</span>
            </div>
            <div style="width:100%; background:#e2e8f0; height:10px; border-radius:5px; overflow:hidden;">
                <div style="width:${persen}%; background:var(--nu-gold); height:100%;"></div>
            </div>
        </div>`;
    });
    list.innerHTML = html || '<p style="color:gray;">Belum ada program kerja berjalan.</p>';
    applyRBAC();
}

window.cetakMustahikPDF = function() {
    const el = document.getElementById('mustahik-print-area');
    html2pdf().set({ margin: 10, filename: `Data_Warga_${Date.now()}.pdf`, jsPDF: { format: 'a4', orientation: 'portrait' } }).from(el).save();
}

// PERBAIKAN: Email, WA, dan PDF Kuitansi
window.kirimKuitansiEmail = function() {
    const nominal = document.getElementById('kui-nominal').innerText, ket = document.getElementById('kui-ket').innerText;
    window.location.href = `mailto:?subject=Bukti Kuitansi UPZIS&body=Telah diterima/disalurkan uang sejumlah ${nominal} untuk ${ket}. Terima kasih.`;
}

window.kirimKuitansiWA = function() {
    const nominal = document.getElementById('kui-nominal').innerText;
    const ket = document.getElementById('kui-ket').innerText;
    const text = `*BUKTI TRANSAKSI UPZIS*\n\nTelah diterima/disalurkan dana sejumlah *${nominal}*\nKeperluan: ${ket}\n\nTerima kasih atas partisipasinya.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

window.cetakKuitansiPDF = function() {
    const el = document.getElementById('kuitansi-print-area');
    html2pdf().set({ margin: 10, filename: `Kuitansi_${Date.now()}.pdf`, jsPDF: { format: 'a5', orientation: 'landscape' } }).from(el).save();
}

window.toggleFullScreen = function() {
    const fsIcon = document.getElementById('fs-icon');
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); fsIcon.className = "fa-solid fa-compress"; } 
    else if (document.exitFullscreen) { document.exitFullscreen(); fsIcon.className = "fa-solid fa-expand"; }
}

window.hubungkanGoogle = async function() {
    if(!window.auth.currentUser) return;
    const provider = new window.authServices.GoogleAuthProvider();
    try {
        await window.authServices.linkWithPopup(window.auth.currentUser, provider);
        showToast("Berhasil terhubung ke Akun Google!", "success");
        loadAllCloudData();
    } catch(e) { showToast("Batal / Gagal menghubungkan Google.", "error"); }
}

const formPass = document.getElementById('form-password');
if(formPass) formPass.addEventListener('submit', async e => {
    e.preventDefault();
    const oldPw = document.getElementById('pw-old').value;
    const newPw = document.getElementById('pw-new').value;
    if(!window.auth.currentUser) return;
    try {
        const cred = window.authServices.EmailAuthProvider.credential(window.auth.currentUser.email, oldPw);
        await window.authServices.reauthenticateWithCredential(window.auth.currentUser, cred);
        await window.authServices.updatePassword(window.auth.currentUser, newPw);
        showToast("Kata Sandi berhasil diperbarui!", "success");
        e.target.reset();
    } catch (error) { showToast("Sandi Lama salah atau proses ditolak.", "error"); }
});

window.simpanProfil = async function() { 
    if(currentUserRole !== 'bendahara') return; 
    profileSettings.lembaga = document.getElementById('p-lembaga').value; 
    profileSettings.periode = document.getElementById('p-periode').value; 
    const logoInput = document.getElementById('p-logo').files[0];
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
    const nama = document.getElementById('input-anggota-nama').value.trim(), jabatan = document.getElementById('input-anggota-jabatan').value.trim() || 'Relawan'; 
    const fotoInput = document.getElementById('input-anggota-foto').files[0];
    if(nama) { 
        if(!profileSettings.anggota) profileSettings.anggota = [];
        const saveAnggota = async (fotoB64 = "") => {
            profileSettings.anggota.push({ id: Date.now(), nama: nama, jabatan: jabatan, foto: fotoB64 }); 
            await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); 
            document.getElementById('input-anggota-nama').value = ''; document.getElementById('input-anggota-foto').value = '';
            showToast("Anggota ditambahkan.", "success"); 
        };
        if(fotoInput) { compressImageBase64(fotoInput, saveAnggota); } else { saveAnggota(); }
    } 
}
window.hapusAnggota = async function(id) { if(confirm("Hapus anggota ini?")) { profileSettings.anggota = profileSettings.anggota.filter(a => a.id !== id); await window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); } }
function renderAnggota() { 
    if(!profileSettings.anggota) return;
    document.getElementById('list-anggota').innerHTML = profileSettings.anggota.map((a) => `<div style="display:flex; justify-content:space-between; background:white; padding:10px; border-radius:8px; margin-bottom:5px;"><div><div style="font-size:10px; color:var(--nu-gold-dark);">${a.jabatan}</div><div style="font-weight:800;">${a.nama}</div></div><button class="btn-action admin-only" onclick="window.hapusAnggota(${a.id})"><i class="fa-solid fa-xmark"></i></button></div>`).join(''); 
    renderBagan(); 
}
function renderBagan() { 
    const list = profileSettings.anggota || [], pimpinan = list.filter(a => (a.jabatan || '').toLowerCase().includes('ketua')), bendahara = list.filter(a => (a.jabatan || '').toLowerCase().includes('bendahara')), relawan = list.filter(a => !(a.jabatan || '').toLowerCase().includes('ketua') && !(a.jabatan || '').toLowerCase().includes('bendahara')); 
    const makeCard = (a) => `<div style="background:var(--glass-gradient); border:2px solid var(--nu-gold); padding:10px; border-radius:10px; text-align:center; min-width:120px; margin:5px;">${a.foto ? `<img src="${a.foto}" style="width:40px; height:40px; border-radius:50%; margin-bottom:5px;">` : `<i class="fa-solid fa-user-tie" style="font-size:30px; color:gray; margin-bottom:5px;"></i>`}<div style="font-size:10px;">${a.jabatan}</div><div style="font-size:12px; font-weight:bold;">${a.nama}</div></div>`; 
    let html = ''; if(pimpinan.length > 0) html += `<div style="display:flex; justify-content:center;">${pimpinan.map(makeCard).join('')}</div>`; if(bendahara.length > 0) html += `<div style="display:flex; justify-content:center;">${bendahara.map(makeCard).join('')}</div>`; if(relawan.length > 0) html += `<div style="display:flex; justify-content:center; flex-wrap:wrap;">${relawan.map(makeCard).join('')}</div>`; 
    const c = document.getElementById('org-chart-container'); if(c) c.innerHTML = html; 
}

const formInv = document.getElementById('form-inventaris');
if(formInv) formInv.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const item = { nama: document.getElementById('i-nama').value, qty: document.getElementById('i-qty').value, kondisi: document.getElementById('i-kondisi').value };
    await window.fs.addDoc(getCol("inventaris"), item); e.target.reset(); showToast("Aset Disimpan", "success");
});
window.hapusInv = async function(id) { if(confirm("Hapus Aset?")) { await window.fs.deleteDoc(getFirestoreDoc("inventaris", id)); showToast("Dihapus", "success"); } }
function renderInventaris() {
    const tb = document.getElementById('table-inventaris'); if(!tb) return;
    tb.innerHTML = dbInventaris.map(i => `<tr><td><strong>${i.nama}</strong></td><td>${i.qty}</td><td><span class="badge" style="background:#e2e8f0; color:black;">${i.kondisi}</span></td><td><button class="btn-action admin-only" onclick="window.hapusInv('${i.id}')"><i class="fa-solid fa-trash" style="color:red;"></i></button></td></tr>`).join(''); applyRBAC();
}

const formAgenda = document.getElementById('form-agenda');
if(formAgenda) formAgenda.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const ag = { tgl: document.getElementById('a-tgl').value, judul: document.getElementById('a-judul').value, hasil: document.getElementById('a-hasil').value };
    await window.fs.addDoc(getCol("agenda"), ag); e.target.reset(); showToast("Agenda Dicatat", "success");
});
window.hapusAgenda = async function(id) { if(confirm("Hapus Agenda?")) { await window.fs.deleteDoc(getFirestoreDoc("agenda", id)); showToast("Dihapus", "success"); } }
function renderAgenda() {
    const tb = document.getElementById('table-agenda'); if(!tb) return;
    tb.innerHTML = dbAgenda.sort((a,b)=>new Date(b.tgl)-new Date(a.tgl)).map(a => `<tr><td>${formatTanggalIndo(a.tgl)}</td><td><strong>${a.judul}</strong></td><td><small>${a.hasil}</small></td><td><button class="btn-action admin-only" onclick="window.hapusAgenda('${a.id}')"><i class="fa-solid fa-trash" style="color:red;"></i></button></td></tr>`).join(''); applyRBAC();
}

const formTodo = document.getElementById('form-todo');
if(formTodo) formTodo.addEventListener('submit', async e => {
    e.preventDefault(); const task = document.getElementById('td-task').value;
    await window.fs.addDoc(getCol("todos"), { task: task, done: false, time: Date.now() }); e.target.reset();
});
window.toggleTodo = async function(id, state) { await window.fs.updateDoc(getFirestoreDoc("todos", id), { done: !state }); }
window.hapusTodo = async function(id) { await window.fs.deleteDoc(getFirestoreDoc("todos", id)); }
function renderTodos() {
    const c = document.getElementById('list-todo'); if(!c) return;
    c.innerHTML = dbTodos.sort((a,b)=>b.time-a.time).map(t => `<div style="display:flex; justify-content:space-between; padding:15px; background:white; border-radius:10px; border:1px solid var(--border-color);"><div style="display:flex; gap:10px;"><input type="checkbox" ${t.done?'checked':''} onchange="window.toggleTodo('${t.id}', ${t.done})"><span style="${t.done?'text-decoration:line-through; color:gray;':''}">${t.task}</span></div><button class="btn-action" onclick="window.hapusTodo('${t.id}')"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
}

function renderLeaderboard() {
    const c = document.getElementById('table-leaderboard'); if(!c) return;
    const currentM = new Date().toISOString().slice(0,7); let stats = {};
    transactions.forEach(t => {
        if(t.date.slice(0,7) === currentM && t.type === 'in' && parseInt(t.code) >= 111 && parseInt(t.code) <= 198) {
            stats[t.code] = (stats[t.code] || 0) + Number(t.amount);
        }
    });
    const sorted = Object.keys(stats).sort((a,b) => stats[b] - stats[a]);
    if(sorted.length > 0) {
        const topCode = sorted[0]; const cat = getDynamicCategories().in.find(x => x.code === topCode);
        document.getElementById('leaderboard-top1').innerText = (cat ? cat.name.replace('Setoran Bulanan dari Relawan ','') : 'Relawan') + ` (Rp ${formatRp(stats[topCode])})`;
    } else { document.getElementById('leaderboard-top1').innerText = "Belum Ada Data Bulan Ini"; }
    
    c.innerHTML = sorted.map((code, i) => {
        const cat = getDynamicCategories().in.find(x => x.code === code);
        return `<tr><td>#${i+1}</td><td><strong>${cat ? cat.name.replace('Setoran Bulanan dari Relawan ','') : code}</strong></td><td style="color:var(--nu-green); font-weight:bold;">Rp ${formatRp(stats[code])}</td></tr>`;
    }).join('');
}

function renderLogs() { const tbody = document.getElementById('table-logs'); if(!tbody) return; tbody.innerHTML = logsData.sort((a,b) => new Date(b.time) - new Date(a.time)).map(l => `<tr><td>${formatTanggalIndo((l.time||'').slice(0,10))}</td><td><span class="badge" style="background:#e2e8f0; color:#334155;">${(l.user||'Sistem').toUpperCase()}</span></td><td><strong>${l.action||'Info'}</strong></td><td><small>${l.detail||'-'}</small></td></tr>`).join(''); }

// =====================================================================
// --- 7. WINDOW BINDS UTAMA (TOMBOL KLIK HTML) ---
// =====================================================================
window.toggleSidebar = () => { document.getElementById('app-sidebar').classList.toggle('mobile-open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
window.toggleThemeMode = () => { document.body.classList.toggle('dark-mode'); }
window.updateCategories = () => { const t = document.getElementById('t-type').value, c = getDynamicCategories(); document.getElementById('t-category').innerHTML = c[t].map(x => `<option value="${x.code}">${x.name}</option>`).join(''); }

window.switchTab = (e, tab) => { 
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab).classList.remove('hidden'); 
    if(e && e.currentTarget) e.currentTarget.classList.add('active');
    if(window.innerWidth <= 1024) { document.getElementById('app-sidebar').classList.remove('mobile-open'); document.getElementById('sidebar-overlay').classList.remove('active'); }
    
    if(tab === 'v-dashboard' || tab === 'v-histori') refreshUI();
    if(tab === 'v-laporan') window.buildReport();
    if(tab === 'v-poster') window.buildPoster();
    if(tab === 'v-analitik') renderCharts();
    if(tab === 'v-konten') renderKontenHarian();
    if(tab === 'v-leaderboard') renderLeaderboard();
}

window.exportExcelBukuBesar = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions.map(t=>({"Tanggal":t.date,"Akun":t.code,"Sumber":t.source,"Debit":t.type==='in'?t.amount:0,"Kredit":t.type==='out'?t.amount:0,"Ket":t.desc}))), "Buku_Besar"); XLSX.writeFile(wb, `Buku_Besar_${Date.now()}.xlsx`); }
window.downloadJSONBackup = () => { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({profile: profileSettings, transactions, mustahik: dbMustahik})); a.download = `Backup_${Date.now()}.json`; a.click(); }
window.restoreJSONBackup = (e) => { const r = new FileReader(); r.onload = async ev => { try { const res = JSON.parse(ev.target.result); for(let t of res.transactions){ delete t.idFirebase; await window.fs.addDoc(getCol("transactions"), t); } showToast("Restore Sukses", "success"); } catch(err){} }; r.readAsText(e.target.files[0]); }
window.cetakStrukBluetooth = async () => { try { const device = await navigator.bluetooth.requestDevice({ filters: [{services: ['000018f0-0000-1000-8000-00805f9b34fb']}] }); await device.gatt.connect(); showToast("Terhubung & Mencetak...", "success"); } catch(err) { showToast("Batal koneksi printer", "error"); } }
window.cetakBukuBesarPDF = () => html2pdf().set({ margin:10, filename:`BukuBesar_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'landscape'} }).from(document.getElementById('buku-besar-area')).save();
window.cetakPDF = () => { window.buildReport(); html2pdf().set({ margin:8, filename:`Laporan_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'landscape'} }).from(document.getElementById('print-area')).save(); }
window.cetakPosterPDF = () => { window.buildPoster(); html2pdf().set({ margin:5, filename:`Poster_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'portrait'} }).from(document.getElementById('poster-print-area')).save(); }
window.openKuitansi = (id) => { 
    const t = transactions.find(x => x.idFirebase === id); 
    document.getElementById('kui-nominal').innerText = formatRp(t.amount); 
    document.getElementById('kui-ket').innerText = t.desc;
    document.getElementById('modal-kuitansi').classList.remove('hidden'); 
}
window.closeKuitansi = () => document.getElementById('modal-kuitansi').classList.add('hidden');
window.bukaKalkulatorAmil = () => document.getElementById('modal-amil').classList.remove('hidden');

// =====================================================================
// --- 8. STARTUP & SINKRONISASI LOGIN ---
// =====================================================================
async function loadAllCloudData() {
    window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (snap) => { if(snap.exists()) { profileSettings = {...profileSettings, ...snap.data()}; if(document.getElementById('tg-token')) document.getElementById('tg-token').value = profileSettings.teleBotToken||''; if(document.getElementById('p-lembaga')) document.getElementById('p-lembaga').value = profileSettings.lembaga; if(document.getElementById('p-periode')) document.getElementById('p-periode').value = profileSettings.periode; renderAnggota(); }});
    window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snap) => { transactions=[]; snap.forEach(d => transactions.push({idFirebase:d.id, ...d.data()})); refreshUI(); const p1=document.getElementById('v-laporan'), p2=document.getElementById('v-poster'), p3=document.getElementById('v-analitik'); if(p1&&!p1.classList.contains('hidden'))window.buildReport(); if(p2&&!p2.classList.contains('hidden'))window.buildPoster(); if(p3&&!p3.classList.contains('hidden'))renderCharts(); if(document.getElementById('v-leaderboard')&&!document.getElementById('v-leaderboard').classList.contains('hidden')) renderLeaderboard(); });
    window.fs.onSnapshot(getCol("inventaris"), (snap) => { dbInventaris=[]; snap.forEach(d => dbInventaris.push({id:d.id, ...d.data()})); renderInventaris(); });
    window.fs.onSnapshot(getCol("agenda"), (snap) => { dbAgenda=[]; snap.forEach(d => dbAgenda.push({id:d.id, ...d.data()})); renderAgenda(); });
    window.fs.onSnapshot(getCol("todos"), (snap) => { dbTodos=[]; snap.forEach(d => dbTodos.push({id:d.id, ...d.data()})); renderTodos(); });
    window.fs.onSnapshot(getCol("proker"), (snap) => { dbProker=[]; snap.forEach(d => dbProker.push({id:d.id, ...d.data()})); renderProker(); }); // Load proker live
    window.fs.onSnapshot(getCol("mustahik"), (snap) => { dbMustahik=[]; snap.forEach(d => dbMustahik.push({idFirebase:d.id, ...d.data()})); const tb = document.getElementById('table-mustahik'); if(tb){ tb.innerHTML = dbMustahik.map(m => `<tr><td><strong>${m.nama}</strong></td><td><span class="badge" style="background:#f1f5f9; color:black;">${m.kategori}</span></td><td><button class="btn-action admin-only" onclick="window.hapusMustahik('${m.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button></td></tr>`).join(''); } });
    window.fs.onSnapshot(window.fs.query(getCol("logs"), window.fs.orderBy("time", "asc")), (snap) => { logsData=[]; snap.forEach(d => logsData.push(d.data())); renderLogs(); });
}

window.togglePasswordVisibility = () => { const p=document.getElementById('l-pass'), i=document.getElementById('eye-icon'); if(p.type==='password'){p.type='text'; i.className='fa-solid fa-eye-slash';}else{p.type='password'; i.className='fa-solid fa-eye';} };
window.toggleModeAuth = (e) => { e.preventDefault(); isRegisterMode = !isRegisterMode; document.getElementById('group-ranting').style.display = isRegisterMode ? 'block' : 'none'; document.getElementById('l-ranting').required = isRegisterMode; document.getElementById('btn-auth-submit').innerHTML = isRegisterMode ? '<i class="fa-solid fa-user-plus"></i> Daftar Baru' : '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem Terpadu'; document.getElementById('link-toggle-auth').innerText = isRegisterMode ? 'Sudah punya akun? Masuk' : 'Belum punya akun Ranting? Daftar di sini'; };
window.recoverPasswordEmail = async () => { let em = document.getElementById('l-user').value; if(!em) em = prompt("Masukkan Email Anda:"); if(!em) return; try{ await window.authServices.sendPasswordResetEmail(window.auth, em); showToast("Link pemulihan dikirim!", "success"); }catch(e){ showToast("Gagal kirim pemulihan", "error"); } };
window.logout = async () => { await window.authServices.signOut(window.auth); location.reload(); }

document.addEventListener("DOMContentLoaded", () => {
    window.updateCategories();

    async function prosesLogin() {
        const email = document.getElementById('l-user').value.trim();
        const pass = document.getElementById('l-pass').value;
        const rantingName = document.getElementById('l-ranting') ? document.getElementById('l-ranting').value.trim() : "";
        const remember = document.getElementById('remember-me') ? document.getElementById('remember-me').checked : false;
        const btnSubmit = document.getElementById('btn-auth-submit');

        if(!email || !pass) return showToast("Harap isi Email dan Sandi!", "error");
        if(btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...';
        
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
        } catch (error) {
            showToast("Sandi Salah / Periksa Koneksi", "error");
        } finally {
            if(btnSubmit) btnSubmit.innerHTML = isRegisterMode ? '<i class="fa-solid fa-user-plus"></i> Daftar Baru' : '<i class="fa-solid fa-right-to-bracket"></i> Akses Sistem Terpadu';
        }
    }

    const formLogin = document.getElementById('form-login');
    if(formLogin) { formLogin.addEventListener('submit', async e => { e.preventDefault(); await prosesLogin(); }); }

    window.authServices.onAuthStateChanged(window.auth, async user => {
        if(user) {
            try { 
                let d = await window.fs.getDoc(window.fs.doc(window.db, "users", user.uid)); 
                if(d.exists()){ asalRanting = d.data().ranting||""; currentUserRole = d.data().role||"bendahara"; } 
            } catch(e){}
            document.getElementById('auth-screen').classList.add('hidden'); 
            document.getElementById('app-screen').classList.remove('hidden');
            loadAllCloudData(); applyRBAC();
        }
    });
});
