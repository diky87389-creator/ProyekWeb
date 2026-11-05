'use strict';
/**
 * ============================================================
 * ROUTER API PEMBAYARAN — Warung Sayur Diky
 * ============================================================
 * Modul ini dipasang di server.js dengan 4 baris:
 *
 *   const paymentApi = require('./payment-api');
 *   app.use(express.json({ limit: '256kb' }));
 *   app.use('/api', paymentApi);
 *
 * (pasang SEBELUM handler 404)
 *
 * Server Key HANYA dibaca di server via midtrans.js.
 */
const express = require('express');
const midtrans = require('./midtrans');

const router = express.Router();

function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => ({
    id: it && it.id,
    name: it && it.name,
    price: Number(it && it.price) || 0,
    qty: Number(it && (it.qty || it.quantity)) || 0
  }));
}

function makeOrderId(prefix) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prefix + '-' + stamp + '-' + rand;
}

/* ---------- Konfigurasi publik (Client Key aman diekspos) ---------- */
router.get('/payment/config', (req, res) => {
  res.json(midtrans.publicConfig());
});

/* ---------- Buat transaksi Snap untuk pesanan checkout ---------- */
router.post('/payment/create', async (req, res) => {
  try {
    const body = req.body || {};
    const items = normalizeItems(body.items);
    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'Daftar item kosong.' });
    }

    const clientOrderId = body.orderId ? String(body.orderId) : makeOrderId('ORD');
    const midtransOrderId = 'WS-' + clientOrderId + '-' + Date.now();

    const result = await midtrans.createSnapTransaction({
      orderId: midtransOrderId,
      items: items,
      customer: body.customer || {},
      enabledPayments: body.enabledPayments,
      finishUrl: body.finishUrl
    });

    midtrans.saveTransaction(clientOrderId, {
      orderId: clientOrderId,
      midtransOrderId: midtransOrderId,
      snapToken: result.token,
      grossAmount: result.grossAmount,
      status: 'pending',
      method: body.method || null,
      demo: !!result.demo,
      createdAt: new Date().toISOString()
    });

    return res.json({
      ok: true,
      orderId: clientOrderId,
      midtransOrderId: midtransOrderId,
      token: result.token,
      redirectUrl: result.redirectUrl,
      demo: !!result.demo,
      grossAmount: result.grossAmount
    });
  } catch (error) {
    console.error('[api/payment/create]', error.message);
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message });
  }
});

/* ---------- Buat transaksi Snap untuk pembayaran hutang ---------- */
router.post('/debt-payment/create', async (req, res) => {
  try {
    const body = req.body || {};
    const items = normalizeItems(body.items);
    if (!items.length) {
      return res.status(400).json({ ok: false, message: 'Tidak ada item hutang yang dipilih.' });
    }

    const referenceId = body.referenceId ? String(body.referenceId) : makeOrderId('HUT');
    const midtransOrderId = 'WS-' + referenceId + '-' + Date.now();

    const result = await midtrans.createSnapTransaction({
      orderId: midtransOrderId,
      items: items,
      customer: body.customer || {},
      enabledPayments: ['other_qris', 'bank_transfer'],
      finishUrl: body.finishUrl
    });

    midtrans.saveTransaction(referenceId, {
      orderId: referenceId,
      midtransOrderId: midtransOrderId,
      snapToken: result.token,
      grossAmount: result.grossAmount,
      status: 'pending',
      type: 'debt',
      debtIds: Array.isArray(body.debtIds) ? body.debtIds : [],
      demo: !!result.demo,
      createdAt: new Date().toISOString()
    });

    return res.json({
      ok: true,
      referenceId: referenceId,
      midtransOrderId: midtransOrderId,
      token: result.token,
      redirectUrl: result.redirectUrl,
      demo: !!result.demo,
      grossAmount: result.grossAmount
    });
  } catch (error) {
    console.error('[api/debt-payment/create]', error.message);
    return res.status(error.statusCode || 500).json({ ok: false, message: error.message });
  }
});

/* ---------- Webhook notifikasi Midtrans ---------- */
router.post('/payment/notification', (req, res) => {
  const body = req.body || {};

  if (!midtrans.verifyNotificationSignature(body)) {
    console.warn('[webhook] signature tidak valid untuk order', body.order_id);
    return res.status(401).json({ ok: false, message: 'Signature tidak valid.' });
  }

  const internalStatus = midtrans.mapMidtransStatus(body.transaction_status, body.fraud_status);
  const orderId = String(body.order_id || '');

  midtrans.saveTransaction(orderId, {
    midtransOrderId: orderId,
    transactionStatus: body.transaction_status || null,
    fraudStatus: body.fraud_status || null,
    paymentType: body.payment_type || null,
    status: internalStatus,
    paidAt: internalStatus === 'paid' ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString()
  });

  console.log('[webhook]', orderId, '->', internalStatus);
  return res.json({ ok: true, status: internalStatus });
});

/* ---------- Polling status ---------- */
router.get('/payment/status/:orderId', (req, res) => {
  const record = midtrans.getTransaction(String(req.params.orderId));
  if (!record) {
    return res.status(404).json({ ok: false, message: 'Transaksi tidak ditemukan.' });
  }
  return res.json({ ok: true, record });
});

module.exports = router;
