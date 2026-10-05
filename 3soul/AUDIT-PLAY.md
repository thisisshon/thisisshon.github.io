# Price It, play: audit, restructure and build plan

Page audited: `priceit-play.html` (v3 concept), five screens on one stage:
S1 Piece, S2 Metal, S3 Diamonds, S4 Size, S5 Reveal. Checked on mobile (390 x 844)
and desktop (1440 x 900, 1280 x 720). SEO is audited as recommendations only: the
page stays a focused tool, as agreed.

Rebuild delivered as `priceit-play-2.html` (+ `assets/css/priceit-play-2.css`,
`assets/js/priceit-play-2.js`). v3 is left untouched for side by side comparison.

---

## Part 1. What is wrong (full findings)

Severity: **C** critical (breaks trust, task or access), **H** high, **M** medium, **L** low.

### 1A. Page structure and information architecture

| ID | Sev | Screen | Finding |
|---|---|---|---|
| S-01 | H | All | **No H1.** The document outline is five H2s, four of them hidden. Screen readers and crawlers get no page title in the content. |
| S-02 | H | All | **Step changes are silent.** Focus stays on the CTA and nothing announces "Step 2 of 4, Pour the metal". A screen reader user cannot tell the screen changed. |
| S-03 | H | S2 to S5 | **Earlier choices disappear.** Once you leave a step, the only record is an 11.5px spec line on the stage that truncates with an ellipsis (for example "Mangalsutra · 18K white · Lab-grown VS · 1.3..."). There is no scannable summary of what you picked. |
| S-04 | H | S1 | **The price shown on S1 is built on invisible defaults** (18K yellow, lab-grown VS). Nothing says so, so the first number the visitor anchors on looks like a real quote for "a ring". |
| S-05 | H | All | **No way to jump to the price.** A decided visitor must tap through four screens and sit through a 1.8s pour. There is no "skip to my price". |
| S-06 | H | S5 | **Dead end.** No start over, no share, no save, no WhatsApp. The only exit is a link to the top of `priceit-v2.html`, not to the upload form it names. |
| S-07 | M | S5 | **The total and its breakdown live apart.** The total sits on the stage, the lines sit in the deck; on desktop they are 700px apart. The breakdown has no total row, so it never adds up in one place. |
| S-08 | M | All | **Progress chrome is redundant and tiny.** "1/4" repeats the gem bar, and the gem labels are 9px. The bar shows where you are, not what you chose. |
| S-09 | M | S4 | **One carat range for every piece.** A 0.10 to 5.00 ct ruler for a pendant and a necklace alike. The necklace's typical weight (4.50 ct) sits near the top of the range; a 5 ct ring is allowed but rarely real. The presets (0.5 / 1 / 1.5 / 2) ignore the piece entirely. |
| S-10 | M | S4 | **Stone scaling is clamped** (0.62x to 1.5x), so a 4 ct ring draws the same as a 2.7 ct one. The stage stops telling the truth at the end the buyer cares most about. |
| S-11 | M | Mobile | **Content hides behind the CTA with no cue.** On S5 the last nudge sits under the footer; the deck's scrollbar is hidden, so nothing says there is more. |
| S-12 | M | Desktop | **Dead space in the deck.** The CTA is pinned to the bottom while content ends mid column, leaving a 150 to 250px gap between the last line and the action (a Fitts's law cost on every step). |
| S-13 | L | Desktop | The wordmark links to `index.html`, the audit deck, not to 3soul.in. |
| S-14 | L | S1 | Arrow keys change the piece only on S1, and only on desktop; the hint text sits at 9.5px near the stage floor. |

### 1B. Skimming and readability

| ID | Sev | Screen | Finding |
|---|---|---|---|
| K-01 | C | All | **Options do not show their price.** Every choice shows a label, never its effect: you learn that 9K saves money only after tapping it. This is the core job of a price tool and the biggest skim failure. |
| K-02 | H | All | **Microcopy below 12px everywhere:** eyebrow 10px, gem labels 9px, price label 9.5px, loupe hint 8.5px, ruler labels 10.5px, vial and clarity notes 10 to 10.5px. |
| K-03 | H | All | **Contrast failures (WCAG 2.2 AA, 4.5:1 for text under 18px):** grey notes on blush measure 4.12:1 (vial, clarity, range, loupe hint); the step count 4.29:1; the stage hint 3.31:1; minor ruler ticks 1.42:1. |
| K-04 | M | S3 | Clarity notes are cut with an ellipsis on mobile ("No inclusions to the nak..."). |
| K-05 | M | All | **Nudges are flat grey sentences.** The number that matters ("₹1,43,685") has the same weight as the words around it. |
| K-06 | M | S3 | Type cards show the per-carat rate, not what the choice does to this piece. ₹2,00,000 per ct is abstract; "+₹1.4 lakh" is not. |
| K-07 | M | S4 | The ruler labels only every 0.5 ct and fades its edges, so you cannot read your position without the numeral above. |
| K-08 | L | S5 | "Likely range" is 11px grey, unexplained, and reads as a footnote though it is the honest answer. |

### 1C. Bland or weak design

| ID | Sev | Screen | Finding |
|---|---|---|---|
| D-01 | H | All | **Zero photography.** 3Soul's strongest asset is real work: six photographed customer pieces sit unused in `assets/img`. The page proves nothing about the maker. |
| D-02 | H | S1 to S4 | **Five identical blush rectangles.** Balance tipped into monotony: every screen is eyebrow, title, blush card, row, grey line. Nothing marks progress except the stage. |
| D-03 | M | S4 | **No real-world scale.** Carat is shown as a number and a bigger drawing. No millimetres, no reference; the "size" screen does not say how big. |
| D-04 | M | S5 | **The climax is a bar chart.** No sense of a finished object or a document you would keep: no title for the piece, no date, no seal of who priced it. |
| D-05 | M | All | **No brand voice in the flow.** 60 years, Janam Diamonds, IGI certification and hallmarking appear nowhere; the page could belong to any jeweller. |
| D-06 | M | Stage | The pieces are schematic line art, all diamonds are the same round brilliant, and the stage lighting never changes between steps except at the reveal. |
| D-07 | L | Desktop | The price at 64px competes with the piece; the lower left of the stage is empty. |
| D-08 | L | Motion | Every step change uses the same 36px slide; waits stack (sketch draw, pour, seat) with no way to hurry them. |

### 1D. SEO (recommendations, tool stays a tool)

| ID | Sev | Finding |
|---|---|---|
| E-01 | C | `noindex,nofollow`. Correct for a prototype; must flip at launch or the tool earns nothing. |
| E-02 | H | No H1, 600 characters of visible text, and the tiles and prices are rendered by JavaScript. Crawlers see a shell. |
| E-03 | H | Title "Make Your Piece | 3Soul Price It" misses the query people type ("diamond jewellery price calculator"). Description is 88 characters. |
| E-04 | M | No canonical, no Open Graph or Twitter tags, no favicon; a shared link previews as bare text. |
| E-05 | M | No structured data. `WebApplication` (free, INR) and `BreadcrumbList` are cheap and eligible. |
| E-06 | M | No `<noscript>` fallback: with JS off the page is an empty stage. |
| E-07 | L | No internal links out (how it works, FAQ, upload). A tool page with no links is an orphan. |

### 1E. Performance and code

| ID | Sev | Finding |
|---|---|---|
| P-01 | H | **The two preloaded fonts are never used** (Cormorant 37.8 KB, Poppins 7.7 KB), while the two used faces (Outfit 32 KB, Baskervville 18 KB) are not preloaded. 45 KB wasted and a slower first paint. |
| P-02 | M | A metal glint runs every 6s forever, even when the stage is off screen. |
| P-03 | L | `theme-color` is cream (#FBF8F2) on a white page; the mobile browser bar mismatches. |
| P-04 | L | Choices are not in the URL: refresh loses everything, and there is nothing to share. |

### 1F. Accessibility and input

| ID | Sev | Finding |
|---|---|---|
| A-01 | H | Tap targets under 44px: gem buttons 56 x 31, back button 38 x 38. |
| A-02 | M | The loupe is pointer only. Keyboard users get the clarity words but never the demonstration. |
| A-03 | M | The price delta chip is `aria-hidden`; screen reader users hear the new total but never the change. |
| A-04 | L | `aria-label` set on an `aria-hidden` SVG does nothing. |

---

## Part 2. Triage and deep dive

### 2A. Keep, fix or drop

| Finding | Decision | Why |
|---|---|---|
| K-01 price on every option | **Fix, top priority** | It is the job of the tool. Apple Watch Studio and every car configurator price each option. |
| S-03, S-08 choices invisible, redundant bar | **Fix together** | One change: the progress bar becomes a choice rail that shows each step's value. |
| S-04 invisible defaults | **Fix** | Rail shows untouched steps as "default" (muted, dotted underline). |
| S-05, S-06 no skip, dead end | **Fix** | A secondary footer action on every screen: "Skip to my price" on S1 to S4, "Start over" on S5. Share and WhatsApp on S5. |
| S-07 total apart | **Fix** | Breakdown gets a total row; the reveal gets a receipt layout. |
| S-09, S-10 carat range and clamp | **Fix** | Ranges and presets per piece; scale clamp widened. |
| S-11, S-12 hidden or distant content | **Fix** | Mobile scroll fade cue; desktop deck content sits in one block with the CTA directly under it. |
| K-02, K-03 small type, contrast | **Fix** | 11px floor for labels, 12px for notes, grey raised to pass 4.5:1. |
| K-04 to K-08 | **Fix** | Wrap clarity notes, bold numbers in nudges, piece-level deltas on type cards, labels every 0.25 ct, range promoted. |
| D-01 no photography | **Fix** | Reveal gets a "made by 3Soul" story card matched to the piece, from the six local case photos. |
| D-02 monotony | **Fix, carefully** | Keep the frame (asked for), vary the inside: chapter numerals, one signature control per screen, a different stage light per step. |
| D-03 no scale | **Fix** | Millimetre dimension lines on the stage (Hermes configurator pattern), plus the centre stone's size. |
| D-04 weak climax | **Fix** | Reveal becomes an estimate document: piece title in serif, reference number, date, line items, total, seal. |
| D-05 no brand voice | **Fix** | One proof line per screen (hallmarking on S2, IGI on S3, 60 years on S5). |
| D-06 schematic art | **Defer** | Real renders need 3D assets or photography per variant. Lighting per step is done now. |
| D-07, D-08 desktop price, motion waits | **Fix** | Desktop stage gets a serif title of the piece bottom left; tapping during a pour finishes it instantly. |
| E-01 to E-07 SEO | **Partial** | H1, title, description, canonical, OG, JSON-LD, noscript done in the rebuild. `noindex` kept until launch (flip at go live). |
| P-01 to P-04 | **Fix** | Correct preloads, pause glint off screen, theme-color, config in URL for refresh and share. |
| A-01 to A-04 | **Fix** | 44px targets, loupe on arrow keys, delta announced, stray label removed. |
| Photographic or 3D pieces, shape and colour grade steps | **Drop for now** | Needs catalogue data from the product team (see the PM questions). |

### 2B. Restructured screens

The frame stays: top rail, stage, deck with head, one signature control, one row, one
nudge, footer. What changes is what each part carries.

**Global chrome**

```
MOBILE 390                                  DESKTOP 1440
+--------------------------------------+    +--------------------------------------------------+
| <  PIECE   METAL    STONES   SIZE    |    | 3SOUL | PRICE IT    [rail: 4 slots + values]     |
|    Ring    18K yel  Lab VS   0.90 ct |    +------------------------------+-------------------+
+--------------------------------------+    | STAGE (radial velvet)        | 02  THE METAL     |
| ESTIMATE, INCL. GST                  |    | Estimate, incl. GST          | Pour the metal    |
| ₹1,02,627         [+₹4,730]          |    | ₹1,02,627                    | sub               |
| range ₹92,364 to ₹1,14,942           |    |                              | [signature card]  |
|           [ piece ]                  |    |          [ piece ]           | [row]             |
+--------------------------------------+    |                              | nudge             |
| 02 · THE METAL                       |    | Ring in 18K yellow gold,     | [CTA]             |
| Pour the metal                       |    | 0.90 ct lab-grown VS         | Skip to my price  |
| [signature card]                     |    +------------------------------+-------------------+
| [row]                                |
| nudge with **bold number**           |
| [ CTA                             ]  |
|          Skip to my price            |
+--------------------------------------+
```

- **Rail** (replaces gems and count): four 44px tall slots, label 10px caps, value 11.5px. States: done (value in ink), current (navy underline), default (muted, dotted underline, value in italics).
- **Price block**: label "Estimate, incl. GST", odometer, range line at 12px. Spec line removed on mobile (the rail carries it).
- **Footer**: primary CTA 54px plus a 36px text action. Same height on every screen, so balance holds.

**S1 Piece**: tiles show the piece's own "from" price and typical weight; row shows gold and carat for the chosen piece; nudge names the defaults ("Priced so far at 18K yellow, lab-grown VS. You will change these next.").

**S2 Metal**: vials show the price delta under each purity ("−₹10,875", "Current"); coins show "No change"; proof line "BIS hallmarked, every piece".

**S3 Diamonds**: type cards show the piece-level delta ("+₹1,43,685" for natural); clarity rows show their delta; the loupe works with arrow keys; proof line "IGI certified stones".

**S4 Size**: range and presets per piece; ruler labels every 0.25 ct; dimension lines on the stage around the centre stone with its millimetre size; presets show their total price; custom entry stays.

**S5 Reveal, the estimate document**:
```
+--------------------------------------+
| ESTIMATE PI-4F21 · 22 SEP 2026       |
| Ring in 18K yellow gold              |   serif 26px
| 0.90 ct lab-grown VS                 |
| [bar: gold | diamonds | making | gst]|
| Gold        3.5 g at 18K     ₹42,000 |
| Diamonds    0.90 ct, VS      ₹40,500 |
| Making      14% + setting     ₹9,660 |
| GST         3% and 5%         ₹2,958 |
| ------------------------------------ |
| Total                     ₹95,118    |
| Likely range ₹85,606 to ₹1,06,532    |
+--------------------------------------+
| [photo] Made by 3Soul: Namrata's     |
|  solitaire, priced this way, saved   |
|  ₹84,100 against a store quote       |
+--------------------------------------+
[ Price my exact design ]
 Share · WhatsApp · Start over
```

---

## Part 3. UI and visual storytelling research

References viewed for this plan:

| Reference | What it informs | What to borrow |
|---|---|---|
| [Aura, minimalist jewellery configurator (Dribbble)](https://dribbble.com/shots/27194413-Truly-minimalist-jewelry-configurator-store-design-Aura) | S5, global | White editorial page, product dominant, a **running spec line with price under the product** ("Diamond Solitaire Ring · 18KT White Gold · Brilliant Cut"), text tabs for material, one small primary action. Confirms the serif piece title and spec on the desktop stage. |
| [Online jewelry configurator, ESH gruppa (Dribbble)](https://dribbble.com/shots/21321769-Online-jewelry-configurator) and [interface sheet](https://dribbble.com/shots/21321848-Online-jewelry-configurator-interface) | Desktop split | Product on a tinted panel with **price and metal weight pinned bottom left inside the panel**; compact option groups right. Confirms keeping price inside the stage. |
| [Hermès concept product configurator (Dribbble)](https://dribbble.com/shots/8449441-Hermes-Concept-Product-configurator) | S4 | **Dimension lines drawn around the product** with measurements; step counter "03 / 12" with arrow; price in a solid brand block. Direct source for millimetre annotations on the size step. |
| [Create Your Ring, 3-step builder (Dribbble)](https://dribbble.com/shots/27740039--Create-Your-Ring-AI-assisted-3-step-ring-builder-concept) | S5, stage | **The configuration as a serif headline** ("Bezel Setting + Emerald Diamond") over a warm, soft surface. Source for the estimate document title. |
| [Brilliant Earth, design your own ring](https://www.brilliantearth.com/engagement-rings/start-with-a-diamond/lab/) | Rail | Numbered steps that **carry the chosen value inside the step** ("1 Choose Lab Diamond"), a two-way Natural / Lab-grown segmented toggle, shape icons. Source for the choice rail. Anti-pattern: the builder drops you into a filterable grid of 1,000 stones. |
| [Apple Watch Studio (hands-on, 9to5Mac)](https://9to5mac.com/2019/09/19/apple-watch-studio-store-hands-on/) | K-01, S1 | Swipe options under one centred product, **price updates live and every option shows its price**. Source for option deltas. |
| [Brilliant Earth, custom design studio](https://www.brilliantearth.com/pages/custom-design-studio/) | S5 CTA | Hand-off from self-serve to a human designer as the natural last step. Source for "Price my exact design" plus WhatsApp. |

**Anti-patterns seen in the category, avoided here**
1. Filter walls (hundreds of stones in a grid) instead of a guided decision.
2. Price hidden until the end, or behind "request a quote".
3. Carat shown only as a number, with no physical size.
4. Glossy 3D spin as the only delight, with no information in the motion.
5. Chat widgets and promo banners covering the product (Brilliant Earth mobile).
6. Progress bars that show position but not choices.

**Visual storytelling rules for this page**
- The stage tells what, the deck tells why: every stage event has a matching sentence in the deck.
- One signature interaction per screen: draw (S1), pour (S2), loupe (S3), measure (S4), assemble (S5).
- Light moves with the story: the spotlight warms on the metal step, cools and sharpens on stones, widens on size, and opens into rays at the reveal.
- Proof appears at the moment of doubt: hallmarking beside purity, IGI beside clarity, a real customer beside the total.

---

## Part 4. Build spec

**Spacing scale** (4px base): 4, 8, 12, 16, 20, 24, 32, 44, 56. Mobile gutters 20, desktop deck 48.
Deck rhythm: head to card 16, card to row 12, row to nudge 12, nudge to footer 16 (mobile);
22 / 16 / 16 / 28 on desktop.

**Type scale**
| Role | Mobile | Desktop | Face |
|---|---|---|---|
| Price | 36 | 60 | Baskervville 400 |
| Step title | 27 | 38 | Baskervville 400 |
| Document title (S5) | 22 | 28 | Baskervville 400 |
| Body, sub | 13.5 | 15 | Outfit 400 |
| Option label | 13 | 14.5 | Outfit 500 |
| Delta, notes | 12 | 12.5 | Outfit 500 / 400 |
| Caps labels | 10.5 to 11 | 11 | Outfit 500, 0.2em tracking |

**Colour**: ink-3 raised to `rgba(18,18,18,.66)` (4.8:1 on blush); stage hint at 70% ivory (5.6:1);
delta up `#9A6B12` on white, delta down `#2E6B4F`.

**Motion tokens**
| Token | Value | Use |
|---|---|---|
| press | 120ms, ease-out | taps, chips |
| state | 280ms, cubic-bezier(.2,.8,.2,1) | selected states, deltas |
| enter | 420ms, same curve, 50ms stagger | deck content per step |
| stage | 900 to 1300ms, ease-in-out | pour, zoom, light change |
| reveal | 350ms + 480ms per line | breakdown assembly |
| reduced motion | all under 10ms, no particles, no pour | |

Any tap on the stage during a pour or reveal completes it instantly.

**Delivered in the rebuild**: every Fix row in 2A. **Deferred**: real piece renders, shape and
colour grade steps, live rates, flipping `noindex`.

---

## Part 5. Verification of the rebuild

Checked in the browser at 390 x 844 and 1440 x 900, with no console errors.

| Check | Result |
|---|---|
| Option deltas (K-01) | Purity, clarity, type and carat presets each show their effect on this piece, for example 9K "−₹24,717", natural "+₹1,69,548". |
| Choice rail (S-03, S-04, S-08) | Shows each step's value; untouched steps are dotted "default"; tapping a slot jumps there. |
| Focus and announcements (S-02, A-03) | Focus moves to each step's title; the live region says the new estimate and the change ("up ₹3,00,515"). |
| Skip and start over (S-05, S-06) | Skip jumps from any step to the estimate with the stage settled; start over resets metal, stones and carat. |
| Estimate document (S-07, D-04) | Reference, date, serif title, four lines, a total row and the range. The lines add up to the total (checked on a bangle: ₹4,03,141). |
| Story card (D-01) | The photo and story match the piece (ring: Namrata, bangle: Mihir's kada). |
| Carat range and scale (S-09, S-10, D-03) | Ring 0.10 to 3.00 ct, bangle 0.10 to 7.50 ct; presets are relative to the typical weight; the stage labels the centre stone in mm (1.50 ct ring: 7.4 mm). |
| URL state (P-04) | `?c=ring.18.yellow.lab.VS.1.50&s=4` reopens that piece at the size step. |
| Desktop dead space (S-12) | The CTA sits directly under the content; the piece title is on the stage. |
| SEO head (E-02 to E-06) | H1, keyword title, 140-character description, canonical, OG, JSON-LD and noscript added. `noindex` kept on purpose. |
| Fonts (P-01) | Outfit and Baskervville are preloaded; the unused Cormorant and Poppins preloads are removed. |

**Known limits**
- On a 390 x 844 phone, the story card on the estimate sits just below the fold. A fade at the foot of the deck signals there is more to scroll.
- The pieces are still line art (D-06). Real renders need catalogue assets.
- The WhatsApp action opens a share to any contact, because the business number isn't known here.

---

## Part 6. Pricing switched to 3Soul's own rates (22 Sep 2026)

`priceit-play-2.html` now loads `assets/js/pricing-3soul.js`. `pricing.js` is unchanged,
because the older decks print its rates as provenance.

The rates come from the ERP price breakdown embedded on every 3soul.in product page. I
sampled 152 products and 5,959 variants; the ERP totals match the shop's prices exactly.

| Input | Old engine | 3Soul's data |
|---|---|---|
| Gold, 18K | ₹12,000/g (₹16,000 at 24K) | ₹11,490/g median; 14K and 9K follow fineness |
| Weight by purity | the same at every purity | 14K is 0.84x and 9K is 0.686x the 18K weight |
| Lab-grown, per ct | ₹45,000, with +18% / +38% for clarity | ₹10,000 / ₹11,700 / ₹13,000 (SI / VS / VVS) |
| Natural, per ct | ₹2,00,000, with the same clarity uplifts | ₹38,600 / ₹43,500 / ₹49,160 |
| Making | 14% of metal + ₹4,200/ct | ₹1,600/g labour + ₹700 CAD + ₹282 certificate |
| Handling | none | 17.65% of the subtotal (bracelet 13.64%, pendant 19.05%) |
| GST | 3% on metal and stones, 5% on making | flat 3% on everything |
| Typical ring | 3.5 g, 0.90 ct | 5.2 g, 0.40 ct (catalogue medians at 18K) |

**Accuracy against 5,040 real variants** (each product's own weights, priced with the medians above):

| | Old engine | New engine |
|---|---|---|
| Median error | 44.3% (overpriced by 41%) | 8.1% |
| Within 10% of the real price | 15.6% | 61% |
| Within 15% | not measured | 81% |

The remaining gap comes from per-product variation in the gold rate and in stone sizes.
Large centre stones are still priced at small-stone rates until 3Soul shares its solitaire rates.
Bangle (not in the catalogue) and necklace (2 products) keep placeholder figures until 3Soul confirms.

WhatsApp now goes to +91 98190 33336, the number the live estimator uses, with the estimate prefilled.
