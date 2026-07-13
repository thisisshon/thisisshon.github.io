/**
 * Proofkit — framework-neutral runtime core config.
 *
 * Plain browser ES module. NOTHING here imports Astro, Vite, or any framework —
 * this is the portable heart the on-page overlay + both dashboards share, whether
 * they run inside an Astro build (via the .astro adapters) or as the standalone
 * core/*.html entries dropped into any stack.
 *
 * The Astro-facing config lives one level up in ../config.ts, which re-exports
 * everything here and adds the build-time concerns (SEO objects, the env-driven
 * Worker URL, the site-wide enable switch). Edit THIS file for tool data +
 * theming; edit ../config.ts for how it wires into a host project.
 */

/* --------------------------------------------------------------------------
 * Master switch (standalone/runtime layer).
 * In an Astro host the REAL switch is PROOFKIT_ENABLED in ../config.ts — the page
 * shims gate rendering on it, so when it is false the core never loads at all.
 * This flag is the equivalent guard for the non-Astro standalone entries.
 * ------------------------------------------------------------------------ */
export const PROOFKIT_ENABLED = true;

/* --------------------------------------------------------------------------
 * Cloudflare Worker base URL (shared comment store). Empty ⇒ localStorage demo.
 * Read from a global the host sets BEFORE this module evaluates:
 *   - Astro adapters inline `window.PROOFKIT_WORKER_URL` from the env var.
 *   - Standalone html sets the same global in a <script> before core/*.js loads.
 * ------------------------------------------------------------------------ */
export const WORKER_URL =
  (typeof window !== 'undefined' && window.PROOFKIT_WORKER_URL) || '';

/* --------------------------------------------------------------------------
 * Review password (client-side gate for no-Worker hosts). SHA-256 hex of the
 * plaintext, so the password never ships. Current value = SHA-256("website").
 * With the Worker deployed this is unused (the Worker enforces ADMIN_PASS).
 * ------------------------------------------------------------------------ */
export const REVIEW_PASSWORD_SHA256 =
  '747a8f398395dde8e524d9f983784bd8441c5cfe4307b5a079be5412ee65c314';

/** SHA-256 hex digest (Web Crypto — browsers + Workers). */
export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when `input` is the review password (or when none is configured). */
export async function checkReviewPassword(input) {
  if (!REVIEW_PASSWORD_SHA256) return true; // blank => open
  return (await sha256Hex(input)) === REVIEW_PASSWORD_SHA256;
}

/* --------------------------------------------------------------------------
 * ONE login per tab. Every Proofkit surface — the on-page overlay, /reviewdash,
 * /teamdash — shares this single per-tab session: the { team, key } chosen at the
 * one login. Whoever logs in anywhere is authenticated everywhere in that tab;
 * the team decides the role (ADMIN_TEAM ⇒ admin panel, else the team dashboard).
 * ------------------------------------------------------------------------ */
export function getSession() {
  try { return { team: sessionStorage.getItem('pkTeam') || '', key: sessionStorage.getItem('pkKey') || '' }; }
  catch { return { team: '', key: '' }; }
}
export function setSession(team, key) {
  try { sessionStorage.setItem('pkTeam', team); sessionStorage.setItem('pkKey', key); } catch {}
}
export function clearSession() {
  try { sessionStorage.removeItem('pkTeam'); sessionStorage.removeItem('pkKey'); } catch {}
}

/* --------------------------------------------------------------------------
 * Teams + chip colours.
 * ------------------------------------------------------------------------ */
export const TEAMS = ['Product', 'SEO', 'Marketing', 'Content'];

/** Login-only identity that maps to ADMIN; deliberately NOT in TEAMS. */
export const ADMIN_TEAM = 'Design';

/** Per-team chip colours as [background, text]. Keys must match TEAMS. */
export const TEAM_COLORS = {
  Product: ['#e7f0fb', '#1b5fa8'],
  SEO: ['#e7f7ee', '#1d7a46'],
  Marketing: ['#fdeee6', '#b5541f'],
  Content: ['#f1eafb', '#6b3fa0'],
};

/** Host-page elements to hide while review mode is armed. `[]` if nothing. */
export const HIDE_SELECTORS = ['.to-top'];

/* --------------------------------------------------------------------------
 * THEMING — --pk-* token skins + a runtime light/dark toggle.
 *
 * Each skin is a block of `--pk-*` custom properties. They used to inject once
 * under `:root{}` (baked, single skin). Now `themeCss()` emits every skin keyed
 * by `[data-pk-theme="…"]`, plus a `:root{}` default so first paint (before JS)
 * is already themed. Swapping the attribute on <html> re-skins live, and the
 * choice persists in localStorage — that is the whole light-mode toggle.
 * ------------------------------------------------------------------------ */
