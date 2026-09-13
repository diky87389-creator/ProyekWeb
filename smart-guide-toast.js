/**
 * ==========================================
 * Smart Guide Toast Notification System
 * Warung Sayur Diky - Modular Component
 * ==========================================
 *
 * Fitur: Floating toast notification "Pantau Pesanan Kamu Disini" untuk
 * memandu pengguna kembali ke halaman tempat pesanan aktif mereka berada
 * dalam alur e-commerce.
 *
 * MODEL TAHAP (satu pesanan mengalir melalui tahap berikut):
 *   keranjang -> checkout -> success -> dikemas -> dikirim -> selesai
 *
 * ATURAN KEMUNCULAN MUTLAK:
 * 1. Sistem mendeteksi SATU tahap aktif (paling lanjut yang belum selesai).
 * 2. Pop-up "Pantau Pesanan Kamu Disini" HANYA MUNCUL di halaman SELAIN
 *    halaman tempat pesanan aktif berada.
 * 3. Jika pesanan aktif berada di keranjang.html, pop-up disembunyikan di
 *    keranjang.html dan ditampilkan di halaman lain (index.html, checkout.html,
 *    success.html, hutang.html, profile.html, about.html, contact.html,
 *    orders.html pada tab lain). Klik tombol -> keranjang.html.
 *    Berlaku serupa untuk checkout.html, success.html, dan orders.html
 *    (tab Dikemas / Dikirim / Silahkan Untuk Diambil).
 * 4. Di orders.html, pop-up disembunyikan saat tab aktif = tab tahap aktif
 *    (Dikemas atau Dikirim/Silahkan Untuk Diambil), dan ditampilkan saat
 *    user berada di tab lain.
 * 5. Klik tombol mengarah ke halaman tahap aktif (orders.html membawa tab
 *    yang benar via sessionStorage) dengan otorisasi navigasi sah.
 * 6. Begitu pesanan mencapai tab Selesai, pop-up disembunyikan di semua halaman.
 * 7. Pop-up tetap muncul setelah tombol Back browser selama tahap belum selesai.
 */

