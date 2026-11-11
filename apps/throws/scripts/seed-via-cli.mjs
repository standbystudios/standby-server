// Seeds sandbox products using the logged-in Stripe CLI (no API key needed).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { CATALOG } from '../catalog.js';
const wanted = { ...CATALOG, cup_setup: { name: 'Cup Screen Setup', description: 'One-time printing setup for a custom cup design.', kind: 'fee' } };
const run = (args) => JSON.parse(execFileSync('stripe', args, { encoding: 'utf8' }));
const existing = {};
for (const p of run(['products', 'list', '--limit=100', '--active=true']).data) if (p.metadata?.sku) existing[p.metadata.sku] = p.id;
const map = {};
for (const [sku, item] of Object.entries(wanted)) {
  if (existing[sku]) { map[sku] = existing[sku]; console.log('kept   ', sku, existing[sku]); continue; }
  const p = run(['products', 'create', `--name=${item.name}`, `--description=${item.description}`, "-d", `metadata[sku]=${sku}`, "-d", `metadata[kind]=${item.kind}`]);
  map[sku] = p.id; console.log('created', sku, p.id);
}
fs.writeFileSync('data/products.json', JSON.stringify(map, null, 2));
