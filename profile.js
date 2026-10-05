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
  const finishedStatuses = new Set(['selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan', 'completed', 'cancelled']);

  const isUnfinished = (order) => {
    if (!order || typeof order !== 'object') return false;
    const status = String(order.status || 'menunggu').trim().toLowerCase();
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
    if (identityPhone === phone && identityEmail === email) exactIdentityExists = true;
  });

  if (!exactIdentityExists) {
    identities.push({
      userId: String(userId),
      phone: phone || null,
      email: email || null,
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
  const privateKeys = [
    getUserStorageKey('cart'),
    getUserStorageKey('checkoutItems'),
    getUserStorageKey('checkoutSummary'),
    getUserStorageKey('checkoutForm'),
    getUserStorageKey('lastOrder'),
    getUserStorageKey('pesananAktif'),
    getUserStorageKey('pesananBaru'),
    getUserStorageKey('riwayatPesanan'),
    getUserStorageKey('lastPosition'),
    'dikySessionActivity_' + userId
  ].filter(Boolean);

  privateKeys.forEach((key) => {
    try {
      console.log(`Logout Bersih Total: menghapus ${key}`);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Gagal menghapus ${key}`, error);
    }
  });

  // Jangan mengubah dikyOrders_* (arsip admin-orders.html) dan dikyHutang_
  // (arsip admin-hutang.html & admin-dashboard.html), serta katalog produk
  // (dikyProducts). Data tersebut dibaca panel admin sebagai arsip operasional
  // dan HARUS tetap aman agar admin tidak kebingungan saat memproses pesanan.

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
