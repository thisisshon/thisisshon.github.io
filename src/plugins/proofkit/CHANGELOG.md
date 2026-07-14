# Proofkit — changelog

Bump the version here **and** in `package.json` + `VERSION` on every change to the tool.
The `VERSION` file is the single number a host project compares against to detect an
outdated copy when re-syncing the package (see `INSTALL.md` → "Updating an existing copy").

The version is the package's, not the host site's — it travels with the folder.

## 2.21.0 — 2026-07-14 — team-dashboard card redesign (Figma) — two-column layout

- Rebuilt the /teamdash "For Action" card to the Figma two-column layout (node 1287:7748): the LEFT
  column holds the comment, a "Selected element: “snippet” on <page>" line (page underlined), the
  "Raised By <team>" / "To <team>" direction, and the Open Pin + View details actions; the RIGHT rail
  holds the status chip + ticket, then a "HH:MM:SS | D Month, YYYY" timestamp. Pending cards take a
  full brand-red border; done/closed keep a coloured left accent. Built on --pk-* tokens so LIGHT
  matches the Figma exactly (#f8f7f3 surface etc.) and DARK adapts automatically.

## 2.20.0 — 2026-07-14 — UAT posture: unlisted routes + clean-removal doc

Prep for the UAT push. No behavioural change to the tool itself; this is about its **surface**.

- **Admin routes unlisted from the public sitemap.** `astro.config.mjs` now passes a `sitemap()`
  `filter` that drops `/review`, `/review-guide`, `/reviewdash[/*]` and `/teamdash` (seam: the public
  sitemap no longer advertises Proofkit). Routes stay reachable for reviewers who know the URL; they
  remain `noindex` via their per-route SEO objects here. The whole UAT site is also `noindex` via
  BaseLayout + a new `public/robots.txt`.
- **`REMOVAL.md` added.** Documents the exact one-shot removal (disable = flip `PROOFKIT_ENABLED`;
  full = delete the package folder + the four route stubs + `reviewdash/` + the 404 router block +
  the `PUBLIC_REVIEW_WORKER_URL` env + the sitemap filter entries). Makes "remove Proofkit cleanly,
  no traces" a fixed checklist.

## 2.19.0 — 2026-07-14 — design-system compliance sweep (fonts · grid · tokens · alpha)

Brings the whole tool onto the site's design-system rules. Verified in-browser on `/reviewdash` +
`/teamdash` in both light and dark.

- **One font — Outfit — everywhere (rule 3).** `--pk-font` was `Inter`; it is now Outfit, and the
  dashboards actually **load** Outfit (their route shells `reviewdash.astro`/`teamdash.astro` and the
  standalone `core/*.html` add the Google-Fonts `<link>` — they render outside the host BaseLayout).
  Removed the `--pk-font:system-ui` overrides that had crept into `dashboard.css`/`teamdash.css`.
  Killed every second face: the monospace ticket + AI-prompt text now use Outfit with
  `font-variant-numeric:tabular-nums`; deleted the dead `.rv-login-*` overlay block (which pulled in
  Inter) and its Inter font-loader; dropped the unused `--pk-mono` token.
- **Spacing on the 4/8 grid (rule 6).** Snapped ~120 off-grid values (5/6/7/9/10/11/14/18/22/26/38/46/58px
  → nearest 4/8 step) across `dashboard.css`, `teamdash.css`, `login.css`, `components.css` and the
  overlay's inline CSS. Only structural 1–2px hairlines/separators/border-overlaps are intentionally kept.
- **No alpha colour fills (rule 5).** The two real offenders — the login-glow radial gradient and the
  "securing" shimmer — now use solid tokens (`--pk-red` / `--pk-on-accent`) + the `transparent` keyword
  faded by the `opacity` property. Shadows and frosted `backdrop-filter` scrims keep their translucency
  (explicitly allowed by rule 5).
- **Everything on tokens (rule 9).** Promoted the bespoke status-tint palette to semantic per-theme
  tokens — `--pk-open/done/closed/new-bg`+`-ink`, `--pk-callout-bg/-line`, `--pk-active-bg`,
  `--pk-thead-bg`, plus `--pk-on-accent` (always-white on-fill ink) and `--pk-brand-gold`. Chips,
  callouts, banners, active-nav and the table header now theme automatically, so the entire
  `[data-pk-theme="light"]` tint-override block in both dashboards was **deleted** (light == the light
  token values). `components.css` is now 100% token-bound; only a couple of structural one-offs remain
  (the `#141414` route floor, one light selection tint, one overlay control grey).
- No endpoints/auth/config/data changes — CSS/markup + token definitions only.

## 2.18.1 — 2026-07-14 — pages always shown by the friendly naming convention

- Pages are now labelled by the **friendly `pageName()` convention everywhere** — "Equity", "Home Page" —
  never the raw SEO `<title>` (e.g. "Buy Equity Stocks - NSE & BSE | Shriram Financial Services").
- **At capture** (`overlay.js`): a new comment stores `page.title = pageName(path)` (the friendly name)
  instead of `document.title`; the raw title is preserved separately as `page.docTitle`. This makes the
  Worker- and locally-generated **notification summaries** read the friendly name for all new comments.
- **At render**: notification page links now always compute `pageName(n.path)` and ignore any stored
  full-title `pageName` (`dashboard.js` + `teamdash.js`), so **existing** notifications display the
  friendly name too. (Old baked summary *sentences* keep their original text; only new ones regenerate.)
- **`PAGE_NAMES['/']` "Homepage" → "Home Page"** to match the stated convention.
- No endpoints/auth/config changes; the Master Log, cards and detail views already used `pageName()`.

## 2.18.0 — 2026-07-14 — per-team individual light/dark toggle

- **Every team dashboard (`/teamdash`) now has its own light/dark toggle**, in the same position as the
  admin's (top-right of the headband, beside the H1). It is an **individual, per-browser** control —
  distinct from the admin's GLOBAL theme: flipping it changes only that person's view and is **never**
  written to the Worker.
- **Remembered across logins.** The choice persists in localStorage (`pkTheme`); the next login on that
  browser opens in the last-used mode. Team boards no longer follow the admin's global theme or the live
  `/events` push — they self-manage (`initLocalTheme()` instead of `initTheme()`).
- New `config.js` exports: `toggleLocalTheme()` (local-only flip) and `initLocalTheme()` (apply the
  remembered local choice, no global reconcile / no SSE). `buildThemeToggle(opts)` + `mountThemeToggle(sel,
  opts)` now take `{ local:true }`; the admin dashboard keeps the global toggle unchanged.
- Markup/CSS: team headband gains a `.tmd-headband-row` + `.tmd-headtoggle` slot mirroring the admin
  (`TeamDashboard.astro` + `core/teamdash.html` + `core/teamdash.css`); toggle styles reuse the shared
  `.pk-tt` component. No endpoints/auth/config/data changes.

## 2.17.2 — 2026-07-14 — "Deploy" → "Delivery" wording

- Admin side-nav item **"Deploy" → "Delivery"** (`Dashboard.astro` + `core/dashboard.html`); the internal
  `data-view="deploy"` key is unchanged.
- The bucket view heading **"Deploy Bucket" → "Delivery Queue"** (`renderDeploy()` in `dashboard.js`).
- Copy-only; the Deploy CTA button, "Deployed" status label, "in bucket" count and empty-state text are
  left as-is. No endpoints/auth/config/data changes.

## 2.17.1 — 2026-07-14 — dashboard heading copy

- Admin dashboard H1 **"Review and Bug Testing" → "Admin Console"** (`Dashboard.astro` + `core/dashboard.html`).
- Team dashboard H1 is now the **team's own name + " Team"** — e.g. `SEO Team`, `Content Team` — set at
  render time from the signed-in team (`renderHeader()` in `teamdash.js`); the static markup falls back to
  a bare "Team" for the pre-JS paint (`TeamDashboard.astro` + `core/teamdash.html`).
- Copy-only; no endpoints/auth/config/data changes.

## 2.17.0 — 2026-07-14 — ticket numbers on every comment

- **Every raised comment now gets a ticket number** of the form **YYMMDD + a 4-digit per-day serial**
  (0001–9999) — e.g. a comment on 2026-07-14 is `2607140001`, the next `2607140002`, reset each day.
  Stamped once at creation onto `rec.ticket` (root **and** reply — every comment is tagged), immutable
  thereafter.
- **Worker** (`POST /comments`): the serial is a per-day KV counter `ticketseq:<YYMMDD>` incremented
  read-modify-write per comment (`nextTicket()`); the date part comes from the comment's own
  `createdAt` (UTC). `maskForTeam` now forwards `ticket` so teams see the same number. ⚠️ Worker
  change — auto-deploys via CI; adds one KV key per day + one extra get/put per comment.
- **LOCAL/no-Worker demo**: mirrored by `nextLocalTicket()` in `config.js` (localStorage counter
  `rvc-ticketseq:<YYMMDD>`), plus a `formatTicket(iso, serial)` display helper.
- **Surfaced in the log everywhere**: a new **Ticket** column + detail field in the admin Master Log
  (`/reviewdash`), a `#`-prefixed ticket on team cards + the detail view (`/teamdash`), and a
  **Ticket #…** line in the on-page comment popover. Deploy + arrival **notifications** now cite the
  ticket in their summary (and carry a `ticket` field).
- No endpoints/auth/config changed; one new record field (`ticket`) and one new KV key namespace
  (`ticketseq:`). Old comments without a ticket render a `—` (never crash).

## 2.16.1 — 2026-07-13 — retire the demo seed; local domain starts clean

- The LOCAL/no-Worker demo store no longer auto-seeds ~20 dummy comments — `ensureDemoSeed()` is
  replaced by **`ensureDemoReset()`**, which clears any prior local rows ONCE per browser (guarded by
  `pkDemoReset`) so the real review flow is testable from an empty slate; comments you create
  afterwards persist. Production (Worker mode) is unaffected — the reset is gated on LOCAL and never
  runs against the Worker. (Restore the demo dataset from git history ≤ v2.16.0 if needed.)

## 2.16.0 — 2026-07-13 — cross-team tasks visible to BOTH the raiser and the receiver

- A comment directed from one team to another (e.g. **SEO → Content**) now shows in **both** teams'
  dashboards. The receiver already got it as an inbox item + an arrival notification; now the **raiser
  sees it too**. The team-scoped read returns comments the team **raised** (`team`) **OR** that are
  **directed to** it (`toTeam`), thread-aware (a matching root carries all its replies). Applied to the
  Worker `GET /comments?team=` and the local demo store. ⚠️ Worker change — auto-deploys via CI.
- Team-dash card shows the direction: received → **"Raised By &lt;team&gt;"**; raised by you → **"To &lt;team&gt;"**.
- Team-dash lead updated to "Comments your team raised or was asked to action…".

## 2.15.0 — 2026-07-13 — ProoofKit rename · Open Pin everywhere · Overview/bucket cleanup

- **Product renamed to ProoofKit** (three o's, capital K) across every user-facing wordmark — both
  dashboards, the on-page login card, the `/review` + 404 stubs, the product page, and the Review Guide.
  (Package/folder name `proofkit` is unchanged.)
- **Open Pin on team cards + notifications.** Every `/teamdash` "For Action" card, and every team
  notification, now carries an **Open Pin** link to the comment on the live page.
- **Copy prompt on admin cards.** Each `/reviewdash` Overview card gains a per-card **Copy prompt** button
  (previously only in the Master Log menu / bulk bar).
- **Overview no longer shows the deploy bucket.** The Overview "All" tab is the **open** worklist only;
  completed-but-unpublished (bucket) comments live solely under the **Deploy** nav. The redundant **In
  Bucket** tab is removed (Deploy already covers it).
- **"Raised By" on team cards.** The card's raiser label reads **"Raised By &lt;team&gt;"** (was "from").
- **"From" label on the filter chips.** Both dashboards prefix the team-filter chip row with a **From**
  label (they filter by the raising team).
- **Arrival notifications show Open Pin + a "Directed" tag** in the admin notifications feed.
- **Review Guide updated** for all of the above — notably: teams **do** now see the AI change-prompt (in a
  comment's detail view), arrival notifications, Open Pin, search/sort/filter, and the corrected Overview tabs.

## 2.14.0 — 2026-07-13 — team dashboard: full detail, search/sort/filter

Brings the team dashboard (`/teamdash`) closer to the admin panel while staying
read-only and self-scoped:

- **Full detail per comment.** Clicking a card opens a detail view — reviewer identity
  (name + raising team), the AI change prompt (with Copy), completion validation, and a
  team-safe **status history** (Raised → Marked done/Closed), plus an **Open pin** deep
  link. The Worker's `maskForTeam` now exposes `aiPrompt`, `validation`, `publishedStatus`
  (LOCAL mask matches). The raw pre-deploy history is still NOT sent — the timeline is
  synthesised client-side from created/published, so the deploy bucket never leaks.
- **Search / sort / from-team filter chips.** The "For Action" view gains a search box, a
  Newest/Oldest/Page-A–Z sort (shared `buildDropdown`), and **from-team filter chips**
  (which team raised each item — shown only when the inbox spans ≥2 teams; own-colour
  active fill, red only for "All"). By-Page grouping already existed.
- Team chips + status chips already carried uniform widths; the new detail view reuses the
  admin's field/timeline patterns, scoped under `.tmd`.
- **Arrival notifications.** A team is now notified the moment a comment is **directed to
  it** (previously it was only notified when its OWN raised comments were deployed, so
  directed work could sit in "For Action" unseen). The Worker fires a `kind:'directed'`
  notification to the `toTeam` on comment creation — only for real teams (a `TEAM_KEYS`
  entry), since Builder/admin already sees everything in the Overview, and only for root
  comments. Mirrored in the LOCAL demo (overlay add + seed).
- No new write powers: teams still cannot change status, deploy, delete, re-route, export,
  or see other teams — everything remains Worker-enforced.

## 2.13.2 — 2026-07-13 — fix: `/review` sometimes didn't open the login (armed but signed-out)

- **Fix: an armed-but-signed-out tab showed nothing.** `/review` arms the tab (`reviewMode=1`) via the
  one-shot `pkAutoReview` flag, but that flag is consumed on the first paint. The overlay only opened the
  login when `AUTO` (or an Open-Pin `#c=`) was present, so any *reload* of the armed page — including a Vite
  dev full-reload — left the tab armed, signed-out, and blank: no login, no dock. `core/overlay.js` now
  **always opens the Team+Key login when the tab is armed and not authenticated** (the arm gate already
  guarantees real visitors never reach this path).
- **Dismissing the login now fully exits review.** Because the login is now shown on every armed load,
  clicking its backdrop clears `reviewMode` too (previously it only removed the element, so it would
  immediately reappear). Re-open via `/review` (or `/<page>/review`) re-arms.
- **Uniform chip widths (parity).** Every badge chip is now the same width as the longest label
  ("Marketing") via a shared token `--pk-chip-w` (92px), and the larger team-filter pills share
  `--pk-chip-w-lg` (104px) — applied across the admin dashboard, team dashboard and the on-page overlay
  (team chips, status chips, the "—" placeholder, filter chips). Content is centered; ragged chip rows are gone.

## 2.13.1 — 2026-07-13 — "Direct to" excludes the reviewer's own team

- **You can no longer direct a comment to your own team.** The on-page composer's "Direct to" list
  (`directItems()` in `core/overlay.js`) now filters out `getSession().team` — e.g. logged in as SEO,
  SEO is absent from the list. Applies to every team, and to Builder (when the reviewer is Builder,
  Builder is dropped too).
- **Default target stays Builder**, except when Builder is the one filtered out (reviewer IS Builder):
  the default then falls back to the first remaining team so the control is never empty. No record
  shape, endpoint, auth, or config change — purely the composer's option set + default.

## 2.13.0 — 2026-07-13 — directed comments + Builder admin (Design demoted to a team)

- **Comments are now directed to a team.** The on-page composer gains a "Direct to" select (defaults to
  **Builder**; every team is selectable). The choice is persisted as a new record field `toTeam`; replies
  inherit their root's `toTeam`. A directed comment sits in that team's `/teamdash` **for action**.
- **`/teamdash` is now a directed-work inbox.** The team-scoped read (`GET /comments?team=X` and the LOCAL
  demo path) filters by `toTeam === X` instead of the author's `team`. Each card shows a `from <team>`
  chip so the receiving team sees who raised it. Copy reframed: "For Your Team" / "For Action" /
  "Nothing directed to your team yet." (Auth unchanged — a team key still reads only its own inbox.)
- **Admin log carries from → to.** `maskForTeam` now exposes `toTeam`. In `/reviewdash`, every card and the
  Master Log show the route (raising team → directed team; new **Directed to** column + detail field);
  search and MD export include `toTeam`.
- **Roles: Design is no longer admin — `Builder` is.** `ADMIN_TEAM` changed `Design → Builder`; `Design`
  moved into `TEAMS` as an ordinary team (with its own chip colour); `Builder` gets a chip colour too since
  it is a directable target. Builder is the admin with access to everything **and** the default target for
  on-site changes. **Deploy note:** give `Design` a `TEAM_KEYS` entry; `Builder` signs in with `ADMIN_PASS`
  (no `TEAM_KEYS` entry), exactly as `Design` used to.
- **"Upgrade access to admin".** A faded, centered link at the bottom of `/teamdash` clears the team session
  and opens `/reviewdash`, where the user can authenticate as Builder.
- **Admin can open any team's board.** A "Team dashboards" picker in the `/reviewdash` sidebar opens
  `/teamdash?team=<T>` (new tab) — `teamdash.js` honours `?team=` only for an admin session and loads that
  team's inbox with the admin key (full access); a red "Admin view" ribbon + "Back to admin" makes the
  impersonation explicit. Non-admins can't use the param (the Worker enforces it regardless).
- **Session adopted across tabs — no second login.** The session is still per-tab (sessionStorage) but is
  now mirrored into localStorage; a link opened in a NEW tab (where the browser won't copy sessionStorage
  across `rel="noopener"`) ADOPTS it, so dashboard hyperlinks (Open Pin, team boards, page links) no longer
  prompt for a re-login. Logout clears both.
- **On-page overlay:** the dock's "Dashboard" button is now **"Go To Dashboard"**, moved to its own fixed
  control at the **bottom-left** (clear of the right-hand comment dock).
- **Select all / none.** The `/reviewdash` toolbar gains a one-button toggle that selects (or clears) every
  root currently in view — respecting the active tab/team/search filter — feeding the existing bulk-action
  bar. Label flips to "Select none" once all listed items are selected; disabled on an empty list.
- **One dropdown format everywhere.** The composer's "Direct to" was the last native `<select>`; it's now the
  shared custom `buildDropdown` (`.pk-dropdown`) like every other Proofkit control (login team picker, Sort,
  Copy, team-board picker). The composer popover dropped `overflow:hidden` (square corners never needed it)
  so the menu isn't clipped, and "Direct to" sits at the TOP of the composer (pick the direction first, then
  write) so its menu opens over the fields rather than off-screen.
- **New team: Business.** Added to `TEAMS` (own chip colour) — an ordinary team, same access as the others,
  NO admin. (Give it a `TEAM_KEYS` entry at deploy like any team.)
- **Identical entry for every team.** The composer no longer special-cases Content — every team sees the same
  two fields: the note (now placeholder **"Elaborate on the change request."**) and an **optional** "Change
  it to… (optional new content)". Nothing is required per-team anymore. Same applies to the reply box.
- **Composer title:** "Add a comment" → **"Mark a comment"**.
- **Divider before Builder.** `buildDropdown` items support `dividerBefore`; every list that ends in Builder
  (the login team picker and the composer's "Direct to") now shows a thin separator fencing Builder (admin)
  off from the ordinary teams. Builder is listed last (still the "Direct to" default).
- **Fix: "Go To Dashboard" was opening the comment composer.** Now that the button lives outside `.rv-dock`,
  the on-page "click anywhere to comment" handler was catching it; `.rv-dash` is now in that handler's ignore
  list, so the button navigates as intended.
- **Admin "Team dashboards" picker** label is now **"Select A Team"** (was the truncated "View a team's board").
- **"Upgrade access to admin" prefills Builder.** The link now carries `/reviewdash?login=builder`; the admin
  login reads `?login=<ADMIN_TEAM>` and pre-selects Builder in the Team dropdown, focusing the key field.
- **Brand accent in the header.** "Shriram FS" in both dashboards' brand tag renders in the Shriram brand gold
  (`#f3b83f`) in dark mode; stays neutral (muted) in light mode.
- **Removed the composer "Change it to…" field** (composer + reply). Entry is now a single note for every team;
  the admin card still renders a legacy `changeTo` callout when older records carry one.
- **Redesigned the admin comment card.** Reorganised from one crowded header row into clean geometric bands:
  META (select · status · page · time) → COMMENT (+ anchored element) → **ROUTE (From → To, both ends
  labelled)** → optional legacy callout → an ACTION FOOTER (replies toggle left, actions right) fenced by a
  hairline. The card's **left edge is now colour-keyed to the lifecycle state** (open=amber · bucket=blue ·
  deployed=green · closed=muted) for at-a-glance scanning. From/To is now a first-class row on the card
  (context added), not just a chip pair in the header.
- **Selection is now an explicit mode.** Cards have NO checkboxes by default. A toolbar **"Select"** button arms
  multi-select (checkboxes appear); it then reads **"Deselect All"** and clicking it clears the selection and
  leaves the mode. The bottom bulk-action overlay shows only in select mode with ≥1 selected (and gained a
  "Select all"). Selected cards get a **vibrant red-filled state**. The active **team filter chip** is now a
  vibrant SOLID fill (was just a stroke) — a team chip fills with its **own identity colour**, only "All
  Teams" fills red.
- **Card route is label-free.** The card's route band drops the "From"/"To" words — just `chip → chip`.
- **"Jump To Team"** — the admin's team-board picker label (was "Select A Team").
- **Demo seed (LOCAL/no-Worker only).** On first load the dashboards populate ~20 dummy comments covering every
  lifecycle state (open · in-bucket completed · in-bucket closed · deployed · closed-live) ≥2× across
  teams/pages, with two threads and legacy change-to callouts. Runs once (`pkDemoSeeded`), wiping prior demo
  rows first; never runs against a Worker.
- **Master Log: "Requirement" column + per-row "More options".** The log gained a Requirement column (the
  comment text). "View more" became a **More options** menu carrying every Overview action — View details ·
  Open pin · **Edit teams (From/To)** · Mark complete/Reopen · Close · Copy prompt · Delete — rendered as a
  body-anchored popover so the log's horizontal scroll never clips it.
- **Admin can re-route a comment's From/To.** New Worker endpoint `POST /teams` (admin) updates a record's
  `team`/`toTeam`; the Master Log's "Edit teams" opens a modal with the two team dropdowns. (LOCAL demo mirrors it.)

## 2.12.0 — 2026-07-13 — one login per tab: unified session + modern on-page login

- **The on-page overlay login is now the shared modern login** (`.pk-login`), matching the dashboards —
  the legacy `.rv-login` card is gone (answering "why is /review showing the legacy login"). The overlay
  inlines the design system (tokens + components) and injects it only when review mode arms, so real
  visitors still download nothing.
- **ONE login per tab.** All three surfaces (overlay, `/reviewdash`, `/teamdash`) now share a single
  per-tab session — `{ team, key }` in sessionStorage (`pkTeam`/`pkKey`) via config's
  `getSession`/`setSession`/`clearSession`. Signing in anywhere authenticates everywhere in that tab; the
  old separate `reviewPass` / `reviewAdminPass` / `teamDashTeam`+`teamDashPass` logins are gone.
- **Role routing off the one session.** `/reviewdash`: a Design (admin) session opens the panel and stays
  active; any other team is sent to `/teamdash`. `/teamdash`: a Design session bounces to `/reviewdash`.
  Hitting a page's `/review` with a live session auto-enters review — no prompt.
- The global-theme write (POST `/settings`) now reads the shared session key.

## 2.11.2 — 2026-07-13 — dropdown item icons + stacking open animation + blue team name

- **Dropdown items carry icons.** `buildDropdown` items take an `icon` (inline SVG); the Sort menu
  (Newest first ↓ / Oldest first ↑ / Page A–Z 📄) and the Copy menu (Copy prompts / Copy MD / Download
  JSON) now each show an icon that inherits the item colour.
- **"Stacking" open animation.** The dropdown menu no longer just fades — each option now staggers in
  (drop-in + scale, `--i`-indexed delay, spring easing) so the list assembles like a stack coming
  together. Reduced-motion guarded.
- **Team name highlighted blue.** In the team-dash header the `<Team>` section is now a contrasting
  blue (`--pk-blue`) while the rest of the tag stays muted.

## 2.11.1 — 2026-07-13 — dropdown open/close animation + team-dash header + login tidy

- **Dropdowns animate open/close** — the `.pk-dropdown` menu now fades + slides + slightly scales in/out
  from the top edge (spring on open), with a reduced-motion guard. Driven by the `is-open` class
  (no more instant `hidden` toggle).
- **Login:** the admin option now reads just **Design** (dropped the "(Admin)" tag).
- **Team-dash header** matches the admin brand exactly with the team appended as a third section:
  `ProofKit │ CONTENT REVIEW | SHRIRAM FS | <Team>` (filled per the signed-in team). The redundant
  "Your Team" chip is removed.

## 2.11.0 — 2026-07-13 — custom themed dropdowns + consolidated Copy + login "Authenticating" shimmer

- **Custom, non-native dropdowns.** New `.pk-dropdown` component (`design/components.css`) +
  `buildDropdown()` (`config.js`) — a fully themed dropdown (sharp corners, spaced items, red-accent
  selection, keyboard nav + click-away) that replaces native `<select>` menus so the open list matches
  the tool instead of the OS chrome. Now used for the login **Team** field, the dashboard **Sort**, and
  the new Copy menu.
- **Copy consolidated to one dropdown.** The three toolbar buttons (Copy prompts / Copy MD / JSON) are now
  a single **Copy** dropdown → Copy prompts · Copy MD · Download JSON, with a brief "Copied ✓" flash.
- **Login CTA "Authenticating" + subtle shimmer.** During sign-in the button reads **Authenticating** with
  a very subtle "securing" shimmer sweep (stays vivid, not dimmed). Both dashboards' logins.
- The shared login card's red glow moved into its own clipped layer so custom dropdown menus escape it
  un-clipped (and fields no longer trap the menu in a stacking context).

## 2.10.0 — 2026-07-13 — unified "Panel Login" for all users

- **One shared login for both dashboards.** New `.pk-login` component (`design/components.css`) +
  `buildPanelLogin()` (`config.js`) carry the modern card look — a soft brand-red glow up top, standout
  squared **Team** + **Key** fields, an **Authenticate** button, and the **ProofKit** logo at the bottom —
  now used by BOTH `/reviewdash` and `/teamdash`. The old admin-only password "Panel Login" and the
  separate `.rvd-login-*` / `.tmd-login-*` CSS are removed.
- **`/reviewdash` now shows the common login.** Landing there unauthenticated shows the shared Team + Key
  screen (not a password box). Picking **Design (Admin)** + the admin key opens the admin panel in place;
  picking any other team hands off to that team's dashboard (`/teamdash`) — symmetric with `/teamdash`,
  where Design hands off to `/reviewdash`.
- Subtitle wording: "Enter your key to open the panel." → **"Enter your key to continue."**

## 2.9.1 — 2026-07-13 — move the theme toggle to the heading row

- The light/dark toggle moved from under the wordmark to the **far right of the "Review and Bug Testing"
  headline** (admin dashboard) — vertically centred and spaced apart from the H1 via a new
  `.rvd-headband-row` flex row (`[data-pk-toggle]` slot relocated; `.rvd-brand-toggle` removed).

## 2.9.0 — 2026-07-13 — live SSE theme push + design-system dropdowns + "Panel Login" redesign

- **Live theme push (SSE).** New Worker endpoint **`GET /events`** streams `text/event-stream`: it polls
  the `settings` KV server-side and pushes a `theme` event whenever it changes, so an admin's flip lands
  on every open dashboard in ~a second — no reload or tab-focus needed. Bounded to ~90s per connection;
  the browser's `EventSource` auto-reconnects. `config.js` adds `startThemeStream()` (called from
  `initTheme()`); it's a silent no-op without a Worker/EventSource, with the on-focus sync as a fallback.
  ⚠️ Worker change — auto-deploys via `.github/workflows/deploy-worker.yml`.
- **All dropdowns on the design system — squared + spacious.** New canonical **`.pk-select`** component in
  `design/components.css` (squared, 48px, token-bound, single chevron; `.pk-select--sm` for compact use).
  The existing selects now mirror it: the dashboard sort and the team- + on-page-overlay login selects are
  squared (radius 0) with the design-system chevron and roomier padding.
- **Admin gate redesigned — "Panel Login".** The `/reviewdash` password modal is recreated as a taller,
  minimal portrait card whose only background visual is a soft brand-red glow from the top, with one
  standout squared **Key** field (58px, focus glow), an **Authenticate** button, and the **ProofKit**
  logo at the bottom.

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
