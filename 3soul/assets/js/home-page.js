/* ============================================================
   Recreation of the live 3soul.in homepage + its flag set.

   buildPage('current') — the homepage as it is now, at the real
   type sizes, spacing and section order measured at 375x812 on
   29 August 2026. There is no 'fixed' mode: this audit stops at
   Flagged, because what the homepage needs is a list of repairs
   rather than a redesign. See the README.

   Section heights below are the measured ones, so the recreation
   runs to the same proportions as the page it describes:

     header            73 px
     hero video       209 px
     marquee           57 px
     3Soul Advantage  499 px
     Get an estimate 1891 px
     Crafted with...  627 px
     Featured In      283 px
     Upload Any...   2011 px
     Instagram        707 px
     Newsletter       370 px
     footer          1519 px
     ------------------------
     total           8245 px  (10.2 screens)

   Elements carry data-fl="<n>" so pins can anchor to them.
   ============================================================ */
(function (w) {
  'use strict';

  var RS = '₹'; // rupee

  /* ---------- header ----------
     The only <h1> on the page wraps the logo and holds no text, so
     it is reproduced here as exactly that: a heading with a picture
     in it and nothing to read. Flag 2 pins to it. */
  function head() {
    return '<div class="pg-head" data-fl="2">' +
      '<span class="pg-burger" aria-hidden="true"></span>' +
      '<span class="pg-logo">3 SŌ U L</span>' +
      '<span style="display:flex;gap:12px">' +
      '<span class="pg-ico" aria-hidden="true"></span>' +
      '<span class="pg-ico bag" aria-hidden="true"></span></span></div>';
  }

  /* ---------- hero ----------
     Two <video> elements, both autoplay/loop/muted, both pointing at
     the same 4.36 MB 1080p file. The unmute control is a real 44px
     button — one of the few on the page that is. */
  function hero() {
    return '<div class="hp-hero" data-fl="5">' +
      '<span class="hp-hero-lbl">autoplaying 1080p video · 4.36 MB</span>' +
      '<span class="hp-mute" aria-hidden="true">✕</span>' +
      '</div>';
  }

  /* ---------- marquee ----------
     Three copies of the same four phrases scroll past. Two are
     aria-hidden, so a screen reader meets the line once — correct,
     and deliberately not flagged. */
  function marquee() {
    var line = '<b>Jewellery, without the confusion</b><i>·</i>' +
               '<b>Full price clarity</b><i>·</i>' +
               '<b>Design your way</b><i>·</i>' +
               '<b>No hidden costs</b><i>·</i>';
    return '<div class="hp-marq"><div class="hp-marq-in">' + line + line + '</div></div>';
  }

  /* ---------- 3Soul Advantage ---------- */
  function advantage() {
    return '<div class="pg-sec hp-adv">' +
      '<div class="pg-kick">CONTINUING A LONG LEGACY</div>' +
      '<h2 class="pg-h">3Soul Advantage</h2>' +
      '<p class="pg-lede">At 3Soul, we view jewellery as a timeless expression of individuality ' +
      'and elegance. Rooted in Janam Diamonds’ rich legacy, we blend age-old craftsmanship with ' +
      'modern artistry. We offer transparent pricing and fairly-priced diamonds, reflecting our ' +
      'commitment to honesty and excellence. With personalised designs and ethical sourcing of all ' +
      'material, 3Soul creates unique, high-quality jewellery that truly stands out.</p>' +
      '<button class="hp-link" type="button">READ MORE</button></div>';
  }

  /* ---------- estimate pitch, first telling ----------
     1,891 px. Flag 4 pins here and names the second telling. */
  function estimateA() {
    var step = function (n, t, b) {
      return '<div class="hp-step"><span class="hp-stepn">' + n + '</span>' +
        '<h3 class="hp-steph">' + t + '</h3><p>' + b + '</p></div>';
    };
    return '<div class="pg-sec hp-estA" data-fl="4">' +
      '<div class="pg-kick">KNOW THE TRUE VALUE OF YOUR JEWELLERY</div>' +
      '<h2 class="pg-h">Get an estimate</h2>' +
      '<p class="pg-lede">Simply upload an image of any piece of jewellery, and we will provide ' +
      'you with a detailed estimate of its accurate material and labour prices. We ensure that you ' +
      'know the true value of the piece, with no inflated costs or hidden fees.</p>' +
      '<div class="hp-steps">' +
      step(1, 'Upload an Image', 'Upload a photo of the design that you would like to get made.') +
      step(2, 'Receive an Estimate', 'Get a precise estimate of how much the piece should cost with multiple combinations.') +
      step(3, 'Get Your Jewellery', 'You can choose one of the 120 combinations and get the jewellery made from us and delivered straight to you.') +
      '</div>' +
      '<button class="pg-btn" type="button">RECEIVE AN ESTIMATE</button></div>';
  }

  /* ---------- product carousel ---------- */
  function products() {
    var items = [
      ['Scarlet Embrace - LG Diamond Ring', '37,998'],
      ['Petal Shine - LG Diamond Ring', '71,114'],
      ['Petal Shine Diamond Ring', '141,588'],
      ['Cubic charm Diamond Ring', '127,929'],
      ['Cubic charm - LG Diamond Ring', '91,443'],
      ['Floral Fire Diamond Ring', '135,445'],
      ['Floral Fire - LG Diamond Ring', '104,902'],
      ['Glittering Gemfire Lab Grown Diamond Ring', '12,267'],
      ['Moon Petal Diamond Earrings', '315,464']
    ];
    var cards = items.map(function (p) {
      return '<div class="pg-card hp-prod"><div class="pg-shot" aria-hidden="true"></div>' +
        '<b>' + p[0] + '</b><span>Regular price</span>' +
        '<em>From ' + RS + ' ' + p[1] + '</em></div>';
    }).join('');
    return '<div class="pg-sec hp-prods" data-fl="3">' +
      '<h2 class="pg-h">Crafted with Precision, Worn with Pride</h2>' +
      '<p class="pg-lede">Explore our most-loved pieces — handpicked by our customers.</p>' +
      '<div class="pg-cards">' + cards + '</div></div>';
  }

  /* ---------- Featured In ----------
     283 px holding a heading and four logos that are fetched, decode
     fine on their own, and are then laid out at 0x0. The recreation
     draws the reserved 148x56 boxes empty, because that is what is
     on screen. Flag 1. */
  function featured() {
    var box = '<div class="hp-logo" aria-hidden="true"></div>';
    return '<div class="pg-sec hp-featured" data-fl="1">' +
      '<h2 class="pg-h">Featured In</h2>' +
      '<div class="hp-logos">' + box + box + box + box + '</div></div>';
  }

  /* ---------- estimate pitch, second telling ----------
     2,011 px making the same offer as estimateA, with two more CTAs. */
  function estimateB() {
    var blk = function (kick, h, p, cta) {
      return '<div class="hp-tblock"><div class="pg-shot wide" aria-hidden="true"></div>' +
        (kick ? '<div class="pg-kick">' + kick + '</div>' : '') +
        '<h3 class="pg-h sm">' + h + '</h3><p class="pg-lede">' + p + '</p>' +
        '<button class="pg-btn ghost" type="button">' + cta + '</button></div>';
    };
    return '<div class="pg-sec hp-estB">' +
      blk('TRANSPARENCY', 'Upload Any Design, Get an Instant Estimate',
          'Simply upload a photo of any jewellery piece and our estimation tool breaks down the ' +
          'exact material and labour costs. No inflated prices, no middleman markups — just ' +
          'honest pricing you can trust.', 'Try It Now') +
      blk('FROM ESTIMATE TO DOORSTEP', 'Get It Made &amp; Delivered to You',
          'Once you’ve found your ideal combination, we handcraft your jewellery with precision ' +
          'and care — and deliver it straight to your doorstep. From vision to reality, we’ve ' +
          'got you covered.', 'Start Your Journey') +
      blk('', 'What Diamonds Really Cost',
          'Real-time diamond prices aligned with global benchmark standards.', 'Explore Combinations') +
      '</div>';
  }

  /* ---------- Instagram ----------
     Three instagram.com iframes, no loading="lazy", no title. */
  function instagram() {
    var f = '<div class="hp-ig" aria-hidden="true">instagram.com/reel<br><span>iframe · no title</span></div>';
    return '<div class="pg-sec hp-social" data-fl="6">' +
      '<h2 class="pg-h">Follow Us on Instagram</h2>' +
      '<div class="hp-igs">' + f + f + f + '</div></div>';
  }

  /* ---------- newsletter ----------
     The one form on the page, and it is labelled correctly. */
  function newsletter() {
    return '<div class="pg-sec hp-news">' +
      '<h2 class="pg-h">Exclusive Offers, Straight to Your Inbox</h2>' +
      '<p class="pg-lede">Be the first to know about new collections, limited-time offers, and ' +
      'insider pricing — delivered right to you.</p>' +
      '<label class="hp-lab" for="hpEmail">Email</label>' +
      '<input class="hp-in" id="hpEmail" type="email" placeholder="Email" disabled></div>';
  }

  /* ---------- footer ----------
     1,519 px, 18.4% of the page. Column headings are set at 10px.
     The Bengaluru city link 404s; the page is at /bangalore. */
  function footer() {
    var col = function (h, links, fl) {
      return '<div class="hp-fcol"' + (fl ? ' data-fl="' + fl + '"' : '') + '>' +
        '<h4>' + h + '</h4>' +
        links.map(function (l) { return '<a href="#" onclick="return false">' + l + '</a>'; }).join('') +
        '</div>';
    };
    var cities = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune',
                  'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat', 'Lucknow', 'Nagpur'];
    return '<div class="pg-foot hp-foot" data-fl="8">' +
      '<p class="hp-fbrand">India’s most transparent &amp; customisable diamond-jewellery ' +
      'platform. Certified natural &amp; lab-grown, priced in the open.</p>' +
      '<div class="hp-fcols" data-fl="7">' +
      col('EXPLORE', ['Price It', 'E-Shop', 'Boutique', 'Diamond Pricing']) +
      col('SHOP', ['Rings', 'Bracelets', 'Pendants', 'Earrings', 'Mangalsutras']) +
      col('CUSTOMER SERVICE', ['FAQs', 'Shipping', 'Return &amp; Exchange', 'Privacy Policy', 'Help']) +
      col('COMPANY', ['Privacy Policy', 'Terms &amp; Conditions']) +
      '</div>' +
      '<div class="hp-fcol"><h4>VISIT &amp; TALK TO US</h4>' +
      '<p class="hp-faddr">235, Panchratna, Opera House, Charni Road, Mumbai 400004<br>' +
      '+91 98190 44433 · +91 98190 33336<br>info@3soul.in</p></div>' +
      '<div class="hp-fcol"><h4>CUSTOMISED DIAMOND JEWELLERY, ACROSS INDIA</h4>' +
      '<div class="hp-cities" data-fl="9">' +
      cities.map(function (c) {
        var dead = c === 'Bengaluru';
        return '<a href="#" onclick="return false"' + (dead ? ' class="dead"' : '') + '>' +
          'Diamond Price in ' + c + (dead ? '<i>404</i>' : '') + '</a>';
      }).join('') +
      '</div></div>' +
      '<p class="pg-fine" data-fl="10">237 requests · 84 script tags · 4.6 MB transferred</p></div>';
  }

  function buildPage(mode) {
    // No 'fixed' mode: this audit stops at Flagged. Guard so a stray
    // call cannot silently render a page that claims to be repaired.
    if (mode === 'fixed') {
      return '<div class="pg hp"><div class="pg-sec"><h2 class="pg-h">Not built</h2>' +
        '<p class="pg-lede">The homepage audit stops at Flagged — there is no rebuilt ' +
        'recreation. The findings are repairs to the live page, not a redesign.</p></div></div>';
    }
    var h = '<div class="pg hp">';
    h += head();
    h += hero();
    h += marquee();
    h += advantage();
    h += estimateA();
    h += products();
    h += featured();
    h += estimateB();
    h += instagram();
    h += newsletter();
    h += footer();
    h += '</div>';
    return h;
  }

  /* ============================================================
     The flag set. Ten findings, four of them measured WCAG 2.2 AA
     failures. Every figure was taken at 375x812 on 29 Aug 2026.

     Deliberately absent: contrast. 262 text elements were checked
     against their resolved backgrounds and none failed, with 8
     skipped rather than guessed. The estimator's 53 failures do
     not repeat here, and saying so is part of the finding.
     ============================================================ */
  var FLAGS = [
    { n: 1, sev: 'crit', at: '1',
      title: 'Put the press logos back on screen',
      where: '“Featured In”, 3,355 px',
      what: 'Outlook India, The Economic Times, VOGUE and IGI are all fetched successfully and ' +
        'decode fine on their own — the first one is a 165×28 SVG. On the page they are laid ' +
        'out at 0×0 inside boxes that reserve 148×56 for them. The section keeps its 283 px ' +
        'and shows a heading over four empty slots.',
      ev: '4 logos · HTTP 200, 840–15,367 bytes · rendered 0×0 · section 283 px',
      cost: 'This is the strongest outside credibility on the page — two national papers, VOGUE, ' +
        'and the certifying body — and none of it is visible. It is a layout bug rather than a ' +
        'design decision, so it is the cheapest thing on this list to put right.' },

    { n: 2, sev: 'crit', at: '2', wcag: '1.3.1 Info & Relationships · 2.4.6 Headings & Labels — A/AA',
      title: 'Give the page a heading that says what it is',
      where: 'Header',
      what: 'There is exactly one h1 and it wraps the logo link, holding an image and no text. ' +
        'The page carries 41 headings and not one of them is a readable top-level heading. Anyone ' +
        'listing headings to navigate lands on an empty string.',
      ev: '1 h1 · text content empty · 41 headings total · 12 h2, 28 h3',
      cost: 'The homepage of a shop that wants to be found for diamond pricing is telling search ' +
        'engines and screen readers nothing about itself at the level they read first. One line of ' +
        'markup.' },

    { n: 3, sev: 'crit', at: '3', wcag: '2.5.8 Target Size (Minimum) — AA',
      title: 'Bring the controls up to 44 px',
      where: 'Whole page',
      what: '161 of 177 controls measure under 44×44 at 375×812. 45 of them are under 24×24, ' +
        'which fails even the smaller floor. The footer link columns and the product carousel ' +
        'account for most of them.',
      ev: '177 controls · 161 under 44×44 · 45 under 24×24',
      cost: 'This is the same failure the estimator has, at the same scale, and it is the one ' +
        'finding that touches every screen of the page. Padding rather than redesign fixes most of it.' },

    { n: 4, sev: 'high', at: '4',
      title: 'Make the estimate offer once',
      where: '837 px and 3,638 px',
      what: '“Get an estimate” runs 1,891 px. “Upload Any Design, Get an Instant Estimate” runs ' +
        '2,011 px and makes the same promise in the same words — upload a photo, get material ' +
        'and labour costs, no hidden fees. Together they are 3,902 px, and they end in three ' +
        'differently worded buttons: RECEIVE AN ESTIMATE, Try It Now, Explore Combinations.',
      ev: '1,891 px + 2,011 px = 3,902 px · 47.3% of the page · 3 competing CTAs',
      cost: 'Nearly half the homepage is spent saying one thing twice, and the second telling ' +
        'arrives after the products, where it reads as a different offer. Merging them frees about ' +
        'two screens and leaves one button to press.' },

    { n: 5, sev: 'high', at: '5',
      title: 'Give the hero a poster and a play control',
      where: 'Hero, 73 px',
      what: 'Two video elements autoplay on load, both muted, both looping, both pointing at the ' +
        'same 1080p file. Content-Length is 4,575,154 bytes. Unlike the estimator, transfer does ' +
        'not climb while the page sits idle — measured at 0 KB over 20 seconds — because the ' +
        'file is fetched once and looped from cache.',
      ev: '2 video elements · 1 file · 4,575,154 bytes · 1080p · 0 KB idle growth over 20 s',
      cost: 'One 4.4 MB file on a phone connection before anything is read. This is a fraction of ' +
        'the estimator’s 425 MB and worth saying plainly — but it is still the largest single ' +
        'thing the homepage loads, and it loads before the words do.' },

    { n: 6, sev: 'high', at: '6', wcag: '4.1.2 Name, Role, Value — A',
      title: 'Name the Instagram frames and defer them',
      where: '“Follow Us on Instagram”, 5,650 px',
      what: 'Three instagram.com iframes, none with a title attribute and none with ' +
        'loading="lazy". A frame with no accessible name is announced as an unlabelled frame, and ' +
        'three of them load their third-party payload whether or not anyone scrolls that far.',
      ev: '3 iframes · 0 title · 0 loading="lazy" · 192 px each',
      cost: 'A title attribute each and a lazy flag. The embeds also hand Instagram a record of ' +
        'every visit to the homepage, which is worth a deliberate decision rather than a default.' },

    { n: 7, sev: 'med', at: '7', wcag: '1.4.4 Resize Text — AA',
      title: 'Lift the smallest type off the floor',
      where: 'Footer headings and meta lines',
      what: '16 elements render below 12 px, the smallest at 10 px — the footer column headings ' +
        'EXPLORE, SHOP, CUSTOMER SERVICE and COMPANY among them. The page’s working sizes are ' +
        '13 px (104 elements) and 16 px (49), so the small type is a separate decision rather than ' +
        'a consequence of the scale.',
      ev: '16 elements under 12 px · smallest 10 px · modal size 13 px',
      cost: 'Nothing here is body copy, so the reading experience survives. It is the labels that ' +
        'organise the footer, which is where people go when they are already looking for something.' },

    { n: 8, sev: 'med', at: '8',
      title: 'Shorten the footer',
      where: '6,726 px to 8,245 px',
      what: 'The footer is 1,519 px — 1.9 screens on a phone, and 18.4% of the entire page. It ' +
        'carries six columns, a postal address, two phone numbers, an email, a newsletter line and ' +
        'twelve city links.',
      ev: '1,519 px · 18.4% of page height · 1.9 screens · 608 px / 10.0% at 1440',
      cost: 'Close to a fifth of the homepage is footer. Most of it is worth keeping somewhere; ' +
        'not all of it is worth keeping here, at the end of a scroll people have to earn. On a desktop the ' +
        'columns move side by side and it costs 608 px — a tenth of the page — so this is a phone problem ' +
        'rather than a footer problem, and it is ranked on the phone figure.' },

    { n: 9, sev: 'med', at: '9',
      title: 'Fix the Bengaluru link',
      where: 'Footer city list',
      what: '“Diamond Price in Bengaluru” returns 404. The page it wants is live at ' +
        '/pages/diamond-price-in-bangalore, which returns 200. The link sits in the footer of ' +
        'every page on the site, so it is on this one too.',
      ev: '/pages/diamond-price-in-bengaluru → 404 · /pages/diamond-price-in-bangalore → 200',
      cost: 'A spelling difference between the sitemap and the footer template. It is one of ' +
        'twelve city links, and it is the one for a city 3Soul presumably wants to rank in.' },

    { n: 10, sev: 'low', at: '10',
      title: 'Account for the third-party scripts',
      where: 'Whole page',
      what: '84 script tags and 237 requests on a first load, against 4.6 MB transferred of which ' +
        '4.4 MB is the hero video. The scripts themselves are small — 131 KB over the wire across ' +
        '58 fetched files — so this is a request-count and execution question, not a payload one.',
      ev: '84 script tags · 237 requests · 58 script fetches, 131 KB · no growth while idle',
      cost: 'Worth an inventory rather than an alarm. The homepage is not carrying the ' +
        'estimator’s runaway behaviour, and the honest version of this finding says so.' }
  ];

  // What the live homepage measures, for the stage's comparison label. The
  // page reflows, so the phone and desktop figures are genuinely different
  // measurements rather than one scaled — both taken 29 Aug 2026.
  var LIVE = { screens: '10.2', height: 8245,
               desk: { screens: '6.7', height: 6055, at: '1440×900' } };

  var WEIGHT = { name: 'The homepage', transfer: '4.6 MB',
                 transferNote: 'transferred — steady, no growth while idle',
                 requests: '237', video: '4.4 MB',
                 videoNote: 'video, autoplaying on load' };

  w.HomePage = { buildPage: buildPage, FLAGS: FLAGS, LIVE: LIVE, WEIGHT: WEIGHT };
})(window);
