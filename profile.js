const userNameField = document.getElementById('user-name');
const userProviderField = document.getElementById('user-provider');
const userAvatarImage = document.getElementById('user-avatar-image');
const userAvatarInitials = document.getElementById('user-avatar-initials');
const userContactField = document.getElementById('user-contact');
const userEmailField = document.getElementById('user-email');
const userUsernameField = document.getElementById('user-username');
const userGenderField = document.getElementById('user-gender');
const userBirthDateField = document.getElementById('user-birth-date');
const userAddressField = document.getElementById('user-address');
const userLoginTimeField = document.getElementById('user-login-time');
const userIdField = document.getElementById('user-id');
const historyLoginTimeField = document.getElementById('history-login-time');
const logoutFastButton = document.getElementById('logout-fast-button');
const logoutCleanButton = document.getElementById('logout-clean-button');
const REGISTERED_USERS_KEY = 'dikyRegisteredUsers';
const USED_IDENTITIES_KEY = 'dikyUsedIdentities';

function normalizeActiveUser(user) {
  const { whatsappNumber, ...rest } = user;
  return {
    ...rest,
    userId: user.userId || user.id || null,
    username: user.username || null,
    phoneNumber: user.phoneNumber || whatsappNumber || null,
    gender: user.gender || null,
    birthDate: user.birthDate || null,
    profileImage: user.profileImage || user.avatarUrl || null,
    avatarUrl: user.avatarUrl || null,
    authProvider: user.authProvider || 'email',
    address: user.address || null
  };
}

function getRegisteredProfile(activeUser) {
  if (!activeUser) return null;
  try {
    const users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
    if (!Array.isArray(users)) return null;
    return users.find((user) => {
      if (!user) return false;
      return String(user.id || '') === String(activeUser.id || '');
    }) || null;
  } catch (error) {
    return null;
  }
}

function buildInitials(user) {
  const source = (user.fullName || user.emailAddress || '').trim();
  if (!source) return 'WS';

  const words = source.split(/[\s@._-]+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]).join('');
  return initials.toUpperCase() || 'WS';
}

