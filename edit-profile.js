'use strict';

const profileForm = document.getElementById('edit-profile-form');
const fullNameField = document.getElementById('full-name');
const phoneField = document.getElementById('phone-number');
const genderField = document.getElementById('gender');
const birthDateField = document.getElementById('birth-date');
const usernameField = document.getElementById('username');
const emailField = document.getElementById('email-address');
const photoField = document.getElementById('profile-photo');
const photoPreview = document.getElementById('photo-preview');
const photoInitials = document.getElementById('photo-initials');
const removePhotoButton = document.getElementById('remove-photo');
const savePhotoButton = document.getElementById('save-profile-photo');
const editPhotoButton = document.getElementById('edit-profile-photo');
const addressField = document.getElementById('address');
const baseAddressField = document.getElementById('address-base');
const addressDetailField = document.getElementById('address-detail');
const saveAddressDetailButton = document.getElementById('save-address-detail');
const editAddressDetailButton = document.getElementById('edit-address-detail');
const latitudeField = document.getElementById('latitude');
const longitudeField = document.getElementById('longitude');
const coordinatesField = document.getElementById('address-coordinates');
const detectLocationButton = document.getElementById('detect-location');
const saveButton = document.getElementById('save-profile');

const USERS_KEY = 'dikyRegisteredUsers';
const ACTIVE_USER_KEY = 'dikyActiveUser';
const USED_IDENTITIES_KEY = 'dikyUsedIdentities';
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
let registeredUser = null;
let activeUser = null;
let stagedUsername = '';
let profileImageValue = null;
let profileImageChanged = false;
let profileImageReadPending = false;
let initialProfileImageValue = null;
let savedProfileImageValue = null;
let photoNeedsSave = false;
let photoEditing = false;
let fieldControlStates = [];
let map = null;
let locationMarker = null;
let geocodeRequestId = 0;
let savedAddressDetail = '';
let addressDetailNeedsSave = false;
let initialAddressBase = '';
let initialAddressDetail = '';
let initialLatitude = '';
let initialLongitude = '';
let locationGeocodePending = false;

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getIdentityPhone(identity) {
  return normalizePhone(identity && (identity.phone || identity.phoneNumber || identity.whatsappNumber));
}

function getIdentityEmail(identity) {
  return normalizeEmail(identity && (identity.email || identity.emailAddress));
}

function buildInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'WS';
}

