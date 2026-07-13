# Proofkit — changelog

Bump the version here **and** in `package.json` + `VERSION` on every change to the tool.
The `VERSION` file is the single number a host project compares against to detect an
outdated copy when re-syncing the package (see `INSTALL.md` → "Updating an existing copy").

The version is the package's, not the host site's — it travels with the folder.

## 2.8.0 — 2026-07-13 — design system (tokens + components) + /reviewdash/product showcase + toggle fix

- **Design system extracted into `core/design/`.** Colour + theme are now a single source of truth in
  **`design/tokens.css`** — all three skins (Red Moon / Dark Cream / Light) keyed by `[data-pk-theme]`,
  plus non-theme tokens (8px spacing ladder, radii, shadows, font, motion). Reusable component classes
  live in **`design/components.css`** (`.pk-btn`, `.pk-card`, `.pk-chip`, `.pk-eyebrow`, `.pk-hr`, and
  the `.pk-tt` toggle). Both re-skin automatically via the tokens. The two reference kits moved to
  **`core/design/reference/`** (`red-moon.md`, `dark-cream.md`) — inspiration only, nothing imports them.
  - `config.js` no longer injects theme CSS from JS: `THEMES` / `themeCss()` / `injectThemeStyle()`
    removed (tokens.css is the colour source). It keeps only the theme NAMES + a `themeVars` literal
    (the dark skin) for the on-page overlay, which self-injects at review time and can't link a sheet.
  - The dashboard adapters + standalone HTML entries now load `design/tokens.css` + `design/components.css`.
- **New showcase page `/reviewdash/product`.** A self-themed overview of the whole tool, built entirely
  on the design system: hero, metric band, the review→ship loop, key + full feature set, the
  cross-vertical “one queue for every team” story, and CTAs. Respects the global theme; gated on
  `PROOFKIT_ENABLED`, noindex.
- **Fix — light-mode toggle thumb.** It now stays fully INSIDE the track in both states and is the
  brand RED (was amber/orange and riding the edge).

## 2.7.0 — 2026-07-13 — global admin-controlled theme + overlay "Go to Dashboard" + light-mode fixes

- **Theme is now a GLOBAL, admin-controlled setting.** The light/dark toggle lives ONLY in the admin
  dashboard (`/reviewdash`); flipping it writes the theme to the Worker (KV `settings.theme`), so it
  changes the mode for EVERYONE. Team users (`/teamdash`) no longer have a toggle — they read and
  apply whatever the admin set. `localStorage` is now just a same-browser cache for a no-flash first
  paint (and the no-Worker demo fallback).
  - New Worker endpoints: **`GET /settings`** (public — returns `{theme}`; dashboards need it before
    sign-in) and **`POST /settings`** (admin-only — sets the global theme). KV key `settings`.
    ⚠️ Worker change — auto-deploys via `.github/workflows/deploy-worker.yml` on push to main.
  - `core/config.js`: `setGlobalTheme()` (admin write), `syncTheme()` (everyone reads on load + on
    tab focus), `toggleTheme()` now flips the *global* theme; `initTheme()` paints the cached theme
    instantly then reconciles with the Worker.
- **Overlay "Go to Dashboard" button.** Every authenticated reviewer now gets a Dashboard button in
  the on-page dock, next to the Save/Comment button. It routes by role: `ADMIN_TEAM` → `/reviewdash`,
  any team → `/teamdash`. The overlay login now also offers the admin identity so admins can sign in
  on-page and jump straight to their dashboard.
- **Fix — light toggle icon.** The sun glyph rendered broken/overflowing; the toggle now uses one
  glyph kept inside the thumb and reads state via the thumb's slide + colour.
- **Fix — invisible text in light mode.** The active sidebar nav (`background:#202020` + dark ink)
  and the monospace AI-prompt text (`#e8e8e8` on white) were unreadable on light; both repainted.
- **Light-mode UI polish (the "chips" pass).** Team chips now use the on-page pastel palette in light
  (JS-derived, and re-skin live when the admin toggles); status chips, the "change to" callout, the
  Master Log table header, native `<option>` menus, the deploy banner and the page floor all get
  light values via scoped `[data-pk-theme="light"]` overrides. Dark mode is byte-for-byte untouched.

