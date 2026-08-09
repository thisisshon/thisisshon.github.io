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
 * ROUTE BASE — every Proofkit dashboard URL lives under this ONE prefix.
 *
 *   /proofkit                      the Builder board (queue)
 *   /proofkit/tickets/<number>     a ticket, by its human ticket number
 *   /proofkit/notifications | /threads | /patterns | /insights | /settings
 *   /proofkit/team/…               the same tree for a reviewer team's board
 *
 * Two reasons it is a constant and not a literal sprinkled through the code:
 *   1. REMOVAL — the host deletes `src/pages/proofkit/` and every Proofkit URL
 *      goes with it. One folder, no scattered route files to hunt down.
 *   2. PORTABILITY — a host that wants the tool at /review or /qa changes this
 *      line and the route folder name, and nothing else.
 *
 * The on-page overlay is deliberately NOT under here: it has to run on the page
 * being reviewed (`/equity?review=1`), so its addressing belongs to the host page.
 * ------------------------------------------------------------------------ */
/* WHERE THE DASHBOARDS ARE SERVED.
 *
 * BASE is a PATH, and that is fine for the dashboards themselves — they link to each other
 * relatively and work on whatever host serves them. It is NOT fine for the overlay, which runs on
 * SOMEBODY ELSE'S page: `location.href = '/proofkit/product'` there navigates to
 * theirdomain.com/proofkit/product, which is a 404 on a site that has never heard of Proofkit.
 * That is why "Go To Dashboard" failed from a review and worked from everywhere else.
 *
 * SITE_ORIGIN names the host the boards actually live on, so a link can be made absolute when it
 * has to cross an origin. Moving to a custom domain is a one-line change HERE — but the domain has
 * to resolve and GitHub Pages has to be told about it (a CNAME file in the Pages repo plus the DNS
 * records) BEFORE this changes, or every link in the tool breaks at once.
 */
export const SITE_ORIGIN = 'https://thisisshon.github.io';
export const BASE = '/proofkit';
/** BASE as an absolute URL when the caller is on another origin; the plain path when it is not. */
export const siteUrl = (path) => {
  const p = String(path || '');
  try { if (location.origin === SITE_ORIGIN) return p; } catch (e) {}
  return SITE_ORIGIN + p;
};

/* The FIRST segment after /proofkit is always WHOSE board it is — the login identity:
 *
 *   /proofkit/builder/…      the Builder (admin) board
 *   /proofkit/product/…      the Product team's board
 *   /proofkit/content/…      the Content team's board   … and so on, one per team
 *
 * Putting the identity in the path (rather than a `?team=` query) is what lets the SERVER pick
 * the right board component, and it makes "whose board am I looking at" readable in the URL.
 * It is a LABEL, not a permission: the Worker still masks every team-scoped read server-side,
 * so editing the slug can never reveal another team's data — the boards additionally refuse to
 * render someone else's slug, so a hand-edited URL snaps back instead of showing an empty board.
 *
 * Slug = the team name lowercased. Kept as functions so a team with a space or an ampersand
 * still produces one clean segment. */
export const teamSlug = (t) => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Slug → the canonical team name (or '' when it matches no known login). */
export function teamFromSlug(slug) {
  const s = teamSlug(slug);
  return [ADMIN_TEAM].concat(TEAMS).find((t) => teamSlug(t) === s) || '';
}
/** The board root for a login identity: /proofkit/<slug>. */
export const boardBase = (team) => BASE + '/' + teamSlug(team || ADMIN_TEAM);

/**
 * HOME — the board the signed-in user belongs to. The single answer to "where does Go To Dashboard
 * go", shared by the overlay dock, the review HUD and anything else that asks.
 *
 * It lived in three places and all three were wrong in different ways. The HUD sent teams to
 * TEAM_BASE (`/proofkit/team`), a pre-3.98 route that no longer exists in the build — a plain 404
 * — and sent the Builder to BASE (`/proofkit`), the index rather than their board. The dock read
 * the team from the SESSION, which in extension and overlay mode is routinely empty because the
 * credential there is an account, so an authenticated Builder fell through to the login gate.
 *
 * The ACCOUNT is the source of truth: it carries the role and the team, and it is the same object
 * bridge.js seeds onto the dashboard origin, so the board they land on is one they are entitled to
 * AND already signed in to.
 *
 *   builder  -> /proofkit/builder   admin: every project, every team
 *   everyone -> /proofkit/<team>    their own team's board
 *
 * The login gate is the fallback for a genuinely unknown user, not the common outcome.
 */
export function homeUrl() {
  const acct = getAccount();
  if (acct && acct.role === 'builder') return siteUrl(boardBase(ADMIN_TEAM));
  const team = (acct && acct.team) || getSession().team;
  return siteUrl(team ? boardBase(team) : BASE + '/login/');
}

/** @deprecated pre-3.98 single team route; kept so old links still resolve. */
export const TEAM_BASE = BASE + '/team';

/* View ⇄ path segment. The queue is the root (no segment) because it is the
 * board's home; every other view is one clean level down. Kept as data so the
 * dashboards, the redirects and the docs cannot drift from each other. */
export const VIEW_SEGMENTS = {
  dash: '',
  // 7.4 — the Builder board's ROOT is the tiled Home, so its queue needs a segment of its own.
  // Team boards never render 'queue' and keep their queue at the root, so this is Builder-only.
  queue: 'queue',
  notifs: 'notifications',
  threads: 'threads',
  patterns: 'patterns',
  insights: 'insights',
  /* 12.0 — its own module rather than a Settings section: projects, teams and people are what a
   * Builder manages daily, and a settings tab is for what you configure once. The view key stays
   * `org` (it owns the whole hierarchy, not just the top level) while the URL says `projects`,
   * which is what the screen actually shows you. */
  org: 'projects',
  settings: 'settings',
};
/** segment → view (the inverse of VIEW_SEGMENTS, built once). */
export const SEGMENT_VIEWS = Object.keys(VIEW_SEGMENTS)
  .reduce((m, v) => { m[VIEW_SEGMENTS[v]] = v; return m; }, {});

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
 * plaintext, so the password never ships. With the Worker deployed this is
 * unused (the Worker enforces ADMIN_PASS); it only gates demo/LOCAL mode.
 *
 * ROTATED for this instance (5.0) — the previous value was inherited from the
 * dev deployment and is deliberately not carried over. A BLANK value means
 * "no gate at all", so replace rather than empty it if you rely on this path.
 * ------------------------------------------------------------------------ */
export const REVIEW_PASSWORD_SHA256 =
  'b8dab8a0987fac0dbf072491bef9bbf13d09c12f0bc1db0b39d601f15e69e13d';   // = SHA-256("5315")

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
 * ONE login, adopted per tab. Every Proofkit surface — the on-page overlay,
 * /reviewdash, /teamdash — shares this single session: the { team, key } chosen at
 * the one login. The live session is per-tab (sessionStorage), but it is ALSO
 * mirrored into localStorage so a link opened in a NEW tab (which starts with an
 * empty sessionStorage — the browser will not copy it across `rel="noopener"`
 * links) can ADOPT it and skip a second login. Whoever logs in anywhere is
 * authenticated everywhere; the team decides the role (ADMIN_TEAM ⇒ admin panel,
 * else the team dashboard).
 * ------------------------------------------------------------------------ */
export function getSession() {
  try {
    let team = sessionStorage.getItem('pkTeam') || '';
    let key = sessionStorage.getItem('pkKey') || '';
    if (!key) {
      // Fresh tab (e.g. opened from a dashboard hyperlink): adopt the shared login
      // from a sibling tab so the user is not asked to sign in again.
      const lTeam = localStorage.getItem('pkTeam') || '';
      const lKey = localStorage.getItem('pkKey') || '';
      if (lKey) { team = lTeam; key = lKey; try { sessionStorage.setItem('pkTeam', team); sessionStorage.setItem('pkKey', key); } catch {} }
    }
    return { team, key };
  } catch { return { team: '', key: '' }; }
}
/* --------------------------------------------------------------------------
 * 6.0 — account sessions (email + PIN).
 *
 * Two storage tiers, which is what produces the "signed in like a Google account, but PIN per
 * tab" behaviour:
 *
 *   localStorage    the IDENTITY (email, name, team, role). Shared across every tab and window
 *                   on this origin, and in the extension across every domain. Survives restarts.
 *   sessionStorage  the TOKEN. Per-tab by definition, so a new tab has none and must re-enter the
 *                   PIN — while never re-asking who you are.
 *
 * The token is what authorises requests; the PIN is exchanged for it once and never stored.
 * ------------------------------------------------------------------------ */
