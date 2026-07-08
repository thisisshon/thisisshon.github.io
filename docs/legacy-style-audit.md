# Legacy Style Audit - Shriram Financial Services

> Exhaustive inventory of every style value in the legacy static site
> (`../Project 1`, git snapshot `711c666`), produced 2026-07-03 as the evidence
> base for the token system in `src/styles/global.css` and the
> `/design-system/current/` documentation page.
>
> Sources: `styles.css` (614 ln), `home.css` (456 ln - Tailwind-compiled fork,
> index.html only), `app.js`, inline `<style>` blocks + `style=""` attrs + SVG
> fills/strokes in all 13 HTML files. Counts are raw textual occurrences.

## Headline findings

- **Two parallel design systems**: `styles.css` (12 pages) and `home.css`
  (homepage only, 60.9KB, its own Tailwind token layer). Nav/mobile-menu are
  byte-identical duplicates; footer, FAQ, buttons and page background render
  **visibly differently** on the homepage.
- **~150 distinct color values** for what the proposed system expresses in ~45
  primitives / ~35 semantic roles.
- The mega-nav overlay CSS exists **three times** (styles.css, home.css
  unscoped, home.css astro-scoped dead copy) reconciled via `!important` pins.
- 15 cream backgrounds, 12 dark charcoals, 10 mid-grays, 4 hero-gradient
  recipes, 2 breakpoint systems (560/768/900/1024/1300/1500 max-width vs
  640/1024/1280 min-width), 9 transition durations.

---

## A. Colors

### A1. Inventory (value / count / example roles)

**Dark inks / charcoals**

| Value | Count | Example uses |
|---|---|---|
| #404040 | 73 | FAQ answer text; SVG icon strokes on card/check icons |
| #333 | 69 | nav-link ink, .btn-dark bg, FAQ question, hamburger, nav chevrons |
| #1d1d1d | 25 | hero radial gradient end; overlay sidebar gradient |
| #202318 | 13 | gold-button text (homepage), index SVG arrows |
| #2b2b2b | 4 | .btn-ghost bg (duplicated per page) |
| #383838 | 5 | .btn-ghost:hover bg |
| #1c1c16 | 2 | `--ink` body text |
| #121212 | 1 | `--field-ink` filled input |
| #231a06 | 2 | `--gold-ink` |
| #222320 | 1 | .faq-side text |
| #2c2c27 | 1 | .foot-bottom border |
| #15150f | 1 | footer bg |
| #0a0b07 | 2 | homepage footer bg (`--color-dark-900`) |
| #14160f / #1a1a13 / #23261c / #282c1e | 1 ea | index/products dark gradient stops |
| #000 | 7 | home `--color-black`; index mask gradients |

**Olive / brand greens**

| Value | Count | Example uses |
|---|---|---|
| #2e3914 | 53 | `--olive-title`/`--olive-ink`; homepage button ink; olive icon strokes |
| #2d3813 | 2 | `--olive-head` (1 RGB pt from #2e3914) |
| #4f583b | 28 | hero-gradient stop 1; sip invested color |
| #1b2010 | 3 | `--olive-deep` dark cards, .to-top |
| #1a2010 | 2 | home `--color-dark-800` (1 pt from #1b2010) |
| #26301a | 4 | dark-card hover bg |
| #3a471b | 2 | dark-card hover border |
| #363a2c | 10 | hero/sidebar gradient middle stop |
| #4d6710 | 1 | index accent |
| #3f4733/#2a2d23/#3b422c/#282c1e | 1 ea | index gradient variants |
| #3a3f30/#2e3223/#454430 | 1 ea | products orbit band |
| #5c6151 | 4 | about muted text/dividers |
| #46463c | 2 | `--ink-2` |
| #3a3c39 | 10 | overlay headings, view-all |
| #576142…#b7bd9f | 1 ea | products orbit SVG illustration (content, not UI) |

**Muted grays / sages**