## 2.6.0 — 2026-07-13 — framework-neutral core extraction + light-theme toggle

- **Portable core extraction.** All logic + styles moved out of the four `.astro` components
  into a framework-neutral `core/` folder: `core/config.js` (tool data + theming + helpers),
  `core/overlay.js`, `core/dashboard.{js,css}`, `core/teamdash.{js,css}`, `core/login.{js,css}`.
  The `.astro` files (`Overlay`/`Dashboard`/`TeamDashboard`/`Login`) are now **thin adapters** —
  they mount the shell, bridge the Worker URL, and load the core. Proofkit no longer *depends*
  on Astro; it ships an Astro adapter. New standalone `core/dashboard.html`, `core/teamdash.html`,
  `core/login.html` entries drop the tool into any stack (`<script type="module">` + a
  `window.PROOFKIT_WORKER_URL` global).
- **`config.ts` is now the Astro-adapter config only.** It re-exports `core/config.js` and keeps
  the three host/build-specific concerns: `PROOFKIT_ENABLED` (Astro render gate), the env-driven
  `WORKER_URL`, and the per-route SEO objects. **Edit tool data + theming in `core/config.js`**
  (the new single source of truth). All existing `./config` imports keep working (re-exported).
- **Worker URL seam.** Adapters inline `window.PROOFKIT_WORKER_URL` (from env `WORKER_URL`) before
  the core module evaluates; `core/config.js` reads that global; standalone HTML sets the same
  global. **No Worker / endpoint / auth change** — the backend + all APIs are byte-for-byte
  unchanged, no `wrangler deploy` needed.
- **Light theme.** New `light` skin in `THEMES` (warm off-white surfaces, brand red kept, status
  colours darkened for legibility on light). Joins `red-moon` (default) + `dark-cream`.
- **Runtime light/dark toggle.** Theme injection changed from build-time selector-less `:root{…}`
  to `themeCss()`, which emits every skin keyed by `[data-pk-theme="…"]`; the choice is applied
  live by swapping the `<html>` attribute and **persisted in `localStorage` (`pkTheme`)**. A subtle
  sun⇄moon control (`buildThemeToggle()`) mounts under the wordmark in both dashboards via a
  `[data-pk-toggle]` slot (48px tap target). The on-page overlay stays on its dark skin.
- ⚠️ Accent polish pending — the light skin adapts surfaces + text cleanly, but a few accents tuned
  for the dark canvas (active-nav fill, team chips) read heavier on light. Cosmetic follow-up.

## 2.5.1 — 2026-07-13 — admin log-in via /teamdash + audit trail + Master Log detail

- **Admin password is now `website`** (was `shriramreview`). `config.ts`
  `REVIEW_PASSWORD_SHA256` = SHA-256(`website`); on the Worker set the secret to match with
  `wrangler secret put ADMIN_PASS` → `website`. `TEAM_KEYS` are unchanged.
- **Two-door admin login.** New `config.ts` export `ADMIN_TEAM = 'Design'` — a login-only
  identity. The `/teamdash` login dropdown now lists the reviewer `TEAMS` **plus** a
  "Design (Admin)" option; picking **Design** + the admin password signs in as admin and
  redirects to `/reviewdash`. Design is **not** in `TEAMS`, so it never appears in the on-page
  comment composer or the team filters — its "key" is simply the admin password. The `/reviewdash`
  direct password gate is unchanged.
- **Admin nav restructured** to **Overview · Deploy · Notifications · Master Log**. The old
  session-grouped "Master Log" view was **removed**; the former "All Entries" tabular view was
  **renamed to "Master Log"** and gained a click-through **detail view** ("View more") showing full
  entry details + a **status-history timeline** (current + past status). Master Log lists all root
  entries, including deployed ones.
- **Comment audit trail.** Every comment now carries `history: [{ status, at, event, published }]`
  (`event` ∈ `created` | `status` | `deployed`), appended on create, on `POST /status`, and on
  Deploy. Old records missing it are synthesized in the UI from the timestamps.
