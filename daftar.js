const registerForm = document.getElementById('register-form');
const toast = document.getElementById('register-toast');
const usersKey = 'dikyRegisteredUsers';
const activeUserKey = 'dikyActiveUser';
const pendingGoogleKey = 'dikyPendingGoogleProfile';
const fotoProfilInput = document.getElementById('fotoProfil');
const fotoProfilPreview = document.getElementById('fotoProfilPreview');
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
const addressField = document.getElementById('address');
const latitudeField = document.getElementById('latitude');
const longitudeField = document.getElementById('longitude');
const addressDetailField = document.getElementById('address-detail');
const saveAddressDetailButton = document.getElementById('save-address-detail-btn');
const editAddressDetailButton = document.getElementById('edit-address-detail-btn');
const detectLocationButton = document.getElementById('detect-location-btn');
let profileImageBase64 = '';
let map;
let locationMarker;
let gpsLocationReady = false;
let detailAddressSaved = false;

function clearValidationStyles() {
  document.querySelectorAll('.field-error').forEach((element) => {
    element.classList.remove('field-error');
  });
  document.querySelectorAll('.location-button-warning').forEach((element) => {
    element.classList.remove('location-button-warning');
  });
}

function applyInvalidState(element, button = null) {
  if (!element) return;
  element.classList.add('field-error');
  if (button) {
    button.classList.add('location-button-warning');
  }
}

function focusFirstInvalid(element, button = null) {
  if (element) {
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (typeof element.focus === 'function') {
      element.focus();
    }
  }
  if (button && button !== element) {
    if (typeof button.scrollIntoView === 'function') {
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function buildFullAddress(baseAddress, manualAddressText) {
  const cleanBase = String(baseAddress || '').trim();
  const cleanManual = String(manualAddressText || '').trim();

  if (!cleanBase && !cleanManual) {
    return '';
  }

  const segments = [];
  if (cleanBase) segments.push(cleanBase);
  if (cleanManual) segments.push(cleanManual);

  return segments.join(' _ ');
}

function syncUserAddressRecord(fullAddress, latitudeValue, longitudeValue) {
  const activeUser = typeof window.getActiveUser === 'function' ? window.getActiveUser() : null;
  if (!activeUser || !activeUser.id) return;

  try {
    const activeUserRecord = JSON.parse(localStorage.getItem(activeUserKey) || 'null');
    if (activeUserRecord && String(activeUserRecord.id) === String(activeUser.id)) {
      activeUserRecord.address = fullAddress || '';
      if (latitudeValue !== undefined && latitudeValue !== null && latitudeValue !== '') {
        activeUserRecord.latitude = Number(latitudeValue);
      }
      if (longitudeValue !== undefined && longitudeValue !== null && longitudeValue !== '') {
        activeUserRecord.longitude = Number(longitudeValue);
      }
      localStorage.setItem(activeUserKey, JSON.stringify(activeUserRecord));
    }
  } catch (error) {
    console.warn('Gagal memperbarui sesi aktif dengan alamat gabungan.', error);
  }

  try {
    const users = getRegisteredUsers();
    const targetIndex = users.findIndex((user) => String(user.id) === String(activeUser.id));
    if (targetIndex >= 0) {
      users[targetIndex].address = fullAddress || users[targetIndex].address || '';
      if (latitudeValue !== undefined && latitudeValue !== null && latitudeValue !== '') {
        users[targetIndex].latitude = Number(latitudeValue);
      }
      if (longitudeValue !== undefined && longitudeValue !== null && longitudeValue !== '') {
        users[targetIndex].longitude = Number(longitudeValue);
      }
      saveRegisteredUsers(users);
    }
  } catch (error) {
    console.warn('Gagal memperbarui data pengguna di localStorage dengan alamat gabungan.', error);
  }
}

function getCurrentManualDetailFromAddress(addressValue) {
  const raw = String(addressValue || '').trim();
  if (!raw) return '';

  const manualParts = raw.split(' _ ');
  if (manualParts.length > 1) {
    return manualParts.slice(1).join(' _ ');
  }

  if (addressDetailField && addressDetailField.value.trim()) {
    return addressDetailField.value.trim();
  }

  return '';
}

function syncMainAddressFieldWithDetectedAddress(formattedAddress) {
  const currentAddressValue = addressField ? addressField.value : '';
  const manualText = getCurrentManualDetailFromAddress(currentAddressValue);
  const manualOverride = addressDetailField && addressDetailField.value.trim() ? addressDetailField.value.trim() : manualText;

  if (addressField) {
    addressField.value = buildFullAddress(formattedAddress, manualOverride);
  }
}

function initializeMap() {
  if (!document.getElementById('map') || typeof window.L === 'undefined') return;

  const defaultLat = -6.2088;
  const defaultLng = 106.8456;

  map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([defaultLat, defaultLng], 12);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    crossOrigin: true
  }).addTo(map);

  const initialMarker = L.marker([defaultLat, defaultLng], { draggable: false }).addTo(map);
  initialMarker.bindPopup('');
  locationMarker = initialMarker;
}

async function reverseGeocode(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'id'
      },
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error('Reverse geocode gagal.');
    }

    const data = await response.json();
    const street = data.address?.road || data.address?.footway || data.address?.path || '';
    const village = data.address?.village || data.address?.suburb || data.address?.hamlet || '';
    const district = data.address?.city_district || data.address?.district || data.address?.county || '';
    const city = data.address?.city || data.address?.town || data.address?.municipality || '';
    const province = data.address?.state || data.address?.province || '';
    const country = data.address?.country || '';

    const addressParts = [street, village || district, city, province, country].filter(Boolean);
    if (addressParts.length) {
      return addressParts.join(', ');
    }

    return `Koordinat: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  } catch (error) {
    console.warn('Reverse geocode tidak tersedia:', error);
    return `Koordinat: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
}

