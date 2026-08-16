const cartKey = 'dikyCart';
const checkoutItemsKey = 'dikyCheckoutItems'; // Penyimpanan khusus untuk checkout
const summaryKey = 'dikyCheckoutSummary';
const activeUserKey = 'dikyActiveUser';
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

// Product data for unit selection
const products = [
  {
    id: 'bayam-organik',
    name: 'Bayam Organik',
    description: 'Bayam segar dengan daun hijau lebat, ideal untuk tumisan dan sayur bening.',
    image: 'images/Toko Sayur Online.png',
    units: [
      { name: 'per ikat kecil', price: 3000 },
      { name: 'per ikat sedang', price: 5000 }
    ]
  },
  {
    id: 'wortel-fresh',
    name: 'Wortel Fresh',
    description: 'Wortel manis dengan tekstur renyah, cocok untuk salad dan sup sayur.',
    image: 'images/Toko Sayur Online (1).png',
    units: [
      { name: 'per buah', price: 1500 },
      { name: 'per 250g', price: 4500 },
      { name: 'per 500g', price: 8500 },
      { name: 'per ikat', price: 5000 }
    ]
  },
  {
    id: 'selada-keriting',
    name: 'SELADA KERITING',
    description: 'Selada hijau segar yang renyah, sempurna untuk menu sehat harian.',
    image: 'images/Toko Sayur Online (2).png',
    units: [
      { name: 'per ikat kecil', price: 2500 },
      { name: 'per bungkus/pack', price: 4000 }
    ]
  },
  {
    id: 'tomat-cerry',
    name: 'Tomat Cherry',
    description: 'Tomat ceri manis dengan warna merah cerah, cocok untuk camilan dan garnish.',
    image: 'images/Toko Sayur Online (3).png',
    units: [
      { name: 'per buah/biji', price: 1000 },
      { name: 'per pack 100g', price: 6000 },
      { name: 'per pack 250g', price: 12000 }
    ]
  },
  {
    id: 'terong-ungu',
    name: 'Terong Ungu',
    description: 'Terong segar dengan kulit mengkilap, cocok untuk sate, balado, dan tumisan.',
    image: 'images/Toko Sayur Online (4).png',
    units: [
      { name: 'per buah', price: 2000 },
      { name: 'per paket (isi 3 buah)', price: 5000 }
    ]
  },
  {
    id: 'buncis-segar',
    name: 'Buncis Segar',
    description: 'Buncis hijau renta dengan rasa manis alami, pilihan sehat untuk sayur campur.',
    image: 'images/Toko Sayur Online (5).png',
    units: [
      { name: 'per ikat kecil', price: 3000 },
      { name: 'per 250g', price: 6000 }
    ]
  }
];

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

function getActiveUser() {
  const raw = localStorage.getItem(activeUserKey);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Data pengguna aktif tidak valid.', error);
    localStorage.removeItem(activeUserKey);
    return null;
  }
}

function requireLogin() {
  if (!getActiveUser()) {
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
  const raw = localStorage.getItem(cartKey);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Data keranjang tidak valid, menginisialisasi ulang.', error);
    localStorage.removeItem(cartKey);
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(cartKey, JSON.stringify(cart));
  saveCheckoutSummary(cart);
  renderCart();
}

function saveCheckoutSummary(cart) {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const summary = {
    totalItems,
    totalPrice,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(summaryKey, JSON.stringify(summary));
}

function updateTotals(cart) {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  summaryItems.textContent = totalItems;
  summaryTotal.textContent = formatPrice(totalPrice);
  checkoutButton.disabled = totalItems === 0;
  cartStatus.textContent = totalItems === 0 ? 'Keranjang kosong' : `${totalItems} produk siap checkout`;
}

function saveCheckoutSummary(cart) {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const summary = {
    totalItems,
    totalPrice,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(summaryKey, JSON.stringify(summary));
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
  thumbnail.src = item.image || 'images/Toko Sayur Online.png';
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

function closeConfirmationModal() {
  confirmModal.classList.remove('active');
  confirmModal.setAttribute('aria-hidden', 'true');
}

function initializeCartPage() {
  if (!requireLogin()) return;
  renderCart();

  checkoutButton.addEventListener('click', () => {
    if (!checkoutButton.disabled) {
      openConfirmationModal();
    }
  });

  modalCancel.addEventListener('click', closeConfirmationModal);
  modalConfirm.addEventListener('click', () => {
    // Pindahkan data keranjang ke penyimpanan checkout
    const cart = getCart();
    if (cart.length > 0) {
      localStorage.setItem(checkoutItemsKey, JSON.stringify(cart));
    }
    
    // Bersihkan riwayat keranjang dan ringkasan
    localStorage.removeItem(cartKey);
    localStorage.removeItem(summaryKey);
    
    // Update position tracker ke checkout.html
    localStorage.setItem('dikyLastPosition', 'checkout.html');
    
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
