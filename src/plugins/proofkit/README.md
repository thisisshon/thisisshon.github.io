# Proofkit

**A self-contained, toggleable, portable content-review tool.** An on-page
click-to-comment overlay for reviewing the **live** site plus **two dashboards** — an
**admin** dashboard and a per-**team** dashboard — backed by a Cloudflare Worker.
Non-technical teams (Product / SEO / Marketing / Content) walk the real site, drop numbered
comments on any element, and admins triage them — each with an auto-generated, developer-ready
**AI change-prompt**. Actioned changes move through a **deploy gate**: admins mark them complete
into a silent bucket, then **Deploy** publishes the bucket and notifies each team — so a team only
ever sees a change once it's actually live.

Proofkit is a **versioned package**: the whole tool is one folder (`proofkit/`) that zips up
and drops into any Astro / Claude Code website project. It lives inside its host repo as the
canonical source (so it stays seamlessly integrated), and the zip is just an export of the
folder. See **`INSTALL.md`** to add it to a project and **`CHANGELOG.md`** / **`VERSION`** for
release tracking.

- **Version:** see `VERSION`.
- **Turn it on/off:** one line — `PROOFKIT_ENABLED` in `config.ts`.
- **Theme it:** one line — `THEME` in `config.ts` (`red-moon` | `dark-cream`); the active theme's
  `--pk-*` tokens reskin both the dashboard and the on-page overlay.
- **Move it:** copy the folder + add four thin seams (one layout line + three route shims — see
  `INSTALL.md`), or use `scripts/sync.mjs`
  (`push` / `pull` / `check`) to copy it between projects with a semver guard.

> **⚠️ Keep the docs current.** `README.md` (what it does) + `INSTALL.md` (how to integrate) are
> the source of truth that travels with the package. **Any change to the tool's behaviour, files,
> config, endpoints, or auth must be reflected here — and the version bumped** (`VERSION` +
> `package.json` + a `CHANGELOG.md` entry) — otherwise the "portable + documented + updatable"
> promise breaks the next time someone lifts it.

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

---

## What it does (use cases & abilities)

**On-page overlay** (`Overlay.astro`, injected site-wide by the host layout)
- Sign in at `/review` to arm the tab; the host's back-to-top FAB (see `HIDE_SELECTORS`) is then
  replaced by a **Comment** button on every page. Before sign-in nothing renders (no Comment
  button), and it never arms on the tool's own `/review` + `/reviewdash` pages.
- The Comment button opens a two-field login — a **Team** dropdown (sourced from `config.ts`
  `TEAMS`, sorted alphabetically) and a **Key** (the shared passcode, validated against the
  Worker). The chosen team is session-global for the tab (stored in `TEAM_KEY`), so it is picked
  **once at login**, not per comment.
- Enter review → the page desaturates (grayscale) but stays scrollable; existing comments show as
  **numbered pins** anchored to their elements (pins re-project each frame, so they track reflow;
  they fall back to page coords if the selector no longer matches).
- Click any element to **add a comment**: name, free-text, and — for the Content team — a
  "change it to…" replacement field (the team comes from the login, shown as a chip). Threaded
  **replies** on each pin.
- A comment navigator (count + prev/next) and deep links (`#c=<id>`) that jump to a pin.
- **Add-only** — comments are never edited or deleted from the page (that's admin-side).

**Admin dashboard** (`Login.astro` = `/review`, `Dashboard.astro` = `/reviewdash`)
- **Two doors in.** Either sign in directly at `/review` (the password gate; on success it redirects
  to `/reviewdash`, which keeps its own gate so hitting it directly still prompts), **or** pick
  **Design (Admin)** in the `/teamdash` login dropdown and enter the admin password — that identity
  (`config.ts` `ADMIN_TEAM = 'Design'`) maps to admin and redirects to `/reviewdash`. Design is a
  login identity only — it is **not** in `TEAMS`, so it never appears in the comment composer or team
  filters. Full access — every team's comments.
- Left-sidebar IA: **Overview · Deploy · Notifications · Master Log**.
- Overview tabs: **All / By Page / Open / In Bucket / Deployed / Closed**; team-colour filter chips;
  live counts; 30s auto-refresh + on-focus refresh. The **All** tab is the active worklist —
  open + in-bucket only; **deployed/published items are excluded** (they stay under the Deployed tab
  and in Master Log). Overview cards are built for large content: a clamped comment body with
  Show more/less, a height-capped Change-to callout, collapsible replies, and wrap-safe containers.
- **Master Log** is the full record — a per-entry table (When / Page / Element / Team / Status /
  Prompt) of **all** root entries, including deployed ones. Each row has a **"View more"** drill-in
  detail view showing everything about the entry (comment, Change-to copy, page link, element/anchor,
  reviewer + team, AI change-prompt, current status + validation) plus a **status-history timeline**
  built from the comment's `history` (past → current, each stamped) — synthesized from the timestamps
  for older records that predate the field. The AI change-prompt is a precise, ready-to-hand-to-a-dev
  instruction generated by the Worker (with a copy button).
- Admins set a comment's **working status** — **Mark Complete** / re-open / **Close** — and **delete**
  threads. Mark Complete runs **completion validation** (below) and moves the comment into the
  **deploy bucket** (silent — the team still sees *Pending*).
- **Deploy** view — the bucket of completed/closed-but-unpublished comments + a batch **Deploy**
  button; deploying publishes the whole bucket and fires the team notifications.
- **Notifications** view — the full deploy/notification feed with unread tracking and a
  per-notification **read/unread toggle** (plus "Mark all read").

**Team dashboard** (`TeamDashboard.astro` = `/teamdash`) — *new in 2.5.0*
- **One route for every team.** A team signs in with **its own team key** and picks its team; the
  Worker returns **only that team's** comments (server-side isolation via the masked
  `GET /comments?team=X`) and that team's notifications. The team is identified by the **login key,
  not the URL** — there is no per-team URL to leak or guess.
