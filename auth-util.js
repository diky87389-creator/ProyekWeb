/**
 * ============================================================
 * AUTH UTIL — Utilitas autentikasi Warung Sayur Diky
 * ============================================================
 * - Hashing kata sandi dengan SHA-256 (Web Crypto API)
 * - Pembuatan token acak untuk reset sandi
 * - Verifikasi kata sandi yang kompatibel dengan data lama
 *
 * CATATAN KEAMAN:
 * SHA-256 di sisi browser bukan pengganti backend. Ini hanya
 * mencegah kata sandi terbaca langsung di localStorage.
 * Untuk produksi, hashing harus dilakukan di server (bcrypt/argon2).
 */
(function (window) {
  'use strict';

  var PREFIX_HASH = 'sha256:';
  var PEPPER = 'warung-sayur-diky-v1';

  function adaSubtle() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest);
  }

  function hexDariBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /**
   * Hash kata sandi -> "sha256:<64 hex>".
   * Bila Web Crypto tidak tersedia (mis. http bukan https di browser lama),
   * kembalikan null agar pemanggil bisa memakai fallback.
   */
  function hashPassword(password) {
    var teks = String(password == null ? '' : password);
    if (!teks) return Promise.resolve(null);

    if (!adaSubtle()) return Promise.resolve(null);

    var encoder = new TextEncoder();
    var data = encoder.encode(PEPPER + teks + PEPPER);

    return window.crypto.subtle.digest('SHA-256', data)
      .then(function (buffer) { return PREFIX_HASH + hexDariBuffer(buffer); })
      .catch(function () { return null; });
  }

  /** Apakah nilai tersimpan sudah berupa hash? */
  function sudahHash(nilai) {
    return typeof nilai === 'string' && nilai.indexOf(PREFIX_HASH) === 0;
  }

  /**
   * Cek kata sandi terhadap nilai tersimpan.
   * Mendukung dua bentuk:
   *   - hash  : "sha256:..."
   *   - lama  : plain text (agar akun lama tetap bisa login)
   */
  function cocok(password, tersimpan) {
    var input = String(password == null ? '' : password);
    var stored = String(tersimpan == null ? '' : tersimpan);

    if (!sudahHash(stored)) {
      // Data lama (plain text): bandingkan langsung.
      return Promise.resolve(input === stored);
    }

    return hashPassword(input).then(function (hasil) {
      if (!hasil) return false;
      return hasil === stored;
    });
  }

  /** Token acak 32 karakter heksadesimal (UUID v4 tanpa tanda hubung). */
  function buatToken() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    // Set versi 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return hexDariBuffer(bytes.buffer);
  }

  /** Kode OTP numerik (default 6 digit). */
  function buatOTP(panjang) {
    var n = Number(panjang) || 6;
    var hasil = '';
    for (var i = 0; i < n; i += 1) {
      hasil += Math.floor(Math.random() * 10).toString();
    }
    // Pastikan tidak diawali 0 berulang sehingga terlihat selalu 6 digit
    if (hasil.charAt(0) === '0') {
      hasil = '1' + hasil.slice(1);
    }
    return hasil;
  }

  window.AuthUtil = {
    hashPassword: hashPassword,
    sudahHash: sudahHash,
    cocok: cocok,
    buatToken: buatToken,
    buatOTP: buatOTP,
    PREFIX_HASH: PREFIX_HASH
  };
}(window));
