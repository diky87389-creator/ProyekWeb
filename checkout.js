const orderSummaryElement = document.getElementById('order-summary');
const orderTotalElement = document.getElementById('order-total');
const checkoutForm = document.getElementById('checkout-form');
const confirmButton = document.getElementById('confirm-button');
const customerAddressField = document.getElementById('customer-address');
const addressFieldGroup = document.getElementById('address-field-group');
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

  return {
    id: `ORD-${Date.now()}`,
    userId: activeUser && activeUser.id ? String(activeUser.id) : null,
    createdAt: new Date().toISOString(),
    cart,
    totalPrice: subtotal + shippingCost,
    shippingCost,
    deliveryMethod,
    customer: {
      name,
      phone,
      address,
      paymentMethod,
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
  // Checkout adalah pesanan baru dan tidak boleh menghapus pesananAktif.
  if (typeof simpanPesananBaru === 'function') {
    simpanPesananBaru(orderData);
  }
  const paymentMethod = getSelectedPaymentMethod();

  if (paymentMethod === 'Hutang') {
    saveDebtFromCheckout(orderData);
  }

  // Save active order using simpanPesananAktif helper
  if (typeof simpanPesananAktif === 'function') {
    simpanPesananAktif(orderData);
  } else {
    const activeKey = getUserStorageKey('pesananAktif');
    if (activeKey && typeof writeUserStorage === 'function') {
      writeUserStorage(activeKey, orderData, [getUserStorageKey('checkoutForm')]);
    } else if (activeKey) {
      try { localStorage.setItem(activeKey, JSON.stringify(orderData)); } catch (error) { console.warn('Pesanan aktif tidak dapat disimpan.', error); }
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
      try { localStorage.setItem(lastOrderKey, JSON.stringify(orderData)); } catch (error) { console.warn('Snapshot pesanan tidak dapat disimpan.', error); }
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
      try { localStorage.setItem(checkoutFormKey, JSON.stringify(checkoutFormData)); } catch (error) { console.warn('Data form checkout tidak dapat disimpan.', error); }
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

function saveDebtFromCheckout(orderData) {
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
    items.push({ name: 'Ongkir', qty: 1, price: shippingCost });
  }

  const subtotal = cart.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);
  const totalAmount = subtotal + shippingCost;

  const debt = {
    id: 'HUT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    orderId: orderData.id,
    userId: orderData.userId || null,
    customerName: orderData.customer.name,
    username: typeof getActiveUser === 'function' && getActiveUser() ? getActiveUser().username || '' : '',
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
  localStorage.setItem(hutangKey, JSON.stringify(debts));
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
  }
});