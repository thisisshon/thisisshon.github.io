# Content-review Worker

Backend for the `ReviewOverlay` tool and the `/review` page. Stores
comments in **Cloudflare KV** and gates every request with a shared passcode.

**Not part of the Astro build** — it deploys separately to Cloudflare Workers.

> Until this is deployed, the tool runs in **local-demo mode**: comments are kept
> in your browser's `localStorage`, so you can try the overlay + dashboard on your
> own machine before standing up the backend. Deploying the Worker + setting
> `PUBLIC_REVIEW_WORKER_URL` switches it to the shared, everyone-sees-everything
> mode.

## Setup (you've already created the Cloudflare account)

All commands run from this `review-worker/` folder.

1. **Install Wrangler & log in**
   ```bash
   npm install -g wrangler
   wrangler login          # opens the browser, authorises your Cloudflare account
   ```

2. **Create the KV store**
   ```bash
   wrangler kv namespace create COMMENTS
   ```
   It prints something like `id = "abc123…"`. **Paste that id** into
   `wrangler.toml` (the `[[kv_namespaces]]` block).

3. **Set the site origin** in `wrangler.toml` → `ALLOW_ORIGIN`
   (e.g. `https://owner.github.io`). This locks the Worker to your site.

4. **Set the passcode** (the content team types this once per browser tab)
   ```bash
   wrangler secret put REVIEW_PASS
   ```

5. **Deploy**
   ```bash
   wrangler deploy
   ```
   Wrangler prints the Worker URL, e.g. `https://shriram-review.<you>.workers.dev`.

## Wire it to the site

Create a **git-ignored** `.env` in the repo root:

```
PUBLIC_REVIEW_WORKER_URL=https://shriram-review.<you>.workers.dev
```

Rebuild/redeploy the site. The overlay and dashboard now read/write the shared
KV store instead of local browser storage.

## How the team uses it

- **Review a page:** open any page with `?review=1` (e.g.
  `https://owner.github.io/mutual-funds?review=1`). The back-to-top button is
  replaced by a **Comment** button. Click it → the page goes black-and-white
  (review mode) → existing comments show as numbered pins → click anywhere to add
  a new one. Click a pin to read it. Comments can only be **added** — never edited
  or deleted from the page.
- **Manage everything:** open `/review?review=1` — every comment across
  the site, where it sits on its page, who wrote it, and open/resolved status.
  Resolving happens here (admin side), not on the page.

## Endpoints (reference)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/comments` | add a comment |
| `GET` | `/comments?path=/x` | list one page's comments (overlay pins) |
| `GET` | `/comments` | list all comments (dashboard) |
| `POST` | `/resolve` | set a comment open/resolved |
| `POST` | `/delete` | delete a whole thread (root + replies) |

All require header `X-Review-Pass: <REVIEW_PASS>`.

## Retiring the tool

- Remove `<ReviewOverlay />` from `src/layouts/BaseLayout.astro` (+ the import)
  and delete `src/pages/review.astro`.
- `wrangler delete` the Worker and `wrangler kv namespace delete` the store.