const ACCT_ID = 'pkAccount';      // localStorage — identity, shared
const ACCT_TOK = 'pkAuthToken';   // sessionStorage — token, per tab

/** The signed-in person, or null. Identity only — never a credential. */
export function getAccount() {
  try { return JSON.parse(localStorage.getItem(ACCT_ID) || 'null'); } catch (e) { return null; }
}
/** This tab's bearer token, or '' when the tab is locked and needs a PIN. */
export function getAuthToken() {
  try { return sessionStorage.getItem(ACCT_TOK) || ''; } catch (e) { return ''; }
}
/** Remember who is signed in (durable) and unlock THIS tab (per-tab). */
export function setAccountSession(user, token) {
  try { localStorage.setItem(ACCT_ID, JSON.stringify(user || null)); } catch (e) {}
  try { sessionStorage.setItem(ACCT_TOK, token || ''); } catch (e) {}
  /* An account session IS a session, and the boards read `getSession()` to decide what they are
   * looking at. Signing in with an access key set the account and the token but never pkTeam /
   * pkKey, so getSession() came back empty and every gate keyed on it failed in a different way:
   *
   *   - OVERRIDE on a team board requires getSession().team === ADMIN_TEAM to let a Builder in.
   *     With no team it stayed '', so a Builder opening /proofkit/product was treated as an admin
   *     who had landed with no slug and was bounced straight back to the Builder board.
   *   - init() gates on `s.key`, so with no key the board showed its sign-in panel — to somebody
   *     who had just signed in.
   *
   * That is one omission producing "it asks me to log in, then sends me to the wrong board". The
   * key is the sentinel rather than a real credential: nothing authorises with it, authHeaders()
   * carries the bearer token. It marks the session as account-backed. */
  const team = user && user.role === 'builder' ? ADMIN_TEAM : ((user && user.team) || '');
  if (team) setSession(team, ACCOUNT_KEY_SENTINEL);
}
/** Lock this tab but keep the identity, so the next prompt asks only for the PIN. */
export function lockTab() {
  try { sessionStorage.removeItem(ACCT_TOK); } catch (e) {}
}
/** Full sign-out: forget the person everywhere on this origin. */
export function clearAccount() {
  try { localStorage.removeItem(ACCT_ID); } catch (e) {}
  try { sessionStorage.removeItem(ACCT_TOK); } catch (e) {}
}

/** Exchange email + PIN for a token. Throws with the server's message on failure. */
export async function accountLogin(workerUrl, email, pin) {
  const res = await fetch((workerUrl || WORKER_URL).replace(/\/$/, '') + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'Could not sign in.');
    err.locked = !!body.locked;            // 423: lockout, not a wrong PIN
    err.retryAfter = body.retryAfter || 0;
    err.mustChange = false;
    throw err;
  }
  setAccountSession(body.user, body.token);
  return body;
}

/* --------------------------------------------------------------------------
 * 8.0 — passkeys (Touch ID on a Mac, Windows Hello, Android biometrics).
 *
 * A passkey replaces the PIN PROMPT, never the account: every one of these helpers degrades to
 * "no passkey here, use the PIN" rather than throwing, because a fingerprint reader that is
 * missing, busy, or refused must never be the reason someone cannot get into their own work.
 *
 * PLATFORM NOTE: WebAuthn is unavailable from `chrome-extension://` origins, so the extension
 * popup cannot prompt for Touch ID directly. It opens the hosted auth page instead, which runs on
 * a normal https origin where the platform authenticator is allowed.
 * ------------------------------------------------------------------------ */

const b64uToBuf = (s) => {
  const p = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bufToB64u = (buf) => {
  const b = new Uint8Array(buf); let str = '';
  for (let i = 0; i < b.length; i++) str += String.fromCharCode(b[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Does this browser have a built-in biometric authenticator we can actually use? */
export async function hasPlatformAuthenticator() {
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) { return false; }
}

const authApi = async (workerUrl, path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch((workerUrl || WORKER_URL).replace(/\/$/, '') + path, {
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body || {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Request failed.');
  return out;
};

/** Enrol THIS device for the signed-in account. Requires a live session — a passkey is added to a
 *  proven account, it can never be used to claim one. */
export async function passkeyEnrol(workerUrl, label) {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in first.');
  const o = await authApi(workerUrl, '/auth/webauthn/register/options', {}, token);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: b64uToBuf(o.challenge),
      rp: o.rp,
      user: { id: b64uToBuf(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams,
      authenticatorSelection: o.authenticatorSelection,
      excludeCredentials: (o.excludeCredentials || []).map((c) => ({ type: 'public-key', id: b64uToBuf(c.id) })),
      timeout: o.timeout, attestation: o.attestation,
    },
  });
  if (!cred) throw new Error('No passkey was created.');
  return authApi(workerUrl, '/auth/webauthn/register/verify', {
    challenge: o.challenge,
    clientDataJSON: bufToB64u(cred.response.clientDataJSON),
    attestationObject: bufToB64u(cred.response.attestationObject),
    label: label || 'This device',
  }, token);
}

/**
 * Sign in with a passkey. Returns the session on success, or `null` when this account simply has
 * no passkey — a plain "fall back to the PIN", not an error worth showing anyone.
 * A user who dismisses the biometric sheet also lands on null: cancelling is a choice, not a fault.
 */
export async function passkeyLogin(workerUrl, email) {
  if (!(await hasPlatformAuthenticator())) return null;
  let o;
  try { o = await authApi(workerUrl, '/auth/webauthn/login/options', { email }); }
  // Asking whether an account HAS a passkey is a probe, and a failed probe is not a failed login.
  // An older Worker without these routes, or a flaky network, must land the user on the PIN field
  // rather than on a red error about a credential they were never asked for.
  catch (e) { return null; }
  if (!o || !o.hasPasskey) return null;
  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: b64uToBuf(o.challenge), rpId: o.rpId,
        allowCredentials: (o.allowCredentials || []).map((c) => ({ type: 'public-key', id: b64uToBuf(c.id) })),
        userVerification: o.userVerification, timeout: o.timeout,
      },
    });
  } catch (e) { return null; }          // cancelled / timed out → the PIN field is still right there
  if (!assertion) return null;
  const body = await authApi(workerUrl, '/auth/webauthn/login/verify', {
    challenge: o.challenge,
    credentialId: bufToB64u(assertion.rawId),
    clientDataJSON: bufToB64u(assertion.response.clientDataJSON),
    authenticatorData: bufToB64u(assertion.response.authenticatorData),
    signature: bufToB64u(assertion.response.signature),
  });
  setAccountSession(body.user, body.token);
  return body;
}

/**
 * Sign in with NO identity typed at all. The credential is resident on the authenticator, so the
 * browser offers the account itself — click, touch, in. This is the panel-login path.
 *
 * Returns the session, or null when there is nothing to sign in with (no reader, no resident
 * credential, or the sheet was dismissed). Same contract as passkeyLogin: null means "use the
 * key field", never an error to show.
 */
export async function passkeyLoginDiscoverable(workerUrl) {
  if (!(await hasPlatformAuthenticator())) return null;
  let o;
  try { o = await authApi(workerUrl, '/auth/webauthn/login/options', { discoverable: true }); }
  catch (e) { return null; }
  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: b64uToBuf(o.challenge), rpId: o.rpId,
        allowCredentials: [],                       // empty ⇒ "offer whatever this device holds"
        userVerification: o.userVerification, timeout: o.timeout,
      },
    });
  } catch (e) { return null; }
  if (!assertion) return null;
  const body = await authApi(workerUrl, '/auth/webauthn/login/verify', {
    challenge: o.challenge,
    credentialId: bufToB64u(assertion.rawId),
    clientDataJSON: bufToB64u(assertion.response.clientDataJSON),
    authenticatorData: bufToB64u(assertion.response.authenticatorData),
    signature: bufToB64u(assertion.response.signature),
  });
  setAccountSession(body.user, body.token);
  return body;
}

/** Passkeys enrolled on the signed-in account. */
export const passkeyList = (workerUrl) => authApi(workerUrl, '/auth/webauthn/list', undefined, getAuthToken());
export const passkeyRemove = (workerUrl, id) => authApi(workerUrl, '/auth/webauthn/remove', { id }, getAuthToken());

/* A board opened by PASSKEY has no team key — there is no key to have. The boards gate on
 * `getSession().key` being truthy, so the session carries this sentinel instead: it satisfies
 * "someone is signed in" locally while never being mistaken for a credential. authHeaders()
 * refuses to transmit it, so it can never reach the Worker as a bogus X-Review-Pass. */
export const ACCOUNT_KEY_SENTINEL = 'pk-account-session';

