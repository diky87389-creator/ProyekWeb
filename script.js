const cartKey = 'dikyCart';
const activeUserKey = 'dikyActiveUser';
const productGrid = document.getElementById('product-grid');
const cartCount = document.getElementById('cart-count');
const toast = document.getElementById('toast');

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

function formatPrice(number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(number);
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCart() {
  const raw = localStorage.getItem(cartKey);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('Data keranjang tidak valid, membuat ulang data baru.', error);
    localStorage.removeItem(cartKey);
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartCount(cart);
}

function updateCartCount(cart) {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = totalItems;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 1800);
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function addToCart(productId) {
  const cart = getCart();
  const product = products.find((item) => item.id === productId);
  if (!product) {
    return;
  }

  // Use default unit (index 0)
  const defaultUnitIndex = 0;
  const selectedUnit = product.units[defaultUnitIndex];
  const cartItemId = `${productId}-${defaultUnitIndex}`;

  const existingItem = cart.find((item) => item.cartItemId === cartItemId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      cartItemId: cartItemId,
      id: product.id,
      name: product.name,
      price: selectedUnit.price,
      unit: selectedUnit.name,
      image: product.image,
      quantity: 1,
      unitIndex: defaultUnitIndex
    });
  }

  saveCart(cart);
  showToast(`${product.name} ditambahkan ke keranjang.`);
}

function createProductCard(product) {
  const article = document.createElement('article');
  article.className = 'product-card';

  const productImage = document.createElement('img');
  productImage.className = 'product-image';
  productImage.src = product.image;
  productImage.alt = product.name;
  productImage.loading = 'lazy';
  productImage.width = 400;
  productImage.height = 210;

  const cardBody = document.createElement('div');
  cardBody.className = 'product-card-body';

  const cardInfo = document.createElement('div');
  const productTitle = document.createElement('h3');
  productTitle.className = 'product-title';
  productTitle.textContent = product.name;

  const productDescription = document.createElement('p');
  productDescription.className = 'product-description';
  productDescription.textContent = product.description;

  cardInfo.append(productTitle, productDescription);

  const productActions = document.createElement('div');
  productActions.className = 'product-actions';

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.productId = product.id;
  button.textContent = 'Tambah ke Keranjang';
  button.addEventListener('click', () => addToCart(product.id));

  productActions.append(button);
  cardBody.append(cardInfo, productActions);
  article.append(productImage, cardBody);

  return article;
}

function renderProducts() {
  clearElement(productGrid);
  products.forEach((product) => {
    productGrid.append(createProductCard(product));
  });
}

function initPage() {
  if (!requireLogin()) return;

  // Clean up old cart data structure if exists
  const cart = getCart();
  const needsMigration = cart.some(item => !item.cartItemId);

  if (needsMigration) {
    console.log('Migrating old cart data to new structure...');
    localStorage.removeItem(cartKey);
  }

  renderProducts();
  updateCartCount(getCart());
}

window.addEventListener('DOMContentLoaded', initPage);
