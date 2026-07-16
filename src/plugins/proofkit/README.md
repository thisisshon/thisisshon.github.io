# Proofkit

**A self-contained, toggleable, portable content-review tool.** An on-page
click-to-comment overlay for reviewing the **live** site plus **two dashboards** — an
**admin/Builder** dashboard and a per-**team** dashboard — backed by a Cloudflare Worker.
Non-technical teams (Content / Product / SEO / Marketing) walk the real site, drop numbered
comments on any element, and the Builder actions them — each with an auto-generated,
developer-ready **AI change-prompt**. Every ticket moves through a **real-time state machine**
(`to_be_initiated → in_progress → deployed_live`, with a `reopen → reopened → resubmit`
iteration loop) that both sides watch live — no batch deploy gate, no silent bucket.

**Version 3.0** carries **twelve features** built around one shared ticket-creation refactor (see
*What's new in 3.0* below), on top of the real-time review workflow.

Proofkit is a **versioned package**: the whole tool is one folder (`proofkit/`) that zips up
and drops into any Astro / Claude Code website project. It lives inside its host repo as the
canonical source (so it stays seamlessly integrated), and the zip is just an export of the
folder. See **`INSTALL.md`** to add it to a project and **`CHANGELOG.md`** / **`VERSION`** for
release tracking.

- **Version:** see `VERSION` (`3.0.0`).
- **Turn it on/off:** one line — `PROOFKIT_ENABLED` in `config.ts`.
- **Theme it:** one line — `THEME` in `config.ts` (`red-moon` | `dark-cream`); the active theme's
  `--pk-*` tokens reskin both dashboards and the on-page overlay.
- **Move it:** copy the folder + add four thin seams (one layout line + three route shims — see
  `INSTALL.md`), or use `scripts/sync.mjs` (`push` / `pull` / `check`) to copy it between projects
  with a semver guard.

> **⚠️ Keep the docs current.** `README.md` (what it does) + `INSTALL.md` (how to integrate) are
> the source of truth that travels with the package. **Any change to the tool's behaviour, files,
> config, endpoints, or auth must be reflected here — and the version bumped** (`VERSION` +
> `package.json` + a `CHANGELOG.md` entry) — otherwise the "portable + documented + updatable"
> promise breaks the next time someone lifts it.

---

## What's new in 3.0 (the twelve features)

All twelve ride one shared refactor of the ticket-creation flow and the two dashboards. Every new
record field **defaults when missing** (`|| ''` posture), so records from 2.24 render unchanged, and
every behaviour has **localStorage demo-mode parity** — the tool works end-to-end before a Worker is
deployed.

| # | Feature | What it adds |
|---|---|---|
| 1 | **Change-type templates** | The composer gains a **type selector** (5 chips): `copy-fix` · `image-swap` · `link-fix` · `layout-tweak` · `general`. Each type swaps the field set (`templateFields`); `general` is the untouched 2.x freeform textarea (zero regression). Structured fields feed a rendered `summary` **and** the AI change-prompt. |
| 2 | **Batch submit + draft tray** | Clicking an element now creates a **draft** (local array), not an immediate POST. A **"Pending pins (n)"** tray in the dock lets you edit/remove drafts, then **Submit all** POSTs the batch in one call (per-item results, retry-failed-only on partial failure). Exiting review with drafts pending prompts a confirm-discard. |
| 3 | **Reopen reason enums** | Reopen is now a **modal with a reason dropdown** — *Needs clarification · Wrong element · Design mismatch · Other* — plus a note field (required only for **Other**). Replaces the freeform prompt; the reason label badges on cards + the timeline. Enforced client **and** server. |
| 4 | **Element screenshots** | At draft creation the overlay captures the pinned element (+~100px context) via **html2canvas** (loaded on-demand from CDN, only at capture time), downscales to a ≤480px JPEG, and stores it under KV key **`img:<uuid>`** — **outside** the page array. Thumbnail on cards, full-size in detail. Any capture failure ⇒ "preview unavailable", never blocks submission. |
| 5 | **Status-coloured pins** | On-page pins paint by `teamStatus`: **amber** = to-be-initiated, **blue** = in-progress, **green** = deployed-live, **soft-red** = reopened. (Prereq: the overlay was rewired off the dead `open/resolved/closed` `status` field onto `teamStatus`.) Deployed-live roots hide from the page unless deep-linked. |
| 6 | **Quick-question replies** | The existing `parentId` reply thread is repurposed as a lightweight **Quick questions** channel — a reply **never** mints a ticket, **never** changes status/iteration, and fires a distinct **`kind:'reply'`** notification to the other side. One mechanism, no second thread structure. |
| 7 | **Duplicate detection** | Opening the composer scans in-memory open root comments on the same page; a same-`anchor.selector` match **or** a pin within 48px raises a **non-blocking** "Similar comment already open — view" strip that links to the thread. Never blocks submission. |
| 8 | **Expected outcome** | `layout-tweak` and `image-swap` require an **`expectedOutcome`** ("success criteria") — validated client **and** server, surfaced as a prominent callout on the ticket detail. It is the manual-replacement signal that the retired auto-validation used to provide. |
| 9 | **Group by page** | A **"Group by page"** toggle on the Team Queue clusters tickets by `page.path` with per-page counts; toggle off restores the flat sort. |
| 10 | **Location hints** | Ticket detail surfaces the stored `anchor.selector` as a copyable **"Likely location"** with a best-effort caption (long selectors clamp with the full value on the copy). Nearly free — the selector already prefers `data-cms`/`id` component boundaries. |
| 11 | **Team views** | **Save view** captures the current filters (search, sort, status tab, team chips, group-by) as a named chip; views persist via `GET`/`POST /views` (KV `views:<team>`, `views:__admin` for admin). Shared per **team key**, not per person — hence "Team views". |
| 12 | **Insights / metrics** | A new admin **Insights** nav item: a date-range picker + stat tiles and CSS-bar charts for five metrics (deployed-per-page, volume-by-type, avg hours-to-deploy, reopen rate, open trend). Backed by `GET /metrics`, which reads a **rollup** KV key (`metrics`) maintained on every state transition — never a full scan. |

---

## The single switch

`config.ts` → `PROOFKIT_ENABLED`:

```ts
export const PROOFKIT_ENABLED = true;  // false ⇒ tool removed site-wide
```

- `true` — the overlay loads (dormant) on every page; `/review` + `/reviewdash` + `/teamdash` work.
- `false` — the overlay never loads on any page, and all three routes render a bare noindex
  "Not available" stub. One code change, whole tool gone.

Beneath this master switch the tool has its normal runtime gates (they only matter when
`PROOFKIT_ENABLED = true`): the **sign-in arm gate** — nothing renders for a normal visitor
until someone signs in at `/review`, which arms review mode for the tab (`reviewMode`); the
Comment dock never appears before that. `?review=0` signs out. Plus the two Worker passwords (below).

> **Load-gating.** `Overlay.astro` pulls the overlay core via a **conditional dynamic
> import** — the bundle only loads when `reviewMode === '1'`, `pkAutoReview` is set, or a `#c=`
> deep link is present — so the 4,000 host pages don't pay for an eager bundle.

---

## What it does (use cases & abilities)

**On-page overlay** (`Overlay.astro`, injected site-wide by the host layout)
- Sign in at `/review` to arm the tab; the host's back-to-top FAB (see `HIDE_SELECTORS`) is then
  replaced by a **Comment** button on every page. Before sign-in nothing renders, and it never
  arms on the tool's own `/review` / `/reviewdash` / `/teamdash` pages.
- The Comment button opens a two-field login — a **Team** dropdown (from `config.ts` `TEAMS`,
  disabled teams greyed via `TEAM_ENABLED`) and a **Key** (validated against the Worker). The
  chosen team is session-global for the tab (`pkTeam`/`pkKey`), picked **once at login**.
- Enter review → the page desaturates (grayscale) but stays scrollable; existing comments show as
  **numbered pins** anchored to their elements, **coloured by `teamStatus`** (F5). Pins re-project
  each frame so they track reflow; they fall back to page coords if the selector no longer matches.
- Click any element to **draft a comment** (F2): pick a **change type** (F1) → fill the
  type-specific fields → required **expected outcome** for layout/image types (F8). A
  **duplicate-pin warning** (F7) and an auto-captured **element screenshot** (F4) attach at draft
  time. Drafts collect in the **Pending pins (n)** tray; **Submit all** POSTs the batch.
- A comment navigator (count + prev/next) and deep links (`#c=<id>`) that jump to a pin.
- **Quick questions** (F6): threaded `parentId` replies on any pin — no ticket, no status change.
- **Add-only** — comments are never edited or deleted from the page (that's Builder-side).

**Admin / Builder dashboard** (`Login.astro` = `/review`, `Dashboard.astro` = `/reviewdash`)
- **Two doors in.** Either sign in directly at `/review` (redirects to `/reviewdash`, which keeps
  its own gate), **or** pick **Builder** in the `/teamdash` login dropdown and enter the admin
  password. Builder (`config.ts` `ADMIN_TEAM = 'Builder'`) is a login identity only — not in
  `TEAMS`, so it never appears in team filters, though it *is* the default "Direct to" target.
- **Team Queue** — one unified list of every ticket directed at Builder in a non-terminal
  iteration: search · sort · filter-by-page · **Group by page** (F9) · mark-all-read. Cards render
  **typed fields** per change type (never raw JSON), the `summary` as the list line, a
  **thumbnail** (F4) when an `imageId` is present, and a **reopen-reason badge** (F3) when reopened.
- **Ticket detail** — the full iteration timeline (`-1`, `-2`, …) merged across the resubmit chain,
  the **AI change-prompt** (copy button), the **"Success criteria"** callout (F8), the
  **"Likely location"** copyable selector (F10), the full-size screenshot (F4), and the
  **Quick questions** reply section (F6), visually distinct from status actions.
- **Actions** — **Start** (`to_be_initiated → in_progress`) · **Mark Complete** (`in_progress →
  deployed_live` — complete **is** deployed live, immediate, no bucket) · **Reopen** (opens the
  reason modal, F3) · **delete**.
- **Saved views** (F11) — **Save view** captures the current filters as a quick-select chip.
- **Insights** (F12) — admin-only date-range analytics (five metrics, stat tiles + bar charts).
- **Notifications** — the live feed with unread tracking + read/unread toggle; `kind:'reply'`
  items render distinctly (icon/label "Reply").

**Team dashboard** (`TeamDashboard.astro` = `/teamdash`)
- **One route for every team.** A team signs in with **its own team key** and picks its team; the
  Worker returns **only that team's** comments (server-side isolation via the masked
  `GET /comments?team=X`) and that team's notifications. The team is identified by the **login key,
  not the URL** — no per-team URL to leak or guess.
- **Completed** tab (default) — everything the team raised or was directed, with live status
  labels (*With builder – TBI* · *…in progress* · *Deployed live*), search · sort · **By page** ·
  status sub-filters. **Active** tab surfaces `reopened` tickets with the Builder's **reason label**
  (F3) + a **Resubmit** action (spawns the next iteration).
- Same **typed-field rendering, thumbnails, quick-questions, reopen badges, saved views** (own
  team) and **reply notifications** as the Builder side. No Insights, no admin actions.

**Two-tier auth** (enforced server-side by the Worker)
- **Reviewer key** — add comments + read a page's pins, and (on `/teamdash`) read the signing
  team's own comments + notifications. Either a **per-team key** from `TEAM_KEYS` (a JSON map
  `{"Content":"…","SEO":"…"}` in `wrangler.toml`) or the shared `REVIEW_PASS` fallback.