function renderAvatar(user) {
  userAvatarInitials.textContent = buildInitials(user);

  const profileImage = user.profileImage || user.avatarUrl;
  if (!profileImage) {
    userAvatarImage.hidden = true;
    userAvatarImage.removeAttribute('src');
    userAvatarInitials.hidden = false;
    return;
  }

  userAvatarImage.onerror = () => {
    userAvatarImage.hidden = true;
    userAvatarInitials.hidden = false;
  };
  userAvatarImage.onload = () => {
    userAvatarImage.hidden = false;
    userAvatarInitials.hidden = true;
  };
  userAvatarImage.referrerPolicy = 'no-referrer';
  userAvatarImage.src = profileImage;
  userAvatarImage.alt = `Foto profil ${user.fullName || 'pengguna'}`;
}

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function requireLogin() {
  if (!isValidSession()) {
    console.warn('requireLogin: Sesi tidak valid, redirect ke login');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function renderProfile() {
  const sessionUser = window.getActiveUser();
  if (!sessionUser) return;
  const registeredProfile = getRegisteredProfile(sessionUser);
  const user = normalizeActiveUser(Object.assign({}, registeredProfile || {}, sessionUser));

  userNameField.textContent = user.fullName || 'Nama tidak tersedia';
  userProviderField.textContent = user.authProvider === 'google' ? 'Akun Google' : 'Akun Email';
  renderAvatar(user);
  userContactField.textContent = user.phoneNumber || user.contactInfo || '-';
  userEmailField.textContent = user.emailAddress || (user.contactInfo && user.contactInfo.includes('@') ? user.contactInfo : '-') || '-';
  if (userUsernameField) userUsernameField.textContent = user.username || '-';
  if (userGenderField) userGenderField.textContent = user.gender || '-';
  if (userBirthDateField) userBirthDateField.textContent = user.birthDate ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${user.birthDate}T00:00:00Z`)) : '-';
  if (userAddressField) userAddressField.textContent = user.address || '-';
  userIdField.textContent = user.id || '-';
  userLoginTimeField.textContent = formatDateTime(user.loggedAt);
  historyLoginTimeField.textContent = formatDateTime(user.loggedAt);
}

function forceCleanReRender() {
  // Clear and re-render profile data for current user
  renderProfile();

  console.log('Clean re-render completed for profile page');
}

function logoutQuick() {
  // Logout Cepat: Hanya menghapus kunci dikyActiveUser
  // Data keranjang, hutang, dan order TETAP utuh di localStorage

  console.log('Logout Cepat: Menghapus session user aktif saja');
  localStorage.removeItem('dikyActiveUser');
  window.location.href = 'login.html';
}

function readStoredRecords(key) {
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(parsed)) return parsed.filter((record) => record && typeof record === 'object');
    return parsed && typeof parsed === 'object' ? [parsed] : [];
  } catch (error) {
    console.warn(`Data tersimpan pada ${key} tidak valid.`, error);
    return [];
  }
}

function hasActiveOrdersBeforeLogout() {
  const finishedStatuses = new Set([
    'selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan',
    'completed', 'cancelled', 'dibatalkan_admin', 'batal'
  ]);

  const isUnfinished = (order) => {
    if (!order || typeof order !== 'object') return false;
    if (order.dihapusUser === true) return false;

    // Cek apakah pesanan ini berasal dari titipan yang sudah dibatalkan
    if (order.titipanId) {
      try {
        const userTitipKey = getUserStorageKey('titipan');
        const rawTitip = userTitipKey ? localStorage.getItem(userTitipKey) : null;
        if (rawTitip) {
          const titipList = JSON.parse(rawTitip);
          if (Array.isArray(titipList)) {
            const foundTitip = titipList.find((t) => t && String(t.id) === String(order.titipanId));
            if (foundTitip && String(foundTitip.status).trim().toLowerCase() === 'dibatalkan') {
              return false;
            }
          }
        }
      } catch (e) { }
    }

    const status = String(order.status || '').trim().toLowerCase();
    // Hanya objek pesanan sah yang memiliki status atau ID yang diperiksa
    if (!status && !order.id) return false;
    if (!status) return false;

    return !finishedStatuses.has(status);
  };

  // 1) Pesanan yang masih "menggantung" di success.html: sudah di-checkout tetapi
  //    BELUM ditekan "Lihat Riwayat Pesanan". Ini yang benar-benar perlu diblokir.
  const pendingKeys = [
    getUserStorageKey('pesananAktif'),
    getUserStorageKey('lastOrder')
  ].filter(Boolean);
  if (pendingKeys.some((key) => readStoredRecords(key).some(isUnfinished))) {
    return true;
  }

  // 2) Pesanan yang SUDAH dipindah ke riwayat/arsip: hanya menghalangi bila
  //    statusnya masih Dikemas / Dikirim / Silahkan Untuk Diambil (belum Selesai).
  const historyKeys = [
    getUserStorageKey('riwayatPesanan'),
    getUserStorageKey('orders')
  ].filter(Boolean);
  if (historyKeys.some((key) => readStoredRecords(key).some(isUnfinished))) {
    return true;
  }

  // 3) `pesananBaru` (snapshot keranjang/checkout) SENGAJA TIDAK diperiksa:
  //    daftar pesanan yang masih di keranjang.html / checkout.html tidak
  //    menghalangi Logout Bersih Total, sesuai aturan yang berlaku.
  return false;
}

function preserveUserIdentityBeforeCleanLogout(userId, user) {
  const phone = String(user.phoneNumber || user.whatsappNumber || '').replace(/[^0-9]/g, '');
  const email = String(user.emailAddress || user.email || '').trim().toLowerCase();
  if (!phone && !email) return true;

  let identities;
  try {
    const raw = localStorage.getItem(USED_IDENTITIES_KEY);
    identities = raw === null ? [] : JSON.parse(raw);
  } catch (error) {
    console.warn('Jejak identitas tidak dapat dibaca sebelum logout bersih.', error);
    return false;
  }
  if (!Array.isArray(identities)) return false;

  let exactIdentityExists = false;
  identities.forEach((identity) => {
    if (!identity || typeof identity !== 'object') return;
    const identityPhone = String(identity.phone || identity.phoneNumber || identity.whatsappNumber || '').replace(/[^0-9]/g, '');
    const identityEmail = String(identity.email || identity.emailAddress || '').trim().toLowerCase();
    const ownerId = identity.userId == null ? '' : String(identity.userId);
    const belongsToUser = ownerId === String(userId) || (!ownerId && (
      (phone && identityPhone === phone) || (email && identityEmail === email)
    ));
    if (!belongsToUser) return;
    if (!ownerId) identity.userId = String(userId);
    if (user && (user.profileImage || user.avatarUrl)) {
      identity.profileImage = user.profileImage || user.avatarUrl;
    }
    if (identityPhone === phone && identityEmail === email) exactIdentityExists = true;
  });

  if (!exactIdentityExists) {
    identities.push({
      userId: String(userId),
      phone: phone || null,
      email: email || null,
      profileImage: user.profileImage || user.avatarUrl || null,
      fullName: user.fullName || user.name || null,
      username: user.username || null,
      usedAt: new Date().toISOString()
    });
  }

  try {
    localStorage.setItem(USED_IDENTITIES_KEY, JSON.stringify(identities));
    const saved = JSON.parse(localStorage.getItem(USED_IDENTITIES_KEY) || '[]');
    return Array.isArray(saved) && saved.some((identity) => identity
      && String(identity.userId || '') === String(userId)
      && String(identity.phone || '') === phone
      && String(identity.email || '') === email);
  } catch (error) {
    console.warn('Identitas terbaru tidak dapat dipertahankan sebelum logout bersih.', error);
    return false;
  }
}

function deleteUserAccountRecord(userId) {
  // Logout Bersih Total menghapus SELURUH data akun milik user ini dari daftar
  // akun terdaftar: Nama Lengkap, Username, Foto Profil, Nomor Telepon, Email,
  // Alamat (termasuk alamat otomatis GPS), Detail Alamat Lengkap, Kata Sandi,
  // dan Konfirmasi Kata Sandi. Akun user sepenuhnya hilang seperti belum pernah
  // mendaftar.
  //
  // PENGAMAN PENTING: akun admin / role 'admin' TIDAK PERNAH dihapus, baik akun
  // default dari login.js maupun akun lain yang berperan admin.
  if (!userId) return false;
  try {
    const users = JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY) || '[]');
    if (!Array.isArray(users)) return false;
    const account = users.find((record) => record && String(record.id || '') === String(userId));
    if (!account) return false;
    if (String(account.role || '').trim().toLowerCase() === 'admin') return true;
    const remaining = users.filter((record) => {
      if (!record || String(record.id || '') !== String(userId)) return true; // bukan user ini: simpan
      const isAdmin = String(record.role || '').trim().toLowerCase() === 'admin';
      return isAdmin; // akun admin selalu dipertahankan
    });
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(remaining));
    const saved = JSON.parse(localStorage.getItem(REGISTERED_USERS_KEY) || '[]');
    const deleted = Array.isArray(saved) && !saved.some((record) => record && String(record.id || '') === String(userId));
    if (deleted) console.log('Logout Bersih Total: seluruh data akun user', userId, 'dihapus dari daftar akun.');
    return deleted;
  } catch (error) {
    console.warn('Gagal menghapus data akun user.');
    return false;
  }
}

function logoutClean() {
  if (hasActiveOrdersBeforeLogout()) {
    window.alert('Logout Bersih Total ditolak karena masih ada pesanan yang belum selesai. Selesaikan pesanan pada tab Dikemas, Dikirim, atau Silahkan Untuk Diambil sampai masuk ke tab Selesai di halaman Pesanan terlebih dahulu.');
    return;
  }

  const confirmed = window.confirm('Logout Bersih Total akan menghapus data pribadi dan alamat tersimpan pada sesi user, tetapi tidak menghapus data operasional admin atau katalog produk. Lanjutkan?');
  if (!confirmed) return;

  const user = typeof window.getActiveUser === 'function' ? window.getActiveUser() : null;
  if (!user || !user.id) {
    window.location.href = 'login.html';
    return;
  }

  const userId = String(user.id);
  console.log('Logout Bersih Total: membersihkan data pribadi user', userId);

  const registeredProfile = getRegisteredProfile(user);
  const latestProfile = Object.assign({}, user, registeredProfile || {});
  if (!preserveUserIdentityBeforeCleanLogout(userId, latestProfile)) {
    window.alert('Logout Bersih Total dibatalkan karena nomor telepon/email terbaru tidak dapat dicatat dengan aman. Sesi Anda tetap aktif.');
    return;
  }
  if (!deleteUserAccountRecord(userId)) {
    window.alert('Logout Bersih Total dibatalkan karena data akun tidak berhasil dihapus. Sesi Anda tetap aktif.');
    return;
  }

  // Key orders dan hutang sengaja tidak dihapus karena merupakan arsip admin.
  const preservedOperationalKeys = new Set([
    `dikyTitipanAdmin_${userId}`,
    'dikyTitipArchive'
  ]);
  const privateKeys = [
    getUserStorageKey('cart'),
    getUserStorageKey('titipan'),
    getUserStorageKey('titipanCheckout'),
    getUserStorageKey('titipanDraft'),
    getUserStorageKey('checkoutItems'),
    getUserStorageKey('checkoutSummary'),
    getUserStorageKey('checkoutForm'),
    getUserStorageKey('lastOrder'),
    getUserStorageKey('pesananAktif'),
    getUserStorageKey('pesananBaru'),
    getUserStorageKey('riwayatPesanan'),
    getUserStorageKey('lastPosition'),
    'dikySessionActivity_' + userId
  ].filter((key) => key && !preservedOperationalKeys.has(key));

  privateKeys.forEach((key) => {
    try {
      console.log(`Logout Bersih Total: menghapus ${key}`);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Gagal menghapus ${key}`, error);
    }
  });

  // Hapus juga seluruh token reset kata sandi milik akun ini.
  // Tanpa ini, tautan reset yang pernah dibuat SEBELUM logout masih tersimpan
  // dan bisa dipakai untuk mengubah sandi meski akun sudah dihapus.
  try {
    const rawTokens = localStorage.getItem('dikyResetTokens');
    if (rawTokens) {
      const tokens = JSON.parse(rawTokens);
      if (Array.isArray(tokens)) {
        const remainingTokens = tokens.filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          const milikUser = String(entry.userId || '') === String(userId);
          const emailUser = latestProfile && latestProfile.emailAddress
            ? String(entry.email || '').toLowerCase() === String(latestProfile.emailAddress).toLowerCase()
            : false;
          return !milikUser && !emailUser; // simpan token milik akun lain
        });
        localStorage.setItem('dikyResetTokens', JSON.stringify(remainingTokens));
        console.log('Logout Bersih Total: token reset kata sandi milik', userId, 'dihapus.');
      }
    }
  } catch (error) {
    console.warn('Token reset kata sandi tidak dapat dibersihkan.', error);
  }

  // Bersihkan juga jejak sesi reset (bila ada) agar halaman reset tidak
  // dapat dibuka kembali memakai penanda lama.
  try {
    sessionStorage.removeItem('dikyResetAccess');
    localStorage.removeItem('dikyOtpPendaftaran');
    sessionStorage.removeItem('dikyOtpPendaftaran');
  } catch (error) { }

  // Jangan mengubah dikyOrders_* (arsip admin-orders.html) dan dikyHutang_
  // (arsip admin-hutang.html & admin-dashboard.html), data titipan admin
  // (dikyTitipanAdmin_<userId> dan dikyTitipArchive), serta katalog produk
  // (dikyProducts). Data tersebut dibaca panel admin sebagai arsip operasional
  // dan HARUS tetap aman agar admin tidak kehilangan data saat user logout.

  // Jangan gunakan localStorage.clear() atau wildcard penghapusan. Hapus hanya
  // pointer sesi milik user ini; jangan menyentuh data katalog/admin.
  try {
    localStorage.removeItem('dikyActiveUser');
    sessionStorage.removeItem('diky_security_message');
    sessionStorage.removeItem('diky_nav_target');
    sessionStorage.removeItem('diky_nav_source');
    sessionStorage.removeItem('diky_current_page');
    sessionStorage.removeItem('diky_nav_time');
  } catch (error) {
    console.warn('Sesi user tidak dapat dibersihkan seluruhnya.', error);
  }

  window.location.replace('login.html');
}

