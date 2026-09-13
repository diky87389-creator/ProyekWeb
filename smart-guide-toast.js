/**
 * ==========================================
 * Smart Guide Toast Notification System
 * Warung Sayur Diky - Modular Component
 * ==========================================
 *
 * Fitur: Floating toast notification untuk memandu pengguna
 * ke halaman pesanan aktif mereka dalam alur e-commerce.
 *
 * ATURAN KEMUNCULAN MUTLAK:
 * 1. Pop-up "Pantau Pesanan Kamu Disini" HANYA BOLEH MUNCUL di halaman lain
 *    di mana pesanan tersebut TIDAK sedang berada.
 * 2. Jika pesanan aktif ada di keranjang.html, JANGAN munculkan pop-up di keranjang.html,
 *    melainkan munculkan di halaman lain (index.html, profile.html, about.html, dll.).
 * 3. Begitu juga sebaliknya: jika pesanan aktif ada di checkout.html atau success.html,
 *    jangan munculkan pop-up di halaman tempat pesanan itu berada, tetapi munculkan di halaman lainnya.
 * 4. Ketika pengguna menekan tombol "Kembali" (Back) di browser, pop-up pengingat tetap muncul
 *    jika masih ada pesanan aktif di tahapan lain.
 * 5. Ketika pengguna mengklik pop-up "Pantau Pesanan Kamu Disini", sistem memberikan izin navigasi
 *    sah ke halaman target sehingga proteksi Anti-URL bypass tidak menolaknya.
 */

