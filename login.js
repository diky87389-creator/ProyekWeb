const loginForm = document.getElementById('login-form');
const googleLoginButton = document.getElementById('google-login-button');
const googleNativeContainer = document.getElementById('google-native-button');
const toast = document.getElementById('login-toast');
const usersKey = 'dikyRegisteredUsers';
const activeUserKey = 'dikyActiveUser';
const pendingGoogleKey = 'dikyPendingGoogleProfile';
const ADMIN_EMAIL = 'diky87389@gmail.com';
// Ganti nilai ini dengan password admin sebenarnya sebelum deployment.
const ADMIN_PASSWORD = 'Diky4466';

// Isi dengan OAuth Client ID Google agar tombol Google memakai akun asli
// (nama, email, dan foto profil asli). Biarkan kosong untuk mode lokal.
const googleClientId = '';

// Pergantian akun hanya mengganti session pointer. Data milik akun lama
// tidak boleh dibersihkan karena harus tersedia saat akun tersebut login lagi.
function forceCleanupOldSession() {
  const currentUser = window.getActiveUser();
  if (currentUser && currentUser.id) {
    console.log('Session Override Guard: menutup sesi user:', currentUser.id);
    localStorage.removeItem(activeUserKey);
  }
}

function redirectIfLoggedIn() {
  if (window.getActiveUser()) {
    window.location.href = 'index.html';
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 2200);
}

function normalizeUserRecord(user) {
  const { whatsappNumber, ...rest } = user;
  return {
    ...rest,
    phoneNumber: user.phoneNumber || whatsappNumber || null
  };
}

function saveRegisteredUsers(users) {
  const normalizedUsers = users.map(normalizeUserRecord);
  if (typeof window.writeUserStorage === 'function') {
    return window.writeUserStorage(usersKey, normalizedUsers);
  }
  try {
    localStorage.setItem(usersKey, JSON.stringify(normalizedUsers));
    return true;
  } catch (error) {
    return false;
  }
}

function getRegisteredUsers() {
  let raw;
  let users;
  try {
    raw = localStorage.getItem(usersKey);
    users = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(users)) return [];
  } catch (error) {
    console.warn('Data pengguna tidak valid dan tidak dapat dibaca.');
    try { localStorage.removeItem(usersKey); } catch (removeError) { }
    return [];
  }

  const normalizedUsers = users.map(normalizeUserRecord);
  if (raw && JSON.stringify(normalizedUsers) !== JSON.stringify(users)) {
    if (!saveRegisteredUsers(normalizedUsers)) {
      console.warn('Normalisasi data akun belum tersimpan; data akun asli tetap dipertahankan.');
    }
  }
  return normalizedUsers;
}

function saveActiveUser(user) {
  const session = Object.assign({}, user);
  delete session.profileImage;
  delete session.avatarUrl;

  const userId = session && session.id ? String(session.id) : '';
  const cleanupKeys = userId ? [`dikyCheckoutForm_${userId}`, `dikyCheckoutSummary_${userId}`] : [];
  const saved = typeof window.writeUserStorage === 'function'
    ? window.writeUserStorage(activeUserKey, session, cleanupKeys)
    : (() => { try { localStorage.setItem(activeUserKey, JSON.stringify(session)); return true; } catch (error) { return false; } })();
  if (!saved) return false;

  if (userId) {
    try { localStorage.setItem('dikySessionActivity_' + userId, String(Date.now())); } catch (error) { }
  }
  return true;
}