function updateLocationFields(lat, lng, formattedAddress) {
  const latitudeValue = Number(lat);
  const longitudeValue = Number(lng);
  const detectedAddress = formattedAddress || `Koordinat: ${Number(latitudeValue).toFixed(6)}, ${Number(longitudeValue).toFixed(6)}`;

  if (latitudeField) {
    latitudeField.value = Number(latitudeValue).toFixed(6);
  }

  if (longitudeField) {
    longitudeField.value = Number(longitudeValue).toFixed(6);
  }

  if (map && typeof window.L !== 'undefined') {
    const point = [latitudeValue, longitudeValue];
    map.setView(point, 16, { animate: true });

    if (locationMarker && map.hasLayer(locationMarker)) {
      map.removeLayer(locationMarker);
    }

    const nextMarker = L.marker(point, { draggable: true }).addTo(map);
    const popupText = `Lokasi Kamu Disini: ${detectedAddress}`;
    nextMarker.bindPopup(popupText);
    nextMarker.openPopup();

    nextMarker.on('dragend', async () => {
      const newPosition = nextMarker.getLatLng();
      const newAddress = await reverseGeocode(newPosition.lat, newPosition.lng);
      const updatedPopupText = `Lokasi Kamu Disini: ${newAddress}`;
      nextMarker.setPopupContent(updatedPopupText);
      nextMarker.openPopup();
      syncMainAddressFieldWithDetectedAddress(newAddress);

      if (latitudeField) latitudeField.value = Number(newPosition.lat).toFixed(6);
      if (longitudeField) longitudeField.value = Number(newPosition.lng).toFixed(6);
    });

    locationMarker = nextMarker;
  }

  syncMainAddressFieldWithDetectedAddress(detectedAddress);
}

function lockAddressDetailField() {
  if (!addressDetailField) return;
  addressDetailField.setAttribute('readonly', 'readonly');
  addressDetailField.setAttribute('aria-readonly', 'true');
}

function unlockAddressDetailField() {
  if (!addressDetailField) return;
  addressDetailField.removeAttribute('readonly');
  addressDetailField.setAttribute('aria-readonly', 'false');
  addressDetailField.focus();
}

