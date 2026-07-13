# Page Inventory — Shriram Financial Services

> The full 44-page URL / source / description inventory, extracted from `CLAUDE.md` to keep the
> always-loaded rulebook lean. `CLAUDE.md` links here. Keep this in sync when pages are added,
> removed, or their URLs change (see the page-metadata memory note).

---

## 📄 Pages

**44 pages total.** URLs are **flat/top-level, extensionless, no-trailing-slash** - product and calculator detail pages live directly at `src/pages/<slug>.astro` (root), NOT nested under `products/`/`calculators/`. **Leaf slugs use hyphens between words; folder segments do not** (only `regulatorydocuments/` and `designsystem/` are folders). The product and calculator **hubs are flat files** (`products.astro`, `calculators.astro`). Detail pages are **template-driven** (`equity.astro` is the reference for product pages). Every FAQ block reads exactly **Got Questions?** (rule 13). Every `<title>` is normalised by `fullTitle()` to `<Page Title> | Shriram Financial Services` - page `seo.title` values carry **no** brand suffix. All heroes use the shared `.hero` except the `/calculators` hub (documented `.calc-hero` variant) and the calculator **detail** pages (the `.hero.hero-compact` hug variant - see rule 7). *(URL scheme updated 2026-07-09: trailing slashes dropped + `build.format: 'file'`; leaf slugs keep word hyphens, folder segments (`regulatorydocuments`, `designsystem`) are hyphen-free.)*

**Core & company**
| URL | Source | Page |
|---|---|---|
| `/` | `pages/index.astro` | Homepage (video hero + glass Demat card, pinned "Why Shriram", advisory cards, dark product grid, steps, shared `FaqAccordion` + olive "Still Have Questions?" side card). Unified shared `Footer`. |
| `/about-us` | `pages/about-us.astro` | About Us (stat hero, MVV, timeline). |
| `/open-demat-account` | `pages/open-demat-account.astro` | Open a Demat Account (two-column hero + lead-capture form, phone-flag decoration). |
| `/become-a-partner` | `pages/become-a-partner.astro` | Become a Partner (Apply form, eligibility checker, portfolio tabs). |
| `/karnataka-bank-customers` | `pages/karnataka-bank-customers.astro` | Karnataka Bank 3-in-1 (co-brand hero lockup + lead-capture form). |
| `/open-demat-campaign1` | `pages/open-demat-campaign1.astro` | Demat campaign landing page (isolated - `chrome={false}` logo-only bar + disclaimer strip, single-screen hero + lead-capture form). |
| `/antara` | `pages/antara.astro` | Explore Antara (Shriram X platform - standardised hero, feature/cat grids, `.gate` locked card, FAQ). |
| `/sitemap` | `pages/sitemap.astro` | HTML sitemap (link index, built from `navigation.ts`). |

**Products** - flat at `pages/<slug>.astro` (template-driven; `equity` is the reference). Hub at `pages/products.astro`.
| URL | Page |
|---|---|
| `/products` | Product Suite hub (breadcrumb hero, `.pgroup`/`.pcard` grids, orbit band). |
| `/equity` | Equity - **reference** product-page template. |
| `/derivatives` | Equity Derivatives (F&O). |
| `/mtf` | Margin Trading Facility (MTF). |
| `/commodities` | Commodity Trading (MCX/NCDEX). |
| `/currency` | Currency Trading. |
| `/mutual-funds` | Mutual Funds. |
| `/etf` | ETFs. |
| `/ipo` | IPO. |
| `/nfo` | New Fund Offers (NFO). |
| `/nps` | National Pension System (NPS). |
| `/bonds` | Bonds. |
| `/fixed-deposit` | Fixed Deposit (FD). |
| `/loan-against-mutual-fund` | Loan Against Mutual Funds (LAMF). |
| `/loan-against-shares` | Loan Against Securities (LAS). |
| `/global-investing` | Global Investing (US stocks & ETFs). |

