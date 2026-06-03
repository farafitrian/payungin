/**
 * ============================================================
 * PAYUNGIN - Contoh Integrasi Frontend ke Backend
 * ============================================================
 * File ini berisi contoh fungsi JavaScript untuk mengganti
 * logika localStorage pada payungin4.html menjadi API calls
 * ke backend Express.js
 *
 * Salin fungsi-fungsi ini ke dalam file payungin4.html
 * ============================================================
 */

// ─────────────────────────────────────────
// KONFIGURASI
// ─────────────────────────────────────────
const API_BASE = 'http://localhost:3000/api'; // Ganti dengan URL backend kamu

// Helper: ambil token dari localStorage
const getToken = () => localStorage.getItem('payungin_token');

// Helper: request ke API dengan token
const apiRequest = async (method, endpoint, body = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Terjadi kesalahan');
  }
  return data;
};

// ─────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────

// Ganti handleLogin() di HTML
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { showToast('Isi email dan password dulu!'); return; }

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const data = await res.json();
    if (!data.success) { showToast(data.message); return; }

    // Simpan token dan info user
    localStorage.setItem('payungin_token', data.data.token);
    localStorage.setItem('payungin_user', JSON.stringify(data.data.user));
    currentUser = data.data.user;
    enterApp();
  } catch (err) {
    showToast('Gagal konek ke server. Coba lagi!');
  }
}

// Ganti handleRegister() di HTML
async function handleRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  if (!name || !email || !pass) { showToast('Lengkapi semua field!'); return; }

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass }),
    });
    const data = await res.json();
    if (!data.success) { showToast(data.message); return; }

    localStorage.setItem('payungin_token', data.data.token);
    localStorage.setItem('payungin_user', JSON.stringify(data.data.user));
    currentUser = data.data.user;
    enterApp();
  } catch (err) {
    showToast('Gagal registrasi. Coba lagi!');
  }
}

// ─────────────────────────────────────────
// 2. LOAD DATA USER (saldo, pinjaman aktif)
// ─────────────────────────────────────────
async function refreshUI() {
  if (!currentUser) return;
  try {
    // Ambil data terbaru dari API
    const [meRes, loansRes] = await Promise.all([
      apiRequest('GET', '/auth/me'),
      apiRequest('GET', '/loans/active'),
    ]);

    const user  = meRes.data.user;
    const loans = loansRes.data.loans;

    // Update display saldo
    document.getElementById('saldo-display').textContent   = fmt(user.saldo);
    document.getElementById('topbar-saldo').textContent    = fmt(user.saldo);
    document.getElementById('hero-greeting').textContent   = `Halo, ${user.name.split(' ')[0]}! 👋`;
    document.getElementById('topbar-avatar').textContent   = user.name[0].toUpperCase();
    document.getElementById('profil-name').textContent     = user.name;
    document.getElementById('profil-email').textContent    = user.email;
    document.getElementById('profil-avatar').textContent   = user.name[0].toUpperCase();

    renderLoansFromAPI(loans);
  } catch (err) {
    console.error('refreshUI error:', err);
  }
}

// ─────────────────────────────────────────
// 3. SCAN QR DAN PEMINJAMAN
// ─────────────────────────────────────────

// Dipanggil setelah QR code ter-scan
// qrContent = isi QR code station, contoh: "STN-001"
async function handleScanSuccess(qrContent) {
  stopScanner();
  try {
    // Ambil daftar payung tersedia di station ini
    const res = await apiRequest('GET', `/stations/scan/${qrContent}`);
    if (!res.success) { showToast(res.message); return; }

    const { station, umbrellas } = res.data;
    if (umbrellas.length === 0) {
      showToast(`Payung di ${station.name} habis. Coba station lain!`);
      return;
    }

    // Tampilkan modal pilih payung
    showUmbrellaPickerModal(station, umbrellas);
  } catch (err) {
    showToast('Gagal membaca QR code. Coba lagi!');
  }
}