/* The full colour system (all three skins, keyed by [data-pk-theme]) now lives in
 * design/tokens.css — the single source of truth that the dashboards + the product
 * page link/import. This module only keeps the theme NAMES + the dark skin as a bare
 * literal for the ONE consumer that can't link a stylesheet: the on-page overlay,
 * which self-injects `:root{themeVars}` at review time so real visitors get nothing.
 * KEEP `themeVars` in sync with tokens.css :root (the Red Moon skin). */
export const DEFAULT_THEME = 'red-moon'; // dark default
export const LIGHT_THEME = 'light';      // what the toggle flips to
const THEME_KEY = 'pkTheme';              // localStorage cache — instant, no-flash first paint

/** Red Moon (dark) tokens as a bare declaration list — mirrors tokens.css :root. */
export const themeVars =
  '--pk-canvas:#181818;--pk-card:#1e1e1e;--pk-elev:#242424;--pk-input:#141414;' +
  '--pk-red:#da291c;--pk-red-2:#b01e0a;--pk-ink:#ffffff;--pk-body:#a7a7a7;' +
  '--pk-muted:#7d7d7d;--pk-hair:#333333;--pk-amber:#f5a623;--pk-green:#3ddc84;--pk-softred:#ef5b50';

/* The theme is a GLOBAL setting the admin controls — flipping it changes the mode
 * for everyone, so the source of truth is the Worker (KV `settings.theme`), not this
 * browser. localStorage is only a same-browser cache for instant no-flash paint and
 * the no-Worker demo fallback. Read path: everyone GETs /settings. Write path: only
 * the admin POSTs /settings (Worker enforces admin). */

/** Last-known theme from the local cache (fast, synchronous; falls back to dark). */
export function getTheme() {
  try { return localStorage.getItem(THEME_KEY) || DEFAULT_THEME; }
  catch { return DEFAULT_THEME; }
}

/** Apply a skin to THIS browser only: set the attribute, cache it, notify toggles. */
export function applyTheme(name) {
  document.documentElement.setAttribute('data-pk-theme', name);
  try { localStorage.setItem(THEME_KEY, name); } catch {}
  document.dispatchEvent(new CustomEvent('pk:themechange', { detail: { theme: name } }));
}

/** Admin action: set the GLOBAL theme — apply locally, then persist to the Worker
 *  (KV) so every other user picks it up. In demo mode (no Worker) it stays local. */
export async function setGlobalTheme(name) {
  applyTheme(name);
  if (!WORKER_URL) return;
  try {
    const pass = getSession().key || ''; // admin key = the shared session key (team === Design)
    await fetch(WORKER_URL + '/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Review-Pass': pass },
      body: JSON.stringify({ theme: name }),
    });
  } catch {}
}

/** Pull the global theme from the Worker and apply it (falls back to the cache). */
export async function syncTheme() {
  if (!WORKER_URL) { document.documentElement.setAttribute('data-pk-theme', getTheme()); return getTheme(); }
  try {
    const r = await fetch(WORKER_URL + '/settings', { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) { const j = await r.json(); const t = (j && j.theme) || getTheme(); applyTheme(t); return t; }
  } catch {}
  document.documentElement.setAttribute('data-pk-theme', getTheme());
  return getTheme();
}

/** Admin toggle: flip the GLOBAL theme between the light skin and the dark default. */
export function toggleTheme() {
  setGlobalTheme(getTheme() === LIGHT_THEME ? DEFAULT_THEME : LIGHT_THEME);
}

/* Live push (SSE): subscribe to the Worker's /events stream so an admin's theme flip
 * lands on every open dashboard within ~a second — no reload, no tab-focus needed.
 * The Worker polls KV server-side and pushes `theme` events; EventSource auto-
 * reconnects when the bounded stream closes. Silent no-op without a Worker / SSE. */
let themeES = null;
export function startThemeStream() {
  if (!WORKER_URL || typeof EventSource === 'undefined' || themeES) return;
  try {
    themeES = new EventSource(WORKER_URL + '/events');
    themeES.addEventListener('theme', (e) => {
      try { const t = JSON.parse(e.data).theme; if (t && t !== getTheme()) applyTheme(t); } catch {}
    });
    // onerror: EventSource reconnects on its own; nothing to do here.
  } catch { themeES = null; }
}

/** Apply the cached theme instantly (no flash), reconcile with the global one, then
 *  live-subscribe (SSE) — with an on-focus sync as a belt-and-suspenders fallback. */
export function initTheme() {
  document.documentElement.setAttribute('data-pk-theme', getTheme()); // instant
  syncTheme();                                                        // reconcile with the Worker
  startThemeStream();                                                 // live push
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncTheme(); });
  return getTheme();
}

