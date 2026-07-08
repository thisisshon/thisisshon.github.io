# Design-System Docs - build spec

Build a small `/design-system/` section: a hub + TWO documentation pages, as
Astro pages in this project. They render LIVE from the real tokens in
`src/styles/global.css` (import it via BaseLayout as every page does) so they
can never drift. Each is one static HTML page at build.

Read first: `src/styles/global.css` (the token system), `docs/legacy-style-audit.md`
(the evidence base), `src/pages/privacy.astro` (page conventions), and this file.

## Files to create

1. `src/pages/design-system/index.astro` - URL `/design-system/`. A hub: short
   intro (what this is: the export artifact for the Figma round-trip), and two
   big cards linking to the two docs below, each explaining what it is.
2. `src/pages/design-system/current.astro` - URL `/design-system/current/` -
   **"What is used"**: the honest as-built inventory.
3. `src/pages/design-system/proposed.astro` - URL `/design-system/proposed/` -
   **"What is suggested"**: the clean, consolidated system + component gallery.

All three use `<BaseLayout seo={...}>`. Give each an appropriate title/description/
path. Add `noindex: true` to the seo object for all three (internal tooling docs
- BaseLayout already supports `seo.noindex`). Keep them visually on-system: use
the existing tokens, `.section`, headings, cards. Put page-specific doc styling
in a scoped `<style>` block (swatch grids, spec tables) - tokenised.

## Doc 1 - /design-system/current/ ("What is used")

The honest mirror of the legacy site. Sections:
- **Intro**: one paragraph - "This is what the legacy site actually rendered,
  extracted from the full audit (docs/legacy-style-audit.md). It shows the
  sprawl the token system resolves: ~150 colors, two parallel stylesheets, etc."
- **Colors as-found**: render the audit's color inventory (docs/legacy-style-audit.md
  §A1) as swatch groups (dark inks, olive/greens, sages, golds, creams, neutrals,
  functional). Each swatch = a color chip (hardcode the literal hex here - this
  doc documents the OLD values) + hex + occurrence count + example use. Group the
  near-duplicate CLUSTERS (§A2) visibly so the duplication is obvious - e.g. show
  the 4 competing near-blacks side by side, the 15 creams together, labelled
  "→ collapses to N tokens".
- **The two-stylesheet fork**: a short table summarising §E2 (nav identical,
  footer different, buttons 4 specs, FAQ different mechanism, etc.).
- **Type / spacing / effects as-found**: compact tables from §B/§C/§D (font sizes
  with counts incl. off-scale 15/19px; spacing freq incl. off-grid; the 4
  gradient recipes; 9 durations). Keep it factual.
This doc is the "before". It's fine to hardcode the audit values as literals
(that's the point - it records history).

## Doc 2 - /design-system/proposed/ ("What is suggested") - THE Figma artifact

The clean system, rendered LIVE from the tokens. Sections:
- **Intro**: "The consolidated, duplication-proofed design system. Every value
  below is a live token from styles.css. Structured to map 1:1 onto Figma
  variables (primitive → semantic → component) for the round-trip."
- **Token tiers explainer**: brief - primitive → semantic → component, and the
  Tier-1 (applied) vs Tier-2 (proposed) merge policy.
- **Color tokens**: for EACH primitive family (gold/olive/charcoal/sage/gray/
  warmgray/cream/tan/functional), a swatch row. Each chip's background MUST be
  the live token: `style={`background: var(--color-gold-400)`}` - NOT a hardcoded
  hex. Label each with its token name, and (from global.css comments) its role +
  what legacy near-dupes it absorbed. Then a **semantic tokens** table: role name
  → which primitive it points to → a live chip (surface/text/border/action/state/
  field groups).
- **Typography**: render the type scale live - one specimen line per `--text-*`
  size at its real size, labelled with token + px. Show the weights (300–800).
  State the line-height:1.5 rule and the single font (Outfit).
- **Spacing & radii**: render the 8px spacing scale as bars, and the radius scale
  as rounded boxes, each labelled with the token.
- **Shadows & motion**: swatch cards showing each `--shadow-*`; a note on the
  easing/duration tokens.
- **Component gallery**: render the REAL components live (reuse the shared
  classes from global.css - they're globally available): a `.btn-gold`, a
  `.btn-dark`, a `.btn-ghost`; a `.hf-field` (default) + one `.hf-field.invalid`
  + one disabled, showing the field states; a `.card` with `.card-h`/`.card-p`;
  a `.pcard`; the FAQ item look; a `.cat` tile. Each with a small caption naming
  the component + its states. For interactive states you can show them
  statically (add the state class to a sample).
- **Naming conventions + usage rules**: short list - how tokens are named, the
  "components bind to semantic, semantic binds to primitive" rule, the 8px grid,
  solid-hex rule, one-font rule, icon sizes 16/20/24/32.

Make Doc 2 genuinely well-designed and readable - it is the artifact a designer
will look at and export into Figma. Clean spec tables, real swatches, generous
spacing. But do NOT invent new visual styles - compose from existing tokens.

## Hard limits
- Do NOT edit global.css, layouts, components, other pages, or config.
- Do NOT run servers/build/git.
- Live tokens via `var(--token)` for Doc 2 chips; literal hexes only in Doc 1
  (documenting old values) and where a swatch must show a specific legacy color.

## Report back
Files created · confirmation Doc 2 chips use live `var(--...)` tokens · any
token you referenced that was missing from global.css · anything you were unsure
how to render.
