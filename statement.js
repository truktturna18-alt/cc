/* statement.js v3 — PDF open + page render + OCR + seeded cracker */
(function () {
  if (window.__stmtV3) return;
  window.__stmtV3 = true;

  var VER = '3.11.174';
  var MIRRORS = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + VER,
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + VER + '/legacy/build',
    'https://unpkg.com/pdfjs-dist@' + VER + '/legacy/build'
  ];
  var TESS = [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
  ];

  var pdfjs = null, tess = null, bytes = null, fname = '', running = false, stopFlag = false, tries = 0;
  var statusEl, logEl, pwEl, fileEl, textEl, countEl, imgWrap, stopBtn, goBtn, crackBtn, copyBtn;

  function mk(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function log(m, bad) {
    var r = mk('div', 'font:11px/1.5 ui-monospace,monospace;padding:2px 0;color:' + (bad ? '#ff6b6b' : '#8fd694'), m);
    logEl.appendChild(r); logEl.scrollTop = logEl.scrollHeight;
  }
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.style.color = bad ? '#ff6b6b' : '#c9c9c9'; }

  function host() {
    return document.getElementById('stmt') || document.getElementById('tilebody') ||
      document.getElementById('body') || document.body;
  }

  function build() {
    var card = mk('div', 'padding:14px;border:1px solid #2a2a2a;border-radius:10px;background:#111;color:#ddd;font:13px system-ui,sans-serif;margin:10px 0;');
    card.appendChild(mk('div', 'font-weight:700;letter-spacing:.08em;font-size:12px;margin-bottom:8px;', 'STATEMENT READER'));
    statusEl = mk('div', 'font-size:11px;margin-bottom:10px;', 'engine: not loaded');
    card.appendChild(statusEl);

    fileEl = document.createElement('input');
    fileEl.type = 'file'; fileEl.accept = 'application/pdf,.pdf';
    fileEl.style.cssText = 'display:block;width:100%;margin-bottom:10px;font-size:12px;color:#ccc;';
    card.appendChild(fileEl);

    pwEl = document.createElement('input');
    pwEl.type = 'text'; pwEl.placeholder = 'password (blank = none)';
    pwEl.autocapitalize = 'off'; pwEl.spellcheck = false;
    pwEl.style.cssText = 'width:100%;box-sizing:border-box;padding:9px;margin-bottom:8px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#eee;font:13px ui-monospace,monospace;';
    card.appendChild(pwEl);

    var row = mk('div', 'display:flex;gap:8px;margin-bottom:10px;');
    goBtn = mk('button', 'flex:1;padding:10px;border-radius:7px;border:0;background:#1f6feb;color:#fff;font-weight:700;font-size:12px;', 'OPEN');
    crackBtn = mk('button', 'flex:1;padding:10px;border-radius:7px;border:0;background:#6b4bd6;color:#fff;font-weight:700;font-size:12px;', 'CRACK');
    stopBtn = mk('button', 'flex:0 0 70px;padding:10px;border-radius:7px;border:1px solid #444;background:#1a1a1a;color:#ccc;font-weight:700;font-size:12px;', 'STOP');
    row.appendChild(goBtn); row.appendChild(crackBtn); row.appendChild(stopBtn);
    card.appendChild(row);

    countEl = mk('div', 'font:11px ui-monospace,monospace;color:#888;margin-bottom:6px;', 'attempts: 0');
    card.appendChild(countEl);

    logEl = mk('div', 'max-height:110px;overflow:auto;background:#0a0a0a;border:1px solid #222;border-radius:7px;padding:6px;margin-bottom:10px;');
    card.appendChild(logEl);

    copyBtn = mk('button', 'width:100%;padding:9px;margin-bottom:8px;border-radius:7px;border:1px solid #444;background:#1a1a1a;color:#ccc;font-weight:700;font-size:12px;', 'COPY TEXT');
    card.appendChild(copyBtn);

    textEl = mk('textarea', 'width:100%;box-sizing:border-box;height:200px;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#ddd;font:11px/1.5 ui-monospace,monospace;');
    textEl.readOnly = true;
    card.appendChild(textEl);

    imgWrap = mk('div', 'margin-top:10px;');
    card.appendChild(imgWrap);

    host().appendChild(card);

    goBtn.onclick = function () { open(false); };
    crackBtn.onclick = function () { runCrack(); };
    stopBtn.onclick = function () { stopFlag = true; setStatus('stopping…'); };
    copyBtn.onclick = function () {
      textEl.select();
      try { document.execCommand('copy'); setStatus('text copied'); } catch (e) { setStatus('copy failed', true); }
    };

    fileEl.onchange = function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      fname = f.name;
      var r = new FileReader();
      r.onload = function () {
        bytes = new Uint8Array(r.result);
        log('loaded ' + fname + ' (' + bytes.length + ' bytes)');
        setStatus('file ready — tap OPEN');
      };
      r.readAsArrayBuffer(f);
    };

    loadEngine(0);
    loadTess(0);
  }

  function loadEngine(i) {
    if (window.pdfjsLib) { pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = MIRRORS[i] + '/pdf.worker.min.js'; log('engine ' + pdfjs.version); return; }
    if (i >= MIRRORS.length) { setStatus('pdf engine blocked', true); return; }
    setStatus('loading pdf engine…');
    var s = document.createElement('script');
    s.src = MIRRORS[i] + '/pdf.min.js';
    s.onload = function () {
      if (window.pdfjsLib) { pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = MIRRORS[i] + '/pdf.worker.min.js'; log('engine ' + pdfjs.version); }
      else loadEngine(i + 1);
    };
    s.onerror = function () { loadEngine(i + 1); };
    document.head.appendChild(s);
  }

  function loadTess(i) {
    if (window.Tesseract) { tess = window.Tesseract; log('ocr ready'); return; }
    if (i >= TESS.length) { log('ocr blocked — image only', true); return; }
    var s = document.createElement('script');
    s.src = TESS[i];
    s.onload = function () { if (window.Tesseract) { tess = window.Tesseract; log('ocr ready'); } else loadTess(i + 1); };
    s.onerror = function () { loadTess(i + 1); };
    document.head.appendChild(s);
  }

  function openDoc(pass) {
    return pdfjs.getDocument({ data: bytes.slice(0), password: pass || '', isEvalSupported: false, useWorkerFetch: false }).promise;
  }

  function render(doc) {
    var pages = Math.min(doc.numPages, 8), out = [], p = 1;
    imgWrap.innerHTML = '';
    function step() {
      if (p > pages) { setStatus('rendered ' + pages + ' page(s)'); ocr(out); return; }
      doc.getPage(p).then(function (page) {
        var vp = page.getViewport({ scale: 2 });
        var c = document.createElement('canvas');
        var ratio = Math.min(1100 / vp.width, 2);
        var v2 = page.getViewport({ scale: ratio * 1.6 });
        c.width = v2.width; c.height = v2.height;
        c.style.cssText = 'width:100%;height:auto;display:block;margin-bottom:8px;border:1px solid #333;border-radius:6px;';
        imgWrap.appendChild(c);
        return page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise.then(function () {
          out.push(c); p++; setTimeout(step, 0);
        });
      }).catch(function (e) { log('page ' + p + ' render fail', true); p++; setTimeout(step, 0); });
    }
    step();
  }

  function ocr(canvases) {
    if (!tess) { setStatus('rendered — OCR unavailable, read the image', true); return; }
    if (!canvases.length) return;
    setStatus('reading text…');
    var i = 0, parts = [];
    function step() {
      if (i >= canvases.length) {
        textEl.value = parts.join('\n\n--- page break ---\n\n');
        setStatus('done — ' + textEl.value.length + ' chars');
        return;
      }
      tess.recognize(canvases[i], 'eng').then(function (r) {
        parts.push((r && r.data && r.data.text) || '');
        log('page ' + (i + 1) + ' read');
        i++; setTimeout(step, 0);
      }).catch(function () { i++; setTimeout(step, 0); });
    }
    step();
  }

  function open(quiet) {
    if (!pdfjs) return setStatus('pdf engine not ready', true);
    if (!bytes) return setStatus('pick a PDF first', true);
    setStatus('opening…');
    openDoc(pwEl.value).then(function (d) {
      setStatus('opened — ' + d.numPages + ' page(s)');
      log('OPENED pw="' + pwEl.value + '"');
      render(d);
    }).catch(function (e) {
      if (e && e.name === 'PasswordException') {
        setStatus(e.code === 2 ? 'wrong password' : 'password required', true);
        log('pw rejected "' + pwEl.value + '"', true);
      } else {
        setStatus('open failed: ' + (e && e.message ? e.message : e), true);
        log(String(e && e.message ? e.message : e), true);
      }
    });
  }

  function runCrack() {
    if (!pdfjs || !bytes) return setStatus('need engine and file', true);
    if (running) return;
    running = true; stopFlag = false; tries = 0;
    var cands = [];
    ['', '0000', '1234', '1111', '1984', '01111984'].forEach(function (c) { cands.push(c); });
    var l4 = (pwEl.value || '').replace(/\D/g, '').slice(-4);
    if (l4) cands.push(l4);
    for (var y = 1950; y <= 2005; y++) cands.push(String(y));
    for (var i = 0; i < 10000; i++) cands.push(('0000' + i).slice(-4));
    for (var j = 10000; j < 100000; j++) cands.push(String(j));
    var k = 0;
    function tick() {
      if (stopFlag) { running = false; setStatus('stopped at ' + tries); return; }
      if (k >= cands.length) { running = false; setStatus('exhausted ' + tries + ' tries', true); return; }
      var c = cands[k++]; tries++;
      countEl.textContent = 'attempts: ' + tries;
      openDoc(c).then(function (d) {
        running = false; stopFlag = true;
        setStatus('CRACKED "' + c + '"'); log('CRACKED "' + c + '"');
        pwEl.value = c; render(d);
      }).catch(function (e) {
        if (e && e.name === 'PasswordException') setTimeout(tick, 0);
        else { running = false; setStatus('abort: ' + (e && e.message ? e.message : e), true); }
      });
    }
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
