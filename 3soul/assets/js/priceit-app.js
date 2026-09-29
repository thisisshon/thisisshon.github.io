/* ============================================================
   Price It — the final calculator.

   THE MODEL
   The live page is a lead form: upload, wait 24 hours, receive a
   report. Its own title, its search traffic and its closing button
   all promise a number, and the screen after the phone field says
   "Thanks for sharing your details." This page keeps the whole of
   that business — the upload, the expert review, the 24-hour
   report, the WhatsApp route — and puts an instant number in front
   of it. Nothing is removed; the order is corrected.

   THE OPTIONS ARE THE REAL ONES
   Read from /products.json on 7 Sep 2026: 250 products, 13,835
   variants. Metal is 9K/10K/14K/18K, never 22K. Gold colour is
   yellow, white or rose on 245 of them. Clarity is SI, VS or VVS.
   The configurator mirrors that matrix exactly, so every
   combination it prices is one the shop can actually make, and the
   "120+ options" promised in the marketing is shown live instead
   of arriving a day later.

   Depends on pricing.js (window.PriceIt).
   ============================================================ */
(function (w, d) {
  'use strict';

  var E = w.PriceIt;
  if (!E) return;

  /* ---------- instrumentation ---------- */
  var events = [], dbg = null, started = false, shown = false;

  function track(name, detail) {
    events.push({ name: name, at: Math.round(performance.now()), detail: detail || null });
    if (w.dataLayer && typeof w.dataLayer.push === 'function') {
      w.dataLayer.push({ event: 'priceit_' + name, priceit: detail || {} });
    }
    if (dbg) paintDebug();
  }

  function paintDebug() {
    dbg.innerHTML = '<h5>Funnel &middot; ' + events.length + '</h5>' +
      events.slice(-14).map(function (e) {
        var v = e.detail && e.detail.total ? E.inr(e.detail.total) : (e.at + 'ms');
        return '<div><span>' + e.name + '</span><em>' + v + '</em></div>';
      }).join('');
  }

  /* ---------- state ---------- */
  var cfg = E.defaults();
  var files = [];

  function readForm() {
    function pick(n, fallback) {
      var el = d.querySelector('input[name="' + n + '"]:checked');
      return el ? el.value : fallback;
    }
    cfg.category = pick('f-cat', cfg.category);
    cfg.purity = pick('f-pur', cfg.purity);
    cfg.colour = pick('f-col', cfg.colour);
    cfg.dtype = pick('f-type', cfg.dtype);
    cfg.clarity = pick('f-clar', cfg.clarity);
    var ct = d.getElementById('fCarat');
    if (ct) cfg.carat = parseFloat(ct.value);
  }

  /* ---------- the estimate ---------- */
  function render() {
    var r = E.estimate(cfg);

    var totalEl = d.getElementById('eTotal');
    if (totalEl && totalEl.textContent && totalEl.textContent !== E.inr(r.total)) {
      // a brief lift, so a changed figure registers without a count-up
      totalEl.classList.add('tick');
      w.setTimeout(function () { totalEl.classList.remove('tick'); }, 180);
      var rowsEl = d.getElementById('eRows');
      if (rowsEl) {
        rowsEl.classList.add('tick');
        w.setTimeout(function () { rowsEl.classList.remove('tick'); }, 420);
      }
    }
    set('eTotal', E.inr(r.total));
    set('eSpec', [r.catLabel, cfg.purity + 'K ' + (r.colourLabel || '').toLowerCase(),
                  r.stoneLabel + ' ' + (r.clarityLabel || ''),
                  r.carat.toFixed(2) + ' ct'].join(' · '));
    set('eBand', 'Typically ' + E.inr(r.low) + ' to ' + E.inr(r.high) +
      ' once we price your exact stones.');
    set('stickyVal', E.inr(r.total));

    var rows = d.getElementById('eRows');
    if (rows) {
      rows.innerHTML = r.rows.map(function (row) {
        return '<div class="row"><span class="d">' + row[0] + '</span>' +
          '<span class="v">' + E.inr(row[1]) + '</span></div>';
      }).join('') +
        '<div class="row sum"><span class="d">Estimated total</span>' +
        '<span class="v">' + E.inr(r.total) + '</span></div>';
    }

    var ct = d.getElementById('fCarat');
    if (ct) {
      ct.style.setProperty('--fill', ((ct.value - ct.min) / (ct.max - ct.min)) * 100 + '%');
      set('fCaratVal', parseFloat(ct.value).toFixed(2) + ' ct');
    }

    renderGrid(r);
    if (!shown) { shown = true; track('estimate_shown', { total: Math.round(r.total) }); }
    return r;
  }

  function set(id, text) { var el = d.getElementById(id); if (el) el.textContent = text; }

  /* ------------------------------------------------------------
     The combination grid.

     3 metals x 2 diamond types x 3 clarities = 18 prices for the
     piece and carat on screen, and x3 gold colours is the 54 the
     report promises. The cheapest and the current one are marked,
     because the reason someone wants 120 options is to find the
     one they can afford.
     ------------------------------------------------------------ */
  function renderGrid(current) {
    var host = d.getElementById('eGrid');
    if (!host) return;
    var all = E.combinations(cfg);
    var min = Math.min.apply(null, all.map(function (x) { return x.total; }));

    host.innerHTML = all.map(function (x) {
      var isNow = x.purity === cfg.purity && x.dtype === cfg.dtype && x.clarity === cfg.clarity;
      var isMin = x.total === min;
      return '<button type="button" class="cmb' + (isNow ? ' now' : '') + (isMin ? ' min' : '') + '"' +
        ' data-pur="' + x.purity + '" data-type="' + x.dtype + '" data-clar="' + x.clarity + '">' +
        '<span class="cmb-k">' + x.purity + 'K · ' +
        (x.dtype === 'lab' ? 'Lab' : 'Natural') + ' · ' + x.clarity + '</span>' +
        '<span class="cmb-v">' + E.inr(x.total) + '</span>' +
        (isMin ? '<span class="cmb-b">Lowest</span>' : '') +
        (isNow ? '<span class="cmb-b now">Selected</span>' : '') +
        '</button>';
    }).join('');

    set('eGridNote', all.length + ' combinations shown · ' + (all.length * 3) +
      ' with gold colour · from ' + E.inr(min) + ' to ' +
      E.inr(Math.max.apply(null, all.map(function (x) { return x.total; }))));
  }

  function onChange(what) {
    readForm();
    if (!started) { started = true; track('configurator_start', { field: what }); }
    var r = render();
    track('config_change', { field: what, total: Math.round(r.total) });
  }

  function initConfigurator() {
    ['f-cat', 'f-pur', 'f-col', 'f-type', 'f-clar'].forEach(function (name) {
      [].forEach.call(d.querySelectorAll('input[name="' + name + '"]'), function (el) {
        el.addEventListener('change', function () { onChange(name); });
      });
    });
    var ct = d.getElementById('fCarat');
    if (ct) {
      // 'input' repaints, 'change' is the tracked interaction, so one
      // drag is a single funnel event rather than forty.
      ct.addEventListener('input', function () { readForm(); render(); });
      ct.addEventListener('change', function () { onChange('carat'); });
    }

    // clicking a combination adopts it
    var grid = d.getElementById('eGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var b = e.target.closest('.cmb'); if (!b) return;
        check('f-pur', b.getAttribute('data-pur'));
        check('f-type', b.getAttribute('data-type'));
        check('f-clar', b.getAttribute('data-clar'));
        track('combination_picked', { purity: b.getAttribute('data-pur') });
        onChange('grid');
      });
    }
  }

  function check(name, value) {
    var el = d.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (el) el.checked = true;
  }

  /* ------------------------------------------------------------
     The upload path, kept whole.

     Up to five images, a pasted link and a note, exactly as the live
     form takes them. What changed is where it sits: behind the
     number rather than in front of it, and framed as the route to
     the expert-checked report rather than as the only way to see a
     price. Nothing leaves the browser in this prototype.
     ------------------------------------------------------------ */
  function initUpload() {
    var drop = d.getElementById('drop');
    var input = d.getElementById('file');
    var list = d.getElementById('thumbs');
    if (!drop || !input) return;

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('dragover', function (e) {
      e.preventDefault(); drop.classList.add('over');
    });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('over');
      add(e.dataTransfer && e.dataTransfer.files);
    });
    input.addEventListener('change', function () { add(input.files); });

    function add(fl) {
      if (!fl) return;
      [].forEach.call(fl, function (f) {
        if (files.length >= 5 || !/^image\//.test(f.type)) return;
        files.push(f);
      });
      track('photo_added', { count: files.length });
      paint();
    }

    function paint() {
      if (!list) return;
      list.innerHTML = '';
      files.forEach(function (f, i) {
        var t = d.createElement('div');
        t.className = 'thumb';
        var img = d.createElement('img');
        img.alt = f.name;
        // revoked on load so a long session does not hold blobs open
        var url = URL.createObjectURL(f);
        img.src = url;
        img.addEventListener('load', function () { URL.revokeObjectURL(url); });
        var x = d.createElement('button');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove ' + f.name);
        x.textContent = '×';
        x.addEventListener('click', function () { files.splice(i, 1); paint(); });
        t.appendChild(img); t.appendChild(x);
        list.appendChild(t);
      });
      var n = d.getElementById('dropNote');
      if (n) {
        n.textContent = files.length
          ? files.length + ' of 5 added. Our gemologists price your exact design against these.'
          : 'Up to 5 images. A screenshot, a Pinterest save or a sketch all work.';
      }
    }
  }

  /* ---------- the ask ---------- */
  function initAsk() {
    var form = d.getElementById('askForm');
    if (!form) return;
    var done = d.getElementById('askDone');
    var email = d.getElementById('fEmail');
    var terms = d.getElementById('fTerms');

    function err(el, msg) {
      var box = d.getElementById(el.id + 'Err');
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (box) box.textContent = msg || '';
      return !msg;
    }
    function okEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }

    function check2() {
      var ok = true;
      if (!okEmail(email.value)) {
        ok = err(email, 'Enter an email address so we can send the report.') && ok;
      } else err(email, '');
      var te = d.getElementById('fTermsErr');
      if (!terms.checked) { if (te) te.textContent = 'Please accept the terms to continue.'; ok = false; }
      else if (te) te.textContent = '';
      return ok;
    }

    email.addEventListener('blur', function () {
      if (email.getAttribute('aria-invalid') === 'true') check2();
    });
    terms.addEventListener('change', function () {
      if (terms.checked) { var t = d.getElementById('fTermsErr'); if (t) t.textContent = ''; }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!check2()) {
        track('report_rejected', null);
        var bad = form.querySelector('[aria-invalid=true]') || terms;
        if (bad && bad.focus) bad.focus();
        return;
      }
      var r = E.estimate(cfg);
      track('report_requested', {
        total: Math.round(r.total), category: cfg.category,
        photos: files.length, link: !!(d.getElementById('fLink') || {}).value
      });
      form.hidden = true;
      if (done) { done.classList.add('on'); done.setAttribute('tabindex', '-1'); done.focus(); }
      var bar = d.getElementById('sticky');
      if (bar) bar.classList.remove('on');   // nothing left to prompt
    });
  }

  /* ---------- posters, in place of nine autoplaying loops ---------- */
  function initReels() {
    [].forEach.call(d.querySelectorAll('.reel'), function (p) {
      p.addEventListener('click', function () {
        var src = p.getAttribute('data-src');
        track('video_play', { src: src || null });
        if (!src) {
          var t = p.querySelector('.tag');
          if (t) t.textContent = 'Film loads on tap';
          return;
        }
        var v = d.createElement('video');
        v.src = src; v.controls = true; v.autoplay = true; v.playsInline = true;
        v.setAttribute('preload', 'none');
        p.innerHTML = ''; p.appendChild(v);
      });
    });
  }

  function initFaq() {
    [].forEach.call(d.querySelectorAll('.faq'), function (f) {
      f.addEventListener('toggle', function () {
        if (f.open) {
          var q = f.querySelector('summary');
          track('faq_open', { q: q ? q.textContent.trim().slice(0, 60) : null });
        }
      });
    });
  }

  /* ------------------------------------------------------------
     Image slots.

     Each .img draws its own labelled placeholder until the real file
     lands in assets/img/. On load the photograph fades over it; on
     error the placeholder simply stays, so a missing file is a
     designed empty state rather than a broken icon or a collapsed
     box. The layout is final before the photography is.
     ------------------------------------------------------------ */
  function initImages() {
    [].forEach.call(d.querySelectorAll('.img img'), function (img) {
      function on() { img.classList.add('on'); }
      if (img.complete && img.naturalWidth > 0) on();
      else img.addEventListener('load', on);
      img.addEventListener('error', function () { img.removeAttribute('src'); });
    });
  }

  /* ---------- sticky summary ---------- */
  function initSticky() {
    var bar = d.getElementById('sticky');
    /* Watch the upload card, not the estimate. The bar exists to carry
       the primary action once it scrolls away; keying it to the
       calculator meant it appeared 3.8 screens in and advertised a
       supporting number instead of the offer. */
    var est = d.getElementById('heroUpload') || d.getElementById('est');
    if (!bar || !est) return;
    /* Driven by scroll rather than IntersectionObserver alone: the bar
       is the only route back to the number once it has gone, and an
       observer is suspended whenever the rendering steps are. */
    var ticking = false;
    function sync() { ticking = false; bar.classList.toggle('on', est.getBoundingClientRect().bottom < 72); }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sync);
      setTimeout(sync, 120);
    }
    w.addEventListener('scroll', onScroll, { passive: true });
    w.addEventListener('resize', onScroll);
    sync();
  }

  /* The combination fold starts open where there is room for it beside
     the estimate, and closed on a phone where it would otherwise sit
     between the configurator and everything below. Set once on load;
     after that it is the reader's to open and close. */
  function initGridFold() {
    var f = d.getElementById('gridFold');
    if (!f) return;
    if (w.matchMedia && w.matchMedia('(min-width: 1000px)').matches) f.open = true;
    f.addEventListener('toggle', function () {
      if (f.open) track('combinations_opened', null);
    });
  }

  function initDebug() {
    if (!/[?&]debug=1/.test(w.location.search)) return;
    dbg = d.createElement('div');
    dbg.className = 'dbg';
    dbg.setAttribute('aria-hidden', 'true');
    d.body.appendChild(dbg);
    paintDebug();
  }

  /* The hero backdrop is optional. Probe for it and only then let the
     CSS layer paint, so an absent file costs no 404 and no flash. */
  function initBackdrop() {
    var hero = d.querySelector('.hero');
    if (!hero) return;
    var probe = new Image();
    probe.onload = function () {
      /* The class is added only once the file has decoded, so the
         settle animation always plays against a painted image rather
         than fading in an empty layer. */
      hero.classList.add('has-backdrop');
    };
    probe.src = (window.ASSET_BASE || '') + 'assets/img/hero-backdrop.jpg';
  }

  /* ------------------------------------------------------------
     Motion.

     Reveals are driven by IntersectionObserver where it runs and by a
     scroll handler where it does not, because a page whose content is
     hidden until an observer fires is a page that can end up blank.
     If neither is available every element is revealed immediately.
     ------------------------------------------------------------ */
  function initMotion() {
    var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // sections reveal as blocks; card sets reveal their children in sequence
    var solo = [].slice.call(d.querySelectorAll('.sec-head, .est, .report, .founders, .vs, .govt-in, .give, .stats'));
    var groups = [].slice.call(d.querySelectorAll('.cases, .revs, .who-grid, .steps, .trust, .reels, .faqs, .hero-badges'));

    if (reduce) {
      solo.forEach(function (e) { e.classList.add('rv', 'rv-on'); });
      groups.forEach(function (e) { e.classList.add('rv-group', 'rv-on'); });
      return;
    }

    solo.forEach(function (e) { e.classList.add('rv'); });
    groups.forEach(function (e) { e.classList.add('rv-group'); });
    var all = solo.concat(groups);

    function show(el) { el.classList.add('rv-on'); }

    if (typeof w.IntersectionObserver === 'function') {
      var io = new w.IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          show(en.target);
          io.unobserve(en.target);   // reveal once, never re-hide
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });
      all.forEach(function (e) { io.observe(e); });
    }

    /* Belt and braces: an observer is driven by the rendering steps and
       delivers nothing while they are suspended. This sweep runs on
       scroll and on a timer, so content cannot stay invisible. */
    function sweep() {
      var vh = w.innerHeight || d.documentElement.clientHeight;
      all.forEach(function (e) {
        if (e.classList.contains('rv-on')) return;
        if (e.getBoundingClientRect().top < vh * 0.94) show(e);
      });
    }
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; sweep(); });
      setTimeout(function () { ticking = false; sweep(); }, 140);
    }
    w.addEventListener('scroll', onScroll, { passive: true });
    w.addEventListener('resize', onScroll);
    sweep();
    // last resort: nothing stays hidden longer than two seconds
    setTimeout(function () { all.forEach(show); }, 2000);
  }

  /* The hero animates only if we opt in, and is force-shown shortly
     after whether or not the animation ran. */
  function initHeroAnim() {
    var hero = d.querySelector('.hero');
    if (!hero) return;
    var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { hero.classList.add('anim-done'); return; }
    hero.classList.add('anim');
    /* Longest sequence is the backdrop: 120ms delay + 2200ms settle.
       anim-done is the failsafe that forces the finished state, so it
       must not fire before the animation would legitimately end. */
    w.setTimeout(function () { hero.classList.add('anim-done'); }, 2600);
  }

  /* the header gains a shadow once the page has moved */
  function initHeader() {
    var hd = d.querySelector('.hd');
    if (!hd) return;
    function sync() { hd.classList.toggle('stuck', (w.pageYOffset || 0) > 8); }
    w.addEventListener('scroll', sync, { passive: true });
    sync();
  }

  function boot() {
    initDebug();
    initBackdrop();
    initImages();
    readForm();
    render();
    initConfigurator();
    initUpload();
    initAsk();
    initReels();
    initFaq();
    initSticky();
    initGridFold();
    initHeader();
    initHeroAnim();
    initMotion();
    track('page_ready', null);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();

  w.PriceItApp = { events: function () { return events.slice(); }, config: function () { return cfg; } };
})(window, document);