function ensureAdminRecord() {
  const users = getRegisteredUsers();
  const existing = users.find((item) => item && item.id === 99);
  if (!existing) {
    users.push({ id: 99, fullName: 'Diky Wahyudi', name: 'Diky Wahyudi', emailAddress: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
    if (!saveRegisteredUsers(users)) return false;
  }
  return true;
}

function isValidEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

function getUserEmails(user) {
  const emails = [];
  if (user.emailAddress) emails.push(user.emailAddress.toLowerCase());
  const fallback = user.contactInfo ? user.contactInfo.trim() : '';
  if (isValidEmail(fallback)) emails.push(fallback.toLowerCase());
  return emails;
}

function findUserByEmail(emailAddress) {
  const normalizedEmail = emailAddress ? emailAddress.toLowerCase() : '';
  if (!normalizedEmail) return undefined;
  return getRegisteredUsers().find((user) => getUserEmails(user).includes(normalizedEmail));
}

function buildSession(user, extra = {}) {
  return {
    id: user.id,
    userId: user.userId || user.id,
    name: user.name || user.fullName,
    fullName: user.fullName || user.name,
    username: user.username || null,
    emailAddress: user.emailAddress ? user.emailAddress.toLowerCase() : null,
    phoneNumber: user.phoneNumber || user.whatsappNumber || null,
    gender: user.gender || null,
    birthDate: user.birthDate || null,
    address: user.address || null,
    // Koordinat alamat WAJIB ikut sesi. Tanpa ini, ongkir berbasis jarak
    // di checkout.html jatuh ke tarif flat setiap kali pengguna login ulang
    // (misal setelah Logout Cepat), padahal alamat sudah terdaftar.
    latitude: Number.isFinite(Number(user.latitude)) && user.latitude !== null && user.latitude !== '' ? Number(user.latitude) : null,
    longitude: Number.isFinite(Number(user.longitude)) && user.longitude !== null && user.longitude !== '' ? Number(user.longitude) : null,
    authProvider: user.authProvider || 'email',
    loggedAt: new Date().toISOString(),
    ...extra
  };
}

function redirectToRegister(profile) {
  if (profile) {
    try {
      localStorage.setItem(pendingGoogleKey, JSON.stringify(profile));
    } catch (error) {
      showToast('Penyimpanan browser penuh. Kosongkan sebagian ruang lalu coba lagi.');
      return;
    }
  }

  showToast('Akun belum terdaftar. Mengarahkan ke halaman pendaftaran...');
  window.setTimeout(() => {
    window.location.href = 'daftar.html';
  }, 1500);
}

async function handleLogin(event) {
  event.preventDefault();
  const emailAddress = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!emailAddress || !password) {
    showToast('Mohon isi email dan kata sandi.');
    return;
  }

  if (!isValidEmail(emailAddress)) {
    showToast('Masukkan alamat email yang valid.');
    return;
  }

  const isAdminLogin = emailAddress.toLowerCase() === ADMIN_EMAIL;
  let user = findUserByEmail(emailAddress);

  if (isAdminLogin) {
    if (password !== ADMIN_PASSWORD) {
      showToast('Email admin atau kata sandi admin salah.');
      return;
    }
    user = { id: 99, fullName: 'Diky Wahyudi', name: 'Diky Wahyudi', emailAddress: ADMIN_EMAIL, role: 'admin' };
    if (!ensureAdminRecord()) {
      showToast('Akun admin tidak dapat disimpan karena penyimpanan browser penuh. Kosongkan ruang lalu coba lagi.');
      return;
    }
  } else {
    if (!user) {
      showToast('Email belum terdaftar.');
      return;
    }
    // Verifikasi kata sandi: mendukung hash SHA-256 maupun data lama (plain).
    let cocok = false;
    if (window.AuthUtil && typeof window.AuthUtil.cocok === 'function') {
      cocok = await window.AuthUtil.cocok(password, user.password);
    } else {
      cocok = user.password === password;
    }
    if (!cocok) {
      showToast('Kata sandi salah. Silakan coba lagi.');
      return;
    }

    // Migrasi otomatis: bila masih plain text, ubah ke hash sekarang.
    if (window.AuthUtil && typeof window.AuthUtil.sudahHash === 'function' && !window.AuthUtil.sudahHash(user.password)) {
      try {
        const hashBaru = await window.AuthUtil.hashPassword(password);
        if (hashBaru) {
          const daftar = getRegisteredUsers();
          const idx = daftar.findIndex((u) => String(u.id) === String(user.id));
          if (idx >= 0) {
            daftar[idx].password = hashBaru;
            saveRegisteredUsers(daftar);
            user.password = hashBaru;
          }
        }
      } catch (e) { }
    }
    user.role = user.role === 'admin' ? 'admin' : 'user';
  }

  forceCleanupOldSession();
  const session = buildSession(user, { role: user.role });
  if (!saveActiveUser(session)) {
    showToast('Login belum dapat disimpan karena penyimpanan browser penuh. Kosongkan sebagian ruang lalu coba lagi.');
    return;
  }

  showToast('Login berhasil! Mengarahkan...');
  window.setTimeout(() => {
    window.location.href = isAdminLogin ? 'admin-dashboard.html' : 'index.html';
  }, 700);
}

function signUpWithGoogleProfile(profile) {
  if (!profile || !isValidEmail(profile.emailAddress || '')) {
    showToast('Tidak bisa membaca email akun Google.');
    return;
  }

  const emailAddress = profile.emailAddress.toLowerCase();
  const existingUser = findUserByEmail(emailAddress);

  if (existingUser) {
    showToast('Email sudah terdaftar. Silakan login dengan email dan kata sandi.');
    return;
  }

  redirectToRegister({
    emailAddress,
    fullName: profile.fullName || null,
    avatarUrl: profile.avatarUrl || null,
    authProvider: 'google'
  });
}

function decodeGoogleCredential(credential) {
  const payload = credential.split('.')[1];
  if (!payload) return null;

  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const json = decodeURIComponent(
    atob(padded)
      .split('')
      .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join('')
  );

  return JSON.parse(json);
}

function handleGoogleCredentialResponse(response) {
  try {
    const payload = decodeGoogleCredential(response.credential);
    if (!payload) {
      showToast('Respons Google tidak valid.');
      return;
    }

    signUpWithGoogleProfile({
      emailAddress: payload.email,
      fullName: payload.name,
      avatarUrl: payload.picture || null
    });
  } catch (error) {
    console.warn('Gagal membaca kredensial Google.', error);
    showToast('Gagal memproses akun Google. Coba lagi.');
  }
}

function isGoogleSdkReady() {
  return Boolean(googleClientId && window.google && window.google.accounts && window.google.accounts.id);
}

function setupGoogleIdentity() {
  if (!isGoogleSdkReady()) return;

  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleCredentialResponse
  });

  window.google.accounts.id.renderButton(googleNativeContainer, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    locale: 'id',
    width: 280
  });

  googleLoginButton.hidden = true;
}