- **Admin** (`ADMIN_PASS`) — the Builder dashboard: read ALL comments, drive the state machine,
  reopen, delete, metrics, all notifications. Admin ⊃ reviewer.

**Storage modes**
- **Shared/live** — when `WORKER_URL` is set (via `PUBLIC_REVIEW_WORKER_URL`), everyone
  reads/writes the same Cloudflare KV store on the `shriram-review` Worker.
- **Local demo** — until the Worker is deployed, so unless `PUBLIC_REVIEW_WORKER_URL` is set,
  comments live in the browser's `localStorage` and every 3.0 behaviour (batch, screenshots, reopen
  enums, views, metrics) has full demo parity (any password accepted).

---

## The real-time lifecycle

Every ticket carries a single **`teamStatus`** that both sides watch live (5s poll). There is **no
deploy gate and no bucket** — *Complete* is *Deployed live*, immediately.

```
Comment drafted → Submit all (team)   teamStatus='to_be_initiated'   → "With builder – TBI"
  ↓ Builder: Start
                  teamStatus='in_progress'                            → "With builder – in progress"
  ↓ Builder: Mark Complete   (manual self-attestation — no auto-validation)
                  teamStatus='deployed_live'   (terminal for this iteration) → "Deployed live"
  ↓ Builder: Reopen  {reason:<enum>, note?}                           → "Reopened: <label>"
  ↓ Raiser/Admin: Resubmit   → new sub-ticket (shared parent id, -1/-2/…), iteration++
                  teamStatus='to_be_initiated'   (loop repeats; prior iteration kept for history)
```