// Tampilkan daftar payung untuk dipilih user
function showUmbrellaPickerModal(station, umbrellas) {
  // Buat modal sederhana (sesuaikan dengan desain HTML kamu)
  const list = umbrellas.map(u =>
    `<button onclick="selectUmbrella('${u.id}', '${station.id}', '${u.code}')"
      style="display:block;width:100%;padding:12px;margin:6px 0;background:#f1f5fb;
             border:none;border-radius:8px;font-weight:700;cursor:pointer;">
      ${u.code}
    </button>`
  ).join('');

  // Isi modal yang sudah ada di HTML
  document.getElementById('picker-station-name').textContent = station.name;
  document.getElementById('picker-umbrella-list').innerHTML  = list;
  openModal('modal-umbrella-picker');
}

// User memilih payung yang diambil
async function selectUmbrella(umbrellaId, stationId, umbrellaCode) {
  closeModal('modal-umbrella-picker');
  try {
    const res = await apiRequest('POST', '/loans/borrow', { umbrellaId, stationId });
    if (!res.success) { showToast(res.message); return; }

    showToast(`Berhasil! Payung ${umbrellaCode} dipinjam! ☂️`);
    await refreshUI();
    switchPage('pinjam');
  } catch (err) {
    showToast(err.message || 'Gagal meminjam payung.');
  }
}

// ─────────────────────────────────────────
// 4. PENGEMBALIAN PAYUNG
// ─────────────────────────────────────────

// Buka modal kembalikan - ganti openKembalikan() di HTML
async function openKembalikan(loanId) {
  try {
    // Ambil daftar semua station untuk dipilih
    const res = await apiRequest('GET', '/stations');
    const stations = res.data.stations;

    const options = stations.map(s =>
      `<option value="${s.id}">${s.name} (${s.availableCount}/${s.capacity} payung)</option>`
    ).join('');

    document.getElementById('return-station-select').innerHTML = options;
    document.getElementById('confirm-return-btn').onclick = () => confirmReturn(loanId);
    openModal('modal-kembalikan');
  } catch (err) {
    showToast('Gagal memuat daftar station.');
  }
}

async function confirmReturn(loanId) {
  const returnStationId = document.getElementById('return-station-select').value;
  if (!returnStationId) { showToast('Pilih station tujuan dulu!'); return; }

  try {
    const res = await apiRequest('POST', `/loans/${loanId}/return`, { returnStationId });
    if (!res.success) { showToast(res.message); return; }

    const { feeCharged, durationMinutes } = res.data.loan;
    closeModal('modal-kembalikan');
    showToast(`Payung dikembalikan! Biaya: ${fmt(feeCharged)} (${durationMinutes} menit)`);
    await refreshUI();
  } catch (err) {
    showToast(err.message || 'Gagal mengembalikan payung.');
  }
}

// ─────────────────────────────────────────
// 5. TOP UP SALDO VIA QRIS
// ─────────────────────────────────────────
let currentTopupTransactionId = null;
let pollInterval = null;

async function requestTopup(amount) {
  try {
    const res = await apiRequest('POST', '/transactions/topup', { amount });
    if (!res.success) { showToast(res.message); return; }

    const { transactionId, qrUrl, expireAt } = res.data;
    currentTopupTransactionId = transactionId;

    // Tampilkan QR code di frontend
    document.getElementById('qr-image').src      = qrUrl;
    document.getElementById('qr-amount').textContent = fmt(amount);
    document.getElementById('qr-expire').textContent = new Date(expireAt).toLocaleTimeString('id-ID');
    
    closeModal('modal-topup');
    openModal('modal-qr-payment');

    // Mulai polling status pembayaran setiap 3 detik
    startPolling(transactionId);
  } catch (err) {
    showToast(err.message || 'Gagal membuat QRIS.');
  }
}