- **Notifications read/unread toggle.** `POST /notifications/read` now takes `{ ids, read?:boolean }`
  (default `true`); `read:false` toggles a notification back to **unread**. Both the admin and team
  dashboards expose a per-notification read/unread toggle (admin flips `readAdmin`, a team flips its
  `readTeam`).
- **Overview "All" excludes deployed.** The Overview `All` tab is now the active worklist —
  open + in-bucket only; deployed/published items are excluded (they remain under the Deployed tab
  and in Master Log).
- **Overview cards redesigned for large content** — clamped comment body with Show more/less, a
  height-capped Change-to callout, collapsible replies, and wrap-safe containers, so a card stays
  clean whether the comment is one line or fifty.
- **Deploy button** restyled to a strong dark green (`--pk-deploy:#1a7f37`, hover `#14682c`) so the
  primary Deploy CTA stands out against the near-black canvas; no other button changes.
- ⚠️ Worker change — needs `wrangler deploy` to take effect (the `history` audit trail + the
  `read` param on `/notifications/read`), and `wrangler secret put ADMIN_PASS` → `website`.

## 2.5.0 — 2026-07-13 — per-team dashboards + deploy gate + notifications

- **Two dashboards, one team route.** `/reviewdash` stays the **admin** dashboard (full access,
  every team). A **new `/teamdash`** per-team dashboard lets a team sign in with **its own team key**
  and pick its team; the Worker returns **only that team's** comments (server-side isolation via the
  masked `GET /comments?team=X`) plus that team's notifications. One route serves every team — the
  team is identified by the **login key, not the URL**. New files: `TeamDashboard.astro` +
  `src/pages/teamdash.astro` (a new host-project route seam alongside `reviewdash.astro`); new config
  `teamDashSeo` (noindex).
- **Deploy-gated lifecycle.** A comment's **working** status (`status`: `open` | `completed` |
  `closed`, admin-only) is now separate from **what the team sees** (`published ? publishedStatus :
  'open'`). Admin **Mark Complete** moves a comment into a silent **deploy bucket** — the team still
  sees *Pending*. Only the batch **Deploy** action publishes the bucket (flips `published`, snapshots
  `publishedStatus`, stamps `publishedAt`) — and **that** is what fires notifications. Teams never see
  the bucket.
- **Completion validation** (content changes only). Mark Complete runs a server-side check: if the
  comment carries replacement copy (`changeTo`), the Worker fetches the **live page**
  (`ALLOW_ORIGIN` + path) and confirms the new copy is present
  (`validation.method = 'content-copy-match'`); otherwise it's `'manual'`. The result is stored on
  `validation:{ ok, method, detail, checkedAt }` and shown on the admin card with a ⚠ flag when not
  yet verified. Completing is **allowed even if unverified** (the site may redeploy afterwards).
- **Notifications.** Created **only on Deploy**, one per published root comment, in KV key
  `notifications`. Team feed (`GET /notifications?team=X`) + admin feed (`GET /notifications`), with
  unread tracking (`readTeam` / `readAdmin`) and mark-read (`POST /notifications/read`). Both
  dashboards gain a Notifications view.
- **New / changed endpoints:** `GET /comments?team=X` (team-scoped, masked), `POST /status` (working
  status + validation), `POST /deploy` (publish the bucket + notify), `GET /notifications`,
  `POST /notifications/read`. `POST /resolve` is **kept as a back-compat alias** of `/status`
  (legacy `resolved` ⇒ `completed`). New comment-record fields: `status` (now
  `open`|`completed`|`closed`), `published`, `publishedStatus`, `completedAt`, `closedAt`,
  `publishedAt`, `validation` — all backward-compatible (missing ⇒ default).
- **Admin dashboard** gains Deploy (bucket + Deploy button) and Notifications views; tabs are now
  All / By Page / Open / In Bucket / Deployed / Closed. (The "Dashboard" tab is the "Overview" tab.)
- ⚠️ Worker change — needs `wrangler deploy` to take effect. `ALLOW_ORIGIN` now has a **second role**:
  besides the CORS lock, it's the base URL the Worker fetches for content validation, so it must be
  the real site origin (not `*`) for auto-verification to work.

## 2.4.0 — 2026-07-12 — per-team reviewer keys

