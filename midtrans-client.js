/**
 * ============================================================
 * MIDTRANS CLIENT — pembungkus Snap untuk checkout.html & hutang.html
 * ============================================================
 * TIDAK menyimpan Server Key. Hanya memanggil API internal server
 * (/api/payment/*) dan memunculkan popup Snap.
 *
 * Pemakaian:
 *   await MidtransPay.ensureLoaded();         // muat snap.js
 *   const res = await MidtransPay.createOrder({...});
 *   if (res.demo) { ...lanjut tanpa popup... }
 *   else MidtransPay.pay(res.token, { onSuccess, onPending, onError });
 */
(function (window) {
  'use strict';

  var config = null;
  var scriptPromise = null;

  function api(path, options) {
    return fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options)).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.ok === false) {
          var err = new Error((data && data.message) || 'Permintaan pembayaran gagal.');
          err.payload = data;
          throw err;
        }
        return data;
      });
    });
  }

  function loadConfig() {
    if (config) return Promise.resolve(config);
    return api('/api/payment/config').then(function (data) {
      config = data;
      return data;
    }).catch(function () {
      // Server belum siap / mode offline: anggap demo.
      config = { demoMode: true, clientKey: '', snapScriptUrl: null, isProduction: false };
      return config;
    });
  }

  function ensureLoaded() {
    if (scriptPromise) return scriptPromise;
    scriptPromise = loadConfig().then(function (cfg) {
      if (cfg.demoMode || !cfg.snapScriptUrl || !cfg.clientKey) return cfg;
      if (window.snap) return cfg;

      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = cfg.snapScriptUrl;
        s.setAttribute('data-client-key', cfg.clientKey);
        s.onload = function () { resolve(cfg); };
        s.onerror = function () { reject(new Error('Gagal memuat Snap.js Midtrans.')); };
        document.head.appendChild(s);
      });
    });
    return scriptPromise;
  }

  /** Buat transaksi untuk pesanan checkout. */
  function createOrder(payload) {
    return ensureLoaded().then(function () {
      return api('/api/payment/create', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    });
  }

  /** Buat transaksi untuk pembayaran hutang. */
  function createDebtPayment(payload) {
    return ensureLoaded().then(function () {
      return api('/api/debt-payment/create', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    });
  }

  function pay(token, handlers) {
    handlers = handlers || {};
    if (!window.snap || String(token || '').indexOf('DEMO-') === 0) {
      // Mode demo: langsung anggap berhasil agar alur UI tetap bisa diuji.
      if (typeof handlers.onSuccess === 'function') handlers.onSuccess({ demo: true, token: token });
      return;
    }
    window.snap.pay(token, {
      onSuccess: function (result) { if (handlers.onSuccess) handlers.onSuccess(result); },
      onPending: function (result) { if (handlers.onPending) handlers.onPending(result); },
      onError: function (result) { if (handlers.onError) handlers.onError(result); },
      onClose: function () { if (handlers.onClose) handlers.onClose(); }
    });
  }

  window.MidtransPay = {
    ensureLoaded: ensureLoaded,
    createOrder: createOrder,
    createDebtPayment: createDebtPayment,
    pay: pay,
    getConfig: function () { return config; }
  };
}(window));
