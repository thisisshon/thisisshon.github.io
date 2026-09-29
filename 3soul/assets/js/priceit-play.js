/* ============================================================
   Price It, play (v3 concept): the configurator as a piece
   being made. Four steps and a reveal on one persistent stage.
   Every number comes from pricing.js, unchanged, so the totals
   match v1 and v2 exactly.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PriceIt;
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- geometry ---------- */
  function circ(cx, cy, r) {
    return 'M' + r2(cx - r) + ',' + r2(cy) + 'a' + r + ',' + r + ' 0 1,0 ' + r2(2 * r) + ',0a' +
      r + ',' + r + ' 0 1,0 ' + r2(-2 * r) + ',0Z';
  }
  function quad(a, b, c, t) {
    var u = 1 - t;
    return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
  }
  function polar(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  /* ------------------------------------------------------------
     The seven pieces, drawn on a 240 unit stage.
     m: metal parts. k 'f' is a filled shape, 's' a stroked wire,
        'bead' a black mangalsutra bead.
     s: stones as [x, y, r].
     focus: where the camera leans in on the size step.
     ------------------------------------------------------------ */
  var PIECES = {
    ring: function () {
      var m = [
        { k: 'f', d: circ(120, 152, 62) + circ(120, 152, 50) },
        { k: 'f', d: 'M101,84 L139,84 L131,98 L109,98 Z' },
        { k: 's', d: 'M103,49 L108,88', w: 3 },
        { k: 's', d: 'M137,49 L132,88', w: 3 },
        { k: 'f', d: circ(103, 49, 2.8) },
        { k: 'f', d: circ(137, 49, 2.8) }
      ];
      var s = [[120, 66, 22]];
      [-118, -134, -150, -62, -46, -30].forEach(function (a) {
        var p = polar(120, 152, 56, a); s.push([p[0], p[1], 4]);
      });
      return { m: m, s: s, focus: [120, 74], pour: 120 };
    },

    earrings: function () {
      var m = [], s = [];
      [76, 164].forEach(function (x) {
        m.push({ k: 'f', d: circ(x, 56, 15) + circ(x, 56, 11) });
        m.push({ k: 's', d: 'M' + x + ',71 L' + x + ',116', w: 2.6 });
        m.push({ k: 'f', d: 'M' + (x - 30) + ',150 C' + (x - 30) + ',108 ' + (x + 30) + ',108 ' + (x + 30) + ',150 Z' });
        m.push({ k: 'f', d: 'M' + (x - 33) + ',148 h66 v7 h-66 Z' });
        for (var i = -2; i <= 2; i++) {
          m.push({ k: 's', d: 'M' + (x + i * 12) + ',155 L' + (x + i * 12) + ',161', w: 1.4 });
          m.push({ k: 'f', d: circ(x + i * 12, 164, 3.4) });
        }
        s.push([x, 56, 11], [x - 14, 137, 4.8], [x, 130, 5.4], [x + 14, 137, 4.8]);
      });
      return { m: m, s: s, focus: [76, 104], pour: 76 };
    },

    pendant: function () {
      var m = [
        { k: 's', d: 'M36,16 Q120,154 204,16', w: 2.2 },
        { k: 'f', d: 'M114,86 a6,6 0 0,1 12,0 v16 h-12 Z' },
        { k: 'f', d: circ(120, 138, 36) + circ(120, 138, 23) }
      ];
      var s = [[120, 138, 20]];
      for (var i = 0; i < 10; i++) {
        var p = polar(120, 138, 29.5, i * 36 - 90); s.push([p[0], p[1], 4.4]);
      }
      return { m: m, s: s, focus: [120, 138], pour: 120 };
    },

    bracelet: function () {
      var cx = 120, cy = 122, rx = 90, ry = 46, m = [], s = [];
      m.push({ k: 's', d: 'M30,122 A90,46 0 0,1 210,122', w: 4, o: .5 });
      m.push({ k: 's', d: 'M30,122 A90,46 0 0,0 210,122', w: 4 });
      for (var i = 0; i <= 12; i++) {
        var a = Math.PI * (0.06 + 0.88 * i / 12);
        var x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a), r = 4.2 + 2.6 * Math.sin(a);
        m.push({ k: 'f', d: circ(r2(x), r2(y), r2(r + 2)) });
        s.push([x, y, r]);
      }
      return { m: m, s: s, focus: [120, 166], pour: 120 };
    },

    bangle: function () {
      var m = [{ k: 'f', d: circ(120, 124, 84) + circ(120, 124, 67) }], s = [];
      for (var a = -150; a <= -30; a += 15) { var p = polar(120, 124, 75.5, a); s.push([p[0], p[1], 5.6]); }
      [70, 90, 110].forEach(function (a) { var q = polar(120, 124, 75.5, a); s.push([q[0], q[1], 4.6]); });
      return { m: m, s: s, focus: [120, 60], pour: 120 };
    },

    mangalsutra: function () {
      var m = [], s = [];
      [[[46, 14], [58, 96], [114, 118]], [[194, 14], [182, 96], [126, 118]]].forEach(function (c) {
        for (var i = 0; i < 17; i++) {
          var p = quad(c[0], c[1], c[2], 0.03 + 0.94 * i / 16);
          m.push(i % 5 === 2 ? { k: 'f', d: circ(r2(p[0]), r2(p[1]), 3.4) } : { k: 'bead', d: circ(r2(p[0]), r2(p[1]), 2.9) });
        }
      });
      m.push({ k: 'f', d: circ(120, 122, 6.5) + circ(120, 122, 3.2) });
      m.push({ k: 'f', d: 'M120,128 C150,148 150,188 120,206 C90,188 90,148 120,128 Z' +
                          'M120,142 C140,156 140,184 120,196 C100,184 100,156 120,142 Z' });
      s.push([120, 170, 11], [120, 151, 3.6], [120, 189, 3.6]);
      return { m: m, s: s, focus: [120, 168], pour: 120 };
    },

    necklace: function () {
      var a = [26, 26], b = [120, 214], c = [214, 26], m = [], s = [];
      m.push({ k: 's', d: 'M26,26 Q120,214 214,26', w: 2.4 });
      for (var i = 0; i < 15; i++) {
        var t = 0.14 + 0.72 * i / 14, p = quad(a, b, c, t);
        var g = 1 - Math.abs(t - 0.5) / 0.36, r = 3.6 + 4.6 * g;
        m.push({ k: 'f', d: circ(r2(p[0]), r2(p[1]), r2(r + 1.8)) });
        s.push([p[0], p[1], r]);
      }
      m.push({ k: 's', d: 'M120,131 L120,143', w: 2.4 });
      m.push({ k: 'f', d: circ(120, 156, 13.5) });
      s.push([120, 156, 10.5]);
      return { m: m, s: s, focus: [120, 146], pour: 120 };
    }
  };
  var KEYS = ['ring', 'earrings', 'pendant', 'bracelet', 'bangle', 'mangalsutra', 'necklace'];

  /* ---------- the diamond, one symbol for everywhere ---------- */
  function buildDiamond() {
    var T = 21, S = 35, G = 48;
    function pt(r, deg) { var p = polar(0, 0, r, deg - 90); return r2(p[0]) + ',' + r2(p[1]); }
    function poly(pts, fill, op) {
      return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '" fill-opacity="' + op + '"/>';
    }
    var h = '<radialGradient id="dFill" cx="42%" cy="36%" r="72%"><stop offset="0" stop-color="#FFFFFF"/>' +
      '<stop offset=".5" stop-color="#E9EFF6"/><stop offset=".85" stop-color="#B9C7D6"/><stop offset="1" stop-color="#94A6BB"/></radialGradient>' +
      '<linearGradient id="dTable" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D2DDE9"/></linearGradient>';
    var f = '<circle r="' + G + '" fill="url(#dFill)"/>';
    for (var j = 0; j < 8; j++) {
      var a = j * 45;
      // upper girdle facets, two per star point
      f += poly([pt(S, a), pt(G, a - 22.5), pt(G, a)], j % 2 ? '#FFFFFF' : '#9FB2C8', j % 2 ? .55 : .35);
      f += poly([pt(S, a), pt(G, a), pt(G, a + 22.5)], j % 2 ? '#A9BBCF' : '#FFFFFF', j % 2 ? .4 : .6);
      // kite (bezel) facets
      f += poly([pt(T, a + 22.5), pt(S, a), pt(G, a + 22.5), pt(S, a + 45)], j % 2 ? '#F4F8FC' : '#B4C4D6', j % 2 ? .7 : .5);
      // star facets against the table
      f += poly([pt(T, a - 22.5), pt(T, a + 22.5), pt(S, a)], j % 2 ? '#C6D3E1' : '#FFFFFF', j % 2 ? .6 : .8);
    }
    var tbl = [];
    for (var k = 0; k < 8; k++) tbl.push(pt(T, k * 45 + 22.5));
    f += '<polygon points="' + tbl.join(' ') + '" fill="url(#dTable)"/>';
    // facet lines
    var lines = '';
    for (var n = 0; n < 8; n++) {
      var b = n * 45;
      lines += 'M' + pt(T, b - 22.5) + 'L' + pt(S, b) + 'L' + pt(T, b + 22.5) +
               'M' + pt(S, b) + 'L' + pt(G, b - 22.5) + 'M' + pt(S, b) + 'L' + pt(G, b + 22.5) + 'M' + pt(S, b) + 'L' + pt(G, b);
    }
    f += '<path d="' + lines + '" fill="none" stroke="#8EA2B8" stroke-width=".6" stroke-opacity=".75"/>';
    f += '<polygon points="' + tbl.join(' ') + '" fill="none" stroke="#8EA2B8" stroke-width=".6" stroke-opacity=".75"/>';
    // fire: three flecks of colour
    f += poly([pt(S, 45), pt(G, 56), pt(G, 67.5)], '#FFD3DF', .85);
    f += poly([pt(S, 180), pt(G, 191), pt(G, 202.5)], '#CFEFFF', .9);
    f += poly([pt(T, 292.5), pt(S, 270), pt(G, 281)], '#FFF1B8', .85);
    f += '<circle r="' + G + '" fill="none" stroke="#7F93AA" stroke-width="1"/>';
    f += '<ellipse cx="-14" cy="-16" rx="9" ry="5" fill="#fff" opacity=".7" transform="rotate(-35 -14 -16)"/>';
    $('#sharedDefs').innerHTML = h + '<symbol id="dia" viewBox="-50 -50 100 100">' + f + '</symbol>';
  }

  /* ---------- elements ---------- */
  var app = $('#app'), stage = $('#stage'), piece = $('#piece'), pieceWrap = $('#pieceWrap');
  var sketchG = $('#sketch'), metalG = $('#metal'), stonesG = $('#stones'), sparks = $('#sparks');
  var maskG = $('#maskG'), liquid = $('#liquid'), stream = $('#stream'), sweep = $('#sweep');
  var stops = $$('#mg stop');
  var views = {};
  $$('.view').forEach(function (v) { views[v.dataset.view] = v; });

  /* ---------- state ---------- */
  var cfg = P.defaults();
  var cur = null, K = 1;
  var step = 1, maxStep = 1;
  var filled = false, seated = false, levelJob = 0;
  var lastTotal = null;

  /* ---------- tweening ---------- */
  function easeInOut(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeIn(t) { return t * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function tween(dur, fn, ease, done, guard) {
    if (RM || !dur) { fn(1, dur); if (done) done(); return; }
    var t0 = performance.now();
    function f(now) {
      if (guard && !guard()) return;
      var t = clamp((now - t0) / dur, 0, 1);
      fn(ease ? ease(t) : t, now - t0);
      if (t < 1) requestAnimationFrame(f); else if (done) done();
    }
    requestAnimationFrame(f);
  }

  /* ---------- piece markup ---------- */
  function sketchMarkup(d) {
    return d.m.map(function (e) { return '<path class="sk-m" pathLength="1" d="' + e.d + '"/>'; }).join('') +
      d.s.map(function (s) {
        return '<circle class="sk-st" pathLength="1" cx="' + r2(s[0]) + '" cy="' + r2(s[1]) + '" r="' + r2(s[2]) + '"/>';
      }).join('');
  }
  function metalMarkup(d, mask) {
    return d.m.map(function (e) {
      if (mask) {
        if (e.k === 'bead') return '';
        return e.k === 's'
          ? '<path d="' + e.d + '" fill="none" stroke="#fff" stroke-width="' + e.w + '" stroke-linecap="round"/>'
          : '<path d="' + e.d + '" fill="#fff" fill-rule="evenodd"/>';
      }
      if (e.k === 's') return '<path class="ms" d="' + e.d + '" stroke-width="' + e.w + '"' + (e.o ? ' opacity="' + e.o + '"' : '') + '/>';
      if (e.k === 'bead') return '<path class="mb" d="' + e.d + '"/>';
      return '<path class="mf" fill-rule="evenodd" d="' + e.d + '"/>';
    }).join('');
  }
  /* Each stone sits in a group at its own centre, so an SVG scale()
     grows it in place. CSS fill-box on a <use> scales about the wrong
     origin in some engines, which walks stones off their settings. */
  function stoneMarkup(d) {
    return d.s.map(function (s) {
      return '<g transform="translate(' + r2(s[0]) + ',' + r2(s[1]) + ')"><g class="stone">' +
        '<use class="st-u" href="#dia" x="' + -s[2] + '" y="' + -s[2] + '" width="' + r2(s[2] * 2) +
        '" height="' + r2(s[2] * 2) + '" transform="scale(' + r2(K) + ')"/></g></g>';
    }).join('');
  }

  function buildPiece(key, dir) {
    cur = PIECES[key]();
    sketchG.innerHTML = sketchMarkup(cur);
    metalG.innerHTML = metalMarkup(cur, false);
    maskG.innerHTML = metalMarkup(cur, true);
    stonesG.innerHTML = stoneMarkup(cur);
    kShown = K;
    piece.setAttribute('aria-label', P.CATEGORY[key].label);
    if (RM) return;
    sketchG.classList.remove('draw');
    void sketchG.getBoundingClientRect();
    sketchG.classList.add('draw');
    if (dir) {
      piece.animate([{ transform: 'translateX(' + 36 * dir + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  /* ---------- metal: tone, pour, drain, glint ---------- */
  var TONE = {
    yellow: ['#FCEBB4', '#E0BB5E', '#9E7428'],
    white:  ['#F8F9FB', '#CDD2DA', '#8A929E'],
    rose:   ['#FADACB', '#DE9E85', '#9C5B48']
  };
  // Lower purity reads paler: 9K is visibly less yellow than 18K.
  var DULL = { '9': .45, '14': .2, '18': 0 };
  function hex(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return 'rgb(' + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t); }).join(',') + ')';
  }
  function tone() {
    var c = TONE[cfg.colour], k = DULL[cfg.purity] || 0;
    var L = mix(c[0], '#EEEAE3', k * .5), M = mix(c[1], '#D6D1C8', k), D = mix(c[2], '#9A968E', k);
    [L, M, D, M, L, M].forEach(function (col, i) { stops[i].style.stopColor = col; });
    app.style.setProperty('--m1', L); app.style.setProperty('--m2', M); app.style.setProperty('--m3', D);
  }

  (function wave() {
    var d = 'M-240,0';
    for (var x = -237; x <= 480; x += 3) d += 'L' + x + ',' + r2(Math.sin(x / 30 * Math.PI * 2) * 3);
    liquid.setAttribute('d', d + 'L480,400L-240,400Z');
  })();
  function setLevel(y, x) { liquid.setAttribute('transform', 'translate(' + r2(x || 0) + ',' + r2(y) + ')'); }
  setLevel(260);

  function bounds() { var b = metalG.getBBox(); return { top: b.y - 10, bot: b.y + b.height + 6 }; }

  function pour(done) {
    filled = true;
    var job = ++levelJob, g = function () { return job === levelJob; };
    var b = bounds();
    if (RM) { setLevel(b.top - 12); if (done) done(); return; }
    stream.setAttribute('x', cur.pour - 2);
    stream.setAttribute('y', 0);
    stream.setAttribute('height', 0);
    stream.style.opacity = 1;
    setLevel(b.bot);
    tween(300, function (t) { stream.setAttribute('height', r2(b.bot * t)); }, easeIn, function () {
      tween(1300, function (t, ms) {
        var y = b.bot + (b.top - b.bot) * t;
        setLevel(y, -((ms * 0.04) % 30));
        stream.setAttribute('height', r2(Math.max(0, y)));
      }, easeInOut, function () {
        setLevel(b.top - 12);
        tween(260, function (t) {
          var y = b.top * t;
          stream.setAttribute('y', r2(y));
          stream.setAttribute('height', r2(Math.max(0, b.top - y)));
        }, easeIn, function () {
          stream.style.opacity = 0;
          glint();
          if (done) done();
        }, g);
      }, g);
    }, g);
  }

  function drain() {
    filled = false;
    var job = ++levelJob, b = bounds();
    stream.style.opacity = 0;
    tween(650, function (t, ms) { setLevel(b.top + (b.bot + 20 - b.top) * t, -((ms * 0.04) % 30)); }, easeIn, null,
      function () { return job === levelJob; });
  }

  function glint() {
    if (RM || !filled) return;
    sweep.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(380px)' }],
      { duration: 1100, easing: 'cubic-bezier(.45,0,.2,1)' });
  }
  setInterval(function () { if (filled && !document.hidden) glint(); }, 6000);

  /* ---------- stones ---------- */
  var kShown = 1, kJob = 0;
  function paintK(k) {
    kShown = k;
    $$('.st-u', stonesG).forEach(function (u) { u.setAttribute('transform', 'scale(' + r2(k) + ')'); });
  }
  function setK(live) {
    K = clamp(Math.pow(cfg.carat / P.CATEGORY[cfg.category].carat, 1 / 3), 0.62, 1.5);
    var from = kShown, to = K, job = ++kJob;
    if (live) paintK(to);
    else tween(320, function (t) { paintK(from + (to - from) * t); }, function (t) {
      // a little overshoot, like a stone settling into its seat
      var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    }, null, function () { return job === kJob; });
    // the carat diamond lives in a fixed slot and only ever scales down
    // inside it, so no carat can push it into the numeral
    $('#sizeD').style.setProperty('--k', r2(0.4 + 0.6 * Math.cbrt(cfg.carat / MAX)));
  }

  function seat(done) {
    seated = true;
    var st = $$('.stone', stonesG), n = st.length, gap = Math.min(70, 700 / n);
    if (!RM) {
      st.forEach(function (el, i) {
        el.animate([
          { transform: 'translateY(-70px)', opacity: 0 },
          { transform: 'translateY(3px)', opacity: 1, offset: .75 },
          { transform: 'translateY(0)', opacity: 1 }
        ], { duration: 520, delay: i * gap, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' });
      });
    }
    setTimeout(function () { sparkle(3); if (done) done(); }, RM ? 0 : n * gap + 460);
  }

  var STAR = 'M0,-10 C1,-2 2,-1 10,0 C2,1 1,2 0,10 C-1,2 -2,1 -10,0 C-2,-1 -1,-2 0,-10Z';
  function sparkle(n) {
    if (RM || step < 3) return;
    var big = cur.s.slice().sort(function (a, b) { return b[2] - a[2]; });
    for (var i = 0; i < n; i++) {
      var s = i === 0 ? big[0] : cur.s[Math.floor(Math.random() * cur.s.length)];
      var off = s[2] * K * .6;
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', 'translate(' + r2(s[0] + (Math.random() - .5) * off * 2) + ',' +
        r2(s[1] - off * Math.random()) + ') scale(' + r2(0.5 + s[2] / 28) + ')');
      g.innerHTML = '<path class="spk" d="' + STAR + '" style="animation-delay:' + i * 150 + 'ms"/>';
      sparks.appendChild(g);
      setTimeout(g.remove.bind(g), 1100 + i * 150);
    }
  }

  /* ---------- camera ---------- */
  function zoom(on) {
    if (!on) { pieceWrap.style.transform = ''; return; }
    var w = piece.clientWidth, h = piece.clientHeight, s = Math.min(w, h) / 240, Z = 1.32;
    pieceWrap.style.transform = 'scale(' + Z + ') translate(' + r2((120 - cur.focus[0]) * s * .8) + 'px,' +
      r2((120 - cur.focus[1]) * s * .8) + 'px)';
  }

  /* ---------- price: odometer, deltas, spec, nudges ---------- */
  var odoEl = $('#odo'), odoStr = '';
  function odo(str) {
    var shape = function (x) { return x.replace(/\d/g, '0'); };
    if (str.length !== odoStr.length || shape(str) !== shape(odoStr)) {
      var digits = '';
      for (var i = 0; i < 10; i++) digits += '<span>' + i + '</span>';
      odoEl.innerHTML = str.split('').map(function (c) {
        return /\d/.test(c) ? '<span class="od"><span class="od-s">' + digits + '</span></span>' : '<span class="od-c">' + c + '</span>';
      }).join('');
      void odoEl.offsetWidth;
    }
    var strips = $$('.od-s', odoEl), j = 0;
    str.split('').forEach(function (c) {
      if (!/\d/.test(c)) return;
      strips[j].style.transform = 'translateY(' + (-c * 1.1) + 'em)';
      strips[j].style.transitionDelay = (strips.length - j) * 22 + 'ms';
      j++;
    });
    odoStr = str;
  }

  function chip(delta, free) {
    var host = $('#deltas');
    var c = document.createElement('span');
    if (free) { c.className = 'chip free'; c.textContent = '₹0, colour is free'; }
    else { c.className = 'chip ' + (delta > 0 ? 'up' : 'down'); c.textContent = (delta > 0 ? '+' : '−') + P.inr(Math.abs(delta)); }
    host.innerHTML = '';
    host.appendChild(c);
  }

  function specText() {
    return [P.CATEGORY[cfg.category].label, cfg.purity + 'K ' + cfg.colour,
      P.STONE[cfg.dtype].label + ' ' + cfg.clarity, cfg.carat.toFixed(2) + ' ct'].join(' · ');
  }
  function alt(o) { return P.estimate(Object.assign({}, cfg, o)).total; }

  function price(opts) {
    opts = opts || {};
    var e = P.estimate(cfg), str = P.inr(e.total);
    odo(str);
    if (!opts.silent) {
      $('#priceLive').textContent = 'Estimate ' + str;
      if (opts.free) chip(0, true);
      else if (lastTotal != null && Math.abs(e.total - (opts.from != null ? opts.from : lastTotal)) >= 1) {
        chip(e.total - (opts.from != null ? opts.from : lastTotal));
      }
    }
    lastTotal = e.total;
    $('#spec').textContent = specText();

    var ap = cfg.purity === '18' ? '14' : '18', d2 = alt({ purity: ap }) - e.total;
    $('#n2').textContent = ap + 'K would ' + (d2 < 0 ? 'save ' : 'add ') + P.inr(Math.abs(d2)) + ' on this piece.';
    var d3 = alt({ dtype: cfg.dtype === 'lab' ? 'natural' : 'lab' }) - e.total;
    $('#n3').textContent = cfg.dtype === 'lab'
      ? 'The same stones, natural, would add ' + P.inr(d3) + '.'
      : 'Lab-grown would save ' + P.inr(-d3) + ', and looks the same.';
    $('#n4').textContent = 'Every 0.10 ct adds about ' + P.inr(alt({ carat: cfg.carat + 0.1 }) - e.total) + '.';
    return e;
  }

  /* ---------- step 1: tiles and facts ---------- */
  function buildTiles() {
    $('#tiles').innerHTML = KEYS.map(function (k) {
      var from = P.estimate({ category: k, purity: '9', colour: 'yellow', dtype: 'lab', clarity: 'SI', carat: P.CATEGORY[k].carat }).total;
      return '<label class="tile"><input type="radio" name="piece" value="' + k + '"' + (k === cfg.category ? ' checked' : '') + '>' +
        '<span class="tile-in"><svg class="mini" viewBox="0 0 240 240" aria-hidden="true">' + sketchMarkup(PIECES[k]()) + '</svg>' +
        '<b>' + P.CATEGORY[k].label + '</b><small>from ' + P.inr(from) + '</small></span></label>';
    }).join('');
  }
  function facts() {
    var c = P.CATEGORY[cfg.category];
    $('#facts').innerHTML = '<span class="fact"><b>' + c.gold.toFixed(1) + ' g</b> gold</span>' +
      '<span class="fact"><b>' + c.carat.toFixed(2) + ' ct</b> diamonds</span>' +
      '<span class="fact">Typical weights</span>';
  }

  function setPiece(k, dir) {
    if (k === cfg.category) return;
    cfg.category = k;
    cfg.carat = P.CATEGORY[k].carat;
    K = 1; kJob++;
    buildPiece(k, dir);
    setK(true);
    facts();
    syncCarat();
    price();
    navState();
    var input = $('input[name="piece"][value="' + k + '"]');
    input.checked = true;
    var tile = input.closest('.tile'), row = $('#tiles');
    row.scrollTo({ left: tile.offsetLeft - (row.clientWidth - tile.clientWidth) / 2, behavior: RM ? 'auto' : 'smooth' });
  }

  /* ---------- step 3: loupe ---------- */
  var INC = {
    SI: '<path d="M-20,12 q7,-7 15,-4 q6,2 10,-6"/><path d="M-9,8 l-3,-6"/><circle cx="15" cy="-17" r="1.9"/>' +
        '<circle cx="23" cy="9" r="1.4"/><circle cx="-8" cy="-23" r="1.3"/><circle cx="-27" cy="-4" r="1.6"/>' +
        '<g class="cloud"><circle cx="4" cy="21" r=".8"/><circle cx="7" cy="23" r=".7"/><circle cx="5" cy="25" r=".6"/><circle cx="9" cy="20" r=".6"/></g>',
    VS: '<circle cx="12" cy="-12" r="1"/><circle cx="-15" cy="15" r=".8"/>',
    VVS: '<circle cx="5" cy="6" r=".45" opacity=".6"/>'
  };
  var SPOT = { SI: [-6, 3], VS: [12, -12], VVS: [5, 6] };
  var lpBox = $('#lpBox'), lp = { x: 62, y: 38 };
  function lpSet(x, y) {
    lp.x = clamp(x, 8, 92); lp.y = clamp(y, 8, 92);
    lpBox.style.setProperty('--x', r2(lp.x) + '%');
    lpBox.style.setProperty('--y', r2(lp.y) + '%');
  }
  function lpClarity(sweepTo) {
    $$('.inc', lpBox).forEach(function (g) { g.innerHTML = INC[cfg.clarity]; });
    if (!sweepTo) return;
    var s = SPOT[cfg.clarity], tx = (s[0] + 60) / 120 * 100, ty = (s[1] + 60) / 120 * 100;
    var fx = lp.x, fy = lp.y;
    tween(900, function (t) {
      var arc = Math.sin(t * Math.PI) * 14;
      lpSet(fx + (tx - fx) * t + arc, fy + (ty - fy) * t - arc * .5);
    }, easeInOut);
  }
  (function lpDrag() {
    var on = false;
    function at(e) {
      var r = lpBox.getBoundingClientRect();
      lpSet((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100);
    }
    lpBox.addEventListener('pointerdown', function (e) { on = true; lpBox.setPointerCapture(e.pointerId); lpBox.classList.add('used'); at(e); });
    lpBox.addEventListener('pointermove', function (e) { if (on) at(e); });
    lpBox.addEventListener('pointerup', function () { on = false; });
    lpBox.addEventListener('pointercancel', function () { on = false; });
  })();

  /* ---------- step 4: the carat ruler ---------- */
  var SP = 14, MIN = 0.1, MAX = 5, STEPV = 0.05;
  var ruler = $('#ruler'), ticks = $('#ticks'), needle = $('.needle', ruler);
  (function buildTicks() {
    var n = Math.round((MAX - MIN) / STEPV), h = '';
    for (var i = 0; i <= n; i++) {
      var v = r2(MIN + i * STEPV);
      var major = Math.abs(v * 2 - Math.round(v * 2)) < 1e-6, mid = Math.abs(v * 4 - Math.round(v * 4)) < 1e-6;
      h += '<i class="tk' + (major ? ' tk-M' : mid ? ' tk-m' : '') + '" style="left:' + i * SP + 'px">' +
        (major ? '<em>' + v.toFixed(1) + '</em>' : '') + '</i>';
    }
    ticks.innerHTML = h;
  })();
  function placeRuler(v) {
    ticks.style.transform = 'translateX(' + r2(ruler.clientWidth / 2 - (v - MIN) / STEPV * SP) + 'px)';
  }
  function syncCarat() {
    var v = cfg.carat;
    $('#ctV').textContent = v.toFixed(2);
    ruler.setAttribute('aria-valuenow', v);
    ruler.setAttribute('aria-valuetext', v.toFixed(2) + ' carat');
    $('#ctNote').textContent = r2(v * 0.2).toFixed(2) + ' g of diamond. Typical for this piece: ' +
      P.CATEGORY[cfg.category].carat.toFixed(2) + ' ct.';
    var preset = false;
    $$('.q[data-ct]').forEach(function (q) {
      var on = Math.abs(+q.dataset.ct - v) < 1e-6;
      q.classList.toggle('is-on', on);
      if (on) preset = true;
    });
    // the custom box holds any value the presets do not
    var box = $('.q-in'), inp = $('#ctIn');
    if (document.activeElement !== inp) inp.value = preset ? '' : v.toFixed(2);
    box.classList.toggle('is-on', !preset && document.activeElement !== inp);
    box.classList.toggle('has', !!inp.value);
    if (!ticks.classList.contains('drag')) placeRuler(v);
  }
  // the ruler and presets move in 0.05 steps; a typed value keeps 0.01
  function setCarat(v, live, exact) {
    v = r2(clamp(exact ? v : Math.round(v / STEPV) * STEPV, MIN, MAX));
    if (v === cfg.carat) return;
    var old = cfg.carat;
    if (Math.floor(old * 4 + 1e-6) !== Math.floor(v * 4 + 1e-6) && navigator.vibrate) {
      navigator.vibrate(Math.abs(v - Math.round(v)) < 1e-6 ? 18 : 8);
    }
    if (!RM) { needle.classList.remove('tick'); void needle.offsetWidth; needle.classList.add('tick'); }
    cfg.carat = v;
    setK(live);
    syncCarat();
    price({ silent: live });
  }
  (function rulerDrag() {
    var d = null;
    ruler.addEventListener('pointerdown', function (e) {
      d = { x: e.clientX, v: cfg.carat, from: lastTotal };
      ruler.setPointerCapture(e.pointerId);
      ticks.classList.add('drag');
    });
    ruler.addEventListener('pointermove', function (e) {
      if (!d) return;
      var v = clamp(d.v - (e.clientX - d.x) / SP * STEPV, MIN, MAX);
      placeRuler(v);
      setCarat(v, true);
    });
    function end() {
      if (!d) return;
      var from = d.from; d = null;
      ticks.classList.remove('drag');
      placeRuler(cfg.carat);
      price({ from: from });
      sparkle(1);
    }
    ruler.addEventListener('pointerup', end);
    ruler.addEventListener('pointercancel', end);
    ruler.addEventListener('keydown', function (e) {
      var m = { ArrowRight: STEPV, ArrowUp: STEPV, ArrowLeft: -STEPV, ArrowDown: -STEPV, PageUp: .25, PageDown: -.25 }[e.key];
      if (e.key === 'Home') m = MIN - cfg.carat;
      if (e.key === 'End') m = MAX - cfg.carat;
      if (m == null) return;
      e.preventDefault();
      setCarat(cfg.carat + m);
    });
  })();
  (function customCarat() {
    var inp = $('#ctIn'), box = $('.q-in');
    function commit() {
      var raw = inp.value.trim().replace(',', '.');
      box.classList.remove('bad');
      if (!raw) { syncCarat(); return; }
      var v = parseFloat(raw);
      if (!isFinite(v) || v <= 0) { box.classList.add('bad'); return; }
      setCarat(v, false, true);
      placeRuler(cfg.carat);
      inp.value = cfg.carat.toFixed(2);
      sparkle(2);
    }
    inp.addEventListener('input', function () {
      inp.value = inp.value.replace(/[^0-9.,]/g, '');
      box.classList.toggle('has', !!inp.value);
      box.classList.remove('bad');
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('focus', function () { box.classList.remove('is-on'); inp.select(); });
    inp.addEventListener('blur', function () { commit(); syncCarat(); });
  })();

  $('#quick').addEventListener('click', function (e) {
    var q = e.target.closest('.q[data-ct]');
    if (q) { setCarat(+q.dataset.ct); sparkle(2); }
  });

  /* ---------- step 5: the reveal ---------- */
  var revealTimers = [];
  function later(fn, ms) { revealTimers.push(setTimeout(fn, RM ? 0 : ms)); }
  function toScreen(x, y) {
    var m = piece.getScreenCTM(), p = piece.createSVGPoint();
    p.x = x; p.y = y;
    return p.matrixTransform(m);
  }
  function metalPoints(n) {
    var paths = $$('.mf,.ms', metalG), out = [];
    for (var i = 0; i < n; i++) {
      var p = paths[i % paths.length], L = p.getTotalLength(), q = p.getPointAtLength(Math.random() * L);
      out.push(toScreen(q.x, q.y));
    }
    return out;
  }
  function fly(from, tx, ty, cls, delay) {
    if (RM) return;
    from.forEach(function (p, i) {
      var d = document.createElement('i');
      d.className = 'fly ' + cls;
      document.body.appendChild(d);
      var mx = (p.x + tx) / 2 + (Math.random() - .5) * 90, my = Math.min(p.y, ty) - 30 - Math.random() * 50;
      d.animate([
        { transform: 'translate(' + p.x + 'px,' + p.y + 'px) scale(.3)', opacity: 0 },
        { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1)', opacity: 1, offset: .45 },
        { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.5)', opacity: .9 }
      ], { duration: 720, delay: delay + i * 45, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = function () { d.remove(); };
    });
  }
  function countUp(el, v, ms) {
    tween(ms, function (t) { el.textContent = P.inr(v * t); }, easeOut);
  }

  function reveal() {
    stage.classList.add('is-done');
    var e = P.estimate(cfg);
    $('#sumSpec').textContent = specText();
    var parts = [
      { k: 'gold', label: 'Gold', det: e.goldWeight.toFixed(1) + ' g at ' + cfg.purity + 'K, ' + cfg.colour, v: e.gold },
      { k: 'dia', label: 'Diamonds', det: e.carat.toFixed(2) + ' ct ' + e.stoneLabel.toLowerCase() + ', ' + cfg.clarity, v: e.stones },
      { k: 'make', label: 'Making', det: '14% of metal, plus setting', v: e.making },
      { k: 'gst', label: 'GST', det: '3% metal and stones, 5% making', v: e.gst }
    ];
    var bar = $('#bdBar'), rows = $('#bdRows');
    bar.innerHTML = parts.map(function (p) {
      return '<i class="seg seg-' + p.k + '" style="width:' + r2(p.v / e.total * 100) + '%"></i>';
    }).join('');
    rows.innerHTML = parts.map(function (p) {
      return '<li class="bd-r"><i class="dot-' + p.k + '"></i><span class="bd-l"><b>' + p.label + '</b><small>' + p.det +
        '</small></span><span class="bd-v">' + P.inr(0) + '</span></li>';
    }).join('');
    $('#bdRange').classList.remove('in');
    $('#bdRange').textContent = 'Likely range ' + P.inr(e.low) + ' to ' + P.inr(e.high) + '.';
    var seal = $('.seal'); seal.classList.remove('stamp');

    if (!RM) {
      piece.animate([
        { transform: 'perspective(700px) rotateY(0)' },
        { transform: 'perspective(700px) rotateY(28deg)', offset: .35 },
        { transform: 'perspective(700px) rotateY(-12deg)', offset: .7 },
        { transform: 'perspective(700px) rotateY(0)' }
      ], { duration: 1500, easing: 'cubic-bezier(.4,0,.2,1)' });
    }
    var pr = $('#price'); pr.classList.remove('settle'); void pr.offsetWidth; pr.classList.add('settle');
    later(function () { glint(); sparkle(5); }, 500);

    // each cost line flies out of the part of the piece it pays for
    var segs = $$('.seg', bar), lis = $$('.bd-r', rows), vals = $$('.bd-v', rows);
    later(function () {
      var br = bar.getBoundingClientRect(), acc = 0, cy = br.top + br.height / 2;
      var prEl = $('#odo').getBoundingClientRect();
      var src = [
        metalPoints(9),
        cur.s.slice(0, 9).map(function (s) { return toScreen(s[0], s[1]); }),
        metalPoints(5),
        [0, 1, 2, 3].map(function () { return { x: prEl.left + Math.random() * prEl.width, y: prEl.top + prEl.height / 2 }; })
      ];
      parts.forEach(function (p, i) {
        var w = p.v / e.total * br.width, cx = br.left + acc + w / 2;
        acc += w;
        var at = 350 + i * 480;
        fly(src[i], cx, cy, 'fly-' + p.k, at - 300);
        later(function () {
          segs[i].classList.add('in');
          lis[i].classList.add('in');
          countUp(vals[i], p.v, 600);
        }, at);
      });
      later(function () { $('#bdRange').classList.add('in'); seal.classList.add('stamp'); }, 350 + 4 * 480);
    }, 600);
  }
  function unreveal() {
    stage.classList.remove('is-done');
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
  }

  /* ---------- navigation ---------- */
  var LABELS = { 1: 'Let’s make this one', 2: 'Set the metal', 3: 'Set these stones', 4: 'Reveal my price' };

  function chrome() {
    $('#back').disabled = step === 1;
    $('#count').textContent = step === 5 ? '4/4' : step + '/4';
    $('#gems').style.setProperty('--p', step === 5 ? 1 : (step - 1) / 3);
    $$('.gem').forEach(function (g) {
      var n = +g.dataset.go;
      g.classList.toggle('is-now', n === step);
      g.classList.toggle('is-done', n < step);
      g.disabled = n > maxStep;
      g.setAttribute('aria-current', n === step ? 'step' : 'false');
      g.setAttribute('aria-label', 'Step ' + n + ', ' + g.textContent + (n < step ? ', done' : ''));
    });
    var fin = step === 5;
    $('#next').hidden = fin;
    $('#final').hidden = !fin;
    if (!fin) $('#nextLabel').textContent = LABELS[step];
  }

  function swapView(from, to, dir) {
    var out = views[from], inn = views[to];
    inn.hidden = false;
    $('#views').scrollTop = 0;
    if (RM) { out.hidden = true; return; }
    // a view can re-enter while its own exit is still holding it at zero
    [out, inn].forEach(function (v) { v.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); }); });
    out.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + -28 * dir + 'px)' }],
      { duration: 200, easing: 'ease-in', fill: 'forwards' }).onfinish = function () {
      if (+inn.dataset.view === step) out.hidden = true;
    };
    Array.prototype.forEach.call(inn.children, function (c, i) {
      c.animate([{ opacity: 0, transform: 'translateX(' + 36 * dir + 'px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 120 + i * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }

  function goTo(n) {
    if (n === step || n < 1 || n > 5 || n > maxStep + 1) return;
    var from = step, dir = n > from ? 1 : -1;
    step = n;
    maxStep = Math.max(maxStep, n);
    app.dataset.step = n;
    stage.dataset.stage = n;
    $$('.view').forEach(function (v) { if (+v.dataset.view !== from && +v.dataset.view !== n) v.hidden = true; });
    swapView(from, n, dir);

    if (dir > 0) {
      for (var i = from; i < Math.min(n, 5); i++) {
        var g = $('.gem[data-go="' + i + '"]');
        if (g) { g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop'); }
      }
    }

    if (n >= 2 && !filled) {
      pour(function () { if (step >= 3 && !seated) seat(); });
    } else if (n >= 3 && !seated) seat();
    if (n === 1 && filled) drain();
    if (n <= 2) seated = false;
    zoom(n === 4);
    if (n === 5) reveal(); else unreveal();
    if (n === 3) lpClarity(true);
    if (n === 4) syncCarat();
    chrome();
  }

  /* ---------- wiring ---------- */
  $('#next').addEventListener('click', function () { goTo(step + 1); });
  $('#back').addEventListener('click', function () { goTo(step - 1); });
  $('#gems').addEventListener('click', function (e) {
    var g = e.target.closest('.gem');
    if (g && !g.disabled) goTo(+g.dataset.go);
  });

  document.addEventListener('change', function (e) {
    var t = e.target, v = t.value;
    if (t.name === 'piece') {
      var d = KEYS.indexOf(v) > KEYS.indexOf(cfg.category) ? 1 : -1;
      setPiece(v, d);
    } else if (t.name === 'pur') {
      cfg.purity = v; tone(); glint(); price();
      var vial = t.closest('.vial'); vial.classList.remove('rise'); void vial.offsetWidth; vial.classList.add('rise');
    } else if (t.name === 'col') {
      cfg.colour = v; tone(); glint(); price({ free: true });
    } else if (t.name === 'type') {
      cfg.dtype = v; price(); sparkle(3);
    } else if (t.name === 'clar') {
      cfg.clarity = v; price(); lpClarity(true); sparkle(1);
    }
    var n = $('.view:not([hidden]) .nudge');
    if (n && !RM) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }
  });

  // swipe the stage to change piece on step 1
  (function swipe() {
    var sx = null, sy = null;
    stage.addEventListener('pointerdown', function (e) { if (step === 1) { sx = e.clientX; sy = e.clientY; } });
    stage.addEventListener('pointerup', function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
      var i = clamp(KEYS.indexOf(cfg.category) + (dx < 0 ? 1 : -1), 0, KEYS.length - 1);
      setPiece(KEYS[i], dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', function () { sx = null; });
  })();

  // desktop: arrow buttons on the stage, and the arrow keys, on step 1
  function shiftPiece(d) {
    var i = KEYS.indexOf(cfg.category) + d;
    if (i < 0 || i >= KEYS.length) return;
    setPiece(KEYS[i], d);
  }
  function navState() {
    var i = KEYS.indexOf(cfg.category);
    $('.stage-nav.prev').disabled = i === 0;
    $('.stage-nav.next').disabled = i === KEYS.length - 1;
  }
  $$('.stage-nav').forEach(function (b) {
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    b.addEventListener('click', function () { shiftPiece(+b.dataset.shift); });
  });
  document.addEventListener('keydown', function (e) {
    if (step !== 1 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.getAttribute('role') === 'slider')) return;
    e.preventDefault();
    shiftPiece(e.key === 'ArrowRight' ? 1 : -1);
  });

  window.addEventListener('resize', function () {
    if (step === 4) zoom(true);
    placeRuler(cfg.carat);
  });

  /* ---------- start ---------- */
  buildDiamond();
  buildTiles();
  buildPiece(cfg.category);
  tone();
  setK();
  facts();
  lpClarity(false);
  syncCarat();
  price({ silent: true });
  $('#priceLive').textContent = 'Estimate ' + P.inr(lastTotal);
  chrome();
  navState();
})();