/** Exchange an Access ID for a session. Throws with the server's message on failure. */
export async function accessLogin(workerUrl, accessId) {
  const res = await fetch((workerUrl || WORKER_URL).replace(/\/$/, '') + '/auth/access', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'That Access ID was not recognised.');
    err.locked = !!body.locked;
    err.retryAfter = body.retryAfter || 0;
    throw err;
  }
  setAccountSession(body.user, body.token);
  return body;
}

/** Change your own Access ID. Requires a live session. */
export async function accessChange(workerUrl, accessId) {
  const res = await fetch((workerUrl || WORKER_URL).replace(/\/$/, '') + '/auth/access/change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ accessId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not change it.');
  return body;
}

/** Headers for an authenticated call: bearer token when signed in, else the legacy team key. */
export function authHeaders() {
  const t = getAuthToken();
  if (t) return { Authorization: 'Bearer ' + t };
  const k = getSession().key;
  return (k && k !== ACCOUNT_KEY_SENTINEL) ? { 'X-Review-Pass': k } : {};
}

export function setSession(team, key) {
  try { sessionStorage.setItem('pkTeam', team); sessionStorage.setItem('pkKey', key); } catch {}
  try { localStorage.setItem('pkTeam', team); localStorage.setItem('pkKey', key); } catch {} // shared → adoptable by new tabs
}
export function clearSession() {
  try { sessionStorage.removeItem('pkTeam'); sessionStorage.removeItem('pkKey'); } catch {}
  try { localStorage.removeItem('pkTeam'); localStorage.removeItem('pkKey'); } catch {}
}

/* --------------------------------------------------------------------------
 * DEMO RESET (LOCAL/no-Worker mode only). The local domain now starts CLEAN so the
 * real review flow is testable from scratch — the old ~20-comment demo seed is
 * retired. Runs ONCE per browser (guarded by `pkDemoReset`): wipes any prior local
 * rows (old demo seed or otherwise) so an already-loaded tab clears too, then leaves
 * the store alone — comments you create afterwards persist. Never touches a Worker.
 * (To repopulate a demo dataset, restore this function from git history ≤ v2.16.0.)
 * ------------------------------------------------------------------------ */
export function ensureDemoReset() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem('pkDemoReset') === '1') return; // clear once, then never again
    Object.keys(localStorage).forEach((k) => {
      if (k.indexOf('rvc:') === 0 || k === 'rvc-notifications' || k === 'pkDemoSeeded') localStorage.removeItem(k);
    });
    localStorage.setItem('pkDemoReset', '1');
  } catch {}
}

/* --------------------------------------------------------------------------
 * Ticket numbers. Every raised comment gets a human-facing ticket = YYMMDD (the
 * comment's own date) + a 4-digit per-day serial (0001–9999). e.g. a comment on
 * 2026-07-14 → 2607140001. The Worker owns the real counter (KV `ticketseq:<YYMMDD>`);
 * these helpers are for the no-Worker LOCAL demo and for FORMATTING on display.
 * ------------------------------------------------------------------------ */

/** Format a ticket string from an ISO timestamp + an integer serial. */
export function formatTicket(iso, serial) {
  const ymd = String(iso || '').slice(2, 10).replace(/-/g, '');      // "2026-07-14" -> "260714"
  const n = ((Math.max(1, serial | 0) - 1) % 9999) + 1;              // keep it in 1..9999
  return ymd + String(n).padStart(4, '0');
}

/** LOCAL-demo per-day serial: a localStorage counter mirroring the Worker's KV one. */
export function nextLocalTicket(iso) {
  const ymd = String(iso || '').slice(2, 10).replace(/-/g, '');
  const k = 'rvc-ticketseq:' + ymd;
  let seq = 1;
  try { seq = (parseInt(localStorage.getItem(k) || '0', 10) || 0) + 1; localStorage.setItem(k, String(seq)); } catch {}
  return formatTicket(iso, seq);
}

/* --------------------------------------------------------------------------
 * Teams + chip colours.
 * ------------------------------------------------------------------------ */
/* --------------------------------------------------------------------------
 * Host project branding. Proofkit ships unbranded: these default to '' and every
 * surface that renders them omits the element entirely when they are empty.
 *
 * Set them to label the boards with whose site is under review — useful when one
 * person reviews several properties. Deliberately NOT the tool's own name, which
 * is always "Proofkit".
 * ------------------------------------------------------------------------ */
/** Full host-project name, shown in the dashboard lead line. '' = omit. */
export const PROJECT_NAME = '';
/** Short form, shown as the sidebar/HUD tag. '' = omit. */
export const PROJECT_SHORT = '';

export const TEAMS = ['Product', 'SEO', 'Marketing', 'Content', 'Design', 'Business'];

/**
 * Login-only identity that maps to ADMIN; deliberately NOT in TEAMS.
 * 'Builder' is the admin who has access to EVERYTHING AND the default target team
 * a reviewer directs on-site changes to (see `toTeam`). Design is now an ordinary
 * team (it no longer maps to admin).
 */
export const ADMIN_TEAM = 'Builder';

/* --------------------------------------------------------------------------
 * TEAM ENABLEMENT — the ONE switch that gates which teams may use Proofkit.
 * Phase 1 ships with ONLY Content live; every other team is parked OFF (kept in
 * the codebase, NOT deleted). Re-enabling a team later is a SINGLE flag flip
 * here — flip its `false` to `true` and it lights up everywhere at once (login
 * dropdown, the sign-in guard, its dashboard route), no other edit needed. This
 * is the single source of truth every gate derives from — never hardcode a team
 * name to gate it elsewhere. Builder/ADMIN_TEAM is the admin identity and is
 * ALWAYS enabled (it is deliberately not listed here).
 * ------------------------------------------------------------------------ */
export const TEAM_ENABLED = {
  Content: true,
  Product: true,
  SEO: true,
  Marketing: true,
  Design: true,
  Business: false,
};

/** True when team `t` may use Proofkit. Builder (ADMIN_TEAM) is always enabled;
 *  an unknown/blank identity is treated as enabled (nothing to gate). */
export function isTeamEnabled(t) {
  if (t === ADMIN_TEAM) return true;
  return t in TEAM_ENABLED ? TEAM_ENABLED[t] : true;
}

/** The enabled subset of TEAMS (derived — never hand-maintain a second list). */
export const ENABLED_TEAMS = TEAMS.filter(isTeamEnabled);

/** Per-team chip colours as [background, text]. Keys must match TEAMS (+ ADMIN_TEAM,
 *  which is a directable target and so needs a chip too). */
export const TEAM_COLORS = {
  Product: ['#e7f0fb', '#1b5fa8'],
  SEO: ['#e7f7ee', '#1d7a46'],
  Marketing: ['#fdeee6', '#b5541f'],
  Content: ['#f1eafb', '#6b3fa0'],
  Design: ['#e4f5f3', '#0f6d64'],
  Business: ['#fce8ee', '#a12a4f'],
  Builder: ['#fbeeda', '#8a5a12'], // admin + default directed-to target (site changes)
};

/* --------------------------------------------------------------------------
 * LIVE TEAM LIST (A.5) — the D1 `teams` table is the source of truth.
 *
 * The lists above are the STATIC FALLBACK: what a local-demo, an offline tab, or a
 * pre-fetch first paint sees. `syncTeams()` fetches GET /teams/public (no auth) and
 * updates TEAMS / ENABLED_TEAMS / TEAM_ENABLED / TEAM_COLORS **in place**, so every
 * consumer picks the change up without re-importing — they all read these at RENDER
 * time, never at import time. That is why the arrays are mutated rather than
 * reassigned: `export const` freezes the binding, not the contents.
 *
 * A team added in Settings → Teams therefore appears in every login dropdown, team
 * filter and chip, and gets a stable colour, with no code edit.
 * ------------------------------------------------------------------------ */
const TEAMS_KEY = 'pkTeamsCache';

/** Chip colours handed to teams that have none defined — stable per name, not random. */
const FALLBACK_TEAM_COLORS = [
  ['#e7f0fb', '#1b5fa8'], ['#e7f7ee', '#1d7a46'], ['#fdeee6', '#b5541f'],
  ['#f1eafb', '#6b3fa0'], ['#e4f5f3', '#0f6d64'], ['#fce8ee', '#a12a4f'],
  ['#eef1f5', '#41546b'], ['#f6f0e4', '#7a5c1e'],
];
function assignTeamColor(name) {
  if (TEAM_COLORS[name]) return;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  TEAM_COLORS[name] = FALLBACK_TEAM_COLORS[h % FALLBACK_TEAM_COLORS.length];
}

