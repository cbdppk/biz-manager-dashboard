const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { sendWhatsAppMessage } = require('../helpers/whatsapp');
const { createSale } = require('../services/sales');

const sendWhatsAppReply = sendWhatsAppMessage;

async function findProductForCommand({ businessId, productQuery }) {
  const term = String(productQuery || '').trim();
  if (!term) return null;

  const baseQuery = () => supabase
    .from('products')
    .select('id, name, selling_price')
    .eq('business_id', businessId);

  const nameResult = await baseQuery().ilike('name', `%${term}%`).limit(1);
  if (nameResult.error) throw nameResult.error;
  if (nameResult.data?.length) return nameResult.data[0];

  const skuResult = await baseQuery().ilike('sku', `%${term}%`).limit(1);
  if (skuResult.error) throw skuResult.error;
  return skuResult.data?.[0] || null;
}

function verifyWebhookSignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;

  if (!secret) {
    return process.env.NODE_ENV === 'production'
      ? { ok: false, status: 503, error: 'WhatsApp webhook signing secret is not configured.' }
      : { ok: true };
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !signature.startsWith('sha256=')) {
    return { ok: false, status: 401, error: 'Missing WhatsApp signature.' };
  }

  const body = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, status: 401, error: 'Invalid WhatsApp signature.' };
  }

  return { ok: true };
}

// ── GET /api/whatsapp/webhook — Meta verification ────────────────
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected) {
    return res.send(challenge);
  }
  res.sendStatus(403);
});

// ── POST /api/whatsapp/webhook — incoming messages ───────────────
router.post('/webhook', async (req, res) => {
  const signatureCheck = verifyWebhookSignature(req);
  if (!signatureCheck.ok) {
    return res.status(signatureCheck.status).json({ error: signatureCheck.error });
  }

  // Acknowledge immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const msg = change?.messages?.[0];

    if (!msg || msg.type !== 'text') return;

    const fromPhone = msg.from; // e.g. "233201234567"
    const text = msg.text.body.trim();

  // ── Look up cashier by phone ─────────────────────────────────
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, business_id')
      .eq('phone', fromPhone)
      .single();

    if (userErr || !user) {
      await sendWhatsAppReply(fromPhone, 'Your number is not registered on BizManager.');
      return;
    }

    const { id: cashierId, business_id: businessId } = user;
    const upper = text.toUpperCase();

    // ── SALE command ───────────────────────────────────────────
    if (upper.startsWith('SALE ') || /^S /i.test(text)) {
      const parts = text.trim().split(/\s+/);
      // parts: ["S"/"SALE", ...productParts, qty, price]
      if (parts.length < 4) {
        await sendWhatsAppReply(fromPhone, 'Format: SALE [product] [qty] [price]\nExample: S cowbell 5 4.50');
        return;
      }

      const price = parseFloat(parts[parts.length - 1]);
      const qty = parseInt(parts[parts.length - 2], 10);
      const productQuery = parts.slice(1, parts.length - 2).join(' ');

      if (isNaN(qty) || isNaN(price) || qty < 1 || price < 0) {
        await sendWhatsAppReply(fromPhone, 'Invalid qty or price. Format: SALE [product] [qty] [price]');
        return;
      }

      // Find product by name or SKU
      const product = await findProductForCommand({ businessId, productQuery });

      if (!product) {
        await sendWhatsAppReply(fromPhone, `Product "${productQuery}" not found.`);
        return;
      }

      const unitPrice = price || product.selling_price;

      try {
        const { saleId, total } = await createSale({
          supabase,
          businessId,
          userId: cashierId,
          items: [{
            product_id: product.id,
            qty,
            unit_price: unitPrice,
            discount: 0,
          }],
          paymentMethod: 'cash',
          amountPaid: qty * unitPrice,
          note: 'via WhatsApp',
        });

        const shortId = saleId.slice(-6).toUpperCase();
        await sendWhatsAppReply(
          fromPhone,
          `Sale recorded. GHS ${total.toFixed(2)}. Receipt: ${shortId}`
        );
      } catch (err) {
        if (err.code === 'INSUFFICIENT_STOCK') {
          await sendWhatsAppReply(fromPhone, 'Not enough stock for that sale.');
          return;
        }
        await sendWhatsAppReply(fromPhone, 'Failed to record sale. Try again.');
      }

    // ── STOCK / INV command ──────────────────────────────────────
    } else if (upper === 'STOCK' || upper === 'INV') {
      const { data: items, error: stockErr } = await supabase
        .from('products')
        .select('name, stock_qty, reorder_level')
        .eq('business_id', businessId)
        .order('stock_qty', { ascending: true })
        .limit(5);

      if (stockErr || !items?.length) {
        await sendWhatsAppReply(fromPhone, 'No stock data found.');
        return;
      }

      const lines = items.map(p =>
        `• ${p.name}: ${p.stock_qty} units${p.reorder_level && p.stock_qty <= p.reorder_level ? ' ⚠️ LOW' : ''}`
      );
      await sendWhatsAppReply(fromPhone, `Top 5 low stock:\n${lines.join('\n')}`);

    // ── TODAY / SUMMARY command ──────────────────────────────────
    } else if (upper === 'TODAY' || upper === 'SUMMARY') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: sales, error: salesErr } = await supabase
        .from('sales')
        .select('total_amount, amount_paid, balance')
        .eq('business_id', businessId)
        .gte('created_at', startOfDay.toISOString());

      if (salesErr) {
        await sendWhatsAppReply(fromPhone, 'Could not fetch today\'s summary.');
        return;
      }

      const total = sales.reduce((s, r) => s + r.total_amount, 0);
      const collected = sales.reduce((s, r) => s + r.amount_paid, 0);
      const credit = sales.reduce((s, r) => s + r.balance, 0);

      await sendWhatsAppReply(
        fromPhone,
        `Today's summary:\nSales: ${sales.length}\nTotal: GHS ${total.toFixed(2)}\nCollected: GHS ${collected.toFixed(2)}\nCredit: GHS ${credit.toFixed(2)}`
      );

    // ── Unknown command ──────────────────────────────────────────
    } else {
      await sendWhatsAppReply(
        fromPhone,
        'BizManager commands: SALE [product] [qty] [price] | STOCK | TODAY'
      );
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message);
  }
});

module.exports = router;
module.exports.verifyWebhookSignature = verifyWebhookSignature;
module.exports.findProductForCommand = findProductForCommand;
