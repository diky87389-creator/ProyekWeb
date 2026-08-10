const loginForm = document.getElementById('login-form');
const toast = document.getElementById('login-toast');
const usersKey = 'dikyRegisteredUsers';
const activeUserKey = 'dikyActiveUser';

function getActiveUser() {
  const raw = localStorage.getItem(activeUserKey);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Data pengguna aktif tidak valid.', error);
    localStorage.removeItem(activeUserKey);
    return null;
  }
}

function redirectIfLoggedIn() {
  if (getActiveUser()) {
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
  localStorage.setItem(usersKey, JSON.stringify(normalizedUsers));
}

function getRegisteredUsers() {
  const raw = localStorage.getItem(usersKey);
  try {
    const users = raw ? JSON.parse(raw) : [];
    const normalizedUsers = users.map(normalizeUserRecord);
    if (raw && JSON.stringify(normalizedUsers) !== JSON.stringify(users)) {
      saveRegisteredUsers(normalizedUsers);
    }
    return normalizedUsers;
  } catch (error) {
    console.warn('Data pengguna tidak valid.', error);
    localStorage.removeItem(usersKey);
    return [];
  }
}

function saveActiveUser(user) {
  localStorage.setItem(activeUserKey, JSON.stringify(user));
}

function isValidEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

function validateLogin(emailAddress, password) {
  const users = getRegisteredUsers();
  const normalizedEmail = emailAddress ? emailAddress.toLowerCase() : null;

  return users.find((user) => {
    const userEmail = user.emailAddress ? user.emailAddress.toLowerCase() : null;
    const fallback = user.contactInfo ? user.contactInfo.trim() : '';
    const fallbackEmail = isValidEmail(fallback) ? fallback.toLowerCase() : null;

    return (userEmail === normalizedEmail || fallbackEmail === normalizedEmail) && user.password === password;
  });
}

function handleLogin(event) {
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

  const user = validateLogin(emailAddress, password);
  if (!user) {
    showToast('Login gagal. Periksa data dan coba lagi.');
    return;
  }

  saveActiveUser({
    id: user.id,
    fullName: user.fullName,
    emailAddress: user.emailAddress ? user.emailAddress.toLowerCase() : null,
    phoneNumber: user.phoneNumber || user.whatsappNumber || null,
    loggedAt: new Date().toISOString()
  });

  showToast('Login berhasil! Mengarahkan ke halaman utama...');
  window.setTimeout(() => {
    window.location.href = 'index.html';
  }, 1700);
}

window.addEventListener('DOMContentLoaded', redirectIfLoggedIn);
loginForm.addEventListener('submit', handleLogin);
