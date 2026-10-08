const orderSummaryElement = document.getElementById('order-summary');
const orderTotalElement = document.getElementById('order-total');
const checkoutForm = document.getElementById('checkout-form');
const confirmButton = document.getElementById('confirm-button');
const customerAddressField = document.getElementById('customer-address');
const addressFieldGroup = document.getElementById('address-field-group');
const cancelCheckoutButton = document.getElementById('cancel-checkout-button');
const deliveryMethodInputs = checkoutForm.querySelectorAll('input[name="deliveryMethod"]');

function getCurrentRegisteredUser() {
  const activeUser = typeof window.getActiveUser === 'function' ? window.getActiveUser() : null;
  if (!activeUser || !activeUser.id) return null;

  try {
    const users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
    const matchedUser = Array.isArray(users) ? users.find((user) => String(user.id) === String(activeUser.id)) : null;
    return Object.assign({}, matchedUser || {}, activeUser);
  } catch (error) {
    console.warn('Gagal membaca profil pengguna aktif untuk auto-fill checkout.', error);
    return Object.assign({}, activeUser);
  }
}

function hasValidCheckoutSequence() {
  const checkoutItemsKey = getUserStorageKey('checkoutItems');
  if (!checkoutItemsKey) return false;

  try {
    const raw = localStorage.getItem(checkoutItemsKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch (error) {
    return false;
  }
}

function clearAutoFillCheckoutState() {
  const customerNameField = document.getElementById('customer-name');
  const customerPhoneField = document.getElementById('customer-phone');
  const customerAddressValue = document.getElementById('customer-address');

  if (customerNameField) {
    customerNameField.value = '';
    customerNameField.removeAttribute('readonly');
    customerNameField.removeAttribute('aria-readonly');
    customerNameField.tabIndex = 0;
  }
  if (customerPhoneField) {
    customerPhoneField.value = '';
    customerPhoneField.removeAttribute('readonly');
    customerPhoneField.removeAttribute('aria-readonly');
    customerPhoneField.tabIndex = 0;
  }
  if (customerAddressValue) {
    customerAddressValue.value = '';
    customerAddressValue.removeAttribute('readonly');
    customerAddressValue.removeAttribute('aria-readonly');
    customerAddressValue.tabIndex = 0;
  }

  const checkoutFormKey = getUserStorageKey('checkoutForm');
  if (checkoutFormKey) {
    localStorage.removeItem(checkoutFormKey);
  }
}

function lockCustomerFields() {
  const customerNameField = document.getElementById('customer-name');
  const customerPhoneField = document.getElementById('customer-phone');
  const customerAddressField = document.getElementById('customer-address');

  [customerNameField, customerPhoneField, customerAddressField].forEach((field) => {
    if (!field) return;
    field.setAttribute('readonly', 'readonly');
    field.setAttribute('aria-readonly', 'true');
    field.tabIndex = -1;
  });
}

function unlockCustomerFields() {
  const customerNameField = document.getElementById('customer-name');
  const customerPhoneField = document.getElementById('customer-phone');
  const customerAddressField = document.getElementById('customer-address');

  [customerNameField, customerPhoneField, customerAddressField].forEach((field) => {
    if (!field) return;
    field.removeAttribute('readonly');
    field.removeAttribute('aria-readonly');
    field.tabIndex = 0;
  });
}

function applyAutoFillCheckoutData() {
  const user = getCurrentRegisteredUser();
  if (!user || !hasValidCheckoutSequence()) {
    clearAutoFillCheckoutState();
    return;
  }

  const customerNameField = document.getElementById('customer-name');
  const customerPhoneField = document.getElementById('customer-phone');
  const customerAddressValue = document.getElementById('customer-address');
  if (!customerNameField || !customerPhoneField || !customerAddressValue) return;

  const fullName = user.fullName || user.name || user.username || '';
  const phone = user.phoneNumber || user.whatsappNumber || user.contactInfo || '';
  const address = user.address || '';

  if (!customerNameField.value.trim() && fullName) {
    customerNameField.value = fullName;
  }

  if (!customerPhoneField.value.trim() && phone) {
    customerPhoneField.value = phone;
  }

  if (getSelectedDeliveryMethod() === 'Diantar ke Rumah') {
    if (!customerAddressValue.value.trim() && address) {
      customerAddressValue.value = address;
    }
  } else if (customerAddressValue.value === address) {
    customerAddressValue.value = '';
  }

  lockCustomerFields();
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function requireLogin() {
  if (!isValidSession()) {
    console.warn('requireLogin: Sesi tidak valid, redirect ke login');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function formatPrice(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value);
}

function getCart() {
  const catalog = (() => { try { const data = JSON.parse(localStorage.getItem('dikyProducts') || '[]'); return Array.isArray(data) ? data : []; } catch (error) { return []; } })();
  if (!catalog.length) return [];
  // Checkout HANYA memproses data checkoutItemsKey (pesanan yang sah dikonfirmasi dari keranjang)
  const checkoutItemsKey = getUserStorageKey('checkoutItems');

  if (!checkoutItemsKey) {
    console.warn('getCart: Tidak dapat mengakses checkout items - user tidak valid');
    return [];
  }

  const raw = localStorage.getItem(checkoutItemsKey);
  try {
    const savedItems = typeof normalizeCart === 'function'
      ? normalizeCart(raw ? JSON.parse(raw) : [])
      : (raw ? JSON.parse(raw) : []);
    return savedItems.filter((item) => catalog.some((product) => product.id === item.id));
  } catch (error) {
    console.warn('Data checkout items tidak valid.', error);
    localStorage.removeItem(checkoutItemsKey);
    return [];
  }
}

function renderOrderSummary() {
  const cart = getCart();
  clearElement(orderSummaryElement);

  if (cart.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const heading = document.createElement('h3');
    heading.textContent = 'Keranjang kosong';

    const text = document.createElement('p');
    text.textContent = 'Tambahkan produk dari katalog sebelum melanjutkan ke checkout.';

    emptyState.append(heading, text);
    orderSummaryElement.append(emptyState);
    orderTotalElement.textContent = formatPrice(0);
    confirmButton.disabled = true;
    return;
  }

  let totalPrice = 0;
  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    totalPrice += itemTotal;

    const summaryItem = document.createElement('article');
    summaryItem.className = 'summary-item';

    const itemImage = document.createElement('img');
    itemImage.className = 'summary-item-image';
    itemImage.src = typeof resolveProductImage === 'function' ? resolveProductImage(item) : (item.image || 'images/Toko Sayur Online.png');
    itemImage.alt = item.name;

    const summaryContent = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'summary-item-title';
    title.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'summary-item-meta';

    const quantity = document.createElement('span');
    quantity.textContent = `${item.quantity} x ${formatPrice(item.price)}`;

    const unit = document.createElement('span');
    unit.textContent = item.unit;

    meta.append(quantity, unit);
    summaryContent.append(title, meta);

    const total = document.createElement('div');
    total.className = 'summary-item-total';
    total.textContent = formatPrice(itemTotal);

    summaryItem.append(itemImage, summaryContent, total);
    orderSummaryElement.append(summaryItem);
  });

  orderTotalElement.textContent = formatPrice(totalPrice);
  confirmButton.disabled = false;
  updateSummaryCosts();
}

function getSelectedPaymentMethod() {
  const selected = checkoutForm.querySelector('input[name="paymentMethod"]:checked');
  return selected ? selected.value : 'Tunai';
}

function getSelectedDeliveryMethod() {
  const selected = checkoutForm.querySelector('input[name="deliveryMethod"]:checked');
  return selected ? selected.value : 'Diantar ke Rumah';
}

function getShippingCost() {
  return getSelectedDeliveryMethod() === 'Diantar ke Rumah' ? 10000 : 0;
}

function updateSummaryCosts() {
  const cart = getCart();
  const subtotal = cart.reduce((sum, item) => sum + (toSafeNumber(item.price) * Math.floor(toSafeNumber(item.quantity))), 0);
  const shippingCost = getShippingCost();

  const shippingCostElement = document.getElementById('shipping-cost');
  if (shippingCostElement) {
    shippingCostElement.textContent = formatPrice(shippingCost);
  }

  orderTotalElement.textContent = formatPrice(subtotal + shippingCost);
}

function toggleDeliveryAddress() {
  const deliveryMethod = getSelectedDeliveryMethod();
  const defaultText = 'Diambil langsung ke Warung Sayur Diky';

  if (deliveryMethod === 'Ambil Sendiri ke Warung') {
    if (!customerAddressField.value.trim() || customerAddressField.value === defaultText) {
      customerAddressField.value = defaultText;
    }
    customerAddressField.required = false;
    addressFieldGroup.style.display = 'none';
    return;
  }

  if (customerAddressField.value === defaultText) {
    customerAddressField.value = '';
  }
  customerAddressField.required = true;
  addressFieldGroup.style.display = 'block';

  if (hasValidCheckoutSequence()) {
    const user = getCurrentRegisteredUser();
    if (user && user.address && !customerAddressField.value.trim()) {
      customerAddressField.value = user.address;
    }
  }

  if (hasValidCheckoutSequence()) {
    lockCustomerFields();
  }
}

function validateForm() {
  const name = document.getElementById('customer-name');
  const phone = document.getElementById('customer-phone');
  const address = document.getElementById('customer-address');
  const deliveryMethod = getSelectedDeliveryMethod();

  if (!name.value.trim()) {
    name.focus();
    return false;
  }

  const phoneValue = phone.value.replace(/[\s+\-().]/g, '');
  if (!phoneValue || phoneValue.length < 10) {
    phone.focus();
    return false;
  }

  if (deliveryMethod === 'Diantar ke Rumah' && !address.value.trim()) {
    address.focus();
    return false;
  }

  return true;
}

function compactProfileImageForOrder(imageSource) {
  if (typeof imageSource !== 'string' || !imageSource.startsWith('data:image/')) {
    return Promise.resolve(imageSource || null);
  }
  if (imageSource.length <= 16000) return Promise.resolve(imageSource);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxDimension = 96;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      try {
        const thumbnail = canvas.toDataURL('image/jpeg', 0.62);
        resolve(thumbnail.length < imageSource.length ? thumbnail : null);
      } catch (error) {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = imageSource;
  });
}

function buildOrderData() {
  const rawCart = getCart();
  const cart = typeof compactOrderItems === 'function' ? compactOrderItems(rawCart) : rawCart;
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  const deliveryMethod = getSelectedDeliveryMethod();
  const paymentMethod = getSelectedPaymentMethod();
  const shippingCost = getShippingCost();
  const subtotal = cart.reduce((sum, item) => sum + (toSafeNumber(item.price) * Math.floor(toSafeNumber(item.quantity))), 0);
  const activeUser = typeof getCurrentRegisteredUser === 'function' ? getCurrentRegisteredUser() : (typeof window.getActiveUser === 'function' ? window.getActiveUser() : null);
  const userLatitude = Number.isFinite(Number(activeUser && activeUser.latitude)) ? Number(activeUser.latitude) : null;
  const userLongitude = Number.isFinite(Number(activeUser && activeUser.longitude)) ? Number(activeUser.longitude) : null;
  // Simpan identitas pemesan (username + foto profil) ke dalam arsip order. Dengan
  // begitu panel admin tetap menampilkan foto/username asli walau user kemudian
  // menghapus akunnya lewat Logout Bersih Total.
  const userUsername = (activeUser && (activeUser.username || activeUser.userId)) || null;
  const userProfileImage = (activeUser && (activeUser.profileImage || activeUser.avatarUrl)) || null;
  const userFullName = (activeUser && (activeUser.fullName || activeUser.name)) || name;
  // Simpan juga email pemesan ke arsip, agar jejak email ikut bertahan permanen
  // (seperti nomor telepon) dan tetap terdeteksi pada validasi pendaftaran ulang.
  const userEmail = (activeUser && activeUser.emailAddress) || null;
  const userGender = (activeUser && activeUser.gender) || null;
  const userBirthDate = (activeUser && activeUser.birthDate) || null;

  return {
    id: `ORD-${Date.now()}`,
    userId: activeUser && activeUser.id ? String(activeUser.id) : null,
    username: userUsername,
    profileImage: userProfileImage,
    fullName: userFullName,
    emailAddress: userEmail,
    gender: userGender,
    birthDate: userBirthDate,
    createdAt: new Date().toISOString(),
    cart,
    totalPrice: subtotal + shippingCost,
    shippingCost,
    deliveryMethod,
    customer: {
      name,
      phone,
      emailAddress: userEmail,
      address,
      paymentMethod,
      username: userUsername,
      profileImage: userProfileImage,
      gender: userGender,
      birthDate: userBirthDate,
      latitude: userLatitude,
      longitude: userLongitude
    }
  };
}

async function submitOrder() {
  if (!validateForm()) {
    alert('Silakan lengkapi semua data pengiriman dengan benar sebelum melanjutkan.');
    return;
  }

  const button = document.getElementById('confirm-button');
  const modal = document.querySelector('.loading-modal');
  const loadingBar = modal.querySelector('.loading-bar');
  const loadingPercent = modal.querySelector('.loading-percent');

  // Disable button and show modal
  button.disabled = true;
  modal.classList.add('active');

  // Simulate loading progress
  for (let i = 0; i <= 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 30)); // 30ms per step
    loadingBar.style.width = `${i}%`;
    loadingPercent.textContent = `${i}%`;

    // Slow down near completion for better UX
    if (i > 80) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // Brief pause at 100% before redirect
  await new Promise(resolve => setTimeout(resolve, 300));

  const orderData = buildOrderData();
  const orderProfileImage = await compactProfileImageForOrder(orderData.profileImage);
  orderData.profileImage = orderProfileImage;
  orderData.customer.profileImage = orderProfileImage;

  // Checkout adalah pesanan baru dan tidak boleh menghapus pesananAktif.
  if (typeof simpanPesananBaru === 'function') {
    simpanPesananBaru(orderData);
  }
  const paymentMethod = getSelectedPaymentMethod();

  if (paymentMethod === 'Hutang') {
    const debtSaved = await saveDebtFromCheckout(orderData);
    if (!debtSaved) {
      if (typeof hapusPesananBaru === 'function') hapusPesananBaru();
      modal.classList.remove('active');
      button.disabled = false;
      window.alert('Catatan Hutang tidak dapat disimpan karena penyimpanan browser penuh. Pesanan belum dilanjutkan. Hapus sebagian data browser lama atau coba lagi.');
      return;
    }
  }

  // Save active order using simpanPesananAktif helper
  if (typeof simpanPesananAktif === 'function') {
    simpanPesananAktif(orderData);
  } else {
    const activeKey = getUserStorageKey('pesananAktif');
    if (activeKey && typeof writeUserStorage === 'function') {
      writeUserStorage(activeKey, orderData, [getUserStorageKey('checkoutForm')]);
    } else if (activeKey) {
      try { localStorage.setItem(activeKey, JSON.stringify(orderData)); } catch (error) { }
    }
  }

  // Pesanan baru hanya disimpan sebagai pesananAktif sampai pengguna
  // menekan "Lihat Riwayat Pesanan" di success.html. Dengan demikian,
  // akses manual ke orders.html tidak dapat memasukkan pesanan ini.
  const lastOrderKey = getUserStorageKey('lastOrder');
  if (lastOrderKey) {
    if (typeof writeUserStorage === 'function') {
      writeUserStorage(lastOrderKey, orderData, [getUserStorageKey('checkoutForm')]);
    } else {
      try { localStorage.setItem(lastOrderKey, JSON.stringify(orderData)); } catch (error) { }
    }
  }

  const checkoutFormKey = getUserStorageKey('checkoutForm');
  if (checkoutFormKey) {
    const activeUser = typeof getCurrentRegisteredUser === 'function' ? getCurrentRegisteredUser() : (typeof window.getActiveUser === 'function' ? window.getActiveUser() : null);
    const checkoutFormData = {
      customerName: document.getElementById('customer-name').value.trim(),
      customerPhone: document.getElementById('customer-phone').value.trim(),
      customerAddress: document.getElementById('customer-address').value.trim(),
      deliveryMethod: getSelectedDeliveryMethod(),
      paymentMethod: getSelectedPaymentMethod(),
      latitude: Number.isFinite(Number(activeUser && activeUser.latitude)) ? Number(activeUser.latitude) : null,
      longitude: Number.isFinite(Number(activeUser && activeUser.longitude)) ? Number(activeUser.longitude) : null,
      timestamp: new Date().toISOString()
    };
    if (typeof writeUserStorage === 'function') {
      writeUserStorage(checkoutFormKey, checkoutFormData);
    } else {
      try { localStorage.setItem(checkoutFormKey, JSON.stringify(checkoutFormData)); } catch (error) { }
    }
  }

  // Bersihkan data checkout items setelah order disimpan
  const checkoutItemsKey = getUserStorageKey('checkoutItems');
  if (checkoutItemsKey) {
    localStorage.removeItem(checkoutItemsKey);
  }
  if (typeof hapusPesananBaru === 'function') {
    hapusPesananBaru();
  }

  // Update position tracker ke success.html
  if (typeof setUserLastPosition === 'function') setUserLastPosition('success.html');

  // Berikan otorisasi navigasi sah ke success.html dari proses order submit
  if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
    window.NavigationGuard.grantAccess('success.html', 'checkout_submit');
  }

  window.location.href = 'success.html';
}

