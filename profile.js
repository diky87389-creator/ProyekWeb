const activeUserKey = 'dikyActiveUser';
const userNameField = document.getElementById('user-name');
const userProviderField = document.getElementById('user-provider');
const userAvatarImage = document.getElementById('user-avatar-image');
const userAvatarInitials = document.getElementById('user-avatar-initials');
const userContactField = document.getElementById('user-contact');
const userEmailField = document.getElementById('user-email');
const userLoginTimeField = document.getElementById('user-login-time');
const userIdField = document.getElementById('user-id');
const historyLoginTimeField = document.getElementById('history-login-time');
const logoutFastButton = document.getElementById('logout-fast-button');
const logoutCleanButton = document.getElementById('logout-clean-button');

function normalizeActiveUser(user) {
  const { whatsappNumber, ...rest } = user;
  return {
    ...rest,
    phoneNumber: user.phoneNumber || whatsappNumber || null,
    avatarUrl: user.avatarUrl || null,
    authProvider: user.authProvider || 'email'
  };
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

  if (!user.avatarUrl) {
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
  userAvatarImage.src = user.avatarUrl;
  userAvatarImage.alt = `Foto profil ${user.fullName || 'pengguna'}`;
}

function saveActiveUser(user) {
  const { whatsappNumber, ...rest } = user;
  localStorage.setItem(activeUserKey, JSON.stringify(rest));
}

function getActiveUser() {
  const raw = localStorage.getItem(activeUserKey);
  try {
    const user = raw ? JSON.parse(raw) : null;
    if (!user) return null;
    const normalizedUser = normalizeActiveUser(user);
    if (JSON.stringify(normalizedUser) !== JSON.stringify(user)) {
      saveActiveUser(normalizedUser);
    }
    return normalizedUser;
  } catch (error) {
    console.warn('Data pengguna aktif tidak valid.', error);
    localStorage.removeItem(activeUserKey);
    return null;
  }
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
  const user = getActiveUser();
  if (!user) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function renderProfile() {
  const user = getActiveUser();
  if (!user) return;

  userNameField.textContent = user.fullName || 'Nama tidak tersedia';
  userProviderField.textContent = user.authProvider === 'google' ? 'Akun Google' : 'Akun Email';
  renderAvatar(user);
  userContactField.textContent = user.phoneNumber || user.contactInfo || '-';
  userEmailField.textContent = user.emailAddress || (user.contactInfo && user.contactInfo.includes('@') ? user.contactInfo : '-') || '-';
  userIdField.textContent = user.id || '-';
  userLoginTimeField.textContent = formatDateTime(user.loggedAt);
  historyLoginTimeField.textContent = formatDateTime(user.loggedAt);
}

function logoutQuick() {
  // Hanya menghapus data user aktif
  localStorage.removeItem('dikyActiveUser');
  window.location.href = 'login.html';
}

function logoutClean() {
  const confirmed = window.confirm('Logout Bersih Total akan menghapus SEMUA data lokal Warung Sayur Diky dari perangkat ini. Lanjutkan?');
  if (!confirmed) return;
  
  // Hapus semua data spesifik Warung Sayur Diky
  const keysToRemove = [
    'dikyActiveUser',
    'dikyRegisteredUsers',
    'dikyCart',
    'dikyOrders',
    'dikyCheckoutSummary'
  ];
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
  window.location.href = 'login.html';
}

window.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;
  renderProfile();
  logoutFastButton.addEventListener('click', logoutQuick);
  logoutCleanButton.addEventListener('click', logoutClean);
});
