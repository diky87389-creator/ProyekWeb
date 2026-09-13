const cartList = document.getElementById('cart-list');
const cartStatus = document.getElementById('cart-status');
const summaryItems = document.getElementById('summary-items');
const summaryTotal = document.getElementById('summary-total');
const checkoutButton = document.getElementById('checkout-button');
const confirmModal = document.getElementById('confirm-modal');
const modalItems = document.getElementById('modal-items');
const modalTotal = document.getElementById('modal-total');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

// Produk untuk pilihan satuan selalu berasal dari katalog admin.
let products = [];

function loadProducts() {
  try {
    const data = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
    products = Array.isArray(data)
      ? data.filter((product) => product && product.id && Array.isArray(product.units) && product.units.length)
      : [];
  } catch (error) {
    products = [];
  }
}

window.addEventListener('storage', (event) => {
  if (event.key === 'dikyProducts') {
    loadProducts();
    renderCart();
  }
});

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function requireLogin() {
  if (!isValidSession()) {
    console.warn('requireLogin: Sesi tidak valid, redirect ke login');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function formatPrice(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(value);
}

function getCart() {
  loadProducts();
  if (!products.length) return [];
  const cartKey = getUserStorageKey('cart');
  if (!cartKey) {
    console.warn('getCart: Tidak dapat mengakses keranjang - user tidak valid');
    return [];
  }

  const raw = localStorage.getItem(cartKey);
  try {
    const savedItems = typeof normalizeCart === 'function'
      ? normalizeCart(raw ? JSON.parse(raw) : [])
      : (raw ? JSON.parse(raw) : []);
    return savedItems.filter((item) => products.some((product) => product.id === item.id));
  } catch (error) {
    console.warn('Data keranjang tidak valid, menginisialisasi ulang.', error);
    localStorage.removeItem(cartKey);
    return [];
  }
}

function saveCart(cart) {
  cart = typeof normalizeCart === 'function' ? normalizeCart(cart) : cart;
  const cartKey = getUserStorageKey('cart');
  if (!cartKey) {
    console.warn('saveCart: Tidak dapat menyimpan keranjang - user tidak valid');
    return;
  }

  const compactCart = typeof compactOrderItems === 'function' ? compactOrderItems(cart) : cart;
  const savedCart = typeof writeUserStorage === 'function'
    ? writeUserStorage(cartKey, compactCart, [getUserStorageKey('checkoutSummary'), getUserStorageKey('checkoutForm')])
    : (() => { try { localStorage.setItem(cartKey, JSON.stringify(compactCart)); return true; } catch (error) { console.warn('Penyimpanan keranjang penuh.', error); return false; } })();
  if (!savedCart) return;
  // Pesanan baru berdiri sendiri; simpan hanya satu snapshot minimal per user.
  if (typeof simpanPesananBaru === 'function') {
    simpanPesananBaru({ items: compactCart, updatedAt: new Date().toISOString() });
  }
  if (cart && cart.length > 0) {
    if (typeof setUserLastPosition === 'function') setUserLastPosition('keranjang.html');
  }
  saveCheckoutSummary(cart);
  renderCart();

  if (window.SmartGuide && typeof window.SmartGuide.init === 'function') {
    window.SmartGuide.init();
  }
}

function saveCheckoutSummary(cart) {
  const summaryKey = getUserStorageKey('checkoutSummary');
  if (!summaryKey) {
    console.warn('saveCheckoutSummary: Tidak dapat menyimpan summary - user tidak valid');
    return;
  }

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const summary = {
    totalItems,
    totalPrice,
    updatedAt: new Date().toISOString()
  };

  if (typeof writeUserStorage === 'function') {
    writeUserStorage(summaryKey, summary, [getUserStorageKey('checkoutForm')]);
  } else {
    try { localStorage.setItem(summaryKey, JSON.stringify(summary)); } catch (error) { console.warn('Summary checkout tidak dapat disimpan.', error); }
  }
}

function updateTotals(cart) {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  summaryItems.textContent = totalItems;
  summaryTotal.textContent = formatPrice(totalPrice);
  checkoutButton.disabled = totalItems === 0;
  cartStatus.textContent = totalItems === 0 ? 'Keranjang kosong' : `${totalItems} produk siap checkout`;
}

function updateTotals(cart) {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  summaryItems.textContent = totalItems;
  summaryTotal.textContent = formatPrice(totalPrice);
  checkoutButton.disabled = totalItems === 0;
  cartStatus.textContent = totalItems === 0 ? 'Keranjang kosong' : `${totalItems} produk siap checkout`;
}

function handleQuantityChange(cartItemId, delta) {
  const cart = getCart();
  const item = cart.find((entry) => entry.cartItemId === cartItemId);
  if (!item) return;

  item.quantity = Math.max(1, item.quantity + delta);
  saveCart(cart);
}

function handleItemRemove(cartItemId) {
  const cart = getCart().filter((entry) => entry.cartItemId !== cartItemId);
  saveCart(cart);
}

function handleUnitChange(cartItemId, newUnitIndex) {
  const cart = getCart();
  const item = cart.find((entry) => entry.cartItemId === cartItemId);
  if (!item) return;

  const product = products.find((p) => p.id === item.id);
  if (!product || !product.units[newUnitIndex]) return;

  const newUnit = product.units[newUnitIndex];
  const newCartItemId = `${item.id}-${newUnitIndex}`;

  // Check if the new unit combination already exists in cart
  const existingItem = cart.find((entry) => entry.cartItemId === newCartItemId);
  if (existingItem) {
    // Merge quantities if exists
    existingItem.quantity += item.quantity;
    // Remove old item
    const index = cart.findIndex((entry) => entry.cartItemId === cartItemId);
    if (index > -1) {
      cart.splice(index, 1);
    }
  } else {
    // Update the current item with new unit
    item.cartItemId = newCartItemId;
    item.unit = newUnit.name;
    item.price = newUnit.price;
    item.unitIndex = newUnitIndex;
  }

  saveCart(cart);
}

function renderEmptyState() {
  clearElement(cartList);
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';

  const title = document.createElement('h3');
  title.textContent = 'Keranjang masih kosong';

  const message = document.createElement('p');
  message.textContent = 'Tambahkan sayuran segar dari katalog untuk melanjutkan belanja. Klik "Kembali ke Katalog" untuk memilih produk.';

  emptyState.append(title, message);
  cartList.append(emptyState);
}

function createCartItemElement(item) {
  const article = document.createElement('article');
  article.className = 'cart-item';

  const thumbnail = document.createElement('img');
  thumbnail.className = 'item-thumbnail';
  thumbnail.src = typeof resolveProductImage === 'function' ? resolveProductImage(item) : (item.image || 'images/Toko Sayur Online.png');
  thumbnail.alt = item.name;

  const itemContent = document.createElement('div');
  itemContent.className = 'item-content';

  const itemHeader = document.createElement('div');
  itemHeader.className = 'item-header';

  const itemInfo = document.createElement('div');
  const itemTitle = document.createElement('h3');
  itemTitle.className = 'item-title';
  itemTitle.textContent = item.name;

  const itemUnit = document.createElement('p');
  itemUnit.className = 'item-unit';
  itemUnit.textContent = item.unit;

  itemInfo.append(itemTitle, itemUnit);

  const itemPrice = document.createElement('div');
  itemPrice.className = 'item-price';
  itemPrice.textContent = formatPrice(item.price);

  itemHeader.append(itemInfo, itemPrice);

  // Unit selector
  const product = products.find((p) => p.id === item.id);
  if (product && product.units.length > 1) {
    const unitSelector = document.createElement('div');
    unitSelector.className = 'unit-selector';

    const unitSelectorLabel = document.createElement('div');
    unitSelectorLabel.className = 'unit-selector-label';
    unitSelectorLabel.textContent = 'Pilih satuan:';

    const unitOptions = document.createElement('div');
    unitOptions.className = 'unit-options';

    product.units.forEach((unit, index) => {
      const unitOption = document.createElement('label');
      unitOption.className = 'unit-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `unit-${item.cartItemId}`;
      radio.value = index;
      if (index === item.unitIndex) radio.checked = true;
      radio.addEventListener('change', () => handleUnitChange(item.cartItemId, index));

      const unitLabel = document.createElement('span');
      unitLabel.className = 'unit-label';
      unitLabel.textContent = unit.name;

      const unitPrice = document.createElement('span');
      unitPrice.className = 'unit-price';
      unitPrice.textContent = formatPrice(unit.price);

      unitOption.append(radio, unitLabel, unitPrice);
      unitOptions.append(unitOption);
    });

    unitSelector.append(unitSelectorLabel, unitOptions);
    itemContent.append(itemHeader, unitSelector);
  } else {
    itemContent.append(itemHeader);
  }

  const itemDescription = document.createElement('p');
  itemDescription.className = 'item-description';
  itemDescription.textContent = 'Jumlah di keranjang: ';

  const quantityStrong = document.createElement('strong');
  quantityStrong.textContent = item.quantity;
  itemDescription.append(quantityStrong);

  const itemControls = document.createElement('div');
  itemControls.className = 'item-controls';

  const quantityPicker = document.createElement('div');
  quantityPicker.className = 'quantity-picker';

  const decreaseButton = document.createElement('button');
  decreaseButton.type = 'button';
  decreaseButton.dataset.action = 'decrease';
  decreaseButton.dataset.id = item.cartItemId;
  decreaseButton.textContent = '-';

  const quantityValue = document.createElement('span');
  quantityValue.textContent = item.quantity;

  const increaseButton = document.createElement('button');
  increaseButton.type = 'button';
  increaseButton.dataset.action = 'increase';
  increaseButton.dataset.id = item.cartItemId;
  increaseButton.textContent = '+';

  quantityPicker.append(decreaseButton, quantityValue, increaseButton);

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-button';
  removeButton.type = 'button';
  removeButton.dataset.action = 'remove';
  removeButton.dataset.id = item.cartItemId;
  removeButton.textContent = 'Hapus';

  itemControls.append(quantityPicker, removeButton);
  itemContent.append(itemDescription, itemControls);

  const priceBlock = document.createElement('div');
  priceBlock.className = 'price-block';

  const totalPrice = document.createElement('div');
  totalPrice.className = 'total-price';
  totalPrice.textContent = formatPrice(item.price * item.quantity);

  priceBlock.append(totalPrice);
  article.append(thumbnail, itemContent, priceBlock);

  return article;
}

function renderCart() {
  const cart = getCart();
  updateTotals(cart);

  clearElement(cartList);
  if (cart.length === 0) {
    renderEmptyState();
    return;
  }

  cart.forEach((item) => {
    const itemElement = createCartItemElement(item);
    cartList.append(itemElement);
  });

  cartList.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      const cartItemId = button.dataset.id;

      if (action === 'increase') {
        handleQuantityChange(cartItemId, 1);
      } else if (action === 'decrease') {
        handleQuantityChange(cartItemId, -1);
      } else if (action === 'remove') {
        handleItemRemove(cartItemId);
      }
    });
  });
}

