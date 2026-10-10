// === Titip Beli Sayur ke Pasar — Halaman Pelanggan ===
// Warung Sayur Diky - Vanilla JS + localStorage
//
// Alur:
//  1) Pelanggan memilih produk (boleh juga produk yang "Stok Habis" karena
//     titip beli justru ditujukan untuk dibelikan di pasar esok hari).
//  2) Menekan "Kirim Titipan ke Admin" -> tersimpan di dikyTitipan_<userId>
//     dan salinannya dibuat untuk admin di dikyTitipanAdmin_<userId>.
//  3) Pelanggan melihat status & pesan "habis di pasar" dari panel ini.
//
// Modul ini TIDAK menyentuh kasbon/hutang (dikyHutang_*). Konversi titipan
// yang berhasil dibeli menjadi kasbon dilakukan dari sisi admin.

(function () {
  'use strict';

  var Helper = window.TitipHelper;

  var infoBanner = document.getElementById('info-banner');
  var jamOperasional = document.getElementById('jam-operasional');
  var tanggalPasar = document.getElementById('tanggal-pasar');
  var searchProduk = document.getElementById('search-produk');
  var productList = document.getElementById('product-list');
  var titipItemsEl = document.getElementById('titip-items');
  var catatanField = document.getElementById('catatan-titipan');
  var kirimButton = document.getElementById('kirim-titipan');
  var titipListEl = document.getElementById('titip-list');
  var refreshButton = document.getElementById('refresh-titipan');
  var toast = document.getElementById('toast');

  var products = [];
  // Daftar titipan yang sedang disusun: { id, name, unit, qty, image }
  var draftItems = [];

  function escapeHTML(value) { return Helper.escapeHTML(value); }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('toast-show');
    window.setTimeout(function () { toast.classList.remove('toast-show'); }, 2400);
  }

  function requireLogin() {
    if (typeof isValidSession !== 'function' || !isValidSession()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  // --- Produk --------------------------------------------------------------
  function loadProducts() {
    products = Helper.readProducts().filter(function (product) {
      return product && product.id && Array.isArray(product.units) && product.units.length;
    });
  }

  function defaultUnit(product) {
    return (product.units && product.units[0]) || null;
  }

  function isHabis(product) {
    return String(product && product.status || '').trim().toLowerCase() === 'habis';
  }

  function renderProducts() {
    var query = (searchProduk.value || '').toLowerCase().trim();
    var visible = products.filter(function (product) {
      if (!query) return true;
      return String(product.name || '').toLowerCase().indexOf(query) !== -1;
    });

    productList.innerHTML = '';

    if (!visible.length) {
      var empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = products.length ? 'Produk tidak ditemukan.' : 'Katalog produk belum tersedia. Hubungi admin.';
      productList.appendChild(empty);
      return;
    }

    visible.forEach(function (product) {
      var unit = defaultUnit(product);
      var habis = isHabis(product);
      var selected = draftItems.some(function (item) { return String(item.id) === String(product.id); });

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'product-chip' + (selected ? ' is-selected' : '');
      chip.setAttribute('aria-pressed', selected ? 'true' : 'false');

      var img = document.createElement('img');
      img.src = Helper.resolveProductImage(product);
      img.alt = product.name;
      img.loading = 'lazy';

      var name = document.createElement('p');
      name.className = 'chip-name';
      name.textContent = product.name;

      var meta = document.createElement('p');
      meta.className = 'chip-meta';
      meta.textContent = unit ? ('Perkiraan satuan: ' + unit.name) : 'Satuan belum diatur';

      var status = document.createElement('span');
      status.className = 'chip-status ' + (habis ? 'status-habis' : 'status-tersedia');
      status.textContent = habis ? 'Stok Habis (bisa dititip)' : 'Tersedia (bisa dititip)';

      chip.append(img, name, meta, status);
      chip.addEventListener('click', function () { toggleProduct(product); });
      productList.appendChild(chip);
    });
  }

  function toggleProduct(product) {
    var index = draftItems.findIndex(function (item) { return String(item.id) === String(product.id); });
    if (index >= 0) {
      draftItems.splice(index, 1);
    } else {
      var unit = defaultUnit(product);
      draftItems.push({
        id: String(product.id),
        name: product.name,
        unit: unit ? unit.name : '',
        qty: 1,
        image: product.image || ''
      });
    }
    renderProducts();
    renderDraft();
  }

  // --- Draft (keranjang titipan) -------------------------------------------
  function renderDraft() {
    titipItemsEl.innerHTML = '';

    if (!draftItems.length) {
      var note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'Belum ada produk dipilih. Ketuk produk di atas untuk menambahkannya.';
      titipItemsEl.appendChild(note);
      return;
    }

    draftItems.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'titip-item';

      var img = document.createElement('img');
      img.src = Helper.resolveProductImage(item);
      img.alt = item.name;

      var info = document.createElement('div');
      info.className = 'titip-item-info';

      var name = document.createElement('p');
      name.className = 'titip-item-name';
      name.textContent = item.name;

      var unit = document.createElement('p');
      unit.className = 'titip-item-unit';
      unit.textContent = item.unit ? ('Satuan: ' + item.unit) : 'Satuan menyesuaikan pasar';

      info.append(name, unit);

      var picker = document.createElement('div');
      picker.className = 'qty-picker';

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Kurangi jumlah ' + item.name);
      minus.addEventListener('click', function () { changeQty(item.id, -1); });

      var qty = document.createElement('span');
      qty.textContent = item.qty;

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Tambah jumlah ' + item.name);
      plus.addEventListener('click', function () { changeQty(item.id, 1); });

      picker.append(minus, qty, plus);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-item';
      remove.textContent = 'Buang';
      remove.addEventListener('click', function () { removeDraft(item.id); });

      row.append(img, info, picker, remove);
      titipItemsEl.appendChild(row);
    });
  }

  function changeQty(id, delta) {
    var item = draftItems.find(function (entry) { return String(entry.id) === String(id); });
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    renderDraft();
  }

  function removeDraft(id) {
    draftItems = draftItems.filter(function (entry) { return String(entry.id) !== String(id); });
    renderProducts();
    renderDraft();
  }

  // --- Kirim titipan -------------------------------------------------------
  function kirimTitipan() {
    if (!draftItems.length) {
      showToast('Pilih minimal satu produk untuk dititipkan.');
      return;
    }

    var result = Helper.simpanTitipanBaru(draftItems);
    if (!result.ok) {
      showToast(result.reason || 'Titipan gagal dikirim.');
      return;
    }

    draftItems = [];
    catatanField.value = '';
    renderProducts();
    renderDraft();
    renderRiwayat();
    showToast('Titipan terkirim. Admin akan membelikannya di pasar besok pagi.');
  }

  // --- Riwayat titipan -----------------------------------------------------
  function renderRiwayat() {
    var requests = Helper.getTitipanUser();
    titipListEl.innerHTML = '';

    if (!requests.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var h = document.createElement('h3');
      h.textContent = 'Belum ada titipan';
      var p = document.createElement('p');
      p.textContent = 'Anda belum pernah menitipkan sayur. Pilih produk di atas lalu kirim titipan ke admin.';
      empty.append(h, p);
      titipListEl.appendChild(empty);
      return;
    }

    requests.forEach(function (request) {
      titipListEl.appendChild(createRequestCard(request));
    });
  }

  function createRequestCard(request) {
    var card = document.createElement('article');
    card.className = 'titip-card';

    var head = document.createElement('div');
    head.className = 'titip-card-head';

    var headLeft = document.createElement('div');
    var idLine = document.createElement('p');
    idLine.className = 'titip-id';
    idLine.textContent = 'Titipan ' + String(request.id || '').toUpperCase();

    var meta = document.createElement('p');
    meta.className = 'titip-meta';
    meta.textContent = 'Dikirim: ' + Helper.formatWaktu(request.createdAt) +
      ' • Untuk pasar: ' + Helper.formatTanggal(request.untukTanggal);
    headLeft.append(idLine, meta);

    var status = document.createElement('span');
    status.className = 'status-pill status-' + request.status;
    status.textContent = Helper.requestStatusLabel(request.status);

    head.append(headLeft, status);
    card.appendChild(head);

    // Baris item
    var rows = document.createElement('div');
    rows.className = 'titip-rows';
    (request.items || []).forEach(function (item) {
      rows.appendChild(createItemRow(item));
    });
    card.appendChild(rows);

    // Notifikasi "habis di pasar" (inti skenario)
    var habisMsg = Helper.pesanHabisDiPasar(request);
    if (habisMsg) {
      var notice = document.createElement('div');
      notice.className = 'notice-box notice-habis';
      notice.textContent = 'ℹ️ ' + habisMsg;
      card.appendChild(notice);
    }

    // Tagihan (hanya item yang benar-benar dibeli)
    var total = Helper.computeDitagihkan(request.items);
    if (total > 0) {
      var tagihan = document.createElement('div');
      tagihan.className = 'notice-box notice-tagihan';
      tagihan.textContent = 'Total yang dibelikan untuk Anda: ' + Helper.money(total) +
        '. Nominal ini akan muncul sebagai tagihan/hutang setelah difinalisasi admin.';
      card.appendChild(tagihan);

      var totalRow = document.createElement('div');
      totalRow.className = 'titip-total';
      var label = document.createElement('span');
      label.textContent = 'Total Ditagihkan';
      var value = document.createElement('span');
      value.textContent = Helper.money(total);
      totalRow.append(label, value);
      card.appendChild(totalRow);
    }

    return card;
  }

  function createItemRow(item) {
    var row = document.createElement('div');
    row.className = 'titip-row';

    var img = document.createElement('img');
    img.src = Helper.resolveProductImage(item);
    img.alt = item.name;

    var info = document.createElement('div');
    info.className = 'titip-row-info';

    var name = document.createElement('p');
    name.className = 'titip-row-name';
    name.textContent = item.name;

    var qty = document.createElement('p');
    qty.className = 'titip-row-qty';
    var qtyText = 'Jumlah: ' + item.qty;
    if (item.unit) qtyText += ' • ' + item.unit;
    if (String(item.status) === 'dibeli' && Number(item.hargaPasar) > 0) {
      qtyText += ' • Harga pasar: ' + Helper.money(item.hargaPasar);
    }
    qty.textContent = qtyText;

    info.append(name, qty);

    var flag = document.createElement('span');
    flag.className = 'item-flag flag-' + item.status;
    flag.textContent = Helper.itemStatusLabel(item.status);

    row.append(img, info, flag);
    return row;
  }

  // --- Info banner (jam operasional) ---------------------------------------
  function renderInfoBanner() {
    if (jamOperasional) jamOperasional.textContent = Helper.jamOperasionalLabel();
    if (tanggalPasar) tanggalPasar.textContent = 'Untuk dibeli: ' + Helper.formatTanggal(Helper.tomorrowDateString());
    if (infoBanner) infoBanner.classList.toggle('is-open', Helper.isTokoBuka());
  }

  // --- Init ----------------------------------------------------------------
  function initialize() {
    if (!Helper) {
      console.error('TitipHelper tidak termuat. Periksa titip-helper.js.');
      return;
    }
    if (!requireLogin()) return;

    loadProducts();
    renderInfoBanner();
    renderProducts();
    renderDraft();
    renderRiwayat();

    searchProduk.addEventListener('input', renderProducts);
    kirimButton.addEventListener('click', kirimTitipan);
    refreshButton.addEventListener('click', function () {
      loadProducts();
      renderInfoBanner();
      renderProducts();
      renderRiwayat();
      showToast('Data titipan dimuat ulang.');
    });

    window.addEventListener('storage', function (event) {
      if (!event.key) return;
      if (event.key.indexOf('dikyTitipan') === 0 || event.key === 'dikyProducts') {
        loadProducts();
        renderProducts();
        renderRiwayat();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', initialize);
  window.addEventListener('pageshow', function () {
    if (typeof isValidSession === 'function' && isValidSession()) {
      loadProducts();
      renderInfoBanner();
      renderProducts();
      renderRiwayat();
    }
  });
})();