async function saveDebtFromCheckout(orderData) {
  const hutangKey = getUserStorageKey('hutang');
  if (!hutangKey) {
    console.warn('saveDebtFromCheckout: Tidak dapat menyimpan hutang - user tidak valid');
    return;
  }

  let debts = [];
  try {
    const raw = localStorage.getItem(hutangKey);
    debts = raw ? JSON.parse(raw) : [];
  } catch (e) {
    debts = [];
  }

  const cart = orderData.cart || [];
  const items = cart.map(function (item) {
    return {
      id: item.id,
      name: item.name,
      qty: item.quantity,
      quantity: item.quantity,
      price: item.price,
      unit: item.unit || '',
      image: typeof resolveProductImage === 'function' ? resolveProductImage(item) : (item.image || 'images/Toko Sayur Online.png')
    };
  });

  const shippingCost = orderData.shippingCost || 0;
  if (shippingCost > 0) {
    // Ongkir bukan produk: tidak boleh dirender sebagai gambar produk di hutang.html.
    items.push({ name: 'Ongkir', qty: 1, price: shippingCost, isShipping: true });
  }

  const subtotal = cart.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);
  const totalAmount = subtotal + shippingCost;

  const activeUser = typeof getActiveUser === 'function' ? getActiveUser() : null;
  const debt = {
    id: 'HUT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    orderId: orderData.id,
    userId: orderData.userId || null,
    customerName: orderData.customer.name,
    username: orderData.customer.username || (activeUser && activeUser.username) || '',
    email: orderData.customer.emailAddress || (activeUser && activeUser.emailAddress) || null,
    gender: orderData.customer.gender || orderData.gender || (activeUser && activeUser.gender) || null,
    birthDate: orderData.customer.birthDate || orderData.birthDate || (activeUser && activeUser.birthDate) || null,
    // Simpan foto profil pemesan ke arsip hutang agar panel admin/hutang user tetap
    // menampilkan foto asli walau akun user dihapus via Logout Bersih Total.
    profileImage: orderData.customer.profileImage || (activeUser && (activeUser.profileImage || activeUser.avatarUrl)) || null,
    phone: orderData.customer.phone,
    address: orderData.customer.address,
    paymentMethod: orderData.customer.paymentMethod,
    deliveryMethod: orderData.deliveryMethod,
    items: items,
    subtotal: subtotal,
    shippingCost: shippingCost,
    totalAmount: totalAmount,
    date: orderData.createdAt,
    createdAt: orderData.createdAt,
    status: 'belum',
    note: 'Dari Checkout - Hutang Pelanggan'
  };

  debts.unshift(debt);
  const cleanupKeys = [getUserStorageKey('checkoutSummary'), getUserStorageKey('checkoutForm')].filter(Boolean);
  const persistDebts = () => typeof writeUserStorage === 'function'
    ? writeUserStorage(hutangKey, debts, cleanupKeys)
    : (() => { try { localStorage.setItem(hutangKey, JSON.stringify(debts)); return true; } catch (error) { return false; } })();
  let saved = persistDebts();

  if (!saved) {
    for (const record of debts) {
      if (!record || typeof record !== 'object') continue;
      for (const imageKey of ['profileImage', 'avatarUrl']) {
        const image = record[imageKey];
        if (typeof image !== 'string' || !image.startsWith('data:image/')) continue;
        record[imageKey] = await compactProfileImageForOrder(image);
      }
    }
    saved = persistDebts();
  }

  if (!saved) {
    debts.forEach((record) => {
      if (!record || typeof record !== 'object') return;
      ['profileImage', 'avatarUrl'].forEach((imageKey) => {
        if (typeof record[imageKey] === 'string' && record[imageKey].startsWith('data:image/')) {
          delete record[imageKey];
        }
      });
    });
    saved = persistDebts();
  }

  if (!saved) console.error('Catatan hutang gagal disimpan setelah percobaan ulang.');
  if (saved) syncAdminDebtCopy(debt);
  return saved;
}

