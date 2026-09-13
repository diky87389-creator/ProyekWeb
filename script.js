const productGrid = document.getElementById('product-grid');
const cartCount = document.getElementById('cart-count');
const toast = document.getElementById('toast');

function requireLogin() {
  if (!isValidSession()) {
    console.warn('requireLogin: Sesi tidak valid, redirect ke login');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Katalog produksi hanya berasal dari panel admin.
let products = [];

function loadProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
    products = Array.isArray(saved)
      ? saved
        .filter((product) => product && product.id && Array.isArray(product.units))
        .map((product) => ({
          ...product,
          stock: Number.isFinite(Number(product.stock)) && Number(product.stock) >= 0
            ? Math.floor(Number(product.stock))
            : 0,
          units: product.units.filter((unit) => unit && unit.name && Number.isFinite(Number(unit.price)) && Number(unit.price) >= 0)
        }))
        .filter((product) => product.units.length > 0)
      : [];
  } catch (error) {
    products = [];
  }
  renderProducts();
}

function refreshCatalogFromStorage() {
  loadProducts();
  if (typeof productGrid !== 'undefined' && productGrid) renderProducts();
}

window.addEventListener('storage', (event) => {
  if (event.key === 'dikyProducts') refreshCatalogFromStorage();
});
window.addEventListener('products-updated', refreshCatalogFromStorage);

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
  const cartKey = getUserStorageKey('cart');
  if (!cartKey) {
    console.warn('getCart: Tidak dapat mengakses keranjang - user tidak valid');
    return [];
  }

  const raw = localStorage.getItem(cartKey);
  try {
    return typeof normalizeCart === 'function' ? normalizeCart(raw ? JSON.parse(raw) : []) : (raw ? JSON.parse(raw) : []);
  } catch (error) {
    console.warn('Data keranjang tidak valid, membuat ulang data baru.', error);
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
  if (cart && cart.length > 0) {
    if (typeof setUserLastPosition === 'function') setUserLastPosition('keranjang.html');
  }
  updateCartCount(cart);

  if (window.SmartGuide && typeof window.SmartGuide.init === 'function') {
    window.SmartGuide.init();
  }
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

function forceCleanReRender() {
  // Clear all UI elements and re-render with current user's data
  clearElement(productGrid);
  renderProducts();

  // Update cart count with current user's cart
  const cart = getCart();
  updateCartCount(cart);

  console.log('Clean re-render completed for current user');
}

function addToCart(productId) {
  loadProducts();
  const cart = getCart();
  const product = products.find((item) => item.id === productId);
  if (!product) {
    return;
  }

  // Use default unit (index 0)
  const defaultUnitIndex = 0;
  const selectedUnit = product.units[defaultUnitIndex];
  if (!selectedUnit || Number(selectedUnit.price) < 0) return;
  const cartItemId = `${productId}-${defaultUnitIndex}`;

  const existingItem = cart.find((item) => item.cartItemId === cartItemId);
  const stock = Number(product.stock);
  if (Number.isFinite(stock) && stock <= 0) {
    showToast('Stok produk sedang habis.');
    return;
  }
  if (existingItem) {
    if (Number.isFinite(stock) && existingItem.quantity >= stock) {
      showToast('Jumlah melebihi stok tersedia.');
      return;
    }
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
  const stock = Math.max(0, Math.floor(Number(product.stock) || 0));
  button.disabled = stock <= 0;
  button.textContent = stock <= 0 ? 'Stok Habis' : 'Tambah ke Keranjang';
  button.setAttribute('aria-label', stock <= 0 ? `${product.name} - Stok Habis` : `Tambah ${product.name} ke keranjang`);
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

  // Clean up old static cart data structure if exists (migration)
  loadProducts();

  const user = getActiveUser();
  if (user && user.id) {
    const oldCartKey = 'dikyCart';
    const oldRaw = localStorage.getItem(oldCartKey);

    if (oldRaw) {
      console.log('Migrating old static cart data to user-specific structure...');
      try {
        const oldCart = JSON.parse(oldRaw);
        if (Array.isArray(oldCart) && oldCart.length > 0) {
          // Migrate old cart to new user-specific key
          const newCartKey = getUserStorageKey('cart');
          if (newCartKey) {
            localStorage.setItem(newCartKey, JSON.stringify(oldCart));
            console.log('Cart data migrated to:', newCartKey);
          }
        }
        // Remove old static key
        localStorage.removeItem(oldCartKey);
      } catch (error) {
        console.warn('Error migrating old cart data:', error);
        localStorage.removeItem(oldCartKey);
      }
    }
  }

  // Clean up old cart data structure if exists
  const cart = getCart();
  const needsMigration = cart.some(item => !item.cartItemId);

  if (needsMigration) {
    console.log('Migrating old cart data to new structure...');
    const cartKey = getUserStorageKey('cart');
    if (cartKey) {
      localStorage.removeItem(cartKey);
    }
  }

  // Force clean re-render to ensure only current user's data is shown
  forceCleanReRender();

  // Pasang event listener sah untuk ikon keranjang dari index.html
  const cartLink = document.querySelector('.cart-link');
  if (cartLink) {
    cartLink.addEventListener('click', function () {
      if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
        window.NavigationGuard.grantAccess('keranjang.html', 'index_cart_icon');
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', initPage);
