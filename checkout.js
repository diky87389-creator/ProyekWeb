const orderSummaryElement = document.getElementById('order-summary');
const orderTotalElement = document.getElementById('order-total');
const checkoutForm = document.getElementById('checkout-form');
const confirmButton = document.getElementById('confirm-button');
const customerAddressField = document.getElementById('customer-address');
const addressFieldGroup = document.getElementById('address-field-group');
const cancelCheckoutButton = document.getElementById('cancel-checkout-button');
const deliveryMethodInputs = checkoutForm.querySelectorAll('input[name="deliveryMethod"]');

// Konteks checkout titipan: bila pesanan berasal dari halaman Titip Beli,
// key dikyTitipanCheckout_<userId> menautkan checkout ini dengan titipannya.
function readTitipanCheckoutContext() {
  const key = getUserStorageKey('titipanCheckout');
  if (!key) return null;
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (error) { return null; }
}

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
    const qtyText = typeof window.Satuan !== 'undefined'
      ? window.Satuan.formatAngka(item.quantity)
      : item.quantity;
    quantity.textContent = `${qtyText} x ${formatPrice(item.price)}`;

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
  // Ongkir dihitung dari JARAK (Warung -> lokasi pelanggan), bukan flat.
  // Seluruh halaman lain (success, orders, hutang, titip, admin-*)
  // membaca order.shippingCost sehingga otomatis ikut nilai ini.
  if (getSelectedDeliveryMethod() !== 'Diantar ke Rumah') return 0;

  if (typeof window.Ongkir === 'undefined') {
    // Modul belum dimuat: pakai fallback agar checkout tetap berjalan.
    return 10000;
  }

  var hasil = window.Ongkir.hitung({
    metodePengiriman: getSelectedDeliveryMethod(),
    user: (typeof getActiveUser === 'function' ? getActiveUser() : null)
  });
  return hasil.total;
}

/** Rincian ongkir untuk ditampilkan di ringkasan checkout. */
function getShippingDetail() {
  if (getSelectedDeliveryMethod() !== 'Diantar ke Rumah') {
    return { total: 0, jarakTempuhKm: null, peringatan: null, adaLokasi: true };
  }
  if (typeof window.Ongkir === 'undefined') {
    return { total: 10000, jarakTempuhKm: null, peringatan: null, adaLokasi: true };
  }
  return window.Ongkir.hitung({
    metodePengiriman: getSelectedDeliveryMethod(),
    user: (typeof getActiveUser === 'function' ? getActiveUser() : null)
  });
}

