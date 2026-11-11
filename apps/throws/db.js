// Order storage using Node's built-in SQLite (no extra dependencies).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || './data/orders.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,             -- pending | paid | payment_failed | expired
    fulfillment TEXT NOT NULL,        -- pickup | ship
    items_json TEXT NOT NULL,
    subtotal_cents INTEGER NOT NULL,
    checkout_session_id TEXT,
    customer_email TEXT,
    shipping_json TEXT,
    amount_total_cents INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    fulfillment TEXT NOT NULL,
    needed_by TEXT,
    items_json TEXT NOT NULL,
    estimate_cents INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'new',  -- new | contacted | converted | closed
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function createOrder({ id, fulfillment, items, subtotalCents }) {
  db.prepare(
    `INSERT INTO orders (id, status, fulfillment, items_json, subtotal_cents)
     VALUES (?, 'pending', ?, ?, ?)`
  ).run(id, fulfillment, JSON.stringify(items), subtotalCents);
}

export function attachSession(orderId, sessionId) {
  db.prepare('UPDATE orders SET checkout_session_id = ? WHERE id = ?').run(sessionId, orderId);
}

export function getOrder(id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export function listOrders(limit = 100) {
  return db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit);
}

// Returns true if this event id was newly recorded (i.e. not seen before).
export function markEventProcessed(eventId) {
  const result = db
    .prepare('INSERT OR IGNORE INTO processed_events (event_id) VALUES (?)')
    .run(eventId);
  return result.changes === 1;
}

export function markPaid(orderId, { email, shipping, amountTotal }) {
  // Only move forward from pending/payment_failed; never un-pay an order.
  db.prepare(
    `UPDATE orders
       SET status = 'paid', customer_email = ?, shipping_json = ?,
           amount_total_cents = ?, paid_at = datetime('now')
     WHERE id = ? AND status IN ('pending', 'payment_failed')`
  ).run(email ?? null, shipping ? JSON.stringify(shipping) : null, amountTotal ?? null, orderId);
}

export function createRequest(r) {
  db.prepare(
    `INSERT INTO requests (id, name, email, phone, fulfillment, needed_by, items_json, estimate_cents, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(r.id, r.name, r.email, r.phone, r.fulfillment, r.neededBy, JSON.stringify(r.items), r.estimateCents, r.notes);
}

export function listRequests(limit = 200) {
  return db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function markStatus(orderId, status) {
  db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'`).run(status, orderId);
}
