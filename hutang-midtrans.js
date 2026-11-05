/**
 * ============================================================
 * HUTANG MIDTRANS BRIDGE — dimuat SETELAH hutang-bayar2.js
 * ============================================================
 * Membungkus tombol "Konfirmasi Pembayaran" di modal hutang:
 *   - Tunai         -> langsung (menunggu tunai di kasir)
 *   - QRIS          -> Midtrans Snap
 *   - Transfer Bank -> Midtrans Snap
 *
 * Setelah pembayaran Midtrans sukses/pending, alur lama tetap
 * dijalankan: paidItemKeys diperbarui dan paymentRequest='menunggu'.
 * Status kasbon TIDAK diubah jadi lunas — admin tetap yang memutuskan.
 */
(function (window, document) {
  'use strict';

  var busy = false;

  function selectedMethod() {
    var r = document.querySelector('input[name="pay-method"]:checked');
    return r ? r.value : 'QRIS';
  }

  function modalIsOpen(id) {
    var m = document.getElementById(id);
    return m && !m.hidden;
  }

  /** Susun item dari keranjang pembayaran (hutang-bayar2.js global). */
  function basketItems() {
    if (typeof window.HutangBayar === 'undefined') return [];
    var api = window.HutangBayar;
    if (typeof api.getBasket === 'function') return api.getBasket();
    return [];
  }

  function customer() {
    try {
      var u = typeof window.getActiveUser === 'function' ? window.getActiveUser() : null;
      return {
        name: (u && (u.fullName || u.username)) || 'Pelanggan',
        phone: (u && u.phoneNumber) || '',
        email: (u && u.emailAddress) || ''
      };
    } catch (e) { return { name: 'Pelanggan' }; }
  }

  function proceedOriginal() {
    // Panggil alur asli hutang-bayar2.js setelah pembayaran berhasil.
    if (typeof window.HutangBayar !== 'undefined' && typeof window.HutangBayar.submitAfterPayment === 'function') {
      window.HutangBayar.submitAfterPayment();
      return;
    }
    var submit = document.getElementById('pay-submit-btn');
    if (submit) {
      var clone = submit.cloneNode(true);
      submit.parentNode.replaceChild(clone, submit);
      clone.click();
    }
  }

  function handle(event) {
    var btn = event.target && event.target.closest && event.target.closest('#pay-submit-btn');
    if (!btn) return;
    if (!modalIsOpen('pay-confirm-modal')) return;

    var method = selectedMethod();
    if (method === 'Tunai') return; // Tunai: tidak lewat Midtrans
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); return; }

    var items = basketItems();
    if (!items.length) return; // biarkan alur asli menangani validasi

    if (typeof window.MidtransPay === 'undefined') return; // fallback: alur asli

    event.preventDefault();
    event.stopImmediatePropagation();
    busy = true;
    btn.disabled = true;

    window.MidtransPay.createDebtPayment({
      items: items.map(function (it) {
        return { id: it.id, name: it.name, price: it.price, qty: it.qty };
      }),
      customer: customer(),
      enabledPayments: method === 'QRIS' ? ['other_qris'] : ['bank_transfer']
    }).then(function (result) {
      return new Promise(function (resolve, reject) {
        window.MidtransPay.pay(result.token, {
          onSuccess: resolve,
          onPending: resolve,
          onError: function (err) { reject(new Error((err && err.status_message) || 'Pembayaran gagal.')); },
          onClose: function () { reject(new Error('closed')); }
        });
      });
    }).then(function () {
      busy = false;
      btn.disabled = false;
      proceedOriginal();
    }).catch(function (err) {
      busy = false;
      btn.disabled = false;
      if (err && err.message === 'closed') return;
      window.alert('Pembayaran tidak selesai: ' + (err && err.message ? err.message : 'coba lagi.'));
    });
  }

  function bind() {
    if (!document.getElementById('pay-submit-btn')) return;
    document.body.addEventListener('click', handle, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
}(window, document));
