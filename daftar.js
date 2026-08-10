const registerForm = document.getElementById('register-form');
const toast = document.getElementById('register-toast');
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
  const { whatsappNumber, contactInfo, ...rest } = user;
  const fallbackPhone = contactInfo && /^[0-9]+$/.test(contactInfo.trim())
    ? normalizePhone(contactInfo)
    : null;

  return {
    ...rest,
    phoneNumber: user.phoneNumber || whatsappNumber || fallbackPhone || null
  };
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

function saveRegisteredUsers(users) {
  const normalizedUsers = users.map(normalizeUserRecord);
  localStorage.setItem(usersKey, JSON.stringify(normalizedUsers));
}

function saveActiveUser(user) {
  localStorage.setItem(activeUserKey, JSON.stringify(user));
}

function normalizePhone(number) {
  return String(number).replace(/[^0-9]/g, '');
}

function isValidPhoneNumber(number) {
  const digits = normalizePhone(number);
  return /^[0-9]{10,15}$/.test(digits);
}

function isValidEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

function isDuplicateUser(phoneNumber, emailAddress) {
  const users = getRegisteredUsers();
  const normalizedPhone = normalizePhone(phoneNumber);
  const normalizedEmail = emailAddress.toLowerCase();

  return users.some((user) => {
    const userPhone = user.phoneNumber ? normalizePhone(user.phoneNumber) : (user.whatsappNumber ? normalizePhone(user.whatsappNumber) : null);
    const userEmail = user.emailAddress ? user.emailAddress.toLowerCase() : null;
    const fallback = user.contactInfo ? user.contactInfo.trim() : '';
    const fallbackPhone = /^[0-9]+$/.test(fallback) ? normalizePhone(fallback) : null;
    const fallbackEmail = isValidEmail(fallback) ? fallback.toLowerCase() : null;

    return (
      (userPhone && userPhone === normalizedPhone) ||
      (userEmail && userEmail === normalizedEmail) ||
      (fallbackPhone && fallbackPhone === normalizedPhone) ||
      (fallbackEmail && fallbackEmail === normalizedEmail)
    );
  });
}

function handleRegister(event) {
  event.preventDefault();

  const fullName = document.getElementById('full-name').value.trim();
  const phoneNumber = document.getElementById('phone-number').value.trim();
  const emailAddress = document.getElementById('email-address').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (!fullName || !phoneNumber || !emailAddress || !password || !confirmPassword) {
    showToast('Semua kolom wajib diisi.');
    return;
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    showToast('Masukkan nomor telepon yang valid.');
    return;
  }

  if (!isValidEmail(emailAddress)) {
    showToast('Masukkan alamat email yang valid.');
    return;
  }

  if (password.length < 6) {
    showToast('Kata sandi minimal 6 karakter.');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Kata sandi dan konfirmasi kata sandi tidak cocok.');
    return;
  }

  if (isDuplicateUser(phoneNumber, emailAddress)) {
    showToast('Akun dengan nomor telepon atau email tersebut sudah terdaftar.');
    return;
  }

  const users = getRegisteredUsers();
  const newUser = {
    id: `USER-${Date.now()}`,
    fullName,
    phoneNumber: normalizePhone(phoneNumber),
    emailAddress: emailAddress.toLowerCase(),
    password
  };

  users.push(newUser);
  saveRegisteredUsers(users);
  saveActiveUser({
    id: newUser.id,
    fullName: newUser.fullName,
    phoneNumber: newUser.phoneNumber,
    emailAddress: newUser.emailAddress,
    loggedAt: new Date().toISOString()
  });

  showToast('Pendaftaran berhasil! Anda langsung masuk dan diarahkan ke beranda...');

  window.setTimeout(() => {
    window.location.href = 'index.html';
  }, 1800);
}

window.addEventListener('DOMContentLoaded', redirectIfLoggedIn);
registerForm.addEventListener('submit', handleRegister);
