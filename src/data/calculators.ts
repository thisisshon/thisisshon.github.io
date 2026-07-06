/**
 * Calculators — single source of truth.
 *
 * One dataset drives:
 *  1. The calculators hub grid   (src/pages/calculators/index.astro)
 *  2. Each detail page's "Explore More" rail (the other four tools)
 *  3. The mega-nav / mobile-menu list lives in navigation.ts and must stay in
 *     the same order as `calculators` below.
 *
 * Add a calculator by adding one row here + a matching page at
 * src/pages/calculators/<slug>.astro — the hub and the cross-links update
 * automatically.
 */

export interface CalcMeta {
  /** URL slug → /<slug>-calculator/ */
  slug: string;
  /** Full card / nav title, e.g. "SIP Calculator". */
  title: string;
  /** Short label used in tight contexts. */
  short: string;
  /** One-line card description. */
  desc: string;
}

export const calculators: CalcMeta[] = [
  {
    slug: 'sip',
    title: 'SIP Calculator',
    short: 'SIP',
    desc: 'Project the future value of your monthly SIP investments.',
  },
  {
    slug: 'lumpsum',
    title: 'Lumpsum Calculator',
    short: 'Lumpsum',
    desc: 'See how a one-time investment grows over your chosen horizon.',
  },
  {
    slug: 'fd',
    title: 'Fixed Deposit Calculator',
    short: 'Fixed Deposit',
    desc: 'Estimate maturity value and interest earned on your deposit.',
  },
  {
    slug: 'swp',
    title: 'SWP Calculator',
    short: 'SWP',
    desc: 'Plan steady withdrawals while the rest of your corpus stays invested.',
  },
  {
    slug: 'nps',
    title: 'NPS Calculator',
    short: 'NPS',
    desc: 'Forecast your retirement corpus and expected monthly pension.',
  },
];

/** Build the canonical directory-format URL for a calculator slug. */
export const calcHref = (slug: string): string => `/${slug}-calculator/`;

/** Every calculator except `slug` — feeds a detail page's "Explore More" rail. */
export const otherCalculators = (slug: string): CalcMeta[] =>
  calculators.filter((c) => c.slug !== slug);
