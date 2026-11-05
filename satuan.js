/**
 * ============================================================
 * SATUAN & KUANTITAS — Warung Sayur Diky
 * ============================================================
 * Sumber tunggal untuk:
 *   - langkah stepper per satuan (kg/ons = 0,5 ; lainnya = 1)
 *   - batas minimum & maksimum (kustom, tidak terikat stok)
 *   - format tampilan pecahan (1/2, 1 1/2, 2 1/2)
 *   - perhitungan subtotal
 *
 * Dipakai di keranjang, checkout, success, orders, hutang,
 * dan seluruh panel admin agar tampilan selalu seragam.
 */
(function (window) {
  'use strict';

  /* ============================================================
     KONFIGURASI
     ============================================================ */
  var MAKS_BERAT = 50;   // kg
  var MAKS_ONS = 100;
  var MAKS_BULAT = 100;  // ikat/buah/papan/bungkus/lembar

  var ATURAN = {
    'per kg': {
      langkah: 0.5, minimum: 0.5, maksimum: MAKS_BERAT, pecahan: true,
      label: 'kg', chips: [0.5, 1, 1.5, 2, 3, 5]
    },
    'per ons': {
      langkah: 0.5, minimum: 0.5, maksimum: MAKS_ONS, pecahan: true,
      label: 'ons', chips: [0.5, 1, 1.5, 2, 3, 5]
    },
    'per ikat': {
      langkah: 1, minimum: 1, maksimum: MAKS_BULAT, pecahan: false,
      label: 'ikat', chips: [1, 2, 3, 5, 10]
    },
    'per buah / pcs': {
      langkah: 1, minimum: 1, maksimum: MAKS_BULAT, pecahan: false,
      label: 'buah', chips: [1, 2, 3, 5, 10]
    },
    'per papan': {
      langkah: 1, minimum: 1, maksimum: MAKS_BULAT, pecahan: false,
      label: 'papan', chips: [1, 2, 3, 5, 10]
    },
    'per bungkus / per pack': {
      langkah: 1, minimum: 1, maksimum: MAKS_BULAT, pecahan: false,
      label: 'bungkus', chips: [1, 2, 3, 5, 10]
    },
    'per lembar': {
      langkah: 1, minimum: 1, maksimum: MAKS_BULAT, pecahan: false,
      label: 'lembar', chips: [1, 2, 3, 5, 10]
    }
  };

  var DEFAULT = {
    langkah: 1, minimum: 1, maksimum: MAKS_BULAT, pecahan: false,
    label: '', chips: [1, 2, 3, 5, 10]
  };

  /* ============================================================
     NORMALISASI NAMA SATUAN
     ============================================================ */
  function normalisasi(nama) {
    var s = String(nama == null ? '' : nama).trim().toLowerCase();
    if (!s) return '';

    // Rapikan spasi dan pemisah: "perbuah/pcs" -> "per buah / pcs"
    s = s.split('/').join(' / ');
    var bagian = s.split(/\s+/).filter(Boolean);
    s = bagian.join(' ');

    if (s === 'kg' || s === 'kilogram') return 'per kg';
    if (s === 'ons') return 'per ons';
    if (s === 'ikat') return 'per ikat';
    if (s === 'buah' || s === 'pcs' || s === 'buah / pcs') return 'per buah / pcs';
    if (s === 'perbuah / pcs' || s === 'per buah/ pcs') return 'per buah / pcs';
    if (s === 'papan') return 'per papan';
    if (s === 'lembar') return 'per lembar';
    if (s === 'bungkus' || s === 'pack' || s === 'bungkus / pack') return 'per bungkus / per pack';
    if (s === 'per bungkus / pack') return 'per bungkus / per pack';

    return s;
  }

  function aturan(namaSatuan) {
    return ATURAN[normalisasi(namaSatuan)] || DEFAULT;
  }

  function bolehPecahan(namaSatuan) { return aturan(namaSatuan).pecahan === true; }
  function langkah(namaSatuan) { return aturan(namaSatuan).langkah; }
  function minimum(namaSatuan) { return aturan(namaSatuan).minimum; }
  function maksimum(namaSatuan) { return aturan(namaSatuan).maksimum; }
  function chips(namaSatuan) { return aturan(namaSatuan).chips.slice(); }

  function label(namaSatuan) {
    var a = aturan(namaSatuan);
    if (a.label) return a.label;
    return String(namaSatuan || '').replace('per ', '').trim();
  }

  /* ============================================================
     FORMAT PECAHAN
     ============================================================ */
  var SETENGAH = '\u00BD'; // ½
  var SEPEREMPAT = '\u00BC';
  var TIGA_PEREMPAT = '\u00BE';

  function rapikan(nilai, namaSatuan) {
    var n = Number(nilai);
    if (!Number.isFinite(n)) return minimum(namaSatuan);
    var l = langkah(namaSatuan);
    return Math.round(n / l) * l;
  }

  function angkaKeTeks(nilai) {
    var n = Number(nilai);
    if (!Number.isFinite(n)) return '0';

    var bulat = Math.floor(n + 1e-9);
    var sisa = n - bulat;

    if (Math.abs(sisa) < 1e-9) return String(bulat);
    if (Math.abs(sisa - 0.5) < 1e-9) return bulat > 0 ? bulat + SETENGAH : SETENGAH;
    if (Math.abs(sisa - 0.25) < 1e-9) return (bulat > 0 ? String(bulat) : '') + SEPEREMPAT;
    if (Math.abs(sisa - 0.75) < 1e-9) return (bulat > 0 ? String(bulat) : '') + TIGA_PEREMPAT;

    return String(n).replace(/\.0+$/, '');
  }

  /** format(1.5, 'per kg') -> "1½ kg" */
  function format(kuantitas, namaSatuan) {
    var n = Number(kuantitas);
    if (!Number.isFinite(n) || n < 0) n = 0;
    var teks = angkaKeTeks(n);
    var lab = label(namaSatuan);
    if (!lab) return teks;
    return teks + String.fromCharCode(32) + lab;
  }

  function formatAngka(kuantitas) {
    var n = Number(kuantitas);
    if (!Number.isFinite(n) || n < 0) n = 0;
    return angkaKeTeks(n);
  }

  /* ============================================================
     BATAS & LANGKAH
     ============================================================ */
  function sesuaikan(kuantitas, namaSatuan) {
    var a = aturan(namaSatuan);
    var n = Number(kuantitas);
    if (!Number.isFinite(n)) n = a.minimum;

    n = Math.round(n / a.langkah) * a.langkah;
    if (n < a.minimum) n = a.minimum;
    if (n > a.maksimum) n = a.maksimum;

    return Math.round(n * 100) / 100;
  }

  function geser(kuantitas, arah, namaSatuan) {
    var a = aturan(namaSatuan);
    var n = Number(kuantitas);
    if (!Number.isFinite(n)) n = a.minimum;
    return sesuaikan(n + (arah >= 0 ? a.langkah : -a.langkah), namaSatuan);
  }

  function bisaTambah(kuantitas, namaSatuan) {
    return Number(kuantitas) + langkah(namaSatuan) <= maksimum(namaSatuan) + 1e-9;
  }

  function bisaKurang(kuantitas, namaSatuan) {
    return Number(kuantitas) - langkah(namaSatuan) >= minimum(namaSatuan) - 1e-9;
  }

  function subtotal(harga, kuantitas) {
    var p = Number(harga);
    var q = Number(kuantitas);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return 0;
    return Math.round(p * q);
  }

  window.Satuan = {
    ATURAN: ATURAN,
    normalisasi: normalisasi,
    aturan: aturan,
    bolehPecahan: bolehPecahan,
    langkah: langkah,
    minimum: minimum,
    maksimum: maksimum,
    chips: chips,
    label: label,
    rapikan: rapikan,
    sesuaikan: sesuaikan,
    geser: geser,
    bisaTambah: bisaTambah,
    bisaKurang: bisaKurang,
    format: format,
    formatAngka: formatAngka,
    subtotal: subtotal
  };
}(window));
