'use strict';

// === Kelola Titipan (Admin) — Warung Sayur Diky ===
// Alur: pelanggan menitip malam hari -> admin pergi ke pasar besok pagi ->
// tiap item ditandai "Dibeli" (isi harga pasar) atau "Habis di Pasar" ->
// admin menekan "Finalisasi": titipan dikirim ke pelanggan untuk dichekout
// di checkout.html (pelanggan memilih metode pengiriman & pembayaran).
// Titipan TIDAK langsung menjadi kasbon; item yang habis tidak ditagihkan
// dan pelanggan melihat pesan pemberitahuan di halaman Titip Beli.
//
// Arsip admin menyimpan titipan terminal tanpa menghapus salinan milik user.
// Key kasbon (dikyHutang_*) tidak pernah disentuh modul ini.

(function () {
  var Helper = window.TitipHelper;

  var requests = [];
  var archiveMode = false;
  var list = document.getElementById('titip-list');
  var dialog = document.getElementById('detail-dialog');
  var searchInput = document.getElementById('search-titipan');
  var statusFilter = document.getElementById('status-filter');
  var archiveButton = document.getElementById('archive-button');

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

  // Foto profil pelanggan: diambil LANGSUNG dari data akun pelanggan
  // (dikyRegisteredUsers, foto yang diperbarui di profile.html) setiap kali
  // kartu dirender, sehingga selalu sinkron dengan foto profil terbaru.
  function resolvePelangganFoto(request) {
    if (!request) return null;
    if (request.profileImage || request.avatarUrl) {
      return request.profileImage || request.avatarUrl;
    }
    try {
      var users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
      if (Array.isArray(users)) {
        var matched = users.find(function (candidate) {
          if (!candidate) return false;
          if (request.userId && String(candidate.id) === String(request.userId)) return true;
          if (request.username && String(candidate.username || '').toLowerCase() === String(request.username).toLowerCase()) return true;
          return false;
        });
        if (matched && (matched.profileImage || matched.avatarUrl)) {
          return matched.profileImage || matched.avatarUrl;
        }
      }
    } catch (error) { /* abaikan */ }

    // Jika user telah melakukan Logout Bersih Total, ambil foto dari arsip identitas yang dipertahankan
    try {
      var used = JSON.parse(localStorage.getItem('dikyUsedIdentities') || '[]');
      if (Array.isArray(used)) {
        var matchedUsed = used.find(function (candidate) {
          if (!candidate) return false;
          if (request.userId && String(candidate.userId) === String(request.userId)) return true;
          if (request.username && String(candidate.username || '').toLowerCase() === String(request.username).toLowerCase()) return true;
          return false;
        });
        if (matchedUsed && (matchedUsed.profileImage || matchedUsed.avatarUrl)) {
          return matchedUsed.profileImage || matchedUsed.avatarUrl;
        }
      }
    } catch (error) { /* abaikan */ }

    return null;
  }

  // Avatar kartu: foto profil bila tersedia, atau inisial nama sebagai cadangan.
  function avatarMarkup(request) {
    var foto = resolvePelangganFoto(request);
    if (foto) {
      return '<img class="customer-avatar" src="' + esc(foto) + '" alt="Foto profil ' + esc(request.customerName || 'Pelanggan') + '">';
    }
    return '<span class="customer-avatar-initials">' + esc(buildInitials(request.customerName)) + '</span>';
  }

  function cardMarkup(request) {
    var canFinalize = ['menunggu_dibeli', 'diproses', 'sebagian_habis'].indexOf(String(request.status)) !== -1;
    var habisMsg = Helper.pesanHabisDiPasar(request);
    var total = Helper.computeDitagihkan(request.items);
    var ownerId = ownerIdOf(request);
    var orderStatus = cariStatusPesanan(request.id);
    var canArchive = ['selesai', 'dibatalkan', 'habis_di_pasaran'].indexOf(String(request.status).toLowerCase()) !== -1 ||
      ['selesai', 'dibatalkan'].indexOf(String(orderStatus || '').toLowerCase()) !== -1;

    return '<article class="titip-card" data-titip-id="' + esc(request.id) + '">' +
      '<div class="titip-top"><div>' +
      '<p class="titip-id">' + esc(request.id || 'Tanpa ID') + '</p>' +
      avatarMarkup(request) +
      '<p class="titip-name">' + esc(request.customerName || 'Pelanggan') + '</p>' +
      '<p class="titip-meta">Akun: @' + esc(request.username || '-') + ' · ID: ' + esc(ownerId || '-') + '</p>' +
      '<p class="titip-meta">Dikirim: ' + esc(Helper.formatWaktu(request.createdAt)) + ' · Untuk pasar: ' + esc(Helper.formatTanggal(request.untukTanggal)) + '</p>' +
      '</div><span class="status-pill status-' + esc(request.status) + '">' + esc(requestStatusText(request)) + '</span></div>' +
      (habisMsg ? '<p class="notice notice-habis">⚠️ ' + esc(habisMsg) + '</p>' : '') +
      '<div class="items">' + (request.items || []).map(function (item) { return itemMarkup(request, item); }).join('') + '</div>' +
      '<div class="titip-bottom"><strong class="total">Ditagihkan: ' + money(total) + '</strong>' +
      '<div class="actions">' +
      '<button class="action" type="button" data-detail-id="' + esc(request.id) + '">Lihat Detail</button>' +
      (canFinalize ? '<button class="action finalize" type="button" data-finalize-id="' + esc(request.id) + '">✅ Kirim ke Checkout Pelanggan</button>' : '') +
      (canArchive ? '<button class="action archive-action" type="button" data-archive-id="' + esc(request.id) + '" title="Sembunyikan dari daftar utama dan simpan di Arsip Admin (tidak mempengaruhi data pelanggan)">Hapus pesanan untuk diarsipkan</button>' : '') +
      '</div></div>' +
      '</article>';
  }

  function itemMarkup(request, item) {
    var isHabis = String(item.status) === 'habis_dipasar';
    // Setelah finalisasi / checkout, item tidak bisa diubah lagi dari panel ini.
    var locked = ['siap_checkout', 'sudah_checkout', 'selesai', 'dibatalkan', 'habis_di_pasaran'].indexOf(String(request.status)) !== -1;
    var btnClass = isHabis ? 'is-diminta' : 'is-habis';
    var controls = locked ? '' :
      (isHabis ? '' : '<input type="number" min="1" step="1" placeholder="Harga pasar" value="' + (Number(item.hargaPasar) > 0 ? Number(item.hargaPasar) : '') + '" data-price-id="' + esc(item.id) + '" aria-label="Harga pasar ' + esc(item.name) + '">') +
      '<button class="toggle-btn ' + btnClass + '" type="button" data-toggle-id="' + esc(item.id) + '" data-request-id="' + esc(request.id) + '">' + esc(isHabis ? '↺ Tersedia lagi' : '✕ Habis di Pasar') + '</button>';
    return '<div class="item" data-item-id="' + esc(item.id) + '">' +
      '<img src="' + esc(Helper.resolveProductImage(item)) + '" alt="' + esc(item.name) + '">' +
      '<div class="item-info"><p class="item-name">' + esc(item.name) + '</p>' +
      '<p class="item-meta">' + esc(typeof Satuan !== 'undefined' ? Satuan.format(item.qty, item.unit) : (item.qty + ' × ' + (item.unit || 'satuan menyesuaikan'))) + ' · ' + esc(Helper.itemStatusLabel(item.status)) + '</p></div>' +
      '<div class="item-controls">' + controls + '</div></div>';
  }

  // Status pesanan yang terkait titipan (setelah pelanggan checkout).
  function cariStatusPesanan(titipanId) {
    if (!titipanId) return null;
    var foundStatus = null;
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || (key.indexOf('dikyOrders_') !== 0 && key !== 'dikyArchivedOrders')) continue;
        var parsed = JSON.parse(localStorage.getItem(key) || '[]');
        var entries = Array.isArray(parsed) ? parsed : [];
        for (var j = 0; j < entries.length; j += 1) {
          if (entries[j] && String(entries[j].titipanId) === String(titipanId)) {
            var status = String(entries[j].status || 'menunggu').toLowerCase();
            if (status === 'selesai' || status === 'dibatalkan') return status;
            foundStatus = status;
          }
        }
      }
    } catch (error) { /* abaikan */ }
    return foundStatus;
  }
  window.getTitipOrderStatusAdmin = cariStatusPesanan;

  function requestStatusText(request) {
    if (String(request.status) === 'sudah_checkout') {
      var orderStatus = cariStatusPesanan(request.id);
      if (orderStatus === 'selesai') return 'Pesanan Selesai';
      if (orderStatus === 'dikirim') return 'Pesanan Dikirim ke Pelanggan';
      if (orderStatus === 'siap_diambil') return 'Pesanan Siap Diambil';
      if (orderStatus === 'dibatalkan') return 'Pesanan Dibatalkan';
      if (orderStatus) return 'Pesanan Sedang Dikemas';
    }
    return Helper.requestStatusLabel(request.status);
  }

  function findRequest(id) { return requests.find(function (r) { return String(r.id) === String(id); }); }
  function findItem(request, itemId) {
    return (request.items || []).find(function (item) { return String(item.id) === String(itemId); });
  }

  // Harga positif menandai item dibeli; tombol menandai habis atau tersedia lagi.
  function toggleItemStatus(request, item) {
    if (!request || !item) return;
    var next = String(item.status) === 'habis_dipasar' ? 'diminta' : 'habis_dipasar';
    item.status = next;
    item.hargaPasar = 0;
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
    if (['selesai', 'dibatalkan', 'habis_di_pasaran', 'siap_checkout', 'sudah_checkout'].indexOf(String(request.status)) !== -1) return;
    var counts = Helper.countByStatus(request.items);
    // Ada item habis di pasar (sebagian atau seluruhnya) -> 'sebagian_habis'.
    if (counts.habis_dipasar > 0) request.status = 'sebagian_habis';
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

  // Finalisasi: titipan yang itemnya sudah dibelikan dikirim ke pelanggan
  // untuk dichekout di checkout.html. Titipan TIDAK langsung menjadi
  // kasbon/hutang; pelanggan memilih metode pengiriman & pembayaran sendiri.
  function finalize(request) {
    if (!request) return;
    var counts = Helper.countByStatus(request.items);
    var items = Array.isArray(request.items) ? request.items : [];
    var unprocessedItems = items.filter(function (item) { return String(item.status) === 'diminta'; });
    if (unprocessedItems.length) {
      window.alert('Tandai setiap item sebagai dibeli dengan mengisi harga pasar, atau tandai "Habis di Pasar" sebelum mengirim titipan ke pelanggan.');
      return;
    }
    var missingPriceItems = items.filter(function (item) {
      return String(item.status) === 'dibeli' && !(Number(item.hargaPasar) > 0);
    });
    if (missingPriceItems.length) {
      window.alert('Isi harga pasar untuk item yang dibeli, atau tandai item tersebut "Habis di Pasar". Item yang habis tidak memerlukan harga.');
      return;
    }

    if (counts.dibeli === 0) {
      if (!items.length || counts.habis_dipasar !== items.length) {
        window.alert('Tidak ada item yang dapat dikirim. Pastikan setiap item sudah ditandai dibeli atau habis di pasar.');
        return;
      }
      var unavailableMessage = 'Semua produk pada titipan ' + request.id + ' ditandai habis di pasar. Pelanggan akan diberi tahu dan tidak akan menerima tombol Checkout.';
      if (!window.confirm(unavailableMessage + '\n\nKirim pemberitahuan kepada pelanggan?')) return;
      request.status = 'habis_di_pasaran';
      request.finalizedAt = new Date().toISOString();
      if (!persist(request)) return;
      render();
      window.alert('Pemberitahuan produk habis berhasil dikirim kepada pelanggan. Titipan ini tidak dapat di-checkout.');
      return;
    }

    var total = Helper.computeDitagihkan(request.items);
    var habisCount = counts.habis_dipasar;
    var message = 'Kirim titipan ' + request.id + ' ke pelanggan untuk checkout?\n\n' +
      'Item dibeli: ' + counts.dibeli + '\n' +
      'Item habis di pasar: ' + habisCount + '\n' +
      'Total harga pasar: ' + money(total) + '\n\n' +
      'Pelanggan akan menekan tombol "Checkout Sekarang" di halaman Titip Beli, lalu memilih metode pengiriman dan pembayaran di halaman checkout.';
    if (!window.confirm(message)) return;

    request.status = 'siap_checkout';
    request.finalizedAt = new Date().toISOString();
    if (!persist(request)) return;
    render();
    window.alert('Titipan dikirim ke pelanggan untuk checkout. ' +
      (habisCount ? (habisCount + ' item ditandai habis di pasar dan tidak ditagihkan.') : 'Semua item berhasil dibelikan.'));
  }

  function showDetail(id) {
    var request = findRequest(id);
    if (!request) return;
    var ownerId = ownerIdOf(request);
    document.getElementById('titip-detail').innerHTML =
      '<div class="detail">' +
      '<p><strong>ID Titipan:</strong> ' + esc(request.id) + '</p>' +
      '<p><strong>Pelanggan:</strong> ' + esc(request.customerName || '-') + '</p>' +
      '<p class="detail-foto-row"><strong>Foto Profil:</strong> ' + avatarMarkup(request) + '</p>' +
      '<p><strong>Username:</strong> @' + esc(request.username || '-') + '</p>' +
      '<p><strong>ID Akun:</strong> ' + esc(ownerId || '-') + '</p>' +
      '<p><strong>Telepon:</strong> ' + esc(request.phone || '-') + '</p>' +
      '<p><strong>Dikirim:</strong> ' + esc(Helper.formatWaktu(request.createdAt)) + '</p>' +
      '<p><strong>Untuk pasar:</strong> ' + esc(Helper.formatTanggal(request.untukTanggal)) + '</p>' +
      '<p><strong>Status:</strong> ' + esc(requestStatusText(request)) + '</p>' +
      '<p><strong>Total ditagihkan:</strong> ' + money(Helper.computeDitagihkan(request.items)) + '</p>' +
      '<ul class="detail-items">' + (request.items || []).map(function (item) {
        return '<li>' + esc(item.name) + ' × ' + esc(typeof Satuan !== 'undefined' ? Satuan.format(item.qty, item.unit) : item.qty) + ' — ' + esc(Helper.itemStatusLabel(item.status)) +
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

// --- Modul Arsip & Hapus Permanen Admin Titip ---
(function () {
  // Ditambahkan secara modular
})();

// ============================================================
// SISTEM PENYIMPANAN ARSIP & HAPUS PERMANEN (ADMIN-TITIP)
// ============================================================
(function (window, document) {
  'use strict';

  var Helper = window.TitipHelper;
  if (!Helper) return;

  var archiveMode = false;
  var archiveButton = document.getElementById('archive-button');
  var titipList = document.getElementById('titip-list');
  var titipSummary = document.getElementById('titip-summary');
  var searchInput = document.getElementById('search-titipan');
  var statusFilter = document.getElementById('status-filter');

  function esc(val) { return Helper.escapeHTML(val); }
  function money(val) { return Helper.money(val); }

  function updateArchiveButton() {
    if (!archiveButton) return;
    var count = Helper.readArchive().length;
    archiveButton.textContent = archiveMode ? '← Kembali ke Daftar Titipan' : '⧉ Arsip Titipan (' + count + ')';
    if (archiveMode) {
      archiveButton.classList.remove('button-light');
      archiveButton.classList.add('button-primary');
    } else {
      archiveButton.classList.remove('button-primary');
      archiveButton.classList.add('button-light');
    }
  }

  function renderArchiveView() {
    var archive = Helper.readArchive();
    var query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    var visible = archive.filter(function (entry) {
      var itemNames = (entry.items || []).map(function (it) { return it.name; }).join(' ');
      var text = [entry.id, entry.customerName, entry.username, itemNames].join(' ').toLowerCase();
      return !query || text.indexOf(query) !== -1;
    });

    if (titipSummary) {
      titipSummary.textContent = 'PENYIMPANAN ARSIP ADMIN — ' + visible.length + ' titipan diarsipkan. Titipan di sini disembunyikan dari daftar utama (tidak mempengaruhi riwayat pelanggan).';
    }

    if (!visible.length) {
      titipList.innerHTML = '<div class="empty">Penyimpanan arsip kosong. Titipan yang telah selesai atau dibatalkan dapat diarsipkan dari daftar utama.</div>';
      return;
    }

    titipList.innerHTML = visible.map(function (request) {
      var total = Helper.computeDitagihkan(request.items);
      var itemsHtml = (request.items || []).map(function (item) {
        return '<div class="item" data-item-id="' + esc(item.id) + '">' +
          '<img src="' + esc(Helper.resolveProductImage(item)) + '" alt="' + esc(item.name) + '">' +
          '<div class="item-info"><p class="item-name">' + esc(item.name) + '</p>' +
          '<p class="item-meta">' + esc(typeof Satuan !== 'undefined' ? Satuan.format(item.qty, item.unit) : (item.qty + ' × ' + (item.unit || 'satuan'))) + ' · ' + esc(Helper.itemStatusLabel(item.status)) +
          (Number(item.hargaPasar) > 0 ? ' (' + money(item.hargaPasar) + ')' : '') + '</p></div>' +
          '</div>';
      }).join('');

      return '<article class="titip-card is-archived" data-titip-id="' + esc(request.id) + '">' +
        '<div class="archived-banner">⧉ Titipan Diarsipkan' + (request.archivedAt ? ' — ' + esc(Helper.formatWaktu(request.archivedAt)) : '') + '</div>' +
        '<div class="titip-top"><div>' +
        '<p class="titip-id">' + esc(request.id || 'Tanpa ID') + '</p>' +
        '<p class="titip-name">' + esc(request.customerName || 'Pelanggan') + '</p>' +
        '<p class="titip-meta">Akun: @' + esc(request.username || '-') + (request.userId ? ' · ID: ' + esc(request.userId) : '') + '</p>' +
        '<p class="titip-meta">Dikirim: ' + esc(Helper.formatWaktu(request.createdAt)) + ' · Untuk pasar: ' + esc(Helper.formatTanggal(request.untukTanggal)) + '</p>' +
        '</div><span class="status-pill status-' + esc(request.status) + '">' + esc(Helper.requestStatusLabel(request.status)) + '</span></div>' +
        '<div class="items">' + itemsHtml + '</div>' +
        '<div class="titip-bottom"><strong class="total">Total: ' + money(total) + '</strong>' +
        '<div class="actions">' +
        '<button class="action" type="button" data-detail-id="' + esc(request.id) + '">Lihat Detail</button>' +
        '<button class="action danger" type="button" data-delete-permanent-id="' + esc(request.id) + '" title="Hapus permanen dari arsip admin (data milik pelanggan tidak terpengaruh)">Hapus</button>' +
        '</div></div>' +
        '</article>';
    }).join('');
  }

  // Aksi mengarsipkan: menyembunyikan pesanan ke arsip admin
  function handleArchiveRequest(requestId) {
    var all = Helper.readAllTitipanAdmin();
    var target = all.find(function (r) { return String(r.id) === String(requestId); });
    if (!target) return;

    var orderStatus = window.getTitipOrderStatusAdmin(requestId);
    var requestStatus = String(target.status || '').toLowerCase();
    if (['selesai', 'dibatalkan', 'habis_di_pasaran'].indexOf(requestStatus) === -1 &&
      ['selesai', 'dibatalkan'].indexOf(String(orderStatus || '').toLowerCase()) === -1) {
      window.alert('Titipan hanya dapat diarsipkan jika statusnya Selesai, Dibatalkan, atau semua produk habis di pasar.');
      return;
    }

    var confirmMsg = 'Hapus pesanan titipan ' + String(target.id).toUpperCase() + ' dari daftar utama untuk diarsipkan?\n\n' +
      'Data titipan akan DISIMPAN & DISEMBUNYIKAN di dalam Penyimpanan Arsip Admin.\n' +
      'Riwayat daftar produk titipan milik pelanggan di titip.html TIDAK TERPENGARUH.';
    if (!window.confirm(confirmMsg)) return;

    if (String(orderStatus || '').toLowerCase() === 'dibatalkan' && requestStatus !== 'dibatalkan') {
      target.status = 'dibatalkan';
      target.statusUpdatedAt = new Date().toISOString();
      target.catatanStatus = 'Pesanan checkout dibatalkan oleh admin.';
      if (!Helper.saveTitipanAdmin(target)) {
        window.alert('Status pembatalan titipan tidak dapat disimpan. Titipan belum diarsipkan.');
        return;
      }
    }

    var ok = Helper.arsipkanTitipanAdmin(target);
    if (ok) {
      updateArchiveButton();
      // Muat ulang daftar aktif
      var refreshBtn = document.getElementById('refresh-button');
      if (refreshBtn) refreshBtn.click();
      window.alert('Titipan berhasil disembunyikan dan disimpan di dalam Arsip Admin.');
    } else {
      window.alert('Gagal mengarsipkan titipan.');
    }
  }

  // Aksi hapus permanen: HANYA ada di dalam Penyimpanan Arsip Admin
  function handleDeletePermanent(requestId) {
    if (!requestId) return;
    var confirmMsg = 'Apakah Anda yakin ingin menghapus data titipan ' + String(requestId).toUpperCase() + ' secara PERMANEN dari Arsip Admin?\n\n' +
      'Tindakan ini tidak dapat dibatalkan.\n' +
      'Data riwayat daftar produk milik pelanggan di titip.html TETAP UTUH dan TIDAK TERPENGARUH.';
    if (!window.confirm(confirmMsg)) return;

    var ok = Helper.hapusPermanenArsipAdmin(requestId);
    if (ok) {
      updateArchiveButton();
      renderArchiveView();
      window.alert('Data titipan berhasil dihapus secara PERMANEN dari Arsip Admin.');
    } else {
      window.alert('Gagal menghapus titipan dari arsip.');
    }
  }

  function toggleArchiveMode() {
    archiveMode = !archiveMode;
    updateArchiveButton();
    if (statusFilter) statusFilter.disabled = archiveMode;

    if (archiveMode) {
      renderArchiveView();
    } else {
      var refreshBtn = document.getElementById('refresh-button');
      if (refreshBtn) refreshBtn.click();
    }
  }

  if (archiveButton) {
    archiveButton.addEventListener('click', toggleArchiveMode);
  }

  if (titipList) {
    titipList.addEventListener('click', function (event) {
      var archiveBtn = event.target.closest('[data-archive-id]');
      if (archiveBtn) {
        event.stopPropagation();
        handleArchiveRequest(archiveBtn.dataset.archiveId);
        return;
      }

      var permDeleteBtn = event.target.closest('[data-delete-permanent-id]');
      if (permDeleteBtn) {
        event.stopPropagation();
        handleDeletePermanent(permDeleteBtn.dataset.deletePermanentId);
        return;
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      if (archiveMode) renderArchiveView();
    });
  }

  window.addEventListener('storage', function (e) {
    if (e.key === Helper.ARCHIVE_KEY) {
      updateArchiveButton();
      if (archiveMode) renderArchiveView();
    }
  });

  document.addEventListener('DOMContentLoaded', updateArchiveButton);
  window.setTimeout(updateArchiveButton, 200);
})(window, document);
