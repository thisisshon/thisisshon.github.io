/* ============================================================
   Design page, UI and UX improvements only.
   Ordered by the difference each would make.
   Everything measured here was taken from the live page on
   29 Aug 2026; anything that is a design judgement rather than a
   measurement is marked as such, so the two never blur.
   ============================================================ */
(function (w, d) {
  'use strict';

  var ITEMS = [
    { n: 1, tier: 'now', area: 'Flow',
      title: 'Give a number before asking for anything',
      now: 'Choose a diamond type, upload a photo, sit through an analysis animation, hand over name and phone, then wait 24 hours for the figure.',
      change: 'Let people configure a piece, category, metal, carat, natural or lab-grown, and show an itemised range straight away. Keep the photo upload, but move it after the number, as the upgrade to an exact quote.',
      why: 'The page is called an estimator and it takes calculator traffic. Showing a figure first makes the ask afterwards feel earned rather than charged.',
      measured: 'Submit currently returns “Thanks for sharing your details.”',
      effort: 'Large, this is the rebuild', wcag: null },

    { n: 2, tier: 'now', area: 'Layout',
      title: 'Put the upload box in the first screen',
      now: 'The dropzone starts at 1,364 px on a 375×812 phone, so it opens on the second screen. The hero repeats the logo, a “presents” line and the wordmark before it.',
      change: 'Trim the hero to headline plus one line, and bring the form directly under it. The proof strip and stats can follow the form rather than precede it.',
      why: 'The one action the page exists for shouldn’t sit behind a scroll.',
      measured: '1,364 px on the live page → 485 px in the Rebuilt version',
      effort: 'Small, reordering, not redesign', wcag: null },

    { n: 3, tier: 'now', area: 'Colour',
      title: 'Deepen the gold so it survives daylight',
      now: 'Kickers, “SAVED” labels and star ratings run at #C8A96E, #EFCAA5 and #F5A623 on white, 1.54:1 to 2.36:1.',
      change: 'Take the tan to roughly #7E6435 and the deep tan to #6E5729 for text use. Keep the lighter tones for rules, borders and fills, where contrast rules don’t apply.',
      why: 'These carry the brand voice across every section. A few steps darker reads as the same palette and clears 4.5:1.',
      measured: '53 elements below the AA line; 93 more over images, not assessed',
      effort: 'Small, token change', wcag: '1.4.3 Contrast, AA' },

    { n: 4, tier: 'now', area: 'Forms',
      title: 'Label every field, and let the browser fill them',
      now: 'Six fields identified by placeholder alone. No autocomplete anywhere. The phone field is plain text, so it opens a letter keyboard.',
      change: 'A visible label above each field, <code>autocomplete</code> on name, email and phone, <code>type="tel"</code> with <code>inputmode="numeric"</code>, and a linked terms line instead of an unlinked checkbox.',
      why: 'Placeholders vanish as soon as someone types, so there is nothing left to check the entry against, and screen readers may not announce them at all.',
      measured: '0 labels and 0 autocomplete attributes across 16 inputs',
      effort: 'Small, markup only', wcag: '1.3.1 · 3.3.2 Labels, A' },

    { n: 5, tier: 'now', area: 'Forms',
      title: 'Ask for email, and make the phone number optional',
      now: 'Phone is required, email is not, and last name is mandatory.',
      change: 'Require the email, since that is where the report goes. Offer the phone as optional with the reason stated, “only if you’d prefer WhatsApp”. Drop last name.',
      why: 'A phone number is the highest-friction thing to ask for in this market, and it is currently required to receive something delivered by email.',
      measured: 'mobile: required · email: not required · last_name: required',
      effort: 'Small', wcag: null },

    { n: 6, tier: 'now', area: 'Media',
      title: 'Posters and tap-to-play instead of autoplay',
      now: 'Nine of eighteen embeds autoplay muted on a loop with no control, drawn from 425 MB of source files.',
      change: 'Ship a poster image with a play control. Load the file only when someone asks for it, and keep one film rather than four.',
      why: 'It settles the page for anyone sensitive to motion, and recovers most of the download at the same time.',
      measured: '9 × autoplay + loop + no controls · clips 12.2–96.3 s',
      effort: 'Medium', wcag: '2.2.2 Pause, Stop, Hide, A' },

    { n: 7, tier: 'next', area: 'Type',
      title: 'Raise the type scale off the floor',
      now: 'Body copy runs at 8–12 px through the persuading sections; one element is 6 px. 40 elements sit at 10 px.',
      change: 'Body at 16 px, supporting copy no lower than 14 px, micro-labels no lower than 11 px. Keep the uppercase tracking, it is doing the styling, not the size.',
      why: 'Reading currently takes effort exactly where the argument is being made.',
      measured: 'smallest 7 px · 148 of 220 text elements under 12 px',
      effort: 'Medium, a pass over the scale', wcag: null },

    { n: 8, tier: 'next', area: 'Targets',
      title: 'Bring tap targets up to a comfortable size',
      now: '53 of 204 controls measure under 24×24; 162 are under 44×44. The sample-report close button is 32×32.',
      change: '44×44 minimum for anything tappable. Where a control must stay visually small, pad the hit area rather than the icon.',
      why: 'Below 24×24 is under the AA minimum, and anything under 44 is a miss waiting to happen on a phone.',
      measured: '53 under 24 px · 162 under 44 px, of 204 controls',
      effort: 'Medium', wcag: '2.5.8 Target Size, AA' },

    { n: 9, tier: 'next', area: 'Proof',
      title: 'Show the sample report as images',
      now: 'It opens as a PDF in a 335×497 iframe. iOS Safari renders nothing there.',
      change: 'Export the report to two or three images and show them inline, with the PDF as a download for anyone who wants it.',
      why: 'This is the asset that pre-sells the tool, and it currently fails on the device most visitors arrive on.',
      measured: 'iframe 335×497 · JWL-4881.pdf',
      effort: 'Small', wcag: null },

    { n: 10, tier: 'next', area: 'Proof',
      title: 'Show each testimonial once',
      now: 'Twelve cards for six customers, fourteen review blocks for seven reviews, eighteen video players for ten files.',
      change: 'Render the array once. If the carousel needs more to feel full, widen the cards rather than repeat the people.',
      why: 'Proof reads stronger at six than at twelve, and the repetition is visible as soon as anyone scrolls twice.',
      measured: '12 / 6 · 14 / 7 · 18 / 10',
      effort: 'Small, likely one loop', wcag: null },

    { n: 11, tier: 'next', area: 'Honesty',
      title: 'Let the analysis animation describe something real',
      now: 'A progress bar and three steps, “Reading your design”, “Checking today’s gold rate”, “Pricing your stones”, play while nothing is being computed.',
      change: 'If Approach A ships, these steps become true and can stay. If not, replace them with a plain confirmation of what happens next and when.',
      why: 'Simulated progress is the kind of detail that costs trust once noticed, on a page whose entire pitch is transparency.',
      measured: 'Progress bar renders at 0% throughout',
      effort: 'Small', wcag: null },

    { n: 12, tier: 'next', area: 'Length',
      title: 'Shorten the page, or let people skip down it',
      now: 'Sixteen screens on a phone, with the six-step explainer, six trust cards, six audience pills, the comparison table and the FAQ all in sequence.',
      change: 'Cut to the sections that answer a real question at that point in the decision, and give the rest an anchored jump. A persistent “Get my estimate” bar would help too.',
      why: 'Most of the persuading happens in the first three screens; the rest is available rather than read.',
      measured: '13,018 px ÷ 812 = 16.0 screens',
      effort: 'Medium, an editing decision as much as a design one', wcag: null },

    { n: 13, tier: 'later', area: 'Copy',
      title: 'Fix two testimonial details',
      now: 'Mihir’s kada carries Namrata’s ring copy, still reading “She’d been quoted a fortune”. A Nashik customer is listed as Nashua.',
      change: 'Rewrite Mihir’s line and correct the city.',
      why: 'Small, but on a page asking to be believed about numbers, invented-looking detail is expensive.',
      measured: 'Both present on the live page, 29 Aug',
      effort: 'Ten minutes', wcag: null },

    { n: 14, tier: 'later', area: 'Media',
      title: 'Add alt text, and size images to their slot',
      now: '17 of 67 images have no alt text. 46 load immediately rather than on approach. The logo is sent 1080 px wide to be drawn at 90 px.',
      change: 'Alt text on anything carrying meaning, empty alt on decoration, <code>loading="lazy"</code> below the fold, and widths that match the rendered size.',
      why: 'It puts the evidence within reach of anyone not looking at the screen, and takes weight off the page.',
      measured: '17 / 67 without alt · 46 / 67 not lazy',
      effort: 'Small', wcag: '1.1.1 Non-text Content, A' },

    { n: 15, tier: 'later', area: 'Consistency',
      title: 'Settle one unit for the savings figures',
      now: 'Five customers show a rupee saving and one shows “28%”, in the same row.',
      change: 'Pick rupees or percentage and apply it across the set.',
      why: 'A mixed row invites the reader to work out which is more flattering, which is the opposite of the intended effect.',
      measured: '₹84,100 · ₹22,400 · ₹1,10,000 · ₹31,000 · 28% · ₹58,900',
      effort: 'Ten minutes', wcag: null }
  ];

  var TIERS = {
    now:   { label: 'Start here',  note: 'Biggest difference for the effort. These are the ones we’d take first.' },
    next:  { label: 'Then these',  note: 'Clear improvements, none of them blocked by the decision above.' },
    later: { label: 'When there’s time', note: 'Small, quick, and worth clearing while the rest is in flight.' }
  };

  function el(t, c, h) { var e = d.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }

  function render() {
    var host = d.getElementById('dList');
    if (!host) return;
    var filter = 'all';

    function draw() {
      host.innerHTML = '';
      ['now', 'next', 'later'].forEach(function (tier) {
        var items = ITEMS.filter(function (i) {
          if (filter === 'wcag') return i.tier === tier && i.wcag;
          if (filter !== 'all' && filter !== 'wcag') return i.tier === tier && i.area === filter;
          return i.tier === tier;
        });
        if (!items.length) return;
        var head = el('div', 'dtier');
        head.innerHTML = '<span class="dtier-l ' + tier + '">' + TIERS[tier].label + '</span>' +
          '<span class="dtier-n">' + TIERS[tier].note + '</span>' +
          '<span class="dtier-c">' + items.length + '</span>';
        host.appendChild(head);
        items.forEach(function (i) {
          var c = el('article', 'dcard ' + tier);
          c.innerHTML =
            '<div class="dhead"><span class="dnum">' + i.n + '</span>' +
            '<div><h3>' + i.title + '</h3>' +
            '<div class="dmeta"><span class="darea">' + i.area + '</span>' +
            '<span class="deffort">' + i.effort + '</span>' +
            (i.wcag ? '<span class="dwcag">' + i.wcag + '</span>' : '') + '</div></div></div>' +
            '<div class="dbody">' +
            '<div class="dcol"><h4>How it works now</h4><p>' + i.now + '</p></div>' +
            '<div class="dcol change"><h4>What we’d change</h4><p>' + i.change + '</p></div>' +
            '</div>' +
            (w.PriceItDemos ? w.PriceItDemos.html(i.n) : '') +
            '<p class="dwhy"><b>Why</b> ' + i.why + '</p>' +
            '<p class="dmeas"><span class="tag measured">Measured</span> ' + i.measured + '</p>';
          host.appendChild(c);
        });
      });
    }

    var bar = d.getElementById('dFilter');
    if (bar) {
      var areas = ['all'].concat(ITEMS.map(function (i) { return i.area; })
        .filter(function (v, ix, a) { return a.indexOf(v) === ix; })).concat(['wcag']);
      areas.forEach(function (a) {
        var b = el('button', null, a === 'all' ? 'Everything' : a === 'wcag' ? 'Touches WCAG' : a);
        b.type = 'button';
        b.setAttribute('aria-pressed', a === 'all' ? 'true' : 'false');
        b.addEventListener('click', function () {
          filter = a;
          [].forEach.call(bar.querySelectorAll('button'), function (x) {
            x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
          });
          draw();
          prosePacked = null; syncProse();
          requestAnimationFrame(fitSourcePanes);
        });
        bar.appendChild(b);
      });
    }
    draw();
  }

  /* Lifted components keep the live page's pixel widths; scale each to its
     pane so nothing is clipped and nothing is reflowed. */
  function fitSourcePanes() {
    [].forEach.call(d.querySelectorAll('.srcwrap'), function (el) {
      el.style.transform = '';
      var pane = el.parentElement;
      if (!pane.offsetParent) return;          // hidden pane has no usable width
      var avail = pane.clientWidth - 20;
      var natural = el.scrollWidth || el.getBoundingClientRect().width;
      if (!natural) return;
      var k = Math.min(1, avail / natural);
      el.style.transform = 'scale(' + k + ')';
      pane.style.height = Math.round(el.getBoundingClientRect().height + 20) + 'px';
    });
  }

  /* Same marker as the deck, parked on the current page's link. */
  function markCurrent() {
    var rail = d.querySelector('.rail');
    var on = rail && rail.querySelector('a.on');
    if (!rail || !on) return;
    var ind = rail.querySelector('.rail-ind');
    if (!ind) {
      ind = d.createElement('span');
      ind.className = 'rail-ind';
      ind.setAttribute('aria-hidden', 'true');
      rail.appendChild(ind);
    }
    var r = on.getBoundingClientRect(), rr = rail.getBoundingClientRect();
    ind.style.transition = 'none';
    ind.style.transform = 'translateY(' + Math.round(r.top - rr.top) + 'px)';
    ind.style.height = Math.round(r.height) + 'px';
    ind.style.opacity = '1';
  }

  /* One pane at a time below 700px; both side by side above it. */
  function initPaneTabs() {
    d.addEventListener('click', function (ev) {
      var b = ev.target.closest('.ddemo-tabs button');
      if (!b) return;
      var demo = b.closest('.ddemo');
      var pane = b.getAttribute('data-pane');
      demo.setAttribute('data-pane', pane);
      [].forEach.call(demo.querySelectorAll('.ddemo-tabs button'), function (x) {
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      });
      fitSourcePanes();          // the newly shown pane needs measuring
    });
  }

  /* Below 700px the two prose columns say what the two panes already show,
     one under the other. Move each half into the pane it describes: the
     explanation sits with the thing it explains, and the card loses the
     duplicate block rather than the content. Moved, never copied, so a
     screen reader still meets each sentence once. */
  var prosePacked = null;
  var proseMQ = w.matchMedia('(max-width: 700px)');
  // matchMedia fires on the breakpoint itself; a resize listener can be missed
  // entirely when the viewport changes without a resize event.
  if (proseMQ.addEventListener) proseMQ.addEventListener('change', function () { syncProse(); fitSourcePanes(); });
  else if (proseMQ.addListener) proseMQ.addListener(function () { syncProse(); fitSourcePanes(); });

  function syncProse() {
    var packed = proseMQ.matches;
    if (packed === prosePacked) return;
    prosePacked = packed;
    [].forEach.call(d.querySelectorAll('.dcard'), function (card) {
      var body = card.querySelector('.dbody');
      var demo = card.querySelector('.ddemo');
      if (!body || !demo) return;
      var nowCol = card.querySelector('.dcol:not(.change)');
      var fixCol = card.querySelector('.dcol.change');
      var nowPane = demo.querySelector('.ddemo-pane[data-pane="now"]');
      var fixPane = demo.querySelector('.ddemo-pane[data-pane="fix"]');
      if (!nowCol || !fixCol || !nowPane || !fixPane) return;
      if (packed) {
        nowPane.appendChild(nowCol);
        fixPane.appendChild(fixCol);
        body.hidden = true;
      } else {
        body.hidden = false;
        body.appendChild(nowCol);
        body.appendChild(fixCol);
      }
    });
    fitSourcePanes();
  }

  function boot() {
    render(); markCurrent(); initPaneTabs(); syncProse();
    requestAnimationFrame(fitSourcePanes); setTimeout(fitSourcePanes, 250);
  }
  var rt;
  w.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { syncProse(); fitSourcePanes(); markCurrent(); }, 150); });
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