/** Apply a `[{name, enabled}]` list to the shared lists, in place. */
function applyTeams(list) {
  if (!Array.isArray(list) || !list.length) return false;
  const names = list.map((t) => t && t.name).filter(Boolean);
  if (!names.length) return false;
  TEAMS.splice(0, TEAMS.length, ...names);                 // same array reference — consumers see it
  for (const t of list) {
    if (!t || !t.name) continue;
    TEAM_ENABLED[t.name] = t.enabled !== false;
    assignTeamColor(t.name);
  }
  ENABLED_TEAMS.splice(0, ENABLED_TEAMS.length, ...TEAMS.filter(isTeamEnabled));
  return true;
}

/** Paint the last known list synchronously (no flash) before the network answers. */
export function primeTeams() {
  try { applyTeams(JSON.parse(localStorage.getItem(TEAMS_KEY) || 'null')); } catch (e) {}
}

/** Pull the live list from the worker. Falls back silently to the static/cached list —
 *  a team list that fails to load must never block sign-in. */
export async function syncTeams() {
  if (!WORKER_URL) return TEAMS;                            // local-demo keeps the static list
  try {
    const res = await fetch(WORKER_URL + '/teams/public');
    if (!res.ok) return TEAMS;
    const list = await res.json();
    if (applyTeams(list)) {
      try { localStorage.setItem(TEAMS_KEY, JSON.stringify(list)); } catch (e) {}
      if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('pk:teamschange', { detail: { teams: [...TEAMS] } }));
    }
  } catch (e) { /* offline / blocked — static list stands */ }
  return TEAMS;
}

// Self-initialise: paint the cached list synchronously, then refresh from the worker once.
// config.js only loads when review mode is armed or a dashboard opens (the overlay is a
// conditional dynamic import), so this costs a dormant host page nothing — the invariant holds.
// Every surface benefits without a call-site edit, including the overlay, which does not
// call initTheme().
if (typeof window !== 'undefined') { primeTeams(); syncTeams(); }

/** Host-page elements to hide while review mode is armed. `[]` if nothing. */
export const HIDE_SELECTORS = ['.to-top'];

/* --------------------------------------------------------------------------
 * COMMENT VOCABULARY — moved to ./vocab.js (the ONE framework-neutral source now
 * shared by BOTH the frontend AND the Cloudflare Worker, so a type/field/reason/
 * summary change is a single edit that can never drift across the client↔server
 * boundary). Re-exported here so every existing `import { … } from './config.js?v=affd2ffcbc'`
 * (overlay composer, both dashboards, demo store) keeps working unchanged.
 * `STATUS_COLORS` below stays here — it is theming (--pk-* tokens), not vocabulary.
 * ------------------------------------------------------------------------ */
export {
  COMMENT_TYPES, TYPE_FIELDS, EXPECTED_OUTCOME_TYPES, needsExpectedOutcome,
  SCREENSHOT_TYPES, needsScreenshot,
  REOPEN_REASONS, reopenReasonLabel, renderSummary,
} from './vocab.js?v=affd2ffcbc';

/** teamStatus → the `--pk-*` token that colours pins/badges (Feature 5). The value
 *  is the token NAME (no `var()`) so both `var(<name>)` and `getPropertyValue` work. */
export const STATUS_COLORS = {
  to_be_initiated: '--pk-amber',
  in_progress: '--pk-blue',
  deployed_live: '--pk-green',
  reopened: '--pk-softred',
  disregarded: '--pk-muted',
  needs_clarification: '--pk-clarify',
};

/* renderSummary now lives in ./vocab.js (re-exported above) — the SAME renderer the
 * Worker runs server-side, so client + demo store + server produce identical text. */

/* --------------------------------------------------------------------------
 * THEMING — --pk-* token skins + a per-user light/dark toggle.
 *
 * Each skin is a block of `--pk-*` custom properties. They used to inject once
 * under `:root{}` (baked, single skin). Now `themeCss()` emits every skin keyed
 * by `[data-pk-theme="…"]`, plus a `:root{}` default so first paint (before JS)
 * is already themed. Swapping the attribute on <html> re-skins live, and the
 * choice persists in localStorage — that is the whole light-mode toggle.
 * ------------------------------------------------------------------------ */
/* The full colour system (all three skins, keyed by [data-pk-theme]) now lives in
 * design/tokens.css — the SINGLE source of truth. The dashboards + product page link
 * it; the ONE consumer that can't link a stylesheet — the on-page overlay — imports it
 * directly as a string (`tokens.css?inline` in overlay.js) and injects the full skin
 * set, so real visitors download nothing. There is no JS mirror to keep in sync. */
export const DEFAULT_THEME = 'red-moon'; // dark default
export const LIGHT_THEME = 'light';      // what the toggle flips to
export const THEME_KEY = 'pkTheme';      // base key: this browser's last-used mode (pre-login paint)

/* The theme is a PERSONAL PREFERENCE, not a global setting. Every team controls its own
 * colour mode — the admin included — and a flip changes nobody else's screen. The choice
 * is stored PER TEAM in localStorage (`pkTheme:<Team>`), so it survives log out / log back
 * in, and one browser shared by two teams keeps a mode for each. Nothing is posted to the
 * Worker: the KV `settings.theme` key and its SSE `theme` event are the retired global
 * theme (3.88.0) and no client reads or writes them any more. The overlay-UI flag next
 * door is still genuinely global — that one is the admin's to set for everyone. */

/** The localStorage key holding a team's preference (the base key before sign-in). */
export function themeKey(team) {
  const t = team == null ? getSession().team : team;
  return t ? THEME_KEY + ':' + t : THEME_KEY;
}

/** True when a `storage` event key carries a change this user should follow. */
export function isThemeKey(k) { return k == null || k === THEME_KEY || k === themeKey(); }

/** This team's remembered skin — falls back to the browser's last mode, then dark. */
export function getTheme() {
  try { return localStorage.getItem(themeKey()) || localStorage.getItem(THEME_KEY) || DEFAULT_THEME; }
  catch { return DEFAULT_THEME; }
}

/** Save a skin as this team's preference (+ the browser's last mode, which paints the
 *  sign-in screen and seeds a team that has never chosen) WITHOUT re-skinning anything. */
function cacheTheme(name) {
  try { localStorage.setItem(themeKey(), name); localStorage.setItem(THEME_KEY, name); } catch {}
}

/** Apply a skin here: set the attribute, save the preference, notify toggles. */
export function applyTheme(name) {
  document.documentElement.setAttribute('data-pk-theme', name);
  cacheTheme(name);
  document.dispatchEvent(new CustomEvent('pk:themechange', { detail: { theme: name } }));
}

/** The toggle: flip this user's colour mode between light and the dark default. Personal
 *  — it is saved to their preference and never leaves this browser. */
export function toggleTheme() {
  applyTheme(getTheme() === LIGHT_THEME ? DEFAULT_THEME : LIGHT_THEME);
}

/** Paint the remembered preference (instant, no flash) and keep this surface in step with
 *  the SAME user's other tabs — flipping in the dashboard re-skins an open review HUD, and
 *  vice versa. Used by every Proofkit surface; the review HUD does its own mount-scoped
 *  version so the marketing page is left untouched (see overlay-hud.js). */
export function initTheme() {
  document.documentElement.setAttribute('data-pk-theme', getTheme());
  window.addEventListener('storage', (e) => {
    if (isThemeKey(e.key)) document.documentElement.setAttribute('data-pk-theme', getTheme());
  });
  return getTheme();
}

/* --------------------------------------------------------------------------
 * OVERLAY UI flag (New HUD vs Old rectangle composer). TWO layers:
 *
 *   1. the SHARED DEFAULT — admin POSTs it, everyone GETs it, an SSE `overlayUi`
 *      event hard-refreshes every client so the choice reflects for all. Cached
 *      in localStorage (OVERLAY_KEY) for a synchronous read at overlay arm-time.
 *   2. a PER-BROWSER OVERRIDE (OVERLAY_ME_KEY) — a reviewer picking the overlay
 *      THEY work in, the same way theme is theirs alone. Empty = follow the
 *      shared default, which is the state every client starts in. It wins over
 *      the default locally and never touches the worker (POST /settings stays
 *      admin-only), so one team switching does not move anyone else.
 *
 * getOverlayUi() is the EFFECTIVE value every consumer wants (overlay.js at
 * arm-time); getGlobalOverlayUi() is the shared default, for Builder's control.
 * ------------------------------------------------------------------------ */
const OVERLAY_KEY = 'pkOverlayUi';
const OVERLAY_ME_KEY = 'pkOverlayUiMe';

/** The shared default from the local cache ('new' | 'old'; defaults 'old'). */
export function getGlobalOverlayUi() {
  try { return localStorage.getItem(OVERLAY_KEY) === 'new' ? 'new' : 'old'; }
  catch { return 'old'; }
}