/* --------------------------------------------------------------------------
 * The light/dark toggle control. Its STYLES live in design/components.css
 * (`.pk-tt`); this only builds the wired DOM node, keeps it in sync with the
 * persisted theme, and flips the GLOBAL theme on click. Mounted under the admin
 * dashboard's wordmark via a [data-pk-toggle] slot (admin-only surface).
 * ------------------------------------------------------------------------ */

/** Build one toggle control (a wired DOM node). aria-checked === light mode. */
export function buildThemeToggle() {
  const btn = document.createElement('button');
  btn.className = 'pk-tt';
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'Toggle light and dark theme');
  btn.innerHTML =
    '<span class="pk-tt-track"><span class="pk-tt-thumb">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>' +
    '</span></span>';
  const sync = () => {
    const light = getTheme() === LIGHT_THEME;
    btn.setAttribute('aria-checked', String(light));
    btn.title = light ? 'Light mode — switch to dark' : 'Dark mode — switch to light';
  };
  btn.addEventListener('click', toggleTheme);
  document.addEventListener('pk:themechange', sync);
  sync();
  return btn;
}

/** Fill every `[data-pk-toggle]` slot on the page with a toggle control. */
export function mountThemeToggle(selector) {
  const slots = document.querySelectorAll(selector || '[data-pk-toggle]');
  slots.forEach((slot) => { if (!slot.firstChild) slot.appendChild(buildThemeToggle()); });
}

/* --------------------------------------------------------------------------
 * buildDropdown — a custom, NON-NATIVE themed dropdown (styles: .pk-dropdown in
 * components.css). Sharp corners, spaced items, colour-themed via tokens.
 *   opts: { items:[{value?, label, onSelect?}], value, placeholder, fixedLabel,
 *           block, small, menuAlign:'right', onSelect(value,item) }
 *   fixedLabel → action menu (trigger label never changes, e.g. "Copy").
 * Returns { el, getValue, setValue, focus }.
 * ------------------------------------------------------------------------ */
const PK_CHEV =
  '<svg class="pk-dropdown-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export function buildDropdown(opts) {
  opts = opts || {};
  const items = opts.items || [];
  const fixed = opts.fixedLabel || null;
  let value = opts.value != null ? opts.value : '';
  const wrap = document.createElement('div');
  wrap.className = 'pk-dropdown' + (opts.block ? ' pk-dropdown--block' : '') + (opts.small ? ' pk-dropdown--sm' : '');
  wrap.innerHTML =
    '<button type="button" class="pk-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">' +
      '<span class="pk-dropdown-label"></span>' + PK_CHEV +
    '</button>' +
    '<div class="pk-dropdown-menu' + (opts.menuAlign === 'right' ? ' pk-dropdown-menu--right' : '') + '" role="listbox"></div>';
  const trigger = wrap.querySelector('.pk-dropdown-trigger');
  const labelEl = wrap.querySelector('.pk-dropdown-label');
  const menu = wrap.querySelector('.pk-dropdown-menu');
  const valOf = (it) => (it.value != null ? it.value : it.label);
  const labelFor = (v) => { const it = items.find((i) => valOf(i) === v); return it ? it.label : ''; };
  const syncLabel = () => {
    if (fixed) { labelEl.textContent = fixed; labelEl.classList.remove('is-placeholder'); return; }
    if (value !== '' && value != null) { labelEl.textContent = labelFor(value); labelEl.classList.remove('is-placeholder'); }
    else { labelEl.textContent = opts.placeholder || 'Select'; labelEl.classList.add('is-placeholder'); }
  };

  let isOpen = false;
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); trigger.focus(); return; }
    const list = [].slice.call(menu.querySelectorAll('.pk-dropdown-item'));
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
  };
  function open() {
    isOpen = true; wrap.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); // CSS animates the menu in
    document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey, true);
    const sel = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.pk-dropdown-item');
    if (sel) sel.focus();
  }
  function close() {
    isOpen = false; wrap.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); // CSS animates the menu out
    document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey, true);
  }
  trigger.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? close() : open(); });

  items.forEach((it, idx) => {
    const v = valOf(it);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pk-dropdown-item'; b.setAttribute('role', 'option');
    b.dataset.value = v; b.style.setProperty('--i', idx); // stagger index for the open animation
    if (it.icon) { const ico = document.createElement('span'); ico.className = 'pk-dropdown-ico'; ico.innerHTML = it.icon; b.appendChild(ico); }
    const txt = document.createElement('span'); txt.className = 'pk-dropdown-txt'; txt.textContent = it.label; b.appendChild(txt);
    if (!fixed && v === value) b.setAttribute('aria-selected', 'true');
    b.addEventListener('click', () => {
      if (!fixed) {
        value = v;
        menu.querySelectorAll('.pk-dropdown-item').forEach((e) => e.removeAttribute('aria-selected'));
        b.setAttribute('aria-selected', 'true');
        syncLabel();
      }
      close(); trigger.focus();
      if (it.onSelect) it.onSelect(v, it);
      if (opts.onSelect) opts.onSelect(v, it);
    });
    menu.appendChild(b);
  });

  syncLabel();
  return {
    el: wrap,
    getValue: () => value,
    setValue: (v) => {
      value = v;
      menu.querySelectorAll('.pk-dropdown-item').forEach((e) => {
        if (String(e.dataset.value) === String(v)) e.setAttribute('aria-selected', 'true'); else e.removeAttribute('aria-selected');
      });
      syncLabel();
    },
    setLabel: (t) => { labelEl.textContent = t; },
    focus: () => trigger.focus(),
  };
}

