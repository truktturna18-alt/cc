/* statement.js v4 — render + preprocess + OCR */
(function () {
  if (window.__stmtV4) return;
  window.__stmtV4 = true;

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

  var pdfjs = null, tess = null, bytes = null, running = false, stopFlag = false, tries = 0;
  var statusEl, logEl, pwEl, fileEl, textEl, countEl, imgWrap, goBtn, crackBtn, stopBtn, copyBtn;

  function mk(t, css, txt) { var e = document.createElement(t); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
  function log(m, bad) { var r = mk('div', 'font:11px/1.5 ui-monospace,monospace;padding:2px 0;color:' + (bad ? '#ff6b6b' : '#8fd694'), m); logEl.appendChild(r); logEl.scrollTop = logEl.scrollHeight; }
  function setStatus(t, bad) { statusEl.textContent = t; statusEl.style.color = bad ? '#ff6b6b' : '#c9c9c9'; }
  function host() { return document.getElementById('stmt') || document.getElementById('tilebody') || document.getElementById('body') || document.body; }

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
    logEl = mk('div', 'max-height:100px;overflow:auto;background:#0a0a0a;border:1px solid #222;border-radius:7px;padding:6px;margin-bottom:10px;');
    card.appendChild(logEl);

    copyBtn = mk('button', 'width:100%;padding:9px;margin-bottom:8px;border-radius:7px;border:1px solid #444;background:#1a1a1a;color:#ccc;font-weight:700;font-size:12px;', 'COPY TEXT');
    card.appendChild(copyBtn);

    textEl = mk('textarea', 'width:100%;box-sizing:border-box;height:220px;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:7px;color:#ddd;font:11px/1.5 ui-monospace,monospace;');
    textEl.readOnly = true;
    card.appendChild(textEl);

    imgWrap = mk('div', 'margin-top:10px;');
    card.appendChild(imgWrap);
    host().appendChild(card);

    goBtn.onclick = function () { open(); };
    crackBtn.onclick = function () { runCrack(); };
    stopBtn.onclick = function () { stopFlag = true; setStatus('stopping…'); };
    copyBtn.onclick = function () { textEl.select(); try { document.execCommand('copy'); setStatus('copied'); } catch (e) { setStatus('copy failed', true); } };

    fileEl.onchange = function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { bytes = new Uint8Array(r.result); log('loaded ' + bytes.length + ' bytes'); setStatus('file ready — tap OPEN'); };
      r.readAsArrayBuffer(f);
    };

    loadEngine(0); loadTess(0);
  }

  function loadEngine(i) {
    if (window.pdfjsLib) { pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = MIRRORS[i] + '/pdf.worker.min.js'; log('engine ' + pdfjs.version); return; }
    if (i >= MIRRORS.length) { setStatus('pdf engine blocked', true); return; }
    setStatus('loading engine…');
    var s = document.createElement('script');
    s.src = MIRRORS[i] + '/pdf.min.js';
    s.onload = function () { if (window.pdfjsLib) { pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = MIRRORS[i] + '/pdf.worker.min.js'; log('engine ' + pdfjs.version); } else loadEngine(i + 1); };
    s.onerror = function () { loadEngine(i + 1); };
    document.head.appendChild(s);
  }

  function loadTess(i) {
    if (window.Tesseract) { tess = window.Tesseract; log('ocr ready'); return; }
    if (i >= TESS.length) { log('ocr blocked', true); return; }
    var s = document.createElement('script');
    s.src = TESS[i];
    s.onload = function () { if (window.Tesseract) { tess = window.Tesseract; log('ocr ready'); } else loadTess(i + 1); };
    s.onerror = function () { loadTess(i + 1); };
    document.head.appendChild(s);
  }

  function openDoc(p) { return pdfjs.getDocument({ data: bytes.slice(0), password: p || '', isEvalSupported: false, useWorkerFetch: false }).promise; }

  /* grayscale + contrast stretch + threshold, returns a NEW canvas */
  function clean(src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    var min = 255, max = 0;
    for (var i = 0; i < p.length; i += 4) {
      var g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
      p[i] = p[i + 1] = p[i + 2] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    var span = Math.max(1, max - min);
    var cut = min + span * 0.55;
    for (var j = 0; j < p.length; j += 4) {
      p[j] = p[j + 1] = p[j + 2] = p[j] < cut ? 0 : 255;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  function render(doc) {
    var pages = Math.min(doc.numPages, 8), out = [], p = 1;
    imgWrap.innerHTML = '';
    function step() {
      if (p > pages) { ocr(out); return; }
      doc.getPage(p).then(function (page) {
        var base = page.getViewport({ scale: 1 });
        var sc = Math.min(3, Math.max(2, 1400 / base.width));
        var vp = page.getViewport({ scale: sc });
        var c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        c.style.cssText = 'width:100%;height:auto;display:block;margin-bottom:8px;border:1px solid #333;border-radius:6px;';
        imgWrap.appendChild(c);
        return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
          out.push(c); p++; setTimeout(step, 0);
        });
      }).catch(function () { p++; setTimeout(step, 0); });
    }
    step();
  }

  function ocr(canvases) {
    if (!tess) { setStatus('rendered — no OCR', true); return; }
    if (!canvases.length) return;
    setStatus('reading…');
    var i = 0, parts = [];
    function step() {
      if (i >= canvases.length) { textEl.value = parts.join('\n\n--- page break ---\n\n'); setStatus('done — ' + textEl.value.length + ' chars'); return; }
      var cleanC = clean(canvases[i]);
      tess.recognize(cleanC, 'eng', { tessedit_pageseg_mode: '6' }).then(function (r) {
        parts.push((r && r.data && r.data.text) || '');
        log('page ' + (i + 1) + ' read');
        i++; setTimeout(step, 0);
      }).catch(function () { i++; setTimeout(step, 0); });
    }
    step();
  }

  function open() {
    if (!pdfjs || !bytes) return setStatus('need engine and file', true);
    setStatus('opening…');
    openDoc(pwEl.value).then(function (d) {
      setStatus('opened — ' + d.numPages + ' page(s)');
      log('OPENED pw="' + pwEl.value + '"');
      render(d);
    }).catch(function (e) {
      if (e && e.name === 'PasswordException') { setStatus(e.code === 2 ? 'wrong password' : 'password required', true); }
      else { setStatus('fail: ' + (e && e.message ? e.message : e), true); log(String(e && e.message), true); }
    });
  }

  function runCrack() {
    if (!pdfjs || !bytes) return setStatus('need engine and file', true);
    if (running) return;
    running = true; stopFlag = false; tries = 0;
    var cands = ['', '0000', '1234', '1111'];
    for (var y = 1950; y <= 2005; y++) cands.push(String(y));
    for (var i = 0; i < 10000; i++) cands.push(('0000' + i).slice(-4));
    for (var j = 10000; j < 100000; j++) cands.push(String(j));
    var k = 0;
    function tick() {
      if (stopFlag) { running = false; setStatus('stopped at ' + tries); return; }
      if (k >= cands.length) { running = false; setStatus('exhausted ' + tries, true); return; }
      var c = cands[k++]; tries++;
      countEl.textContent = 'attempts: ' + tries;
      openDoc(c).then(function (d) { running = false; stopFlag = true; setStatus('CRACKED "' + c + '"'); pwEl.value = c; render(d); })
        .catch(function (e) { if (e && e.name === 'PasswordException') setTimeout(tick, 0); else { running = false; setStatus('abort: ' + (e && e.message || e), true); } });
    }
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
