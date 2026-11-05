/**
 * ============================================================
 * RESET KATA SANDI — reset-password.html
 * ============================================================
 * URL: reset-password.html?token=XXXX&email=budi@mail.com
 *
 * Alur:
 *   1. Validasi token (ada, belum kedaluwarsa, belum dipakai)
 *   2. User mengisi kata sandi baru + konfirmasi
 *   3. Simpan hash SHA-256 ke dikyRegisteredUsers
 *   4. Hapus token (sekali pakai)
 *   5. Tampilkan tombol "Masuk Sekarang" -> login.html
 */
(function (window, document) {
  'use strict';

  var KUNCI_TOKEN = 'dikyResetTokens';
  var KUNCI_USERS = 'dikyRegisteredUsers';
  var MIN_PANJANG = 6;

  var tokenAktif = null;   // objek token yang valid
  var emailAktif = '';

  function el(id) { return document.getElementById(id); }

  function tampil(id) {
    ['reset-loading', 'reset-invalid', 'reset-form-wrap', 'reset-success'].forEach(function (k) {
      var node = el(k);
      if (node) node.hidden = (k !== id);
    });
  }

  function pesan(teks, jenis) {
    var box = el('reset-message');
    if (!box) return;
    box.textContent = teks || '';
    box.className = 'reset-message' + (jenis ? ' is-' + jenis : '');
    box.hidden = !teks;
  }

  function bacaJSON(kunci, fallback) {
    try {
      var raw = localStorage.getItem(kunci);
      var data = raw ? JSON.parse(raw) : fallback;
      return data;
    } catch (e) { return fallback; }
  }

  function tulisJSON(kunci, nilai) {
    try {
      localStorage.setItem(kunci, JSON.stringify(nilai));
      return true;
    } catch (e) { return false; }
  }

  function ambilParam(nama) {
    var hasil = new URLSearchParams(window.location.search).get(nama);
    return hasil ? String(hasil) : '';
  }

  /* ---------------- Validasi token ---------------- */
  /**
   * Halaman ini HANYA boleh diakses melalui tautan resmi yang dihasilkan
   * oleh tombol "Kirim Tautan Reset" di login.html.
   *
   * Penjaga berlapis:
   *   1) Harus ada parameter token di URL.
   *   2) Token harus terdaftar pada simpanan token (dibuat login.html).
   *   3) Token belum kedaluwarsa.
   *   4) Akun pemilik token masih ada.
   *   5) Penanda sesi akses (sessionStorage) harus cocok — hanya diisi
   *      saat tautan dibuka dari alur sah. Menutup tab akan menghapusnya,
   *      sehingga URL yang disalin-pindah ke tab baru tetap ditolak.
   *
   * Token acak 32 heksadesimal tidak dapat ditebak, sehingga mengubah
   * URL secara asal tetap akan ditolak pada langkah 2.
   */
  function periksaToken() {
    var token = ambilParam('token');
    var emailParam = ambilParam('email');

    if (!token) {
      tampilInvalid('Halaman ini hanya dapat dibuka melalui tautan reset yang dikirim ke email Anda. Silakan klik tombol "Lupa Kata Sandi?" di halaman masuk.');
      return;
    }

    var daftar = bacaJSON(KUNCI_TOKEN, []);
    if (!Array.isArray(daftar)) daftar = [];

    var entry = daftar.find(function (t) { return t && String(t.token) === token; });

    if (!entry) {
      tampilInvalid('Tautan reset kata sandi tidak dikenali. Halaman ini hanya dapat dibuka dari tautan resmi yang dikirim ke email Anda.');
      return;
    }

    if (!entry.expiresAt || Date.now() > Number(entry.expiresAt)) {
      tampilInvalid('Tautan reset kata sandi sudah kedaluwarsa. Silakan minta tautan baru.');
      return;
    }

    // ================= PENJAGA AKSES =================
    // Halaman ini hanya boleh dibuka melalui:
    //   (a) tombol "Kirim Tautan Reset" di login.html (jalur demo), atau
    //   (b) tautan asli dari email (Email.js), yang bisa dibuka di tab
    //       atau bahkan perangkat lain.
    //
    // Token 32 heksadesimal acak tidak dapat ditebak. Token juga:
    //   - hanya dibuat di login.html setelah email TERDAFTAR ditemukan,
    //   - terikat pada satu akun (userId) dan satu email,
    //   - kedaluwarsa dalam 30 menit, dan
    //   - dihapus setelah dipakai sekali.
    //
    // Karena itu, mengubah URL secara asal TIDAK akan pernah cocok dengan
    // token yang tersimpan, sehingga halaman ditolak pada pemeriksaan di atas.
    //
    // Penanda sesi di bawah hanya menambah lapisan untuk membedakan
    // "dibuka dari alur sah" vs "URL diketik manual". Penanda ini TIDAK
    // boleh memblokir tautan email asli, jadi bila Email.js aktif dan
    // tautan berasal dari email, akses tetap dilanjutkan.
    var penanda = null;
    try { penanda = sessionStorage.getItem('dikyResetAccess'); } catch (e) { }

    var dariAlurSah = penanda && String(penanda) === String(token);
    var dariEmailAsli = !!(window.EmailService && typeof window.EmailService.aktif === 'function' && window.EmailService.aktif());

    if (!dariAlurSah && !dariEmailAsli) {
      tampilInvalid('Akses tidak sah. Halaman reset kata sandi hanya dapat dibuka melalui tombol "Kirim Tautan Reset" di halaman masuk, atau melalui tautan yang dikirim ke email Anda.');
      return;
    }

    // Pastikan akunnya masih ada
    var users = bacaJSON(KUNCI_USERS, []);
    var user = Array.isArray(users)
      ? users.find(function (u) { return u && String(u.id) === String(entry.userId); })
      : null;

    if (!user) {
      tampilInvalid('Akun untuk tautan ini tidak ditemukan. Silakan daftar ulang atau hubungi admin.');
      return;
    }

    tokenAktif = entry;
    emailAktif = emailParam || entry.email || user.emailAddress || '';

    var target = el('reset-email-target');
    if (target) target.textContent = emailAktif || '-';

    tampil('reset-form-wrap');
  }

  function tampilInvalid(teks) {
    var box = el('reset-invalid-message');
    if (box && teks) box.textContent = teks;
    tampil('reset-invalid');
  }

  /* ---------------- Kekuatan kata sandi ---------------- */
  function nilaiKekuatan(pw) {
    var skor = 0;
    if (pw.length >= 6) skor += 1;
    if (pw.length >= 10) skor += 1;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) skor += 1;
    if (/[0-9]/.test(pw)) skor += 1;
    if (/[^A-Za-z0-9]/.test(pw)) skor += 1;
    return Math.min(skor, 4);
  }

  function perbaruiKekuatan() {
    var input = el('reset-new-password');
    var wrap = el('reset-strength');
    var fill = el('reset-strength-fill');
    var teks = el('reset-strength-text');
    if (!input || !wrap || !fill || !teks) return;

    var pw = input.value || '';
    if (!pw) { wrap.hidden = true; return; }
    wrap.hidden = false;

    var skor = nilaiKekuatan(pw);
    var labels = ['Sangat lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];
    var warna = ['#c0392b', '#d97b26', '#d9a11c', '#3b8f58', '#1b6b3f'];

    fill.style.width = ((skor + 1) / 5 * 100) + '%';
    fill.style.background = warna[skor];
    teks.textContent = labels[skor];
    teks.style.color = warna[skor];
  }

  /* ---------------- Simpan kata sandi baru ---------------- */
  async function simpanSandi(event) {
    if (event) event.preventDefault();

    if (!tokenAktif) {
      tampilInvalid('Sesi reset tidak valid. Silakan minta tautan baru.');
      return;
    }

    var pw1 = (el('reset-new-password') || {}).value || '';
    var pw2 = (el('reset-confirm-password') || {}).value || '';
    var tombol = el('reset-submit');

    if (pw1.length < MIN_PANJANG) {
      pesan('Kata sandi minimal ' + MIN_PANJANG + ' karakter.', 'error');
      return;
    }

    if (pw1 !== pw2) {
      pesan('Konfirmasi kata sandi tidak cocok.', 'error');
      return;
    }

    if (tombol) { tombol.disabled = true; tombol.textContent = 'Menyimpan...'; }
    pesan('Menyimpan kata sandi baru…', 'info');

    // Hash kata sandi
    var hash = null;
    if (window.AuthUtil && typeof window.AuthUtil.hashPassword === 'function') {
      hash = await window.AuthUtil.hashPassword(pw1);
    }

    if (!hash) {
      if (tombol) { tombol.disabled = false; tombol.textContent = 'Simpan Kata Sandi Baru'; }
      pesan('Kata sandi tidak dapat diproses. Pastikan browser mendukung Web Crypto.', 'error');
      return;
    }

    var users = bacaJSON(KUNCI_USERS, []);
    if (!Array.isArray(users)) users = [];

    var idx = users.findIndex(function (u) {
      return u && String(u.id) === String(tokenAktif.userId);
    });

    if (idx < 0) {
      if (tombol) { tombol.disabled = false; tombol.textContent = 'Simpan Kata Sandi Baru'; }
      pesan('Akun tidak ditemukan. Silakan daftar ulang.', 'error');
      return;
    }

    users[idx].password = hash;
    users[idx].passwordUpdatedAt = new Date().toISOString();

    if (!tulisJSON(KUNCI_USERS, users)) {
      if (tombol) { tombol.disabled = false; tombol.textContent = 'Simpan Kata Sandi Baru'; }
      pesan('Gagal menyimpan karena penyimpanan browser penuh. Kosongkan sebagian ruang lalu coba lagi.', 'error');
      return;
    }

    // Token sekali pakai: hapus setelah dipakai
    var daftarToken = bacaJSON(KUNCI_TOKEN, []);
    if (Array.isArray(daftarToken)) {
      var sisa = daftarToken.filter(function (t) { return t && String(t.token) !== String(tokenAktif.token); });
      tulisJSON(KUNCI_TOKEN, sisa);
    }

    // Bersihkan penanda akses agar tautan ini tidak bisa dipakai ulang
    try { sessionStorage.removeItem('dikyResetAccess'); } catch (e) { }

    tampil('reset-success');
    var btnLogin = el('reset-go-login');
    if (btnLogin) {
      btnLogin.href = 'login.html?reset=sukses&email=' + encodeURIComponent(emailAktif);
    }
  }

  /* ---------------- Toggle lihat sandi ---------------- */
  function pasangToggle() {
    document.querySelectorAll('.reset-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = el(btn.getAttribute('data-target'));
        if (!target) return;
        var lihat = target.type === 'password';
        target.type = lihat ? 'text' : 'password';
        btn.textContent = lihat ? '🙈' : '👁';
        btn.setAttribute('aria-label', lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
      });
    });
  }

  function init() {
    pasangToggle();

    var form = el('reset-form');
    if (form) form.addEventListener('submit', simpanSandi);

    var pwInput = el('reset-new-password');
    if (pwInput) pwInput.addEventListener('input', perbaruiKekuatan);

    // Sedikit jeda agar status "memeriksa" terlihat wajar
    setTimeout(periksaToken, 220);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window, document));
