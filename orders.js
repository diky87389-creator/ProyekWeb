const ordersList = document.getElementById('orders-list');
const clearHistoryButton = document.getElementById('clear-history');
const orderTabs = document.getElementById('order-tabs');
let activeTab = 'dikemas';
let activeMap;
let renderedMaps = [];
const mapStates = new Map();
let orderSyncTimer;
const ROUTING_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';

function destroyRenderedMaps() {
  renderedMaps.forEach((map) => {
    if (map && typeof map.remove === 'function') map.remove();
  });
  renderedMaps = [];
  mapStates.clear();
  activeMap = null;
}

function scheduleOrderSync() {
  if (orderSyncTimer) window.clearInterval(orderSyncTimer);
  orderSyncTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    updateCourierLocations();
  }, 2000);
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

function getOrders() {
  const historyKey = getUserStorageKey('riwayatPesanan');
  if (!historyKey) return [];

  // Riwayat tampilan user berdiri sendiri. Jangan membaca dikyOrders_* di
  // sini karena key tersebut adalah arsip operasional permanen milik admin.
  try {
    const raw = localStorage.getItem(historyKey);
    const history = raw ? JSON.parse(raw) : [];
    const ordersKey = getUserStorageKey('orders');
    const current = ordersKey ? JSON.parse(localStorage.getItem(ordersKey) || '[]') : [];
    const merged = Array.isArray(history) ? history.slice() : [];
    (Array.isArray(current) ? current : []).forEach((order) => {
      const index = merged.findIndex((entry) => entry && entry.id === order.id);
      if (index >= 0) merged[index] = Object.assign({}, merged[index], order);
      else merged.push(order);
    });
    if (merged.length) {
      localStorage.setItem(historyKey, JSON.stringify(merged));
      return merged;
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.warn('Data riwayat pesanan user tidak valid.', error);
  }

  // Migrasi satu kali untuk user lama: salin data ke key riwayat user.
  const adminOrdersKey = getUserStorageKey('orders');
  try {
    const legacy = adminOrdersKey ? JSON.parse(localStorage.getItem(adminOrdersKey) || '[]') : [];
    if (Array.isArray(legacy) && legacy.length > 0) {
      localStorage.setItem(historyKey, JSON.stringify(legacy));
      return legacy;
    }
  } catch (error) {
    console.warn('Migrasi riwayat pesanan user gagal.', error);
  }
  return [];
}

function saveOrders(orders) {
  const historyKey = getUserStorageKey('riwayatPesanan');
  if (!historyKey) return;
  try {
    // Aksi hapus user hanya memodifikasi salinan riwayat ini.
    localStorage.setItem(historyKey, JSON.stringify(Array.isArray(orders) ? orders : []));
  } catch (error) {
    console.warn('Riwayat pesanan user tidak dapat disimpan.', error);
  }
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

function deliveryType(order) {
  return String(order && order.deliveryMethod || '').toLowerCase() === 'diantar ke rumah' ? 'home' : 'pickup';
}

function statusLabel(status) {
  return status === 'siap_diambil' ? 'Silahkan Untuk Diambil' : status === 'dikirim' ? 'Dikirim' : status === 'selesai' ? 'Selesai' : 'Dikemas';
}

function renderTabs(orders) {
  const type = orders.length && deliveryType(orders[0]) === 'home' ? 'home' : 'pickup';
  const tabs = [
    ['dikemas', 'Dikemas'],
    [type === 'home' ? 'dikirim' : 'siap_diambil', type === 'home' ? 'Dikirim' : 'Silahkan Untuk Diambil'],
    ['selesai', 'Selesai']
  ];
  orderTabs.innerHTML = tabs.map(([value, label]) => `<button class="order-tab${activeTab === value ? ' active' : ''}" type="button" role="tab" aria-selected="${activeTab === value}" data-tab="${value}">${label}</button>`).join('');
  if (!tabs.some(([value]) => value === activeTab)) activeTab = tabs[0][0];
  orderTabs.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    renderOrders();
    if (activeTab === 'dikirim' && activeMap) {
      window.setTimeout(() => activeMap.invalidateSize(), 200);
    }
  }));
}

function updateClearHistoryVisibility(orders) {
  if (!clearHistoryButton) return;
  const hasCompletedOrders = orders.some((order) => (order.status || '') === 'selesai');
  clearHistoryButton.hidden = activeTab !== 'selesai' || !hasCompletedOrders;
}