window.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;

  // Force clean re-render to ensure only current user's profile is shown
  forceCleanReRender();

  logoutFastButton.addEventListener('click', logoutQuick);
  logoutCleanButton.addEventListener('click', logoutClean);
});

// ============================================================
// SISTEM PINTAR DETEKSI & PENGHALAU LOGOUT BERSIH TOTAL TERKAIT TITIPAN
// ============================================================
(function (window, document) {
  'use strict';

  var origLogoutClean = window.logoutClean;

  // Memetakan status pesanan ke lokasi tampilan, kongruen dengan pemetaan
  // tab di orders.js: dikirim -> tab Dikirim, siap_diambil -> tab Silahkan
  // Untuk Diambil, selain itu (menunggu/diproses/dikemas) -> tab Dikemas.
  function petakanLokasiStatusTitip(status) {
    var st = String(status || 'menunggu').trim().toLowerCase();
    if (st === 'dikirim') {
      return { location: 'orders.html', targetTab: 'dikirim', targetLabel: 'Dikirim / Silahkan Untuk Diambil' };
    }
    if (st === 'siap_diambil') {
      return { location: 'orders.html', targetTab: 'siap_diambil', targetLabel: 'Dikirim / Silahkan Untuk Diambil' };
    }
    return { location: 'orders.html', targetTab: 'dikemas', targetLabel: 'Dikemas' };
  }

  function periksaKondisiTitipanSebelumLogout() {
    var user = typeof window.getActiveUser === 'function' ? window.getActiveUser() : null;
    if (!user || !user.id) return { canLogout: true };

    var userId = String(user.id);
    var userTitipKey = 'dikyTitipan_' + userId;
    var userCheckoutContextKey = 'dikyTitipanCheckout_' + userId;

    // 1. Cek Titipan di Penyimpanan User
    var rawTitip = localStorage.getItem(userTitipKey);
    var titipanList = [];
    try {
      titipanList = JSON.parse(rawTitip || '[]');
      if (!Array.isArray(titipanList)) titipanList = [];
    } catch (e) { titipanList = []; }

    // 2. Cek Konteks Checkout Titipan
    var rawCtx = localStorage.getItem(userCheckoutContextKey);
    var hasCheckoutContext = !!rawCtx;

    // 3. Cek Keranjang Checkout apakah berisi barang titipan
    var checkoutItemsKey = typeof window.getUserStorageKey === 'function' ? window.getUserStorageKey('checkoutItems') : null;
    var rawCheckout = checkoutItemsKey ? localStorage.getItem(checkoutItemsKey) : null;
    var hasTitipInCheckout = false;
    try {
      var chkList = JSON.parse(rawCheckout || '[]');
      if (Array.isArray(chkList)) {
        hasTitipInCheckout = chkList.some(function (it) {
          return it && (it.fromTitipan || (it.cartItemId && String(it.cartItemId).indexOf('TITIP-') === 0));
        });
      }
    } catch (e) { }

    // Evaluasi Status Titipan User.
    //
    // Kasus A: Titipan benar-benar SEDANG berada di halaman checkout.html.
    // Syaratnya harus terpenuhi SEMUA: masih ada konteks checkout titipan,
    // masih ada item titipan di checkoutItems, DAN titipan belum selesai
    // dichekout. Bila konteks/item checkout hanya tersisa sebagai sisa data
    // (pesanan sudah dikirim ke success.html), user TIDAK boleh diarahkan ke
    // checkout.html — pesanannya sudah ada di success.html / orders.html.
    var adaTitipanBelumCheckout = titipanList.some(function (r) {
      return r && ['siap_checkout', 'menunggu_dibeli', 'diproses', 'sebagian_habis']
        .indexOf(String(r.status || '').trim().toLowerCase()) !== -1;
    });
    if ((hasCheckoutContext || hasTitipInCheckout) && adaTitipanBelumCheckout) {
      return {
        canLogout: false,
        scenario: 'checkout',
        message: 'Logout Bersih Total ditolak!\n\nDaftar pesanan titipan Anda saat ini sedang berada di halaman Checkout.\n\nJika Anda tetap ingin melakukan Logout Bersih Total, Anda harus membatalkan pesanan titipan tersebut terlebih dahulu dengan mengklik tombol "Hapus Pesanan Ini" di halaman Checkout.'
      };
    }

    for (var i = 0; i < titipanList.length; i++) {
      var req = titipanList[i];
      if (!req) continue;
      var status = String(req.status || '').trim().toLowerCase();

      // Kasus B: Admin sudah klik "Kirim ke Checkout Pelanggan", user belum klik "Checkout Sekarang"
      if (status === 'siap_checkout') {
        return {
          canLogout: false,
          scenario: 'siap_checkout',
          requestId: req.id,
          message: 'Logout Bersih Total ditolak!\n\nAdmin telah selesai membelikan sayur titipan Anda di pasar dan sudah mengirimkannya ke halaman Titip Beli Anda.\n\nAnda harus mengklik tombol "Checkout Sekarang" terlebih dahulu untuk memproses pesanan titipan Anda ke tahap berikutnya.'
        };
      }

      // Kasus C: Titipan baru dikirim ke admin / sedang dibelikan di pasar
      if (status === 'menunggu_dibeli' || status === 'diproses' || status === 'sebagian_habis') {
        return {
          canLogout: false,
          scenario: 'diproses_admin',
          message: 'Logout Bersih Total ditolak!\n\nDaftar pesanan titipan Anda sudah masuk ke Admin dan sedang diproses untuk dibelikan di pasar.\n\nAdmin harus menentukan harga pasar dan mengirimkannya ke checkout terlebih dahulu.'
        };
      }

      // Kasus C2: Titipan sudah siap diambil secara fisik. Daftar pesanannya
      // sudah berada di tab "Dikirim / Silahkan Untuk Diambil" orders.html.
      if (status === 'siap_diambil') {
        return {
          canLogout: false,
          scenario: 'pesanan_aktif',
          location: 'orders.html',
          targetTab: 'siap_diambil',
          targetLabel: 'Dikirim / Silahkan Untuk Diambil',
          pesanPeringatan: true
        };
      }

      // Kasus C3: Titipan sudah Selesai (Riwayat Titipan). Tidak menghalangi
      // Logout Bersih Total — lanjut memeriksa titipan berikutnya.
      if (status === 'selesai') continue;

      // Kasus D: Titipan sudah dichekout pelanggan (status sudah_checkout).
      // Titipan pada tahap ini SUDAH LEWAT checkout.html. Pesanannya kini
      // berada di pesananAktif/lastOrder (success.html) atau sudah berpindah
      // ke tab orders.html. Titipan HANYA boleh mengarahkan user ke
      // checkout.html bila memang masih ada sisa data checkout yang aktif.
      if (status === 'sudah_checkout') {
        var ordersKey = typeof window.getUserStorageKey === 'function' ? window.getUserStorageKey('orders') : null;
        var riwayatKey = typeof window.getUserStorageKey === 'function' ? window.getUserStorageKey('riwayatPesanan') : null;
        var aktifKey = typeof window.getUserStorageKey === 'function' ? window.getUserStorageKey('pesananAktif') : null;
        var lastOrderKey = typeof window.getUserStorageKey === 'function' ? window.getUserStorageKey('lastOrder') : null;

        var adaOrderTitip = false;
        var posisiOrderTitip = null;

        // (a) Pesanan yang masih menggantung di success.html.
        [aktifKey, lastOrderKey].forEach(function (k) {
          if (!k || adaOrderTitip) return;
          try {
            var rawPending = JSON.parse(localStorage.getItem(k) || 'null');
            var daftarPending = Array.isArray(rawPending)
              ? rawPending
              : (rawPending && typeof rawPending === 'object' ? [rawPending] : []);
            daftarPending.forEach(function (o) {
              if (!o || adaOrderTitip) return;
              if (String(o.titipanId || '') !== String(req.id)) return;
              var st = String(o.status || '').trim().toLowerCase();
              if (st === 'dibatalkan' || st === 'cancelled' || st === 'batal') return;
              adaOrderTitip = true;
              posisiOrderTitip = { location: 'success.html', targetTab: null, targetLabel: null };
            });
          } catch (e) { }
        });

        // (b) Pesanan titipan yang sudah berada di tab orders.html.
        if (!adaOrderTitip) {
          [ordersKey, riwayatKey].forEach(function (k) {
            if (!k || adaOrderTitip) return;
            try {
              var ords = JSON.parse(localStorage.getItem(k) || '[]');
              if (!Array.isArray(ords)) return;
              ords.forEach(function (o) {
                if (!o || adaOrderTitip) return;
                if (String(o.titipanId || '') !== String(req.id)) return;
                var st = String(o.status || 'menunggu').trim().toLowerCase();
                // 'selesai' = sudah Riwayat Pesanan (tidak menghalangi logout).
                if (st === 'selesai' || st === 'dibatalkan' || st === 'cancelled' || st === 'batal') return;
                adaOrderTitip = true;
                posisiOrderTitip = petakanLokasiStatusTitip(st);
              });
            } catch (e) { }
          });
        }

        if (adaOrderTitip) {
          // Daftar pesanan titipan SUDAH keluar dari checkout.html.
          // Jangan arahkan ke checkout.html — arahkan ke lokasi aslinya.
          return {
            canLogout: false,
            scenario: 'pesanan_aktif',
            location: posisiOrderTitip.location,
            targetTab: posisiOrderTitip.targetTab,
            targetLabel: posisiOrderTitip.targetLabel,
            pesanPeringatan: true
          };
        }

        // Tidak ada sisa pesanan titipan di success.html maupun orders.html.
        // Bila sisa data checkout titipan masih ada, barulah arahkan ke checkout.
        var sisaCheckoutItems = false;
        try {
          var rawChk = JSON.parse(localStorage.getItem(checkoutItemsKey) || '[]');
          if (Array.isArray(rawChk)) {
            sisaCheckoutItems = rawChk.some(function (it) {
              return it && String(it.fromTitipan || '') === String(req.id);
            });
          }
        } catch (e) { }

        if (sisaCheckoutItems) {
          return {
            canLogout: false,
            scenario: 'checkout',
            message: 'Logout Bersih Total ditolak!\n\nDaftar pesanan titipan Anda saat ini sedang berada di halaman Checkout.\n\nJika Anda tetap ingin melakukan Logout Bersih Total, Anda harus membatalkan pesanan titipan tersebut terlebih dahulu dengan mengklik tombol "Hapus Pesanan Ini" di halaman Checkout.'
          };
        }
      }
    }

    return { canLogout: true };
  }

  // Intersep fungsi Logout Bersih Total pada tombol
  var logoutCleanBtn = document.getElementById('logout-clean-button');
  if (logoutCleanBtn) {
    logoutCleanBtn.addEventListener('click', function (event) {
      var check = periksaKondisiTitipanSebelumLogout();

      if (!check.canLogout) {
        event.stopImmediatePropagation();
        event.preventDefault();

        // Skenario 'pesanan_aktif': pesanan titipan SUDAH keluar dari
        // checkout.html dan kini berada di success.html atau tab orders.html.
        // Pesannya HARUS sama dengan pesan standar (bukan pesan checkout),
        // dan user dipentalkan ke lokasi pesanannya yang sebenarnya.
        if (check.pesanPeringatan) {
          var pesan = 'Logout Bersih Total ditolak karena masih ada pesanan yang belum selesai, selesaikan pesanan pada tab Dikemas, Dikirim, atau Silahkan Untuk Diambil sampai masuk ke tab Selesai di halaman pesanan terlebih dahulu';
          if (check.location === 'success.html') {
            pesan += ', pesanan anda saat ini berada di halaman sukses (success.html)';
          } else if (check.targetLabel) {
            pesan += ', pesanan anda saat ini berada di tab ' + check.targetLabel;
          }
          window.alert(pesan);

          if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
            window.NavigationGuard.grantAccess(check.location, 'logout_clean_reject_redirect');
          }

          if (check.location === 'success.html') {
            window.location.href = 'success.html';
          } else {
            try {
              if (check.targetTab) sessionStorage.setItem('dikySmartGuideOrderTab', check.targetTab);
            } catch (e) { }
            window.location.href = 'orders.html';
          }
          return false;
        }

        window.alert(check.message);

        if (check.scenario === 'siap_checkout') {
          sessionStorage.setItem('highlightTitipCheckout', String(check.requestId || ''));
          window.location.href = 'titip.html';
        } else if (check.scenario === 'checkout') {
          sessionStorage.setItem('highlightBatalCheckout', 'true');
          window.location.href = 'checkout.html';
        }
        return false;
      }
    }, true); // Gunakan capturing listener agar dievaluasi sebelum listener bawaan
  }
})(window, document);

