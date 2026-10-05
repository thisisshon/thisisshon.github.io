# 3Soul — audits & rebuild proposal


## Credits

Icons are [CoreUI Icons Free](https://coreui.io/icons/), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The ones this project uses are
bundled as a single sprite at `assets/img/icons.svg`. The 3Soul wordmark is the client's own.

## Structure (22 Sep 2026)

Two pages sit up front. Everything older is under `archive/`.

| URL | What it is |
|---|---|
| `/` (`index.html`) | **Price It, the upload flow.** Design, diamonds, details and a confirmation on one stage. Prototype: nothing is sent. Ends at the calculator. |
| `/calculator.html` | **The calculator.** Piece, metal, diamonds, size and an estimate, priced with 3Soul's own catalogue rates (`assets/js/pricing-3soul.js`). Ends back at the upload flow, carrying the piece. |
| `/archive/` | Index of earlier work: `audit`, `home-audit`, `design-notes`, `priceit-v1`, `priceit-v2`, `calculator-v0`, `calculator-v3`. Each is a folder, so `/archive/priceit-v2/` works on any static host. |

Front-page assets: `assets/css/priceit.css` (shared shell), `assets/css/upload.css`, `assets/js/upload.js`, `assets/js/calculator.js`.
`AUDIT-PLAY.md` still uses the old filenames: `priceit-play-2.html` is now `calculator.html`, `priceit-upload.html` is now `index.html`, `priceit-play.html` is `archive/calculator-v3/`.

The sections below describe the archived pages and use their old filenames.


A self-contained static site. No build step, no framework, no runtime dependencies,
no external requests. Open `index.html` and it works.

Two live pages are reviewed, in two decks that share one asset pipeline:

| Deck | Page reviewed | Scope |
|---|---|---|
| `index.html` | `/pages/diamond-cost-estimator` | Audit, flags, rebuild, three prototypes |
| `home.html` | `3soul.in` | Audit and flags only — no rebuild |
| `design.html` | — | UI & UX detail behind both |
| `priceit.html` | — | The rebuilt calculator, **v1**: every section stacked |
| `priceit-v2.html` | — | The same page, **v2**: calculator and proof behind tabs, 19.6 → 9.6 screens |
| `priceit-play.html` | — | **v3 concept**, mobile first: the calculator as a piece being made, four steps and a reveal on one stage |
| `priceit-play-2.html` | — | **v3.2**, the play page rebuilt from `AUDIT-PLAY.md`: option deltas, choice rail, estimate document, per-piece carat, URL state. Priced with 3Soul's own catalogue rates (`pricing-3soul.js`) |
| `priceit-upload.html` | — | The **upload flow** in the same language: design, diamonds, details and a confirmation on one stage, with a brief-strength meter. Prototype, nothing is sent |

## What's in index.html

Four focus pages, plus supporting sections:

| | Page | What it is |
|---|---|---|
| 01 | **Current** | The live PriceIt page recreated at its real type sizes, spacing and colours |
| 02 | **Flagged** | The same page with 15 findings pinned and ranked — 7 critical, 6 of them measured WCAG 2.2 AA failures |
| 03 | **Rebuilt** | The same page with every flag resolved, toggleable against Current |
| 04 | **Approaches** | Three working prototypes of the rebuild, on one shared pricing engine |

Supporting: Verdict, Evidence, Recommendation, Measurement.

## What's in home.html

Two focus pages, plus supporting sections:

| | Page | What it is |
|---|---|---|
| 01 | **Current** | The homepage recreated at its measured type sizes, spacing and section heights |
| 02 | **Flagged** | The same page with 10 findings pinned and ranked — 3 critical, 4 of them measured WCAG 2.2 AA failures |

Supporting: Verdict, Evidence, Recommendation, Measurement.

**It stops at Flagged on purpose.** The homepage does not have the estimator's
problems — nothing fails contrast, the network does not run away, and its one form is
labelled correctly. What it has is a short list of specific breakages, which is a repair
list rather than a redesign. `buildPage('fixed')` in `home-page.js` deliberately returns
a short "not built" panel rather than an implied rebuild.

## What's in priceit.html

A working rebuild of the calculator, not a recreation of it. Where index.html measures
and flags the live page, this one is the proposal: the page as it would be if the
findings were acted on. It runs on the same `pricing.js` engine as the three prototypes
in index.html, so its numbers are comparable with theirs.

**The model is upload first, with the price in the open.** The business runs on customers
sending a design — a Pinterest save, a reel, a screenshot, a photo of something they own —
which real gemologists price by hand and return as a report. So the upload is the hero
action and every CTA points at it.

The live calculator sits underneath as *supporting* material, not as the offer. It answers
"can I trust your pricing?" before someone hands over a design, and gives a ballpark to
anyone not ready to upload. That keeps flag 1 fixed — the page no longer promises a number
and delivers only a form — without displacing the thing the business actually needs.

| Phase | What it covers | Where it lives |
|---|---|---|
| 1 | First screen | Hero and configurator markup in priceit.html |
| 2 | The estimate as a certificate | `render()` in priceit-app.js |
| 3 | The ask, after the number | `initAsk()` |
| 4 | Proof, once each | Markup, plus `initPoster()` |
| 5 | Contrast, targets, type, markup | priceit.css and the JSON-LD in head |
| 6 | Instrumentation | `track()`, and the `?debug=1` panel |

Measured on the built page, against the live figures from the audit:

| | Live estimator | priceit.html |
|---|---|---|
| Contrast failures | 53 | **0** of 142 checked |
| Text under 12 px | 50 elements | **0** |
| Controls under 24×24 | 53 of 204 | **0** user-facing |
| Page height, phone | 13,018 px · 16.0 screens | **7,945 px · 9.8 screens** |
| The number is on screen at | never, it is emailed | **570 px, phone · 183 px, desktop** |
| Readable H1 | 0 | 1 |
| Autoplaying video | 9 embeds, 425 MB | 0, poster with tap-to-play |
| Structured markup | Organization only | WebApplication, BreadcrumbList, FAQPage |

Two sanity checks tie the built page to the engine: a 1 ct natural 18K solitaire renders
₹2,59,844 and a 0.9 ct lab-grown 18K ring ₹95,118, which are the figures in the pricing
notes above.

**Three controls are deliberately under 44 px**, and are exceptions rather than misses:
the file input is `tabindex="-1"` and sr-only, driven by a 64 px button; the terms
checkbox is 24×24, which clears the AA minimum, inside a label whose hit area is 73 px
tall; and the terms link is inline in a sentence, which 2.5.8 explicitly exempts.

**On conversion.** Nothing here is a measured lift, and the page deliberately claims
none. What it does is remove known friction and close the gap between what the page
promises and what it delivers. Phase 6 exists so the next round can argue from data:
append `?debug=1` to watch `configurator_start`, `estimate_shown`, `config_change`,
`photo_added`, `save_rejected` and `estimate_saved` fire, and the same events are pushed
to `dataLayer` when one is present.

## v1 and v2

Both versions are fully standalone: `priceit.html` loads `priceit.css` + `priceit-app.js`,
`priceit-v2.html` loads `priceit-v2.css` + `priceit-v2.js`. Editing one cannot break the
other. They share only `tokens.css`, `pricing.js` and `assets/img/`. Each carries a
"see v1 / see v2" switch in its header for side-by-side review.

v2 changes structure, not copy. The calculator and the sample report move into a
second tab on the upload card; case studies, reviews, stories and audiences become one
tabbed proof module; the govt band folds into Why Trust; the comparison table is
removed; Giving Back becomes one line. A live teaser under the upload — the lowest
combination for the chosen piece, from the engine — keeps a number on the first screen
so flag 1 stays fixed. Every tab change fires `tab_open`, so which sections are actually
used can be measured rather than argued.

| | v1 | v2 |
|---|---|---|
| Mobile, 390px | 19.6 screens | **9.6** |
| Desktop, 1440px | 17.4 screens | **9.3** |

## Deploy

Any static host. The whole folder is the site.

**Cloudflare Pages**

```bash
npx wrangler pages deploy . --project-name=priceit-audit
```

Or drag the folder into the Cloudflare Pages dashboard, then point a CNAME at it.
Netlify and Vercel work the same way — drop the folder in, no build command, no output directory.

The page sets `noindex,nofollow`. Remove that meta tag in `index.html` if you ever want it indexed.

## Structure

```
index.html          the estimator audit + rebuild
home.html           the homepage audit
design.html         UI & UX detail
priceit.html        the rebuilt calculator, working
assets/
  css/
    tokens.css      3Soul's design tokens, measured from the live site — the source of truth
    page.css        the estimator recreation (.pg = current, .pg.fixed = rebuilt)
    home.css        the homepage recreation (.pg.hp), on the same tokens
    priceit.css     the rebuilt calculator's own design
    deck.css        the deck's own interface, built from the same tokens
  js/
    pricing.js      illustrative estimate engine shared by all three prototypes
    page.js         estimator recreation markup + its 15 flags
    home-page.js    homepage recreation markup + its 10 flags
    prototypes.js   approaches A, B and C
    priceit-app.js  the rebuilt calculator: configurator, estimate, form, funnel
    deck.js         navigation, the page stage, pins, keyboard — shared by both decks
  fonts/            Outfit, Baskervville, Cormorant Garamond, Poppins (latin subset, 140 KB)
```

**One stage, two recreations.** `deck.js` is not tied to either page. `Stage()` takes an
`opts.source` supplying `{ buildPage, FLAGS, LIVE, WEIGHT }` — `page.js` exports
`PriceItPage`, `home-page.js` exports `HomePage`, and `initStages()` picks whichever the
deck loaded. `LIVE` carries the live page's own height for the badge under the device;
`WEIGHT` carries its transfer figures for the panel at the end. Both live beside the
recreation they describe, so a deck can never quote the other page's numbers.

**The header switch.** `index.html` and `home.html` each carry a `.dswitch` in the
chrome — under `.rail-brand` on desktop, under `.mnav-bar` below 980px, so it inherits
the existing breakpoint without a media query of its own. Both halves are links, the
current one included: it carries `aria-current="page"` and stays clickable, because a
dead control in a two-item switch reads as broken rather than as "you are here". Adding
one to `design.html` would need a third option, so that page keeps its rail links instead.

**Cache-busting is manual.** Every asset URL carries `?v=<stamp>`. Changing any file in
`assets/` means bumping that stamp in all three HTML files, or returning visitors keep the
old one:

```bash
OLD=1788017706; NEW=$(date +%s); sed -i '' "s/v=$OLD/v=$NEW/g" index.html home.html design.html
```

## Where the numbers come from

Everything in the audit was measured on `https://3soul.in/pages/diamond-cost-estimator`,
first on **28 August 2026** and then re-verified in full on **29 August 2026**. Mobile
figures are taken at 375×812.

Each class of figure has a deliberate source:

| Figure | How it was obtained |
|---|---|
| File sizes (425 MB video, 6.6 MB images, 5.1 MB scripts) | HTTP `Content-Length` per file — immune to cache and scroll position |
| Counts (18 embeds, 67 images, 0 H1, 23 FAQs, 24 city pages) | The served HTML and the rendered DOM; city pages from `sitemap.xml` |
| Contrast (53 failures) | Computed styles, resolving the real background; any text over an image or translucent layer is **skipped, not guessed** (93 were) |
| Tap targets, page height, font sizes | `getBoundingClientRect` and `getComputedStyle` at 375×812 |
| Link health | Live HTTP status per URL |

**No load-time figure in the deck is self-measured, on purpose.** First contentful paint
measured 2.13 s, 9.04 s and 39.02 s across three loads of the same URL — that spread is
the measuring environment, not the page, and publishing any one of them would be picking
a number to suit the argument. The Evidence section says so in as many words. Server
response was 12–71 ms every time, which is the one speed claim worth making from our own
timings.

The deck's only load-time figures come from **Lighthouse on a defined connection** —
mobile, emulated Moto G Power, Slow 4G, run 29 August 2026: 47 performance, LCP 11.2 s,
FCP 4.8 s, Speed Index 7.6 s, 17,302 KiB. That run is on the **homepage**, `3soul.in`,
not the estimator, and the Evidence section labels it as such on the slide. It stands in
because the estimator's own timings were unusable, and it is a floor rather than a
like-for-like: the estimator carries more video, so it will not measure better. Replacing
it with a Lighthouse run on the estimator itself is the one measurement this audit still
owes.

### Prototype pricing

The prototypes price against **real Indian market rates for August 2026**, not invented
ones. The figures and their sources are printed on the estimate itself:

| Input | Value used | Market reference |
|---|---|---|
| Gold, 24K | ₹16,000 / g | ₹15,982–₹16,486 / g, 26–28 Aug 2026 |
| Purity | 14K .585 · 18K .750 · 22K .916 | BIS standard fineness |
| Lab-grown diamond | ₹45,000 / ct | ₹30,000–₹80,000 / ct, 1 ct certified |
| Natural diamond | ₹2,00,000 / ct | ₹1.5–3.0 lakh / ct, 1 ct G / VS2 |
| Making | 14% of metal + ₹4,200 / ct setting | typical Indian range 8–25% |
| GST | **3% on metal and stones, 5% on making** | unchanged since 2017 |

They are a fixed snapshot, not a live feed — a production build would read gold daily and
price each stone on its own grade. Sanity check: a 1 ct natural 18K solitaire comes out at
**₹2,59,844**, a 0.9 ct lab-grown 18K ring at **₹95,118**.

No conversion percentages appear anywhere in the deck, because none have been measured on
this page.

### Corrected between the two audits

The 29 August re-check overturned several figures from the first pass. They are listed
here because the deck's credibility depends on the corrections being visible:

- Video was reported as "5.6 MB, all 2.5 Mbps, 10 autoplaying". Actually **425 MB across
  10 files**, at 2.5/4.8/7.2 Mbps, **9 autoplaying**. The 5.6 MB was one session's
  streamed chunks, not the assets.
- City pages: "~28, ~70% boilerplate" → **24 pages**, 260–395 words, 27–72% similar
  depending on the pair. The original figure came from a summarising model, not a count.
- Testimonials: the same customer showed **different** savings figures on 28 Aug
  (₹18,016 vs ₹84,100 for Namrata). By 29 Aug those were reconciled. The duplication
  itself remains, so the flag was rewritten around what is still true.
- Tap targets: 162 of **204** controls under 44px, not 248. 53 under 24px.
- Script tags 98, not 99; page height 13,018 px, not 13,078; upload at 1,364 px, not 1,424.

New findings from the re-check: `/pages/diamond-price-in-bengaluru` is linked in the
footer of every page and returns **404** (the sitemap spells it `bangalore`), and the
page fires **121 requests after load**, 18 of them to a session-recording script.

### The rebuilt page and the prototypes were checked too

- The pricing engine had **gold at ₹9,850/g** against a real ₹16,000/g, lab-grown at
  ₹21,500/ct against ₹30–80k, natural at ₹98,000/ct against ₹1.5–3 lakh, and a flat 3%
  GST instead of **3% on metal and stones, 5% on making**. Every prototype figure was
  understated; all four are now market-sourced.
- The rebuilt page claimed "posters instead of autoplaying video" while showing **no video
  at all**. It now carries a real poster with a control.
- It claimed "body type at 16px" while 50 elements sat below 12px. The floor is now
  **11px, with running text at 14px and up** — verified, not asserted.
- Three claims (search schema, image alt text, head metadata) cannot be demonstrated by a
  visual recreation. They are now labelled **spec only** in the fix list instead of reading
  as though they were on screen.
- A `<label for>` pointed at a `<div>`, which is invalid. The dropzone now uses
  `aria-labelledby`.

### The homepage numbers

The homepage was measured on `3soul.in` on **29 August 2026**, at 375×812, by the same
methods and in the same pass as the estimator — so the two sets are comparable line by line.

| Figure | How it was obtained |
|---|---|
| Page and section heights, tap targets, font sizes | `getBoundingClientRect` and `getComputedStyle` at 375×812 |
| Contrast (0 failures of 262 checked) | Computed styles against the resolved background; text over images or translucent layers is **skipped, not guessed** (8 were) |
| Video size (4,575,154 bytes) | HTTP `Content-Length`, not streamed chunks |
| Idle growth (0 KB) | Resource timings sampled 4 s and 24 s after load, no interaction between |
| Logo rendering | `fetch` per URL for status and length, `naturalWidth` and computed box for what reached the screen, and a fresh `Image()` to prove the asset decodes |
| Counts (h1, headings, scripts, iframes, controls) | The rendered DOM |
| Link health | Live HTTP status per URL |

Two results are worth stating because they are absences:

- **Contrast came back clean.** 262 elements checked, none below threshold. The ratio
  function was self-tested first — 21.00 for black on white, 1.00 for white on white,
  4.48 for #777 on white — so the zero is a result rather than a broken measurement. The
  estimator's 53 failures genuinely do not repeat here.
- **The network is steady.** Transfer held at 4.6 MB and requests at 237 across twenty
  idle seconds. The estimator's 3.2 → 9.9 MB climb does not repeat either: the homepage's
  one video is fetched once and looped from cache.

**The Featured In finding needed its own working.** The four press logos each return HTTP
200 with real bytes, and forcing the first into a new `Image()` decodes it at 165×28 — so
they are neither missing files nor failed requests. They are laid out at 0×0 inside
`.featured-logos__item` boxes that reserve 148×56, in a section that keeps its full 283 px.
The first read of this was wrong in a useful way: `complete: false` and `naturalWidth: 0`
look like a load failure until the resource timings show all four were fetched.

**The homepage was measured twice.** It reflows, so the phone and desktop figures are
separate measurements rather than one scaled. Both taken 29 Aug 2026:

| Section | 375×812 | 1440×900 |
|---|---|---|
| header | 73 px | 83 px |
| hero video | 209 px | **645 px** |
| marquee | 57 px | 57 px |
| 3Soul Advantage | 499 px | 398 px |
| Get an estimate | 1,891 px | 942 px |
| Crafted with Precision | 627 px | 627 px |
| Featured In | 283 px | 260 px |
| Upload Any Design | 2,011 px | 1,449 px |
| Instagram | 707 px | 707 px |
| Newsletter | 370 px | 280 px |
| footer | 1,519 px | **608 px** |
| **total** | **8,245 px · 10.2 screens** | **6,055 px · 6.7 screens** |

`home.css` carries the desktop layout in a single `@container vp (min-width: 900px)`
block, keyed to the `.screen` container like `page.css` — so the frame's own resize
handles drive it, not the browser window. The recreation lands within about 30 px of
6,055 at desktop and 6 px of 8,245 on a phone.

Two findings are proportions rather than counts, and they move with the layout. The
duplicated estimate pitch is 47.3% of the phone page and 39.5% of the desktop one; the
footer is 18.4% on a phone and 10.0% on a desktop. **Both are ranked on the phone
figure**, and the deck says so on the slide and in flag 8 — the footer one in particular
is a phone problem rather than a footer problem.

`LIVE` in each recreation carries the figure for each view (`LIVE.desk` where a desktop
measurement exists) so the badge compares like with like. `page.js` deliberately has no
`LIVE.desk`: the estimator was only ever measured at 375×812, so its badge drops the
comparison in desktop view rather than quoting a phone number against a desktop frame.

**Still owed.** There is no Lighthouse run on the estimator. The one in both decks is on
the homepage, and it is labelled as such in each. Until that gap is closed, no
like-for-like speed comparison between the two pages should be drawn from this repo.

### Fixed while checking the desktop view

`placePins()` sized the pin layer from `screen.scrollHeight`, but the layer lives *inside*
`.screen` and so counts towards that value. The measurement was self-referential: once
set, the layer could never shrink, because it was propping up the number it was measured
against. Switching a flagged stage from phone to desktop left it at the taller phone
height, which held `scrollHeight` there — 8,251 px against a real 6,113 — throwing off the
meter, the screens badge and every pin position. It now collapses the layer to zero,
reads the page's real height, then sizes it. This affected both decks; index.html's
Flagged stage had the same fault.

## Editing

- **Flag wording, severity, or order** — the `FLAGS` array at the bottom of
  `assets/js/page.js` for the estimator, `assets/js/home-page.js` for the homepage.
  Each flag's `at` value must match a `data-fl="…"` attribute in the page markup above it,
  or its pin will not appear. Add `wcag: '1.4.3 …'` to tag a finding as an accessibility
  failure; that also puts it behind the WCAG filter and marks its number in the fix list.
- **The "what was done" list** in Rebuilt is generated from `FLAGS` (see `initFixList` in
  `deck.js`) so it can never drift out of step with the findings.
- **The recreated pages** — the builder functions in `assets/js/page.js` and
  `assets/js/home-page.js`. For the estimator, `buildPage('current')` and `buildPage('fixed')`
  share markup and `page.css` carries the differences. The homepage has no `'fixed'` mode.
- **The homepage's section proportions** — the `min-height` values in `assets/css/home.css`,
  which are the measured heights listed at the top of `home-page.js`. They are floors rather
  than fixed heights, so longer copy is never clipped; the badge under the device reports what
  the recreation actually measures against the live 10.2 screens, rather than assuming they match.
- **Prices** — rates and category weights at the top of `assets/js/pricing.js`.
- **Colours and type** — `assets/css/tokens.css`. The `--s-*` tokens are 3Soul's measured
  values; the deck tokens below them are derived from those, so changing a source token
  updates both the recreation and the deck.

## Typography

The deck's own interface is set in **Outfit alone**. The other three faces —
Baskervville, Cormorant Garamond and Poppins — belong to 3Soul and appear only
inside the page recreation (`.pg`) and the prototype (`#protoHost`), so what is
theirs stays visibly theirs. Outfit ships no italic, so emphasis in the chrome is
carried by weight and colour instead.

## Accessibility

All three decks ship in **light mode**, pinned with `data-theme="light"` on the
`<html>` tag. There is no theme switch. The dark palette is still in
`tokens.css` and still passes contrast — delete that attribute and the pages
follow the reader's system setting again. The deck is checked against WCAG 2.2 AA and passes in
both themes: no text under
4.5:1, no control under 44×44, no body copy under 16px. The **recreation deliberately
does not** — it reproduces the live page's failures, which is the point of Flagged.
The **Rebuilt** page and the prototypes pass.

Contrast was solved rather than eyeballed: `--ink-3` and `--accent-deep` are darkened
from 3Soul's own values only as far as 4.5:1 requires, and `--on-brand` exists because
the tan fails on the navy quote panel in dark mode.

## Keyboard

`←` `→` move between sections, number keys jump (`1`–`8` in index.html, `1`–`6` in
home.html), `?` shows the shortcut list.
In Flagged, the `↑` `↓` buttons step through the findings one at a time; the selected
one rises to the top of the panel with the previous one dimmed above it.
In Rebuilt, each numbered chip jumps to its finding and spotlights it for two seconds
(index.html only — home.html has no Rebuilt section).
On the desktop preview, drag either edge handle (or use the arrow keys on it) to resize
the frame between 1240 and 1920 — the recreation uses container queries, so it reflows
against the frame, not the browser window.
