const successItems = document.getElementById('success-items');
const successTotal = document.getElementById('success-total');
const orderDate = document.getElementById('order-date');
const historyButton = document.getElementById('history-button');
const continueButton = document.getElementById('continue-button');

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

function getLastOrder() {
  if (typeof getPesananAktif === 'function') {
    const activeOrder = getPesananAktif();
    if (activeOrder) return activeOrder;
  }

  const lastOrderKey = getUserStorageKey('lastOrder');
  if (!lastOrderKey) {
    console.warn('getLastOrder: Tidak dapat mengakses order terakhir - user tidak valid');
    return null;
  }

  const raw = localStorage.getItem(lastOrderKey);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Data order terakhir tidak valid.', error);
    localStorage.removeItem(lastOrderKey);
    return null;
  }
}

function getOrders() {
  const ordersKey = getUserStorageKey('orders');
  if (!ordersKey) {
    console.warn('getOrders: Tidak dapat mengakses orders - user tidak valid');
    return [];
  }

  const raw = localStorage.getItem(ordersKey);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Data riwayat pesanan tidak valid.', error);
    localStorage.removeItem(ordersKey);
    return [];
  }
}

function saveOrders(orders) {
  const ordersKey = getUserStorageKey('orders');
  if (!ordersKey) {
    console.warn('saveOrders: Tidak dapat menyimpan orders - user tidak valid');
    return;
  }

  localStorage.setItem(ordersKey, JSON.stringify(orders));
}

function clearTemporaryCheckoutData() {
  const checkoutFormKey = getUserStorageKey('checkoutForm');
  if (checkoutFormKey) {
    localStorage.removeItem(checkoutFormKey);
  }

  const customerNameField = document.getElementById('customer-name');
  const customerPhoneField = document.getElementById('customer-phone');
  const customerAddressField = document.getElementById('customer-address');
  if (customerNameField) customerNameField.value = '';
  if (customerPhoneField) customerPhoneField.value = '';
  if (customerAddressField) customerAddressField.value = '';

  // CATATAN: JANGAN hapus cartKey di sini! Keranjang belanja kedua tetap aman di localStorage.
}

function renderLastOrder(order) {
  clearElement(successItems);
  successTotal.textContent = formatPrice(0);

  if (!order || !order.cart || !Array.isArray(order.cart)) {
    orderDate.textContent = '-';
    const deliveryMethodValue = document.getElementById('order-delivery-method');
    if (deliveryMethodValue) deliveryMethodValue.textContent = '-';
    const subtotalElement = document.getElementById('success-subtotal');
    if (subtotalElement) subtotalElement.textContent = formatPrice(0);
    const shippingElement = document.getElementById('success-shipping');
    if (shippingElement) shippingElement.textContent = formatPrice(0);
    const shippingCostValue = document.getElementById('order-shipping-cost');
    if (shippingCostValue) shippingCostValue.textContent = formatPrice(0);
    successTotal.textContent = formatPrice(0);

    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'success-empty';
    emptyMessage.textContent = 'Tidak ada data pesanan terakhir.';
    successItems.append(emptyMessage);
    return;
  }

  orderDate.textContent = new Date(order.createdAt).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const deliveryMethodValue = document.getElementById('order-delivery-method');
  const deliveryMethodText = order.deliveryMethod || 'Tidak Ditentukan';

  if (deliveryMethodValue) {
    deliveryMethodValue.textContent = deliveryMethodText;
  } else {
    const deliveryRow = document.createElement('div');
    deliveryRow.className = 'summary-row';
    const deliveryLabel = document.createElement('span');
    deliveryLabel.textContent = 'Metode Pengiriman';
    const deliveryValue = document.createElement('strong');
    deliveryValue.id = 'order-delivery-method';
    deliveryValue.textContent = deliveryMethodText;
    deliveryRow.append(deliveryLabel, deliveryValue);
    const summaryDetails = document.querySelector('.summary-details');
    if (summaryDetails) summaryDetails.append(deliveryRow);
  }

  const shippingCost = Number.isFinite(order.shippingCost) ? order.shippingCost : 0;
  const subtotal = Math.max(0, (order.totalPrice || 0) - shippingCost);

  const subtotalElement = document.getElementById('success-subtotal');
  if (subtotalElement) {
    subtotalElement.textContent = formatPrice(subtotal);
  }

  const shippingElement = document.getElementById('success-shipping');
  if (shippingElement) {
    shippingElement.textContent = formatPrice(shippingCost);
  }

  const shippingCostValue = document.getElementById('order-shipping-cost');
  if (shippingCostValue) {
    shippingCostValue.textContent = formatPrice(shippingCost);
  } else {
    const shippingRow = document.createElement('div');
    shippingRow.className = 'summary-row';
    const shippingLabel = document.createElement('span');
    shippingLabel.textContent = 'Biaya Pengiriman';
    const shippingValue = document.createElement('strong');
    shippingValue.id = 'order-shipping-cost';
    shippingValue.textContent = formatPrice(shippingCost);
    shippingRow.append(shippingLabel, shippingValue);
    const summaryDetails = document.querySelector('.summary-details');
    if (summaryDetails) summaryDetails.append(shippingRow);
  }

  order.cart.forEach((item) => {
    const summaryItem = document.createElement('div');
    summaryItem.className = 'summary-item';

    const itemImage = document.createElement('img');
    itemImage.className = 'summary-item-image';
    itemImage.src = typeof resolveProductImage === 'function' ? resolveProductImage(item) : (item.image || 'images/Toko Sayur Online.png');
    itemImage.alt = item.name;

    const summaryInfo = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'summary-item-title';
    title.textContent = item.name;

    const meta = document.createElement('p');
    meta.className = 'summary-item-meta';
    meta.textContent = `${item.quantity} x ${formatPrice(item.price)} | ${item.unit}`;

    summaryInfo.append(title, meta);

    const summaryTotalItem = document.createElement('div');
    summaryTotalItem.className = 'summary-item-total';
    summaryTotalItem.textContent = formatPrice(item.price * item.quantity);

    summaryItem.append(itemImage, summaryInfo, summaryTotalItem);
    successItems.append(summaryItem);
  });

  successTotal.textContent = formatPrice(order.totalPrice);
}