function generateUsername(fullName) {
  const base = String(fullName || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '');
  if (!base) return '';
  const bytes = new Uint8Array(3);
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
  else bytes.forEach((value, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  const suffix = Array.from(bytes).map((byte) => byte.toString(36).toUpperCase().padStart(2, '0')).join('').slice(0, 4);
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}${suffix}`;
}

function setProfileImage(image) {
  if (image) {
    photoPreview.src = image;
    photoPreview.hidden = false;
    photoInitials.hidden = true;
    return;
  }
  photoPreview.hidden = true;
  photoPreview.removeAttribute('src');
  photoInitials.hidden = false;
}

function splitStoredAddress(value) {
  const parts = String(value || '').split(' _ ');
  if (parts.length < 2) return { base: parts[0] || '', detail: '' };
  return { base: parts.shift().trim(), detail: parts.join(' _ ').trim() };
}

function buildFullAddress(base, detail) {
  return [String(base || '').trim(), String(detail || '').trim()].filter(Boolean).join(' _ ');
}

function syncCombinedAddress() {
  addressField.value = buildFullAddress(baseAddressField.value, savedAddressDetail);
}

function normalizeCoordinate(value) {
  if (String(value || '').trim() === '') return '';
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate.toFixed(6) : '';
}

function hasLocationChanged() {
  return baseAddressField.value.trim() !== initialAddressBase
    || normalizeCoordinate(latitudeField.value) !== initialLatitude
    || normalizeCoordinate(longitudeField.value) !== initialLongitude;
}

function focusLocationSection() {
  document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  detectLocationButton.focus({ preventScroll: true });
}

function validatePairedAddressChanges() {
  const detailChanged = savedAddressDetail !== initialAddressDetail;
  const locationChanged = hasLocationChanged();
  if (detailChanged && !locationChanged) {
    window.alert('Detail Alamat Lengkap sudah berubah. Perbarui juga Alamat dari Lokasi dengan GPS atau pilih/geser titik pada peta sebelum menyimpan perubahan.');
    focusLocationSection();
    return false;
  }
  if (locationChanged && !detailChanged) {
    window.alert('Alamat dari Lokasi sudah berubah. Edit dan simpan Detail Alamat Lengkap sebelum menyimpan perubahan.');
    handleEditAddressDetail();
    addressDetailField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    addressDetailField.focus({ preventScroll: true });
    return false;
  }
  return true;
}

function setAddressDetailLocked(locked) {
  addressDetailField.readOnly = locked;
  addressDetailField.setAttribute('aria-readonly', String(locked));
  editAddressDetailButton.disabled = !locked;
  saveAddressDetailButton.disabled = locked || !addressDetailNeedsSave;
}

function updateAddressMarkerPopup(address, open = false) {
  if (!locationMarker) return;
  const popupContent = document.createElement('span');
  popupContent.textContent = `Alamat Kamu Disini: ${address || 'Alamat belum tersedia'}`;
  locationMarker.setPopupContent(popupContent);
  if (open) locationMarker.openPopup();
}

function handleEditAddressDetail() {
  addressDetailNeedsSave = false;
  setAddressDetailLocked(false);
  addressDetailField.focus();
}

function handleAddressDetailInput() {
  addressDetailNeedsSave = addressDetailField.value.trim() !== savedAddressDetail;
  saveAddressDetailButton.disabled = !addressDetailNeedsSave;
}

function handleSaveAddressDetail() {
  const newDetail = addressDetailField.value.trim();
  if (!newDetail) {
    addressDetailField.classList.add('field-error');
    addressDetailField.focus();
    window.alert('Detail alamat lengkap wajib diisi sebelum disimpan.');
    return;
  }

  savedAddressDetail = newDetail;
  addressDetailNeedsSave = false;
  addressDetailField.value = newDetail;
  addressDetailField.classList.remove('field-error');
  setAddressDetailLocked(true);
  syncCombinedAddress();
}

function renderCoordinates() {
  if (!latitudeField.value || !longitudeField.value) {
    coordinatesField.textContent = 'Koordinat: belum tersimpan';
    return;
  }
  coordinatesField.textContent = `Koordinat: ${latitudeField.value}, ${longitudeField.value}`;
}

function showLoadError(message) {
  window.alert(message);
  window.location.replace('login.html');
}

function loadUserProfile() {
  if (typeof window.getActiveUser !== 'function' || !window.isValidSession()) {
    showLoadError('Sesi tidak valid. Silakan login kembali.');
    return false;
  }

  activeUser = window.getActiveUser();
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    if (!Array.isArray(users)) throw new Error('Format data akun tidak valid.');
    registeredUser = users.find((user) => user && String(user.id) === String(activeUser.id)) || null;
  } catch (error) {
    showLoadError('Data akun tidak dapat dibaca. Silakan login kembali.');
    return false;
  }

  if (!registeredUser) {
    showLoadError('Akun tidak ditemukan. Silakan login kembali.');
    return false;
  }

  fullNameField.value = registeredUser.fullName || registeredUser.name || activeUser.fullName || '';
  phoneField.value = registeredUser.phoneNumber || registeredUser.whatsappNumber || activeUser.phoneNumber || '';
  genderField.value = registeredUser.gender || activeUser.gender || '';
  birthDateField.value = registeredUser.birthDate || activeUser.birthDate || '';
  usernameField.value = registeredUser.username || activeUser.username || '';
  stagedUsername = usernameField.value;
  emailField.value = registeredUser.emailAddress || registeredUser.email || activeUser.emailAddress || '';

  const storedAddress = splitStoredAddress(registeredUser.address || activeUser.address || '');
  baseAddressField.value = storedAddress.base;
  addressDetailField.value = storedAddress.detail;
  savedAddressDetail = storedAddress.detail;
  initialAddressBase = storedAddress.base.trim();
  initialAddressDetail = storedAddress.detail.trim();
  addressDetailNeedsSave = false;
  setAddressDetailLocked(true);
  latitudeField.value = registeredUser.latitude ?? activeUser.latitude ?? '';
  longitudeField.value = registeredUser.longitude ?? activeUser.longitude ?? '';
  initialLatitude = normalizeCoordinate(latitudeField.value);
  initialLongitude = normalizeCoordinate(longitudeField.value);
  syncCombinedAddress();
  renderCoordinates();

  profileImageValue = registeredUser.profileImage || registeredUser.avatarUrl || activeUser.profileImage || activeUser.avatarUrl || null;
  initialProfileImageValue = profileImageValue;
  savedProfileImageValue = profileImageValue;
  profileImageChanged = false;
  photoInitials.textContent = buildInitials(fullNameField.value);
  setProfileImage(profileImageValue);
  fullNameField.addEventListener('input', () => {
    if (!profileImageValue) photoInitials.textContent = buildInitials(fullNameField.value);
  });

  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  birthDateField.max = localToday;
  return true;
}

function reverseGeocode(latitude, longitude) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  return fetch(url.toString(), {
    headers: { Accept: 'application/json', 'Accept-Language': 'id' },
    mode: 'cors',
    credentials: 'omit'
  }).then((response) => {
    if (!response.ok) throw new Error('Pencarian alamat gagal.');
    return response.json();
  }).then((data) => {
    const address = data.address || {};
    const parts = [
      address.road || address.footway || address.path,
      address.village || address.suburb || address.hamlet || address.city_district || address.district,
      address.city || address.town || address.municipality,
      address.state || address.province,
      address.country
    ].filter(Boolean);
    return parts.join(', ') || `Koordinat: ${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
  });
}