function renderModalItems(cart) {
  clearElement(modalItems);

  if (cart.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-state';
    emptyMessage.textContent = 'Keranjang kosong. Tambahkan produk terlebih dahulu.';
    modalItems.append(emptyMessage);
    modalTotal.textContent = formatPrice(0);
    return;
  }

  cart.forEach((item) => {
    const lineTotal = item.price * item.quantity;
    const modalItem = document.createElement('div');
    modalItem.className = 'modal-item';

    const modalItemInfo = document.createElement('div');
    modalItemInfo.className = 'modal-item-info';

    const modalItemTitle = document.createElement('p');
    modalItemTitle.className = 'modal-item-title';
    modalItemTitle.textContent = item.name;

    const modalItemMeta = document.createElement('div');
    modalItemMeta.className = 'modal-item-meta';

    const quantityMeta = document.createElement('span');
    quantityMeta.textContent = `${item.quantity} x ${formatPrice(item.price)}`;

    const unitMeta = document.createElement('span');
    unitMeta.textContent = item.unit;

    modalItemMeta.append(quantityMeta, unitMeta);
    modalItemInfo.append(modalItemTitle, modalItemMeta);

    const modalItemTotal = document.createElement('div');
    modalItemTotal.className = 'modal-item-total';
    modalItemTotal.textContent = formatPrice(lineTotal);

    modalItem.append(modalItemInfo, modalItemTotal);
    modalItems.append(modalItem);
  });

  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  modalTotal.textContent = formatPrice(totalPrice);
}