- **Per-team passwords** — the Worker now accepts a `TEAM_KEYS` JSON var (`{"Product":"…",…}`);
  any team's key authenticates a reviewer (the team picked at login is a label). The old single
  `REVIEW_PASS` still works as a fallback; admin stays `ADMIN_PASS`. Default UAT keys are seeded in
  `wrangler.toml` (low-value, in-repo — rotate before production).
- ⚠️ Worker change — needs `wrangler deploy` to take effect; set the admin password with
  `wrangler secret put ADMIN_PASS`.

## 2.3.1 — 2026-07-12 — eased comment overlay

- The on-page comment composer + reply popover get the login's clean, spaced treatment: roomier
  card (344px) and padding (22px), calmer header, taller inputs, uppercase Send/Cancel — compact
  but breathable. Style-only, `Overlay.astro`.

## 2.3.0 — 2026-07-12 — ticket lifecycle (Unresolved ⇄ Resolved → Closed)

- **Three-stage lifecycle**: a comment opens **Unresolved** (default); **Resolve** it after a fix;
  **Unresolve** to send it back if the fix isn't right; **Close** to finish (terminal — no reopen).
  Dashboard chips/tabs/counts/rollup/bulk updated (tabs: All / By Page / Unresolved / Resolved /
  Closed); the Worker `/resolve` accepts `closed`.
- **On-page pins hide Resolved + Closed** — the website/review overlay shows pins ONLY for
  Unresolved comments, so the page stays clean as tickets get actioned. A dashboard **Open Pin**
  (`#c=<id>`) still force-shows its target (even resolved/closed).
- **Fix:** capture the deep-link hash before `enter()` rewrites the address bar — "Open Pin" was
  silently broken by the `/<page>/review` URL rewrite; it works again.
- ⚠️ Worker half (`closed` status) needs `wrangler deploy`; the dashboard + on-page rules work today
  in demo/local and live once deployed.

## 2.2.0 — 2026-07-12 — page names + simpler statuses + bulleted prompts

- **Friendly page names** — `config.ts` `PAGE_NAMES` maps each path to a display name
  (`/` → "Homepage", `/equity` → "Equity", …) with a `pageName()` title-case fallback; shown as the
  link text wherever the dashboard printed a raw URL (card links, By Page headers, All Entries, prompt
  modal). Hrefs stay the real paths. Project-configurable.
- **Simpler statuses** — removed **Won't fix** (dismissed) and **Reopen**: back to open → resolved
  (one-way). Dropped the Won't-fix tab, the dismissed chip, and the bulk dismiss/reopen actions.
- **Bulleted copy-prompts** — every "Copy prompts" (toolbar, per-page, and bulk multi-select) now
  copies a bulleted list (one prompt per bullet, wrapped lines indented).
- **Overlay copy** — login subtitle → "Please select your Team and enter the provided key to start
  marking comments."; the clicked element now reads `Selected - "…"` in the composer header.

## 2.1.0 — 2026-07-12 — team-only comments + copy

- **No names** — the on-page overlay no longer asks for a name; comments (and replies) are tagged
  by **team only** (chosen once at login). The name field is gone from the composer + reply, and
  the dashboard drops all name/anonymous displays (card meta, Master Log + All Entries "Reviewer"
  columns removed, session detail, prompt modal, Markdown export). Reduces friction.
- Overlay login title "Let's review this page" → **"Let's Review."**
- Dashboard header wordmark "Shriram Financial Services" → **"Shriram FS"**.

## 2.0.0 — 2026-07-12 — theming + decoupled shell + sync tooling (M3 + M4)

**M3 — theming & overlay unification**
- **Themes knob** — `config.ts` `THEME` selects a skin (`red-moon` default, `dark-cream` included);
  the active theme's `--pk-*` tokens are injected into BOTH the dashboard and the on-page overlay,
  so switching `THEME` reskins the whole tool from one source. The dashboard no longer hardcodes
  its palette.
- **Overlay onto Red Moon** — the on-page comment popover, pins, inputs, buttons, thread and toast
  now use the shared `--pk-*` tokens (dark card, red accents, sharp corners) instead of the legacy
  gold/cream — the overlay finally matches the dashboard.