| Value | Count | Example uses |
|---|---|---|
| #595959 | 3 | `--ink-3` leads |
| #666 | 3 | home `--color-muted` |
| #6b6f5e | 5 | secondary text (partner/support) |
| #6d6e6a | 2 | secondary text |
| #73736a | 2 | `--muted` card body |
| #7c7c70 | 1 | footer copyright |
| #838383 | 4 | .btn-ghost border |
| #8a8a8a | 4 | `--field-label` |
| #8d8e84 | 3 | doc-card hover stroke |
| #8d9088 | 2 | .appr .idx, breadcrumb sep |
| #999999 | 1 | `--field-ph` |
| #9a9a8e | 3 | `--muted-2` footer links |
| #b3b3aa | 1 | disabled field ink |
| #b4b4a6 | 2 | footer contact, socials |
| #bcaf99 | 2 | overlay idle item |
| #bfc1bc | 9 | body text on dark cards |
| #c9cac7 | 6 | hero lead, breadcrumbs |
| #c4c6c1/#c9c6ba/#c9c8c0/#d7d7cd | 1–3 | page details |

**Golds**

| Value | Count | Example uses |
|---|---|---|
| #f3b83f | 16 | `--gold-btn`/home `--color-brand` CTA bg |
| #f2b83f | 14 | `--gold-2` hero .g, about icons (1 pt from #f3b83f) |
| #e0a82e | 2 | `--gold` step numbers |
| #d4982a | 3 | home `--color-brand-hover` |
| #ffcb09 | 1 | `--field-bd-active` focus border |
| #ffd277 | 1 | sip slider accent |
| #fff0d7 | 10 | warm chip/step-pill bg |
| #ebdec6 | 6 | overlay gradient start, `--pcard-border` |
| #e0d3ba | 1 | `--pcard-hover-bd` |
| #e1dbc6 | 3 | home warm border |
| #e3cd9b | 2 | demat card border |
| #c79a38/#7d6a30 | 1 ea | products details |

**Creams**

| Value | Count | Example uses |
|---|---|---|
| #fcf8ef | 2 | `--page` site bg |
| #fffcf3 | 4 | homepage body bg (≠ `--page`!) |
| #fffdf8 | 5 | `--card` |
| #fef8ee | 2 | `--sec-light` |
| #f6efe1 | 2 | `--sec-tint` |
| #f8f4e8 | 8 | home FAQ/advisory card bg |
| #fefaf0/#fdf4dc | 1 ea | home brand-pale/light |
| #fbf5e8 | 1 | `--pcard-hover` |
| #f5f3ed/#f2f1ea/#f0efe8 | 1 ea | about tiles |
| #f0ede3/#f0ece1/#e6e3da/#f2eee3 | 1–2 | partner/sip/products details |

**Neutral grays**

| Value | Count | Example uses |
|---|---|---|
| #e1e0db | 3 | `--card-border` (+ border-soft) |
| #e0ddd8 | 2 | overlay divider |
| #edebe6 | 1 | `--row-line` |
| #ededec | 2 | mobile-menu bottom border |
| #efefef | 4 | mobile-menu dividers |
| #e9e9e9/#e9eae9 | 1–2 | chips, hero USP text |
| #e6e6e6/#e0e0e0 | 1–2 | disabled field border |
| #ddd | 1 | home hero-card divider |
| #ccc | 4 | `--field-bd` |
| #f1f1ef | 1 | disabled field bg |
| #f3f3f3 | 3 | sip segmented control |
| #f7f7f7 | 2 | home n100 |
| #fff | 71 | nav bg, hero H1, overlay bg |

**Functional**

| Value | Count | Example uses |
|---|---|---|
| #2f7ef4 | 17 | `--blue` login/verify |
| #1c5fc4 | 2 | link hover |
| #009d58 | 2 | `--green` ticks |
| #067a45 | 4 | form success |
| #dbf0e2/#daead7 | 1–2 | success tints |
| #ff3236 | 1 | `--field-error` |
| #ff9933/#138808 | 1 ea | India-flag illustration (content) |

