/**
 * ============================================================
 * OTP VERIFIKASI PENDAFTARAN — daftar.html
 * ============================================================
 * Dipakai setelah form Daftar Akun lolos validasi.
 * Data akun BELUM disimpan sampai OTP terverifikasi.
 *
 * Aturan:
 *   - 6 digit
 *   - berlaku 5 menit
 *   - maksimal 5 percobaan
 *   - kirim ulang boleh setelah 30 detik
 *   - disimpan di sessionStorage (hilang saat tab ditutup)
 */
(function (window, document) {
  'use strict';

  var KUNCI = 'dikyOtpPendaftaran';
  var MASA_BERLAKU_MS = 5 * 60 * 1000;
  var COOLDOWN_KIRIM_ULANG_MS = 30 * 1000;
  var MAKS_PERCOBAAN = 5;
  var PANJANG = 6;

  var state = null;       // { email, kode, kedaluwarsa, percobaan, dibuatPada }
  var timerInterval = null;
  var onSukses = null;    // callback setelah verifikasi berhasil

  /* ---------------- DOM helper ---------------- */
  function el(id) { return document.getElementById(id); }

  function tampilkanPesan(teks, jenis) {
    var box = el('otp-message');
    if (!box) return;
    box.textContent = teks || '';
    box.className = 'otp-message' + (jenis ? ' is-' + jenis : '');
    box.hidden = !teks;
  }

  /* ---------------- Penyimpanan ---------------- */
  function simpan() {
    try {
      if (state) sessionStorage.setItem(KUNCI, JSON.stringify(state));
      else sessionStorage.removeItem(KUNCI);
    } catch (e) { }
  }

  function muat() {
    try {
      var raw = sessionStorage.getItem(KUNCI);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function hapus() {
    state = null;
    try { sessionStorage.removeItem(KUNCI); } catch (e) { }
  }

  /* ---------------- Kotak input OTP ---------------- */
  function ambilKode() {
    var hasil = '';
    for (var i = 0; i < PANJANG; i += 1) {
      var kotak = el('otp-digit-' + i);
      hasil += kotak ? (kotak.value || '').replace(/[^0-9]/g, '') : '';
    }
    return hasil;
  }

  function isiKotak(kode) {
    var teks = String(kode || '');
    for (var i = 0; i < PANJANG; i += 1) {
      var kotak = el('otp-digit-' + i);
      if (kotak) kotak.value = teks.charAt(i) || '';
    }
  }

  function kosongkanKotak() {
    isiKotak('');
    var pertama = el('otp-digit-0');
    if (pertama) pertama.focus();
  }

  function pasangKotak() {
    for (var i = 0; i < PANJANG; i += 1) {
      (function (idx) {
        var kotak = el('otp-digit-' + idx);
        if (!kotak) return;

        kotak.addEventListener('input', function () {
          var nilai = String(kotak.value || '').replace(/[^0-9]/g, '');

          // Dukungan paste beberapa digit sekaligus
          if (nilai.length > 1) {
            for (var j = 0; j < nilai.length && idx + j < PANJANG; j += 1) {
              var target = el('otp-digit-' + (idx + j));
              if (target) target.value = nilai.charAt(j);
            }
            var nextAfterPaste = el('otp-digit-' + Math.min(idx + nilai.length, PANJANG - 1));
            if (nextAfterPaste) nextAfterPaste.focus();
            return;
          }

          kotak.value = nilai;
          if (nilai && idx < PANJANG - 1) {
            var next = el('otp-digit-' + (idx + 1));
            if (next) next.focus();
          }
        });

        kotak.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !kotak.value && idx > 0) {
            var prev = el('otp-digit-' + (idx - 1));
            if (prev) { prev.focus(); prev.value = ''; }
            e.preventDefault();
          }
          if (e.key === 'ArrowLeft' && idx > 0) {
            var p = el('otp-digit-' + (idx - 1));
            if (p) p.focus();
          }
          if (e.key === 'ArrowRight' && idx < PANJANG - 1) {
            var n = el('otp-digit-' + (idx + 1));
            if (n) n.focus();
          }
          if (e.key === 'Enter') { verifikasi(); }
        });
      }(i));
    }
  }

  /* ---------------- Hitung mundur ---------------- */
  function hentikanTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function perbaruiTimer() {
    var teks = el('otp-timer');
    var tombolKirimUlang = el('otp-resend');

    if (!state) {
      if (teks) teks.textContent = '';
      if (tombolKirimUlang) tombolKirimUlang.disabled = true;
      return;
    }

    var sekarang = Date.now();

    // Sisa waktu kode
    var sisa = Math.max(0, state.kedaluwarsa - sekarang);
    var menit = Math.floor(sisa / 60000);
    var detik = Math.floor((sisa % 60000) / 1000);
    if (teks) {
      teks.textContent = sisa > 0
        ? 'Kode berlaku ' + menit + ':' + String(detik).padStart(2, '0')
        : 'Kode sudah kedaluwarsa';
      teks.className = 'otp-timer' + (sisa > 0 ? '' : ' is-expired');
    }

    // Cooldown kirim ulang
    if (tombolKirimUlang) {
      var sisaCooldown = Math.max(0, (state.dibuatPada + COOLDOWN_KIRIM_ULANG_MS) - sekarang);
      tombolKirimUlang.disabled = sisaCooldown > 0;
      tombolKirimUlang.textContent = sisaCooldown > 0
        ? 'Kirim ulang (' + Math.ceil(sisaCooldown / 1000) + 's)'
        : 'Kirim ulang kode';
    }
  }

  function mulaiTimer() {
    hentikanTimer();
    perbaruiTimer();
    timerInterval = setInterval(perbaruiTimer, 1000);
  }

  /* ---------------- Tampilkan / sembunyikan modal ---------------- */
  function bukaModal() {
    var modal = el('otp-modal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(function () { var f = el('otp-digit-0'); if (f) f.focus(); }, 60);
  }

  function tutupModal() {
    var modal = el('otp-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
    hentikanTimer();
  }

  function tampilkanEmail() {
    var target = el('otp-email-target');
    if (target && state) target.textContent = state.email;
  }

  function tampilkanDemo(kode) {
    var box = el('otp-demo-box');
    var nilai = el('otp-demo-code');
    if (!box) return;
    if (kode) {
      box.hidden = false;
      if (nilai) nilai.textContent = kode;
    } else {
      box.hidden = true;
      if (nilai) nilai.textContent = '';
    }
  }

  /* ---------------- Kirim OTP ---------------- */
  function kirimOtp(email, nama) {
    var kode = (window.AuthUtil && window.AuthUtil.buatOTP)
      ? window.AuthUtil.buatOTP(PANJANG)
      : String(Math.floor(100000 + Math.random() * 900000));

    state = {
      email: String(email || ''),
      kode: kode,
      kedaluwarsa: Date.now() + MASA_BERLAKU_MS,
      percobaan: 0,
      dibuatPada: Date.now()
    };
    simpan();

    tampilkanPesan('Mengirim kode verifikasi...', 'info');

    var pengirim = window.EmailService
      ? window.EmailService.kirimOTP(state.email, kode, nama)
      : Promise.resolve({ ok: true, demo: true, kode: kode });

    return pengirim.then(function (hasil) {
      if (!hasil || !hasil.ok) {
        tampilkanPesan((hasil && hasil.pesan) || 'Kode gagal dikirim.', 'error');
        return false;
      }

      if (hasil.demo) {
        tampilkanDemo(state.kode);
        tampilkanPesan('Mode demo: kode ditampilkan di layar. Di produksi kode dikirim ke email.', 'info');
      } else {
        tampilkanDemo(null);
        tampilkanPesan('Kode verifikasi telah dikirim ke email Anda.', 'info');
      }
      return true;
    });
  }

  /* ---------------- Verifikasi ---------------- */
  function verifikasi() {
    if (!state) {
      tampilkanPesan('Sesi verifikasi tidak ditemukan. Silakan daftar ulang.', 'error');
      return;
    }

    var kode = ambilKode();

    if (kode.length !== PANJANG) {
      tampilkanPesan('Masukkan ' + PANJANG + ' angka kode verifikasi.', 'error');
      return;
    }

    if (Date.now() > state.kedaluwarsa) {
      tampilkanPesan('Kode sudah kedaluwarsa. Klik "Kirim ulang kode".', 'error');
      return;
    }

    if (kode !== state.kode) {
      state.percobaan = (state.percobaan || 0) + 1;
      simpan();

      var sisa = MAKS_PERCOBAAN - state.percobaan;
      if (sisa <= 0) {
        hapus();
        tampilkanDemo(null);
        tampilkanPesan('Terlalu banyak percobaan. Silakan daftar ulang.', 'error');
        hentikanTimer();
        var btnVerif = el('otp-verify');
        if (btnVerif) btnVerif.disabled = true;
        return;
      }

      tampilkanPesan('Kode salah. Sisa ' + sisa + ' percobaan.', 'error');
      kosongkanKotak();
      return;
    }

    // ===== BERHASIL =====
    var emailTerverifikasi = state.email;
    hapus();
    hentikanTimer();
    tampilkanPesan('Verifikasi berhasil!', 'success');

    var tombol = el('otp-verify');
    if (tombol) { tombol.disabled = true; tombol.textContent = 'Berhasil ✓'; }

    if (typeof onSukses === 'function') {
      onSukses(emailTerverifikasi);
    }
  }

  /* ---------------- API publik ---------------- */
  /**
   * Mulai alur verifikasi.
   * @param {Object} opsi { email, nama, onVerified }
   */
  function mulai(opsi) {
    opsi = opsi || {};
    onSukses = opsi.onVerified || null;

    kosongkanKotak();
    tampilkanDemo(null);
    var btnVerif = el('otp-verify');
    if (btnVerif) { btnVerif.disabled = false; btnVerif.textContent = 'Verifikasi'; }

    kirimOtp(opsi.email, opsi.nama).then(function (ok) {
      if (!ok) return;
      tampilkanEmail();
      bukaModal();
      mulaiTimer();
    });
  }

  function kirimUlang() {
    if (!state) { tampilkanPesan('Sesi verifikasi tidak ada.', 'error'); return; }

    var sisa = (state.dibuatPada + COOLDOWN_KIRIM_ULANG_MS) - Date.now();
    if (sisa > 0) return;

    kosongkanKotak();
    kirimOtp(state.email).then(function (ok) {
      if (!ok) return;
      mulaiTimer();
    });
  }

  function batal() {
    hapus();
    hentikanTimer();
    tutupModal();
    tampilkanDemo(null);
    var btnVerif = el('otp-verify');
    if (btnVerif) { btnVerif.disabled = false; btnVerif.textContent = 'Verifikasi'; }
  }

  /* ---------------- Inisialisasi ---------------- */
  function init() {
    if (!el('otp-modal')) return;
    pasangKotak();

    var btnVerif = el('otp-verify');
    if (btnVerif) btnVerif.addEventListener('click', verifikasi);

    var btnResend = el('otp-resend');
    if (btnResend) btnResend.addEventListener('click', kirimUlang);

    var btnBatal = el('otp-cancel');
    if (btnBatal) btnBatal.addEventListener('click', batal);

    var btnTutup = el('otp-close');
    if (btnTutup) btnTutup.addEventListener('click', batal);

    // cegah submit form saat Enter di kotak OTP
    var formOtp = el('otp-form');
    if (formOtp) {
      formOtp.addEventListener('submit', function (e) { e.preventDefault(); verifikasi(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.OtpVerifikasi = {
    mulai: mulai,
    verifikasi: verifikasi,
    kirimUlang: kirimUlang,
    batal: batal,
    PANJANG: PANJANG,
    MAKS_PERCOBAAN: MAKS_PERCOBAAN,
    MASA_BERLAKU_MS: MASA_BERLAKU_MS,
    COOLDOWN_KIRIM_ULANG_MS: COOLDOWN_KIRIM_ULANG_MS
  };
}(window, document));