/**
 * ==========================================================
 * SINKRONISASI SALINAN HUTANG UNTUK PANEL ADMIN
 * ==========================================================
 * Isolasi dua arah: admin-hutang.html membaca salinan tersendiri
 * (dikyHutangAdmin_<userId>), hutang.html membaca salinan milik user
 * (dikyHutang_<userId>). Penghapusan di satu sisi TIDAK mempengaruhi
 * sisi lain karena keduanya tidak pernah menyentuh key milik sisi lain.
 * Salinan admin dibuat saat kasbon baru muncul (dari checkout).
 */
function syncAdminDebtCopy(debt) {
  if (!debt || !debt.id) return false;
  const adminKey = getUserStorageKey('hutangAdmin');
  if (!adminKey) return false;
  let adminDebts = [];
  try {
    const raw = localStorage.getItem(adminKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) adminDebts = parsed;
  } catch (error) { adminDebts = []; }
  if (adminDebts.some(function (entry) { return entry && String(entry.id) === String(debt.id); })) return true;
  adminDebts.unshift(Object.assign({}, debt));
  try { localStorage.setItem(adminKey, JSON.stringify(adminDebts)); return true; } catch (error) { return false; }
}

function initializeCheckoutPage() {
  if (!requireLogin()) return;

  // Proteksi navigasi anti-URL manual bypass:
  // Halaman tetap dibuka, tetapi jika akses tidak sah via ketik URL manual,
  // data daftar checkout dihapus/dibersihkan sehingga ringkasan checkout tampil kosong.
  if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
    window.NavigationGuard.validateAccess('checkout.html');
  }

  // Force clean re-render to ensure current checkout state is rendered
  forceCleanReRender();
  if (!hasValidCheckoutSequence()) {
    clearAutoFillCheckoutState();
  } else {
    applyAutoFillCheckoutData();
  }

  deliveryMethodInputs.forEach((input) => input.addEventListener('change', () => {
    toggleDeliveryAddress();
    updateSummaryCosts();
  }));
  toggleDeliveryAddress();
  updateSummaryCosts();
  confirmButton.addEventListener('click', submitOrder);
}

