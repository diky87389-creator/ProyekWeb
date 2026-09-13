const userNameField = document.getElementById('user-name');
const userProviderField = document.getElementById('user-provider');
const userAvatarImage = document.getElementById('user-avatar-image');
const userAvatarInitials = document.getElementById('user-avatar-initials');
const userContactField = document.getElementById('user-contact');
const userEmailField = document.getElementById('user-email');
const userUsernameField = document.getElementById('user-username');
const userAddressField = document.getElementById('user-address');
const userLoginTimeField = document.getElementById('user-login-time');
const userIdField = document.getElementById('user-id');
const historyLoginTimeField = document.getElementById('history-login-time');
const logoutFastButton = document.getElementById('logout-fast-button');
const logoutCleanButton = document.getElementById('logout-clean-button');

function normalizeActiveUser(user) {
  const { whatsappNumber, ...rest } = user;
  return {
    ...rest,
    userId: user.userId || user.id || null,
    username: user.username || null,
    phoneNumber: user.phoneNumber || whatsappNumber || null,
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
  const keys = [
    getUserStorageKey('pesananAktif'),
    getUserStorageKey('pesananBaru'),
    getUserStorageKey('lastOrder'),
    getUserStorageKey('riwayatPesanan'),
    getUserStorageKey('orders')
  ].filter(Boolean);

  return keys.some((key) => readStoredRecords(key).some((order) => {
    const status = String(order.status || 'menunggu').trim().toLowerCase();
    return !finishedStatuses.has(status);
  }));
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

  // Jangan mengubah dikyRegisteredUsers, dikyOrders_*, dikyHutang_*, atau katalog.
  // Data tersebut dibaca panel admin sebagai arsip operasional dan tetap harus aman.
  // Semua data alamat pribadi yang tersimpan pada sesi/form user sudah ikut dihapus
  // melalui privateKeys di atas; alamat pada arsip admin sengaja dipertahankan.

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
