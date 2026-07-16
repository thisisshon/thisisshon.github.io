# Removing Proofkit (keep the folder, keep the data)

The goal is **not** to delete `src/plugins/proofkit/`. Removal means: take Proofkit
out of the built site (unwire it from the code) and **contain all the collected
review data inside this folder**, so the package sits dormant and re-addable and
nothing that reviewers captured is lost.

Removing it touches **only** its own `/review` · `/reviewdash` · `/teamdash` seams —
the four thin wiring points listed in Step 2.

## Step 1 — Contain the collected data

The review comments do **not** live in the repo — they're in the Cloudflare KV
namespace `COMMENTS` (bound in `worker/wrangler.toml`). Snapshot them into this
folder first:

1. Sign in to the admin/Builder dashboard (`/reviewdash`).
2. Toolbar → **Copy ▸ Download JSON**. This writes `proofkit-comments.json`
   containing the **full** comment set (the dashboard's in-memory `all`, every page
   and team — not the filtered view). See `core/dashboard.js` → `downloadJSON()`.
3. Save it into **`src/plugins/proofkit/data/`** (see that folder's README), dated,
   e.g. `data/proofkit-comments-2026-07-14.json`.

Optional byte-exact backup (also grabs notifications, settings, ticket counters):

```sh
cd worker
wrangler kv key list   --binding COMMENTS > ../data/kv-keys.json
# then dump each key's value, or use the dashboard export above for the comments.
```

Once the snapshot is in `data/`, the collected data travels with the (retained)
folder even after the Worker/KV is gone.

## Step 2 — Unwire Proofkit from the code (folder stays)

Everything Proofkit touches **outside this folder** is exactly these wiring points.
Remove/neutralise these; do **not** touch `src/plugins/proofkit/`:

1. **Site-wide overlay** — `src/layouts/BaseLayout.astro`: remove the
   `import ProofkitOverlay` + `import { PROOFKIT_ENABLED }` lines and the
   `{PROOFKIT_ENABLED && <ProofkitOverlay />}` render.
2. **Route shims** — `src/pages/`: `review.astro`, `reviewdash.astro`,
   `teamdash.astro`. These three thin adapters are **not** part of the package folder.
3. **404 router** — `src/pages/404.astro` doubles as the `/<page>/review` router:
   drop the `review` guarded-redirect block (the `PROOFKIT_ENABLED` import + the
   `/review` branch), keeping the plain 404 message.
4. **Build/deploy (optional)** — if the shared store was wired, remove
   `PUBLIC_REVIEW_WORKER_URL` from the CI env / `.env`.

After this, `grep -rn "plugins/proofkit\|PROOFKIT_ENABLED\|ProofkitOverlay" src/pages
src/layouts src/components` returns nothing, the build emits no Proofkit routes, and the
site is identical to one that never had it — while `src/plugins/proofkit/` (now holding its
own `data/` snapshot) stays in the repo, ready to re-wire later.

## Quick disable instead (fully reversible, one line)

If you just want it *off* without unwiring, set `PROOFKIT_ENABLED = false` in
`config.ts`: the overlay stops loading site-wide and the routes render an empty
stub (already unlisted from the sitemap). Everything — folder, wiring, data —
stays in place.

## Step 3 (optional) — tear down the Worker / KV

Only **after** the `data/` snapshot is confirmed: `wrangler delete` the
`shriram-review` Worker and `wrangler kv namespace delete` its `COMMENTS` KV
namespace. Skip this to keep the store live for a later re-enable.