function attachMarkerEvents(marker) {
  marker.on('dragend', () => {
    const position = marker.getLatLng();
    setLocation(position.lat, position.lng);
  });
}

async function setLocation(latitude, longitude, address = '') {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

  latitudeField.value = lat.toFixed(6);
  longitudeField.value = lng.toFixed(6);
  renderCoordinates();
  const requestId = ++geocodeRequestId;

  baseAddressField.value = address || `Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  syncCombinedAddress();

  if (map && window.L) {
    const point = [lat, lng];
    map.setView(point, 16, { animate: true });
    if (locationMarker) locationMarker.setLatLng(point);
    else {
      locationMarker = window.L.marker(point, { draggable: true }).addTo(map);
      locationMarker.bindPopup('Lokasi alamat Anda');
      attachMarkerEvents(locationMarker);
    }
    updateAddressMarkerPopup(baseAddressField.value || `Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, true);
  }

  if (address) {
    locationGeocodePending = false;
    return;
  }
  locationGeocodePending = true;
  try {
    const formattedAddress = await reverseGeocode(lat, lng);
    if (requestId !== geocodeRequestId) return;
    baseAddressField.value = formattedAddress;
  } catch (error) {
    if (requestId !== geocodeRequestId) return;
    baseAddressField.value = `Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } finally {
    if (requestId === geocodeRequestId) locationGeocodePending = false;
  }
  syncCombinedAddress();
  if (locationMarker) locationMarker.setPopupContent(`Lokasi alamat Anda: ${baseAddressField.value}`);
}

function initializeMap() {
  if (!document.getElementById('map') || !window.L) return;

  const latitude = Number(latitudeField.value);
  const longitude = Number(longitudeField.value);
  const hasSavedCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitudeField.value !== '' && longitudeField.value !== '';
  const initialPoint = hasSavedCoordinates ? [latitude, longitude] : [-6.2088, 106.8456];

  map = window.L.map('map', {
    scrollWheelZoom: true,
    touchZoom: true
  }).setView(initialPoint, hasSavedCoordinates ? 15 : 12);
  map.getContainer().addEventListener('wheel', (event) => {
    event.preventDefault();
  }, { passive: false });
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    crossOrigin: true
  }).addTo(map);

  if (hasSavedCoordinates) {
    locationMarker = window.L.marker(initialPoint, { draggable: true }).addTo(map);
    locationMarker.bindPopup('');
    updateAddressMarkerPopup(baseAddressField.value || `Koordinat: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, true);
    attachMarkerEvents(locationMarker);
  }

  map.on('click', (event) => {
    setLocation(event.latlng.lat, event.latlng.lng);
  });
  window.setTimeout(() => map.invalidateSize(), 100);
}