**M4 — decoupled shell & propagation tooling**
- **Decoupled dashboard** — `/reviewdash` renders its own minimal `<html>` shell (no host
  `BaseLayout`); `.rvd` is now self-sufficient (own gutter + reset), so the route needs nothing from
  the host layout. One less host coupling.
- **Auto-update tooling** — `scripts/sync.mjs` (`push` / `pull` / `check`) copies the package between
  projects with a **semver guard** (refuses to overwrite a same-or-newer copy without `--force`) and
  prints the host-seam reminder. Dev-only; see `scripts/README.md`.

**Deferred (with reasons)** — M3 Dashboard JS-module split (pure internal refactor, high risk, no
user-facing value); M4 assignee + due (needs a new Worker `/update` endpoint + deploy) and stable
`data-proofkit` anchors (needs an approach decision: host-markup attributes vs. a robust-selector
rewrite).

⚠️ The M2 Worker changes (dismissed status, Claude provider) still need `wrangler deploy` to go live.

## 1.9.0 — 2026-07-12 — 3-state status + pluggable AI provider (M2)

- **Three statuses** — `open`, `resolved`, and **`dismissed` ("Won't fix")**. Cards show
  Resolve / Won't fix (open) or Reopen (closed); tabs are All / By Page / Open / Resolved /
  Won't fix; By-Page rollups and bulk actions gained a Won't-fix action; the Worker's `/resolve`
  now accepts `dismissed`. Open counts exclude dismissed.
- **Pluggable AI provider** — the Worker's change-prompt generator now supports **Anthropic
  (Claude)** via an `ANTHROPIC_API_KEY` secret (model via `ANTHROPIC_MODEL`, default Haiku 4.5),
  else **Cloudflare Workers AI** with an overridable `AI_MODEL`. Deterministic fallback unchanged.
- ⚠️ The Worker half (dismissed status + provider) needs `wrangler deploy` from `proofkit/worker/`;
  the dashboard 3-state UI works today (localStorage demo + live once the Worker is deployed).

## 1.8.0 — 2026-07-12 — dashboard power features (M1)

Roadmap milestone **M1** (client-only, no Worker/host changes):
- **Search** across comment text, change-to, page, reviewer, team, element.
- **Sort** — Newest / Oldest / Page A–Z.
- **Export** — "Copy MD" (changes in view as Markdown) + "JSON" (download all comments).
- **Copy prompts** — stack every AI change-prompt in view (global), and per **By Page** group;
  falls back to a deterministic instruction when a prompt hasn't generated yet.
- **Per-page rollup** — By Page headers show `N changes · X open · Y resolved`.
- **Unread** — comments arrived since your last dashboard visit get a red **New** badge + a
  "N new" stat tile (tracked via `reviewLastSeen` in localStorage).
- **Bulk multi-select** — a checkbox per card + a floating action bar (Resolve / Reopen / Copy
  prompts / Delete) that acts on the selected set at once.
- Dashboard-only; no seam or JS-contract changes.

_Still queued from the roadmap: M2 3-state status + pluggable AI provider (Worker); M3 shared
theme.css + overlay unification + JS split + themes; M4 assignee/due, stable anchors, decoupled
shell, auto-update._

## 1.7.1 — 2026-07-12 — copy

- Dashboard H1 "Review Dashboard" → "Review and Bug Testing" (`Dashboard.astro`).
- Overlay login title "Review this page" → "Let’s review this page" (`Overlay.astro`).

## 1.7.0 — 2026-07-12 — crisp, stackable AI prompts

- Worker AI change-prompt (`worker/worker.js` → `genPrompt`) no longer includes reviewer/team
  attribution — the "reviewed by X from the Y team" line is gone. `team`/`reviewer` are no longer
  sent to the model; the instruction now asks for a crisp, self-contained 1-3 sentence change
  instruction meant to be pasted into a coding agent and **stacked** one after another.
- ⚠️ Worker change — takes effect only after `wrangler deploy` from `proofkit/worker/`; the
  GitHub Pages deploy does not affect the Cloudflare Worker.

## 1.6.5 — 2026-07-12 — roomier overlay login