/** This browser's own pick, or '' when it follows the shared default. */
export function getOverlayUiOverride() {
  try { const v = localStorage.getItem(OVERLAY_ME_KEY); return v === 'new' || v === 'old' ? v : ''; }
  catch { return ''; }
}

/** Set (or, with '', clear) this browser's own pick. Local only — no worker call. */
export function setOverlayUiOverride(v) {
  const val = v === 'new' || v === 'old' ? v : '';
  try { if (val) localStorage.setItem(OVERLAY_ME_KEY, val); else localStorage.removeItem(OVERLAY_ME_KEY); } catch {}
  return val;
}

/** The overlay this browser actually gets: its own pick, else the shared default. */
export function getOverlayUi() { return getOverlayUiOverride() || getGlobalOverlayUi(); }

function cacheOverlayUi(v) { try { localStorage.setItem(OVERLAY_KEY, v === 'new' ? 'new' : 'old'); } catch {} }

/** Admin action: set the GLOBAL overlay UI for everyone (POST /settings), cache locally. */
export async function setGlobalOverlayUi(v) {
  const val = v === 'new' ? 'new' : 'old';
  cacheOverlayUi(val);
  if (!WORKER_URL) return val;
  try {
    const pass = getSession().key || ''; // admin key = the shared session key (team === Builder)
    await fetch(WORKER_URL + '/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Review-Pass': pass },
      body: JSON.stringify({ overlayUi: val }),
    });
  } catch {}
  return val;
}

/** Pull the shared default from the Worker and cache it. Returns the EFFECTIVE
 *  value, so a browser with its own pick keeps that pick across a sync. */
export async function syncOverlayUi() {
  if (!WORKER_URL) return getOverlayUi();
  try {
    const r = await fetch(WORKER_URL + '/settings', { headers: { 'Content-Type': 'application/json' } });
    if (r.ok) { const j = await r.json(); cacheOverlayUi(j && j.overlayUi === 'new' ? 'new' : 'old'); }
  } catch {}
  return getOverlayUi();
}

/* Live push for the shared default. Used by overlay.js on the marketing page and by the
 * dashboards. Reloads on a divergent event — but a browser running its OWN pick is not
 * affected by the default moving, so it caches the new default and stays put. */
let overlayES = null;
export function startOverlayUiStream() {
  if (!WORKER_URL || typeof EventSource === 'undefined' || overlayES) return;
  try {
    overlayES = new EventSource(WORKER_URL + '/events');
    overlayES.addEventListener('overlayUi', (e) => {
      try {
        const v = JSON.parse(e.data).overlayUi === 'new' ? 'new' : 'old';
        if (v === getGlobalOverlayUi()) return;
        const was = getOverlayUi();
        cacheOverlayUi(v);
        if (getOverlayUi() !== was) location.reload();
      } catch {}
    });
  } catch { overlayES = null; }
}

/* --------------------------------------------------------------------------
 * SCOPED live updates for the dashboards (Phase 3.2, client half).
 *
 * The worker fans out `change` events per scope through the ReviewHub Durable
 * Object: `GET /events?scope=admin|team:<name>&pass=<key>` → `event: change`,
 * `data: {"scope"}`. The key rides the QUERY STRING because EventSource cannot
 * set headers; the worker accepts `?pass=` on this ONE path for that reason.
 *
 * SSE is an OPTIMISATION, never the only path to fresh data. The caller keeps
 * its poll and simply slows it to a safety net while `onUp` holds — so a hub
 * that goes quiet without dropping the socket still cannot strand a board.
 *
 * Failure handling follows the EventSource spec rather than a strike count:
 *   - readyState CLOSED  → the server refused us (401/403, a 501 when
 *     REVIEW_HUB is unbound, or a non-SSE content-type). Fatal: the browser
 *     will NOT retry, so neither do we — `onDown(true)` and stay on the poll.
 *   - readyState CONNECTING → an ordinary drop; the browser reconnects on its
 *     own `retry:` interval. `onDown(false)` restores the poll meanwhile, and
 *     the next `onopen` slows it again.
 *
 * Returns a stop() to call on logout/teardown, or null when SSE is impossible
 * (local-demo, no EventSource, no key) — a null return means "stay on poll".
 * ------------------------------------------------------------------------ */
export function startScopeStream(scope, handlers) {
  const h = handlers || {};
  const key = getSession().key || '';
  if (!WORKER_URL || typeof EventSource === 'undefined' || !scope || !key) return null;
  let es = null, stopped = false;
  try {
    es = new EventSource(
      WORKER_URL + '/events?scope=' + encodeURIComponent(scope) + '&pass=' + encodeURIComponent(key)
    );
  } catch { return null; }
  es.addEventListener('open', () => { if (!stopped && h.onUp) h.onUp(); });
  es.addEventListener('change', (e) => {
    if (stopped || !h.onChange) return;
    let data = null;
    try { data = JSON.parse(e.data); } catch {}
    h.onChange(data && data.scope ? data.scope : scope);
  });
  es.addEventListener('error', () => {
    if (stopped) return;
    const fatal = es.readyState === EventSource.CLOSED;
    if (fatal) { try { es.close(); } catch {} }
    if (h.onDown) h.onDown(fatal);
  });
  return function stop() {
    if (stopped) return;
    stopped = true;
    try { es.close(); } catch {}
  };
}

/* --------------------------------------------------------------------------
 * The light/dark toggle control. Its STYLES live in design/components.css
 * (`.pk-tt`); this only builds the wired DOM node, keeps it in sync with the
 * persisted theme, and flips THIS user's colour mode on click. Every dashboard
 * mounts one — admin and team alike — into a [data-pk-toggle] slot.
 * ------------------------------------------------------------------------ */

/** Build one toggle control (a wired DOM node). aria-checked === light mode.
 *  `{ row:true }` returns the SAME control laid out as a full-width labelled row
 *  (`.pk-tt--row`) — the side-rail variant, which names the mode it is currently in
 *  so it reads as a control in a stack rather than a bare switch. */
