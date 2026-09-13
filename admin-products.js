'use strict';
(function () {
  var STORAGE_KEY = 'dikyProducts';
  var DEFAULT_IMAGE = 'images/Toko Sayur Online.png';
  var products = [];
  var editingId = null;
  var list;
  var dialog;
  var form;

  function escapeHTML(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function safeNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function createSlug(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function readProducts() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  function normalizeProduct(product) {
    var units = Array.isArray(product.units) ? product.units.map(function (unit) {
      return { name: String(unit.name || '').trim(), price: safeNumber(unit.price) };
    }).filter(function (unit) { return unit.name; }) : [];
    return { id: createSlug(product.id || product.name), name: String(product.name || '').trim(), description: String(product.description || '').trim(), image: String(product.image || DEFAULT_IMAGE), stock: Math.floor(safeNumber(product.stock)), price: units.length ? units[0].price : safeNumber(product.price), units: units };
  }

  function saveProducts() {
    // Setiap record katalog selalu menyimpan pasangan ID dan image terkompresi.
    products = products.map(normalizeProduct);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
      window.dispatchEvent(new Event('products-updated'));
      return true;
    } catch (error) {
      console.error('Gagal menyimpan katalog produk:', error);
      return false;
    }
  }

  function compressImage(file, onSuccess, onError) {
    var reader = new FileReader();
    reader.onload = function () {
      var image = new Image();
      image.onload = function () {
        var maxDimension = 1200;
        var scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        var context = canvas.getContext('2d');
        if (!context) { onError(new Error('Canvas tidak tersedia.')); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // JPEG terkompresi menjaga Base64 tetap kecil walau file asli besar.
        var compressed = canvas.toDataURL('image/jpeg', 0.72);
        if (compressed.length > 350000) compressed = canvas.toDataURL('image/jpeg', 0.55);
        onSuccess(compressed);
      };
      image.onerror = function () { onError(new Error('Gambar tidak dapat diproses.')); };
      image.src = String(reader.result);
    };
    reader.onerror = function () { onError(new Error('Gambar gagal dibaca.')); };
    reader.readAsDataURL(file);
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(safeNumber(value));
  }

  function render() {
    if (!products.length) { list.innerHTML = '<div class="empty">Belum ada produk. Tambahkan produk pertama.</div>'; return; }
    list.innerHTML = products.map(function (product) {
      var unitText = product.units.map(function (unit) { return escapeHTML(unit.name) + ': ' + formatPrice(unit.price); }).join(' · ');
      return '<article class="product-card"><img src="' + escapeHTML(product.image) + '" alt="' + escapeHTML(product.name) + '"><div class="product-body"><h2>' + escapeHTML(product.name) + '</h2><p>' + escapeHTML(product.description || 'Tidak ada deskripsi.') + '</p><p>' + unitText + '</p><div class="product-meta"><span class="stock">Stok: ' + product.stock + '</span></div><div class="card-actions"><button class="action" type="button" data-edit="' + escapeHTML(product.id) + '">Edit</button><button class="action danger" type="button" data-delete="' + escapeHTML(product.id) + '">Hapus</button></div></div></article>';
    }).join('');
  }

  function checkedUnits() {
    return Array.prototype.slice.call(document.querySelectorAll('input[name="product-unit"]:checked'));
  }

  function renderUnitPriceFields(prices) {
    var values = prices || {};
    var container = document.getElementById('unit-price-fields');
    container.innerHTML = '';
    checkedUnits().forEach(function (checkbox) {
      var row = document.createElement('label');
      row.className = 'unit-price-row';
      row.textContent = 'Harga ' + checkbox.value;
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.required = true;
      input.dataset.unitPrice = checkbox.value;
      input.value = values[checkbox.value] == null ? '' : values[checkbox.value];
      row.appendChild(input);
      container.appendChild(row);
    });
  }

  function getUnitsFromForm() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-unit-price]')).map(function (input) {
      return { name: input.dataset.unitPrice, price: Number(input.value) };
    });
  }

  function openForm(product) {
    editingId = product ? product.id : null;
    document.getElementById('form-title').textContent = product ? 'Edit Produk' : 'Produk Baru';
    document.getElementById('product-id').value = product ? product.id : '';
    document.getElementById('product-id').readOnly = Boolean(product);
    document.getElementById('product-name').value = product ? product.name : '';
    document.getElementById('product-description').value = product ? product.description : '';
    document.getElementById('product-stock').value = product ? product.stock : '';
    document.getElementById('product-image').value = '';
    var prices = {};
    if (product) product.units.forEach(function (unit) { prices[unit.name] = unit.price; });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="product-unit"]'), function (checkbox) { checkbox.checked = Object.prototype.hasOwnProperty.call(prices, checkbox.value); });
    renderUnitPriceFields(prices);
    document.getElementById('form-error').textContent = '';
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function closeForm() {
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    editingId = null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    var error = document.getElementById('form-error');
    var fileInput = document.getElementById('product-image');
    var selectedFile = fileInput.files && fileInput.files[0];
    var existingProduct = editingId ? products.find(function (item) { return item.id === editingId; }) : null;
    var units = getUnitsFromForm();
    var product = {
      id: createSlug(document.getElementById('product-id').value),
      name: document.getElementById('product-name').value.trim(),
      description: document.getElementById('product-description').value.trim(),
      image: existingProduct ? existingProduct.image : DEFAULT_IMAGE,
      stock: Number(document.getElementById('product-stock').value),
      units: units
    };
    if (!product.id || !product.name || !units.length || units.some(function (unit) {
      return !Number.isFinite(unit.price) || unit.price < 0;
    }) || !Number.isFinite(product.stock) || product.stock < 0 || Math.floor(product.stock) !== product.stock) {
      error.textContent = 'Pilih minimal satuan dan masukkan harga serta stok yang valid.';
      return;
    }
    if (products.some(function (item) {
      return item.id === product.id && item.id !== editingId;
    })) {
      error.textContent = 'ID produk sudah digunakan.';
      return;
    }
    product.price = units[0].price;

    function finishSave(imageData) {
      if (imageData) product.image = imageData;
      products = editingId
        ? products.map(function (item) { return item.id === editingId ? product : item; })
        : products.concat(product);
      if (!saveProducts()) {
        error.textContent = 'Katalog terlalu penuh. Hapus data sementara browser lalu coba lagi.';
        return;
      }
      render();
      closeForm();
    }

    if (selectedFile) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(selectedFile.type)) {
        error.textContent = 'Pilih gambar PNG, JPG, WEBP, atau GIF.';
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        error.textContent = 'Ukuran gambar maksimal 5 MB.';
        return;
      }
      compressImage(selectedFile, function (imageData) {
        finishSave(imageData);
      }, function () {
        error.textContent = 'Gambar gagal diproses. Pilih file gambar lain.';
      });
    } else if (!editingId) {
      error.textContent = 'Pilih gambar produk terlebih dahulu.';
    } else {
      finishSave();
    }
  }

  function handleListClick(event) {
    var edit = event.target.closest('[data-edit]');
    var remove = event.target.closest('[data-delete]');
    if (edit) {
      var product = products.find(function (item) { return item.id === edit.dataset.edit; });
      if (product) openForm(product);
      return;
    }
    if (remove) {
      var id = remove.dataset.delete;
      var target = products.find(function (item) { return item.id === id; });
      if (target && window.confirm('Hapus produk "' + target.name + '"?')) {
        products = products.filter(function (item) { return item.id !== id; });
        saveProducts();
        render();
      }
    }
  }

  function initialize() {
    list = document.getElementById('product-list');
    dialog = document.getElementById('product-dialog');
    form = document.getElementById('product-form');
    products = readProducts().map(normalizeProduct);
    document.getElementById('unit-options').addEventListener('change', function () {
      renderUnitPriceFields(null);
    });
    document.getElementById('new-product').addEventListener('click', function () {
      openForm(null);
    });
    document.getElementById('cancel-product').addEventListener('click', closeForm);
    form.addEventListener('submit', handleSubmit);
    list.addEventListener('click', handleListClick);
    render();
  }

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) {
      products = readProducts().map(normalizeProduct);
      if (list) render();
    }
  });
  window.addEventListener('products-updated', function () {
    products = readProducts().map(normalizeProduct);
    if (list) render();
  });

  document.addEventListener('DOMContentLoaded', initialize);
}());