function startPolling(transactionId) {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const res = await apiRequest('GET', `/transactions/topup/${transactionId}/status`);
      const { status, amount } = res.data;

      if (status === 'success') {
        clearInterval(pollInterval);
        closeModal('modal-qr-payment');
        showToast(`Top up Rp ${fmt(amount)} berhasil! Saldo kamu bertambah. 🎉`);
        await refreshUI();
      } else if (['expired', 'failed'].includes(status)) {
        clearInterval(pollInterval);
        closeModal('modal-qr-payment');
        showToast('Pembayaran gagal atau kadaluarsa. Coba lagi ya!');
      }
    } catch (err) {
      // Silent fail - coba lagi di interval berikutnya
    }
  }, 3000); // Poll setiap 3 detik

  // Stop polling setelah 20 menit (QR kadaluarsa)
  setTimeout(() => clearInterval(pollInterval), 20 * 60 * 1000);
}

// ─────────────────────────────────────────
// 6. REFUND / TARIK DEPOSIT
// ─────────────────────────────────────────
async function confirmRefund() {
  if (!rf.amount || !rf.ew || !rf.phone || !rf.accountName) {
    showToast('Lengkapi semua data refund!');
    return;
  }

  try {
    const res = await apiRequest('POST', '/refund/request', {
      amount:        rf.amount,
      method:        'ewallet',
      providerName:  rf.ew,
      accountName:   rf.accountName,
      accountNumber: rf.phone,
    });

    if (!res.success) { showToast(res.message); return; }

    closeModal('modal-refund');
    showToast(`Permintaan penarikan ${fmt(rf.amount)} ke ${rf.ew} sedang diproses ✅`);
    rf = { ew: '', phone: '', amount: 0, accountName: '' };
    rfShow(1);
  } catch (err) {
    showToast(err.message || 'Gagal mengajukan refund.');
  }
}

// ─────────────────────────────────────────
// 7. LAPORAN KERUSAKAN
// ─────────────────────────────────────────
async function kirimLaporanKerusakan() {
  const descEl   = document.getElementById('rusak-desc');
  const photoEl  = document.getElementById('photo-input'); // input file
  const umbrellaId = document.getElementById('report-umbrella-id').value; // hidden field

  if (!descEl.value.trim() || !photoEl.files.length) {
    showToast('Upload foto dan isi deskripsi dulu!');
    return;
  }

  const formData = new FormData();
  formData.append('umbrellaId',  umbrellaId);
  formData.append('description', descEl.value.trim());
  Array.from(photoEl.files).forEach(f => formData.append('photos', f));

  try {
    const res = await fetch(`${API_BASE}/damage/report`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      // JANGAN set Content-Type untuk FormData - browser otomatis set boundary
      body: formData,
    });
    const data = await res.json();
    if (!data.success) { showToast(data.message); return; }

    document.getElementById('btn-kirim-laporan').disabled = true;
    document.getElementById('verify-waiting').classList.add('visible');
    showToast('Laporan terkirim! Admin akan memverifikasi segera.');
  } catch (err) {
    showToast('Gagal mengirim laporan. Coba lagi!');
  }
}

// ─────────────────────────────────────────
// 8. CUSTOMER SERVICE CHAT
// ─────────────────────────────────────────
let currentTicketId = null;

async function openChat(mode) {
  chatMode = mode;
  const csMenu  = document.getElementById('cs-menu');
  const chatBox = document.getElementById('chat-box');
  csMenu.style.display = 'none';
  chatBox.classList.add('visible');

  try {
    // Buat tiket baru
    const res = await apiRequest('POST', '/cs/tickets', { type: mode });
    currentTicketId = res.data.ticketId;

    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = '';
    appendCSMsg(res.data.initialMessage);
  } catch (err) {
    showToast('Gagal memulai chat. Coba lagi!');
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || !currentTicketId) return;

  appendUserMsg(text);
  input.value = '';

  try {
    const res = await apiRequest('POST', `/cs/tickets/${currentTicketId}/messages`, { message: text });
    setTimeout(() => appendCSMsg(res.data.csReply.message), 800);
  } catch (err) {
    showToast('Gagal mengirim pesan.');
  }
}