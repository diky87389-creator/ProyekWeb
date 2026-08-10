const activeUserKey = 'dikyActiveUser';
const contactForm = document.getElementById('contact-form');
const toast = document.getElementById('contact-toast');

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

function requireLogin() {
  if (!getActiveUser()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 2200);
}

function getFormValues() {
  return {
    name: document.getElementById('contact-name').value.trim(),
    contactInfo: document.getElementById('contact-info').value.trim(),
    message: document.getElementById('contact-message').value.trim()
  };
}

function isValidContact(contactInfo) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigits = contactInfo.replace(/[^0-9]/g, '');
  const phonePattern = /^[0-9]{10,15}$/;
  return emailPattern.test(contactInfo) || phonePattern.test(phoneDigits);
}

function autoFillContactForm() {
  const user = getActiveUser();
  if (!user) return;

  const nameField = document.getElementById('contact-name');
  const contactField = document.getElementById('contact-info');
  const preferredContact = user.phoneNumber || user.emailAddress || user.contactInfo || '';

  if (!nameField.value) {
    nameField.value = user.fullName;
  }
  if (!contactField.value) {
    contactField.value = preferredContact;
  }
}

function buildWhatsappMessage({ name, contactInfo, message }) {
  const lines = [
    'Halo Warung Sayur Diky 👋',
    '',
    'Saya ingin menghubungi Tim Customer Service dengan detail berikut:',
    '',
    `Nama: ${name}`,
    `Kontak: ${contactInfo}`,
    '',
    'Pesan:',
    message || '-',
    '',
    'Terima kasih.'
  ];

  return encodeURIComponent(lines.join('\n'));
}

function handleContactSubmit(event) {
  event.preventDefault();

  const values = getFormValues();
  if (!values.name || !values.contactInfo) {
    showToast('Nama dan kontak harus diisi.');
    return;
  }

  if (!isValidContact(values.contactInfo)) {
    showToast('Masukkan nomor telepon atau email yang valid.');
    return;
  }

  const whatsappUrl = `https://wa.me/6281234567890?text=${buildWhatsappMessage(values)}`;
  showToast('Mengalihkan ke WhatsApp...');
  window.setTimeout(() => {
    window.location.href = whatsappUrl;
  }, 1200);
}

window.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;
  autoFillContactForm();
  contactForm.addEventListener('submit', handleContactSubmit);
});
