# Homepage Port Spec - index.html → src/pages/index.astro

The homepage is the ONLY page with the `home.css` fork (Tailwind-compiled,
`el-*`/`hero-*`/`why-*`/`advisory-*`/`product-*`/`steps-*`/`antara-*`/`faq-*`/
`foot-*` classes). This spec resolves every architectural decision so the port
keeps **pixel parity** while dissolving the fork. Read this in full before
starting; then follow the general `porting-guide.md` for token mapping.

Legacy source: `../Project 1/index.html` (214 lines) + `../Project 1/home.css`
(456 lines). Both must be read completely.

## Decision 1 - Chrome comes from BaseLayout (drop the fork's nav)

The fork's `.ds-nav` and `.ds-mobile-menu` are byte-identical in rendered values
to the shared `.nav` / `.mobile-menu` (audit §E2). So:
- DROP the `<header class="ds-nav">…</header>` and `<div class="ds-mobile-menu">`
  markup entirely - BaseLayout's `<Header />` renders them.
- DROP the `<div id="nav-panel">…</div>` overlay markup - BaseLayout's
  `<MegaNav />` renders it.
- DROP the two inline `<script>`s that wire the nav hamburger + overlay - those
  behaviours live in Header.astro / MegaNav.astro now.
- DROP all `home.css` rules for `.ds-nav`, `.ds-mobile-menu`, `.mm-*`,
  `#nav-panel`, `.nps-*` - shared in global.css.
- NOTE the fork's "Why Shriram" fill effect keys off a `.header-hidden` class
  the fork's nav script toggled on `<html>`. If the effect needs it, re-add a
  minimal scroll listener in the page script that toggles `.header-hidden`
  (do NOT re-implement the whole nav). Verify whether the effect actually
  depends on it; if not, omit.

## Decision 2 - Footer stays page-local (it is genuinely different)

The fork footer `.el-bar` is VISIBLY different from the shared footer (audit
§E2: bg #0a0b07 vs #15150f, ~15 alpha-white text/border colors, a regulatory-
text block, different columns, 32px round socials). Pixel parity forbids
substituting the shared footer. So:
- Use `<BaseLayout seo={seo} footer="custom">` - this SUPPRESSES the shared
  footer (see BaseLayout `footer` prop).
- Keep the `<footer class="el-bar">…</footer>` markup as the LAST child of the
  layout's default slot (it renders after `<main>`, before the shared MegaNav).
- Keep its `.el-bar`/`.foot-*` styles in the page `<style>`.
- **Flatten every alpha-white to a solid hex** over the `#0a0b07` footer bg
  (rule 5). Formula: `result = α·255 + (1−α)·10.5` per channel (bg ≈ #0a0b07 =
  rgb 10,11,7; use the real per-channel bg). Compute each and replace, e.g.
  `#ffffffb3` (α=0.70) over #0a0b07 → ~`#b8b8b5`. Do this for the whole
  `#ffffff??` ramp the audit lists. Add `/* flattened from #ffffffXX over
  footer bg (rule 5) */` on each. Keep box-shadows as-is (translucency allowed).

## Decision 3 - Body/page background