// ============================================================
// SISTEM DETEKSI POSISI PESANAN BELUM SELESAI & PENGALIHAN CERDAS
// ============================================================
(function (window, document) {
  'use strict';

  var finishedStatuses = {
    'selesai': true,
    'lunas': true,
    'dibatalkan': true,
    'dibatalkan oleh pelanggan': true,
    'completed': true,
    'cancelled': true,
    'dibatalkan_admin': true,
    'batal': true
  };

  function isPesananAktif(order) {
    if (!order || typeof order !== 'object') return false;
    if (order.dihapusUser === true) return false;

    // Jika pesanan berasal dari titipan yang dibatalkan
    if (order.titipanId) {
      try {
        var userTitipKey = typeof window.getUserStorageKey === 'function' ? window.getUserStorageKey('titipan') : null;
        var rawTitip = userTitipKey ? localStorage.getItem(userTitipKey) : null;
        if (rawTitip) {
          var titipList = JSON.parse(rawTitip);
          if (Array.isArray(titipList)) {
            var foundTitip = titipList.find(function (t) { return t && String(t.id) === String(order.titipanId); });
            if (foundTitip && String(foundTitip.status).trim().toLowerCase() === 'dibatalkan') {
              return false;
            }
          }
        }
      } catch (e) { }
    }

    var st = String(order.status || '').trim().toLowerCase();
    if (!st && !order.id) return false;
    if (!st) st = 'menunggu';

    return !finishedStatuses[st];
  }

  // Memetakan sebuah pesanan aktif ke lokasi tampilan yang PERSIS sama
  // dengan pemetaan tab di orders.js:
  //   - 'dikirim'      -> tab "Dikirim"
  //   - 'siap_diambil' -> tab "Silahkan Untuk Diambil"
  //   - lainnya        -> tab "Dikemas"
  function petakanLokasiPesanan(order) {
    var status = String(order.status || 'menunggu').trim().toLowerCase();

    if (status === 'dikirim') {
      return { location: 'orders.html', targetTab: 'dikirim', targetLabel: 'Dikirim' };
    }
    if (status === 'siap_diambil') {
      return { location: 'orders.html', targetTab: 'siap_diambil', targetLabel: 'Silahkan Untuk Diambil' };
    }
    // Status 'menunggu', 'dikemas', 'diproses', dll. semuanya berada di tab Dikemas.
    return { location: 'orders.html', targetTab: 'dikemas', targetLabel: 'Dikemas' };
  }

  function cariPosisiPesananAktif() {

    // 1. Cek apakah ada pesanan aktif yang menggantung di success.html
    var pendingKeys = [];
    if (typeof window.getUserStorageKey === 'function') {
      ['pesananAktif', 'lastOrder'].forEach(function (k) {
        var key = window.getUserStorageKey(k);
        if (key) pendingKeys.push(key);
      });
    }

    for (var i = 0; i < pendingKeys.length; i++) {
      try {
        var raw = localStorage.getItem(pendingKeys[i]);
        if (raw) {
          var parsed = JSON.parse(raw);
          var list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
          var pendingOrder = list.find(isPesananAktif);
          if (pendingOrder) {
            return {
              hasActive: true,
              location: 'success.html',
              targetTab: null,
              order: pendingOrder
            };
          }
        }
      } catch (e) { }
    }

    // 2. Cek apakah ada pesanan aktif di orders.html (Tab Dikemas vs Dikirim / Silahkan Untuk Diambil)
    var orderKeys = [];
    if (typeof window.getUserStorageKey === 'function') {
      ['orders', 'riwayatPesanan'].forEach(function (k) {
        var key = window.getUserStorageKey(k);
        if (key) orderKeys.push(key);
      });
    }

    for (var j = 0; j < orderKeys.length; j++) {
      try {
        var rawOrders = localStorage.getItem(orderKeys[j]);
        if (rawOrders) {
          var parsedOrders = JSON.parse(rawOrders);
          var orderList = Array.isArray(parsedOrders) ? parsedOrders : (parsedOrders && typeof parsedOrders === 'object' ? [parsedOrders] : []);
          // Kumpulkan SEMUA pesanan aktif agar prioritas tab ditentukan dengan benar
          // (Dikirim > Silahkan Untuk Diambil > Dikemas), bukan sekadar pesanan pertama.
          var activeOrders = orderList.filter(isPesananAktif);
          if (activeOrders.length) {
            var prioritas = { dikirim: 3, siap_diambil: 2, dikemas: 1 };
            var terpilih = null;
            var terpilihPoin = -1;

            activeOrders.forEach(function (candidate) {
              var info = petakanLokasiPesanan(candidate);
              var poin = prioritas[info.targetTab] || 0;
              if (poin > terpilihPoin) {
                terpilihPoin = poin;
                terpilih = { order: candidate, info: info };
              }
            });

            if (terpilih) {
              return {
                hasActive: true,
                location: terpilih.info.location,
                targetTab: terpilih.info.targetTab,
                targetLabel: terpilih.info.targetLabel,
                order: terpilih.order
              };
            }
          }
        }
      } catch (e) { }
    }

    return { hasActive: false };
  }

  // Interseptor Tombol Logout Bersih Total untuk Pengalihan Presisi
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('logout-clean-button');
    if (!btn) return;

    btn.addEventListener('click', function (event) {
      var activeCheck = cariPosisiPesananAktif();
      if (activeCheck && activeCheck.hasActive) {
        event.stopImmediatePropagation();
        event.preventDefault();

        // Tampilkan pesan peringatan persis sesuai instruksi.
        // Pesan menyebutkan lokasi pesanan aktif (success.html atau tab tertentu)
        // agar user tahu harus menyelesaikan pesanan di mana.
        var pesanPeringatan = 'Logout Bersih Total ditolak karena masih ada pesanan yang belum selesai, selesaikan pesanan pada tab Dikemas, Dikirim, atau Silahkan Untuk Diambil sampai masuk ke tab Selesai di halaman pesanan terlebih dahulu';
        if (activeCheck.location === 'success.html') {
          pesanPeringatan += ', pesanan anda saat ini berada di halaman sukses (success.html)';
        } else if (activeCheck.targetTab === 'dikemas') {
          pesanPeringatan += ', pesanan anda saat ini berada di tab Dikemas';
        } else if (activeCheck.targetTab === 'dikirim' || activeCheck.targetTab === 'siap_diambil') {
          pesanPeringatan += ', pesanan anda saat ini berada di tab Dikirim / Silahkan Untuk Diambil';
        }
        window.alert(pesanPeringatan);

        // Berikan izin akses navigasi sah ke halaman target
        if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
          window.NavigationGuard.grantAccess(activeCheck.location, 'logout_clean_reject_redirect');
        }

        // Pentalkan user ke lokasi tempat pesanan aktif berada
        if (activeCheck.location === 'success.html') {
          window.location.href = 'success.html';
        } else if (activeCheck.location === 'orders.html') {
          if (activeCheck.targetTab) {
            try {
              sessionStorage.setItem('dikySmartGuideOrderTab', activeCheck.targetTab);
            } catch (e) { }
          }
          window.location.href = 'orders.html';
        }
        return false;
      }
    }, true); // capturing listener agar terpanggil paling awal
  });
})(window, document);