Each transition appends to `history[]` as `{ status, at, event, iteration, reason?, note? }`.
**Quick-question replies** (F6) sit outside this machine entirely — they never change status or
iteration.

---

## The record shape (backward-compatible; missing ⇒ default)

Every 3.0 field defaults when absent, so records from 2.24 render unchanged.

```js
{
  // Feature 1 — change-type templates
  commentType: 'copy-fix'|'image-swap'|'link-fix'|'layout-tweak'|'general',  // default 'general'
  templateFields: {},   // type-specific (see table below); {} for general
  summary: '',          // one-line plain-text preview, server-rendered when the client omits it
  // Feature 8 — expected outcome
  expectedOutcome: '',  // REQUIRED (client+server) iff commentType ∈ {layout-tweak, image-swap}
  // Feature 2 — batch
  batchId: '',          // client uuid grouping one Submit-all
  // Feature 4 — screenshots (stored OUTSIDE the page array)
  imageId: '',          // '' = none; image lives under KV `img:<imageId>` as a dataURL string
  // Feature 3 — reopen enum + note
  reopenReason: 'needs-clarification'|'wrong-element'|'design-mismatch'|'other'|'',
  reopenNote: '',       // REQUIRED (client+server) iff reopenReason === 'other'
  // carried from 2.24: teamStatus, teamStatusAt, iteration, parentId, history[], ticket,
  //                    id, createdAt, sessionId, team, toTeam, name, comment, changeTo,
  //                    aiPrompt, page, anchor
}
```