function storeOrderHistory(order) {
  if (!order) return;

  const orders = getOrders();
  const exists = orders.some((entry) => entry.id === order.id);
  if (!exists) {
    orders.unshift(order);
    saveOrders(orders);
  }
}

function initializeSuccessPage() {
  if (!requireLogin()) return;

  // Proteksi navigasi anti-URL manual bypass:
  // Halaman tetap dibuka, tetapi jika akses tidak sah via ketik URL manual,
  // data pesanan sukses dihapus/dibersihkan sehingga detail pesanan tampil kosong.
  if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
    window.NavigationGuard.validateAccess('success.html');
  }

  const order = getLastOrder();
  renderLastOrder(order);
  clearTemporaryCheckoutData();

  historyButton.addEventListener('click', () => {
    // Memindahkan data pesananAktif ke riwayatPesanan (array di localStorage)
    if (typeof pindahkanKeRiwayatPesanan === 'function') {
      pindahkanKeRiwayatPesanan();
    } else {
      if (order) {
        storeOrderHistory(order);
      }
      const activeKey = getUserStorageKey('pesananAktif');
      if (activeKey) localStorage.removeItem(activeKey);
      const lastOrderKey = getUserStorageKey('lastOrder');
      if (lastOrderKey) {
        localStorage.removeItem(lastOrderKey);
      }
    }

    const checkoutFormKey = getUserStorageKey('checkoutForm');
    if (checkoutFormKey) {
      localStorage.removeItem(checkoutFormKey);
    }
    if (typeof clearUserLastPosition === 'function') clearUserLastPosition();

    // Berikan otorisasi navigasi sah ke orders.html dari tombol Lihat Riwayat Pesanan
    if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
      window.NavigationGuard.grantAccess('orders.html', 'success_history_button');
    }

    window.location.href = 'orders.html';
  });
}

window.addEventListener('DOMContentLoaded', initializeSuccessPage);
window.addEventListener('pageshow', function() {
  if (typeof isValidSession === 'function' && isValidSession()) {
    if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
      window.NavigationGuard.validateAccess('success.html');
    }
    const order = getLastOrder();
    renderLastOrder(order);
  }
});