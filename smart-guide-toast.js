/**
 * ==========================================
 * Smart Guide Toast Notification System
 * Warung Sayur Diky - Modular Component
 * ==========================================
 * 
 * Fitur: Floating toast notification untuk memandu pengguna
 * ke halaman terakhir pesanan mereka dalam alur e-commerce.
 * 
 * ATURAN KEMUNCULAN (terbaru):
 * 1. Status "Pesanan Tertunda" = masih ada data di dikyCart / dikyCheckoutItems / dikyLastOrder
 *    DAN (untuk dikyLastOrder) pesanan tersebut belum masuk ke dikyOrders (riwayat).
 *    Jika pesanan sudah masuk dikyOrders → "Pesanan Selesai" → pop-up nonaktif.
 * 2. Di keranjang.html, checkout.html, success.html → pop-up TIDAK muncul (user sudah di proses).
 * 3. Di orders.html → pop-up muncul HANYA JIKA status masih "Pesanan Tertunda"
 *    (user melompat manual ke orders.html sebelum menyelesaikan pesanan).
 * 4. Di halaman lain (index, profile, contact, about, hutang) → pop-up muncul jika "Pesanan Tertunda".
 * 5. Tidak ada auto-hide, toast terus tampil sampai user klik tombol atau close.
 * 
 * Cara penggunaan:
 * 1. Tambahkan <link rel="stylesheet" href="smart-guide-toast.css"> di head
 * 2. Tambahkan <script src="smart-guide-toast.js"></script> sebelum closing body
 * 3. Panggil SmartGuide.init() setelah DOMContentLoaded
 */