function renderDeliveryMap(order, container) {
  if (deliveryType(order) !== 'home' || !order || !container || typeof window.L === 'undefined') return;
  const latitude = Number(order.customer && order.customer.latitude != null ? order.customer.latitude : order.latitude);
  const longitude = Number(order.customer && order.customer.longitude != null ? order.customer.longitude : order.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  let courierLocation = order.courierLocation || null;
  try {
    const locationKey = `dikyCourierLocation_${order.id}`;
    courierLocation = JSON.parse(localStorage.getItem(locationKey) || 'null') || courierLocation;
  } catch (error) {
    courierLocation = order.courierLocation || null;
  }
  const courierLatitude = Number(courierLocation && courierLocation.latitude);
  const courierLongitude = Number(courierLocation && courierLocation.longitude);
  const hasCourierLocation = Number.isFinite(courierLatitude) && Number.isFinite(courierLongitude);
  const mapElement = document.createElement('div');
  mapElement.className = 'order-map';
  container.append(mapElement);
  const map = L.map(mapElement).setView([latitude, longitude], 15);
  renderedMaps.push(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const customerMarker = L.marker([latitude, longitude]).addTo(map).bindPopup('Lokasi pengiriman pelanggan').openPopup();
  const courierIcon = L.divIcon({ className: 'courier-map-icon', html: '🚚', iconSize: [32, 32], iconAnchor: [16, 16] });
  const courierMarker = hasCourierLocation ? L.marker([courierLatitude, courierLongitude], { icon: courierIcon }).addTo(map).bindPopup('Posisi terkini kurir') : null;
  const route = L.polyline([], { color: '#1769e0', weight: 5, opacity: 0.9 }).addTo(map);
  const state = { orderId: String(order.id), map, customer: [latitude, longitude], customerMarker, courierMarker, route, routeRequest: 0, hasFitted: false, lastCourierPoint: null };
  mapStates.set(String(order.id), state);
  if (hasCourierLocation) {
    updateMapState(state, [courierLatitude, courierLongitude]);
  } else {
    const notice = document.createElement('p');
    notice.className = 'courier-location-note';
    notice.textContent = 'Posisi kurir sedang menunggu pembaruan GPS.';
    container.append(notice);
  }
  activeMap = map;
  window.setTimeout(() => {
    map.invalidateSize();
  }, 200);
}

function getCourierLocation(order) {
  let location = order && order.courierLocation;
  try {
    location = JSON.parse(localStorage.getItem(`dikyCourierLocation_${order.id}`) || 'null') || location;
  } catch (error) { }
  const latitude = Number(location && location.latitude);
  const longitude = Number(location && location.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

async function updateRoute(state, courierPoint) {
  if (state.lastRoutePoint && state.lastRoutePoint[0] === courierPoint[0] && state.lastRoutePoint[1] === courierPoint[1]) return;
  state.lastRoutePoint = courierPoint.slice();
  const requestId = ++state.routeRequest;
  const [courierLatitude, courierLongitude] = courierPoint;
  const [customerLatitude, customerLongitude] = state.customer;
  const fallback = [courierPoint, state.customer];
  try {
    const response = await fetch(`${ROUTING_ENDPOINT}/${courierLongitude},${courierLatitude};${customerLongitude},${customerLatitude}?overview=full&geometries=geojson`);
    if (!response.ok) throw new Error('Routing service unavailable');
    const data = await response.json();
    const routePoints = data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates;
    if (requestId !== state.routeRequest) return;
    state.route.setLatLngs(routePoints && routePoints.length ? routePoints.map(([longitude, latitude]) => [latitude, longitude]) : fallback);
  } catch (error) {
    if (requestId === state.routeRequest) state.route.setLatLngs(fallback);
  }
  if (!state.hasFitted) {
    state.map.fitBounds(state.route.getBounds(), { padding: [28, 28] });
    state.hasFitted = true;
  }
}

function updateMapState(state, courierPoint) {
  if (!state || !courierPoint) return;
  if (!courierPoint.every(Number.isFinite)) return;
  if (state.lastCourierPoint && state.lastCourierPoint[0] === courierPoint[0] && state.lastCourierPoint[1] === courierPoint[1]) return;
  state.lastCourierPoint = courierPoint;
  if (!state.courierMarker) {
    const courierIcon = L.divIcon({ className: 'courier-map-icon', html: '🚚', iconSize: [32, 32], iconAnchor: [16, 16] });
    state.courierMarker = L.marker(courierPoint, { icon: courierIcon }).addTo(state.map).bindPopup('Posisi terkini kurir');
  } else {
    state.courierMarker.setLatLng(courierPoint);
  }
  updateRoute(state, courierPoint);
}

function updateCourierLocations() {
  if (activeTab !== 'dikirim') return;
  const orders = getOrders();
  mapStates.forEach((state) => {
    const order = orders.find((item) => String(item.id) === state.orderId);
    const courierPoint = order ? getCourierLocation(order) : null;
    if (courierPoint) updateMapState(state, courierPoint);
  });
}

function renderOrders() {
  const orders = getOrders();
  renderTabs(orders);
  updateClearHistoryVisibility(orders);
  destroyRenderedMaps();
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

  const visibleOrders = orders.filter((order) => {
    if (activeTab === 'dikemas') return !['dikirim', 'siap_diambil', 'selesai', 'dibatalkan'].includes(order.status || 'menunggu');
    return (order.status || 'menunggu') === activeTab;
  });
  if (!visibleOrders.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'Belum ada pesanan pada status ini.';
    ordersList.append(emptyState);
    return;
  }

  visibleOrders.forEach((order) => {
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
    orderStatus.textContent = statusLabel(order.status);

    orderHeader.append(orderHeaderLeft, orderStatus);

    const statusMessage = document.createElement('p');
    statusMessage.className = 'order-status-message';
    statusMessage.textContent = activeTab === 'dikemas' ? 'Pesanan sedang dikemas, mohon untuk ditunggu' : statusLabel(order.status);
    orderHeaderLeft.append(statusMessage);

    if (activeTab === 'dikirim') {
      const customer = order.customer && typeof order.customer === 'object' ? order.customer : {};
      const customerAddress = String(customer.address || order.address || '').trim();
      const deliveryAddress = document.createElement('p');
      deliveryAddress.className = 'delivery-address';
      deliveryAddress.textContent = `Kurir sedang dalam perjalanan mengantar pesanan ke alamat: ${customerAddress || 'Alamat belum tersedia'}`;
      orderHeaderLeft.append(deliveryAddress);
    }

    const itemList = document.createElement('div');
    itemList.className = 'item-list';

    (order.cart || order.items || []).forEach((item) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'item-row';

      const itemImage = document.createElement('img');
      itemImage.className = 'item-image';
      itemImage.src = typeof resolveProductImage === 'function' ? resolveProductImage(item) : (item.image || 'images/Toko Sayur Online.png');
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

    if (activeTab === 'dikirim') renderDeliveryMap(order, orderCard);
    if (activeTab === 'siap_diambil') {
      const pickupAddress = document.createElement('p');
      pickupAddress.className = 'pickup-address';
      pickupAddress.textContent = 'Lokasi pengambilan: Warung Sayur Diky, Jl. Contoh Alamat No. 1, Kota Tangerang';
        orderCard.append(pickupAddress);
    }
    orderCard.append(orderHeader, itemList, orderFooter);
    ordersList.append(orderCard);
  });
}

window.addEventListener('storage', function (event) {
  const userOrdersKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('orders') : null;
  const historyKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('riwayatPesanan') : null;
  const isCourierLocationChange = typeof event.key === 'string' && event.key.startsWith('dikyCourierLocation_');
  if (event.key !== userOrdersKey && event.key !== historyKey && !isCourierLocationChange) return;
  if (isCourierLocationChange) {
    const orderId = event.key.slice('dikyCourierLocation_'.length);
    const state = mapStates.get(orderId);
    if (state) {
      try { const location = JSON.parse(event.newValue || 'null'); if (location) updateMapState(state, [Number(location.latitude), Number(location.longitude)]); } catch (error) { }
    }
    return;
  }
  renderOrders();
});

window.addEventListener('beforeunload', function () {
  if (orderSyncTimer) window.clearInterval(orderSyncTimer);
  destroyRenderedMaps();
});

window.addEventListener('DOMContentLoaded', function () {
  if (window.SmartGuide && typeof window.SmartGuide.init === 'function') {
    window.SmartGuide.init();
  }
});
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

  try {
    const requestedTab = sessionStorage.getItem('dikySmartGuideOrderTab');
    if (['dikemas', 'dikirim', 'siap_diambil', 'selesai'].includes(requestedTab)) {
      activeTab = requestedTab;
    }
    sessionStorage.removeItem('dikySmartGuideOrderTab');
  } catch (error) {
    console.warn('Tab tujuan Smart Guide tidak dapat dibaca.', error);
  }

  const checkoutFormKey = getUserStorageKey('checkoutForm');
  if (checkoutFormKey) {
    localStorage.removeItem(checkoutFormKey);
  }

  // Validasi navigasi ke riwayat pesanan:
  // Jika diakses via URL manual, riwayat pesanan LAMA tetap ditampilkan dengan aman,
  // dan pesanan baru dari success.html TIDAK dimasukkan ke riwayat.
  if (typeof validasiNavigasiKeRiwayat === 'function') {
    validasiNavigasiKeRiwayat();
  }
  if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
    window.NavigationGuard.validateAccess('orders.html');
  }

  // Render hanya data riwayat yang sudah tersimpan. Tidak ada sinkronisasi
  // dari pesananAktif/lastOrder di halaman ini, termasuk saat URL manual.
  // Riwayat lama tidak dihapus oleh validasi navigasi.
  // Render ulang daftar riwayat pesanan
  forceCleanReRender();
  scheduleOrderSync();

  clearHistoryButton.addEventListener('click', clearHistory);
}

function forceCleanReRender() {
  // Clear all UI elements and re-render with current user's order data
  clearElement(ordersList);
  renderOrders();

  console.log('Clean re-render completed for orders page');
}

window.addEventListener('DOMContentLoaded', initializeOrdersPage);
window.addEventListener('pageshow', function () {
  if (typeof isValidSession === 'function' && isValidSession()) {
    if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
      window.NavigationGuard.validateAccess('orders.html');
    }
    forceCleanReRender();
  }
});