(function (window) {
  'use strict';

  // Urutan tahap dari paling awal ke paling lanjut. 'selesai' = tersembunyi.
  const STAGE_ORDER = ['keranjang', 'checkout', 'success', 'dikemas', 'dikirim'];
  const STAGE_PAGE = {
    keranjang: 'keranjang.html',
    checkout: 'checkout.html',
    success: 'success.html',
    dikemas: 'orders.html',
    dikirim: 'orders.html'
  };

  function rankOf(stage) {
    const index = STAGE_ORDER.indexOf(stage);
    return index === -1 ? -99 : index;
  }

  // Status order (dari storage) -> nilai tab orders.html yang sesuai.
  function tabForStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'dikirim' || value === 'siap_diambil') return value;
    // menunggu / diproses / dikemas / kosong -> Dikemas
    return 'dikemas';
  }

  const SmartGuide = {
    state: {
      stage: null,
      tab: null,
      orderId: null,
      targetPage: null,
      initialized: false
    },

    elements: {
      toast: null,
      content: null,
      button: null,
      closeBtn: null
    },

    getUserKeys: function () {
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

    getCurrentPageName: function () {
      const path = String(window.location.pathname || '');
      const fileName = path.split('/').filter(Boolean).pop() || 'index.html';
      const cleanName = fileName.split('?')[0].split('#')[0].toLowerCase();
      return cleanName === 'index' ? 'index.html' : cleanName;
    },

    hasData: function (key) {
      if (!key) return false;
      try {
        const data = localStorage.getItem(key);
        if (!data) return false;
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
        return !!parsed;
      } catch (e) {
        return false;
      }
    },

    getActiveOrders: function () {
      const finishedStatuses = ['selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan', 'completed', 'cancelled'];
      const userKeys = this.getUserKeys();
      const result = [];
      if (!userKeys) return result;

      const sources = [
        ['orders', userKeys.orders, false],
        ['orderHistory', userKeys.orderHistory, false],
        ['pesananAktif', userKeys.pesananAktif, false],
        ['pesananBaru', userKeys.pesananBaru, false],
        ['cart', userKeys.cart, true],
        ['checkoutItems', userKeys.checkoutItems, true]
      ];
      sources.forEach(function (entry) {
        const source = entry[0];
        const key = entry[1];
        const isCart = entry[2];
        if (!key) return;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || 'null');
          const records = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
          records.forEach(function (record) {
            if (!record || typeof record !== 'object') return;
            const status = String(record.status || '').trim().toLowerCase();
            if (isCart || !finishedStatuses.includes(status)) {
              result.push(Object.assign({ source: source }, record));
            }
          });
        } catch (error) {
          console.warn('[SmartGuide] Key user tidak dapat dibaca:', key, error);
        }
      });
      return result;
    },

    /**
     * Deteksi SATU tahap aktif pesanan (paling lanjut yang belum selesai).
     * Mengembalikan { stage, tab, orderId } atau null.
     */
    detectActiveStage: function () {
      const userKeys = this.getUserKeys() || {};
      const hasData = (key) => this.hasData(key);
      const activeOrders = this.getActiveOrders();

      // 1) Tahap orders (Dikemas / Dikirim / Silahkan Untuk Diambil):
      //    pesanan nyata yang sudah masuk riwayat/orders.
      const orderRecords = activeOrders.filter(function (order) {
        if (order.source !== 'orders' && order.source !== 'orderHistory') return false;
        const status = String(order.status || '').trim().toLowerCase();
        // semua status non-selesai di sini termasuk tahap orders.
        return !['selesai', 'lunas', 'dibatalkan', 'dibatalkan oleh pelanggan', 'completed', 'cancelled'].includes(status);
      });

      if (orderRecords.length) {
        let best = orderRecords[0];
        for (let i = 1; i < orderRecords.length; i += 1) {
          const candidate = orderRecords[i];
          const candidateRank = rankOf(tabForStatus(candidate.status) === 'dikemas' ? 'dikemas' : 'dikirim');
          const bestRank = rankOf(tabForStatus(best.status) === 'dikemas' ? 'dikemas' : 'dikirim');
          const candidateTime = Date.parse(candidate.createdAt || candidate.timestamp || candidate.orderDate || '');
          const bestTime = Date.parse(best.createdAt || best.timestamp || best.orderDate || '');
          if (candidateRank > bestRank || (candidateRank === bestRank && candidateTime > bestTime)) {
            best = candidate;
          }
        }
        const tab = tabForStatus(best.status);
        return { stage: tab, tab: tab, orderId: best.id || best.orderId || null };
      }

      // 2) Tahap success: pesananAktif / lastOrder ada (pesanan dibuat, belum
      //    dipindahkan ke riwayat oleh tombol "Lihat Riwayat Pesanan").
      if (hasData(userKeys.pesananAktif) || hasData(userKeys.lastOrder)) {
        return { stage: 'success', tab: null, orderId: null };
      }

      // 3) Tahap checkout: checkoutItems ada.
      if (hasData(userKeys.checkoutItems)) {
        return { stage: 'checkout', tab: null, orderId: null };
      }

      // 4) Tahap keranjang: cart ada.
      if (hasData(userKeys.cart)) {
        return { stage: 'keranjang', tab: null, orderId: null };
      }

      // 5) Tidak ada tahap aktif (mis. semua pesanan sudah Selesai) -> null.
      return null;
    },

    /**
     * Tab orders.html yang sedang aktif di DOM, atau null bila bukan orders.html.
     */
    getActiveOrdersTab: function () {
      if (this.getCurrentPageName() !== 'orders.html') return null;
      const activeButton = document.querySelector('.order-tab.active');
      return activeButton ? String(activeButton.dataset.tab || '').toLowerCase() : null;
    },

    /**
     * Tentukan apakah pop-up harus tampil di halaman ini.
     */
    shouldShowToast: function () {
      const stageInfo = this.state.stage ? this.state : null;
      if (!stageInfo || !stageInfo.stage) return false;

      const currentPage = this.getCurrentPageName();
      const targetPage = STAGE_PAGE[stageInfo.stage];

      // Tahap orders: target = orders.html dengan tab tertentu.
      if (stageInfo.stage === 'dikemas' || stageInfo.stage === 'dikirim') {
        if (currentPage !== 'orders.html') return true; // di halaman lain -> tampil
        // Sedang di orders.html: sembunyi hanya jika tab aktif = tab tahap.
        const activeTab = this.getActiveOrdersTab();
        return activeTab !== stageInfo.tab;
      }

      // Tahap keranjang/checkout/success: sembunyi di halaman tahap itu sendiri.
      return currentPage !== targetPage;
    },

    init: function () {
      // Single-toast invariant: hapus semua instance lama.
      document.querySelectorAll('.smart-guide-toast').forEach(function (toast) { toast.remove(); });
      this.elements.toast = null;
      this.elements.button = null;
      this.elements.closeBtn = null;

      const detected = this.detectActiveStage();
      this.state.stage = detected ? detected.stage : null;
      this.state.tab = detected ? detected.tab : null;
      this.state.orderId = detected ? detected.orderId : null;
      this.state.targetPage = detected ? STAGE_PAGE[detected.stage] : null;

      if (!this.shouldShowToast()) {
        this.hideDirectly();
        return;
      }

      this.createToastElement();
      this.bindEvents();
      this.show();
      this.state.initialized = true;
    },

    createToastElement: function () {
      const toast = document.createElement('div');
      toast.className = 'smart-guide-toast';
      toast.innerHTML = this.getToastHTML();
      document.body.appendChild(toast);
      toast.style.display = 'block';
      toast.classList.remove('hidden');

      this.elements.toast = toast;
      this.elements.button = toast.querySelector('.smart-guide-button');
      this.elements.closeBtn = toast.querySelector('.smart-guide-close');
    },

    getToastHTML: function () {
      const stage = this.state.stage;
      let title = '📋 Pantau Pesanan Kamu Disini';
      let message = 'Temukan pesanan aktif kamu dan lanjutkan proses belanja.';

      switch (stage) {
        case 'keranjang':
          title = '🛒 Pesanan Kamu Menunggu';
          message = 'Kamu memiliki item di keranjang belanja. Lanjutkan pembayaran sekarang.';
          break;
        case 'checkout':
          title = '💳 Checkout Belum Selesai';
          message = 'Proses checkout pesanan kamu tertunda. Selesaikan pesanan sekarang.';
          break;
        case 'success':
          title = '✅ Pesanan Berhasil Dibuat';
          message = 'Pesanan kamu telah dicatat. Lihat detail dan konfirmasi riwayat pesanan.';
          break;
        case 'dikemas':
          title = '📦 Pesanan Sedang Dikemas';
          message = 'Pesanan kamu sedang diproses. Pantau statusnya di tab Dikemas.';
          break;
        case 'dikirim':
          title = '🚚 Pesanan Dalam Pengiriman';
          message = 'Pesanan kamu sedang dikirim/siap diambil. Pantau statusnya sekarang.';
          break;
        default:
          break;
      }

      return ''
        + '<button class="smart-guide-close" aria-label="Tutup">×</button>'
        + '<div class="smart-guide-content">'
        + '  <div class="smart-guide-header">'
        + '    <span class="smart-guide-icon">💡</span>'
        + '    <h3 class="smart-guide-title">' + title + '</h3>'
        + '  </div>'
        + '  <p class="smart-guide-message">' + message + '</p>'
        + '  <button class="smart-guide-button">Pantau Pesanan Kamu Disini</button>'
        + '</div>';
    },

    show: function () {
      if (this.elements.toast) {
        this.elements.toast.style.display = 'block';
        this.elements.toast.classList.remove('hidden');
      }
    },

    hide: function () {
      if (this.elements.toast) {
        this.elements.toast.classList.add('hidden');
        const self = this;
        setTimeout(function () {
          if (self.elements.toast && self.elements.toast.parentNode) {
            self.elements.toast.style.display = 'none';
            self.elements.toast.remove();
          }
        }, 300);
      }
    },

    hideDirectly: function () {
      if (this.elements.toast) {
        this.elements.toast.style.display = 'none';
        if (this.elements.toast.parentNode) this.elements.toast.remove();
      }
    },

    /**
     * Navigasi ke halaman tahap aktif dengan otorisasi sah.
     */
    navigateToActiveProgress: function () {
      const stage = this.state.stage;
      const targetPage = this.state.targetPage;
      if (!stage || !targetPage) return;

      let sourceToken = 'valid_action';
      if (stage === 'dikemas' || stage === 'dikirim') {
        sourceToken = 'smart_guide_orders';
        try { sessionStorage.setItem('dikySmartGuideOrderTab', this.state.tab || 'dikemas'); } catch (e) { }
      } else if (stage === 'keranjang') sourceToken = 'smart_guide_keranjang';
      else if (stage === 'checkout') sourceToken = 'smart_guide_checkout';
      else if (stage === 'success') sourceToken = 'smart_guide_success';

      if (window.NavigationGuard && typeof window.NavigationGuard.grantAccess === 'function') {
        window.NavigationGuard.grantAccess(targetPage, sourceToken);
      }

      this.hide();
      const self = this;
      setTimeout(function () {
        window.location.href = targetPage;
      }, 200);
    },

    bindEvents: function () {
      const self = this;
      if (this.elements.button) {
        this.elements.button.addEventListener('click', function () { self.navigateToActiveProgress(); });
      }
      if (this.elements.closeBtn) {
        this.elements.closeBtn.addEventListener('click', function () { self.hide(); });
      }
    }
  };

  function initializeSmartGuide() {
    SmartGuide.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSmartGuide, { once: true });
  } else {
    initializeSmartGuide();
  }

  window.addEventListener('pageshow', function () {
    if (document.visibilityState !== 'hidden') SmartGuide.init();
  });

  window.addEventListener('popstate', function () {
    SmartGuide.init();
  });

  // Re-evaluasi toast bila data pesanan berubah dari tab/halaman lain.
  window.addEventListener('storage', function (event) {
    const key = String(event.key || '').toLowerCase();
    if (
      key.startsWith('dikyorders_') || key.startsWith('riwayatpesanan_') ||
      key.startsWith('dikycart_') || key.startsWith('pesananaktif') ||
      key.startsWith('pesananbaru') || key.startsWith('dikycheckoutitems_') ||
      key.startsWith('dikylastorder_') || key.startsWith('dikylastposition_') ||
      ['cart', 'dikycart', 'keranjang'].includes(key)
    ) {
      SmartGuide.init();
    }
  });

  window.SmartGuide = SmartGuide;
})(window);