/* --------------------------------------------------------------------------
 * The shared "Panel Login" card — the ONE modern auth surface both dashboards
 * use (styles: design/components.css `.pk-login`). It builds the Team + Key
 * fields, the Authenticate button, and the ProofKit logo; each dashboard wires
 * its own submit (admin vs team routing). ADMIN_TEAM ('Design') is offered as a
 * login-only identity — picking it + the admin key grants ADMIN access.
 * ------------------------------------------------------------------------ */
const PK_MARK =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4V5Z" fill="var(--pk-red)"/>' +
  '<circle cx="12" cy="9.5" r="1.6" fill="#fff"/></svg>';

/** Build the shared login card. Returns { el, teamSel, keyInput, button, setError, setBusy }. */
export function buildPanelLogin(opts) {
  opts = opts || {};
  const title = opts.title || 'Panel Login';
  const sub = opts.sub || 'Enter your key to continue.';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div');
  el.className = 'pk-login';
  el.innerHTML =
    '<div class="pk-login-card" role="dialog" aria-modal="true">' +
      '<div class="pk-login-glow"></div>' +
      '<span class="pk-login-eyebrow">Content Review</span>' +
      '<h1 class="pk-login-title">' + esc(title) + '</h1>' +
      '<p class="pk-login-sub">' + esc(sub) + '</p>' +
      '<div class="pk-login-field">' +
        '<span class="pk-login-label">Team</span>' +
        '<div class="pk-login-team"></div>' +
      '</div>' +
      '<div class="pk-login-field">' +
        '<label class="pk-login-label" for="pk-login-key">Key</label>' +
        '<input id="pk-login-key" class="pk-login-input" type="password" placeholder="Enter your key" autocomplete="off" spellcheck="false" />' +
      '</div>' +
      '<div class="pk-login-err" hidden></div>' +
      '<button type="button" class="pk-login-btn">Authenticate</button>' +
      '<div class="pk-login-brand">' + PK_MARK + '<span>ProofKit</span></div>' +
    '</div>';
  const q = (s) => el.querySelector(s);
  // Team = a custom (non-native) dropdown, full-width inside the card.
  const teamItems = [...TEAMS].sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t }));
  teamItems.push({ value: ADMIN_TEAM, label: ADMIN_TEAM });
  const teamDD = buildDropdown({ items: teamItems, placeholder: 'Select Team', block: true });
  q('.pk-login-team').appendChild(teamDD.el);
  return {
    el,
    getTeam: () => teamDD.getValue(),
    setTeam: (t) => teamDD.setValue(t || ''),
    focusTeam: () => teamDD.focus(),
    keyInput: q('#pk-login-key'),
    button: q('.pk-login-btn'),
    setError: (msg) => { const e = q('.pk-login-err'); e.textContent = msg || ''; e.hidden = !msg; },
    setBusy: (busy, label) => {
      const b = q('.pk-login-btn'); b.disabled = !!busy; b.classList.toggle('is-busy', !!busy);
      if (label != null) b.textContent = label;
    },
  };
}

/* --------------------------------------------------------------------------
 * Friendly page names (dashboard link text). Project-configurable.
 * ------------------------------------------------------------------------ */
export const PAGE_NAMES = {
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
export function pageName(path) {
  const p = (path || '/').replace(/\/+$/, '') || '/';
  if (PAGE_NAMES[p]) return PAGE_NAMES[p];
  const seg = p.split('/').filter(Boolean).pop() || 'home';
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