- Overlay login made larger and more relaxed: card 400→480px wide, padding 40→56px; taller
  56px inputs + Sign in button (15px text); more breathing room between brand / title / subtitle
  / fields / actions / footer. Style-only, `Overlay.astro`.

## 1.6.4 — 2026-07-12 — overlay login spacing

- Overlay login: 16px gap between the "Review this page" title and the subheading
  (`.rv-login-sub` margin-top 8px → 16px). Style-only, `Overlay.astro`.

## 1.6.3 — 2026-07-12 — overlay login copy trim

- Overlay login subtitle: dropped "on the Testing Environment" → "Please select the Team Name and
  Enter Key to start marking comments." Copy-only, `Overlay.astro`.

## 1.6.2 — 2026-07-12 — overlay login copy

- Overlay login copy: Team select placeholder → "Select Team"; Key field label → "Authentication"
  with placeholder "Enter Key"; subtitle → "Please select the Team Name and Enter Key to start
  marking comments on the Testing Environment." Copy-only, `Overlay.astro`.

## 1.6.1 — 2026-07-12 — Refresh icon morph + reset ring

- The Refresh button's two glyphs (sync + check) are now stacked in the same 16px box and
  **cross-morph** — on "done" the tick spins/scales in as the refresh arrows spin out, and on
  reset the **tick morphs back into the refresh icon** (the transitions reverse).
- Added an **exit animation around the button**: a green ring (`::after`) pulses outward and
  fades (`pk-ring`) as the button returns to its default state (JS adds a transient
  `is-resetting` class). Respects `prefers-reduced-motion`. Dashboard-only, no seam changes.

## 1.6.0 — 2026-07-12 — Comment dock gated on authentication

- The on-page **Comment dock now stays hidden until the review session is authenticated**
  (a validated Key = `reviewPass`), on every page. Being merely *armed* (`reviewMode`, e.g.
  after a dashboard sign-in) no longer shows it. Until authenticated the page looks untouched —
  the host back-to-top FAB stays and no `rv-armed`/dock is injected.
- Entering via `/<page>/review` (or an Open-Pin `#c=` link) opens the Team + Key login; only a
  successful login reveals the dock (`revealDock()`) and enters review. Since `reviewPass`
  persists per tab, the dock then shows on every page for the rest of the session. A plain armed
  page with no auth and no entry link shows nothing.
- Isolated to `Overlay.astro`; no seam or JS-contract changes.

## 1.5.0 — 2026-07-12 — team chosen once at login

- **Two-field overlay login:** the on-page Comment login (`Overlay.astro`) now asks for a
  **Team** (a `<select>` dropdown, first field) and a **Key** (the shared passcode, second
  field), replacing the single "Team ID" password. The team options are sourced from
  `config.ts` → `TEAMS` (never hardcoded) and rendered **sorted alphabetically**. On submit the
  team is stored in `TEAM_KEY` (localStorage, session-global) and the key in `PASS_KEY`,
  validated against the Worker exactly as before (wrong key → error, `PASS_KEY` cleared). Empty
  team → focus it, don't proceed.
- **Per-comment team pickers removed:** because the team is now chosen once, the comment
  composer's `.rv-team` select and the reply composer's `.rv-rteam` select are gone. Both submit
  handlers (`send`, `addReply`) read the team from `TEAM_KEY`; the "Please choose a team"
  validation tied to those selects is dropped. Name field, the Content-team "change to…" field,
  and the team chip (reads the stored team) are unchanged.
- Copy updated to "Team" / "Key" ("Pick your team and enter the key…"). No seam / JS-contract
  changes beyond the removed selects; drop-in folder replace.

## 1.4.0 — 2026-07-12 — motion

- **Page entry:** the dashboard now plays a staggered entrance — the structural bands
  (top bar → headline → stat tiles → shell) cascade in on load using the same rise idiom as
  the site's `[data-enter]` page entrances (and opts out of the host scroll-reveal to avoid
  double motion). Injected content (stat tiles, comment cards, tables) also eases in whenever
  rendered — on load, on filter switch, and on every Refresh.
