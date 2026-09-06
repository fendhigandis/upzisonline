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
let dbInventaris = []; let dbAgenda = []; let dbTodos = []; let dbDonatur = [];
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
    const pesan = `*MUTASI UPZIS*\n Tipe: ${jenis}\n Nominal: Rp ${formatRp(nominal)}\n Ket: ${desc}`;
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
            let act = `<button class="btn-action" title="Kuitansi" onclick="window.openKuitansi('${t.idFirebase}')"><i class="fa-solid fa-receipt"></i></button>`;
            if(t.proof) act += `<button class="btn-action" title="Lihat Bukti" onclick="window.lihatBukti('${t.idFirebase}')"><i class="fa-solid fa-paperclip" style="color:var(--accent-blue);"></i></button>`;
            if(currentUserRole === 'bendahara') { act += `<button class="btn-action admin-only" title="Edit" onclick="window.editTrx('${t.idFirebase}')"><i class="fa-solid fa-pen" style="color:var(--nu-gold-dark);"></i></button>`; act += `<button class="btn-action admin-only" title="Hapus" onclick="window.hapusTrx('${t.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button>`; }
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

function resetFormTrx() {
    document.getElementById('form-trx').reset(); amtInput.value=''; document.getElementById('t-edit-id').value='';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
    document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-check"></i> Rekam Transaksi';
    window.updateCategories();
}
window.cancelEditTrx = function() { resetFormTrx(); }
window.editTrx = function(id) {
    if(currentUserRole !== 'bendahara') return;
    const t = transactions.find(x => x.idFirebase === id); if(!t) return;
    document.getElementById('t-edit-id').value = id;
    document.getElementById('t-type').value = t.type; window.updateCategories();
    document.getElementById('t-category').value = t.code;
    document.getElementById('t-source').value = t.source;
    document.getElementById('t-date').value = t.date;
    document.getElementById('t-desc').value = t.desc;
    amtInput.value = Number(t.amount).toLocaleString('id-ID');
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('btn-submit-trx').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan';
    window.goToTab('v-dashboard');
    document.getElementById('form-trx').scrollIntoView({behavior:'smooth'});
}
window.lihatBukti = function(id) {
    const t = transactions.find(x => x.idFirebase === id); if(!t || !t.proof) return showToast("Tidak ada bukti/nota.", "error");
    const w = window.open('', '_blank'); if(!w) return showToast("Popup diblokir browser.", "error");
    w.document.write(`<title>Bukti Transaksi</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${t.proof}" style="max-width:100%;max-height:100%;"></body>`);
}

const formTrx = document.getElementById('form-trx');
if(formTrx) formTrx.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const editId = document.getElementById('t-edit-id').value;
    const type=document.getElementById('t-type').value, code=document.getElementById('t-category').value, src=document.getElementById('t-source').value;
    const date=document.getElementById('t-date').value, desc=document.getElementById('t-desc').value, amt=parseFloat(amtInput.value.replace(/\./g,''));
    if(!amt || amt <= 0) return showToast("Nominal salah!", "error");
    const proofFile = document.getElementById('t-proof').files[0];
    document.getElementById('btn-submit-trx').disabled = true;

    const persist = async (proofB64) => {
        try {
            const payload = { type, source:src, code, date, amount:amt, desc };
            if(proofB64) payload.proof = proofB64;
            if(editId) {
                await window.fs.updateDoc(getFirestoreDoc("transactions", editId), payload);
                showToast("Perubahan disimpan!", "success");
            } else {
                payload.timestamp = Date.now();
                await window.fs.addDoc(getCol("transactions"), payload);
                showToast("Tersimpan!", "success"); kirimTelegram(type==='in'?'Masuk':'Keluar', amt, desc);
            }
            resetFormTrx();
        } catch(err) { showToast("Gagal menyimpan", "error"); } finally { document.getElementById('btn-submit-trx').disabled = false; }
    };
    if(proofFile) { compressImageBase64(proofFile, persist); } else { persist(editId ? (transactions.find(x=>x.idFirebase===editId)?.proof || null) : null); }
});
window.hapusTrx = async function(id) { if(confirm("Hapus?")) { await window.fs.deleteDoc(getFirestoreDoc("transactions", id)); showToast("Dihapus", "success"); } }

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

