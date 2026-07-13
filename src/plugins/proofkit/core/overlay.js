  import { TEAM_COLORS, WORKER_URL, HIDE_SELECTORS, PROOFKIT_ENABLED, ADMIN_TEAM,
    getSession, setSession, clearSession, buildPanelLogin } from './config.js';
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
    // Never arm on the dashboard board itself.
    if (location.pathname === '/reviewdash') return;
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
    const store = LOCAL
      ? {
          async list(path) { return localGet(path); },
          async add(rec) {
            rec.id = 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
            rec.createdAt = new Date().toISOString();
            rec.status = 'open';
            const arr = localGet(rec.page.path); arr.push(rec);
            localStorage.setItem(localKey(rec.page.path), JSON.stringify(arr));
            return rec;
          },
        }
      : {
          list: (path) => apiFetch('/comments?path=' + encodeURIComponent(path)),
          add: (rec) => apiFetch('/comments', { method: 'POST', body: JSON.stringify(rec) }),
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
        // overlay context: clicking the backdrop backs out of review
        login.el.addEventListener('click', (e) => { if (e.target === login.el) hideLogin(); });
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
      .rv-fab{display:flex;align-items:center;gap:8px;height:48px;padding:0 18px;border:none;
        border-radius:24px;background:#1d1d1d;color:#fff;cursor:pointer;
        font:600 14px/1.5 Outfit,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.28)}
      .rv-fab[data-on="1"]{background:var(--pk-red)}
      .rv-fab svg{width:20px;height:20px;flex:none}
      /* "Go to Dashboard" — sits in the dock next to the Save/Comment FAB */
      .rv-dash{display:flex;align-items:center;gap:8px;height:48px;padding:0 18px;border:none;border-radius:24px;
        background:#1d1d1d;color:#fff;cursor:pointer;text-decoration:none;
        font:600 14px/1.5 Outfit,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.28)}
      .rv-dash svg{width:20px;height:20px;flex:none}
      @media (min-width:1024px) and (hover:hover){.rv-dash:hover{background:#2a2a2a}}
      .rv-backdrop{position:fixed;inset:0;z-index:2147480000;pointer-events:none;
        backdrop-filter:grayscale(1);-webkit-backdrop-filter:grayscale(1);
        box-shadow:inset 0 0 0 3px var(--pk-red)}
      .rv-nav{display:flex;align-items:center;gap:14px;height:48px;padding:0 2px;border-radius:24px;
        background:#1d1d1d;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.28)}
      .rv-nav button{width:44px;height:44px;padding:0;border:none;border-radius:22px;
        background:#3a3a3a;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
      .rv-nav button svg{width:22px;height:22px;display:block}
      .rv-nav button:disabled{opacity:.4;cursor:default}
      .rv-nav-label{min-width:44px;text-align:center;font:600 14px/1 Outfit;color:#fff}
      @media (max-width:768px){
        .rv-dock{right:16px;bottom:16px;gap:14px}
        .rv-nav{gap:10px}
        .rv-nav button{width:40px;height:40px}
        .rv-dash{padding:0 14px}
        .rv-dash span{display:none}
      }
      .rv-pin{position:fixed;z-index:2147483000;min-width:26px;height:26px;padding:0 7px;
        transform:translate(-50%,-100%);display:flex;align-items:center;justify-content:center;
        border-radius:14px;border:2px solid #fff;background:var(--pk-red);color:#fff;cursor:pointer;
        font:700 12px/1 Outfit,system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.35)}
      .rv-pin.resolved{background:var(--pk-muted)}
      .rv-pin.active{background:#1d1d1d;transform:translate(-50%,-100%) scale(1.12)}
      .rv-pop{position:fixed;z-index:2147483003;width:344px;max-width:calc(100vw - 32px);
        background:var(--pk-card);color:var(--pk-ink);border:1px solid var(--pk-hair);border-radius:0;overflow:hidden;
        box-shadow:0 24px 64px rgba(0,0,0,.6);font:400 14px/1.5 Outfit,system-ui,sans-serif}
      .rv-pop header{padding:20px 22px 16px;background:var(--pk-elev);border-bottom:1px solid var(--pk-hair);
        display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .rv-pop header .t{font-weight:600;font-size:15px;letter-spacing:-.01em}
      .rv-snip{font-weight:400;font-size:12px;color:var(--pk-muted);margin-top:5px;max-width:250px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rv-body{padding:22px;display:flex;flex-direction:column;gap:14px}
      .rv-pop input,.rv-pop textarea,.rv-pop select{width:100%;padding:11px 14px;border:1px solid var(--pk-hair);
        border-radius:4px;font:inherit;color:var(--pk-ink);background:var(--pk-input);box-sizing:border-box}
      .rv-pop input::placeholder,.rv-pop textarea::placeholder{color:var(--pk-muted)}
      .rv-pop select{height:44px;cursor:pointer}
      .rv-pop textarea{min-height:96px;resize:vertical}
      .rv-pop input:focus,.rv-pop textarea:focus,.rv-pop select:focus{outline:2px solid var(--pk-red);border-color:var(--pk-red)}
      .rv-change,.rv-rchange{border-color:var(--pk-red) !important;background:#241a10 !important}
      .rv-team-chip{padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px;
        text-transform:uppercase;letter-spacing:.02em}
      .rv-change-view{margin-top:2px;padding:8px 10px;border-radius:8px;background:#241a10;border:1px solid #4a3417}
      .rv-change-view>span{display:block;font-size:10px;font-weight:700;text-transform:uppercase;
        color:var(--pk-amber);letter-spacing:.04em;margin-bottom:2px}
      .rv-ctxt{white-space:pre-wrap;font-size:14px;color:var(--pk-ink)}
      .rv-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:10px}
      .rv-btn{height:44px;padding:0 22px;border-radius:0;border:none;cursor:pointer;
        font:700 12px/1 Outfit,system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase}
      .rv-btn.primary{background:var(--pk-red);color:#fff}
      .rv-btn.ghost{background:transparent;color:var(--pk-muted)}
      .rv-x{border:none;background:none;cursor:pointer;font-size:20px;line-height:1;color:var(--pk-muted)}
      .rv-read{padding:16px 22px 0}
      /* thread = single-open accordion of past comments (collapsed to Team + Name) */
      .rv-thread{max-height:300px;overflow:auto;padding:12px 22px;display:flex;flex-direction:column;gap:10px}
      .rv-titem{border:1px solid var(--pk-hair);border-radius:10px;overflow:hidden}
      .rv-thead{width:100%;display:flex;align-items:center;gap:8px;padding:10px 12px;border:none;
        background:var(--pk-elev);cursor:pointer;font:inherit;color:inherit;text-align:left}
      .rv-tname{flex:1;min-width:0;font-weight:600;font-size:14px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rv-tchev{width:16px;height:16px;flex:none;transition:transform .15s}
      .rv-titem.open .rv-tchev{transform:rotate(180deg)}
      .rv-tbody{padding:12px;display:flex;flex-direction:column;gap:8px}
      .rv-titem:not(.open) .rv-tbody{display:none}
      .rv-tmeta{font-size:12px;color:var(--pk-muted)}
      .rv-reply{padding:18px 22px 22px;border-top:1px solid var(--pk-hair);display:flex;flex-direction:column;gap:12px}
      .rv-reply input,.rv-reply textarea{width:100%;padding:11px 14px;border:1px solid var(--pk-hair);border-radius:4px;
        font:inherit;color:var(--pk-ink);background:var(--pk-input);box-sizing:border-box}
      .rv-reply textarea{min-height:64px;resize:vertical}
      .rv-reply input:focus,.rv-reply textarea:focus{outline:2px solid var(--pk-red);border-color:var(--pk-red)}
      .rv-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--pk-muted)}
      .rv-chip{padding:2px 8px;border-radius:10px;font-weight:600;font-size:11px}
      .rv-chip.open{background:#3a2a12;color:var(--pk-amber)}
      .rv-chip.resolved{background:#16281c;color:var(--pk-green)}
      .rv-chip.closed{background:#2a2a2a;color:var(--pk-muted)}
      .rv-txt{white-space:pre-wrap;color:var(--pk-ink)}
      .rv-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:2147483004;
        max-width:calc(100vw - 32px);padding:12px 16px;border-radius:12px;background:#1d1d1d;color:#fff;
        font:500 14px/1.5 Outfit,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28)}
      /* ProofKit login module — Red Moon kit (near-black canvas, scarce Rosso Corsa,
         Inter, sharp 0px corners, uppercase tracked CTA), over the blurred page. */
      .rv-login{position:fixed;inset:0;z-index:2147483090;display:flex;align-items:center;justify-content:center;
        padding:16px;background:rgba(12,12,12,.72);
        -webkit-backdrop-filter:blur(8px) saturate(.6);backdrop-filter:blur(8px) saturate(.6)}
      .rv-login-card{width:480px;max-width:100%;background:#1b1b1b;color:#fff;border:1px solid #303030;border-radius:0;
        padding:56px;box-shadow:0 30px 90px rgba(0,0,0,.6);box-sizing:border-box;
        font:400 15px/1.6 Inter,Outfit,system-ui,sans-serif}
      .rv-login-brand{display:flex;align-items:center;gap:10px;margin-bottom:40px;
        font:600 12px/1 Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.4px;color:#fff}
      .rv-login-mark{width:10px;height:10px;background:#da291c;display:inline-block;flex:none}
      .rv-login-title{font:500 32px/1.15 Inter,system-ui,sans-serif;letter-spacing:-.6px;color:#fff}
      .rv-login-sub{font-size:15px;line-height:1.6;color:#969696;margin:16px 0 40px}
      .rv-login-label{display:block;margin-bottom:12px;font:600 11px/1 Inter,system-ui,sans-serif;
        text-transform:uppercase;letter-spacing:1.2px;color:#8f8f8f}
      .rv-login-input{width:100%;height:56px;padding:0 20px;border:1px solid #303030;border-radius:0;background:#111;
        color:#fff;font:400 15px/1.5 Inter,system-ui,sans-serif;box-sizing:border-box}
      .rv-login-input::placeholder{color:#5a5a5a}
      .rv-login-input:focus{outline:none;border-color:#da291c}
      .rv-login-label2{margin-top:28px}
      .rv-login-select{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:48px;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238f8f8f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat:no-repeat;background-position:right 20px center}
      .rv-login-select option{color:#fff;background:#111}
      .rv-login-select:invalid,.rv-login-select option[value=""]{color:#5a5a5a}
      .rv-login-err{margin-top:14px;font-size:13px;font-weight:600;color:#f13a2c}
      .rv-login-actions{display:flex;gap:18px;align-items:center;justify-content:flex-end;margin-top:40px}
      .rv-login-cancel{background:none;border:none;padding:8px 4px;color:#969696;cursor:pointer;
        font:700 13px/1 Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px}
      .rv-login-btn{height:56px;padding:0 40px;border:none;border-radius:0;background:#da291c;color:#fff;cursor:pointer;
        font:700 14px/1 Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.4px}
      .rv-login-btn:active{background:#b01e0a}
      .rv-login-btn:disabled{opacity:.55;cursor:default}
      .rv-login-foot{margin-top:40px;padding-top:20px;border-top:1px solid #303030;
        font:400 11px/1.4 Inter,system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px;color:#666}
    `;
    // Inter — the documented Red Moon / FerrariSans substitute — for the ProofKit UI.
    if (!document.getElementById('pk-font')) {
      const fl = document.createElement('link'); fl.id = 'pk-font'; fl.rel = 'stylesheet';
      fl.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(fl);
    }
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

    // "Go to Dashboard" — every authenticated reviewer gets it in the dock, next to
    // the Save/Comment FAB. Admins (ADMIN_TEAM) land on /reviewdash; teams on /teamdash.
    const dashBtn = document.createElement('button');
    dashBtn.className = 'rv-dash'; dashBtn.type = 'button';
    const ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1"/></svg>';
    dashBtn.innerHTML = ICON_GRID + '<span>Dashboard</span>';
    dashBtn.style.display = 'none'; // shown by revealDock() once authenticated
    dashBtn.addEventListener('click', () => {
      const team = getSession().team;
      location.href = team === ADMIN_TEAM ? '/reviewdash' : '/teamdash';
    });

    dock.appendChild(nav);
    dock.appendChild(dashBtn);
    dock.appendChild(fab);
    dock.style.display = 'none'; // hidden until the review session is authenticated (revealDock)
    document.body.appendChild(dock);

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
      reviewOn = false;
      setFab(false);
      nav.style.display = 'none';
      try { history.replaceState(null, '', pagePath()); } catch (e) {} // address bar → back to the page
      backdrop.remove(); closePop();
      pinEls.forEach((el) => el.remove()); pinEls.clear(); activeId = null;
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
    // On-page pins show ONLY unresolved comments — resolved/closed ones are hidden
    // from the website. A dashboard "Open Pin" (#c=<id>) still force-shows its target.
    // Capture the deep-link hash NOW: enter() rewrites the address bar (dropping #c=).
    const DEEP_HASH = location.hash;
    const isUnresolvedC = (c) => c.status !== 'resolved' && c.status !== 'closed';
    function deepRootId() {
      const m = DEEP_HASH.match(/c=([^&]+)/); if (!m) return null;
      const c = comments.find((x) => x.id === m[1]); return c ? (c.parentId || c.id) : null;
    }
    const pinRoots = () => { const d = deepRootId(); return comments.filter((c) => !c.parentId && (isUnresolvedC(c) || c.id === d)); };
    const repliesOf = (id) => comments.filter((c) => c.parentId === id)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    function renderPins() {
      pinEls.forEach((el) => el.remove()); pinEls.clear();
      pinRoots().forEach((rec, i) => {
        const pin = document.createElement('button');
        pin.className = 'rv-pin' + (rec.status === 'resolved' ? ' resolved' : '');
        pin.type = 'button'; pin.textContent = String(i + 1);
        pin.addEventListener('click', (e) => { e.stopPropagation(); openThread(rec); });
        document.body.appendChild(pin); pinEls.set(rec.id, pin);
      });
      positionPins();
      updateNav();
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
      pinRoots().forEach((rec) => {
        const pin = pinEls.get(rec.id); if (!pin) return;
        const { x, y } = pinPos(rec);
        const off = x < -40 || y < -40 || x > innerWidth + 40 || y > innerHeight + 40;
        pin.style.display = off ? 'none' : 'flex';
        pin.style.left = x + 'px'; pin.style.top = y + 'px';
      });
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
      if (t.closest('.rv-pin, .rv-pop, .rv-dock, .rv-toast')) return;
      e.preventDefault(); e.stopPropagation();
      openComposer(t, e.clientX, e.clientY, e.pageX, e.pageY);
    }, true);

    function openComposer(el, cx, cy, px, py) {
      closePop();
      const r = el.getBoundingClientRect();
      const anchor = {
        selector: cssPath(el),
        snippet: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        tag: el.tagName.toLowerCase(),
        xPct: r.width ? Math.round(((cx - r.left) / r.width) * 100) : 0,
        yPct: r.height ? Math.round(((cy - r.top) / r.height) * 100) : 0,
        pageX: Math.round(px), pageY: Math.round(py),
        docHeight: document.documentElement.scrollHeight, viewportW: innerWidth,
      };
      // temporary marker at the click point
      tempMarker = document.createElement('button');
      tempMarker.className = 'rv-pin active'; tempMarker.textContent = '+';
      tempMarker.style.left = cx + 'px'; tempMarker.style.top = cy + 'px';
      document.body.appendChild(tempMarker);

      const pop = document.createElement('div'); pop.className = 'rv-pop';
      pop.innerHTML =
        '<header><div><div class="t">Add a comment</div><div class="rv-snip"></div></div>' +
        '<button class="rv-x" aria-label="Close">×</button></header>' +
        '<div class="rv-body">' +
        '<textarea class="rv-text" placeholder="What should change here? (⌘/Ctrl+Enter to save)"></textarea>' +
        '<textarea class="rv-change" placeholder="Change it to… (the new content)" hidden></textarea>' +
        '<div class="rv-actions"><button class="rv-btn ghost rv-cancel">Cancel</button>' +
        '<button class="rv-btn primary rv-send">Send</button></div></div>';
      pop.querySelector('.rv-snip').textContent = anchor.snippet ? 'Selected - “' + anchor.snippet + '”' : 'Selected - ' + anchor.tag;
      document.body.appendChild(pop);
      placePop(pop, cx, cy);

      const textI = pop.querySelector('.rv-text'), changeI = pop.querySelector('.rv-change');
      const team = getSession().team; // session-global team, chosen at login
      // Content is the only team that suggests replacement copy -> reveal 2nd field.
      changeI.hidden = team !== 'Content';
      placePop(pop, cx, cy);
      textI.focus();

      const submit = () => send(pop, textI, changeI, anchor);
      pop.querySelector('.rv-x').addEventListener('click', closePop);
      pop.querySelector('.rv-cancel').addEventListener('click', closePop);
      pop.querySelector('.rv-send').addEventListener('click', submit);
      const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } };
      textI.addEventListener('keydown', onKey);
      changeI.addEventListener('keydown', onKey);
    }

    async function send(pop, textI, changeI, anchor) {
      const team = getSession().team; // session-global team from login
      const comment = textI.value.trim();
      const changeTo = changeI.value.trim();
      if (!comment) { textI.focus(); return; }
      if (team === 'Content' && !changeTo) { changeI.focus(); toast('Add the suggested content change.'); return; }
      const btn = pop.querySelector('.rv-send'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const rec = await store.add({
          team, comment, changeTo: team === 'Content' ? changeTo : '', anchor,
          sessionId: sessionId(),
          page: { path: pagePath(), url: location.href, title: document.title, slug: slugFromPath() },
        });
        comments.push(rec); renderPins(); closePop();
        toast(LOCAL ? '✅ Saved locally (demo mode)' : '✅ Comment sent');
      } catch (e) {
        if (e.message === 'unauthorized') { toast('Wrong passcode — reopen and try again.'); closePop(); return; }
        btn.disabled = false; btn.textContent = 'Send'; toast('Could not send — ' + e.message);
      }
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
        (thread.length > 1 ? ' comments' : ' comment') + '</div><div class="rv-snip"></div></div>' +
        '<button class="rv-x" aria-label="Close">×</button></header>' +
        '<div class="rv-read"><span class="rv-chip ' + (root.status || 'open') + '">' +
        (root.status === 'resolved' ? 'Resolved' : root.status === 'closed' ? 'Closed' : 'Unresolved') + '</span></div>' +
        '<div class="rv-thread"></div>' +
        '<div class="rv-reply">' +
        '<textarea class="rv-rtext" placeholder="Add another comment… (⌘/Ctrl+Enter)"></textarea>' +
        '<textarea class="rv-rchange" placeholder="Change it to… (the new content)" hidden></textarea>' +
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
      const rteam = getSession().team;
      const rchange = pop.querySelector('.rv-rchange');
      rchange.hidden = rteam !== 'Content'; // Content team reveals the "change to…" field
      placePop(pop, p.x, p.y);
      pop.querySelector('.rv-x').addEventListener('click', () => { closePop(); pinEls.forEach((el) => el.classList.remove('active')); });
      pop.querySelector('.rv-radd').addEventListener('click', () => addReply(pop, root));
      const onRKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addReply(pop, root); } };
      pop.querySelector('.rv-rtext').addEventListener('keydown', onRKey);
      pop.querySelector('.rv-rchange').addEventListener('keydown', onRKey);
    }

    async function addReply(pop, root) {
      const team = getSession().team; // session-global team from login
      const txt = pop.querySelector('.rv-rtext').value.trim();
      const changeTo = pop.querySelector('.rv-rchange').value.trim();
      if (!txt) { pop.querySelector('.rv-rtext').focus(); return; }
      if (team === 'Content' && !changeTo) { pop.querySelector('.rv-rchange').focus(); toast('Add the suggested content change.'); return; }
      const btn = pop.querySelector('.rv-radd'); btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const rec = await store.add({
          team, comment: txt, changeTo: team === 'Content' ? changeTo : '',
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

    // Authenticated session (Key present) -> reveal the Comment dock on every armed page,
    // and auto-enter review on a /<page>/review (AUTO) or Open-Pin (#c=) arrival.
    // Not yet authenticated -> keep the dock hidden; only the entry flows open the
    // Team + Key login so the reviewer can authenticate. A plain armed page shows nothing.
    if (isAuthed()) {
      revealDock();
      if (AUTO || /[#&]c=/.test(location.hash)) startReview();
    } else if (AUTO || /[#&]c=/.test(location.hash)) {
      showLogin();
    }
  })();
