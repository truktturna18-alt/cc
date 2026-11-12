/* statement.js v2 — PDF decrypt + seeded cracker. pdf.js 3.11.174 UMD, worker matched. */
(function () {
  if (window.__stmtV2) return;
  window.__stmtV2 = true;

  var VER = '3.11.174';
  var MIRRORS = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + VER,
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + VER + '/legacy/build',
    'https://unpkg.com/pdfjs-dist@' + VER + '/legacy/build'
  ];

  var pdfjs = null, bytes = null, fname = '', running = false, stopFlag = false, tries = 0;
  var host = null, statusEl, logEl, pwEl, fileEl, textEl, countEl, stopBtn, goBtn, crackBtn;

  function mk(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function log(msg, bad) {
    var row = mk('div', 'font:11px/1.5 ui-monospace,monospace;padding:2px 0;color:' + (bad ? '#ff6b6b' : '#8fd694'), msg);
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(t, bad) {
    statusEl.textContent = t;
    statusEl.style.color = bad ? '#ff6b6b' : '#c9c9c9';
  }

  function findHost() {
    return document.getElementById('stmt') ||
      document.getElementById('tilebody') ||
      document.querySelector('main') ||
      document.body;
  }

  function build() {
    host = findHost();
    var card = mk('div', 'padding:14px;border:1px solid #2a2a2a;border-radius:10px;background:#111;color:#ddd;font:13px system-ui,sans-serif;max-width:640px;margin:10px auto;');

    card.appendChild(mk('div', 'font-weight:700;letter-spacing:.08em;font-size:12px;margin-bottom:8px;', 'STATEMENT DECRYPT'));

    statusEl = mk('div', 'font-size:11px;margin-bottom:10px;', 'engine: not loaded');
    card.appendChild(statusEl);

    fileEl = document.createElement('input');
    fileEl.type = 'file';
    fileEl.accept = 'application/pdf,.pdf';
    fileEl.style.cssText = 'display:block;width:100%;margin-bottom:10px;font-size:12px;color:#ccc;';
    card.appendChild(fileEl);

    pwEl = document.createElement('input');
    pwEl.type = 'text';
    pwEl.placeholder = 'password (leave blank to try empty)';
    pwEl.autocapitalize = 'off';
    pwEl.spellcheck = false;
    pwEl.style.cssText = 'width:100%;box-sizing:border-box;padding:9px;margin-bottom:8px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#eee;font:13px ui-monospace,monospace;';
    card.appendChild(pwEl);

    var row = mk('div', 'display:flex;gap:8px;margin-bottom:10px;');
    goBtn = mk('button', 'flex:1;padding:10px;border-radius:7px;border:0;background:#1f6feb;color:#fff;font-weight:700;font-size:12px;', 'DECRYPT');
    crackBtn = mk('button', 'flex:1;padding:10px;border-radius:7px;border:0;background:#6b4bd6;color:#fff;font-weight:700;font-size:12px;', 'CRACK');
    stopBtn = mk('button', 'flex:0 0 70px;padding:10px;border-radius:7px;border:1px solid #444;background:#1a1a1a;color:#ccc;font-weight:700;font-size:12px;', 'STOP');
    row.appendChild(goBtn); row.appendChild(crackBtn); row.appendChild(stopBtn);
    card.appendChild(row);

    countEl = mk('div', 'font:11px ui-monospace,monospace;color:#888;margin-bottom:6px;', 'attempts: 0');
    card.appendChild(countEl);

    logEl = mk('div', 'max-height:120px;overflow:auto;background:#0a0a0a;border:1px solid #222;border-radius:7px;padding:6px;margin-bottom:10px;');
    card.appendChild(logEl);

    textEl = mk('textarea', 'width:100%;box-sizing:border-box;height:170px;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#ddd;font:11px/1.5 ui-monospace,monospace;display:none;');
    textEl.readOnly = true;
    card.appendChild(textEl);

    host.appendChild(card);

    goBtn.onclick = function () { decryptManual(); };
    crackBtn.onclick = function () { runCrack(); };
    stopBtn.onclick = function () { stopFlag = true; setStatus('stopping…'); };

    fileEl.onchange = function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      fname = f.name;
      var r = new FileReader();
      r.onload = function () {
        bytes = new Uint8Array(r.result);
        log('loaded ' + fname + ' (' + bytes.length + ' bytes)');
        setStatus('file ready');
      };
      r.onerror = function () { setStatus('could not read file', true); };
      r.readAsArrayBuffer(f);
    };

    loadEngine();
  }

  function loadEngine(i) {
    i = i || 0;
    if (window.pdfjsLib) {
      pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = MIRRORS[i] + '/pdf.worker.min.js';
      setStatus('engine ready (pdf.js ' + (pdfjs.version || '?') + ')');
      log('engine ' + pdfjs.version);
      return;
    }
    if (i >= MIRRORS.length) { setStatus('engine failed on every mirror', true); log('all mirrors blocked', true); return; }
    setStatus('loading engine from mirror ' + (i + 1) + '…');
    var s = document.createElement('script');
    s.src = MIRRORS[i] + '/pdf.min.js';
    s.onload = function () {
      if (window.pdfjsLib) {
        pdfjs = window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = MIRRORS[i] + '/pdf.worker.min.js';
        setStatus('engine ready (pdf.js ' + (pdfjs.version || '?') + ')');
        log('engine ' + pdfjs.version);
      } else {
        log('mirror ' + (i + 1) + ': script parsed but pdfjsLib missing', true);
        loadEngine(i + 1);
      }
    };
    s.onerror = function () { log('mirror ' + (i + 1) + ' blocked', true); loadEngine(i + 1); };
    document.head.appendChild(s);
  }

  function openDoc(pass) {
    return pdfjs.getDocument({
      data: bytes.slice(0),
      password: pass || '',
      isEvalSupported: false,
      useWorkerFetch: false
    }).promise;
  }

  function dump(doc) {
    var out = [], p = 1;
    function step() {
      if (p > doc.numPages) {
        textEl.value = out.join('\n\n--- page break ---\n\n');
        textEl.style.display = 'block';
        log('extracted ' + doc.numPages + ' page(s)');
        return;
      }
      doc.getPage(p).then(function (page) {
        return page.getTextContent();
      }).then(function (tc) {
        out.push(tc.items.map(function (it) { return it.str; }).join(' '));
        p++;
        setTimeout(step, 0);
      }).catch(function () { p++; setTimeout(step, 0); });
    }
    step();
  }

  function decryptManual() {
    if (!pdfjs) return setStatus('engine not ready', true);
    if (!bytes) return setStatus('pick a PDF first', true);
    setStatus('opening…');
    openDoc(pwEl.value).then(function (d) {
      setStatus('DECRYPTED — ' + fname);
      log('SUCCESS pw="' + pwEl.value + '"');
      dump(d);
    }).catch(function (e) {
      if (e && e.name === 'PasswordException') {
        setStatus(e.code === 2 ? 'wrong password' : 'password required', true);
        log('pw rejected: "' + pwEl.value + '"', true);
      } else {
        setStatus('open failed: ' + (e && e.message ? e.message : e), true);
        log(String(e && e.message ? e.message : e), true);
      }
    });
  }

  function runCrack() {
    if (!pdfjs) return setStatus('engine not ready', true);
    if (!bytes) return setStatus('pick a PDF first', true);
    if (running) return;
    running = true; stopFlag = false; tries = 0;

    var cands = [];
    var last4 = (pwEl.value || '').replace(/\D/g, '').slice(-4);

    ['', '0000', '1234', '1111', '1984', '19840111', '01111984', '01/11/1984'].forEach(function (c) { cands.push(c); });
    if (last4) cands.push(last4);

    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].forEach(function (m) { cands.push(m, m + '1984', m + '84'); });

    ['password', 'pass', 'welcome', 'letmein', 'money', 'bank', 'statement', 'chase', 'wells', 'bo a', 'capitalone'].forEach(function (c) { cands.push(c); });

    for (var y = 1950; y <= 2005; y++) cands.push(String(y));
    for (var i = 0; i < 10000; i++) cands.push(('0000' + i).slice(-4));
    for (var j = 10000; j < 100000; j++) cands.push(String(j));

    var k = 0;
    function tick() {
      if (stopFlag) { running = false; setStatus('stopped at ' + tries + ' attempts'); return; }
      if (k >= cands.length) { running = false; setStatus('cracker exhausted ' + tries + ' attempts', true); return; }
      var cand = cands[k++];
      tries++;
      countEl.textContent = 'attempts: ' + tries;
      openDoc(cand).then(function (d) {
        running = false;
        stopFlag = true;
        setStatus('CRACKED — pw "' + cand + '"');
        log('CRACKED "' + cand + '"');
        pwEl.value = cand;
        dump(d);
      }).catch(function (e) {
        if (e && e.name === 'PasswordException' && e.code === 2) {
          setTimeout(tick, 0);
        } else if (e && e.name === 'PasswordException') {
          setTimeout(tick, 0);
        } else {
          running = false;
          setStatus('crack aborted: ' + (e && e.message ? e.message : e), true);
        }
      });
    }
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