function forceCleanReRender() {
  // Clear and re-render checkout data for current user
  renderOrderSummary();

  console.log('Clean re-render completed for checkout page');
}

window.addEventListener('DOMContentLoaded', initializeCheckoutPage);
window.addEventListener('pageshow', function() {
  if (typeof isValidSession === 'function' && isValidSession()) {
    if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
      window.NavigationGuard.validateAccess('checkout.html');
    }
    forceCleanReRender();
    updateCancelCheckoutVisibility();
  }
});

/**
 * ==========================================
 * Pembatalan Pesanan di Halaman Checkout
 * ==========================================
 * Pesanan pada tahap checkout BELUM menjadi arsip admin (dikyOrders_<userId>
 * belum dibuat). Karena itu tombol "Hapus Pesanan Ini" hanya membersihkan
 * sumber pesanan milik user aktif (checkoutItems/pesananBaru/keranjang),
 * BUKAN memakai hapusPesananOrderLintasArsip (helper tersebut khusus untuk
 * pembatalan yang dilakukan admin di admin-orders.html).
 */
function updateCancelCheckoutVisibility() {
  if (!cancelCheckoutButton) return;
  // Tombol "Hapus Pesanan Ini" hanya tampil bila memang ada daftar pesanan
  // pada tahap checkout (checkoutItems hasil konfirmasi keranjang).
  cancelCheckoutButton.hidden = !hasValidCheckoutSequence();
}