function handleGoogleFallbackSignUp() {
  const emailAddress = window.prompt('Masukkan email akun Google Anda:');
  if (emailAddress === null) return;

  const trimmedEmail = emailAddress.trim();
  if (!isValidEmail(trimmedEmail)) {
    showToast('Masukkan alamat email Google yang valid.');
    return;
  }

  if (findUserByEmail(trimmedEmail)) {
    showToast('Email sudah terdaftar. Silakan login dengan email dan kata sandi.');
    return;
  }

  const fullName = window.prompt('Masukkan nama sesuai akun Google Anda:');
  signUpWithGoogleProfile({
    emailAddress: trimmedEmail,
    fullName: fullName ? fullName.trim() : null,
    avatarUrl: null
  });
}

function handleGoogleSignUpClick() {
  if (isGoogleSdkReady()) {
    window.google.accounts.id.prompt();
    return;
  }

  handleGoogleFallbackSignUp();
}

window.addEventListener('DOMContentLoaded', () => {
  const securityMessage = sessionStorage.getItem('diky_security_message');
  if (securityMessage) {
    showToast(securityMessage);
    sessionStorage.removeItem('diky_security_message');
  }
  redirectIfLoggedIn();
  localStorage.removeItem(pendingGoogleKey);
  window.setTimeout(setupGoogleIdentity, 600);
});

loginForm.addEventListener('submit', handleLogin);
googleLoginButton.addEventListener('click', handleGoogleSignUpClick);
/* ============================================================
   LUPA KATA SANDI — alur reset via tautan email
   ============================================================
   Anti-enumeration: pesan SELALU sama, baik email terdaftar
   maupun tidak. Ini mencegah orang luar menebak email mana
   yang terdaftar di sistem.
   ============================================================ */
