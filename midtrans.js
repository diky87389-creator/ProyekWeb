'use strict';
/**
 * ============================================================
 * MIDTRANS HELPER — Warung Sayur Diky
 * ============================================================
 * Berkas ini HANYA berjalan di server. Server Key TIDAK PERNAH
 * dikirim ke browser.
 *
 * Konfigurasi diambil dari environment variable (.env / sistem):
 *   MIDTRANS_SERVER_KEY     (wajib untuk transaksi)
 *   MIDTRANS_CLIENT_KEY     (untuk frontend, dikirim via /api/payment/config)
 *   MIDTRANS_IS_PRODUCTION  ('true' untuk produksi, selain itu sandbox)
 *   MIDTRANS_MERCHANT_ID    (opsional)
 *
 * Selama kunci belum diisi, mode DEMO aktif: transaksi tidak dikirim
 * ke Midtrans, melainkan menghasilkan token simulasi agar alur UI dapat
 * diuji tanpa akun.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SERVER_KEY = String(process.env.MIDTRANS_SERVER_KEY || '').trim();
const CLIENT_KEY = String(process.env.MIDTRANS_CLIENT_KEY || '').trim();
const MERCHANT_ID = String(process.env.MIDTRANS_MERCHANT_ID || '').trim();
const IS_PRODUCTION = String(process.env.MIDTRANS_IS_PRODUCTION || 'false').trim().toLowerCase() === 'true';

const SNAP_BASE = IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

const SNAP_SCRIPT = IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/snap.js'
  : 'https://app.sandbox.midtrans.com/snap/snap.js';

/** True bila Server Key belum diisi -> semua transaksi disimulasikan. */
function isDemoMode() {
  return !SERVER_KEY || SERVER_KEY.startsWith('SB-Mid-server-ISI') || SERVER_KEY === 'GANTI_DENGAN_SERVER_KEY';
}

function authHeader() {
  return 'Basic ' + Buffer.from(SERVER_KEY + ':').toString('base64');
}

/** Data yang boleh dikirim ke browser (tanpa Server Key). */
function publicConfig() {
  return {
    clientKey: CLIENT_KEY || '',
    merchantId: MERCHANT_ID || '',
    isProduction: IS_PRODUCTION,
    snapScriptUrl: SNAP_SCRIPT,
    demoMode: isDemoMode()
  };
}

/**
 * Bangun payload Snap. Nominal dihitung ULANG di server dari item
 * yang dikirim — jangan pernah percaya total dari browser.
 */
function buildSnapPayload(input) {
  const items = Array.isArray(input.items) ? input.items : [];

  const itemDetails = items
    .map((it) => {
      const price = Math.round(Number(it.price) || 0);
      const qty = Math.max(1, Math.floor(Number(it.qty || it.quantity) || 0));
      if (price <= 0 || qty <= 0) return null;
      return {
        id: String(it.id || 'ITEM').slice(0, 50),
        name: String(it.name || 'Produk').slice(0, 50),
        price: price,
        quantity: qty
      };
    })
    .filter(Boolean);

  const grossAmount = itemDetails.reduce((sum, it) => sum + it.price * it.quantity, 0);

  return {
    transaction_details: {
      order_id: String(input.orderId),
      gross_amount: grossAmount
    },
    item_details: itemDetails,
    customer_details: {
      first_name: String((input.customer && input.customer.name) || 'Pelanggan').slice(0, 50),
      phone: String((input.customer && input.customer.phone) || '').slice(0, 19),
      email: String((input.customer && input.customer.email) || '').slice(0, 50),
      billing_address: { address: String((input.customer && input.customer.address) || '').slice(0, 200) }
    },
    enabled_payments: input.enabledPayments || undefined,
    callbacks: {
      finish: input.finishUrl || undefined
    }
  };
}

/**
 * Buat transaksi Snap. Mengembalikan { token, redirectUrl, demo }.
 * Melempar error bila Midtrans menolak.
 */
async function createSnapTransaction(input) {
  const payload = buildSnapPayload(input);

  if (payload.transaction_details.gross_amount <= 0) {
    const err = new Error('Total pembayaran tidak valid.');
    err.statusCode = 400;
    throw err;
  }

  if (isDemoMode()) {
    return {
      demo: true,
      token: 'DEMO-' + payload.transaction_details.order_id,
      redirectUrl: null,
      grossAmount: payload.transaction_details.gross_amount
    };
  }

  const response = await fetch(SNAP_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader()
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { raw: text }; }

  if (!response.ok) {
    const err = new Error(
      (data && (data.error_messages && data.error_messages.join(', '))) ||
      (data && data.status_message) ||
      'Midtrans menolak transaksi.'
    );
    err.statusCode = response.status;
    err.detail = data;
    throw err;
  }

  return {
    demo: false,
    token: data.token,
    redirectUrl: data.redirect_url,
    grossAmount: payload.transaction_details.gross_amount
  };
}

/**
 * Verifikasi signature webhook Midtrans.
 * signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)
 */
function verifyNotificationSignature(body) {
  if (isDemoMode()) return true; // mode demo: tidak ada kunci
  const orderId = String(body.order_id || '');
  const statusCode = String(body.status_code || '');
  const grossAmount = String(body.gross_amount || '');
  const signature = String(body.signature_key || '');
  if (!orderId || !statusCode || !grossAmount || !signature) return false;

  const expected = crypto
    .createHash('sha512')
    .update(orderId + statusCode + grossAmount + SERVER_KEY)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- Penyimpanan transaksi sederhana ---------------- */
const DATA_DIR = path.join(__dirname, 'data');
const TX_FILE = path.join(DATA_DIR, 'transactions.json');

function readTransactions() {
  try {
    const raw = fs.readFileSync(TX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function writeTransactions(map) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TX_FILE, JSON.stringify(map, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[midtrans] gagal menyimpan transaksi:', e.message);
    return false;
  }
}

function saveTransaction(orderId, record) {
  const map = readTransactions();
  map[orderId] = Object.assign({}, map[orderId] || {}, record);
  writeTransactions(map);
  return map[orderId];
}

function getTransaction(orderId) {
  return readTransactions()[orderId] || null;
}

/** Terjemahkan transaction_status Midtrans ke status internal. */
function mapMidtransStatus(transactionStatus, fraudStatus) {
  const st = String(transactionStatus || '').toLowerCase();
  if (st === 'settlement') return 'paid';
  if (st === 'capture') return fraudStatus === 'challenge' ? 'pending' : 'paid';
  if (st === 'pending') return 'pending';
  if (st === 'deny' || st === 'cancel' || st === 'failure') return 'failed';
  if (st === 'expire') return 'expired';
  if (st === 'refund' || st === 'partial_refund') return 'refunded';
  return 'pending';
}

module.exports = {
  isDemoMode,
  publicConfig,
  createSnapTransaction,
  verifyNotificationSignature,
  saveTransaction,
  getTransaction,
  mapMidtransStatus,
  SNAP_SCRIPT
};