let isDeletingCheckout = false;

function hapusPesananCheckout() {
  // Pengaman klik ganda: proses hapus hanya boleh berjalan satu kali.
  if (isDeletingCheckout) return;
  if (!hasValidCheckoutSequence()) {
    updateCancelCheckoutVisibility();
    return;
  }
  isDeletingCheckout = true;

  // TANPA window.confirm / window.alert: dialog browser adalah penyebab
  // tombol terasa "harus diklik berkali-kali" (klik saat dialog tertutup
  // hilang / ditelan, dan di beberapa konteks confirm() selalu false
  // sehingga fungsi keluar tanpa menghapus apa pun). Sekali klik = langsung hapus.
  if (typeof window.hapusPesananDariCheckout === 'function') {
    window.hapusPesananDariCheckout();
  } else {
    // Fallback bila helper belum termuat: bersihkan data checkout milik user aktif.
    ['checkoutItems', 'checkoutSummary', 'checkoutForm', 'pesananBaru', 'cart'].forEach((type) => {
      const key = getUserStorageKey(type);
      if (key) localStorage.removeItem(key);
    });
    if (typeof clearUserLastPosition === 'function') clearUserLastPosition();
  }

  clearAutoFillCheckoutState();
  forceCleanReRender();
  updateSummaryCosts();
  updateCancelCheckoutVisibility();

  if (window.SmartGuide && typeof window.SmartGuide.init === 'function') {
    window.SmartGuide.init();
  }

  // Umpan balik non-dialog: ubah teks tombol sesaat, lalu kembalikan.
  if (cancelCheckoutButton) {
    const label = cancelCheckoutButton.querySelector('.button-text');
    if (label) label.textContent = 'Pesanan dihapus';
    cancelCheckoutButton.disabled = true;
    window.setTimeout(() => {
      isDeletingCheckout = false;
      if (label) label.textContent = 'Hapus Pesanan Ini';
      cancelCheckoutButton.disabled = false;
      updateCancelCheckoutVisibility();
    }, 400);
  } else {
    isDeletingCheckout = false;
  }
}

window.addEventListener('DOMContentLoaded', function () {
  if (cancelCheckoutButton) {
    cancelCheckoutButton.addEventListener('click', hapusPesananCheckout);
  }
  updateCancelCheckoutVisibility();
});
