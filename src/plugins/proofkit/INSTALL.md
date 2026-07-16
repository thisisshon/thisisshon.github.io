# Installing Proofkit into a project

Proofkit ships as **one folder** (`proofkit/`). Dropping it into an Astro project is:
**(1) copy the folder, (2) add the thin seams (one layout line + three route shims), (3) edit
`config.ts`, (4) (optional) deploy the Worker.** No build config changes, no dependencies to install.

This file is written so a **Claude Code agent** can do the integration unattended — or a human
can follow the same steps. There's a copy-paste prompt at the bottom.

> **The names Proofkit uses.** Routes `/review` · `/reviewdash` · `/teamdash`; injected component
> `ProofkitOverlay`; build env `PUBLIC_REVIEW_WORKER_URL`; runtime global `window.PROOFKIT_WORKER_URL`;
> deep link `#c=`; Worker `shriram-review`; browser storage keys `pkTeam`, `pkKey`, `pkTheme`,
> `pkAutoReview`, `reviewMode`, `reviewSessionId`, `rvc:`, `rvc-notifications`, `rvc-img:`,
> `rvc-views`. Keep these names when you wire it up.

---

## Prerequisites (what the host project must provide)

- **Astro** (static or hybrid output).
- A **shared layout** component that every page already uses, which accepts an `seo`-style prop
  and renders page content through a default `<slot/>` (this repo's is `src/layouts/BaseLayout.astro`).
- An **SEO type** (this repo: `src/lib/seo.ts`). If the host has none, drop the `seo` prop typing
  and pass plain `{ title, description, path, noindex }` objects.
- Optional: **design tokens** (`--color-*`) and the site font. Proofkit's CSS references a few host
  tokens with hard-coded fallbacks, so it renders fine without them — restyle later for brand parity.
- Optional: a **Cloudflare account** for the shared backend. Without it, Proofkit runs in
  **localStorage demo mode** (single-browser, any password accepted) — with **full parity** for all
  twelve features (batch, screenshots, reopen enums, saved views, metrics).

---

## Steps

### 1. Copy the folder
Place this entire `proofkit/` folder at `src/plugins/proofkit/` in the target project.

### 2. Add the overlay seam (shared layout)
In the host's shared layout, import the config + overlay and render it gated on the switch, just
before `</body>` (or wherever body-end content goes):

```astro
---
import ProofkitOverlay from '../plugins/proofkit/Overlay.astro';
import { PROOFKIT_ENABLED } from '../plugins/proofkit/config';
---
    ...
    {PROOFKIT_ENABLED && <ProofkitOverlay />}
  </body>
```
Adjust the relative path if the layout isn't at `src/layouts/`. The overlay is **dynamic-import
gated** — its core bundle only loads when `reviewMode === '1'`, `pkAutoReview` is set, or a `#c=`
deep link is present, so injecting it on 4,000 pages costs nothing until review mode is armed.

### 3. Add the three route shims (`src/pages/`)
Astro requires route files under `src/pages/`. Create these three thin shims (copy verbatim; adjust
the `BaseLayout` import path + the `seo` prop name to the host's layout API): `/review` (login),
`/reviewdash` (admin/Builder dashboard), and `/teamdash` (per-team dashboard).

`src/pages/review.astro`
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ProofkitLogin from '../plugins/proofkit/Login.astro';
import { PROOFKIT_ENABLED, loginSeo } from '../plugins/proofkit/config';
const offSeo = { title: 'Not Found', description: 'Not available.', path: '/review', noindex: true };
---
{PROOFKIT_ENABLED
  ? <BaseLayout seo={loginSeo} footer="custom"><ProofkitLogin /></BaseLayout>
  : <BaseLayout seo={offSeo} footer="custom"><section class="section"><p>Not available.</p></section></BaseLayout>}
```

`src/pages/reviewdash.astro`
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ProofkitDashboard from '../plugins/proofkit/Dashboard.astro';
import { PROOFKIT_ENABLED, dashSeo } from '../plugins/proofkit/config';
const offSeo = { title: 'Not Found', description: 'Not available.', path: '/reviewdash', noindex: true };
---
{PROOFKIT_ENABLED
  ? <BaseLayout seo={dashSeo} footer="custom" chrome={false}><ProofkitDashboard /></BaseLayout>
  : <BaseLayout seo={offSeo} footer="custom"><section class="section"><p>Not available.</p></section></BaseLayout>}
```

`src/pages/teamdash.astro` — the per-**team** dashboard. Identical shape; one route serves every
team (the team is identified by its login key, not the URL):
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ProofkitTeamDashboard from '../plugins/proofkit/TeamDashboard.astro';
import { PROOFKIT_ENABLED, teamDashSeo } from '../plugins/proofkit/config';
const offSeo = { title: 'Not Found', description: 'Not available.', path: '/teamdash', noindex: true };
---
{PROOFKIT_ENABLED
  ? <BaseLayout seo={teamDashSeo} footer="custom" chrome={false}><ProofkitTeamDashboard /></BaseLayout>
  : <BaseLayout seo={offSeo} footer="custom"><section class="section"><p>Not available.</p></section></BaseLayout>}
```
Both dashboards are full-bleed apps that own their chrome, so render them **without the host site
header/footer**. Above, `footer="custom"` skips the footer and `chrome={false}` skips the header +
nav — both are host-layout specifics. In another project, use whatever your layout offers to omit
its header/footer on these routes (a prop, a bare layout, or a standalone `<html>` shell). Proofkit
is self-themed, so it needs nothing from the host layout but the document shell.

### 4. Configure (`src/plugins/proofkit/config.ts`)
Edit for the new site: `PROOFKIT_ENABLED`, `TEAMS`, `TEAM_COLORS`, `TEAM_ENABLED` (flip a team on/off
everywhere), `HIDE_SELECTORS` (host-page elements to hide while review mode is armed — `[]` if none),
and the three route `SEO` objects (`loginSeo`, `dashSeo`, `teamDashSeo`). Fix the `import type { SEO }`
path if the host's SEO type isn't at `../../lib/seo`. `config.ts` reads the Worker URL from
`import.meta.env.PUBLIC_REVIEW_WORKER_URL`; leave it unset to stay in demo mode.

### 5. (Optional) Deploy the Worker for the shared store
See `README.md` → "The Worker". In short, from `proofkit/worker/`:

1. **Bind the KV namespace** — paste the `COMMENTS` namespace id into `wrangler.toml`
   (`[[kv_namespaces]]`). For a fresh install, `wrangler kv namespace create COMMENTS` and paste the
   id; when upgrading an existing Proofkit, keep the existing binding so prior tickets are preserved.
2. Set `ALLOW_ORIGIN` (the real live origin; `*` only for testing) in `wrangler.toml`. The Worker
   `name` is already `shriram-review`.
3. Set the per-team reviewer keys in `TEAM_KEYS` and `wrangler secret put ADMIN_PASS` (this repo's
   admin password is **`website`** — it must match `config.ts` `REVIEW_PASSWORD_SHA256`, SHA-256 of
   `website`). Optionally `wrangler secret put REVIEW_PASS`.
4. `wrangler deploy` → prints the Worker URL.
5. Expose that URL to the build as `PUBLIC_REVIEW_WORKER_URL` (CI env var, or a git-ignored
   `.env`). The standalone `core/*.html` entries read it from `window.PROOFKIT_WORKER_URL`.

Worker details an integrator should know:
- **`TEAM_KEYS` drive per-team access.** A team's key both **authenticates** the reviewer and
  **scopes** the team-only reads on `/teamdash` — the Worker returns that team's comments and
  notifications and nothing else. The single shared `REVIEW_PASS` still works as an unscoped fallback.
  Team names must match `config.ts` → `TEAMS`.
- **`ALLOW_ORIGIN`** is the CORS lock. (3.0 dropped the old `content-copy-match` completion
  validation, so it no longer doubles as a fetch origin — *Mark Complete* is a manual
  self-attestation.)
- **Admin sign-in has two doors.** Direct password login at `/review`, **or** the `/teamdash` login
  dropdown's **Builder** option (`config.ts` `ADMIN_TEAM = 'Builder'`) — a login-only identity that
  maps to admin. Builder's "key" is the admin password (`ADMIN_PASS`); it has no `TEAM_KEYS` entry.
- **Directed comments.** Each comment carries `toTeam` (the composer's "Direct to", default
  `Builder`); `GET /comments?team=X` returns the inbox **directed to** X (`toTeam === X`).
- **3.0 endpoints** (all bundled in `worker.js` — no integrator action beyond deploying): `POST
  /comments` accepts a **single object or an array** (batch, F2); `POST /team-status` reopen is now
  `{ id, action:'reopen', reason:<enum>, note? }` (F3); `POST /image` + `GET /image?id=X` store/read
  the `img:` screenshots (F4); `GET`/`POST /views` persist saved views (F11); `GET /metrics` reads the
  rollup `metrics` key (F12). A `parentId` reply fires a `kind:'reply'` notification and never changes
  status (F6). See `README.md` → Endpoints for the full table.

### 6. Verify
`npm run build` should pass. With `PROOFKIT_ENABLED = true`: open `/review` → sign in → it arms
review mode and lands on the dashboard. Now open any content page → a **Comment** button appears →
click → (Team + Key login) → grayscale review mode → click an element to **draft** a comment (pick a
change type, fill the fields) → it lands in the **Pending pins** tray → **Submit all**. Before signing
in at `/review`, no Comment button shows. Flip `PROOFKIT_ENABLED` to `false` and rebuild → overlay
gone, all three routes are stubs.

---

## Updating an existing copy

Proofkit is versioned (`VERSION` + `package.json` + `CHANGELOG.md`). To update a project that has an
older copy: compare its `proofkit/VERSION` to the new one; if older, **replace the whole
`src/plugins/proofkit/` folder** with the newer package, then re-apply any local `config.ts` edits
(teams/colours/enabled-flags/hide-selectors are the usual local deltas). The seams (steps 2–3) rarely
change — check the changelog's "seams" notes before overwriting.

### Upgrading an existing Proofkit install (to 3.0)

3.0 is an **in-place upgrade** — same routes, same storage keys, same Worker, same KV. To upgrade:

1. **Replace the folder contents** — swap `src/plugins/proofkit/` for the 3.0 package, then re-apply
   any local `config.ts` edits.
2. **Keep the existing `worker/wrangler.toml`** — in particular its `[[kv_namespaces]]` binding — so
   the store (and every prior ticket) is preserved. Only merge in any new config keys the changelog
   flags; do not point the Worker at a new namespace.
3. **Redeploy the Worker** — `wrangler deploy` from `proofkit/worker/` to ship the 3.0 `worker.js`
   (batch, image, views, metrics endpoints). Existing records are **backward-compatible** — the new
   fields default in, so old tickets render unchanged.

Until the Worker is redeployed, the tool runs in **localStorage demo mode**. The seams (steps 2–3)
are unchanged from 2.x, so existing route shims and the layout line stay as-is.

---

## Prompt for a Claude Code agent

> Install the Proofkit content-review tool into this project. The package is at
> `src/plugins/proofkit/` (or unzip it there). Read `src/plugins/proofkit/INSTALL.md` and
> `README.md`, then: (1) add the gated `{PROOFKIT_ENABLED && <ProofkitOverlay />}` line to this
> project's shared layout with the correct import path (import it as `ProofkitOverlay` from
> `../plugins/proofkit/Overlay.astro`); (2) create the `src/pages/review.astro`,
> `src/pages/reviewdash.astro`, and `src/pages/teamdash.astro` route shims, adapting the
> `BaseLayout` import and `seo` prop to this project's layout API; (3) fix the `SEO` type import path
> in `config.ts` if needed; (4) leave `PROOFKIT_ENABLED = true` and the Worker in localStorage demo
> mode (`PUBLIC_REVIEW_WORKER_URL` unset) for now. Then run the build and confirm it passes.