function handleDetectLocation() {
  if (!navigator.geolocation) {
    window.alert('Perangkat ini tidak mendukung deteksi lokasi.');
    return;
  }

  detectLocationButton.disabled = true;
  detectLocationButton.textContent = 'Mendeteksi Lokasi...';
  navigator.geolocation.getCurrentPosition((position) => {
    setLocation(position.coords.latitude, position.coords.longitude).finally(() => {
      detectLocationButton.disabled = false;
      detectLocationButton.textContent = 'Gunakan Lokasi Terkini';
    });
  }, (error) => {
    const message = error.code === 1
      ? 'Izin lokasi ditolak. Periksa pengaturan izin lokasi browser Anda.'
      : 'Lokasi tidak berhasil dideteksi. Silakan coba lagi.';
    window.alert(message);
    detectLocationButton.disabled = false;
    detectLocationButton.textContent = 'Gunakan Lokasi Terkini';
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

function handlePhotoSelection(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    window.alert('Pilih file gambar yang valid.');
    photoField.value = '';
    return;
  }
  if (file.size > MAX_PROFILE_IMAGE_SIZE) {
    window.alert('Ukuran foto profil maksimal 5 MB.');
    photoField.value = '';
    return;
  }

  profileImageReadPending = true;
  const reader = new FileReader();
  reader.onload = () => {
    const source = String(reader.result || '');
    const compress = typeof window.compressProfileImageDataUrl === 'function'
      ? window.compressProfileImageDataUrl(source)
      : Promise.resolve(source);
    compress.then((compressedImage) => {
      if (!compressedImage) throw new Error('Foto tidak dapat diperkecil.');
      profileImageValue = compressedImage;
      setProfileImage(profileImageValue);
      updatePhotoDirtyState();
    }).catch(() => {
      photoField.value = '';
      window.alert('Foto profil gagal diproses. Pilih foto lain atau lanjut tanpa foto.');
    }).finally(() => {
      profileImageReadPending = false;
      updatePhotoDirtyState();
    });
  };
  reader.onerror = () => {
    profileImageReadPending = false;
    photoField.value = '';
    updatePhotoDirtyState();
    window.alert('Foto profil gagal dibaca.');
  };
  updatePhotoDirtyState();
  reader.readAsDataURL(file);
}

function hasArchivedPhoneConflict(userId, currentPhone, currentEmail, newPhone) {
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index);
    if (!storageKey || (!storageKey.startsWith('dikyOrders_') && !storageKey.startsWith('dikyHutang_'))) continue;

    let records;
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      records = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    } catch (error) {
      continue;
    }

    const keyOwnerId = storageKey.startsWith('dikyOrders_')
      ? storageKey.slice('dikyOrders_'.length)
      : storageKey.slice('dikyHutang_'.length);
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      const customer = record.customer && typeof record.customer === 'object' ? record.customer : {};
      const archivedPhone = normalizePhone(record.phone || record.phoneNumber || customer.phone || customer.phoneNumber);
      if (archivedPhone !== newPhone) continue;

      const archivedEmail = normalizeEmail(record.email || record.emailAddress || customer.email || customer.emailAddress);
      const archivedOwnerId = record.userId || customer.userId || keyOwnerId;
      const belongsToCurrentUser = String(archivedOwnerId) === String(userId)
        || (!record.userId && !customer.userId && archivedEmail && archivedEmail === currentEmail)
        || (!record.userId && !customer.userId && currentPhone && archivedPhone === currentPhone);
      if (!belongsToCurrentUser) return true;
    }
  }
  return false;
}

