/* Early session gate. Load this in <head> on every protected page. */
(function () {
  'use strict';
  var ACTIVE = 'dikyActiveUser';
  var ACTIVITY_PREFIX = 'dikySessionActivity_';
  var MAX_IDLE = 15 * 60 * 1000;
  var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var publicPages = ['login.html', 'daftar.html', '404.html'];
  if (publicPages.indexOf(path) !== -1) return;

  function redirect(message) {
    try {
      sessionStorage.setItem('diky_security_message', message);
      localStorage.removeItem(ACTIVE);
    } catch (e) { }
    location.replace('login.html');
  }

  var user;
  try { user = JSON.parse(localStorage.getItem(ACTIVE) || 'null'); } catch (e) { user = null; }
  if (!user || (typeof user.id !== 'string' && typeof user.id !== 'number') || String(user.id).trim() === '') {
    redirect('Sesi tidak valid. Silakan login kembali.');
    return;
  }
  user.id = String(user.id);

  // Akun harus masih terdaftar; pernah mendaftar bukan berarti sedang login.
  try {
    var registered = JSON.parse(localStorage.getItem('dikyRegisteredUsers') || '[]');
    if (!Array.isArray(registered) || !registered.some(function (item) { return item && String(item.id) === user.id; })) {
      redirect('Akun atau sesi tidak valid. Silakan login kembali.');
      return;
    }
  } catch (e) { redirect('Sesi tidak dapat diverifikasi. Silakan login kembali.'); return; }

  var activityKey = ACTIVITY_PREFIX + user.id;
  var now = Date.now();
  var lastActivity;
  try { lastActivity = Number(localStorage.getItem(activityKey)); } catch (e) { lastActivity = NaN; }
  var loggedAt = Date.parse(user.loggedAt || '');
  if (Number.isFinite(loggedAt) && (!Number.isFinite(lastActivity) || loggedAt > lastActivity)) {
    lastActivity = loggedAt;
    try { localStorage.setItem(activityKey, String(lastActivity)); } catch (e) { }
  }
  if (!Number.isFinite(lastActivity) || lastActivity <= 0) {
    lastActivity = now;
    try { localStorage.setItem(activityKey, String(lastActivity)); } catch (e) { }
  }
  if (now - lastActivity > MAX_IDLE) {
    redirect('Sesi Anda berakhir setelah 15 menit tidak aktif. Silakan login kembali.');
    return;
  }
  function touch() { try { localStorage.setItem(activityKey, String(Date.now())); } catch (e) { } }

  ['click', 'keydown', 'touchstart', 'pointerdown', 'mousemove'].forEach(function (eventName) {
    window.addEventListener(eventName, touch, { passive: true });
  });

  // pageshow menangani back/forward cache: HTML bisa muncul tanpa eksekusi ulang.
  window.addEventListener('pageshow', function () {
    var current;
    try { current = JSON.parse(localStorage.getItem(ACTIVE) || 'null'); } catch (e) { current = null; }
    var currentActivity = Number(localStorage.getItem(activityKey));
    var currentLoggedAt = Date.parse(current && current.loggedAt ? current.loggedAt : '');
    // Session yang baru dibuat setelah halaman ini dimuat harus mendapat grace
    // timestamp login, bukan dibandingkan dengan timestamp sesi lama.
    if (Number.isFinite(currentLoggedAt) && currentLoggedAt > currentActivity) {
      currentActivity = currentLoggedAt;
      try { localStorage.setItem(activityKey, String(currentActivity)); } catch (e) { }
    }
    if (!current || String(current.id) !== user.id || !Number.isFinite(currentActivity) || Date.now() - currentActivity > MAX_IDLE) {
      redirect('Sesi sudah berakhir. Silakan login kembali.');
    }
  });
}());