function updateSummaryCosts() {
  const cart = getCart();
  const subtotal = cart.reduce((sum, item) => sum + (toSafeNumber(item.price) * toSafeNumber(item.quantity)), 0);
  const detail = getShippingDetail();
  const shippingCost = detail.total;

  const shippingCostElement = document.getElementById('shipping-cost');
  if (shippingCostElement) {
    shippingCostElement.textContent = formatPrice(shippingCost);
  }

  // Tampilkan keterangan jarak di bawah baris ongkir.
  const jarakElement = document.getElementById('shipping-distance');
  if (jarakElement) {
    if (detail.jarakTempuhKm != null) {
      jarakElement.textContent = '📍 ' + (window.Ongkir ? window.Ongkir.formatJarak(detail.jarakTempuhKm) : '') + ' dari Warung Sayur Diky';
      jarakElement.hidden = false;
    } else {
      jarakElement.textContent = '';
      jarakElement.hidden = true;
    }
  }

  // Peringatan: lokasi belum ada / melebihi radius.
  const warnElement = document.getElementById('shipping-warning');
  if (warnElement) {
    if (detail.peringatan) {
      warnElement.textContent = '⚠️ ' + detail.peringatan;
      warnElement.hidden = false;
    } else {
      warnElement.textContent = '';
      warnElement.hidden = true;
    }
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
  const subtotal = cart.reduce((sum, item) => sum + (toSafeNumber(item.price) * toSafeNumber(item.quantity)), 0);
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
  // Bila checkout berasal dari Titip Beli, tautkan pesanan dengan titipannya
  // agar status titipan bisa mengikuti tahap pesanan (Dikemas -> Dikirim -> Selesai).
  const titipanContext = readTitipanCheckoutContext();

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
    // WAJIB ada: pesanan baru selalu masuk tab "Dikemas" di orders.html.
    // Tanpa field ini, penjaga pesanan ganda di checkout.html tidak dapat
    // mendeteksi pesanan yang masih berjalan (status kosong = diabaikan).
    status: 'menunggu',
    statusUpdatedAt: new Date().toISOString(),
    titipanId: titipanContext && titipanContext.titipanId ? String(titipanContext.titipanId) : null,
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
  // Penjaga lapis kedua: tolak bila masih ada pesanan yang berjalan
  // (success.html, tab Dikemas, atau tab Dikirim / Silahkan Untuk Diambil).
  // Pesanan di tab Selesai TIDAK menghalangi.
  const penghalang = cariPesananYangMenghalangi();
  if (penghalang) {
    terapkanPenjagaPesananAktif();
    if (penghalang.source === 'success') {
      alert('Anda masih memiliki pesanan aktif yang belum diselesaikan di halaman Sukses.\n\nBuka halaman Sukses dan tekan tombol "Lihat Riwayat Pesanan" agar pesanan tersebut masuk ke tab Dikemas terlebih dahulu. Setelah itu Anda dapat membuat pesanan baru.');
    } else {
      alert('Anda masih memiliki pesanan yang sedang berjalan di tab "' + penghalang.label + '".\n\nPesanan baru dapat dibuat setelah admin menyelesaikan pesanan tersebut sampai masuk ke tab Selesai di halaman Pesanan.');
    }
    return;
  }

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

  // Titip Beli: tandai titipan asal sudah dichekout pelanggan, lalu hapus
  // konteks checkout titipan (tautan permanen kini ada di orderData.titipanId).
  const titipanContext = readTitipanCheckoutContext();
  if (titipanContext && titipanContext.titipanId && window.TitipHelper && typeof window.TitipHelper.tandaiSudahCheckout === 'function') {
    window.TitipHelper.tandaiSudahCheckout(titipanContext.titipanId);
  }
  const titipanCheckoutKey = getUserStorageKey('titipanCheckout');
  if (titipanCheckoutKey) {
    localStorage.removeItem(titipanCheckoutKey);
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

  // Cegah pesanan ganda di success.html
  terapkanPenjagaPesananAktif();
}

/**
 * ============================================================
 * PENJAGA PESANAN AKTIF DI success.html
 * ============================================================
 * success.html hanya menampung SATU pesanan aktif (pesananAktif /
 * lastOrder). Bila user meninggalkan success.html tanpa menekan
 * "Lihat Riwayat Pesanan", pesanan pertamanya MASIH aktif di sana.
 *
 * Maka dari itu, sebelum pesanan baru boleh dikonfirmasi:
 *   1) Deteksi apakah pesananAktif / lastOrder masih berisi pesanan
 *      yang BELUM dipindahkan ke riwayat (belum masuk tab Dikemas).
 *   2) Jika ada -> NONAKTIFKAN tombol "Konfirmasi Pesanan".
 *   3) Tampilkan peringatan + tombol menuju success.html.
 *   4) Jika sudah dipindahkan -> aktifkan kembali tombol, sembunyikan
 *      peringatan.
 * ============================================================
 */
function adaPesananAktifDiSuccess() {
  try {
    if (typeof getPesananAktif !== 'function') return null;
    const pesanan = getPesananAktif();
    if (!pesanan || typeof pesanan !== 'object') return null;
    if (pesanan.dihapusUser === true) return null;

    // Pesanan yang dibatalkan tidak menghalangi.
    const status = String(pesanan.status || '').trim().toLowerCase();
    if (status === 'dibatalkan' || status === 'cancelled' || status === 'batal') return null;

    return pesanan;
  } catch (error) {
    console.warn('Gagal memeriksa pesanan aktif:', error);
    return null;
  }
}

/* ============================================================
   STATUS PESANAN YANG MASIH DIPROSES
   ------------------------------------------------------------
   Pesanan dianggap MASIH BERJALAN (dan memblokir pesanan baru)
   bila statusnya BUKAN salah satu di bawah ini:
     selesai, lunas, dibatalkan, completed, cancelled, batal

   Contoh:
     'menunggu' / 'dikemas' / 'diproses' -> tab Dikemas  -> BLOKIR
     'dikirim'                          -> tab Dikirim  -> BLOKIR
     'siap_diambil'                     -> tab Silahkan Untuk Diambil -> BLOKIR
     'selesai'                          -> tab Selesai  -> IZINKAN

   Tab tujuan (targetTab) dipakai orders.js untuk langsung membuka
   tab yang benar lewat sessionStorage['dikySmartGuideOrderTab'].
   ============================================================ */
const STATUS_SELESAI = ['selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan',
  'completed', 'cancelled', 'dibatalkan_admin', 'batal'];

function petakanTabPesanan(order) {
  const status = String((order && order.status) || 'menunggu').trim().toLowerCase();
  if (status === 'dikirim') return { tab: 'dikirim', label: 'Dikirim' };
  if (status === 'siap_diambil') return { tab: 'siap_diambil', label: 'Silahkan Untuk Diambil' };
  return { tab: 'dikemas', label: 'Dikemas' };
}

/**
 * Cari pesanan milik user yang masih berjalan di orders.html
 * (tab Dikemas / Dikirim / Silahkan Untuk Diambil).
 * Pesanan di tab Selesai TIDAK dianggap menghalangi.
 */
/** Ambil daftar pesanan dari kunci localStorage tertentu (selalu array). */
function ambilDaftarPesanan(kunci) {
  try {
    const raw = localStorage.getItem(kunci);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data.filter(function (o) { return o && typeof o === 'object'; });
    if (data && typeof data === 'object') return [data];
    return [];
  } catch (e) {
    return [];
  }
}

function adaPesananBerjalanDiOrders() {
  try {
    if (typeof getUserStorageKey !== 'function' && typeof getActiveUser !== 'function') return null;

    // User aktif diperlukan untuk memastikan hanya pesanan MILIKNYA yang diperiksa.
    const user = typeof getActiveUser === 'function' ? getActiveUser() : null;
    const userId = user && user.id ? String(user.id) : '';
    if (!userId) return null;

    // Kumpulkan pesanan dari KEDUA sumber.
    // dickyOrders_ (arsip admin) dianggap SUMBER KEBENARAN karena admin
    // yang mengubah status (Dikirim / Selesai). Bila status di kedua
    // sumber berbeda, pakai yang lebih maju.
    const dariRiwayat = ambilDaftarPesanan('riwayatPesanan_' + userId);
    const dariAdmin = ambilDaftarPesanan('dikyOrders_' + userId);

    const milikUser = (o) => {
      if (!o || typeof o !== 'object') return false;
      if (o.dihapusUser === true) return false;
      const pemilik = o.userId ? String(o.userId) : '';
      return !pemilik || pemilik === userId;
    };

    // Gabungkan per ID: status admin mengalahkan status riwayat.
    const gabungan = {};

    dariRiwayat.filter(milikUser).forEach(function (o) {
      gabungan[String(o.id)] = Object.assign({}, o);
    });

    dariAdmin.filter(milikUser).forEach(function (o) {
      const id = String(o.id);
      const lama = gabungan[id];
      if (!lama) {
        gabungan[id] = Object.assign({}, o);
        return;
      }
      const stAdmin = String(o.status || '').toLowerCase();
      const stLama = String(lama.status || '').toLowerCase();
      // Jika status admin lebih maju / berbeda, pakai status admin.
      if (stAdmin && stAdmin !== stLama) {
        lama.status = o.status;
        lama.shippedAt = o.shippedAt || lama.shippedAt;
        lama.completedAt = o.completedAt || lama.completedAt;
      }
    });

    const aktif = Object.keys(gabungan).map(function (id) { return gabungan[id]; }).find(function (o) {
      const st = String(o.status || '').trim().toLowerCase();

      // Pesanan tanpa status dianggap MASIH BERJALAN (tab Dikemas).
      // Ini penting untuk pesanan lama yang dibuat sebelum field status
      // ditambahkan. Lebih aman menolak daripada membiarkan pesanan ganda.
      if (!st) return true;

      return STATUS_SELESAI.indexOf(st) === -1;
    });

    return aktif || null;
  } catch (error) {
    console.warn('Gagal memeriksa pesanan berjalan di orders.html:', error);
    return null;
  }
}

/**
 * Gabungkan seluruh sumber penjagaan:
 *   source : 'success' | 'orders'
 *   order  : objek pesanan yang menghalangi
 *   tab    : 'dikemas' | 'dikirim' | 'siap_diambil'
 *   tujuan : URL halaman yang harus dibuka user
 */
function cariPesananYangMenghalangi() {
  const pesananSuccess = adaPesananAktifDiSuccess();
  if (pesananSuccess) {
    return { source: 'success', order: pesananSuccess, tab: null, label: 'Sukses', tujuan: 'success.html' };
  }

  const pesananOrders = adaPesananBerjalanDiOrders();
  if (pesananOrders) {
    const info = petakanTabPesanan(pesananOrders);
    return {
      source: 'orders',
      order: pesananOrders,
      tab: info.tab,
      label: info.label,
      tujuan: 'orders.html'
    };
  }

  return null;
}

function terapkanPenjagaPesananAktif() {
  const panel = document.getElementById('pending-order-warning');
  const tombol = document.getElementById('pending-order-link');
  const judul = document.getElementById('pending-order-title');
  const teks = document.getElementById('pending-order-text');
  if (!panel || !confirmButton) return;

  const penghalang = cariPesananYangMenghalangi();

  if (penghalang) {
    confirmButton.disabled = true;
    confirmButton.setAttribute('aria-disabled', 'true');
    confirmButton.classList.add('is-blocked');
    panel.hidden = false;

    if (penghalang.source === 'success') {
      if (teks) {
        teks.innerHTML = 'Pesanan Anda sebelumnya masih aktif di halaman <strong>Sukses</strong>. ' +
          'Tekan tombol <strong>"Lihat Riwayat Pesanan"</strong> agar pesanan masuk ke tab <strong>Dikemas</strong> di halaman Pesanan. ' +
          'Setelah itu Anda dapat melanjutkan pesanan baru.';
      }
      if (tombol) tombol.textContent = 'Lihat Pesanan Sebelumnya \u2192';
    } else {
      if (teks) {
        teks.innerHTML = 'Pesanan Anda sebelumnya masih berjalan di tab <strong>' + penghalang.label + '</strong>. ' +
          'Pesanan baru dapat dibuat setelah admin menyelesaikan pesanan tersebut ' +
          '(sampai masuk ke tab <strong>Selesai</strong>).';
      }
      if (tombol) tombol.textContent = 'Lihat Pesanan di Tab ' + penghalang.label + ' \u2192';
    }

    // Simpan tujuan di dataset agar listener lama tidak memakai tujuan usang.
    tombol.dataset.tujuan = penghalang.tujuan;
    tombol.dataset.tab = penghalang.tab || '';

    if (!tombol.dataset.terpasang) {
      tombol.dataset.terpasang = '1';
      tombol.addEventListener('click', function () {
        const tujuan = tombol.dataset.tujuan || 'success.html';
        const tab = tombol.dataset.tab;

        if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
          window.NavigationGuard.grantAccess(tujuan, 'checkout_pending_order_redirect');
        }
        if (tab) {
          try { sessionStorage.setItem('dikySmartGuideOrderTab', tab); } catch (e) { }
        }
        window.location.href = tujuan;
      });
    }

    if (judul) {
      judul.textContent = penghalang.source === 'success'
        ? 'Masih ada pesanan yang belum diselesaikan'
        : 'Masih ada pesanan yang sedang berjalan';
    }
  } else {
    // Semua pesanan sudah Selesai -> izinkan konfirmasi.
    confirmButton.disabled = false;
    confirmButton.removeAttribute('aria-disabled');
    confirmButton.classList.remove('is-blocked');
    panel.hidden = true;
  }
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
    // Perbarui penjaga saat kembali ke halaman ini (mis. via tombol Back
    // dari success.html setelah Riwayat Pesanan ditekan).
    terapkanPenjagaPesananAktif();
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
  // Titip Beli: bila pesanan berasal dari titipan, batalkan titipannya
  // (status 'dibatalkan' tersinkron ke panel admin) dan jangan sentuh
  // keranjang belanja user, karena item titipan bukan berasal dari keranjang.
  const titipanContext = readTitipanCheckoutContext();
  if (titipanContext && titipanContext.titipanId) {
    if (window.TitipHelper && typeof window.TitipHelper.batalkanTitipan === 'function') {
      window.TitipHelper.batalkanTitipan(titipanContext.titipanId);
    }
    ['checkoutItems', 'checkoutSummary', 'checkoutForm', 'pesananBaru', 'titipanCheckout', 'pesananAktif', 'lastOrder'].forEach((type) => {
      const key = getUserStorageKey(type);
      if (key) localStorage.removeItem(key);
    });
    if (typeof clearUserLastPosition === 'function') clearUserLastPosition();
  } else if (typeof window.hapusPesananDariCheckout === 'function') {
    window.hapusPesananDariCheckout();
    ['pesananAktif', 'lastOrder'].forEach((type) => {
      const key = getUserStorageKey(type);
      if (key) localStorage.removeItem(key);
    });
  } else {
    // Fallback bila helper belum termuat: bersihkan data checkout milik user aktif.
    ['checkoutItems', 'checkoutSummary', 'checkoutForm', 'pesananBaru', 'cart', 'pesananAktif', 'lastOrder'].forEach((type) => {
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

// ============================================================
// HIGHLIGHT PSIKOLOGIS TOMBOL "HAPUS PESANAN INI" SETELAH DIPENTALKAN
// ============================================================
(function () {
  function checkCancelHighlight() {
    var shouldHighlight = sessionStorage.getItem('highlightBatalCheckout');
    if (!shouldHighlight) return;

    window.setTimeout(function () {
      var btn = document.getElementById('cancel-checkout-button');
      if (btn) {
        btn.classList.add('cancel-btn-psychology-alert');
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.focus();
        window.alert('⚠️ Perhatian: Jika Anda ingin membatalkan titipan ini sebelum melakukan Logout Bersih Total, silakan klik tombol "Hapus Pesanan Ini" yang berkedip merah di bawah.');
      }
      sessionStorage.removeItem('highlightBatalCheckout');
    }, 450);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkCancelHighlight);
  } else {
    checkCancelHighlight();
  }
})();
