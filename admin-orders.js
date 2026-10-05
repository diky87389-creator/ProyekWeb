'use strict';
(function () {
  var orders = [];
  var statuses = ['menunggu', 'diproses', 'dikirim', 'siap_diambil', 'selesai', 'dibatalkan'];
  var courierOptions = ['Kurir A', 'Kurir B', 'Kurir C', 'Kurir D'];
  var courierWatchers = {};
  var orderList = document.getElementById('orders-list');
  var dialog = document.getElementById('detail-dialog');

  function userId() { try { var u = JSON.parse(localStorage.getItem('dikyActiveUser') || 'null'); return u && u.id ? String(u.id) : null; } catch (e) { return null; } }
  function readArray(key) { try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function orderKey() { var id = userId(); return id ? 'dikyOrders_' + id : null; }
  function courierLocationKey(orderId) { return orderId ? 'dikyCourierLocation_' + String(orderId) : null; }
  function readCourierLocation(order) {
    var locationKey = courierLocationKey(order && order.id);
    try { return (locationKey ? JSON.parse(localStorage.getItem(locationKey) || 'null') : null) || (order && order.courierLocation) || null; } catch (e) { return (order && order.courierLocation) || null; }
  }
  function money(value) { var n = Number(value); return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number.isFinite(n) && n >= 0 ? n : 0); }
  function esc(value) { var d = document.createElement('div'); d.textContent = value == null ? '' : String(value); return d.innerHTML; }
  function validStatus(status) { return statuses.indexOf(String(status || '').toLowerCase()) !== -1 ? String(status).toLowerCase() : 'menunggu'; }
  function isHomeDelivery(order) { var customer = order && order.customer || {}; var method = String(order && (order.deliveryMethod || customer.deliveryMethod) || '').toLowerCase().trim(); return method === 'diantar ke rumah' || method === 'dianter ke rumah'; }
  function actionLabel(status) { return status === 'siap_diambil' ? 'Silahkan Untuk Diambil' : status.charAt(0).toUpperCase() + status.slice(1); }
  function buildInitials(name) { var words = String(name || '').trim().split(/[\s@._-]+/).filter(Boolean); return (words.slice(0, 2).map(function (word) { return word.charAt(0); }).join('') || 'WS').toUpperCase(); }
  function avatarMarkup(identity) { return identity.profileImage ? '<img class="customer-avatar" width="44" height="44" src="' + esc(identity.profileImage) + '" alt="Foto profil ' + esc(identity.username) + '" loading="lazy" style="width:44px;height:44px;max-width:44px;max-height:44px;object-fit:cover;border-radius:50%;display:block;">' : '<span class="customer-avatar customer-avatar-initials" aria-label="Inisial ' + esc(identity.username) + '">' + esc(identity.initials) + '</span>'; }
  function resolveIdentity(order) {
    var customer = order && order.customer && typeof order.customer === 'object' ? order.customer : {};
    var storageKey = order && order.__storageKey ? String(order.__storageKey) : '';
    var userId = storageKey.indexOf('dikyOrders_') === 0 ? storageKey.slice(11) : '';
    var identifiers = [order && order.userId, customer.userId, order && order.email, order && order.emailAddress, customer.email, customer.emailAddress, order && order.phone, order && order.phoneNumber, customer.phone, customer.phoneNumber].filter(Boolean).map(String);
    try {
      var users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
      var user = Array.isArray(users) ? users.find(function (candidate) {
        var values = candidate ? [candidate.id, candidate.email, candidate.emailAddress, candidate.phone, candidate.phoneNumber, candidate.whatsappNumber].filter(Boolean).map(String) : [];
        return (userId && values.indexOf(userId) !== -1) || identifiers.some(function (value) { return values.indexOf(value) !== -1; });
      }) : null;
      var fullName = order.fullName || customer.name || order.customerName || (user && user.fullName) || '';
      return { username: order.username || customer.username || (user && user.username) || '-', initials: buildInitials(fullName), profileImage: order.profileImage || order.avatarUrl || customer.profileImage || customer.avatarUrl || (user && (user.profileImage || user.avatarUrl)) || null, gender: order.gender || customer.gender || (user && user.gender) || '-', birthDate: order.birthDate || customer.birthDate || (user && user.birthDate) || '-' };
    } catch (error) { return { username: order.username || customer.username || '-', initials: buildInitials(order.fullName || customer.name || order.customerName), profileImage: null }; }
  }
  function resolveImage(item) {
    var fallback = 'images/Toko Sayur Online.png';
    try {
      var products = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
      var product = Array.isArray(products) && item ? products.find(function (p) { return p && String(p.id) === String(item.id); }) : null;
      if (product && product.image) return product.image;
    } catch (e) { }
    return item && item.image ? item.image : fallback;
  }
  function readAllOrders() {
    var result = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var storageKey = localStorage.key(i);
      if (!storageKey || storageKey.indexOf('dikyOrders_') !== 0) continue;
      readArray(storageKey).forEach(function (order) {
        if (order && typeof order === 'object') result.push(Object.assign({ __storageKey: storageKey }, order));
      });
    }
    return result;
  }
  function load() {
    orders = readAllOrders();
    // Jangan memulai watchPosition saat load/refresh; izin GPS hanya diminta
    // dari aksi perubahan status menjadi "Dikirim".
    render();
  }
  function cleanOrder(order) { var copy = Object.assign({}, order); delete copy.__storageKey; return copy; }
  function save() {
    var grouped = {};
    orders.forEach(function (order) {
      var storageKey = order.__storageKey || orderKey();
      if (storageKey) (grouped[storageKey] || (grouped[storageKey] = [])).push(order);
    });
    var storageKeys = Object.keys(grouped);
    var previousValues = {};
    storageKeys.forEach(function (storageKey) { previousValues[storageKey] = localStorage.getItem(storageKey); });
    try {
      storageKeys.forEach(function (storageKey) {
        var cleanOrders = grouped[storageKey].map(cleanOrder);
        localStorage.setItem(storageKey, JSON.stringify(cleanOrders));
      });
      return true;
    } catch (error) {
      storageKeys.forEach(function (storageKey) {
        try {
          if (previousValues[storageKey] === null) localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, previousValues[storageKey]);
        } catch (restoreError) { }
      });
      orders = readAllOrders();
      window.alert('Perubahan pesanan tidak dapat disimpan karena penyimpanan browser penuh. Data sebelumnya dipertahankan bila memungkinkan.');
      return false;
    }
  }
  function items(order) { return Array.isArray(order.cart) ? order.cart : (Array.isArray(order.items) ? order.items : []); }
  function total(order) { var value = Number(order.totalPrice); if (Number.isFinite(value) && value >= 0) return value; return items(order).reduce(function (s, i) { return s + Math.max(0, Number(i.price) || 0) * Math.max(0, Number(i.quantity || i.qty) || 0); }, 0); }
  function normalizeMapAddress(addressValue) {
    var text = String(addressValue == null ? '' : addressValue).trim();
    if (!text) return '';
    if (text.indexOf(' _ ') !== -1) {
      text = text.split(' _ ')[0].trim();
    }
    return text;
  }
  function buildGoogleMapsLink(order) {
    var customer = order && order.customer && typeof order.customer === 'object' ? order.customer : {};
    var latitude = Number(customer.latitude != null ? customer.latitude : (order && order.latitude != null ? order.latitude : null));
    var longitude = Number(customer.longitude != null ? customer.longitude : (order && order.longitude != null ? order.longitude : null));
    var addressValue = customer.address || order.address || '';
    var normalizedAddress = normalizeMapAddress(addressValue);

    if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(latitude + ',' + longitude);
    }

    if (normalizedAddress) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(normalizedAddress);
    }

    return '';
  }
  function getAssignedCourier(order) {
    var selected = order && order.assignedCourier ? String(order.assignedCourier).trim() : '';
    return selected || 'Belum ditugaskan';
  }
  function getNextAction(order) {
    var currentStatus = validStatus(order.status);
    if (currentStatus === 'selesai') return { label: '✓ Selesai', status: 'selesai', disabled: true };
    if (isHomeDelivery(order)) return currentStatus === 'dikirim' ? { label: 'Selesai', status: 'selesai', disabled: false } : { label: 'Dikirim', status: 'dikirim', disabled: false };
    return currentStatus === 'siap_diambil' ? { label: 'Selesai', status: 'selesai', disabled: false } : { label: 'Silahkan Untuk Diambil', status: 'siap_diambil', disabled: false };
  }
  function stopCourierTracking(orderId) {
    var watcher = courierWatchers[String(orderId)];
    if (watcher !== undefined && navigator.geolocation) navigator.geolocation.clearWatch(watcher);
    delete courierWatchers[String(orderId)];
  }
  function clearCourierLocation(orderId) {
    stopCourierTracking(orderId);
    var locationKey = courierLocationKey(orderId);
    if (locationKey) localStorage.removeItem(locationKey);
  }
  function startCourierTracking(order) {
    if (!order || !isHomeDelivery(order) || !navigator.geolocation) return;
    stopCourierTracking(order.id);
    courierWatchers[String(order.id)] = navigator.geolocation.watchPosition(function (position) {
      order.courierLocation = {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
        updatedAt: new Date().toISOString()
      };
      var locationKey = courierLocationKey(order.id);
      if (locationKey) {
        try { localStorage.setItem(locationKey, JSON.stringify(order.courierLocation)); } catch (error) { }
      }
      save();
    }, function (error) {
      console.warn('GPS kurir tidak tersedia untuk pesanan ' + order.id + '.', error);
    }, { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 });
  }
  function applyShippedStatus(order, location) {
    if (location) {
      var locationKey = courierLocationKey(order.id);
      if (locationKey) {
        try { localStorage.setItem(locationKey, JSON.stringify(location)); } catch (error) { }
      }
      order.courierLocation = location;
    }
    order.status = 'dikirim';
    startCourierTracking(order);
    save();
    render();
  }
  function readPosition(options, onSuccess, onError) {
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
      var unavailableError = new Error('Geolocation API tidak tersedia pada browser atau konteks halaman ini.');
      console.error('[GPS] getCurrentPosition tidak tersedia.', unavailableError);
      onError(unavailableError);
      return;
    }

    console.info('[GPS] Meminta lokasi perangkat dari aksi status Dikirim.');
    try {
      navigator.geolocation.getCurrentPosition(onSuccess, function (error) {
        var reason = {
          1: 'Izin lokasi ditolak oleh browser atau pengguna.',
          2: 'Posisi perangkat tidak dapat ditentukan.',
          3: 'Permintaan lokasi melewati batas waktu.'
        }[error && error.code] || 'Alasan tidak diketahui.';
        console.error('[GPS] getCurrentPosition gagal:', reason, error);
        onError(error);
      }, options);
    } catch (error) {
      console.error('[GPS] getCurrentPosition melempar error sebelum callback:', error);
      onError(error);
    }
  }
  function markOrderAsShipped(order) {
    if (!order) return;
    clearCourierLocation(order.id);
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      console.warn('[GPS] Geolocation biasanya memerlukan HTTPS atau localhost.', window.location.href);
    }
    if (!navigator.geolocation) {
      applyShippedStatus(order, order.courierLocation || null);
      return;
    }
    var toLocation = function (position) {
      return { latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)), updatedAt: new Date().toISOString(), source: 'device-gps' };
    };
    var fallbackToCachedPosition = function (error) {
      console.warn('GPS akurasi tinggi gagal, mencoba lokasi standar.', error);
      readPosition({ enableHighAccuracy: false, maximumAge: 120000, timeout: 15000 }, function (position) {
        applyShippedStatus(order, toLocation(position));
      }, function (fallbackError) {
        console.warn('GPS standar juga gagal; status tetap Dikirim tanpa koordinat baru.', fallbackError);
        applyShippedStatus(order, order.courierLocation || null);
      });
    };
    readPosition({ enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }, function (position) {
      applyShippedStatus(order, toLocation(position));
    }, fallbackToCachedPosition);
  }
  function render() {
    var query = document.getElementById('search-orders').value.toLowerCase().trim();
    var filter = document.getElementById('status-filter').value;
    var visible = orders.filter(function (o) {
      var customerName = (o.customer && o.customer.name) || o.customerName || '';
      var text = String(o.id || '') + ' + ' + String(customerName);
      text = text.toLowerCase();
      return (!query || text.indexOf(query) !== -1) && (filter === 'all' || validStatus(o.status) === filter);
    });
    document.getElementById('orders-summary').textContent = visible.length + ' pesanan ditampilkan dari ' + orders.length + ' pesanan.';
    if (!visible.length) { orderList.innerHTML = '<div class="empty">Belum ada pesanan yang sesuai.</div>'; return; }
    orderList.innerHTML = visible.map(function (order) {
      var customer = order.customer || {}; var identity = resolveIdentity(order); var list = items(order); var mapsLink = isHomeDelivery(order) ? buildGoogleMapsLink(order) : ''; var courierValue = getAssignedCourier(order); var courierOptionsMarkup = courierOptions.map(function (courier) { return '<option value="' + esc(courier) + '"' + (courierValue === courier ? ' selected' : '') + '>' + esc(courier) + '</option>'; }).join(''); var nextAction = getNextAction(order); var ownerId = order.userId || (order.__storageKey ? String(order.__storageKey).replace(/^dikyOrders_/, '') : 'tidak diketahui'); var actionAriaLabel = nextAction.disabled ? 'Pesanan selesai' : 'Ubah status pesanan menjadi ' + nextAction.label;
        return '<article class="order-card" data-order-id="' + esc(order.id) + '" data-owner-id="' + esc(ownerId) + '"><div class="order-top"><div><p class="order-id">' + esc(order.id || 'Tanpa ID') + '</p><p class="order-meta">' + esc(customer.name || order.customerName || 'Pelanggan') + ' · ' + esc(identity.username) + ' · ' + esc(order.createdAt ? new Date(order.createdAt).toLocaleString('id-ID') : '-') + '</p><p class="order-owner">Akun pemesan: <strong>' + esc(identity.username) + '</strong> · ID: ' + esc(ownerId) + '</p>' + avatarMarkup(identity) + '</div><select class="status-select" data-status-id="' + esc(order.id) + '" aria-label="Status pesanan">' + statuses.map(function (s) { return '<option value="' + s + '"' + (validStatus(order.status) === s ? ' selected' : '') + '>' + actionLabel(s) + '</option>'; }).join('') + '</select></div>' + (isHomeDelivery(order) ? '<div class="delivery-assignment"><label for="courier-' + esc(order.id) + '">Kurir pengantar</label><select class="courier-select" id="courier-' + esc(order.id) + '" data-courier-id="' + esc(order.id) + '" aria-label="Pilih kurir untuk pesanan ' + esc(order.id) + '">' + courierOptionsMarkup + '<option value="Belum ditugaskan"' + (courierValue === 'Belum ditugaskan' ? ' selected' : '') + '>Belum ditugaskan</option></select><p class="courier-note">Petugas terpilih: <strong>' + esc(courierValue) + '</strong></p></div>' : '') + '<div class="items">' + list.map(function (i) { return '<div class="item"><img src="' + esc(resolveImage(i)) + '" alt="' + esc(i.name || 'Produk') + '"><div class="item-info"><p class="item-name">' + esc(i.name || 'Produk') + '</p><p class="item-meta">' + esc(i.quantity || i.qty || 0) + ' × ' + money(i.price) + '</p></div></div>'; }).join('') + '</div><div class="order-bottom"><strong class="total">' + money(total(order)) + '</strong><div class="primary-action-row"><button class="order-primary-action' + (nextAction.disabled ? ' is-complete' : '') + '" type="button" aria-label="' + esc(actionAriaLabel) + '" data-action-status="' + esc(nextAction.status) + '" data-action-id="' + esc(order.id) + '"' + (nextAction.disabled ? ' disabled' : '') + '>' + esc(nextAction.label) + '</button></div><div class="actions"><button class="action" type="button" data-detail-id="' + esc(order.id) + '">Lihat Detail</button>' + (mapsLink ? '<a class="action maps-link" href="' + esc(mapsLink) + '" target="_blank" rel="noopener noreferrer">Buka di Google Maps</a>' : '') + '<button class="action danger" type="button" data-delete-id="' + esc(order.id) + '">Hapus</button></div></div></article>';
    }).join('');
  }
  function detail(id) { var order = orders.find(function (o) { return String(o.id) === String(id); }); if (!order) return; var c = order.customer || {}; var identity = resolveIdentity(order); var mapsLink = isHomeDelivery(order) ? buildGoogleMapsLink(order) : ''; var courierText = getAssignedCourier(order); document.getElementById('order-detail').innerHTML = '<div class="detail"><p><strong>ID:</strong> ' + esc(order.id) + '</p><p><strong>Pelanggan:</strong> ' + esc(c.name || order.customerName || '-') + '</p><p><strong>Jenis kelamin:</strong> ' + esc(identity.gender) + '</p><p><strong>Tanggal lahir:</strong> ' + esc(identity.birthDate) + '</p><p><strong>Telepon:</strong> ' + esc(c.phone || order.phone || '-') + '</p><p><strong>Alamat:</strong> ' + esc(c.address || order.address || '-') + '</p><p><strong>Kurir yang ditugaskan:</strong> ' + esc(courierText) + '</p>' + (mapsLink ? '<p><strong>Rute:</strong> <a href="' + esc(mapsLink) + '" target="_blank" rel="noopener noreferrer">Buka di Google Maps</a></p>' : '') + '<p><strong>Status:</strong> ' + esc(validStatus(order.status)) + '</p><p><strong>Total:</strong> ' + money(total(order)) + '</p><ul class="detail-items">' + items(order).map(function (i) { return '<li>' + esc(i.name) + ' × ' + esc(i.quantity || i.qty || 0) + '</li>'; }).join('') + '</ul></div>'; if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); }
  function deleteOrder(id) {
    var order = orders.find(function (item) { return String(item.id) === String(id); });
    if (!order) return;
    if (!window.confirm('Hapus pesanan ini? Pesanan akan hilang dari panel admin SEKALIGUS dari halaman success.html, tab Dikemas/Dikirim, dan riwayat pesanan pelanggan. Lanjutkan?')) return;

    // Pembatalan terpusat: satu order dihapus dari SEMUA arsip (admin + riwayat user
    // + snapshot success.html) memakai helper global yang sama.
    var ownerId = order.userId || (order.__storageKey ? String(order.__storageKey).replace(/^dikyOrders_/, '') : '');
    if (typeof window.hapusPesananOrderLintasArsip === 'function') {
      window.hapusPesananOrderLintasArsip({ orderId: String(order.id), ownerUserId: ownerId });
    } else {
      // Fallback aman bila helper belum termuat: bersihkan arsip admin + riwayat user.
      orders = orders.filter(function (item) { return item !== order; });
      try {
        var historyKey = ownerId ? 'riwayatPesanan_' + ownerId : '';
        if (historyKey) {
          var historyRaw = JSON.parse(localStorage.getItem(historyKey) || '[]');
          if (Array.isArray(historyRaw)) {
            localStorage.setItem(historyKey, JSON.stringify(historyRaw.filter(function (entry) {
              return String(entry && (entry.id || entry.orderId) || '') !== String(order.id);
            })));
          }
        }
      } catch (error) { }
    }

    // Hentikan pelacakan kurir & bersihkan lokasi GPS order yang dibatalkan.
    clearCourierLocation(order.id);
    orders = readAllOrders();
    save(); render();
  }
  function deleteAllOrders() {
    if (!orders.length || !window.confirm('Hapus seluruh pesanan dari panel admin? Riwayat pesanan user tetap aman.')) return;
    var keys = Array.from(new Set(orders.map(function (order) { return order.__storageKey; }).filter(Boolean)));
    var previousValues = {};
    keys.forEach(function (storageKey) { previousValues[storageKey] = localStorage.getItem(storageKey); });
    try {
      keys.forEach(function (storageKey) { localStorage.setItem(storageKey, '[]'); });
    } catch (error) {
      keys.forEach(function (storageKey) {
        try {
          if (previousValues[storageKey] === null) localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, previousValues[storageKey]);
        } catch (restoreError) { }
      });
      orders = readAllOrders();
      window.alert('Riwayat tidak dapat dihapus karena penyimpanan browser penuh. Data lama tetap dipertahankan bila memungkinkan.');
      render();
      return;
    }
    orders = []; render();
  }
  orderList.addEventListener('change', function (e) {
    if (e.target.dataset.statusId) {
      var order = orders.find(function (o) { return String(o.id) === String(e.target.dataset.statusId); });
      if (order) {
        var selectedStatus = validStatus(e.target.value);
        if (selectedStatus === 'dikirim') {
          // Satu-satunya jalur opsi status yang memanggil GPS.
          markOrderAsShipped(order);
          return;
        }
        order.status = selectedStatus;
        if (order.status === 'selesai') clearCourierLocation(order.id);
        else stopCourierTracking(order.id);
        save(); render();
      }
      return;
    }
    if (e.target.dataset.courierId) {
      var courierOrder = orders.find(function (o) { return String(o.id) === String(e.target.dataset.courierId); });
      if (courierOrder) {
        courierOrder.assignedCourier = e.target.value === 'Belum ditugaskan' ? '' : e.target.value;
        save(); render();
      }
    }
  });
  orderList.addEventListener('click', function (e) { var detailButton = e.target.closest('[data-detail-id]'); var deleteButton = e.target.closest('[data-delete-id]'); var actionButton = e.target.closest('[data-action-id]'); if (detailButton) detail(detailButton.dataset.detailId); if (deleteButton) deleteOrder(deleteButton.dataset.deleteId); if (actionButton) { var actionOrder = orders.find(function (o) { return String(o.id) === String(actionButton.dataset.actionId); }); if (actionOrder && actionButton.dataset.actionStatus === 'dikirim') { markOrderAsShipped(actionOrder); } else if (actionOrder) { actionOrder.status = validStatus(actionButton.dataset.actionStatus); if (actionOrder.status === 'selesai') clearCourierLocation(actionOrder.id); else stopCourierTracking(actionOrder.id); save(); render(); } } });
  window.addEventListener('beforeunload', function () {
    Object.keys(courierWatchers).forEach(stopCourierTracking);
  });
  document.getElementById('search-orders').addEventListener('input', render); document.getElementById('status-filter').addEventListener('change', render); document.getElementById('refresh-button').addEventListener('click', load); document.getElementById('delete-all-orders').addEventListener('click', deleteAllOrders); document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  window.addEventListener('storage', load); document.addEventListener('DOMContentLoaded', load);
}());
