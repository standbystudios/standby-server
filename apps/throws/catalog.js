// Product catalog and pricing. Prices are PLACEHOLDERS to confirm before launch.
// All amounts are in cents. Prices are always computed here on the server;
// the browser only sends SKUs and quantities.

export const CATALOG = {
  medallion: {
    name: 'Custom Medallion Bead',
    description: 'Layered-color 3D-printed medallion on a 33" bead strand.',
    kind: 'printed',
    minQty: 25,
    tiers: [ { min: 25, unit: 900 }, { min: 100, unit: 600 }, { min: 300, unit: 450 } ],
  },
  pendant: {
    name: 'Custom Shaped Pendant',
    description: 'Fleur-de-lis, crown, mask, or emblem-shaped pendant on a bead strand.',
    kind: 'printed',
    minQty: 25,
    tiers: [ { min: 25, unit: 1000 }, { min: 100, unit: 700 }, { min: 300, unit: 550 } ],
  },
  keychain: {
    name: 'Custom Keychain',
    description: 'Krewe, name, and year keychain with split ring.',
    kind: 'printed',
    minQty: 25,
    tiers: [ { min: 25, unit: 600 }, { min: 100, unit: 400 }, { min: 300, unit: 300 } ],
  },
  magnet: {
    name: 'Custom Magnet',
    description: 'Layered-color logo magnet.',
    kind: 'printed',
    minQty: 25,
    tiers: [ { min: 25, unit: 600 }, { min: 100, unit: 400 }, { min: 300, unit: 300 } ],
  },
  doubloon: {
    name: 'Custom Doubloon',
    description: 'Two-color 3D-printed doubloon for tossing.',
    kind: 'printed',
    minQty: 50,
    tiers: [ { min: 50, unit: 300 }, { min: 200, unit: 200 }, { min: 500, unit: 150 } ],
  },
  cup_charm: {
    name: 'Custom Cup Charm',
    description: 'Clip-on krewe emblem for parade cups.',
    kind: 'printed',
    minQty: 25,
    tiers: [ { min: 25, unit: 400 }, { min: 100, unit: 300 }, { min: 300, unit: 200 } ],
  },
  custom_cup: {
    name: 'Custom Printed Parade Cup (16 oz)',
    description: 'Frosted 16 oz cup with a 1-color logo, made by our cup supplier.',
    kind: 'brokered',
    minQty: 250,
    tiers: [ { min: 250, unit: 99 }, { min: 500, unit: 93 }, { min: 1000, unit: 89 } ],
    setupFee: 6000, // one-time screen setup, charged once per cup design
  },
  bead_case: {
    name: 'Plain Bead Case (144 strands, 33")',
    description: 'Plain 7mm parade beads, shipped from our bead supplier.',
    kind: 'brokered',
    minQty: 1,
    tiers: [ { min: 1, unit: 2300 } ],
  },
};

export const SHIPPING_FLAT_CENTS = 1500; // placeholder flat shipping per order

export function unitPriceFor(sku, qty) {
  const item = CATALOG[sku];
  if (!item) throw new Error(`Unknown product: ${sku}`);
  if (!Number.isInteger(qty) || qty < item.minQty) {
    throw new Error(`${item.name} has a minimum of ${item.minQty}.`);
  }
  if (qty > 20000) throw new Error('Quantity too large for online checkout; contact us.');
  let unit = item.tiers[0].unit;
  for (const tier of item.tiers) if (qty >= tier.min) unit = tier.unit;
  return unit;
}
