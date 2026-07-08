# Shriram Financial Services - Website

Static marketing/product site built to **organisation scale (4,000+ pages)**.
Stack: **[Astro](https://astro.build)** (static output) + **[Tailwind CSS v4](https://tailwindcss.com)**.

This project is the Astro + Tailwind rewrite of the legacy static site
(`../Project 1`, kept untouched as the pixel-parity reference). **Nothing changes
visually** - the rewrite re-architects the code, not the design.

## Commands

| Command           | Action                                          |
| :---------------- | :---------------------------------------------- |
| `npm install`     | Install dependencies                            |
| `npm run dev`     | Start dev server at `localhost:4321`            |
| `npm run build`   | Build the static site to `./dist/`              |
| `npm run preview` | Preview the production build locally            |

## Project organisation

```
src/
  styles/
    global.css        Tailwind entry + the design-token system (@theme).
                      SINGLE source of styling truth - tokens only, no per-page CSS.
  layouts/
    BaseLayout.astro  <head> boilerplate + templated SEO (title/description/canonical/
                      OG/Twitter/JSON-LD) + Header/Footer. Every page uses it.
  components/
    ui/               Atomic, reusable primitives: Button, InputField, Icon, …
    sections/         Composed page sections: Hero, FAQ, CTA bands, card grids, …
    site/             Site chrome: Header, Footer, MegaNav.
  pages/              One .astro file per URL. Pages hold CONTENT + composition only -
                      no bespoke styling, no one-off markup systems.
  data/               Structured content that feeds templates (nav tree, products, FAQs).
  lib/                Helpers (SEO/schema builders, formatters).
public/               Static assets served verbatim (assets/, images/, videos/, favicon).
```

## The rules (short form)

1. **Templates, not pages.** Page types are parametric components; pages are content.
2. **Single source of truth.** All styling flows from the token system in
   `src/styles/global.css`; all shared markup from `src/components/`.
3. **Zero visual drift.** The legacy site defines the rendered result, pixel for pixel.
4. **Every token and component is documented** on the `/design-system/` page - the
   artifact that round-trips to Figma.

Full conventions: see `CLAUDE.md` and the `/design-system/` page.
