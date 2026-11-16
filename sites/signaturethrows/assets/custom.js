// Signature Throws: quote requests for fully custom pieces.
// Always sent as a request (never through checkout) because these are priced by hand.
(() => {
  const form = document.getElementById('custom-form');
  if (!form) return;
  const msg = document.getElementById('custom-message');
  const button = document.getElementById('custom-submit');
  const show = (text, kind) => { msg.textContent = text; msg.className = `form-message ${kind || ''}`; };
  document.getElementById('c-needed').min = new Date().toISOString().slice(0, 10);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const idea = form.idea.value.trim();
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const quantity = Math.floor(Number(form.quantity.value));
    if (!idea) { show('Tell us a little about your idea.', 'error'); form.idea.focus(); return; }
    if (!(quantity > 0)) { show('Add about how many you need.', 'error'); form.quantity.focus(); return; }
    if (!name) { show('Add your name.', 'error'); form.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { show('Add an email address we can reply to.', 'error'); form.email.focus(); return; }

    button.disabled = true;
    const file = form.design.files[0] || null;
    show(file ? 'Uploading your picture…' : 'Sending…');
    try {
      let designId = null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is over 10 MB. Send a smaller version.`);
        const up = await fetch('/api/designs', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData.error || `Couldn't upload ${file.name}.`);
        designId = upData.designId;
      }
      const notes = [
        `Idea: ${idea}`,
        form.size.value.trim() && `Size: ${form.size.value.trim()}`,
        form.colors.value.trim() && `Colors: ${form.colors.value.trim()}`,
      ].filter(Boolean).join('\n');
      const res = await fetch('/api/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, phone: form.phone.value.trim(), fulfillment: 'pickup',
          neededBy: form.neededBy.value, notes: 'Fully custom quote request',
          items: [{ sku: 'fully_custom', quantity, designId, notes }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Your request didn't send. Try again.");
      form.reset();
      show(`Request ${data.requestId} sent. We'll reach out within two business days to talk through your idea and send a quote.`, 'ok');
    } catch (err) {
      show(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
