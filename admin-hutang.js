'use strict';
/**
 * ============================================================
 * BUKU KASBON ADMIN — admin-hutang.html
 * ============================================================
 * Struktur buku: Indeks A-Z -> Lembar per pelanggan.
 * Isolasi dua arah tetap dijaga:
 *   - Admin membaca  : dikyHutangAdmin_<userId>  (+ dikyHutangArchive)
 *   - User membaca   : dikyHutang_<userId>        (hutang.html)
 * Hanya field status & paymentDate yang disinkronkan ke sisi user.
 * Catatan admin + penanda prioritas HANYA tersimpan di sisi admin.
 */
(function () {
  var debts = [];
  var statuses = ['belum', 'lunas'];
  var list = document.getElementById('debts-list');
  var dialog = document.getElementById('detail-dialog');
  var ARCHIVE_KEY = 'dikyHutangArchive';
  var archiveMode = false;

  var activeLetter = null;
  var activeCustomer = null;
  var calendarCursor = new Date();
  calendarCursor.setDate(1);

  var MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  var JATUH_TEMPO_HARI = 30;

  // ---------------- Data layer ----------------
  function userId() { try { var u = JSON.parse(localStorage.getItem('dikyActiveUser') || 'null'); return u && u.id ? String(u.id) : null; } catch (e) { return null; } }
  function key() { var id = userId(); return id ? 'dikyHutangAdmin_' + id : null; }
  function readArray(storageKey) { try { var data = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(data) ? data : []; } catch (e) { return []; } }

  function readAll() {
    reconcileAdminCopies();
    var result = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var storageKey = localStorage.key(i);
      if (!storageKey || storageKey.indexOf('dikyHutangAdmin_') !== 0) continue;
      readArray(storageKey).forEach(function (debt) { if (debt && typeof debt === 'object') result.push(Object.assign({ __storageKey: storageKey }, debt)); });
    }
    return result;
  }

  function reconcileAdminCopies() {
    try {
      var cancelledIds = {};
      for (var i = 0; i < localStorage.length; i += 1) {
        var orderKey = localStorage.key(i);
        if (!orderKey || orderKey.indexOf('dikyOrders_') !== 0) continue;
        readArray(orderKey).forEach(function (order) {
          if (order && String(order.status || '').toLowerCase().indexOf('dibatalkan') !== -1 && (order.id || order.orderId)) {
            cancelledIds[String(order.id || order.orderId)] = true;
          }
        });
      }
      for (var j = 0; j < localStorage.length; j += 1) {
        var adminKey = localStorage.key(j);
        if (!adminKey || adminKey.indexOf('dikyHutangAdmin_') !== 0) continue;
        var adminDebts = readArray(adminKey);
        var kept = adminDebts.filter(function (debt) { return !debt || !cancelledIds[String(debt.orderId || '')]; });
        if (kept.length !== adminDebts.length) localStorage.setItem(adminKey, JSON.stringify(kept));
      }
      var archive = readArchive();
      var keptArchive = archive.filter(function (debt) { return !debt || !cancelledIds[String(debt.orderId || '')]; });
      if (keptArchive.length !== archive.length) localStorage.setItem(ARCHIVE_KEY, JSON.stringify(keptArchive));

      var knownIds = {};
      readArchive().forEach(function (entry) { if (entry && entry.id) knownIds[String(entry.id)] = true; });
      for (var u = 0; u < localStorage.length; u += 1) {
        var userKey = localStorage.key(u);
        if (!userKey || userKey.indexOf('dikyHutang_') !== 0) continue;
        var targetKey = 'dikyHutangAdmin_' + userKey.slice('dikyHutang_'.length);
        var userDebts = readArray(userKey);
        var copies = readArray(targetKey);
        copies.forEach(function (debt) { if (debt && debt.id) knownIds[String(debt.id)] = true; });
        var missing = userDebts.filter(function (debt) {
          return debt && debt.id && !knownIds[String(debt.id)] && !cancelledIds[String(debt.orderId || '')];
        });
        if (missing.length) {
          localStorage.setItem(targetKey, JSON.stringify(copies.concat(missing)));
          missing.forEach(function (debt) { knownIds[String(debt.id)] = true; });
        }
      }
    } catch (error) { }
  }

  function syncStatusToUserCopy(debt) {
    if (!debt || !debt.id) return;
    try {
      var ownerId = String(debt.__storageKey ? String(debt.__storageKey).replace(/^dikyHutangAdmin_/, '') : (debt.userId || ''));
      if (!ownerId) return;
      var userKey = 'dikyHutang_' + ownerId;
      var userDebts = readArray(userKey);
      var changed = false;
      userDebts.forEach(function (entry) {
        if (!entry || String(entry.id) !== String(debt.id)) return;
        if (status(entry.status) !== status(debt.status)) { entry.status = status(debt.status); changed = true; }
        var newestPayment = debt.paymentDate || null;
        if ((entry.paymentDate || null) !== newestPayment) { entry.paymentDate = newestPayment; changed = true; }
      });
      if (changed) localStorage.setItem(userKey, JSON.stringify(userDebts));
    } catch (error) { }
  }

  function updateArchiveLabel() {
    var button = document.getElementById('archive-button');
    if (!button) return;
    var visible = readArchive().filter(function (entry) { return entry && !entry.permanentlyDeletedAt; });
    button.textContent = archiveMode ? '← Kembali ke Buku Kasbon' : '⎈ Arsip (' + visible.length + ')';
  }

  // ---------------- Helpers ----------------
  function buildInitials(name) {
    var words = String(name || '').trim().split(/[\s@._-]+/).filter(Boolean);
    return (words.slice(0, 2).map(function (w) { return w.charAt(0); }).join('') || 'WS').toUpperCase();
  }

  function avatarMarkup(identity) {
    return identity.profileImage
      ? '<img class="customer-avatar" width="44" height="44" src="' + esc(identity.profileImage) + '" alt="Foto profil ' + esc(identity.username) + '" loading="lazy">'
      : '<span class="customer-avatar customer-avatar-initials" aria-label="Inisial ' + esc(identity.username) + '">' + esc(identity.initials) + '</span>';
  }

  function resolveIdentity(debt) {
    var storageKey = debt && debt.__storageKey ? String(debt.__storageKey) : '';
    var ownerId = storageKey.indexOf('dikyHutangAdmin_') === 0 ? storageKey.slice('dikyHutangAdmin_'.length) : '';
    var identifiers = [debt && debt.userId, debt && debt.email, debt && debt.emailAddress, debt && debt.phone, debt && debt.phoneNumber].filter(Boolean).map(String);
    try {
      var users = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
      var user = Array.isArray(users) ? users.find(function (candidate) {
        var values = candidate ? [candidate.id, candidate.email, candidate.emailAddress, candidate.phone, candidate.phoneNumber, candidate.whatsappNumber].filter(Boolean).map(String) : [];
        return (ownerId && values.indexOf(ownerId) !== -1) || identifiers.some(function (v) { return values.indexOf(v) !== -1; });
      }) : null;
      var fullName = debt.fullName || debt.customerName || (user && user.fullName) || '';
      return {
        ownerId: ownerId || (user && user.id) || '',
        fullName: fullName,
        username: debt.username || (user && user.username) || '-',
        initials: buildInitials(fullName),
        profileImage: debt.profileImage || debt.avatarUrl || (user && (user.profileImage || user.avatarUrl)) || null,
        gender: debt.gender || (user && user.gender) || '-',
        birthDate: debt.birthDate || (user && user.birthDate) || '-'
      };
    } catch (error) {
      return { ownerId: ownerId, fullName: debt.fullName || debt.customerName || '', username: debt.username || '-', initials: buildInitials(debt.fullName || debt.customerName), profileImage: null, gender: '-', birthDate: '-' };
    }
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

  function isShippingItem(item) {
    var name = String(item && item.name || '').trim().toLowerCase();
    return (item && (item.isShipping === true || item.shipping === true)) || name === 'ongkir';
  }

  function itemImageMarkup(item) {
    var imageMarkup = isShippingItem(item) ? '' : '<img src="' + esc(resolveImage(item)) + '" alt="' + esc(item && item.name || 'Produk') + '">';
    return '<div class="item">' + imageMarkup + '<div class="item-info"><p class="item-name">' + esc(item && item.name || 'Produk') + '</p><p class="item-meta">' + esc(typeof Satuan !== 'undefined' ? Satuan.format(item && (item.qty || item.quantity), item && item.unit) : (item && (item.qty || item.quantity))) + ' × ' + money(item && item.price) + '</p></div></div>';
  }

  function number(value) { var n = Number(value); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function status(value) { return statuses.indexOf(value) >= 0 ? value : 'belum'; }
  function esc(value) { var node = document.createElement('div'); node.textContent = value == null ? '' : String(value); return node.innerHTML; }
  function money(value) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(number(value)); }
  function items(debt) { return Array.isArray(debt.items) ? debt.items : []; }
  function total(debt) {
    var declared = Number(debt.totalAmount);
    if (Number.isFinite(declared) && declared >= 0) return declared;
    return items(debt).reduce(function (sum, item) { return sum + number(item.price) * number(item.qty || item.quantity); }, 0);
  }

  // ---------------- Tanggal & jatuh tempo (+30 hari otomatis) ----------------
  function parseDate(value) {
    if (!value) return null;
    var d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function dueDateOf(debt) {
    var explicit = parseDate(debt && (debt.dueDate || debt.jatuhTempo));
    if (explicit) return explicit;
    var base = parseDate(debt && (debt.date || debt.createdAt));
    if (!base) return null;
    var due = new Date(base.getTime());
    due.setDate(due.getDate() + JATUH_TEMPO_HARI);
    return due;
  }

  function isOverdue(debt) {
    if (status(debt.status) === 'lunas') return false;
    var due = dueDateOf(debt);
    if (!due) return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dueOnly = new Date(due.getTime()); dueOnly.setHours(0, 0, 0, 0);
    return dueOnly.getTime() < today.getTime();
  }

  function daysUntilDue(debt) {
    var due = dueDateOf(debt);
    if (!due) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dueOnly = new Date(due.getTime()); dueOnly.setHours(0, 0, 0, 0);
    return Math.round((dueOnly.getTime() - today.getTime()) / 86400000);
  }

  function formatDate(value) {
    var d = parseDate(value);
    if (!d) return '-';
    return DAY_NAMES[d.getDay()] + ', ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function dateBlockMarkup(value) {
    var d = parseDate(value);
    if (!d) return '<div class="date-block"><span class="db-day">-</span><span class="db-date">-</span><span class="db-month">-</span><span class="db-year">-</span></div>';
    return '<div class="date-block" title="' + esc(formatDate(d)) + '">' +
      '<span class="db-day">' + DAY_NAMES[d.getDay()] + '</span>' +
      '<span class="db-date">' + String(d.getDate()).padStart(2, '0') + '</span>' +
      '<span class="db-month">' + MONTH_NAMES[d.getMonth()].slice(0, 3) + '</span>' +
      '<span class="db-year">' + d.getFullYear() + '</span>' +
      '</div>';
  }

  function isPriority(debt) { return !!(debt && debt.priorityAdmin === true); }

  // ---------------- Pengelompokan per pelanggan ----------------
  function customerKey(debt, identity) {
    var name = String((identity && identity.fullName) || debt.customerName || 'Tanpa Nama').trim().toLowerCase();
    return name || 'tanpa nama';
  }

  function firstLetter(name) {
    var ch = String(name || '').trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : '#';
  }

  function buildCustomers(sourceDebts) {
    var map = {};
    sourceDebts.forEach(function (debt) {
      var identity = resolveIdentity(debt);
      var k = customerKey(debt, identity);
      if (!map[k]) {
        map[k] = {
          key: k,
          name: String(identity.fullName || debt.customerName || 'Tanpa Nama').trim(),
          identity: identity,
          debts: [],
          totalAll: 0, totalBelum: 0, totalLunas: 0,
          belumCount: 0, lunasCount: 0, overdueCount: 0, priorityCount: 0
        };
      }
      map[k].debts.push(debt);
      var t = total(debt);
      map[k].totalAll += t;
      if (status(debt.status) === 'lunas') { map[k].totalLunas += t; map[k].lunasCount += 1; }
      else { map[k].totalBelum += t; map[k].belumCount += 1; }
      if (isOverdue(debt)) map[k].overdueCount += 1;
      if (isPriority(debt)) map[k].priorityCount += 1;
    });

    var customers = Object.keys(map).map(function (k) { return map[k]; });
    customers.forEach(function (c) { c.letter = firstLetter(c.name); });
    customers.sort(function (a, b) { return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }); });
    customers.forEach(function (c) {
      c.debts.sort(function (a, b) {
        return String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''));
      });
    });
    return customers;
  }

  // ---------------- Filter ----------------
  function currentFilters() {
    return {
      q: (document.getElementById('search-debts').value || '').toLowerCase().trim(),
      statusSel: document.getElementById('status-filter').value,
      month: document.getElementById('month-filter').value,
      year: document.getElementById('year-filter').value
    };
  }

  function matchesFilters(debt, f) {
    var identity = resolveIdentity(debt);
    if (f.q) {
      var haystack = (String(debt.id || '') + ' ' + String(debt.orderId || '') + ' ' + String(debt.customerName || '') + ' ' + String(identity.username || '')).toLowerCase();
      if (haystack.indexOf(f.q) === -1) return false;
    }
    if (f.statusSel === 'belum' && status(debt.status) !== 'belum') return false;
    if (f.statusSel === 'lunas' && status(debt.status) !== 'lunas') return false;
    if (f.statusSel === 'menunggak' && !isPriority(debt)) return false;
    if (f.statusSel === 'jatuh_tempo' && !isOverdue(debt)) return false;
    var d = parseDate(debt.date || debt.createdAt);
    if (f.month !== 'all' && (!d || String(d.getMonth() + 1) !== String(f.month))) return false;
    if (f.year !== 'all' && (!d || String(d.getFullYear()) !== String(f.year))) return false;
    if (activeLetter && firstLetter(debt.customerName) !== activeLetter) return false;
    return true;
  }

  function filteredDebts() {
    var f = currentFilters();
    return debts.filter(function (debt) { return matchesFilters(debt, f); });
  }

  // ---------------- Simpan ----------------
  function save() {
    var grouped = {};
    debts.forEach(function (debt) {
      var storageKey = debt.__storageKey || key();
      if (storageKey) (grouped[storageKey] || (grouped[storageKey] = [])).push(debt);
    });
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

  // ---------------- Statistik & filter periode ----------------
  function renderStats() {
    var unpaid = debts.filter(function (debt) { return status(debt.status) === 'belum'; });
    document.getElementById('unpaid-count').textContent = unpaid.length.toLocaleString('id-ID');
    document.getElementById('customer-count').textContent = new Set(debts.map(function (debt) { return String(debt.customerName || '').toLowerCase(); })).size.toLocaleString('id-ID');
    document.getElementById('unpaid-total').textContent = money(unpaid.reduce(function (sum, debt) { return sum + total(debt); }, 0));
    document.getElementById('overdue-count').textContent = debts.filter(isOverdue).length.toLocaleString('id-ID');
  }

  function populatePeriodFilters() {
    var monthSel = document.getElementById('month-filter');
    var yearSel = document.getElementById('year-filter');
    var months = {}, years = {};
    debts.forEach(function (debt) {
      var d = parseDate(debt.date || debt.createdAt);
      if (!d) return;
      months[d.getMonth() + 1] = true;
      years[d.getFullYear()] = true;
    });
    var mValue = monthSel.value;
    monthSel.innerHTML = '<option value="all">Semua bulan</option>' + Object.keys(months).sort(function (a, b) { return Number(a) - Number(b); }).map(function (m) {
      return '<option value="' + m + '">' + MONTH_NAMES[Number(m) - 1] + '</option>';
    }).join('');
    monthSel.value = months[mValue] ? mValue : 'all';

    var yValue = yearSel.value;
    yearSel.innerHTML = '<option value="all">Semua tahun</option>' + Object.keys(years).sort().reverse().map(function (y) {
      return '<option value="' + y + '">' + y + '</option>';
    }).join('');
    yearSel.value = years[yValue] ? yValue : 'all';
  }

  // ---------------- Indeks A-Z ----------------
  function renderAZ(allCustomers) {
    var nav = document.getElementById('az-index');
    var counts = {};
    allCustomers.forEach(function (c) { counts[c.letter] = (counts[c.letter] || 0) + 1; });

    var html = '<button type="button" class="az-letter az-all' + (activeLetter === null ? ' is-active' : '') + '" data-letter="">Semua</button>';
    ALPHABET.concat(['#']).forEach(function (letter) {
      var count = counts[letter] || 0;
      html += '<button type="button" class="az-letter' + (count ? '' : ' is-empty') + (activeLetter === letter ? ' is-active' : '') +
        '" data-letter="' + letter + '"' + (count ? '' : ' tabindex="-1" aria-disabled="true"') + '>' +
        letter + (count ? '<small>' + count + '</small>' : '') + '</button>';
    });
    nav.innerHTML = html;

    nav.querySelectorAll('.az-letter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('is-empty')) return;
        var letter = btn.getAttribute('data-letter') || null;
        activeLetter = (activeLetter === letter && letter !== null) ? null : letter;
        activeCustomer = null;
        render();
      });
    });
  }

  // ---------------- Daftar pelanggan (indeks buku) ----------------
  function renderCustomers(customers) {
    var sheet = document.getElementById('customer-sheet');
    if (activeCustomer) {
      sheet.hidden = false;
      list.hidden = true;
      renderCustomerSheet(activeCustomer, customers);
      return;
    }
    sheet.hidden = true;
    list.hidden = false;

    if (!customers.length) {
      list.className = 'debts-list';
      list.innerHTML = '<div class="empty">Belum ada catatan kasbon yang sesuai.</div>';
      return;
    }

    var html = '';
    var currentLetter = null;
    customers.forEach(function (c) {
      if (c.letter !== currentLetter) {
        currentLetter = c.letter;
        html += '<div class="letter-divider" id="letter-' + esc(currentLetter) + '"><span>' + esc(currentLetter) + '</span></div>';
      }
      var statusClass = c.belumCount > 0 ? (c.overdueCount > 0 ? 'has-overdue' : 'has-unpaid') : 'all-paid';
      html += '<article class="customer-row ' + statusClass + '" data-customer-key="' + esc(c.key) + '" tabindex="0" role="button" aria-label="Buka lembar kasbon ' + esc(c.name) + '">' +
        '<div class="cr-left">' + avatarMarkup(c.identity) + '</div>' +
        '<div class="cr-main">' +
        '<p class="cr-name">' + esc(c.name) + (c.priorityCount ? ' <span class="badge badge-priority">📌 Prioritas</span>' : '') + '</p>' +
        '<p class="cr-meta">@' + esc(c.identity.username) + ' · ' + c.debts.length + ' transaksi · ' + c.belumCount + ' belum lunas</p>' +
        '<p class="cr-meta">Terakhir: ' + esc(formatDate(c.debts[0] && (c.debts[0].date || c.debts[0].createdAt))) + '</p>' +
        '</div>' +
        '<div class="cr-right">' +
        '<p class="cr-amount">' + money(c.totalBelum) + '</p>' +
        '<p class="cr-meta">' + (c.belumCount ? 'Sisa hutang' : 'Lunas semua') + '</p>' +
        (c.overdueCount ? '<span class="badge badge-overdue">⚠ ' + c.overdueCount + ' lewat tempo</span>' : '') +
        '</div>' +
        '<span class="cr-arrow" aria-hidden="true">›</span>' +
        '</article>';
    });
    list.className = 'debts-list book-list';
    list.innerHTML = html;

    list.querySelectorAll('.customer-row').forEach(function (row) {
      var open = function () {
        activeCustomer = row.getAttribute('data-customer-key');
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  // ---------------- Lembar per pelanggan ----------------
  function renderCustomerSheet(customerKeyValue, customers) {
    var sheet = document.getElementById('customer-sheet');
    var customer = customers.find(function (c) { return c.key === customerKeyValue; });
    if (!customer) { activeCustomer = null; renderCustomers(customers); return; }

    var rows = customer.debts.map(function (debt, index) {
      var isLunas = status(debt.status) === 'lunas';
      var overdue = isOverdue(debt);
      var days = daysUntilDue(debt);
      var dueLabel;
      if (isLunas) dueLabel = 'Lunas' + (debt.paymentDate ? ' ' + formatDate(debt.paymentDate) : '');
      else if (overdue) dueLabel = 'Lewat ' + Math.abs(days) + ' hari';
      else if (days !== null) dueLabel = 'Sisa ' + days + ' hari';
      else dueLabel = '-';

      return '<tr class="ledger-row' + (isLunas ? ' is-paid' : '') + (overdue ? ' is-overdue' : '') + '">' +
        '<td class="col-no">' + (index + 1) + '</td>' +
        '<td class="col-date">' + dateBlockMarkup(debt.date || debt.createdAt) + '</td>' +
        '<td class="col-desc">' +
        '<p class="ledger-title">' + esc(debt.id || 'Tanpa ID') + ' · <span class="ledger-order">Order ' + esc(debt.orderId || '-') + '</span></p>' +
        '<p class="ledger-items">' + esc(items(debt).map(function (i) {
          var qty = typeof Satuan !== 'undefined' ? Satuan.format(i.qty || i.quantity, i.unit) : (i.qty || i.quantity);
          return (i.name || 'Produk') + ' ×' + qty;
        }).join(', ')) + '</p>' +
        '<p class="ledger-meta">' + esc(debt.paymentMethod || 'Hutang / Bayar Nanti') + ' · ' + esc(debt.deliveryMethod || '-') + (isPriority(debt) ? ' · 📌 Prioritas' : '') + '</p>' +
        (debt.noteAdmin ? '<p class="ledger-note">📝 ' + esc(debt.noteAdmin) + '</p>' : '') +
        '</td>' +
        '<td class="col-due">' + esc(dueLabel) + '</td>' +
        '<td class="col-total">' + money(total(debt)) + '</td>' +
        '<td class="col-status"><span class="badge ' + (isLunas ? 'badge-paid' : 'badge-unpaid') + '">' + (isLunas ? 'LUNAS' : 'BELUM') + '</span>' + (isLunas ? '<span class="stamp-paid" aria-hidden="true">LUNAS</span>' : '') + '</td>' +
        '<td class="col-actions">' +
        '<button class="action action-toggle" type="button" data-status-id="' + esc(debt.id) + '" data-current="' + esc(status(debt.status)) + '">' + (isLunas ? '↩ Batalkan Lunas' : '✓ Tandai Lunas') + '</button>' +
        '<button class="action action-priority' + (isPriority(debt) ? ' is-on' : '') + '" type="button" data-priority-id="' + esc(debt.id) + '" title="Tandai sebagai prioritas / menunggak">📌</button>' +
        '<button class="action" type="button" data-note-id="' + esc(debt.id) + '" title="Tambah / ubah catatan admin">📝</button>' +
        '<button class="action" type="button" data-detail-id="' + esc(debt.id) + '">Detail</button>' +
        (isLunas ? '<button class="action archive-action" type="button" data-archive-debt-id="' + esc(debt.id) + '" title="Arsipkan kasbon (tidak mempengaruhi hutang.html user)">Arsip</button>' : '') +
        '</td>' +
        '</tr>';
    }).join('');

    sheet.innerHTML =
      '<div class="sheet-toolbar">' +
      '<button type="button" class="button button-light" id="back-to-book">← Kembali ke Buku</button>' +
      '<button type="button" class="button button-light" id="print-sheet">🖨️ Cetak Lembar</button>' +
      '</div>' +
      '<div class="sheet-paper">' +
      '<div class="sheet-head">' +
      avatarMarkup(customer.identity) +
      '<div class="sheet-id"><p class="eyebrow">Lembar Kasbon Pelanggan</p><h2>' + esc(customer.name) + '</h2>' +
      '<p class="sheet-sub">@' + esc(customer.identity.username) + ' · ID: ' + esc(customer.identity.ownerId || '-') + '</p>' +
      '<p class="sheet-sub">Telp: ' + esc(customer.debts[0] && customer.debts[0].phone || '-') + ' · Alamat: ' + esc(customer.debts[0] && customer.debts[0].address || '-') + '</p>' +
      '</div>' +
      '<div class="sheet-summary">' +
      '<div><span>Total Hutang</span><strong>' + money(customer.totalAll) + '</strong></div>' +
      '<div><span>Sudah Lunas</span><strong class="ok">' + money(customer.totalLunas) + '</strong></div>' +
      '<div><span>Sisa Hutang</span><strong class="due">' + money(customer.totalBelum) + '</strong></div>' +
      '</div></div>' +
      '<div class="ledger-wrap"><table class="ledger">' +
      '<thead><tr><th>No</th><th>Tanggal</th><th>Uraian Kasbon</th><th>Jatuh Tempo</th><th>Jumlah</th><th>Status</th><th>Aksi</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="4" class="ledger-foot-label">Subtotal lembar (' + customer.debts.length + ' transaksi)</td><td class="col-total">' + money(customer.totalAll) + '</td><td colspan="2"></td></tr></tfoot>' +
      '</table></div>' +
      '<div class="sheet-foot"><span>Buku Kasbon — Warung Sayur Diky</span><span>Halaman pelanggan</span></div>' +
      '</div>';

    sheet.querySelector('#back-to-book').addEventListener('click', function () {
      activeCustomer = null;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    sheet.querySelector('#print-sheet').addEventListener('click', function () { window.print(); });
  }

  // ---------------- Kalender ----------------
  function renderCalendar(allDebts) {
    var grid = document.getElementById('calendar-grid');
    var title = document.getElementById('cal-title');
    if (!grid || !title) return;
    var year = calendarCursor.getFullYear();
    var month = calendarCursor.getMonth();
    title.textContent = MONTH_NAMES[month] + ' ' + year;

    var byDay = {};
    allDebts.forEach(function (debt) {
      var d = parseDate(debt.date || debt.createdAt);
      if (!d || d.getFullYear() !== year || d.getMonth() !== month) return;
      var day = d.getDate();
      if (!byDay[day]) byDay[day] = { unpaid: 0, paid: 0, overdue: 0, total: 0 };
      byDay[day].total += total(debt);
      if (status(debt.status) === 'lunas') byDay[day].paid += 1;
      else if (isOverdue(debt)) byDay[day].overdue += 1;
      else byDay[day].unpaid += 1;
    });

    var firstDay = new Date(year, month, 1);
    var startOffset = (firstDay.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date();

    var cells = '';
    for (var i = 0; i < startOffset; i += 1) cells += '<span class="cal-cell is-blank"></span>';
    for (var day = 1; day <= daysInMonth; day += 1) {
      var info = byDay[day];
      var isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      var cls = 'cal-cell' + (isToday ? ' is-today' : '') + (info ? ' has-data' : '');
      var dots = '';
      if (info) {
        if (info.unpaid) dots += '<i class="dot dot-unpaid"></i>';
        if (info.paid) dots += '<i class="dot dot-paid"></i>';
        if (info.overdue) dots += '<i class="dot dot-overdue"></i>';
      }
      cells += '<button type="button" class="' + cls + '" data-cal-day="' + day + '" aria-label="Tanggal ' + day + ' ' + MONTH_NAMES[month] + ' ' + year + '">' +
        '<span class="cal-day-number">' + day + '</span>' +
        (info ? '<span class="cal-total">' + money(info.total) + '</span>' : '') +
        '<span class="cal-dots">' + dots + '</span>' +
        '</button>';
    }
    grid.innerHTML = cells;

    grid.querySelectorAll('[data-cal-day]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openDayDialog(year, month, Number(btn.getAttribute('data-cal-day')), allDebts);
      });
    });
  }

  function openDayDialog(year, month, day, allDebts) {
    var dayDebts = allDebts.filter(function (debt) {
      var d = parseDate(debt.date || debt.createdAt);
      return d && d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
    var body = dayDebts.length
      ? dayDebts.map(function (debt) {
        var isLunas = status(debt.status) === 'lunas';
        return '<div class="day-entry"><p><strong>' + esc(debt.customerName || 'Pelanggan') + '</strong> — ' + money(total(debt)) + '</p>' +
          '<p class="muted">' + esc(debt.id || '') + ' · ' + (isLunas ? 'Lunas' : 'Belum Lunas') + (isPriority(debt) ? ' · 📌 Prioritas' : '') + '</p>' +
          '<p class="muted">' + esc(items(debt).map(function (i) { return (i.name || 'Produk') + ' ×' + number(i.qty || i.quantity); }).join(', ')) + '</p></div>';
      }).join('')
      : '<p class="muted">Tidak ada transaksi pada tanggal ini.</p>';

    document.getElementById('debt-detail').innerHTML =
      '<div class="detail"><h3 class="day-title">' + DAY_NAMES[new Date(year, month, day).getDay()] + ', ' + day + ' ' + MONTH_NAMES[month] + ' ' + year + '</h3>' + body + '</div>';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  // ---------------- Render utama ----------------
  function render() {
    updateArchiveLabel();
    if (archiveMode) { renderArchive(); return; }

    renderStats();
    var visibleDebts = filteredDebts();
    var customers = buildCustomers(visibleDebts);
    var allCustomers = buildCustomers(debts);

    renderAZ(allCustomers);
    document.getElementById('debts-summary').textContent =
      visibleDebts.length + ' transaksi dari ' + allCustomers.length + ' pelanggan ditampilkan (total buku: ' + debts.length + ' transaksi).';
    renderCustomers(customers);
    renderCalendar(debts);
  }

  // ---------------- Detail & aksi ----------------
  function showDetail(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    var identity = resolveIdentity(debt);
    var due = dueDateOf(debt);
    document.getElementById('debt-detail').innerHTML = '<div class="detail">' +
      '<p><strong>ID Kasbon:</strong> ' + esc(debt.id) + '</p>' +
      '<p><strong>ID Order:</strong> ' + esc(debt.orderId || '-') + '</p>' +
      '<p><strong>Tanggal Transaksi:</strong> ' + esc(formatDate(debt.date || debt.createdAt)) + '</p>' +
      '<p><strong>Jatuh Tempo:</strong> ' + esc(due ? formatDate(due) : '-') + (isOverdue(debt) ? ' <span class="badge badge-overdue">Lewat tempo</span>' : '') + '</p>' +
      '<p><strong>Pelanggan:</strong> ' + esc(debt.customerName || '-') + '</p>' +
      '<p><strong>Username:</strong> @' + esc(identity.username) + '</p>' +
      '<p><strong>Jenis kelamin:</strong> ' + esc(identity.gender) + '</p>' +
      '<p><strong>Tanggal lahir:</strong> ' + esc(identity.birthDate) + '</p>' +
      '<p><strong>Telepon:</strong> ' + esc(debt.phone || '-') + '</p>' +
      '<p><strong>Alamat:</strong> ' + esc(debt.address || '-') + '</p>' +
      '<p><strong>Metode Pembayaran:</strong> ' + esc(debt.paymentMethod || '-') + '</p>' +
      '<p><strong>Metode Pengiriman:</strong> ' + esc(debt.deliveryMethod || '-') + '</p>' +
      '<p><strong>Status:</strong> ' + (status(debt.status) === 'lunas' ? 'Lunas' + (debt.paymentDate ? ' (' + formatDate(debt.paymentDate) + ')' : '') : 'Belum Lunas') + '</p>' +
      '<p><strong>Prioritas:</strong> ' + (isPriority(debt) ? 'Ya (menunggak)' : 'Tidak') + '</p>' +
      '<p><strong>Catatan Admin:</strong> ' + (debt.noteAdmin ? esc(debt.noteAdmin) : '-') + '</p>' +
      '<p><strong>Total:</strong> ' + money(total(debt)) + '</p>' +
      '<ul class="detail-items">' + items(debt).map(function (item) {
        return '<li>' + esc(item.name) + ' × ' + esc(item.qty || item.quantity || 0) + ' — ' + money(number(item.price) * number(item.qty || item.quantity)) + '</li>';
      }).join('') + '</ul>' +
      '</div>';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function toggleStatus(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    var next = status(debt.status) === 'lunas' ? 'belum' : 'lunas';
    debt.status = next;
    debt.paymentDate = next === 'lunas' ? new Date().toISOString() : null;
    if (!save()) return;
    syncStatusToUserCopy(debt); // sinkron ke hutang.html (status & paymentDate saja)
    render();
  }

  function togglePriority(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    debt.priorityAdmin = !isPriority(debt);
    if (!save()) return;
    render();
  }

  function openNoteDialog(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    var noteDialog = document.getElementById('note-dialog');
    document.getElementById('note-caption').textContent = 'Kasbon ' + (debt.id || '') + ' — ' + (debt.customerName || 'Pelanggan');
    document.getElementById('note-input').value = debt.noteAdmin || '';
    noteDialog.dataset.debtId = String(debt.id);
    if (typeof noteDialog.showModal === 'function') noteDialog.showModal(); else noteDialog.setAttribute('open', '');
  }

  // ---------------- Arsip ----------------
  function readArchive() {
    try { var parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (e) { return []; }
  }
  function writeArchive(listData) {
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(listData)); return true; }
    catch (e) { window.alert('Arsip tidak dapat disimpan karena penyimpanan browser penuh.'); return false; }
  }

  function archiveDebt(id) {
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    if (status(debt.status) !== 'lunas') {
      window.alert('Hanya kasbon berstatus Lunas yang dapat diarsipkan.');
      return;
    }
    if (!window.confirm('Arsipkan kasbon ' + (debt.id || '') + '?\n\nKasbon disembunyikan dari Buku Kasbon (TIDAK dihapus permanen). Tampilan milik user di hutang.html TIDAK terpengaruh.')) return;
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
    if (status(target.status) !== 'lunas') {
      window.alert('Kasbon belum berstatus Lunas sehingga tidak dapat dihapus permanen.');
      return;
    }
    if (!window.confirm('Hapus PERMANEN kasbon ' + (id || '') + ' dari Arsip Admin?\n\nTindakan ini tidak dapat dibatalkan. Kasbon disembunyikan selamanya dari seluruh panel admin. Data milik user di hutang.html TIDAK terpengaruh.')) return;
    target.permanentlyDeletedAt = new Date().toISOString();
    writeArchive(archive);
    render();
  }

  function renderArchive() {
    var archive = readArchive().filter(function (entry) { return entry && !entry.permanentlyDeletedAt; });
    var query = document.getElementById('search-debts').value.toLowerCase().trim();
    var visible = archive.filter(function (debt) {
      var text = (String(debt.id || '') + ' ' + String(debt.orderId || '') + ' ' + String(debt.customerName || '')).toLowerCase();
      return !query || text.indexOf(query) !== -1;
    });
    document.getElementById('unpaid-count').textContent = '0';
    document.getElementById('customer-count').textContent = '0';
    document.getElementById('unpaid-total').textContent = money(0);
    document.getElementById('overdue-count').textContent = '0';
    document.getElementById('az-index').innerHTML = '';
    document.getElementById('customer-sheet').hidden = true;
    list.hidden = false;
    document.getElementById('debts-summary').textContent = 'ARSIP ADMIN — ' + visible.length + ' kasbon diarsipkan. Kasbon di sini disembunyikan dari Buku Kasbon (tidak dihapus) dan tidak mempengaruhi hutang.html milik user.';
    if (!visible.length) {
      list.className = 'debts-list';
      list.innerHTML = '<div class="empty">Arsip kosong. Kasbon berstatus Lunas dapat diarsipkan dari lembar pelanggan.</div>';
      return;
    }
    list.className = 'debts-list';
    list.innerHTML = visible.map(function (debt) {
      var identity = resolveIdentity(debt);
      return '<article class="debt-card is-archived">' +
        '<div class="archived-banner">⎈ Kasbon Diarsipkan' + (debt.archivedAt ? ' — ' + new Date(debt.archivedAt).toLocaleString('id-ID') : '') + '</div>' +
        '<div class="debt-top"><div><p class="debt-id">' + esc(debt.id || 'Tanpa ID') + '</p>' + avatarMarkup(identity) +
        '<p class="debt-name">' + esc(debt.customerName || 'Pelanggan') + '</p>' +
        '<p class="debt-meta">Akun: @' + esc(identity.username) + (debt.__ownerId ? ' · ID: ' + esc(debt.__ownerId) : '') + '</p>' +
        '<p class="debt-meta">Order: ' + esc(debt.orderId || '-') + '</p></div><span class="status-badge status-lunas">Lunas</span></div>' +
        '<div class="items">' + items(debt).map(itemImageMarkup).join('') + '</div>' +
        '<div class="debt-bottom"><strong class="total">' + money(total(debt)) + '</strong><div class="actions">' +
        '<button class="action" type="button" data-detail-id="' + esc(debt.id) + '">Lihat Detail</button>' +
        '<button class="action danger" type="button" data-delete-archived-debt-id="' + esc(debt.id) + '" title="Hapus permanen dari arsip (data milik user di hutang.html tidak terpengaruh)">Hapus</button>' +
        '</div></div></article>';
    }).join('');
  }

  function toggleArchiveView() {
    archiveMode = !archiveMode;
    if (archiveMode) { activeCustomer = null; }
    render();
  }

  // ---------------- Event wiring ----------------
  function handleActionClick(event) {
    var statusBtn = event.target.closest('[data-status-id]');
    if (statusBtn) { toggleStatus(statusBtn.dataset.statusId); return; }
    var priorityBtn = event.target.closest('[data-priority-id]');
    if (priorityBtn) { togglePriority(priorityBtn.dataset.priorityId); return; }
    var noteBtn = event.target.closest('[data-note-id]');
    if (noteBtn) { openNoteDialog(noteBtn.dataset.noteId); return; }
    var detailBtn = event.target.closest('[data-detail-id]');
    if (detailBtn) { showDetail(detailBtn.dataset.detailId); return; }
    var archiveBtn = event.target.closest('[data-archive-debt-id]');
    if (archiveBtn) { archiveDebt(archiveBtn.dataset.archiveDebtId); return; }
    var deleteArchivedBtn = event.target.closest('[data-delete-archived-debt-id]');
    if (deleteArchivedBtn) { deleteArchivedDebt(deleteArchivedBtn.dataset.deleteArchivedDebtId); return; }
  }

  list.addEventListener('click', handleActionClick);
  document.getElementById('customer-sheet').addEventListener('click', handleActionClick);

  document.getElementById('note-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var noteDialog = document.getElementById('note-dialog');
    var id = noteDialog.dataset.debtId;
    var debt = debts.find(function (item) { return String(item.id) === String(id); });
    if (!debt) return;
    var value = document.getElementById('note-input').value.trim();
    debt.noteAdmin = value || null; // catatan admin TIDAK disinkronkan ke user
    if (save()) {
      noteDialog.close();
      render();
    }
  });

  document.getElementById('note-cancel').addEventListener('click', function () { document.getElementById('note-dialog').close(); });
  document.getElementById('close-note-dialog').addEventListener('click', function () { document.getElementById('note-dialog').close(); });
  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  document.getElementById('archive-button').addEventListener('click', toggleArchiveView);
  document.getElementById('print-button').addEventListener('click', function () { window.print(); });
  document.getElementById('refresh-button').addEventListener('click', function () {
    debts = readAll();
    populatePeriodFilters();
    render();
  });

  ['search-debts', 'status-filter', 'month-filter', 'year-filter'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener(id === 'search-debts' ? 'input' : 'change', function () {
      activeCustomer = null;
      render();
    });
  });

  document.getElementById('cal-prev').addEventListener('click', function () {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar(debts);
  });
  document.getElementById('cal-next').addEventListener('click', function () {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar(debts);
  });

  window.addEventListener('storage', function () {
    debts = readAll();
    populatePeriodFilters();
    render();
  });
  document.addEventListener('DOMContentLoaded', function () {
    debts = readAll();
    populatePeriodFilters();
    render();
  });
}());
