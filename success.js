const lastOrderKey = 'dikyLastOrder';
const ordersKey = 'dikyOrders';
const activeUserKey = 'dikyActiveUser';
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

function requireLogin() {
  if (!getActiveUser()) {
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
  localStorage.setItem(ordersKey, JSON.stringify(orders));
}

function clearCart() {
  localStorage.removeItem('dikyCart');
  localStorage.removeItem('dikyCheckoutForm');
  localStorage.removeItem('dikyLastPosition');
}

function renderLastOrder(order) {
  clearElement(successItems);
  successTotal.textContent = formatPrice(0);

  if (!order) {
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
    itemImage.src = item.image || 'images/Toko Sayur Online.png';
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
  const order = getLastOrder();
  renderLastOrder(order);
  if (order) {
    storeOrderHistory(order);
    clearCart();
  }

  historyButton.addEventListener('click', () => {
    window.location.href = 'orders.html';
  });
}

window.addEventListener('DOMContentLoaded', initializeSuccessPage);
