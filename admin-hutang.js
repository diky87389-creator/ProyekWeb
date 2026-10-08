'use strict';
(function () {
  var debts = [];
  var statuses = ['belum', 'lunas'];
  var list = document.getElementById('debts-list');
  var dialog = document.getElementById('detail-dialog');
  var ARCHIVE_KEY = 'dikyHutangArchive';
  var archiveMode = false;

  function userId() { try { var u = JSON.parse(localStorage.getItem('dikyActiveUser') || 'null'); return u && u.id ? String(u.id) : null; } catch (e) { return null; } }
  // Isolasi dua arah: panel admin membaca salinan tersendiri
  // (dikyHutangAdmin_<userId>), BUKAN key milik user (dikyHutang_<userId>).
  // Dengan begitu hapus/arsip di sini tidak pernah mempengaruhi hutang.html.
  function key() { var id = userId(); return id ? 'dikyHutangAdmin_' + id : null; }
  function read() { try { var data = JSON.parse(localStorage.getItem(key()) || '[]'); return Array.isArray(data) ? data : []; } catch (e) { return []; } }
  function readAll() {
    var result = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var storageKey = localStorage.key(i);
      if (!storageKey || storageKey.indexOf('dikyHutangAdmin_') !== 0) continue;
      readArray(storageKey).forEach(function (debt) { if (debt && typeof debt === 'object') result.push(Object.assign({ __storageKey: storageKey }, debt)); });
    }
    return result;
  }
  function readArray(storageKey) { try { var data = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(data) ? data : []; } catch (e) { return []; } }
  function buildInitials(name) { var words = String(name || '').trim().split(/[\s@._-]+/).filter(Boolean); return (words.slice(0, 2).map(function (word) { return word.charAt(0); }).join('') || 'WS').toUpperCase(); }
  function avatarMarkup(identity) { return identity.profileImage ? '<img class="customer-avatar" width="44" height="44" src="' + esc(identity.profileImage) + '" alt="Foto profil ' + esc(identity.username) + '" loading="lazy" style="width:44px;height:44px;max-width:44px;max-height:44px;object-fit:cover;border-radius:50%;display:block;">' : '<span class="customer-avatar customer-avatar-initials" aria-label="Inisial ' + esc(identity.username) + '">' + esc(identity.initials) + '</span>'; }
  function resolveIdentity(debt) {
    var storageKey = debt && debt.__storageKey ? String(debt.__storageKey) : '';
    var userId = storageKey.indexOf('dikyHutangAdmin_') === 0 ? storageKey.slice('dikyHutangAdmin_'.length) : '';
    var identifiers = [debt && debt.userId, debt && debt.email, debt && debt.emailAddress, debt && debt.phone, debt && debt.phoneNumber].filter(Boolean).map(String);
    try {
      var users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
      var user = Array.isArray(users) ? users.find(function (candidate) {
        var values = candidate ? [candidate.id, candidate.email, candidate.emailAddress, candidate.phone, candidate.phoneNumber, candidate.whatsappNumber].filter(Boolean).map(String) : [];
        return (userId && values.indexOf(userId) !== -1) || identifiers.some(function (value) { return values.indexOf(value) !== -1; });
      }) : null;
      var fullName = debt.fullName || debt.customerName || (user && user.fullName) || '';
      return { username: debt.username || (user && user.username) || '-', initials: buildInitials(fullName), profileImage: debt.profileImage || debt.avatarUrl || (user && (user.profileImage || user.avatarUrl)) || null, gender: debt.gender || (user && user.gender) || '-', birthDate: debt.birthDate || (user && user.birthDate) || '-' };
    } catch (error) { return { username: debt.username || '-', initials: buildInitials(debt.fullName || debt.customerName), profileImage: null }; }
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
  function itemImageMarkup(item) {
    var name = String(item && item.name || '').trim().toLowerCase();
    var isShipping = (item && (item.isShipping === true || item.shipping === true)) || name === 'ongkir';
    // Ongkir bukan produk: tidak ditampilkan dengan gambar sama sekali.
    var imageMarkup = isShipping ? '' : '<img src="' + esc(resolveImage(item)) + '" alt="' + esc(item && item.name || 'Produk') + '">';
    return '<div class="item">' + imageMarkup + '<div class="item-info"><p class="item-name">' + esc(item && item.name || 'Produk') + '</p><p class="item-meta">' + esc(item && (item.qty || item.quantity) || 0) + ' × ' + money(item && item.price) + '</p></div></div>';
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
    var storageKeys = Object.keys(grouped);
    var previousValues = {};
    storageKeys.forEach(function (storageKey) { previousValues[storageKey] = localStorage.getItem(storageKey); });
    try {
      storageKeys.forEach(function (storageKey) {
        var clean = grouped[storageKey].map(function (debt) { var copy = Object.assign({}, debt); delete copy.__storageKey; return copy; });
        localStorage.setItem(storageKey, JSON.stringify(clean));
      });
      return true;
    } catch (error) {
      storageKeys.forEach(function (storageKey) {
        try {
          if (previousValues[storageKey] === null) localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, previousValues[storageKey]);
        } catch (restoreError) { }
      });
      debts = readAll();
      window.alert('Perubahan hutang tidak dapat disimpan karena penyimpanan browser penuh. Data sebelumnya dipertahankan bila memungkinkan.');
      return false;
    }
  }
  function render() {
    if (archiveMode) { renderArchive(); return; }
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
      var debtItems = items(debt); var identity = resolveIdentity(debt); var ownerId = debt.userId || (debt.__storageKey ? String(debt.__storageKey).replace(/^dikyHutangAdmin_/, '') : 'tidak diketahui'); var canArchive = status(debt.status) === 'lunas';
      return '<article class="debt-card" data-owner-id="' + esc(ownerId) + '"><div class="debt-top"><div><p class="debt-id">' + esc(debt.id || 'Tanpa ID') + '</p>' + avatarMarkup(identity) + '<p class="debt-name">' + esc(debt.customerName || 'Pelanggan') + '</p><p class="debt-meta">Akun: @' + esc(identity.username) + ' · ID: ' + esc(ownerId) + '</p><p class="debt-meta">Order: ' + esc(debt.orderId || '-') + ' · ' + esc(debt.date || debt.createdAt || '-') + '</p></div><select class="status-select" data-status-id="' + esc(debt.id) + '" aria-label="Status kasbon"><option value="belum"' + (status(debt.status) === 'belum' ? ' selected' : '') + '>Belum Lunas</option><option value="lunas"' + (status(debt.status) === 'lunas' ? ' selected' : '') + '>Lunas</option></select></div><div class="items">' + debtItems.map(function (item) { return itemImageMarkup(item); }).join('') + '</div><div class="debt-bottom"><strong class="total">' + money(total(debt)) + '</strong><div class="actions"><button class="action" type="button" data-detail-id="' + esc(debt.id) + '">Lihat Detail</button>' + (canArchive ? '<button class="action archive-action" type="button" data-archive-debt-id="' + esc(debt.id) + '" title="Sembunyikan dari daftar utama panel admin (tidak menghapus permanen, tidak mempengaruhi hutang.html user)">Arsipkan</button>' : '') + '</div></div></article>';
    }).join('');
  }
  function showDetail(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    var identity = resolveIdentity(debt);
    document.getElementById('debt-detail').innerHTML = '<div class="detail"><p><strong>ID Kasbon:</strong> ' + esc(debt.id) + '</p><p><strong>ID Order:</strong> ' + esc(debt.orderId || '-') + '</p><p><strong>Pelanggan:</strong> ' + esc(debt.customerName || '-') + '</p><p><strong>Jenis kelamin:</strong> ' + esc(identity.gender) + '</p><p><strong>Tanggal lahir:</strong> ' + esc(identity.birthDate) + '</p><p><strong>Telepon:</strong> ' + esc(debt.phone || '-') + '</p><p><strong>Alamat:</strong> ' + esc(debt.address || '-') + '</p><p><strong>Status:</strong> ' + (status(debt.status) === 'lunas' ? 'Lunas' : 'Belum Lunas') + '</p><p><strong>Total:</strong> ' + money(total(debt)) + '</p><ul class="detail-items">' + items(debt).map(function (item) { return '<li>' + esc(item.name) + ' × ' + esc(item.qty || item.quantity || 0) + '</li>'; }).join('') + '</ul></div>';
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
    var archiveButton = event.target.closest('[data-archive-debt-id]');
    if (archiveButton) archiveDebt(archiveButton.dataset.archiveDebtId);
    var deleteArchivedButton = event.target.closest('[data-delete-archived-debt-id]');
    if (deleteArchivedButton) deleteArchivedDebt(deleteArchivedButton.dataset.deleteArchivedDebtId);
  });

  // ============================================================
  // SISTEM ARSIP KASBON (admin-hutang.html)
  // Isolasi dua arah: arsip/hapus di sini HANYA menyentuh salinan
  // milik admin (dikyHutangAdmin_*) dan penyimpanan arsip
  // (dikyHutangArchive). Key milik user (dikyHutang_*) TIDAK PERNAH
  // disentuh, jadi hutang.html tidak terpengaruh sama sekali.
  // ============================================================
  function readArchive() {
    try { var parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  }
  function writeArchive(listData) {
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(listData)); return true; } catch (e) { window.alert('Arsip tidak dapat disimpan karena penyimpanan browser penuh.'); return false; }
  }

  function archiveDebt(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    // ATURAN: hanya kasbon berstatus LUNAS yang boleh diarsipkan.
    if (status(debt.status) !== 'lunas') {
      window.alert('Hanya kasbon berstatus Lunas yang dapat diarsipkan.');
      return;
    }
    if (!window.confirm('Arsipkan kasbon ' + (debt.id || '') + '?\n\nKasbon disembunyikan dari daftar utama panel admin (TIDAK dihapus permanen). Tampilan milik user di hutang.html TIDAK terpengaruh.')) return;
    var archive = readArchive();
    if (archive.some(function (entry) { return entry && String(entry.id) === String(debt.id); })) {
      window.alert('Kasbon ini sudah ada di Arsip Admin.');
      return;
    }
    var copy = JSON.parse(JSON.stringify(Object.assign({}, debt, { __storageKey: undefined })));
    delete copy.__storageKey;
    copy.archivedAt = new Date().toISOString();
    copy.__ownerId = debt.userId || (debt.__storageKey ? String(debt.__storageKey).replace(/^dikyHutangAdmin_/, '') : '');
    archive.unshift(copy);
    if (!writeArchive(archive)) return;
    // Hapus dari salinan milik admin saja (bukan dari key milik user).
    var storageKey = debt.__storageKey;
    if (storageKey) {
      try {
        var remaining = JSON.parse(localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(remaining)) {
          remaining = remaining.filter(function (entry) { return !entry || String(entry.id) !== String(debt.id); });
          localStorage.setItem(storageKey, JSON.stringify(remaining));
        }
      } catch (error) { }
    }
    debts = readAll();
    render();
  }

  function deleteArchivedDebt(id) {
    var archive = readArchive();
    var target = archive.find(function (entry) { return entry && String(entry.id) === String(id); });
    if (!target) return;
    // Proteksi dua lapis: harus LUNAS dan sudah diarsipkan.
    if (status(target.status) !== 'lunas') {
      window.alert('Kasbon belum berstatus Lunas sehingga tidak dapat dihapus permanen.');
      return;
    }
    if (!window.confirm('Hapus PERMANEN kasbon ' + (id || '') + ' dari Arsip Admin?\n\nTindakan ini tidak dapat dibatalkan. Data milik user di hutang.html TIDAK terpengaruh.')) return;
    writeArchive(archive.filter(function (entry) { return !entry || String(entry.id) !== String(id); }));
    render();
  }

  function renderArchive() {
    var archive = readArchive();
    var query = document.getElementById('search-debts').value.toLowerCase().trim();
    var visible = archive.filter(function (debt) {
      var text = (String(debt.id || '') + ' ' + String(debt.orderId || '') + ' ' + String(debt.customerName || '')).toLowerCase();
      return !query || text.indexOf(query) !== -1;
    });
    document.getElementById('unpaid-count').textContent = '0';
    document.getElementById('customer-count').textContent = '0';
    document.getElementById('unpaid-total').textContent = money(0);
    document.getElementById('debts-summary').textContent = 'ARSIP ADMIN — ' + visible.length + ' kasbon diarsipkan. Kasbon di sini disembunyikan dari daftar utama (tidak dihapus) dan tidak mempengaruhi hutang.html milik user.';
    if (!visible.length) { list.innerHTML = '<div class="empty">Arsip kosong. Kasbon berstatus Lunas dapat diarsipkan dari daftar utama.</div>'; return; }
    list.innerHTML = visible.map(function (debt) {
      var identity = resolveIdentity(debt);
      return '<article class="debt-card is-archived"><div class="archived-banner">⧉ Kasbon Diarsipkan' + (debt.archivedAt ? ' — ' + new Date(debt.archivedAt).toLocaleString('id-ID') : '') + '</div><div class="debt-top"><div><p class="debt-id">' + esc(debt.id || 'Tanpa ID') + '</p>' + avatarMarkup(identity) + '<p class="debt-name">' + esc(debt.customerName || 'Pelanggan') + '</p><p class="debt-meta">Akun: @' + esc(identity.username) + (debt.__ownerId ? ' · ID: ' + esc(debt.__ownerId) : '') + '</p><p class="debt-meta">Order: ' + esc(debt.orderId || '-') + '</p></div><span class="status-badge status-lunas">Lunas</span></div><div class="items">' + items(debt).map(function (item) { return itemImageMarkup(item); }).join('') + '</div><div class="debt-bottom"><strong class="total">' + money(total(debt)) + '</strong><div class="actions"><button class="action" type="button" data-detail-id="' + esc(debt.id) + '">Lihat Detail</button><button class="action danger" type="button" data-delete-archived-debt-id="' + esc(debt.id) + '" title="Hapus permanen dari arsip (data milik user di hutang.html tidak terpengaruh)">Hapus</button></div></div></article>';
    }).join('');
  }

  function toggleArchiveView() {
    archiveMode = !archiveMode;
    document.getElementById('archive-button').textContent = archiveMode ? '← Kembali ke Daftar Kasbon' : '⧉ Arsip (' + readArchive().length + ')';
    render();
  }
  document.getElementById('search-debts').addEventListener('input', render);
  document.getElementById('status-filter').addEventListener('change', render);
  document.getElementById('refresh-button').addEventListener('click', function () { debts = readAll(); render(); });
  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  document.getElementById('archive-button').addEventListener('click', toggleArchiveView);
  window.addEventListener('storage', function () { debts = readAll(); render(); });
  document.addEventListener('DOMContentLoaded', function () { debts = readAll(); render(); });
}());