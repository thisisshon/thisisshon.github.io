/* ============================================================
   Recreation of the live PriceIt page + the flag set.
   buildPage('current') — as it is now.
   buildPage('fixed')   — every flag resolved.
   Elements carry data-fl="<n>" so pins can anchor to them.
   ============================================================ */
(function (w) {
  'use strict';

  var RS = '₹'; // rupee

  /* ---------- shared chrome ---------- */
  function head() {
    return '<div class="pg-head"><span class="pg-burger" aria-hidden="true"></span>' +
      '<span class="pg-logo">3 SŌ U L</span>' +
      '<span style="display:flex;gap:12px"><span class="pg-ico" aria-hidden="true"></span>' +
      '<span class="pg-ico bag" aria-hidden="true"></span></span></div>' +
      '<div class="pg-crumb" data-fl="15">Home &nbsp;/&nbsp; Diamond Estimation Solutions</div>';
  }

  function hero(fx) {
    return '<div class="pg-hero">' +
      '<p class="pg-eyebrow">Thousands of jewellers. Millions of designs.</p>' +
      '<div class="pg-h" data-fl="6">Upload any jewellery image. Find out if you\u2019re being <u>Overcharged</u>!</div>' +
      '<div class="pg-brandmark">3 S\u014C U L</div>' +
      '<div class="pg-brandsub">True to you</div>' +
      '<div class="pg-presents">Presents</div>' +
      '<div class="pg-display">Price It</div>' +
      '<div class="pg-subline">The AI-powered jewellery cost estimator</div>' +
      '<button class="pg-cta">Try Price It <em>\u2014 it\u2019s free!</em></button>' +
      '</div>' + strip(false) + '<div class="pg-know">Know more \u2304</div>';
  }

  /* Rebuilt hero: one compact screen, then the form. No repeated brandmark,
     no second CTA to a form that is already directly below. */
  function heroCompact() {
    return '<div class="pg-hero" style="padding:18px 14px 10px">' +
      '<h1 class="pg-h" style="margin-bottom:6px">Diamond Jewellery Cost Estimator</h1>' +
      '<div class="pg-subline" style="margin:0">Upload any design · see what it should really cost</div>' +
      '</div>';
  }

  function strip(fx) {
    return '<div class="pg-strip"' + (fx ? '' : ' data-fl="9"') + '><span>Transparent breakdown</span>' +
      '<span>120+ pricing combinations</span><span>Expert validated</span><span>Report in 24h</span></div>';
  }

  /* ---------- the form: the funnel itself ---------- */
  function form(fx) {
    if (fx) {
      return '<div class="pg-formwrap"><div class="pg-form">' +
        '<h2 class="pg-formtitle">Get your estimate</h2>' +
        '<fieldset class="pg-fs"><legend class="pg-fieldlab">Which diamond?</legend>' +
        '<div class="pg-radios"><button aria-pressed="true">Natural</button>' +
        '<button aria-pressed="false">Lab-grown</button>' +
        '<button aria-pressed="false">Compare both</button></div></fieldset>' +
        '<span class="pg-fieldlab" id="fx-uplab">Upload your design — up to 5</span>' +
        '<div class="pg-drop" role="button" tabindex="0" aria-labelledby="fx-uplab">' +
        'Drag an image here<b>or browse</b></div>' +
        '<label class="pg-fieldlab" for="fx-lk">Or paste a link</label>' +
        '<input class="pg-in" id="fx-lk" name="fx-lk" placeholder="Pinterest, Instagram or a website">' +
        '<label class="pg-fieldlab" for="fx-nm">Your name</label>' +
        '<input class="pg-in" id="fx-nm" name="fx-nm" autocomplete="given-name" placeholder="Priya Sharma">' +
        '<label class="pg-fieldlab" for="fx-em">Email — where the report goes</label>' +
        '<input class="pg-in" id="fx-em" name="fx-em" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" required>' +
        '<label class="pg-fieldlab" for="fx-ph">Phone — optional, only for WhatsApp</label>' +
        '<input class="pg-in" id="fx-ph" name="fx-ph" type="tel" inputmode="numeric" autocomplete="tel" placeholder="+91">' +
        '<button class="pg-btn">Send me my free itemised report</button>' +
        '<p class="pg-fine">Free · itemised · in your inbox within 24 hours.<br>' +
        'We never share or sell your design. <u>Terms</u> · <u>Privacy</u>.</p>' +
        '<button class="pg-wa">WhatsApp us instead</button>' +
        '</div></div>';
    }
    return '<div class="pg-formwrap"><div class="pg-form">' +
      '<div class="pg-step">Step 1 of 2</div>' +
      '<div class="pg-formtitle">Get your estimate</div>' +
      '<span class="pg-lab">Which diamond?</span>' +
      '<div class="pg-radios"><button aria-pressed="true">Natural</button>' +
      '<button aria-pressed="false">Lab-grown</button><button aria-pressed="false">Compare both</button></div>' +
      '<span class="pg-lab">Upload your design (up to 5)</span>' +
      '<div class="pg-drop" data-fl="10">Drag an image here, or Browse</div>' +
      '<span class="pg-or">Or paste a link (Pinterest, Instagram, a website)</span>' +
      '<input class="pg-in" placeholder="https://...">' +
      '<button class="pg-note">Add a note</button>' +
      '<button class="pg-btn">Continue →</button>' +
      '<p class="pg-fine">Only takes 30 seconds — completely free</p>' +
      '<button class="pg-wa">WhatsApp Us — It’s faster</button>' +
      /* step 2, shown inline so the gate is visible without clicking through */
      '<div style="margin-top:18px;padding-top:16px;border-top:1px dashed var(--s-peach)">' +
      '<div class="pg-analysis"><div class="t">Your design’s being analysed</div>' +
      '<div class="s">Working on your estimate right now — usually done within 24 hours.</div>' +
      '<div class="pg-prog"><i style="width:0%"></i></div>' +
      '<div class="pg-alist"><span>● Reading your design</span>' +
      '<span>○ Checking today’s gold rate</span><span>○ Pricing your stones &amp; making</span></div></div>' +
      '<div class="pg-step" style="margin-top:16px">Almost there</div>' +
      '<div class="pg-formtitle" style="font-size:18px;line-height:1.4">Where should we send it?</div>' +
      '<div class="pg-2col" style="margin-top:10px" data-fl="4">' +
      '<input class="pg-in" placeholder="First name *"><input class="pg-in" placeholder="Last name *"></div>' +
      '<input class="pg-in" style="margin-top:8px" placeholder="you@email.com" data-fl="5">' +
      '<input class="pg-in" style="margin-top:8px" placeholder="09876543210">' +
      '<label class="pg-check"><input type="checkbox"><span>I agree with the terms &amp; conditions</span></label>' +
      '<button class="pg-btn" data-fl="1">Reveal the True cost</button>' +
      '<button class="pg-back">← Back</button>' +
      '</div></div></div>';
  }

  /* ---------- illustrative price card ---------- */
  function priceCard(fx) {
    var rows = [['Gold', '1,45,434'], ['LG Diamonds', '3,02,400'], ['Making', '26,880'], ['GST', '14,241']];
    var h = '<div class="pg-sec"><div class="pg-pricecard"><div class="nm">Rainbow Bracelet</div>' +
      '<div class="pg-shot"' + (fx ? '' : ' data-fl="13"') + '>product photograph</div><div class="pg-rows">';
    rows.forEach(function (r) { h += '<div class="pg-row"><span>' + r[0] + '</span><b>' + RS + r[1] + '</b></div>'; });
    h += '<div class="pg-row tot"><span>Total, itemised</span><b>' + RS + '4,88,955</b></div></div>' +
      '<p class="pg-illus">Illustrative. Your report prices every stone separately.</p></div></div>';
    return h;
  }

  /* ---------- proof / sample report ---------- */
  function proofs(fx) {
    return '<div class="pg-sec cream"><div class="pg-kick"' + (fx ? '' : ' data-fl="3"') + '>Before you upload anything</div>' +
      '<div class="pg-t">See exactly what you’ll get.</div>' +
      '<div class="pg-proofs">' +
      '<button class="pg-proof"' + (fx ? '' : ' data-fl="7"') + '><span class="ic">▤</span><span class="tx"><b>See a sample estimate</b>' +
      '<span>' + (fx ? 'Opens as an image — works on every phone' : 'A real report, line by line') + '</span></span></button>' +
      '<button class="pg-proof"><span class="ic">▶</span><span class="tx"><b>Watch how it works</b>' +
      '<span>60 seconds, start to finish</span></span></button></div>' +
      '<div class="pg-stats">' +
      '<div><div class="pg-statn">100%</div><div class="pg-statl">Free</div></div>' +
      '<div><div class="pg-statn">24h</div><div class="pg-statl">To report</div></div>' +
      '<div><div class="pg-statn">15,500+</div><div class="pg-statl">Estimates generated</div></div>' +
      '<div><div class="pg-statn">60+</div><div class="pg-statl">Years in the trade</div></div>' +
      '</div></div>';
  }

  /* ---------- testimonials (the duplication bug lives here) ---------- */
  function dupeAnchor(i, fx) {
    if (fx) return '';
    if (i === 5) return ' data-fl="14"';   // Mihir — copy pasted from Namrata's card
    if (i === 6) return ' data-fl="11"';   // first card of the repeated set
    return '';
  }

  function testimonials(fx) {
    /* Figures and copy as they stood on the live page, 29 Aug 2026.
       Current: six customers, each card rendered twice.
       Rebuilt: the same six, once each, with Mihir's pasted copy
       rewritten and Nashua corrected to Nashik. */
    var people = [
      ['Namrata K.', 'Solitaire ring \u00b7 Mumbai', 'AI + expert', RS + '84,100',
       'The same ring she\u2019d seen elsewhere \u2014 made to order, for far less.'],
      ['Ananya Rai', 'Jhumka earrings \u00b7 Pune', 'Recreation', RS + '22,400',
       'No picture to work from, just her words in the notes. The estimate landed before a single gram was cast.'],
      ['Hritik J.', 'Tennis bracelet \u00b7 Mumbai', '120 price variations', RS + '1,10,000',
       'He dropped an Instagram link in the form. We matched the look in lab-grown.'],
      ['Kavita S.', 'Mangalsutra \u00b7 ' + (fx ? 'Nashik' : 'Nashua'), 'Remaking old jewellery', RS + '31,000',
       'Every gram of her existing gold credited, the true making cost shown.'],
      ['Sara Mehta', 'Diamond pendant \u00b7 Bengaluru', 'PriceIt tool', '28%',
       'One photo, one tap, the whole breakdown \u2014 plus her initials on the back.'],
      ['Mihir D.', 'Gold kada \u00b7 Punjab', 'Personalisation', RS + '58,900',
       fx ? 'He wanted a traditional kada with a personal touch \u2014 engraved and costed before casting.'
          : 'She\u2019d been quoted a fortune at a big-name store. Price It showed the real cost \u2014 stone by stone \u2014 and we made it to order.']
    ];
    var cards = fx ? people : people.concat(people);   // the live page prints the set twice

    var h = '<div class="pg-sec"><div class="pg-kick">\u2014 A real estimate \u00b7 verified customer \u2014</div>' +
      '<div class="pg-t">This tool has saved people Lakhs!</div><div class="pg-cards">';
    cards.forEach(function (c, i) {
      h += '<div class="pg-card"' + dupeAnchor(i, fx) + '>' +
        '<div class="ph"></div><div class="nm">' + c[0] + '</div><div class="mt">' + c[1] + '</div>' +
        '<span class="badge">' + c[2] + '</span>' +
        '<div class="sl">Saved</div><div class="sv">' + c[3] + '</div>' +
        '<p class="cp">' + c[4] + '</p></div>';
    });
    return h + '</div></div>';
  }

  function howItWorks() {
    var s = [['Upload', 'Add a photo of any diamond jewellery — or paste a Pinterest, Instagram or website link.'],
      ['AI analyses', 'Our software reads the design, stones and craftsmanship to map out what the piece is made of.'],
      ['Experts validate', 'Jewellery experts at 3Soul review every aspect of the report.'],
      ['Estimate', 'Gold weight, diamond weight and manufacturing complexity — the true cost composition.'],
      ['Customise', '120+ budget options: gold purity, colour, natural vs lab-grown and diamond grades.'],
      ['Report', 'Metal, diamonds, making, GST and alternative pricing scenarios.']];
    var h = '<div class="pg-sec cream"><div class="pg-kick">From photo to fair price</div>' +
      '<div class="pg-t">How PriceIt works</div>' +
      '<p class="pg-lede">From photo to final report, in 24 hours — free.</p><div class="pg-steps">';
    s.forEach(function (x, i) {
      h += '<div class="pg-stepcard"><div class="pg-stepn">' + (i + 1) + '</div>' +
        '<div><div class="pg-h3">' + x[0] + '</div><p>' + x[1] + '</p></div></div>';
    });
    return h + '</div></div>';
  }

  function trust() {
    var t = [['All-round customisation', 'Your design, your stones, your story — nine in ten pieces we make are one of a kind.'],
      ['Fabulous craftsmanship', 'Trusted by luxury brands across the globe for the quality of our craft.'],
      ['120+ budget options', 'Every report comes with over 120 price options.'],
      ['60+ years in the trade', 'Backed by Janam Diamonds, supplying premium international brands.']];
    var h = '<div class="pg-sec"><div class="pg-kick">Our promise, in writing</div>' +
      '<div class="pg-t">Why trust 3Soul?</div><div class="pg-trust">';
    t.forEach(function (x) { h += '<div><div class="pg-h3">' + x[0] + '</div><p>' + x[1] + '</p></div>'; });
    h += '</div></div><div class="pg-sec cream"><div class="pg-kick">— Built for every jewellery decision —</div>' +
      '<div class="pg-t">Who uses PriceIt?</div><div class="pg-who">' +
      ['Wedding families', 'Proposal ring shoppers', 'Investors', 'Designers', 'NRIs &amp; luxury buyers', 'Resale sellers']
        .map(function (x) { return '<span>' + x + '</span>'; }).join('') +
      '</div></div>';
    return h;
  }

  function faq(fx) {
    var q = ['Is Price It an AI tool?', 'Is the estimate accurate?', 'What jewellery can I upload?',
      'Can I compare natural and lab-grown diamonds?', 'Can I customise my estimate?',
      'Is my image secure?', 'How long does it take?'];
    return '<div class="pg-sec"'+''+'><div class="pg-kick">Know more about PriceIt</div>' +
      '<div class="pg-t">Frequently asked questions</div><div class="pg-faqs">' +
      q.map(function (x) { return '<div class="pg-faq"><span>' + x + '</span><i>+</i></div>'; }).join('') +
      '</div></div>';
  }

  function footer(fx) {
    var cities = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
      'Surat', 'Jaipur', 'Chandigarh', 'Lucknow', 'Indore', 'Nagpur', 'Coimbatore'];
    return '<div class="pg-foot">' +
      '<p class="blurb">India’s most transparent &amp; customisable diamond-jewellery platform. ' +
      'Certified natural &amp; lab-grown, priced in the open.</p>' +
      '<div class="pg-fcols"><div><b>Explore</b>Price It<br>E-Shop<br>Boutique</div>' +
      '<div><b>Shop</b>Rings<br>Bracelets<br>Pendants</div>' +
      '<div><b>Company</b>Privacy Policy<br>Terms &amp; Conditions</div></div>' +
      '<div class="pg-cities"' + (fx ? '' : ' data-fl="12"') + '><b>' +
      (fx ? 'Diamond pricing by city' : 'Customised diamond jewellery, across India') + '</b>' +
      '<div class="pg-citylist">' +
      (fx ? ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Surat']
        : cities).map(function (c) { return '<span>Diamond Price in ' + c + '</span>'; }).join('') +
      '</div>' + (fx ? '<p style="margin-top:10px;color:rgba(255,255,255,.6)">Six cities with genuinely local content, not twenty-four near-copies.</p>' : '') +
      '</div></div>';
  }

  /* ---------- assembly ---------- */
  function buildPage(mode) {
    var fx = mode === 'fixed';
    var h = '<div class="pg' + (fx ? ' fixed' : '') + '">';
    h += head();
    if (fx) {
      h += heroCompact();
      h += form(fx);          // the one action the page exists for, in the first screen
      h += strip(true);
    } else {
      h += hero(fx);
      h += '<div class="pg-vid" data-fl="2">autoplaying hero video</div>';
      h += form(fx);
    }
    h += priceCard(fx);
    h += proofs(fx);
    if (!fx) { h += '<div class="pg-vid" data-fl="8">autoplaying video</div>'; }
    else { h += '<button class="pg-vid poster" type="button">Watch how it works \u2014 60 s</button>'; }
    h += testimonials(fx);
    h += howItWorks();
    if (!fx) { h += '<div class="pg-vid">autoplaying video</div><div class="pg-vid">autoplaying video</div>'; }
    h += trust();
    h += faq(fx);
    h += footer(fx);
    h += '</div>';
    return h;
  }

  /* ============================================================
     The flags — ranked most to least critical.
     `at` is the data-fl anchor; `where` names the spot in words.
     ============================================================ */
  /* ============================================================
     The flags — ranked most to least critical.
     `at` matches a data-fl anchor in the markup above.
     `wcag` names the success criterion where one is failed;
     those are measured, not asserted. Contrast figures come from
     a scan that refuses to guess: any text over an image or a
     translucent layer was skipped rather than counted.
     ============================================================ */
  /* ============================================================
     The flags — ranked most to least critical.
     Every figure below was re-verified on 29 Aug 2026 against the
     live page: DOM counts from the rendered document, file sizes
     from HTTP Content-Length, contrast from a scan that skips any
     text over an image or translucent layer rather than guess.
     Load time is deliberately absent: see the note in Evidence.
     ============================================================ */
  /* ============================================================
     What we found, ranked by what we'd fix first.
     `at` matches a data-fl anchor in the markup above.
     Every figure was re-checked on 29 Aug 2026 against the live
     page: DOM counts from the rendered document, file sizes from
     HTTP Content-Length, contrast from computed styles. Load time
     is deliberately absent — the note in Evidence explains why.
     ============================================================ */
  /* ============================================================
     Opportunities, ordered by the difference they'd make.
     `at` matches a data-fl anchor in the markup above.
     Figures re-checked 29 Aug 2026 against the live page: DOM
     counts from the rendered document, file sizes from HTTP
     Content-Length, contrast from computed styles. Load time is
     deliberately absent — the note in Evidence explains why.
     ============================================================ */
  var FLAGS = [
    { n: 1, sev: 'crit', at: '1',
      title: 'Show an estimate on the page, before asking for details',
      where: 'End of the form',
      what: 'The page is set up as a lead form: upload a photo, watch the analysis animation, add a phone number, and the report follows within 24 hours. The button at the end reads “Reveal the True cost”, and what appears next is “Thanks for sharing your details”.',
      ev: 'Submit → h3: “Thanks for sharing your details.”',
      cost: 'The title, the search traffic and the button all promise a number, so the moment right after someone hands over their phone is where expectation and page part company. Putting a figure on screen first would close that gap — it’s the change with the most upside here.' },

    { n: 2, sev: 'crit', at: '2',
      title: 'Move the video to posters and tap-to-play',
      where: 'Whole page',
      what: '18 embeds point at 10 unique files totalling 425 MB, the largest 79.5 MB on its own. All 1080p, at 2.5, 4.8 and 7.2 Mbps. Browsers stream rather than download them, so no one visit pays all of it — it arrives steadily for as long as the page is open.',
      ev: '10 files, 445,634,110 bytes · largest 79.5 MB · 616 s of footage',
      cost: 'The server responds in well under 100 ms, so this sits entirely in what the page loads rather than where it’s hosted. Posters with tap-to-play would recover most of it and keep the films for the people who want them.' },

    { n: 3, sev: 'crit', at: '3', wcag: '1.4.3 Contrast (Minimum) — AA',
      title: 'Deepen the gold a few steps so it holds on screen',
      where: 'Section kickers and labels',
      what: 'The tan and peach used for kickers, “SAVED” labels and star ratings sit on white between 1.54:1 and 2.36:1, where AA asks for 4.5:1 at these sizes. 53 elements come in below the line; another 93 sit over images and were skipped rather than guessed at.',
      ev: '#EFCAA5 1.54:1 · #F5A623 2.03:1 · #C8A96E 2.24:1 · need 4.5:1',
      cost: 'These carry the brand voice across the page, so it’s worth them being readable in sunlight and on cheaper screens. A few steps darker keeps the palette recognisably 3Soul and clears the line — the Rebuilt page shows how it looks.' },

    { n: 4, sev: 'crit', at: '4', wcag: '1.3.1 Info & Relationships · 3.3.2 Labels — A',
      title: 'Add labels to the form fields',
      where: 'Step 2, contact fields',
      what: 'First name, last name, email, phone, the note and the pasted link are identified by placeholder text. Placeholders clear as soon as someone types, and screen readers may not announce them.',
      ev: '6 estimator fields · 0 &lt;label&gt; · 0 aria-label',
      cost: 'A visible label per field makes the form usable with a screen reader and easier for everyone else to re-check before sending. It’s a markup change with a good deal of effect for the effort.' },

    { n: 5, sev: 'crit', at: '5',
      title: 'Turn on autofill, and make the phone number optional',
      where: 'Step 2, contact fields',
      what: 'No field carries an autocomplete attribute, so saved details don’t pre-fill. The phone field is plain text with no inputmode, which brings up a letter keyboard. Phone is required and email optional, and the terms checkbox is required without a link to the terms.',
      ev: 'autocomplete on 0 of 16 inputs · mobile: type=text, required · email: not required',
      cost: 'Each of these is small on its own, but they land together at the point where someone has already decided to go ahead. All five are one-line changes.' },

    { n: 6, sev: 'crit', at: '6', wcag: '1.3.1 Info & Relationships — A',
      title: 'Add an H1 and the search markup this page has earned',
      where: 'Hero and FAQ',
      what: 'The headline is a div rather than an H1 — that’s in the served HTML, not only the rendered page. There’s also no structured markup for the tool, the 23 FAQs, the breadcrumb or the 4.7 rating already on display.',
      ev: '&lt;h1&gt; count: 0 · JSON-LD: Organization only · 23 &lt;details&gt; FAQs unmarked',
      cost: 'The city pages already do this, so it’s a pattern that exists in the codebase. Adding it here claims visibility the page has already done the work for, and gives anyone navigating by headings a way in.' },

    { n: 7, sev: 'crit', at: '7',
      title: 'Serve the sample report as images so it opens everywhere',
      where: '“See exactly what you’ll get”',
      what: 'The sample opens as a PDF inside a 335×497 frame. At that width an A4 report is hard to read, and iOS Safari doesn’t render PDFs inside frames.',
      ev: 'iframe 335×497 at 375px wide · source: JWL-4881.pdf',
      cost: 'This is the asset that pre-sells the tool, and it’s worth it landing on the device most visitors arrive on. Exported as images it works everywhere and loads faster.' },

    { n: 8, sev: 'high', at: '8', wcag: '2.2.2 Pause, Stop, Hide — A',
      title: 'Give the looping videos a pause control',
      where: 'Throughout',
      what: 'Nine of the eighteen embeds autoplay muted on a loop, and none expose a control. AA asks that anything moving beyond five seconds can be paused; these clips run 12 to 96 seconds.',
      ev: '9 × autoplay + loop + no controls · durations 12.2–96.3 s',
      cost: 'A control makes the page readable for anyone sensitive to motion, and it’s the same change that settles the download in flag 2.' },

    { n: 9, sev: 'high', at: '9', wcag: '2.5.8 Target Size (Minimum) — AA',
      title: 'Lift type and tap targets to comfortable sizes',
      where: 'Throughout',
      what: '53 of 204 controls measure under 24×24, which is below the AA minimum, and 162 are under the 44px comfortable size. Body text runs at 8 and 10px through several sections, with one element at 6px.',
      ev: '53 / 204 under 24px · 162 under 44px · 40 elements at 10px, 8 at 8px',
      cost: 'Comfortable sizes let the argument land without effort, particularly in the sections doing the persuading. Mostly a pass over the type scale.' },

    { n: 10, sev: 'high', at: '10',
      title: 'Bring the upload box into the first screen',
      where: 'Page length and form position',
      what: 'The page runs 13,018 px on a 375×812 phone — sixteen screens. The upload box starts at 1,364 px, which puts it on the second.',
      ev: '13,018 px ÷ 812 = 16.0 screens · upload at 1,364 px',
      cost: 'The action the page exists for currently sits behind a scroll. Moving it up is a reordering rather than a redesign — the Rebuilt page puts it at 485 px.' },

    { n: 11, sev: 'high', at: '11',
      title: 'De-duplicate the testimonials and reviews',
      where: 'Testimonial carousel and reviews',
      what: 'Twelve testimonial cards carry six customers, each appearing twice, and the seven Google reviews are each rendered twice. The video embeds follow the same pattern: ten files across eighteen players.',
      ev: '12 cards / 6 people · 14 reviews / 7 people · 18 embeds / 10 files',
      cost: 'The proof reads stronger at six than at twelve. It looks like one loop rendering the array twice, so it may be a single fix across all three.' },

    { n: 12, sev: 'high', at: '12',
      title: 'Fix the Bengaluru link, and take a view on the city pages',
      where: 'Footer',
      what: 'The sitemap lists 24 “diamond price in…” pages out of 52 in total. They run 260–395 words with a good deal of shared text — Mumbai and Surat are 72% identical, Mumbai and Chennai 65%. The footer links Bengaluru, which returns 404; the page exists as Bangalore.',
      ev: '24 of 52 pages · 260–395 words · up to 72% identical · 1 of 15 footer links = 404',
      cost: 'The 404 is quick and sits in the footer of every page on the site. The wider set is a judgement call worth making together: fewer cities with genuinely local content tends to hold up better than a broad set of near-copies.' },

    { n: 13, sev: 'med', at: '13', wcag: '1.1.1 Non-text Content — A',
      title: 'Add alt text to the remaining images',
      where: 'Throughout',
      what: '17 of 67 images have no alternative text, among them product photographs and the customer portraits used as proof.',
      ev: '17 / 67 images, alt missing or empty',
      cost: 'Alt text puts that evidence within reach of anyone not looking at the screen, and of search engines reading the page.' },

    { n: 14, sev: 'med', at: '14',
      title: 'Tidy two details in the testimonial copy',
      where: 'Mihir D., gold kada',
      what: 'Mihir’s card describes a kada, and the quote beneath it is Namrata’s solitaire-ring story, still reading “She’d been quoted a fortune”. Separately, a Nashik customer is listed as Nashua.',
      ev: 'Mihir D. — “She’d been quoted…” · Kavita S. · Mangalsutra · Nashua',
      cost: 'Both are quick copy edits, and they matter more than their size on a page whose case rests on being believed about numbers.' },

    { n: 15, sev: 'low', at: '15',
      title: 'Trim the title and reshape the social image',
      where: 'Head and assets',
      what: 'The title is 81 characters and truncates near 60. The social preview is a 2488×3731 portrait declared over http. 46 of 67 images load immediately rather than on approach, and the logo is sent 1080px wide to be drawn at 90px.',
      ev: 'title 81 chars · og:image 2488×3731 over http · 46 / 67 not lazy',
      cost: 'Housekeeping, but it shapes how every share and every search result presents the page, and it takes a little weight off flag 2.' }
  ];

  // What the live page measures, for the stage's "this recreation vs the real
  // thing" label. Kept beside the recreation it describes so the two cannot
  // drift apart.
  // No `desk` figure: the live estimator was measured at 375×812 only, so the
  // stage drops the comparison in desktop view rather than quoting a phone
  // number against a desktop frame.
  var LIVE = { screens: '16.0', height: 13018 };

  // The live page's own weight, for the "this deck vs the page it describes"
  // panel at the end. Named rather than hardcoded in deck.js so home.html
  // cannot end up quoting the estimator's figures.
  var WEIGHT = { name: 'PriceIt', transfer: '3.2 – 9.9 MB',
                 transferNote: 'transferred — climbing while idle',
                 requests: '265 – 381', video: '425 MB',
                 videoNote: 'video behind 18 embeds' };

  w.PriceItPage = { buildPage: buildPage, FLAGS: FLAGS, LIVE: LIVE, WEIGHT: WEIGHT };
})(window);
