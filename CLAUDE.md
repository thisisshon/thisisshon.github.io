# Shriram Financial Services — Project Guide

A static, multi-page marketing/product site **built to organisation scale — a target
of 4,000+ pages** — using **[Astro](https://astro.build)** (static output) + **[Tailwind
CSS v4](https://tailwindcss.com)**. Astro compiles everything to plain static HTML with one
shared, cached stylesheet; there is no client framework and no per-page CSS fork.

> **History.** This is the Astro + Tailwind rewrite of a legacy hand-authored static site
> (one `.html` per page + a shared `styles.css` + a homepage `home.css` fork). The legacy
> site lives at `../Project 1` as the **frozen pixel-parity reference**. The rewrite changed
> the *code*, never the *design*: every page renders pixel-for-pixel identical. The only
> intentional change was invisible — rationalising ~150 sprawling colours into a structured
> token system (see `docs/legacy-style-audit.md`).

---

## 🌐 Scale is the North Star — 4,000+ pages

Every decision — components, stack, tokens, content — is judged first by *"does this hold up
across thousands of pages?"* Four pillars must hold **together** on every page, never traded
off against each other:

- **🔎 SEO** — semantic HTML + a valid heading outline; a unique `<title>` / `<meta
  description>`, `<link rel="canonical">`, Open Graph + Twitter tags, and relevant JSON-LD on
  **every** page; every page in the sitemap. Metadata is **templated/generated per page**, not
  hand-typed — see `BaseLayout.astro` + `src/lib/seo.ts`. `@astrojs/sitemap` generates the
  sitemap from the page tree at build.
- **🛡️ Reliability** — shared components over bespoke markup, progressive enhancement, graceful
  degradation. Astro renders static HTML at build; there is no runtime framework to fail. Fewer
  moving parts = fewer of 4,000 pages that can break.
- **🎨 Visual consistency** — one token set, one type scale, one spacing grid, one component
  library, enforced globally in `src/styles/global.css`. Pages stay uniform *by construction*.
- **⚡ Speed** — one shared, cached `global.css` for the whole site (Tailwind v4, tree-shaken);
  static HTML; lazy-loaded media; component `<script>`s bundled and deferred. Hold a
  performance budget.

**Practical consequences — apply to ALL work:**
1. **Templates, not pages.** New page *types* are parametric `.astro` components/layouts reused
   across hundreds/thousands of instances. Assume pages are **generated from templates + data**
   (`src/data/`), not authored one by one.
2. **Single source of truth.** No per-page CSS/JS forks. Anything reused lives in `global.css`
   / `src/components/` / `src/data/`; page files carry only content + a tiny scoped block.
3. **Vet every new capability against all four pillars** before adopting it. Astro + Tailwind
   was chosen *because* it preserves the vanilla-static virtues (one cached stylesheet, static
   HTML, great SEO) while adding real components, typed data, and generated metadata — the
   things hand-authored HTML could not give us at 4,000-page scale.
4. **The design system is documented for scale** — `/design-system/` (two live pages) + the
   docs below plan components, tokens and conventions explicitly.

---

## ⭐ The sources of truth

| File | Role | What it holds |
|---|---|---|
| **`src/styles/global.css`** | **The design system — implementation** | The token architecture (`@theme` primitives → `@theme inline` semantic roles), base element rules (the global `line-height:1.5`, the one-font rule), and every shared component class. Editing it updates **every page at once**. |
| **`src/components/` + `src/layouts/`** | **Components — implementation** | `BaseLayout` (templated `<head>`/SEO + chrome), site chrome (`Header`, `MobileMenu`, `MegaNav`, `Footer`), UI + section components (`FaqAccordion`, …). |
| **`src/data/`** | **Content data** | Single-source structured content that feeds templates — `navigation.ts` (renders header, mega-nav, mobile menu **and** footer from one dataset). |
| **`/design-system/` pages** | **The design system — documentation** | Two live pages: `/design-system/current/` ("what is used" — the legacy inventory) and `/design-system/proposed/` ("what is suggested" — the clean system, rendered live from the tokens). The **Figma round-trip artifact**. |
| **`CLAUDE.md`** (this file) | **Rulebook / onboarding** | The conventions below — the first thing any builder (human or AI) reads. |

---

## 🔒 Standing rules

1. **Every page uses `BaseLayout`.** Pages pass a `seo` object (title/description/path, optional
   `jsonLd`/`ogType`/`noindex`) and content; the layout renders the entire `<head>` (fonts,
   favicon, canonical, OG/Twitter, JSON-LD) and the shared Header/MegaNav/Footer. **Never
   hand-copy head or chrome markup into a page.**

2. **Every page follows the design system.** Reuse the documented tokens and shared component
   classes from `global.css`; don't restyle from scratch. A page's own `<style>` block holds
   only what is genuinely unique to that page — and its values reference **tokens**, not raw
   hexes (see the token contract below).

3. **One font + `line-height:1.5`, site-wide — no exceptions.** The only font is **Outfit**;
   never set another `font-family` or load a second web font. Form controls are force-inherited
   in `global.css` base layer, so any new interactive element is covered. Every text element
   renders at `line-height:1.5` (enforced globally). Both live in `global.css` `@layer base`.

4. **Icons are real `<svg>`s, never text glyphs, sized `16 / 20 / 24 / 32px` only.** Every icon
   is an inline `<svg>` — never a character (`✓ → ★ f in 𝕏`) or emoji. Width/height is one of
   those four sizes, chosen from context. (Icon *containers* follow the 8px grid, not this scale.)

5. **No fractional opacity, no alpha colours — everything is a solid hex token.** Every
   fill/stroke/border/text/divider colour is a **solid hex** exposed as a token. Never `rgba()`/
   `hsla()`, never `opacity:.1` to fake a lighter colour. Flatten alpha over its background into
   a hex with the same look. **Only** translucency allowed: `box-shadow`, frosted
   `backdrop-filter` layers, and the `opacity` *property* for motion/state (reveal fades,
   disabled/loading dim). *(A small number of legacy alpha values that sit over gradients/video —
   un-flattenable — are carried verbatim on the homepage and flagged `Tier-2` in-file; they are
   the documented exception, not licence for new ones.)*

6. **Spacing sits on the 8px grid.** Every `gap`/`padding`/`margin`/box size is a multiple of
   **8px** (4px worst case). No off-grid values (6, 10, 14, 18…). *(A few legacy off-grid values
   are carried for pixel parity and flagged `Tier-2` in-file — do not add new ones.)*

7. **The hero is standardised across pages.** Same gradient, `min-height`, `.hero-inner` padding
   (`56px 0`), H1/lead font sizes and the two-column `gap:56px`. Only the text content changes.
   H1 and lead cap at `--hero-text-w` (600px); the two-column aside is always `--hero-aside-w`.
   Defined once in `global.css`.

8. **Every form field uses the shared input-field component.** There is **one** form field for
   the whole site — `.hf-field` (with `.hf-row`/`.hf-unit`/`.hf-field-in`/`.hf-err`), canonical
   in `global.css`. Pages **never** re-declare it; they only add field *decoration* (e.g. the
   Demat phone-flag prefix). 48px box, floating label, states Default/Active/Filled/Disabled/
   Error, plus optional select-chevron, counter and Verify/Verified affordances.

9. **🟢 The token contract — components bind to tokens, tokens bind to primitives.**
   `global.css` has three tiers: **primitives** (`--color-gold-400`, raw palette values) →
   **semantic roles** (`--color-action-primary`, `--color-text-primary`, …) → components use
   the semantic role (or a primitive where no role fits). When the cleaned design system returns
   from Figma, **only token values change** — component code never does. Token *names* are the
   stable API; never hardcode a raw hex in a component or page when a token exists.

10. **🟢 Merge policy — Tier-1 applied, Tier-2 documented.** Near-duplicate legacy values ≤2 RGB
    points apart are already merged (Tier-1, imperceptible). Larger *visible* unifications (the
    4 button specs, the divergent homepage footer, collapsing 15 creams → 5, ink merges) are
    **documented in `/design-system/proposed/` but NOT applied** — they await sign-off after the
    Figma round-trip. When you see a `/* Tier-2 */` comment, that's a proposed-but-unapplied
    consolidation held for parity; leave the value, keep the note.

11. **🟢 Design-guideline changes land in ALL THREE places.** When adding/changing a design
    guideline, update **all three** or it is not done:
    - **`/design-system/` pages** — document the rule/direction.
    - **`global.css`** (and/or components) — implement it.
    - **`CLAUDE.md`** (this file) — reflect it in the rules if project-wide.

12. **Headings are LEFT-aligned — `products/equity.astro` is the reference.** The hero H1, every
    section `.sec-title` and every `.sub-title` (with their `.sec-lead`/`.sub-lead`) sit
    flush-left. Never centre a heading block: a section header is a `<div class="stack"
    style="gap:16px">` holding the title + lead, with **no** `align-items:center` / `text-align:
    center` and **no** `max-width` cap on the lead (the section reads left-to-right, full-measure).
    Vertical centring (`justify-content:center` on the `.section stack`) is fine — that's the
    main axis. The **only** centred text is the self-contained promotional bands — the shared
    `.cta-box` and dark CTA/"access" bands — which are centred by their own component design, as
    on equity. Do not centre ordinary content headings anywhere.

13. **The FAQ section header is always "General Questions".** Every page's FAQ block
    (`<h2 class="faq-title">…</h2>` above `FaqAccordion`) reads exactly **General Questions** —
    never "FAQs — <Topic>", "Frequently Asked Questions" or any variant. Apply on every new page
    build and fix any divergent header you encounter, unless a specific page is told otherwise.

---

## ▶️ Running / preview

- Install: `npm install`. Dev: `npm run dev` → `localhost:4321`. Build: `npm run build` →
  `./dist/`. Preview build: `npm run preview`.
- Clean, directory-format URLs everywhere (`build.format: 'directory'`): a page at
  `src/pages/products/equity.astro` serves at `/products/equity/`. The legacy reference site
  (`../Project 1`) can run alongside for pixel comparison (`python3 ../Project\ 1/serve.py`,
  port 4178, or the `static` launch config).

---

## 📁 Project structure

```
src/
  styles/global.css     Tailwind entry + the token system + base + every shared component.
  layouts/BaseLayout.astro   Templated <head>/SEO + Header/MegaNav/Footer + scroll-reveal.
  components/
    site/               Header, MobileMenu, MegaNav, Footer (chrome; render from navigation.ts).
    sections/           Composed sections: FaqAccordion, …
    ui/                 Atomic primitives (as they are extracted).
  data/                 navigation.ts (nav tree → header/overlay/mobile/footer) + future data.
  lib/                  seo.ts (SEO type + fullTitle + faqPage/breadcrumb/organization schema).
  pages/                One .astro per URL. Content + composition only.
public/                 assets/ images/ videos/ favicon.png — served verbatim, root-absolute.
docs/                   legacy-style-audit.md, porting-guide.md, and the build specs.
```

## 📄 Pages

| URL | Source | Page |
|---|---|---|
| `/` | `pages/index.astro` | Homepage (video hero + glass Demat card, pinned "Why Shriram", advisory cards, dark product grid, steps, Antara band, `<details>` FAQ, **its own footer** — the one page whose footer legitimately diverges; `footer="custom"`). |
| `/about/` | `pages/about.astro` | About Us (stat hero, MVV, timeline). |
| `/demat/` | `pages/demat.astro` | Open a Demat Account (two-column hero + lead-capture form, phone-flag field decoration). |
| `/become-a-partner/` | `pages/become-a-partner.astro` | Become a Partner (Apply form, eligibility checker, portfolio tabs). |
| `/research/` | `pages/research/index.astro` | Research Centre (V4 landing: hub hero, All-In-One desk grid, three research streams via shared `.appr` cards, Why-Shriram feature grid, dark access band, alerts/commentary columns, FAQ). |
| `/research/technical/` | `pages/research/technical.astro` | Technical Research (gated daily note, research-report grid). |
| `/privacy/` | `pages/privacy.astro` | Privacy Policy (the pilot port — reference example). |
| `/investor-charter/` | `pages/investor-charter.astro` | Investor Charter (shared `.doc-card` view/download grid). |
| `/mandatory-member-details/` | `pages/mandatory-member-details.astro` | Mandatory Member Details (SEBI member disclosures; same shared `.doc-card` grid as Investor Charter). |
| `/products/` | `pages/products/index.astro` | Product Suite (breadcrumb hero, `.pgroup`/`.pcard` grids, orbit band). |
| `/products/equity/` | `pages/products/equity.astro` | Equity product page. |
| `/calculators/` | `pages/calculators/index.astro` | Calculators hub (uses `.calc-hero` — a **sanctioned** wide chip-rail hero variant, not the shared `.hero`; the calculator *detail* pages use `.hero`). |
| `/calculators/sip/` | `pages/calculators/sip.astro` | SIP Calculator (inline calculator script). |
| `/support/` | `pages/support/index.astro` | Contact/Support hub (tabbed: Customer Care / Branch Locator / Downloads). |
| `/support/grievance-redressal/` | `pages/support/grievance-redressal.astro` | Grievance Redressal. |
| `/design-system/` (+ `current/`, `proposed/`) | `pages/design-system/` | Design-system docs (noindex; the Figma artifact). |

**Adding a new page:** create `src/pages/<path>.astro`, import `BaseLayout`, pass a `seo` object,
and build from the shared component classes + tokens in `global.css`. Copy an existing page of a
similar shape (`privacy.astro` for content pages, `products/equity.astro` for nested). Use the
data layer (`src/data/`) for anything repeated. Never fork `global.css`.

## 🔗 The Figma round-trip

The plan: `/design-system/proposed/` is authored to map 1:1 onto Figma variables (primitive →
semantic → component). It gets exported into Figma → cleaned up and filled in with final values →
returned here. **Implementing the returned system should mean updating token *values* in
`global.css` (and resolving the documented Tier-2 items), never re-architecting components** —
that is exactly what the token contract (rule 9) buys us.
