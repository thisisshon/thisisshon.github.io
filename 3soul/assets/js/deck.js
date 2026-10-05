/* ============================================================
   Deck controller: nav, routing, the page stage, pins, keyboard.
   ============================================================ */
(function (w, d) {
  'use strict';

  var SEVN = { crit: 'Start here', high: 'High impact', med: 'Worth doing', low: 'Housekeeping' };

  /* ---------- nav ----------
     Scrollspy picks ONE section per frame and only writes to the DOM when it
     actually changes. The previous version reacted to every IntersectionObserver
     entry, so two sections crossing the line at once made the highlight flicker
     between them. The active marker is a single sliding element, so nothing
     appears or disappears mid-scroll. */
  function initNav() {
    var secs = [].slice.call(d.querySelectorAll('main .sec, main .cover')).filter(function (s) { return s.id; });
    var links = [].slice.call(d.querySelectorAll('[data-nav]'));
    var title = d.getElementById('mnavTitle');
    var rail = d.querySelector('.rail');
    var current = null;

    // one sliding marker rather than a border that pops on each link
    var ind = null;
    if (rail) {
      ind = d.createElement('span');
      ind.className = 'rail-ind';
      ind.setAttribute('aria-hidden', 'true');
      rail.appendChild(ind);
    }

    function moveIndicator(a) {
      if (!ind || !a || !rail) return;
      if (!a.closest('.rail')) { ind.style.opacity = '0'; return; }
      // Measure against the rail's own box rather than walking offsetParents, // it stays correct whatever the rail's padding or nesting happens to be.
      var top = Math.round(a.getBoundingClientRect().top - rail.getBoundingClientRect().top);
      ind.style.opacity = '1';
      ind.style.transform = 'translateY(' + top + 'px)';
      ind.style.height = Math.round(a.getBoundingClientRect().height) + 'px';
    }

    function setActive(id) {
      if (id === current) return;              // the fix: never re-write the same state
      current = id;
      var activeLink = null;
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        if (a.classList.contains('on') !== on) a.classList.toggle('on', on);
        if (on) {
          a.setAttribute('aria-current', 'true');
          if (!activeLink && a.closest('.rail')) activeLink = a;
          if (title) title.textContent = a.getAttribute('data-short') || a.textContent.trim();
        } else if (a.hasAttribute('aria-current')) {
          a.removeAttribute('aria-current');
        }
      });
      moveIndicator(activeLink);
    }

    // Time-throttled rather than rAF-driven: rAF is paused in a background or
    // hidden tab, which left the highlight stuck on the wrong item.
    var last = 0, pending = null;
    function measure() {
      last = (w.performance && performance.now) ? performance.now() : +new Date();
      pending = null;
      var line = w.scrollY + w.innerHeight * 0.32;
      var pick = secs[0];
      for (var i = 0; i < secs.length; i++) {
        if (secs[i].offsetTop <= line) pick = secs[i]; else break;
      }
      // at the very bottom the last section is the one being read
      if (w.innerHeight + w.scrollY >= d.body.scrollHeight - 4) pick = secs[secs.length - 1];
      if (pick) setActive(pick.id);
    }
    function onScroll() {
      var now = (w.performance && performance.now) ? performance.now() : +new Date();
      if (now - last > 80) { measure(); return; }
      if (!pending) pending = setTimeout(measure, 90);
    }
    w.addEventListener('scroll', onScroll, { passive: true });
    w.addEventListener('resize', function () {
      current = null;                          // force a re-measure of the marker
      measure();
    });
    measure();

    // mobile drawer
    var tog = d.getElementById('mnavTog'), list = d.getElementById('mnavList');
    if (tog) {
      tog.addEventListener('click', function () {
        var open = list.classList.toggle('open');
        tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      list.addEventListener('click', function (e) {
        if (e.target.closest('a')) { list.classList.remove('open'); tog.setAttribute('aria-expanded', 'false'); }
      });
    }

    function idx() {
      var y = w.scrollY + w.innerHeight * 0.32, best = 0;
      secs.forEach(function (s, i) { if (s.offsetTop <= y) best = i; });
      return best;
    }
    function go(delta) {
      var i = Math.min(secs.length - 1, Math.max(0, idx() + delta));
      secs[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    var pv = d.getElementById('pPrev'), nx = d.getElementById('pNext');
    if (pv) pv.addEventListener('click', function () { go(-1); });
    if (nx) nx.addEventListener('click', function () { go(1); });

    var modal = d.getElementById('kmodal');
    d.addEventListener('keydown', function (e) {
      var t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { if (modal) modal.classList.toggle('open'); e.preventDefault(); return; }
      if (e.key === 'Escape') { if (modal) modal.classList.remove('open'); return; }
      if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
      if (/^[1-9]$/.test(e.key)) {
        var target = links.filter(function (a) { return a.getAttribute('data-key') === e.key; })[0];
        if (target) { var el = d.getElementById(target.getAttribute('href').slice(1));
          if (el) el.scrollIntoView({ behavior: 'smooth' }); e.preventDefault(); }
      }
    });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.remove('open'); });
    var kclose = d.getElementById('kclose');
    if (kclose) kclose.addEventListener('click', function () { modal.classList.remove('open'); });
  }

  /* ============================================================
     The page stage, Current / Flagged / Rebuilt
     ============================================================ */
  function Stage(opts) {
    var box = d.getElementById(opts.id);
    if (!box) return null;
    var device = box.querySelector('.device');
    var screen = box.querySelector('.screen');
    var meterFill = box.querySelector('.meter i');
    var screensLbl = box.querySelector('.screens');
    var pinLayer = null;
    // The stage is not tied to one recreation. `opts.source` supplies
    // { buildPage, FLAGS }; the estimator deck passes nothing and gets
    // PriceItPage, home.html passes HomePage. Everything below reads `src`.
    var src = opts.source || w.PriceItPage;
    if (!src) return null;
    var mode = opts.mode;          // 'current' | 'fixed'
    var view = 'phone';
    var activeFlag = null;
    var filter = 'all';

    function paint() {
      screen.innerHTML = src.buildPage(mode);
      if (opts.flags) {
        pinLayer = d.createElement('div');
        pinLayer.className = 'pinLayer';
        screen.appendChild(pinLayer);
        placePins();
      }
      updateMeter();
      reportUpload();
    }

    function reportUpload() {
      if (!opts.uploadOut) return;
      var node = d.getElementById(opts.uploadOut);
      if (!node) return;
      var drop = screen.querySelector('.pg-drop');
      if (!drop) return;
      var top = drop.offsetTop, p = drop.offsetParent;
      while (p && p !== screen) { top += p.offsetTop; p = p.offsetParent; }
      var vh = screen.clientHeight;
      node.innerHTML = 'Upload box starts at <b>' + Math.round(top) + ' px</b>, ' +
        (top < vh ? 'inside the first screen.' : 'screen ' + (Math.floor(top / vh) + 1) + ', past the fold.');
      node.className = 'uploadOut ' + (top < vh ? 'ok' : 'bad');
    }

    function updateMeter() {
      var h = screen.scrollHeight, vh = screen.clientHeight;
      if (meterFill) {
        var frac = Math.min(1, vh / h);
        meterFill.style.height = (frac * 100) + '%';
        meterFill.style.top = (screen.scrollTop / h * 100) + '%';
      }
      if (screensLbl) {
        var mine = (h / vh).toFixed(1) + ' screens';
        // Compare against the figure measured at THIS view. A page that
        // reflows has two different live heights, and quoting the phone one
        // beside a desktop frame would be worse than quoting neither.
        var L = src.LIVE || null;
        var live = L ? (view === 'desk' ? (L.desk || null) : L) : null;
        screensLbl.innerHTML = (opts.compare && live && live.screens
          ? 'This recreation ' + mine + ' · <b>live page ' + live.screens + '</b>'
          : mine + ' · ' + Math.round(h) + ' px');
      }
    }

    function placePins() {
      if (!pinLayer) return;
      pinLayer.innerHTML = '';
      /* The pin layer lives inside .screen, so its own height counts towards
         screen.scrollHeight. Sizing it from that value without clearing it
         first makes the measurement self-referential: the layer can never
         shrink, because it is propping up the number it is measured against.
         Switching a flagged stage from phone to desktop left the layer at the
         taller phone height, which then held scrollHeight there, throwing off
         the meter, the screens badge and every pin position. Collapse it, read
         the page's real height, then size it. */
      pinLayer.style.height = '0px';
      pinLayer.style.height = screen.scrollHeight + 'px';
      var placed = [];
      src.FLAGS.forEach(function (f) {
        if (!passes(f)) return;
        var anchor = screen.querySelector('[data-fl="' + f.at + '"]');
        if (!anchor) return;
        var top = anchor.offsetTop, left = anchor.offsetLeft, wd = anchor.offsetWidth, ht = anchor.offsetHeight;
        // walk up offsetParent chain inside .screen
        var p = anchor.offsetParent;
        while (p && p !== screen && p !== pinLayer) { top += p.offsetTop; left += p.offsetLeft; p = p.offsetParent; }

        if (activeFlag === f.n) {
          var halo = d.createElement('div');
          halo.className = 'halo ' + f.sev;
          halo.style.cssText = 'top:' + (top - 5) + 'px;left:' + (left - 5) + 'px;width:' + (wd + 10) + 'px;height:' + (ht + 10) + 'px';
          pinLayer.appendChild(halo);
        }
        var px = Math.min(left + wd - 14, screen.clientWidth - 22);
        var py = top;
        // two flags can share a row (the carousel), step them apart so both stay clickable
        for (var g = 0; g < placed.length; g++) {
          if (Math.abs(placed[g][1] - py) < 34 && Math.abs(placed[g][0] - px) < 34) { px -= 36; g = -1; }
        }
        placed.push([px, py]);

        var pin = d.createElement('button');
        pin.type = 'button';
        pin.className = 'pin ' + f.sev + (activeFlag === f.n ? ' on' : '');
        pin.style.cssText = 'top:' + py + 'px;left:' + px + 'px';
        pin.textContent = f.n;
        pin.setAttribute('aria-label', 'Flag ' + f.n + ', ' + SEVN[f.sev] + ': ' + f.title);
        pin.addEventListener('click', function () { select(f.n, true); });
        pinLayer.appendChild(pin);
      });
    }

    function select(n, fromPin) {
      activeFlag = activeFlag === n ? null : n;
      placePins();
      stack();
      if (activeFlag && !fromPin) {
        var a = screen.querySelector('[data-fl="' + src.FLAGS.filter(function (x) { return x.n === activeFlag; })[0].at + '"]');
        if (a) {
          var top = a.offsetTop, p = a.offsetParent;
          while (p && p !== screen) { top += p.offsetTop; p = p.offsetParent; }
          screen.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' });
        }
      }
    }

    /* The selected flag rises to the top of the panel; the one before it
       stays just visible above at low opacity. Everything below follows. */
    function passes(f) {
      if (filter === 'all') return true;
      if (filter === 'wcag') return !!f.wcag;
      return f.sev === filter;
    }

    function stack() {
      if (!opts.listId) return;
      var list = d.getElementById(opts.listId);
      var cards = [].slice.call(list.querySelectorAll('.flag'));
      var activeIdx = -1;
      cards.forEach(function (b, i) {
        var on = parseInt(b.getAttribute('data-n'), 10) === activeFlag;
        if (on) activeIdx = i;
        b.classList.toggle('on', on);
        b.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      cards.forEach(function (b, i) {
        b.classList.remove('above', 'below', 'dim');
        if (activeIdx < 0) return;
        if (i < activeIdx) b.classList.add('above');
        else if (i > activeIdx) b.classList.add('below');
      });
      if (activeIdx < 0) return;
      var card = cards[activeIdx];
      var peek = activeIdx === 0 ? 0 : 46;   // let the previous card show above
      var to = Math.max(0, card.offsetTop - peek);
      var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var from = list.scrollTop;
      try { list.scrollTo({ top: to, behavior: reduce ? 'auto' : 'smooth' }); }
      catch (e) { list.scrollTop = to; }
      // Only step in if the animation never started at all (throttled tab, or an
      // engine that ignored the request). Never interrupt one that is running.
      setTimeout(function () {
        if (list.scrollTop === from && Math.abs(to - from) > 4) {
          var prev = list.style.scrollBehavior;
          list.style.scrollBehavior = 'auto';
          list.scrollTop = to;
          list.style.scrollBehavior = prev;
        }
      }, 420);
      updateStepper();
    }

    function step(delta) {
      var all = src.FLAGS.filter(passes);
      if (!all.length) return;
      var i = all.map(function (f) { return f.n; }).indexOf(activeFlag);
      i = i < 0 ? 0 : Math.min(all.length - 1, Math.max(0, i + delta));
      activeFlag = null;              // force select() to switch rather than toggle off
      select(all[i].n, false);
    }

    function updateStepper() {
      if (!opts.stepperId) return;
      var host = d.getElementById(opts.stepperId);
      if (!host) return;
      var all = src.FLAGS.filter(passes);
      var i = all.map(function (f) { return f.n; }).indexOf(activeFlag);
      var lbl = host.querySelector('.stepLbl');
      if (lbl) lbl.textContent = i < 0 ? all.length + ' flags' : 'Flag ' + (i + 1) + ' of ' + all.length;
      var pv = host.querySelector('[data-step="-1"]'), nx = host.querySelector('[data-step="1"]');
      if (pv) pv.disabled = i <= 0;
      if (nx) nx.disabled = i >= all.length - 1;
    }

    function buildList() {
      if (!opts.listId) return;
      var list = d.getElementById(opts.listId);
      list.innerHTML = '';
      src.FLAGS.forEach(function (f) {
        if (!passes(f)) return;
        var b = d.createElement('button');
        b.type = 'button';
        b.className = 'flag ' + f.sev;
        b.setAttribute('data-n', f.n);
        b.setAttribute('aria-expanded', 'false');
        b.innerHTML = '<span class="n" aria-hidden="true">' + f.n + '</span><span>' +
          '<span class="sv">' + SEVN[f.sev] + ' · ' + f.where + '</span>' +
          '<h4>' + f.title + '</h4>' +
          (f.wcag ? '<span class="wtag">WCAG ' + f.wcag + ', not yet met</span>' : '') +
          '<span class="body"><p>' + f.what + '</p>' +
          '<dl><dt>What we measured</dt><dd><code class="ev">' + f.ev + '</code></dd>' +
          '<dt>Why it’s worth doing</dt><dd>' + f.cost + '</dd></dl></span></span>';
        b.addEventListener('click', function () { select(f.n, false); });
        list.appendChild(b);
      });
    }

    function setView(v) {
      view = v;
      device.className = 'device ' + (v === 'phone' ? 'phone' : 'desk');
      applyDeskWidth();
      requestAnimationFrame(function () { placePins(); updateMeter(); reportUpload(); });
    }

    /* ---- desktop preview: draggable from 1240 to 1920 ----
       The frame is scaled to fit the column, so the page inside is
       laid out at the real width and only its rendering is reduced.
       That way the breakpoints under test are the real ones. */
    var deskW = 1440;
    var VIEWPORT_H = 620;   // the frame keeps this height on screen at every width

    /* Each width gets the viewport height that actually pairs with it on a
       real machine, so the page inside is laid out at a believable aspect, not a fixed 760 that suits none of them. */
    function heightFor(w) {
      if (w < 1340) return 800;    // 1280×800 class
      if (w < 1700) return 900;    // 1440×900
      return 1080;                 // 1920×1080
    }

    function applyDeskWidth() {
      var pane = box.querySelector('.deskpane');
      if (!pane) return;
      pane.hidden = view !== 'desk';
      var wrap = box.querySelector('.devwrap');
      wrap.classList.toggle('deskmode', view === 'desk');
      if (view !== 'desk') {
        device.style.width = ''; device.style.transform = ''; device.style.height = '';
        wrap.style.height = '';
        return;
      }
      var avail = wrap.clientWidth - 76;               // room for both handles
      var h = heightFor(deskW);
      // fit on both axes, so the frame is never clipped by its container
      var scale = Math.min(1, avail / deskW, VIEWPORT_H / h);
      device.style.width = deskW + 'px';
      device.style.height = h + 'px';
      device.style.transform = 'scale(' + scale + ')';
      device.style.transformOrigin = 'center center';
      // Hold the container at the tallest frame it will ever need to show at
      // this width, so dragging between widths never moves the page around it.
      var tallest = 0;
      [1240, 1440, 1920].forEach(function (w2) {
        var h2 = heightFor(w2);
        tallest = Math.max(tallest, h2 * Math.min(1, avail / w2, VIEWPORT_H / h2));
      });
      wrap.style.height = Math.round(tallest + 48) + 'px';
      var lbl = box.querySelector('.deskw');
      if (lbl) lbl.textContent = deskW + ' × ' + h +
        (scale < 1 ? '  ·  ' + Math.round(scale * 100) + '%' : '');
    }

    function initHandles() {
      var pane = box.querySelector('.deskpane');
      if (!pane) return;
      [].forEach.call(pane.querySelectorAll('.dhandle'), function (h) {
        var side = h.getAttribute('data-side') === 'left' ? -1 : 1;
        var startX = 0, startW = 0, dragging = false;
        function down(e) {
          dragging = true; startX = (e.touches ? e.touches[0].clientX : e.clientX); startW = deskW;
          h.setPointerCapture && e.pointerId != null && h.setPointerCapture(e.pointerId);
          d.body.style.userSelect = 'none';
        }
        function move(e) {
          if (!dragging) return;
          var x = (e.touches ? e.touches[0].clientX : e.clientX);
          // both handles widen when dragged outward
          deskW = clamp(Math.round(startW + (x - startX) * 2 * side), 1240, 1920);
          applyDeskWidth();
          requestAnimationFrame(function () { placePins(); updateMeter(); reportUpload(); });
        }
        function up(e) { dragging = false; d.body.style.userSelect = ''; }
        h.addEventListener('pointerdown', down);
        w.addEventListener('pointermove', move);
        w.addEventListener('pointerup', up);
        // keyboard: the handle is a real control, not a mouse-only affordance
        h.addEventListener('keydown', function (e) {
          var step = e.shiftKey ? 80 : 20;
          if (e.key === 'ArrowRight') { deskW = clamp(deskW + step * side, 1240, 1920); }
          else if (e.key === 'ArrowLeft') { deskW = clamp(deskW - step * side, 1240, 1920); }
          else if (e.key === 'Home') { deskW = 1240; }
          else if (e.key === 'End') { deskW = 1920; }
          else return;
          e.preventDefault();
          applyDeskWidth();
          h.setAttribute('aria-valuenow', deskW);
          requestAnimationFrame(function () { placePins(); updateMeter(); reportUpload(); });
        });
      });
      [].forEach.call(pane.querySelectorAll('[data-w]'), function (b) {
        b.addEventListener('click', function () {
          deskW = parseInt(b.getAttribute('data-w'), 10);
          applyDeskWidth();
          requestAnimationFrame(function () { placePins(); updateMeter(); reportUpload(); });
        });
      });
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    screen.addEventListener('scroll', function () {
      if (meterFill) meterFill.style.top = (screen.scrollTop / screen.scrollHeight * 100) + '%';
      if (opts.syncWith && opts.syncWith.screen && !opts.syncWith._lock) {
        opts._lock = true;
        var ratio = screen.scrollTop / Math.max(1, screen.scrollHeight - screen.clientHeight);
        var o = opts.syncWith.screen;
        o.scrollTop = ratio * (o.scrollHeight - o.clientHeight);
        opts._lock = false;
      }
    });

    paint();
    buildList();
    initHandles();
    applyDeskWidth();
    if (opts.listId) {
      var stepper = opts.stepperId && d.getElementById(opts.stepperId);
      if (stepper) {
        stepper.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-step]');
          if (b && !b.disabled) step(parseInt(b.getAttribute('data-step'), 10));
        });
      }
      activeFlag = src.FLAGS[0].n;   // start on flag 1
      placePins();
      stack();
    }

    return {
      screen: screen,
      step: step,
      focusFlag: function (n) {
        if (filter !== 'all' && !passes(src.FLAGS.filter(function (x) { return x.n === n; })[0])) {
          filter = 'all';
          var frow = d.getElementById('sevFilter');
          if (frow) [].forEach.call(frow.querySelectorAll('button[data-sev]'), function (x) {
            x.setAttribute('aria-pressed', x.getAttribute('data-sev') === 'all' ? 'true' : 'false');
          });
          buildList(); placePins();
        }
        activeFlag = null;
        select(n, false);
      },
      setView: setView,
      setMode: function (m) { mode = m; var t = screen.scrollTop; paint(); screen.scrollTop = t; },
      setFilter: function (f) {
        filter = f;
        var all = src.FLAGS.filter(passes);
        activeFlag = all.length ? all[0].n : null;
        buildList(); placePins(); stack();
      },
      relayout: function () { applyDeskWidth(); placePins(); updateMeter(); reportUpload(); }
    };
  }

  /* ---------- section 2/3/5 wiring ---------- */
  function initStages() {
    /* Which recreation this deck is showing. index.html ships PriceItPage and
       four stages; home.html ships HomePage and two. Stage() returns null when
       its host element is absent, so the same code drives both files and the
       toggles below simply find nothing to bind on the deck that lacks them. */
    var source = w.PriceItPage || w.HomePage;
    if (!source) return;

    var stages = {
      current: Stage({ id: 'stageCurrent', mode: 'current', compare: true,
                       uploadOut: 'upCurrent', source: source }),
      flagged: Stage({ id: 'stageFlagged', mode: 'current', flags: true, compare: true,
                       listId: 'flagList', stepperId: 'flagStepper', source: source }),
      rebuilt: Stage({ id: 'stageRebuilt', mode: 'fixed',
                       uploadOut: 'upRebuilt', source: source })
    };

    // viewport toggles
    [].forEach.call(d.querySelectorAll('[data-viewseg]'), function (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-view]'); if (!b) return;
        [].forEach.call(seg.querySelectorAll('button[data-view]'), function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        var s = stages[seg.getAttribute('data-viewseg')] || stages.rebuilt;
        if (s) s.setView(b.getAttribute('data-view'));
      });
    });

    // severity filter
    var frow = d.getElementById('sevFilter');
    if (frow && stages.flagged) {
      frow.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-sev]'); if (!b) return;
        [].forEach.call(frow.querySelectorAll('button[data-sev]'), function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        stages.flagged.setFilter(b.getAttribute('data-sev'));
      });
    }

    // before / after toggle in Section Rebuilt
    var ba = d.getElementById('baSeg');
    if (ba && stages.rebuilt) {
      ba.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-mode]'); if (!b) return;
        [].forEach.call(ba.querySelectorAll('button[data-mode]'), function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        stages.rebuilt.setMode(b.getAttribute('data-mode'));
      });
    }

    initFixList(stages.flagged, source);

    var t;
    w.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        Object.keys(stages).forEach(function (k) { if (stages[k]) stages[k].relayout(); });
      }, 160);
    });
  }

  /* ============================================================
     Spotlight: dim and blur everything except one element for a
     moment. Four fixed panels around the target's rect, so the
     target itself is never filtered and stays perfectly sharp.
     ============================================================ */
  var spotTimer = null, spotRAF = null;
  function spotlight(el, ms) {
    if (!el) return;
    clearSpotlight();
    var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var wrap = d.createElement('div');
    wrap.className = 'spot' + (reduce ? ' noblur' : '');
    wrap.setAttribute('aria-hidden', 'true');
    var parts = [];
    for (var i = 0; i < 4; i++) { var p = d.createElement('div'); p.className = 'spot-p'; wrap.appendChild(p); parts.push(p); }
    var ring = d.createElement('div'); ring.className = 'spot-ring'; wrap.appendChild(ring);
    d.body.appendChild(wrap);

    // Track the element every frame: the page may still be smooth-scrolling,
    // and a spotlight that lags behind the thing it points at is worse than none.
    var lastKey = '', stableFrames = 0;
    function place() {
      var r = el.getBoundingClientRect(), pad = 8;
      var t = r.top - pad, l = r.left - pad, b = r.bottom + pad, rt = r.right + pad;
      // Four blurred panels repositioned every frame is a lot of compositing.
      // Once the geometry stops moving, stop asking for frames.
      var key = t + '|' + l + '|' + b + '|' + rt;
      if (key === lastKey) {
        if (++stableFrames > 6) { spotRAF = null; return; }
      } else { stableFrames = 0; lastKey = key; }
      parts[0].style.cssText = 'top:0;left:0;right:0;height:' + Math.max(0, t) + 'px';
      parts[1].style.cssText = 'top:' + b + 'px;left:0;right:0;bottom:0';
      parts[2].style.cssText = 'top:' + t + 'px;height:' + Math.max(0, b - t) + 'px;left:0;width:' + Math.max(0, l) + 'px';
      parts[3].style.cssText = 'top:' + t + 'px;height:' + Math.max(0, b - t) + 'px;left:' + rt + 'px;right:0';
      ring.style.cssText = 'top:' + t + 'px;left:' + l + 'px;width:' + Math.max(0, rt - l) + 'px;height:' + Math.max(0, b - t) + 'px';
      spotRAF = requestAnimationFrame(place);
    }
    place();
    // Low-rate keep-alive: corrects geometry if the page moves again, and
    // covers the case where rAF is throttled entirely (hidden tab).
    var spotTick = setInterval(function () {
      if (!wrap.parentNode) { clearInterval(spotTick); return; }
      if (spotRAF === null) { stableFrames = 0; place(); }   // restart if it stopped
    }, 150);
    requestAnimationFrame(function () { wrap.classList.add('on'); });
    setTimeout(function () { wrap.classList.add('on'); }, 16);   // rAF-independent
    spotTimer = setTimeout(function () {
      wrap.classList.remove('on');
      setTimeout(function () {
        if (spotRAF) { cancelAnimationFrame(spotRAF); spotRAF = null; }
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, 320);
    }, ms || 2000);
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      w.addEventListener(ev, clearSpotlight, { once: true, passive: true });
    });
  }
  function clearSpotlight() {
    if (spotTimer) { clearTimeout(spotTimer); spotTimer = null; }
    if (spotRAF) { cancelAnimationFrame(spotRAF); spotRAF = null; }
    [].forEach.call(d.querySelectorAll('.spot'), function (n) {
      n.classList.remove('on');
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 320);
    });
  }

  /* Wait for the window to stop moving before starting the 2s clock,
     so the highlight is seen where it lands, not where it set off. */
  function afterScrollSettles(cb) {
    var done = false;
    function fire() { if (done) return; done = true; cb(); }
    var last = -1, still = 0, tries = 0;
    (function tick() {
      if (done) return;
      var y = Math.round(w.scrollY);
      if (y === last) still++; else { still = 0; last = y; }
      if (still >= 3 || ++tries > 90) return fire();
      requestAnimationFrame(tick);
    })();
    // rAF is paused in a hidden tab; never let the highlight depend on it alone
    setTimeout(fire, 800);
  }

  /* ---------- the "what was done" list, built from the flag data ----------
     `shown:true`, visible in the rebuilt page beside this list, and verified there.
     `shown:false`, head markup or asset attributes a visual recreation cannot
     demonstrate. Listed as specification, and labelled as such rather than
     implied to be on screen. */
  function initFixList(flagged, source) {
    var host = d.getElementById('fixList');
    if (!host) return;
    var src = source || w.PriceItPage;
    if (!src) return;
    var DONE = {
      1:  { t: 'Button names what actually happens.', shown: true },
      2:  { t: 'One poster that plays on tap, in place of four autoplaying files.', shown: true },
      3:  { t: 'Kickers and labels darkened to clear 4.5:1.', shown: true },
      4:  { t: 'Every field has a visible label tied to its input.', shown: true },
      5:  { t: 'Autofill on, numeric keypad for phone, phone optional, email required.', shown: true },
      6:  { t: 'Real H1 on the page.', shown: true,
            spec: 'FAQ, tool, breadcrumb and rating schema, head markup, not visible here.' },
      7:  { t: 'Sample report as images, not a PDF in a frame.', shown: true },
      8:  { t: 'Nothing autoplays; the one video is behind a control.', shown: true },
      9:  { t: 'Body copy at 16px, nothing below 11px, every control 44px and up.', shown: true },
      10: { t: 'Upload moved into the first screen.', shown: true },
      11: { t: 'Six testimonials, once each, instead of twelve cards for six people.', shown: true },
      12: { t: 'Six city pages with real local content, not twenty-four near-copies.', shown: true,
            spec: 'The footer’s Bengaluru link is a 404, the page exists at /diamond-price-in-bangalore. A URL fix, so not something this recreation can show.' },
      13: { t: 'Alt text on every image that carries meaning.', shown: false,
            spec: 'An attribute on the real images; this recreation draws placeholders, so there is nothing here to caption.' },
      14: { t: 'Mihir’s copy rewritten; Nashua corrected to Nashik.', shown: true },
      15: { t: 'Title trimmed, social image reshaped to landscape over https, images sized to their slot and lazy-loaded.', shown: false,
            spec: 'All of it lives in the document head or in image attributes, nothing a rendered page can show.' }
    };
    host.innerHTML = '';
    src.FLAGS.forEach(function (f) {
      var info = DONE[f.n] || { t: f.title, shown: true };
      var li = d.createElement('li');
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'fixref' + (f.wcag ? ' w' : '');
      b.textContent = f.n;
      b.setAttribute('aria-label', 'Go to finding ' + f.n + ': ' + f.title);
      b.addEventListener('click', function () { jumpToFlag(f.n, flagged); });
      li.appendChild(b);
      var span = d.createElement('span');
      span.innerHTML = info.t +
        (info.shown ? '' : ' <em class="specTag">not shown here</em>') +
        (info.spec ? '<span class="specNote">' + info.spec + '</span>' : '');
      li.appendChild(span);
      host.appendChild(li);
    });
  }

  function jumpToFlag(n, flagged) {
    var sec = d.getElementById('s3');
    if (!sec || !flagged) return;
    var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    flagged.focusFlag(n);
    afterScrollSettles(function () {
      var card = d.querySelector('#flagList .flag.on');
      if (!card) return;
      card.focus({ preventScroll: true });
      spotlight(card, 2000);
    });
  }

  /* ---------- this deck's own weight, printed at the end ---------- */
  function initSelfMeasure() {
    var host = d.getElementById('selfPerf');
    if (!host) return;
    function read() {
      var res = performance.getEntriesByType('resource') || [];
      var nav = performance.getEntriesByType('navigation')[0] || {};
      var bytes = res.reduce(function (a, r) { return a + (r.transferSize || r.encodedBodySize || 0); }, 0)
                + (nav.encodedBodySize || 0);
      var kb = bytes / 1024;
      var size = kb < 1024 ? Math.round(kb) + ' KB' : (kb / 1024).toFixed(2) + ' MB';
      // Deliberately no paint timing on either side, see the note in Evidence.
      var srcW = ((w.PriceItPage || w.HomePage || {}).WEIGHT) || null;
      if (!srcW) { host.innerHTML = ''; return; }
      host.innerHTML =
        '<div class="card"><b class="g">' + size + '</b><span>This page, transferred just now</span></div>' +
        '<div class="card"><b class="r">' + srcW.transfer + '</b><span>' + srcW.name + ', ' + srcW.transferNote + '</span></div>' +
        '<div class="card"><b class="g">' + res.length + '</b><span>This page, requests</span></div>' +
        '<div class="card"><b class="r">' + srcW.requests + '</b><span>' + srcW.name + ', requests</span></div>' +
        '<div class="card"><b class="g">0 MB</b><span>This page, video</span></div>' +
        '<div class="card"><b class="r">' + srcW.video + '</b><span>' + srcW.name + ', ' + srcW.videoNote + '</span></div>';
    }
    if (d.readyState === 'complete') setTimeout(read, 300);
    else w.addEventListener('load', function () { setTimeout(read, 300); });
  }

  /* ============================================================
     Scroll containment, only when there is something to contain.

     `.screen` frames get `overscroll-behavior-y:contain` so hitting the
     bottom of a prototype does not throw the page behind it. But a frame
     whose content is shorter than the frame never leaves its y-boundary,
     and `contain` there swallows the wheel outright, the page locks up
     under the cursor. So the containment rides on a class, and the class
     tracks the one condition that justifies it.

     Content height is not directly observable, so the watcher listens on
     three fronts: the frame's own box (device width/height changes), the
     boxes of its direct children (images and fonts settling in), and DOM
     mutations (Stage.paint() replacing innerHTML wholesale). Re-observing
     children on mutation keeps the second front pointed at live nodes.
     ============================================================ */
  function initScrollGates() {
    var frames = [].slice.call(d.querySelectorAll('.screen'));
    if (!frames.length) return;

    var hasRO = typeof w.ResizeObserver === 'function';

    frames.forEach(function (frame) {
      var queued = false;
      function sync() {
        queued = false;
        // 1px of slack: sub-pixel layout rounding otherwise reports a
        // one-off overflow on frames that are really flush.
        var scrolls = frame.scrollHeight - frame.clientHeight > 1;
        frame.classList.toggle('scrolls-y', scrolls);
      }
      // rAF coalesces the burst of callbacks a repaint fires, but it is
      // paused while the tab is hidden, so a timer runs alongside it and
      // whichever lands first does the work. Without it, a frame that
      // changes in a background tab keeps a stale class.
      function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(sync);
        setTimeout(sync, 100);
      }

      var ro = null;
      if (hasRO) {
        ro = new w.ResizeObserver(schedule);
        ro.observe(frame);
      }
      function watchChildren() {
        if (!ro) return;
        [].forEach.call(frame.children, function (c) { ro.observe(c); });
      }
      watchChildren();

      if (typeof w.MutationObserver === 'function') {
        new w.MutationObserver(function () {
          watchChildren();
          schedule();
        }).observe(frame, { childList: true, subtree: true, characterData: true });
      }

      // fonts and late images move the content height without touching the DOM
      if (d.fonts && d.fonts.ready && d.fonts.ready.then) d.fonts.ready.then(schedule);
      w.addEventListener('load', schedule);
      if (!hasRO) w.addEventListener('resize', schedule);

      // Both observers are driven by the rendering steps, which a hidden tab
      // does not run, a frame that changes in the background would carry a
      // stale class until the tab is looked at again. These two close that
      // gap from the other end: `visibilitychange` catches up on everything
      // missed, and `pointerenter` re-checks at the one instant the class
      // decides anything, which is the cursor arriving over the frame.
      d.addEventListener('visibilitychange', function () { if (!d.hidden) sync(); });
      frame.addEventListener('pointerenter', sync);

      sync();
    });
  }

  function boot() {
    initNav();
    initStages();
    if (w.Prototypes) w.Prototypes.init();
    initSelfMeasure();
    initScrollGates();   // after the stages have painted their first frame
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