export function buildThemeToggle(opts) {
  const row = !!(opts && opts.row);
  const btn = document.createElement('button');
  btn.className = row ? 'pk-tt pk-tt--row' : 'pk-tt';
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'Toggle light and dark theme');
  btn.innerHTML =
    (row ? '<span class="pk-tt-lbl"></span>' : '') +
    '<span class="pk-tt-track"><span class="pk-tt-thumb">' +
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>' +
    '</span></span>';
  const lbl = btn.querySelector('.pk-tt-lbl');
  const sync = () => {
    const light = getTheme() === LIGHT_THEME;
    btn.setAttribute('aria-checked', String(light));
    btn.title = light ? 'Light mode — switch to dark' : 'Dark mode — switch to light';
    if (lbl) lbl.textContent = light ? 'Light Mode' : 'Dark Mode';
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
  // `placement` moves the whole menu relative to the trigger. 'right-end' opens it to the RIGHT,
  // its bottom edge level with the trigger's — for a dropdown pinned to the foot of a narrow rail,
  // where a menu opening below would fall off-screen and one opening above would cover the nav.
  // Positioning belongs here rather than in the host's stylesheet: the host cannot reach inside the
  // component without also catching the trigger, which is what an earlier CSS-only attempt did.
  const placement = opts.placement === 'right-end' ? ' pk-dropdown--right-end' : '';
  wrap.className = 'pk-dropdown' + (opts.block ? ' pk-dropdown--block' : '') + (opts.small ? ' pk-dropdown--sm' : '') + placement;
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

  /* TYPE-AHEAD, as every native select has. Two behaviours in one, which is the convention people
   * already have in their fingers:
   *   - the SAME letter repeatedly cycles through the entries starting with it (b, b, b …)
   *   - DIFFERENT letters typed quickly build a prefix, so "ma" jumps straight to Marketing
   * A short idle gap resets the buffer, which is what separates "typing a word" from "pressing the
   * same key again". Without this a list long enough to need a scrollbar could only be searched by
   * eye, one arrow-press at a time. */
  let typeBuf = '';
  let typeAt = 0;
  const TYPE_RESET_MS = 900;
  function typeAhead(ch, list) {
    if (!list.length) return;
    const now = Date.now();
    const repeated = typeBuf.length === 1 && typeBuf === ch;
    typeBuf = (now - typeAt > TYPE_RESET_MS) ? ch : (repeated ? ch : typeBuf + ch);
    typeAt = now;
    const textOf = (el) => (el.textContent || '').trim().toLowerCase();
    const matches = list.filter((el) => textOf(el).startsWith(typeBuf));
    if (!matches.length) return;
    // Start from the item after the current one, so a repeated letter advances instead of
    // re-selecting whatever is already focused.
    const from = list.indexOf(document.activeElement);
    const next = matches.find((el) => list.indexOf(el) > from) || matches[0];
    next.focus();
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { close(); trigger.focus(); return; }
    // Disabled items are inert — never a keyboard-focus stop.
    const list = [].slice.call(menu.querySelectorAll('.pk-dropdown-item:not([aria-disabled="true"])'));
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0] && list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1] && list[list.length - 1].focus(); }
    // A single printable character, with no modifier — anything else belongs to the browser.
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && /\S/.test(e.key)) {
      e.preventDefault();
      typeAhead(e.key.toLowerCase(), list);
    }
  };
  function open() {
    isOpen = true; typeBuf = ''; typeAt = 0;   // a stale prefix must not swallow the first keystroke
    wrap.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); // CSS animates the menu in
    document.addEventListener('click', onDoc, true); document.addEventListener('keydown', onKey, true);
    const sel = menu.querySelector('[aria-selected="true"]') || menu.querySelector('.pk-dropdown-item:not([aria-disabled="true"])');
    if (sel) sel.focus();
  }
  function close() {
    isOpen = false; wrap.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); // CSS animates the menu out
    document.removeEventListener('click', onDoc, true); document.removeEventListener('keydown', onKey, true);
  }
  trigger.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? close() : open(); });

  // Item count, for menus that stagger the OTHER way (an upward-opening menu counts down from
  // the item nearest the trigger — see .pk-side .pk-dropdown-item in design/components.css).
  menu.style.setProperty('--n', items.length);
  items.forEach((it, idx) => {
    // A thin separator above this item (e.g. to fence Builder off from the teams).
    if (it.dividerBefore) { const sep = document.createElement('div'); sep.className = 'pk-dropdown-sep'; menu.appendChild(sep); }
    const v = valOf(it);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pk-dropdown-item'; b.setAttribute('role', 'option');
    b.dataset.value = v; b.style.setProperty('--i', idx); // stagger index for the open animation
    // Greyed, inert item (e.g. a team gated off via TEAM_ENABLED): visible but not
    // selectable — aria-disabled, out of the focus order, click is a no-op below.
    if (it.disabled) { b.setAttribute('aria-disabled', 'true'); b.tabIndex = -1; }
    if (it.icon) { const ico = document.createElement('span'); ico.className = 'pk-dropdown-ico'; ico.innerHTML = it.icon; b.appendChild(ico); }
    const txt = document.createElement('span'); txt.className = 'pk-dropdown-txt'; txt.textContent = it.label; b.appendChild(txt);
    if (!fixed && !it.disabled && v === value) b.setAttribute('aria-selected', 'true');
    b.addEventListener('click', () => {
      if (it.disabled) return; // inert — no value change, no onSelect
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
 * its own submit (admin vs team routing). ADMIN_TEAM ('Builder') is offered as a
 * login-only identity — picking it + the admin key grants ADMIN access.
 * ------------------------------------------------------------------------ */
export const PK_MARK =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 4V5Z" fill="var(--pk-red)"/>' +
  '<circle cx="12" cy="9.5" r="1.6" fill="#fff"/></svg>';

/** Build the shared login card. Returns { el, teamSel, keyInput, button, setError, setBusy }. */
/* ---------------------------------------------------------------------------
 * ACCESS KEY entry — the whole sign-in, in eight boxes.
 *
 * Two letters then six digits, one box each, the way an OTP field works. The segmented form is not
 * decoration: it tells you the shape of what you are typing before you type it, shows progress
 * without a counter, and makes a mistyped character one backspace to fix rather than a re-read of
 * an eight-character string.
 *
 * What it has to get right is the boring part — the things people actually do:
 *   - PASTE a whole code into any box (from chat, an email, a password manager)
 *   - BACKSPACE from an empty box and land in the previous one, not sit there doing nothing
 *   - arrow keys, and click-to-focus that selects rather than appends
 *   - type over a filled box without having to clear it first
 *   - never accept a digit where a letter goes, so an error is impossible rather than reported
 * ------------------------------------------------------------------------ */
export const ACCESS_ID_SHAPE = 'LLDDDDDD';        // L = letter, D = digit

export function buildAccessEntry(opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'pk-access';
  el.innerHTML =
    ACCESS_ID_SHAPE.split('').map((kind, i) =>
      /* type=password so the character is MASKED. The value is still read and validated exactly as
       * before — only the rendering changes — and the browser's own masking is used rather than a
       * CSS trick, because `-webkit-text-security` is not supported everywhere and a code that
       * shows in plain text on one browser is not "masked". autocomplete is off on every box: a
       * manager offering to fill one character of eight helps nobody. */
      `<input class="pk-access-box${kind === 'L' ? ' is-alpha' : ''}" type="password" ` +
      `inputmode="${kind === 'L' ? 'text' : 'numeric'}" ` +
      `maxlength="1" autocomplete="off" aria-label="Character ${i + 1} of 8" ` +
      `data-i="${i}" data-kind="${kind}">` +
      // A hairline between the letters and the digits, so the shape is legible at a glance.
      (i === 1 ? '<span class="pk-access-sep" aria-hidden="true"></span>' : '')).join('');

  const boxes = [...el.querySelectorAll('.pk-access-box')];
  const okFor = (kind, ch) => (kind === 'L' ? /[A-Za-z]/ : /[0-9]/).test(ch);
  const value = () => boxes.map((b) => b.value).join('').toUpperCase();
  const focusAt = (i) => { const b = boxes[Math.max(0, Math.min(boxes.length - 1, i))]; if (b) { b.focus(); b.select(); } };

  const changed = () => {
    const v = value();
    el.classList.toggle('is-complete', v.length === boxes.length);
    if (opts.onChange) opts.onChange(v);
    // Submitting on the last character is the whole point of the shape — there is nothing left to
    // decide once eight are in.
    if (v.length === boxes.length && opts.onComplete) opts.onComplete(v);
  };

  /** Spread a pasted or typed run across the boxes from `start`, skipping anything ill-fitting. */
  const fill = (start, text) => {
    const chars = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
    /* A COMPLETE code always fills from the beginning, wherever the cursor was. Starting at the
     * focused box looks reasonable and is wrong: paste a whole key while sitting in a digit box and
     * the two leading letters fit nowhere, so every character is skipped and the field stays empty.
     * Pasting a full code means "this is the code", not "insert here". */
    let i = chars.length >= boxes.length ? 0 : start;
    for (const ch of chars) {
      while (i < boxes.length && !okFor(boxes[i].dataset.kind, ch)) i++;
      if (i >= boxes.length) break;
      boxes[i].value = ch;
      i++;
    }
    focusAt(Math.min(i, boxes.length - 1));
    changed();
    return i;
  };

  boxes.forEach((box, i) => {
    box.addEventListener('focus', () => box.select());          // typing replaces, never appends
    box.addEventListener('input', (e) => {
      const raw = box.value;
      // A paste can land in `input` rather than the paste event on some browsers; treat anything
      // longer than one character as a run to spread.
      if (raw.length > 1) { box.value = ''; fill(i, raw); return; }
      if (!raw) { changed(); return; }
      if (!okFor(box.dataset.kind, raw)) {
        // Wrong KIND, not wrong value: a digit typed into a letter box is almost always someone
        // who started in the wrong place, so send it where it belongs instead of rejecting it.
        box.value = '';
        const target = boxes.findIndex((b, j) => j >= i && okFor(b.dataset.kind, raw));
        if (target > -1) fill(target, raw);
        return;
      }
      box.value = raw.toUpperCase();
      // Restart the nudge explicitly — retyping the same box otherwise animates nothing.
      box.classList.remove('is-filled'); void box.offsetWidth; box.classList.add('is-filled');
      if (i < boxes.length - 1) focusAt(i + 1);
      changed();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (box.value) { box.value = ''; changed(); return; }
        // Empty box: step back and clear THAT one, which is what the user meant.
        e.preventDefault();
        if (i > 0) { boxes[i - 1].value = ''; focusAt(i - 1); changed(); }
        return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(i + 1); }
      else if (e.key === 'Enter' && opts.onSubmit) opts.onSubmit(value());
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      fill(i, (e.clipboardData || window.clipboardData).getData('text'));
    });
  });

  return {
    el,
    getValue: value,
    focus: () => focusAt(0),
    clear: () => { boxes.forEach((b) => { b.value = ''; }); el.classList.remove('is-complete'); focusAt(0); },
    setBusy: (busy) => { boxes.forEach((b) => { b.disabled = !!busy; }); el.classList.toggle('is-busy', !!busy); },
    accept: () => el.classList.add('is-ok'),
    /* Back to untouched: empty, no verdict, not busy. `clear` deliberately leaves the styling
     * alone (a rejected code clears itself but stays visibly rejected); this is the stronger
     * one, for when the screen is being reused rather than corrected. */
    reset: () => {
      boxes.forEach((b) => { b.value = ''; b.disabled = false; });
      el.classList.remove('is-complete', 'is-ok', 'is-wrong', 'is-busy');
      focusAt(0);
    },
    shake: () => {
      // A wrong code should be felt before it is read. Restart the animation explicitly, or a
      // second wrong attempt in a row does nothing visible.
      el.classList.remove('is-wrong'); void el.offsetWidth; el.classList.add('is-wrong');
    },
  };
}

/* The sign-in screen. One question — the access key — and nothing else above the fold.
 *
 * Biometrics and email+password are real routes, but they are RECOVERY: the answer to "I have lost
 * my key", not a choice to make every time. Putting three options on screen turns a one-step login
 * into a decision, so they live behind a collapsed "Advanced" at the bottom, far enough down that
 * the eye never lands there on the way to the boxes.
 *
 * opts: { onSubmit(code), onBiometric?, onEmail?, title?, sub? }
 * Routes are only offered when the host passes a handler — an option that cannot work is worse
 * than no option, so the extension popup (where WebAuthn is impossible) simply omits it.
 */
/**
 * READY — the unlocked state. One control, because there is one thing to do.
 *
 * On the same card as the other two auth screens, and deliberately quieter than what it replaces:
 * that was a gradient-filled button that lifted on hover, threw a radial sweep from the click
 * point, and pulsed a ring forever once armed. Four animations on one control, none of them
 * carrying information the label did not already have. What survives is the part that IS
 * information: a dot that fills when review is on, and a single flat button that inverts to an
 * outline so armed and not-armed cannot be confused at a glance.
 *
 *   opts.name / opts.role   shown as the subtitle, same as the unlock screen
 *   opts.onToggle           (wantOn) => void
 */
export function buildReady(opts) {
  opts = opts || {};
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const el = document.createElement('div');
  el.className = 'pk-access-login';
  el.innerHTML =
    '<div class="pk-access-card">' +
      '<div class="pk-access-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
      '<h1 class="pk-access-title">' + esc(opts.title || 'Ready') + '</h1>' +
      '<p class="pk-access-sub"></p>' +
      '<button type="button" class="pk-unlock-go pk-ready-go" aria-pressed="false">' +
        '<span class="pk-ready-dot"></span><span class="pk-ready-label">Start Proofing</span>' +
      '</button>' +
      '<p class="pk-ready-hint">Greys the page so you can pin comments.</p>' +
    '</div>';

  const q = (sel) => el.querySelector(sel);
  const go = q('.pk-ready-go');
  const label = q('.pk-ready-label');
  const hint = q('.pk-ready-hint');

  const setOn = (on) => {
    go.setAttribute('aria-pressed', on ? 'true' : 'false');
    label.textContent = on ? 'Stop Proofing' : 'Start Proofing';
    hint.textContent = on
      ? 'Reviewing. ⌘/Ctrl-click an element to pin.'
      : 'Greys the page so you can pin comments.';
  };
  go.addEventListener('click', () => {
    const wantOn = go.getAttribute('aria-pressed') !== 'true';
    if (opts.onToggle) opts.onToggle(wantOn);
  });

  return {
    el,
    setWho: (name, role) => {
      q('.pk-access-sub').textContent = [name, role].filter(Boolean).join(' · ') || '';
    },
    setOn,
    isOn: () => go.getAttribute('aria-pressed') === 'true',
    setBusy: (busy) => { go.disabled = !!busy; },
  };
}

/**
 * HAND-OFF — the sign-in widget shown on a page we do not own.
 *
 * One button. It cannot ask for anything itself: a passkey is bound to the origin that created it,
 * so biometrics are impossible here, and asking for an access key on a third party's domain means
 * a second implementation of the entry, the throttling and the error states, drifting from the
 * real one from the day it ships. So it asks for nothing and sends them to /proofkit/login, which
 * is the one place a Proofkit sign-in happens.
 *
 *   opts.onLogin  () => void — open the login page
 */
export function buildLoginHandoff(opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'pk-access-login';
  el.innerHTML =
    '<div class="pk-access-card">' +
      '<div class="pk-access-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
      '<h1 class="pk-access-title">Sign In to Review</h1>' +
      '<p class="pk-access-sub">Opens the Proofkit login in a new tab. Come straight back — this page will be ready.</p>' +
      '<button type="button" class="pk-unlock-go pk-handoff-go">Login</button>' +
    '</div>';
  const go = el.querySelector('.pk-handoff-go');
  go.addEventListener('click', () => {
    go.disabled = true;
    go.textContent = 'Opening…';
    // Re-enable: they may close the login tab without signing in, and a permanently dead button
    // would leave them with no way back in.
    setTimeout(() => { go.disabled = false; go.textContent = 'Login'; }, 4000);
    if (opts.onLogin) opts.onLogin();
  });
  return { el, focus: () => go.focus(), setError: () => {} };
}

export function buildAccessLogin(opts) {
  opts = opts || {};
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const el = document.createElement('div');
  el.className = 'pk-access-login';
  el.innerHTML =
    '<div class="pk-access-card">' +
      '<div class="pk-access-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
      '<h1 class="pk-access-title">' + esc(opts.title || 'Access Key') + '</h1>' +
      '<p class="pk-access-sub">' + esc(opts.sub || 'Two letters, then six digits.') + '</p>' +
      '<div class="pk-access-slot"></div>' +
      '<div class="pk-access-err" hidden></div>' +
      '<div class="pk-access-adv">' +
        '<button type="button" class="pk-access-advtoggle" aria-expanded="false">Advanced</button>' +
        '<div class="pk-access-advpanel">' +
          '<div>' +
            (opts.onBiometric ? '<button type="button" class="pk-access-alt" data-alt="bio">Login Using Biometrics</button>' : '') +
            (opts.onEmail ? '<button type="button" class="pk-access-alt" data-alt="email">Log In Using Email and Password</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const q = (sel) => el.querySelector(sel);
  const err = q('.pk-access-err');
  const setError = (m) => { err.textContent = m || ''; err.hidden = !m; };

  /* The title doubles as an invisible shortcut to biometrics: no styling, no cursor change, no tab
   * stop — nothing about it looks or behaves like a control, which is the point. It is for the one
   * person who knows it is there. The discoverable route stays where it was, under Advanced, and
   * that is the one screen readers and the keyboard get; adding a second focusable element with the
   * same job would announce a heading as a button to everyone who did not ask for the shortcut. */
  if (opts.onBiometric) {
    q('.pk-access-title').addEventListener('click', () => opts.onBiometric());
  }

  const entry = buildAccessEntry({
    // Submit the moment the eighth character lands. There is nothing left to confirm, and asking
    // for a button press after that is a step that exists only to be clicked.
    onComplete: (code) => { setError(''); opts.onSubmit && opts.onSubmit(code); },
    onChange: () => setError(''),
  });
  q('.pk-access-slot').appendChild(entry.el);

  const toggle = q('.pk-access-advtoggle');
  const panel = q('.pk-access-advpanel');
  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  el.querySelectorAll('.pk-access-alt').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.alt === 'bio' && opts.onBiometric) opts.onBiometric();
    if (b.dataset.alt === 'email' && opts.onEmail) opts.onEmail();
  }));

  return {
    el,
    focus: () => entry.focus(),
    getValue: entry.getValue,
    setBusy: (busy) => entry.setBusy(busy),
    accept: () => entry.accept(),
    /* Play the screen out and resolve when it has gone, so the caller can navigate on the beat
     * rather than guessing a delay that drifts if the timing is ever changed. */
    dismiss: () => new Promise((res) => {
      el.classList.add('is-done');
      const done = () => { el.hidden = true; res(); };
      el.addEventListener('animationend', function once(e) {
        if (e.target !== el) return;                  // the CARD's animation ends first; wait for the scrim
        el.removeEventListener('animationend', once);
        done();
      });
      setTimeout(done, 700);                          // never strand the caller on a missed event
    }),
    // A rejected code clears itself: the next thing anyone does is retype it, and leaving eight
    // wrong characters in place means clearing them by hand first.
    reject: (message) => { entry.shake(); setError(message || ''); setTimeout(() => entry.clear(), 380); },
    /* Hand the screen back in its opening state. The popup reuses ONE instance across sign-in and
     * sign-out, so without this the row a signed-out user meets is the accepted one from their
     * last sign-in: green, full of dots, and refusing input. */
    reset: () => { entry.reset(); setError(''); },
    setError,
  };
}