- Teams see a **masked** view: each comment shows only `published ? publishedStatus : 'open'` — i.e.
  *Pending* until a change is actually Deployed, then *Done* — never the admin's working status,
  validation, or AI prompt.
- A **Notifications** feed tells the team when their comments go live (one per published root comment,
  created on Deploy), with unread badges and a per-notification **read/unread toggle**.

**The deploy-gated lifecycle** — *new in 2.5.0*

Every comment now carries **two truths**: the admin's **working** `status` (`open` | `completed` |
`closed`, admin-only) and **what the team sees** (`published ? publishedStatus : 'open'`). Nothing
the admin does is team-visible until **Deploy**:

```
Comment posted (team)   status='open', published=false        → team sees "Pending"
  ↓ admin actions it in code, rebuilds the live site
Mark Complete           status='completed'  (runs validation)  → sits in the DEPLOY BUCKET (silent)
Deploy (batch)          published=true, publishedStatus=status → notifications fire → team sees "Done"
```

- **Completion validation** (content changes only). On Mark Complete, if the comment carries
  replacement copy (`changeTo`), the Worker fetches the **live page** (`ALLOW_ORIGIN` + path) and
  confirms the new copy is present — `validation.method = 'content-copy-match'`; otherwise `'manual'`.
  The result is stored on `validation:{ ok, method, detail, checkedAt }` and shown on the admin card
  (a ⚠ flag if not yet verified on the live page). Completing is **allowed even when unverified** — the
  site may be redeployed afterwards, and the admin can re-run Mark Complete to re-check.
- **Notifications** are created **only by Deploy**, one per newly-published root comment, in the KV
  key `notifications`. Both the admin (all) and each team (own) read their feed; unread is tracked per
  audience (`readAdmin` / `readTeam`).

**Two-tier auth** (enforced server-side by the Worker)
- **Reviewer key** — add comments + read a page's pins, and (on `/teamdash`) read the signing team's
  own comments + notifications. Either a **per-team key** from the `TEAM_KEYS` var (a JSON map
  `{"Product":"…","SEO":"…"}` in `wrangler.toml`; the team's key both authenticates **and** scopes the
  team-only reads to that team) or the single shared `REVIEW_PASS` fallback (no team scope).
- **Admin** (`ADMIN_PASS`) — the admin dashboard: read ALL comments, set status, deploy, delete, all
  notifications. Admin ⊃ reviewer (an admin may read any team's scoped feed too).

**Storage modes**
- **Shared/live** — when `WORKER_URL` is set (via `PUBLIC_REVIEW_WORKER_URL`), everyone reads/writes
  the same Cloudflare KV store.
- **Local demo** — when it's unset, comments live in the browser's `localStorage`, so the whole flow
  is testable before the backend exists (any password is accepted).

---

## Package contents

```
proofkit/
  config.ts        THE switch + all site-specific values (teams, colours, hide-selectors,
                   worker URL, route SEO). The one file to edit when porting.
  Overlay.astro    On-page click-to-comment overlay (injected site-wide by the host layout).
  Login.astro      The /review auth gate (guts; rendered by the route shim).
  Dashboard.astro  The /reviewdash ADMIN dashboard (guts; rendered by the route shim).
  TeamDashboard.astro  The /teamdash per-TEAM dashboard (guts; rendered by the route shim).
  worker/
    worker.js      Cloudflare Worker: KV comment store + notifications + two-tier auth +
                   deploy gate + completion validation + AI prompt gen.
    wrangler.toml  Worker config (name, ALLOW_ORIGIN, KV id, TEAM_KEYS, AI binding).
  README.md        This file — what Proofkit is.
  INSTALL.md       How to drop it into a project (human + Claude Code agent steps).
  CHANGELOG.md     Release history. Bump on every change.
  VERSION          Semver — the number a host compares to detect an outdated copy.
  package.json     Package identity (name, version, entrypoints, host requirements).
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

See **`INSTALL.md`** for the exact seam code and the Claude Code install prompt.

Design-token note: `Dashboard.astro` / `TeamDashboard.astro` CSS references host tokens
(`--color-cream-*`, `--color-olive-900`, `--color-surface-dark-card`) with hard-coded fallbacks,
and the overlay uses
the `Outfit` font with a `system-ui` fallback stack. It renders fine without those tokens; restyle
for brand parity.

---

## The Worker (backend)

**Not part of the Astro build** — it deploys separately to Cloudflare Workers. Until it's deployed,
Proofkit runs in **local-demo mode** (browser `localStorage`).

All commands run from `proofkit/worker/`.

1. **Install Wrangler & log in** — `npm install -g wrangler` then `wrangler login`.
2. **Create the KV store** and paste the printed id into `wrangler.toml` (`[[kv_namespaces]]`):
   `wrangler kv namespace create COMMENTS`.
3. **Set the site origin** in `wrangler.toml` → `ALLOW_ORIGIN` (e.g. `https://owner.github.io`; `*`
   only for testing). Also set a project-specific `name`. **`ALLOW_ORIGIN` has two roles:** it's the
   CORS lock **and** the base URL the Worker fetches when validating a completed content change — so
   it must be the real live origin (not `*`) for content-copy-match auto-verification to work.