`history[]` entries gain the same `reason?` / `note?` on reopen. `maskForTeam` passes the
structured 3.0 fields through (`commentType, templateFields, summary, expectedOutcome, imageId,
reopenReason, reopenNote`) plus the existing `aiPrompt` — teams see their own structured data.

**`commentType → templateFields`** (Feature 1)

| type | `templateFields` | notes |
|---|---|---|
| `copy-fix` | `{ currentText, newText }` | `newText` mirrors into the legacy `changeTo` so 2.x rendering / AI-prompt logic keeps working |
| `image-swap` | `{ currentImage, replacementDesc }` | `currentImage` auto-filled client-side (element `src`/`alt`/selector), read-only; **requires `expectedOutcome`** |
| `link-fix` | `{ currentUrl, newUrl }` | `currentUrl` auto-filled from the clicked `<a>` when available |
| `layout-tweak` | `{ whatToChange }` | **requires `expectedOutcome`** |
| `general` | `{}` | EXACTLY the 2.x freeform behaviour — zero regression |

The AI change-prompt (`genPrompt`) facts now include `comment_type`, `template_fields` and
`expected_outcome`, so the structured detail flows into the dev-ready prompt.

---

## Package contents

```
proofkit/
  config.ts        THE switch + all site-specific values (teams, colours, hide-selectors,
                   worker URL, route SEO). The one file to edit when porting.
  Overlay.astro    On-page click-to-comment overlay (dynamic-import gated; injected site-wide).
  Login.astro      The /review auth gate (guts; rendered by the route shim).
  Dashboard.astro  The /reviewdash admin/Builder dashboard (guts; rendered by the route shim).
  TeamDashboard.astro  The /teamdash per-TEAM dashboard (guts; rendered by the route shim).
  core/            Framework-neutral core (config.js, overlay.js, dashboard.*, teamdash.*,
                   login.*, design/tokens.css + components.css). Shares COMMENT_TYPES /
                   TYPE_FIELDS / REOPEN_REASONS / STATUS_COLORS / renderSummary() from config.js.
  worker/
    worker.js      Cloudflare Worker: KV comment store + notifications + two-tier auth +
                   real-time state machine + AI prompt gen + image (img:) + views + metrics.
    wrangler.toml  Worker config (name = "shriram-review", ALLOW_ORIGIN, KV id, TEAM_KEYS, AI).
  README.md        This file — what Proofkit is.
  INSTALL.md       How to drop it into a project (human + Claude Code agent steps).
  CHANGELOG.md     Release history. Bump on every change.
  VERSION          Semver (3.0.0) — the number a host compares to detect an outdated copy.
  package.json     Package identity (name, version, entrypoints, host requirements).
  REMOVAL.md       The clean-removal checklist (unwire, keep folder + data).
  data/            Contained review snapshots (see data/README.md).
  scripts/         Dev-only sync tool (excluded from the shipped copy).
```