(function(window) {
  'use strict';

  const SmartGuide = {
    // State internal. Semua halaman memakai satu instance toast ini.
    state: {
      lastPosition: null,
      detectedPage: null,
      initialized: false
    },

    // Elemen DOM
    elements: {
      toast: null,
      content: null,
      button: null,
      closeBtn: null
    },

    /**
     * Get dynamic user-specific localStorage keys
     */
    getUserKeys: function() {
      if (typeof getUserStorageKey !== 'function') return null;
      return {
        cart: getUserStorageKey('cart'),
        checkoutItems: getUserStorageKey('checkoutItems'),
        orders: getUserStorageKey('orders'),
        orderHistory: getUserStorageKey('riwayatPesanan'),
        checkoutSummary: getUserStorageKey('checkoutSummary'),
        lastOrder: getUserStorageKey('lastOrder'),
        checkoutForm: getUserStorageKey('checkoutForm'),
        pesananAktif: getUserStorageKey('pesananAktif'),
        pesananBaru: getUserStorageKey('pesananBaru')
      };
    },

    /**
     * Normalisasi path URL menjadi nama halaman yang konsisten.
     */
    getCurrentPageName: function() {
      const path = String(window.location.pathname || '');
      const fileName = path.split('/').filter(Boolean).pop() || 'index.html';
      const cleanName = fileName.split('?')[0].split('#')[0].toLowerCase();
      return cleanName === 'index' ? 'index.html' : cleanName;
    },

    getActiveOrders: function() {
      const finishedStatuses = ['selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan', 'completed', 'cancelled'];
      const userKeys = this.getUserKeys();
      const result = [];
      const matchedKeys = [];
      if (!userKeys) return result;

      const sources = [
        ['orders', userKeys.orders, false],
        ['orderHistory', userKeys.orderHistory, false],
        ['pesananAktif', userKeys.pesananAktif, false],
        ['pesananBaru', userKeys.pesananBaru, false],
        ['cart', userKeys.cart, true],
        ['checkoutItems', userKeys.checkoutItems, true]
      ];
      sources.forEach(([source, key, isCart]) => {
        if (!key) return;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || 'null');
          const records = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
          const active = records.filter((record) => {
            if (!record || typeof record !== 'object') return false;
            const status = String(record.status || '').trim().toLowerCase();
            return isCart || !finishedStatuses.includes(status);
          }).map((record) => Object.assign({ source }, record));
          if (active.length) matchedKeys.push(key);
          result.push(...active);
        } catch (error) {
          console.warn('[SmartGuide] Key user tidak dapat dibaca:', key, error);
        }
      });
      return result;
    },

    /**
     * Cek apakah ada data di localStorage
     */
    hasData: function(key) {
      if (!key) return false;
      try {
        const data = localStorage.getItem(key);
        if (!data) return false;

        const parsed = JSON.parse(data);
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
     * Cek apakah lastOrder sudah ada di orders (riwayat pesanan).
     * Jika sudah ada → pesanan sudah tuntas masuk riwayat.
     */
    isLastOrderInHistory: function(userOrdersKey, userLastOrderKey) {
      try {
        const lastOrderKey = userLastOrderKey || (typeof getUserStorageKey === 'function' ? getUserStorageKey('lastOrder') : null);
        const ordersKey = userOrdersKey || (typeof getUserStorageKey === 'function' ? getUserStorageKey('orders') : null);
        if (!lastOrderKey || !ordersKey) return false;

        const lastOrderRaw = localStorage.getItem(lastOrderKey);
        const ordersRaw = localStorage.getItem(ordersKey);
        if (!lastOrderRaw || !ordersRaw) return false;

        const lastOrder = JSON.parse(lastOrderRaw);
        const orders = JSON.parse(ordersRaw);
        if (!Array.isArray(orders) || orders.length === 0) return false;

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
     * Bangun antrean FIFO dari tiga tahap transaksi.
     * Pesanan yang lebih lama selalu menjadi target toast terlebih dahulu.
     */
    detectActiveProgress: function() {
      const activeOrders = this.getActiveOrders();
      const userKeys = this.getUserKeys() || {};
      const hasData = (key) => this.hasData(key);
      const candidates = [];
      const stateExists = {
        'keranjang.html': hasData(userKeys.cart),
        'checkout.html': hasData(userKeys.checkoutItems),
        'success.html': hasData(userKeys.pesananAktif)
      };

      const readTimestamp = function(key, fields) {
        if (!key) return null;
        try {
          const raw = localStorage.getItem(key);
          const parsed = JSON.parse(raw || 'null');
          const values = Array.isArray(parsed) ? parsed : [parsed];
          for (const value of values) {
            if (!value || typeof value !== 'object') continue;
            for (const field of fields) {
              const time = Date.parse(value[field] || '');
              if (Number.isFinite(time)) return time;
            }
          }
        } catch (error) {}
        return null;
      };

      const addCandidate = function(page, exists, timestamp, fallbackRank) {
        if (exists) candidates.push({ page: page, timestamp: timestamp, fallbackRank: fallbackRank });
      };

      // success adalah pesanan yang sudah dibuat tetapi belum dipindahkan ke
      // riwayat. Checkout berada sebelum cart pada fallback FIFO.
      addCandidate('success.html', stateExists['success.html'],
        readTimestamp(userKeys.pesananAktif, ['createdAt', 'timestamp', 'orderDate']), 0);
      addCandidate('checkout.html', stateExists['checkout.html'],
        readTimestamp(userKeys.checkoutForm, ['timestamp', 'createdAt', 'updatedAt']), 1);
      addCandidate('keranjang.html', stateExists['keranjang.html'],
        readTimestamp(userKeys.pesananBaru, ['updatedAt', 'createdAt', 'timestamp']), 2);

      // Untuk key legacy/universal, tambahkan kandidat hanya bila state user
      // belum menemukannya. Ini mencegah satu cart dihitung berkali-kali.
      if (!stateExists['keranjang.html'] || !stateExists['checkout.html'] || !stateExists['success.html']) {
        try {
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = String(localStorage.key(index) || '').toLowerCase();
            if (!key) continue;
            const isCart = ['cart', 'dikycart', 'keranjang'].includes(key) || key.startsWith('dikycart_') || key.startsWith('cart_') || key.startsWith('keranjang_');
            if (isCart && !stateExists['keranjang.html'] && hasData(key)) {
              addCandidate('keranjang.html', true, readTimestamp(key, ['updatedAt', 'createdAt', 'timestamp']), 2);
              stateExists['keranjang.html'] = true;
            }
            if (key.startsWith('dikycheckoutitems_') && !stateExists['checkout.html'] && hasData(key)) {
              addCandidate('checkout.html', true, readTimestamp(key, ['updatedAt', 'createdAt', 'timestamp']), 1);
              stateExists['checkout.html'] = true;
            }
            if ((key === 'pesananaktif' || key.startsWith('pesananaktif_')) && !stateExists['success.html'] && hasData(key)) {
              addCandidate('success.html', true, readTimestamp(key, ['createdAt', 'timestamp', 'orderDate']), 0);
              stateExists['success.html'] = true;
            }
          }
        } catch (error) {
          console.warn('[SmartGuide Debug] Scan state transaksi gagal.', error);
        }
      }

      const activeOrderProgress = activeOrders.filter((order) => order.source === 'orders' || order.source === 'orderHistory' || order.source === 'pesananAktif' || order.source === 'pesananBaru');
      const activeTabTarget = activeOrderProgress.some((order) => {
        const status = String(order.status || 'menunggu').trim().toLowerCase();
        return status === 'dikirim' || status === 'siap_diambil';
      }) ? 'dikirim' : 'dikemas';
      if (activeOrderProgress.length) {
        candidates.push({ page: 'orders.html', tab: activeTabTarget, timestamp: null, fallbackRank: -1 });
      }

      // Pesanan yang sudah dibuat menjadi tujuan utama pemantauan. State
      // keranjang/checkout/success tetap dipertimbangkan jika belum ada order aktif.
      candidates.sort(function(a, b) {
        if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        return a.fallbackRank - b.fallbackRank;
      });

      const target = candidates[0] || null;
      this.state.activeOrderProgress = activeOrderProgress;
      this.state.detectedPage = target ? target.page : null;
      this.state.detectedTab = target && target.tab ? target.tab : null;
      this.state.lastPosition = this.state.detectedPage || null;
      this.state.queue = candidates;
      this.state.hasPendingTransaction = Boolean(target);
      console.log('[SmartGuide Debug] detectActiveProgress FIFO', {
        activeOrders: activeOrders.length,
        candidates: candidates,
        target: target
      });
    },

    /**
     * Tampilkan toast di setiap halaman selama terdapat pesanan aktif.
     * Hanya halaman yang memproses atau menampilkan pesanan tersebut yang
     * dikecualikan agar toast tidak mengarah kembali ke halaman yang sama.
     */
    shouldShowToast: function() {
      const currentPage = this.getCurrentPageName();
      const activeOrders = this.getActiveOrders();
      const targetPage = this.state.detectedPage;
      let isCurrentOrderTab = false;
      if (currentPage === 'orders.html' && this.state.activeOrderProgress && this.state.activeOrderProgress.length) {
        const activeTabButton = document.querySelector('.order-tab.active');
        const activeTab = activeTabButton ? activeTabButton.dataset.tab : null;
        isCurrentOrderTab = this.state.activeOrderProgress.some((order) => {
          const status = String(order.status || 'menunggu').trim().toLowerCase();
          const tabStatus = status === 'menunggu' || status === 'diproses' ? 'dikemas' : status;
          return tabStatus === activeTab && ['dikemas', 'dikirim', 'siap_diambil'].includes(tabStatus);
        });
      }
      const shouldShow = Boolean(targetPage) && activeOrders.length > 0 && !isCurrentOrderTab && (currentPage !== targetPage || currentPage === 'orders.html');
      console.log('[SmartGuide Debug] shouldShowToast', {
        currentPage: currentPage,
        activeOrders: activeOrders.length,
        targetPage: targetPage,
        shouldShow: shouldShow
      });
      return shouldShow;
    },

    /**
     * Inisialisasi Smart Guide
     */
    init: function() {
      console.log('[SmartGuide Debug] init mulai', {
        readyState: document.readyState,
        url: window.location.href,
        bodyAvailable: Boolean(document.body)
      });
      // Single-toast invariant: hapus semua instance lama, termasuk instance
      // yang mungkin dibuat oleh script lama sebelum komponen ini berjalan.
      document.querySelectorAll('.smart-guide-toast').forEach((toast) => toast.remove());
      this.elements.toast = null;
      this.elements.button = null;
      this.elements.closeBtn = null;

      this.detectActiveProgress();

      // Evaluasi keputusan sebelum injeksi. Jika aktif dan halaman bukan
      // pengecualian, elemen wajib dibuat ke document.body.
      const shouldShow = this.shouldShowToast();
      console.log('[SmartGuide Debug] init keputusan', {
        detectedPage: this.state.detectedPage,
        shouldShow: shouldShow,
        targetPage: this.state.detectedPage
      });
      if (!shouldShow) {
        console.warn('[SmartGuide Debug] Toast tidak dibuat.', {
          reason: this.getActiveOrders().length === 0 ? 'tidak ada data pesanan' : (!this.state.detectedPage ? 'hanya ada riwayat orders, tanpa state transaksi' : 'sedang berada di halaman sumber pesanan'),
          currentPage: this.getCurrentPageName(),
          orderKey: typeof getUserStorageKey === 'function' ? getUserStorageKey('orders') : null
        });
        this.hideDirectly();
        return;
      }

      this.createToastElement();
      this.bindEvents();
      this.show();
      this.state.initialized = true;
    },

    /**
     * Buat elemen toast
     */
    createToastElement: function() {
      const toast = document.createElement('div');
      toast.className = 'smart-guide-toast';
      toast.innerHTML = this.getToastHTML();

      document.body.appendChild(toast);
      toast.style.display = 'block';
      toast.classList.remove('hidden');
      console.log('[SmartGuide Debug] createToastElement berhasil', {
        inBody: document.body.contains(toast),
        display: window.getComputedStyle(toast).display,
        visibility: window.getComputedStyle(toast).visibility,
        zIndex: window.getComputedStyle(toast).zIndex,
        className: toast.className
      });

      this.elements.toast = toast;
      this.elements.button = toast.querySelector('.smart-guide-button');
      this.elements.closeBtn = toast.querySelector('.smart-guide-close');
    },

    /**
     * Dapatkan HTML untuk toast berdasarkan halaman terdeteksi
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
          message = 'Proses checkout pesanan kamu tertunda. Selesaikan pesanan sekarang.';
          break;
        case 'success.html':
          title = '✅ Pesanan Berhasil Dibuat';
          message = 'Pesanan kamu telah dicatat. Lihat detail dan konfirmasi riwayat pesanan.';
          break;
        default:
          title = '📋 Pantau Pesanan Kamu Disini';
          message = 'Temukan pesanan aktif kamu dan lanjutkan proses belanja.';
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
      }
    },

    /**
     * Sembunyikan toast dengan animasi
     */
    hide: function() {
      if (this.elements.toast) {
        this.elements.toast.classList.add('hidden');
        setTimeout(() => {
          if (this.elements.toast && this.elements.toast.parentNode) {
            this.elements.toast.style.display = 'none';
            this.elements.toast.remove();
          }
        }, 300);
      }
    },

    /**
     * Sembunyikan langsung tanpa animasi
     */
    hideDirectly: function() {
      if (this.elements.toast) {
        this.elements.toast.style.display = 'none';
        if (this.elements.toast.parentNode) {
          this.elements.toast.remove();
        }
      }
    },

    /**
     * Navigasi ke halaman progres aktif dengan otorisasi sah
     */
    navigateToActiveProgress: function() {
      const detectedPage = this.state.detectedPage;

      if (detectedPage) {
        let sourceToken = 'valid_action';
        if (detectedPage === 'orders.html') {
          sourceToken = 'smart_guide_orders';
          try { sessionStorage.setItem('dikySmartGuideOrderTab', this.state.detectedTab || 'dikemas'); } catch (error) { }
        }
        else if (detectedPage === 'keranjang.html') sourceToken = 'smart_guide_keranjang';
        else if (detectedPage === 'checkout.html') sourceToken = 'smart_guide_checkout';
        else if (detectedPage === 'success.html') sourceToken = 'smart_guide_success';

        // Berikan izin akses navigasi sah agar tidak diblokir NavigationGuard
        if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
          window.NavigationGuard.grantAccess(detectedPage, sourceToken);
        }

        this.hide();
        setTimeout(() => {
          window.location.href = detectedPage;
        }, 200);
      }
    },

    /**
     * Bind event listeners untuk tombol toast
     */
    bindEvents: function() {
      if (this.elements.button) {
        this.elements.button.addEventListener('click', () => {
          this.navigateToActiveProgress();
        });
      }

      if (this.elements.closeBtn) {
        this.elements.closeBtn.addEventListener('click', () => {
          this.hide();
        });
      }
    }
  };

  // Evaluasi setelah DOM siap agar tab pesanan aktif sudah tersedia saat aturan
  // pengecualian tab Dikemas/Dikirim/Selesai diperiksa.
  function initializeSmartGuide() {
    SmartGuide.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSmartGuide, { once: true });
  } else {
    initializeSmartGuide();
  }
  window.addEventListener('pageshow', function() {
    if (document.visibilityState !== 'hidden') SmartGuide.init();
  });

  window.addEventListener('popstate', function() {
    SmartGuide.init();
  });

  // Perbarui toast bila cart/order berubah dari tab atau halaman lain.
  window.addEventListener('storage', function(event) {
    const key = String(event.key || '').toLowerCase();
    if (key.startsWith('dikyorders_') || key.startsWith('dikycart_') ||
        key.startsWith('pesananaktif') || key.startsWith('pesananbaru') ||
        key.startsWith('dikycheckoutitems_') || ['cart', 'dikycart', 'keranjang'].includes(key)) {
      SmartGuide.init();
    }
  });

  function initializeSmartGuideWhenBodyReady() {
    if (document.body) {
      SmartGuide.init();
    } else {
      window.setTimeout(initializeSmartGuideWhenBodyReady, 0);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSmartGuideWhenBodyReady, { once: true });
  } else {
    initializeSmartGuideWhenBodyReady();
  }

  // Export ke global scope
  window.SmartGuide = SmartGuide;

})(window);