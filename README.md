# thisisshon.github.io

Static hosting for the plugins in the private `plugins` monorepo.

| URL | What |
|---|---|
| `/` | Plugin index — lists ProofKit (live) and Greenroom (not integrated yet) |
| `/proofkit/` | ProofKit boards, one per login identity |
| `/proofkit/builder` | Builder (admin) board |
| `/proofkit/<team>` | That team's board — product, seo, marketing, content, design, business |
| `/proofkit/<identity>/<view>` | notifications · threads · patterns · insights · settings |

## This repository is generated — do not edit it by hand

Everything here is build output. The source of truth is the private `plugins` repo:

```bash
node proofkit/site/build.mjs        # writes proofkit/site/dist/
```

Then copy `dist/` over this repo's contents and push. Editing files here directly will be
overwritten by the next build.

Each route is emitted as a real directory with its own `index.html`, so
`/proofkit/builder/insights` is a genuine 200 rather than a 404-fallback — the boards route on
`location.pathname` and a static host has no server to map those to a component.

## Auth and data

The pages are public; the data is not. Every board requires a team + key, and the Cloudflare
Worker enforces access server-side on every read — a hand-edited URL cannot reveal another team's
tickets. Nothing secret ships in this bundle.

The Worker URL is baked in at build time. Append `?worker=<url>` to point a board at a different
backend without rebuilding, or `?worker=` to clear the override.

## History

Before 2026-08-05 this repository held an early draft of the Shriram Financial Services site. That
site moved to its own host and is unaffected by this change; the full history remains in this
repo's git log (see commit `367fe8c`).