**Host-project seams** (unavoidable — Astro requires route files under `src/pages/`, and the
overlay must be injected by the shared layout). Each is thin and gated by `PROOFKIT_ENABLED`:

| Seam | File | What it does |
|---|---|---|
| Overlay injection | host shared layout (e.g. `BaseLayout.astro`) | `{PROOFKIT_ENABLED && <ProofkitOverlay />}` |
| Login route | `src/pages/review.astro` | ~15-line shim → `<ProofkitLogin />` when enabled, stub when off |
| Admin dashboard route | `src/pages/reviewdash.astro` | ~15-line shim → `<ProofkitDashboard />` when enabled, stub when off |
| Team dashboard route | `src/pages/teamdash.astro` | ~15-line shim → `<ProofkitTeamDashboard />` when enabled, stub when off |
| Worker URL (CI) | build env | bakes `PUBLIC_REVIEW_WORKER_URL` into the build |

See **`INSTALL.md`** for the exact seam code.

---

## The Worker (backend)

**Not part of the Astro build** — it deploys separately to Cloudflare Workers as
`shriram-review` with its KV namespace. Until it's deployed, Proofkit runs in **local-demo mode**
(browser `localStorage`).

All commands run from `proofkit/worker/`.

1. **Install Wrangler & log in** — `npm install -g wrangler` then `wrangler login`.
2. **Bind the KV store** — set the `COMMENTS` namespace id in `wrangler.toml` (`[[kv_namespaces]]`).
   For a fresh install, `wrangler kv namespace create COMMENTS` and paste the id; when upgrading an
   existing Proofkit, keep the existing binding so prior tickets are preserved.
3. **Set the site origin** in `wrangler.toml` → `ALLOW_ORIGIN` (the real live origin; `*` only for
   testing). The `name` is already `shriram-review`.
4. **Set the passwords:** per-team reviewer keys in `TEAM_KEYS` (JSON map), and
   `wrangler secret put ADMIN_PASS`. (Optionally `wrangler secret put REVIEW_PASS`.)
5. **Deploy:** `wrangler deploy` → prints the Worker URL.
6. **Wire it up** — expose that URL to the build as `PUBLIC_REVIEW_WORKER_URL`. `config.ts` reads
   it as `WORKER_URL`; the standalone `core/*.html` entries read `window.PROOFKIT_WORKER_URL`.

