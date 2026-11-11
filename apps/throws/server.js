// Signature Throws server: creates Stripe Checkout Sessions and fulfills
// orders from verified Stripe webhooks. Uses only Node built-ins plus the
// Stripe SDK.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CATALOG, SHIPPING_FLAT_CENTS, unitPriceFor } from './catalog.js';
import { stripe, webhookVerifier } from './stripe-client.js';
import * as db from './db.js';

const PORT = Number(process.env.PORT || 4242);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
// Fixed label for comparing checkout flows in the Stripe Dashboard.
const INTEGRATION_ID = 'signature_throws_web_qkvrmtzh';

const PRODUCT_IDS = JSON.parse(fs.readFileSync(process.env.PRODUCTS_FILE || 'data/products.sandbox.json', 'utf8'));

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const DESIGN_DIR = process.env.DESIGN_DIR || './data/designs';
fs.mkdirSync(DESIGN_DIR, { recursive: true });
const STATIC_DIR = process.env.STATIC_DIR; // local development only; Caddy serves the site in production

function safeDesignId(id) {
  const s = String(id || '');
  return /^d_[a-f0-9]{16}$/.test(s) ? s : null;
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// Simple in-memory rate limit: `max` actions per IP per hour.
const hits = new Map();
function rateLimited(req, bucket, max) {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

// ---------- Catalog (prices shown on the site come from here) ----------
function handleCatalog(req, res) {
  const products = Object.entries(CATALOG).map(([sku, p]) => ({
    sku, name: p.name, description: p.description, kind: p.kind,
    minQty: p.minQty, tiers: p.tiers, setupFee: p.setupFee || 0,
  }));
  return send(res, 200, { products, shippingFlatCents: SHIPPING_FLAT_CENTS, checkoutOpen: !!stripe });
}

// ---------- Design uploads ----------
const UPLOAD_TYPES = [
  { ext: 'png', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'pdf', test: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  { ext: 'svg', test: (b) => /<svg[\s>]/i.test(b.subarray(0, 2048).toString('utf8')) },
];

async function handleDesignUpload(req, res) {
  if (rateLimited(req, 'upload', 30)) return send(res, 429, { error: 'Too many uploads. Try again in an hour.' });
  let body;
  try { body = await readBody(req, 10 * 1024 * 1024); }
  catch { return send(res, 413, { error: 'That file is over 10 MB. Send a smaller version.' }); }
  if (body.length < 100) return send(res, 400, { error: 'That file is empty.' });
  const type = UPLOAD_TYPES.find((t) => t.test(body));
  if (!type) return send(res, 415, { error: 'Upload a PNG, JPG, SVG, or PDF file.' });
  const designId = 'd_' + crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(DESIGN_DIR, `${designId}.${type.ext}`), body);
  return send(res, 200, { designId });
}

// ---------- Order requests (used before online checkout opens) ----------
async function handleRequest(req, res) {
  if (rateLimited(req, 'request', 10)) return send(res, 429, { error: 'Too many requests. Try again in an hour.' });
  let input;
  try { input = JSON.parse((await readBody(req, 50_000)).toString('utf8')); }
  catch { return send(res, 400, { error: 'Invalid request.' }); }

  const name = String(input.name || '').trim().slice(0, 120);
  const email = String(input.email || '').trim().slice(0, 200);
  if (!name) return send(res, 400, { error: 'Add your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Add an email address we can reply to.' });

  const items = [];
  let estimate = 0;
  for (const it of (Array.isArray(input.items) ? input.items.slice(0, 20) : [])) {
    const p = CATALOG[it.sku];
    const qty = Math.floor(Number(it.quantity));
    if (!p || !(qty > 0) || qty > 100000) continue;
    let unit = p.tiers[0].unit;
    for (const t of p.tiers) if (qty >= t.min) unit = t.unit;
    estimate += unit * qty + (p.setupFee || 0);
    items.push({ sku: it.sku, quantity: qty, designId: safeDesignId(it.designId), notes: it.notes ? String(it.notes).slice(0, 1000) : null });
  }
  if (items.length === 0) return send(res, 400, { error: 'Choose at least one product and a quantity.' });

  const id = 'RQ-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.createRequest({
    id, name, email,
    phone: input.phone ? String(input.phone).slice(0, 40) : null,
    fulfillment: input.fulfillment === 'ship' ? 'ship' : 'pickup',
    neededBy: input.neededBy ? String(input.neededBy).slice(0, 20) : null,
    items, estimateCents: estimate,
    notes: input.notes ? String(input.notes).slice(0, 2000) : null,
  });
  console.log(`New order request ${id}`);
  return send(res, 200, { requestId: id });
}

