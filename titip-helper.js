/**
 * ==========================================
 * Titip Beli Sayur ke Pasar — Helper Bersama
 * Warung Sayur Diky - Multi-User Architecture
 * ==========================================
 *
 * MODUL INI TERPISAH TOTAL DARI KASBON/HUTANG.
 *
 * Latar belakang (sesuai skenario toko):
 *  - Toko buka belanja online 07.00 s/d 18.00.
 *  - Di luar jam itu (malam 21.00 - 01.00) pelanggan tetap ingin menitip
 *    sayur untuk dibelikan di pasar keesokan harinya, TANPA harus datang
 *    ke rumah admin.
 *  - Jika produk tertentu ternyata habis di pasar, admin menandai item itu
 *    'habis_dipasar' sehingga TIDAK dibelikan dan TIDAK ditagihkan.
 *  - Setelah admin memfinalisasi titipan (harga pasar per item), pelanggan
 *    melakukan CHECKOUT sendiri di checkout.html: memilih metode pengiriman
 *    dan pembayaran seperti pesanan biasa. Titipan TIDAK langsung menjadi
 *    kasbon/hutang.
 *
 * Karena itu titipan disimpan pada key miliknya sendiri:
 *   - Pelanggan : dikyTitipan_<userId>        (lewat getUserStorageKey('titipan'))
 *   - Admin     : dikyTitipanAdmin_<userId>   (salinan, lewat 'titipanAdmin')
 *   - Arsip     : dikyTitipArchive            (jejak selesai/dibatalkan, admin)
 *
 * Key kasbon (dikyHutang_*) TIDAK PERNAH disentuh di sini agar halaman
 * hutang.html dan admin-hutang.html tetap utuh seperti sebelumnya.
 */