4. **Set the passwords:** put the per-team reviewer keys in `wrangler.toml` → `TEAM_KEYS` (a JSON
   map), and set the admin password with `wrangler secret put ADMIN_PASS`. (Optionally
   `wrangler secret put REVIEW_PASS` for one shared reviewer key too.)
5. **Deploy:** `wrangler deploy` → prints the Worker URL.
6. **Wire it up** — expose that URL to the build as `PUBLIC_REVIEW_WORKER_URL` (CI env var, or a
   git-ignored `.env`). `config.ts` reads it as `WORKER_URL`.

### Endpoints (reference)

Auth via header `X-Review-Pass`. "reviewer" = a valid team key or `REVIEW_PASS`; "team X" = the
team whose `TEAM_KEYS` value equals the pass. Admin ⊇ reviewer.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/comments` | add a comment | reviewer |
| `GET` | `/comments?path=/x` | list one page's comments (overlay pins) | reviewer |
| `GET` | `/comments` | list ALL comments (admin dashboard) | admin |
| `GET` | `/comments?team=X` | one team's comments, **masked** (team dashboard) | admin **or** team X |
| `POST` | `/status` | set the working status (`open` / `completed` / `closed`); `completed` runs validation | admin |
| `POST` | `/resolve` | **back-compat alias** of `/status` (legacy `resolved` ⇒ `completed`) | admin |
| `POST` | `/deploy` | publish the whole bucket (completed+closed, unpublished) + fire notifications | admin |
| `POST` | `/delete` | delete a whole thread (root + replies) | admin |
| `GET` | `/notifications` | the deploy/notification feed — all | admin |
| `GET` | `/notifications?team=X` | the notification feed — team X's | admin **or** team X |
| `POST` | `/notifications/read` | mark notifications read/unread — body `{ ids, read?:boolean=true }`, `read:false` un-reads (`readAdmin` if admin, `readTeam` if team) | reviewer |

**Comment-record fields** (KV `page:<encoded path>` → array; all backward-compatible, missing ⇒
default): `status` (`open` | `completed` | `closed` — the admin's working status), `published`,
`publishedStatus` (snapshot at Deploy — what the team sees), `completedAt`, `closedAt`, `publishedAt`,
`validation` (`{ ok, method:'content-copy-match'|'manual', detail, checkedAt }`),
`history` (an audit trail — an array of `{ status, at, event, published }` where `event` ∈
`'created' | 'status' | 'deployed'`, appended on create, on `/status`, and on Deploy; older records
missing it are synthesized in the UI from the timestamps), plus the existing
`id / createdAt / parentId / sessionId / team / name / comment / changeTo / aiPrompt / page / anchor`.
The **masked** team projection (`GET /comments?team=X`) collapses `status` to
`published ? (publishedStatus||'open') : 'open'` and omits `aiPrompt`, `validation`, and the working
status/timestamps.

**Notifications** live under the single KV key `notifications` (array), created only by `/deploy` —
one per newly-published root comment: `{ id, createdAt, team, commentId, path, pageName,
publishedStatus, summary, readTeam, readAdmin }`.

The team-visible status therefore has **two values** — *Pending* (`open`) and *Done* (published
`completed`/`closed`); the admin's richer working lifecycle stays behind the deploy gate.

### AI change-prompt provider

The Worker generates each comment's dev-ready change-prompt. The provider is **pluggable** (env,
no code change):

- **Cloudflare Workers AI** (default) — needs the `[ai]` binding. Override the model with an
  `AI_MODEL` var in `wrangler.toml` (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
- **Anthropic (Claude)** — set the `ANTHROPIC_API_KEY` secret (`wrangler secret put
  ANTHROPIC_API_KEY`); the Worker then calls Claude instead. Model overridable via the
  `ANTHROPIC_MODEL` var (default `claude-haiku-4-5-20251001`).

Either way it falls back to a deterministic instruction if the call errors or no provider is set.

---

## Retiring the tool

- Set `PROOFKIT_ENABLED = false` in `config.ts` (removes it from the site output), **or** delete the
  `proofkit/` folder + the four seams to remove it from the codebase entirely.
- `wrangler delete` the Worker and `wrangler kv namespace delete` the store.
