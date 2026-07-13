/**
 * Proofkit — configuration & the single on/off switch.
 *
 * Proofkit is a self-contained, portable content-review tool (on-page
 * click-to-comment overlay + admin dashboard + Cloudflare Worker). This is the
 * ONE file to edit when turning it on/off or porting it to another project —
 * everything site-specific lives here so the rest of the package stays generic.
 * See ./README.md (what it is) and ./INSTALL.md (how to drop it into a project).
 */
import type { SEO } from '../../lib/seo';

/**
 * ⬅ THE SWITCH. Flip to `false` to remove Proofkit site-wide — the on-page
 * overlay stops loading on every page and the /review + /reviewdash routes render
 * an empty "not available" stub. One code change, whole tool gone.
 */
export const PROOFKIT_ENABLED = true;

/**
 * Cloudflare Worker base URL (the shared comment store). Empty string ⇒
 * localStorage demo mode (comments live only in the current browser, so the flow
 * is testable before the backend exists). Injected at build time from the
 * PUBLIC_REVIEW_WORKER_URL env var — see ./INSTALL.md.
 */
export const WORKER_URL: string = import.meta.env.PUBLIC_REVIEW_WORKER_URL || '';

/**
 * Review dashboard password - enforced on EVERY build (dev AND live) whenever the
 * tool runs without the Cloudflare Worker (WORKER_URL empty / static host). Stored
 * as a SHA-256 hash so the plaintext password never ships in the client bundle;
 * test an entry with `checkReviewPassword()`. Set to '' to accept anything.
 *
 * Current value = SHA-256("website").  (Regenerate with:
 *   echo -n 'yourpassword' | shasum -a 256)
 *
 * SECURITY: on a static (no-Worker) site this gate is still client-side - it keeps
 * unauthorized people out in practice, but a determined user can bypass client JS.
 * For a true server-side secret, deploy the Worker and `wrangler secret put ADMIN_PASS`
 * (same password 'website'); the Worker then enforces it and this value is unused.
 */
export const REVIEW_PASSWORD_SHA256 = '747a8f398395dde8e524d9f983784bd8441c5cfe4307b5a079be5412ee65c314';

/** SHA-256 hex digest of a string (Web Crypto - available in browsers + Workers). */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when `input` is the review password (or when no password is configured). */
export async function checkReviewPassword(input: string): Promise<boolean> {
  if (!REVIEW_PASSWORD_SHA256) return true; // blank => open
  return (await sha256Hex(input)) === REVIEW_PASSWORD_SHA256;
}

/** Reviewer teams offered in the comment composer and the dashboard filters. */
export const TEAMS = ['Product', 'SEO', 'Marketing', 'Content'] as const;

/**
 * The team label that maps to ADMIN. Shown in the /teamdash login dropdown (in
 * addition to TEAMS); picking it and entering the admin password ('website') signs
 * in as admin and lands on the admin dashboard (/reviewdash). It is deliberately NOT
 * in TEAMS, so it never appears in the on-page comment composer or the team filters —
 * it is a login identity only. Its "key" is the admin password (ADMIN_PASS).
 */
export const ADMIN_TEAM = 'Design' as const;

/** Per-team chip colours as [background, text]. Keys must match TEAMS. */
export const TEAM_COLORS: Record<string, [string, string]> = {
  Product: ['#e7f0fb', '#1b5fa8'],
  SEO: ['#e7f7ee', '#1d7a46'],
  Marketing: ['#fdeee6', '#b5541f'],
  Content: ['#f1eafb', '#6b3fa0'],
};

/**
 * Host-page elements to hide while review mode is armed — e.g. a floating
 * back-to-top button that would otherwise overlap the Comment dock. Site-specific:
 * set to `[]` in a project that has nothing to hide.
 */
export const HIDE_SELECTORS: string[] = ['.to-top'];

/**
 * Colour theme (skin) for the dashboard + on-page overlay. Both inject the active
 * theme's `--pk-*` custom properties, so switching THEME reskins the whole tool.
 * Add a skin by adding an entry to THEMES; keep the same token names.
 */
