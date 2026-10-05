/* ============================================================
   The three approaches, as working prototypes.
   All share one config object so the A/B/C toggle carries the
   same input across approaches and the comparison stays fair.
   ============================================================ */
(function (w, d) {
  'use strict';

  var P = w.PriceIt;
  var cfg = P.defaults();
  var current = 'a';
  var host, noteHost;

  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }

  /* ---------- shared config controls ---------- */
  function controls(onChange, opts) {
    opts = opts || {};
    var wrap = el('div', 'calc');
    var cats = Object.keys(P.CATEGORY).map(function (k) {
      return '<option value="' + k + '"' + (cfg.category === k ? ' selected' : '') + '>' + P.CATEGORY[k].label + '</option>';
    }).join('');
    var purs = ['14', '18', '22'].map(function (k) {
      return '<option value="' + k + '"' + (cfg.purity === k ? ' selected' : '') + '>' + k + 'K gold</option>';
    }).join('');
    var dts = Object.keys(P.STONE).map(function (k) {
      return '<option value="' + k + '"' + (cfg.dtype === k ? ' selected' : '') + '>' + P.STONE[k].label + '</option>';
    }).join('');

    wrap.innerHTML =
      '<div class="calcrow">' +
      '<div class="field"><label for="pcat">What is it?</label><select id="pcat">' + cats + '</select></div>' +
      '<div class="field"><label for="ppur">Metal</label><select id="ppur">' + purs + '</select></div>' +
      '<div class="field"><label for="pdt">Diamonds</label><select id="pdt">' + dts + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="pct">Total carat weight</label>' +
      '<div class="rrow"><input id="pct" type="range" min="0.25" max="5" step="0.05" value="' + cfg.carat + '" ' +
      'aria-valuetext="' + cfg.carat.toFixed(2) + ' carat"><span class="rval" id="pctv">' + cfg.carat.toFixed(2) + ' ct</span></div></div>';

    var cat = wrap.querySelector('#pcat'), pur = wrap.querySelector('#ppur'),
        dt = wrap.querySelector('#pdt'), ct = wrap.querySelector('#pct'), ctv = wrap.querySelector('#pctv');

    function sync() {
      cfg.category = cat.value; cfg.purity = pur.value; cfg.dtype = dt.value;
      cfg.carat = parseFloat(ct.value);
      ctv.textContent = cfg.carat.toFixed(2) + ' ct';
      ct.setAttribute('aria-valuetext', cfg.carat.toFixed(2) + ' carat');
      onChange();
    }
    [cat, pur, dt].forEach(function (n) { n.addEventListener('change', sync); });
    ct.addEventListener('input', sync);

    // changing the category re-seeds a sensible carat unless the user has moved it
    cat.addEventListener('change', function () {
      if (!opts.keepCarat) {
        cfg.carat = P.CATEGORY[cfg.category].carat;
        ct.value = cfg.carat; ctv.textContent = cfg.carat.toFixed(2) + ' ct';
        onChange();
      }
    });
    return wrap;
  }

  function quoteBox(e, masked) {
    var q = el('div', 'quote');
    var rows = e.rows.map(function (r) {
      return '<div class="qbr"><span>' + r[0] + '</span><b>' + P.inr(r[1]) + '</b></div>';
    }).join('');
    q.innerHTML =
      '<div class="ql">Estimated range · ' + e.catLabel + ' · ' + e.stoneLabel + '</div>' +
      '<div class="qv' + (masked ? ' masked' : '') + '">' + P.inr(e.low) + ' – ' + P.inr(e.high) + '</div>' +
      '<div class="qb' + (masked ? ' masked' : '') + '">' + rows +
      '<div class="qbr tot"><span>Total, itemised</span><b>' + P.inr(e.total) + '</b></div></div>' +
      '<p class="qn">Built from Indian market rates, August 2026: gold ' + P.inr(P.GOLD_24K_PER_G) +
      '/g at 24K, lab-grown ' + P.inr(P.STONE.lab.rate) + '/ct, natural ' + P.inr(P.STONE.natural.rate) +
      '/ct, making at 14% of metal, GST 3% on metal and stones and 5% on making. ' +
      'Real figures, but a fixed snapshot \u2014 a live build would read gold daily and price every stone ' +
      'on its own grade.</p>';
    return q;
  }

  /* ---------- A, price first, ask later ---------- */
  function renderA(root) {
    var out = el('div');
    var body = el('div', 'card');
    var result = el('div');
    var gate = el('div');

    function draw() {
      var e = P.estimate(cfg);
      result.innerHTML = '';
      result.appendChild(quoteBox(e, false));
    }
    body.appendChild(controls(draw));
    body.appendChild(el('div', null, '<div style="height:18px"></div>'));
    body.appendChild(result);
    draw();

    gate.className = 'gate';
    gate.innerHTML =
      '<h3 style="font-size:23px;margin-bottom:8px">That is the range for a typical piece.</h3>' +
      '<p style="color:var(--ink-2);margin-bottom:16px">Upload your design and we will price <em>yours</em>, every stone, ' +
      'the real making charge, and 120 budget variations. Free, within 24 hours.</p>' +
      '<div class="calcrow">' +
      '<div class="field"><label for="a-nm">Name</label><input id="a-nm" type="text" autocomplete="given-name" placeholder="Your name"></div>' +
      '<div class="field"><label for="a-em">Email</label><input id="a-em" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com"></div>' +
      '</div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn" id="a-go">Send me the exact price</button>' +
      '<button class="btn wa" id="a-wa">WhatsApp instead</button></div>' +
      '<p style="color:var(--ink-3);margin:14px 0 0">No phone number needed. We never share or sell your design.</p>';

    out.appendChild(body);
    out.appendChild(gate);
    root.appendChild(out);

    gate.querySelector('#a-go').addEventListener('click', function () {
      var m = gate.querySelector('.okmsg');
      if (m) m.remove();
      gate.appendChild(el('div', 'okmsg',
        '<b>Sent.</b> The visitor already knows roughly what it costs, so this ask is a step up, not a toll gate. ' +
        'They gave an email because the page had already been useful.'));
    });
    gate.querySelector('#a-wa').addEventListener('click', function () {
      var m = gate.querySelector('.okmsg');
      if (m) m.remove();
      gate.appendChild(el('div', 'okmsg', '<b>Opens WhatsApp.</b> For a large share of Indian buyers this is the lowest-friction path available.'));
    });
  }

  /* ---------- B, same model, friction removed ---------- */
  function renderB(root) {
    var out = el('div');
    var sample = el('div', 'card');
    sample.innerHTML =
      '<h3 style="font-size:23px;margin-bottom:6px">See a real report before you give anything</h3>' +
      '<p style="color:var(--ink-2)">Shown as images, not a PDF in a frame, so it works on every phone.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px">' +
      ['Metal & weight', 'Every stone priced', 'Making & GST', '120 budget options'].map(function (t) {
        return '<div style="border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface-2)">' +
          '<div style="height:74px;border-radius:8px;background:linear-gradient(135deg,#EFE6D6,#DED0B8);margin-bottom:10px"></div>' +
          '<b style="font-size:14.5px">' + t + '</b></div>';
      }).join('') + '</div>';

    var f = el('div', 'card');
    f.style.marginTop = '16px';
    f.innerHTML =
      '<h3 style="font-size:23px;margin-bottom:6px">Get your itemised report</h3>' +
      '<p style="color:var(--ink-2);margin-bottom:16px">Four fields, autofill on, phone optional.</p>' +
      '<div class="calcrow">' +
      '<div class="field"><label for="b-nm">Name</label><input id="b-nm" type="text" autocomplete="given-name" placeholder="Your name"></div>' +
      '<div class="field"><label for="b-em">Email</label><input id="b-em" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com"></div>' +
      '</div>' +
      '<div class="field" style="margin-top:12px"><label for="b-ph">Phone, optional, only if you want it on WhatsApp</label>' +
      '<input id="b-ph" type="tel" inputmode="numeric" autocomplete="tel" placeholder="+91"></div>' +
      '<div style="margin-top:16px"><button class="btn" id="b-go">Send me my free itemised report</button></div>' +
      '<p style="color:var(--ink-3);margin:14px 0 0">Free · itemised · within 24 hours. ' +
      'By sending you agree to our <u>terms</u>, linked, not just claimed.</p>';

    out.appendChild(sample); out.appendChild(f);
    root.appendChild(out);
    f.querySelector('#b-go').addEventListener('click', function () {
      var m = f.querySelector('.okmsg'); if (m) m.remove();
      f.appendChild(el('div', 'okmsg',
        '<b>Sent.</b> The button says exactly what happens, so nothing is broken when the report arrives tomorrow instead of now.'));
    });
  }

  /* ---------- C, configure, then unlock ---------- */
  function renderC(root) {
    var out = el('div');
    var body = el('div', 'card');
    var result = el('div');
    var unlocked = false;

    function draw() {
      var e = P.estimate(cfg);
      result.innerHTML = '';
      result.appendChild(quoteBox(e, !unlocked));
      if (!unlocked) {
        var g = el('div', 'gate dashed');
        g.innerHTML =
          '<b style="font-size:17px">Your estimate is ready.</b>' +
          '<p style="color:var(--ink-2);margin:8px 0 14px">Enter an email to see the figures. Nothing else asked.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
          '<div class="field" style="flex:1;min-width:210px"><label for="c-em">Email</label>' +
          '<input id="c-em" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com"></div>' +
          '<button class="btn g" id="c-go">Unlock the breakdown</button></div>';
        result.appendChild(g);
        g.querySelector('#c-go').addEventListener('click', function () { unlocked = true; draw(); });
      } else {
        result.appendChild(el('div', 'okmsg',
          '<b>Unlocked.</b> Captured at peak intent, but the visitor was shown a blurred number first. ' +
          'Read the risk note beside this before choosing it.'));
      }
    }
    body.appendChild(controls(function () { draw(); }));
    body.appendChild(el('div', null, '<div style="height:18px"></div>'));
    body.appendChild(result);
    draw();
    out.appendChild(body);
    root.appendChild(out);
  }

  /* ---------- notes rail ---------- */
  var NOTES = {
    a: {
      name: 'A, Price first, ask later',
      changed: ['The estimate appears with nothing asked in return.',
        'Photo upload becomes the upgrade, not the toll gate.',
        'Contact is requested after the page has already been useful.',
        'Email only, no phone, no last name, no terms box.'],
      why: 'It delivers what the page has always promised in its title, so search intent and the page finally agree.',
      fixes: [1, 3, 4, 5],
      risk: 'The pricing logic sits in the page unless it is moved behind a small service. That is Phase 2 in the recommendation.'
    },
    b: {
      name: 'B, Same model, friction removed',
      changed: ['Button says what actually happens.',
        'Sample report shown before the ask, as images not a framed PDF.',
        'Last name and terms checkbox dropped; phone optional with a reason.',
        'Autofill restored, correct keyboard for phone.'],
      why: 'Smallest build. Fixes the honesty problem and the form without exposing any pricing.',
      fixes: [1, 3, 5],
      risk: 'Still asks people to wait 24 hours for a number the page implies it can produce now. The ceiling is lower.'
    },
    c: {
      name: 'C, Configure, then unlock',
      changed: ['Full configuration is visible and live.',
        'The figure is computed, then masked until an email is given.',
        'One field, no name, no phone.'],
      why: 'Captures the lead at the moment of highest intent, when the number is one click away.',
      fixes: [1, 3, 4],
      risk: 'Showing a blurred number you already calculated is the move people resent most. On a page whose argument is transparency, it works directly against the pitch.'
    }
  };

  function drawNotes() {
    var n = NOTES[current];
    noteHost.innerHTML =
      '<div class="card"><h4>What changed</h4><ul>' + n.changed.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
      '<div class="card"><h4>Why</h4><p style="margin:0;line-height:1.6;color:var(--ink-2)">' + n.why + '</p></div>' +
      '<div class="card"><h4>Flags this answers</h4><div>' +
      n.fixes.map(function (f) { return '<span class="fixref">Flag ' + f + '</span>'; }).join('') + '</div></div>' +
      '<div class="card" style="border-color:var(--high-line);background:var(--high-bg)"><h4 style="color:var(--high)">Trade-off</h4>' +
      '<p style="margin:0;line-height:1.6;color:var(--ink-2)">' + n.risk + '</p></div>';
  }

  function render() {
    host.innerHTML = '';
    if (current === 'a') renderA(host);
    else if (current === 'b') renderB(host);
    else renderC(host);
    drawNotes();
  }

  function init() {
    host = d.getElementById('protoHost');
    noteHost = d.getElementById('protoNotes');
    if (!host) return;
    var seg = d.getElementById('protoSeg');
    seg.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-p]'); if (!b) return;
      current = b.getAttribute('data-p');
      [].forEach.call(seg.querySelectorAll('button[data-p]'), function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      render();
    });
    render();
  }

  w.Prototypes = { init: init };
})(window, document);