function buildUpdatedIdentities(userId, currentPhone, newPhone, currentEmail) {
  let identities;
  try {
    const raw = localStorage.getItem(USED_IDENTITIES_KEY);
    identities = raw === null ? [] : JSON.parse(raw);
  } catch (error) {
    throw new Error('Daftar identitas tersimpan tidak dapat dibaca. Perubahan belum disimpan.');
  }
  if (!Array.isArray(identities)) {
    throw new Error('Format daftar identitas tersimpan tidak valid. Perubahan belum disimpan.');
  }

  const belongsToUser = (identity) => {
    if (identity.userId != null && String(identity.userId) !== '') {
      return String(identity.userId) === String(userId);
    }
    const identityPhone = getIdentityPhone(identity);
    const identityEmail = getIdentityEmail(identity);
    return (currentEmail && identityEmail === currentEmail) || (currentPhone && identityPhone === currentPhone);
  };
  const conflictingIdentity = identities.find((identity) => {
    if (!identity || typeof identity !== 'object' || belongsToUser(identity)) return false;
    return getIdentityPhone(identity) === newPhone;
  });
  if (conflictingIdentity) {
    throw new Error('Nomor telepon tersebut pernah tercatat pada identitas lain. Gunakan nomor yang berbeda.');
  }
  if (hasArchivedPhoneConflict(userId, currentPhone, currentEmail, newPhone)) {
    throw new Error('Nomor telepon tersebut tercatat pada transaksi akun lain. Gunakan nomor yang berbeda.');
  }

  const updated = identities.map((identity) => {
    if (!identity || typeof identity !== 'object' || !belongsToUser(identity)) return identity;
    return identity.userId ? identity : { ...identity, userId: String(userId) };
  });
  const exactIdentityExists = updated.some((identity) => identity && typeof identity === 'object'
    && String(identity.userId || '') === String(userId)
    && getIdentityPhone(identity) === newPhone
    && getIdentityEmail(identity) === currentEmail);
  if (!exactIdentityExists) {
    updated.push({ userId: String(userId), phone: newPhone, email: currentEmail || null, usedAt: new Date().toISOString() });
  }
  return updated;
}

function restoreStorageValue(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) { }
}

function validateForm() {
  document.querySelectorAll('.field-error').forEach((field) => field.classList.remove('field-error'));
  const fullName = fullNameField.value.trim();
  const phoneNumber = normalizePhone(phoneField.value);
  const birthDate = birthDateField.value;
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const checks = [
    { valid: Boolean(fullName), field: fullNameField, message: 'Nama lengkap wajib diisi.' },
    { valid: /^[0-9]{10,15}$/.test(phoneNumber), field: phoneField, message: 'Nomor telepon harus terdiri dari 10 sampai 15 angka.' },
    { valid: Boolean(genderField.value), field: genderField, message: 'Pilih jenis kelamin.' },
    { valid: Boolean(birthDate) && birthDate <= localToday, field: birthDateField, message: 'Masukkan tanggal lahir yang valid dan tidak melebihi hari ini.' }
  ];
  const invalid = checks.find((check) => !check.valid);
  if (invalid) {
    invalid.field.classList.add('field-error');
    invalid.field.focus();
    window.alert(invalid.message);
    return null;
  }
  if (profileImageReadPending) {
    window.alert('Tunggu sampai foto profil selesai diproses.');
    return null;
  }
  return { fullName, phoneNumber, birthDate };
}

