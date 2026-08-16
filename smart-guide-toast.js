/**
 * ==========================================
 * Smart Guide Toast Notification System
 * Warung Sayur Diky - Modular Component
 * ==========================================
 * 
 * Fitur: Floating toast notification untuk memandu pengguna
 * ke halaman terakhir pesanan mereka dalam alur e-commerce.
 * 
 * PERUBAHAN TOTAL:
 * 1. Pop-up HANYA muncul ketika user MENINGGALKAN halaman yang ada pesanan aktif
 * 2. Logika deteksi dengan prioritas progres terdepan yang aktif
 * 3. Tidak ada auto-hide, toast terus tampil sampai user klik tombol atau close
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
      
      // Tampilkan toast jika ada progres aktif yang user tinggalkan
      if (this.state.detectedPage && this.shouldShowToast()) {
        this.show();
      }
    },

    /**
     * Deteksi progres aktif pengguna berdasarkan localStorage dan positionTracker
     * LOGIKA: Selalu arahkan ke halaman yang SEDANG memuat daftar pesanan aktif terakhir
     */
    detectActiveProgress: function() {
      const keys = this.config.storageKeys;
      const currentPage = this.getCurrentPageName();
      
      // Cek data di localStorage
      const hasCart = this.hasData(keys.cart);
      const hasCheckoutItems = this.hasData(keys.checkoutItems);
      const hasLastOrder = this.hasData(keys.lastOrder);
      const hasCheckoutForm = this.hasData(keys.checkoutForm);
      
      // Cek position tracker untuk mengetahui halaman aktif terakhir
      const lastActivePosition = localStorage.getItem(keys.positionTracker);
      
      // Logika deteksi berdasarkan halaman aktif terakhir yang tercatat
      // Jika position tracker menunjukkan ke halaman tertentu, gunakan itu sebagai referensi
      
      if (lastActivePosition === 'checkout.html') {
        // User terakhir aktif di checkout, cek apakah masih ada data checkout
        if (hasCheckoutItems || hasCheckoutForm) {
          this.state.detectedPage = 'checkout.html';
          this.state.lastPosition = 'Sedang checkout';
        } else if (hasCart) {
          // Jika checkout data kosong tapi masih ada cart, arahkan ke keranjang
          this.state.detectedPage = 'keranjang.html';
          this.state.lastPosition = 'Di keranjang';
        } else if (hasLastOrder) {
          // Jika sudah selesai order, arahkan ke success
          this.state.detectedPage = 'success.html';
          this.state.lastPosition = 'Pesanan selesai';
        } else {
          this.state.detectedPage = null;
          this.state.lastPosition = null;
        }
      }
      else if (lastActivePosition === 'keranjang.html') {
        // User terakhir aktif di keranjang, cek apakah masih ada data cart
        if (hasCart) {
          this.state.detectedPage = 'keranjang.html';
          this.state.lastPosition = 'Di keranjang';
        } else if (hasCheckoutItems || hasCheckoutForm) {
          // Jika cart kosong tapi ada data checkout, arahkan ke checkout
          this.state.detectedPage = 'checkout.html';
          this.state.lastPosition = 'Sedang checkout';
        } else if (hasLastOrder) {
          // Jika sudah selesai order, arahkan ke success
          this.state.detectedPage = 'success.html';
          this.state.lastPosition = 'Pesanan selesai';
        } else {
          this.state.detectedPage = null;
          this.state.lastPosition = null;
        }
      }
      else if (lastActivePosition === 'success.html') {
        // User terakhir aktif di success
        if (hasLastOrder) {
          this.state.detectedPage = 'success.html';
          this.state.lastPosition = 'Pesanan selesai';
        } else {
          this.state.detectedPage = null;
          this.state.lastPosition = null;
        }
      }
      else {
        // Jika tidak ada position tracker, gunakan logika prioritas default
        // Prioritas: checkout > keranjang > success (progres terdepan yang aktif)
        if (hasCheckoutItems || hasCheckoutForm) {
          this.state.detectedPage = 'checkout.html';
          this.state.lastPosition = 'Sedang checkout';
        } else if (hasCart) {
          this.state.detectedPage = 'keranjang.html';
          this.state.lastPosition = 'Di keranjang';
        } else if (hasLastOrder) {
          this.state.detectedPage = 'success.html';
          this.state.lastPosition = 'Pesanan selesai';
        } else {
          this.state.detectedPage = null;
          this.state.lastPosition = null;
        }
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
     * ATURAN: HANYA muncul jika user MENINGGALKAN halaman yang ada pesanan aktif
     * DAN jangan muncul di halaman yang SEDANG AKTIF memproses pesanan
     */
    shouldShowToast: function() {
      const currentPage = this.getCurrentPageName();
      const detectedPage = this.state.detectedPage;

      // Tidak ada progres aktif yang terdeteksi
      if (!detectedPage) {
        return false;
      }

      // Pengecualian mutlak: pop-up TIDAK BOLEH muncul di orders.html
      // maupun halaman lain setelah pesanan masuk riwayat.
      // Batas akhir kemunculan pop-up adalah tepat di halaman success.html.
      if (currentPage === 'orders.html') {
        return false;
      }

      // User sedang berada di halaman progres aktif itu sendiri → tidak perlu mengingatkan
      if (currentPage === detectedPage) {
        return false;
      }

      // Tampilkan di seluruh halaman lain (index, keranjang, checkout, success,
      // profile, contact, about, hutang) selama ada progres aktif yang ditinggalkan.
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
      let title = '';
      let message = '';
      
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
 * Di setiap halaman (keranjang.html, checkout.html, success.html):
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
 * PERUBAHAN TOTAL:
 * 1. Pop-up HANYA muncul ketika user MENINGGALKAN halaman yang ada pesanan aktif
 * 2. Logika deteksi menggunakan positionTracker untuk akurasi halaman aktif terakhir
 * 3. Tombol "Pantau Pesanan Kamu Disini" mengarah ke halaman yang SEDANG aktif memproses pesanan
 * 4. Tidak ada auto-hide, toast terus tampil sampai user klik tombol atau close
 */