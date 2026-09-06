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
window.authServices = { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail };

// =====================================================================
// --- 2. GLOBAL STATE & FITUR DATABASE BARU ---
// =====================================================================
let asalRanting = ""; let currentUserRole = 'bendahara'; let isRegisterMode = false; window.activeKontenText = null;
let transactions = []; let dbMustahik = []; let logsData = []; 
let dbInventaris = []; let dbAgenda = []; let dbTodos = []; // FITUR BARU: Penampung Koleksi

let currentPage = 1; const itemsPerPage = 15; let totalPages = 1; 
let profileSettings = { lembaga: 'UPZIS', periode: '2024-2029', relawan: ['Ana'], logoBase64: 'icon-192.png', teleBotToken: '', teleChatId: '' };

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

// =====================================================================
// --- 4. LOGIKA TRANSAKSI UTAMA, FILTER, & PAGINASI ---
// =====================================================================
window.ubahHalaman = function(arah) {
    if (arah === -1 && currentPage > 1) currentPage--;
    else if (arah === 1 && currentPage < totalPages) currentPage++;
    refreshUI();
}
async function kirimTelegram(jenis, nominal, desc) {
    if(!profileSettings.teleBotToken || !profileSettings.teleChatId) return;
    const pesan = `*MUTASI UPZIS*\n🔹 Tipe: ${jenis}\n🔹 Nominal: Rp ${formatRp(nominal)}\n🔹 Ket: ${desc}`;
    try { await fetch(`https://api.telegram.org/bot${profileSettings.teleBotToken}/sendMessage?chat_id=${profileSettings.teleChatId}&text=${encodeURIComponent(pesan)}`); } catch(e) {}
}
window.simpanTelegram = function() { profileSettings.teleBotToken = document.getElementById('tg-token').value; profileSettings.teleChatId = document.getElementById('tg-chatid').value; window.fs.setDoc(getFirestoreDoc("settings", "profile"), profileSettings); showToast("Telegram Disimpan", "success"); }

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
    // FITUR BARU: Filter Range Nominal
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
        const matchDate = (!st || t.date >= st) && (!en || t.date <= en);
        const matchNom = t.amount >= minNom && t.amount <= maxNom; // Cek nominal
        return matchK && matchDate && (!ft || t.type === ft) && matchNom;
    });

    totalPages = Math.ceil(sortedTrx.length / itemsPerPage) || 1;
    if(currentPage > totalPages) currentPage = totalPages;
    const paginated = sortedTrx.slice().reverse().slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if(tbody) {
        paginated.forEach(t => {
            const catName = allCats.find(c => c.code === t.code)?.name || 'Lainnya';
            let act = `<button class="btn-action" onclick="window.openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt"></i></button>`;
            if(currentUserRole === 'bendahara') act += `<button class="btn-action admin-only" onclick="window.hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button>`;
            tbody.innerHTML += `<tr><td>${formatTanggalIndo(t.date)}</td><td>${t.source}</td><td>[${t.code}] ${catName}<br><small>${t.desc}</small></td><td style="color:green;">${t.type==='in'?formatRp(t.amount):'-'}</td><td style="color:red;">${t.type==='out'?formatRp(t.amount):'-'}</td><td style="font-weight:bold;">${formatRp(t.currentBalance)}</td><td>${act}</td></tr>`;
        });
        document.getElementById('page-indicator').innerText = `Hal ${currentPage} dari ${totalPages}`;
    }
    ['sum-tunai','sum-bank','sum-masuk','sum-keluar'].forEach((id,i) => { if(document.getElementById(id)) document.getElementById(id).innerText = formatRp([saldoTunai,saldoBank,grandIn,grandOut][i]); });
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
    const date=document.getElementById('t-date').value, desc=document.getElementById('t-desc').value, amt=parseFloat(amtInput.value.replace(/\./g,''));
    if(!amt || amt <= 0) return showToast("Nominal salah!", "error");
    document.getElementById('btn-submit-trx').disabled = true;
    try { await window.fs.addDoc(getCol("transactions"), { type, source:src, code, date, amount:amt, desc, timestamp: Date.now() });
        amtInput.value=''; document.getElementById('t-desc').value=''; showToast("Tersimpan!", "success"); kirimTelegram(type==='in'?'Masuk':'Keluar', amt, desc);
    } catch(err) { showToast("Gagal", "error"); } finally { document.getElementById('btn-submit-trx').disabled = false; }
});
window.hapusTrx = async function(id) { if(confirm("Hapus?")) { await window.fs.deleteDoc(getFirestoreDoc("transactions", id)); showToast("Dihapus", "success"); } }