// ---------- Local development: serve the website files ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(url, res) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(STATIC_DIR, '.' + p);
  if (!file.startsWith(path.resolve(STATIC_DIR))) return send(res, 403, { error: 'Forbidden' });
  const target = fs.existsSync(file) ? file : (fs.existsSync(file + '.html') ? file + '.html' : null);
  if (!target) return send(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

// ---------- Checkout ----------
async function handleCheckout(req, res) {
  if (!stripe) return send(res, 503, { error: 'The store is not taking orders yet.' });
  let input;
  try { input = JSON.parse((await readBody(req)).toString('utf8')); }
  catch { return send(res, 400, { error: 'Invalid JSON' }); }

  const fulfillment = input.fulfillment === 'ship' ? 'ship' : 'pickup';
  const rawItems = Array.isArray(input.items) ? input.items.slice(0, 20) : [];
  if (rawItems.length === 0) return send(res, 400, { error: 'Your cart is empty.' });

  const lineItems = [];
  const orderItems = [];
  let subtotal = 0;
  try {
    for (const { sku, quantity, designId, notes } of rawItems) {
      const qty = Number(quantity);
      const unit = unitPriceFor(sku, qty); // validates sku, minimums, max
      lineItems.push({
        price_data: { currency: 'usd', product: PRODUCT_IDS[sku], unit_amount: unit },
        quantity: qty,
      });
      orderItems.push({
        sku, quantity: qty, unitCents: unit,
        designId: safeDesignId(designId),
        notes: notes ? String(notes).slice(0, 1000) : null,
      });
      subtotal += unit * qty;
      if (CATALOG[sku].setupFee) {
        lineItems.push({
          price_data: { currency: 'usd', product: PRODUCT_IDS.cup_setup, unit_amount: CATALOG[sku].setupFee },
          quantity: 1,
        });
        orderItems.push({ sku: 'cup_setup', quantity: 1, unitCents: CATALOG[sku].setupFee });
        subtotal += CATALOG[sku].setupFee;
      }
    }
  } catch (err) {
    return send(res, 400, { error: err.message });
  }

  const orderId = 'ST-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.createOrder({ id: orderId, fulfillment, items: orderItems, subtotalCents: subtotal });

  const params = {
    mode: 'payment',
    line_items: lineItems,
    client_reference_id: orderId,
    metadata: { order_id: orderId, fulfillment },
    payment_intent_data: { metadata: { order_id: orderId } },
    phone_number_collection: { enabled: true },
    success_url: `${BASE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/cart`,
    integration_identifier: INTEGRATION_ID,
  };
  if (fulfillment === 'ship') {
    params.shipping_address_collection = { allowed_countries: ['US'] };
    params.shipping_options = [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: 'Standard shipping',
        fixed_amount: { amount: SHIPPING_FLAT_CENTS, currency: 'usd' },
      },
    }];
  } else {
    params.custom_text = {
      submit: { message: 'Local pickup in the New Orleans area. We will email you when your order is ready.' },
    };
  }

  try {
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout-${orderId}` });
    db.attachSession(orderId, session.id);
    return send(res, 200, { orderId, url: session.url });
  } catch (err) {
    console.error('Checkout session error for', orderId, err.type || '', err.message);
    return send(res, 502, { error: 'Could not start checkout. Please try again.' });
  }
}

// ---------- Webhooks ----------
async function handleWebhook(req, res) {
  if (!WEBHOOK_SECRET) return send(res, 500, { error: 'Webhook secret not configured' });
  const raw = await readBody(req);
  let event;
  try {
    event = webhookVerifier.webhooks.constructEvent(raw, req.headers['stripe-signature'], WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Rejected webhook: bad signature');
    return send(res, 400, { error: 'Invalid signature' });
  }

  const session = event.data.object;
  const orderId = session?.metadata?.order_id || session?.client_reference_id;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        // Fulfill only once the payment has actually succeeded.
        if (orderId && session.payment_status !== 'unpaid') {
          db.markPaid(orderId, {
            email: session.customer_details?.email,
            shipping: session.collected_information?.shipping_details || null,
            amountTotal: session.amount_total,
          });
          console.log(`Order ${orderId} paid (${event.type})`);
          // TODO: email the shop and the customer; queue the print job.
        }
        break;
      case 'checkout.session.async_payment_failed':
        if (orderId) db.markStatus(orderId, 'payment_failed');
        break;
      case 'checkout.session.expired':
        if (orderId) db.markStatus(orderId, 'expired');
        break;
      default:
        break; // ignore events we don't use
    }
    db.markEventProcessed(event.id);
    return send(res, 200, { received: true });
  } catch (err) {
    console.error('Webhook handling failed for', event.id, err.message);
    return send(res, 500, { error: 'Handler error' }); // Stripe will retry
  }
}

// ---------- Admin: list orders ----------
function handleOrders(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!ADMIN_TOKEN || token.length !== ADMIN_TOKEN.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN))) {
    return send(res, 401, { error: 'Unauthorized' });
  }
  const orders = db.listOrders().map((o) => ({
    ...o,
    items: JSON.parse(o.items_json),
    shipping: o.shipping_json ? JSON.parse(o.shipping_json) : null,
    items_json: undefined,
    shipping_json: undefined,
  }));
  const requests = db.listRequests().map((r) => ({ ...r, items: JSON.parse(r.items_json), items_json: undefined }));
  return send(res, 200, { orders, requests });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  try {
    if (req.method === 'GET' && url.pathname === '/api/catalog') return handleCatalog(req, res);
    if (req.method === 'POST' && url.pathname === '/api/designs') return await handleDesignUpload(req, res);
    if (req.method === 'POST' && url.pathname === '/api/requests') return await handleRequest(req, res);
    if (req.method === 'POST' && url.pathname === '/api/checkout') return await handleCheckout(req, res);
    if (req.method === 'POST' && url.pathname === '/webhooks/stripe') return await handleWebhook(req, res);
    if (req.method === 'GET' && url.pathname === '/admin/orders') return handleOrders(req, res);
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (STATIC_DIR && req.method === 'GET') return serveStatic(url, res);
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Unhandled error', err.message);
    return send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => console.log(`Signature Throws server on port ${PORT} (${stripe ? 'Stripe configured' : 'Stripe NOT configured'})`));