async function handleSaveProfile(event) {
  event.preventDefault();
  const pendingField = fieldControlStates.find((state) => state.hasUnsavedChanges());
  if (pendingField) {
    pendingField.focus();
    window.alert('Klik tombol Simpan pada kolom biodata yang masih berubah terlebih dahulu.');
    return;
  }
  if (photoNeedsSave || profileImageReadPending) {
    editPhotoButton.focus();
    window.alert('Klik tombol Simpan pada Foto Profil terlebih dahulu setelah selesai memilih foto.');
    return;
  }
  if (addressDetailNeedsSave) {
    addressDetailField.classList.add('field-error');
    addressDetailField.focus();
    window.alert('Klik tombol Simpan pada Detail Alamat Lengkap terlebih dahulu sebelum menyimpan perubahan biodata.');
    return;
  }
  if (locationGeocodePending) {
    window.alert('Tunggu sampai alamat dari lokasi selesai diperbarui sebelum menyimpan perubahan.');
    focusLocationSection();
    return;
  }
  if (!validatePairedAddressChanges()) return;

  const values = validateForm();
  if (!values) return;

  if (typeof profileImageValue === 'string' && profileImageValue.startsWith('data:image/')) {
    const compactImage = typeof window.compressProfileImageDataUrl === 'function'
      ? await window.compressProfileImageDataUrl(profileImageValue)
      : profileImageValue;
    if (!compactImage) {
      window.alert('Foto profil tidak dapat diperkecil. Coba pilih foto yang lain atau hapus foto tersebut.');
      editPhotoButton.focus();
      return;
    }
    if (compactImage !== profileImageValue) {
      profileImageValue = compactImage;
      profileImageChanged = true;
      setProfileImage(profileImageValue);
    }
  }

  const currentEmail = normalizeEmail(registeredUser.emailAddress || registeredUser.email || activeUser.emailAddress);
  const currentPhone = normalizePhone(registeredUser.phoneNumber || registeredUser.whatsappNumber || activeUser.phoneNumber);
  const phoneChanged = values.phoneNumber !== currentPhone;
  let users;
  try {
    users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch (error) {
    window.alert('Data akun tidak dapat dibaca. Perubahan belum disimpan.');
    return;
  }
  if (!Array.isArray(users)) {
    window.alert('Format data akun tidak valid. Perubahan belum disimpan.');
    return;
  }

  const accountIndex = users.findIndex((user) => user && String(user.id) === String(activeUser.id));
  if (accountIndex < 0) {
    window.alert('Akun tidak lagi terdaftar. Silakan login kembali.');
    window.location.replace('login.html');
    return;
  }

  const duplicateUser = users.find((user) => user && String(user.id) !== String(activeUser.id)
    && normalizePhone(user.phoneNumber || user.whatsappNumber) === values.phoneNumber);
  if (duplicateUser) {
    phoneField.classList.add('field-error');
    phoneField.focus();
    window.alert('Nomor telepon tersebut sudah digunakan oleh akun lain.');
    return;
  }

  let updatedIdentities = null;
  if (phoneChanged) {
    try {
      updatedIdentities = buildUpdatedIdentities(activeUser.id, currentPhone, values.phoneNumber, currentEmail);
    } catch (error) {
      phoneField.classList.add('field-error');
      phoneField.focus();
      window.alert(error.message);
      return;
    }
  }

  const fullAddress = buildFullAddress(baseAddressField.value, savedAddressDetail);
  const updatedAccount = {
    ...users[accountIndex],
    fullName: values.fullName,
    name: values.fullName,
    username: stagedUsername,
    phoneNumber: values.phoneNumber,
    gender: genderField.value,
    birthDate: values.birthDate,
    address: fullAddress
  };
  if (profileImageChanged) {
    updatedAccount.profileImage = profileImageValue;
    updatedAccount.avatarUrl = profileImageValue;
  }
  if (latitudeField.value !== '') updatedAccount.latitude = Number(latitudeField.value);
  else delete updatedAccount.latitude;
  if (longitudeField.value !== '') updatedAccount.longitude = Number(longitudeField.value);
  else delete updatedAccount.longitude;

  const updatedUsers = users.slice();
  updatedUsers[accountIndex] = updatedAccount;
  const updatedSession = {
    ...activeUser,
    fullName: values.fullName,
    name: values.fullName,
    username: stagedUsername,
    phoneNumber: values.phoneNumber,
    gender: genderField.value,
    birthDate: values.birthDate,
    address: fullAddress
  };
  delete updatedSession.profileImage;
  delete updatedSession.avatarUrl;
  if (latitudeField.value !== '') updatedSession.latitude = Number(latitudeField.value);
  else delete updatedSession.latitude;
  if (longitudeField.value !== '') updatedSession.longitude = Number(longitudeField.value);
  else delete updatedSession.longitude;

  const storageKeys = [USERS_KEY, ACTIVE_USER_KEY];
  if (updatedIdentities) storageKeys.push(USED_IDENTITIES_KEY);
  const previousValues = Object.fromEntries(storageKeys.map((key) => [key, localStorage.getItem(key)]));

  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(updatedUsers));
    if (updatedIdentities) localStorage.setItem(USED_IDENTITIES_KEY, JSON.stringify(updatedIdentities));
    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(updatedSession));
  } catch (error) {
    storageKeys.forEach((key) => restoreStorageValue(key, previousValues[key]));
    window.alert('Perubahan gagal disimpan. Penyimpanan browser mungkin penuh. Data sebelumnya telah dipulihkan bila memungkinkan.');
    return;
  }

  window.alert('Biodata berhasil diperbarui.');
  window.location.replace('profile.html');
}

