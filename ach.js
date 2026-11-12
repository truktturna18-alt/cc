/* ach.js v2 — Stripe ACH (confirmPayment path) */
(function () {
  if (window.__ach2) return; window.__ach2 = true;

  var stripe = null, statusEl, logEl, amtEl, descEl, nameEl, emailEl, rtEl, acEl, typeEl, mEl, goBtn, pollBtn, clientSecret = null;

  function mk(t, css, txt) { var e = document.createElement(t); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function log(m, bad) { var r = mk('div', 'font:11px/1.5 ui-monospace,monospace;padding:2px 0;color:' + (bad ? '#ff6b6b' : '#8fd694'), m); logEl.appendChild(r); logEl.scrollTop = logEl.scrollHeight; }
  function st(t, bad) { statusEl.textContent = t; statusEl.style.color = bad ? '#ff6b6b' : '#c9c9c9'; }
  function fld(ph, val, type) {
    var i = document.createElement('input');
    i.type = type || 'text'; i.placeholder = ph; i.value = val || '';
    i.autocapitalize = 'off'; i.spellcheck = false;
    i.style.cssText = 'width:100%;box-sizing:border-box;padding:9px;margin-bottom:6px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#eee;font:13px ui-monospace,monospace;';
    return i;
  }

  function build() {
    var host = document.getElementById('body') || document.body;
    var c = mk('div', 'padding:14px;border:1px solid #2a2a2a;border-radius:10px;background:#111;color:#ddd;font:13px system-ui,sans-serif;margin:10px 0;');
    c.appendChild(mk('div', 'font-weight:700;letter-spacing:.08em;font-size:12px;margin-bottom:8px;', 'ACH / eCHECK CHARGE'));
    statusEl = mk('div', 'font-size:11px;margin-bottom:10px;', 'paste keys once');
    c.appendChild(statusEl);

    var skEl = fld('sk_live_…', localStorage.getItem('tl_sk') || '', 'password');
    skEl.oninput = function () { localStorage.setItem('tl_sk', skEl.value.trim()); };
    c.appendChild(skEl);
    var pkEl = fld('pk_live_…', localStorage.getItem('tl_pk') || '');
    pkEl.oninput = function () { localStorage.setItem('tl_pk', pkEl.value.trim()); initStripe(); };
    c.appendChild(pkEl);

    amtEl = fld('amount USD (min 0.50)', '25'); c.appendChild(amtEl);
    var chips = mk('div', 'display:flex;gap:6px;margin-bottom:6px;');
    [25, 50, 100, 150].forEach(function (v) {
      var b = mk('button', 'flex:1;padding:8px;border-radius:6px;border:1px solid #333;background:#1a1a1a;color:#ccc;font-size:11px;', '$' + v);
      b.onclick = function () { amtEl.value = v; }; chips.appendChild(b);
    });
    c.appendChild(chips);

    descEl = fld('description (e.g. TL gift card 25)'); c.appendChild(descEl);
    nameEl = fld('account holder name'); c.appendChild(nameEl);
    emailEl = fld('email (receipt)', '', 'email'); c.appendChild(emailEl);

    rtEl = fld('routing number (9 digits)'); rtEl.inputMode = 'numeric';
    rtEl.oninput = function () {
      rtEl.value = rtEl.value.replace(/\D/g, '').slice(0, 9);
      if (rtEl.value.length === 9) {
        var d = rtEl.value.split('').map(Number);
        var ok = (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
        st(ok ? 'routing checksum OK' : 'routing checksum FAIL', !ok);
      }
    };
    c.appendChild(rtEl);

    acEl = fld('account number'); acEl.inputMode = 'numeric';
    acEl.oninput = function () { acEl.value = acEl.value.replace(/\D/g, ''); };
    c.appendChild(acEl);

    typeEl = mk('select', 'width:100%;padding:9px;margin-bottom:6px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#eee;font:13px ui-monospace,monospace;');
    ['checking', 'savings'].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; typeEl.appendChild(o); });
    c.appendChild(typeEl);

    var mRow = mk('label', 'display:flex;gap:8px;align-items:flex-start;font-size:11px;color:#aaa;margin:8px 0;');
    mEl = document.createElement('input'); mEl.type = 'checkbox'; mEl.style.cssText = 'margin-top:2px;';
    mRow.appendChild(mEl);
    mRow.appendChild(mk('span', '', 'I authorize TL Services to debit this account per the mandate.'));
    c.appendChild(mRow);

    var row = mk('div', 'display:flex;gap:8px;margin-bottom:10px;');
    goBtn = mk('button', 'flex:1;padding:11px;border-radius:7px;border:0;background:#0f7b5f;color:#fff;font-weight:700;font-size:12px;', 'CHARGE');
    pollBtn = mk('button', 'flex:0 0 80px;padding:11px;border-radius:7px;border:1px solid #444;background:#1a1a1a;color:#ccc;font-weight:700;font-size:12px;', 'STATUS');
    row.appendChild(goBtn); row.appendChild(pollBtn);
    c.appendChild(row);

    logEl = mk('div', 'max-height:140px;overflow:auto;background:#0a0a0a;border:1px solid #222;border-radius:7px;padding:6px;');
    c.appendChild(logEl);
    host.appendChild(c);

    goBtn.onclick = charge;
    pollBtn.onclick = poll;
    initStripe();
  }

  function initStripe() {
    var key = localStorage.getItem('tl_pk') || '';
    if (!key) return st('paste pk_live_ to start');
    if (window.Stripe) { stripe = window.Stripe(key); st('stripe ready'); return; }
    var s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = function () { stripe = window.Stripe(localStorage.getItem('tl_pk')); st('stripe ready'); log('stripe.js loaded'); };
    s.onerror = function () { st('stripe.js blocked', true); };
    document.head.appendChild(s);
  }

  function charge() {
    var key = (localStorage.getItem('tl_sk') || '').trim();
    var pkv = (localStorage.getItem('tl_pk') || '').trim();
    if (!key || !pkv) return st('need both keys', true);
    if (!stripe) { initStripe(); return st('stripe not ready, tap again'); }
    var amt = Math.round(parseFloat(amtEl.value) * 100);
    if (!amt || amt < 50) return st('min 0.50', true);
    if (!/^\d{9}$/.test(rtEl.value)) return st('routing must be 9 digits', true);
    var d = rtEl.value.split('').map(Number);
    if ((3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 !== 0) return st('routing checksum fail', true);
    if (acEl.value.length < 4) return st('account too short', true);
    if (!nameEl.value.trim()) return st('need holder name', true);
    if (!mEl.checked) return st('accept the mandate', true);

    st('creating intent…');
    fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        amount: amt, currency: 'usd',
        'payment_method_types[]': 'us_bank_account',
        description: descEl.value || 'TL ACH charge',
        'payment_method_options[us_bank_account][verification_method]': 'automatic'
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { st(j.error.message, true); log(j.error.message, true); return; }
      clientSecret = j.client_secret;
      log('intent ' + j.id + ' $' + (amt / 100).toFixed(2));
      st('confirming…');
      var pd = {
        type: 'us_bank_account',
        billing_details: { name: nameEl.value.trim(), email: emailEl.value.trim() || undefined },
        us_bank_account: { routing_number: rtEl.value, account_number: acEl.value, account_holder_type: 'individual' }
      };
      if (typeof stripe.confirmUsBankAccount === 'function') {
        return stripe.confirmUsBankAccount(j.client_secret, { payment_method: pd });
      }
      log('using confirmPayment path');
      return stripe.confirmPayment({
        clientSecret: j.client_secret,
        confirmParams: { return_url: location.origin + location.pathname + '?v=12#ach', payment_method_data: pd }
      });
    }).then(function (res) {
      if (!res) return;
      if (res.error) { st(res.error.message, true); log(res.error.message, true); return; }
      var pi = res.paymentIntent;
      if (!pi) { st('redirecting…'); return; }
      st('ACCEPTED — ' + pi.status);
      log('pi ' + pi.id + ' ' + pi.status);
      log('micro-deposits post in 1-2 days');
    }).catch(function (e) { st('net fail: ' + e.message, true); log(e.message, true); });
  }

  function poll() {
    if (!stripe || !clientSecret) return st('no intent yet', true);
    stripe.retrievePaymentIntent(clientSecret).then(function (r) {
      if (r.error) return st(r.error.message, true);
      st('status: ' + r.paymentIntent.status);
      log('status ' + r.paymentIntent.status);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
