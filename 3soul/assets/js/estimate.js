/* ============================================================
   Quick estimate: four choices, one live range. Same engine as
   the full calculator (pricing-3soul.js), with colour fixed to
   yellow (it never changes the price) and clarity at VS.
   ============================================================ */
(function () {
  'use strict';

  var P = window.PriceIt;
  var WA = 'https://wa.me/919819033336';
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function grp(k) { return $('.cg[data-k="' + k + '"]'); }
  function opt(k, v) { var g = grp(k); return g && g.querySelector('.cg-o button[data-v="' + v + '"]'); }
  function val(k) { return Choice.value(grp(k)); }
  function round(n) { return n >= 100000 ? Math.round(n / 1000) * 1000 : Math.round(n / 500) * 500; }
  function short(n) {
    n = round(n);
    return n >= 100000 ? '₹' + parseFloat((n / 100000).toFixed(2)) + 'L' : '₹' + Math.round(n / 1000) + 'k';
  }

  // arriving with a piece (?c=ring.18.yellow.lab.VS.0.40): start from it
  (function load() {
    var m = /[?&]c=([^&]+)/.exec(location.search);
    if (!m) return;
    var p = decodeURIComponent(m[1]).split('.');
    var pick = function (k, v) { var b = opt(k, v); if (b) Choice.select(grp(k), b); };
    if (P.CATEGORY[p[0]]) pick('category', p[0]);
    pick('purity', p[1]);
    pick('dtype', p[3]);
    var ct = parseFloat(p[5] + '.' + (p[6] || '0')), typ = P.CATEGORY[val('category')].carat;
    if (isFinite(ct)) {
      var r = ct / typ, best = '1';
      ['0.5', '1', '2'].forEach(function (s) { if (Math.abs(+s - r) < Math.abs(+best - r)) best = s; });
      pick('size', best);
    }
  })();

  function cfg(over) {
    var cat = val('category');
    var c = { category: cat, purity: val('purity'), colour: 'yellow', dtype: val('dtype'), clarity: 'VS',
              carat: Math.round(P.CATEGORY[cat].carat * +val('size') * 20) / 20 };
    if (over) for (var k in over) c[k] = over[k];
    if (c.carat < 0.1) c.carat = 0.1;
    return c;
  }
  function code(c) { return [c.category, c.purity, c.colour, c.dtype, c.clarity, c.carat.toFixed(2)].join('.'); }

  var lastTotal = null;
  function paint() {
    var c = cfg(), e = P.estimate(c), typ = P.CATEGORY[c.category].carat;

    var tot = $('#total');
    tot.textContent = 'About ' + P.inr(round(e.total));
    if (lastTotal !== null && Math.round(lastTotal) !== Math.round(e.total) && tot.animate &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tot.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
    lastTotal = e.total;
    $('#range').textContent = 'Likely ' + short(e.low) + ' to ' + short(e.high);

    // each choice shows what it would cost, so the answer is never a surprise
    $('#dLab').textContent = 'About ' + short(P.estimate(cfg({ dtype: 'lab' })).total);
    $('#dNat').textContent = 'About ' + short(P.estimate(cfg({ dtype: 'natural' })).total);
    $('#sz1').textContent = (Math.max(.1, Math.round(typ * 10) / 20)).toFixed(2) + ' ct';
    $('#sz2').textContent = typ.toFixed(2) + ' ct';
    $('#sz3').textContent = (typ * 2).toFixed(2) + ' ct';

    $('#bd').innerHTML = [
      ['Gold', e.goldWeight.toFixed(1) + ' g at ' + c.purity + 'K', e.gold],
      ['Diamonds', c.carat.toFixed(2) + ' ct ' + e.stoneLabel.toLowerCase(), e.stones],
      ['Making and handling', 'Labour, setting, certificate', e.making + e.handling],
      ['GST', '3% on the total', e.gst]
    ].map(function (r) {
      return '<li><span><b>' + r[0] + '</b><small>' + r[1] + '</small></span><em>' + P.inr(r[2]) + '</em></li>';
    }).join('');

    var k = code(c);
    $('#exact').href = 'index.html?c=' + k + '#start';
    $('#full').href = 'calculator.html?c=' + k + '&s=1';
    $('#waQ').href = WA + '?text=' + encodeURIComponent('Hi, I’d like a price for a ' +
      P.CATEGORY[c.category].label.toLowerCase() + ' in ' + c.purity + 'K gold with ' +
      (c.dtype === 'lab' ? 'lab-grown' : 'natural') + ' diamonds. The quick estimate says about ' + P.inr(round(e.total)) + '.');
    try { history.replaceState(null, '', '?c=' + k); } catch (err) { /* file:// */ }
  }

  // the last choice made: open the breakdown and bring it into view
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Choice.bind($('#qeCg'), function (k) {
    paint();
    if (k !== 'size') return;
    var bd = $('.qe-bd');
    setTimeout(function () {
      bd.open = true;
      bd.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    }, RM ? 0 : 360);
  }, { required: true });
  paint();
})();
