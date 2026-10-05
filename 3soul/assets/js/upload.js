/* ============================================================
   Price It, upload flow: three steps and a confirmation on one
   stage. The game is the brief: every photo, link and answer
   makes it stronger, and a stronger brief gets a closer price.

   PROTOTYPE. Nothing leaves the browser: photos are previewed
   from memory and the send is simulated. The live form posts
   multipart to forms.3soul.in/estimate with the fields
   diamond_type, image[], referenceLink, details, first_name,
   last_name and email. Wire that in send() at launch.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PriceIt;
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var WA = 'https://wa.me/919819033336';
  var MAX_FILES = 5, MAX_MB = 10;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function b(x) { return '<b>' + x + '</b>'; }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var app = $('#app'), stage = $('#stage'), views = {};
  $$('.view').forEach(function (v) { views[v.dataset.view] = v; });

  var st = { files: [], link: '', note: '', dtype: null, first: '', last: '', email: '', phone: '',
             budget: '', occasion: '', when: '' };
  var step = 1, maxStep = 1, lastPts = 0, sending = false;
  var TYPE = { both: 'Compare Both', lab: 'Lab-Grown', natural: 'Natural' };

  /* ---------- arriving from the calculator: ?c=ring.18.yellow.lab.VS.0.40 ---------- */
  var from = (function () {
    var m = /[?&]c=([^&]+)/.exec(location.search);
    if (!m || !P) return null;
    var p = decodeURIComponent(m[1]).split('.');
    if (!P.CATEGORY[p[0]]) return null;
    var cfg = { category: p[0], purity: p[1], colour: p[2], dtype: p[3], clarity: p[4], carat: parseFloat(p[5] + '.' + (p[6] || '0')) };
    if (!isFinite(cfg.carat)) return null;
    var e = P.estimate(cfg);
    return {
      code: m[1],
      text: e.catLabel + ' in ' + cfg.purity + 'K ' + cfg.colour + ' gold, ' + cfg.carat.toFixed(2) + ' ct ' + e.stoneLabel.toLowerCase() + ' ' + cfg.clarity,
      price: P.inr(e.total), dtype: cfg.dtype, cfg: cfg
    };
  })();

  /* ---------- the brief: how much a gemologist has to go on ---------- */
  var WORDS = ['Not started', 'A start', 'Good start', 'Strong', 'Very strong', 'Excellent'];
  function noteOk() { return st.note.trim().length >= 20; }
  function hasDesign() { return st.files.length > 0 || !!st.link || noteOk() || !!from; }
  function points() {
    var n = 0, seen = st.files.length > 0 || !!st.link;
    if (seen) n += 2; else if (noteOk() || from) n += 1;
    if (st.files.length >= 2) n += 1;
    if (seen && ((st.files.length && st.link) || noteOk() || from)) n += 1;
    if (st.dtype) n += 1;
    return Math.min(5, n);
  }
  function designText() {
    var a = [];
    if (st.files.length) a.push(st.files.length + (st.files.length === 1 ? ' photo' : ' photos'));
    if (st.link) a.push('link');
    if (noteOk()) a.push('note');
    return a.join(' · ');
  }

  function chip(text) {
    var c = document.createElement('span');
    c.className = 'chip up'; c.textContent = text;
    $('#deltas').innerHTML = ''; $('#deltas').appendChild(c);
  }

  /* ---------- the report on the stage writes itself ---------- */
  var filled = {};
  function line(id, value) {
    var row = $('#' + id), dd = $('dd', row), was = filled[id] || '';
    if (value) value = value.charAt(0).toUpperCase() + value.slice(1);
    dd.textContent = value || 'Waiting';
    row.classList.toggle('is-set', !!value);
    if (value && value !== was && !RM) {
      row.classList.remove('write'); void row.offsetWidth; row.classList.add('write');
      if (!was) chip('Added to Your Report');
    }
    filled[id] = value || '';
  }
  function extras() {
    return [st.occasion, st.budget, st.when].filter(Boolean).join(' · ');
  }
  function status() {
    if (step === 4) return 'On Its Way';
    if (st.first && step === 3) return 'Ready to Send';
    if (st.dtype) return 'Diamonds Chosen';
    if (designText()) return 'Design Received';
    return from ? 'Now Add Your Design' : 'Waiting for Your Design';
  }

  function brief() {
    if (step < 4 && !sending) {
      $('#briefK').textContent = 'Your Price It Report';
      $('#briefW').textContent = status();
      $('#briefS').textContent = extras();
    }
    line('rD', designText());
    line('rS', st.dtype ? TYPE[st.dtype] : '');
    line('rF', st.first);
    $('#live').textContent = status();

    $('#rv1').textContent = designText() || 'Add a Design';
    $('#rv2').textContent = st.dtype ? TYPE[st.dtype] : 'Choose';
    $('#rv3').textContent = st.first || 'Your Details';

    if ($('#n2')) $('#n2').innerHTML = st.dtype === 'both' ? 'Most people are ' + b('surprised by the gap') + '. You will see both totals side by side.'
      : st.dtype === 'lab' ? 'Lab-grown usually brings the same design down by ' + b('40% or more') + '.'
      : st.dtype === 'natural' ? 'We will also note what the ' + b('lab-grown') + ' version would cost.'
      : 'Not sure? ' + b('Compare both') + ' costs nothing extra.';
    $('#n3').innerHTML = st.email && okMail(st.email) ? 'Your report lands at ' + b(esc(st.email)) + ' within 24 hours.'
      : 'Free, itemised, and checked by a gemologist ' + b('within 24 hours') + '.';

    $('#doc').classList.toggle('both', st.dtype === 'both');
    $('#docT').textContent = st.first ? 'Prepared for ' + st.first : 'Your design';
    ready();
    var waLink = $('#waAlt');
    if (waLink) waLink.href = WA + '?text=' + encodeURIComponent('Hi, I’d like a 3Soul jewellery estimate.' + (from ? ' I priced this on Price It: ' + from.text + ', ' + from.price + '.' : ''));
  }

  /* ---------- the stage ---------- */
  var ROT = [-4, 3, -7, 6, -2];
  var ICON = {
    link: '<svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg?v=7#cil-link"/></svg>',
    note: '<svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg?v=7#cil-notes"/></svg>'
  };
  function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function stack() {
    // cards sit under the photos, so a photo is always what you see
    var items = st.link ? [{ card: 'link', t: domain(st.link) }] : [];
    st.files.forEach(function (f) { items.push({ img: f.url }); });
    if (!items.length && noteOk()) items.push({ card: 'note', t: 'Described in words' });
    $('#stack').innerHTML = items.map(function (it, i) {
      return '<div class="ph' + (it.card ? ' card' : '') + '" style="--r:' + ROT[i % 5] + 'deg">' +
        (it.img ? '<img src="' + it.img + '" alt="">' : ICON[it.card] + '<span>' + esc(it.t) + '</span>') + '</div>';
    }).join('');
    stage.classList.toggle('has', items.length > 0);
    if (!items.length) stage.classList.remove('read');
  }
  var scanT;
  // no scanning sweep: the photo simply lands, and the report notes it
  function scan() { stage.classList.add('read'); }


  /* ---------- step 1: photos and link ---------- */
  var fileIn = $('#file'), dz = $('#dz'), thumbs = $('#thumbs');
  function say(t) { $('#msg').textContent = t || ''; }
  function addFiles(list) {
    var added = 0, skipped = '';
    Array.prototype.forEach.call(list, function (f) {
      if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) { skipped = 'Only images can be added.'; return; }
      if (f.size > MAX_MB * 1048576) { skipped = f.name + ' is over ' + MAX_MB + ' MB.'; return; }
      if (st.files.length >= MAX_FILES) { skipped = 'Up to ' + MAX_FILES + ' photos.'; return; }
      st.files.push({ file: f, url: URL.createObjectURL(f), name: f.name });
      added++;
    });
    say(skipped);
    if (added) {
      drawThumbs(); stack(); scan(); brief();
      if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.isActive)) navigator.vibrate(8);
      thumbs.scrollTo({ left: thumbs.scrollWidth, behavior: RM ? 'auto' : 'smooth' });
    }
  }
  function drawThumbs() {
    var has = st.files.length > 0;
    dz.hidden = has; thumbs.hidden = !has;
    thumbs.innerHTML = st.files.map(function (f, i) {
      return '<div class="th"><img src="' + f.url + '" alt="Photo ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="Remove photo ' + (i + 1) + '"><svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg?v=7#cil-x"/></svg></button></div>';
    }).join('') + (st.files.length < MAX_FILES ? '<label class="th add" for="file"><svg class="ic" aria-hidden="true"><use href="assets/img/icons.svg?v=7#cil-plus"/></svg><span>Add</span></label>' : '');
  }
  fileIn.addEventListener('change', function () { addFiles(fileIn.files); fileIn.value = ''; });
  thumbs.addEventListener('click', function (e) {
    var r = e.target.closest('[data-rm]'); if (!r) return;
    var f = st.files.splice(+r.dataset.rm, 1)[0];
    URL.revokeObjectURL(f.url);
    drawThumbs(); stack(); brief();
  });
  // drop on the dropzone, or anywhere on the stage
  [dz, stage].forEach(function (el) {
    el.addEventListener('dragover', function (e) { if (step !== 1) return; e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', function () { el.classList.remove('drag'); });
    el.addEventListener('drop', function (e) {
      if (step !== 1) return;
      e.preventDefault(); el.classList.remove('drag');
      addFiles(e.dataTransfer.files);
    });
  });
  // a screenshot on the clipboard pastes straight in; with nothing on the
  // clipboard, Cmd/Ctrl+V drops in the sample design (demo convenience)
  var SAMPLE = 'assets/img/sample-red-white.avif', pasteTimer = null;
  function pasteSample() {
    fetch(SAMPLE).then(function (r) { return r.blob(); }).then(function (bl) {
      addFiles([new File([bl], 'red-white-ring.avif', { type: 'image/avif' })]);
    }).catch(function () {});
  }
  document.addEventListener('paste', function (e) {
    if (step !== 1 || !e.clipboardData) return;
    var imgs = Array.prototype.filter.call(e.clipboardData.files || [], function (f) { return /^image\//.test(f.type); });
    if (imgs.length) { clearTimeout(pasteTimer); pasteTimer = null; e.preventDefault(); addFiles(imgs); }
  });
  document.addEventListener('keydown', function (e) {
    if (step !== 1 || !(e.metaKey || e.ctrlKey) || (e.key !== 'v' && e.key !== 'V')) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(function () { pasteTimer = null; pasteSample(); }, 150);
  });

  var linkIn = $('#link');
  function readLink() {
    var v = linkIn.value.trim();
    if (v && !/^https?:\/\//i.test(v) && /\.[a-z]{2,}/i.test(v)) v = 'https://' + v;
    var d = domain(v), had = st.link;
    st.link = d && /\./.test(d) ? v : '';
    linkIn.classList.toggle('bad', !!linkIn.value.trim() && !st.link);
    $('#linkChip').textContent = !st.link ? '' : /pinterest|pin\.it/.test(d) ? 'Pinterest' : /instagram/.test(d) ? 'Instagram' : /youtube|youtu\.be/.test(d) ? 'YouTube' : 'Website';
    if (!!st.link !== !!had || (st.link && st.link !== had)) { stack(); if (st.link && !had) scan(); }
    brief();
  }
  linkIn.addEventListener('input', readLink);
  linkIn.addEventListener('blur', readLink);

  /* ---------- step 2: the same design, priced both ways ---------- */
  /* ---------- step 2: quick chips, and the note behind one ---------- */
  Choice.bind($('#chips'), function (k, v) { st[k] = v; brief(); });
  $('#chips').addEventListener('click', function (e) {
    var nt = e.target.closest('#noteT');
    if (nt) {
      var row = $('#noteRow'), open = row.hidden;
      row.hidden = !open;
      nt.setAttribute('aria-expanded', open ? 'true' : 'false');
      nt.classList.toggle('is-on', open);
      if (open) { var ta = $('#note'); setTimeout(function () { ta.focus(); }, 60); }
    }
  });

  /* ---------- step 2 and 3: answers ---------- */
  document.addEventListener('change', function (e) {
    if (e.target.name === 'dtype') { st.dtype = e.target.value; say(''); brief(); }
  });
  $('#note').addEventListener('input', function () { var was = noteOk(); st.note = this.value; if (was !== noteOk()) stack(); brief(); });
  function okMail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  ['first', 'last', 'email', 'phone'].forEach(function (k) {
    $('#' + k).addEventListener('input', function () { st[k] = this.value.trim(); this.classList.remove('bad'); say(''); brief(); });
  });

  /* ---------- navigation ---------- */
  /* DEMO ONLY, remove before launch: Continue always advances, so the flow
     can be clicked through without adding a photo or filling the form. */
  var DEMO_SKIP = true;

  var LABELS = { 1: 'Continue', 2: 'Almost There', 3: 'Send for My Free Report' };

  function valid(n) {
    if (n === 1) return hasDesign();
    if (n === 2) return !!st.dtype && hasDesign();
    if (n === 3) return !!st.first && okMail(st.email) && (!st.phone || st.phone.replace(/\D/g, '').length >= 8);
    return false;
  }
  var wasReady = false;
  function ready() {
    var ok = valid(step) && !sending, btn = $('#next');
    if (ok && !wasReady && !RM) { btn.classList.remove('ready'); void btn.offsetWidth; btn.classList.add('ready'); }
    if (!ok) btn.classList.remove('ready');
    wasReady = ok;
  }

  function check(n) {
    if (n === 1 && !hasDesign()) {
      if (!RM) { dz.classList.remove('shake'); void dz.offsetWidth; dz.classList.add('shake'); }
      return 'Add a photo or a link, or continue and describe it.';
    }
    if (n === 2 && !st.dtype) return 'Choose how you would like it priced.';
    if (n === 2 && !hasDesign()) return 'Add a photo or link, or describe the piece in at least a sentence.';
    if (n === 3) {
      var bad = null;
      if (!st.first) bad = bad || $('#first');
      if (!okMail(st.email)) bad = bad || $('#email');
      if (st.phone && st.phone.replace(/\D/g, '').length < 8) bad = bad || $('#phone');
      if (bad) { bad.classList.add('bad'); bad.focus(); return bad.id === 'first' ? 'Please add your first name.' : bad.id === 'email' ? 'Please enter a valid email address.' : 'That number looks too short.'; }
    }
    return '';
  }

  function chrome() {
    $('#back').disabled = step === 4 || sending;
    $('#rail').style.setProperty('--w', step >= 3 ? 1 : step / 3);
    $$('.slot').forEach(function (g) {
      var n = +g.dataset.go;
      g.classList.toggle('is-now', n === step);
      g.classList.toggle('is-done', n < step || step === 4);
      g.classList.toggle('is-default', n > maxStep);
      g.disabled = n > maxStep || step === 4 || sending;
      g.setAttribute('aria-current', n === step ? 'step' : 'false');
    });
    var fin = step === 4;
    $('#next').hidden = fin; $('#final').hidden = !fin;
    $('#again').hidden = !fin;
    $('#waAlt').hidden = fin; $('#proto').hidden = !fin;
    if (!fin) $('#nextLabel').textContent = sending ? 'Sending…' : LABELS[step];
    $('#next').disabled = sending;
    $('#next').classList.toggle('busy', sending);
    var v = $('#views');
    $('#deck').classList.toggle('more', v.scrollHeight - v.scrollTop - v.clientHeight > 8);
  }
  $('#views').addEventListener('scroll', chrome, { passive: true });

  function swapView(a, z, dir) {
    var out = views[a], inn = views[z];
    inn.hidden = false;
    $('#views').scrollTop = 0;
    if (RM) { out.hidden = true; return; }
    [out, inn].forEach(function (v) { v.getAnimations({ subtree: true }).forEach(function (x) { x.cancel(); }); });
    out.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + -10 * dir + 'px)' }],
      { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = function () { if (+inn.dataset.view === step) out.hidden = true; };
    Array.prototype.forEach.call(inn.children, function (c, i) {
      c.animate([{ opacity: 0, transform: 'translateX(' + 14 * dir + 'px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: 80 + i * 30, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }

  function goTo(n) {
    if (n === step || n < 1 || n > 4) return;
    var a = step, dir = n > a ? 1 : -1;
    step = n; maxStep = Math.max(maxStep, Math.min(n, 3));
    app.dataset.step = n; stage.dataset.stage = n;
    $$('.view').forEach(function (v) { if (+v.dataset.view !== a && +v.dataset.view !== n) v.hidden = true; });
    swapView(a, n, dir);
    say('');
    wasReady = false;
    stage.classList.toggle('is-done', n === 4);
    $('#trk').classList.remove('go');
    if (n === 4) setTimeout(function () { $('#trk').classList.add('go'); }, RM ? 0 : 600);
    brief(); chrome();
    var h = $('.v-h', views[n]); if (h) h.focus({ preventScroll: true });
  }

  /* PROTOTYPE: simulated. At launch, build a FormData with the field
     names listed at the top of this file and POST it here. */
  function send() {
    sending = true; stage.classList.add('sending'); chrome();
    var lines = ['Packing Your Photos', 'Adding Your Notes', 'Sending to Our Gemologists'], i = 0;
    $('#briefK').textContent = 'Your Brief';
    (function tick() {
      $('#briefW').textContent = lines[i]; $('#live').textContent = lines[i];
      if (++i < lines.length) return setTimeout(tick, RM ? 0 : 750);
      setTimeout(done, RM ? 0 : 750);
    })();
  }
  function done() {
    sending = false; stage.classList.remove('sending');
    // PI-, four hex characters, six digits (e.g. PI-A2EF000765)
    var ref = 'PI-' + (Date.now() % 65536).toString(16).toUpperCase().padStart(4, '0') +
      String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    $('#refK').textContent = 'Reference Number: ' + ref;
    $('.v-head.done').classList.remove('go');
    setTimeout(function () { $('.v-head.done').classList.add('go'); }, RM ? 0 : 450);
    $('#h4').textContent = st.first ? 'Thank You, ' + st.first : 'Thank You';
    var eta = new Date(Date.now() + 24 * 3600 * 1000);
    $('#etaT').textContent = eta.getHours() < 10 ? 'Tomorrow Morning' : 'Tomorrow, ' + eta.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(/\s?(am|pm)/i, function (m) { return ' ' + m.trim().toLowerCase(); });
    $('#tlMail').textContent = st.email ? 'at ' + st.email : 'by email';
    $('#wa4').href = WA + '?text=' + encodeURIComponent('Hi, I have a query about my jewellery estimate ' + ref + '.');
    $('#final').href = 'estimate.html' + (from ? '?c=' + from.code : '');
    goTo(4);
    $('#briefK').textContent = 'Your Report';
    $('#briefW').textContent = 'On Its Way';
    $('#briefS').textContent = ref + ' · within 24 hours';
  }

  $('#next').addEventListener('click', function () {
    if (sending) return;
    var err = DEMO_SKIP ? '' : check(step);
    if (err) { say(err); return; }
    if (step === 3) send(); else goTo(step + 1);
  });
  $('#back').addEventListener('click', function () { if (step === 1) showLand(); else goTo(step - 1); });
  $('#rail').addEventListener('click', function (e) { var g = e.target.closest('.slot'); if (g && !g.disabled) goTo(+g.dataset.go); });
  $('#again').addEventListener('click', function () {
    st.files.forEach(function (f) { URL.revokeObjectURL(f.url); });
    st.files = []; st.link = ''; st.note = ''; st.dtype = null; lastPts = 0; maxStep = 1;
    st.budget = st.occasion = st.when = '';
    $$('.cg-o button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    $$('.cg').forEach(function (g) { Choice.setOpen(g, true); $('.cg-v', g).textContent = ''; });
    $('#noteRow').hidden = true; $('#noteT').setAttribute('aria-expanded', 'false');
    linkIn.value = ''; $('#note').value = ''; $('#linkChip').textContent = '';
    $$('input[name="dtype"]').forEach(function (r) { r.checked = false; });
    drawThumbs(); stack(); goTo(1);
  });

  /* ---------- the keyboard: give the form the screen ---------- */
  if (window.visualViewport) {
    var baseH = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', function () {
      var vv = window.visualViewport;
      if (vv.height > baseH) baseH = vv.height;
      var kb = vv.height < baseH * 0.78;
      app.classList.toggle('kb', kb);
      // the page scrolls on its own below 960px, so leave its height alone
      var split = window.innerWidth >= 960;
      app.style.height = kb && split ? vv.height + 'px' : '';
      if (kb && split) window.scrollTo(0, 0);
    });
  }
  document.addEventListener('focusin', function (e) {
    if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.type === 'file' || e.target.type === 'radio') return;
    setTimeout(function () { e.target.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' }); }, 320);
  });

  /* ---------- the landing ---------- */
  var land = $('#land');
  function showFlow(animate) {
    doc().classList.remove('on-land');
    land.hidden = true;
    app.hidden = false;
    window.scrollTo(0, 0);
    if (animate && !RM) {
      app.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    try { history.replaceState(null, '', location.pathname + (from ? '?c=' + from.code : '') + '#start'); } catch (err) {}
    var h = $('.v-h', views[1]); if (h) h.focus({ preventScroll: true });
  }
  function showLand() {
    doc().classList.add('on-land');
    app.hidden = true;
    land.hidden = false;
    window.scrollTo(0, 0);
    if (!RM) land.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
    try { history.replaceState(null, '', location.pathname); } catch (err) {}
  }
  function doc() { return document.documentElement; }
  $('#startBtn').addEventListener('click', function () { showFlow(true); });

  /* ---------- start ---------- */
  if (from) $('#sub1').textContent = 'Now show us the real thing: a photo, a screenshot or a saved post.';
  stack(); brief(); chrome();
  lastPts = points();
  // arriving from the calculator: the estimate rides on the report itself
  if (from) {
    $('#docEst').hidden = false;
    $('#docEstK').textContent = from.text.split(',')[0].replace(/ in /, ', ').replace(/ gold$/, '');
    $('#docEstV').textContent = from.price;
  }
  if (from || /#start/.test(location.hash)) showFlow(false); else showLand();
})();
