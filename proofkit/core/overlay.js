  import { TEAMS, TEAM_COLORS, WORKER_URL, HIDE_SELECTORS, PROOFKIT_ENABLED, ADMIN_TEAM, isTeamEnabled,
    BASE, TEAM_BASE, boardBase,
    getSession, setSession, clearSession, homeUrl, SITE_ORIGIN, buildLoginHandoff, buildAccessLogin, accessLogin, ACCOUNT_KEY_SENTINEL, authHeaders, getAccount, getAuthToken, accountLogin, lockTab, clearAccount, buildDropdown, nextLocalTicket, pageName,
    // v3 shared vocabulary (single source of truth in ./config.js — never re-declared here):
    // comment types + per-type template fields, teamStatus→token colours, the summary renderer,
    // and the expected-outcome gate. The composer (F1/F8), pin colours (F5) + demo store all read these.
    COMMENT_TYPES, TYPE_FIELDS, STATUS_COLORS, renderSummary, needsScreenshot,
    // Overlay-UI flag (global): 'new' HUD vs 'old' rectangle composer.
    getOverlayUi, syncOverlayUi, startOverlayUiStream } from './config.js?v=7384cafdb3';
  import { pkConfirm, pkAlert } from './modal.js?v=7384cafdb3';
  import { injectCss } from './inject-css.js?v=7384cafdb3';
  import { mountHud, CANVAS_FRAME_NAME } from './overlay-hud.js?v=7384cafdb3'; // New HUD path (overlayUi === 'new')
  // The design system, inlined — injected only when review mode arms (real visitors
  // download nothing), so the on-page login matches the dashboards (.pk-login).
  // Generated string modules (scripts/build-css-modules.mjs). These were `./x.css?inline`, which
  // is a VITE feature: outside the Astro build the browser refused to load a text/css file as an
  // ES module and overlay.js never evaluated at all — which is why the extension showed no overlay
  // on any site. Plain .js modules work in the browser, in Vite and in the extension alike.
  import pkTokensCss from './design/tokens.css.js?v=7384cafdb3';
  import pkComponentsCss from './design/components.css.js?v=7384cafdb3';
  (() => {
    'use strict';
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts) - tool off => never loads
    if (window.name === CANVAS_FRAME_NAME) return; // inside the New-HUD canvas iframe: render the plain page, never nest the overlay

    // ---- arm gate --------------------------------------------------------
    const KEY = 'reviewMode', SESSION_KEY = 'reviewSessionId';
    // A review session = one sitting in the tab; id persists across page nav and
    // comments, and is cleared on Save/exit so the next entry logs separately.
    function sessionId() {
      let s = sessionStorage.getItem(SESSION_KEY);
      if (!s) { s = 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); sessionStorage.setItem(SESSION_KEY, s); }
      return s;
    }
    // Never arm on a dashboard board itself — neither the v3 boards (/reviewdash,
    // /teamdash) nor the v2 ones this clone coexists with on the same origin.
    if (/^\/(reviewdash|teamdash)3?$/.test(location.pathname)) return;
    // The review URL is the page path + "/review" (e.g. /equity/review, or /review for
    // home). Strip that cosmetic suffix to get the real page key for storage.
    const pagePath = () => location.pathname.replace(/\/review\/?$/, '') || '/';
    const reviewUrl = () => { const p = pagePath(); return p === '/' ? '/review' : p + '/review'; };
    // Arrival via /<page>/review (home stub or the 404 router set pkAutoReview) →
    // arm the tab and auto-open the login / enter review on this page.
    const AUTO = sessionStorage.getItem('pkAutoReview') === '1';
    if (AUTO) { sessionStorage.removeItem('pkAutoReview'); sessionStorage.setItem(KEY, '1'); }
    // Review mode is armed ONLY by signing in at /review - the Proofkit Login sets
    // `reviewMode` on success. Nothing else shows the Comment dock, so real visitors
    // (and anyone who hasn't signed in) never see it. `?review=0` signs out.
    if (new URLSearchParams(location.search).get('review') === '0') sessionStorage.removeItem(KEY);
    // The dashboard's "Open Pin" links (…#c=<id>) open in a fresh tab that has no
    // armed session; treat that trusted deep link as an arm trigger so the pin still
    // opens. The reviewer is still asked for their Team ID before any data loads, so
    // this arms the dock but reveals nothing on its own.
    if (/[#&]c=/.test(location.hash)) sessionStorage.setItem(KEY, '1');
    if (sessionStorage.getItem(KEY) !== '1') return; // dormant until /review sign-in

    const LOCAL = !WORKER_URL;

    // ---- storage abstraction (Worker | localStorage demo) ----------------
    async function apiFetch(path, opts = {}) {
      // 6.0: an account token when this tab is unlocked, else the legacy team key. Additive —
      // a browser with no account behaves exactly as before.
      const headers = { 'Content-Type': 'application/json', ...authHeaders() };
      const res = await fetch(WORKER_URL + path, { ...opts, headers });
      if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
      if (!res.ok) {
        // Surface the Worker's JSON {error} (e.g. a validation reason) instead of an opaque
        // "HTTP 400". Callers that key off specific messages ('already started') keep working;
        // everything else now shows the real cause. Falls back to the status if there's no body.
        let msg = 'HTTP ' + res.status;
        try { const body = await res.json(); if (body && body.error) msg = body.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    }
    const localKey = (p) => 'rvc:' + p;
    const localGet = (p) => JSON.parse(localStorage.getItem(localKey(p)) || '[]');
    // Persist ONE record into the demo store (mirrors the Worker's createComment):
    // fills the v3 record shape (teamStatus is the ONLY status now; the dead `status`
    // field is gone — F5 prereq), server-parity summary, and a reply skips the ticket +
    // arrival notif (it is the Quick-questions channel). Every new field defaults when missing.
    function localAdd(rec) {
      const isReply = !!rec.parentId;
      rec.id = 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
      rec.createdAt = new Date().toISOString();
      rec.ticket = isReply ? '' : nextLocalTicket(rec.createdAt); // replies carry no ticket (F6)
      // v3 structured fields — default the whole shape so the dashboards read it uniformly.
      rec.commentType = rec.commentType || 'general';
      rec.templateFields = rec.templateFields || {};
      rec.summary = rec.summary || renderSummary(rec.commentType, rec.templateFields, rec.comment);
      rec.expectedOutcome = rec.expectedOutcome || '';
      rec.batchId = rec.batchId || '';
      rec.imageId = rec.imageId || '';
      rec.viewportImageId = rec.viewportImageId || '';   // full-viewport screenshot (F4b)
      rec.display = rec.display || null;                  // screen resolution + display scale
      // copy-fix mirrors newText into legacy `changeTo` so v2-era rendering keeps working (§3).
      if (rec.commentType === 'copy-fix' && rec.templateFields.newText && !rec.changeTo) rec.changeTo = rec.templateFields.newText;
      rec.teamStatus = 'to_be_initiated'; rec.teamStatusAt = '';
      rec.iteration = 1;
      rec.reopenReason = ''; rec.reopenNote = '';
      rec.history = [{ status: 'to_be_initiated', at: rec.createdAt, event: 'created', iteration: 1 }];
      const arr = localGet(rec.page.path);
      // Per-page pin number (mirrors the Worker): the counter follows the page's OPEN streak — it
      // climbs while any bug is open (closing "comment 2" leaves 1, 3, 4… un-renumbered), and resets
      // to 1 once the page has no open bugs left. Resolved/revoked roots aren't counted; replies keep 0.
      rec.pageSeq = 0;
      if (!isReply) {
        let maxSeq = 0;
        for (const r of arr) {
          if (r.parentId || r.revoked) continue;
          const st = r.teamStatus || 'to_be_initiated';
          if (st === 'deployed_live' || st === 'disregarded') continue;
          if ((r.pageSeq || 0) > maxSeq) maxSeq = r.pageSeq || 0;
        }
        rec.pageSeq = maxSeq + 1;
      }
      arr.push(rec);
      localStorage.setItem(localKey(rec.page.path), JSON.stringify(arr));
      // Demo parity with the Worker: arrival notification to the directed team (real teams
      // only — not Builder/admin), for ROOT comments only (replies never notify on arrival).
      if (!isReply && rec.toTeam && rec.toTeam !== ADMIN_TEAM) {
        try {
          const where = (rec.page && rec.page.title) || (rec.page && rec.page.path) || 'a page';
          const notifs = JSON.parse(localStorage.getItem('rvc-notifications') || '[]');
          notifs.push({
            id: 'N' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
            createdAt: rec.createdAt, team: rec.toTeam, kind: 'directed', fromTeam: rec.team || '',
            commentId: rec.id, ticket: rec.ticket || '', path: rec.page.path, pageName: where,
            summary: 'New comment ' + (rec.ticket ? '#' + rec.ticket + ' ' : '') + 'on ' + where + (rec.team ? ' from ' + rec.team : ''),
            readTeam: false, readAdmin: false,
          });
          localStorage.setItem('rvc-notifications', JSON.stringify(notifs));
        } catch (e) {}
      } else if (isReply) {
        // Demo parity (F6): a reply fires a kind:'reply' notif to the OTHER side. The raiser's
        // reply notifies the receiver (toTeam); the receiver's reply notifies the raiser (team).
        try {
          const root = localGet(rec.page.path).find((r) => r.id === rec.parentId) || null;
          if (root) {
            const raiser = root.team || '';
            const target = (rec.team || '') === raiser ? (root.toTeam || '') : (root.team || '');
            if (target && target !== ADMIN_TEAM) {
              const where = (rec.page && rec.page.title) || (rec.page && rec.page.path) || 'a page';
              const notifs = JSON.parse(localStorage.getItem('rvc-notifications') || '[]');
              notifs.push({
                id: 'N' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
                createdAt: rec.createdAt, team: target, kind: 'reply', fromTeam: rec.team || '',
                commentId: rec.id, ticket: root.ticket || '', path: rec.page.path, pageName: where,
                summary: 'New reply ' + (root.ticket ? '#' + root.ticket + ' ' : '') + 'on ' + where + (rec.team ? ' from ' + rec.team : ''),
                readTeam: false, readAdmin: false,
              });
              localStorage.setItem('rvc-notifications', JSON.stringify(notifs));
            }
          }
        } catch (e) {}
      }
      return rec;
    }
    // Demo-mode edit (mirrors the Worker's /comments/update): snapshot the prior content into
    // versions[] (retained until delete), then overwrite every parameter. TBI-only + raiser/admin
    // ownership is enforced by the UI (the Edit affordance only appears then), so this just writes.
    function localUpdate(payload) {
      const path = (payload.page && payload.page.path) || pagePath();
      const arr = localGet(path);
      const rec = arr.find((r) => r.id === payload.id && !r.parentId);
      if (!rec) throw new Error('not found');
      const nowIso = new Date().toISOString();
      const editor = getSession().team || rec.team || '';
      (rec.versions = rec.versions || []).push({
        at: nowIso, by: editor,
        comment: rec.comment || '', changeTo: rec.changeTo || '',
        commentType: rec.commentType || 'general', templateFields: rec.templateFields || {},
        toTeam: rec.toTeam || '', expectedOutcome: rec.expectedOutcome || '',
        summary: rec.summary || '', anchor: rec.anchor || {},
      });
      rec.comment = payload.comment;
      rec.commentType = payload.commentType || 'general';
      rec.templateFields = payload.templateFields || {};
      rec.changeTo = (rec.commentType === 'copy-fix' && rec.templateFields.newText)
        ? rec.templateFields.newText : (payload.changeTo || '');
      rec.expectedOutcome = payload.expectedOutcome || '';
      rec.summary = payload.summary || renderSummary(rec.commentType, rec.templateFields, rec.comment);
      if (payload.toTeam !== undefined) rec.toTeam = payload.toTeam || '';
      if (payload.anchor) rec.anchor = payload.anchor;
      if (payload.imageId !== undefined) rec.imageId = payload.imageId || '';
      if (payload.viewportImageId !== undefined) rec.viewportImageId = payload.viewportImageId || '';
      if (payload.display !== undefined) rec.display = payload.display || null;
      rec.editedAt = nowIso; rec.editedBy = editor;
      (rec.history = rec.history || []).push({ status: rec.teamStatus || 'to_be_initiated', at: nowIso, event: 'edited', iteration: rec.iteration || 1, by: editor });
      localStorage.setItem(localKey(path), JSON.stringify(arr));
      return rec;
    }
    // Demo-mode confirm (mirrors the Worker's POST /confirm): the raiser verifies a deployed_live
    // fix. Sets bugFixConfirmed + stamps who/when + logs the event; the raiser/deployed gate is
    // enforced by the UI (the Confirm affordance only appears then). Notifies the deployer.
    function localConfirm(id) {
      const path = pagePath();
      const arr = localGet(path);
      const rec = arr.find((r) => r.id === id && !r.parentId);
      if (!rec) throw new Error('not found');
      if ((rec.teamStatus || '') !== 'deployed_live') throw new Error('not deployed');
      if (rec.bugFixConfirmed) return rec;
      const nowIso = new Date().toISOString();
      rec.bugFixConfirmed = true;
      rec.bugFixConfirmedAt = nowIso;
      rec.bugFixConfirmedBy = getSession().team || rec.team || '';
      (rec.history = rec.history || []).push({ status: 'deployed_live', at: nowIso, event: 'confirmed', iteration: rec.iteration || 1, by: rec.bugFixConfirmedBy });
      localStorage.setItem(localKey(path), JSON.stringify(arr));
      // notify the deployer (toTeam / Builder) — mirror of fireConfirmNotif
      try {
        const where = (rec.page && rec.page.title) || (rec.page && rec.page.path) || 'a page';
        const tick = rec.ticket ? '#' + rec.ticket + ' ' : '';
        const nx = JSON.parse(localStorage.getItem('rvc-notifications') || '[]');
        nx.push({
          id: 'n_' + Date.now() + '_' + Math.random().toString(16).slice(2),
          createdAt: nowIso, updatedAt: nowIso, team: rec.toTeam || 'Builder', kind: 'confirmed',
          fromTeam: rec.bugFixConfirmedBy || rec.team || '', chainId: rec.parentId || rec.id, commentId: rec.id,
          ticket: rec.ticket || '', teamStatus: 'deployed_live', path: (rec.page && rec.page.path) || '/', pageName: where,
          summary: `Bug fix confirmed on ${tick}on ${where}` + (rec.bugFixConfirmedBy ? ` by ${rec.bugFixConfirmedBy}` : '') + '.',
          readTeam: false, readAdmin: false,
        });
        localStorage.setItem('rvc-notifications', JSON.stringify(nx));
      } catch (e) { /* best-effort */ }
      return rec;
    }
    const store = LOCAL
      ? {
          async list(path) { return localGet(path); },
          async add(rec) { return localAdd(rec); },
          async update(rec) { return localUpdate(rec); },
          // Batch (F2) demo parity: process each draft-record in order, one failure never
          // blocks the rest — mirrors the Worker's array POST /comments → {results:[…]}.
          async addBatch(recs) {
            const results = [];
            for (const rec of recs) {
              try { results.push({ ok: true, rec: localAdd(rec) }); }
              catch (e) { results.push({ ok: false, error: (e && e.message) || 'save failed' }); }
            }
            return { results };
          },
          // Screenshot (F4) demo parity: stash the dataURL under `rvc-img:<id>` behind a
          // quota-guarded try/catch (large images can blow the localStorage budget — failing
          // to store must never block the comment; we just drop the image).
          async uploadImage(dataUrl) {
            const imageId = 'I' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
            try { localStorage.setItem('rvc-img:' + imageId, dataUrl); return { imageId }; }
            catch (e) { return { imageId: '' }; } // quota / disabled storage → no image
          },
          async confirm(id) { return localConfirm(id); },
          // Read a stored screenshot dataURL back (used to preview an existing attachment on edit).
          async image(id) { try { return { dataUrl: localStorage.getItem('rvc-img:' + id) || '' }; } catch { return { dataUrl: '' }; } },
        }
      : {
          // 5.0: send the full href too, so the read is scoped to THIS origin. Without it the
          // worker reads the empty-host namespace and an overlay on a foreign site would see the
          // pins of whatever shares its path elsewhere.
          list: (path) => apiFetch('/comments?path=' + encodeURIComponent(path)
            + '&url=' + encodeURIComponent(location.href)),
          add: (rec) => apiFetch('/comments', { method: 'POST', body: JSON.stringify(rec) }),
          // Edit a root comment's content (raiser/admin, TBI only) — snapshots the prior version
          // server-side; returns the masked, updated record (with its versions[] trail).
          update: (rec) => apiFetch('/comments/update', { method: 'POST', body: JSON.stringify(rec) }),
          // Array POST /comments → 201 {results:[{ok,rec?,error?}]} in input order (F2).
          addBatch: (recs) => apiFetch('/comments', { method: 'POST', body: JSON.stringify(recs) }),
          // POST /image → {imageId}; stored KV `img:<uuid>`, never required for a comment (F4).
          uploadImage: (dataUrl) => apiFetch('/image', { method: 'POST', body: JSON.stringify({ dataUrl }) }),
          // POST /confirm → the raiser verifies a deployed bug fix; returns the masked record.
          confirm: (id) => apiFetch('/confirm', { method: 'POST', body: JSON.stringify({ id }) }),
          // GET /image?id → { dataUrl } — preview an existing attachment when editing.
          image: (id) => apiFetch('/image?id=' + encodeURIComponent(id)),
        };

    // ---- login (the shared modern Panel Login — same as the dashboards) --
    // One login per tab: the { team, key } chosen here is the shared session
    // (config's getSession/setSession), so the dashboards recognise it too.
    let login = null;
    function startReview() {
      if (isAuthed()) return enter(); // already logged in this tab, by key or by account
      showLogin();
    }
    /* Open the one login page, telling it who to hand the session back to. The extension id comes
     * from the content script (it is the only code here that can see it); without an extension
     * there is nothing to hand back to and the login page simply signs them in and goes to their
     * dashboard. `return` is this page, so the extension knows which tab to arm. */
    function openLoginPage() {
      const extId = (typeof window !== 'undefined' && window.PROOFKIT_EXT_ID) || '';
      const url = SITE_ORIGIN + BASE + '/login/'
        + '?return=' + encodeURIComponent(location.href)
        + (extId ? '&ext=' + encodeURIComponent(extId) : '');
      window.open(url, '_blank', 'noopener');
    }

    function showLogin() {
      if (!login) {
        /* The access key is the sign-in everywhere, including here. On a page we do not own the
         * biometric route is impossible — a credential is bound to the origin that made it — so
         * that option is simply not offered; the extension round trip through the hosted page is
         * what stands in for it, and it is reached from the popup. */
        const backOut = () => { try { sessionStorage.removeItem(KEY); } catch (e) {} hideLogin(); };
        /* One button, and it leaves. Everything a sign-in needs — the key entry, biometrics, the
         * email route, the throttling, the error copy — lives on /proofkit/login and nowhere else.
         * Reproducing any of it here would be a second implementation on somebody else's domain,
         * and biometrics cannot work here at all, since a passkey belongs to the origin that made
         * it. The extension carries the finished session back to this tab and arms it. */
        login = buildLoginHandoff({ onLogin: () => openLoginPage() });
        // Clicking the backdrop backs fully out of review, rather than leaving the page greyed
        // behind a dismissed panel.
        login.el.addEventListener('click', (e) => { if (e.target === login.el) backOut(); });
      }
      login.setError('');
      document.body.appendChild(login.el);
      login.el.hidden = false;
      login.focus();
    }

    async function tryAccess(code) {
      login.setBusy(true);
      try {
        const body = await accessLogin(WORKER_URL, code);
        // The overlay gates on a team session, so give it one: the account's own team, with the
        // sentinel in place of a key. authHeaders() sends the bearer token and never the sentinel.
        setSession(body.user.team || ADMIN_TEAM, ACCOUNT_KEY_SENTINEL);
        login.accept();
        await new Promise((r) => setTimeout(r, 240));
        await login.dismiss();
        hideLogin();
        enter();
      } catch (e) {
        login.setBusy(false);
        login.reject(e.locked
          ? 'Too many attempts. Try again in ' + Math.ceil((e.retryAfter || 60000) / 1000) + 's.'
          : 'Access denied. Please enter the correct access key.');
      }
    }

    function hideLogin() {
      if (login) login.el.remove();
    }

    // ---- styles (injected once, only in review mode) ---------------------
    // Host-page elements to hide while armed (e.g. a back-to-top FAB); see ./config.
    const hideCss = HIDE_SELECTORS.map((s) => `html.rv-armed ${s}{display:none !important}`).join('');
    const css = pkTokensCss + pkComponentsCss + hideCss + `
      /* Dock sits ABOVE popovers/toasts so its buttons are always clickable,
         even when a comment popover would otherwise overlap the bottom-right. */
      .rv-dock{position:fixed;right:24px;bottom:24px;z-index:var(--pk-z-ov-dock);
        display:flex;align-items:center;gap:20px}
      /* The dock changes SHAPE between its two states — a dark "Comment" pill becomes a wider red
         "Exit Review Mode" one, and the prev/next pill appears beside it. Swapping that instantly
         reads as two different UIs flickering past each other, so each part is transitioned:
         the colour crossfades, the label fades out and back, and the pill's width is animated
         between its measured before/after sizes (auto width cannot be transitioned on its own). */
      .rv-fab{display:flex;align-items:center;justify-content:center;gap:8px;height:var(--pk-control-h-lg);padding:0 16px;border:none;
        border-radius:24px;background:var(--pk-card);color:var(--pk-ink);cursor:pointer;
        font:600 var(--pk-text-base)/1.5 var(--pk-font);box-shadow:var(--pk-shadow-md);
        white-space:nowrap;overflow:hidden;
        transition:background-color .3s cubic-bezier(.4,0,.2,1),color .3s cubic-bezier(.4,0,.2,1),
                   width .3s cubic-bezier(.4,0,.2,1),box-shadow .3s}
      .rv-fab[data-on="1"]{background:var(--pk-red);color:var(--pk-on-accent)}
      .rv-fab > *{transition:opacity .14s ease}
      .rv-fab.is-swapping > *{opacity:0}
      .rv-fab svg{width:20px;height:20px;flex:none}
      /* "Go To Dashboard" — pinned to the bottom-LEFT, clear of the right-hand dock */
      .rv-dash{position:fixed;left:24px;bottom:24px;z-index:var(--pk-z-ov-dock);
        display:flex;align-items:center;gap:8px;height:var(--pk-control-h-lg);padding:0 16px;border:none;border-radius:24px;
        background:var(--pk-card);color:var(--pk-ink);cursor:pointer;text-decoration:none;
        font:600 var(--pk-text-base)/1.5 var(--pk-font);box-shadow:var(--pk-shadow-md)}
      .rv-dash svg{width:20px;height:20px;flex:none}
      /* "Log out" — its own bottom-left button, stacked just above "Go To Dashboard". */
      .rv-logout{position:fixed;left:24px;bottom:84px;z-index:var(--pk-z-ov-dock);
        display:flex;align-items:center;gap:8px;height:var(--pk-control-h-lg);padding:0 16px;border:none;border-radius:24px;
        background:var(--pk-card);color:var(--pk-ink);cursor:pointer;
        font:600 var(--pk-text-base)/1.5 var(--pk-font);box-shadow:var(--pk-shadow-md)}
      .rv-logout svg{width:20px;height:20px;flex:none}
      @media (min-width:1024px) and (hover:hover){.rv-dash:hover,.rv-logout:hover{background:var(--pk-elev)}}
      @media (prefers-reduced-motion:reduce){
        .rv-fab,.rv-fab > *,.rv-nav{transition:none !important}
      }
      .rv-backdrop{position:fixed;inset:0;z-index:var(--pk-z-ov-backdrop);pointer-events:none;
        backdrop-filter:grayscale(1);-webkit-backdrop-filter:grayscale(1);
        box-shadow:inset 0 0 0 3px var(--pk-red)}
      /* Always laid out; shown by class. A display toggle cannot be transitioned, which is why
         this used to pop in and out. It slides in from the right, as if out of the FAB. */
      .rv-nav{display:flex;align-items:center;gap:16px;height:var(--pk-control-h-lg);padding:0 2px;border-radius:24px;
        background:var(--pk-card);color:var(--pk-ink);box-shadow:var(--pk-shadow-md);
        opacity:0;transform:translateX(16px) scale(.94);transform-origin:right center;
        pointer-events:none;visibility:hidden;
        transition:opacity .26s ease,transform .3s cubic-bezier(.34,1.3,.5,1),visibility 0s linear .3s}
      .rv-nav.is-in{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition-delay:0s,0s,0s}
      .rv-nav button{width:var(--pk-control-h-lg);height:var(--pk-control-h-lg);padding:0;border:none;border-radius:22px;
        background:var(--pk-hair);color:var(--pk-ink);cursor:pointer;display:flex;align-items:center;justify-content:center}
      .rv-nav button svg{width:22px;height:22px;display:block}
      .rv-nav button:disabled{opacity:.4;cursor:default}
      .rv-nav-label{min-width:var(--pk-control-h-lg);text-align:center;font:600 var(--pk-text-base)/1 Outfit;color:var(--pk-ink)}
      @media (max-width:768px){
        .rv-dock{right:16px;bottom:16px;gap:16px}
        .rv-nav{gap:8px}
        .rv-nav button{width:var(--pk-control-h-md);height:var(--pk-control-h-md)}
        .rv-dash{left:16px;bottom:16px;padding:0 16px}
        .rv-dash span{display:none}
        .rv-logout{left:16px;bottom:76px;padding:0 16px}
        .rv-logout span{display:none}
      }
      .rv-pin{position:fixed;z-index:var(--pk-z-ov-pin);min-width:var(--pk-control-h-xs);height:var(--pk-control-h-xs);padding:0 8px;
        transform:translate(-50%,-100%);display:flex;align-items:center;justify-content:center;
        border-radius:14px;border:2px solid var(--pk-ink);background:var(--pk-red);color:var(--pk-ink);cursor:pointer;
        font:700 var(--pk-text-sm)/1 var(--pk-font);box-shadow:var(--pk-shadow-md)}
      .rv-pin.resolved{background:var(--pk-muted)}
      .rv-pin.active{background:var(--pk-card);transform:translate(-50%,-100%) scale(1.12)}
      /* Status = a small saturated corner dot, ringed in the canvas so it reads on any team fill.
         Deliberately different in size + position + saturation from the pastel team fill. */
      .rv-pin .rv-pin-status{position:absolute;top:-4px;right:-4px;width:11px;height:11px;border-radius:50%;
        border:2px solid var(--pk-canvas);box-shadow:0 0 0 1px rgba(0,0,0,.25);pointer-events:none}
      .rv-pop{position:fixed;z-index:var(--pk-z-ov-pop);width:344px;max-width:calc(100vw - 32px);
        background:var(--pk-card);color:var(--pk-ink);border:1px solid var(--pk-hair);border-radius:0;
        box-shadow:var(--pk-shadow-lg);font:400 var(--pk-text-base)/1.5 var(--pk-font)}
      .rv-pop header{padding:20px 24px 16px;background:var(--pk-elev);border-bottom:1px solid var(--pk-hair);
        display:flex;justify-content:space-between;align-items:flex-start;gap:8px;
        cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}
      .rv-pop header .rv-x{cursor:pointer}
      .rv-pop header .t{font-weight:600;font-size:var(--pk-text-lg);letter-spacing:-.01em}
      .rv-ticket{margin-top:4px;font-size:var(--pk-text-xs);font-weight:600;letter-spacing:.02em;
        font-variant-numeric:tabular-nums;color:var(--pk-red-ink)}
      .rv-snip{font-weight:400;font-size:var(--pk-text-sm);color:var(--pk-muted);margin-top:4px;max-width:250px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rv-body{padding:24px;display:flex;flex-direction:column;gap:16px}
      .rv-pop input,.rv-pop textarea,.rv-pop select{width:100%;padding:12px 16px;border:1px solid var(--pk-hair);
        border-radius:4px;font:inherit;color:var(--pk-ink);background:var(--pk-input);box-sizing:border-box}
      .rv-pop input::placeholder,.rv-pop textarea::placeholder{color:var(--pk-muted)}
      .rv-pop select{height:var(--pk-control-h-lg);cursor:pointer}
      /* "Direct to" — which team this comment is routed to for action */
      .rv-directto{display:flex;flex-direction:column;gap:8px}
      .rv-directlabel{font:700 var(--pk-text-2xs)/1 var(--pk-font);text-transform:uppercase;
        letter-spacing:.06em;color:var(--pk-muted)}
      .rv-pop textarea{min-height:96px;resize:vertical}
      .rv-pop input:focus-visible,.rv-pop textarea:focus-visible,.rv-pop select:focus-visible{outline:2px solid var(--pk-red);border-color:var(--pk-red)}
      /* team chip now uses global .pk-team-chip--compact (imported via components.css?inline) */
      /* "change to" popover now uses global .pk-callout--compact (rv-ctxt kept as a JS hook) */
      .rv-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
      .rv-btn{height:var(--pk-control-h-lg);padding:0 24px;border-radius:0;border:none;cursor:pointer;
        font:700 var(--pk-text-sm)/1 var(--pk-font);letter-spacing:.09em;text-transform:uppercase}
      .rv-btn.primary{background:var(--pk-red);color:var(--pk-ink)}
      .rv-btn.ghost{background:transparent;color:var(--pk-muted)}
      .rv-x{border:none;background:none;cursor:pointer;font-size:var(--pk-text-3xl);line-height:1;color:var(--pk-muted)}
      .rv-hmain{min-width:0;flex:1}
      /* Edit + View details cluster in the thread header, right under the selected element.
         Styled as clearly-clickable outline buttons (not the muted ghost) with a red hover. */
      .rv-hactions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .rv-hactions .rv-btn.ghost{height:var(--pk-control-h-sm);padding:0 12px;border:1px solid var(--pk-hair);letter-spacing:.06em;
        color:var(--pk-ink);background:var(--pk-card);transition:background .15s,border-color .15s,color .15s}
      @media (min-width:1024px) and (hover:hover){.rv-hactions .rv-btn.ghost:hover{background:var(--pk-elev);border-color:var(--pk-red);color:var(--pk-red-ink)}}
      .rv-hactions .rv-btn.ghost:focus-visible{outline:2px solid var(--pk-red);outline-offset:1px}
      /* Back link in the composer header (edit mode) */
      .rv-hback{border:none;background:none;cursor:pointer;padding:0;margin-bottom:8px;
        font:700 var(--pk-text-xs)/1 var(--pk-font);letter-spacing:.06em;text-transform:uppercase;color:var(--pk-muted)}
      @media (min-width:1024px) and (hover:hover){.rv-hback:hover{color:var(--pk-ink)}}
      .rv-read{padding:16px 24px 0;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .rv-viewdetails{flex:none}
      /* thread = single-open accordion of past comments (collapsed to Team + Name) */
      .rv-thread{max-height:300px;overflow:auto;padding:12px 24px;display:flex;flex-direction:column;gap:8px}
      .rv-titem{border:1px solid var(--pk-hair);border-radius:10px;overflow:hidden}
      .rv-thead{width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;
        background:var(--pk-elev);cursor:pointer;font:inherit;color:inherit;text-align:left}
      .rv-tname{flex:1;min-width:0;font-weight:600;font-size:var(--pk-text-base);
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rv-tchev{width:16px;height:16px;flex:none;transition:transform .15s}
      .rv-titem.open .rv-tchev{transform:rotate(180deg)}
      .rv-tbody{padding:12px;display:flex;flex-direction:column;gap:8px}
      .rv-titem:not(.open) .rv-tbody{display:none}
      .rv-tmeta{font-size:var(--pk-text-sm);color:var(--pk-muted)}
      .rv-reply{padding:16px 24px 24px;border-top:1px solid var(--pk-hair);display:flex;flex-direction:column;gap:12px}
      .rv-reply input,.rv-reply textarea{width:100%;padding:12px 16px;border:1px solid var(--pk-hair);border-radius:4px;
        font:inherit;color:var(--pk-ink);background:var(--pk-input);box-sizing:border-box}
      .rv-reply textarea{min-height:64px;resize:vertical}
      .rv-reply input:focus-visible,.rv-reply textarea:focus-visible{outline:2px solid var(--pk-red);border-color:var(--pk-red)}
      .rv-meta{display:flex;align-items:center;gap:8px;font-size:var(--pk-text-sm);color:var(--pk-muted)}
      /* status chip now uses global .pk-status-chip (imported via components.css?inline) */
      .rv-txt{white-space:pre-wrap;color:var(--pk-ink)}
      .rv-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:var(--pk-z-ov-toast);
        max-width:calc(100vw - 32px);padding:12px 16px;border-radius:12px;background:var(--pk-card);color:var(--pk-ink);
        font:500 var(--pk-text-base)/1.5 var(--pk-font);box-shadow:var(--pk-shadow-md)}
      /* Draft pins (F2): a dashed, hollow marker for a pending (not-yet-submitted) draft,
         visually distinct from a live team-coloured pin. Number stays legible. */
      .rv-pin.draft{background:var(--pk-elev);border-style:dashed;color:var(--pk-ink)}
      /* Draft tray (F2): floats above the bottom-right dock; .pk-tray styling lives in
         components.css (shared). Hidden until there is ≥1 pending draft. */
      .rv-tray-wrap{position:fixed;right:24px;bottom:84px;z-index:var(--pk-z-ov-tray);width:340px;
        max-width:calc(100vw - 32px)}
      .rv-tray-wrap[hidden]{display:none}
      .rv-tray-wrap .pk-tray-list{display:none}
      .rv-tray-wrap.is-open .pk-tray-list,.rv-tray-wrap.is-open .pk-tray-foot{display:flex}
      .rv-tray-wrap:not(.is-open) .pk-tray-foot{display:none}
      @media (max-width:768px){.rv-tray-wrap{right:16px;bottom:76px}}
      /* Composer template fields (F1) + expected-outcome (F8): labelled rows reusing the
         same input skin as the freeform textarea. currentImage/currentUrl are read-only. */
      .rv-tf{display:flex;flex-direction:column;gap:8px}
      .rv-tf-label{font:700 var(--pk-text-2xs)/1 var(--pk-font);text-transform:uppercase;
        letter-spacing:.06em;color:var(--pk-muted)}
      .rv-tf input[readonly]{color:var(--pk-muted);cursor:default}
      .rv-tf-req{color:var(--pk-red-ink)}
      .rv-typesel-wrap{display:flex;flex-direction:column;gap:8px}
      .rv-fields{display:flex;flex-direction:column;gap:16px}
      /* Paste-to-attach screenshot block */
      .rv-attach{margin-top:12px}
      .rv-attach-hint{font:500 var(--pk-text-sm)/1.4 var(--pk-font);color:var(--pk-muted);
        border:1px dashed var(--pk-hair);border-radius:6px;padding:12px 12px}
      /* Required variant - the same dashed well, raised to body ink on the voltage so it
         reads as a rule to satisfy rather than a passing suggestion. */
      .rv-attach-hint--req{color:var(--pk-body);border-color:var(--pk-red)}
      .rv-attach-hint--req b{color:var(--pk-red-ink);font-weight:700}
      .rv-attach-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
      .rv-attach-lbl{font:700 var(--pk-text-2xs)/1 var(--pk-font);text-transform:uppercase;letter-spacing:.06em;color:var(--pk-muted)}
      .rv-attach-x{border:1px solid var(--pk-hair);background:transparent;color:var(--pk-body);cursor:pointer;
        font:600 var(--pk-text-xs)/1 var(--pk-font);padding:4px 12px;border-radius:4px}
      @media (min-width:1024px) and (hover:hover){.rv-attach-x:hover{color:var(--pk-softred);border-color:var(--pk-softred)}}
      .rv-attach-img{display:block;width:100%;max-height:180px;object-fit:contain;border:1px solid var(--pk-hair);
        border-radius:6px;background:var(--pk-media-bg)}
    `;
    // Mounted below, at the point the dock is built, so review-mode CSS still
    // arrives in the same order as before. injectCss keeps it out of markup, so
    // `style-src 'self'` does not drop it (see ./inject-css.js).
    const mountOverlayCss = () => injectCss(css);

    // ---- helpers ---------------------------------------------------------
    const slugFromPath = () =>
      (pagePath().replace(/^\/|\/$/g, '') || 'home').replace(/[^a-z0-9/-]/gi, '');

    // ---- 5.0 hook: robust anchor resolution -----------------------------------------------
    // The extension exposes window.ProofkitAnchor, which records selector + xpath +
    // textFingerprint + relativePosition and resolves them in order, reporting via:'orphaned'
    // below its similarity threshold instead of returning a wrong element. On a third-party site
    // whose DOM churns (Amazon is heavily A/B tested), refusing to guess is the CORRECT failure —
    // a pin silently attached to the wrong element is worse than one that reports it lost its
    // target. Without the extension this is exactly the previous behaviour: querySelector, or null.
    const resolveAnchorEl = (a) => {
      if (!a) return null;
      const ext = typeof window !== 'undefined' && window.ProofkitAnchor;
      if (ext && typeof ext.resolve === 'function') {
        try {
          const hit = ext.resolve(a);
          return hit && hit.el && hit.via !== 'orphaned' ? hit.el : null;
        } catch (e) { /* fall through to the built-in path */ }
      }
      try { return a.selector ? document.querySelector(a.selector) : null; } catch (e) { return null; }
    };

    function cssPath(el) {
      if (!(el instanceof Element)) return '';
      const parts = []; let node = el, depth = 0;
      while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
        if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
        const cms = node.getAttribute('data-cms');
        if (cms) { parts.unshift('[data-cms="' + cms + '"]'); break; }
        let sel = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
          if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
        }
        parts.unshift(sel); node = node.parentElement; depth++;
      }
      return parts.join(' > ');
    }
    const fmtTime = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
    function toast(msg, ms = 4500) {
      const t = document.createElement('div'); t.className = 'rv-toast'; t.textContent = msg;
      document.body.appendChild(t); setTimeout(() => t.remove(), ms);
    }
    const closePop = () => { document.querySelector('.rv-pop')?.remove(); tempMarker && tempMarker.remove(); tempMarker = null; };

    // ---- state -----------------------------------------------------------
    let reviewOn = false, comments = [], pinEls = new Map(), tempMarker = null, activeId = null, navIdx = -1;
    // F2 batch: pending DRAFTS (local array) held until "Submit all". Each draft is a
    // client-side record-in-progress carrying its anchor, type/template fields, expected
    // outcome, directed team, an optional captured screenshot dataURL, and a local id.
    let drafts = [], draftPinEls = new Map();
    // Once a reviewer drags a pin's overlay aside, remember where (keyed by pin id) so a
    // re-render — e.g. reopening the thread after adding a reply — leaves it parked there
    // instead of snapping back onto the pin. The pin marker itself never moves.
    const threadPos = new Map();
    // A client uuid (crypto or fallback) — used for draft ids AND the per-batch batchId (F2/§2).
    const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID()
      : 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e8).toString(36));

    // ---- bottom-right dock: [nav toolbar] [Comment/Save FAB] -------------
    // The nav toolbar (comment count + prev/next) shows only in review mode,
    // to the LEFT of the FAB. The FAB is the single Save/Comment button.
    mountOverlayCss();
    // The Comment dock (and the host .to-top hide) appear ONLY once the review session
    // is authenticated - i.e. a validated Key is stored in PASS_KEY (`reviewPass`).
    /* Signed in EITHER way. A team key and an account session are both valid credentials here, and
     * this used to test only the key — so anyone the extension signed in with an account (PIN or
     * passkey) had no `pkKey`, read as signed out, and was shown a login panel they had already
     * satisfied. authHeaders() has always preferred the bearer token, so the requests would have
     * worked; only the gate disagreed. */
    const isAuthed = () => !!getSession().key || !!getAuthToken();
    const dock = document.createElement('div'); dock.className = 'rv-dock';
    let dockShown = false;
    function revealDock() {
      // New HUD path: mount the full-screen review HUD instead of the Old dock/composer.
      if (getOverlayUi() === 'new') { mountNewHud(); return; }
      if (dockShown) return;
      dockShown = true;
      document.documentElement.classList.add('rv-armed'); // hides the host .to-top FAB
      dock.style.display = 'flex';
      dashBtn.style.display = 'inline-flex'; // authenticated → offer "Go to Dashboard"
      logoutBtn.style.display = 'inline-flex'; // …and "Log out"
    }

    const nav = document.createElement('div'); nav.className = 'rv-nav';
    const CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
    const CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
    nav.innerHTML =
      '<button type="button" class="rv-prev" aria-label="Previous comment">' + CHEV_L + '</button>' +
      '<span class="rv-nav-label"></span>' +
      '<button type="button" class="rv-next" aria-label="Next comment">' + CHEV_R + '</button>';
    nav.querySelector('.rv-prev').addEventListener('click', () => gotoNav(-1));
    nav.querySelector('.rv-next').addEventListener('click', () => gotoNav(1));

    const fab = document.createElement('button');
    fab.className = 'rv-fab'; fab.type = 'button';
    const ICON_CHAT =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    // Comment (dark) when idle -> Exit Review Mode (accent) once greyscale/review is on.
    // It is NOT a save button and never was: every comment is already saved on submit, so this
    // only leaves review state. Labelling it "Save" implied unsaved work was riding on the click —
    // which invites the opposite mistake, leaving without pressing it and assuming things were lost.
    // No glyph on the exit state: a tick means "done/saved", which is the exact thing this button
    // does NOT do. The words carry it.
    /* "Stop Review Mode" rather than "Exit Review": while review is running this is the only
     * control that ends it, and the pair it sits with — Go To Dashboard, Log Out — are both
     * full statements of what they do. */
    const fabHtml = (on) => (on ? '' : ICON_CHAT) + '<span>' + (on ? 'Stop Review Mode' : 'Comment') + '</span>';

    /**
     * Move the FAB between its two states without the UI appearing to blink from one layout to
     * another. Three things change at once and each is given its own timing:
     *   colour  transitions immediately, so the change is felt before it is read
     *   label   fades out, is replaced while invisible, fades back in
     *   width   is animated between the measured old and new sizes — an auto-width pill cannot
     *           transition on its own, so the two widths are taken and interpolated explicitly
     */
    let fabSwap = null;
    function setFab(on, animate) {
      fab.dataset.on = on ? '1' : '0';          // set first: the colour starts moving right away
      if (!animate) { fab.innerHTML = fabHtml(on); return; }
      clearTimeout(fabSwap);
      const from = fab.getBoundingClientRect().width;
      fab.classList.add('is-swapping');
      fabSwap = setTimeout(() => {
        fab.innerHTML = fabHtml(on);
        fab.style.width = 'auto';
        const to = fab.getBoundingClientRect().width;
        fab.style.width = from + 'px';
        requestAnimationFrame(() => {
          fab.style.width = to + 'px';
          fab.classList.remove('is-swapping');
        });
        // Hand the width back to the content once the animation has landed, so later label
        // changes are not pinned to a stale pixel value.
        fabSwap = setTimeout(() => { fab.style.width = ''; }, 340);
      }, 140);
    }
    setFab(false);
    fab.addEventListener('click', () => (reviewOn ? exit() : startReview()));

    // "Go To Dashboard" — every authenticated reviewer gets it, pinned to the bottom
    // LEFT (its own fixed control, clear of the right-hand dock). Admins (ADMIN_TEAM)
    // land on /reviewdash; teams on /teamdash.
    const dashBtn = document.createElement('button');
    dashBtn.className = 'rv-dash'; dashBtn.type = 'button';
    const ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1"/></svg>';
    dashBtn.innerHTML = ICON_GRID + '<span>Go To Dashboard</span>';
    dashBtn.style.display = 'none'; // shown by revealDock() once authenticated
    dashBtn.addEventListener('click', () => {
      /* Straight to their own board. The session crosses the origin boundary by way of the
       * extension: bridge.js runs on the dashboard origin at document_start and seeds the page
       * with the session it already holds, so an authenticated reviewer lands IN the board rather
       * than on its sign-in screen. Without an extension there is nothing to carry it, and the
       * login gate is the honest destination — it is also the right one when we do not yet know
       * which team's board to open. */
      (async () => {
        if (!(await saveBeforeLeaving('opening the dashboard'))) return;
        location.href = homeUrl();
      })();
    });
    document.body.appendChild(dashBtn); // bottom-left, independent of the dock

    // "Log out" — end the session (drop the identity) and return to the sign-in panel. Its own
    // bottom-left button, stacked above "Go To Dashboard"; shown by revealDock() once authed.
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'rv-logout'; logoutBtn.type = 'button';
    const ICON_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    logoutBtn.innerHTML = ICON_LOGOUT + '<span>Log out</span>';
    logoutBtn.style.display = 'none'; // shown by revealDock() once authenticated
    logoutBtn.addEventListener('click', logout);
    document.body.appendChild(logoutBtn); // bottom-left, above dashBtn

    dock.appendChild(nav);
    dock.appendChild(fab);
    dock.style.display = 'none'; // hidden until the review session is authenticated (revealDock)
    document.body.appendChild(dock);

    // ---- draft tray (F2): "Pending pins (n)" ----------------------------
    // Floats just above the dock. Expandable list of pending drafts (edit/remove each),
    // with a single "Submit all" that POSTs the whole batch. Hidden while empty.
    const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
    const trayWrap = document.createElement('div');
    trayWrap.className = 'rv-tray-wrap'; trayWrap.hidden = true;
    trayWrap.innerHTML =
      '<div class="pk-tray">' +
        '<button type="button" class="pk-tray-head"><span class="rv-tray-title">Pending pins</span>' +
          '<span class="pk-tray-count">0</span></button>' +
        '<div class="pk-tray-list"></div>' +
        '<div class="pk-tray-foot">' +
          '<button type="button" class="rv-btn ghost rv-tray-clear">Discard all</button>' +
          '<button type="button" class="rv-btn primary rv-tray-submit pk-u-flex1">Submit all</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(trayWrap);
    let trayOpen = false;
    trayWrap.querySelector('.pk-tray-head').addEventListener('click', () => {
      trayOpen = !trayOpen; trayWrap.classList.toggle('is-open', trayOpen);
    });
    trayWrap.querySelector('.rv-tray-submit').addEventListener('click', () => submitAll());
    trayWrap.querySelector('.rv-tray-clear').addEventListener('click', async () => {
      if (!drafts.length) return;
      if (!(await pkConfirm({ title: 'Discard pending pins', message: 'Discard all ' + drafts.length + ' pending pin(s)?', confirmLabel: 'Discard', danger: true }))) return;
      drafts = []; renderDraftPins(); renderTray();
    });

    function renderTray() {
      const n = drafts.length;
      trayWrap.hidden = n === 0;
      if (n === 0) { trayOpen = false; trayWrap.classList.remove('is-open'); }
      trayWrap.querySelector('.rv-tray-title').textContent = 'Pending pins';
      trayWrap.querySelector('.pk-tray-count').textContent = String(n);
      const anyFailed = drafts.some((d) => d.error);
      const submitBtn = trayWrap.querySelector('.rv-tray-submit');
      submitBtn.textContent = anyFailed ? 'Retry failed' : 'Submit all';
      const list = trayWrap.querySelector('.pk-tray-list');
      list.innerHTML = '';
      drafts.forEach((d, i) => {
        const item = document.createElement('div');
        item.className = 'pk-tray-item' + (d.error ? ' is-failed' : '');
        const typeLabel = (COMMENT_TYPES.find((t) => t.value === d.commentType) || {}).label || 'General';
        item.innerHTML =
          '<div class="pk-tray-item-body">' +
            '<div class="pk-tray-item-summary"></div>' +
            '<div class="pk-tray-item-meta"></div>' +
          '</div>' +
          '<div class="pk-tray-item-actions">' +
            '<button type="button" class="pk-tray-iconbtn rv-d-edit" aria-label="Edit draft">' + ICON_EDIT + '</button>' +
            '<button type="button" class="pk-tray-iconbtn rv-d-del" aria-label="Remove draft">' + ICON_TRASH + '</button>' +
          '</div>';
        item.querySelector('.pk-tray-item-summary').textContent =
          renderSummary(d.commentType, d.templateFields, d.comment) || '(pin ' + (i + 1) + ')';
        item.querySelector('.pk-tray-item-meta').textContent =
          d.error ? ('Failed: ' + d.error) : (typeLabel + ' · to ' + (d.toTeam || ADMIN_TEAM) + (d.imageDataUrl ? ' · shot' : ''));
        item.querySelector('.rv-d-edit').addEventListener('click', () => editDraft(d.draftId));
        item.querySelector('.rv-d-del').addEventListener('click', () => removeDraft(d.draftId));
        list.appendChild(item);
      });
    }
    function removeDraft(draftId) {
      drafts = drafts.filter((d) => d.draftId !== draftId);
      renderDraftPins(); renderTray();
    }

    // ---- enter / exit review mode ---------------------------------------
    const backdrop = document.createElement('div'); backdrop.className = 'rv-backdrop';

    // ---- 5.0: external (extension) mode ---------------------------------------------------
    // True when the core was armed by the browser extension on a page we do NOT control. The
    // extension defines window.ProofkitAnchor / window.ProofkitCapture before importing the core,
    // so their presence is the signal — the same additive-hook convention used for those two.
    //
    // This decides which review chrome runs, and it is not cosmetic. The HUD renders the page into
    // an <iframe> (overlay-hud.js: `.cv-frame`) and puts its grayscale filter on THAT frame. Any
    // site sending X-Frame-Options or frame-ancestors refuses to be framed — which is most large
    // sites — so on a foreign origin the HUD canvas is blank. And because the HUD path deliberately
    // skips the full-page backdrop, the real page never greys either: the reviewer sees nothing
    // happen at all. On a foreign origin we therefore always take the in-page path, which operates
    // on the real DOM and needs no framing.
    const externalMode = () =>
      !!(window.PROOFKIT_EXTERNAL || window.ProofkitAnchor || window.ProofkitCapture);

    // After the HUD is closed the tab stays signed-in but OUT of review. These shortcuts are the
    // way back in without retyping the URL: `r` re-enters review here, `d` opens the dashboard.
    // Ignored while typing, with a modifier held, or once review is running again.
    let shortcutsOn = false;
    function armShortcuts() {
      if (shortcutsOn) return;
      shortcutsOn = true;
      document.addEventListener('keydown', onShortcutKey);
    }
    function onShortcutKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.getElementById('pkhud')) return;              // review already open
      const k = (e.key || '').toLowerCase();
      if (k === 'd') { location.href = getSession().team === ADMIN_TEAM ? BASE : TEAM_BASE; return; }
      if (k === 'r') {
        e.preventDefault();
        try { sessionStorage.setItem(KEY, '1'); } catch (err) {}  // re-arm this tab
        document.removeEventListener('keydown', onShortcutKey); shortcutsOn = false;
        startReview();
      }
    }

    // New HUD path: load this page's comments, then mount the HUD with them (Phase 4 pins/list).
    async function mountNewHud() {
      if (document.getElementById('pkhud')) return;
      let list = [];
      try { list = await store.list(pagePath()); } catch (e) { list = []; }
      comments = list;
      const hudCtx = {
        comments: list,
        // Arrived from a dashboard "Open Pin" (…#c=<id>)? Hand the HUD the ROOT pin to focus, so
        // it scrolls the canvas to it and opens its thread instead of dropping the reviewer at the
        // top of a long page to hunt for it. deepRootId() resolves a reply to its root and returns
        // null when the id is not on this page; the hash was captured before enter() rewrote it.
        focusId: deepRootId(),
        onExit: armShortcuts,          // closed the HUD → `r` re-enters review, `d` goes to the dashboard
        draftCount: () => drafts.length,
        // Parity: post a reply on an existing pin (the Quick-questions channel) — same record
        // shape the Old thread sends, so notifications/threading behave identically.
        postReply: async (root, txt) => {
          const rec = await store.add({
            team: getSession().team, toTeam: root.toTeam || ADMIN_TEAM, comment: txt,
            sessionId: sessionId(), parentId: root.id, anchor: root.anchor, page: root.page,
          });
          comments.push(rec);
          return rec;
        },
        // Parity: the raiser confirms a deployed_live fix from the page.
        confirmFix: async (id) => {
          const upd = await store.confirm(id);
          const i = comments.findIndex((c) => c.id === (upd && upd.id));
          if (i >= 0 && upd) comments[i] = upd;
          return upd;
        },
        // Phase 5: the HUD hands over a draft; we store the SAME draft shape/id the Old tray uses.
        saveDraft: (d) => { drafts.push(Object.assign({ draftId: uuid() }, d)); return drafts.length; },
        // Phase 5: reuse the PROVEN persist path — upload screenshots, then ONE batch POST built by
        // draftToRecord (identical record shape + server-parity summary to the Old composer).
        submitAll: async () => {
          if (!drafts.length) return { comments, failed: 0 };
          const batchId = uuid();
          const pending = drafts.slice();
          for (const d of pending) {
            if (d.imageDataUrl && !d.imageId) {
              try {
                const res = await store.uploadImage(d.imageDataUrl); d.imageId = (res && res.imageId) || '';
                // The full-screen shot is what gives a builder the context the crop loses.
                d.viewportImageId = await uploadContextShot(d.viewportDataUrl);
              }
              catch (e) { d.imageId = ''; }
            }
          }
          let results = [];
          try {
            const resp = await store.addBatch(pending.map((d) => draftToRecord(d, batchId)));
            results = (resp && resp.results) || [];
          } catch (e) { return { comments, failed: pending.length }; }
          const failedDrafts = [];
          results.forEach((r, i) => { if (!(r && r.ok)) failedDrafts.push(pending[i]); });
          drafts = failedDrafts;                       // retry-failed-only, same as the Old tray
          try { comments = await store.list(pagePath()); } catch (e) {}
          return { comments, failed: failedDrafts.length };
        },
        // Phase 5.2: composer quality check. POST /lint scores a draft BEFORE it is saved
        // ({score:'ok'|'vague'|'missing', issues:[], suggestedRewrite?}). Purely advisory — it is
        // called on a debounce while typing and never gates the save, so a lint outage, a missing
        // WORKER_URL (local demo) or an AI hiccup costs the reviewer nothing. Resolves to null on
        // ANY failure and the composer simply shows no hint.
        lintDraft: async (d) => {
          if (!WORKER_URL) return null;
          try {
            return await apiFetch('/lint', { method: 'POST', body: JSON.stringify({
              commentType: d.commentType, templateFields: d.templateFields || {},
              comment: d.comment || '', expectedOutcome: d.expectedOutcome || '',
              page: pagePath(), selector: (d.anchor && d.anchor.selector) || '',
            }) });
          } catch (e) { return null; }
        },
        // Log out from the HUD's Show pane — mirror the Old overlay's logout(): drop the reviewer
        // identity and re-show the sign-in panel (the HUD tears itself down + disarms review first).
        onLogout: () => { clearSession(); showLogin(); },
        confirm: (msg) => pkConfirm({ title: 'Log out', message: msg, confirmLabel: 'Log out', danger: true }),
      };
      // A throw inside mountHud used to be swallowed by this async caller: review armed, nothing
      // on screen, no error anywhere. Surface it instead, and leave a way back in.
      try { mountHud(hudCtx); }
      catch (e) {
        console.error('[proofkit] review overlay failed to mount', e);
        toast('Could not open the review overlay — ' + (e && e.message ? e.message : 'unknown error'), 6000);
        armShortcuts();   // leave a way back in: `r` retries, `d` goes to the dashboard
      }
    }

    /** Upload the full-screen context shot, but never let it hold up a ticket. Bounded and
     *  failure-tolerant: a missing context image is a cosmetic loss, a stuck Save is not. */
    async function uploadContextShot(dataUrl) {
      if (!dataUrl) return '';
      try {
        const res = await Promise.race([
          store.uploadImage(dataUrl),
          new Promise((r) => setTimeout(() => r(null), 8000)),
        ]);
        return (res && res.imageId) || '';
      } catch (e) { return ''; }
    }

    async function enter() {
      // New HUD path: it's self-contained (own B&W canvas + chrome), so DON'T run the Old
      // review chrome — no full-page grayscale backdrop, dock, FAB, or legacy pins. This is
      // why closing the HUD leaves the page in full colour.
      //
      // 5.0: NEVER on a foreign origin. The HUD frames the page, and a site that refuses framing
      // gets a blank canvas with no grayscale anywhere — see externalMode().
      if (getOverlayUi() === 'new' && !externalMode()) {
        reviewOn = true; try { history.replaceState(null, '', reviewUrl()); } catch (e) {} mountNewHud(); return;
      }
      revealDock();       // authenticated -> the Comment/Save dock is now visible
      reviewOn = true;
      setFab(true, true);
      nav.classList.add('is-in');
      // Only the host site gets the /<page>/review address. Rewriting a foreign site's URL is
      // visible to the reviewer and can trip that site's own router on an SPA.
      if (!externalMode()) { try { history.replaceState(null, '', reviewUrl()); } catch (e) {} }
      document.body.appendChild(backdrop);
      pinObserver.observe(document.body, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-open', 'data-panel', 'open'] });
      try { comments = await store.list(pagePath()); }
      catch (e) {
        if (e.message === 'unauthorized') { toast('Wrong passcode — try again.'); return exit(); }
        toast('Could not load comments — ' + e.message); comments = [];
      }
      renderPins();
      // deep link: #c=<id> opens that comment (hash captured before the URL rewrite). An extra
      // &edit=1 (the dashboard "Edit comment" action) opens the editor directly when the caller may
      // still edit — otherwise it falls back to the read-only thread with a note.
      const m = DEEP_HASH.match(/c=([^&]+)/);
      if (m) {
        const c = comments.find((x) => x.id === m[1]);
        const root = c && (c.parentId ? comments.find((x) => x.id === c.parentId) : c);
        if (root) {
          const editReq = /[#&]edit=1(?:&|$)/.test(DEEP_HASH);
          const canEdit = editReq && canEditComment(root);
          if (editReq && !canEdit) toast('This comment can no longer be edited (Builder already started it).', 5000);
          scrollToComment(root);
          setTimeout(() => canEdit ? openEditComment(root) : openThread(root), 350);
        }
      }
      else toast('Tip: ⌘/Ctrl-click anywhere on the page to drop a pin.', 5000);
    }
    // Tear the active review down — state + on-page chrome. Shared by exit() and logout().
    function teardownReview() {
      reviewOn = false;
      setFab(false, true);
      nav.classList.remove('is-in');
      pinObserver.disconnect();
      // address bar → back to the page. Skipped on a foreign origin: we never rewrote it on entry,
      // and pagePath() drops the query string — exiting review would silently mutate a URL like
      // /dp/B0ABC?ref=xyz down to /dp/B0ABC on a site we don't control.
      if (!externalMode()) { try { history.replaceState(null, '', pagePath()); } catch (e) {} }
      backdrop.remove(); closePop();
      pinEls.forEach((el) => el.remove()); pinEls.clear();
      drafts = []; draftPinEls.forEach((el) => el.remove()); draftPinEls.clear(); renderTray();
      activeId = null;
      sessionStorage.removeItem(SESSION_KEY); // end this review session -> next entry logs separately
      // The router's one-shot arm signal must never outlive its consumption; a stale one re-arms
      // review on the next page load (see the HUD exit for the same guard).
      try { sessionStorage.removeItem('pkAutoReview'); } catch (e) {}
    }
    async function exit() {
      // F2: exiting review with unsent drafts pending ⇒ confirm-discard (they live only in
      // memory, never POSTed, so leaving would silently lose them).
      if (drafts.length && !(await pkConfirm({ title: 'Leave review', message: 'You have ' + drafts.length + ' pending pin(s) not yet submitted. Discard them and leave review?', confirmLabel: 'Discard & leave', danger: true }))) return;
      teardownReview();
    }
    // Log out — drop the session identity and return to the sign-in panel. Unlike exit() (which
    // keeps you signed in, ready to re-enter review), this disarms the authed chrome (dock + the
    // bottom-left buttons) and clears the session, so a fresh sign-in re-reveals everything.
    /* Leaving a review — by logging out or by opening the dashboard — submits what is pending
     * first. Pins are the whole product of the session, and both of these used to lose them: the
     * dashboard link navigated away without a word, and logout offered only to DISCARD them.
     * Offering to throw away someone's work as the default path out is a strange thing for a
     * review tool to do. Saving is now the default, and it is still a question, because a failed
     * submit must not silently strand the pins either. */
    async function saveBeforeLeaving(what) {
      if (!drafts.length) return true;
      const n = drafts.length;
      const choice = await pkConfirm({
        title: 'Save your pins?',
        message: n + ' pending pin(s) have not been submitted yet. Submit them before ' + what + '?',
        confirmLabel: 'Submit and continue',
        cancelLabel: 'Cancel',
      });
      if (!choice) return false;              // they backed out — stay exactly where they are
      try { await submitAll(); } catch (e) {
        return await pkConfirm({
          title: 'Could not submit',
          message: 'Your pins could not be sent. Continue anyway and lose them?',
          confirmLabel: 'Continue anyway', danger: true,
        });
      }
      return true;
    }

    async function logout() {
      if (!(await saveBeforeLeaving('logging out'))) return;
      if (!(await pkConfirm({ title: 'Log out', message: 'Log out of this review session?', confirmLabel: 'Log out', danger: true }))) return;
      teardownReview();
      dock.style.display = 'none';
      dashBtn.style.display = 'none';
      logoutBtn.style.display = 'none';
      dockShown = false;
      document.documentElement.classList.remove('rv-armed');

      /* Log out means log out — of EVERYTHING this tab can reach. Previously it dropped only the
       * team key, which left three things alive that each put the user straight back into review:
       *   1. the account session (token + identity), which is a credential in its own right;
       *   2. this tab's arm flag;
       *   3. the extension's stored session and its record that this tab is armed — so the next
       *      navigation re-injected and re-armed the page.
       * Clearing one of three read as "log out did nothing". */
      try { await fetch(WORKER_URL.replace(/\/$/, '') + '/auth/logout', { method: 'POST', headers: authHeaders() }); }
      catch (e) { /* the local session goes regardless — never leave someone signed in because a
                     network call failed on the way out */ }
      clearSession();
      clearAccount();
      try { sessionStorage.removeItem(KEY); localStorage.removeItem('reviewMode'); } catch (e) {}
      extSignOut();

      /* Where to leave them. On a page we own, the sign-in panel IS the resting state — they are
       * on Proofkit, and the way back in belongs on screen. On someone else's site it does not:
       * they asked to leave, so the page returns to exactly how they found it and the extension
       * is the way back in. */
      if (externalMode()) toast('Signed out of Proofkit.', 3000);
      else showLogin();
    }

    /** Tell the extension to forget the session and stop treating this tab as armed. Silent no-op
     *  outside the extension — the dashboards have no extension to sign out of. */
    function extSignOut() {
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
        chrome.runtime.sendMessage({ type: 'signout' }, () => void chrome.runtime.lastError);
      } catch (e) { /* not running under the extension */ }
    }

    // ---- pins ------------------------------------------------------------
    function pinPos(rec) {
      const a = rec.anchor || {};
      let el = resolveAnchorEl(a);
      if (el) { const r = el.getBoundingClientRect();
        return { x: r.left + ((a.xPct || 0) / 100) * r.width, y: r.top + ((a.yPct || 0) / 100) * r.height }; }
      return { x: (a.pageX || 0) - window.scrollX, y: (a.pageY || 0) - window.scrollY };
    }
    const roots = () => comments.filter((c) => !c.parentId);
    // On-page pins show every root EXCEPT terminal ones — deployed_live (shipped) and
    // disregarded (closed without building) are both hidden from the website (F5 rewire:
    // teamStatus is the ONLY status; the dead `status` field — open/resolved/closed — is gone).
    // A dashboard "Open Pin" (#c=<id>) still force-shows its target even when terminal. Capture
    // the deep-link hash NOW: enter() rewrites the address bar (dropping #c=).
    const DEEP_HASH = location.hash;
    const teamStatusOf = (c) => c.teamStatus || 'to_be_initiated';
    // Hidden on-page: disregarded (invalid) and CONFIRMED deployments. A deployed_live fix stays
    // pinned until the raiser confirms it (so they can confirm on-page); it drops off once confirmed.
    const isVisibleRoot = (c) => teamStatusOf(c) !== 'disregarded' &&
      !(teamStatusOf(c) === 'deployed_live' && c.bugFixConfirmed);
    function deepRootId() {
      const m = DEEP_HASH.match(/c=([^&]+)/); if (!m) return null;
      const c = comments.find((x) => x.id === m[1]); return c ? (c.parentId || c.id) : null;
    }
    const pinRoots = () => { const d = deepRootId(); return comments.filter((c) => !c.parentId && (isVisibleRoot(c) || c.id === d)); };
    const repliesOf = (id) => comments.filter((c) => c.parentId === id)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    // Colour a pin by the TEAM that raised it (TEAM_COLORS [bg,text] from config.js) so a page
    // shared by several teams reads at a glance who owns each pin. The 2px border keeps the
    // teamStatus signal (STATUS_COLORS) as a ring, so both dimensions show at once. Unknown team
    // ⇒ the original red/ink fill (zero-regression fallback for legacy/teamless records).
    function paintPin(pin, rec) {
      const tc = TEAM_COLORS[(rec && rec.team) || ''];
      pin.style.background = tc ? tc[0] : 'var(--pk-red)';
      pin.style.color = tc ? tc[1] : 'var(--pk-on-accent)';
      // Border is team-toned (not a status colour) — team is the whole pin: fill + ring + number.
      pin.style.borderColor = tc ? tc[1] : 'var(--pk-ink)';
      // Status is a SEPARATE small corner dot (saturated STATUS_COLORS), spatially + stylistically
      // distinct from the pastel team fill — so team and status can never read as the same signal.
      let dot = pin.querySelector('.rv-pin-status');
      if (!dot) { dot = document.createElement('span'); dot.className = 'rv-pin-status'; pin.appendChild(dot); }
      const statusToken = STATUS_COLORS[teamStatusOf(rec)] || STATUS_COLORS.to_be_initiated;
      dot.style.background = 'var(' + statusToken + ')';
      dot.title = 'Status: ' + teamStatusOf(rec).replace(/_/g, ' ');
    }
    function renderPins() {
      pinEls.forEach((el) => el.remove()); pinEls.clear();
      const rs = pinRoots();
      // The on-page number is the record's DEFINITIVE per-page sequence (pageSeq). Legacy pins
      // predating pageSeq have none — fall back to positional numbering for the whole page then, so
      // stored + positional numbers can never collide on a mixed page.
      const useSeq = rs.length > 0 && rs.every((r) => r.pageSeq);
      rs.forEach((rec, i) => {
        const pin = document.createElement('button');
        pin.className = 'rv-pin';
        pin.type = 'button'; pin.textContent = String(useSeq ? rec.pageSeq : i + 1);
        paintPin(pin, rec);
        pin.addEventListener('click', (e) => { e.stopPropagation(); openThread(rec); });
        document.body.appendChild(pin); pinEls.set(rec.id, pin);
      });
      renderDraftPins();
      positionPins();
      updateNav();
    }
    // F2: pending drafts get their own dashed, hollow markers so the reviewer sees where the
    // not-yet-submitted pins sit. Numbered continuing on from the live pins; click ⇒ edit.
    function renderDraftPins() {
      draftPinEls.forEach((el) => el.remove()); draftPinEls.clear();
      const base = pinRoots().length;
      drafts.forEach((d, i) => {
        const pin = document.createElement('button');
        pin.className = 'rv-pin draft';
        pin.type = 'button'; pin.textContent = String(base + i + 1);
        pin.title = 'Pending — click to edit';
        pin.addEventListener('click', (e) => { e.stopPropagation(); editDraft(d.draftId); });
        document.body.appendChild(pin); draftPinEls.set(d.draftId, pin);
      });
      positionPins();
    }
    // ---- comment navigator (banner: count + prev/next) ------------------
    function updateNav() {
      const total = pinRoots().length;
      const label = nav.querySelector('.rv-nav-label');
      const prev = nav.querySelector('.rv-prev'), next = nav.querySelector('.rv-next');
      if (!label) return;
      if (navIdx >= total) navIdx = total - 1;
      if (total === 0) label.textContent = 'No comments';
      else if (navIdx < 0) label.textContent = total + (total === 1 ? ' comment' : ' comments');
      else label.textContent = (navIdx + 1) + ' / ' + total;
      if (prev) prev.disabled = total === 0;
      if (next) next.disabled = total === 0;
    }
    function gotoNav(delta) {
      const rs = pinRoots(); if (!rs.length) return;
      navIdx = (navIdx + delta + rs.length) % rs.length;
      const r = rs[navIdx];
      scrollToComment(r);
      openThread(r);
    }
    // Is an anchored element actually on-screen right now? Toggleable overlays (mega-nav, drawers,
    // tab panels) hide content with visibility:hidden / a collapsed ancestor — which KEEPS a layout
    // box, so querySelector still finds it and getBoundingClientRect still returns a rect. Without
    // this guard a pin floats over the page at that phantom position (the reported mega-nav bug).
    // Native checkVisibility handles display/visibility/opacity/content-visibility + ancestors;
    // fall back to a manual check where it isn't available.
    function isAnchorVisible(el) {
      if (!el || !el.isConnected) return false;
      if (typeof el.checkVisibility === 'function')
        return el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0;
    }
    function positionPins() {
      const place = (pin, rec) => {
        if (!pin) return;
        const a = rec.anchor || {};
        let el = resolveAnchorEl(a);
        // Anchor present but currently hidden (closed menu / inactive tab) → hide the pin, don't
        // float it at the element's phantom rect.
        if (el && !isAnchorVisible(el)) { pin.style.display = 'none'; return; }
        const { x, y } = pinPos(rec);
        const off = x < -40 || y < -40 || x > innerWidth + 40 || y > innerHeight + 40;
        pin.style.display = off ? 'none' : 'flex';
        pin.style.left = x + 'px'; pin.style.top = y + 'px';
      };
      pinRoots().forEach((rec) => place(pinEls.get(rec.id), rec));
      drafts.forEach((d) => place(draftPinEls.get(d.draftId), d)); // pending drafts anchor the same way
      // The open composer's temp marker tracks its clicked element too, so the pin stays glued to
      // the content on scroll (the composer card itself is free to stay in the viewport / be dragged).
      if (tempMarker && tempMarker._anchor) place(tempMarker, { anchor: tempMarker._anchor });
    }
    let raf = 0;
    const onScroll = () => { if (!reviewOn) return; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; positionPins(); }); };
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', onScroll);
    // Overlays (mega-nav, drawers, tabs) reveal/hide content via attribute/class changes that fire
    // neither scroll nor resize — re-place pins on those mutations too, so they hide/re-anchor the
    // instant a menu opens, closes, or switches tab. rAF-throttled through onScroll; armed only
    // while review is on (connected in enter(), disconnected in teardownReview()).
    const pinObserver = new MutationObserver(onScroll);
    function scrollToComment(rec) {
      const a = rec.anchor || {};
      let top = a.pageY || 0;
      { const el = resolveAnchorEl(a); if (el) top = el.getBoundingClientRect().top + window.scrollY; }
      window.scrollTo({ top: Math.max(0, top - innerHeight / 2), behavior: 'smooth' });
    }

    // ---- ⌘/Ctrl-click anywhere to add -----------------------------------
    // A new pin drops ONLY on a deliberate ⌘/Ctrl+click. Plain clicking, following a link and
    // selecting on-page copy (to paste into the composer, e.g. the "current text" of a copy-fix)
    // then all behave exactly as on the live page — the overlay no longer hijacks every click,
    // so the old double-click / selection / defer guards are unnecessary. We still track the
    // press point only to reject a modifier-held drag.
    let downX = 0, downY = 0;
    document.addEventListener('mousedown', (e) => { downX = e.clientX; downY = e.clientY; }, true);
    document.addEventListener('click', (e) => {
      if (!reviewOn) return;
      if (!(e.metaKey || e.ctrlKey)) return;   // plain clicks are for reading/selecting, not pinning
      // A composer is already open → its pin is LOCKED. Ignore further ⌘/Ctrl+clicks so that
      // selecting on-page copy to paste in (⌘/Ctrl-click or -double-click a word) never
      // relocates the marker to where the mouse was released. Close the composer to drop another.
      if (tempMarker) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      // Ignore clicks on Proofkit's own controls — including the bottom-left
      // "Go To Dashboard" button (.rv-dash), which lives outside the .rv-dock now.
      if (t.closest('.rv-pin, .rv-pop, .rv-dock, .rv-dash, .rv-toast, .rv-tray-wrap')) return;
      // Swallow the page's own reaction to the modified click (e.g. a link opening in a new tab).
      e.preventDefault(); e.stopPropagation();
      // A ⌘/Ctrl+drag is a selection gesture, not a pin.
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
      openComposer(t, e.clientX, e.clientY, e.pageX, e.pageY);
    }, true);

    // Auto-fill sources (F1) from the clicked element: `currentImage` (src|alt|selector) for
    // image-swap, `currentUrl` (nearest <a href>) for link-fix. Empty when not applicable.
    function elementAutoFill(el) {
      const out = { currentImage: '', currentUrl: '' };
      if (!(el instanceof Element)) return out;
      const img = el.tagName === 'IMG' ? el : el.querySelector && el.querySelector('img');
      if (img && img.getAttribute) {
        const src = img.getAttribute('src') || img.currentSrc || '';
        const alt = img.getAttribute('alt') || '';
        out.currentImage = (src || alt) ? (src + (alt ? ' — “' + alt + '”' : '')) : cssPath(el);
      }
      const a = el.closest && el.closest('a[href]');
      if (a) out.currentUrl = a.getAttribute('href') || '';
      return out;
    }

    // The composer. `editing` (a draft) reopens an existing pending pin; otherwise a fresh
    // draft is being marked. Builds: F7 dup-warning strip · F1 type selector + template
    // fields · Direct-to · notes · F8 expected-outcome. "Add pin" saves a DRAFT (F2) — no
    // POST until "Submit all". `general` keeps EXACTLY the v2 single-textarea + Direct-to flow.
    // `editRec` (a real STORED record) reopens a submitted comment for a full re-edit of every
    // parameter — routed to saveEdit → store.update. `editing` (a draft) reopens a pending pin.
    // `seed` is whichever is present: both carry anchor/commentType/templateFields/comment/toTeam.
    function openComposer(el, cx, cy, px, py, editing, editRec) {
      closePop();
      const seed = editRec || editing;   // seed the composer from either shape
      let targetEl = el instanceof Element ? el : document.body;
      const r = targetEl.getBoundingClientRect();
      const anchor = seed ? Object.assign({}, seed.anchor) : {
        selector: cssPath(targetEl),
        snippet: (targetEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        tag: targetEl.tagName.toLowerCase(),
        xPct: r.width ? Math.round(((cx - r.left) / r.width) * 100) : 0,
        yPct: r.height ? Math.round(((cy - r.top) / r.height) * 100) : 0,
        pageX: Math.round(px), pageY: Math.round(py),
        docHeight: document.documentElement.scrollHeight, viewportW: innerWidth,
      };
      // 5.0 hook: when the extension is present, ADD its durable fields (xpath, textFingerprint,
      // relativePosition) to the anchor. Deliberately a merge, not a replacement — the overlay's
      // own xPct/yPct/pageX/pageY/docHeight/viewportW drive pin placement and must survive. The
      // extra fields are what let resolveAnchorEl() recover a pin after the page's DOM changes.
      if (!seed && window.ProofkitAnchor && typeof window.ProofkitAnchor.build === 'function') {
        try {
          const ext = window.ProofkitAnchor.build(targetEl, cx, cy);
          if (ext) for (const k of ['xpath', 'textFingerprint', 'relativePosition']) {
            if (ext[k] !== undefined) anchor[k] = ext[k];
          }
        } catch (e) { /* keep the built-in anchor exactly as-is */ }
      }
      let auto = elementAutoFill(targetEl);
      // temporary marker at the click point
      tempMarker = document.createElement('button');
      tempMarker.className = 'rv-pin active'; tempMarker.textContent = seed ? '✎' : '+';
      tempMarker.style.left = cx + 'px'; tempMarker.style.top = cy + 'px';
      tempMarker.style.cursor = 'grab'; tempMarker.title = 'Drag to move this pin';
      tempMarker._anchor = anchor; // track the clicked element on scroll (positionPins) — don't drift
      document.body.appendChild(tempMarker);

      // Per-composer working state — the single object every field binds to, so switching
      // type never loses what was typed. Seeded from `editing` when reopening a draft.
      const state = {
        commentType: seed ? seed.commentType : 'general',
        templateFields: Object.assign({}, seed ? seed.templateFields : null),
        comment: seed ? seed.comment : '',
        expectedOutcome: seed ? seed.expectedOutcome : '',
        pastedDataUrl: '',     // a screenshot the reviewer pastes into the composer (the ONLY attachment)
        pastedCleared: false,  // set when they remove an existing attachment on edit
      };

      const pop = document.createElement('div'); pop.className = 'rv-pop';
      pop.innerHTML =
        '<header><div>' +
        // Editing a submitted comment → a Back link that returns to its view overlay (discards edits).
        (editRec ? '<button type="button" class="rv-hback" aria-label="Back to comment">‹ Back</button>' : '') +
        '<div class="t">' + (editRec ? 'Edit comment' : editing ? 'Edit pin' : 'Mark a comment') + '</div><div class="rv-snip"></div></div>' +
        '<button class="rv-x" aria-label="Close">×</button></header>' +
        '<div class="rv-body">' +
        '<div class="rv-dup-slot"></div>' +
        '<div class="rv-typesel-wrap"><span class="rv-directlabel">Change type</span><div class="pk-typesel"></div></div>' +
        '<div class="rv-directto"><span class="rv-directlabel">Direct to</span>' +
          '<div class="rv-dd-slot"></div></div>' +
        // 7.x — who inside the project may read this pin. The raiser can narrow it, never widen it.
        '<div class="rv-directto"><span class="rv-directlabel">Visible to</span>' +
          '<div class="rv-priv-slot"></div></div>' +
        '<div class="rv-fields"></div>' +
        '<div class="rv-attach"></div>' +
        '<div class="rv-err rv-reopen-err" hidden></div>' +
        '<div class="rv-actions"><button class="rv-btn ghost rv-cancel">Cancel</button>' +
        '<button class="rv-btn primary rv-send">' + (editRec ? 'Save changes' : editing ? 'Update pin' : 'Add pin') + '</button></div></div>';
      pop.querySelector('.rv-snip').textContent = anchor.snippet ? 'Selected - “' + anchor.snippet + '”' : 'Selected - ' + (anchor.tag || 'element');
      document.body.appendChild(pop);
      makeDraggable(pop);   // drag the composer off the element by its header

      // F7 duplicate advisory (non-blocking): a similar OPEN root on this page (same selector
      // or pin within 48px). Shows a strip linking to the existing thread; never blocks save.
      if (!seed) {
        const dup = scanDuplicates(anchor, cx, cy);
        if (dup) {
          const strip = document.createElement('div'); strip.className = 'pk-dupwarn';
          strip.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>' +
            '<span>Similar comment already open</span>' +
            '<button type="button" class="pk-dupwarn-link">View</button>';
          strip.querySelector('.pk-dupwarn-link').addEventListener('click', () => { closePop(); scrollToComment(dup); setTimeout(() => openThread(dup), 300); });
          pop.querySelector('.rv-dup-slot').appendChild(strip);
        }
      }

      // "Direct to" — route this comment to a team's dashboard. The default FOLLOWS the change
      // type (copy fix → Content; link / layout / image / general → Builder). An edited draft
      // keeps its stored toTeam, and once the reviewer picks a team by hand we stop re-defaulting.
      let toTouched = !!seed;
      const dItems = directItems();
      const dValue = seed ? seed.toTeam : defaultTeamFor(state.commentType);
      const toDD = buildDropdown({ items: dItems, value: dValue, block: true, onSelect: () => { toTouched = true; } });
      pop.querySelector('.rv-dd-slot').appendChild(toDD.el);
      // Two choices only: follow the project, or keep it to my team + whoever it is directed to.
      // The API also accepts a named-teams list; the composer stays a single glance and the
      // Builder does finer-grained work from Settings → Visibility.
      // 'project' is a SENTINEL, not the stored value. buildDropdown treats an empty value as
      // "nothing selected" and shows its placeholder, so an option whose value is '' can never
      // display as chosen — which is why this read "Select" even after picking. Mapped back to ''
      // when the payload is built, since '' is what "follow the project's mode" means server-side.
      const privDD = buildDropdown({
        items: [
          { value: 'project', label: 'Everyone on the project' },
          { value: 'private', label: 'Only my team & who it’s for' },
        ],
        value: (seed && seed.visibility) || 'project', block: true,
      });
      pop.querySelector('.rv-priv-slot').appendChild(privDD.el);

      // F1 type chips — swap the field set on select (general = the v2 freeform textarea).
      const chipWrap = pop.querySelector('.pk-typesel');
      const fieldsWrap = pop.querySelector('.rv-fields');
      const setError = (m) => { const e = pop.querySelector('.rv-err'); e.textContent = m || ''; e.hidden = !m; };
      function syncChips() {
        chipWrap.querySelectorAll('.pk-typechip').forEach((b) =>
          b.setAttribute('aria-pressed', String(b.dataset.type === state.commentType)));
      }
      COMMENT_TYPES.forEach((t) => {
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = 'pk-typechip'; chip.dataset.type = t.value; chip.textContent = t.label;
        chip.addEventListener('click', () => {
          if (state.commentType === t.value) return;
          captureFields();            // preserve what was typed before swapping
          state.commentType = t.value;
          if (!toTouched) toDD.setValue(defaultTeamFor(state.commentType)); // routing follows the type
          // renderAttach too: whether a screenshot is required is a property of the TYPE,
          // so switching chips has to restate (or drop) the requirement.
          syncChips(); renderFields(); renderAttach(); placePop(pop, cx, cy);
        });
        chipWrap.appendChild(chip);
      });
      syncChips();

      // Read the live inputs back into `state` (called before a type-swap and on save).
      function captureFields() {
        fieldsWrap.querySelectorAll('[data-tfkey]').forEach((inp) => { state.templateFields[inp.dataset.tfkey] = inp.value; });
        const notes = fieldsWrap.querySelector('.rv-text'); if (notes) state.comment = notes.value;
      }

      // Build the per-type fields: template fields (auto-filled + read-only where declared)
      // and the notes textarea (the single main box for `general`). The F8 "Expected outcome"
      // input is retired — no longer collected (see EXPECTED_OUTCOME_TYPES in vocab.js).
      function renderFields() {
        fieldsWrap.innerHTML = '';
        (TYPE_FIELDS[state.commentType] || []).forEach((f) => {
          // auto-fill from the clicked element when empty (currentImage / currentUrl)
          if (f.autoFill && !state.templateFields[f.key] && auto[f.key]) state.templateFields[f.key] = auto[f.key];
          const row = document.createElement('div'); row.className = 'rv-tf';
          const lab = document.createElement('span'); lab.className = 'rv-tf-label';
          lab.innerHTML = escapeHtml(f.label) + (f.required ? ' <span class="rv-tf-req">*</span>' : '');
          const long = f.key === 'whatToChange' || f.key === 'replacementDesc';
          const inp = document.createElement(long ? 'textarea' : 'input');
          inp.dataset.tfkey = f.key; inp.placeholder = f.placeholder || '';
          inp.value = state.templateFields[f.key] || '';
          if (f.readOnly) inp.setAttribute('readonly', 'readonly');
          inp.addEventListener('input', () => { state.templateFields[f.key] = inp.value; });
          row.appendChild(lab); row.appendChild(inp); fieldsWrap.appendChild(row);
        });
        // Notes / freeform. For `general` this is the primary (and only) input — same
        // placeholder + behaviour as v2 (zero regression); for typed comments it is optional.
        const isGeneral = state.commentType === 'general';
        const nrow = document.createElement('div'); nrow.className = 'rv-tf';
        if (!isGeneral) { const nl = document.createElement('span'); nl.className = 'rv-tf-label'; nl.textContent = 'Notes'; nrow.appendChild(nl); }
        const notes = document.createElement('textarea'); notes.className = 'rv-text';
        notes.placeholder = isGeneral ? 'Elaborate on the change request. (⌘/Ctrl+Enter to save)' : 'Any extra context (optional)';
        notes.value = state.comment || '';
        notes.addEventListener('input', () => { state.comment = notes.value; });
        notes.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
        nrow.appendChild(notes); fieldsWrap.appendChild(nrow);
        const first = fieldsWrap.querySelector('input:not([readonly]),textarea'); if (first) first.focus();
      }
      renderFields();
      placePop(pop, cx, cy);

      // ---- Paste-to-attach screenshot (F4 rework) ----
      // No auto-capture. The reviewer can paste an image (⌘/Ctrl+V) any time the composer is open —
      // it becomes the single attachment, shown as a removable thumbnail. `previewUrl` holds what to
      // render (a fresh paste, or an existing attachment resolved on edit).
      const attachEl = pop.querySelector('.rv-attach');
      let previewUrl = '';
      // 5.0 hook: screenshot provider. The extension exposes window.ProofkitCapture(el) — an
      // element-cropped chrome.tabs.captureVisibleTab. It is the only thing that works on a page we
      // do not control: canvas-rasterising approaches taint on cross-origin images and yield a
      // blank or broken shot. When present the composer PREFERS it; paste still overrides, and
      // without the extension every path below is byte-for-byte the previous behaviour.
      const hasCapture = typeof window.ProofkitCapture === 'function';
      let capturing = hasCapture;   // false once the capture resolves or fails, so the hint settles
      function renderAttach() {
        if (previewUrl) {
          attachEl.innerHTML =
            '<div class="rv-attach-head"><span class="rv-attach-lbl">Screenshot</span>' +
              '<button type="button" class="rv-attach-x" aria-label="Remove screenshot">Remove</button></div>' +
            '<img class="rv-attach-img" alt="Pasted screenshot preview">';
          attachEl.querySelector('.rv-attach-img').src = previewUrl;
          attachEl.querySelector('.rv-attach-x').addEventListener('click', () => {
            previewUrl = ''; state.pastedDataUrl = ''; state.pastedCleared = true; renderAttach();
          });
        } else if (needsScreenshot(state.commentType)) {
          // Layout tweaks and general notes describe something visual; the picture IS the
          // record, so say so up front rather than only failing on save.
          attachEl.innerHTML = '<div class="rv-attach-hint rv-attach-hint--req">' +
            (capturing ? 'Capturing the element… or paste one (⌘/Ctrl+V)' : 'Paste a screenshot (⌘/Ctrl+V)') +
            ' — <b>required</b> for this change type.</div>';
        } else {
          attachEl.innerHTML = '<div class="rv-attach-hint">' +
            (capturing ? 'Capturing the element… paste (⌘/Ctrl+V) to replace it — optional.'
                        : 'Paste a screenshot (⌘/Ctrl+V) to attach one — optional.') + '</div>';
        }
      }
      // Seed the preview from an existing attachment when reopening a draft/comment.
      if (seed && seed.imageDataUrl) { previewUrl = seed.imageDataUrl; }
      else if (seed && seed.imageId) { store.image(seed.imageId).then((r) => { if (r && r.dataUrl && !state.pastedDataUrl && !state.pastedCleared) { previewUrl = r.dataUrl; renderAttach(); } }).catch(() => {}); }
      renderAttach();
      // Capture the pinned element up front when the extension provides a capturer and there is no
      // existing attachment to preserve. A paste that lands while the capture is in flight WINS —
      // a deliberate choice must never be clobbered by the async result.
      if (!previewUrl && hasCapture) {
        (async () => {
          try {
            const shot = await window.ProofkitCapture(targetEl);
            capturing = false;
            // The extension returns { element, viewport } — the element crop for the attachment and
            // the whole screen for context. A plain string is still accepted so an older bridge, or
            // any other provider, keeps working.
            const elementShot = shot && typeof shot === 'object' ? shot.element : shot;
            const viewportShot = shot && typeof shot === 'object' ? shot.viewport : '';
            if (elementShot && !state.pastedDataUrl && !state.pastedCleared && !previewUrl) {
              state.pastedDataUrl = elementShot; previewUrl = elementShot;
              state.viewportDataUrl = viewportShot || '';
            }
            renderAttach();     // either shows the shot, or settles back to the plain paste hint
          } catch (e) { capturing = false; renderAttach(); }
        })();
      }
      // Paste anywhere in the composer (fields or not) attaches the image; page pastes are ignored.
      pop.addEventListener('paste', async (e) => {
        const raw = await imageFromClipboard(e);
        if (!raw) return;                 // not an image paste — let normal text paste through
        e.preventDefault();
        const jpg = await pastedToJpeg(raw, 1000) || raw;
        state.pastedDataUrl = jpg; state.pastedCleared = false; previewUrl = jpg;
        renderAttach();
        toast('📎 Screenshot attached');
      });

      // Draggable pointer: drag the dot to any point and it RE-IDENTIFIES the element under the
      // drop — selector, snippet + auto-fill — exactly as a fresh ⌘/Ctrl-click would, while
      // everything already typed (notes, template fields, type, Direct-to) is preserved. Only the
      // in-composer marker moves; submitted pins stay locked to their element.
      function reanchorTo(clientX, clientY) {
        const hit = document.elementsFromPoint(clientX, clientY).find((n) => n instanceof Element &&
          !n.closest('.rv-pin, .rv-pop, .rv-dock, .rv-dash, .rv-logout, .rv-toast, .rv-tray-wrap')) || document.body;
        targetEl = hit;
        const rr = hit.getBoundingClientRect();
        anchor.selector = cssPath(hit);
        anchor.snippet = (hit.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        anchor.tag = hit.tagName.toLowerCase();
        anchor.xPct = rr.width ? Math.round(((clientX - rr.left) / rr.width) * 100) : 0;
        anchor.yPct = rr.height ? Math.round(((clientY - rr.top) / rr.height) * 100) : 0;
        anchor.pageX = Math.round(clientX + window.scrollX);
        anchor.pageY = Math.round(clientY + window.scrollY);
        // Re-derive the auto-fill from the new element, but keep any auto value the reviewer edited.
        captureFields();
        const next = elementAutoFill(hit);
        ['currentImage', 'currentUrl'].forEach((k) => {
          if (!state.templateFields[k] || state.templateFields[k] === auto[k]) state.templateFields[k] = next[k] || '';
        });
        auto = next;
        pop.querySelector('.rv-snip').textContent = anchor.snippet ? 'Selected - “' + anchor.snippet + '”' : 'Selected - ' + (anchor.tag || 'element');
        renderFields();
        positionPins(); // snap the marker precisely onto the new anchor
      }
      tempMarker.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        let moved = false;
        tempMarker.style.cursor = 'grabbing';
        const prevSelect = document.body.style.userSelect; document.body.style.userSelect = 'none';
        const onMove = (ev) => { moved = true; tempMarker.style.left = ev.clientX + 'px'; tempMarker.style.top = ev.clientY + 'px'; };
        const onUp = (ev) => {
          document.removeEventListener('mousemove', onMove, true);
          document.removeEventListener('mouseup', onUp, true);
          tempMarker.style.cursor = 'grab'; document.body.style.userSelect = prevSelect;
          if (moved) reanchorTo(ev.clientX, ev.clientY);
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup', onUp, true);
      });

      const submit = () => {
        captureFields();
        // privDD is scoped to openComposer; saveDraft/saveEdit are top-level and cannot see it.
        // `state` is the object that crosses that boundary, so the choice rides along on it.
        state.visibility = privDD && privDD.getValue() === 'private' ? 'private' : '';
        if (editRec) saveEdit(state, anchor, toDD, targetEl, editRec, setError);
        else saveDraft(state, anchor, toDD, targetEl, editing, setError);
      };
      pop.querySelector('.rv-x').addEventListener('click', closePop);
      pop.querySelector('.rv-cancel').addEventListener('click', closePop);
      pop.querySelector('.rv-send').addEventListener('click', submit);
      // Back (edit mode only) → discard the in-progress edit and reopen the comment's view overlay.
      const backBtn = pop.querySelector('.rv-hback');
      if (backBtn) backBtn.addEventListener('click', () => { closePop(); openThread(editRec); });
    }

    // "Direct to" options: every team EXCEPT the reviewer's own (you can't route a
    // request to your own team), then Builder at the END, fenced off by a divider.
    // Builder stays the default (site changes) even though it's listed last — unless the
    // reviewer IS Builder, in which case Builder is dropped too.
    function directItems() {
      // Selectable targets are the ENABLED teams (Content, Product, SEO, Marketing, Design) plus
      // Builder — the admin team, always enabled and the default target for build-type changes. Any
      // parked team (e.g. Business) stays greyed/inert until its flag flips. Builder sees every ticket regardless of routing
      // (its dashboard queue has no toTeam filter).
      const items = TEAMS.map((t) => ({ value: t, label: t, disabled: !isTeamEnabled(t) }));
      items.push({ value: ADMIN_TEAM, label: ADMIN_TEAM, dividerBefore: true, disabled: !isTeamEnabled(ADMIN_TEAM) });
      return items;
    }
    // Default routing per change type: copy edits → the Content team; link / layout / image /
    // general (build work) → Builder. The reviewer can still override in the "Direct to" dropdown.
    const defaultTeamFor = (type) => (type === 'copy-fix' ? 'Content' : ADMIN_TEAM);

    // F7: scan the in-memory root comments (this page, NOT deployed_live) for a likely
    // duplicate of a fresh mark — same anchor.selector OR a pin within 48px of the click.
    // Advisory only; the caller renders a non-blocking strip.
    function scanDuplicates(anchor, cx, cy) {
      return comments.find((c) => {
        if (c.parentId || !isVisibleRoot(c)) return false;
        if (c.anchor && anchor.selector && c.anchor.selector === anchor.selector) return true;
        const p = pinPos(c);
        return Math.hypot(p.x - cx, p.y - cy) < 48;
      }) || null;
    }

    // F4: capture the clicked element + ~100px of surrounding context, downscale to ≤480px
    // wide JPEG (~0.7). html2canvas is imported from the CDN ONLY here (at capture time), so
    // no host page pays for it up front. ANY failure returns '' — the caller proceeds imageless.
    // Shared html2canvas region capture → downscaled JPEG dataURL ('' on any failure). html2canvas
    // is imported from the CDN ONLY at capture time (module import is cached, so a second capture in
    // the same save doesn't re-download). Proofkit's own overlay chrome is ignored so it never
    // appears in a shot.
    // (Auto element/viewport capture via html2canvas was retired — screenshots are now paste-only;
    //  see pastedToJpeg / imageFromClipboard above and the composer's paste-to-attach block.)
    // Display context — screen resolution + the effective display scale. Note the
    // browser CANNOT separate OS display scaling from browser zoom; both fold into devicePixelRatio,
    // so we record that single combined value (and derive physical px from it) rather than fake a split.
    // Normalise a pasted image (any type/size) to a bounded JPEG dataURL so it fits the Worker's
    // ~200KB /image cap. Loads it into an <img>, draws onto a downscaled canvas (≤maxW wide),
    // re-encodes as JPEG. Returns '' if the image can't be decoded (never blocks the comment).
    function pastedToJpeg(dataUrl, maxW) {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              const w = maxW || 1000, scale = img.naturalWidth > w ? w / img.naturalWidth : 1;
              const c = document.createElement('canvas');
              c.width = Math.max(1, Math.round(img.naturalWidth * scale));
              c.height = Math.max(1, Math.round(img.naturalHeight * scale));
              const ctx = c.getContext('2d');
              ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); // flatten transparency
              ctx.drawImage(img, 0, 0, c.width, c.height);
              resolve(c.toDataURL('image/jpeg', 0.75));
            } catch (e) { resolve(''); }
          };
          img.onerror = () => resolve('');
          img.src = dataUrl;
        } catch (e) { resolve(''); }
      });
    }
    // Pull the first image out of a paste/drop ClipboardEvent's items → a raw dataURL (pre-downscale).
    function imageFromClipboard(e) {
      return new Promise((resolve) => {
        const items = (e.clipboardData && e.clipboardData.items) || [];
        for (const it of items) {
          if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
            const file = it.getAsFile();
            if (file) { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result || '')); fr.onerror = () => resolve(''); fr.readAsDataURL(file); return; }
          }
        }
        resolve('');
      });
    }

    function captureDisplay() {
      const dpr = window.devicePixelRatio || 1;
      return {
        screenW: screen.width, screenH: screen.height,                                  // logical (CSS) px
        physW: Math.round(screen.width * dpr), physH: Math.round(screen.height * dpr),   // physical device px
        dpr: Math.round(dpr * 100) / 100,                                                // OS scale × browser zoom, combined
        viewportW: window.innerWidth, viewportH: window.innerHeight,
      };
    }

    // Validate the composer state, returning { ok, error?, focusFirst?, templateFields, comment,
    // expectedOutcome }. Required template fields are enforced (block save);
    // `general` still requires a non-empty note (zero regression). Typed comments with an empty
    // note fall back to the rendered summary so the Worker's non-empty `comment` check passes.
    function validateDraft(state) {
      const tf = {};
      for (const f of (TYPE_FIELDS[state.commentType] || [])) {
        const v = String(state.templateFields[f.key] || '').trim();
        if (f.required && !v) return { ok: false, error: 'Please fill “' + f.label + '”.' };
        if (v) tf[f.key] = v;
      }
      const expectedOutcome = String(state.expectedOutcome || '').trim(); // legacy field, no longer collected
      let comment = String(state.comment || '').trim();
      if (state.commentType === 'general' && !comment) return { ok: false, error: 'Please describe the change.' };
      if (!comment) comment = renderSummary(state.commentType, tf, '') ||
        ((COMMENT_TYPES.find((t) => t.value === state.commentType) || {}).label || 'Change');
      return { ok: true, templateFields: tf, comment, expectedOutcome };
    }

    // F2/F8: "Add pin" — validate + push/replace a DRAFT (no POST). Screenshots are OPT-IN now:
    // there is NO automatic element/viewport capture — the ONLY attachment is an image the reviewer
    // PASTED into the composer (state.pastedDataUrl). The display context is still captured.
    async function saveDraft(state, anchor, toDD, targetEl, editing, setError) {
      const v = validateDraft(state);
      if (!v.ok) { setError(v.error); return; }
      setError('');
      // A pasted image (if any) is the attachment. On edit: a fresh paste replaces the prior; an
      // explicit remove (pastedCleared) drops it; otherwise the prior image is kept unchanged.
      let imageDataUrl = '', imageId = '';
      if (state.pastedDataUrl) { imageDataUrl = state.pastedDataUrl; imageId = ''; }
      else if (editing && !state.pastedCleared) { imageDataUrl = editing.imageDataUrl || ''; imageId = editing.imageId || ''; }
      // MANDATORY SCREENSHOT (see SCREENSHOT_TYPES in vocab.js): everything that is not a
      // content swap - layout tweaks and general notes - is a description of something
      // visual, and prose alone routinely fails to identify what the reviewer was looking
      // at. Gated once the attachment is RESOLVED, so an edit that keeps its existing image
      // still passes and only an actual removal is caught; and before the button flips to
      // its saving state, so a blocked raise leaves the composer exactly as it was.
      if (needsScreenshot(state.commentType) && !imageDataUrl && !imageId) {
        setError('A screenshot is required for this change type — paste one (⌘/Ctrl+V) to continue.');
        return;
      }
      const btn = document.querySelector('.rv-pop .rv-send');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const display = (editing && editing.display) ? editing.display : captureDisplay();
      const draft = {
        draftId: editing ? editing.draftId : uuid(),
        anchor,
        commentType: state.commentType,
        templateFields: v.templateFields,
        expectedOutcome: v.expectedOutcome,
        comment: v.comment,
        toTeam: (toDD && toDD.getValue()) || ADMIN_TEAM,
        visibility: state.visibility || '',   // '' = follow the project's mode
        imageDataUrl,
        imageId,                          // uploaded on submit only when imageDataUrl is fresh
        viewportImageDataUrl: '',         // full-viewport auto-capture retired
        viewportImageId: '',
        viewportDataUrl: state.viewportDataUrl || '',   // full-screen context shot, uploaded on submit
        display,
        error: '',
        page: { path: pagePath(), url: location.href, title: pageName(pagePath()), docTitle: document.title, slug: slugFromPath() },
      };
      const i = drafts.findIndex((d) => d.draftId === draft.draftId);
      if (i >= 0) drafts[i] = draft; else drafts.push(draft);
      closePop();
      renderDraftPins(); renderTray();
      // Auto-open the tray on the first pending pin so the reviewer sees the batch forming.
      if (drafts.length === 1) { trayOpen = true; trayWrap.classList.add('is-open'); }
      toast(editing ? '✎ Pin updated' : '📌 Pin added — ' + drafts.length + ' pending');
    }

    // Reopen the composer on an existing draft (from the tray or its dashed pin).
    function editDraft(draftId) {
      const d = drafts.find((x) => x.draftId === draftId); if (!d) return;
      let el = resolveAnchorEl(d.anchor);
      const p = pinPos(d);
      openComposer(el, p.x, p.y, d.anchor.pageX || 0, d.anchor.pageY || 0, d);
    }

    // Who may edit a submitted comment (never a reply, never a revoked one):
    //  • Builder (admin) — ANY comment, at any status.
    //  • The raising team — only its OWN comment and only before Builder starts it (still TBI).
    function canEditComment(root) {
      if (!root || root.parentId || root.revoked) return false;
      const t = getSession().team;
      if (t === ADMIN_TEAM) return true;
      return t === (root.team || '') && teamStatusOf(root) === 'to_be_initiated';
    }
    // Who may confirm a deployed bug fix from the page: the RAISER (its own comment) or admin,
    // while it is deployed_live and not yet confirmed. This is the on-page mirror of the dashboard
    // "Confirm Bug Fix" action — the raiser verifies Builder's fix landed.
    function canConfirmBugFix(root) {
      if (!root || root.parentId || root.revoked) return false;
      if (teamStatusOf(root) !== 'deployed_live' || root.bugFixConfirmed) return false;
      const t = getSession().team;
      return t === ADMIN_TEAM || t === (root.team || '');
    }
    // Reopen the composer on a SUBMITTED comment for a full re-edit (every parameter). Anchors to the
    // record's element (falls back to the stored pageXY) and routes save through store.update.
    function openEditComment(root) {
      let el = resolveAnchorEl(root.anchor);
      const p = pinPos(root);
      openComposer(el, p.x, p.y, (root.anchor && root.anchor.pageX) || 0, (root.anchor && root.anchor.pageY) || 0, null, root);
    }

    // Save an edit to a SUBMITTED comment. Re-captures screenshots best-effort (the anchor may have
    // moved), then POSTs the full parameter set to store.update. On success the local record + pin are
    // refreshed and the thread reopens on the updated comment. Validation reuses validateDraft.
    async function saveEdit(state, anchor, toDD, targetEl, editRec, setError) {
      const v = validateDraft(state);
      if (!v.ok) { setError(v.error); return; }
      setError('');
      const btn = document.querySelector('.rv-pop .rv-send');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      // No auto-capture. A freshly pasted image replaces the attachment; an explicit remove clears
      // it; otherwise the prior screenshot is kept. Viewport shot is retired. Display is preserved.
      let imageId = editRec.imageId || '', viewportImageId = editRec.viewportImageId || '';
      const display = editRec.display || null;
      if (state.pastedDataUrl) {
        try {
          const res = await store.uploadImage(state.pastedDataUrl); imageId = (res && res.imageId) || '';
          // A fresh capture brings a fresh full-screen shot; only clear it when there is none.
          viewportImageId = await uploadContextShot(state.viewportDataUrl);
        }
        catch (e) { /* keep prior on upload failure */ }
      } else if (state.pastedCleared) { imageId = ''; viewportImageId = ''; }
      const payload = {
        id: editRec.id,
        path: (editRec.page && editRec.page.path) || pagePath(),
        url: (editRec.page && editRec.page.url) || location.href,   // 5.0: resolve on this origin
        comment: v.comment,
        commentType: state.commentType,
        templateFields: v.templateFields,
        expectedOutcome: v.expectedOutcome,
        toTeam: (toDD && toDD.getValue()) || ADMIN_TEAM,
        visibility: state.visibility || '',   // '' = follow the project's mode
        anchor,
        imageId, viewportImageId, display,
        summary: renderSummary(state.commentType, v.templateFields, v.comment),
        page: editRec.page,
      };
      let updated;
      try { updated = await store.update(payload); }
      catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
        if (e.message === 'unauthorized') { toast('Wrong passcode — sign in again.'); return; }
        if (e.message === 'already started' || e.message === 'HTTP 409') { toast('Builder has already started this — it can no longer be edited.'); return; }
        setError('Could not save — ' + e.message); return;
      }
      const i = comments.findIndex((c) => c.id === editRec.id);
      if (i >= 0) comments[i] = updated;
      closePop();
      renderPins();
      scrollToComment(updated); setTimeout(() => openThread(updated), 200);
      toast('✎ Comment updated');
    }

    // Turn a draft into the wire record (adds session team, batchId, server-parity summary).
    function draftToRecord(d, batchId) {
      return {
        team: getSession().team, toTeam: d.toTeam || ADMIN_TEAM,
        comment: d.comment, anchor: d.anchor,
        commentType: d.commentType, templateFields: d.templateFields,
        expectedOutcome: d.expectedOutcome || '',
        summary: renderSummary(d.commentType, d.templateFields, d.comment),
        isTest: !!d.isTest,          // smoke-test ticket — excluded from counts/insights
        imageId: d.imageId || '', batchId,
        viewportImageId: d.viewportImageId || '',   // full-viewport screenshot (F4b)
        display: d.display || null,                  // screen resolution + display scale at capture
        sessionId: sessionId(),
        // `title` = the FRIENDLY page name (our convention), docTitle keeps the raw <title>.
        page: d.page || { path: pagePath(), url: location.href, title: pageName(pagePath()), docTitle: document.title, slug: slugFromPath() },
      };
    }

    // F2: "Submit all" — upload each draft's screenshot first (F4, best-effort), then POST the
    // whole array as ONE batch (client batchId). Per-item results map back in input order:
    // successes join `comments`; failures stay in the tray for retry-failed-only.
    let submitting = false;
    async function submitAll() {
      if (submitting || !drafts.length) return;
      submitting = true;
      const batchId = uuid();
      const submitBtn = trayWrap.querySelector('.rv-tray-submit');
      submitBtn.disabled = true; submitBtn.textContent = 'Submitting…';
      const pending = drafts.slice(); // retry-failed-only: `drafts` already holds just the failed ones on a retry
      // 1) pasted screenshot (if any) → /image (best-effort; a failed upload just drops the image).
      for (const d of pending) {
        if (d.imageDataUrl && !d.imageId) {
          try { const res = await store.uploadImage(d.imageDataUrl); d.imageId = (res && res.imageId) || ''; }
          catch (e) { d.imageId = ''; }
        }
      }
      // 2) one batch POST.
      let results;
      try {
        const resp = await store.addBatch(pending.map((d) => draftToRecord(d, batchId)));
        results = (resp && resp.results) || [];
      } catch (e) {
        submitting = false; submitBtn.disabled = false; renderTray();
        if (e.message === 'unauthorized') { toast('Wrong passcode — sign in again.'); return; }
        toast('Could not submit — ' + e.message); return;
      }
      // 3) map per-item results in input order.
      const failed = []; let okCount = 0;
      pending.forEach((d, i) => {
        const r = results[i];
        if (r && r.ok) { okCount++; if (r.rec) comments.push(r.rec); }
        else { d.error = (r && r.error) || 'submit failed'; failed.push(d); }
      });
      drafts = failed;               // keep only the failures for a targeted retry
      submitting = false;
      renderPins(); renderTray();
      submitBtn.disabled = false;
      if (!failed.length) toast(LOCAL ? '✅ ' + okCount + ' saved locally (demo mode)' : '✅ ' + okCount + ' submitted');
      else toast('⚠️ ' + okCount + ' sent · ' + failed.length + ' failed — press Retry failed');
    }

    // ---- thread view: read the history (read-only) + add more comments --
    function openThread(root) {
      closePop();
      activeId = root.id;
      pinEls.forEach((el, id) => el.classList.toggle('active', id === root.id));
      const idx = pinRoots().findIndex((c) => c.id === root.id) + 1;
      navIdx = idx - 1; updateNav();
      const pinNo = root.pageSeq || idx;   // the definitive per-page number (falls back to position)
      const thread = [root, ...repliesOf(root.id)];
      const pop = document.createElement('div'); pop.className = 'rv-pop';
      pop.innerHTML =
        '<header><div class="rv-hmain"><div class="t">Comment #' + pinNo + '</div>' +
        (root.ticket ? '<div class="rv-ticket">Ticket #' + escapeHtml(root.ticket) + '</div>' : '') +
        '<div class="rv-snip"></div>' +
        // Edit + View details live in the header, right after the selected element.
        '<div class="rv-hactions">' +
          (canConfirmBugFix(root) ? '<button type="button" class="rv-btn primary rv-confirmfix">Confirm Bug Fix</button>' : '') +
          (canEditComment(root) ? '<button type="button" class="rv-btn ghost rv-editcmt">Edit</button>' : '') +
          '<button type="button" class="rv-btn ghost rv-viewdetails">View details →</button>' +
        '</div></div>' +
        '<button class="rv-x" aria-label="Close">×</button></header>' +
        '<div class="rv-read">' + statusChip(teamStatusOf(root)) + '</div>' +
        '<div class="rv-thread"></div>' +
        '<div class="rv-reply">' +
        '<textarea class="rv-rtext" placeholder="Elaborate on the change request… (⌘/Ctrl+Enter)"></textarea>' +
        '<div class="rv-actions"><button class="rv-btn primary rv-radd">Add Comment</button></div></div>';
      pop.querySelector('.rv-snip').textContent = root.anchor && root.anchor.snippet ? '“' + root.anchor.snippet + '”' : '';
      const CHEV = '<svg class="rv-tchev" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      const list = pop.querySelector('.rv-thread');
      thread.forEach((c, i) => {
        // Collapsed by default (Team + timestamp); the body reveals on expand (one open at a time).
        // The first comment (the root) opens by default so clicking a pin shows its content straight away.
        const item = document.createElement('div'); item.className = 'rv-titem' + (i === 0 ? ' open' : '');
        item.innerHTML =
          '<button type="button" class="rv-thead">' + teamChip(c.team) +
          '<b class="rv-tname">' + escapeHtml(fmtTime(c.createdAt)) + '</b>' + CHEV + '</button>' +
          '<div class="rv-tbody">' +
          '<div class="rv-txt"></div>' +
          (c.changeTo ? '<div class="pk-callout pk-callout--compact"><span>Change to</span><div class="rv-ctxt"></div></div>' : '') +
          '</div>';
        item.querySelector('.rv-txt').textContent = c.comment;
        if (c.changeTo) item.querySelector('.rv-ctxt').textContent = c.changeTo;
        item.querySelector('.rv-thead').addEventListener('click', () => {
          const wasOpen = item.classList.contains('open');
          list.querySelectorAll('.rv-titem.open').forEach((el) => el.classList.remove('open'));
          if (!wasOpen) item.classList.add('open');
        });
        list.appendChild(item);
      });
      document.body.appendChild(pop);
      makeDraggable(pop, root.id);   // draggable by its header; the pin marker stays put
      // If the reviewer parked this pin's overlay earlier, reopen it there; else place by the pin.
      const parked = threadPos.get(root.id);
      if (parked) {
        pop.dataset.moved = '1';
        pop.style.left = parked.left + 'px';
        pop.style.top = parked.top + 'px';
      } else {
        const p = pinPos(root); placePop(pop, p.x, p.y);
      }
      pop.querySelector('.rv-x').addEventListener('click', () => { closePop(); pinEls.forEach((el) => el.classList.remove('active')); });
      // "View details" → open this pin's ticket in the dashboard (admin → /reviewdash, teams →
      // /teamdash), deep-linked so the dashboard lands straight on the detail (see ?detail= below).
      pop.querySelector('.rv-viewdetails').addEventListener('click', () => {
        location.href = boardBase(getSession().team) + '?detail=' + encodeURIComponent(root.id);
      });
      const editBtn = pop.querySelector('.rv-editcmt');
      if (editBtn) editBtn.addEventListener('click', () => { closePop(); openEditComment(root); });
      const confirmBtn = pop.querySelector('.rv-confirmfix');
      if (confirmBtn) confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true; confirmBtn.textContent = 'Confirming…';
        try {
          const updated = await store.confirm(root.id);
          const i = comments.findIndex((c) => c.id === root.id);
          if (i !== -1 && updated) comments[i] = updated; else if (i !== -1) comments[i].bugFixConfirmed = true;
          closePop(); pinEls.forEach((el) => el.classList.remove('active'));
          renderPins(); // a confirmed fix drops off the page
        } catch (e) {
          confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Bug Fix';
          if (e.message === 'unauthorized') { pkAlert('Please sign in again to confirm.'); }
          else pkAlert('Could not confirm — ' + e.message);
        }
      });
      pop.querySelector('.rv-radd').addEventListener('click', () => addReply(pop, root));
      const onRKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addReply(pop, root); } };
      pop.querySelector('.rv-rtext').addEventListener('keydown', onRKey);
    }

    async function addReply(pop, root) {
      const team = getSession().team; // session-global team from login
      const txt = pop.querySelector('.rv-rtext').value.trim();
      if (!txt) { pop.querySelector('.rv-rtext').focus(); return; }
      const btn = pop.querySelector('.rv-radd'); btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const rec = await store.add({
          team, toTeam: root.toTeam || ADMIN_TEAM, comment: txt,
          sessionId: sessionId(), parentId: root.id, anchor: root.anchor, page: root.page,
        });
        comments.push(rec); renderPins(); openThread(root);
      } catch (e) {
        if (e.message === 'unauthorized') { toast('Wrong passcode — reopen and try again.'); closePop(); return; }
        btn.disabled = false; btn.textContent = 'Add Comment'; toast('Could not add — ' + e.message);
      }
    }

    // ---- shared popover placement ---------------------------------------
    // Drag the popup out of the way by its header — so the composer never sits on top of the
    // element being pinned. Once moved, placePop() leaves it exactly where the reviewer put it.
    function makeDraggable(pop, posKey) {
      const handle = pop.querySelector('header');
      if (!handle) return;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;             // left / primary only
        if (e.target instanceof Element && e.target.closest('button, a')) return; // header controls aren't drag handles
        e.preventDefault();
        const rect = pop.getBoundingClientRect();
        const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
        pop.dataset.moved = '1';
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        const move = (ev) => {
          const w = pop.offsetWidth, h = pop.offsetHeight;
          const left = Math.min(Math.max(8, ev.clientX - offX), innerWidth - w - 8);
          const top = Math.min(Math.max(8, ev.clientY - offY), innerHeight - h - 8);
          pop.style.left = left + 'px';
          pop.style.top = top + 'px';
          if (posKey != null) threadPos.set(posKey, { left, top }); // remember the parked spot
        };
        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }

    function placePop(pop, x, y) {
      if (pop.dataset.moved) return; // the reviewer dragged it — respect their position
      const w = pop.offsetWidth || 320, h = pop.offsetHeight || 220;
      const maxBottom = innerHeight - 88; // keep clear of the bottom dock toolbar
      let left = x + 16; if (left + w > innerWidth - 16) left = x - w - 16;
      let top = y + 12; if (top + h > maxBottom) top = maxBottom - h;
      pop.style.left = Math.max(16, left) + 'px';
      pop.style.top = Math.max(16, top) + 'px';
    }
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function teamChip(team) {
      if (!team) return '';
      const slug = TEAM_COLORS[team] ? team.toLowerCase() : 'none';
      return '<span class="pk-team-chip pk-team-chip--compact pk-team-chip--' + slug + '">' + escapeHtml(team) + '</span>';
    }
    // teamStatus → a coloured chip (F5 rewire — the ONLY status the overlay shows now).
    // Fill = the STATUS_COLORS token; amber takes dark ink, the rest --pk-on-accent (matches paintPin).
    const STATUS_LABELS = {
      to_be_initiated: 'To be initiated', in_progress: 'In progress',
      deployed_live: 'Deployed live', reopened: 'Reopened',
      disregarded: 'Invalid — closed',
    };
    function statusChip(status) {
      // Colour is a modifier class, not `style=` — the host CSP (`style-src 'self'`) drops attributes.
      const key = STATUS_COLORS[status] ? status : 'to_be_initiated';
      return '<span class="pk-status-chip pk-status-chip--st-' + key + '">' +
        escapeHtml(STATUS_LABELS[status] || STATUS_LABELS.to_be_initiated) + '</span>';
    }

    // We only reach here when the tab is ARMED (reviewMode === '1'; the gate above
    // returned for everyone else). So:
    //  • Authenticated → reveal the Comment dock; auto-enter review on a /<page>/review
    //    (AUTO) or Open-Pin (#c=) arrival.
    //  • Not authenticated → ALWAYS open the Team + Key login so the reviewer can sign
    //    in. This must NOT be gated on AUTO: the AUTO flag is consumed on the first
    //    paint, so a reload (or Vite full-reload) would otherwise leave an armed-but-
    //    signed-out tab showing nothing — the "/review doesn't trigger the login" bug.
    // Overlay-UI flag: reconcile the global New/Old choice (caches it) and subscribe so an
    // admin flip hard-refreshes this armed page too. The New HUD render path is wired in the
    // later phases; today both values fall through to the Old rectangle composer below.
    syncOverlayUi();
    startOverlayUiStream();

    if (isAuthed()) {
      revealDock();
      /* Armed AND signed in means the answer to "does this person want to review right now" is
       * already yes — arming the tab IS the request. Waiting for a further click on Comment made
       * the user state their intent twice and left the page looking untouched in between, which
       * reads as "it didn't work". So review mode (and the greyscale) starts immediately.
       *
       * This used to be conditional on AUTO or an Open-Pin hash; every other way of arriving here
       * — the extension's Start Proofing, a reload of an armed tab, signing in on this page —
       * dropped the user on an ordinary-looking page with a button to press. */
      startReview();
    } else {
      showLogin();
    }
  })();
