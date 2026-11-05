/**
 * ============================================================
 * HUTANG — PEMBAYARAN PER ITEM + KALENDER TAGIHAN (v2 mandiri)
 * ============================================================
 * Dimuat setelah hutang.js. Membuat seluruh UI yang dibutuhkan
 * secara dinamis bila belum ada di HTML, lalu mengikat event.
 *
 * ISOLASI DATA (dua arah):
 *   Dibaca/ditulis : dikyHutang_<userId>   (milik user)
 *   TIDAK disentuh : dikyHutangAdmin_* , dikyHutangArchive (admin)
 *
 * ATURAN:
 *   1) Bayar sebagian per item via paidItemKeys.
 *   2) Ongkir tidak bisa dibayar terpisah (ikut item produk).
 *   3) Status TIDAK diubah user; hanya paymentRequest='menunggu'.
 *      Admin yang menandai Lunas di admin-hutang.html.
 *   4) Kalender collapsible; akhir bulan (28/29/30/31 otomatis)
 *      = pengingat + total rekap (tidak mengubah status).
 */
(function () {
  'use strict';

  var MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  var selected = {};
  var cursor = new Date();
  cursor.setDate(1);
  var booted = false;

  /* ---------- data ---------- */
  function key() {
    return typeof getUserStorageKey === 'function' ? getUserStorageKey('hutang') : null;
  }
  function loadAll() {
    var k = key(); if (!k) return [];
    try { var raw = localStorage.getItem(k); var p = raw ? JSON.parse(raw) : []; return Array.isArray(p) ? p : []; }
    catch (e) { return []; }
  }
  function saveAll(list) {
    var k = key(); if (!k) return false;
    try {
      if (typeof window.writeUserStorage === 'function') return window.writeUserStorage(k, list) !== false;
      localStorage.setItem(k, JSON.stringify(list)); return true;
    } catch (e) { return false; }
  }

  /* ---------- util ---------- */
  function money(n) { return 'Rp' + (Number(n) || 0).toLocaleString('id-ID'); }
  function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
  function dt(v) { if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function isShip(it) {
    if (!it) return false;
    if (it.isShipping === true || it.shipping === true) return true;
    return String(it.name || '').trim().toLowerCase() === 'ongkir';
  }
  function ikey(it, i) { return isShip(it) ? 'SHIP' : 'ITEM-' + (it && it.id ? String(it.id) : 'x') + '-' + i; }
  function ival(it) { return (Number(it && (it.qty || it.quantity)) || 0) * (Number(it && it.price) || 0); }
  function paidOf(d) { return Array.isArray(d && d.paidItemKeys) ? d.paidItemKeys : []; }
  function isPaid(d, k) { return paidOf(d).indexOf(k) !== -1; }

  /** Sisa hutang; ongkir hanya ikut bila ada produk belum dibayar. */
  function remaining(d) {
    var items = Array.isArray(d && d.items) ? d.items : [];
    var prod = [], ship = [];
    items.forEach(function (it, i) {
      var e = { it: it, k: ikey(it, i), v: ival(it) };
      if (isShip(it)) ship.push(e); else prod.push(e);
    });
    var up = prod.filter(function (e) { return !isPaid(d, e.k); });
    var us = up.length ? ship.filter(function (e) { return !isPaid(d, e.k); }) : [];
    return up.concat(us).reduce(function (s, e) { return s + e.v; }, 0);
  }
  function totalOf(d) {
    return (Array.isArray(d && d.items) ? d.items : []).reduce(function (s, it) { return s + ival(it); }, 0);
  }
  function unpaid(d) {
    if (!d) return false;
    if (String(d.status) === 'lunas') return false;
    return remaining(d) > 0;
  }
  function pending(d) {
    return !!(d && d.paymentRequest && String(d.paymentRequest.status) === 'menunggu');
  }
  function dueOf(d) {
    var ex = dt(d && (d.dueDate || d.jatuhTempo)); if (ex) return ex;
    var b = dt(d && (d.date || d.createdAt)); if (!b) return null;
    var x = new Date(b.getTime()); x.setDate(x.getDate() + 30); return x;
  }
  function overdue(d) {
    if (String(d.status) === 'lunas') return false;
    var x = dueOf(d); if (!x) return false;
    var t = new Date(); t.setHours(0, 0, 0, 0); x.setHours(0, 0, 0, 0);
    return x.getTime() < t.getTime();
  }
  function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function short(v) {
    var d = dt(v); if (!d) return '-';
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }
  function toast(m) {
    var t = document.getElementById('toast');
    if (!t) { console.log('[hutang-bayar] ' + m); return; }
    t.textContent = m;
    t.classList.add('toast-show');
    setTimeout(function () { t.classList.remove('toast-show'); }, 2400);
  }
  function show(id) { var e = document.getElementById(id); if (e) e.hidden = false; }
  function hide(id) { var e = document.getElementById(id); if (e) e.hidden = true; }

  /* ---------- buat UI bila belum ada ---------- */
  function ensureCss() {
    if (document.querySelector('link[data-hutang-bayar]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'hutang-tambahan.css';
    l.setAttribute('data-hutang-bayar', '1');
    document.head.appendChild(l);
  }

  function ensureCalendar() {
    if (document.getElementById('calendar-panel')) return;
    var host = document.querySelector('main') || document.body;
    var s = document.createElement('section');
    s.className = 'calendar-panel';
    s.id = 'calendar-panel';
    s.innerHTML =
      '<button class="calendar-toggle" id="calendar-toggle" type="button" aria-expanded="true">' +
      '<span class="calendar-toggle-title"><span class="calendar-icon">📅</span>' +
      '<span><strong>Kalender Tagihan</strong><small>Sisa hutang per tanggal &amp; total akhir bulan</small></span></span>' +
      '<span class="calendar-chevron">▾</span></button>' +
      '<div class="calendar-body" id="calendar-body">' +
      '<div class="calendar-nav"><button class="calendar-nav-btn" id="cal-prev" type="button">‹</button>' +
      '<h2 id="cal-title">—</h2>' +
      '<button class="calendar-nav-btn" id="cal-next" type="button">›</button></div>' +
      '<div class="calendar-weekdays"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>' +
      '<div class="calendar-grid" id="calendar-grid"></div>' +
      '<div class="calendar-legend">' +
      '<span><i class="dot dot-unpaid"></i> Belum lunas</span>' +
      '<span><i class="dot dot-paid"></i> Lunas</span>' +
      '<span><i class="dot dot-overdue"></i> Lewat jatuh tempo</span>' +
      '<span><i class="dot dot-month-end"></i> Akhir bulan</span></div>' +
      '<div class="month-end-card" id="month-end-card"></div>' +
      '<div class="calendar-day-detail" id="calendar-day-detail" hidden></div></div>';
    var tb = host.querySelector('.toolbar');
    if (tb && tb.parentNode) host.insertBefore(s, tb); else host.insertBefore(s, host.firstChild);
  }

  function ensurePicker() {
    if (document.getElementById('pay-picker-modal')) return;
    var w = document.createElement('div');
    w.className = 'modal-overlay'; w.id = 'pay-picker-modal'; w.hidden = true;
    w.innerHTML =
      '<div class="modal modal-wide"><div class="modal-header"><h2>Bayar Hutang</h2>' +
      '<button class="modal-close" data-close="pay-picker-modal" type="button">✕</button></div>' +
      '<div class="modal-body">' +
      '<p class="pay-intro">Centang item yang ingin Anda bayar sekarang. Boleh sebagian saja — sisanya dapat dibayar nanti.</p>' +
      '<div class="pay-picker-list" id="pay-picker-list"></div>' +
      '<div class="pay-basket"><div class="pay-basket-row">' +
      '<span id="pay-basket-count">0 item dipilih</span><strong id="pay-basket-total">Rp0</strong></div>' +
      '<button class="pay-continue-btn" id="pay-continue-btn" type="button" disabled>💳 Lanjut ke Pembayaran</button></div>' +
      '<p class="pay-note">Ongkos kirim otomatis mengikuti item produk dan tidak dapat dipilih terpisah.</p>' +
      '</div></div>';
    document.body.appendChild(w);
  }

  function ensureConfirm() {
    if (document.getElementById('pay-confirm-modal')) return;
    var w = document.createElement('div');
    w.className = 'modal-overlay'; w.id = 'pay-confirm-modal'; w.hidden = true;
    w.innerHTML =
      '<div class="modal"><div class="modal-header"><h2>Konfirmasi Pembayaran</h2>' +
      '<button class="modal-close" data-close="pay-confirm-modal" type="button">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="pay-confirm-summary" id="pay-confirm-summary"></div>' +
      '<div class="form-row"><span class="form-label">Metode Pembayaran</span><div class="payment-methods">' +
      '<label class="method-option"><input type="radio" name="pay-method" value="QRIS" checked>' +
      '<span class="method-card"><span class="method-icon">📱</span><span class="method-name">QRIS</span><span class="method-desc">Scan untuk bayar</span></span></label>' +
      '<label class="method-option"><input type="radio" name="pay-method" value="Transfer Bank">' +
      '<span class="method-card"><span class="method-icon">🏦</span><span class="method-name">Transfer Bank</span><span class="method-desc">Transfer manual</span></span></label>' +
      '<label class="method-option"><input type="radio" name="pay-method" value="Tunai">' +
      '<span class="method-card"><span class="method-icon">💵</span><span class="method-name">Tunai</span><span class="method-desc">Bayar langsung</span></span></label>' +
      '</div></div>' +
      '<div class="pay-detail" id="pay-detail"></div>' +
      '<p class="pay-note">Setelah konfirmasi, status menjadi <strong>Menunggu Verifikasi Admin</strong>.</p>' +
      '<div class="pay-confirm-actions">' +
      '<button class="button button-secondary" id="pay-back-btn" type="button">← Ubah Pilihan</button>' +
      '<button class="button button-primary" id="pay-submit-btn" type="button">Konfirmasi Pembayaran</button>' +
      '</div></div></div>';
    document.body.appendChild(w);
  }

  /* ---------- picker ---------- */
  function renderPicker() {
    var list = document.getElementById('pay-picker-list');
    if (!list) return;
    var all = loadAll().filter(unpaid);
    if (!all.length) {
      list.innerHTML = '<div class="empty-state"><h3>Tidak ada hutang yang perlu dibayar</h3><p>Semua tagihan Anda sudah lunas.</p></div>';
      updateBasket(); return;
    }

    var html = '';
    all.forEach(function (d) {
      var id = String(d.id);
      var items = Array.isArray(d.items) ? d.items : [];
      var prod = [], ship = [];
      items.forEach(function (it, i) {
        var e = { it: it, k: ikey(it, i), v: ival(it) };
        if (isShip(it)) ship.push(e); else prod.push(e);
      });
      var up = prod.filter(function (e) { return !isPaid(d, e.k); });
      if (!up.length) return;

      var rows = up.map(function (e) {
        var ck = selected[id] && selected[id][e.k];
        return '<label class="pick-item"><input type="checkbox" data-debt-id="' + esc(id) + '" data-item-key="' + esc(e.k) + '" data-kind="product"' + (ck ? ' checked' : '') + '>' +
          '<span class="pick-item-body"><span class="pick-item-name">' + esc(e.it.name || 'Produk') + '</span>' +
          '<span class="pick-item-meta">' + esc(typeof Satuan !== 'undefined' ? Satuan.format(e.it.qty || e.it.quantity, e.it.unit) : (Number(e.it.qty || e.it.quantity) || 0)) + ' × ' + money(e.it.price) + '</span></span>' +
          '<span class="pick-item-price">' + money(e.v) + '</span></label>';
      }).join('');

      var shipRows = ship.filter(function (e) { return !isPaid(d, e.k); }).map(function (e) {
        return '<label class="pick-item is-shipping is-locked"><input type="checkbox" data-debt-id="' + esc(id) + '" data-item-key="' + esc(e.k) + '" data-kind="shipping" disabled checked>' +
          '<span class="pick-item-body"><span class="pick-item-name">🚚 Ongkos Kirim</span>' +
          '<span class="pick-item-meta">Otomatis ikut item produk</span></span>' +
          '<span class="pick-item-price">' + money(e.v) + '</span></label>';
      }).join('');

      var chosen = up.filter(function (e) { return selected[id] && selected[id][e.k]; }).length;

      html += '<div class="pick-group" data-group-debt="' + esc(id) + '">' +
        '<div class="pick-group-head"><label class="pick-group-toggle">' +
        '<input type="checkbox" data-group-check="' + esc(id) + '"' + (chosen === up.length ? ' checked' : '') + '>' +
        '<span><strong>' + esc(d.id || 'Kasbon') + '</strong>' +
        '<small>Order ' + esc(d.orderId || '-') + ' · ' + esc(short(d.date || d.createdAt)) + '</small></span></label>' +
        '<span class="pick-group-remaining">Sisa ' + money(remaining(d)) + '</span></div>' +
        '<div class="pick-group-body">' + rows + shipRows + '</div></div>';
    });

    list.innerHTML = html || '<div class="empty-state"><h3>Tidak ada item tersisa</h3></div>';
    syncSelection();
    reflectGroups();
    updateBasket();
  }

  function syncSelection() {
    var l = document.getElementById('pay-picker-list');
    if (!l) return;
    selected = {};
    l.querySelectorAll('input[data-item-key][data-kind="product"]').forEach(function (cb) {
      if (!cb.checked) return;
      var id = cb.getAttribute('data-debt-id');
      var k = cb.getAttribute('data-item-key');
      (selected[id] = selected[id] || {})[k] = true;
    });
  }

  function reflectGroups() {
    var l = document.getElementById('pay-picker-list');
    if (!l) return;
    l.querySelectorAll('[data-group-check]').forEach(function (g) {
      var id = g.getAttribute('data-group-check');
      var boxes = l.querySelectorAll('[data-group-debt="' + id + '"] input[data-kind="product"]');
      var n = 0; boxes.forEach(function (b) { if (b.checked) n += 1; });
      g.checked = boxes.length > 0 && n === boxes.length;
      g.indeterminate = n > 0 && n < boxes.length;
    });
  }

  function basket() {
    var lines = [], total = 0, count = 0;
    loadAll().forEach(function (d) {
      var sel = selected[String(d.id)]; if (!sel) return;
      var items = Array.isArray(d.items) ? d.items : [];
      var prod = [], ship = [];
      items.forEach(function (it, i) {
        var e = { it: it, k: ikey(it, i), v: ival(it) };
        if (isShip(it)) ship.push(e); else prod.push(e);
      });
      var picked = prod.filter(function (e) { return sel[e.k] && !isPaid(d, e.k); });
      if (!picked.length) return;
      var shipUnpaid = ship.filter(function (e) { return !isPaid(d, e.k); });
      var sub = picked.reduce(function (s, e) { return s + e.v; }, 0);
      var shp = shipUnpaid.reduce(function (s, e) { return s + e.v; }, 0);
      lines.push({ debt: d, items: picked, shipping: shipUnpaid, subtotal: sub, shippingTotal: shp, amount: sub + shp });
      total += sub + shp; count += picked.length;
    });
    return { lines: lines, total: total, count: count };
  }

  function updateBasket() {
    var b = basket();
    var c = document.getElementById('pay-basket-count');
    var t = document.getElementById('pay-basket-total');
    var btn = document.getElementById('pay-continue-btn');
    if (c) c.textContent = b.count + ' item dipilih dari ' + b.lines.length + ' kasbon';
    if (t) t.textContent = money(b.total);
    if (btn) btn.disabled = b.total <= 0;
    return b;
  }

  function openPicker(preselect) {
    ensurePicker(); ensureConfirm();
    if (preselect) {
      selected = {};
      loadAll().filter(unpaid).forEach(function (d) {
        var id = String(d.id); selected[id] = {};
        (d.items || []).forEach(function (it, i) {
          if (!isShip(it) && !isPaid(d, ikey(it, i))) selected[id][ikey(it, i)] = true;
        });
      });
    }
    renderPicker(); show('pay-picker-modal');
  }

  /* ---------- konfirmasi & simpan ---------- */
  function openConfirm() {
    var b = updateBasket();
    if (b.total <= 0) { toast('Pilih minimal satu item.'); return; }

    var box = document.getElementById('pay-confirm-summary');
    if (box) {
      box.innerHTML = b.lines.map(function (line) {
        var rows = line.items.map(function (e) {
          return '<div class="confirm-row"><span>' + esc(e.it.name) + ' × ' + esc(typeof Satuan !== 'undefined' ? Satuan.format(e.it.qty || e.it.quantity, e.it.unit) : (Number(e.it.qty || e.it.quantity) || 0)) + '</span><span>' + money(e.v) + '</span></div>';
        }).join('');
        if (line.shippingTotal > 0) rows += '<div class="confirm-row"><span>🚚 Ongkos Kirim</span><span>' + money(line.shippingTotal) + '</span></div>';
        return '<div class="confirm-group"><p class="confirm-group-title">' + esc(line.debt.id || 'Kasbon') + '</p>' + rows +
          '<div class="confirm-row confirm-subtotal"><span>Subtotal</span><strong>' + money(line.amount) + '</strong></div></div>';
      }).join('') + '<div class="confirm-total"><span>TOTAL BAYAR</span><strong>' + money(b.total) + '</strong></div>';
    }
    hide('pay-picker-modal'); show('pay-confirm-modal');
    payDetail();
  }

  function payDetail() {
    var r = document.querySelector('input[name="pay-method"]:checked');
    var m = r ? r.value : 'QRIS';
    var d = document.getElementById('pay-detail'); if (!d) return;
    var t = basket().total;
    if (m === 'QRIS') d.innerHTML = '<div class="pay-qr-box"><div class="pay-qr-placeholder"></div><p class="pay-qr-hint">Scan QRIS untuk membayar ' + money(t) + '</p></div>';
    else if (m === 'Transfer Bank') d.innerHTML = '<div class="pay-bank-info"><p><strong>Bank BCA</strong> — 1234567890<br>a.n. Warung Sayur Diky</p><p><strong>Bank Mandiri</strong> — 9876543210<br>a.n. Warung Sayur Diky</p></div>';
    else d.innerHTML = '<p style="text-align:center;color:var(--muted);margin:0">Pembayaran tunai diterima langsung di kasir.</p>';
  }

  function submit() {
    var b = basket();
    if (b.total <= 0) { toast('Tidak ada item yang dipilih.'); return; }
    var r = document.querySelector('input[name="pay-method"]:checked');
    var method = r ? r.value : 'QRIS';
    if (!key()) { toast('Sesi tidak valid. Login ulang.'); return; }

    var all = loadAll();
    var iso = new Date().toISOString();
    var touched = 0;

    b.lines.forEach(function (line) {
      var t = all.find(function (d) { return String(d.id) === String(line.debt.id); });
      if (!t) return;
      var paid = paidOf(t).slice();
      var ks = [];
      line.items.forEach(function (e) { ks.push(e.k); });
      line.shipping.forEach(function (e) { ks.push(e.k); });
      ks.forEach(function (k) { if (paid.indexOf(k) === -1) paid.push(k); });
      t.paidItemKeys = paid;

      var req = t.paymentRequest && Array.isArray(t.paymentRequest.items) ? t.paymentRequest.items.slice() : [];
      ks.forEach(function (k) { if (req.indexOf(k) === -1) req.push(k); });
      t.paymentRequest = { status: 'menunggu', method: method, amount: line.amount, items: req, requestedAt: iso };
      touched += 1;
    });

    if (!touched) { toast('Tidak ada perubahan.'); return; }
    if (!saveAll(all)) { toast('Gagal menyimpan. Penyimpanan penuh.'); return; }

    hide('pay-confirm-modal');
    selected = {};
    refresh();
    toast('Pembayaran dikirim. Menunggu verifikasi admin.');
    receipt(b, method, iso);
  }

  function receipt(b, method, iso) {
    var m = document.getElementById('receipt-modal');
    var c = document.getElementById('receipt-content');
    if (!m || !c) return;
    var lines = b.lines.map(function (line) {
      var rows = line.items.map(function (e) {
        return '<div class="receipt-item"><span>' + esc(e.it.name) + ' ×' + esc(typeof Satuan !== 'undefined' ? Satuan.format(e.it.qty || e.it.quantity, e.it.unit) : (Number(e.it.qty || e.it.quantity) || 0)) + '</span><span>' + money(e.v) + '</span></div>';
      }).join('');
      if (line.shippingTotal > 0) rows += '<div class="receipt-item"><span>Ongkos Kirim</span><span>' + money(line.shippingTotal) + '</span></div>';
      return '<div class="receipt-group"><p class="receipt-group-title">' + esc(line.debt.id || 'Kasbon') + '</p>' + rows + '</div>';
    }).join('');

    c.innerHTML = '<div class="receipt"><div class="receipt-header"><div class="receipt-brand">WS</div>' +
      '<h3>Warung Sayur Diky</h3><p>Bukti Permintaan Pembayaran Hutang</p></div>' +
      '<div class="receipt-meta"><p>Tanggal: ' + short(iso) + '</p><p>Metode: ' + esc(method) + '</p>' +
      '<p>Status: <strong>Menunggu Verifikasi Admin</strong></p></div>' +
      '<div class="receipt-items">' + lines + '</div>' +
      '<div class="receipt-total"><span>TOTAL</span><span>' + money(b.total) + '</span></div>' +
      '<div class="receipt-status status-belum">⏳ MENUNGGU VERIFIKASI ADMIN</div>' +
      '<div class="receipt-footer">Hutang resmi Lunas setelah admin memverifikasi.</div></div>';
    m.hidden = false;
  }

  /* ---------- kalender ---------- */
  function calendar() {
    ensureCalendar();
    var g = document.getElementById('calendar-grid');
    var t = document.getElementById('cal-title');
    if (!g || !t) return;
    var debts = loadAll();
    var y = cursor.getFullYear(), m = cursor.getMonth();
    t.textContent = MONTH_NAMES[m] + ' ' + y;

    var days = daysIn(y, m);
    var byDay = {};
    debts.forEach(function (d) {
      var x = dt(d.date || d.createdAt);
      if (!x || x.getFullYear() !== y || x.getMonth() !== m) return;
      var day = x.getDate();
      if (!byDay[day]) byDay[day] = { u: 0, p: 0, o: 0 };
      if (String(d.status) === 'lunas' || remaining(d) <= 0) byDay[day].p += 1;
      else { byDay[day].u += 1; if (overdue(d)) byDay[day].o += 1; }
    });

    var off = (new Date(y, m, 1).getDay() + 6) % 7;
    var now = new Date();
    var html = '';
    for (var i = 0; i < off; i += 1) html += '<span class="cal-cell is-blank"></span>';
    for (var dnum = 1; dnum <= days; dnum += 1) {
      var info = byDay[dnum];
      var today = now.getFullYear() === y && now.getMonth() === m && now.getDate() === dnum;
      var end = dnum === days;
      var cls = 'cal-cell' + (today ? ' is-today' : '') + (end ? ' is-month-end' : '') + (info ? ' has-data' : '');
      var dots = '';
      if (info) {
        if (info.u) dots += '<i class="dot dot-unpaid"></i>';
        if (info.p) dots += '<i class="dot dot-paid"></i>';
        if (info.o) dots += '<i class="dot dot-overdue"></i>';
      }
      html += '<button type="button" class="' + cls + '" data-cal-day="' + dnum + '">' +
        '<span class="cal-day-number">' + dnum + '</span>' +
        (end ? '<span class="cal-month-end-tag">Akhir</span>' : '') +
        (info && info.o ? '<span class="cal-due-badge">Tempo</span>' : '') +
        '<span class="cal-dots">' + dots + '</span></button>';
    }
    g.innerHTML = html;
    g.querySelectorAll('[data-cal-day]').forEach(function (b) {
      b.addEventListener('click', function () { dayDetail(y, m, Number(b.getAttribute('data-cal-day')), debts); });
    });
    monthEnd(y, m, days, debts);
  }

  function monthEnd(y, m, days, debts) {
    var card = document.getElementById('month-end-card'); if (!card) return;
    var end = new Date(y, m, days, 23, 59, 59, 999);
    var rel = debts.filter(function (d) {
      if (!unpaid(d)) return false;
      var x = dt(d.date || d.createdAt);
      return x && x.getTime() <= end.getTime();
    });
    var total = rel.reduce(function (s, d) { return s + remaining(d); }, 0);
    var od = rel.filter(overdue).length;
    var endDate = new Date(y, m, days);

    if (!rel.length) {
      card.innerHTML = '<div class="month-end-head"><span class="month-end-icon">✅</span><div>' +
        '<p class="month-end-label">Tagihan Akhir Bulan</p><h3>' + days + ' ' + MONTH_NAMES[m] + ' ' + y + '</h3></div></div>' +
        '<p class="month-end-empty">Tidak ada sisa hutang sampai akhir bulan ini. 🎉</p>';
      return;
    }
    card.innerHTML = '<div class="month-end-head"><span class="month-end-icon">📅</span><div>' +
      '<p class="month-end-label">Total Tagihan Akhir Bulan</p>' +
      '<h3>' + days + ' ' + MONTH_NAMES[m] + ' ' + y + ' <small>(' + DAY_NAMES[endDate.getDay()] + ')</small></h3></div></div>' +
      '<p class="month-end-total">' + money(total) + '</p>' +
      '<p class="month-end-meta">' + rel.length + ' kasbon · ' + od + ' lewat jatuh tempo</p>' +
      '<button type="button" class="month-end-btn" id="month-end-pay-btn">💳 Bayar Hutang Sekarang</button>' +
      '<p class="month-end-note">Ini hanya pengingat. Pembayaran tetap menunggu verifikasi admin.</p>';
    var b = card.querySelector('#month-end-pay-btn');
    if (b) b.addEventListener('click', function () { openPicker(false); });
  }

  function dayDetail(y, m, day, debts) {
    var p = document.getElementById('calendar-day-detail'); if (!p) return;
    var list = debts.filter(function (d) {
      var x = dt(d.date || d.createdAt);
      return x && x.getFullYear() === y && x.getMonth() === m && x.getDate() === day;
    });
    if (!list.length) { p.hidden = true; return; }
    var tot = list.reduce(function (s, d) { return s + remaining(d); }, 0);
    p.hidden = false;
    p.innerHTML = '<div class="day-detail-head"><strong>' + DAY_NAMES[new Date(y, m, day).getDay()] + ', ' + day + ' ' + MONTH_NAMES[m] + ' ' + y + '</strong>' +
      '<span>' + money(tot) + ' sisa</span></div>' +
      list.map(function (d) {
        var r = remaining(d);
        var lab = String(d.status) === 'lunas' ? 'Lunas' : (r <= 0 ? 'Terbayar' : (overdue(d) ? 'Lewat tempo' : 'Belum lunas'));
        return '<div class="day-detail-item"><span>' + esc(d.id || 'Kasbon') + ' · ' + esc(d.orderId || '-') + '</span>' +
          '<span>' + lab + ' · ' + money(r) + '</span></div>';
      }).join('');
  }

  /* ---------- badge pada kartu ---------- */
  function decorate() {
    var debts = loadAll();
    document.querySelectorAll('#debt-list .debt-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      var d = debts.find(function (x) { return String(x.id) === String(id); });
      if (!d) return;
      var box = card.querySelector('.debt-amount');
      if (pending(d) && !card.querySelector('.status-pending') && box) {
        var b = document.createElement('span');
        b.className = 'status-badge status-pending';
        b.textContent = '⏳ Menunggu Verifikasi Admin';
        box.appendChild(b);
      }
      var r = remaining(d), t = totalOf(d);
      if (r > 0 && r < t && !card.querySelector('.debt-partial') && box) {
        var p = document.createElement('p');
        p.className = 'debt-sub debt-partial';
        p.textContent = 'Terbayar ' + money(t - r) + ' · Sisa ' + money(r);
        box.appendChild(p);
      }
    });
  }

  function refresh() {
    if (typeof window.__hutangRenderList === 'function') window.__hutangRenderList();
    calendar();
    setTimeout(decorate, 0);
  }

  /* ---------- events ---------- */
  function bind() {
    var dl = document.getElementById('debt-list');
    if (dl) {
      dl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-action="pay"]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        openPicker(false);
      }, true);
    }

    document.body.addEventListener('change', function (e) {
      var t = e.target; if (!t) return;
      if (t.matches('[data-group-check]')) {
        var id = t.getAttribute('data-group-check');
        var g = document.querySelector('[data-group-debt="' + id + '"]');
        if (g) g.querySelectorAll('input[data-kind="product"]').forEach(function (c) { c.checked = t.checked; });
        syncSelection(); updateBasket(); reflectGroups(); return;
      }
      if (t.matches('#pay-picker-list input[data-item-key]')) {
        syncSelection(); updateBasket(); reflectGroups(); return;
      }
      if (t.matches('input[name="pay-method"]')) payDetail();
    });

    document.body.addEventListener('click', function (e) {
      var t = e.target; if (!t) return;
      if (t.closest('#pay-continue-btn')) { openConfirm(); return; }
      if (t.closest('#pay-submit-btn')) { submit(); return; }
      if (t.closest('#pay-back-btn')) { hide('pay-confirm-modal'); show('pay-picker-modal'); return; }
      if (t.closest('#calendar-toggle')) {
        var tg = document.getElementById('calendar-toggle');
        var bd = document.getElementById('calendar-body');
        if (!tg || !bd) return;
        var ex = tg.getAttribute('aria-expanded') === 'true';
        tg.setAttribute('aria-expanded', ex ? 'false' : 'true');
        bd.style.display = ex ? 'none' : '';
        tg.classList.toggle('is-collapsed', ex);
        return;
      }
      if (t.closest('#cal-prev')) { cursor.setMonth(cursor.getMonth() - 1); calendar(); return; }
      if (t.closest('#cal-next')) { cursor.setMonth(cursor.getMonth() + 1); calendar(); return; }

      var close = t.closest('[data-close]');
      if (close) { hide(close.getAttribute('data-close')); return; }
      if (t.classList && t.classList.contains('modal-overlay')) t.hidden = true;
    });
  }

  function boot() {
    if (booted) return;
    if (typeof isValidSession === 'function' && !isValidSession()) return;
    booted = true;
    ensureCss(); ensureCalendar(); ensurePicker(); ensureConfirm();
    bind(); calendar();
    setTimeout(decorate, 80);
    console.log('[hutang-bayar] aktif');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);

  window.HutangBayar = {
    refresh: refresh,
    remaining: remaining,
    totalOf: totalOf,
    isPending: pending,
    // Dipakai hutang-midtrans.js: susun item terpilih dalam format Midtrans.
    getBasket: function () {
      syncSelection();
      var b = basket();
      var out = [];
      b.lines.forEach(function (line) {
        line.items.forEach(function (e) {
          var qty = Number(e.it.qty || e.it.quantity) || 1;
          var price = Number(e.it.price) || 0;
          var label = (String(e.it.name || 'Produk') + '\u0020' + (e.it.unit || '')).trim().slice(0, 50);
          // Midtrans menolak quantity desimal -> kirim harga total item.
          if (Math.abs(qty - Math.round(qty)) > 1e-9) {
            out.push({ id: String(e.k), name: label, price: Math.round(price * qty), qty: 1 });
          } else {
            out.push({ id: String(e.k), name: label, price: Math.round(price), qty: Math.round(qty) });
          }
        });
        if (line.shippingTotal > 0) {
          out.push({ id: 'ONGKIR', name: 'Ongkos Kirim', price: Math.round(line.shippingTotal), qty: 1 });
        }
      });
      return out;
    },
    // Dipakai hutang-midtrans.js setelah pembayaran Midtrans berhasil.
    submitAfterPayment: function () { submit(); }
  };
}());
