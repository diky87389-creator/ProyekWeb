'use strict';
(function () {
  var ACTIVE_USER_KEY = 'dikyActiveUser';
  var USER_PREFIXES = ['dikyCart_', 'dikyOrders_', 'dikyHutang_'];
  function readProducts() {
    try {
      var data = JSON.parse(localStorage.getItem('dikyProducts') || '[]');
      return Array.isArray(data) ? data : [];
    } catch (error) { return []; }
  }

  function readAllByPrefix(prefix) {
    var result = [];
    for (var i = 0; i < localStorage.length; i += 1) {
      var storageKey = localStorage.key(i);
      if (!storageKey || storageKey.indexOf(prefix) !== 0) continue;
      readArray(storageKey).forEach(function (item) { result.push(item); });
    }
    return result;
  }

  function getAdmin() {
    try { return JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function key(prefix) {
    var user = getAdmin();
    return user && user.id ? prefix + String(user.id) : null;
  }
  function readArray(storageKey) {
    if (!storageKey) return [];
    try { var data = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(data) ? data : []; } catch (e) { return []; }
  }
  function safeAmount(value) {
    var amount = Number(value); return Number.isFinite(amount) && amount >= 0 ? amount : 0;
  }
  function render() {
    var orders = readAllByPrefix('dikyOrders_');
    var debts = readAllByPrefix('dikyHutang_');
    var products = readProducts();
    var unpaid = debts.filter(function (debt) { return debt && String(debt.status || 'belum').toLowerCase() === 'belum'; });
    var debtTotal = unpaid.reduce(function (sum, debt) {
      return sum + safeAmount(debt.totalAmount || (debt.items || []).reduce(function (s, item) { return s + safeAmount(item.price) * safeAmount(item.qty || item.quantity); }, 0));
    }, 0);
    document.getElementById('total-orders').textContent = orders.length.toLocaleString('id-ID');
    document.getElementById('total-products').textContent = products.length.toLocaleString('id-ID');
    document.getElementById('unpaid-debts').textContent = unpaid.length.toLocaleString('id-ID');
    document.getElementById('debt-value').textContent = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(debtTotal);
    document.getElementById('last-updated').textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  function logout() {
    try { localStorage.removeItem(ACTIVE_USER_KEY); sessionStorage.setItem('diky_security_message', 'Anda telah logout dari panel admin.'); } catch (e) { }
    window.location.replace('login.html');
  }
  document.addEventListener('DOMContentLoaded', function () {
    render();
    document.getElementById('logout-button').addEventListener('click', logout);
  });
}());
