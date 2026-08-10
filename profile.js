const activeUserKey = 'dikyActiveUser';
const userNameField = document.getElementById('user-name');
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
    phoneNumber: user.phoneNumber || whatsappNumber || null
  };
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
