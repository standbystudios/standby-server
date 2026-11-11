// Signature Throws storefront: price list and order form.
// Prices always come from the server (/api/catalog) so the page and checkout agree.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const count = (n) => n.toLocaleString('en-US');

  const ICONS = {
    medallion: '<circle cx="22" cy="6" r="4" fill="none" stroke="#d9a21b" stroke-width="2.5"/><circle cx="22" cy="26" r="15" fill="#d9a21b"/><circle cx="22" cy="26" r="11" fill="#5b2a86"/><circle cx="22" cy="26" r="6" fill="#1b7a4e"/>',
    pendant: '<circle cx="22" cy="5" r="3.5" fill="none" stroke="#d9a21b" stroke-width="2.5"/><path d="M22 9 L34 22 L22 42 L10 22 Z" fill="#5b2a86"/><path d="M22 15 L29 22 L22 34 L15 22 Z" fill="#d9a21b"/>',
    keychain: '<circle cx="12" cy="12" r="8" fill="none" stroke="#7a7190" stroke-width="2.5"/><rect x="16" y="16" width="24" height="20" rx="5" fill="#1b7a4e"/><rect x="21" y="23" width="14" height="6" rx="2" fill="#f6e2a0"/>',
    magnet: '<rect x="5" y="9" width="34" height="26" rx="7" fill="#5b2a86"/><circle cx="22" cy="22" r="8" fill="#d9a21b"/>',
    doubloon: '<circle cx="22" cy="22" r="17" fill="#d9a21b"/><circle cx="22" cy="22" r="13" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 3" opacity=".7"/><circle cx="22" cy="22" r="7" fill="#5b2a86"/>',
    cup_charm: '<path d="M10 8 h24 l-3 30 h-18 Z" fill="#c8bfe0"/><path d="M28 8 q8 2 6 12" fill="none" stroke="#7a7190" stroke-width="2.5"/><circle cx="33" cy="24" r="7" fill="#1b7a4e"/><circle cx="33" cy="24" r="3" fill="#d9a21b"/>',
    custom_cup: '<path d="M9 6 h26 l-3 34 h-20 Z" fill="#c8bfe0"/><rect x="13" y="16" width="18" height="10" rx="2" fill="#5b2a86"/>',
    bead_case: '<circle cx="10" cy="14" r="5" fill="#5b2a86"/><circle cx="20" cy="22" r="5" fill="#1b7a4e"/><circle cx="30" cy="14" r="5" fill="#d9a21b"/><circle cx="34" cy="26" r="5" fill="#5b2a86"/><circle cx="24" cy="34" r="5" fill="#d9a21b"/><circle cx="12" cy="30" r="5" fill="#1b7a4e"/>',
  };
  const icon = (sku) => `<svg viewBox="0 0 44 44" aria-hidden="true">${ICONS[sku] || ''}</svg>`;

  let catalog = null;
  const bySku = {};

  function unitFor(p, qty) {
    let unit = p.tiers[0].unit;
    for (const t of p.tiers) if (qty >= t.min) unit = t.unit;
    return unit;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v; // only used for our own icon markup
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  }

  // ---------- Price list ----------
  function renderPrices() {
    const printed = catalog.products.filter((p) => p.kind === 'printed');
    const rows = $('#price-rows');
    rows.replaceChildren();
    for (const p of printed) {
      const tr = el('tr');
      const td = el('td');
      const item = el('div', { class: 'item' });
      item.insertAdjacentHTML('afterbegin', icon(p.sku));
      item.append(el('div', {}, [el('strong', { text: p.name }), el('span', { text: p.description })]));
      td.append(item);
      tr.append(td);
      p.tiers.forEach((t) => {
        tr.append(el('td', { class: 'num', 'data-label': `${count(t.min)}+` }, [
          document.createTextNode(money(t.unit)),
          el('br'),
          el('span', { class: 'hint', text: `${count(t.min)} or more` }),
        ]));
      });
      rows.append(tr);
    }
    $('#tier1').textContent = 'Small batch';
    $('#tier2').textContent = 'Medium batch';
    $('#tier3').textContent = 'Large batch';

    const supply = $('#supply-rows');
    supply.replaceChildren();
    for (const p of catalog.products.filter((x) => x.kind === 'brokered')) {
      const tr = el('tr');
      const item = el('div', { class: 'item' });
      item.insertAdjacentHTML('afterbegin', icon(p.sku));
      item.append(el('div', {}, [el('strong', { text: p.name }), el('span', { text: p.description })]));
      tr.append(el('td', {}, [item]));
      let priceText;
      if (p.tiers.length === 1) {
        priceText = `${money(p.tiers[0].unit)} each`;
      } else {
        priceText = p.tiers.map((t) => `${money(t.unit)} each for ${count(t.min)}+`).join(', ');
      }
      if (p.setupFee) priceText += `, plus a ${money(p.setupFee)} setup fee per design`;
      tr.append(el('td', { text: priceText }));
      supply.append(tr);
    }

    $('#ship-price').textContent = `Flat-rate shipping anywhere in the US: ${money(catalog.shippingFlatCents)}.`;
  }

  // ---------- Order form ----------
  let lineCounter = 0;
  function addLineItem(defaultSku) {
    lineCounter += 1;
    const id = `li${lineCounter}`;
    const wrap = el('div', { class: 'line-item', 'data-line': id });
    const head = el('div', { class: 'line-item-head' }, [el('h3', { text: 'Product' })]);
    const remove = el('button', { type: 'button', class: 'link-button', text: 'Remove' });
    remove.addEventListener('click', () => { wrap.remove(); refreshRemoveButtons(); updateSummary(); });
    head.append(remove);

    const select = el('select', { id: `${id}-sku`, name: 'sku' });
    for (const p of catalog.products) select.append(el('option', { value: p.sku, text: p.name }));
    if (defaultSku) select.value = defaultSku;

    const qty = el('input', { type: 'number', id: `${id}-qty`, name: 'quantity', inputmode: 'numeric', min: '1', step: '1' });
    const qtyHint = el('p', { class: 'hint', id: `${id}-qty-hint` });
    qty.setAttribute('aria-describedby', qtyHint.id);

    const colors = el('input', { type: 'text', id: `${id}-colors`, name: 'colors', placeholder: 'Purple, green, and gold' });
    const words = el('input', { type: 'text', id: `${id}-words`, name: 'words', placeholder: 'Krewe name, rider name, year' });
    const file = el('input', { type: 'file', id: `${id}-file`, name: 'design', accept: '.png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf' });

    wrap.append(
      head,
      el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [el('label', { for: select.id, text: 'Product' }), select]),
        el('div', { class: 'field' }, [el('label', { for: qty.id, text: 'Quantity' }), qty, qtyHint]),
      ]),
      el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [el('label', { for: colors.id, text: 'Colors' }), colors]),
        el('div', { class: 'field' }, [el('label', { for: words.id, text: 'Words on the throw' }), words]),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: file.id, text: 'Your logo or artwork (optional)' }), file,
        el('p', { class: 'hint', text: 'PNG, JPG, SVG, or PDF, up to 10 MB. No artwork? Describe it in the notes below.' }),
      ]),
    );

    const syncMin = () => {
      const p = bySku[select.value];
      qty.min = String(p.minQty);
      if (!qty.value || Number(qty.value) < p.minQty) qty.value = String(p.minQty);
      updateSummary();
    };
    select.addEventListener('change', syncMin);
    qty.addEventListener('input', updateSummary);
    $('#line-items').append(wrap);
    syncMin();
    refreshRemoveButtons();
  }

  function refreshRemoveButtons() {
    const items = document.querySelectorAll('.line-item');
    items.forEach((it, i) => {
      it.querySelector('.line-item-head h3').textContent = items.length > 1 ? `Product ${i + 1}` : 'Product';
      it.querySelector('.line-item-head .link-button').hidden = items.length === 1;
    });
  }

  function readLines() {
    return [...document.querySelectorAll('.line-item')].map((it) => {
      const sku = it.querySelector('select').value;
      const quantity = Math.floor(Number(it.querySelector('input[name="quantity"]').value));
      return {
        node: it, sku, quantity, product: bySku[sku],
        colors: it.querySelector('input[name="colors"]').value.trim(),
        words: it.querySelector('input[name="words"]').value.trim(),
        file: it.querySelector('input[type="file"]').files[0] || null,
      };
    });
  }

  function updateSummary() {
    if (!catalog) return;
    const dl = $('#summary-lines');
    dl.replaceChildren();
    let total = 0;
    for (const line of readLines()) {
      const p = line.product;
      const hint = line.node.querySelector('[id$="-qty-hint"]');
      if (!(line.quantity >= p.minQty)) {
        hint.textContent = `Minimum is ${count(p.minQty)}.`;
        continue;
      }
      const unit = unitFor(p, line.quantity);
      const next = p.tiers.find((t) => t.min > line.quantity);
      hint.textContent = next
        ? `${money(unit)} each. Order ${count(next.min)} or more for ${money(next.unit)} each.`
        : `${money(unit)} each.`;
      const amount = unit * line.quantity;
      total += amount;
      dl.append(el('dt', { text: `${count(line.quantity)} × ${p.name}` }), el('dd', { text: money(amount) }));
      if (p.setupFee) {
        total += p.setupFee;
        dl.append(el('dt', { text: 'Cup setup' }), el('dd', { text: money(p.setupFee) }));
      }
    }
    const ship = new FormData($('#order-form')).get('fulfillment') === 'ship';
    if (ship) {
      total += catalog.shippingFlatCents;
      dl.append(el('dt', { text: 'Shipping' }), el('dd', { text: money(catalog.shippingFlatCents) }));
    } else {
      dl.append(el('dt', { text: 'Pickup in Metairie' }), el('dd', { text: 'Free' }));
    }
    dl.append(el('dt', { class: 'total', text: 'Estimated total' }), el('dd', { class: 'total', text: money(total) }));
  }

  function showMessage(text, kind) {
    const m = $('#form-message');
    m.textContent = text;
    m.className = `form-message ${kind || ''}`;
  }

  async function uploadDesign(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is over 10 MB. Send a smaller version.`);
    const res = await fetch('/api/designs', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't upload ${file.name}.`);
    return data.designId;
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const lines = readLines();
    const bad = lines.find((l) => !(l.quantity >= l.product.minQty));
    if (bad) {
      showMessage(`${bad.product.name} needs at least ${count(bad.product.minQty)} pieces.`, 'error');
      bad.node.querySelector('input[name="quantity"]').focus();
      return;
    }
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    if (!name) { showMessage('Add your name.', 'error'); form.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMessage('Add an email address we can send your proof to.', 'error'); form.email.focus(); return; }

    const button = $('#submit-button');
    button.disabled = true;
    showMessage(lines.some((l) => l.file) ? 'Uploading your artwork…' : 'Sending…');

    try {
      const items = [];
      for (const l of lines) {
        const designId = l.file ? await uploadDesign(l.file) : null;
        const notes = [l.colors && `Colors: ${l.colors}`, l.words && `Words: ${l.words}`].filter(Boolean).join('\n');
        items.push({ sku: l.sku, quantity: l.quantity, designId, notes });
      }
      const fulfillment = new FormData(form).get('fulfillment');

      if (catalog.checkoutOpen) {
        const res = await fetch('/api/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, fulfillment }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || "Checkout didn't start. Try again.");
        window.location.assign(data.url);
        return;
      }

      const res = await fetch('/api/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone: form.phone.value.trim(), items, fulfillment,
          neededBy: form.neededBy.value, notes: form.notes.value.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Your request didn't send. Try again.");
      form.reset();
      $('#line-items').replaceChildren();
      addLineItem('medallion');
      showMessage(`Request ${data.requestId} sent. We'll email your proof and final price within two business days.`, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    try {
      const res = await fetch('/api/catalog');
      if (!res.ok) throw new Error();
      catalog = await res.json();
    } catch {
      $('#price-rows').replaceChildren(el('tr', {}, [el('td', { colspan: '4', text: 'Prices are unavailable right now. Email hello@signaturethrows.com for a price list.' })]));
      $('#submit-button').disabled = true;
      showMessage('Ordering is unavailable right now. Email hello@signaturethrows.com.', 'error');
      return;
    }
    for (const p of catalog.products) bySku[p.sku] = p;
    renderPrices();

    if (catalog.checkoutOpen) {
      $('#submit-button').textContent = 'Continue to payment';
      $('#order-intro').textContent = "Tell us what you need. You'll pay securely through Stripe, and nothing prints until you approve your proof.";
    } else {
      $('#order-intro').textContent = "Online payment opens soon. Send your request now and we'll email a proof and final price within two business days.";
    }

    const today = new Date();
    $('#needed-by').min = today.toISOString().slice(0, 10);
    addLineItem('medallion');
    $('#add-item').addEventListener('click', () => addLineItem());
    document.querySelectorAll('input[name="fulfillment"]').forEach((r) => r.addEventListener('change', updateSummary));
    $('#order-form').addEventListener('submit', submit);
    updateSummary();
  }

  init();
})();