function handleSaveAddressDetail() {
  if (!addressDetailField) return;
  const manualText = addressDetailField.value.trim();

  if (!manualText) {
    showToast('Isi detail alamat lengkap terlebih dahulu sebelum menyimpan.');
    unlockAddressDetailField();
    detailAddressSaved = false;
    return;
  }

  const baseAddress = (addressField ? addressField.value : '').trim();
  const baseAddressClean = baseAddress.split(' _ ')[0] || baseAddress;
  const syncedAddress = buildFullAddress(baseAddressClean, manualText);

  if (addressField) {
    addressField.value = '';
    addressField.value = syncedAddress;
  }

  detailAddressSaved = true;
  lockAddressDetailField();
  showToast('Detail alamat lengkap berhasil disimpan.');
}

function handleEditAddressDetail() {
  detailAddressSaved = false;
  unlockAddressDetailField();
  showToast('Silakan edit detail alamat lengkap Anda.');
}

function handleAddressDetailInput() {
  if (!addressDetailField) return;
  const value = addressDetailField.value.trim();

  if (value && !addressDetailField.readOnly) {
    detailAddressSaved = false;
  }
}

function handleDetectLocation() {
  if (!navigator.geolocation) {
    alert('Perangkat Anda tidak mendukung deteksi lokasi. Silakan aktifkan layanan GPS/lokasi di perangkat Anda terlebih dahulu.');
    return;
  }

  if (map && locationMarker && map.hasLayer(locationMarker)) {
    map.removeLayer(locationMarker);
  }

  gpsLocationReady = false;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const formattedAddress = await reverseGeocode(latitude, longitude);
      gpsLocationReady = true;
      updateLocationFields(latitude, longitude, formattedAddress);
      showToast('Lokasi terkini berhasil dideteksi.');
    },
    (error) => {
      gpsLocationReady = false;
      let message = 'Layanan lokasi perangkat tidak aktif atau izin lokasi ditolak. Silakan aktifkan GPS/Layanan Lokasi pada pengaturan perangkat Anda lalu coba lagi.';

      if (error.code === 1) {
        message = 'Akses lokasi ditolak. Silakan izinkan penggunaan lokasi pada perangkat Anda agar alamat dapat terisi otomatis.';
      } else if (error.code === 2) {
        message = 'Sinyal lokasi tidak tersedia saat ini. Silakan aktifkan GPS atau pindah ke area dengan sinyal yang lebih baik, lalu coba lagi.';
      } else if (error.code === 3) {
        message = 'Waktu deteksi lokasi habis. Silakan aktifkan layanan lokasi dan coba lagi.';
      }

      alert(message);
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    }
  );
}

function handleProfilePhotoChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > MAX_PROFILE_IMAGE_SIZE) {
    alert('Ukuran foto profil maksimal 5 MB.');
    event.target.value = '';
    profileImageBase64 = '';
    if (fotoProfilPreview) { fotoProfilPreview.hidden = true; fotoProfilPreview.removeAttribute('src'); }
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    profileImageBase64 = String(reader.result || '');
    if (fotoProfilPreview) { fotoProfilPreview.src = profileImageBase64; fotoProfilPreview.hidden = false; }
  };
  reader.onerror = () => { alert('Foto profil gagal dibaca.'); event.target.value = ''; };
  reader.readAsDataURL(file);
}
const usernameField = document.getElementById('username');

