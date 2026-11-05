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
  var aktifListEl = document.getElementById('titip-aktif-list');
  var refreshButton = document.getElementById('refresh-titipan');
  var toast = document.getElementById('toast');
  var confirmDialog = document.getElementById('titip-confirm-dialog');
  var confirmRead = document.getElementById('titip-confirm-read');
  var confirmSubmit = document.getElementById('titip-confirm-submit');
  var confirmCancel = document.getElementById('titip-confirm-cancel');

  var products = [];
  // Daftar titipan yang sedang disusun: { id, name, unit, qty, image }
  var draftItems = [];

  function escapeHTML(value) { return Helper.escapeHTML(value); }

  function draftStorageKey() {
    return typeof window.getUserStorageKey === 'function'
      ? window.getUserStorageKey('titipanDraft')
      : null;
  }

  function loadDraft() {
    var key = draftStorageKey();
    draftItems = [];
    catatanField.value = '';
    if (!key) return;

    try {
      var saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (!saved) return;
      var items = Array.isArray(saved) ? saved : saved.items;
      if (!Array.isArray(items)) {
        console.warn('Draft titipan tersimpan tidak valid.');
        return;
      }

      draftItems = items.filter(function (item) {
        return item && typeof item === 'object' && item.id != null;
      }).map(function (item) {
        var qty = Number(item.qty);
        return {
          id: String(item.id),
          name: String(item.name || 'Produk'),
          unit: String(item.unit || ''),
          qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
          image: typeof item.image === 'string' && item.image.indexOf('data:') !== 0 ? item.image : ''
        };
      });
      if (!Array.isArray(saved)) catatanField.value = String(saved.catatan || '');
    } catch (error) {
      console.warn('Draft titipan tidak dapat dibaca.', error);
      showToast('Draft titipan tersimpan tidak dapat dibaca.');
    }
  }

  function persistDraft() {
    var key = draftStorageKey();
    if (!key) {
      console.error('Draft titipan tidak dapat disimpan karena sesi pengguna tidak valid.');
      showToast('Draft titipan tidak dapat disimpan. Periksa sesi login Anda.');
      return false;
    }

    var draft = {
      items: draftItems.map(function (item) {
        return {
          id: item.id,
          name: item.name,
          unit: item.unit,
          qty: item.qty,
          image: typeof item.image === 'string' && item.image.indexOf('data:') !== 0 ? item.image : ''
        };
      }),
      catatan: catatanField.value || ''
    };
    var saved = typeof window.writeUserStorage === 'function'
      ? window.writeUserStorage(key, draft)
      : false;
    if (!saved) {
      console.error('Draft titipan gagal disimpan ke penyimpanan lokal.');
      showToast('Draft titipan gagal disimpan. Ruang penyimpanan mungkin penuh.');
    }
    return saved;
  }

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
      var habis = isHabis(product);
      var draft = draftItems.find(function (item) { return String(item.id) === String(product.id); });
      var selected = !!draft;
      var activeUnitName = draft ? draft.unit : (defaultUnit(product) ? defaultUnit(product).name : '');

      // Kartu produk dengan model modern dan rapi mengikuti gaya keranjang.html
      var card = document.createElement('article');
      card.className = 'product-chip titip-product-card' + (selected ? ' is-selected' : '');
      card.setAttribute('role', 'region');
      card.setAttribute('aria-label', product.name);

      // Baris atas: Gambar Thumbnail, Detail Produk, dan Tombol Pilih Titip
      var topRow = document.createElement('div');
      topRow.className = 'card-top-row';

      var img = document.createElement('img');
      img.className = 'item-thumbnail titip-thumbnail';
      img.src = Helper.resolveProductImage(product);
      img.alt = product.name;
      img.loading = 'lazy';

      var topInfo = document.createElement('div');
      topInfo.className = 'card-top-info';

      var nameEl = document.createElement('h3');
      nameEl.className = 'chip-name';
      nameEl.textContent = product.name;

      var statusSpan = document.createElement('span');
      statusSpan.className = 'chip-status ' + (habis ? 'status-habis' : 'status-tersedia');
      statusSpan.textContent = habis ? 'Stok Habis (bisa dititip)' : 'Tersedia (bisa dititip)';

      var pickBtn = document.createElement('button');
      pickBtn.type = 'button';
      pickBtn.className = 'button button-pick-titip ' + (selected ? 'button-primary is-picked' : 'button-light');
      pickBtn.textContent = selected ? '✓ Dipilih' : '+ Titip';
      pickBtn.setAttribute('aria-label', (selected ? 'Batalkan titip ' : 'Titipkan ') + product.name);
      pickBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleProduct(product);
      });

      topInfo.append(nameEl, statusSpan);
      topRow.append(img, topInfo, pickBtn);
      card.appendChild(topRow);

      // Unit Selector: sinkron dari "Pilihan satuan dan harga" admin di admin-products.html
      // dengan gaya Radio Button persis seperti di keranjang.html
      if (product.units && product.units.length > 0) {
        var unitSelector = document.createElement('div');
        unitSelector.className = 'unit-selector';

        var unitLabelHeader = document.createElement('div');
        unitLabelHeader.className = 'unit-selector-label';
        unitLabelHeader.textContent = 'Pilih satuan:';

        var unitOptions = document.createElement('div');
        unitOptions.className = 'unit-options';

        product.units.forEach(function (unit, index) {
          var unitOption = document.createElement('label');
          unitOption.className = 'unit-option';

          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'unit-titip-' + product.id;
          radio.value = unit.name;
          if (activeUnitName === unit.name) {
            radio.checked = true;
          }

          radio.addEventListener('change', function (e) {
            e.stopPropagation();
            pilihSatuan(product, unit.name);
          });

          var unitLabel = document.createElement('span');
          unitLabel.className = 'unit-label';
          unitLabel.textContent = unit.name;

          var unitPrice = document.createElement('span');
          unitPrice.className = 'unit-price';
          unitPrice.textContent = 'Harga pasar';

          unitOption.append(radio, unitLabel, unitPrice);
          unitOptions.append(unitOption);
        });

        unitSelector.append(unitLabelHeader, unitOptions);
        card.appendChild(unitSelector);
      }

      // Klik kartu di area netral juga bisa toggle
      card.addEventListener('click', function (e) {
        if (e.target.closest('label.unit-option') || e.target.closest('button')) return;
        toggleProduct(product);
      });

      productList.appendChild(card);
    });
  }

  // Memilih satuan tertentu pada produk (menimpa satuan sebelumnya).
  // Satuan berasal dari "Pilihan satuan dan harga" admin di admin-products.html.
  function pilihSatuan(product, unitName) {
    var draft = draftItems.find(function (item) { return String(item.id) === String(product.id); });
    if (draft) {
      draft.unit = unitName;
      // KUNCI: sesuaikan kuantitas ke langkah & batas satuan BARU.
      // ½ kg -> pindah ke per buah harus menjadi 1 buah (bukan ½ buah).
      if (typeof window.Satuan !== 'undefined') {
        draft.qty = window.Satuan.sesuaikan(draft.qty, unitName);
      }
    } else {
      draftItems.push({
        id: String(product.id),
        name: product.name,
        unit: unitName,
        qty: typeof window.Satuan !== 'undefined' ? window.Satuan.minimum(unitName) : 1,
        image: product.image || ''
      });
    }
    persistDraft();
    renderProducts();
    renderDraft();
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
    persistDraft();
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
      if (typeof window.Satuan !== 'undefined' && !window.Satuan.bisaKurang(item.qty, item.unit)) {
        minus.disabled = true;
      }
      minus.addEventListener('click', function () { changeQty(item.id, -1); });

      var qty = document.createElement('span');
      qty.className = 'qty-value';
      qty.textContent = typeof window.Satuan !== 'undefined'
        ? window.Satuan.format(item.qty, item.unit)
        : item.qty;

      var plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Tambah jumlah ' + item.name);
      if (typeof window.Satuan !== 'undefined' && !window.Satuan.bisaTambah(item.qty, item.unit)) {
        plus.disabled = true;
      }
      plus.addEventListener('click', function () { changeQty(item.id, 1); });

      picker.append(minus, qty, plus);

      // Chip cepat: daftar sama persis dengan keranjang agar konsisten.
      var chipsRow = document.createElement('div');
      chipsRow.className = 'qty-chips';
      if (typeof window.Satuan !== 'undefined') {
        window.Satuan.chips(item.unit).forEach(function (nilai) {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'qty-chip';
          if (Math.abs(Number(item.qty) - nilai) < 1e-9) chip.classList.add('is-active');
          chip.textContent = window.Satuan.format(nilai, item.unit);
          chip.addEventListener('click', function () { setQty(item.id, nilai); });
          chipsRow.appendChild(chip);
        });
      }

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-item';
      remove.textContent = 'Buang';
      remove.addEventListener('click', function () { removeDraft(item.id); });

      row.append(img, info, picker, chipsRow, remove);
      titipItemsEl.appendChild(row);
    });
  }

  function changeQty(id, delta) {
    var item = draftItems.find(function (entry) { return String(entry.id) === String(id); });
    if (!item) return;
    // Langkah mengikuti satuan: kg/ons = 0,5 ; lainnya = 1.
    item.qty = typeof window.Satuan !== 'undefined'
      ? window.Satuan.geser(item.qty, delta, item.unit)
      : Math.max(1, item.qty + delta);
    persistDraft();
    renderDraft();
  }

  // Set langsung dari chip cepat.
  function setQty(id, nilai) {
    var item = draftItems.find(function (entry) { return String(entry.id) === String(id); });
    if (!item) return;
    item.qty = typeof window.Satuan !== 'undefined'
      ? window.Satuan.sesuaikan(nilai, item.unit)
      : Math.max(1, Number(nilai) || 1);
    persistDraft();
    renderDraft();
  }

  function removeDraft(id) {
    draftItems = draftItems.filter(function (entry) { return String(entry.id) !== String(id); });
    persistDraft();
    renderProducts();
    renderDraft();
  }

  // --- Kirim titipan -------------------------------------------------------
  function kirimTitipan() {
    if (!draftItems.length) {
      showToast('Pilih minimal satu produk untuk dititipkan.');
      return;
    }

    confirmRead.checked = false;
    confirmSubmit.disabled = true;
    if (typeof confirmDialog.showModal === 'function') {
      confirmDialog.showModal();
    } else {
      confirmDialog.setAttribute('open', '');
    }
    confirmRead.focus();
  }

  function simpanTitipan() {
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
    persistDraft();
    renderProducts();
    renderDraft();
    renderAktif();
    renderRiwayat();
    showToast('Titipan terkirim. Admin akan membelikannya di pasar besok pagi.');
  }

  // --- Titipan aktif & riwayat ----------------------------------------------
  // Riwayat menampilkan titipan yang pesanan checkout-nya selesai serta
  // titipan yang seluruh produknya tidak tersedia di pasar.
  function renderAktif() {
    var requests = Helper.getTitipanUser().filter(function (request) {
      return ['selesai', 'dibatalkan', 'habis_di_pasaran'].indexOf(String(request.status)) === -1;
    });

    aktifListEl.innerHTML = '';

    if (!requests.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var h = document.createElement('h3');
      h.textContent = 'Belum ada titipan aktif';
      var p = document.createElement('p');
      p.textContent = 'Titipan yang sudah kamu kirim ke admin akan tampil di sini beserta statusnya.';
      empty.append(h, p);
      aktifListEl.appendChild(empty);
      return;
    }

    requests.forEach(function (request) {
      aktifListEl.appendChild(createRequestCard(requestWithLinkedOrderStatus(request), true));
    });
  }

  function requestWithLinkedOrderStatus(request) {
    if (Helper.cariStatusPesananTitipan(request.id) === 'dibatalkan' &&
      String(request.status) !== 'dibatalkan') {
      return Object.assign({}, request, { status: 'dibatalkan' });
    }
    return request;
  }

  function renderRiwayat() {
    var requests = Helper.getTitipanUser().map(requestWithLinkedOrderStatus).filter(function (request) {
      if (String(request.status) === 'dibatalkan') return true;
      if (String(request.status) === 'habis_di_pasaran') return true;
      if (String(request.status) === 'selesai') return true;
      return Helper.cariStatusPesananTitipan(request.id) === 'selesai';
    });

    titipListEl.innerHTML = '';

    if (!requests.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      var h = document.createElement('h3');
      h.textContent = 'Belum ada riwayat titipan';
      var p = document.createElement('p');
      p.textContent = 'Titipan yang selesai atau tidak tersedia di pasar akan muncul di sini.';
      empty.append(h, p);
      titipListEl.appendChild(empty);
      return;
    }

    requests.forEach(function (request) {
      titipListEl.appendChild(createRequestCard(requestWithLinkedOrderStatus(request), false));
    });
  }

  // Tombol Checkout: mengirim item titipan yang sudah dibelikan admin
  // (dengan harga pasar) ke halaman checkout.html. Pelanggan memilih
  // metode pengiriman & pembayaran di sana, seperti pesanan biasa.
  function checkoutTitipan(requestId) {
    if (typeof isValidSession !== 'function' || !isValidSession()) {
      window.location.href = 'login.html';
      return;
    }
    var result = Helper.siapkanCheckoutTitipan(requestId);
    if (!result || !result.ok) {
      showToast((result && result.reason) || 'Titipan belum siap untuk di-checkout.');
      return;
    }
    showToast('Membuka halaman checkout...');
    if (typeof setUserLastPosition === 'function') setUserLastPosition('checkout.html');
    // Akses sah ke checkout.html: dari tombol Checkout di halaman Titip Beli.
    if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
      window.NavigationGuard.grantAccess('checkout.html', 'titip_checkout_button');
    }
    window.setTimeout(function () { window.location.href = 'checkout.html'; }, 350);
  }

  // Tombol Hapus Milik User (hanya diizinkan jika sudah berstatus 'selesai' di orders.html).
  // Isolasi dua arah: hanya menghapus dari penyimpanan milik user (dikyTitipan_<userId>).
  // Data admin di admin-titip.html dan arsip admin TIDAK TERPENGARUH.
  function hapusTitipanPelanggan(requestId) {
    var request = Helper.getTitipanUser().find(function (entry) { return String(entry.id) === String(requestId); });
    if (!request) {
      showToast('Data titipan tidak ditemukan.');
      return;
    }

    var orderStatus = Helper.cariStatusPesananTitipan(request.id);
    var isSelesai = String(request.status) === 'selesai' || orderStatus === 'selesai';
    var isDibatalkan = String(request.status) === 'dibatalkan' || orderStatus === 'dibatalkan';
    var isUnavailable = String(request.status) === 'habis_di_pasaran';

    if (!isSelesai && !isDibatalkan && !isUnavailable) {
      window.alert('Daftar titipan belum dapat dihapus karena belum diproses sampai ke tab "Selesai" di halaman Pesanan Anda.');
      return;
    }

    var confirmMsg = 'Apakah Anda yakin ingin menghapus data daftar produk titipan ' + String(request.id).toUpperCase() + ' ini dari riwayat Anda?\n\n' +
      'Data ini hanya dihapus dari tampilan Anda dan tidak mempengaruhi catatan admin.';
    if (!window.confirm(confirmMsg)) return;

    var ok = Helper.hapusTitipanUser(request.id);
    if (ok) {
      renderAktif();
      renderRiwayat();
      showToast('Daftar titipan berhasil dihapus dari riwayat Anda.');
    } else {
      showToast('Gagal menghapus titipan. Coba muat ulang halaman.');
    }
  }

  function createRequestCard(request, isAktif) {
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
    status.textContent = isAktif || ['habis_di_pasaran', 'dibatalkan'].indexOf(String(request.status)) !== -1
      ? Helper.requestStatusLabel(request.status)
      : 'Selesai';
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
    if (String(request.status) === 'habis_di_pasaran') {
      var unavailableNotice = document.createElement('div');
      unavailableNotice.className = 'notice-box notice-habis';
      unavailableNotice.textContent = 'Titipan tidak dapat dilanjutkan ke checkout karena semua produk yang diminta habis di pasar. Tidak ada biaya yang ditagihkan.';
      card.appendChild(unavailableNotice);
    }

    var total = Helper.computeDitagihkan(request.items);
    if (total > 0) {
      var tagihan = document.createElement('div');
      tagihan.className = 'notice-box notice-tagihan';
      tagihan.textContent = 'Total yang dibelikan untuk Anda: ' + Helper.money(total) + '.';
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

    if (isAktif && String(request.status) === 'siap_checkout') {
      // Tombol menuju checkout.html setelah admin memfinalisasi titipan.
      var actions = document.createElement('div');
      actions.className = 'titip-card-actions';
      var checkoutBtn = document.createElement('button');
      checkoutBtn.type = 'button';
      checkoutBtn.className = 'button button-primary';
      checkoutBtn.textContent = 'Checkout Sekarang';
      checkoutBtn.addEventListener('click', function () { checkoutTitipan(request.id); });
      var hint = document.createElement('p');
      hint.className = 'checkout-hint';
      hint.textContent = 'Admin sudah memfinalisasi titipanmu. Lanjutkan checkout untuk memilih metode pengiriman dan pembayaran.';
      actions.append(checkoutBtn, hint);
      card.appendChild(actions);
    } else if (isAktif && String(request.status) === 'sudah_checkout') {
      var info = document.createElement('div');
      info.className = 'notice-box notice-tagihan';
      info.textContent = 'Kamu sudah melanjutkan titipan ini ke checkout. Selesaikan pembayaran di halaman Checkout; jika kamu menekan "Hapus Pesanan Ini" di sana, titipan ini akan ditandai dibatalkan.';
      card.appendChild(info);
    } else if (!isAktif) {
      // Pada Riwayat Titipan (pesanan sudah mencapai tab Selesai), sediakan tombol Hapus
      var historyActions = document.createElement('div');
      historyActions.className = 'titip-card-actions history-actions';
      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'button button-danger-light';
      deleteBtn.textContent = 'Hapus';
      deleteBtn.title = 'Hapus riwayat titipan ini dari daftar Anda';
      deleteBtn.addEventListener('click', function () { hapusTitipanPelanggan(request.id); });
      historyActions.append(deleteBtn);
      card.appendChild(historyActions);
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
    loadDraft();
    renderInfoBanner();
    renderProducts();
    renderDraft();
    renderAktif();
    renderRiwayat();

    searchProduk.addEventListener('input', renderProducts);
    catatanField.addEventListener('input', persistDraft);
    kirimButton.addEventListener('click', kirimTitipan);
    confirmRead.addEventListener('change', function () {
      confirmSubmit.disabled = !confirmRead.checked;
    });
    confirmSubmit.addEventListener('click', function () {
      if (!confirmRead.checked) return;
      confirmDialog.close();
      simpanTitipan();
    });
    confirmCancel.addEventListener('click', function () {
      confirmDialog.close();
    });
    refreshButton.addEventListener('click', function () {
      loadProducts();
      loadDraft();
      renderInfoBanner();
      renderProducts();
      renderDraft();
      renderAktif();
      renderAktif();
      renderRiwayat();
      showToast('Data titipan dimuat ulang.');
    });

    window.addEventListener('storage', function (event) {
      if (!event.key) return;
      if (event.key.indexOf('dikyTitipan') === 0 || event.key === 'dikyProducts') {
        loadProducts();
        loadDraft();
        renderProducts();
        renderDraft();
        renderAktif();
        renderRiwayat();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', initialize);
  window.addEventListener('pageshow', function () {
    if (typeof isValidSession === 'function' && isValidSession()) {
      loadProducts();
      loadDraft();
      renderInfoBanner();
      renderProducts();
      renderDraft();
      renderRiwayat();
    }
  });
})();

// ============================================================
// HIGHLIGHT PSIKOLOGIS TOMBOL "CHECKOUT SEKARANG" SETELAH DIPENTALKAN
// ============================================================
(function () {
  function checkTitipHighlight() {
    var highlightId = sessionStorage.getItem('highlightTitipCheckout');
    if (!highlightId) return;

    window.setTimeout(function () {
      var allCards = document.querySelectorAll('.titip-card');
      var targetBtn = null;
      allCards.forEach(function (card) {
        var btn = card.querySelector('.titip-card-actions button.button-primary');
        if (btn) targetBtn = btn;
      });

      if (targetBtn) {
        targetBtn.classList.add('checkout-btn-psychology-alert');
        targetBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetBtn.focus();
        if (typeof showToast === 'function') {
          showToast('⚠️ Klik tombol "Checkout Sekarang" untuk memproses titipan Anda!');
        }
      }
      sessionStorage.removeItem('highlightTitipCheckout');
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkTitipHighlight);
  } else {
    checkTitipHighlight();
  }
})();