(function(window) {
  'use strict';

  const SmartGuide = {
    // Konfigurasi
    config: {
      currentUrl: window.location.pathname,
      storageKeys: {
        cart: 'dikyCart',
        checkoutItems: 'dikyCheckoutItems',
        lastOrder: 'dikyLastOrder',
        checkoutForm: 'dikyCheckoutForm',
        orders: 'dikyOrders',
        positionTracker: 'dikyLastPosition'
      }
    },

    // Elemen DOM
    elements: {
      toast: null,
      content: null,
      button: null,
      closeBtn: null
    },

    // State internal
    state: {
      lastPosition: null,
      detectedPage: null
    },

    /**
     * Inisialisasi Smart Guide
     */
    init: function() {
      this.detectActiveProgress();
      this.createToastElement();
      this.bindEvents();
      
      // Simpan posisi saat ini untuk tracking
      this.saveCurrentPosition();
      
      // Tampilkan toast jika ada pesanan tertunda yang user tinggalkan
      if (this.state.detectedPage && this.shouldShowToast()) {
        this.show();
      }
    },

    /**
     * Deteksi progres aktif pengguna berdasarkan localStorage.
     * LOGIKA: Arahkan ke halaman yang SEDANG memuat daftar pesanan aktif terakhir
     * berdasarkan prioritas: checkout > keranjang > success.
     * Hanya dianggap aktif jika statusnya "Pesanan Tertunda" (belum masuk dikyOrders).
     */
    detectActiveProgress: function() {
      const keys = this.config.storageKeys;

      const hasCart = this.hasData(keys.cart);
      const hasCheckoutItems = this.hasData(keys.checkoutItems);
      const hasCheckoutForm = this.hasData(keys.checkoutForm);
      const hasLastOrder = this.hasData(keys.lastOrder);

      // Prioritas progres terdepan yang aktif
      if (hasCheckoutItems || hasCheckoutForm) {
        this.state.detectedPage = 'checkout.html';
        this.state.lastPosition = 'Sedang checkout';
      } else if (hasCart) {
        this.state.detectedPage = 'keranjang.html';
        this.state.lastPosition = 'Di keranjang';
      } else if (hasLastOrder && !this.isLastOrderInHistory()) {
        // Pesanan terakhir belum masuk riwayat → arahkan ke success
        this.state.detectedPage = 'success.html';
        this.state.lastPosition = 'Pesanan selesai';
      } else {
        this.state.detectedPage = null;
        this.state.lastPosition = null;
      }
    },

    /**
     * Cek apakah ada data di localStorage
     */
    hasData: function(key) {
      try {
        const data = localStorage.getItem(key);
        if (!data) return false;
        
        const parsed = JSON.parse(data);
        // Cek apakah data valid dan tidak kosong
        if (Array.isArray(parsed)) {
          return parsed.length > 0;
        }
        if (typeof parsed === 'object') {
          return Object.keys(parsed).length > 0;
        }
        return !!parsed;
      } catch (e) {
        return false;
      }
    },

    /**
     * Cek apakah dikyLastOrder sudah ada di dikyOrders (riwayat pesanan).
     * Jika sudah ada → status "Pesanan Selesai" (bukan tertunda).
     */
    isLastOrderInHistory: function() {
      try {
        const keys = this.config.storageKeys;
        const lastOrderRaw = localStorage.getItem(keys.lastOrder);
        const ordersRaw = localStorage.getItem(keys.orders);
        if (!lastOrderRaw || !ordersRaw) return false;

        const lastOrder = JSON.parse(lastOrderRaw);
        const orders = JSON.parse(ordersRaw);
        if (!Array.isArray(orders) || orders.length === 0) return false;

        // Ambil id / orderId / timestamp dari dikyLastOrder untuk pencocokan
        const refId = (lastOrder && (lastOrder.id || lastOrder.orderId || lastOrder.timestamp || lastOrder.orderDate)) || null;
        if (!refId) return false;

        return orders.some(function(o) {
          if (!o) return false;
          return (o.id || o.orderId || o.timestamp || o.orderDate) === refId;
        });
      } catch (e) {
        return false;
      }
    },

    /**
     * Status "Pesanan Tertunda":
     * - Ada item di keranjang (dikyCart), ATAU
     * - Ada item checkout (dikyCheckoutItems), ATAU
     * - Ada dikyLastOrder yang BELUM masuk dikyOrders.
     * Jika dikyLastOrder sudah ada di dikyOrders → "Pesanan Selesai" → false.
     */
    isPesananTertunda: function() {
      const keys = this.config.storageKeys;
      const hasCart = this.hasData(keys.cart);
      const hasCheckoutItems = this.hasData(keys.checkoutItems);
      const hasLastOrder = this.hasData(keys.lastOrder) && !this.isLastOrderInHistory();

      return hasCart || hasCheckoutItems || hasLastOrder;
    },

    /**
     * Simpan posisi halaman saat ini
     */
    saveCurrentPosition: function() {
      const currentPage = this.getCurrentPageName();
      localStorage.setItem(this.config.storageKeys.positionTracker, currentPage);
    },

    /**
     * Dapatkan nama halaman saat ini
     */
    getCurrentPageName: function() {
      const path = this.config.currentUrl;
      const fileName = path.split('/').pop();
      return fileName || 'index.html';
    },

    /**
     * Cek apakah toast harus ditampilkan
     * ATURAN:
     * 1. Tidak ada pesanan tertunda → tidak ada pop-up di mana pun.
     * 2. Di halaman proses (keranjang/checkout/success) → sembunyikan (user sudah di sana).
     * 3. Di orders.html → munculkan HANYA JIKA pesanan belum tuntas (user melompat manual).
     * 4. Di halaman lain (index, profile, contact, about, hutang) → munculkan jika tertunda.
     */
    shouldShowToast: function() {
      const currentPage = this.getCurrentPageName();
      const tertunda = this.isPesananTertunda();

      // 1. Tidak ada pesanan tertunda → tidak ada pop-up di mana pun
      if (!tertunda) {
        return false;
      }

      // 2. Di halaman proses (keranjang/checkout/success) → sembunyikan (user sudah di sana)
      if (['keranjang.html', 'checkout.html', 'success.html'].includes(currentPage)) {
        return false;
      }

      // 3. Di orders.html → munculkan HANYA JIKA pesanan belum tuntas (user melompat manual).
      //    Jika sudah "Pesanan Selesai" (tertunda=false), isPesananTertunda sudah false → tidak sampai sini.
      if (currentPage === 'orders.html') {
        return tertunda;
      }

      // 4. Di halaman lain (index, profile, contact, about, hutang) → munculkan jika tertunda
      return true;
    },

    /**
     * Buat elemen toast
     */
    createToastElement: function() {
      // Hapus toast yang sudah ada jika ada
      const existingToast = document.querySelector('.smart-guide-toast');
      if (existingToast) {
        existingToast.remove();
      }

      // Buat elemen toast baru (hidden by default via CSS)
      const toast = document.createElement('div');
      toast.className = 'smart-guide-toast';
      toast.innerHTML = this.getToastHTML();
      
      document.body.appendChild(toast);
      
      // Simpan referensi elemen
      this.elements.toast = toast;
      this.elements.button = toast.querySelector('.smart-guide-button');
      this.elements.closeBtn = toast.querySelector('.smart-guide-close');
    },

    /**
     * Dapatkan HTML untuk toast berdasarkan halaman terakhir
     */
    getToastHTML: function() {
      const detectedPage = this.state.detectedPage;
      const currentPage = this.getCurrentPageName();
      let title = '';
      let message = '';
      
      // Khusus orders.html (user melompat manual sebelum pesanan tuntas)
      if (currentPage === 'orders.html') {
        title = '📋 Pantau Pesanan Kamu Disini';
        message = 'Pesanan kamu belum selesai. Kembali ke proses pesanan untuk menyelesaikannya.';
      } else {
        switch(detectedPage) {
          case 'keranjang.html':
            title = '🛒 Pesanan Kamu Menunggu';
            message = 'Kamu memiliki item di keranjang belanja. Lanjutkan pembayaran sekarang.';
            break;
          case 'checkout.html':
            title = '💳 Checkout Belum Selesai';
            message = 'Proses pembayaran kamu tertunda. Selesaikan pesanan sekarang.';
            break;
          case 'success.html':
            title = '✅ Pesanan Berhasil';
            message = 'Pesanan terakhir kamu telah selesai. Lihat detail pesanan.';
            break;
          default:
            title = '📋 Lanjutkan Belanja';
            message = 'Temukan pesanan kamu dan lanjutkan proses belanja.';
        }
      }
      
      return `
        <button class="smart-guide-close" aria-label="Tutup">×</button>
        <div class="smart-guide-content">
          <div class="smart-guide-header">
            <span class="smart-guide-icon">💡</span>
            <h3 class="smart-guide-title">${title}</h3>
          </div>
          <p class="smart-guide-message">${message}</p>
          <button class="smart-guide-button">Pantau Pesanan Kamu Disini</button>
        </div>
      `;
    },

    /**
     * Tampilkan toast
     */
    show: function() {
      if (this.elements.toast) {
        this.elements.toast.style.display = 'block';
        this.elements.toast.classList.remove('hidden');
        // Tidak ada auto-hide, toast terus tampil sampai user klik tombol atau close
      }
    },

    /**
     * Sembunyikan toast
     */
    hide: function() {
      if (this.elements.toast) {
        this.elements.toast.classList.add('hidden');
        
        // Hapus elemen setelah animasi selesai
        setTimeout(() => {
          if (this.elements.toast && this.elements.toast.parentNode) {
            this.elements.toast.style.display = 'none';
            this.elements.toast.remove();
          }
        }, 300);
      }
    },

    /**
     * Navigasi ke halaman progres aktif
     */
    navigateToActiveProgress: function() {
      const detectedPage = this.state.detectedPage;
      
      if (detectedPage) {
        this.hide();
        setTimeout(() => {
          window.location.href = detectedPage;
        }, 300);
      }
    },

    /**
     * Bind event listeners untuk tombol toast
     */
    bindEvents: function() {
      // Button click handler
      if (this.elements.button) {
        this.elements.button.addEventListener('click', () => {
          this.navigateToActiveProgress();
        });
      }
      
      // Close button handler
      if (this.elements.closeBtn) {
        this.elements.closeBtn.addEventListener('click', () => {
          this.hide();
        });
      }
    },

    /**
     * Update toast content (untuk penggunaan dinamis)
     */
    updateContent: function(title, message) {
      if (this.elements.toast) {
        const titleEl = this.elements.toast.querySelector('.smart-guide-title');
        const messageEl = this.elements.toast.querySelector('.smart-guide-message');
        
        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
      }
    },

    /**
     * Manual trigger untuk menampilkan toast
     */
    manualShow: function(title, message, buttonText) {
      this.createToastElement();
      
      if (title) {
        const titleEl = this.elements.toast.querySelector('.smart-guide-title');
        if (titleEl) titleEl.textContent = title;
      }
      
      if (message) {
        const messageEl = this.elements.toast.querySelector('.smart-guide-message');
        if (messageEl) messageEl.textContent = message;
      }
      
      if (buttonText) {
        const buttonEl = this.elements.toast.querySelector('.smart-guide-button');
        if (buttonEl) buttonEl.textContent = buttonText;
      }
      
      this.bindEvents();
      this.show();
    }
  };

  // Export ke global scope
  window.SmartGuide = SmartGuide;

})(window);