// FITUR: Unduh Pratinjau Video Kampanye (rekam canvas menjadi file video singkat)
window.downloadCanvasAsVideo = function() {
    const cvs = document.getElementById('video-canvas'); if(!cvs) return;
    if(!cvs.captureStream || typeof MediaRecorder === 'undefined') return showToast("Browser tidak mendukung rekam video.", "error");
    const btn = document.getElementById('btn-download-video');
    try {
        const stream = cvs.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        const chunks = [];
        recorder.ondataavailable = e => { if(e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Konten_Sosialisasi_${Date.now()}.webm`; a.click();
            if(btn) btn.innerHTML = 'Unduh Video MP4';
            showToast("Video (.webm) berhasil diunduh.", "success");
        };
        if(btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Merekam...';
        recorder.start();
        // Animasikan sedikit teks selama rekaman agar tidak berupa gambar diam
        let frame = 0;
        const anim = setInterval(() => {
            frame++;
            const ctx = cvs.getContext('2d'); const t = window.activeKontenText;
            ctx.fillStyle = '#012a14'; ctx.fillRect(0,0,800,800);
            ctx.fillStyle = '#d4af37'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(frame/6);
            ctx.fillText(t ? t.judul : 'UPZIS', 400, 400);
            ctx.globalAlpha = 1;
        }, 100);
        setTimeout(() => { clearInterval(anim); recorder.stop(); }, 3000);
    } catch(err) { showToast("Gagal merekam video.", "error"); }
}

// =====================================================================
// --- 6. LOGIKA 10 FITUR BARU ENTERPRISE (ARSIP DOWNLOAD, GOOGLE AUTH, PENGURUS KOMPLEKS) ---
// =====================================================================

// FITUR BARU: Download Arsip Terpusat
window.loadArsip = async function() {
    const year = document.getElementById('input-arsip-year').value; if(!year) return; showToast(`Mencari arsip ${year}...`, "info");
    try { 
        const snap = await window.fs.getDocs(window.fs.query(getCol(`arsip_${year}_transactions`), window.fs.orderBy("date", "asc"))); 
        let html = ''; snap.forEach(d => { const t = d.data(); html += `<tr><td>${t.date}</td><td>${t.source}</td><td>${t.desc}</td><td>${t.type==='in'?formatRp(t.amount):'-'}</td><td>${t.type==='out'?formatRp(t.amount):'-'}</td></tr>`; }); 
        document.getElementById('table-arsip-body').innerHTML = html || '<tr><td colspan="5">Tidak ada arsip</td></tr>'; 
        if(!snap.empty) document.getElementById('arsip-action-bar').classList.remove('hidden'); // Memunculkan tombol download jika data ada
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

// FITUR: CRUD Warga & Relawan (Mustahik) - sebelumnya form ini tidak tersambung sama sekali
const formMustahik = document.getElementById('form-mustahik');
if(formMustahik) formMustahik.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const nama = document.getElementById('m-nama').value.trim(), kategori = document.getElementById('m-kategori').value;
    if(!nama) return;
    try { await window.fs.addDoc(getCol("mustahik"), { nama, kategori }); e.target.reset(); showToast("Data warga disimpan.", "success"); }
    catch(err) { showToast("Gagal menyimpan data.", "error"); }
});
window.hapusMustahik = async function(id) { if(currentUserRole !== 'bendahara') return; if(confirm("Hapus data warga ini?")) { await window.fs.deleteDoc(getFirestoreDoc("mustahik", id)); showToast("Dihapus", "success"); } }

// FITUR: EKSEKUSI TUTUP BUKU (sebelumnya tombol ada tapi fungsinya tidak pernah dibuat sama sekali)
window.eksekusiTutupBuku = async function() {
    if(currentUserRole !== 'bendahara') return showToast("Hanya Bendahara yang berwenang.", "error");
    const thisYear = new Date().getFullYear();
    const yearInput = prompt(`Masukkan Tahun Buku yang akan DITUTUP (arsipkan & reset):`, thisYear);
    if(!yearInput) return;
    const year = String(parseInt(yearInput));
    if(!/^\d{4}$/.test(year)) return showToast("Tahun tidak valid.", "error");
    const konfirmasi = prompt(`PERINGATAN: Seluruh transaksi tahun ${year} akan diarsipkan dan dihapus dari Buku Besar aktif, lalu saldo akhirnya dibawa sebagai Saldo Awal tahun ${parseInt(year)+1}.\n\nKetik "TUTUP ${year}" untuk konfirmasi:`);
    if(konfirmasi !== `TUTUP ${year}`) return showToast("Tutup buku dibatalkan.", "info");

    try {
        showToast("Memproses tutup buku, mohon tunggu...", "info");
        const yearTrx = transactions.filter(t => (t.date||'').slice(0,4) === year);
        if(yearTrx.length === 0) return showToast(`Tidak ada transaksi tahun ${year}.`, "error");

        // Hitung saldo akhir kas & bank hingga akhir tahun (termasuk saldo carry-over dari tahun-tahun sebelumnya)
        let saldoTunai = 0, saldoBank = 0;
        transactions.filter(t => (t.date||'') <= `${year}-12-31`).forEach(t => {
            const amt = Number(t.amount||0);
            if(t.type === 'in') { if(t.code==='120'){saldoTunai+=amt; saldoBank-=amt;} else if(t.code==='220'){saldoBank+=amt; saldoTunai-=amt;} else { t.source.includes('Bank')?saldoBank+=amt:saldoTunai+=amt; } }
            if(t.type === 'out') { t.source.includes('Bank')?saldoBank-=amt:saldoTunai-=amt; }
        });

        // Arsipkan seluruh transaksi tahun ini ke koleksi arsip, lalu hapus dari buku besar aktif
        for(const t of yearTrx) {
            const copy = {...t}; delete copy.idFirebase;
            await window.fs.addDoc(getCol(`arsip_${year}_transactions`), copy);
            await window.fs.deleteDoc(getFirestoreDoc("transactions", t.idFirebase));
        }

        // Bawa saldo akhir sebagai Saldo Awal tahun berikutnya
        const nextYear = parseInt(year) + 1;
        if(saldoTunai !== 0) await window.fs.addDoc(getCol("transactions"), { type:'in', source:'Kas Tunai', code:'101', date:`${nextYear}-01-01`, amount: Math.abs(saldoTunai), desc:`Saldo Awal Pindahan Tutup Buku ${year}`, timestamp: Date.now() });
        if(saldoBank !== 0) await window.fs.addDoc(getCol("transactions"), { type:'in', source:'Rekening Bank BRI', code:'101', date:`${nextYear}-01-01`, amount: Math.abs(saldoBank), desc:`Saldo Awal Pindahan Tutup Buku ${year}`, timestamp: Date.now() });

        await window.fs.addDoc(getCol("logs"), { time: new Date().toISOString(), user: asalRanting||'Bendahara', action: 'TUTUP_BUKU', detail: `Tutup buku tahun ${year}, ${yearTrx.length} transaksi diarsipkan.` });
        showToast(`Tutup buku tahun ${year} berhasil. Saldo dibawa ke tahun ${nextYear}.`, "success");
    } catch(err) { showToast("Gagal memproses tutup buku.", "error"); }
}

// FITUR BARU: Cetak Warga Mustahik ke PDF
window.cetakMustahikPDF = function() {
    const el = document.getElementById('mustahik-print-area');
    withExportMode(() => html2pdf().set({ margin: 10, filename: `Data_Warga_${Date.now()}.pdf`, jsPDF: { format: 'a4', orientation: 'portrait' } }).from(el).save());
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

// FITUR BARU: Hubungkan Google
window.hubungkanGoogle = async function() {
    if(!window.auth.currentUser) return;
    const provider = new window.authServices.GoogleAuthProvider();
    try {
        await window.authServices.linkWithPopup(window.auth.currentUser, provider);
        showToast("Berhasil terhubung ke Akun Google!", "success");
        // Otomatis trigger sinkronisasi Cloud (karena auth listener akan menangkap credential baru)
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
        const cred = window.authServices.EmailAuthProvider.credential(window.auth.currentUser.email, oldPw);
        await window.authServices.reauthenticateWithCredential(window.auth.currentUser, cred);
        await window.authServices.updatePassword(window.auth.currentUser, newPw);
        showToast("Kata Sandi berhasil diperbarui!", "success");
        e.target.reset();
    } catch (error) {
        showToast("Sandi Lama salah atau proses ditolak.", "error");
    }
});

// FITUR BARU: PENGURUS KOMPLEKS (DENGAN UPLOAD GAMBAR)
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

function renderLogs() { const tbody = document.getElementById('table-logs'); if(!tbody) return; tbody.innerHTML = logsData.sort((a,b) => new Date(b.time) - new Date(a.time)).map(l => `<tr><td>${formatTanggalIndo((l.time||'').slice(0,10))}</td><td><span class="badge" style="background:#e2e8f0; color:#334155;">${(l.user||'Sistem').toUpperCase()}</span></td><td><strong>${l.action||'Info'}</strong></td><td><small>${l.detail||'-'}</small></td></tr>`).join(''); }

// =====================================================================
// --- 7. WINDOW BINDS UTAMA (TOMBOL KLIK HTML) ---
// =====================================================================
window.toggleSidebar = () => { document.getElementById('app-sidebar').classList.toggle('mobile-open'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
window.toggleThemeMode = () => { document.body.classList.toggle('dark-mode'); }
window.updateCategories = () => { const t = document.getElementById('t-type').value, c = getDynamicCategories(); document.getElementById('t-category').innerHTML = c[t].map(x => `<option value="${x.code}">${x.name}</option>`).join(''); }

// PENGHUBUNG TAB YANG MENJAMIN GRAFIK TAMPIL
window.switchTab = (e, tab) => { 
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab).classList.remove('hidden'); 
    if(e && e.currentTarget) e.currentTarget.classList.add('active');
    if(window.innerWidth <= 1024) { document.getElementById('app-sidebar').classList.remove('mobile-open'); document.getElementById('sidebar-overlay').classList.remove('active'); }
    
    // RENDER GRAFIS
    if(tab === 'v-dashboard' || tab === 'v-histori') refreshUI();
    if(tab === 'v-laporan') window.buildReport();
    if(tab === 'v-poster') window.buildPoster();
    if(tab === 'v-analitik') renderCharts();
    if(tab === 'v-konten') renderKontenHarian();
    if(tab === 'v-leaderboard') renderLeaderboard();
    if(tab === 'v-statistik') renderStatistikTahunan();
    if(tab === 'v-donatur') renderDonatur();
}
// Navigasi terprogram (dipanggil dari kode, bukan klik langsung) tetap menyorot menu sidebar yang benar
window.goToTab = function(tab) {
    const btn = document.querySelector(`.tab-btn[onclick*="'${tab}'"]`);
    if(btn) btn.click(); else window.switchTab(null, tab);
}

window.exportExcelBukuBesar = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions.map(t=>({"Tanggal":t.date,"Akun":t.code,"Sumber":t.source,"Debit":t.type==='in'?t.amount:0,"Kredit":t.type==='out'?t.amount:0,"Ket":t.desc}))), "Buku_Besar"); XLSX.writeFile(wb, `Buku_Besar_${Date.now()}.xlsx`); }
function withExportMode(fn) {
    document.body.classList.add('exporting-mode');
    const cleanup = () => document.body.classList.remove('exporting-mode');
    try { return Promise.resolve(fn()).then(cleanup, cleanup); } catch(e) { cleanup(); throw e; }
}
window.downloadJSONBackup = () => { const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({profile: profileSettings, transactions, mustahik: dbMustahik, inventaris: dbInventaris, agenda: dbAgenda, todos: dbTodos, donatur: dbDonatur})); a.download = `Backup_Lengkap_${Date.now()}.json`; a.click(); }
window.restoreJSONBackup = (e) => { const r = new FileReader(); r.onload = async ev => {
    try {
        const res = JSON.parse(ev.target.result);
        const restoreCol = async (arr, colName, idField) => { if(!Array.isArray(arr)) return; for(let item of arr){ const copy = {...item}; delete copy[idField||'idFirebase']; delete copy.id; await window.fs.addDoc(getCol(colName), copy); } };
        await restoreCol(res.transactions, "transactions");
        await restoreCol(res.mustahik, "mustahik");
        await restoreCol(res.inventaris, "inventaris", "id");
        await restoreCol(res.agenda, "agenda", "id");
        await restoreCol(res.todos, "todos", "id");
        await restoreCol(res.donatur, "donatur");
        if(res.profile) { profileSettings = {...profileSettings, ...res.profile}; await window.fs.setDoc(getFirestoreDoc("settings","profile"), profileSettings); }
        showToast("Restore data lengkap berhasil.", "success");
    } catch(err){ showToast("Gagal memulihkan data. Pastikan file backup valid.", "error"); }
}; r.readAsText(e.target.files[0]); }
window.cetakStrukBluetooth = async () => { try { const device = await navigator.bluetooth.requestDevice({ filters: [{services: ['000018f0-0000-1000-8000-00805f9b34fb']}] }); await device.gatt.connect(); showToast("Terhubung & Mencetak...", "success"); } catch(err) { showToast("Batal koneksi printer", "error"); } }
window.cetakBukuBesarPDF = () => {
    if(document.getElementById('bb-lembaga-print')) document.getElementById('bb-lembaga-print').innerText = profileSettings.lembaga || 'UPZIS';
    if(document.getElementById('bb-periode-print')) document.getElementById('bb-periode-print').innerText = `Buku Besar Kas - Dicetak ${formatTanggalIndo(new Date().toISOString().slice(0,10))}`;
    withExportMode(() => html2pdf().set({ margin:10, filename:`BukuBesar_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'landscape'} }).from(document.getElementById('buku-besar-area')).save());
}
window.cetakPDF = () => { window.buildReport(); withExportMode(() => html2pdf().set({ margin:8, filename:`Laporan_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'landscape'} }).from(document.getElementById('print-area')).save()); }
window.cetakPosterPDF = () => { window.buildPoster(); withExportMode(() => html2pdf().set({ margin:5, filename:`Poster_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'portrait'} }).from(document.getElementById('poster-print-area')).save()); }
window.openKuitansi = (id) => {
    const t = transactions.find(x => x.idFirebase === id); if(!t) return;
    const cat = getDynamicCategories()[t.type==='in'?'in':'out'].find ? [...getDynamicCategories().in, ...getDynamicCategories().out].find(c => c.code === t.code) : null;
    const bendaharaAnggota = (profileSettings.anggota||[]).find(a => (a.jabatan||'').toLowerCase().includes('bendahara'));
    document.getElementById('kui-lembaga').innerText = profileSettings.lembaga || 'UPZIS';
    document.getElementById('kui-periode').innerText = `Masa Khidmat: ${profileSettings.periode || '-'}`;
    document.getElementById('kui-no').innerText = `No: ${t.type==='in'?'IN':'OUT'}/${(t.date||'').replace(/-/g,'')}/${(t.idFirebase||'').slice(0,5).toUpperCase()}`;
    document.getElementById('kui-tipe').innerText = t.type === 'in' ? `Penerimaan dari: ${t.source}` : `Penyaluran untuk: ${cat ? cat.name : t.code}`;
    document.getElementById('kui-nominal').innerText = formatRp(t.amount);
    document.getElementById('kui-ket').innerText = t.desc || '-';
    document.getElementById('kui-sumber').innerText = `${t.source} ${cat ? '('+cat.name+')' : ''}`;
    document.getElementById('kui-tgl').innerText = formatTanggalIndo(t.date);
    document.getElementById('kui-ttd').innerText = bendaharaAnggota ? bendaharaAnggota.nama : (document.getElementById('badge-username')?.innerText || 'Bendahara');
    window.currentKuitansiId = id;
    document.getElementById('modal-kuitansi').classList.remove('hidden');
}
window.closeKuitansi = () => document.getElementById('modal-kuitansi').classList.add('hidden');
window.kirimKuitansiWA = function() {
    const teks = `*KUITANSI ${document.getElementById('kui-lembaga').innerText}*\n${document.getElementById('kui-no').innerText}\n\n${document.getElementById('kui-tipe').innerText}\nJumlah: ${document.getElementById('kui-nominal').innerText}\nKeterangan: ${document.getElementById('kui-ket').innerText}\nTanggal: ${document.getElementById('kui-tgl').innerText}\n\nTerima kasih atas partisipasi Anda.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`, '_blank');
}
window.cetakKuitansiPDF = function() {
    withExportMode(() => html2pdf().set({ margin:8, filename:`Kuitansi_${Date.now()}.pdf`, jsPDF:{format:'a5', orientation:'landscape'} }).from(document.getElementById('kuitansi-print-area')).save());
}
window.bukaKalkulatorAmil = () => {
    const currentM = new Date().toISOString().slice(0,7); let total = 0;
    transactions.forEach(t => { if(t.date && t.date.slice(0,7) === currentM && t.type === 'in' && t.code !== '120' && t.code !== '220' && t.code !== '101') total += Number(t.amount||0); });
    document.getElementById('amil-total').innerText = formatRp(total);
    document.getElementById('amil-hak').innerText = formatRp(total * 0.125);
    document.getElementById('modal-amil').classList.remove('hidden');
}
window.clearFilters = function() {
    ['search-keyword','filter-type','filter-start-date','filter-end-date','filter-min','filter-max'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    currentPage = 1; refreshUI();
}

// =====================================================================
// --- 9. IDENTITAS LEMBAGA (SINKRON KE SEMUA HALAMAN) ---
// =====================================================================
function applyBranding() {
    const logo = profileSettings.logoBase64 || 'icon-192.png';
    const nama = profileSettings.lembaga || 'UPZIS Ranting';
    const periode = profileSettings.periode || '-';
    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = nama;
    if(document.getElementById('nav-period')) document.getElementById('nav-period').innerText = periode;
    if(document.getElementById('nav-logo')) document.getElementById('nav-logo').src = logo;
    if(document.getElementById('pdf-nama-lembaga')) document.getElementById('pdf-nama-lembaga').innerText = nama;
    if(document.getElementById('poster-lembaga')) document.getElementById('poster-lembaga').innerText = nama;
    if(document.getElementById('poster-periode-text')) document.getElementById('poster-periode-text').innerText = `Masa Khidmat ${periode}`;
    const ketua = (profileSettings.anggota||[]).find(a => (a.jabatan||'').toLowerCase().includes('ketua'));
    const bendahara = (profileSettings.anggota||[]).find(a => (a.jabatan||'').toLowerCase().includes('bendahara'));
    if(document.getElementById('pdf-ttd-ketua')) document.getElementById('pdf-ttd-ketua').innerText = ketua ? ketua.nama : '...........................';
    if(document.getElementById('pdf-ttd-bendahara')) document.getElementById('pdf-ttd-bendahara').innerText = bendahara ? bendahara.nama : '...........................';
}
function applyUserBadge(email) {
    if(document.getElementById('badge-username')) document.getElementById('badge-username').innerText = (asalRanting || email || 'Bendahara');
    if(document.getElementById('badge-role-text')) document.getElementById('badge-role-text').innerText = currentUserRole === 'bendahara' ? 'Administrator' : 'Anggota';
}

// =====================================================================
// --- 10. PERINGATAN AKHIR TAHUN (REAL, BUKAN STATIS) ---
// =====================================================================
function checkYearEndWarning() {
    const el = document.getElementById('year-end-warning'); if(!el) return;
    const now = new Date(); const endOfYear = new Date(now.getFullYear(), 11, 31);
    const daysLeft = Math.ceil((endOfYear - now) / 86400000);
    if(daysLeft <= 30) {
        el.classList.remove('hidden');
        el.querySelector('span').innerHTML = `PERINGATAN AKHIR TAHUN: Sisa waktu ${daysLeft} hari!`;
    } else { el.classList.add('hidden'); }
}

// =====================================================================
// --- 11. STATUS KONEKSI REAL-TIME (BUKAN HARDCODE) ---
// =====================================================================
function updateConnectionStatus() {
    const led = document.getElementById('firebase-led'), badge = document.getElementById('sync-badge');
    if(!led) return;
    if(navigator.onLine) { led.classList.remove('led-red'); led.classList.add('led-green'); if(badge){ badge.innerText='ONLINE'; badge.className='badge badge-in'; } }
    else { led.classList.remove('led-green'); led.classList.add('led-red'); if(badge){ badge.innerText='OFFLINE'; badge.className='badge badge-off'; } }
}
window.addEventListener('online', () => { updateConnectionStatus(); showToast('Koneksi kembali online.', 'success'); });
window.addEventListener('offline', () => { updateConnectionStatus(); showToast('Koneksi terputus, data lokal tetap aman (cache).', 'error'); });

// =====================================================================
// --- 12. NOTIFIKASI LONCENG (TUGAS BELUM SELESAI + AGENDA DEKAT) ---
// =====================================================================
function renderNotifBadge() {
    const el = document.getElementById('notif-count'); if(!el) return;
    const pendingTodo = dbTodos.filter(t => !t.done).length;
    const soon = dbAgenda.filter(a => { const d = new Date(a.tgl) - new Date(); return d >= 0 && d <= 7*86400000; }).length;
    const count = pendingTodo + soon;
    if(count > 0) { el.innerText = count; el.classList.remove('hidden'); } else { el.classList.add('hidden'); }
}

// =====================================================================
// --- 13. GRAFIK & RINCIAN POSTER (SEBELUMNYA KOSONG) ---
// =====================================================================
function renderPosterChart() {
    const canvas = document.getElementById('posterChart'), breakdown = document.getElementById('poster-breakdown');
    if(!canvas && !breakdown) return;
    const start = document.getElementById('poster-start')?.value, end = document.getElementById('poster-end')?.value;
    let byCode = {};
    transactions.forEach(t => {
        if(t.type !== 'in' || t.code==='120' || t.code==='220' || t.code==='101') return;
        if(start && t.date < start) return; if(end && t.date > end) return;
        byCode[t.code] = (byCode[t.code]||0) + Number(t.amount||0);
    });
    const cats = getDynamicCategories().in;
    const labels = Object.keys(byCode).map(c => cats.find(x=>x.code===c)?.name || c);
    const values = Object.values(byCode);
    if(breakdown) breakdown.innerHTML = labels.length ? labels.map((l,i)=>`<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:12px;"><span>${l}</span><strong>${formatRp(values[i])}</strong></div>`).join('') : '<div style="font-size:12px; opacity:0.7;">Belum ada data pada rentang ini.</div>';
    if(canvas && typeof Chart !== 'undefined') { if(window.mcPoster) window.mcPoster.destroy(); window.mcPoster = new Chart(canvas.getContext('2d'), { type:'pie', data:{labels: labels.length?labels:['Kosong'], datasets:[{data: values.length?values:[1], backgroundColor:['#005a2b','#d4af37','#0284c7','#ec4899','#10b981','#f59e0b']}]}, options:{responsive:true, maintainAspectRatio:false} }); }
}
const _origBuildPoster = window.buildPoster;
window.buildPoster = function() { _origBuildPoster(); renderPosterChart(); };

// =====================================================================
// --- 14. MENU BARU: STATISTIK PERBANDINGAN TAHUNAN ---
// =====================================================================
function renderStatistikTahunan() {
    const cardsEl = document.getElementById('statistik-summary-cards'), tblEl = document.getElementById('table-statistik'), chartEl = document.getElementById('chartTahunan');
    if(!tblEl) return;
    let byYear = {};
    transactions.forEach(t => {
        if(!t.date || t.code==='120' || t.code==='220') return;
        const y = t.date.slice(0,4); if(!byYear[y]) byYear[y] = { in:0, out:0 };
        if(t.type==='in') byYear[y].in += Number(t.amount||0); else byYear[y].out += Number(t.amount||0);
    });
    const years = Object.keys(byYear).sort();
    // Hitung pertumbuhan pemasukan dibanding tahun sebelumnya (kolom terakhir)
    let rowsFixed = years.map((y,i) => {
        const surplus = byYear[y].in - byYear[y].out;
        let growthTxt = '-';
        if(i > 0) { const prevIn = byYear[years[i-1]].in; if(prevIn > 0) { const g = ((byYear[y].in - prevIn) / prevIn) * 100; growthTxt = `${g>=0?'':''} ${Math.abs(g).toFixed(1)}%`; } }
        return `<tr><td><strong>${y}</strong></td><td style="color:green;">${formatRp(byYear[y].in)}</td><td style="color:red;">${formatRp(byYear[y].out)}</td><td style="font-weight:bold;">${formatRp(surplus)}</td><td style="font-weight:bold;">${growthTxt}</td></tr>`;
    }).join('');
    tblEl.innerHTML = rowsFixed || '<tr><td colspan="5">Belum ada data transaksi.</td></tr>';
    if(cardsEl) {
        const totalIn = years.reduce((a,y)=>a+byYear[y].in,0), totalOut = years.reduce((a,y)=>a+byYear[y].out,0);
        cardsEl.innerHTML = `<div class="card"><div class="card-icon"><i class="fa-solid fa-calendar"></i></div><h3>Total Tahun Tercatat</h3><p>${years.length}</p></div><div class="card"><div class="card-icon"><i class="fa-solid fa-sack-dollar"></i></div><h3>Total Pemasukan (All Time)</h3><p style="color:#15803d;">${formatRp(totalIn)}</p></div><div class="card"><div class="card-icon"><i class="fa-solid fa-hand-holding-heart"></i></div><h3>Total Penyaluran (All Time)</h3><p style="color:#b91c1c;">${formatRp(totalOut)}</p></div>`;
    }
    if(chartEl && typeof Chart !== 'undefined') {
        if(window.mcTahunan) window.mcTahunan.destroy();
        window.mcTahunan = new Chart(chartEl.getContext('2d'), { type:'bar', data:{ labels: years.length?years:['-'], datasets:[ {label:'Pemasukan', data: years.length?years.map(y=>byYear[y].in):[0], backgroundColor:'#005a2b'}, {label:'Penyaluran', data: years.length?years.map(y=>byYear[y].out):[0], backgroundColor:'#ef4444'} ] }, options:{responsive:true, maintainAspectRatio:false} });
    }
}
window.cetakStatistikPDF = function() { withExportMode(() => html2pdf().set({ margin:10, filename:`Statistik_Tahunan_${Date.now()}.pdf`, jsPDF:{format:'a4', orientation:'portrait'} }).from(document.getElementById('statistik-print-area')).save()); }

// =====================================================================
// --- 15. MENU BARU: DONATUR TETAP (KOMITMEN BULANAN + TRACKING LUNAS) ---
// =====================================================================
const formDonatur = document.getElementById('form-donatur');
if(formDonatur) formDonatur.addEventListener('submit', async e => {
    e.preventDefault(); if(currentUserRole !== 'bendahara') return;
    const nama = document.getElementById('dn-nama').value.trim(), nominal = parseFloat(document.getElementById('dn-nominal').value), kontak = document.getElementById('dn-kontak').value.trim();
    if(!nama || !nominal) return;
    await window.fs.addDoc(getCol("donatur"), { nama, nominal, kontak, paidMonths: [] });
    e.target.reset(); showToast("Donatur tetap terdaftar.", "success");
});
window.hapusDonatur = async function(id) { if(currentUserRole !== 'bendahara') return; if(confirm("Hapus donatur ini?")) { await window.fs.deleteDoc(getFirestoreDoc("donatur", id)); showToast("Dihapus", "success"); } }
window.toggleBulanDonatur = async function(id, bulanKey) {
    if(currentUserRole !== 'bendahara') return;
    const d = dbDonatur.find(x => x.idFirebase === id); if(!d) return;
    let paid = d.paidMonths || [];
    paid = paid.includes(bulanKey) ? paid.filter(m => m !== bulanKey) : [...paid, bulanKey];
    await window.fs.updateDoc(getFirestoreDoc("donatur", id), { paidMonths: paid });
}
function renderDonatur() {
    const c = document.getElementById('list-donatur'); if(!c) return;
    const year = new Date().getFullYear(); if(document.getElementById('donatur-tahun-aktif')) document.getElementById('donatur-tahun-aktif').innerText = year;
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    c.innerHTML = dbDonatur.map(d => {
        const paid = d.paidMonths || []; const paidThisYear = paid.filter(m => m.startsWith(String(year))).length;
        const pct = Math.round((paidThisYear/12)*100);
        const chips = monthNames.map((mn,i) => { const key = `${year}-${String(i+1).padStart(2,'0')}`; const isPaid = paid.includes(key); return `<div class="donatur-month-chip ${isPaid?'paid':''} admin-only" onclick="window.toggleBulanDonatur('${d.idFirebase}','${key}')" title="${mn} ${year}">${mn}</div>`; }).join('');
        return `<div class="donatur-card"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;"><div><strong style="font-size:15px;">${d.nama}</strong><div style="font-size:12px; color:var(--text-muted);">Komitmen: ${formatRp(d.nominal)}/bulan ${d.kontak?('• '+d.kontak):''}</div></div><button class="btn-action admin-only" onclick="window.hapusDonatur('${d.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button></div><div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%;"></div></div><div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${paidThisYear}/12 bulan lunas tahun ${year} (${pct}%)</div><div class="donatur-months">${chips}</div></div>`;
    }).join('') || '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:30px 0;">Belum ada donatur tetap terdaftar.</div>';
    applyRBAC();
}

// =====================================================================
// --- 16. EKSPOR & BACKUP DATA LENGKAP (MULTI-SHEET) ---
// =====================================================================
window.exportFullExcel = function() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactions.map(t=>({"Tanggal":t.date,"Akun":t.code,"Sumber":t.source,"Debit":t.type==='in'?t.amount:0,"Kredit":t.type==='out'?t.amount:0,"Ket":t.desc}))), "Buku_Besar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbMustahik.map(m=>({"Nama":m.nama,"Kategori":m.kategori}))), "Warga_Relawan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbInventaris.map(i=>({"Nama":i.nama,"Jumlah":i.qty,"Kondisi":i.kondisi}))), "Inventaris");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbAgenda.map(a=>({"Tanggal":a.tgl,"Judul":a.judul,"Hasil":a.hasil}))), "Agenda");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbDonatur.map(d=>({"Nama":d.nama,"Komitmen":d.nominal,"Bulan_Lunas":(d.paidMonths||[]).join(', ')}))), "Donatur_Tetap");
    XLSX.writeFile(wb, `Data_Lengkap_UPZIS_${Date.now()}.xlsx`);
    showToast("Ekspor multi-sheet berhasil.", "success");
}

