const ordersKey = 'dikyOrders';
const activeUserKey = 'dikyActiveUser';
const ordersList = document.getElementById('orders-list');
const clearHistoryButton = document.getElementById('clear-history');

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

function formatDate(isoString) {
  return new Date(isoString).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderOrders() {
  const orders = getOrders();
  clearElement(ordersList);

  if (orders.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const heading = document.createElement('h3');
    heading.textContent = 'Belum ada pesanan';

    const text = document.createElement('p');
    text.textContent = 'Riwayat pesanan Anda masih kosong. Silakan lakukan pemesanan terlebih dahulu.';

    emptyState.append(heading, text);
    ordersList.append(emptyState);
    return;
  }

  orders.forEach((order) => {
    const orderCard = document.createElement('article');
    orderCard.className = 'order-card';

    const orderHeader = document.createElement('div');
    orderHeader.className = 'order-header';

    const orderHeaderLeft = document.createElement('div');
    const orderTitle = document.createElement('h3');
    orderTitle.textContent = `Pesanan ${order.id}`;

    const orderMeta = document.createElement('p');
    orderMeta.className = 'order-meta';
    orderMeta.textContent = `${formatDate(order.createdAt)} • ${order.customer.name}`;

    orderHeaderLeft.append(orderTitle, orderMeta);

    const deliveryLabel = document.createElement('p');
    deliveryLabel.className = 'order-delivery';
    deliveryLabel.textContent = `Metode Pengiriman: ${order.deliveryMethod || 'Tidak Ditentukan'}`;
    orderHeaderLeft.append(deliveryLabel);

    const shippingLabel = document.createElement('p');
    shippingLabel.className = 'order-shipping';
    shippingLabel.textContent = `Biaya Pengiriman: ${formatPrice(order.shippingCost || 0)}`;
    orderHeaderLeft.append(shippingLabel);

    const orderStatus = document.createElement('span');
    orderStatus.className = 'order-status';
    orderStatus.textContent = order.customer.paymentMethod;

    orderHeader.append(orderHeaderLeft, orderStatus);

    const itemList = document.createElement('div');
    itemList.className = 'item-list';

    order.cart.forEach((item) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'item-row';

      const itemImage = document.createElement('img');
      itemImage.className = 'item-image';
      itemImage.src = item.image || 'images/Toko Sayur Online.png';
      itemImage.alt = item.name;

      const itemInfo = document.createElement('div');
      const itemName = document.createElement('p');
      itemName.className = 'summary-item-title';
      itemName.textContent = item.name;

      const itemDetails = document.createElement('span');
      itemDetails.textContent = `${item.quantity} x ${formatPrice(item.price)} • ${item.unit}`;

      itemInfo.append(itemName, itemDetails);

      const itemTotal = document.createElement('div');
      itemTotal.className = 'item-total';
      itemTotal.textContent = formatPrice(item.price * item.quantity);

      itemRow.append(itemImage, itemInfo, itemTotal);
      itemList.append(itemRow);
    });

    const orderFooter = document.createElement('div');
    orderFooter.className = 'order-footer';

    const orderTotal = document.createElement('div');
    orderTotal.className = 'order-total';
    orderTotal.textContent = `Total (termasuk ongkir): ${formatPrice(order.totalPrice)}`;

    const orderActions = document.createElement('div');
    orderActions.className = 'order-actions';

    const removeButton = document.createElement('button');
    removeButton.className = 'button button-secondary';
    removeButton.type = 'button';
    removeButton.dataset.removeId = order.id;
    removeButton.textContent = 'Hapus';
    removeButton.addEventListener('click', () => removeOrder(order.id));

    orderActions.append(removeButton);
    orderFooter.append(orderTotal, orderActions);

    orderCard.append(orderHeader, itemList, orderFooter);
    ordersList.append(orderCard);
  });
}

function removeOrder(orderId) {
  const orders = getOrders().filter((order) => order.id !== orderId);
  saveOrders(orders);
  renderOrders();
}

function clearHistory() {
  if (!confirm('Yakin ingin menghapus seluruh riwayat pesanan?')) return;
  saveOrders([]);
  renderOrders();
}

function initializeOrdersPage() {
  if (!requireLogin()) return;
  renderOrders();
  clearHistoryButton.addEventListener('click', clearHistory);
}

window.addEventListener('DOMContentLoaded', initializeOrdersPage);