export function buildPanelLogin(opts) {
  opts = opts || {};
  const title = opts.title || 'Panel Login';
  const sub = opts.sub || 'Enter your key to continue.';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div');
  el.className = 'pk-login';
  // Optional close (✕), top-right of the card. Only rendered when a host wires
  // opts.onClose — the on-page overlay is dismissible; the dashboards are not.
  const closeBtn = opts.onClose
    ? '<button type="button" class="pk-login-close" aria-label="Close">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button>'
    : '';
  el.innerHTML =
    /* Same order as every other auth screen: mark, title, subtitle, fields, one full-width
     * button. It used to open with a decorative glow and an eyebrow, put the title second and
     * the wordmark LAST, and right-align a pill button — five things none of the other screens
     * do. The glow is gone rather than restyled; "clean" is mostly a subtraction. */
    '<div class="pk-login-card" role="dialog" aria-modal="true">' +
      closeBtn +
      '<div class="pk-access-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
      '<h1 class="pk-login-title">' + esc(title) + '</h1>' +
      '<p class="pk-login-sub">' + esc(sub) + '</p>' +
      '<div class="pk-login-field">' +
        '<span class="pk-login-label">Team</span>' +
        '<div class="pk-login-team"></div>' +
      '</div>' +
      '<div class="pk-login-field">' +
        '<label class="pk-login-label" for="pk-login-key">Key</label>' +
        '<input id="pk-login-key" class="pk-login-input" type="password" placeholder="Key" autocomplete="off" spellcheck="false" />' +
      '</div>' +
      '<div class="pk-login-err" hidden></div>' +
      '<button type="button" class="pk-login-btn">Authenticate</button>' +
      // Touch ID. Rendered only when the host opts in (opts.onPasskey) AND revealed only once a
      // platform authenticator is confirmed present — see below. It is deliberately absent from
      // the in-page overlay on third-party sites: WebAuthn binds a credential to the origin that
      // created it, so a passkey for the dashboards simply cannot be used on someone else's
      // domain, and offering it there would be a button that can only ever fail.
      // REMOTE auth: used where WebAuthn cannot run at all — the in-page overlay on a third-party
      // site. It does not authenticate here; it hands off to the extension, which opens the auth
      // page on our own origin (the only place the passkey is valid), then closes that tab and
      // returns the user to this one. Shown unconditionally: the capability belongs to the
      // extension, not to this page, so there is nothing local to feature-detect.
      (opts.onRemoteAuth
        ? '<button type="button" class="pk-login-touch">' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M12 10v4a8 8 0 0 1-.4 2.5"/><path d="M8.5 8.5a5 5 0 0 1 7 3.5v2"/>' +
              '<path d="M5.5 6.5a9 9 0 0 1 13 5.5v2.5"/><path d="M8 20a12 12 0 0 0 1.2-3"/>' +
              '<path d="M15.5 19.5A16 16 0 0 0 16 15"/></svg>' +
            '<span>Sign in with Touch ID</span></button>'
        : '') +
      (opts.onPasskey
        ? '<button type="button" class="pk-login-touch" hidden>' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<path d="M12 10v4a8 8 0 0 1-.4 2.5"/><path d="M8.5 8.5a5 5 0 0 1 7 3.5v2"/>' +
              '<path d="M5.5 6.5a9 9 0 0 1 13 5.5v2.5"/><path d="M8 20a12 12 0 0 0 1.2-3"/>' +
              '<path d="M15.5 19.5A16 16 0 0 0 16 15"/></svg>' +
            '<span>Sign in with Touch ID</span></button>'
        : '') +
    '</div>';
  const q = (s) => el.querySelector(s);
  // Team = a custom (non-native) dropdown, full-width inside the card.
  // Teams gated off via TEAM_ENABLED render greyed + inert; only enabled teams
  // (and Builder, always enabled) are pickable. One flag flip re-enables one.
  const teamItems = [...TEAMS].sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t, disabled: !isTeamEnabled(t) }));
  // Builder (admin) sits last, fenced off from the ordinary teams by a divider.
  teamItems.push({ value: ADMIN_TEAM, label: ADMIN_TEAM, dividerBefore: true });
  const teamDD = buildDropdown({ items: teamItems, placeholder: 'Select Team', block: true });
  q('.pk-login-team').appendChild(teamDD.el);
  if (opts.onClose) q('.pk-login-close').addEventListener('click', () => opts.onClose());

  /* Touch ID: show the button only after confirming this machine really has a sensor. Asking
   * first and revealing second means the panel never advertises a route it cannot deliver — a
   * dead biometric button on a desktop without a reader is worse than no button at all. */
  if (opts.onRemoteAuth) {
    const remoteBtn = q('.pk-login-touch');
    remoteBtn.addEventListener('click', () => {
      remoteBtn.disabled = true;
      remoteBtn.querySelector('span').textContent = 'Opening sign-in…';
      Promise.resolve(opts.onRemoteAuth()).catch((err) => {
        remoteBtn.disabled = false;
        remoteBtn.querySelector('span').textContent = 'Sign in with Touch ID';
        const e = q('.pk-login-err');
        e.textContent = (err && err.message) || 'Could not open the sign-in page.';
        e.hidden = false;
      });
    });
  }

  const touchBtn = opts.onPasskey ? q('.pk-login-touch[hidden]') : null;
  if (touchBtn) {
    const setBusy = (busy) => {
      touchBtn.disabled = busy;
      touchBtn.querySelector('span').textContent = busy ? 'Waiting for Touch ID…' : 'Sign in with Touch ID';
    };
    hasPlatformAuthenticator().then((ok) => { if (ok) touchBtn.hidden = false; });
    touchBtn.addEventListener('click', async () => {
      setBusy(true);
      const e = q('.pk-login-err'); e.textContent = ''; e.hidden = true;
      try {
        // Usernameless: the credential is resident, so the browser offers the account and the
        // user types nothing at all.
        const body = await passkeyLoginDiscoverable(opts.workerUrl || WORKER_URL);
        if (body) { opts.onPasskey(body); return; }
        // null = no resident credential, or the sheet was dismissed. Neither is an error; the
        // key field is right there. Only say something for the case worth explaining.
        e.textContent = 'No passkey on this device yet — sign in with your key, then enrol under Settings → Passkeys.';
        e.hidden = false;
      } catch (err) {
        e.textContent = err.message || 'Could not sign in with Touch ID.';
        e.hidden = false;
      } finally { setBusy(false); }
    });
  }

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
  '/': 'Home Page',
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

