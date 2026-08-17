const loginForm = document.getElementById('login-form');
const googleLoginButton = document.getElementById('google-login-button');
const googleNativeContainer = document.getElementById('google-native-button');
const toast = document.getElementById('login-toast');
const usersKey = 'dikyRegisteredUsers';
const activeUserKey = 'dikyActiveUser';
const pendingGoogleKey = 'dikyPendingGoogleProfile';

// Isi dengan OAuth Client ID Google agar tombol Google memakai akun asli
// (nama, email, dan foto profil asli). Biarkan kosong untuk mode lokal.
const googleClientId = '';

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
    fullName: user.fullName,
    emailAddress: user.emailAddress ? user.emailAddress.toLowerCase() : null,
    phoneNumber: user.phoneNumber || user.whatsappNumber || null,
    avatarUrl: user.avatarUrl || null,
    authProvider: user.authProvider || 'email',
    loggedAt: new Date().toISOString(),
    ...extra
  };
}

function redirectToRegister(profile) {
  if (profile) {
    localStorage.setItem(pendingGoogleKey, JSON.stringify(profile));
  }

  showToast('Akun belum terdaftar. Mengarahkan ke halaman pendaftaran...');
  window.setTimeout(() => {
    window.location.href = 'daftar.html';
  }, 1500);
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

  const user = findUserByEmail(emailAddress);
  if (!user) {
    showToast('Email belum terdaftar.');
    return;
  }

  if (user.password !== password) {
    showToast('Kata sandi salah. Silakan coba lagi.');
    return;
  }

  saveActiveUser(buildSession(user));

  showToast('Login berhasil! Mengarahkan ke halaman utama...');
  window.setTimeout(() => {
    window.location.href = 'index.html';
  }, 1700);
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
  redirectIfLoggedIn();
  localStorage.removeItem(pendingGoogleKey);
  window.setTimeout(setupGoogleIdentity, 600);
});

loginForm.addEventListener('submit', handleLogin);
googleLoginButton.addEventListener('click', handleGoogleSignUpClick);
