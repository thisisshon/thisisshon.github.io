# Shriram Financial Services - Design System (Direction)

The **direction** - the rulebook for tokens, components and conventions. The **implementation**
is `src/styles/global.css` (+ `src/components/`); the **live visual documentation** is the
`/design-system/` pages (`current/` = what the legacy site used, `proposed/` = this system,
rendered live from the tokens). Keep all in sync (CLAUDE.md rule 11).

Built to organisation scale (4,000+ pages). Every token/component choice is justified by whether
it holds across thousands of pages. Values were consolidated from a ~150-colour legacy sprawl -
see `docs/legacy-style-audit.md` for the full "before" inventory.

---

## 1. Token architecture - the three tiers

Tokens live in `src/styles/global.css` and are the stable API. **Components bind to semantic
roles; semantic roles bind to primitives.** When the design system returns from Figma, only
values change - component code never does.

```
PRIMITIVE            SEMANTIC (@theme inline)          COMPONENT (global.css classes)
--color-gold-400  →  --color-action-primary        →  .btn-gold { background: var(--color-action-primary) }
--color-charcoal-875 → --color-text-primary         →  body / .card-h { color: var(--color-text-primary) }
```

- **Primitives** - raw palette + scale values (`--color-gold-400`, `--text-5xl`, `--radius-3xl`).
  Named `--color-<family>-<step>`. This is the layer Figma variable *collections* map onto.
- **Semantic roles** (`@theme inline`) - role names that point at primitives
  (`--color-action-primary`, `--color-surface-page`, `--color-text-muted`, `--color-field-border`).
  This is the layer components consume. Figma variable *aliases/modes* map here.
- **Component** - the shared classes in `global.css` (`@layer components`). They reference
  semantic roles (or a primitive where no role fits).

**Merge policy.** Tier-1 (near-duplicates ≤2 RGB pts) is already applied - imperceptible. Tier-2
(visible unifications: the 4 button specs, the divergent homepage footer, 15 creams → 5, ink
merges) is **documented in `/design-system/proposed/` but not applied**, pending Figma sign-off.
`/* Tier-2 */` comments mark values held for pixel parity.

---

## 2. Colour

Primitive families (see `global.css §2` for every step + its role + the legacy near-dupes it
absorbed). Each family is a ramp; do **not** add steps - reuse, or add a semantic role.

