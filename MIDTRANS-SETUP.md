# 🔌 PEMASANGAN API MIDTRANS DI `server.js`

File `payment-api.js`, `midtrans.js`, `midtrans-client.js`, `checkout-midtrans.js`,
dan `hutang-midtrans.js` **sudah selesai dibuat**.

Ada **3 baris** yang perlu ditambahkan ke `server.js` agar API aktif.
(Tidak bisa saya tambahkan otomatis — tool edit gagal membaca file itu.)

---

## Tambahkan SEBELUM blok handler 404

Buka `server.js`, cari baris:

```js
app.use(express.static(rootDir, { extensions: ['html'] }));
```

Lalu tambahkan **tepat di bawahnya**:

```js
// ============================================================
// API PEMBAYARAN (Midtrans) — Server Key hanya di server
// ============================================================
const paymentApi = require('./payment-api');
app.use('/api', express.json({ limit: '256kb' }), paymentApi);
```

> ⚠️ **Wajib** diletakkan **sebelum** blok 404 agar API tidak tertangkap handler 404.

---

## Hasil akhir `server.js`

```js
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || process.env.DEV_PORT || 3000;
const rootDir = __dirname;
const notFoundPage = path.join(rootDir, '404.html');

app.use(express.static(rootDir, { extensions: ['html'] }));

// ===== TAMBAHAN BARU =====
const paymentApi = require('./payment-api');
app.use('/api', express.json({ limit: '256kb' }), paymentApi);
// =========================

app.use((req, res, next) => {
  // ... handler 404 yang sudah ada ...
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Unknown routes will be redirected to 404.html');
});
```

---

## Aktifkan Konfigurasi

```powershell
Copy-Item .env.example .env
```

Lalu isi `.env` setelah Anda punya kunci Midtrans:

```
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
MIDTRANS_MERCHANT_ID=G123456789
MIDTRANS_IS_PRODUCTION=false
```

> Selama nilai masih `GANTI_DENGAN_SERVER_KEY`, sistem berjalan dalam
> **MODE DEMO**: transaksi tidak dikirim ke Midtrans, tetapi seluruh alur
> UI (pilih item → total → konfirmasi → struk) tetap bisa diuji.

---

## Endpoint yang Tersedia

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/payment/config` | Client Key & konfigurasi publik |
| `POST` | `/api/payment/create` | Token Snap untuk pesanan checkout |
| `POST` | `/api/debt-payment/create` | Token Snap untuk bayar hutang |
| `POST` | `/api/payment/notification` | **Webhook** dari dashboard Midtrans |
| `GET` | `/api/payment/status/:orderId` | Cek status transaksi |

---

## Webhook (setelah server online)

1. Jalankan server: `npm start`
2. Ekspos ke internet (untuk uji lokal):
   ```powershell
   npx ngrok http 3000
   ```
3. Salin URL `https://xxxx.ngrok-free.app`
4. Buka [Dashboard Midtrans](https://dashboard.midtrans.com) →
   **Settings → Configuration**
5. Isi **Payment Notification URL**:
   ```
   https://xxxx.ngrok-free.app/api/payment/notification
   ```
6. Simpan.

---

## Cek Status

```powershell
npm start
# lalu buka
# http://localhost:3000/api/payment/config
```

Bila muncul `"demoMode": true` → kunci belum diisi (normal).
Bila muncul `"demoMode": false` dan `"clientKey": "SB-Mid-client-..."` → siap.

---

## File yang Dibuat

| File | Fungsi |
|---|---|
| `midtrans.js` | Helper Snap API + verifikasi signature + penyimpanan transaksi |
| `payment-api.js` | Router Express berisi 5 endpoint |
| `midtrans-client.js` | Pembungkus Snap untuk browser |
| `checkout-midtrans.js` | Bridge checkout: QRIS & Transfer → Midtrans |
| `hutang-midtrans.js` | Bridge hutang: QRIS & Transfer → Midtrans |
| `.env.example` | Template konfigurasi |
| `MIDTRANS-SETUP.md` | Dokumen ini |

---

## Alur Akhir

### `checkout.html`

| Metode | Perlakuan |
|---|---|
| Tunai / Lunas Sekarang | `paymentStatus = 'menunggu_verifikasi'` → admin konfirmasi |
| QRIS | Midtrans Snap (`other_qris`) |
| Transfer Bank | Midtrans Snap (`bank_transfer`) |
| Hutang / Bayar Nanti | Alur lama — buat kasbon |

### `hutang.html` — Konfirmasi Pembayaran

| Metode | Perlakuan |
|---|---|
| Tunai | Catat `paymentRequest` → bayar di kasir |
| QRIS | Midtrans Snap (`other_qris`) |
| Transfer Bank | Midtrans Snap (`bank_transfer`) |

**Status akhir tetap di tangan admin** — sesuai aturan Anda:
kasbon baru menjadi **Lunas** setelah admin menekan "Tandai Lunas" di
`admin-hutang.html`.
