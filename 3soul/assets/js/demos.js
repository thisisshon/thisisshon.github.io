/* ============================================================
   Visual pairs for the UI & UX page.
   Left pane renders inside .pg  (3Soul's measured tokens as the
   live page uses them). Right pane renders inside .pg.fixed
   (the same tokens with the corrections applied). So these are
   the real type sizes and colours, not an impression of them.
   ============================================================ */
(function (w) {
  'use strict';
  var RS = '₹';

  var D = {

    /* 1, estimate before the ask */
    1: {
      now:
        '<div class="pg-form" style="box-shadow:none">' +
        '<div class="pg-step">Step 2 of 2</div>' +
        '<div class="pg-formtitle" style="font-size:17px;line-height:1.4">Where should we send it?</div>' +
        '<div class="pg-2col" style="margin-top:10px">' +
        '<input class="pg-in" placeholder="First name *" disabled><input class="pg-in" placeholder="Last name *" disabled></div>' +
        '<input class="pg-in" style="margin-top:8px" placeholder="09876543210" disabled>' +
        '<button class="pg-btn" type="button" disabled>Reveal the True cost</button>' +
        '<div class="demo-after">↓ what appears</div>' +
        '<div class="demo-result">Thanks for sharing your details.<br><span>Your report follows within 24 hours.</span></div>' +
        '</div>',
      fix:
        
        '<div class="fx">' +
        '<div class="fx-cfg">' +
          '<span class="fx-chip on">Ring</span><span class="fx-chip">Pendant</span><span class="fx-chip">Earrings</span>' +
          '<span class="fx-chip on">18K</span><span class="fx-chip">Lab-grown</span>' +
        '</div>' +
        '<div class="fx-quote">' +
          '<div class="fx-quote-top"><span class="fx-quote-l">Your estimate</span>' +
          '<span class="fx-quote-live">live gold rate</span></div>' +
          '<div class="fx-quote-v">' + RS + '85,606 <span>–</span> ' + RS + '1,06,532</div>' +
          '<div class="fx-bars">' +
            '<i style="width:44%;background:#C8A96E" title="Gold"></i>' +
            '<i style="width:47%;background:#E7D2A6" title="Diamonds"></i>' +
            '<i style="width:6%;background:#8FA6C4" title="Making"></i>' +
            '<i style="width:3%;background:#7B8FA8" title="GST"></i>' +
          '</div>' +
          '<div class="fx-rows">' +
            '<div><span><b class="k gold"></b>Gold · 3.5 g at 18K</span><b>' + RS + '42,000</b></div>' +
            '<div><span><b class="k stone"></b>Lab-grown · 1.00 ct</span><b>' + RS + '45,000</b></div>' +
            '<div><span><b class="k make"></b>Making</span><b>' + RS + '10,080</b></div>' +
            '<div><span><b class="k gst"></b>GST · 3% and 5%</span><b>' + RS + '3,062</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="fx-step"><div class="fx-step-t">Want the exact price for your piece?</div>' +
        '<p>Upload a photo and a gemologist prices every stone. Free, within 24 hours.</p>' +
        '<div class="fx-actions"><button class="fx-btn" type="button" disabled>Upload my design</button>' +
        '<button class="fx-btn ghost" type="button" disabled>WhatsApp</button></div></div>' +
        '</div>'
    },

    /* 2, upload above the fold */
    2: {
      now:
        '<div class="demo-phone">' +
        '<div class="demo-mini eyebrow">Thousands of jewellers.</div>' +
        '<div class="demo-mini head">Upload any jewellery image.</div>' +
        '<div class="demo-mini mark">3 SŌ U L</div>' +
        '<div class="demo-mini tiny">TRUE TO YOU</div>' +
        '<div class="demo-mini tiny">PRESENTS</div>' +
        '<div class="demo-mini display">Price It</div>' +
        '<div class="demo-mini tiny gold">THE AI-POWERED COST ESTIMATOR</div>' +
        '<div class="demo-mini cta">Try Price It</div>' +
        '<div class="demo-mini strip">TRANSPARENT · 120+ OPTIONS · 24H</div>' +
        '<div class="demo-fold"><span>fold · 812 px</span></div>' +
        '<div class="demo-mini drop">Drag an image here, or Browse</div>' +
        '<div class="demo-note bad">Upload starts at 1,364 px</div>' +
        '</div>',
      fix:
        
        '<div class="fx fx-phone">' +
          '<div class="fx-ph-bar"><span></span><b>3 SŌ U L</b><span></span></div>' +
          '<div class="fx-ph-hero"><h4>Diamond Jewellery Cost Estimator</h4>' +
          '<p>Upload any design · see what it should really cost</p></div>' +
          '<div class="fx-drop"><span class="fx-drop-ic">↑</span><b>Drop a photo, or browse</b>' +
          '<em>JPG, PNG or a Pinterest link</em></div>' +
          '<button class="fx-btn full" type="button" disabled>Get my estimate</button>' +
          '<div class="fx-trust"><span>✓ Free</span><span>✓ 24 hours</span><span>✓ Itemised</span></div>' +
          '<div class="fx-fold"><span>fold · 812 px</span></div>' +
          '<div class="fx-below">Proof, the six-step explainer and the FAQ follow</div>' +
        '</div>' +
        '<div class="demo-note good">Upload lands at 485 px, first screen, above the fold</div>'
    },

    /* 3, contrast */
    3: {
      now:
        '<div class="demo-sw"><span class="demo-chip" style="color:#C8A96E">, BUILT FOR EVERY DECISION, </span>' +
        '<b class="demo-ratio bad">2.24:1</b></div>' +
        '<div class="demo-sw"><span class="demo-chip" style="color:#EFCAA5">OUR PROMISE, IN WRITING</span>' +
        '<b class="demo-ratio bad">1.54:1</b></div>' +
        '<div class="demo-sw"><span class="demo-chip" style="color:#F5A623;letter-spacing:0">★★★★★ 4.7</span>' +
        '<b class="demo-ratio bad">2.03:1</b></div>' +
        '<div class="demo-sw"><span class="demo-chip" style="color:#9A7B3F">SAVED</span>' +
        '<b class="demo-ratio bad">3.47:1</b></div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-sw"><i style="background:#7E6435"></i>' +
          '<span><b>#7E6435</b>Kickers and section labels</span><em class="ok">5.09:1</em></div>' +
          '<div class="fx-sw"><i style="background:#6E5729"></i>' +
          '<span><b>#6E5729</b>“SAVED”, stat labels, badges</span><em class="ok">6.28:1</em></div>' +
          '<div class="fx-sw"><i style="background:#9A6708"></i>' +
          '<span><b>#9A6708</b>Star ratings</span><em class="ok">4.82:1</em></div>' +
          '<div class="fx-sw muted"><i style="background:#EFCAA5"></i>' +
          '<span><b>#EFCAA5</b>Kept for rules, borders and fills</span><em>no minimum</em></div>' +
          '<div class="fx-context">' +
            '<div class="fx-kick">, A real estimate · verified customer, </div>' +
            '<div class="fx-ctx-t">This tool has saved people lakhs</div>' +
            '<div class="fx-ctx-s">★★★★★ <b>4.7</b> · 600+ reviews</div>' +
          '</div>' +
        '</div>'
    },

    /* 4, labels */
    4: {
      now:
        '<div class="pg-form" style="box-shadow:none">' +
        '<input class="pg-in" placeholder="First name *" disabled>' +
        '<input class="pg-in" style="margin-top:8px" placeholder="you@email.com" disabled>' +
        '<input class="pg-in demo-typed" style="margin-top:8px" value="priya@gmail.com" disabled>' +
        '<div class="demo-callout bad">Once typed, nothing says what the field was.<br>' +
        'Screen reader announces: <b>“edit text, blank”</b></div>' +
        '</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-field"><label>Your name</label>' +
          '<div class="fx-in filled">Priya Sharma</div></div>' +
          '<div class="fx-field"><label>Email <em>the report goes here</em></label>' +
          '<div class="fx-in filled">priya@gmail.com</div>' +
          '<span class="fx-help">✓ We will send the itemised report here</span></div>' +
          '<div class="fx-sr"><b>Screen reader reads</b>' +
          '“Email, the report goes here, edit text, priya@gmail.com”</div>' +
        '</div>'
    },

    /* 5, required fields and keyboard */
    5: {
      now:
        '<ul class="demo-list">' +
        '<li><b>First name</b><em class="req">required</em></li>' +
        '<li><b>Last name</b><em class="req">required</em></li>' +
        '<li><b>Email</b><em class="opt">optional</em></li>' +
        '<li><b>Phone</b><em class="req">required</em></li>' +
        '<li><b>Terms</b><em class="req">required, unlinked</em></li>' +
        '</ul>' +
        '<div class="demo-kbd bad"><span>Phone field opens</span><div class="demo-keys">Q W E R T Y U I O P</div>' +
        '<small>type=text, no inputmode</small></div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-field"><label>Your name</label><div class="fx-in">Priya Sharma</div></div>' +
          '<div class="fx-field"><label>Email <span class="fx-req">required</span></label>' +
          '<div class="fx-in">you@email.com</div></div>' +
          '<div class="fx-field"><label>Phone <span class="fx-opt">optional</span></label>' +
          '<div class="fx-in num">+91 · numeric keypad</div>' +
          '<span class="fx-help">Only if you would rather we sent it on WhatsApp</span></div>' +
          '<p class="fx-terms">By sending you agree to our <u>terms</u> and <u>privacy policy</u>.</p>' +
          '<button class="fx-btn full" type="button" disabled>Send me my free report</button>' +
        '</div>'
    },

    /* 6, video */
    6: {
      now:
        '<div class="demo-vid now"><span>autoplaying, looping, no control</span>' +
        '<i>1080p · up to 7.2 Mbps</i></div>' +
        '<div class="demo-note bad">425 MB across 10 files · 9 autoplay</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-poster"><span class="fx-play">▶</span>' +
          '<div class="fx-poster-m"><b>How PriceIt works</b><em>60 seconds</em></div>' +
          '<span class="fx-poster-sz">poster 34 KB</span></div>' +
          '<div class="fx-gain"><div><b>425 MB</b><span>referenced before</span></div>' +
          '<span class="fx-arrow">→</span><div><b>34 KB</b><span>until someone asks</span></div></div>' +
        '</div>'
    },

    /* 7, type scale */
    7: {
      now:
        '<div class="demo-type"><span style="font-size:8px">8px, BUILT INTO EVERY SALE</span>' +
        '<span style="font-size:10px">10px, Estimates generated</span>' +
        '<span style="font-size:11px">11px, Every gram of her existing gold credited</span>' +
        '<span style="font-size:12px">12px, Illustrative. Your report prices every stone.</span></div>' +
        '<div class="demo-note bad">Smallest on the page: 6px · 148 of 220 elements under 12px</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-ramp"><span class="lbl">Display</span><b style="font-size:26px;font-family:var(--s-display)">Price It</b><em>26 / Cormorant</em></div>' +
          '<div class="fx-ramp"><span class="lbl">Heading</span><b style="font-size:19px;font-family:var(--s-head)">How it works</b><em>19 / Baskervville</em></div>' +
          '<div class="fx-ramp"><span class="lbl">Body</span><b style="font-size:16px">Every gram of gold credited</b><em>16 / Outfit</em></div>' +
          '<div class="fx-ramp"><span class="lbl">Support</span><b style="font-size:14px">Illustrative. Priced per stone.</b><em>14 / Outfit</em></div>' +
          '<div class="fx-ramp"><span class="lbl">Label</span><b style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase">Estimates generated</b><em>11 / Poppins</em></div>' +
        '</div>'
    },

    /* 8, tap targets */
    8: {
      now:
        '<div class="demo-targets">' +
        '<span class="demo-hit" style="width:22px;height:22px">×</span>' +
        '<span class="demo-hit" style="width:28px;height:28px">+</span>' +
        '<span class="demo-hit" style="width:32px;height:32px">→</span>' +
        '</div><div class="demo-ruler"><i style="width:24px"></i><span>24px AA minimum</span></div>' +
        '<div class="demo-note bad">53 of 204 under 24px · 162 under 44px</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-targets">' +
            '<button class="fx-hit" type="button" disabled>×</button>' +
            '<button class="fx-hit" type="button" disabled>+</button>' +
            '<button class="fx-hit" type="button" disabled>→</button>' +
            '<button class="fx-hit wide" type="button" disabled>Compare</button>' +
          '</div>' +
          '<div class="fx-spec"><span><b>44 × 44</b>minimum</span><span><b>8 px</b>between</span>' +
          '<span><b>20 px</b>icon inside</span></div>' +
          '<div class="demo-note good">Icon stays small; the hit area does not</div>' +
        '</div>'
    },

    /* 9, sample report */
    9: {
      now:
        '<div class="demo-frame"><div class="demo-frame-bar">JWL-4881.pdf</div>' +
        '<div class="demo-frame-body blank">blank on iOS Safari</div></div>' +
        '<div class="demo-note bad">A4 report in a 335×497 iframe</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-shots">' +
            '<figure><span class="pg1"></span><figcaption>Metal &amp; weight</figcaption></figure>' +
            '<figure><span class="pg2"></span><figcaption>Every stone</figcaption></figure>' +
            '<figure><span class="pg3"></span><figcaption>Making &amp; GST</figcaption></figure>' +
            '<figure><span class="pg4"></span><figcaption>120 options</figcaption></figure>' +
          '</div>' +
          '<button class="fx-btn ghost full" type="button" disabled>↓ Download the PDF</button>' +
          '<div class="demo-note good">Images inline, opens on every phone</div>' +
        '</div>'
    },

    /* 10, duplicate proof */
    10: {
      now:
        '<div class="demo-cards">' +
        '<i>Namrata</i><i>Ananya</i><i>Hritik</i><i>Kavita</i><i>Sara</i><i>Mihir</i>' +
        '<i class="dup">Namrata</i><i class="dup">Ananya</i><i class="dup">Hritik</i>' +
        '<i class="dup">Kavita</i><i class="dup">Sara</i><i class="dup">Mihir</i></div>' +
        '<div class="demo-note bad">12 cards · 6 people · 14 reviews · 7 reviews</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-proof">' +
            '<article><span class="av"></span><b>Namrata K.</b><em>Solitaire · Mumbai</em>' +
            '<span class="amt">' + RS + '84,100</span></article>' +
            '<article><span class="av"></span><b>Ananya Rai</b><em>Jhumkas · Pune</em>' +
            '<span class="amt">' + RS + '22,400</span></article>' +
            '<article><span class="av"></span><b>Hritik J.</b><em>Bracelet · Mumbai</em>' +
            '<span class="amt">' + RS + '1,10,000</span></article>' +
            '<article><span class="av"></span><b>Kavita S.</b><em>Mangalsutra · Nashik</em>' +
            '<span class="amt">' + RS + '31,000</span></article>' +
          '</div>' +
          '<div class="fx-dots"><i class="on"></i><i></i></div>' +
          '<div class="demo-note good">Six people, once each, wider cards, more room to read</div>' +
        '</div>'
    },

    /* 11, the analysis animation */
    11: {
      now:
        '<div class="pg-analysis" style="text-align:left">' +
        '<div class="t" style="font-size:15px">Your design’s being analysed</div>' +
        '<div class="pg-prog" style="margin:10px 0"><i style="width:0"></i></div>' +
        '<div class="pg-alist" style="font-size:11px">' +
        '<span>● Reading your design</span><span>○ Checking today’s gold rate</span>' +
        '<span>○ Pricing your stones</span></div></div>' +
        '<div class="demo-note bad">Bar sits at 0% · nothing is being computed</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-confirm">' +
            '<span class="fx-tick">✓</span>' +
            '<div><b>Design received</b><p>A gemologist is pricing it now.</p></div>' +
          '</div>' +
          '<ol class="fx-time">' +
            '<li class="done"><span></span><b>Uploaded</b><em>just now</em></li>' +
            '<li class="now"><span></span><b>Priced by a gemologist</b><em>within 24 hours</em></li>' +
            '<li><span></span><b>Report to priya@gmail.com</b><em>metal, stones, making, GST</em></li>' +
          '</ol>' +
          '<button class="fx-btn ghost full" type="button" disabled>Get it on WhatsApp instead</button>' +
        '</div>'
    },

    /* 12, page length */
    12: {
      now:
        '<div class="demo-scroll"><div class="demo-scroll-bar"><i style="height:6.2%"></i></div>' +
        '<div class="demo-scroll-l"><b>16 screens</b><span>13,018 px on a phone</span>' +
        '<em>Six-step explainer, six trust cards, six audience pills, comparison table, FAQ, all in sequence.</em></div></div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-jump"><span class="on">Estimate</span><span>How it works</span>' +
          '<span>Proof</span><span>Trust</span><span>FAQ</span></div>' +
          '<div class="fx-outline">' +
            '<div class="keep"><b>Estimate</b><em>the tool, first screen</em></div>' +
            '<div class="keep"><b>Proof</b><em>six customers, one row</em></div>' +
            '<div class="keep"><b>How it works</b><em>three steps, not six</em></div>' +
            '<div class="fold"><b>Everything else</b><em>one tap away, not five screens of scroll</em></div>' +
          '</div>' +
          '<div class="demo-note good">Sticky “Get my estimate” bar follows the whole way down</div>' +
        '</div>'
    },

    /* 13, testimonial copy */
    13: {
      now:
        '<div class="pg-card" style="flex-basis:auto;box-shadow:none">' +
        '<div class="nm">Mihir D.</div><div class="mt">Gold kada · Punjab</div>' +
        '<span class="badge">Personalisation</span>' +
        '<p class="cp"><mark>She’d</mark> been quoted a fortune at a big-name store. Price It showed the ' +
        'real cost, stone by stone, and we made it to order.</p></div>' +
        '<div class="pg-card" style="flex-basis:auto;box-shadow:none;margin-top:8px">' +
        '<div class="nm">Kavita S.</div><div class="mt">Mangalsutra · <mark>Nashua</mark></div></div>',
      fix:
        
        '<div class="fx">' +
          '<article class="fx-testi">' +
            '<header><span class="av"></span><div><b>Mihir D.</b><em>Gold kada · Punjab</em></div>' +
            '<span class="tagp">Personalisation</span></header>' +
            '<p>He wanted a traditional kada with a personal touch, engraved and costed before casting.</p>' +
            '<footer><span>Saved</span><b>' + RS + '58,900</b></footer>' +
          '</article>' +
          '<div class="fx-fixnote"><b>Kavita S.</b> · Mangalsutra · <mark class="ok">Nashik</mark></div>' +
        '</div>'
    },

    /* 14, alt text and image sizing */
    14: {
      now:
        '<div class="demo-alt"><div class="demo-img"></div>' +
        '<div class="demo-sr bad">Screen reader:<br><b>“image”</b></div></div>' +
        '<div class="demo-note bad">17 of 67 without alt · logo sent 1080px to draw at 90px</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-alt"><span class="fx-altimg"></span>' +
          '<div class="fx-altmeta"><span class="fx-attr">alt=</span>' +
          '<q>Solitaire ring in 18K yellow gold, 1 ct centre stone</q></div></div>' +
          '<div class="fx-sr"><b>Screen reader reads</b>' +
          '“Solitaire ring in 18K yellow gold, 1 ct centre stone, image”</div>' +
          '<div class="fx-spec"><span><b>700 px</b>served</span><span><b>700 px</b>rendered</span>' +
          '<span><b>lazy</b>below the fold</span></div>' +
        '</div>'
    },

    /* 15, savings units */
    15: {
      now:
        '<div class="demo-saves"><i><span>SAVED</span><b>' + RS + '84,100</b></i>' +
        '<i><span>SAVED</span><b>' + RS + '22,400</b></i>' +
        '<i class="odd"><span>SAVED</span><b>28%</b></i>' +
        '<i><span>SAVED</span><b>' + RS + '58,900</b></i></div>' +
        '<div class="demo-note bad">One percentage in a row of rupees</div>',
      fix:
        
        '<div class="fx">' +
          '<div class="fx-saves">' +
            '<i><span>Saved</span><b>' + RS + '84,100</b></i>' +
            '<i><span>Saved</span><b>' + RS + '22,400</b></i>' +
            '<i><span>Saved</span><b>' + RS + '31,200</b></i>' +
            '<i><span>Saved</span><b>' + RS + '58,900</b></i>' +
          '</div>' +
          '<div class="demo-note good">One unit across the set, rupees, always</div>' +
        '</div>'
    }
  };

  /* Where a real component was lifted from the live page, use it verbatim.
     S.<key> is the source markup with its computed styles inlined. */
  var SRC = {
    1:  'step2',       // the contact wall and the button that ends it
    3:  'strip',       // the gold that fails contrast, in situ
    4:  'step2',       // placeholder-only fields
    5:  'step2',       // required markers and the text-type phone field
    7:  'stats',       // 8px labels under the numbers
    9:  'proofBtns',   // the sample-report button
    10: 'testimonial', // one real card, shown twice
    11: 'analysis',    // the progress bar that never moves
    13: 'mihir',       // the pasted copy
    15: 'testimonial'  // the savings row
  };

  function sourceNow(n) {
    var S = w.PriceItSource;
    if (!S) return null;
    var key = SRC[n];
    if (!key || !S[key]) return null;
    var html = S[key];
    if (n === 10) html = html + html;            // the page renders the set twice
    return '<div class="srcwrap">' + html + '</div>';
  }

  w.PriceItDemos = {
    html: function (n) {
      var d = D[n];
      if (!d) return '';
      var src = sourceNow(n);
      var nowPane = src
        ? '<div class="ddemo-stage src">' + src + '</div>'
        : '<div class="ddemo-stage"><div class="pg">' + d.now + '</div></div>';
      var label = src
        ? 'On the page now <em>· lifted from the live page</em>'
        : 'On the page now';
      // On a phone the two panes stack, which doubles the page. A switch shows
      // one at a time instead, and comparing in place beats scrolling between.
      return '<div class="ddemo" data-pane="now">' +
        '<div class="ddemo-tabs" role="tablist">' +
          '<button type="button" role="tab" data-pane="now" aria-selected="true">Now</button>' +
          '<button type="button" role="tab" data-pane="fix" aria-selected="false">With the change</button>' +
        '</div>' +
        '<div class="ddemo-pane" data-pane="now"><div class="ddemo-label">' + label + '</div>' + nowPane + '</div>' +
        '<div class="ddemo-pane fix" data-pane="fix"><div class="ddemo-label fix">With the change</div>' +
        '<div class="ddemo-stage"><div class="pg fixed">' + d.fix + '</div></div></div>' +
        '</div>';
    }
  };
})(window);