The fork sets `body`/section bg to `#fffcf3` (`--color-cream-100`), NOT the
site `--color-surface-page` (#fcf8ef). Pixel parity: the homepage keeps
`#fffcf3`. Put `background: var(--color-surface-page-home)` on the page's root
wrapper (a `<div class="home">` around the content) - do NOT change the global
`body` background. The semantic token `--color-surface-page-home` already exists.

## Decision 4 - Font

The fork uses `--font-display`/`--font-body` = `"Outfit","Inter",system-ui`.
"Inter" is a rule violation and isn't loaded (audit §B1). Replace both with
`var(--font-sans)`. The many inline `style="font-family:var(--font-display)"`
attributes → `style="font-family:var(--font-sans)"` (or drop, since body already
inherits Outfit - but keep explicit to preserve any weight coupling; safest:
map to var(--font-sans)). Result is identical (Outfit renders either way).

## Decision 5 - the rest of home.css → page `<style>`, tokenised

Everything else (hero video band, glass Demat card, the pinned "Why Shriram"
section + its scroll math, advisory cards, dark product grid + reveal, steps
band, Antara band, `<details>` FAQ) is homepage-unique. Bring it into the page
`<style>` scoped block, tokenising per the guide's table. Keep EXACT:
- All gradients (the 3 recipes - hero video wash, why/product olive radial,
  antara near-black radial). Map stop hexes to tokens where they match
  (#4f583b→olive-600, #363a2c→olive-800, #1d1d1d→charcoal-850, #202318→
  charcoal-825, #4d6710→olive-500, #f3b83f→gold-400, #2e3914→olive-900,
  #f8f4e8→cream-350, #fff0d7→gold-100, #ebdec6→tan-200); keep variant-only
  stops (#3f4733, #2a2d23, #3b422c, #282c1e, #14160f, #0a0b07, #000) LITERAL
  with a Tier-2 comment.
- All the fork's alpha/color-mix values that are NOT footer text: the audit
  flags `#2e391466` dot, `#4f583b40`/`#4f583b26` blur orbs, `#ffffffd9` glass
  card bg, `color-mix(... transparent)` ×8, `opacity:.1`/`.3` decorative dims.
  These are Tier-2 rule-5 issues. KEEP them verbatim for pixel parity and add a
  `/* Tier-2: rule-5 (alpha) - parity-preserved */` comment. Do NOT try to
  flatten glass/blur layers (they sit over gradients/video - not flattenable).
- The `<details>`-based FAQ with `interpolate-size:allow-keywords` +
  `::details-content` (Chrome-only smoothness). KEEP the mechanism and markup
  exactly - do NOT swap to the shared FaqAccordion (that would change the DOM
  and animation). `#f8f4e8` item bg → var(--color-cream-350).
- Icon-size rule violations the audit lists (.product-img 44px,
  .product-card-circle svg 26px, .steps-img-2 26px, .hero-label-5 18px): KEEP
  verbatim (parity) + `/* Tier-2: off-scale icon */` comment.
- Off-grid spacing (padding-inline-start:21px, gap:6px, etc.): keep + comment.
- The homepage FAQ still needs FAQPage JSON-LD: build a FAQS array from the 7
  `<details>` and pass `faqPageSchema(...)` via seo.jsonLd (schema only - the
  visible markup stays the `<details>` list).
- DROP home.css's Tailwind preflight / `@property` / `@layer theme` token block
  / `--font-mono` / global scrollbar hiding: Astro+Tailwind v4 provides reset;
  our tokens live in global.css. If any specific `@property` registration is
  load-bearing for an animation (e.g. an animated custom prop), re-add just that
  one `@property` in the page style and note it.

## Decision 6 - Scripts (keep page-unique, drop shared)

KEEP (port verbatim into page `<script>`, TS-ok): the "Why Shriram" scroll-pin
math, the product-card reveal-on-scroll, the `<details>` single-open FAQ script,
the hero-video handling, any `.header-hidden` toggle still needed (Decision 1).
DROP: the nav hamburger script and the overlay open/close script (shared now).

## Decision 7 - Links & assets

Rewrite in-content links to the new URL map (porting-guide §1):
`calculators.html`→`/calculators/`, `contact.html`→`/support/`,
`grievance-redressal.html`→`/support/grievance-redressal/`,
`research.html`→`/research/`, `demat.html`→`/demat/`, `about.html`→`/about/`,
`privacy.html`→`/privacy/`, `investor-charter.html`→`/investor-charter/`,
`index.html`→`/`. Assets are already root-absolute (`/videos/…`, `/images/…`,
`/assets/…`) - keep. The many `/about/…` and `/products/<slug>/` deep links
that have no page yet: keep as-is (they 404 for now, same as legacy intent).

## SEO

title: `Online Stock Trading & Wealth Management | Shriram Financial Services`
(legacy title has a duplicated site-name suffix - DROP the duplicate; BaseLayout
appends the site name once). description: legacy verbatim. path: `/`.
jsonLd: `[organizationSchema(site), faqPageSchema(homepageFaqs)]` - import both
from ../lib/seo; `organizationSchema` takes the site URL (use `Astro.site.href`).

## Report back

Files created · how home.css was partitioned (dropped vs page-local) · the
alpha-white flatten table (each #ffffffXX → hex) · every value kept literal +
why · any `@property` re-added · uncertainties about parity (especially the
pinned section and the video wash).
