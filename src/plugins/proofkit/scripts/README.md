# Proofkit sync — package propagation tool

`sync.mjs` copies the self-contained Proofkit package (`src/plugins/proofkit/`) between
projects and version-checks copies so an outdated one can be detected and refreshed.
It is **dev tooling only** — nothing here is needed at runtime, and it is deliberately
**excluded from the copy** so it never ships into a target project.

Node built-in modules only. No npm dependencies. Run it with any Node that supports ESM.

## Subcommands

| Command | What it does |
|---|---|
| `push <target-project-root>` | Copy **this** package into `<target>/src/plugins/proofkit/`. |
| `pull <source-project-root>` | Copy the package **from** `<source>/src/plugins/proofkit/` into this repo. |
| `check <other-project-root>` | Compare `VERSION` files (semver) and report which is newer. No copying. |

### Examples

```sh
# From this repo root:

# See which copy is newer (no changes made)
node src/plugins/proofkit/scripts/sync.mjs check ../other-project

# Push this package out to another project (guarded by the version check)
node src/plugins/proofkit/scripts/sync.mjs push ../other-project

# Pull a newer copy back into this repo
node src/plugins/proofkit/scripts/sync.mjs pull ../other-project

# Overwrite the guard when you really mean it
node src/plugins/proofkit/scripts/sync.mjs push ../other-project --force
```

## Version guard

Before a `push`/`pull` copy, both `VERSION` files are read and compared with a plain
`x.y.z` semver compare (major, then minor, then patch). The tool prints:

```
source X.Y.Z → destination A.B.C
```

- If the **destination is the same or newer** than the source, the copy is **refused**
  (exit code `1`) — unless `--force` is passed as the last argument.
- If the **destination does not exist yet**, it is treated as a fresh install and proceeds.

`check` never copies; it just prints both versions and which way to sync.

## Exclude list

These names are skipped anywhere in the tree during a copy:

```
node_modules   .wrangler   .git   scripts   .DS_Store
```

`scripts/` (this folder) is excluded on purpose — the sync tool is dev-only and should
not land in target projects.

## After a `push`

Copying the package is not the whole install. The target project still needs the
host seams, documented in [`../INSTALL.md`](../INSTALL.md):

1. The gated line in the shared layout — `{PROOFKIT_ENABLED && <ProofkitOverlay />}`
2. `src/pages/review.astro` route shim (login)
3. `src/pages/reviewdash.astro` route shim (admin/Builder dashboard)
4. `src/pages/teamdash.astro` route shim (per-team dashboard)

Then (optionally) set `PUBLIC_REVIEW_WORKER_URL` and deploy the `shriram-review`
worker; leave it unset to stay in localStorage demo mode.
`sync.mjs` prints a short reminder after every successful `push`/`pull` (its printed text
lists the three route shims — see INSTALL.md for the full seam set).

## Exit codes

- `0` — success (copy done, or `check` completed).
- `1` — error (missing/bad arguments, missing paths) or a refused copy (version guard).
