  import { TEAMS, TEAM_COLORS, WORKER_URL, HIDE_SELECTORS, PROOFKIT_ENABLED, ADMIN_TEAM,
    getSession, setSession, clearSession, buildPanelLogin, buildDropdown, nextLocalTicket, pageName,
    // v3 shared vocabulary (single source of truth in ./config.js — never re-declared here):
    // comment types + per-type template fields, teamStatus→token colours, the summary renderer,
    // and the expected-outcome gate. The composer (F1/F8), pin colours (F5) + demo store all read these.
    COMMENT_TYPES, TYPE_FIELDS, STATUS_COLORS, renderSummary, needsExpectedOutcome } from './config.js';
  // The design system, inlined — injected only when review mode arms (real visitors
  // download nothing), so the on-page login matches the dashboards (.pk-login).
  import pkTokensCss from './design/tokens.css?inline';
  import pkComponentsCss from './design/components.css?inline';
  (() => {
    'use strict';
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts) - tool off => never loads

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
      const headers = { 'Content-Type': 'application/json' };
      const pass = getSession().key;
      if (pass) headers['X-Review-Pass'] = pass;
      const res = await fetch(WORKER_URL + path, { ...opts, headers });
      if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
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
      // copy-fix mirrors newText into legacy `changeTo` so v2-era rendering keeps working (§3).
      if (rec.commentType === 'copy-fix' && rec.templateFields.newText && !rec.changeTo) rec.changeTo = rec.templateFields.newText;
      rec.teamStatus = 'to_be_initiated'; rec.teamStatusAt = '';
      rec.iteration = 1;
      rec.reopenReason = ''; rec.reopenNote = '';
      rec.history = [{ status: 'to_be_initiated', at: rec.createdAt, event: 'created', iteration: 1 }];
      const arr = localGet(rec.page.path); arr.push(rec);
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
    const store = LOCAL
      ? {
          async list(path) { return localGet(path); },
          async add(rec) { return localAdd(rec); },
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
        }
      : {
          list: (path) => apiFetch('/comments?path=' + encodeURIComponent(path)),
          add: (rec) => apiFetch('/comments', { method: 'POST', body: JSON.stringify(rec) }),
          // Array POST /comments → 201 {results:[{ok,rec?,error?}]} in input order (F2).
          addBatch: (recs) => apiFetch('/comments', { method: 'POST', body: JSON.stringify(recs) }),
          // POST /image → {imageId}; stored KV `img:<uuid>`, never required for a comment (F4).
          uploadImage: (dataUrl) => apiFetch('/image', { method: 'POST', body: JSON.stringify({ dataUrl }) }),
        };

    // ---- login (the shared modern Panel Login — same as the dashboards) --
    // One login per tab: the { team, key } chosen here is the shared session
    // (config's getSession/setSession), so the dashboards recognise it too.
    let login = null;
    function startReview() {
      if (getSession().key) return enter(); // already logged in this tab
      showLogin();
    }
    function showLogin() {
      if (!login) {
        login = buildPanelLogin({ title: 'Let’s Review.', sub: 'Select your team and enter your key to start marking comments.' });
        const go = () => tryLogin();
        login.button.addEventListener('click', go);
        login.keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        // Clicking the backdrop backs FULLY out of review — disarm the tab too, else
        // (with the login now always shown while armed) it would just reappear.
        login.el.addEventListener('click', (e) => { if (e.target === login.el) { sessionStorage.removeItem(KEY); hideLogin(); } });
      }
      login.setError(''); login.keyInput.value = ''; login.setTeam(getSession().team || '');
      document.body.appendChild(login.el);
      if (getSession().team) login.keyInput.focus(); else login.focusTeam();
    }
    function hideLogin() { login && login.el.remove(); }
    async function tryLogin() {
      const team = login.getTeam();
      const id = login.keyInput.value.trim();
      if (!team) { login.focusTeam(); login.setError('Please choose your team.'); return; }
      if (!id) { login.keyInput.focus(); return; }
      setSession(team, id); // shared session (validated below)
      login.setBusy(true, 'Authenticating'); login.setError('');
      try {
        if (!LOCAL) await store.list(pagePath()); // validate the key against the Worker
        hideLogin();
        enter();
      } catch (e) {
        clearSession();
        login.setBusy(false, 'Authenticate');
        login.setError(e.message === 'unauthorized' ? 'Incorrect key. Please try again.' : ('Could not connect — ' + e.message));
        login.keyInput.focus(); login.keyInput.select();
      }
    }

    // ---- styles (injected once, only in review mode) ---------------------
    // Host-page elements to hide while armed (e.g. a back-to-top FAB); see ./config.
    const hideCss = HIDE_SELECTORS.map((s) => `html.rv-armed ${s}{display:none !important}`).join('');
    const css = pkTokensCss + pkComponentsCss + hideCss + `
      /* Dock sits ABOVE popovers/toasts so its buttons are always clickable,
         even when a comment popover would otherwise overlap the bottom-right. */
      .rv-dock{position:fixed;right:24px;bottom:24px;z-index:2147483040;
        display:flex;align-items:center;gap:20px}
      .rv-fab{display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;border:none;
        border-radius:24px;background:var(--pk-card);color:var(--pk-ink);cursor:pointer;
        font:600 14px/1.5 Outfit,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.28)}
      .rv-fab[data-on="1"]{background:var(--pk-red)}
      .rv-fab svg{width:20px;height:20px;flex:none}
      /* "Go To Dashboard" — pinned to the bottom-LEFT, clear of the right-hand dock */
      .rv-dash{position:fixed;left:24px;bottom:24px;z-index:2147483040;
        display:flex;align-items:center;gap:8px;height:48px;padding:0 16px;border:none;border-radius:24px;
        background:var(--pk-card);color:var(--pk-ink);cursor:pointer;text-decoration:none;
        font:600 14px/1.5 Outfit,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.28)}
      .rv-dash svg{width:20px;height:20px;flex:none}
      @media (min-width:1024px) and (hover:hover){.rv-dash:hover{background:var(--pk-elev)}}
      .rv-backdrop{position:fixed;inset:0;z-index:2147480000;pointer-events:none;
        backdrop-filter:grayscale(1);-webkit-backdrop-filter:grayscale(1);
        box-shadow:inset 0 0 0 3px var(--pk-red)}
      .rv-nav{display:flex;align-items:center;gap:16px;height:48px;padding:0 2px;border-radius:24px;
        background:var(--pk-card);color:var(--pk-ink);box-shadow:0 6px 20px rgba(0,0,0,.28)}
      .rv-nav button{width:44px;height:44px;padding:0;border:none;border-radius:22px;
        background:var(--pk-hair);color:var(--pk-ink);cursor:pointer;display:flex;align-items:center;justify-content:center}
      .rv-nav button svg{width:22px;height:22px;display:block}
      .rv-nav button:disabled{opacity:.4;cursor:default}
      .rv-nav-label{min-width:44px;text-align:center;font:600 14px/1 Outfit;color:var(--pk-ink)}
      @media (max-width:768px){
        .rv-dock{right:16px;bottom:16px;gap:16px}
        .rv-nav{gap:8px}
        .rv-nav button{width:40px;height:40px}
        .rv-dash{left:16px;bottom:16px;padding:0 16px}
        .rv-dash span{display:none}
      }
      .rv-pin{position:fixed;z-index:2147483000;min-width:26px;height:26px;padding:0 8px;
        transform:translate(-50%,-100%);display:flex;align-items:center;justify-content:center;
        border-radius:14px;border:2px solid var(--pk-ink);background:var(--pk-red);color:var(--pk-ink);cursor:pointer;
        font:700 12px/1 Outfit,system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.35)}
      .rv-pin.resolved{background:var(--pk-muted)}
      .rv-pin.active{background:var(--pk-card);transform:translate(-50%,-100%) scale(1.12)}
      .rv-pop{position:fixed;z-index:2147483003;width:344px;max-width:calc(100vw - 32px);
        background:var(--pk-card);color:var(--pk-ink);border:1px solid var(--pk-hair);border-radius:0;
        box-shadow:0 24px 64px rgba(0,0,0,.6);font:400 14px/1.5 Outfit,system-ui,sans-serif}
      .rv-pop header{padding:20px 24px 16px;background:var(--pk-elev);border-bottom:1px solid var(--pk-hair);
        display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
      .rv-pop header .t{font-weight:600;font-size:15px;letter-spacing:-.01em}
      .rv-ticket{margin-top:4px;font-size:11px;font-weight:600;letter-spacing:.02em;
        font-variant-numeric:tabular-nums;color:var(--pk-red)}
      .rv-snip{font-weight:400;font-size:12px;color:var(--pk-muted);margin-top:4px;max-width:250px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rv-body{padding:24px;display:flex;flex-direction:column;gap:16px}
      .rv-pop input,.rv-pop textarea,.rv-pop select{width:100%;padding:12px 16px;border:1px solid var(--pk-hair);
        border-radius:4px;font:inherit;color:var(--pk-ink);background:var(--pk-input);box-sizing:border-box}
      .rv-pop input::placeholder,.rv-pop textarea::placeholder{color:var(--pk-muted)}
      .rv-pop select{height:44px;cursor:pointer}
      /* "Direct to" — which team this comment is routed to for action */
      .rv-directto{display:flex;flex-direction:column;gap:8px}
      .rv-directlabel{font:700 10px/1 Outfit,system-ui,sans-serif;text-transform:uppercase;
        letter-spacing:.06em;color:var(--pk-muted)}
      .rv-pop textarea{min-height:96px;resize:vertical}
      .rv-pop input:focus,.rv-pop textarea:focus,.rv-pop select:focus{outline:2px solid var(--pk-red);border-color:var(--pk-red)}
      .rv-team-chip{padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;
        text-transform:uppercase;letter-spacing:.02em;
        display:inline-flex;align-items:center;justify-content:center;min-width:var(--pk-chip-w);box-sizing:border-box}
      .rv-change-view{margin-top:2px;padding:8px 8px;border-radius:8px;background:var(--pk-callout-bg);border:1px solid var(--pk-callout-line)}
      .rv-change-view>span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;
        color:var(--pk-amber);letter-spacing:.04em;margin-bottom:2px}
      .rv-ctxt{white-space:pre-wrap;font-size:14px;color:var(--pk-ink)}
      .rv-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
      .rv-btn{height:44px;padding:0 24px;border-radius:0;border:none;cursor:pointer;
        font:700 12px/1 Outfit,system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase}
      .rv-btn.primary{background:var(--pk-red);color:var(--pk-ink)}
      .rv-btn.ghost{background:transparent;color:var(--pk-muted)}
      .rv-x{border:none;background:none;cursor:pointer;font-size:20px;line-height:1;color:var(--pk-muted)}
      .rv-read{padding:16px 24px 0}
      /* thread = single-open accordion of past comments (collapsed to Team + Name) */
      .rv-thread{max-height:300px;overflow:auto;padding:12px 24px;display:flex;flex-direction:column;gap:8px}
      .rv-titem{border:1px solid var(--pk-hair);border-radius:10px;overflow:hidden}
      .rv-thead{width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;border:none;
        background:var(--pk-elev);cursor:pointer;font:inherit;color:inherit;text-align:left}
      .rv-tname{flex:1;min-width:0;font-weight:600;font-size:14px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rv-tchev{width:16px;height:16px;flex:none;transition:transform .15s}
      .rv-titem.open .rv-tchev{transform:rotate(180deg)}
      .rv-tbody{padding:12px;display:flex;flex-direction:column;gap:8px}
      .rv-titem:not(.open) .rv-tbody{display:none}
      .rv-tmeta{font-size:12px;color:var(--pk-muted)}
      .rv-reply{padding:16px 24px 24px;border-top:1px solid var(--pk-hair);display:flex;flex-direction:column;gap:12px}
      .rv-reply input,.rv-reply textarea{width:100%;padding:12px 16px;border:1px solid var(--pk-hair);border-radius:4px;
        font:inherit;color:var(--pk-ink);background:var(--pk-input);box-sizing:border-box}
      .rv-reply textarea{min-height:64px;resize:vertical}
      .rv-reply input:focus,.rv-reply textarea:focus{outline:2px solid var(--pk-red);border-color:var(--pk-red)}
      .rv-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--pk-muted)}
      .rv-chip{padding:2px 8px;border-radius:10px;font-weight:600;font-size:11px;
        display:inline-flex;align-items:center;justify-content:center;min-width:var(--pk-chip-w);box-sizing:border-box}
      .rv-chip.open{background:var(--pk-open-bg);color:var(--pk-open-ink)}
      .rv-chip.resolved{background:var(--pk-done-bg);color:var(--pk-done-ink)}
      .rv-chip.closed{background:var(--pk-closed-bg);color:var(--pk-closed-ink)}
      .rv-txt{white-space:pre-wrap;color:var(--pk-ink)}
      .rv-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:2147483004;
        max-width:calc(100vw - 32px);padding:12px 16px;border-radius:12px;background:var(--pk-card);color:var(--pk-ink);
        font:500 14px/1.5 Outfit,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28)}
      /* Draft pins (F2): a dashed, hollow marker for a pending (not-yet-submitted) draft,
         visually distinct from a live teamStatus-coloured pin. Number stays legible. */
      .rv-pin.draft{background:var(--pk-elev);border-style:dashed;color:var(--pk-ink)}
      /* Draft tray (F2): floats above the bottom-right dock; .pk-tray styling lives in
         components.css (shared). Hidden until there is ≥1 pending draft. */
      .rv-tray-wrap{position:fixed;right:24px;bottom:84px;z-index:2147483039;width:340px;
        max-width:calc(100vw - 32px)}
      .rv-tray-wrap[hidden]{display:none}
      .rv-tray-wrap .pk-tray-list{display:none}
      .rv-tray-wrap.is-open .pk-tray-list,.rv-tray-wrap.is-open .pk-tray-foot{display:flex}
      .rv-tray-wrap:not(.is-open) .pk-tray-foot{display:none}
      @media (max-width:768px){.rv-tray-wrap{right:16px;bottom:76px}}
      /* Composer template fields (F1) + expected-outcome (F8): labelled rows reusing the
         same input skin as the freeform textarea. currentImage/currentUrl are read-only. */
      .rv-tf{display:flex;flex-direction:column;gap:6px}
      .rv-tf-label{font:700 10px/1 Outfit,system-ui,sans-serif;text-transform:uppercase;
        letter-spacing:.06em;color:var(--pk-muted)}
      .rv-tf input[readonly]{color:var(--pk-muted);cursor:default}
      .rv-tf-req{color:var(--pk-red)}
      .rv-typesel-wrap{display:flex;flex-direction:column;gap:8px}
      .rv-fields{display:flex;flex-direction:column;gap:16px}
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;

    // ---- helpers ---------------------------------------------------------
    const slugFromPath = () =>
      (pagePath().replace(/^\/|\/$/g, '') || 'home').replace(/[^a-z0-9/-]/gi, '');

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
    // A client uuid (crypto or fallback) — used for draft ids AND the per-batch batchId (F2/§2).
    const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID()
      : 'x' + Date.now().toString(36) + Math.floor(Math.random() * 1e8).toString(36));

    // ---- bottom-right dock: [nav toolbar] [Comment/Save FAB] -------------
    // The nav toolbar (comment count + prev/next) shows only in review mode,
    // to the LEFT of the FAB. The FAB is the single Save/Comment button.
    document.head.appendChild(styleEl);
    // The Comment dock (and the host .to-top hide) appear ONLY once the review session
    // is authenticated - i.e. a validated Key is stored in PASS_KEY (`reviewPass`).
    const isAuthed = () => !!getSession().key;
    const dock = document.createElement('div'); dock.className = 'rv-dock';
    let dockShown = false;
    function revealDock() {
      if (dockShown) return;
      dockShown = true;
      document.documentElement.classList.add('rv-armed'); // hides the host .to-top FAB
      dock.style.display = 'flex';
      dashBtn.style.display = 'inline-flex'; // authenticated → offer "Go to Dashboard"
    }

    const nav = document.createElement('div'); nav.className = 'rv-nav'; nav.style.display = 'none';
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
    const ICON_CHECK =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    // Comment (dark) when idle -> Save (gold, check) once greyscale/review is on.
    // Comments already save per-item on submit; Save just leaves review state.
    function setFab(on) {
      fab.dataset.on = on ? '1' : '0';
      fab.innerHTML = (on ? ICON_CHECK : ICON_CHAT) + '<span>' + (on ? 'Save' : 'Comment') + '</span>';
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
      const team = getSession().team;
      location.href = team === ADMIN_TEAM ? '/reviewdash' : '/teamdash';
    });
    document.body.appendChild(dashBtn); // bottom-left, independent of the dock

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
          '<button type="button" class="rv-btn primary rv-tray-submit" style="flex:1">Submit all</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(trayWrap);
    let trayOpen = false;
    trayWrap.querySelector('.pk-tray-head').addEventListener('click', () => {
      trayOpen = !trayOpen; trayWrap.classList.toggle('is-open', trayOpen);
    });
    trayWrap.querySelector('.rv-tray-submit').addEventListener('click', () => submitAll());
    trayWrap.querySelector('.rv-tray-clear').addEventListener('click', () => {
      if (!drafts.length) return;
      if (!confirm('Discard all ' + drafts.length + ' pending pin(s)?')) return;
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

    async function enter() {
      revealDock();       // authenticated -> the Comment/Save dock is now visible
      reviewOn = true;
      setFab(true);
      nav.style.display = 'flex';
      try { history.replaceState(null, '', reviewUrl()); } catch (e) {} // address bar → /<page>/review
      document.body.appendChild(backdrop);
      try { comments = await store.list(pagePath()); }
      catch (e) {
        if (e.message === 'unauthorized') { toast('Wrong passcode — try again.'); return exit(); }
        toast('Could not load comments — ' + e.message); comments = [];
      }
      renderPins();
      // deep link: #c=<id> opens that comment (hash captured before the URL rewrite)
      const m = DEEP_HASH.match(/c=([^&]+)/);
      if (m) {
        const c = comments.find((x) => x.id === m[1]);
        const root = c && (c.parentId ? comments.find((x) => x.id === c.parentId) : c);
        if (root) { scrollToComment(root); setTimeout(() => openThread(root), 350); }
      }
    }
    function exit() {
      // F2: exiting review with unsent drafts pending ⇒ confirm-discard (they live only in
      // memory, never POSTed, so leaving would silently lose them).
      if (drafts.length && !confirm('You have ' + drafts.length + ' pending pin(s) not yet submitted. Discard them and leave review?')) return;
      reviewOn = false;
      setFab(false);
      nav.style.display = 'none';
      try { history.replaceState(null, '', pagePath()); } catch (e) {} // address bar → back to the page
      backdrop.remove(); closePop();
      pinEls.forEach((el) => el.remove()); pinEls.clear();
      drafts = []; draftPinEls.forEach((el) => el.remove()); draftPinEls.clear(); renderTray();
      activeId = null;
      sessionStorage.removeItem(SESSION_KEY); // end this review session -> next entry logs separately
    }

    // ---- pins ------------------------------------------------------------
    function pinPos(rec) {
      const a = rec.anchor || {};
      let el = null; try { el = a.selector ? document.querySelector(a.selector) : null; } catch {}
      if (el) { const r = el.getBoundingClientRect();
        return { x: r.left + ((a.xPct || 0) / 100) * r.width, y: r.top + ((a.yPct || 0) / 100) * r.height }; }
      return { x: (a.pageX || 0) - window.scrollX, y: (a.pageY || 0) - window.scrollY };
    }
    const roots = () => comments.filter((c) => !c.parentId);
    // On-page pins show every root EXCEPT deployed_live ones — a shipped change is hidden
    // from the website (F5 rewire: teamStatus is the ONLY status; the dead `status` field
    // — open/resolved/closed — is gone). A dashboard "Open Pin" (#c=<id>) still force-shows
    // its target even when deployed_live. Capture the deep-link hash NOW: enter() rewrites
    // the address bar (dropping #c=).
    const DEEP_HASH = location.hash;
    const teamStatusOf = (c) => c.teamStatus || 'to_be_initiated';
    const isVisibleRoot = (c) => teamStatusOf(c) !== 'deployed_live';
    function deepRootId() {
      const m = DEEP_HASH.match(/c=([^&]+)/); if (!m) return null;
      const c = comments.find((x) => x.id === m[1]); return c ? (c.parentId || c.id) : null;
    }
    const pinRoots = () => { const d = deepRootId(); return comments.filter((c) => !c.parentId && (isVisibleRoot(c) || c.id === d)); };
    const repliesOf = (id) => comments.filter((c) => c.parentId === id)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    // F5: colour a pin's fill by teamStatus (STATUS_COLORS token names from config.js). Amber
    // is a light fill, so its number takes dark ink; every other fill uses --pk-on-accent.
    function paintPin(pin, status) {
      const token = STATUS_COLORS[status] || STATUS_COLORS.to_be_initiated;
      pin.style.background = 'var(' + token + ')';
      pin.style.color = status === 'to_be_initiated' ? 'var(--pk-canvas)' : 'var(--pk-on-accent)';
      pin.style.borderColor = 'var(' + token + ')';
    }
    function renderPins() {
      pinEls.forEach((el) => el.remove()); pinEls.clear();
      pinRoots().forEach((rec, i) => {
        const pin = document.createElement('button');
        pin.className = 'rv-pin';
        pin.type = 'button'; pin.textContent = String(i + 1);
        paintPin(pin, teamStatusOf(rec));
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
    function positionPins() {
      const place = (pin, rec) => {
        if (!pin) return;
        const { x, y } = pinPos(rec);
        const off = x < -40 || y < -40 || x > innerWidth + 40 || y > innerHeight + 40;
        pin.style.display = off ? 'none' : 'flex';
        pin.style.left = x + 'px'; pin.style.top = y + 'px';
      };
      pinRoots().forEach((rec) => place(pinEls.get(rec.id), rec));
      drafts.forEach((d) => place(draftPinEls.get(d.draftId), d)); // pending drafts anchor the same way
    }
    let raf = 0;
    const onScroll = () => { if (!reviewOn) return; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; positionPins(); }); };
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', onScroll);
    function scrollToComment(rec) {
      const a = rec.anchor || {};
      let top = a.pageY || 0;
      try { const el = a.selector && document.querySelector(a.selector); if (el) top = el.getBoundingClientRect().top + window.scrollY; } catch {}
      window.scrollTo({ top: Math.max(0, top - innerHeight / 2), behavior: 'smooth' });
    }

    // ---- click anywhere to add ------------------------------------------
    document.addEventListener('click', (e) => {
      if (!reviewOn) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      // Ignore clicks on Proofkit's own controls — including the bottom-left
      // "Go To Dashboard" button (.rv-dash), which lives outside the .rv-dock now.
      if (t.closest('.rv-pin, .rv-pop, .rv-dock, .rv-dash, .rv-toast, .rv-tray-wrap')) return;
      e.preventDefault(); e.stopPropagation();
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
    function openComposer(el, cx, cy, px, py, editing) {
      closePop();
      const targetEl = el instanceof Element ? el : document.body;
      const r = targetEl.getBoundingClientRect();
      const anchor = editing ? editing.anchor : {
        selector: cssPath(targetEl),
        snippet: (targetEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        tag: targetEl.tagName.toLowerCase(),
        xPct: r.width ? Math.round(((cx - r.left) / r.width) * 100) : 0,
        yPct: r.height ? Math.round(((cy - r.top) / r.height) * 100) : 0,
        pageX: Math.round(px), pageY: Math.round(py),
        docHeight: document.documentElement.scrollHeight, viewportW: innerWidth,
      };
      const auto = elementAutoFill(targetEl);
      // temporary marker at the click point
      tempMarker = document.createElement('button');
      tempMarker.className = 'rv-pin active'; tempMarker.textContent = editing ? '✎' : '+';
      tempMarker.style.left = cx + 'px'; tempMarker.style.top = cy + 'px';
      document.body.appendChild(tempMarker);

      // Per-composer working state — the single object every field binds to, so switching
      // type never loses what was typed. Seeded from `editing` when reopening a draft.
      const state = {
        commentType: editing ? editing.commentType : 'general',
        templateFields: Object.assign({}, editing ? editing.templateFields : null),
        comment: editing ? editing.comment : '',
        expectedOutcome: editing ? editing.expectedOutcome : '',
      };

      const pop = document.createElement('div'); pop.className = 'rv-pop';
      pop.innerHTML =
        '<header><div><div class="t">' + (editing ? 'Edit pin' : 'Mark a comment') + '</div><div class="rv-snip"></div></div>' +
        '<button class="rv-x" aria-label="Close">×</button></header>' +
        '<div class="rv-body">' +
        '<div class="rv-dup-slot"></div>' +
        '<div class="rv-typesel-wrap"><span class="rv-directlabel">Change type</span><div class="pk-typesel"></div></div>' +
        '<div class="rv-directto"><span class="rv-directlabel">Direct to</span>' +
          '<div class="rv-dd-slot"></div></div>' +
        '<div class="rv-fields"></div>' +
        '<div class="rv-err rv-reopen-err" hidden></div>' +
        '<div class="rv-actions"><button class="rv-btn ghost rv-cancel">Cancel</button>' +
        '<button class="rv-btn primary rv-send">' + (editing ? 'Update pin' : 'Add pin') + '</button></div></div>';
      pop.querySelector('.rv-snip').textContent = anchor.snippet ? 'Selected - “' + anchor.snippet + '”' : 'Selected - ' + (anchor.tag || 'element');
      document.body.appendChild(pop);

      // F7 duplicate advisory (non-blocking): a similar OPEN root on this page (same selector
      // or pin within 48px). Shows a strip linking to the existing thread; never blocks save.
      if (!editing) {
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

      // "Direct to" — route this comment to a team's dashboard for action (unchanged from v2).
      const dItems = directItems();
      const dValue = editing ? editing.toTeam
        : (dItems.some((i) => i.value === ADMIN_TEAM) ? ADMIN_TEAM : dItems[0].value);
      const toDD = buildDropdown({ items: dItems, value: dValue, block: true });
      pop.querySelector('.rv-dd-slot').appendChild(toDD.el);

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
          syncChips(); renderFields(); placePop(pop, cx, cy);
        });
        chipWrap.appendChild(chip);
      });
      syncChips();

      // Read the live inputs back into `state` (called before a type-swap and on save).
      function captureFields() {
        fieldsWrap.querySelectorAll('[data-tfkey]').forEach((inp) => { state.templateFields[inp.dataset.tfkey] = inp.value; });
        const notes = fieldsWrap.querySelector('.rv-text'); if (notes) state.comment = notes.value;
        const outc = fieldsWrap.querySelector('.rv-outcome'); if (outc) state.expectedOutcome = outc.value;
      }

      // Build the per-type fields: template fields (auto-filled + read-only where declared),
      // the notes textarea (the single main box for `general`), and — F8 — a required
      // "Expected outcome" for layout-tweak / image-swap.
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
        // F8 expected outcome (required) for the two types that need success criteria.
        if (needsExpectedOutcome(state.commentType)) {
          const orow = document.createElement('div'); orow.className = 'rv-tf';
          const ol = document.createElement('span'); ol.className = 'rv-tf-label';
          ol.innerHTML = 'Expected outcome <span class="rv-tf-req">*</span>';
          const ot = document.createElement('textarea'); ot.className = 'rv-outcome';
          ot.placeholder = 'What should the result look like once done?';
          ot.value = state.expectedOutcome || '';
          ot.addEventListener('input', () => { state.expectedOutcome = ot.value; });
          orow.appendChild(ol); orow.appendChild(ot); fieldsWrap.appendChild(orow);
        }
        const first = fieldsWrap.querySelector('input:not([readonly]),textarea'); if (first) first.focus();
      }
      renderFields();
      placePop(pop, cx, cy);

      const submit = () => { captureFields(); saveDraft(state, anchor, toDD, targetEl, editing, setError); };
      pop.querySelector('.rv-x').addEventListener('click', closePop);
      pop.querySelector('.rv-cancel').addEventListener('click', closePop);
      pop.querySelector('.rv-send').addEventListener('click', submit);
    }

    // "Direct to" options: every team EXCEPT the reviewer's own (you can't route a
    // request to your own team), then Builder at the END, fenced off by a divider.
    // Builder stays the default (site changes) even though it's listed last — unless the
    // reviewer IS Builder, in which case Builder is dropped too.
    function directItems() {
      const me = getSession().team;
      const teams = TEAMS.filter((t) => t !== me).map((t) => ({ value: t, label: t }));
      if (me !== ADMIN_TEAM) teams.push({ value: ADMIN_TEAM, label: ADMIN_TEAM, dividerBefore: true });
      return teams;
    }

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
    async function captureShot(el) {
      if (!(el instanceof Element)) return '';
      try {
        const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        const html2canvas = (mod && mod.default) || window.html2canvas;
        if (!html2canvas) return '';
        const PAD = 100, r = el.getBoundingClientRect();
        const canvas = await html2canvas(document.body, {
          x: window.scrollX + r.left - PAD, y: window.scrollY + r.top - PAD,
          width: r.width + PAD * 2, height: r.height + PAD * 2,
          backgroundColor: '#ffffff', scale: 1, logging: false, useCORS: true,
          ignoreElements: (n) => n.classList && (n.classList.contains('rv-pop') || n.classList.contains('rv-pin') ||
            n.classList.contains('rv-dock') || n.classList.contains('rv-dash') || n.classList.contains('rv-tray-wrap') ||
            n.classList.contains('rv-backdrop') || n.classList.contains('rv-toast')),
        });
        const maxW = 480, scale = canvas.width > maxW ? maxW / canvas.width : 1;
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(canvas.width * scale));
        out.height = Math.max(1, Math.round(canvas.height * scale));
        out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
        return out.toDataURL('image/jpeg', 0.7);
      } catch (e) { return ''; } // capture unsupported / CDN blocked / cross-origin taint → no image
    }

    // Validate the composer state, returning { ok, error?, focusFirst?, templateFields, comment,
    // expectedOutcome }. Required template fields + F8 expected-outcome are enforced (block save);
    // `general` still requires a non-empty note (zero regression). Typed comments with an empty
    // note fall back to the rendered summary so the Worker's non-empty `comment` check passes.
    function validateDraft(state) {
      const tf = {};
      for (const f of (TYPE_FIELDS[state.commentType] || [])) {
        const v = String(state.templateFields[f.key] || '').trim();
        if (f.required && !v) return { ok: false, error: 'Please fill “' + f.label + '”.' };
        if (v) tf[f.key] = v;
      }
      const expectedOutcome = String(state.expectedOutcome || '').trim();
      if (needsExpectedOutcome(state.commentType) && !expectedOutcome)
        return { ok: false, error: 'Expected outcome is required for this change type.' };
      let comment = String(state.comment || '').trim();
      if (state.commentType === 'general' && !comment) return { ok: false, error: 'Please describe the change.' };
      if (!comment) comment = renderSummary(state.commentType, tf, '') ||
        ((COMMENT_TYPES.find((t) => t.value === state.commentType) || {}).label || 'Change');
      return { ok: true, templateFields: tf, comment, expectedOutcome };
    }

    // F2/F4/F8: "Add pin" — validate, capture a screenshot (best-effort), and push/replace a
    // DRAFT in the local array (no POST). The batch goes out only on "Submit all".
    async function saveDraft(state, anchor, toDD, targetEl, editing, setError) {
      const v = validateDraft(state);
      if (!v.ok) { setError(v.error); return; }
      setError('');
      const btn = document.querySelector('.rv-pop .rv-send');
      if (btn) { btn.disabled = true; btn.textContent = 'Capturing…'; }
      // Capture at draft-creation; on an edit reuse the prior shot unless we can re-capture.
      // Skip capture when the anchor element is missing (targetEl fell back to <body>) so an
      // edit never grabs a full-page screenshot — the prior shot is kept instead.
      let imageDataUrl = editing ? (editing.imageDataUrl || '') : '';
      const shot = (targetEl && targetEl !== document.body) ? await captureShot(targetEl) : '';
      if (shot) imageDataUrl = shot;
      const draft = {
        draftId: editing ? editing.draftId : uuid(),
        anchor,
        commentType: state.commentType,
        templateFields: v.templateFields,
        expectedOutcome: v.expectedOutcome,
        comment: v.comment,
        toTeam: (toDD && toDD.getValue()) || ADMIN_TEAM,
        imageDataUrl,
        imageId: editing ? (editing.imageId || '') : '',   // reset if the shot changed; re-uploaded on submit
        error: '',
        page: { path: pagePath(), url: location.href, title: pageName(pagePath()), docTitle: document.title, slug: slugFromPath() },
      };
      if (shot) draft.imageId = ''; // a fresh capture invalidates any prior upload
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
      let el = null; try { el = d.anchor && d.anchor.selector ? document.querySelector(d.anchor.selector) : null; } catch {}
      const p = pinPos(d);
      openComposer(el, p.x, p.y, d.anchor.pageX || 0, d.anchor.pageY || 0, d);
    }

    // Turn a draft into the wire record (adds session team, batchId, server-parity summary).
    function draftToRecord(d, batchId) {
      return {
        team: getSession().team, toTeam: d.toTeam || ADMIN_TEAM,
        comment: d.comment, anchor: d.anchor,
        commentType: d.commentType, templateFields: d.templateFields,
        expectedOutcome: d.expectedOutcome || '',
        summary: renderSummary(d.commentType, d.templateFields, d.comment),
        imageId: d.imageId || '', batchId,
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
      // 1) screenshots → /image (each independent; a failed upload just drops that image).
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
      const thread = [root, ...repliesOf(root.id)];
      const pop = document.createElement('div'); pop.className = 'rv-pop';
      pop.innerHTML =
        '<header><div><div class="t">Comment #' + idx + ' · ' + thread.length +
        (thread.length > 1 ? ' comments' : ' comment') + '</div>' +
        (root.ticket ? '<div class="rv-ticket">Ticket #' + escapeHtml(root.ticket) + '</div>' : '') +
        '<div class="rv-snip"></div></div>' +
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
        // collapsed header = Team + timestamp; body reveals on expand (one open at a time)
        const item = document.createElement('div'); item.className = 'rv-titem' + (i === 0 ? ' open' : '');
        item.innerHTML =
          '<button type="button" class="rv-thead">' + teamChip(c.team) +
          '<b class="rv-tname">' + escapeHtml(fmtTime(c.createdAt)) + '</b>' + CHEV + '</button>' +
          '<div class="rv-tbody">' +
          '<div class="rv-txt"></div>' +
          (c.changeTo ? '<div class="rv-change-view"><span>Change to</span><div class="rv-ctxt"></div></div>' : '') +
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
      const p = pinPos(root); placePop(pop, p.x, p.y);
      // The team is session-global (chosen at login); replies are team-tagged, no name.
      placePop(pop, p.x, p.y);
      pop.querySelector('.rv-x').addEventListener('click', () => { closePop(); pinEls.forEach((el) => el.classList.remove('active')); });
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
    function placePop(pop, x, y) {
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
      const c = TEAM_COLORS[team] || ['var(--pk-hair)', 'var(--pk-green)'];
      return '<span class="rv-team-chip" style="background:' + c[0] + ';color:' + c[1] + '">' + escapeHtml(team) + '</span>';
    }
    // teamStatus → a coloured chip (F5 rewire — the ONLY status the overlay shows now).
    // Fill = the STATUS_COLORS token; amber takes dark ink, the rest --pk-on-accent (matches paintPin).
    const STATUS_LABELS = {
      to_be_initiated: 'To be initiated', in_progress: 'In progress',
      deployed_live: 'Deployed live', reopened: 'Reopened',
    };
    function statusChip(status) {
      const token = STATUS_COLORS[status] || STATUS_COLORS.to_be_initiated;
      const ink = status === 'to_be_initiated' ? 'var(--pk-canvas)' : 'var(--pk-on-accent)';
      return '<span class="rv-chip" style="background:var(' + token + ');color:' + ink + '">' +
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
    if (isAuthed()) {
      revealDock();
      if (AUTO || /[#&]c=/.test(location.hash)) startReview();
    } else {
      showLogin();
    }
  })();
