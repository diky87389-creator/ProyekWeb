const cartKey = 'dikyCart';
const activeUserKey = 'dikyActiveUser';
const orderSummaryElement = document.getElementById('order-summary');
const orderTotalElement = document.getElementById('order-total');
const checkoutForm = document.getElementById('checkout-form');
const confirmButton = document.getElementById('confirm-button');
const customerAddressField = document.getElementById('customer-address');
const addressFieldGroup = document.getElementById('address-field-group');
const deliveryMethodInputs = checkoutForm.querySelectorAll('input[name="deliveryMethod"]');

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
    console.warn('Data keranjang tidak valid.', error);
    localStorage.removeItem(cartKey);
    return [];
  }
}

function renderOrderSummary() {
  const cart = getCart();
  clearElement(orderSummaryElement);

  if (cart.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const heading = document.createElement('h3');
    heading.textContent = 'Keranjang kosong';

    const text = document.createElement('p');
    text.textContent = 'Tambahkan produk dari katalog sebelum melanjutkan ke checkout.';

    emptyState.append(heading, text);
    orderSummaryElement.append(emptyState);
    orderTotalElement.textContent = formatPrice(0);
    confirmButton.disabled = true;
    return;
  }

  let totalPrice = 0;
  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    totalPrice += itemTotal;

    const summaryItem = document.createElement('article');
    summaryItem.className = 'summary-item';

    const itemImage = document.createElement('img');
    itemImage.className = 'summary-item-image';
    itemImage.src = item.image || 'images/Toko Sayur Online.png';
    itemImage.alt = item.name;

    const summaryContent = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'summary-item-title';
    title.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'summary-item-meta';

    const quantity = document.createElement('span');
    quantity.textContent = `${item.quantity} x ${formatPrice(item.price)}`;

    const unit = document.createElement('span');
    unit.textContent = item.unit;

    meta.append(quantity, unit);
    summaryContent.append(title, meta);

    const total = document.createElement('div');
    total.className = 'summary-item-total';
    total.textContent = formatPrice(itemTotal);

    summaryItem.append(itemImage, summaryContent, total);
    orderSummaryElement.append(summaryItem);
  });

  orderTotalElement.textContent = formatPrice(totalPrice);
  confirmButton.disabled = false;
  updateSummaryCosts();
}

function getSelectedPaymentMethod() {
  const selected = checkoutForm.querySelector('input[name="paymentMethod"]:checked');
  return selected ? selected.value : 'Tunai';
}

function getSelectedDeliveryMethod() {
  const selected = checkoutForm.querySelector('input[name="deliveryMethod"]:checked');
  return selected ? selected.value : 'Diantar ke Rumah';
}

function getShippingCost() {
  return getSelectedDeliveryMethod() === 'Diantar ke Rumah' ? 10000 : 0;
}

function updateSummaryCosts() {
  const cart = getCart();
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = getShippingCost();

  const shippingCostElement = document.getElementById('shipping-cost');
  if (shippingCostElement) {
    shippingCostElement.textContent = formatPrice(shippingCost);
  }

  orderTotalElement.textContent = formatPrice(subtotal + shippingCost);
}

function toggleDeliveryAddress() {
  const deliveryMethod = getSelectedDeliveryMethod();
  const defaultText = 'Diambil langsung ke Warung Sayur Diky';

  if (deliveryMethod === 'Ambil Sendiri ke Warung') {
    customerAddressField.value = defaultText;
    customerAddressField.required = false;
    addressFieldGroup.style.display = 'none';
  } else {
    if (customerAddressField.value === defaultText) {
      customerAddressField.value = '';
    }
    customerAddressField.required = true;
    addressFieldGroup.style.display = 'block';
  }
}

function validateForm() {
  const name = document.getElementById('customer-name');
  const phone = document.getElementById('customer-phone');
  const address = document.getElementById('customer-address');
  const deliveryMethod = getSelectedDeliveryMethod();

  if (!name.value.trim()) {
    name.focus();
    return false;
  }

  const phoneValue = phone.value.replace(/[\s+\-().]/g, '');
  if (!phoneValue || phoneValue.length < 10) {
    phone.focus();
    return false;
  }

  if (deliveryMethod === 'Diantar ke Rumah' && !address.value.trim()) {
    address.focus();
    return false;
  }

  return true;
}

function buildOrderData() {
  const cart = getCart();
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();
  const address = document.getElementById('customer-address').value.trim();
  const deliveryMethod = getSelectedDeliveryMethod();
  const paymentMethod = getSelectedPaymentMethod();
  const shippingCost = getShippingCost();
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    id: `ORD-${Date.now()}`,
    createdAt: new Date().toISOString(),
    cart,
    totalPrice: subtotal + shippingCost,
    shippingCost,
    deliveryMethod,
    customer: {
      name,
      phone,
      address,
      paymentMethod
    }
  };
}

async function submitOrder() {
  if (!validateForm()) {
    alert('Silakan lengkapi semua data pengiriman dengan benar sebelum melanjutkan.');
    return;
  }

  const button = document.getElementById('confirm-button');
  const modal = document.querySelector('.loading-modal');
  const loadingBar = modal.querySelector('.loading-bar');
  const loadingPercent = modal.querySelector('.loading-percent');
  
  // Disable button and show modal
  button.disabled = true;
  modal.classList.add('active');
  
  // Simulate loading progress
  for (let i = 0; i <= 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 30)); // 30ms per step
    loadingBar.style.width = `${i}%`;
    loadingPercent.textContent = `${i}%`;
    
    // Slow down near completion for better UX
    if (i > 80) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  // Brief pause at 100% before redirect
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const orderData = buildOrderData();
  const paymentMethod = getSelectedPaymentMethod();

  if (paymentMethod === 'Hutang') {
    saveDebtFromCheckout(orderData);
  }

  localStorage.setItem('dikyLastOrder', JSON.stringify(orderData));
  window.location.href = 'success.html';
}

function saveDebtFromCheckout(orderData) {
  const STORAGE_KEY = 'wsd_hutang_data';
  let debts = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    debts = raw ? JSON.parse(raw) : [];
  } catch (e) {
    debts = [];
  }

  const cart = orderData.cart || [];
  const items = cart.map(function (item) {
    return {
      name: item.name,
      qty: item.quantity,
      price: item.price
    };
  });

  const shippingCost = orderData.shippingCost || 0;
  if (shippingCost > 0) {
    items.push({ name: 'Ongkir', qty: 1, price: shippingCost });
  }

  const subtotal = cart.reduce(function (sum, item) {
    return sum + item.price * item.quantity;
  }, 0);
  const totalAmount = subtotal + shippingCost;

  const debt = {
    id: 'HUT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    customerName: orderData.customer.name,
    phone: orderData.customer.phone,
    address: orderData.customer.address,
    items: items,
    subtotal: subtotal,
    shippingCost: shippingCost,
    totalAmount: totalAmount,
    date: new Date().toISOString().slice(0, 10),
    status: 'belum',
    note: 'Dari Checkout - Hutang Pelanggan'
  };

  debts.unshift(debt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(debts));
}

function initializeCheckoutPage() {
  if (!requireLogin()) return;
  renderOrderSummary();
  deliveryMethodInputs.forEach((input) => input.addEventListener('change', () => {
    toggleDeliveryAddress();
    updateSummaryCosts();
  }));
  toggleDeliveryAddress();
  updateSummaryCosts();
  confirmButton.addEventListener('click', submitOrder);
}

window.addEventListener('DOMContentLoaded', initializeCheckoutPage);