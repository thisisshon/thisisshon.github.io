/**
 * Proofkit — Astro-facing configuration & the single on/off switch.
 *
 * Proofkit is a self-contained, portable content-review tool (on-page
 * click-to-comment overlay + admin dashboard + Cloudflare Worker). The
 * framework-neutral heart now lives in ./core/config.js (tool data + theming +
 * helpers), shared by the .astro adapters AND the standalone core/*.html entries.
 *
 * THIS file is the Astro adapter's config: it re-exports the core and adds the
 * three things that are inherently host/build specific — the site-wide enable
 * switch, the env-driven Worker URL, and the per-route SEO objects. It stays the
 * ONE file to edit when turning Proofkit on/off or porting it into an Astro project.
 * See ./README.md (what it is) and ./INSTALL.md (how to drop it into a project).
 */
import type { SEO } from '../../lib/seo';

/* Re-export the framework-neutral runtime core so existing `./config` imports keep
 * working unchanged. Edit tool DATA + THEMING (teams, colours, skins, the light
 * theme, page names) in ./core/config.js — the single source of truth. */
export {
  TEAMS,
  ADMIN_TEAM,
  TEAM_COLORS,
  HIDE_SELECTORS,
  PAGE_NAMES,
  pageName,
  REVIEW_PASSWORD_SHA256,
  sha256Hex,
  checkReviewPassword,
  DEFAULT_THEME,
  LIGHT_THEME,
  themeVars,
} from './core/config.js';

/**
 * ⬅ THE SWITCH. Flip to `false` to remove Proofkit site-wide — the on-page
 * overlay stops loading on every page and the /review + /reviewdash routes render
 * an empty "not available" stub. One code change, whole tool gone. (This is the
 * Astro render-gate; the core carries its own equivalent flag for standalone use.)
 */
export const PROOFKIT_ENABLED = true;

/**
 * Cloudflare Worker base URL (the shared comment store). Empty string ⇒
 * localStorage demo mode. Injected at build time from PUBLIC_REVIEW_WORKER_URL —
 * the .astro adapters bridge this value to the core via `window.PROOFKIT_WORKER_URL`
 * (see any adapter's inline script). See ./INSTALL.md.
 */
export const WORKER_URL: string = import.meta.env.PUBLIC_REVIEW_WORKER_URL || '';

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
