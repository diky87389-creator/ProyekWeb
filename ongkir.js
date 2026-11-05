/**
 * ============================================================
 * ONGKIR BERBASIS JARAK — Warung Sayur Diky
 * ============================================================
 * Menghitung ongkos kirim dari jarak antara titik WARUNG dan
 * titik ALAMAT PELANGGAN (koordinat dari peta Leaflet di daftar.html).
 *
 * Model tarif meniru pola aplikasi kurir (Gojek/GoSend):
 *   - Tarif minimum
 *   - Tarif per km berjenjang (makin jauh, per-km makin murah)
 *   - Biaya layanan flat
 *   - Faktor koreksi rute (jarak tempuh > garis lurus)
 *
 * Nilai tarif dapat diubah pada objek KONFIG di bawah ini.
 *
 * Dipakai oleh: checkout.js (sumber tunggal ongkir).
 * Halaman lain (success, orders, hutang, titip, admin-*) membaca
 * order.shippingCost sehingga otomatis ikut — tidak perlu diubah.
 */
(function (window) {
  'use strict';

  /* ============================================================
     KONFIGURASI — ubah di sini bila tarif berubah
     ============================================================ */
  var KONFIG = {
    // Titik lokasi Warung Sayur Diky (diperbarui otomatis bila GPS
    // kurir/warung pernah tersimpan).
    WARUNG: {
      latitude: -6.213975,
      longitude: 106.646969,
      label: 'Warung Sayur Diky'
    },

    // Tarif minimum yang selalu dikenakan
    TARIF_MINIMUM: 8000,

    // Tangga tarif per kilometer.
    // maxKm = batas atas rentang; tarifPerKm = harga per km di rentang itu.
    TANGGA: [
      { maxKm: 3, tarifPerKm: 2500 },
      { maxKm: 10, tarifPerKm: 2000 },
      { maxKm: Infinity, tarifPerKm: 1800 }
    ],

    // Biaya layanan flat (seperti biaya platform aplikasi kurir)
    BIAYA_LAYANAN: 1000,

    // Faktor koreksi rute: jarak tempuh ≈ 1,3 × jarak garis lurus.
    // Jalan berbelok, satu arah, dan lain-lain membuat rute lebih panjang.
    FAKTOR_RUTE: 1.3,

    // Batas radius layanan (km). Di atas ini perlu konfirmasi manual.
    MAX_RADIUS_KM: 25,

    // Ongkir bila koordinat pelanggan tidak diketahui.
    FALLBACK_TANPA_LOKASI: 10000,

    // Pengaman agar ongkir tidak meledak.
    BATAS_MAKSIMAL: 60000
  };

  /* ============================================================
     UTIL
     ============================================================ */
  function toNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function validCoord(lat, lon) {
    var a = toNumber(lat);
    var b = toNumber(lon);
    if (a === null || b === null) return null;
    if (a < -90 || a > 90 || b < -180 || b > 180) return null;
    // 0,0 hampir pasti bukan lokasi nyata di Indonesia
    if (a === 0 && b === 0) return null;
    return { latitude: a, longitude: b };
  }

  /** Jarak garis lurus antara dua koordinat (km) — rumus Haversine. */
  function jarakGarisLurus(lat1, lon1, lat2, lon2) {
    var R = 6371; // radius bumi (km)
    var toRad = Math.PI / 180;

    var dLat = (lat2 - lat1) * toRad;
    var dLon = (lon2 - lon1) * toRad;

    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /** Jarak tempuh perkiraan (km) = garis lurus × faktor rute. */
  function jarakTempuhKm(asal, tujuan) {
    var lurus = jarakGarisLurus(asal.latitude, asal.longitude, tujuan.latitude, tujuan.longitude);
    return lurus * KONFIG.FAKTOR_RUTE;
  }

  /* ============================================================
     TARIF BERTINGKAT
     ============================================================ */
  /**
   * Hitung ongkir dasar dari jarak (km), belum termasuk biaya layanan.
   * Menjumlahkan tarif per segmen km secara bertingkat.
   *
   * Contoh (jarak 5 km):
   *   0–3 km  → 3 × 2.500 = 7.500
   *   3–5 km  → 2 × 2.000 = 4.000
   *   total 11.500, lalu dibandingkan dengan tarif minimum 8.000.
   */
  function hitungOngkirDasar(km) {
    if (!(km > 0)) return KONFIG.TARIF_MINIMUM;

    var sisa = km;
    var batasBawah = 0;
    var total = 0;

    for (var i = 0; i < KONFIG.TANGGA.length; i += 1) {
      var seg = KONFIG.TANGGA[i];
      var batasAtas = Math.min(seg.maxKm, km);
      var panjang = batasAtas - batasBawah;

      if (panjang > 0) {
        total += panjang * seg.tarifPerKm;
        sisa -= panjang;
        batasBawah = batasAtas;
      }
      if (sisa <= 0) break;
    }

    // Bulatkan ke atas per Rp100 agar nominal selalu rapi (tidak ada sen).
    var dibulatkan = Math.ceil(total / 100) * 100;
    return Math.max(dibulatkan, KONFIG.TARIF_MINIMUM);
  }

  /* ============================================================
     HELPER KOORDINAT DARI DATA USER / ORDER
     ============================================================ */
  /**
   * Ambil koordinat pelanggan dari beberapa sumber (berurutan).
   * Menerima objek user, orderData, atau customer.
   */
  function ambilKoordinatUser() {
    var kandidat = [];

    for (var i = 0; i < arguments.length; i += 1) {
      kandidat.push(arguments[i]);
    }

    // Sertakan user aktif & profil terdaftar sebagai cadangan
    var userAktif = null;
    try {
      if (typeof window.getActiveUser === 'function') {
        userAktif = window.getActiveUser();
        kandidat.push(userAktif);
      }
    } catch (e) { }

    // Jaring pengaman: sesi lama bisa kehilangan koordinat (mis. login ulang
    // sebelum perbaikan). Bila begitu, ambil dari data akun terdaftar.
    if (userAktif && userAktif.id) {
      try {
        var users = JSON.parse(window.localStorage.getItem('dikyRegisteredUsers') || '[]');
        if (Array.isArray(users)) {
          var match = users.find(function (u) {
            return u && String(u.id) === String(userAktif.id);
          });
          if (match) kandidat.push(match);
        }
      } catch (e) { }
    }

    for (var j = 0; j < kandidat.length; j += 1) {
      var src = kandidat[j];
      if (!src || typeof src !== 'object') continue;

      // Kandidat bisa berupa {customer:{latitude,...}} atau {latitude,...}
      var calon = [
        src,
        src.customer,
        src.address,
        src.location
      ];

      for (var k = 0; k < calon.length; k += 1) {
        var c = calon[k];
        if (!c || typeof c !== 'object') continue;
        var found = validCoord(
          c.latitude != null ? c.latitude : c.lat,
          c.longitude != null ? c.longitude : c.lng != null ? c.lng : c.lon
        );
        if (found) return found;
      }
    }
    return null;
  }

  /* ============================================================
     API UTAMA
     ============================================================ */
  /**
   * Hitung ongkir lengkap.
   *
   * @param {Object} opsi
   *   - metodePengiriman : 'Diantar ke Rumah' | 'Ambil Sendiri ke Warung'
   *   - user / order     : objek sumber koordinat (opsional)
   *   - latitude, longitude : koordinat langsung (opsional)
   *
   * @returns {Object} {
   *   ongkir, subtotalOngkir, biayaLayanan, total,
   *   jarakKm, jarakTempuhKm, adaLokasi, melebihiRadius,
   *   perluKonfirmasi, peringatan, sumber
   * }
   */
  function hitung(opsi) {
    opsi = opsi || {};

    var metode = String(opsi.metodePengiriman || '').toLowerCase();
    var ambilSendiri = metode.indexOf('ambil') !== -1;

    // Ambil sendiri ke warung: tidak ada ongkir sama sekali.
    if (ambilSendiri) {
      return {
        ongkir: 0,
        subtotalOngkir: 0,
        biayaLayanan: 0,
        total: 0,
        jarakKm: 0,
        jarakTempuhKm: 0,
        adaLokasi: true,
        melebihiRadius: false,
        perluKonfirmasi: false,
        peringatan: null,
        sumber: 'ambil-sendiri'
      };
    }

    // Tentukan koordinat pelanggan
    var koordinat = null;
    if (opsi.latitude != null && opsi.longitude != null) {
      koordinat = validCoord(opsi.latitude, opsi.longitude);
    }
    if (!koordinat) {
      koordinat = ambilKoordinatUser(opsi.user, opsi.order, opsi.customer);
    }

    // --- Lokasi tidak diketahui: fallback tarif flat ---
    if (!koordinat) {
      return {
        ongkir: KONFIG.FALLBACK_TANPA_LOKASI,
        subtotalOngkir: KONFIG.FALLBACK_TANPA_LOKASI,
        biayaLayanan: KONFIG.BIAYA_LAYANAN,
        total: KONFIG.FALLBACK_TANPA_LOKASI + KONFIG.BIAYA_LAYANAN,
        jarakKm: null,
        jarakTempuhKm: null,
        adaLokasi: false,
        melebihiRadius: false,
        perluKonfirmasi: false,
        peringatan: 'Titik lokasi alamat Anda belum terdeteksi. Ongkir sementara memakai tarif flat Rp' +
          KONFIG.FALLBACK_TANPA_LOKASI.toLocaleString('id-ID') + '. Perbarui lokasi pada menu Profil agar ongkir dihitung sesuai jarak.',
        sumber: 'fallback'
      };
    }

    var lurus = jarakGarisLurus(
      KONFIG.WARUNG.latitude, KONFIG.WARUNG.longitude,
      koordinat.latitude, koordinat.longitude
    );
    var tempuh = lurus * KONFIG.FAKTOR_RUTE;
    var dasar = hitungOngkirDasar(tempuh);
    var melebihi = tempuh > KONFIG.MAX_RADIUS_KM;

    var total = Math.min(dasar + KONFIG.BIAYA_LAYANAN, KONFIG.BATAS_MAKSIMAL);
    total = Math.round(total);

    return {
      ongkir: total,
      subtotalOngkir: dasar,
      biayaLayanan: KONFIG.BIAYA_LAYANAN,
      total: total,
      jarakKm: lurus,
      jarakTempuhKm: tempuh,
      adaLokasi: true,
      melebihiRadius: melebihi,
      perluKonfirmasi: melebihi,
      peringatan: melebihi
        ? 'Jarak tempuh sekitar ' + tempuh.toFixed(1) + ' km, melebihi radius layanan ' +
          KONFIG.MAX_RADIUS_KM + ' km. Silakan konfirmasi ongkir tambahan via WhatsApp kepada admin.'
        : null,
      sumber: 'jarak',
      koordinatPelanggan: koordinat
    };
  }

  /** Format jarak untuk tampilan. */
  function formatJarak(km) {
    if (km == null || !Number.isFinite(Number(km))) return null;
    var n = Number(km);
    return (n < 10 ? n.toFixed(1) : Math.round(n).toString()).replace('.', ',') + ' km';
  }

  /** Ubah titik warung (dipakai bila admin memperbarui lokasi). */
  function setWarung(lat, lon, label) {
    var c = validCoord(lat, lon);
    if (!c) return false;
    KONFIG.WARUNG.latitude = c.latitude;
    KONFIG.WARUNG.longitude = c.longitude;
    if (label) KONFIG.WARUNG.label = label;
    return true;
  }

  window.Ongkir = {
    KONFIG: KONFIG,
    hitung: hitung,
    hitungOngkirDasar: hitungOngkirDasar,
    jarakGarisLurus: jarakGarisLurus,
    jarakTempuhKm: jarakTempuhKm,
    ambilKoordinatUser: ambilKoordinatUser,
    formatJarak: formatJarak,
    setWarung: setWarung
  };
}(window));
