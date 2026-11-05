/**
 * ============================================================
 * EMAIL SERVICE — Warung Sayur Diky
 * ============================================================
 * Lapisan abstraksi untuk pengiriman email (Email.js).
 *
 * SELAMA BELUM ADA AKUN EMAIL.JS:
 *   DEMO_MODE = true
 *   - OTP tidak dikirim lewat email, melainkan dikembalikan agar
 *     bisa ditampilkan di layar oleh pemanggil.
 *   - Link reset juga tidak dikirim, tautannya dikembalikan.
 *
 * SETELAH DAFTAR EMAIL.JS:
 *   1. Isi EMAILJS_CONFIG di bawah.
 *   2. Ubah DEMO_MODE menjadi false.
 *   3. Muat SDK Email.js di HTML:
 *      <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
 *
 * Tiga nilai yang diambil dari dashboard Email.js:
 *   - PUBLIC_KEY   (Account > General > API Keys > Public Key)
 *   - SERVICE_ID   (Email Services)
 *   - TEMPLATE_ID  (Email Templates)
 *     · TEMPLATE_OTP   -> template berisi {{otp_code}}
 *     · TEMPLATE_RESET -> template berisi {{reset_link}}
 */
(function (window) {
  'use strict';

  /* ============================================================
     KONFIGURASI — ISI SETELAH DAFTAR EMAIL.JS
     ============================================================ */
  var EMAILJS_CONFIG = {
    PUBLIC_KEY: 'GANTI_PUBLIC_KEY',
    SERVICE_ID: 'GANTI_SERVICE_ID',
    TEMPLATE_OTP: 'GANTI_TEMPLATE_OTP',
    TEMPLATE_RESET: 'GANTI_TEMPLATE_RESET'
  };

  // true = belum pakai Email.js (kode ditampilkan di layar)
  var DEMO_MODE = true;

  var initialized = false;

  function sudahDikonfigurasi() {
    return !!(EMAILJS_CONFIG.PUBLIC_KEY &&
      EMAILJS_CONFIG.PUBLIC_KEY.indexOf('GANTI_') === -1 &&
      EMAILJS_CONFIG.SERVICE_ID &&
      EMAILJS_CONFIG.SERVICE_ID.indexOf('GANTI_') === -1);
  }

  function aktif() {
    return !DEMO_MODE && sudahDikonfigurasi();
  }

  function ensureInit() {
    if (initialized || !aktif()) return true;
    if (!window.emailjs) return false;
    try {
      window.emailjs.init({ publicKey: EMAILJS_CONFIG.PUBLIC_KEY });
      initialized = true;
      return true;
    } catch (e) {
      console.error('[email-service] gagal inisialisasi', e);
      return false;
    }
  }

  /**
   * Kirim kode OTP pendaftaran.
   * @returns {Promise<{ok:boolean, demo:boolean, kode?:string, pesan?:string}>}
   */
  function kirimOTP(email, kode, namaUser) {
    if (!aktif()) {
      return Promise.resolve({
        ok: true,
        demo: true,
        kode: kode,
        pesan: 'Mode demo: kode ditampilkan di layar (Email.js belum aktif).'
      });
    }

    if (!ensureInit()) {
      return Promise.resolve({ ok: false, demo: false, pesan: 'Email.js belum siap. Muat ulang halaman.' });
    }

    return window.emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_OTP, {
      to_email: email,
      to_name: namaUser || 'Pelanggan',
      otp_code: kode,
      app_name: 'Warung Sayur Diky'
    }).then(function () {
      return { ok: true, demo: false, kode: null, pesan: 'Kode verifikasi telah dikirim ke email Anda.' };
    }).catch(function (err) {
      console.error('[email-service] kirim OTP gagal', err);
      return { ok: false, demo: false, pesan: 'Email verifikasi gagal dikirim. Coba lagi.' };
    });
  }

  /**
   * Kirim tautan reset kata sandi.
   * @returns {Promise<{ok:boolean, demo:boolean, tautan?:string, pesan?:string}>}
   */
  function kirimLinkReset(email, tautan, namaUser) {
    if (!aktif()) {
      return Promise.resolve({
        ok: true,
        demo: true,
        tautan: tautan,
        pesan: 'Mode demo: tautan ditampilkan di layar (Email.js belum aktif).'
      });
    }

    if (!ensureInit()) {
      return Promise.resolve({ ok: false, demo: false, pesan: 'Email.js belum siap. Muat ulang halaman.' });
    }

    return window.emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_RESET, {
      to_email: email,
      to_name: namaUser || 'Pelanggan',
      reset_link: tautan,
      app_name: 'Warung Sayur Diky'
    }).then(function () {
      return { ok: true, demo: false, tautan: null, pesan: 'Tautan reset telah dikirim ke email Anda.' };
    }).catch(function (err) {
      console.error('[email-service] kirim link reset gagal', err);
      return { ok: false, demo: false, pesan: 'Email reset gagal dikirim. Coba lagi.' };
    });
  }

  window.EmailService = {
    DEMO_MODE: DEMO_MODE,
    KONFIG: EMAILJS_CONFIG,
    aktif: aktif,
    sudahDikonfigurasi: sudahDikonfigurasi,
    kirimOTP: kirimOTP,
    kirimLinkReset: kirimLinkReset
  };
}(window));