- **Clever Refresh:** the Refresh button spins its sync icon while loading (held ≥650ms so it
  reads even on instant local loads), then flashes a green check "done" tick. Guards against
  rapid re-clicks.
- All motion respects `prefers-reduced-motion`. No JS-contract or seam changes.

## 1.3.0 — 2026-07-12 — own chrome + "Go to site"

- **Full-bleed dashboard:** the `/reviewdash` route no longer renders the host site header
  (or MegaNav) — ProofKit owns the whole viewport. Done via a new `chrome` prop on the host
  `BaseLayout` (`chrome={false}`); the dashboard shim passes it. See INSTALL.md → seam note.
- **Top-bar actions:** added a primary **"Go to site"** button (links to `/`) alongside a
  secondary ghost **Refresh** — Go to site on the left (primary), Refresh on the right.
- Top bar wraps on narrow viewports; no JS-contract changes.

## 1.2.0 — 2026-07-12 — dashboard IA + dark chips

- **Master Log** moved out of the tab row into the left panel (Dashboard / Master Log /
  All Entries); the dashboard tab row is now All / By Page / Open / Closed (By Page promoted
  to second).
- **Header** wordmark tag reads "Content Review | Shriram Financial Services" (all caps).
- **Dark-mode chips:** team + filter chips are now muted, team-hued dark fills derived from
  each team's identity colour (blended toward the canvas) instead of the bright light pastels
  — the pastels are kept only for the on-page overlay's light popover context.
- Top bar wraps gracefully on narrow viewports. No JS-contract or seam changes.

## 1.1.0 — 2026-07-12 — "Red Moon" dashboard theme

- **New:** the dashboard (`Dashboard.astro`) is fully re-skinned in the Ferrari-inspired
  "Red Moon" theme — near-black canvas (#181818), scarce Rosso Corsa red (#da291c) accent,
  sharp 0px corners, uppercase tracked labels, spec-cell stat tiles, badge-pill status/team
  chips. Now **self-themed** via `--pk-*` CSS variables (system-font stack), so the dashboard
  no longer depends on the host site's design tokens — one less coupling when porting.
- **New:** ProofKit brand top bar (mark + wordmark), themed login + AI-prompt modals, entrance
  motion (respects `prefers-reduced-motion`), hover gated at 1024px.
- No JS-contract changes — every DOM id/class the script drives is preserved. No seam changes.

## 1.0.1 — 2026-07-12 — Open Pin deep-link fix

- **Fix:** the dashboard's "Open Pin" links (`…#c=<id>`, opened in a fresh tab with
  `rel="noopener"`) no longer landed on a dormant overlay after the arm flow was tightened
  to "sign in at /review only." The overlay now treats a trusted `#c=` deep link as an arm
  trigger, so the pin opens (the reviewer is still asked for their Team ID before any data
  loads). Normal page loads remain dormant until sign-in. Change is isolated to `Overlay.astro`.
- No seam changes — updating an existing copy is a drop-in folder replace.

## 1.0.0 — 2026-07-12 — base layer

First packaged release. Extracted the previously-scattered content-review tool into a
single self-contained, versioned package (`src/plugins/proofkit/`) with:

- **One master switch** — `PROOFKIT_ENABLED` in `config.ts` toggles the whole tool
  (overlay on every page + the `/review` and `/reviewdash` routes) on/off site-wide.
- **All site-specific values centralized** in `config.ts` (teams, team colours,
  hide-selectors, worker URL, route SEO) — the one file to edit when porting.
- **Clean package layout** — `Overlay.astro`, `Login.astro`, `Dashboard.astro`,
  `config.ts`, `worker/`, plus `README.md` / `INSTALL.md` / `CHANGELOG.md` / `VERSION`.
- **Thin host seams only** — one gated line in the shared layout + two route shims.
- Verified toggling on/off end-to-end; localStorage demo mode and Cloudflare Worker
  (KV store, two-tier auth, AI change-prompts) both intact.

### Milestone / pause point
The base layer (packaging, single toggle, portability, docs) is defined and built.
**Deferred** (to work out later): the auto-push / auto-update-over-GitHub propagation
mechanics, and standardizing stable comment anchors (`data-proofkit`) so pins survive
markup changes.
