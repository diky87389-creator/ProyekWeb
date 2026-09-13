/* Admin gate: letakkan sebagai script pertama di <head> setiap halaman admin. */
(function () {
  'use strict';

  var ACTIVE_USER_KEY = 'dikyActiveUser';
  var MESSAGE_KEY = 'diky_security_message';
  var LOGIN_PAGE = 'login.html';
  var MAX_IDLE = 15 * 60 * 1000;
  var activityKey;
  var currentUserId;

  function pageName() {
    return (window.location.pathname.split('/').pop() || '').toLowerCase();
  }

  function deny(message, destination) {
    try {
      localStorage.removeItem(ACTIVE_USER_KEY);
      if (activityKey) localStorage.removeItem(activityKey);
      sessionStorage.setItem(MESSAGE_KEY, message);
    } catch (error) {
      // Storage dapat dinonaktifkan; redirect tetap dilakukan.
    }
    window.location.replace(destination || LOGIN_PAGE);
  }

  function readActiveUser() {
    try {
      var raw = localStorage.getItem(ACTIVE_USER_KEY);
      var user = raw ? JSON.parse(raw) : null;
      if (!user || (typeof user.id !== 'string' && typeof user.id !== 'number')) return null;
      user.id = String(user.id).trim();
      return user.id ? user : null;
    } catch (error) {
      return null;
    }
  }

  function isAdmin(user) {
    return user && typeof user.role === 'string' && user.role.trim().toLowerCase() === 'admin';
  }

  function isSessionFresh(user) {
    activityKey = 'dikySessionActivity_' + user.id;
    var activity;
    try { activity = Number(localStorage.getItem(activityKey)); } catch (error) { return false; }
    return Number.isFinite(activity) && activity > 0 && Date.now() - activity <= MAX_IDLE;
  }

  function validate() {
    var user = readActiveUser();
    if (!user) {
      deny('Akses admin ditolak. Silakan login terlebih dahulu.');
      return false;
    }
    currentUserId = user.id;
    if (!isAdmin(user)) {
      deny('Akses ditolak. Halaman ini hanya dapat dibuka oleh admin.', 'index.html');
      return false;
    }
    if (!isSessionFresh(user)) {
      deny('Sesi admin telah berakhir. Silakan login kembali.');
      return false;
    }
    return true;
  }

  // Eksekusi langsung sebelum script admin dan UI halaman dijalankan.
  if (!validate()) return;

  // Proteksi halaman yang dipulihkan dari Back/Forward Cache.
  window.addEventListener('pageshow', function () {
    var user = readActiveUser();
    if (!user || user.id !== currentUserId || !isAdmin(user) || !isSessionFresh(user)) {
      deny('Sesi admin sudah tidak valid. Silakan login kembali.');
    }
  });
}());