**Research** - flat at `pages/<slug>.astro`
| URL | Source | Page |
|---|---|---|
| `/research-hub` | `pages/research-hub.astro` | Research Centre (hub hero, `.appr` cards, feature grid, dark access band, FAQ). |
| `/technical-analysis` | `pages/technical-analysis.astro` | Technical Research (gated daily note, research-report grid). |
| `/fundamental-analysis` | `pages/fundamental-analysis.astro` | Fundamental Research (process, coverage, FAQ). |
| `/mutual-fund-analysis` | `pages/mutual-fund-analysis.astro` | Mutual Fund Research (ratings, model portfolios, FAQ). |

**Calculators** - detail pages flat at `pages/<slug>calculator.astro` (`calcHref` in `data/calculators.ts` → `/<slug>calculator`). Hub at `pages/calculators.astro` (kept **isolated** for future calculators; `.calc-hero`).
| URL | Page |
|---|---|
| `/calculators` | Calculators hub (**sanctioned** `.calc-hero`; isolated, not in primary nav flow). |
| `/sip-calculator` | SIP Calculator. |
| `/lumpsum-calculator` | Lumpsum Calculator. |
| `/swp-calculator` | SWP Calculator. |
| `/nps-calculator` | NPS Calculator. |
| `/fd-calculator` | Fixed Deposit Calculator. |

**Support**
| URL | Source | Page |
|---|---|---|
| `/contact-us` | `pages/contact-us.astro` | Contact/Support hub (tabbed: Customer Care / Branch Locator / Downloads). |
| `/grievance-redressal` | `pages/grievance-redressal.astro` | Grievance Redressal. |

**Legal & compliance** - regulatory docs nested under the `regulatorydocuments/` hub.
| URL | Source | Page |
|---|---|---|
| `/privacy-policy` | `pages/privacy-policy.astro` | Privacy Policy. |
| `/terms-and-conditions` | `pages/terms-and-conditions.astro` | Terms & Conditions (legal long-form). |
| `/terms-of-use-purse` | `pages/terms-of-use-purse.astro` | Terms of Use - Purse mobile app. |
| `/regulatorydocuments` | `pages/regulatorydocuments.astro` | Regulatory Documents hub (`.doc-card` grid → the two docs below + SEBI/exchange disclosures). |
| `/regulatorydocuments/investor-charter` | `pages/regulatorydocuments/investor-charter.astro` | Investor Charter (shared `.doc-card` view/download grid). |
| `/regulatorydocuments/mandatory-member-details` | `pages/regulatorydocuments/mandatory-member-details.astro` | Mandatory Member Details (SEBI disclosures). |

**Design system** (noindex - the Figma artifact)
| URL | Source | Page |
|---|---|---|
| `/designsystem` (+ `current/`, `proposed/`) | `pages/designsystem/` | Design-system docs (noindex). |

> **Note:** `/antara` (Shriram X platform) is now built (2026-07-08). The homepage "Explore Antara" hero link and the footer "Explore Antara" entry in `navigation.ts` point at it; the homepage login links remain inert `#` placeholders.

> **Proofkit — content-review tool (`/review` + `/reviewdash`).** The click-to-comment overlay, the
> two dashboard routes, the two-tier auth and the Cloudflare Worker are **Proofkit**, an isolated,
> versioned, portable **package** in `src/plugins/proofkit/` — deliberately decoupled from the design
> system, built to zip up and drop into any Astro / Claude Code project. One switch, `PROOFKIT_ENABLED`
> in its `config.ts`, toggles the whole tool on/off site-wide. Its `README.md` (what it does) +
> `INSTALL.md` (how to integrate) are the **source of truth**; **keep them in sync and bump `VERSION` +
> `CHANGELOG.md` whenever you change the tool.** The only host-project seams are the gated
> `{PROOFKIT_ENABLED && <ProofkitOverlay />}` line in `BaseLayout.astro` and the two thin route shims
> `src/pages/review.astro` + `reviewdash.astro`.

**Adding a new page:** create `src/pages/<path>.astro`, import `BaseLayout`, pass a `seo` object,
and build from the shared component classes + tokens in `global.css`. Build the hero with the
shared `<Hero>` component (rule 18), not hand-written `<section class="hero">` markup. Copy an
existing page of a similar shape (`privacy.astro` for content pages, `products/equity.astro` for
nested). Use the data layer (`src/data/`) for anything repeated. Never fork `global.css`.