// =====================================================================
// --- 8. STARTUP & SINKRONISASI LOGIN ---
// =====================================================================
async function loadAllCloudData() {
    updateConnectionStatus(); checkYearEndWarning();
    window.fs.onSnapshot(getFirestoreDoc("settings", "profile"), (snap) => { if(snap.exists()) { profileSettings = {...profileSettings, ...snap.data()}; if(document.getElementById('tg-token')) document.getElementById('tg-token').value = profileSettings.teleBotToken||''; if(document.getElementById('p-lembaga')) document.getElementById('p-lembaga').value = profileSettings.lembaga; if(document.getElementById('p-periode')) document.getElementById('p-periode').value = profileSettings.periode; renderAnggota(); applyBranding(); applyUserBadge(); }});
    window.fs.onSnapshot(window.fs.query(getCol("transactions"), window.fs.orderBy("date", "asc")), (snap) => { transactions=[]; snap.forEach(d => transactions.push({idFirebase:d.id, ...d.data()})); refreshUI(); const p1=document.getElementById('v-laporan'), p2=document.getElementById('v-poster'), p3=document.getElementById('v-analitik'), p4=document.getElementById('v-statistik'); if(p1&&!p1.classList.contains('hidden'))window.buildReport(); if(p2&&!p2.classList.contains('hidden'))window.buildPoster(); if(p3&&!p3.classList.contains('hidden'))renderCharts(); if(p4&&!p4.classList.contains('hidden'))renderStatistikTahunan(); if(document.getElementById('v-leaderboard')&&!document.getElementById('v-leaderboard').classList.contains('hidden')) renderLeaderboard(); });
    window.fs.onSnapshot(getCol("inventaris"), (snap) => { dbInventaris=[]; snap.forEach(d => dbInventaris.push({id:d.id, ...d.data()})); renderInventaris(); });
    window.fs.onSnapshot(getCol("agenda"), (snap) => { dbAgenda=[]; snap.forEach(d => dbAgenda.push({id:d.id, ...d.data()})); renderAgenda(); renderNotifBadge(); });
    window.fs.onSnapshot(getCol("todos"), (snap) => { dbTodos=[]; snap.forEach(d => dbTodos.push({id:d.id, ...d.data()})); renderTodos(); renderNotifBadge(); });
    window.fs.onSnapshot(getCol("mustahik"), (snap) => { dbMustahik=[]; snap.forEach(d => dbMustahik.push({idFirebase:d.id, ...d.data()})); const tb = document.getElementById('table-mustahik'); if(tb){ tb.innerHTML = dbMustahik.map(m => `<tr><td><strong>${m.nama}</strong></td><td><span class="badge" style="background:#f1f5f9; color:black;">${m.kategori}</span></td><td class="admin-only"><button class="btn-action admin-only" onclick="window.hapusMustahik('${m.idFirebase}')"><i class="fa-solid fa-trash" style="color:red;"></i></button></td></tr>`).join('') || '<tr><td colspan="3">Belum ada data.</td></tr>'; applyRBAC(); } });
    window.fs.onSnapshot(getCol("donatur"), (snap) => { dbDonatur=[]; snap.forEach(d => dbDonatur.push({idFirebase:d.id, ...d.data()})); renderDonatur(); });
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
            applyUserBadge(user.email); loadAllCloudData(); applyRBAC();
        }
    });
});