(function (window) {
  'use strict';

  var ARCHIVE_KEY = 'dikyTitipArchive';
  var FALLBACK_IMAGE = 'images/Toko Sayur Online.png';

  // Status satu titipan (level permintaan, bukan level item).
  var REQUEST_STATUSES = ['menunggu_dibeli', 'diproses', 'sebagian_habis', 'siap_checkout', 'sudah_checkout', 'siap_diambil', 'selesai', 'dibatalkan'];

  // Status satu item di dalam titipan.
  var ITEM_STATUSES = ['diminta', 'dibeli', 'habis_dipasar'];

  // Jam operasional belanja online (07.00 - 18.00). Di luar jam ini toko
  // tutup untuk belanja online, dan jalur yang tersedia adalah TITIP BELI.
  var OPEN_HOUR = 7;
  var CLOSE_HOUR = 18;

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  }

  function safeNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function readArray(key) {
    if (!key) return [];
    try {
      var parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function writeArray(key, list) {
    if (!key) return false;
    var payload = Array.isArray(list) ? list : [];
    if (typeof window.writeUserStorage === 'function') {
      return window.writeUserStorage(key, payload);
    }
    try { localStorage.setItem(key, JSON.stringify(payload)); return true; }
    catch (error) { return false; }
  }

  // --- Jam operasional -----------------------------------------------------
  function isTokoBuka(date) {
    var now = date instanceof Date ? date : new Date();
    var hour = now.getHours();
    return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
  }

  function jamOperasionalLabel() {
    return '07.00 - 18.00';
  }

  // Tanggal pasar tujuan = "besok" (YYYY-MM-DD).
  function tomorrowDateString(fromDate) {
    var base = fromDate instanceof Date ? new Date(fromDate.getTime()) : new Date();
    base.setDate(base.getDate() + 1);
    return base.toISOString().slice(0, 10);
  }

  function formatTanggal(value) {
    if (!value) return '-';
    var date = new Date(value.length === 10 ? value + 'T00:00:00' : value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatWaktu(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // --- Katalog & gambar ----------------------------------------------------
  function readProducts() {
    try {
      var data = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) { return []; }
  }

  function resolveProductImage(item) {
    if (typeof window.resolveProductImage === 'function') {
      try { return window.resolveProductImage(item); } catch (error) { /* fallback di bawah */ }
    }
    var products = readProducts();
    var found = products.find(function (p) { return p && item && String(p.id) === String(item.id); });
    if (found && typeof found.image === 'string' && found.image) return found.image;
    if (item && typeof item.image === 'string' && item.image && item.image.indexOf('data:') !== 0) return item.image;
    return FALLBACK_IMAGE;
  }

  // --- Normalisasi ---------------------------------------------------------
  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    var status = String(item.status || 'diminta').trim().toLowerCase();
    if (ITEM_STATUSES.indexOf(status) === -1) status = 'diminta';
    var qty = Math.floor(safeNumber(item.qty != null ? item.qty : item.quantity));
    if (qty < 1) qty = 1;
    return {
      id: String(item.id || ''),
      name: String(item.name || 'Produk').trim(),
      unit: String(item.unit || '').trim(),
      qty: qty,
      quantity: qty,
      catatan: String(item.catatan || item.note || '').trim(),
      image: item.image || '',
      status: status,
      // Harga pasar diisi admin saat menandai 'dibeli'. Selama 'diminta'
      // dan 'habis_dipasar' nilainya 0 (belum ditagihkan).
      hargaPasar: safeNumber(item.hargaPasar)
    };
  }

  function normalizeRequest(request) {
    if (!request || typeof request !== 'object') return null;
    var status = String(request.status || 'menunggu_dibeli').trim().toLowerCase();
    if (REQUEST_STATUSES.indexOf(status) === -1) status = 'menunggu_dibeli';
    var items = Array.isArray(request.items) ? request.items.map(normalizeItem).filter(Boolean) : [];
    return Object.assign({}, request, {
      id: String(request.id || ''),
      items: items,
      status: status,
      totalDitagihkan: computeDitagihkan(items)
    });
  }

  // Total yang benar-benar ditagihkan (hanya item yang 'dibeli').
  function computeDitagihkan(items) {
    return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
      if (!item || String(item.status) !== 'dibeli') return sum;
      return sum + safeNumber(item.hargaPasar) * Math.floor(safeNumber(item.qty != null ? item.qty : item.quantity));
    }, 0);
  }

  function countByStatus(items) {
    var counts = { diminta: 0, dibeli: 0, habis_dipasar: 0 };
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var status = String(item && item.status || 'diminta');
      if (counts[status] == null) counts[status] = 0;
      counts[status] += 1;
    });
    return counts;
  }

  // --- Identitas pemilik ---------------------------------------------------
  function activeUser() {
    if (typeof window.getActiveUser === 'function') {
      try { return window.getActiveUser(); } catch (error) { return null; }
    }
    return null;
  }

  function buildRequestBase() {
    var user = activeUser() || {};
    return {
      userId: user.id ? String(user.id) : null,
      username: user.username || null,
      customerName: user.fullName || user.name || user.username || 'Pelanggan',
      phone: user.phoneNumber || user.contactInfo || null
    };
  }

  // --- Simpan titipan baru (halaman pelanggan) -----------------------------
  /**
   * Menyimpan titipan baru milik user aktif dan salinannya untuk admin.
   * @param {Array<{id,name,unit,qty,catatan,image}>} rawItems
   * @returns {{ok: boolean, request: Object|null, reason: string}}
   */
  function simpanTitipanBaru(rawItems) {
    var items = (Array.isArray(rawItems) ? rawItems : []).map(function (item) {
      return normalizeItem(Object.assign({}, item, { status: 'diminta', hargaPasar: 0 }));
    }).filter(function (item) { return item && item.id && item.name; });

    if (!items.length) {
      return { ok: false, request: null, reason: 'Minimal pilih satu produk untuk dititipkan.' };
    }

    var userKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipan') : null;
    if (!userKey) {
      return { ok: false, request: null, reason: 'Sesi tidak valid. Silakan login kembali.' };
    }

    var now = new Date();
    var request = normalizeRequest(Object.assign(buildRequestBase(), {
      id: 'TTP-' + now.getTime().toString(36) + Math.random().toString(36).slice(2, 5),
      createdAt: now.toISOString(),
      untukTanggal: tomorrowDateString(now),
      status: 'menunggu_dibeli',
      items: items,
      catatan: ''
    }));

    var existing = readArray(userKey);
    existing.unshift(request);
    if (!writeArray(userKey, existing)) {
      return { ok: false, request: null, reason: 'Titipan tidak dapat disimpan karena penyimpanan browser penuh.' };
    }

    syncToAdminCopy(request);
    return { ok: true, request: request, reason: '' };
  }

  function syncToAdminCopy(request) {
    if (!request || !request.id) return false;
    var adminKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipanAdmin') : null;
    if (!adminKey) return false;
    var adminList = readArray(adminKey);
    if (!adminList.some(function (entry) { return entry && String(entry.id) === String(request.id); })) {
      adminList.unshift(Object.assign({}, request));
      return writeArray(adminKey, adminList);
    }
    return true;
  }

  // --- Baca titipan milik user aktif ---------------------------------------
  function getTitipanUser() {
    var userKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipan') : null;
    return readArray(userKey).map(normalizeRequest).filter(Boolean);
  }

  // --- Baca seluruh titipan (panel admin) ----------------------------------
  function readAllTitipanAdmin() {
    var result = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('dikyTitipanAdmin_') !== 0) continue;
        readArray(key).forEach(function (entry) {
          if (entry && typeof entry === 'object') result.push(Object.assign({ __storageKey: key }, entry));
        });
      }
    } catch (error) { /* abaikan */ }
    return result.map(function (entry) {
      var normalized = normalizeRequest(entry) || entry;
      normalized.__storageKey = entry.__storageKey;
      return normalized;
    });
  }

  function getOwnerId(request) {
    if (!request) return '';
    var storageKey = request.__storageKey ? String(request.__storageKey) : '';
    if (storageKey.indexOf('dikyTitipanAdmin_') === 0) return storageKey.slice('dikyTitipanAdmin_'.length);
    if (storageKey.indexOf('dikyTitipan_') === 0) return storageKey.slice('dikyTitipan_'.length);
    return request.userId ? String(request.userId) : '';
  }

  // --- Simpan perubahan dari panel admin -----------------------------------
  /**
   * Menulis kembali satu titipan ke key admin asalnya dan (jika perlu)
   * menyinkronkan salinan tampilan milik user agar pelanggan melihat
   * status terbaru termasuk pesan "habis di pasar".
   */
  function saveTitipanAdmin(request) {
    if (!request || !request.id) return false;
    var adminKey = request.__storageKey;
    if (!adminKey) return false;

    var clean = Object.assign({}, request);
    delete clean.__storageKey;
    clean = normalizeRequest(clean);

    var adminList = readArray(adminKey);
    var found = false;
    adminList = adminList.map(function (entry) {
      if (entry && String(entry.id) === String(clean.id)) { found = true; return clean; }
      return entry;
    });
    if (!found) adminList.unshift(clean);
    var saved = writeArray(adminKey, adminList);
    if (saved) syncToUserCopy(clean, adminKey);
    return saved;
  }

  /**
   * Menyinkronkan salinan tampilan milik user (dikyTitipan_<id>) dengan
   * data admin (dikyTitipanAdmin_<id>). Hanya field titipan yang disentuh;
   * key kasbon (dikyHutang_*) TIDAK PERNAH tersentuh di sini.
   */
  function syncToUserCopy(request, adminKey) {
    if (!request || !request.id) return false;
    var ownerId = adminKey
      ? String(adminKey).replace(/^dikyTitipanAdmin_/, '')
      : (request.userId ? String(request.userId) : '');
    if (!ownerId) return false;
    var userKey = 'dikyTitipan_' + ownerId;
    var userList = readArray(userKey);
    if (!userList.length) return true; // user belum punya daftar; tidak perlu dibuat.
    var changed = false;
    userList = userList.map(function (entry) {
      if (entry && String(entry.id) === String(request.id)) { changed = true; return request; }
      return entry;
    });
    return changed ? writeArray(userKey, userList) : true;
  }

  // --- Checkout titipan (pelanggan) -----------------------------------------
  // Konteks checkout: menautkan proses checkout.html aktif dengan titipan asal.
  function getCheckoutContext() {
    var key = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipanCheckout') : null;
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (error) { return null; }
  }

  function removeCheckoutContext() {
    var key = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipanCheckout') : null;
    if (key) { try { localStorage.removeItem(key); } catch (error) { /* abaikan */ } }
  }

  // Ubah item "dibeli" (harga pasar) pada titipan menjadi daftar item checkout.
  function siapkanCheckoutTitipan(requestId) {
    var request = getTitipanUser().find(function (entry) { return String(entry.id) === String(requestId); });
    if (!request) return { ok: false, reason: 'Titipan tidak ditemukan.' };
    if (String(request.status) !== 'siap_checkout') {
      return { ok: false, reason: 'Titipan belum difinalisasi admin atau sudah diproses.' };
    }
    var dibeli = (request.items || []).filter(function (item) {
      return String(item.status) === 'dibeli' && safeNumber(item.hargaPasar) > 0;
    });
    if (!dibeli.length) return { ok: false, reason: 'Tidak ada item yang dibelikan di pasar.' };

    var items = dibeli.map(function (item) {
      return {
        cartItemId: 'TITIP-' + request.id + '-' + item.id,
        id: item.id,
        name: item.name,
        unit: item.unit || '',
        unitIndex: 0,
        price: safeNumber(item.hargaPasar),
        quantity: Math.floor(safeNumber(item.qty != null ? item.qty : item.quantity)),
        image: (typeof item.image === 'string' && item.image.indexOf('data:') !== 0) ? item.image : '',
        fromTitipan: request.id
      };
    });

    var checkoutKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('checkoutItems') : null;
    if (!checkoutKey) return { ok: false, reason: 'Sesi tidak valid. Silakan login kembali.' };
    if (!writeArray(checkoutKey, items)) {
      return { ok: false, reason: 'Checkout titipan tidak dapat disimpan karena penyimpanan browser penuh.' };
    }

    // Konteks menautkan checkout ini dengan titipannya (dibaca checkout.js).
    var ctxKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipanCheckout') : null;
    if (ctxKey) {
      var ctx = { titipanId: request.id, updatedAt: new Date().toISOString() };
      if (typeof window.writeUserStorage === 'function') window.writeUserStorage(ctxKey, ctx);
      else { try { localStorage.setItem(ctxKey, JSON.stringify(ctx)); } catch (error) { /* abaikan */ } }
    }

    // Smart Guide: tahap 'checkout' agar panduan mengarah ke checkout.html.
    if (typeof simpanPesananBaru === 'function') {
      simpanPesananBaru({ items: items, updatedAt: new Date().toISOString() });
    }
    return { ok: true, request: request, items: items, reason: '' };
  }

  // Tandai titipan sudah dichekout pelanggan (pesanan dikonfirmasi di checkout).
  function tandaiSudahCheckout(requestId) {
    return updateStatusBothCopies(requestId, 'sudah_checkout', 'Sudah dichekout pelanggan.');
  }

  // Batalkan titipan karena pelanggan menekan "Hapus Pesanan Ini" di checkout.
  // Data TIDAK dihapus fisik: status 'dibatalkan' tersinkron ke salinan admin.
  function batalkanTitipan(requestId) {
    var ok = updateStatusBothCopies(requestId, 'dibatalkan', 'Dibatalkan pelanggan saat checkout.');
    removeCheckoutContext();
    return ok;
  }

  function updateStatusBothCopies(requestId, status, catatan) {
    if (!requestId) return false;
    var userKey = typeof getUserStorageKey === 'function' ? getUserStorageKey('titipan') : null;
    if (!userKey) return false;
    var changed = false;
    var userList = readArray(userKey).map(function (entry) {
      if (entry && String(entry.id) === String(requestId)) {
        changed = true;
        entry.status = status;
        entry.statusUpdatedAt = new Date().toISOString();
        if (catatan) entry.catatanStatus = catatan;
      }
      return entry;
    });
    if (!changed) return false;
    if (!writeArray(userKey, userList)) return false;

    // Sinkronkan salinan admin agar admin melihat status terbaru.
    var user = activeUser() || {};
    var adminKey = user.id ? 'dikyTitipanAdmin_' + user.id : null;
    if (adminKey) {
      var adminList = readArray(adminKey).map(function (entry) {
        if (entry && String(entry.id) === String(requestId)) {
          entry.status = status;
          entry.statusUpdatedAt = new Date().toISOString();
          if (catatan) entry.catatanStatus = catatan;
        }
        return entry;
      });
      writeArray(adminKey, adminList);
    }
    return true;
  }

  // Cari status pesanan (orders/riwayat) yang terkait sebuah titipan.
  // Dipakai untuk aturan Riwayat Titipan: baru tampil setelah pesanan
  // mencapai tab "Selesai" di orders.html.
  function cariStatusPesananTitipan(requestId) {
    if (!requestId) return null;
    var keys = [];
    ['orders', 'riwayatPesanan', 'pesananAktif'].forEach(function (type) {
      var key = typeof getUserStorageKey === 'function' ? getUserStorageKey(type) : null;
      if (key) keys.push(key);
    });
    for (var i = 0; i < keys.length; i += 1) {
      var parsed = null;
      try { parsed = JSON.parse(localStorage.getItem(keys[i]) || 'null'); } catch (error) { parsed = null; }
      if (!parsed) continue;
      var entries = Array.isArray(parsed) ? parsed : [parsed];
      for (var j = 0; j < entries.length; j += 1) {
        if (entries[j] && String(entries[j].titipanId) === String(requestId)) {
          return String(entries[j].status || 'menunggu');
        }
      }
    }
    return null;
  }

  // --- Arsip titipan -------------------------------------------------------
  function readArchive() {
    try {
      var parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function writeArchive(list) {
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.isArray(list) ? list : [])); return true; }
    catch (error) { return false; }
  }

  function appendArchive(request) {
    if (!request || !request.id) return false;
    var archive = readArchive();
    if (archive.some(function (entry) { return entry && String(entry.id) === String(request.id); })) return true;
    var copy = Object.assign({}, request);
    delete copy.__storageKey;
    copy.archivedAt = new Date().toISOString();
    archive.unshift(copy);
    return writeArchive(archive);
  }

  // --- Statistik ringkas ---------------------------------------------------
  function summarize(list) {
    var requests = Array.isArray(list) ? list : [];
    var aktif = requests.filter(function (r) { return ['menunggu_dibeli', 'diproses', 'sebagian_habis', 'siap_checkout', 'sudah_checkout', 'siap_diambil'].indexOf(String(r.status)) !== -1; });
    var habis = 0;
    var ditagih = 0;
    requests.forEach(function (r) {
      habis += countByStatus(r.items).habis_dipasar;
      ditagih += safeNumber(r.totalDitagihkan);
    });
    return {
      total: requests.length,
      aktif: aktif.length,
      selesai: requests.filter(function (r) { return String(r.status) === 'selesai'; }).length,
      dibatalkan: requests.filter(function (r) { return String(r.status) === 'dibatalkan'; }).length,
      itemHabisDiPasar: habis,
      totalDitagihkan: ditagih
    };
  }

  function requestStatusLabel(status) {
    switch (status) {
      case 'menunggu_dibeli': return 'Menunggu Dibeli di Pasar';
      case 'diproses': return 'Sedang Dibelikan';
      case 'sebagian_habis': return 'Ada Produk Habis di Pasar';
      case 'siap_checkout': return 'Siap Checkout oleh Pelanggan';
      case 'sudah_checkout': return 'Sudah Dichekout Pelanggan';
      case 'siap_diambil': return 'Siap Diambil';
      case 'selesai': return 'Selesai';
      case 'dibatalkan': return 'Dibatalkan';
      default: return String(status || '-');
    }
  }

  function itemStatusLabel(status) {
    switch (status) {
      case 'dibeli': return 'Dibeli';
      case 'habis_dipasar': return 'Habis di Pasar';
      case 'diminta': return 'Diminta';
      default: return String(status || '-');
    }
  }

  // Pesan pemberitahuan untuk pelanggan saat produk habis di pasar.
  function pesanHabisDiPasar(request) {
    if (!request) return '';
    var habis = (request.items || []).filter(function (item) { return String(item.status) === 'habis_dipasar'; });
    if (!habis.length) return '';
    var nama = habis.map(function (item) { return item.name; }).join(', ');
    return 'Produk berikut yang Anda titipkan sedang HABIS di pasar, sehingga tidak saya belikan: ' + nama + '.';
  }

  window.TitipHelper = {
    ARCHIVE_KEY: ARCHIVE_KEY,
    REQUEST_STATUSES: REQUEST_STATUSES,
    ITEM_STATUSES: ITEM_STATUSES,
    OPEN_HOUR: OPEN_HOUR,
    CLOSE_HOUR: CLOSE_HOUR,
    escapeHTML: escapeHTML,
    money: money,
    readProducts: readProducts,
    resolveProductImage: resolveProductImage,
    isTokoBuka: isTokoBuka,
    jamOperasionalLabel: jamOperasionalLabel,
    tomorrowDateString: tomorrowDateString,
    formatTanggal: formatTanggal,
    formatWaktu: formatWaktu,
    normalizeItem: normalizeItem,
    normalizeRequest: normalizeRequest,
    computeDitagihkan: computeDitagihkan,
    countByStatus: countByStatus,
    simpanTitipanBaru: simpanTitipanBaru,
    syncToAdminCopy: syncToAdminCopy,
    syncToUserCopy: syncToUserCopy,
    getTitipanUser: getTitipanUser,
    readAllTitipanAdmin: readAllTitipanAdmin,
    getOwnerId: getOwnerId,
    saveTitipanAdmin: saveTitipanAdmin,
    readArchive: readArchive,
    writeArchive: writeArchive,
    appendArchive: appendArchive,
    summarize: summarize,
    requestStatusLabel: requestStatusLabel,
    itemStatusLabel: itemStatusLabel,
    pesanHabisDiPasar: pesanHabisDiPasar,
    siapkanCheckoutTitipan: siapkanCheckoutTitipan,
    tandaiSudahCheckout: tandaiSudahCheckout,
    batalkanTitipan: batalkanTitipan,
    cariStatusPesananTitipan: cariStatusPesananTitipan
  };
})(window);
