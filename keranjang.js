const cartKey = 'dikyCart';
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

function handleQuantityChange(productId, delta) {
  const cart = getCart();
  const item = cart.find((entry) => entry.id === productId);
  if (!item) return;

  item.quantity = Math.max(1, item.quantity + delta);
  saveCart(cart);
}

function handleItemRemove(productId) {
  const cart = getCart().filter((entry) => entry.id !== productId);
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
  decreaseButton.dataset.id = item.id;
  decreaseButton.textContent = '-';

  const quantityValue = document.createElement('span');
  quantityValue.textContent = item.quantity;

  const increaseButton = document.createElement('button');
  increaseButton.type = 'button';
  increaseButton.dataset.action = 'increase';
  increaseButton.dataset.id = item.id;
  increaseButton.textContent = '+';

  quantityPicker.append(decreaseButton, quantityValue, increaseButton);

  const removeButton = document.createElement('button');
  removeButton.className = 'remove-button';
  removeButton.type = 'button';
  removeButton.dataset.action = 'remove';
  removeButton.dataset.id = item.id;
  removeButton.textContent = 'Hapus';

  itemControls.append(quantityPicker, removeButton);
  itemContent.append(itemHeader, itemDescription, itemControls);

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
      const productId = button.dataset.id;

      if (action === 'increase') {
        handleQuantityChange(productId, 1);
      } else if (action === 'decrease') {
        handleQuantityChange(productId, -1);
      } else if (action === 'remove') {
        handleItemRemove(productId);
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
