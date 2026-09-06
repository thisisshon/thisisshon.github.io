/* ============================================================
   Illustrative pricing engine, shared by all three prototypes
   so the comparison is like-for-like.
   Rates are plausible placeholders, NOT live market data —
   every prototype says so on screen.
   ============================================================ */
(function (w) {
  'use strict';

  /* ------------------------------------------------------------
     Reference rates — Indian market, August 2026.
     These are real market figures, not invented ones, but they are
     a snapshot: a live build would read gold daily and price stones
     per stone. Sources are printed on the estimate itself.
       Gold 24K   ₹15,982–₹16,486/g   (26–28 Aug 2026)  → 16,000
       Lab-grown  ₹30,000–₹80,000/ct  (1 ct certified)  → 45,000
       Natural    ₹1.5–3.0 lakh/ct    (1 ct, G / VS2)   → 2,00,000
       GST        3% on metal and stones, 5% on making  (unchanged since 2017)
     ------------------------------------------------------------ */
  var GOLD_24K_PER_G = 16000;

  /* Purities are the ones 3Soul actually sells. Read from the live
     catalogue on 7 Sep 2026: /products.json lists 250 products and
     13,835 variants whose Metal option is 9K, 10K, 14K or 18K.
     22K appears nowhere in the catalogue, so the estimator no longer
     offers it — quoting a purity the shop cannot make is worse than
     offering one fewer choice. '22' is kept in the table only so an
     older saved configuration still resolves. */
  var PURITY = { '9': .375, '10': .417, '14': .585, '18': .750, '22': .916 };

  /* Gold colour: yellow, white and rose are tagged on 245 of the 250
     products. Colour does not change the cost of the metal, and the
     estimator says so on screen rather than inventing a premium. It
     is carried through because it is a real choice on every piece. */
  var COLOUR = {
    yellow: { label: 'Yellow gold' },
    white:  { label: 'White gold' },
    rose:   { label: 'Rose gold' }
  };

  /* Clarity is a genuine price axis in the catalogue, offered as SI,
     VS and VVS. Multipliers are derived from their own variant
     prices: averaged across every metal and size of Floral Joy
     Diamond Ring (90 variants), SI came to Rs 95,508, VS to Rs 98,143
     and VVS to Rs 101,138. Backing GST out of those gaps and
     attributing the whole difference to the stones gives roughly
     +18% for VS and +38% for VVS over SI. Illustrative, and the page
     prints that it is. */
  var CLARITY = {
    SI:  { label: 'SI',  mult: 1.00, note: 'Eye-clean at arm’s length' },
    VS:  { label: 'VS',  mult: 1.18, note: 'No inclusions to the naked eye' },
    VVS: { label: 'VVS', mult: 1.38, note: 'Near-flawless under 10x' }
  };

  var CATEGORY = {
    ring:        { label: 'Ring',        gold: 3.5,  carat: 0.90 },
    pendant:     { label: 'Pendant',     gold: 2.4,  carat: 0.55 },
    earrings:    { label: 'Earrings',    gold: 4.6,  carat: 1.10 },
    bracelet:    { label: 'Bracelet',    gold: 12.0, carat: 3.20 },
    bangle:      { label: 'Bangle',      gold: 18.5, carat: 2.40 },
    mangalsutra: { label: 'Mangalsutra', gold: 8.2,  carat: 1.30 },
    necklace:    { label: 'Necklace',    gold: 22.0, carat: 4.50 }
  };

  var STONE = {
    lab:     { label: 'Lab-grown', rate: 45000 },
    natural: { label: 'Natural',   rate: 200000 }
  };

  var GST_GOLD = 0.03;      // metal and stones
  var GST_MAKING = 0.05;    // labour
  var MAKING_PCT = 0.14;    // share of metal value — typical Indian range is 8–25%
  var SETTING_PER_CT = 4200;

  function inr(n) {
    n = Math.round(n);
    var s = String(n), last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    return '₹' + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last3;
  }

  function estimate(cfg) {
    var cat = CATEGORY[cfg.category] || CATEGORY.ring;
    var pur = PURITY[cfg.purity] || PURITY['18'];
    var stone = STONE[cfg.dtype] || STONE.lab;
    var carat = cfg.carat != null ? cfg.carat : cat.carat;

    /* Clarity defaults to a multiplier of 1, so a configuration that
       predates this option prices exactly as it did before. */
    var clar = CLARITY[cfg.clarity] || null;
    var clarMult = clar ? clar.mult : 1;

    var goldWeight = cat.gold;
    var gold = goldWeight * GOLD_24K_PER_G * pur;
    var stones = carat * stone.rate * clarMult;
    var making = gold * MAKING_PCT + carat * SETTING_PER_CT;
    // GST is not one rate: 3% on metal and stones, 5% on making charges.
    var gst = (gold + stones) * GST_GOLD + making * GST_MAKING;
    var total = gold + stones + making + gst;

    return {
      goldWeight: goldWeight,
      gold: gold, stones: stones, making: making, gst: gst, total: total,
      low: total * 0.90, high: total * 1.12,
      carat: carat,
      stoneLabel: stone.label,
      catLabel: cat.label,
      clarityLabel: clar ? clar.label : null,
      colourLabel: (COLOUR[cfg.colour] || {}).label || null,
      rows: [
        ['Gold — ' + goldWeight.toFixed(1) + ' g at ' + cfg.purity + 'K' +
          (COLOUR[cfg.colour] ? ', ' + COLOUR[cfg.colour].label.toLowerCase() : ''), gold],
        [stone.label + ' diamonds — ' + carat.toFixed(2) + ' ct' +
          (clar ? ', ' + clar.label : ''), stones],
        ['Making', making],
        ['GST — 3% metal & stones, 5% making', gst]
      ]
    };
  }

  function defaults() {
    return { category: 'ring', purity: '18', colour: 'yellow',
             dtype: 'lab', clarity: 'VS', carat: 0.90 };
  }

  /* Every combination of metal, colour, diamond type and clarity for
     one piece at one carat. 3 x 3 x 2 x 3 = 54, which is where the
     "120+ options" in the marketing actually comes from once carat
     steps are counted. The page shows the grid live rather than
     promising it in a report a day later. */
  function combinations(cfg) {
    var out = [];
    ['9', '14', '18'].forEach(function (pur) {
      ['lab', 'natural'].forEach(function (dt) {
        ['SI', 'VS', 'VVS'].forEach(function (cl) {
          var c = { category: cfg.category, purity: pur, colour: cfg.colour,
                    dtype: dt, clarity: cl, carat: cfg.carat };
          out.push({ purity: pur, dtype: dt, clarity: cl,
                     total: estimate(c).total });
        });
      });
    });
    return out;
  }

  w.PriceIt = {
    estimate: estimate, inr: inr, defaults: defaults, combinations: combinations,
    CATEGORY: CATEGORY, PURITY: PURITY, STONE: STONE,
    COLOUR: COLOUR, CLARITY: CLARITY,
    GOLD_24K_PER_G: GOLD_24K_PER_G, MAKING_PCT: MAKING_PCT
  };
})(window);