/**
 * ==========================================
 * INTEGRATION EXAMPLE
 * ==========================================
 * 
 * Di setiap halaman (keranjang.html, checkout.html, success.html, orders.html,
 * index.html, profile.html, contact.html, about.html, hutang.html):
 * 
 * 1. Tambahkan CSS di <head>:
 *    <link rel="stylesheet" href="smart-guide-toast.css">
 * 
 * 2. Tambahkan JS sebelum </body>:
 *    <script src="smart-guide-toast.js"></script>
 *    <script>
 *      document.addEventListener('DOMContentLoaded', function() {
 *        SmartGuide.init();
 *      });
 *    </script>
 * 
 * ATURAN KEMUNCULAN:
 * 1. "Pesanan Tertunda" = ada dikyCart / dikyCheckoutItems / dikyLastOrder (yang belum masuk dikyOrders).
 * 2. keranjang.html, checkout.html, success.html → pop-up tidak muncul (user sudah di proses).
 * 3. orders.html → pop-up muncul HANYA JIKA "Pesanan Tertunda" (user melompat manual).
 * 4. Halaman lain (index, profile, contact, about, hutang) → pop-up muncul jika tertunda.
 * 5. Jika pesanan sudah masuk dikyOrders → "Pesanan Selesai" → pop-up nonaktif di semua halaman.
 * 6. Tombol "Pantau Pesanan Kamu Disini" mengarah ke halaman proses aktif (checkout/keranjang/success).
 * 7. Tidak ada auto-hide, toast terus tampil sampai user klik tombol atau close.
 */