if (loadUserProfile()) {
  initializeProfileFieldControls();
  setPhotoEditing(false);
  initializeMap();
  detectLocationButton.addEventListener('click', handleDetectLocation);
  addressDetailField.addEventListener('input', handleAddressDetailInput);
  saveAddressDetailButton.addEventListener('click', handleSaveAddressDetail);
  editAddressDetailButton.addEventListener('click', handleEditAddressDetail);
  photoField.addEventListener('change', handlePhotoSelection);
  editPhotoButton.addEventListener('click', () => setPhotoEditing(true));
  savePhotoButton.addEventListener('click', savePhotoChanges);
  removePhotoButton.addEventListener('click', () => {
    profileImageValue = null;
    photoField.value = '';
    setProfileImage(null);
    updatePhotoDirtyState();
  });
  profileForm.addEventListener('submit', handleSaveProfile);
}

function createStagedFieldControl({ field, editButton, saveButton, setLocked, normalize = (value) => value, validate = () => '', onSave = () => {} }) {
  const container = field.closest('.profile-edit-group');
  let savedValue = normalize(field.value);
  let needsSave = false;
  let locked = true;

  const updateState = () => {
    needsSave = normalize(field.value) !== savedValue;
    saveButton.disabled = locked || !needsSave;
  };

  const setMode = (shouldLock) => {
    locked = shouldLock;
    setLocked(shouldLock);
    container.dataset.editing = String(!shouldLock);
    editButton.disabled = !shouldLock;
    saveButton.disabled = shouldLock || !needsSave;
  };

  editButton.addEventListener('click', () => {
    setMode(false);
    field.focus();
  });

  field.addEventListener('input', updateState);
  field.addEventListener('change', updateState);

  saveButton.addEventListener('click', () => {
    const errorMessage = validate(field.value);
    if (errorMessage) {
      field.classList.add('field-error');
      field.focus();
      window.alert(errorMessage);
      return;
    }
    savedValue = normalize(field.value);
    field.value = savedValue;
    field.classList.remove('field-error');
    onSave(savedValue);
    needsSave = false;
    setMode(true);
  });

  setMode(true);
  updateState();
  return { hasUnsavedChanges: () => needsSave, focus: () => field.focus() };
}

