# Proofkit — changelog

Bump the version here **and** in `package.json` + `VERSION` on every change to the tool.
The `VERSION` file is the single number a host project compares against to detect an
outdated copy when re-syncing the package (see `INSTALL.md` → "Updating an existing copy").

The version is the package's, not the host site's — it travels with the folder.

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