function openConfirmationModal() {
  const cart = getCart();
  renderModalItems(cart);
  confirmModal.classList.add('active');
  confirmModal.setAttribute('aria-hidden', 'false');
}

function forceCleanReRender() {
  // Clear all UI elements and re-render with current user's cart data
  clearElement(cartList);
  renderCart();

  console.log('Clean re-render completed for cart page');
}

function closeConfirmationModal() {
  confirmModal.classList.remove('active');
  confirmModal.setAttribute('aria-hidden', 'true');
}

function initializeCartPage() {
  if (!requireLogin()) return;
  loadProducts();

  // Proteksi navigasi anti-URL manual bypass:
  // Halaman tetap dibuka, tetapi jika akses tidak sah via ketik URL manual,
  // data daftar keranjang dihapus/dibersihkan sehingga keranjang tampil kosong.
  if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
    window.NavigationGuard.validateAccess('keranjang.html');
  }

  // Force clean re-render to ensure current cart state is rendered
  forceCleanReRender();

  checkoutButton.addEventListener('click', () => {
    if (!checkoutButton.disabled) {
      openConfirmationModal();
    }
  });

  modalCancel.addEventListener('click', closeConfirmationModal);
  modalConfirm.addEventListener('click', () => {
    const cart = getCart();
    if (cart.length > 0) {
      const compactCart = typeof compactOrderItems === 'function' ? compactOrderItems(cart) : cart;
      if (typeof simpanPesananBaru === 'function') {
        simpanPesananBaru({ items: compactCart, updatedAt: new Date().toISOString() });
      }
      const checkoutItemsKey = getUserStorageKey('checkoutItems');
      if (!checkoutItemsKey) {
        console.warn('Tidak dapat memproses checkout - user tidak valid');
        return;
      }

      // Akumulasi pesanan: jangan timpa data checkout yang sudah ada.
      // - Produk + varian yang sama (cartItemId sama) → tambahkan kuantitasnya.
      // - Produk/varian berbeda → tambahkan sebagai baris item baru.
      let existing = [];
      try {
        const raw = localStorage.getItem(checkoutItemsKey);
        existing = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(existing)) existing = [];
      } catch (e) {
        existing = [];
      }

      cart.forEach((newItem) => {
        const match = existing.find((entry) => entry.cartItemId === newItem.cartItemId);
        if (match) {
          match.quantity += newItem.quantity;
        } else {
          existing.push(typeof compactOrderItems === 'function' ? compactOrderItems([newItem])[0] : { ...newItem });
        }
      });

      const savedCheckout = typeof writeUserStorage === 'function'
        ? writeUserStorage(checkoutItemsKey, typeof compactOrderItems === 'function' ? compactOrderItems(existing) : existing, [getUserStorageKey('checkoutSummary'), getUserStorageKey('checkoutForm')])
        : (() => { try { localStorage.setItem(checkoutItemsKey, JSON.stringify(existing)); return true; } catch (error) { console.warn('Penyimpanan checkout penuh.', error); return false; } })();
      if (!savedCheckout) {
        alert('Penyimpanan perangkat penuh. Hapus data sementara browser lalu coba lagi.');
        return;
      }
    }

    // Bersihkan data keranjang saat ini karena sudah dipindahkan ke checkout (Rule 3)
    const cartKey = getUserStorageKey('cart');
    const summaryKey = getUserStorageKey('checkoutSummary');
    if (cartKey) localStorage.removeItem(cartKey);
    if (summaryKey) localStorage.removeItem(summaryKey);

    // Update position tracker ke checkout.html
    if (typeof setUserLastPosition === 'function') setUserLastPosition('checkout.html');

    // Berikan otorisasi navigasi sah ke checkout.html dari tombol modal konfirmasi
    if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
      window.NavigationGuard.grantAccess('checkout.html', 'keranjang_modal_confirm');
    }

    // Redirect ke checkout
    window.location.href = 'checkout.html';
  });

  confirmModal.addEventListener('click', (event) => {
    if (event.target === confirmModal) {
      closeConfirmationModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && confirmModal.classList.contains('active')) {
      closeConfirmationModal();
    }
  });
}

window.addEventListener('DOMContentLoaded', initializeCartPage);
window.addEventListener('pageshow', function () {
  if (typeof isValidSession === 'function' && isValidSession()) {
    loadProducts();
    if (window.NavigationGuard && typeof window.NavigationGuard.validateAccess === 'function') {
      window.NavigationGuard.validateAccess('keranjang.html');
    }
    forceCleanReRender();
  }
});