| Family | Role |
|---|---|
| `gold-*` | Brand primary - CTAs, highlights, focus border. `gold-400` (#f3b83f) is *the* gold. |
| `olive-*` | Brand secondary - headings, button ink, dark cards, hero gradient. `olive-900` (#2e3914) is *the* olive. |
| `charcoal-*` | Dark neutrals - nav/body ink, footer, gradient ends. (12 legacy steps; Tier-2 → ~4.) |
| `sage-*` | Gray-greens - muted/secondary text, on-dark body copy, overlay chrome. |
| `gray-*` | Pure neutrals - field borders, placeholders, disabled states, dividers. |
| `warmgray-*` | Hairlines on cream - card borders, row lines, overlay dividers. |
| `cream-*` | Light surfaces - page/card/section backgrounds. (9 steps; Tier-2 → 5.) |
| `tan-*` | Warm borders/accents - product-card borders, overlay gradient start. |
| functional | `white`, `blue-500/600` (link), `green-500/600/100` (success), `red-500` (error). |

**Semantic roles** (the layer to actually use): `surface-page/card/section-light/section-tint/
footer/dark-card`; `text-primary/heading-dark/secondary/tertiary/muted/faint/on-dark(-body/-lead)`;
`border-card/hairline/divider/product-card`; `action-primary(-hover/-ink)/action-dark/link
(-hover)`; `success(-strong/-tint)/danger`; `field-border(-active)/label/ink/placeholder/
disabled-*`.

**Rule 5 - solid hex only.** Every colour is a solid hex token. No `rgba()`/`hsla()`, no
`opacity:.1` to fake a lighter colour - flatten alpha over its background into a hex. Translucency
is allowed only for `box-shadow`, frosted `backdrop-filter`, and the `opacity` property for
motion/state. (Homepage carries a few un-flattenable-over-gradient legacy alphas verbatim,
flagged Tier-2 - the documented exception.)

---

## 3. Typography

- **One font: Outfit** (weights 300–800 loaded). Never another `font-family` or second web font.
  Form controls force-inherit it in `@layer base`.
- **`line-height: 1.5`** on every text element, globally (base layer). Display resets
  (`line-height:1`) are re-declared locally only where a legacy element needs it.
- **Type scale** (`--text-*`): `2xs 10` · `xs 12` · `sm 14` · `base 16` · `lg 18` · `xl 20` ·
  `2xl 24` · `3xl 28` · `4xl 32` · `5xl 40` (px). Legacy off-scale 15/19px are carried literal
  where they occur (Tier-2 → snap to 14/20).
- **Weights** (`--font-weight-*`): light 300 (overlay only) · normal 400 · medium 500 ·
  semibold 600 · bold 700 · extrabold 800 (loaded, unused).

---

## 4. Spacing, radii, elevation, motion

- **Spacing - 8px grid.** Every gap/padding/margin is a multiple of 8px (4px worst case). Page
  rhythm tokens: `--pad` (fluid gutter), `--container-pad` (32→24), `--section-y` (72→56).
  Legacy off-grid values carried for parity are flagged Tier-2.
- **Radii** (`--radius-*`): `xs 2 · sm 4` (buttons) · `md 8` (inputs) · `lg 12 · xl 16 · 2xl 20 ·
  3xl 24` (the card radius) · `full 999`.
- **Shadows** (`--shadow-*`, the only sanctioned colour translucency): `fab` · `control` ·
  `glow-gold` · `ring-gold` · `glass`.
- **Motion**: easings `--ease-standard` (overlay/FAQ/reveal), `--ease-spring` (product cards),
  `--ease-reveal`. Duration tokens `--dur-*` for new work; ported legacy CSS keeps literal
  durations for exact motion parity.

---

## 5. Components (shared classes in `global.css`)

Reuse these; never re-declare them in a page. Full anatomy + states render live at
`/design-system/proposed/`.

- **Buttons** - `.btn-gold` (primary CTA, 40×220, gold), `.btn-dark` (nav CTA), `.btn-ghost`
  (ghost on dark). *(Tier-2: the legacy had 4 button specs; these are the consolidated set.
  Genuine visual variants like research's white-on-olive ghost are namespaced, e.g. `.btn-ghost-r`.)*
- **Input field** - `.hf-field` and family (`.hf-row`/`.hf-unit`/`.hf-field-in`/`.hf-err`/
  `.hf-count`/`.sel`). The **one** form field for the whole site. 48px box, floating 10px label,
  states Default/Active(focus)/Filled/Disabled/Error, optional select-chevron, counter, Verify/
  Verified. Pages add only field *decoration* (e.g. Demat phone-flag), never re-declare the field.
- **Hero** - `.hero` + `.hero-inner` (standardised: one gradient, `min-height`, `56px 0` padding,
  H1/lead sizes). Two-column variant `.hero-grid` + `.hero-aside` (always `--hero-aside-w`,
  `gap:56px`). Only text content changes page to page.
- **Cards** - `.card` (+ `.card-h`/`.card-p`), `.cat`/`.cat-grid` (category grid), `.pcard`/
  `.pcard-grid`/`.pgroup` (product listing), `.steps`/`.step`, `.approaches`/`.appr` (dark
  research cards), `.risk`, `.table`.
- **FAQ** - `<FaqAccordion faqs={...} />` (`src/components/sections/`): single-open accessible
  accordion (`.faq-acc`/`.faq-item`/`.faq-q`/`.qa-wrap`). Pass the same entries to
  `faqPageSchema()` so markup and JSON-LD never drift. *(The homepage keeps its own native
  `<details>` FAQ for exact parity - the documented exception.)*
- **Chrome** - `Header` (sticky, auto-hide) + `MobileMenu` + `MegaNav` (full-page overlay) +
  `Footer`, all rendered from `src/data/navigation.ts`. Injected once by `BaseLayout`.
- **Back-to-top** - `.to-top` FAB, provided by `Footer`.
- **Utilities** - `.section`/`.stack`/`.sec-light`/`.sec-tint`, `.sr-only`, `.skip-link`.

---

## 6. Icons

Every icon is an inline `<svg>` - never a text glyph or emoji. Width/height is one of
**16 / 20 / 24 / 32px**, chosen from context. Icon *containers* follow the 8px grid, not this
scale. *(A few legacy off-scale icons on the homepage - e.g. 44px product illustration - are
carried verbatim and flagged Tier-2.)*

---

## 7. SEO (per-page, templated)

`BaseLayout` + `src/lib/seo.ts` generate the full head from each page's `seo` object: unique
title (site-name suffix appended once), description, canonical, OG, Twitter, and any `jsonLd`
blocks. Schema builders: `faqPageSchema`, `breadcrumbSchema`, `organizationSchema`. The sitemap
is generated from the page tree by `@astrojs/sitemap`. At 4,000-page scale this is **generated,
never hand-typed** - drive it from page data.

---

## 8. The Figma round-trip

`/design-system/proposed/` is authored to map 1:1 onto Figma variables (primitive → semantic →
component). Export → clean up + fill final values in Figma → return here. Implementing the return
should mean **updating token values in `global.css`** (and resolving the Tier-2 items), never
re-architecting components. That is what the token contract buys.
