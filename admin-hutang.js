'use strict';
(function () {
  var debts = [];
  var statuses = ['belum', 'lunas'];
  var list = document.getElementById('debts-list');
  var dialog = document.getElementById('detail-dialog');

  function userId() { try { var u = JSON.parse(localStorage.getItem('dikyActiveUser') || 'null'); return u && u.id ? String(u.id) : null; } catch (e) { return null; } }
  function key() { var id = userId(); return id ? 'dikyHutang_' + id : null; }
  function read() { try { var data = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(data) ? data : []; } catch (e) { return []; } }
  function readAll() {
    var result = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var storageKey = localStorage.key(i);
      if (!storageKey || storageKey.indexOf('dikyHutang_') !== 0) continue;
      readArray(storageKey).forEach(function (debt) { if (debt && typeof debt === 'object') result.push(Object.assign({ __storageKey: storageKey }, debt)); });
    }
    return result;
  }
  function readArray(storageKey) { try { var data = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(data) ? data : []; } catch (e) { return []; } }
  function resolveIdentity(debt) {
    var storageKey = debt && debt.__storageKey ? String(debt.__storageKey) : '';
    var userId = storageKey.indexOf('dikyHutang_') === 0 ? storageKey.slice(11) : '';
    var identifiers = [debt && debt.userId, debt && debt.email, debt && debt.emailAddress, debt && debt.phone, debt && debt.phoneNumber].filter(Boolean).map(String);
    try {
      var users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
      var user = Array.isArray(users) ? users.find(function (candidate) {
        var values = candidate ? [candidate.id, candidate.email, candidate.emailAddress, candidate.phone, candidate.phoneNumber, candidate.whatsappNumber].filter(Boolean).map(String) : [];
        return (userId && values.indexOf(userId) !== -1) || identifiers.some(function (value) { return values.indexOf(value) !== -1; });
      }) : null;
      return { username: debt.username || (user && user.username) || '-', profileImage: debt.profileImage || debt.avatarUrl || (user && (user.profileImage || user.avatarUrl)) || 'images/Toko Sayur Online.png' };
    } catch (error) { return { username: debt.username || '-', profileImage: 'images/Toko Sayur Online.png' }; }
  }
  function resolveImage(item) {
    var fallback = 'images/Toko Sayur Online.png';
    try {
      var products = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
      var product = Array.isArray(products) && item ? products.find(function (p) { return p && String(p.id) === String(item.id); }) : null;
      if (product && product.image) return product.image;
    } catch (e) {}
    return item && item.image ? item.image : fallback;
  }
  function number(value) { var n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function status(value) { return statuses.indexOf(value) >= 0 ? value : 'belum'; }
  function esc(value) { var node = document.createElement('div'); node.textContent = value == null ? '' : String(value); return node.innerHTML; }
  function money(value) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number(value)); }
  function items(debt) { return Array.isArray(debt.items) ? debt.items : []; }

  function total(debt) { var declared = Number(debt.totalAmount); if (Number.isFinite(declared) && declared >= 0) return declared; return items(debt).reduce(function (sum, item) { return sum + number(item.price) * number(item.qty || item.quantity); }, 0); }
  function save() {
    var grouped = {};
    debts.forEach(function (debt) { var storageKey = debt.__storageKey || key(); if (storageKey) (grouped[storageKey] || (grouped[storageKey] = [])).push(debt); });
    Object.keys(grouped).forEach(function (storageKey) {
      var clean = grouped[storageKey].map(function (debt) { var copy = Object.assign({}, debt); delete copy.__storageKey; return copy; });
      localStorage.setItem(storageKey, JSON.stringify(clean));
    });
  }
  function render() {
    var query = document.getElementById('search-debts').value.toLowerCase().trim();
    var filter = document.getElementById('status-filter').value;
    var visible = debts.filter(function (debt) {
      var text = (String(debt.id || '') + ' ' + String(debt.orderId || '') + ' ' + String(debt.customerName || '')).toLowerCase();
      return (!query || text.indexOf(query) !== -1) && (filter === 'all' || status(debt.status) === filter);
    });
    var unpaid = debts.filter(function (debt) { return status(debt.status) === 'belum'; });
    document.getElementById('unpaid-count').textContent = unpaid.length.toLocaleString('id-ID');
    document.getElementById('customer-count').textContent = new Set(unpaid.map(function (debt) { return String(debt.customerName || '').toLowerCase(); })).size.toLocaleString('id-ID');
    document.getElementById('unpaid-total').textContent = money(unpaid.reduce(function (sum, debt) { return sum + total(debt); }, 0));
    document.getElementById('debts-summary').textContent = visible.length + ' transaksi ditampilkan dari ' + debts.length + ' transaksi.';
    if (!visible.length) { list.innerHTML = '<div class="empty">Belum ada catatan kasbon yang sesuai.</div>'; return; }
    list.innerHTML = visible.map(function (debt) {
      var debtItems = items(debt); var identity = resolveIdentity(debt); var ownerId = debt.userId || (debt.__storageKey ? String(debt.__storageKey).replace(/^dikyHutang_/, '') : 'tidak diketahui');
      return '<article class="debt-card" data-owner-id="' + esc(ownerId) + '"><div class="debt-top"><div><p class="debt-id">' + esc(debt.id || 'Tanpa ID') + '</p><img class="customer-avatar" width="44" height="44" src="' + esc(identity.profileImage) + '" alt="Foto profil ' + esc(identity.username) + '" loading="lazy" style="width:44px;height:44px;max-width:44px;max-height:44px;object-fit:cover;border-radius:50%;display:block;"><p class="debt-name">' + esc(debt.customerName || 'Pelanggan') + '</p><p class="debt-meta">Akun: @' + esc(identity.username) + ' · ID: ' + esc(ownerId) + '</p><p class="debt-meta">Order: ' + esc(debt.orderId || '-') + ' · ' + esc(debt.date || debt.createdAt || '-') + '</p></div><select class="status-select" data-status-id="' + esc(debt.id) + '" aria-label="Status kasbon"><option value="belum"' + (status(debt.status) === 'belum' ? ' selected' : '') + '>Belum Lunas</option><option value="lunas"' + (status(debt.status) === 'lunas' ? ' selected' : '') + '>Lunas</option></select></div><div class="items">' + debtItems.map(function (item) { return '<div class="item"><img src="' + esc(resolveImage(item)) + '" alt="' + esc(item.name || 'Produk') + '"><div class="item-info"><p class="item-name">' + esc(item.name || 'Produk') + '</p><p class="item-meta">' + esc(item.qty || item.quantity || 0) + ' × ' + money(item.price) + '</p></div></div>'; }).join('') + '</div><div class="debt-bottom"><strong class="total">' + money(total(debt)) + '</strong><div class="actions"><button class="action" type="button" data-detail-id="' + esc(debt.id) + '">Lihat Detail</button></div></div></article>';
    }).join('');
  }
  function showDetail(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    document.getElementById('debt-detail').innerHTML = '<div class="detail"><p><strong>ID Kasbon:</strong> ' + esc(debt.id) + '</p><p><strong>ID Order:</strong> ' + esc(debt.orderId || '-') + '</p><p><strong>Pelanggan:</strong> ' + esc(debt.customerName || '-') + '</p><p><strong>Telepon:</strong> ' + esc(debt.phone || '-') + '</p><p><strong>Alamat:</strong> ' + esc(debt.address || '-') + '</p><p><strong>Status:</strong> ' + (status(debt.status) === 'lunas' ? 'Lunas' : 'Belum Lunas') + '</p><p><strong>Total:</strong> ' + money(total(debt)) + '</p><ul class="detail-items">' + items(debt).map(function (item) { return '<li>' + esc(item.name) + ' × ' + esc(item.qty || item.quantity || 0) + '</li>'; }).join('') + '</ul></div>';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  list.addEventListener('change', function (event) {
    var id = event.target.dataset.statusId;
    if (!id) return;
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (debt) {
      debt.status = status(event.target.value);
      debt.paymentDate = debt.status === 'lunas' ? new Date().toISOString() : null;
      save();
      render();
    }
  });
  list.addEventListener('click', function (event) {
    var button = event.target.closest('[data-detail-id]');
    if (button) showDetail(button.dataset.detailId);
  });
  document.getElementById('search-debts').addEventListener('input', render);
  document.getElementById('status-filter').addEventListener('change', render);
  document.getElementById('refresh-button').addEventListener('click', function () { debts = readAll(); render(); });
  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  window.addEventListener('storage', function () { debts = readAll(); render(); });
  document.addEventListener('DOMContentLoaded', function () { debts = readAll(); render(); });
}());