// =====================================================================
// --- 5. RENDER MENU GRAFIK, LAPORAN & STUDIO (FUNGSI LAMA) ---
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

window.buildReport = function() {
    let fStr = document.getElementById('filter-month')?.value;
    if(!fStr) { fStr = new Date().toISOString().slice(0, 7); if(document.getElementById('filter-month')) document.getElementById('filter-month').value = fStr; }
    if(document.getElementById('lap-periode')) document.getElementById('lap-periode').innerText = `Bulan: ${fStr}`;
    let sIn={}, sOut={}, tIn=0, tOut=0, sAw=0, sT=0, sB=0;
    transactions.forEach(t => {
        const m=t.date.slice(0,7), amt=Number(t.amount||0);
        if(m<fStr) { if(t.type==='in'&&t.code!=='120'&&t.code!=='220')sAw+=amt; if(t.type==='out'&&t.code!=='120'&&t.code!=='220')sAw-=amt; }
        if(m<=fStr){ if(t.type==='in'){ if(t.code==='120'){sT+=amt;sB-=amt;}else if(t.code==='220'){sB+=amt;sT-=amt;}else{t.source.includes('Bank')?sB+=amt:sT+=amt;} } if(t.type==='out'){t.source.includes('Bank')?sB-=amt:sT-=amt;} }
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

function renderKontenHarian() {
    if(document.getElementById('konten-harian-container') && !document.getElementById('konten-harian-container').innerHTML.includes('select')) {
        document.getElementById('konten-harian-container').innerHTML = `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:25px;"><div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color);"><h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-pen-to-square"></i> Konfigurasi Pesan</h4><div class="form-group"><label>Pilih Tema</label><select id="kategori-kampanye" onchange="window.updateKampanyePreview()"><option value="sedekah">Keutamaan Sedekah</option><option value="zakat">Kewajiban Zakat</option><option value="motivasi">Motivasi</option></select></div><div class="form-group"><label>Pratinjau Teks</label><textarea id="teks-kampanye" rows="5"></textarea></div><div style="display:flex; gap:10px;"><button onclick="window.navigator.clipboard.writeText(document.getElementById('teks-kampanye').value); showToast('Disalin!','success');" class="btn btn-outline" style="flex:1;">Salin</button><a id="btn-wa-kampanye" href="#" target="_blank" class="btn btn-primary" style="flex:2; background:#25d366; color:white; border:none;">Bagikan WA</a></div></div><div style="background:var(--bg-main); padding:24px; border-radius:16px; border:1px solid var(--border-color); text-align:center;"><h4 style="color:var(--nu-green-dark); margin-bottom:15px; font-size:14px;"><i class="fa-solid fa-film"></i> Pratinjau Video AI</h4><canvas id="video-canvas" width="800" height="800" style="width:100%; max-width:280px; border-radius:12px; background:#012a14; margin-bottom:20px;"></canvas><button id="btn-download-video" onclick="window.downloadCanvasAsVideo()" class="btn btn-primary" style="width:100%;">Unduh Video MP4</button></div></div>`;
        window.updateKampanyePreview();
    }
}
window.updateKampanyePreview = function() {
    const dbKonten = { 'sedekah': { judul: "Pahala Berlipat", teks: "Perumpamaan orang yang menginfakkan hartanya... (Al-Baqarah: 261)" }, 'zakat': { judul: "Pembersih Harta", teks: "Ambillah zakat dari sebagian harta mereka... (At-Taubah: 103)" }, 'motivasi': { judul: "Tolak Bala", teks: "Bersegeralah bersedekah... (HR. Thabrani)" } };
    const kat = document.getElementById('kategori-kampanye')?.value || 'sedekah'; window.activeKontenText = dbKonten[kat]; 
    const txt = `*${dbKonten[kat].judul}*\n\n"${dbKonten[kat].teks}"\n\nMari salurkan ZIS via UPZIS.`;
    if(document.getElementById('teks-kampanye')) document.getElementById('teks-kampanye').value = txt; 
    if(document.getElementById('btn-wa-kampanye')) document.getElementById('btn-wa-kampanye').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`;
}

// =====================================================================
// --- 6. LOGIKA 10 FITUR BARU ENTERPRISE (AGENDA, TODO, DLL) ---
// =====================================================================

// FITUR BARU: Cetak Warga Mustahik ke PDF
window.cetakMustahikPDF = function() {
    const el = document.getElementById('mustahik-print-area');
    html2pdf().set({ margin: 10, filename: `Data_Warga_${Date.now()}.pdf`, jsPDF: { format: 'a4', orientation: 'portrait' } }).from(el).save();
}

// FITUR BARU: Email Kuitansi
window.kirimKuitansiEmail = function() {
    const nominal = document.getElementById('kui-nominal').innerText, ket = document.getElementById('kui-ket').innerText;
    window.location.href = `mailto:?subject=Bukti Kuitansi UPZIS&body=Telah diterima/disalurkan uang sejumlah ${nominal} untuk ${ket}. Terima kasih.`;
}

// FITUR BARU: Mode Fullscreen
window.toggleFullScreen = function() {
    const fsIcon = document.getElementById('fs-icon');
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); fsIcon.className = "fa-solid fa-compress"; } 
    else if (document.exitFullscreen) { document.exitFullscreen(); fsIcon.className = "fa-solid fa-expand"; }
}

// FITUR BARU: CRUD Inventaris
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

// FITUR BARU: CRUD Agenda Rapat
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

// FITUR BARU: ToDo List
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

// FITUR BARU: Leaderboard Relawan (Otomatis dari Transaksi)
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

// =====================================================================
// --- 7. WINDOW BINDS (MENGHUBUNGKAN HTML DENGAN JS) ---
// =====================================================================
window.toggleSidebar = () => { document.getElementById('app-sidebar').classList.toggle('mobile-open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
window.toggleThemeMode = () => { document.body.classList.toggle('dark-mode'); }
window.updateCategories = () => { const t = document.getElementById('t-type').value, c = getDynamicCategories(); document.getElementById('t-category').innerHTML = c[t].map(x => `<option value="${x.code}">${x.name}</option>`).join(''); }

// PENYEMPURNAAN: TAB MENU DIJAMIN MENG-RENDER KONTEN
window.switchTab = (e, tab) => { 
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab).classList.remove('hidden'); 
    if(e && e.currentTarget) e.currentTarget.classList.add('active');
    if(window.innerWidth <= 1024) { document.getElementById('app-sidebar').classList.remove('mobile-open'); document.getElementById('sidebar-overlay').classList.remove('active'); }
    
    // PEMICU RENDER GRAFIS (Ini yang menyelesaikan menu kosong)
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
window.openKuitansi = (id) => { const t = transactions.find(x => x.idFirebase === id); document.getElementById('kui-nominal').innerText = formatRp(t.amount); document.getElementById('modal-kuitansi').classList.remove('hidden'); }
window.closeKuitansi = () => document.getElementById('modal-kuitansi').classList.add('hidden');
window.bukaKalkulatorAmil = () => document.getElementById('modal-amil').classList.remove('hidden');

// =====================================================================
// --- 8. STARTUP & LOGIN LISTENER ---
// =====================================================================
async function loadAllCloudData() {
    window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (snap) => { if(snap.exists()) { profileSettings = {...profileSettings, ...snap.data()}; if(document.getElementById('tg-token')) document.getElementById('tg-token').value = profileSettings.teleBotToken||''; }});
    window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snap) => { transactions=[]; snap.forEach(d => transactions.push({idFirebase:d.id, ...d.data()})); refreshUI(); const p1=document.getElementById('v-laporan'), p2=document.getElementById('v-poster'), p3=document.getElementById('v-analitik'); if(p1&&!p1.classList.contains('hidden'))window.buildReport(); if(p2&&!p2.classList.contains('hidden'))window.buildPoster(); if(p3&&!p3.classList.contains('hidden'))renderCharts(); if(!document.getElementById('v-leaderboard').classList.contains('hidden')) renderLeaderboard(); });
    // LISTENER KOLEKSI BARU (INVENTARIS, AGENDA, TODO)
    window.fs.onSnapshot(getCol("inventaris"), (snap) => { dbInventaris=[]; snap.forEach(d => dbInventaris.push({id:d.id, ...d.data()})); renderInventaris(); });
    window.fs.onSnapshot(getCol("agenda"), (snap) => { dbAgenda=[]; snap.forEach(d => dbAgenda.push({id:d.id, ...d.data()})); renderAgenda(); });
    window.fs.onSnapshot(getCol("todos"), (snap) => { dbTodos=[]; snap.forEach(d => dbTodos.push({id:d.id, ...d.data()})); renderTodos(); });
    window.fs.onSnapshot(getCol("mustahik"), (snap) => { dbMustahik=[]; snap.forEach(d => dbMustahik.push({idFirebase:d.id, ...d.data()})); });
}

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
