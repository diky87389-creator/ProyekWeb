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
  if (user && user.id) {
    localStorage.setItem('dikySessionActivity_' + String(user.id), String(Date.now()));
  }
}

function ensureAdminRecord() {
  const users = getRegisteredUsers();
  const existing = users.find((item) => item && item.id === 99);
  if (!existing) {
    users.push({ id: 99, fullName: 'Diky Wahyudi', name: 'Diky Wahyudi', emailAddress: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
    saveRegisteredUsers(users);
  }
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
    profileImage: user.profileImage || user.avatarUrl || null,
    emailAddress: user.emailAddress ? user.emailAddress.toLowerCase() : null,
    phoneNumber: user.phoneNumber || user.whatsappNumber || null,
    address: user.address || null,
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

  const isAdminLogin = emailAddress.toLowerCase() === ADMIN_EMAIL;
  let user = findUserByEmail(emailAddress);

  if (isAdminLogin) {
    if (password !== ADMIN_PASSWORD) {
      showToast('Email admin atau kata sandi admin salah.');
      return;
    }
    user = { id: 99, fullName: 'Diky Wahyudi', name: 'Diky Wahyudi', emailAddress: ADMIN_EMAIL, role: 'admin' };
    ensureAdminRecord();
  } else {
    if (!user) {
      showToast('Email belum terdaftar.');
      return;
    }
    if (user.password !== password) {
      showToast('Kata sandi salah. Silakan coba lagi.');
      return;
    }
    user.role = user.role === 'admin' ? 'admin' : 'user';
  }

  forceCleanupOldSession();
  const session = buildSession(user, { role: user.role });
  saveActiveUser(session);

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