### Endpoints (reference)

Auth via header `X-Review-Pass`. "reviewer" = a valid team key or `REVIEW_PASS`; "team X" = the
team whose `TEAM_KEYS` value equals the pass. Admin ⊇ reviewer. All 2.24 endpoints keep working;
3.0 adds/changes the rows marked **NEW**/**CHANGED**.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/comments` | **CHANGED (F2)** — accepts a single object **or an array**; array ⇒ per-item processing (one bad item never blocks the rest), `201 { results:[{ ok, rec?, error? }] }` in input order. Validates per item (non-empty comment, enum `commentType`, `expectedOutcome` for layout/image); replies (`parentId`) skip ticket + arrival notif and fire a `kind:'reply'` notif to the other side. | reviewer |
| `GET` | `/comments?path=/x` | list one page's comments (overlay pins) | reviewer |
| `GET` | `/comments` | list ALL comments (Builder dashboard); optional **`?groupBy=page`** (F9, grouping is primarily client-side) | admin |
| `GET` | `/comments?team=X` | one team's comments, **masked** (team dashboard) | admin **or** team X |
| `POST` | `/team-status` | drive the state machine: `start` · `complete` · **CHANGED (F3)** `reopen` now `{ id, action:'reopen', reason:<enum>, note? }` — non-enum reason ⇒ 400, `note` required iff `other` ⇒ 400; stores both on record + history, human reason label in `statusSummary` | admin |
| `POST` | `/resubmit` | raiser/admin resubmits a `reopened` ticket → new iteration | reviewer/admin |
| `POST` | `/image` | **NEW (F4)** — body `{ id?, dataUrl }` (≤200KB after client downscale); stores KV `img:<uuid>`, returns `{ imageId }`. Never required for comment creation. | reviewer |
| `GET` | `/image?id=X` | **NEW (F4)** — returns `{ dataUrl }` or 404 | reviewer |
| `GET` / `POST` | `/views` | **NEW (F11)** — saved views, KV `views:<team>` (`views:__admin` for admin). `POST { views:[{ name, filters }] }` replaces the caller's set; scoped to the caller's auth. | reviewer/admin |
| `GET` | `/metrics?from=ISO&to=ISO` | **NEW (F12)** — reads the rollup KV `metrics` (full-scan fallback when absent); returns `{ deployedPerPage, volumeByType, avgHoursToDeploy:{ global, perPage }, reopenRate:{ global, perType }, openTrend:[{ date, count }] }` | admin |
| `POST` | `/delete` | delete a whole thread (root + replies) | admin |
| `GET` | `/notifications` (+`?team=X`) | the notification feed (`kind:'reply'` items included) | admin **or** team X |
| `POST` | `/notifications/read` | mark notifications read/unread — `{ ids, read?:boolean=true }` | reviewer |

**Rollup maintenance (F12):** every state transition (`/team-status`, `/resubmit`, creation) also
read-modify-writes the KV `metrics` key — an events array of `{ at, event, page, commentType,
iteration }` capped at 5000 (FIFO) — so metrics compute from the rollup, not by scanning every
`page:` key at 4,000-page scale.

### AI change-prompt provider

The Worker generates each comment's dev-ready change-prompt (now enriched with `comment_type`,
`template_fields`, `expected_outcome`). The provider is **pluggable** (env, no code change):

- **Cloudflare Workers AI** (default) — needs the `[ai]` binding; override the model with `AI_MODEL`.
- **Anthropic (Claude)** — set `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`).

Either way it falls back to a deterministic instruction if the call errors or no provider is set.

---

## Retiring the tool

- Set `PROOFKIT_ENABLED = false` in `config.ts` (removes it from the site output), **or** follow
  `REMOVAL.md` to unwire the four seams while keeping the folder + its `data/` snapshot.
- `wrangler delete` the `shriram-review` Worker and `wrangler kv namespace delete` its store.
