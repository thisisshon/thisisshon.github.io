/* ============================================================
   3Soul's own pricing, read from their catalogue.
   Same API as pricing.js (window.PriceIt), so a page can switch
   engines by changing one script tag. pricing.js is left as it
   was because the older decks print its rates as provenance.

   Source: the ERP price breakdown embedded on every 3soul.in
   product page (script#erp-price-data). Sampled 22 Sep 2026:
   152 products, 5,959 variants, across every category. ERP
   totals match the shop's selling prices exactly.

   How 3Soul prices a piece:
     metal     grams at the purity x rate per gram for that purity
     diamonds  carats x rate per carat (by type and clarity)
     labour    Rs 1,600 per gram of gold, + CAD Rs 700, + certificate
     subtotal  metal + diamonds + labour
     handling  a share of the subtotal (17.65% median)
     GST       3% on subtotal + handling
   ------------------------------------------------------------ */
(function (w) {
  'use strict';

  /* Gold, per gram, by purity. Median of the 18K rate across the
     sample; 14K and 9K follow fineness exactly in their data
     (0.7778 and 0.5 of 18K). */
  var GOLD_18K_PER_G = 11490;
  var PURITY = { '9': .375, '10': .417, '14': .585, '18': .750, '22': .916 };
  var GOLD_24K_PER_G = Math.round(GOLD_18K_PER_G / PURITY['18']);
  function goldRate(p) { return GOLD_18K_PER_G * (PURITY[p] || PURITY['18']) / PURITY['18']; }

  /* The same design weighs less at a lower purity: in their data a
     14K piece is 0.84x the 18K weight and 9K is 0.686x. Typical
     weights below are at 18K. */
  var WEIGHT_AT = { '9': .686, '10': .72, '14': .84, '18': 1, '22': 1.12 };

  var COLOUR = {
    yellow: { label: 'Yellow gold' },
    white:  { label: 'White gold' },
    rose:   { label: 'Rose gold' }
  };

  /* Diamonds, per carat, medians by type and clarity. These are
     the small stones set in catalogue pieces. A large centre stone
     costs more per carat; solitaire rates are requested from 3Soul. */
  var RATE = {
    lab:     { SI: 10000, VS: 11700, VVS: 13000 },
    natural: { SI: 38600, VS: 43500, VVS: 49160 }
  };
  var CLARITY = {
    SI:  { label: 'SI',  note: 'Eye-clean at arm’s length' },
    VS:  { label: 'VS',  note: 'No inclusions to the naked eye' },
    VVS: { label: 'VVS', note: 'Near-flawless under 10x' }
  };
  var STONE = {
    lab:     { label: 'Lab-grown', rate: RATE.lab.VS },
    natural: { label: 'Natural',   rate: RATE.natural.VS }
  };

  /* Typical piece, medians at 18K from the catalogue, rounded to
     the 0.05 ct steps the calculator uses. max is the largest
     carat the catalogue carries for that piece, rounded up.
     Necklace (2 products) and bangle (none) are placeholders until
     3Soul confirms whether they make them. */
  var CATEGORY = {
    ring:        { label: 'Ring',        gold: 5.2,  carat: 0.40, max: 5,  handling: .1765 },
    earrings:    { label: 'Earrings',    gold: 4.1,  carat: 0.90, max: 4,  handling: .1765 },
    pendant:     { label: 'Pendant',     gold: 3.0,  carat: 0.15, max: 2,  handling: .1905 },
    bracelet:    { label: 'Bracelet',    gold: 10.2, carat: 0.70, max: 7,  handling: .1364 },
    bangle:      { label: 'Bangle',      gold: 18.5, carat: 2.40, max: 6,  handling: .1765 },
    mangalsutra: { label: 'Mangalsutra', gold: 4.1,  carat: 0.45, max: 2,  handling: .1765 },
    necklace:    { label: 'Necklace',    gold: 15.4, carat: 8.50, max: 12, handling: .1765 }
  };

  var LABOUR_PER_G = 1600;
  var CAD = 700;
  var CERT = 282;
  var GST = 0.03;

  function inr(n) {
    n = Math.round(n);
    var s = String(n), last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    return '₹' + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
  }

  function estimate(cfg) {
    var cat = CATEGORY[cfg.category] || CATEGORY.ring;
    var purity = PURITY[cfg.purity] ? cfg.purity : '18';
    var type = RATE[cfg.dtype] ? cfg.dtype : 'lab';
    var clarity = RATE[type][cfg.clarity] ? cfg.clarity : 'VS';
    var carat = cfg.carat != null ? cfg.carat : cat.carat;

    var goldWeight = cat.gold * (WEIGHT_AT[purity] || 1);
    var gold = goldWeight * goldRate(purity);
    var stones = carat * RATE[type][clarity];
    var labour = goldWeight * LABOUR_PER_G;
    var making = labour + CAD + CERT;
    var subtotal = gold + stones + making;
    var handling = subtotal * cat.handling;
    var gst = (subtotal + handling) * GST;
    var total = subtotal + handling + gst;

    return {
      goldWeight: goldWeight, goldRate: goldRate(purity),
      gold: gold, stones: stones, labour: labour, making: making,
      handling: handling, handlingPct: cat.handling, gst: gst, total: total,
      low: total * 0.90, high: total * 1.12,
      carat: carat, diamondRate: RATE[type][clarity],
      stoneLabel: STONE[type].label, catLabel: cat.label,
      clarityLabel: clarity, colourLabel: (COLOUR[cfg.colour] || {}).label || null,
      rows: [
        ['Gold, ' + goldWeight.toFixed(2) + ' g at ' + purity + 'K', gold],
        [STONE[type].label + ' diamonds, ' + carat.toFixed(2) + ' ct, ' + clarity, stones],
        ['Labour, CAD and certificate', making],
        ['Handling', handling],
        ['GST at 3%', gst]
      ]
    };
  }

  function defaults() {
    return { category: 'ring', purity: '18', colour: 'yellow',
             dtype: 'lab', clarity: 'VS', carat: CATEGORY.ring.carat };
  }

  function combinations(cfg) {
    var out = [];
    ['9', '14', '18'].forEach(function (pur) {
      ['lab', 'natural'].forEach(function (dt) {
        ['SI', 'VS', 'VVS'].forEach(function (cl) {
          var c = { category: cfg.category, purity: pur, colour: cfg.colour, dtype: dt, clarity: cl, carat: cfg.carat };
          out.push({ purity: pur, dtype: dt, clarity: cl, total: estimate(c).total });
        });
      });
    });
    return out;
  }

  w.PriceIt = {
    estimate: estimate, inr: inr, defaults: defaults, combinations: combinations,
    CATEGORY: CATEGORY, PURITY: PURITY, STONE: STONE, COLOUR: COLOUR, CLARITY: CLARITY,
    RATE: RATE, GOLD_24K_PER_G: GOLD_24K_PER_G, GOLD_18K_PER_G: GOLD_18K_PER_G,
    LABOUR_PER_G: LABOUR_PER_G, SOURCE: '3soul.in catalogue, 22 Sep 2026'
  };
})(window);