### A2. Near-duplicate clusters (→ canonical)

1. Gold #f3b83f(16) ← #f2b83f(14); hover #d4982a ← #c79a38, distinct from #e0a82e
2. Olive #2e3914 ← #2d3813; #1b2010 ← #1a2010
3. Near-black ink: #333 / #383838 / #2b2b2b / #404040 / #1c1c16 / #121212 / #222320 - ≥4 competing "body ink" values (Tier-2 merge)
4. Gold-button ink: #202318 (home) vs #231a06 (`--gold-ink`) vs #2e3914 (site) - 3 inks, one role (Tier-2)
5. Hero gradient: 4 recipes for one visual role (standard / index hero / index band / products orbit) (Tier-2)
6. Olive-grays ×9 within a few points → 2 tokens proposed
7. #3a3c39 ← #3a3a35/#363731/#353731
8. Mid-sages ×10 → 2 roles proposed (#73736a, #9a9a8e)
9. Light sages ×9 → #bfc1bc + #c9cac7
10. Creams ×15 → 5 proposed
11. Hairlines ×11 → #e1e0db + #efefef proposed
12. Success #009d58 vs #067a45 → one pair kept (base/strong)
13. Blue #2f7ef4 + #1c5fc4 → link base/hover pair

### A3. Alpha/rgba violations of rule 5 (claim: shadows only)

- `styles.css:458` `.mobile-menu{background:rgba(255,255,255,.97)}` (+home dup)
- `home.css:82` `--card-border-soft: rgba(28,28,22,.13)`, `--row-line: rgba(28,28,22,.08)` (pre-flatten values; styles.css already flattened to #e1e0db/#edebe6)
- home.css alpha-white ramp ~28 occurrences (footer text/borders): #ffffffa6/b3/8c/85/80/61/59/4d/40/1f/1a/12/0d/08, #fffc, #fff6
- home.css: #2e391466 dot, #4f583b40/#4f583b26 orbs, #ffffffd9 glass card, #0003 antara, `color-mix(in oklab …)` ×8
- index.html inline: rgba(255,252,243,0)→rgb(255,252,243) hero fade
- Opacity-as-color: `.faq-side .usr{opacity:.1}`, home `.why-box-4{opacity:.1}`, `.advisory-box-2:hover .advisory-card{opacity:.3}`, partner `.45`, support `.4`
- Allowed shadows: rgba(0,0,0,.18)×9, rgba(243,184,63,.3)×4, rgba(224,168,46,.18)×1, home shadow tokens

**Port rule:** flatten every non-shadow alpha over its actual background into a solid hex (mathematically identical rendering).

### A4. SVG icon colors (UI icons)

- stroke #333 ×4/page (nav chevrons, 52 total); #2f7ef4 ×1/page (login, 13)
- stroke #404040 - card/list icons (72 total: demat 14, products 14, equity 14, research 12, sip 10, partner 8)
- stroke #2e3914 - olive icons (about 12, demat 11+1 fill, partner 10)
- stroke #f2b83f - about gold icons ×12 (≠ #f3b83f!)
- stroke #202318 - index arrows ×8
- Illustration content excluded: products orbit palette, demat India flag

### A5. Legacy custom properties

**styles.css `:root`:** --page #fcf8ef, --sec-light #fef8ee, --sec-tint #f6efe1, --card #fffdf8, --card-border #e1e0db, --card-border-soft #e1e0db, --pcard-border #ebdec6, --pcard-hover #fbf5e8, --pcard-hover-bd #e0d3ba, --row-line #edebe6, --olive-title #2e3914, --olive-head #2d3813, --olive-deep #1b2010, --ink #1c1c16, --ink-2 #46463c, --ink-3 #595959, --muted #73736a, --muted-2 #9a9a8e, --gold #e0a82e, --gold-2 #f2b83f, --gold-btn #f3b83f, --gold-ink #231a06, --olive-ink #2e3914, --green #009d58, --blue #2f7ef4; fields: --field-bd #ccc, --field-bd-active #ffcb09, --field-error #ff3236, --field-label #8a8a8a, --field-ink #121212, --field-ph #999999, --field-disabled-bg #f1f1ef, --field-disabled-bd #e6e6e6, --field-disabled-ink #b3b3aa; layout: --pad clamp(20px,8vw,144px), --container-pad 32px, --section-y 72px, --cta-w 220px, --hero-text-w 600px, --hero-aside-w clamp(360px,40vw,520px); mobile ≤768: 16/24/56.

**home.css:** a full Tailwind theme layer (--color-brand #f3b83f, --color-brand-hover #d4982a, --color-dark-olive #2e3914, --color-n900…n100, --color-dark-900 #0a0b07, --color-dark-800 #1a2010, --radius-btn 6px, --radius-input 8px, --radius-card-lg 24px, --shadow-card/lift/heavy [NEVER USED], --font-display/body "Outfit","Inter" [Inter = rule violation], --font-mono [second stack on code elements]) **plus** a copy of the styles.css palette with pre-flatten alpha values.

**Same-role conflicts:** ink #1c1c16 vs #333; muted #73736a vs #666; --gold #e0a82e vs --color-gold #f3b83f; page #fcf8ef vs body #fffcf3; border-soft solid vs alpha; button radius 4px vs 6px. Page-local: sip --c-inv/#4f583b, --c-ret/#f3b83f; index --pc-dur/.9s --pc-ease.

---

## B. Typography

- **Family:** Outfit canonical. Violations: home `--font-display/body` list "Inter" fallback; home `--font-sans`(ui-sans) applied to html + `--font-mono` on code/kbd/samp/pre.
- **Loading gap:** index loads Outfit 300–800; other pages 400–700 - but weight **300 is used by .nps-item on every page** (overlay) → synthesized on 12 pages. Weight 800 loaded, unused.
- **Sizes (px/count):** 10/4, 12/33, 14/91, **15/2 (off-scale)**, 16/84, 18/19, **19/1 (off-scale)**, 20/20, 24/14, 28/1(+clamp min), 32/12, 40/8, 104/1 (about ghost numeral), ~18 clamp() responsive variants (home pins some back with !important).
- **Weights:** 400×80, 500×92, 600×40, 700×12, 300×2, bolder×2 (home reset).
- **line-height:** 1.5 global !important rule (both files). Exceptions: 1 ×11 (display resets), 1.4 ×6 (.nps-col-items a), 1.2 ×4, 1.3 ×3, 1.6 ×4 (home body 1.6 - overridden by 1.5 rule), 20px ×2 (.nav-link span), 28px ×1. Element-level values on text elements are dead (global rule wins).
- **letter-spacing:** five different "wide eyebrow" values (1px/1.2px/2px/.08em/.1em) - Tier-2: one token.

## C. Spacing & layout

- **Grid frequency (px/count):** 16/155, 8/80, 24/70, 32/60, 56/42, 40/39, 12/39, 20/33, 4/30, 48/15, 96/13, 28/13, 36/10, 72/8, 144/7, 80/6, 64/5.
- **Off-grid violations:** gap:6 (.hf-verified, home advisory), padding:10px 12px (.nps-logo - both files), gap:10 ×3, gap:14 ×2, clamp mins 18/14 (.nps-col*), padding-inline-start:21px (home), padding-top:5px (demat), padding:7px 20px (sip), padding:16px 10px (about).
- **Radius:** 24×46 (card), 50%×22, 4×18 (buttons), 8×14 (inputs), 12×7, 999×5, 3.40282e38×4 (Tailwind pill artifact), 20×4, 6×3 (home btn), 2×3, sidebar `0 40px 40px 0`×3. Pill written 4 different ways.
- **Widths:** no max-width container (gutter --pad); --hero-text-w 600, --hero-aside-w clamp(360,40vw,520), .faq-side 464, buttons 220/200, home hero card 560, .foot-brand 512, text measures 448–840 (731 vs 730 near-dup).
- **Gutter conflict:** home content clamp(1rem,6vw,8rem) ≠ site clamp(20px,8vw,144px) ≠ home's own nav (which uses the site clamp).
- **Breakpoints:** styles.css max-width 1500/1300/1024/980/900/820/768/560; home min-width 40rem(640)/64rem(1024)/80rem(1280) + hover:hover ×16 + copies of px nav queries; pages add max-640 ×3. → 560-vs-640 and 1280/1300/1500 must be reconciled (Tier 2).

## D. Effects

- **Shadows:** 0 6px 20px rgba(0,0,0,.18) ×7 (.to-top, duplicated per page); 0 18px 40px -12px rgba(243,184,63,.3) ×4 (index glow); 0 1px 4px rgba(0,0,0,.18) ×2 (sip); glass card (home); ring (about). Home --shadow-* tokens defined, never used.
- **Motion:** .2s ease(58), .25s ease(19), .3s ease(17), .6s standard(8), .48s standard(6 overlay), .35s ease(5 nav), .3s ease-in-out(4), .38s standard(2 FAQ), .22s(3), .15s(3), .9s spring (index cards), 1s video fade, 7s/120s products orbit, reveal stagger 70ms cap 280ms. ~9 durations, 5 easings (Tier-2: 4+3).
- **backdrop-filter:** blur(20px) mobile-menu (both files); home hero card `-webkit-` only (**Firefox bug**); home antara blur(8px).
- **z-index:** 0,1,5,10,50,60(dead),80(.to-top ×7),90(support tabs),99(mobile menu),100(nav),200(overlay/skip).

## E. Structural notes

1. home.css = full parallel system (Tailwind preflight, @property, own tokens, el-*/hero-*/why-*/advisory-*/product-*/steps-*/antara-*/faq-*/foot-* classes).
2. **Both-file components:** nav + mobile-menu byte-identical dupes; overlay ×3 (one dead) reconciled by !important pins; footer VISIBLY different (bg #15150f vs #0a0b07, solid grays vs alpha-whites, 36px vs 32px socials); gold button 4 specs (heights 40/48, inks #2e3914/#202318, radius 4/6, one hover-translateY); FAQ different bg (#fffdf8 vs #f8f4e8) AND mechanism (buttons vs `<details>` + interpolate-size); hero H1 40px vs clamp!important; body bg differs.
3. **Page `<style>` blocks (lines):** about 196, partner 222, demat 135, index 0 (all in home.css + 22 inline attrs), charter 56, privacy 39, research 59, calculators 41, sip 125, products 71, equity 0 (52 inline attrs incl. off-grid chart positions 448.65/312.73/165px), support 233, grievance 73.
4. **Duplicated across page blocks (should be shared):** .to-top ×7 identical, .btn-ghost ×5 (4 identical +1 variant), .cta-actions ×4, .feat-grid ×4, .hf-note ×3, .port-cols ×3, .hours-bar ×2, .hf-success/.hf-head/.hf-body ×2, hero gradient re-declared ×3.
5. **!important:** styles.css 13, home.css 12, pages 9 - overlay font-size pins are pure inter-file conflict resolution.
6. **Odd units/artifacts:** radius 3.40282e38px ×4; logo-crop % crop duplicated both files; border 1.5px/1.6px; interpolate-size + ::details-content (Chrome-only); color-mix ×8; webkit-only backdrop-filter; global scrollbar hiding (home).
7. **app.js:** styling-clean (only reveal stagger + body.overflow). Injected icons 16/20/24 compliant.
8. **Icon-size violations (home.css):** .product-img 44px, .product-card-circle svg 26px, .steps-img-2 26px, .hero-label-5 18px.
9. **Merge targets (Tier 2, need sign-off):** one cream set (15→5), one ink ramp, one gold pair+hover, one olive pair, one hero gradient, one button spec, one breakpoint scale, one shadow + easing scale, footer unification (+alpha flatten), delete dead overlay copy + unused tokens.