function validatePhoneChange(value) {
  const normalizedPhone = normalizePhone(value);
  if (!/^[0-9]{10,15}$/.test(normalizedPhone)) {
    return 'Nomor telepon harus terdiri dari 10 sampai 15 angka.';
  }

  const currentPhone = normalizePhone(registeredUser.phoneNumber || registeredUser.whatsappNumber || activeUser.phoneNumber);
  if (normalizedPhone === currentPhone) return '';

  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  if (!Array.isArray(users)) return 'Data akun tidak valid. Nomor telepon belum dapat diperiksa.';
  const duplicate = users.some((user) => user && String(user.id) !== String(activeUser.id)
    && normalizePhone(user.phoneNumber || user.whatsappNumber) === normalizedPhone);
  if (duplicate) return 'Nomor telepon tersebut sudah digunakan oleh akun lain.';

  const currentEmail = normalizeEmail(registeredUser.emailAddress || registeredUser.email || activeUser.emailAddress);
  try {
    buildUpdatedIdentities(activeUser.id, currentPhone, normalizedPhone, currentEmail);
  } catch (error) {
    return error.message;
  }
  return '';
}

function initializeProfileFieldControls() {
  fieldControlStates = [
    createStagedFieldControl({
      field: fullNameField,
      editButton: document.getElementById('edit-full-name'),
      saveButton: document.getElementById('save-full-name'),
      setLocked: (locked) => { fullNameField.readOnly = locked; fullNameField.setAttribute('aria-readonly', String(locked)); },
      normalize: (value) => String(value || '').trim(),
      validate: (value) => String(value || '').trim() ? '' : 'Nama lengkap wajib diisi.',
      onSave: (value) => {
        stagedUsername = generateUsername(value);
        usernameField.value = stagedUsername;
      }
    }),
    createStagedFieldControl({
      field: phoneField,
      editButton: document.getElementById('edit-phone-number'),
      saveButton: document.getElementById('save-phone-number'),
      setLocked: (locked) => { phoneField.readOnly = locked; phoneField.setAttribute('aria-readonly', String(locked)); },
      normalize: (value) => normalizePhone(value),
      validate: validatePhoneChange
    }),
    createStagedFieldControl({
      field: genderField,
      editButton: document.getElementById('edit-gender'),
      saveButton: document.getElementById('save-gender'),
      setLocked: (locked) => { genderField.disabled = locked; },
      normalize: (value) => String(value || '').trim(),
      validate: (value) => ['Laki-laki', 'Perempuan'].includes(value) ? '' : 'Pilih jenis kelamin.'
    }),
    createStagedFieldControl({
      field: birthDateField,
      editButton: document.getElementById('edit-birth-date'),
      saveButton: document.getElementById('save-birth-date'),
      setLocked: (locked) => { birthDateField.readOnly = locked; birthDateField.setAttribute('aria-readonly', String(locked)); },
      normalize: (value) => String(value || '').trim(),
      validate: (value) => {
        const today = new Date();
        const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        return value && value <= localToday ? '' : 'Masukkan tanggal lahir yang valid dan tidak melebihi hari ini.';
      }
    })
  ];
}

function setPhotoEditing(shouldEdit) {
  photoEditing = shouldEdit;
  photoField.disabled = !shouldEdit;
  removePhotoButton.disabled = !shouldEdit;
  editPhotoButton.disabled = shouldEdit;
  savePhotoButton.disabled = !shouldEdit || profileImageReadPending || !photoNeedsSave;
  photoField.closest('.photo-field').dataset.editing = String(shouldEdit);
}

function updatePhotoDirtyState() {
  photoNeedsSave = profileImageValue !== savedProfileImageValue;
  savePhotoButton.disabled = !photoEditing || profileImageReadPending || !photoNeedsSave;
}

function savePhotoChanges() {
  if (profileImageReadPending) {
    window.alert('Tunggu sampai foto profil selesai diproses.');
    return;
  }
  savedProfileImageValue = profileImageValue;
  photoNeedsSave = false;
  profileImageChanged = profileImageValue !== initialProfileImageValue;
  photoField.value = '';
  setPhotoEditing(false);
}