export const THEME: keyof typeof THEMES = 'red-moon';
const THEMES = {
  'red-moon':
    '--pk-canvas:#181818;--pk-card:#1e1e1e;--pk-elev:#242424;--pk-input:#141414;' +
    '--pk-red:#da291c;--pk-red-2:#b01e0a;--pk-ink:#ffffff;--pk-body:#a7a7a7;' +
    '--pk-muted:#7d7d7d;--pk-hair:#333333;--pk-amber:#f5a623;--pk-green:#3ddc84;--pk-softred:#ef5b50',
  'dark-cream':
    '--pk-canvas:#1a1712;--pk-card:#221d16;--pk-elev:#2a241c;--pk-input:#15120d;' +
    '--pk-red:#c9a24b;--pk-red-2:#a8843a;--pk-ink:#f5efe2;--pk-body:#b8ad97;' +
    '--pk-muted:#8a8069;--pk-hair:#3a3226;--pk-amber:#e0b45a;--pk-green:#7fb58a;--pk-softred:#d98a6a',
};
/** The active theme's CSS custom-property declarations (no selector), injected by the tool. */
export const themeVars: string = THEMES[THEME] || THEMES['red-moon'];

/**
 * Friendly display names per page path — shown (as link text) wherever the dashboard
 * would otherwise print a raw URL. Project-configurable: edit this map for a new site.
 * Anything not listed falls back to a title-cased slug via pageName().
 */
export const PAGE_NAMES: Record<string, string> = {
  '/': 'Homepage',
  '/about-us': 'About Us',
  '/open-demat-account': 'Open a Demat Account',
  '/become-a-partner': 'Become a Partner',
  '/karnataka-bank-customers': 'Karnataka Bank Customers',
  '/antara': 'Antara',
  '/sitemap': 'Sitemap',
  '/products': 'Product Suite',
  '/equity': 'Equity',
  '/derivatives': 'Derivatives',
  '/mtf': 'MTF',
  '/commodities': 'Commodities',
  '/currency': 'Currency',
  '/mutual-funds': 'Mutual Funds',
  '/etf': 'ETFs',
  '/ipo': 'IPO',
  '/nfo': 'NFO',
  '/nps': 'NPS',
  '/bonds': 'Bonds',
  '/fixed-deposit': 'Fixed Deposit',
  '/loan-against-mutual-fund': 'Loan Against Mutual Funds',
  '/loan-against-shares': 'Loan Against Securities',
  '/global-investing': 'Global Investing',
  '/research-hub': 'Research Centre',
  '/technical-analysis': 'Technical Research',
  '/fundamental-analysis': 'Fundamental Research',
  '/mutual-fund-analysis': 'Mutual Fund Research',
  '/calculators': 'Calculators',
  '/sip-calculator': 'SIP Calculator',
  '/lumpsum-calculator': 'Lumpsum Calculator',
  '/swp-calculator': 'SWP Calculator',
  '/nps-calculator': 'NPS Calculator',
  '/fd-calculator': 'FD Calculator',
  '/contact-us': 'Contact Us',
  '/grievance-redressal': 'Grievance Redressal',
  '/privacy-policy': 'Privacy Policy',
  '/terms-and-conditions': 'Terms & Conditions',
  '/terms-of-use-purse': 'Terms of Use – Purse',
  '/regulatorydocuments': 'Regulatory Documents',
  '/regulatorydocuments/investor-charter': 'Investor Charter',
  '/regulatorydocuments/mandatory-member-details': 'Mandatory Member Details',
  '/designsystem': 'Design System',
  '/designsystem/current': 'Design System – Current',
  '/designsystem/proposed': 'Design System – Proposed',
};

/** Friendly name for a page path (PAGE_NAMES, else a title-cased slug fallback). */
export function pageName(path: string): string {
  const p = (path || '/').replace(/\/+$/, '') || '/';
  if (PAGE_NAMES[p]) return PAGE_NAMES[p];
  const seg = p.split('/').filter(Boolean).pop() || 'home';
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** SEO for the login route (/review) — noindex, it's an internal tool. */
export const loginSeo: SEO = {
  title: 'Content Review',
  description: 'Internal content-review sign in.',
  path: '/review',
  noindex: true,
};

/** SEO for the admin dashboard route (/reviewdash) — noindex. */
export const dashSeo: SEO = {
  title: 'Content Review Dashboard',
  description: 'Internal content-review dashboard.',
  path: '/reviewdash',
  noindex: true,
};

/**
 * SEO for the per-team dashboard route (/teamdash) — noindex. A team signs in with
 * its own team key; the Worker returns only that team's comments (server-side
 * isolation) plus that team's notifications. One route serves every team — the team
 * is identified by the login key, never by the URL.
 */
export const teamDashSeo: SEO = {
  title: 'Team Review Dashboard',
  description: 'Your team’s content-review status.',
  path: '/teamdash',
  noindex: true,
};
