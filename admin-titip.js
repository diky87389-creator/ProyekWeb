'use strict';

// === Kelola Titipan (Admin) — Warung Sayur Diky ===
// Alur: pelanggan menitip malam hari -> admin pergi ke pasar besok pagi ->
// tiap item ditandai "Dibeli" (isi harga pasar) atau "Habis di Pasar" ->
// admin menekan "Finalisasi": item yang dibeli menjadi catatan kasbon
// (dikyHutang_*) sehingga tampil di hutang.html & admin-hutang.html,
// item yang habis ditandai + pelanggan melihat pesan pemberitahuan.
//
// CATATAN ATURAN:
//  - Tidak ada tombol "Hapus" permanen dan tidak ada tombol
//    "Hapus pesanan untuk diarsipkan" di modul ini (sesuai permintaan).
//  - Key kasbon hanya DITULIS saat finalisasi, tidak pernah dihapus.

(function () {
  var Helper = window.TitipHelper;

  var requests = [];
  var list = document.getElementById('titip-list');
  var dialog = document.getElementById('detail-dialog');
  var searchInput = document.getElementById('search-titipan');
  var statusFilter = document.getElementById('status-filter');

  function esc(value) { return Helper.escapeHTML(value); }
  function money(value) { return Helper.money(value); }
  function buildInitials(name) {
    var words = String(name || '').trim().split(/[\s@._-]+/).filter(Boolean);
    return (words.slice(0, 2).map(function (word) { return word.charAt(0); }).join('') || 'WS').toUpperCase();
  }

  function userId() {
    try { var u = JSON.parse(localStorage.getItem('dikyActiveUser') || 'null'); return u && u.id ? String(u.id) : null; }
    catch (error) { return null; }
  }

  function load() {
    requests = Helper.readAllTitipanAdmin();
    render();
  }

  function ownerIdOf(request) { return Helper.getOwnerId(request); }

  function visibleRequests() {
    var query = (searchInput.value || '').toLowerCase().trim();
    var filter = statusFilter.value;
    return requests.filter(function (request) {
      var itemNames = (request.items || []).map(function (item) { return item.name; }).join(' ');
      var text = [request.id, request.customerName, request.username, itemNames].join(' ').toLowerCase();
      var matchQuery = !query || text.indexOf(query) !== -1;
      var matchStatus = filter === 'all' || String(request.status) === filter;
      return matchQuery && matchStatus;
    });
  }

  function renderStats() {
    var summary = Helper.summarize(requests);
    document.getElementById('active-count').textContent = summary.aktif.toLocaleString('id-ID');
    document.getElementById('habis-count').textContent = summary.itemHabisDiPasar.toLocaleString('id-ID');
    document.getElementById('tagih-total').textContent = money(summary.totalDitagihkan);
  }

  function render() {
    renderStats();
    var visible = visibleRequests();
    document.getElementById('titip-summary').textContent = visible.length + ' titipan ditampilkan dari ' + requests.length + ' titipan.';

    if (!visible.length) {
      list.innerHTML = '<div class="empty">Belum ada titipan yang sesuai.</div>';
      return;
    }

    list.innerHTML = visible.map(cardMarkup).join('');
  }

  function cardMarkup(request) {
    var canFinalize = ['menunggu_dibeli', 'diproses', 'sebagian_habis'].indexOf(String(request.status)) !== -1;
    var habisMsg = Helper.pesanHabisDiPasar(request);
    var total = Helper.computeDitagihkan(request.items);
    var ownerId = ownerIdOf(request);
    return '<article class="titip-card" data-titip-id="' + esc(request.id) + '">' +
      '<div class="titip-top"><div>' +
      '<p class="titip-id">' + esc(request.id || 'Tanpa ID') + '</p>' +
      '<span class="customer-avatar-initials">' + esc(buildInitials(request.customerName)) + '</span>' +
      '<p class="titip-name">' + esc(request.customerName || 'Pelanggan') + '</p>' +
      '<p class="titip-meta">Akun: @' + esc(request.username || '-') + ' · ID: ' + esc(ownerId || '-') + '</p>' +
      '<p class="titip-meta">Dikirim: ' + esc(Helper.formatWaktu(request.createdAt)) + ' · Untuk pasar: ' + esc(Helper.formatTanggal(request.untukTanggal)) + '</p>' +
      '</div><span class="status-pill status-' + esc(request.status) + '">' + esc(Helper.requestStatusLabel(request.status)) + '</span></div>' +
      (habisMsg ? '<p class="notice notice-habis">⚠️ ' + esc(habisMsg) + '</p>' : '') +
      '<div class="items">' + (request.items || []).map(function (item) { return itemMarkup(request.id, item); }).join('') + '</div>' +
      '<div class="titip-bottom"><strong class="total">Ditagihkan: ' + money(total) + '</strong>' +
      '<div class="actions">' +
      '<button class="action" type="button" data-detail-id="' + esc(request.id) + '">Lihat Detail</button>' +
      (canFinalize ? '<button class="action finalize" type="button" data-finalize-id="' + esc(request.id) + '">✅ Finalisasi ke Kasbon</button>' : '') +
      '</div></div>' +
      '</article>';
  }

  function itemMarkup(requestId, item) {
    var isDibeli = String(item.status) === 'dibeli';
    var isHabis = String(item.status) === 'habis_dipasar';
    var btnClass = isDibeli ? 'is-dibeli' : (isHabis ? 'is-habis' : 'is-diminta');
    var btnLabel = isDibeli ? '✓ Dibeli' : (isHabis ? '✕ Habis di Pasar' : 'Tandai');
    return '<div class="item" data-item-id="' + esc(item.id) + '">' +
      '<img src="' + esc(Helper.resolveProductImage(item)) + '" alt="' + esc(item.name) + '">' +
      '<div class="item-info"><p class="item-name">' + esc(item.name) + '</p>' +
      '<p class="item-meta">' + esc(item.qty) + ' × ' + esc(item.unit || 'satuan menyesuaikan') + ' · ' + esc(Helper.itemStatusLabel(item.status)) + '</p></div>' +
      '<div class="item-controls">' +
      '<input type="number" min="0" step="1" placeholder="Harga pasar" value="' + (Number(item.hargaPasar) > 0 ? Number(item.hargaPasar) : '') + '" data-price-id="' + esc(item.id) + '" aria-label="Harga pasar ' + esc(item.name) + '">' +
      '<button class="toggle-btn ' + btnClass + '" type="button" data-toggle-id="' + esc(item.id) + '" data-request-id="' + esc(requestId) + '">' + esc(btnLabel) + '</button>' +
      '</div></div>';
  }

  function findRequest(id) { return requests.find(function (r) { return String(r.id) === String(id); }); }
  function findItem(request, itemId) {
    return (request.items || []).find(function (item) { return String(item.id) === String(itemId); });
  }

  // Siklus status item: diminta -> dibeli -> habis_dipasar -> diminta ...
  function toggleItemStatus(request, item) {
    if (!request || !item) return;
    var next = String(item.status) === 'diminta' ? 'dibeli'
      : (String(item.status) === 'dibeli' ? 'habis_dipasar' : 'diminta');
    item.status = next;
    if (next !== 'dibeli') item.hargaPasar = 0;
    refreshRequestStatus(request);
    persist(request);
    render();
  }

  function setItemPrice(request, item, value) {
    if (!request || !item) return;
    var price = Number(value);
    item.hargaPasar = Number.isFinite(price) && price >= 0 ? Math.floor(price) : 0;
    // Mengisi harga pasar otomatis menandai item sebagai "dibeli".
    if (item.hargaPasar > 0 && String(item.status) !== 'dibeli') item.status = 'dibeli';
    refreshRequestStatus(request);
    persist(request);
  }

  // Status permintaan diturunkan dari status item.
  function refreshRequestStatus(request) {
    if (String(request.status) === 'selesai' || String(request.status) === 'dibatalkan') return;
    var counts = Helper.countByStatus(request.items);
    if (counts.habis_dipasar > 0 && counts.dibeli > 0) request.status = 'sebagian_habis';
    else if (counts.habis_dipasar > 0 && counts.dibeli === 0) request.status = 'sebagian_habis';
    else if (counts.dibeli > 0) request.status = 'diproses';
    else request.status = 'menunggu_dibeli';
    request.totalDitagihkan = Helper.computeDitagihkan(request.items);
  }

  function persist(request) {
    request.totalDitagihkan = Helper.computeDitagihkan(request.items);
    if (!Helper.saveTitipanAdmin(request)) {
      window.alert('Perubahan titipan tidak dapat disimpan karena penyimpanan browser penuh.');
      return false;
    }
    return true;
  }

  // Finalisasi: item "dibeli" menjadi kasbon (hutang), status menjadi selesai.
  function finalize(request) {
    if (!request) return;
    var counts = Helper.countByStatus(request.items);
    if (counts.dibeli === 0) {
      window.alert('Belum ada item yang ditandai "Dibeli". Tandai minimal satu item beserta harga pasar sebelum finalisasi.');
      return;
    }
    var total = Helper.computeDitagihkan(request.items);
    var habisCount = counts.habis_dipasar;
    var message = 'Finalisasi titipan ' + request.id + '?\n\n' +
      'Item dibeli: ' + counts.dibeli + '\n' +
      'Item habis di pasar: ' + habisCount + '\n' +
      'Total ditagihkan: ' + money(total) + '\n\n' +
      'Item yang dibeli akan menjadi catatan kasbon pelanggan (tampil di hutang.html & admin-hutang.html).';
    if (!window.confirm(message)) return;

    if (!writeDebtFromTitipan(request)) {
      window.alert('Kasbon tidak dapat disimpan karena penyimpanan browser penuh. Titipan belum difinalisasi.');
      return;
    }

    request.status = 'selesai';
    request.finalizedAt = new Date().toISOString();
    persist(request);
    Helper.appendArchive(request);
    render();
    window.alert('Titipan difinalisasi. ' + (habisCount ? (habisCount + ' item ditandai habis di pasar dan tidak ditagihkan.') : 'Semua item berhasil ditagihkan.'));
  }

  // Tulis kasbon untuk titipan yang dibeli (pola sama dengan checkout.js).
  function writeDebtFromTitipan(request) {
    var ownerId = ownerIdOf(request);
    var hutangKey = ownerId ? 'dikyHutang_' + ownerId : null;
    var adminKey = ownerId ? 'dikyHutangAdmin_' + ownerId : null;
    if (!hutangKey) return false;

    var dibeli = (request.items || []).filter(function (item) { return String(item.status) === 'dibeli'; });
    var items = dibeli.map(function (item) {
      return {
        id: item.id,
        name: item.name,
        qty: item.qty,
        quantity: item.qty,
        price: Helper.computeDitagihkan([item]) / Math.max(1, item.qty),
        unit: item.unit || '',
        image: item.image || '',
        fromTitipan: request.id
      };
    });
    var total = Helper.computeDitagihkan(request.items);

    var debt = {
      id: 'HUT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      orderId: request.id,
      userId: ownerId || null,
      customerName: request.customerName || 'Pelanggan',
      username: request.username || '',
      phone: request.phone || null,
      items: items,
      subtotal: total,
      shippingCost: 0,
      totalAmount: total,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'belum',
      note: 'Dari Titipan Pasar ' + request.id
    };

    var readArr = function (key) {
      try { var p = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(p) ? p : []; }
      catch (error) { return []; }
    };

    var userDebts = readArr(hutangKey);
    if (userDebts.some(function (d) { return d && String(d.id) === String(debt.id); })) return true;
    userDebts.unshift(debt);
    try { localStorage.setItem(hutangKey, JSON.stringify(userDebts)); }
    catch (error) { return false; }

    if (adminKey) {
      var adminDebts = readArr(adminKey);
      if (!adminDebts.some(function (d) { return d && String(d.id) === String(debt.id); })) {
        adminDebts.unshift(Object.assign({}, debt));
        try { localStorage.setItem(adminKey, JSON.stringify(adminDebts)); } catch (error) { /* arsip admin opsional */ }
      }
    }
    return true;
  }

  function showDetail(id) {
    var request = findRequest(id);
    if (!request) return;
    var ownerId = ownerIdOf(request);
    document.getElementById('titip-detail').innerHTML =
      '<div class="detail">' +
      '<p><strong>ID Titipan:</strong> ' + esc(request.id) + '</p>' +
      '<p><strong>Pelanggan:</strong> ' + esc(request.customerName || '-') + '</p>' +
      '<p><strong>Username:</strong> @' + esc(request.username || '-') + '</p>' +
      '<p><strong>ID Akun:</strong> ' + esc(ownerId || '-') + '</p>' +
      '<p><strong>Telepon:</strong> ' + esc(request.phone || '-') + '</p>' +
      '<p><strong>Dikirim:</strong> ' + esc(Helper.formatWaktu(request.createdAt)) + '</p>' +
      '<p><strong>Untuk pasar:</strong> ' + esc(Helper.formatTanggal(request.untukTanggal)) + '</p>' +
      '<p><strong>Status:</strong> ' + esc(Helper.requestStatusLabel(request.status)) + '</p>' +
      '<p><strong>Total ditagihkan:</strong> ' + money(Helper.computeDitagihkan(request.items)) + '</p>' +
      '<ul class="detail-items">' + (request.items || []).map(function (item) {
        return '<li>' + esc(item.name) + ' × ' + esc(item.qty) + ' — ' + esc(Helper.itemStatusLabel(item.status)) +
          (String(item.status) === 'dibeli' ? ' (' + money(item.hargaPasar) + ')' : '') + '</li>';
      }).join('') + '</ul>' +
      (Helper.pesanHabisDiPasar(request) ? '<p class="notice notice-habis">⚠️ ' + esc(Helper.pesanHabisDiPasar(request)) + '</p>' : '') +
      '</div>';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  // --- Event delegation ----------------------------------------------------
  list.addEventListener('change', function (event) {
    var priceInput = event.target.closest('[data-price-id]');
    if (!priceInput) return;
    var card = priceInput.closest('[data-titip-id]');
    if (!card) return;
    var request = findRequest(card.dataset.titipId);
    var item = request ? findItem(request, priceInput.dataset.priceId) : null;
    if (!item) return;
    setItemPrice(request, item, priceInput.value);
  });

  list.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-toggle-id]');
    if (toggle) {
      var request = findRequest(toggle.dataset.requestId);
      var item = request ? findItem(request, toggle.dataset.toggleId) : null;
      if (item) toggleItemStatus(request, item);
      return;
    }
    var detailBtn = event.target.closest('[data-detail-id]');
    if (detailBtn) { showDetail(detailBtn.dataset.detailId); return; }

    var finalizeBtn = event.target.closest('[data-finalize-id]');
    if (finalizeBtn) {
      var target = findRequest(finalizeBtn.dataset.finalizeId);
      if (target) finalize(target);
    }
  });

  document.getElementById('refresh-button').addEventListener('click', load);
  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  window.addEventListener('storage', load);
  document.addEventListener('DOMContentLoaded', load);
}());