(function (window, document) {
  'use strict';

  var KUNCI_RESET = 'dikyResetTokens';
  var MASA_BERLAKU_MS = 30 * 60 * 1000; // 30 menit

  function el(id) { return document.getElementById(id); }

  function tampilkanPesan(teks, jenis) {
    var box = el('forgot-message');
    if (!box) return;
    box.textContent = teks || '';
    box.className = 'forgot-message' + (jenis ? ' is-' + jenis : '');
    box.hidden = !teks;
  }

  function bacaTokens() {
    try {
      var raw = localStorage.getItem(KUNCI_RESET);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  }

  function simpanTokens(list) {
    try {
      localStorage.setItem(KUNCI_RESET, JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }

  /** Bersihkan token yang sudah kedaluwarsa. */
  function bersihkanTokenKedaluwarsa(list) {
    var sekarang = Date.now();
    return list.filter(function (t) { return t && t.expiresAt && t.expiresAt > sekarang; });
  }

  function buatTautan(token, email) {
    var base = window.location.href.replace(/[^\/]*$/, '');
    return base + 'reset-password.html?token=' + encodeURIComponent(token) + '&email=' + encodeURIComponent(email);
  }

  function bukaModal() {
    var modal = el('forgot-modal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');

    // Isi otomatis email dari kolom login bila sudah diketik
    var loginEmail = el('login-email');
    var forgotEmail = el('forgot-email');
    if (loginEmail && forgotEmail && !forgotEmail.value && loginEmail.value.trim()) {
      forgotEmail.value = loginEmail.value.trim();
    }

    tampilkanPesan('', '');
    var demo = el('forgot-demo');
    if (demo) demo.hidden = true;

    setTimeout(function () { if (forgotEmail) forgotEmail.focus(); }, 60);
  }

  function tutupModal() {
    var modal = el('forgot-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  async function kirimTautan(event) {
    if (event) event.preventDefault();

    var inputEmail = el('forgot-email');
    var tombol = el('forgot-submit');
    var email = inputEmail ? String(inputEmail.value || '').trim().toLowerCase() : '';

    if (!email || email.indexOf('@') === -1) {
      tampilkanPesan('Masukkan alamat email yang valid.', 'error');
      return;
    }

    if (tombol) { tombol.disabled = true; tombol.textContent = 'Mengirim...'; }
    tampilkanPesan('Memproses permintaan...', 'info');

    // Wajib cocok dengan email yang BENAR-BENAR terdaftar saat pendaftaran.
    // Gunakan findUserByEmail() agar konsisten dengan alur login, termasuk
    // email yang tersimpan di contactInfo.
    var user = typeof findUserByEmail === 'function' ? findUserByEmail(email) : null;
    if (!user) {
      var daftarUser = typeof getRegisteredUsers === 'function' ? getRegisteredUsers() : [];
      user = daftarUser.find(function (u) {
        return u && u.emailAddress && String(u.emailAddress).toLowerCase() === email;
      }) || null;
    }

    var token = null;
    var tautan = null;

    if (user) {
      token = window.AuthUtil ? window.AuthUtil.buatToken() : String(Date.now()) + Math.random().toString(36).slice(2, 10);

      var tokens = bersihkanTokenKedaluwarsa(bacaTokens());
      // Hanya satu token aktif per email
      tokens = tokens.filter(function (t) { return t && String(t.email) !== email; });
      tokens.push({
        token: token,
        email: email,
        userId: String(user.id),
        expiresAt: Date.now() + MASA_BERLAKU_MS,
        createdAt: Date.now()
      });
      simpanTokens(tokens);

      tautan = buatTautan(token, email);

      // Penanda akses sah: hanya diisi di sini, sehingga reset-password.html
      // tahu bahwa kunjungan berasal dari alur "Kirim Tautan Reset".
      // Disimpan di sessionStorage (hilang saat tab ditutup), dan berlaku
      // untuk kedua jalur: email asli (Email.js) maupun tautan demo.
      try {
        sessionStorage.setItem('dikyResetAccess', token);
      } catch (e) { }
    }

    var hasil;
    if (window.EmailService && typeof window.EmailService.kirimLinkReset === 'function' && user) {
      hasil = await window.EmailService.kirimLinkReset(email, tautan, user.fullName);
    } else if (!user) {
      // Email tidak terdaftar: jangan ungkapkan apa pun.
      hasil = { ok: true, demo: true, tautan: null };
    } else {
      hasil = { ok: true, demo: true, tautan: tautan };
    }

    if (tombol) { tombol.disabled = false; tombol.textContent = 'Kirim Tautan Reset'; }

    if (!hasil || !hasil.ok) {
      tampilkanPesan((hasil && hasil.pesan) || 'Gagal memproses permintaan. Coba lagi.', 'error');
      return;
    }

    // Pesan NETRAL (anti-enumeration): sama walau email tidak terdaftar.
    tampilkanPesan(
      'Jika email tersebut terdaftar, tautan untuk mereset kata sandi telah dikirim. Silakan periksa kotak masuk dan folder spam Anda.',
      'success'
    );

    // Mode demo: tampilkan tautan asli agar bisa diuji tanpa email.
    if (hasil.demo && tautan) {
      var demo = el('forgot-demo');
      var demoLink = el('forgot-demo-link');
      if (demo && demoLink) {
        demoLink.href = tautan;
        demoLink.textContent = 'Buka halaman reset kata sandi (demo)';
        demo.hidden = false;
      }
    }
  }

  function init() {
    if (!el('forgot-modal')) return;

    var btnLupa = el('forgot-password-button');
    if (btnLupa) btnLupa.addEventListener('click', bukaModal);

    var btnTutup = el('forgot-close');
    if (btnTutup) btnTutup.addEventListener('click', tutupModal);

    var form = el('forgot-form');
    if (form) form.addEventListener('submit', kirimTautan);

    var modal = el('forgot-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) tutupModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.hidden) tutupModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LupaSandi = { buka: bukaModal, tutup: tutupModal, MASA_BERLAKU_MS: MASA_BERLAKU_MS };
}(window, document));
