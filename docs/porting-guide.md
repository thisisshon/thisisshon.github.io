# Page-Porting Guide - legacy HTML → Astro

The contract for porting a legacy page from `../Project 1` into this project.
**Prime directive: ZERO visual change.** The legacy page is the pixel spec.
Gold-standard example: `src/pages/privacy.astro` (verified pixel-identical).

## 1. URL map (also rewrite every in-content link to these)

| Legacy file | New URL | New source file |
|---|---|---|
| index.html | / | src/pages/index.astro |
| about.html | /about/ | src/pages/about.astro |
| demat.html | /demat/ | src/pages/demat.astro |
| become-a-partner.html | /become-a-partner/ | src/pages/become-a-partner.astro |
| research.html | /research/ | src/pages/research.astro |
| privacy.html | /privacy/ | src/pages/privacy.astro |
| investor-charter.html | /investor-charter/ | src/pages/investor-charter.astro |
| products/index.html | /products/ | src/pages/products/index.astro |
| products/equity/index.html | /products/equity/ | src/pages/products/equity.astro |
| calculators/index.html | /calculators/ | src/pages/calculators/index.astro |
| calculators/sip/index.html | /calculators/sip/ | src/pages/calculators/sip.astro |
| support/index.html | /support/ | src/pages/support/index.astro |
| support/grievance-redressal/index.html | /support/grievance-redressal/ | src/pages/support/grievance-redressal.astro |

Asset paths become root-absolute: `/assets/…`, `/images/…`, `/videos/…`,
`/favicon.png` (all already in `public/`). `href="#"` and external links stay.

## 2. What to DROP from the legacy page (BaseLayout/components own it now)

- The entire `<head>` (BaseLayout renders it from your `seo` object)
- `<div class="viewport">` / `<div class="page">` wrappers (visually inert)
- Header/nav, `.mobile-menu`, footer, `.to-top` button markup
- `<script src="app.js">`, the to-top scroll script, the `html.js` class script
- Page-local styles that duplicate shared CSS: `.to-top`, `.btn-ghost`
  (both global now), any nav/footer/overlay styles
- Inline `style="background:var(--sec-light)"` / `--sec-tint` → use classes
  `sec-light` / `sec-tint` instead

## 3. Page skeleton

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';           // adjust depth
import FaqAccordion from '../components/sections/FaqAccordion.astro'; // if FAQ
import { faqPageSchema } from '../lib/seo';                     // if FAQ

const FAQS = [ { q: '…', a: '…' }, /* legacy content verbatim, same order */ ];

const seo = {
  title: '…',        // legacy <title> text verbatim
  description: '…',  // legacy meta description verbatim
  path: '/about/',   // from the URL map
  jsonLd: [faqPageSchema(FAQS.map(f => ({ question: f.q, answer: f.a })))], // if FAQ
};
---
<BaseLayout seo={seo}>
  <!-- legacy <main> content, classes unchanged -->
</BaseLayout>

<style>
  /* legacy page <style> block, minus dropped rules, values tokenised */
</style>

<script>
  // legacy page-specific JS (calculator, tabs, form logic), TypeScript-ok
</script>
```

FAQ sections: keep the surrounding `.faq-wrap`/`.faq-cols`/`.faq-side` markup
from the page; replace the `.faq-acc` inner list with
`<FaqAccordion faqs={FAQS} />`. Answers may contain simple HTML (rendered via
set:html) - copy legacy answer HTML verbatim.

## 4. Tokenising the page `<style>` block

Keep every value EXACT. Swap only names:

**Legacy var → new token (mandatory):**
`--page`→`--color-surface-page` · `--sec-light`→`--color-surface-section-light` ·
`--sec-tint`→`--color-surface-section-tint` · `--card`→`--color-surface-card` ·
`--card-border`/`--card-border-soft`→`--color-border-card` ·
`--pcard-border`→`--color-border-product-card` · `--pcard-hover`→`--color-cream-300` ·
`--pcard-hover-bd`→`--color-tan-400` · `--row-line`→`--color-border-hairline` ·
`--olive-title`→`--color-text-heading-dark` · `--olive-head`→`--color-olive-900` ·
`--olive-deep`→`--color-olive-950` · `--ink`→`--color-text-primary` ·
`--ink-2`→`--color-text-secondary` · `--ink-3`→`--color-text-tertiary` ·
`--muted`→`--color-text-muted` · `--muted-2`→`--color-text-faint` ·
`--gold`→`--color-gold-500` · `--gold-2`→`--color-gold-400` ·
`--gold-btn`→`--color-action-primary` · `--gold-ink`→`--color-gold-950` ·
`--olive-ink`→`--color-action-primary-ink` · `--green`→`--color-success` ·
`--blue`→`--color-link` · `--field-X`→`--color-field-X` (bd→border,
bd-active→border-active, ph→placeholder, disabled-bd→disabled-border) ·
Layout vars unchanged: `--pad`, `--container-pad`, `--section-y`, `--cta-w`,
`--hero-text-w`, `--hero-aside-w`.

**Raw hex values:**
- Exact match to a primitive in `src/styles/global.css` → use the token var.
- Tier-1 near-duplicate (see docs/legacy-style-audit.md §A2): `#f2b83f`→
  `--color-gold-400`, `#2d3813`→`--color-olive-900`, `#1a2010`→`--color-olive-950`,
  `#6d6e6a`→`--color-sage-700`, `#8d8e84`→`--color-sage-450`, `#ededec`/`#e0e0e0`→
  gray tokens, `#c9c8c0`/`#c4c6c1`→`--color-sage-100`, `#daead7`→`--color-green-100`,
  `#3a3a35`/`#363731`/`#353731`→`--color-sage-900` → use the canonical token.
- Anything else (page-local single-use colors, gradient-stop variants,
  off-grid spacing, off-scale font sizes): **keep the literal value** and add
  `/* page-local - Tier-2 candidate */`.
- Inline SVG stroke/fill attributes in markup: keep verbatim, EXCEPT the two
  Tier-1 golds/olives (`#f2b83f`→`#f3b83f`, `#2d3813`→`#2e3914`).

Astro `<style>` is scoped - fine, since the styled markup lives in the same
file. Never use `:global()` to restyle shared chrome; if a page tries to, stop
and note it in your report instead.

## 5. Hard limits

- Do NOT edit: `src/styles/global.css`, `src/layouts/`, `src/components/`,
  `src/data/`, `src/lib/`, config files, other pages.
- Do NOT run the dev server, `astro build`, or git commands.
- If you find something that should be shared (a component/style used by other
  pages too), keep it page-local and FLAG it in your report.

## 6. Report back (final message)

Files created · notable token swaps · values kept literal (and why) ·
flagged shared-extraction candidates · any uncertainty about parity.