function generateUsername(fullName) {
  const base = String(fullName || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '');
  if (!base) return '';
  const bytes = new Uint8Array(3);
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
  else bytes.forEach((value, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  const suffix = Array.from(bytes).map((byte) => byte.toString(36).toUpperCase().padStart(2, '0')).join('').slice(0, 4);
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}${suffix}`;
}

function updateGeneratedUsername() {
  if (usernameField) usernameField.value = generateUsername(document.getElementById('full-name').value);
}

// Session Override Guard - Force cleanup of old session before new registration
function forceCleanupOldSession() {
  const currentUser = window.getActiveUser();
  if (currentUser && currentUser.id) {
    console.log('Session Override Guard: Membersihkan sesi lama user:', currentUser.id);
    // Data lama tetap terikat pada namespace pemiliknya dan tidak terbaca
    // oleh akun baru. Hanya pointer sesi aktif yang perlu diganti.
    localStorage.removeItem(activeUserKey);

    console.log('Session Override Guard: Pembersihan sesi lama selesai');
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
  const { whatsappNumber, contactInfo, ...rest } = user;
  const fallbackPhone = contactInfo && /^[0-9]+$/.test(contactInfo.trim())
    ? normalizePhone(contactInfo)
    : null;

  return {
    ...rest,
    username: user.username || generateUsername(user.fullName || user.name || user.emailAddress),
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

function getPendingProfile() {
  const raw = localStorage.getItem(pendingGoogleKey);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Data pendaftaran tertunda tidak valid.', error);
    localStorage.removeItem(pendingGoogleKey);
    return null;
  }
}

function prefillFromPendingProfile() {
  const profile = getPendingProfile();
  if (!profile) return;

  if (profile.emailAddress) {
    document.getElementById('email-address').value = profile.emailAddress;
  }
  if (profile.fullName) {
    document.getElementById('full-name').value = profile.fullName;
    updateGeneratedUsername();
  }
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

  clearValidationStyles();

  const fullNameField = document.getElementById('full-name');
  const usernameFieldValue = usernameField ? usernameField.value.trim() : '';
  const fullName = fullNameField ? fullNameField.value.trim() : '';
  const username = usernameFieldValue || generateUsername(fullName);
  const phoneNumber = document.getElementById('phone-number').value.trim();
  const emailAddress = document.getElementById('email-address').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const locationAddress = addressField ? addressField.value.trim() : '';
  const latitude = latitudeField ? latitudeField.value.trim() : '';
  const longitude = longitudeField ? longitudeField.value.trim() : '';
  const manualAddress = addressDetailField ? addressDetailField.value.trim() : '';
  // Kolom alamat utama sudah memuat gabungan lama setelah detail disimpan.
  // Gunakan hanya bagian GPS dasar agar detail tidak tersimpan dua kali.
  const baseLocationAddress = locationAddress.split(' _ ')[0].trim();
  const finalAddress = buildFullAddress(baseLocationAddress, manualAddress);

  const checks = [
    { condition: !fullName, element: fullNameField, button: null, message: 'Nama Lengkap wajib diisi.' },
    { condition: !username, element: usernameField, button: null, message: 'Username wajib diisi.' },
    { condition: !(profileImageBase64 && profileImageBase64.trim()), element: fotoProfilInput, button: null, message: 'Foto Profil wajib diunggah.' },
    { condition: !phoneNumber || !isValidPhoneNumber(phoneNumber), element: document.getElementById('phone-number'), button: null, message: 'Masukkan nomor telepon yang valid.' },
    { condition: !emailAddress || !isValidEmail(emailAddress), element: document.getElementById('email-address'), button: null, message: 'Masukkan alamat email yang valid.' },
    { condition: !gpsLocationReady || !locationAddress || !latitude || !longitude, element: addressField, button: detectLocationButton, message: 'Alamat wajib diisi melalui tombol Gunakan Lokasi Terkini Saya.' },
    { condition: addressDetailField && !addressDetailField.readOnly && manualAddress && !detailAddressSaved, element: addressDetailField, button: null, message: 'Detail Alamat Lengkap belum disimpan. Klik tombol Simpan terlebih dahulu setelah selesai mengetik alamat lengkap.' },
    { condition: !manualAddress || !detailAddressSaved || !addressDetailField || addressDetailField.readOnly === false, element: addressDetailField, button: null, message: 'Detail Alamat Lengkap wajib diisi dan disimpan terlebih dahulu.' },
    { condition: !password || password.length < 6, element: document.getElementById('password'), button: null, message: 'Kata sandi minimal 6 karakter.' },
    { condition: !confirmPassword || password !== confirmPassword, element: document.getElementById('confirm-password'), button: null, message: 'Kata sandi dan konfirmasi kata sandi tidak cocok.' }
  ];

  const invalidCheck = checks.find((check) => check.condition);
  if (invalidCheck) {
    applyInvalidState(invalidCheck.element, invalidCheck.button);
    if (invalidCheck.element && invalidCheck.element.closest && invalidCheck.element.closest('.manual-address-box')) {
      invalidCheck.element.closest('.manual-address-box').classList.add('field-error');
    }
    if (invalidCheck.element) {
      focusFirstInvalid(invalidCheck.element, invalidCheck.button);
    }
    showToast(invalidCheck.message);
    return;
  }

  if (addressField) {
    addressField.value = finalAddress;
  }

  if (addressDetailField && !addressDetailField.readOnly) {
    const manualValue = addressDetailField.value.trim();
    if (manualValue) {
      addressField.value = buildFullAddress(baseLocationAddress, manualValue);
    }
  }

  // Session Override Guard - Force cleanup old session before new registration
  forceCleanupOldSession();

  const users = getRegisteredUsers();
  const pendingProfile = getPendingProfile();
  const matchesPendingEmail = Boolean(
    pendingProfile &&
    pendingProfile.emailAddress &&
    pendingProfile.emailAddress.toLowerCase() === emailAddress.toLowerCase()
  );

  const newUserId = `USER-${Date.now()}`;
  const newUser = {
    id: newUserId,
    userId: newUserId,
    fullName,
    username,
    profileImage: profileImageBase64 || null,
    phoneNumber: normalizePhone(phoneNumber),
    emailAddress: emailAddress.toLowerCase(),
    password,
    address: finalAddress || locationAddress,
    latitude: Number(latitude),
    longitude: Number(longitude),
    avatarUrl: matchesPendingEmail ? pendingProfile.avatarUrl || null : null,
    authProvider: matchesPendingEmail ? pendingProfile.authProvider || 'email' : 'email'
  };

  users.push(newUser);
  saveRegisteredUsers(users);
  syncUserAddressRecord(newUser.address, newUser.latitude, newUser.longitude);
  saveActiveUser({
    id: newUser.id,
    userId: newUser.userId,
    fullName: newUser.fullName,
    username: newUser.username,
    profileImage: newUser.profileImage,
    phoneNumber: newUser.phoneNumber,
    emailAddress: newUser.emailAddress,
    address: newUser.address,
    latitude: newUser.latitude,
    longitude: newUser.longitude,
    avatarUrl: newUser.avatarUrl,
    authProvider: newUser.authProvider,
    loggedAt: new Date().toISOString()
  });
  localStorage.removeItem(pendingGoogleKey);

  showToast('Pendaftaran berhasil! Anda langsung masuk dan diarahkan ke beranda...');

  window.setTimeout(() => {
    window.location.href = 'index.html';
  }, 1800);
}

window.addEventListener('DOMContentLoaded', () => {
  redirectIfLoggedIn();
  prefillFromPendingProfile();
  initializeMap();
  updateGeneratedUsername();

  const fullNameField = document.getElementById('full-name');
  if (fullNameField) fullNameField.addEventListener('input', updateGeneratedUsername);
  if (fotoProfilInput) fotoProfilInput.addEventListener('change', handleProfilePhotoChange);
  if (detectLocationButton) detectLocationButton.addEventListener('click', handleDetectLocation);
  if (saveAddressDetailButton) saveAddressDetailButton.addEventListener('click', handleSaveAddressDetail);
  if (editAddressDetailButton) editAddressDetailButton.addEventListener('click', handleEditAddressDetail);
  if (addressDetailField) addressDetailField.addEventListener('input', handleAddressDetailInput);

  if (addressField) {
    addressField.setAttribute('readonly', 'readonly');
    addressField.setAttribute('aria-readonly', 'true');
  }

  if (addressDetailField) {
    addressDetailField.removeAttribute('readonly');
    addressDetailField.setAttribute('aria-readonly', 'false');
  }
});

if (registerForm) {
  registerForm.addEventListener('submit', handleRegister);
}