/* --------------------------------------------------------------------------
 * 5.0 — labelling pages that live on other origins.
 *
 * PAGE_NAMES maps this site's ~45 routes. A pin raised on amazon.in has no
 * entry, so pageName() falls back to a title-cased slug — "B0Abc" — which is
 * technically correct and practically useless. These helpers prefer what the
 * overlay actually captured on the foreign page: its <title>.
 * ------------------------------------------------------------------------ */

/** Host of a record's `page` ('' when no URL was recorded — the primary/legacy namespace). */
export function pageHost(page) {
  const u = page && page.url;
  if (!u) return '';
  try { return new URL(String(u)).host.toLowerCase(); } catch (e) { return ''; }
}

/**
 * Display label for a record's page, WITHOUT the host.
 * Foreign host -> its captured <title> (PAGE_NAMES cannot know that route);
 * no host      -> the existing pageName() behaviour, unchanged.
 */
export function pageLabel(page) {
  const path = (page && page.path) || '/';
  if (!pageHost(page)) return pageName(path);
  const t = String((page && page.docTitle) || '').trim();
  return t ? t.slice(0, 70) : pageName(path);
}

/** 'host · Label' — fully qualified, for lists that mix origins. */
export function pageLabelFull(page) {
  const host = pageHost(page);
  const label = pageLabel(page);
  return host ? host + ' · ' + label : label;
}

/**
 * The link that actually opens the page a pin was raised on.
 *
 * `page.path` alone is a PATH, so a link built from it resolves against whatever origin the
 * dashboard is served from — meaning every ticket raised on a customer's site linked to
 * thisisshon.github.io/<their-path>, which is somebody else's page or a 404. Now that Proofkit runs
 * on any URL that is the common case, not the edge one. The overlay has always recorded the full
 * href; this prefers it and keeps the path as the fallback for older records that predate it.
 */
export function pageHref(page) {
  const u = (page && page.url) || '';
  if (u) { try { return new URL(String(u)).href; } catch (e) { /* fall through */ } }
  return (page && page.path) || '/';
}

/** The URL as text, without the scheme — the part worth reading in a list. */
export function pageUrlText(page) {
  const href = pageHref(page);
  return String(href).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Grouping key for a page across origins — mirrors the Worker's pageId. */
export function pageGroupKey(page) {
  return pageHost(page) + '|' + ((page && page.path) || '/');
}
