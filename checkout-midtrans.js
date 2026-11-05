/**
 * ============================================================
 * CHECKOUT MIDTRANS BRIDGE — dimuat SETELAH checkout.js
 * ============================================================
 * Tunai          -> menunggu_verifikasi (tanpa Midtrans)
 * QRIS           -> Midtrans Snap
 * Transfer Bank  -> Midtrans Snap
 * Hutang         -> alur lama (tidak disentuh)
 */
(function (window, document) {
  'use strict';

  var busy = false;

  function getMethod() {
    var checked = document.querySelector('input[name="paymentMethod"]:checked');
    return checked ? checked.value : 'Tunai';
  }

  function readCart() {
    try {
      var key = typeof getUserStorageKey === 'function' ? getUserStorageKey('checkoutItems') : null;
      if (!key) return [];
      var raw = localStorage.getItem(key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function readShippingCost() {
    // Wajib memakai sumber yang SAMA dengan checkout.js agar nominal
    // yang ditagihkan Midtrans identik dengan yang tampil di ringkasan.
    try {
      var delivery = document.querySelector('input[name="deliveryMethod"]:checked');
      var metode = delivery ? delivery.value : 'Diantar ke Rumah';

      if (typeof window.Ongkir !== 'undefined') {
        var hasil = window.Ongkir.hitung({
          metodePengiriman: metode,
          user: (typeof getActiveUser === 'function' ? getActiveUser() : null)
        });
        return Number(hasil.total) || 0;
      }
    } catch (e) { }

    // Fallback terakhir: baca dari ringkasan.
    try {
      var el = document.getElementById('shipping-cost');
      if (!el) return 0;
      var digits = String(el.textContent || '').replace(/[^0-9]/g, '');
      return Number(digits) || 0;
    } catch (e) { return 0; }
  }

  function buildItems(cart, shippingCost) {
    var items = [];

    cart.forEach(function (it) {
      var price = Number(it.price) || 0;
      var qty = Number(it.quantity || it.qty) || 0;
      if (price <= 0 || qty <= 0) return;

      // Midtrans menolak quantity desimal (mis. 1,5 kg).
      // Solusi: kirim kuantitas bulat 1 dengan harga total item.
      var label = (String(it.name || 'Produk') + '\u0020' + (it.unit || '')).trim();

      if (Math.abs(qty - Math.round(qty)) > 1e-9) {
        items.push({
          id: String(it.id || 'ITEM'),
          name: label,
          price: Math.round(price * qty),
          qty: 1
        });
      } else {
        items.push({
          id: String(it.id || 'ITEM'),
          name: label,
          price: Math.round(price),
          qty: Math.round(qty)
        });
      }
    });

    if (shippingCost > 0) {
      items.push({ id: 'ONGKIR', name: 'Ongkos Kirim', price: Math.round(shippingCost), qty: 1 });
    }
    return items;
  }

  function customerInfo() {
    var name = document.getElementById('customer-name');
    var phone = document.getElementById('customer-phone');
    var address = document.getElementById('customer-address');
    return {
      name: name ? name.value.trim() : '',
      phone: phone ? phone.value.trim() : '',
      address: address ? address.value.trim() : ''
    };
  }

  function hideLoading() {
    var modal = document.querySelector('.loading-modal');
    if (modal) modal.classList.remove('active');
  }

  function showError(message) {
    hideLoading();
    var btn = document.getElementById('confirm-button');
    if (btn) btn.disabled = false;
    window.alert(message);
  }

  function payWithMidtrans(method) {
    var items = buildItems(readCart(), readShippingCost());
    if (!items.length) {
      showError('Keranjang checkout kosong. Silakan kembali ke keranjang.');
      return Promise.reject(new Error('empty'));
    }
    if (typeof window.MidtransPay === 'undefined') {
      showError('Modul pembayaran belum dimuat. Muat ulang halaman.');
      return Promise.reject(new Error('no module'));
    }

    return window.MidtransPay.createOrder({
      items: items,
      customer: customerInfo(),
      method: method,
      enabledPayments: method === 'QRIS' ? ['other_qris'] : ['bank_transfer']
    }).then(function (result) {
      return new Promise(function (resolve, reject) {
        window.MidtransPay.pay(result.token, {
          onSuccess: function () { resolve(result); },
          onPending: function () { resolve(result); },
          onError: function (err) { reject(new Error((err && err.status_message) || 'Pembayaran gagal.')); },
          onClose: function () { reject(new Error('closed')); }
        });
      });
    });
  }

  function bind() {
    var btn = document.getElementById('confirm-button');
    if (!btn) return;

    btn.addEventListener('click', function (event) {
      var method = getMethod();
      if (method !== 'QRIS' && method !== 'Transfer Bank') return;
      if (busy) { event.preventDefault(); event.stopImmediatePropagation(); return; }

      event.preventDefault();
      event.stopImmediatePropagation();
      busy = true;
      btn.disabled = true;

      payWithMidtrans(method).then(function () {
        busy = false;
        btn.disabled = false;
        if (typeof window.submitOrder === 'function') window.submitOrder();
      }).catch(function (err) {
        busy = false;
        btn.disabled = false;
        if (err && err.message === 'closed') { hideLoading(); return; }
        showError('Pembayaran tidak selesai: ' + (err && err.message ? err.message : 'coba lagi.'));
      });
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
}(window, document));
