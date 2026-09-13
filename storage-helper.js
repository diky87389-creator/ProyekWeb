/**
 * ==========================================
 * Global Storage Helper for Data Isolation
 * Warung Sayur Diky - Multi-User Architecture
 * ==========================================
 *
 * Fungsi helper global untuk menghasilkan kunci penyimpanan localStorage
 * yang terisolasi berdasarkan ID pengguna yang sedang aktif, serta
 * NavigationGuard untuk proteksi akses halaman dan anti-URL manual bypass.
 */

(function (window) {
  'use strict';

  const ACTIVE_USER_KEY = 'dikyActiveUser';

  function getProductCatalog() {
    let products = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || 'null');
      if (Array.isArray(parsed) && parsed.length) products = parsed;
    } catch (error) {}
    if (!products) {
      try {
        const backup = JSON.parse(localStorage.getItem(PRODUCTS_BACKUP_KEY) || 'null');
        if (Array.isArray(backup) && backup.length) products = backup;
      } catch (error) {}
    }
    if (!products) products = DEFAULT_PRODUCTS.map(function (product) {
      return Object.assign({}, product, { units: product.units.map(function (unit) { return Object.assign({}, unit); }) });
    });
    try {
      const json = JSON.stringify(products);
      localStorage.setItem(PRODUCTS_KEY, json);
      localStorage.setItem(PRODUCTS_BACKUP_KEY, json);
    } catch (error) {}
    return products;
  }

  function backupProductCatalog(products) {
    if (!Array.isArray(products) || !products.length) return;
    try {
      const json = JSON.stringify(products);
      localStorage.setItem(PRODUCTS_KEY, json);
      localStorage.setItem(PRODUCTS_BACKUP_KEY, json);
    } catch (error) { console.error('Katalog produk tidak dapat disimpan:', error); }
  }

  /**
   * Mendapatkan user yang sedang aktif
   * @returns {Object|null} User object atau null jika tidak ada session valid
   */
  function getActiveUser() {
    let raw;
    try { raw = localStorage.getItem(ACTIVE_USER_KEY); } catch (error) { return null; }
    try {
      const user = raw ? JSON.parse(raw) : null;
      // ID adalah identitas isolasi; tanpa ID session tidak boleh membaca storage.
      if (!user || (typeof user.id !== 'string' && typeof user.id !== 'number') || String(user.id).trim() === '') return null;
      user.id = String(user.id);
      return user;
    } catch (error) {
      console.warn('Data pengguna aktif tidak valid.', error);
      try { localStorage.removeItem(ACTIVE_USER_KEY); } catch (e) { }
      return null;
    }
  }

  /**
   * Mendapatkan kunci penyimpanan berdasarkan tipe data dan user aktif
   * @param {string} dataType - Tipe data ('cart', 'orders', 'hutang', 'checkoutItems', 'checkoutSummary', 'lastOrder', 'checkoutForm')
   * @returns {string|null} Kunci penyimpanan atau null jika user tidak valid
   */
  function getUserStorageKey(dataType) {
    const user = getActiveUser();
    if (!user || !user.id) {
      console.warn(`getUserStorageKey: Tidak ada user aktif yang valid untuk dataType: ${dataType}`);
      return null;
    }

    const keyMap = {
      'cart': `dikyCart_${user.id}`,
      'orders': `dikyOrders_${user.id}`,
      'hutang': `dikyHutang_${user.id}`,
      'checkoutItems': `dikyCheckoutItems_${user.id}`,
      'checkoutSummary': `dikyCheckoutSummary_${user.id}`,
      'lastOrder': `dikyLastOrder_${user.id}`,
      'checkoutForm': `dikyCheckoutForm_${user.id}`,
      'pesananAktif': `pesananAktif_${user.id}`,
      'pesananBaru': `pesananBaru_${user.id}`,
      'riwayatPesanan': `riwayatPesanan_${user.id}`,
      'lastPosition': `dikyLastPosition_${user.id}`
    };

    return keyMap[dataType] || null;
  }

  /**
   * Validasi session user aktif
   * @returns {boolean} True jika session valid, false jika tidak
   */
  function isValidSession() {
    const user = getActiveUser();
    return !!(user && user.id);
  }

  /**
   * Mendapatkan ID user yang sedang aktif
   * @returns {string|null} User ID atau null jika tidak valid
   */
  function getActiveUserId() {
    const user = getActiveUser();
    return user ? user.id : null;
  }

  function setUserLastPosition(pageName) {
    const key = getUserStorageKey('lastPosition');
    if (!key || !pageName) return;
    try { localStorage.setItem(key, pageName); } catch (e) { }
  }

  function getUserLastPosition() {
    const key = getUserStorageKey('lastPosition');
    if (!key) return null;
    try {
      const position = localStorage.getItem(key);
      return ['keranjang.html', 'checkout.html', 'success.html'].includes(position) ? position : null;
    } catch (e) { return null; }
  }

  function clearUserLastPosition() {
    const key = getUserStorageKey('lastPosition');
    if (key) localStorage.removeItem(key);
  }

  function getActiveOrders() {
    const finished = ['selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan', 'completed', 'cancelled'];
    const activeOrders = [];
    ['orders', 'pesananAktif', 'pesananBaru', 'cart', 'checkoutItems'].forEach(function (dataType) {
      const key = getUserStorageKey(dataType);
      if (!key) return;
      let data;
      try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch (error) { return; }
      const records = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);
      const isCart = dataType === 'cart' || dataType === 'checkoutItems';
      records.forEach(function (record) {
        if (!record || typeof record !== 'object') return;
        if (isCart || !finished.includes(String(record.status || '').trim().toLowerCase())) activeOrders.push(record);
      });
    });
    return activeOrders;
  }

  // Utility keamanan yang dipakai seluruh halaman untuk data dari storage/user.
  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toSafeNumber(value, fallback) {
    const number = typeof value === 'number' ? value : Number(String(value == null ? '' : value).trim());
    return Number.isFinite(number) && number >= 0 ? number : (fallback == null ? 0 : fallback);
  }

  function normalizeCart(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      if (!item || !item.id) return null;
      const price = toSafeNumber(item.price, -1);
      const quantity = Math.floor(toSafeNumber(item.quantity, -1));
      if (price < 0 || quantity < 1) return null;
      return Object.assign({}, item, { price: price, quantity: quantity });
    }).filter(Boolean);
  }

  /**
   * ==========================================
   * NavigationGuard - Proteksi Navigasi & Anti-URL Bypass
   * ==========================================
   *
   * ATURAN NAVIGASI & ANTI-URL BYPASS:
   * 1. Halaman keranjang.html, checkout.html, success.html, dan orders.html
   *    TETAP DIIZINKAN DIBUKA jika diakses via ketik URL manual di browser,
   *    TETAPI TIDAK BOLEH menampilkan daftar pesanan (data daftar pesanan dihapus/dibersihkan)
   *    sebagai tanda akses tidak sah (unauthorized).
   * 2. Akses sah yang menampilkan daftar pesanan harus melalui tombol/ikon resmi:
   *    - Dari index.html ke keranjang.html: Klik ikon gambar keranjang sah (.cart-link / .cart-icon).
   *    - Dari keranjang.html ke checkout.html: Klik tombol sah "Ya, Lanjut Ke Pembayaran" (#modal-confirm).
   *    - Dari checkout.html ke success.html: Melalui proses submit pesanan yang sah.
   *    - Dari success.html ke orders.html: Klik tombol sah "Lihat Riwayat Pesanan" (#history-button).
   * 3. Pembersihan riwayat halaman sebelumnya saat tombol sah diproses.
   */
  const VALID_TRANSITIONS = {
    'keranjang.html': ['index_cart_icon', 'smart_guide_keranjang'],
    'checkout.html': ['keranjang_modal_confirm', 'smart_guide_checkout'],
    'success.html': ['checkout_submit', 'smart_guide_success'],
    'orders.html': ['success_history_button', 'smart_guide_orders']
  };

  const DEFAULT_SOURCE_MAP = {
    'keranjang.html': 'index_cart_icon',
    'checkout.html': 'keranjang_modal_confirm',
    'success.html': 'checkout_submit',
    'orders.html': 'success_history_button'
  };

  const NavigationGuard = {
    keys: {
      target: 'diky_nav_target',
      source: 'diky_nav_source',
      currentPage: 'diky_current_page',
      timestamp: 'diky_nav_time'
    },

    /**
     * Berikan otorisasi sah untuk menuju halaman target
     * @param {string} targetPage - nama file halaman target (misal: 'keranjang.html')
     * @param {string} [sourceToken] - pengenal tombol/aksi sumber (misal: 'index_cart_icon')
     */
    grantAccess: function (targetPage, sourceToken) {
      if (!targetPage) return;
      const cleanTarget = targetPage.split('?')[0].split('#')[0].split('/').pop();
      const token = sourceToken || DEFAULT_SOURCE_MAP[cleanTarget] || 'valid_action';
      try {
        sessionStorage.setItem(this.keys.target, cleanTarget);
        sessionStorage.setItem(this.keys.source, token);
        sessionStorage.setItem(this.keys.timestamp, Date.now().toString());
      } catch (e) {
        console.warn('NavigationGuard.grantAccess error:', e);
      }
    },

    /**
     * Hapus / bersihkan data daftar pesanan di halaman terkait saat akses tidak sah
     * @param {string} pageName - nama halaman
     */
    clearPageOrderData: function (pageName) {
      const cleanPage = pageName.split('?')[0].split('#')[0].split('/').pop();
      try {
        if (cleanPage === 'keranjang.html') {
          // State pesananBaru harus tetap tersedia saat URL diubah/manual refresh.
          // Hanya data tampilan sementara yang boleh dibersihkan.
          const summaryKey = getUserStorageKey('checkoutSummary');
          if (summaryKey) localStorage.removeItem(summaryKey);
        } else if (cleanPage === 'checkout.html') {
          // Jangan hapus checkoutItems/pesananBaru: keduanya adalah pesanan kedua.
          // Checkout akan membaca state tersebut saat halaman dirender.
        } else if (cleanPage === 'success.html') {
          // pesananAktif dan lastOrder TETAP DIPERTAHANKAN pada success.html
          // bahkan jika pengguna berpindah halaman atau mengubah URL browser.
          // Data HANYA dihapus jika pengguna mengklik tombol 'Lihat Riwayat Pesanan'.
          const checkoutFormKey = getUserStorageKey('checkoutForm');
          if (checkoutFormKey) localStorage.removeItem(checkoutFormKey);
        } else if (cleanPage === 'orders.html') {
          // JANGAN hapus riwayat pesanan yang sudah ada sebelumnya!
          // Riwayat pesanan lama tetap aman dan ditampilkan.
        }
      } catch (e) {
        console.warn('[NavigationGuard] Gagal membersihkan data daftar pesanan:', e);
      }
    },

    /**
     * Validasi apakah akses ke halaman yang diproteksi sah melalui aksi/tombol resmi.
     * Jika tidak sah (misal ketik URL manual di browser):
     * - Halaman TETAP DIIZINKAN DIBUKA (tidak di-redirect / tidak di-block)
     * - Data daftar pesanan di halaman tersebut DIHAPUS / DIBERSIHKAN agar tidak menampilkan pesanan
     * @param {string} pageName - nama halaman yang sedang dimuat
     * @returns {boolean} True jika sah, False jika bypass manual URL / tidak sah
     */
    validateAccess: function (pageName) {
      const cleanPage = pageName.split('?')[0].split('#')[0].split('/').pop();
      const protectedPages = ['keranjang.html', 'checkout.html', 'success.html', 'orders.html'];

      if (!protectedPages.includes(cleanPage)) {
        return true;
      }

      // Validasi sesi aktif
      if (!isValidSession()) {
        console.warn('[NavigationGuard] Sesi login tidak valid.');
        return false;
      }

      let authorizedTarget = null;
      let authorizedSource = null;
      let allowedCurrentPage = null;

      try {
        authorizedTarget = sessionStorage.getItem(this.keys.target);
        authorizedSource = sessionStorage.getItem(this.keys.source);
        allowedCurrentPage = sessionStorage.getItem(this.keys.currentPage);
      } catch (e) {
        console.warn('NavigationGuard sessionStorage error:', e);
      }

      // Cek apakah token navigasi sah
      const validSources = VALID_TRANSITIONS[cleanPage] || [];
      const hasValidToken = (authorizedTarget === cleanPage) && (!authorizedSource || validSources.includes(authorizedSource));
      const isPageRefresh = (allowedCurrentPage === cleanPage);

      const isAuthorized = hasValidToken || isPageRefresh;

      if (isAuthorized) {
        // Navigasi sah via tombol/ikon resmi
        try {
          sessionStorage.setItem(this.keys.currentPage, cleanPage);
          sessionStorage.removeItem(this.keys.target);
          sessionStorage.removeItem(this.keys.source);
        } catch (e) { }

        return true;
      }

      // AKSES TIDAK SAH (Ketik URL manual di address bar atau link tidak resmi)
      console.warn(`[NavigationGuard] Akses manual/tidak sah ke ${cleanPage}. Menghapus data daftar pesanan.`);

      // Hapus data daftar pesanan halaman ini agar tidak menampilkan data
      this.clearPageOrderData(cleanPage);

      // Bersihkan state navigasi
      try {
        sessionStorage.removeItem(this.keys.target);
        sessionStorage.removeItem(this.keys.source);
        sessionStorage.removeItem(this.keys.currentPage);
      } catch (e) { }

      return false;
    },

    /**
     * Menolak akses (kompatibilitas backward jika dipanggil)
     */
    denyAccess: function (reason) {
      console.warn(`[NavigationGuard] Akses ditolak: ${reason}`);
      try {
        sessionStorage.removeItem(this.keys.target);
        sessionStorage.removeItem(this.keys.source);
        sessionStorage.removeItem(this.keys.currentPage);
      } catch (e) { }
    },

    /**
     * Pasang listener global untuk klik tautan keranjang dan riwayat pesanan
     */
    initGlobalListeners: function () {
      document.addEventListener('click', function (event) {
        const cartLink = event.target.closest('a.cart-link, .cart-link, a[href="keranjang.html"], a[href$="keranjang.html"]');
        if (cartLink) {
          NavigationGuard.grantAccess('keranjang.html', 'index_cart_icon');
        }
        const ordersLink = event.target.closest('a.profile-orders-button, a[href="orders.html"], a[href$="orders.html"]');
        if (ordersLink) {
          NavigationGuard.grantAccess('orders.html', 'profile_orders_button');
        }
      }, true);
    }
  };

  // Inisialisasi listener navigasi global
  NavigationGuard.initGlobalListeners();

  // Idle timeout: session pointer dihapus, data user tidak disentuh.
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
  let idleTimer = null;
  function logoutBecauseIdle() {
    if (!isValidSession()) return;
    try { sessionStorage.setItem('diky_security_message', 'Sesi Anda berakhir setelah 15 menit tidak aktif. Silakan login kembali.'); } catch (e) { }
    try { localStorage.removeItem(ACTIVE_USER_KEY); } catch (e) { }
    const page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (page !== 'login.html') window.location.replace('login.html');
  }
  function resetIdleTimer() {
    if (!isValidSession()) return;
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(logoutBecauseIdle, IDLE_TIMEOUT_MS);
  }
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(function (eventName) {
    window.addEventListener(eventName, resetIdleTimer, { passive: true });
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resetIdleTimer, { once: true });
  } else {
    resetIdleTimer();
  }

  /**
   * ==========================================
   * Pesanan Aktif & Riwayat Pesanan Helper
   * Warung Sayur Diky - Storage Management
   * ==========================================
   */

  /**
   * Menyimpan data pesanan aktif ke localStorage dengan kunci 'pesananAktif'
   * @param {Object|string} orderData - Data pesanan yang akan disimpan
   */
  function simpanPesananAktif(orderData) {
    if (!orderData) return false;
    const userPesananKey = getUserStorageKey('pesananAktif');
    if (!userPesananKey) return false;

    const parsed = typeof orderData === 'string'
      ? (() => { try { return JSON.parse(orderData); } catch (e) { return null; } })()
      : orderData;
    const compact = Object.assign({}, parsed || {}, {
      cart: compactOrderItems((parsed && (parsed.cart || parsed.items)) || [])
    });
    delete compact.items;
    const saved = writeUserStorage(userPesananKey, compact, [
      getUserStorageKey('checkoutSummary'),
      getUserStorageKey('checkoutForm')
    ]);
    if (!saved) return false;

    const lastOrderKey = getUserStorageKey('lastOrder');
    if (lastOrderKey) writeUserStorage(lastOrderKey, compact, [getUserStorageKey('checkoutForm')]);
    setUserLastPosition('success.html');
    return true;
  }

  /**
   * Ambil hanya data item yang diperlukan untuk melanjutkan checkout.
   * Field gambar/base64 dan properti katalog lain tidak boleh ikut disimpan.
   */
  function compactOrderItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      if (!item || !item.id) return null;
      const image = typeof item.image === 'string' && !item.image.startsWith('data:') ? item.image : '';
      return {
        id: item.id,
        cartItemId: item.cartItemId || item.id,
        name: String(item.name || ''),
        unit: String(item.unit || ''),
        unitIndex: Number.isInteger(item.unitIndex) ? item.unitIndex : 0,
        price: Number(item.price) || 0,
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        image: image
      };
    }).filter(Boolean);
  }

  function decrementStockForOrder(orderData) {
    // Penanda ini membuat refresh/klik berulang pada success tidak mengurangi
    // stok dua kali untuk order yang sama.
    if (!orderData || orderData.stockDeducted === true) return orderData;
    const items = Array.isArray(orderData.cart) ? orderData.cart : (Array.isArray(orderData.items) ? orderData.items : []);
    if (!items.length) return orderData;
    try {
      const products = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
      if (!Array.isArray(products)) return orderData;
      const quantities = {};
      items.forEach(function (item) {
        const id = item && String(item.id || '').trim();
        const quantity = Math.max(0, Math.floor(Number(item && (item.quantity || item.qty)) || 0));
        if (id && quantity > 0) quantities[id] = (quantities[id] || 0) + quantity;
      });
      if (!Object.keys(quantities).length) return orderData;
      products.forEach(function (product) {
        const id = product && String(product.id || '').trim();
        if (!id || !quantities[id]) return;
        const currentStock = Math.max(0, Math.floor(Number(product.stock) || 0));
        product.stock = Math.max(0, currentStock - quantities[id]);
      });
      localStorage.setItem('dikyProducts', JSON.stringify(products));
      window.dispatchEvent(new Event('products-updated'));
      return Object.assign({}, orderData, { stockDeducted: true });
    } catch (error) {
      console.error('Gagal mengurangi stok produk:', error);
      return orderData;
    }
  }

  function resolveProductImage(item) {
    const fallback = 'images/Toko Sayur Online.png';
    try {
      const products = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
      const product = Array.isArray(products) && item
        ? products.find(function (candidate) { return candidate && String(candidate.id) === String(item.id); })
        : null;
      // ID adalah sumber utama. Jangan gunakan image dari item bila katalog
      // memiliki produk dengan ID yang sama, agar gambar tidak tertukar.
      if (product && typeof product.image === 'string' && product.image) return product.image;
    } catch (error) {}
    // Kompatibilitas data order lama yang mungkin belum punya katalog cocok.
    if (item && typeof item.image === 'string' && item.image && !item.image.startsWith('data:')) return item.image;
    return fallback;
  }

  function writeUserStorage(key, value, cleanupKeys) {
    if (!key) return false;
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      localStorage.setItem(key, json);
      return true;
    } catch (error) {
      // Hapus cache sementara milik user, bukan pesanan/riwayat aktif.
      (cleanupKeys || []).forEach(function (cleanupKey) {
        if (cleanupKey && cleanupKey !== key) {
          try { localStorage.removeItem(cleanupKey); } catch (ignored) {}
        }
      });
      try {
        localStorage.setItem(key, json);
        return true;
      } catch (retryError) {
        console.warn('Penyimpanan lokal penuh; data sementara tidak disimpan.', retryError);
        return false;
      }
    }
  }

  /**
   * Menyimpan satu snapshot pesanan baru per user, dengan payload minimal.
   */
  function simpanPesananBaru(orderData) {
    if (!orderData) return false;
    const userKey = getUserStorageKey('pesananBaru');
    if (!userKey) return false;
    const compact = Object.assign({}, orderData, {
      items: compactOrderItems(orderData.items || orderData.cart),
      cart: undefined
    });
    delete compact.cart;
    return writeUserStorage(userKey, compact, [
      getUserStorageKey('checkoutSummary'),
      getUserStorageKey('checkoutForm')
    ]);
  }

  function getPesananBaru() {
    const userKey = getUserStorageKey('pesananBaru');
    const raw = userKey ? localStorage.getItem(userKey) : null;
    if (!raw) return null;
    try { return JSON.parse(raw) || null; } catch (e) { return null; }
  }

  function hapusPesananBaru() {
    const userKey = getUserStorageKey('pesananBaru');
    if (userKey) localStorage.removeItem(userKey);
  }

  /**
   * Mendapatkan data pesanan aktif dari localStorage
   * @returns {Object|null} Data pesanan aktif atau null jika tidak ada
   */
  function getPesananAktif() {
    const userPesananKey = getUserStorageKey('pesananAktif');
    let raw = userPesananKey ? localStorage.getItem(userPesananKey) : null;
    if (!raw) {
      const lastOrderKey = getUserStorageKey('lastOrder');
      if (lastOrderKey) raw = localStorage.getItem(lastOrderKey);
    }

    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed || null;
    } catch (e) {
      return raw;
    }
  }

  /**
   * Memindahkan data pesanan aktif dari 'pesananAktif' ke array 'riwayatPesanan' di localStorage
   * dan menghapus data 'pesananAktif'.
   */
  function pindahkanKeRiwayatPesanan() {
    let activeOrder = getPesananAktif();
    if (activeOrder) {
      activeOrder = decrementStockForOrder(activeOrder);
      const userRiwayatKey = getUserStorageKey('riwayatPesanan');
      if (!userRiwayatKey) return;
      let riwayat = [];
      const rawRiwayat = localStorage.getItem(userRiwayatKey);
      if (rawRiwayat) {
        try {
          const parsed = JSON.parse(rawRiwayat);
          if (Array.isArray(parsed)) riwayat = parsed;
        } catch (e) {
          riwayat = [];
        }
      }

      const orderId = activeOrder.id || activeOrder.orderId;
      const exists = orderId ? riwayat.some(item => (item && (item.id || item.orderId)) === orderId) : false;
      if (!exists) riwayat.unshift(activeOrder);
      localStorage.setItem(userRiwayatKey, JSON.stringify(riwayat));

      {
        const userOrdersKey = getUserStorageKey('orders');
        if (userOrdersKey) {
          let userOrders = [];
          const rawUserOrders = localStorage.getItem(userOrdersKey);
          if (rawUserOrders) {
            try {
              const parsed = JSON.parse(rawUserOrders);
              if (Array.isArray(parsed)) userOrders = parsed;
            } catch (e) { userOrders = []; }
          }
          if (!orderId || !userOrders.some(item => (item && (item.id || item.orderId)) === orderId)) {
            userOrders.unshift(activeOrder);
          }
          localStorage.setItem(userOrdersKey, JSON.stringify(userOrders));
        }

        const userRiwayatKey = getUserStorageKey('riwayatPesanan');
        if (userRiwayatKey) {
          localStorage.setItem(userRiwayatKey, JSON.stringify(riwayat));
        }
      }
    }

    // Hanya fungsi ini yang boleh menghapus pesananAktif: dipanggil dari
    // tombol sah "Lihat Riwayat Pesanan" di success.html.
    {
      const userPesananKey = getUserStorageKey('pesananAktif');
      if (userPesananKey) localStorage.removeItem(userPesananKey);
      const lastOrderKey = getUserStorageKey('lastOrder');
      if (lastOrderKey) localStorage.removeItem(lastOrderKey);
      clearUserLastPosition();
    }
  }

  /**
   * Validasi apakah navigasi ke orders.html berasal dari tombol resmi 'Lihat Riwayat Pesanan' di success.html.
   * @returns {boolean} True jika diakses via tombol sah, False jika via URL manual atau tautan lain.
   */
  function validasiNavigasiKeRiwayat() {
    try {
      const target = sessionStorage.getItem('diky_nav_target');
      const source = sessionStorage.getItem('diky_nav_source');
      const currentPage = sessionStorage.getItem('diky_current_page');
      return (target === 'orders.html' && source === 'success_history_button') || (currentPage === 'orders.html');
    } catch (e) {
      return false;
    }
  }

  /**
   * Menampilkan tombol notifikasi 'Pantau Pesanan Kamu Disini' pada semua halaman
   * KECUALI halaman success.html.
   * SELALU memprioritaskan pengalihan ke success.html selama pesanan pertama (pesananAktif) masih ada.
   * @returns {HTMLElement|null}
   */
  function tampilkanTombolPantauPesanan() {
    const currentPath = window.location.pathname;
    let pageName = (currentPath.split('/').pop() || 'index.html').split('?')[0].split('#')[0].toLowerCase();
    if (!pageName) pageName = 'index.html';

    // ATURAN 1: TIDAK BOLEH MUNCUL DI success.html
    if (pageName === 'success.html') {
      const existing = document.getElementById('btn-pantau-pesanan-container') || document.querySelector('.smart-guide-toast');
      if (existing) existing.remove();
      return null;
    }

    // Pesanan pertama selalu mendapat prioritas. Jika sudah dipindahkan ke
    // riwayat, barulah state pesananBaru dipantau.
    const activeOrder = getPesananAktif();
    const newOrder = typeof getPesananBaru === 'function' ? getPesananBaru() : null;
    const hasNewItems = !!(newOrder && Array.isArray(newOrder.items) && newOrder.items.length);
    const destination = activeOrder ? 'success.html' : (pageName === 'checkout.html' ? 'checkout.html' : 'keranjang.html');

    // Jangan tampilkan pengingat di halaman yang sedang menjadi tujuan state.
    // success.html selalu menjadi tempat pesananAktif ditampilkan.
    if (pageName === destination || (!activeOrder && pageName === 'orders.html')) {
      const existing = document.getElementById('btn-pantau-pesanan-container') || document.querySelector('.smart-guide-toast');
      if (existing) existing.remove();
      return null;
    }

    // Tidak ada state yang perlu dipantau. Ini juga mencegah tombol mengganggu
    // orders.html setelah pesanan pertama selesai dan tidak ada pesanan kedua.
    if (!activeOrder && !hasNewItems) {
      const existing = document.getElementById('btn-pantau-pesanan-container') || document.querySelector('.smart-guide-toast');
      if (existing) existing.remove();
      return null;
    }

    // Rebuild setiap kali state berubah agar tujuan dan teks tombol tidak stale.
    let container = document.getElementById('btn-pantau-pesanan-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'btn-pantau-pesanan-container';
    container.className = 'smart-guide-toast';
    container.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        z-index: 9999;
        background: linear-gradient(135deg, #3c9051, #2f7835);
        color: #ffffff;
        padding: 1.25rem 1.5rem;
        border-radius: 1.5rem;
        box-shadow: 0 16px 40px rgba(47, 97, 54, 0.25), 0 8px 20px rgba(0, 0, 0, 0.1);
        max-width: 320px;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        display: block;
      `;

    container.innerHTML = `
        <button class="smart-guide-close" aria-label="Tutup" onclick="this.closest('#btn-pantau-pesanan-container').remove()" style="position:absolute;top:0.6rem;right:0.6rem;background:transparent;border:none;color:rgba(255,255,255,0.7);font-size:1.2rem;cursor:pointer;">×</button>
        <div class="smart-guide-content" style="display:flex;flex-direction:column;gap:0.75rem;">
          <div class="smart-guide-header" style="display:flex;align-items:center;gap:0.6rem;">
            <span class="smart-guide-icon" style="font-size:1.4rem;">💡</span>
            <h3 class="smart-guide-title" style="font-size:0.95rem;font-weight:700;margin:0;">${activeOrder ? '✅ Pesanan Pertama Aktif' : '🛒 Pesanan Baru Tersimpan'}</h3>
          </div>
          <p class="smart-guide-message" style="font-size:0.85rem;line-height:1.5;margin:0;">${activeOrder ? 'Selesaikan pesanan kamu di success.html terlebih dahulu sebelum melanjutkan pesanan lain.' : 'Lanjutkan proses pesanan baru kamu.'}</p>
          <button id="pantau-pesanan-btn" class="smart-guide-button" style="background:rgba(255,255,255,0.2);color:#ffffff;border:1px solid rgba(255,255,255,0.3);border-radius:999px;padding:0.7rem 1.2rem;font-size:0.85rem;font-weight:600;cursor:pointer;text-align:center;width:100%;">Pantau Pesanan Kamu Disini</button>
        </div>
      `;

    document.body.appendChild(container);

    const btn = container.querySelector('#pantau-pesanan-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
          window.NavigationGuard.grantAccess(destination, activeOrder ? 'smart_guide_success' : 'smart_guide_' + destination.replace('.html', ''));
        }
        window.location.href = destination;
      });
    }
    return container;
  }

  // Toast hanya boleh dikelola oleh smart-guide-toast.js.
  // Tidak ada auto-run di sini agar tidak pernah membuat toast kedua.

  // Gate dijalankan segera setelah helper dimuat, sebelum script halaman lain.
  // login/daftar/404 tetap public; seluruh halaman data wajib punya session valid.
  (function installEarlySecurityGate() {
    const page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const protectedPages = ['index.html', 'about.html', 'contact.html', 'profile.html', 'hutang.html', 'orders.html', 'checkout.html', 'keranjang.html', 'success.html', 'test-data-isolation.html'];
    if (protectedPages.includes(page) && !isValidSession()) {
      window.location.replace('login.html');
    }
  })();

  // Export ke global scope
  window.getUserStorageKey = getUserStorageKey;
  window.getActiveUser = getActiveUser;
  window.isValidSession = isValidSession;
  window.getActiveUserId = getActiveUserId;
  window.setUserLastPosition = setUserLastPosition;
  window.getUserLastPosition = getUserLastPosition;
  window.clearUserLastPosition = clearUserLastPosition;
  window.getActiveOrders = getActiveOrders;
  window.escapeHTML = escapeHTML;
  window.toSafeNumber = toSafeNumber;
  window.normalizeCart = normalizeCart;
  window.NavigationGuard = NavigationGuard;
  window.validasiNavigasiKeRiwayat = validasiNavigasiKeRiwayat;
  window.validateOrderHistoryAccess = validasiNavigasiKeRiwayat;
  window.simpanPesananAktif = simpanPesananAktif;
  window.storeActiveOrder = simpanPesananAktif;
  window.simpanPesananBaru = simpanPesananBaru;
  window.compactOrderItems = compactOrderItems;
  window.resolveProductImage = resolveProductImage;
  window.decrementStockForOrder = decrementStockForOrder;
  window.writeUserStorage = writeUserStorage;
  window.getPesananBaru = getPesananBaru;
  window.hapusPesananBaru = hapusPesananBaru;
  window.getPesananAktif = getPesananAktif;
  window.getActiveOrder = getPesananAktif;
  window.pindahkanKeRiwayatPesanan = pindahkanKeRiwayatPesanan;
  window.moveToOrderHistory = pindahkanKeRiwayatPesanan;
  window.tampilkanTombolPantauPesanan = tampilkanTombolPantauPesanan;
  window.displayNotificationButton = tampilkanTombolPantauPesanan;

})(window);