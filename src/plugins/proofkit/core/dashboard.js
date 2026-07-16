  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, checkReviewPassword, pageName,
    ADMIN_TEAM, buildPanelLogin, buildDropdown, getSession, setSession, clearSession,
    initTheme, mountThemeToggle, ensureDemoReset, isTeamEnabled,
    COMMENT_TYPES, TYPE_FIELDS, REOPEN_REASONS, STATUS_COLORS, renderSummary,
    reopenReasonLabel, needsExpectedOutcome } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter); apply the
    // global choice and mount the admin toggle.
    initTheme(); mountThemeToggle();
    const LOCAL = !WORKER_URL;
    // Whether a team is active in this phase (config.js owns the list). Defensive: if the
    // export is missing/throws, fall back to "enabled" so navigation never hard-breaks.
    const teamEnabled = (t) => { try { return typeof isTeamEnabled === 'function' ? !!isTeamEnabled(t) : true; } catch { return true; } };

    async function apiFetch(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json' };
      const pass = getSession().key; // the one shared session key
      if (pass) headers['X-Review-Pass'] = pass;
      const res = await fetch(WORKER_URL + path, { ...opts, headers });
      if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }
    function localAll() {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rvc:')) { try { out.push(...JSON.parse(localStorage.getItem(k) || '[]')); } catch {} }
      }
      out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return out;
    }
    const NOTIF_KEY = 'rvc-notifications'; // local mirror of the Worker's notifications store
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'n_' + Date.now() + '_' + Math.random().toString(16).slice(2));

    // ---- Builder status state machine (mirror of the Worker's POST /team-status action) ----
    // Locate the root by id within its rvc:<path> bucket, apply the transition, stamp
    // history + iteration, and (on complete/reopen) drop a status notification to the
    // raising team (Content). Returns the mutated record. Contract transitions:
    //   start    : to_be_initiated -> in_progress
    //   complete : in_progress     -> deployed_live (terminal for that iteration)
    //   reopen   : in_progress|deployed_live -> reopened (requires a reason)
    const TEAM_NEXT = {
      start: { from: ['to_be_initiated'], to: 'in_progress' },
      complete: { from: ['in_progress'], to: 'deployed_live' },
      reopen: { from: ['in_progress', 'deployed_live'], to: 'reopened' },
    };
    function localTeamAction(rec, action, reason, note) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return { ...rec };
      const cur = r.teamStatus || 'to_be_initiated';
      const step = TEAM_NEXT[action];
      if (!step || step.from.indexOf(cur) === -1) return { ...r }; // invalid transition → no-op
      const now = new Date().toISOString();
      r.iteration = r.iteration || 1;
      r.teamStatus = step.to; r.teamStatusAt = now;
      if (!Array.isArray(r.history)) r.history = [];
      const h = { status: step.to, at: now, event: 'team-' + action, iteration: r.iteration };
      // v3 (Feature 3): reopen carries the enum reason + optional note; both land on the
      // record AND the history entry so the raiser sees the label + note in the timeline.
      if (action === 'reopen') {
        h.reason = reason || ''; if (note) h.note = note;
        r.reopenReason = reason || ''; r.reopenNote = note || '';
      }
      r.history.push(h);
      localStorage.setItem(key, JSON.stringify(arr));
      if (action === 'complete' || action === 'reopen') {
        const n = localStatusNotif(r, step.to, action === 'reopen' ? reason : '', action === 'reopen' ? note : '');
        if (n) { let ex = []; try { ex = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch {}
          ex.push(n); localStorage.setItem(NOTIF_KEY, JSON.stringify(ex)); }
      }
      return { ...r };
    }
    // A status notification to the RAISING team when Builder deploys live or reopens. The
    // reopen summary shows the human reason LABEL (mirrors the Worker's statusSummary).
    function localStatusNotif(r, next, reason, note) {
      const where = (r.page && r.page.title) || (r.page && r.page.path) || 'a page';
      const tick = r.ticket ? '#' + r.ticket + ' ' : '';
      const reasonLabel = reason ? (reopenReasonLabel(reason) || reason) : '';
      const summary = next === 'reopened'
        ? 'Builder reopened ' + tick + 'on ' + where + (reasonLabel ? ': ' + reasonLabel : '') + '.'
        : tick + 'on ' + where + ' was deployed live.';
      return {
        id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        team: r.team || '', kind: 'status', chainId: r.parentId || r.id, commentId: r.id,
        ticket: r.ticket || '', teamStatus: next, iteration: r.iteration || 1,
        reason: reason || '', reasonLabel, note: note || '',
        fromTeam: r.toTeam || '', path: (r.page && r.page.path) || '/', pageName: where,
        summary, readTeam: false, readAdmin: false,
      };
    }
    function localNotifs() {
      let arr = []; try { arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch {}
      arr.sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
      return arr;
    }
    function localMarkRead(ids, read = true) {
      let arr = []; try { arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return { ok: true, updated: 0 }; }
      let updated = 0;
      for (const n of arr) { if (ids.includes(n.id) && n.readAdmin !== read) { n.readAdmin = read; updated++; } }
      if (updated) localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
      return { ok: true, updated };
    }
    function localDelete(rec) {
      const key = 'rvc:' + rec.page.path;
      let arr = JSON.parse(localStorage.getItem(key) || '[]');
      // remove the whole chain: the record, its replies, and its resubmit sub-tickets
      const rootId = rec.parentId || rec.id;
      arr = arr.filter((r) => r.id !== rootId && r.parentId !== rootId);
      localStorage.setItem(key, JSON.stringify(arr));
    }
    // Re-route: set the raising team (From) and/or directed team (To) on a record.
    function localSetTeams(rec, team, toTeam) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return { ...rec, team, toTeam };
      if (team !== undefined) r.team = team;
      if (toTeam !== undefined) r.toTeam = toTeam;
      localStorage.setItem(key, JSON.stringify(arr));
      return { ...r };
    }
    // ---- LOCAL Quick-questions reply (Feature 6; mirror of POST /comments with a parentId) ----
    // A reply chains to the origin root, is iteration 1, and NEVER changes status/iteration.
    // It fires a kind:'reply' notification to the OTHER side: Builder replying pings the raiser
    // (root.team); a raiser's reply pings the receiver (root.toTeam). Contract §4.
    function localReply(root, text) {
      const key = 'rvc:' + root.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const rootId = root.parentId || root.id;
      const now = new Date().toISOString();
      const me = getSession().team || ADMIN_TEAM;
      const reply = {
        id: uid(), parentId: rootId, iteration: 1, createdAt: now,
        team: me, toTeam: root.toTeam || '', name: me,
        comment: String(text || '').slice(0, 4000), changeTo: '',
        commentType: 'general', templateFields: {}, summary: '', expectedOutcome: '', imageId: '',
        aiPrompt: '', page: root.page, anchor: root.anchor || {},
        teamStatus: root.teamStatus || 'to_be_initiated', teamStatusAt: '',
        reopenReason: '', reopenNote: '', history: [],
      };
      arr.push(reply);
      localStorage.setItem(key, JSON.stringify(arr));
      const target = (me === (root.team || '')) ? (root.toTeam || '') : (root.team || '');
      if (target) {
        const where = (root.page && root.page.title) || (root.page && root.page.path) || 'a page';
        const notif = {
          id: uid(), createdAt: now, updatedAt: now, team: target, kind: 'reply',
          chainId: rootId, commentId: reply.id, ticket: root.ticket || '', fromTeam: me,
          path: (root.page && root.page.path) || '/', pageName: where,
          summary: me + ' replied' + (root.ticket ? ' on #' + root.ticket : '') + ': “' + reply.comment.slice(0, 80) + '”',
          readTeam: false, readAdmin: false,
        };
        let ex = []; try { ex = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch {}
        ex.push(notif); localStorage.setItem(NOTIF_KEY, JSON.stringify(ex));
      }
      return { ...reply };
    }

    // ---- LOCAL saved "team views" (Feature 11) — admin's shared quick-select filter sets.
    // Stored under one 'rvc-views' map keyed by scope (mirrors the Worker's views:<scope>
    // KV key); admin uses the '__admin' scope. POST replaces the whole set.
    const VIEWS_KEY = 'rvc-views';
    const VIEWS_SCOPE = '__admin';
    function localGetViews() {
      let map = {}; try { map = JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}'); } catch {}
      const v = map && map[VIEWS_SCOPE]; return Array.isArray(v) ? v : [];
    }
    function localSaveViews(views) {
      let map = {}; try { map = JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}'); } catch {}
      if (!map || typeof map !== 'object') map = {};
      map[VIEWS_SCOPE] = Array.isArray(views) ? views : [];
      try { localStorage.setItem(VIEWS_KEY, JSON.stringify(map)); } catch {}
      return { ok: true, views: map[VIEWS_SCOPE] };
    }

    // ---- LOCAL screenshot fetch (Feature 4) — dataURL by id from rvc-img:<id>. ----
    function localImage(id) {
      try { return { dataUrl: localStorage.getItem('rvc-img:' + id) || '' }; }
      catch { return { dataUrl: '' }; }
    }

    // ---- LOCAL metrics (Feature 12) — compute the SAME five aggregates the Worker's
    // GET /metrics returns, client-side, from every local record's history[]. Mirrors the
    // Worker's metricsEvents fallback + computeMetrics so demo mode shows real Insights.
    function localMetricsEvents() {
      const out = [];
      for (const r of localAll()) {
        if (r.parentId && !r.ticket) continue;   // a reply — not a ticket
        const hist = Array.isArray(r.history) ? r.history : [];
        const page = (r.page && r.page.path) || '/';
        const ct = r.commentType || 'general';
        for (const h of hist) out.push({ at: h.at || r.createdAt, event: h.event || '', page, commentType: ct, iteration: h.iteration || r.iteration || 1 });
      }
      out.sort((a, b) => (a.at < b.at ? -1 : 1));
      return out;
    }
    function localMetrics(from, to) { return computeMetrics(localMetricsEvents(), from, to); }

    // No-Worker gate: check the session password against the configured review password.
    const localGuard = async () => {
      if (!(await checkReviewPassword(getSession().key || ''))) throw new Error('unauthorized');
    };
    const store = LOCAL
      ? {
          all: async () => { await localGuard(); return localAll(); },
          // Builder drives the status machine: start | complete | reopen(reason, note).
          teamAction: async (rec, action, reason, note) => { await localGuard(); return localTeamAction(rec, action, reason, note); },
          notifications: async () => { await localGuard(); return localNotifs(); },
          markRead: async (ids, read = true) => { await localGuard(); return localMarkRead(ids, read); },
          del: async (rec) => { await localGuard(); localDelete(rec); return { ok: true }; },
          setTeams: async (rec, team, toTeam) => { await localGuard(); return localSetTeams(rec, team, toTeam); },
          // Quick-questions reply (Feature 6) — no ticket, no status change.
          reply: async (root, text) => { await localGuard(); return localReply(root, text); },
          // Screenshot dataURL by id (Feature 4).
          image: async (id) => { await localGuard(); return localImage(id); },
          // Saved "team views" (Feature 11), admin-scoped.
          getViews: async () => { await localGuard(); return localGetViews(); },
          saveViews: async (views) => { await localGuard(); return localSaveViews(views); },
          // Insights aggregates (Feature 12) — computed client-side from local records.
          metrics: async (from, to) => { await localGuard(); return localMetrics(from, to); },
        }
      : {
          all: () => apiFetch('/comments'),
          // Contract body: { id, action:'start'|'complete'|'reopen', reason?, note? }. No `path`.
          teamAction: (rec, action, reason, note) => apiFetch('/team-status', { method: 'POST', body: JSON.stringify({ id: rec.id, action, reason, note }) }),
          notifications: () => apiFetch('/notifications'),
          markRead: (ids, read = true) => apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids, read }) }),
          del: (rec) => apiFetch('/delete', { method: 'POST', body: JSON.stringify({ id: rec.parentId || rec.id, path: rec.page.path }) }),
          setTeams: (rec, team, toTeam) => apiFetch('/teams', { method: 'POST', body: JSON.stringify({ id: rec.id, path: rec.page.path, team, toTeam }) }),
          // A reply is POST /comments with a parentId — the Worker skips the ticket/arrival
          // notif and fires a kind:'reply' notification to the other side (contract §4).
          reply: (root, text) => apiFetch('/comments', { method: 'POST', body: JSON.stringify({
            parentId: root.parentId || root.id, comment: text, team: getSession().team || ADMIN_TEAM,
            toTeam: root.toTeam || '', page: root.page, anchor: root.anchor || {},
          }) }),
          // Screenshot dataURL by id (Feature 4).
          image: (id) => apiFetch('/image?id=' + encodeURIComponent(id)),
          // Saved views (Feature 11) — GET returns the caller's set, POST replaces it.
          getViews: () => apiFetch('/views'),
          saveViews: (views) => apiFetch('/views', { method: 'POST', body: JSON.stringify({ views }) }),
          // Insights aggregates (Feature 12, admin) — GET /metrics?from&to.
          metrics: (from, to) => apiFetch('/metrics?from=' + encodeURIComponent(from || '') + '&to=' + encodeURIComponent(to || '')),
        };

    let login = null, refreshTimer = null, viewsLoaded = false;

    async function loadData() {
      all = await store.all();
      try { notifs = await store.notifications(); } catch (e) { notifs = notifs || []; }
      // Feature 11: pull the admin's saved "Team views" ONCE (not on every 5s poll).
      if (!viewsLoaded) { viewsLoaded = true; loadViews().then(() => { if (view === 'dash') renderViewChips(); }); }
      // Polling runs every ~5s; skip the whole re-render when the data is byte-identical to
      // what's already on screen — stops the entry animation replaying (and the DOM churn /
      // scroll jump) on every idle poll. Only repaint when something actually changed.
      const sig = dataSig();
      if (seenMarked && sig === lastSig) return;
      lastSig = sig;
      counts(); render();
      if (!seenMarked) { seenMarked = true; try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (e) {} }
    }

    // Poll on the shared ~5s debounced cadence (the Worker coalesces server-side).
    function startAutoRefresh() {
      if (refreshTimer) return;
      refreshTimer = setInterval(() => { if (!document.hidden) loadData().catch(() => {}); }, 5000);
      window.addEventListener('focus', () => loadData().catch(() => {}));
    }

    function showLogin() {
      if (!login) {
        login = buildPanelLogin({ title: 'Panel Login', sub: 'Enter your key to continue.' });
        const go = () => tryLogin();
        login.button.addEventListener('click', go);
        login.keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      login.setError(''); login.keyInput.value = '';
      let prefill = '';
      try { if ((new URLSearchParams(location.search).get('login') || '').toLowerCase() === ADMIN_TEAM.toLowerCase()) prefill = ADMIN_TEAM; } catch {}
      login.setTeam(prefill);
      document.body.appendChild(login.el);
      if (prefill) login.keyInput.focus(); else login.focusTeam();
    }
    function hideLogin() { login && login.el.remove(); }

    // Reveal the gated-off stub and hide the app shell (init calls this when a
    // signed-in identity is parked off via TEAM_ENABLED). CSS keys `display` off
    // `:not([hidden])`, so toggling `hidden` is all that's needed.
    function showBlocked() {
      const b = $('#rvd-blocked'); const app = $('.rvd-app');
      if (b) b.hidden = false;
      if (app) app.hidden = true;
    }

    async function tryLogin() {
      const team = login.getTeam();
      const key = login.keyInput.value.trim();
      if (!team) { login.focusTeam(); login.setError('Please choose your team.'); return; }
      if (!key) { login.keyInput.focus(); return; }
      setSession(team, key);
      login.setBusy(true, 'Authenticating'); login.setError('');
      if (team !== ADMIN_TEAM) { location.replace('/teamdash'); return; }
      try { await loadData(); hideLogin(); startAutoRefresh(); }
      catch (e) {
        clearSession();
        login.setBusy(false, 'Authenticate');
        login.setError(e.message === 'unauthorized' ? 'Incorrect key. Please try again.' : ('Could not connect — ' + e.message));
        login.keyInput.focus(); login.keyInput.select();
      }
    }

    function init() {
      if (LOCAL) ensureDemoReset();
      buildQueueTabs();   // rebuild the tab bar for the Phase-1 Team Queue
      relabelNav();       // "Team Queue" + retire the Delivery nav
      const s = getSession();
      if (s.key && s.team && s.team !== ADMIN_TEAM) { location.replace('/teamdash'); return; }
      // Defence-in-depth: a signed-in identity parked off via TEAM_ENABLED gets the
      // "no access" stub, not the app. Builder/ADMIN_TEAM is always enabled, so this
      // is belt-and-braces rather than a path hit in normal operation.
      if (s.key && s.team && !isTeamEnabled(s.team)) { showBlocked(); return; }
      if (s.key && s.team === ADMIN_TEAM) {
        loadData().then(startAutoRefresh).catch((e) => {
          if (e.message === 'unauthorized') { clearSession(); showLogin(); }
          else { $('#rvd-empty').hidden = false; $('#rvd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else showLogin();
    }

    // Rebuild the Team Queue tab bar (the shell markup carries the retired lifecycle tabs).
    function buildQueueTabs() {
      const el = $('#rvd-tabs'); if (!el) return;
      el.innerHTML =
        `<button class="rvd-tab is-active" data-tab="all">All</button>` +
        `<button class="rvd-tab" data-tab="page">By Page</button>`;
      tab = 'all';
    }
    // Relabel Overview→Team Queue and retire the Delivery (deploy-gate) nav item.
    function relabelNav() {
      const nav = (v) => document.querySelector('.rvd-nav[data-view="' + v + '"]');
      const dash = nav('dash'); if (dash) dash.textContent = 'Team Queue';
      const dep = nav('deploy'); if (dep) dep.hidden = true;
    }

    const $ = (s) => document.querySelector(s);
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
    const mix = (a, b, t) => {
      const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
      const ch = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
      return '#' + ch(ar, br) + ch(ag, bg) + ch(ab, bb);
    };
    const isLight = () => document.documentElement.getAttribute('data-pk-theme') === 'light';
    const tokenHex = (name, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; } catch { return fb; } };
    const teamStyle = (team) => {
      const tc = TEAM_COLORS[team] || ['#e8e8e8', '#888'];
      const white = tokenHex('--pk-on-accent', '#ffffff');
      if (isLight()) return { bg: tc[0], fg: tc[1], bd: mix(tc[1], white, 0.62) };
      const canvas = tokenHex('--pk-canvas', '#181818');
      const accent = tc[1];
      return { bg: mix(accent, canvas, 0.82), fg: mix(accent, white, 0.55), bd: mix(accent, canvas, 0.5) };
    };
    const teamChip = (team) => {
      if (!team) return '';
      const s = teamStyle(team);
      return `<span class="rvd-team-chip" style="background:${s.bg};color:${s.fg};border:1px solid ${s.bd}">${esc(team)}</span>`;
    };
    const routeChips = (c) => {
      const from = teamChip(c.team);
      if (!c.toTeam) return from;
      return `${from || '<span class="rvd-team-chip rvd-team-none">—</span>'}` +
        `<span class="rvd-route-arrow" aria-label="directed to">→</span>${teamChip(c.toTeam)}`;
    };

    // ---- change-type vocab (Feature 1) — shared from config; `general` = no typed fields ----
    const typeMeta = (t) => COMMENT_TYPES.find((x) => x.value === t) || null;
    const typeLabel = (c) => { const m = typeMeta(c && c.commentType); return (m && c.commentType !== 'general') ? m.label : ''; };
    const fieldsFor = (t) => (TYPE_FIELDS[t] || []);
    // One-line card preview: the server-rendered summary, else derived locally (§3).
    const summaryOf = (c) => c.summary || renderSummary(c.commentType || 'general', c.templateFields || {}, c.comment || '');
    // The reopen reason LABEL (enum → human), falling back to any legacy free-text reason.
    const reopenLabelOf = (c) => reopenReasonLabel(c && c.reopenReason) || (c && c.reopenReason) || '';
    // Typed template-field rows for the detail (labelled rows, NEVER raw JSON; §3).
    function typedFieldRows(c) {
      const t = c.commentType || 'general';
      if (t === 'general') return '';
      const tf = c.templateFields || {};
      return fieldsFor(t).map((f) => {
        const v = tf[f.key];
        if (v == null || String(v).trim() === '') return '';
        return `<div class="rvd-field"><div class="rvd-field-k">${esc(f.label)}</div><div class="rvd-field-v">${esc(v)}</div></div>`;
      }).join('');
    }

    // ---- screenshot thumbnails (Feature 4) — thin-infra: fetch the dataURL by id and fill
    // the placeholder in place. ANY miss/failure ⇒ a "preview unavailable" tile (a screenshot
    // never blocks anything). data-hydrated stops a poll re-render from re-fetching. ----
    async function loadImage(imageId) {
      if (!imageId) return '';
      try { const j = await store.image(imageId); return (j && j.dataUrl) || ''; } catch { return ''; }
    }
    async function hydrateThumbs(root) {
      if (!root) return;
      const els = root.querySelectorAll('[data-imgid]:not([data-hydrated])');
      for (const el of els) {
        el.dataset.hydrated = '1';
        const url = await loadImage(el.dataset.imgid);
        if (url) el.innerHTML = `<img src="${esc(url)}" alt="Element preview" loading="lazy">`;
        else { el.classList.add('is-empty'); el.innerHTML = `<span class="rvd-thumb-ph">preview unavailable</span>`; }
      }
    }
    const thumbTile = (imageId, big) => imageId
      ? `<span class="rvd-thumb${big ? ' rvd-thumb-lg' : ''}" data-imgid="${esc(imageId)}"><span class="rvd-thumb-ph">preview…</span></span>`
      : '';

    // ---- real-time status (Builder framing) ----
    const TEAM_STATUS = {
      to_be_initiated: ['tbi', 'TBI'],
      in_progress: ['inprog', 'In Progress'],
      deployed_live: ['deployed', 'Deployed live'],
      reopened: ['reopened', 'Reopened'],
    };
    const teamStatusOf = (c) => (TEAM_STATUS[c && c.teamStatus] ? c.teamStatus : 'to_be_initiated');
    const statusLabel = (c) => TEAM_STATUS[teamStatusOf(c)][1];
    const displayState = (c) => TEAM_STATUS[teamStatusOf(c)][0];
    const statusChip = (c) => { const [cls, label] = TEAM_STATUS[teamStatusOf(c)]; return `<span class="rvd-chip ${cls}">${label}</span>`; };
    // Builder's Team Queue = every ticket currently directed at Builder in a non-terminal
    // iteration state (to_be_initiated | in_progress). deployed_live is terminal; reopened
    // has bounced back to the raiser (Content).
    const inQueue = (c) => { const s = teamStatusOf(c); return s === 'to_be_initiated' || s === 'in_progress'; };

    // ---- ticket-chain (iteration) model ----
    // A resubmit sub-ticket AND a comment reply both carry parentId → the origin root id;
    // they are told apart by iteration (reply = iteration 1; sub-ticket = iteration ≥ 2).
    // The LIVE record of a chain is the highest-iteration member (its teamStatus is "now").
    const isReply = (c) => !!c.parentId && (c.iteration || 1) < 2;
    const chainOf = (c) => c.parentId || c.id;

    let all = [], notifs = [], tab = 'all', teamFilter = '', entryDetail = null, view = 'dash', search = '', sort = 'new';
    // Feature 11 (Team views) + Feature 12 (Insights) state.
    let savedViews = [], activeViewName = '';
    let metricsData = null, metricsFrom = '', metricsTo = '';
    const sel = new Set();
    let selectMode = false;
    let lastSig = '';   // signature of the last-rendered data — lets polling skip no-op re-renders
    const dataSig = () => JSON.stringify([all, notifs]);

    // ---- unread: chains touched since the last dashboard visit ----
    const SEEN_KEY = 'reviewLastSeen';
    const seenAt = localStorage.getItem(SEEN_KEY) || '';
    let seenMarked = false;
    const isNew = (c) => !!seenAt && (c.teamStatusAt || c.createdAt) > seenAt;

    // ---- search / sort ----
    function matchesSearch(c) {
      if (!search) return true;
      const a = c.anchor || {};
      const tf = c.templateFields || {};
      return [c.comment, c.changeTo, c.summary, c.expectedOutcome, c.page && c.page.path, c.name, c.team, c.toTeam,
        c.reopenReason, reopenLabelOf(c), c.reopenNote, a.snippet, a.tag, ...Object.values(tf)]
        .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
    }
    function sortRoots(rs) {
      const s = rs.slice();
      if (sort === 'old') s.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      else if (sort === 'page') s.sort((a, b) => a.page.path.localeCompare(b.page.path) || (a.createdAt < b.createdAt ? 1 : -1));
      else s.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return s;
    }
    // Team Queue roots for the current view (tab + team + search + sort).
    function currentRoots() {
      let rs = roots().filter(inQueue);
      if (teamFilter) rs = rs.filter((c) => c.team === teamFilter);
      return sortRoots(rs.filter(matchesSearch));
    }

    // ---- AI prompt text ----
    function localPrompt(c) {
      if (c.aiPrompt) return c.aiPrompt;
      const a = c.anchor || {};
      const where = a.snippet ? `the “${a.snippet}” ${a.tag || 'element'}` : (a.tag || 'the element');
      let s = `On page ${c.page.path}, in ${where}: ${c.comment}`;
      if (c.changeTo) s += `\nChange the content to exactly (preserve casing/punctuation): “${c.changeTo}”`;
      return s;
    }
    const promptsText = (list) => list.map((c) => '- ' + localPrompt(c).replace(/\n/g, '\n  ')).join('\n');
    async function copyToClip(text, btn, okLabel) {
      try {
        await navigator.clipboard.writeText(text);
        if (btn) { const t = btn.textContent; btn.textContent = okLabel || 'Copied ✓'; setTimeout(() => { btn.textContent = t; }, 1400); }
      } catch (e) { alert('Copy failed — ' + e.message); }
    }
    function mdExport(list) {
      const lines = ['# Content review — ' + list.length + ' change' + (list.length === 1 ? '' : 's'), ''];
      list.forEach((c) => {
        const a = c.anchor || {};
        lines.push(`- **${c.page.path}** — ${c.team || '—'} → ${c.toTeam || '—'} · ${statusLabel(c)}`);
        lines.push(`  - ${c.comment}${a.snippet ? ` _(on “${a.snippet}”)_` : ''}`);
        if (c.changeTo) lines.push(`  - Change to: “${c.changeTo}”`);
      });
      return lines.join('\n');
    }
    function downloadJSON() {
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a'); aEl.href = url; aEl.download = 'proofkit-comments.json';
      document.body.appendChild(aEl); aEl.click(); aEl.remove(); URL.revokeObjectURL(url);
    }

    function buildTeamChips() {
      const one = (label, team) => {
        const active = teamFilter === team;
        let style;
        if (active && team) { const accent = (TEAM_COLORS[team] || [])[1] || 'var(--pk-red)'; style = `background:${accent};color:var(--pk-on-accent);border-color:${accent}`; }
        else if (active) style = 'background:var(--pk-red);color:var(--pk-on-accent);border-color:var(--pk-red)';
        else if (team) { const s = teamStyle(team); style = `background:${s.bg};color:${s.fg};border-color:${s.bd}`; }
        else style = 'background:var(--pk-elev);color:var(--pk-body);border-color:var(--pk-hair)';
        return `<button class="rvd-tchip${active ? ' is-active' : ''}" data-team="${esc(team)}" style="${style}">${esc(label)}</button>`;
      };
      const host = $('#rvd-teamchips'); if (!host) return;
      host.innerHTML = '<span class="rvd-chips-from">From</span>' + one('All Teams', '') + TEAMS.map((t) => one(t, t)).join('');
      host.querySelectorAll('.rvd-tchip').forEach((b) => {
        b.addEventListener('click', () => { teamFilter = b.dataset.team; buildTeamChips(); render(); });
      });
    }

    document.addEventListener('pk:themechange', () => {
      try { buildTeamChips(); if (typeof counts === 'function') counts(); render(); } catch (e) {}
    });

    // ---- ticket-chain helpers (the LIVE record per family + timeline) ----
    function families() {
      const byChain = new Map();
      for (const c of all) {
        if (isReply(c)) continue;
        const cid = chainOf(c);
        const prev = byChain.get(cid);
        if (!prev || (c.iteration || 1) > (prev.iteration || 1)) byChain.set(cid, c);
      }
      return [...byChain.values()];
    }
    const roots = () => families();
    const repliesOf = (rec) => all.filter((c) => isReply(c) && chainOf(c) === chainOf(rec)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    function chainMembers(rec) {
      const cid = chainOf(rec);
      return all.filter((c) => !isReply(c) && chainOf(c) === cid)
        .sort((a, b) => (a.iteration || 1) - (b.iteration || 1) || (a.createdAt < b.createdAt ? -1 : 1));
    }
    function chainHistory(rec) {
      const evs = [];
      for (const m of chainMembers(rec)) {
        (Array.isArray(m.history) ? m.history : []).forEach((h) => evs.push({ ...h, iteration: h.iteration || m.iteration || 1 }));
      }
      if (!evs.length) evs.push({ at: rec.createdAt, event: 'created', iteration: rec.iteration || 1 });
      return evs.sort((a, b) => (a.at < b.at ? -1 : 1));
    }
    function eventLabel(h) {
      const e = h.event || '', st = h.status || '';
      if (e === 'created') return 'Raised (TBI)';
      if (e === 'resubmitted' || e === 'resubmit') return 'Resubmitted (TBI)';
      if (e === 'team-start' || e === 'start' || st === 'in_progress') return 'Started — in progress';
      if (e === 'team-complete' || e === 'complete' || st === 'deployed_live') return 'Deployed live';
      if (e === 'team-reopen' || e === 'reopen' || st === 'reopened') {
        const label = reopenReasonLabel(h.reason) || h.reason || '';
        return 'Reopened' + (label ? ' — ' + label : '') + (h.note ? ' (' + h.note + ')' : '');
      }
      return 'Status → ' + (st || '');
    }

    // A status token dot (STATUS_COLORS: teamStatus → --pk-* token) leading a count tile.
    const statusDot = (s) => `<span class="rvd-count-dot" style="background:var(${STATUS_COLORS[s] || '--pk-muted'})"></span>`;
    function counts() {
      const rs = roots();
      const tbi = rs.filter((c) => teamStatusOf(c) === 'to_be_initiated').length;
      const prog = rs.filter((c) => teamStatusOf(c) === 'in_progress').length;
      const live = rs.filter((c) => teamStatusOf(c) === 'deployed_live').length;
      const reop = rs.filter((c) => teamStatusOf(c) === 'reopened').length;
      $('#rvd-counts').innerHTML =
        `<span class="rvd-count"><b>${tbi}</b>${statusDot('to_be_initiated')} TBI</span>` +
        `<span class="rvd-count"><b>${prog}</b>${statusDot('in_progress')} In Progress</span>` +
        `<span class="rvd-count"><b>${live}</b>${statusDot('deployed_live')} Deployed live</span>` +
        `<span class="rvd-count"><b>${reop}</b>${statusDot('reopened')} Reopened</span>`;
      updateBadges();
    }
    function updateBadges() {
      const unread = (notifs || []).filter((n) => n.readAdmin === false).length;
      const nd = $('#rvd-badge-notifs'); if (nd) { nd.textContent = unread; nd.hidden = !unread; }
    }

    function routeRow(root) {
      const chip = (t) => t ? teamChip(t) : `<span class="rvd-team-chip rvd-team-none">—</span>`;
      return `<div class="rvd-route">` + chip(root.team) +
        `<span class="rvd-route-arrow" aria-hidden="true">→</span>` + chip(root.toTeam) + `</div>`;
    }

    function card(root) {
      const a = root.anchor || {};
      const id = esc(root.id);
      const iter = root.iteration || 1;
      const replies = repliesOf(root);
      const repliesToggle = replies.length
        ? `<button class="rvd-repliestoggle" type="button" data-replies="${id}">` +
            `<span class="rvd-caret">▸</span>${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}</button>`
        : '';
      const repliesBlock = replies.length
        ? `<div class="rvd-replies" data-replies-for="${id}" hidden>` + replies.map((r) =>
            `<div class="rvd-reply">${teamChip(r.team)}<div class="rvd-rtxt">${esc(r.comment)}</div>` +
            (r.changeTo ? `<div class="rvd-change"><span>Change to</span><div>${esc(r.changeTo)}</div></div>` : '') +
            `<div class="rvd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div>`
        : '';
      const selected = sel.has(root.id);
      const tl = typeLabel(root);          // '' for general (zero regression)
      const sum = summaryOf(root);         // one-line typed preview
      const isReopened = teamStatusOf(root) === 'reopened';
      const reopLabel = reopenLabelOf(root);
      return (
        `<article class="rvd-item${selectMode && selected ? ' is-selected' : ''}" data-state="${displayState(root)}">` +
          `<div class="rvd-card-top">` +
            (selectMode ? `<input type="checkbox" class="rvd-sel" data-id="${id}"${selected ? ' checked' : ''} aria-label="Select">` : '') +
            (isNew(root) ? `<span class="rvd-chip rvd-new">New</span>` : '') +
            statusChip(root) +
            (tl ? `<span class="rvd-typechip">${esc(tl)}</span>` : '') +
            (isReopened ? `<span class="rvd-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` : '') +
            (iter > 1 ? `<span class="rvd-iter">Iter ${iter}</span>` : '') +
            `<span class="rvd-loc">` +
              `<a class="rvd-slug" href="${esc(root.page.path)}" target="_blank" rel="noopener">${esc(pageName(root.page.path))}</a>` +
              `<span class="rvd-time">${esc(fmt(root.createdAt))}</span>` +
            `</span>` +
          `</div>` +
          `<div class="rvd-card-body">` +
            // Feature 1: the one-line summary is the card preview; the freeform comment sits
            // below it (clamped). For `general` the summary == the comment, so it is skipped.
            (tl && sum && sum !== root.comment ? `<div class="rvd-summary">${esc(sum)}</div>` : '') +
            `<div class="rvd-comment-text rvd-clamp">${esc(root.comment)}</div>` +
            `<button class="rvd-morebtn" type="button" hidden>Show more</button>` +
            (a.snippet ? `<div class="rvd-snip">on “${esc(a.snippet)}”</div>` : '') +
            (root.imageId ? `<div class="rvd-media">${thumbTile(root.imageId, false)}</div>` : '') +
          `</div>` +
          routeRow(root) +
          (root.changeTo ? `<div class="rvd-change"><span>Change to</span><div>${esc(root.changeTo)}</div></div>` : '') +
          `<div class="rvd-card-foot">` +
            `<div class="rvd-foot-left">${repliesToggle}</div>` +
            `<div class="rvd-acts">` +
              `<a class="rvd-openpin" href="${esc(root.page.path)}?review=1#c=${id}" target="_blank" rel="noopener">Open Pin</a>` +
              `<button class="rvd-a rvd-copyone" data-copy="${id}">Copy prompt</button>` +
              lifecycleActions(root) +
              `<button class="rvd-del delete" data-id="${id}">Delete</button>` +
            `</div>` +
          `</div>` +
          repliesBlock +
        `</article>`
      );
    }

    function revealClamps(host) {
      host.querySelectorAll('.rvd-comment-text.rvd-clamp').forEach((el) => {
        const btn = el.parentElement.querySelector('.rvd-morebtn');
        if (btn) btn.hidden = el.scrollHeight <= el.clientHeight + 2;
      });
    }

    // Status actions per state: TBI→Start · In Progress→Mark Complete + Reopen ·
    // Deployed live→Reopen. Reopen prompts for a required reason.
    function lifecycleActions(root) {
      const id = esc(root.id);
      const s = teamStatusOf(root);
      if (s === 'to_be_initiated') return `<button class="rvd-a" data-action="start" data-id="${id}">Start</button>`;
      if (s === 'in_progress') return `<button class="rvd-a" data-action="complete" data-id="${id}">Mark Complete</button>` +
        `<button class="rvd-a" data-action="reopen" data-id="${id}">Reopen</button>`;
      if (s === 'deployed_live') return `<button class="rvd-a" data-action="reopen" data-id="${id}">Reopen</button>`;
      return ''; // reopened → with the raiser (Content)
    }

    // ---- reopen modal (Feature 3) — reason dropdown (the 4 REOPEN_REASONS labels) + a note
    // field shown ALWAYS but REQUIRED only when the reason is "Other" (client-enforced; the
    // Worker enforces it too). Replaces the old freeform prompt. `onConfirm({reason, note})`
    // fires once validated; `sub` optionally captions how many tickets it applies to. ----
    function openReopenModal(onConfirm, sub) {
      const el = document.createElement('div'); el.className = 'pk-reopen';
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Reopen ticket">` +
          `<h2 class="pk-reopen-title">Reopen</h2>` +
          `<p class="pk-reopen-sub">${esc(sub || 'Bounce this back to the raising team with a reason.')}</p>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">Reason</span><div class="rvd-reopen-reason"></div></div>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">Note<span class="rvd-reopen-req" hidden> · required</span></span>` +
            `<textarea class="pk-reopen-note" placeholder="Add context for the raising team (required for “Other”)"></textarea></div>` +
          `<div class="pk-reopen-err" hidden></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="rvd-editbtn rvd-reopen-cancel">Cancel</button>` +
            `<button type="button" class="rvd-editbtn rvd-editsave rvd-reopen-go">Reopen</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      let reason = '';
      const req = el.querySelector('.rvd-reopen-req');
      const err = el.querySelector('.pk-reopen-err');
      const note = el.querySelector('.pk-reopen-note');
      const syncReq = () => { req.hidden = reason !== 'other'; };
      const reasonDD = buildDropdown({
        block: true, placeholder: 'Select a reason',
        items: REOPEN_REASONS.map((r) => ({ value: r.value, label: r.label })),
        onSelect: (v) => { reason = v; syncReq(); err.hidden = true; },
      });
      el.querySelector('.rvd-reopen-reason').appendChild(reasonDD.el);
      const close = () => el.remove();
      el.querySelector('.rvd-reopen-cancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      el.querySelector('.rvd-reopen-go').addEventListener('click', () => {
        const n = note.value.trim();
        if (!reason) { err.textContent = 'Please choose a reason.'; err.hidden = false; return; }
        if (reason === 'other' && !n) { err.textContent = 'A note is required when the reason is “Other”.'; err.hidden = false; return; }
        close();
        onConfirm({ reason, note: n });
      });
      reasonDD.focus();
    }

    // ---- status actions ----
    async function doTeamAction(rec, action) {
      if (action === 'reopen') {
        openReopenModal(async ({ reason, note }) => {
          try { Object.assign(rec, await store.teamAction(rec, 'reopen', reason, note)); counts(); render(); lastSig = dataSig(); }
          catch (e) { alert('Could not update — ' + e.message); }
        });
        return;
      }
      try { Object.assign(rec, await store.teamAction(rec, action)); counts(); render(); lastSig = dataSig(); }
      catch (e) { alert('Could not update — ' + e.message); }
    }
    async function rowDelete(root) {
      if (!confirm('Delete this whole ticket chain (all iterations + replies)? This cannot be undone.')) return;
      try {
        await store.del(root);
        const rootId = root.parentId || root.id;
        all = all.filter((c) => c.id !== rootId && c.parentId !== rootId);
        counts(); render(); lastSig = dataSig();
      } catch (e) { alert('Could not delete — ' + e.message); }
    }
    function rowMenuItems(root) {
      const s = teamStatusOf(root);
      const items = [
        { label: 'View details', onSelect: () => { entryDetail = root.id; render(); } },
        { label: 'Open pin', onSelect: () => window.open(root.page.path + '?review=1#c=' + encodeURIComponent(root.id), '_blank', 'noopener') },
        { label: 'Edit teams (From / To)', onSelect: () => openEditTeams(root) },
      ];
      if (s === 'to_be_initiated') items.push({ label: 'Start', onSelect: () => doTeamAction(root, 'start') });
      if (s === 'in_progress') items.push({ label: 'Mark complete', onSelect: () => doTeamAction(root, 'complete') });
      if (s === 'in_progress' || s === 'deployed_live') items.push({ label: 'Reopen', onSelect: () => doTeamAction(root, 'reopen') });
      items.push({ label: 'Copy prompt', onSelect: () => copyToClip(localPrompt(root), null) });
      items.push({ label: 'Delete', danger: true, onSelect: () => rowDelete(root) });
      return items;
    }
    let rowMenuEl = null;
    function closeRowMenu() {
      if (!rowMenuEl) return;
      rowMenuEl.remove(); rowMenuEl = null;
      document.removeEventListener('click', onRowMenuDoc, true);
      document.removeEventListener('keydown', onRowMenuKey, true);
      window.removeEventListener('scroll', closeRowMenu, true);
      window.removeEventListener('resize', closeRowMenu);
    }
    function onRowMenuDoc(e) { if (rowMenuEl && !rowMenuEl.contains(e.target)) closeRowMenu(); }
    function onRowMenuKey(e) { if (e.key === 'Escape') closeRowMenu(); }
    function openRowMenu(btn, root) {
      closeRowMenu();
      const items = rowMenuItems(root);
      const menu = document.createElement('div'); menu.className = 'rvd-rowmenu';
      menu.innerHTML = items.map((it, i) =>
        `<button type="button" class="rvd-rowmenu-item${it.danger ? ' danger' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('');
      document.body.appendChild(menu); rowMenuEl = menu;
      const r = btn.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      let left = r.right - mw;
      if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
      if (left < 8) left = 8;
      let top = r.bottom + 6;
      if (top + mh > innerHeight - 8) top = r.top - mh - 6;
      if (top < 8) top = 8;
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
      menu.querySelectorAll('.rvd-rowmenu-item').forEach((b) =>
        b.addEventListener('click', () => { const it = items[+b.dataset.i]; closeRowMenu(); it.onSelect(); }));
      setTimeout(() => {
        document.addEventListener('click', onRowMenuDoc, true);
        document.addEventListener('keydown', onRowMenuKey, true);
        window.addEventListener('scroll', closeRowMenu, true);
        window.addEventListener('resize', closeRowMenu);
      }, 0);
    }

    function openEditTeams(root) {
      const el = document.createElement('div'); el.className = 'rvd-editmodal';
      el.innerHTML =
        `<div class="rvd-editcard" role="dialog" aria-modal="true">` +
          `<div class="rvd-edithead"><div class="rvd-edittitle">Edit teams</div>` +
            `<button class="rvd-editx" aria-label="Close">×</button></div>` +
          `<p class="rvd-editsub">Re-route this comment — who raised it (From) and which team should action it (To).</p>` +
          `<div class="rvd-editfield"><span class="rvd-editlbl">From</span><div class="rvd-editfrom"></div></div>` +
          `<div class="rvd-editfield"><span class="rvd-editlbl">Directed to</span><div class="rvd-editto"></div></div>` +
          `<div class="rvd-editactions"><button class="rvd-editbtn rvd-editcancel">Cancel</button>` +
            `<button class="rvd-editbtn rvd-editsave">Save</button></div>` +
        `</div>`;
      document.body.appendChild(el);
      const fromDD = buildDropdown({ items: TEAMS.map((t) => ({ value: t, label: t })), value: root.team || '', placeholder: 'Select team', block: true });
      const toDD = buildDropdown({ items: TEAMS.map((t) => ({ value: t, label: t })).concat([{ value: ADMIN_TEAM, label: ADMIN_TEAM, dividerBefore: true }]), value: root.toTeam || '', placeholder: 'Select team', block: true });
      el.querySelector('.rvd-editfrom').appendChild(fromDD.el);
      el.querySelector('.rvd-editto').appendChild(toDD.el);
      const close = () => el.remove();
      el.querySelector('.rvd-editx').addEventListener('click', close);
      el.querySelector('.rvd-editcancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      el.querySelector('.rvd-editsave').addEventListener('click', async () => {
        const save = el.querySelector('.rvd-editsave'); save.disabled = true; save.textContent = 'Saving…';
        try { Object.assign(root, await store.setTeams(root, fromDD.getValue(), toDD.getValue())); close(); counts(); render(); lastSig = dataSig(); }
        catch (e) { save.disabled = false; save.textContent = 'Save'; alert('Could not save — ' + e.message); }
      });
    }

    // ---- Master Log: tabular log of every ticket chain (live state), with drill-in ----
    function renderEntries() {
      if (entryDetail) { renderEntryDetail(); return; }
      const rs = sortRoots(roots());
      $('#rvd-empty').hidden = rs.length > 0;
      if (!rs.length) { $('#rvd-entries').innerHTML = ''; return; }
      $('#rvd-entries').innerHTML =
        `<div class="rvd-entrieshead"><h2>Master Log <span style="font-weight:500;color:var(--pk-muted)">(${rs.length})</span></h2></div>` +
        `<div class="rvd-logwrap"><table class="rvd-log"><thead><tr>` +
        `<th>Ticket</th><th>When</th><th>Page</th><th>Element</th><th>Requirement</th><th>From</th><th>Directed to</th><th>Status</th><th>More</th>` +
        `</tr></thead><tbody>` +
        rs.map((c) => {
          const a = c.anchor || {};
          const el = a.snippet ? '“' + esc(a.snippet.slice(0, 40)) + '”' : esc(a.tag || '—');
          const req = (c.comment || '').trim();
          const reqShort = req ? esc(req.slice(0, 120)) + (req.length > 120 ? '…' : '') : '—';
          return `<tr class="rvd-logrow" data-id="${esc(c.id)}">` +
            `<td><span class="rvd-ticket">${c.ticket ? esc(c.ticket) : '—'}</span></td>` +
            `<td>${esc(fmt(c.createdAt))}</td>` +
            `<td><a class="rvd-slug" href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a></td>` +
            `<td>${el}</td>` +
            `<td class="rvd-log-req">${reqShort}</td>` +
            `<td>${teamChip(c.team) || '—'}</td>` +
            `<td>${teamChip(c.toTeam) || '—'}</td>` +
            `<td>${statusChip(c)}</td>` +
            `<td><button class="rvd-moreopts" data-more="${esc(c.id)}">More options <span class="rvd-moreopts-chev">▾</span></button></td>` +
          `</tr>`;
        }).join('') +
        `</tbody></table></div>`;
      const open = (id) => { entryDetail = id; render(); };
      $('#rvd-entries').querySelectorAll('.rvd-logrow').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('a, .rvd-moreopts')) return;
          open(tr.dataset.id);
        });
      });
      $('#rvd-entries').querySelectorAll('.rvd-moreopts').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const rec = roots().find((c) => c.id === b.dataset.more); if (rec) openRowMenu(b, rec);
        });
      });
    }

    function renderEntryDetail() {
      const c = roots().find((x) => x.id === entryDetail) || all.find((x) => x.id === entryDetail);
      if (!c) { entryDetail = null; return renderEntries(); }
      $('#rvd-empty').hidden = true;
      const a = c.anchor || {};
      const where = a.snippet ? '“' + esc(a.snippet) + '”' + (a.tag ? ' · ' + esc(a.tag) : '') : (a.tag ? esc(a.tag) : '—');
      const hist = chainHistory(c);
      const field = (k, vHtml) => `<div class="rvd-field"><div class="rvd-field-k">${k}</div><div class="rvd-field-v">${vHtml}</div></div>`;
      const timeline = hist.length
        ? `<ol class="rvd-timeline">` + hist.map((h, i) =>
            `<li class="rvd-tl${i === hist.length - 1 ? ' is-current' : ''}">` +
              `<div class="rvd-tl-top"><span class="rvd-tl-iter">-${h.iteration || 1}</span>` +
              `<span class="rvd-tl-event">${esc(eventLabel(h))}</span>` +
              `<span class="rvd-tl-time">${esc(fmt(h.at))}</span></div>` +
            `</li>`).join('') + `</ol>`
        : '—';
      const acts = lifecycleActions(c);
      const tl = typeLabel(c);
      const sum = summaryOf(c);
      const isReopened = teamStatusOf(c) === 'reopened';
      const reopLabel = reopenLabelOf(c);
      // Feature 8: success-criteria callout for layout-tweak / image-swap.
      const outcome = needsExpectedOutcome(c.commentType) ? (c.expectedOutcome || '') : '';
      // Feature 10: the best-effort location hint (CSS selector), clamped + copyable.
      const selector = (a.selector || '').trim();
      // Feature 6: the quick-questions reply thread.
      const replies = repliesOf(c);
      $('#rvd-entries').innerHTML =
        `<button class="rvd-back" id="rvd-back">← Back to Master Log</button>` +
        `<article class="rvd-detail">` +
          `<h2 class="rvd-detail-title">${esc(c.comment)}</h2>` +
          `<div class="rvd-detail-chips">${statusChip(c)}` +
            (tl ? `<span class="rvd-typechip">${esc(tl)}</span>` : '') +
            (isReopened ? `<span class="rvd-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` : '') +
            routeChips(c) +
            `<a class="rvd-slug" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">Open pin</a></div>` +
          (outcome
            ? `<div class="rvd-criteria"><div class="rvd-criteria-k">Success criteria</div><div class="rvd-criteria-v">${esc(outcome)}</div></div>`
            : '') +
          (acts ? `<div class="rvd-detail-acts">${acts}</div>` : '') +
          (c.imageId ? `<div class="rvd-field"><div class="rvd-field-k">Screenshot</div><div class="rvd-detail-media">${thumbTile(c.imageId, true)}</div></div>` : '') +
          `<div class="rvd-fields">` +
            (tl && sum && sum !== c.comment ? field('Summary', esc(sum)) : '') +
            typedFieldRows(c) +
            field('Ticket', c.ticket ? `<span class="rvd-ticket">${esc(c.ticket)}</span>` : '—') +
            field('Iteration', String(c.iteration || 1)) +
            field('Page', `<a href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a> <span style="color:var(--pk-muted)">${esc(c.page.path)}</span>`) +
            field('Element / anchor', where) +
            (selector
              ? `<div class="rvd-field"><div class="rvd-field-k">Likely location</div>` +
                `<div class="rvd-lochint"><code class="rvd-selector" title="${esc(selector)}">${esc(selector)}</code>` +
                `<button class="rvd-a rvd-loc-copy" type="button" data-sel="${esc(selector)}">Copy</button></div>` +
                `<div class="rvd-lochint-cap">Best-effort CSS selector captured at review time — verify in context.</div></div>`
              : '') +
            field('From (raised by)', esc(c.name || 'anonymous') + (c.team ? ' · ' + esc(c.team) : '')) +
            field('Directed to', c.toTeam ? teamChip(c.toTeam) : '—') +
            field('Submitted', esc(fmt(c.createdAt))) +
            (c.changeTo ? `<div class="rvd-field"><div class="rvd-field-k">Change to</div><div class="rvd-change"><div>${esc(c.changeTo)}</div></div></div>` : '') +
            (isReopened && (reopLabel || c.reopenNote)
              ? field('Reopen reason', `<span class="rvd-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` + (c.reopenNote ? `<div class="rvd-reopen-note">“${esc(c.reopenNote)}”</div>` : ''))
              : '') +
            field('Current status', esc(statusLabel(c))) +
            `<div class="rvd-field"><div class="rvd-field-k">AI prompt</div>` +
              (c.aiPrompt ? `<div class="rvd-field-prompt">${esc(c.aiPrompt)}</div>`
                          : `<div class="rvd-field-v" style="color:var(--pk-muted);font-style:italic">Generating — usually ready within seconds of submit. Refresh in a moment.</div>`) + `</div>` +
            `<div class="rvd-field"><div class="rvd-field-k">Iteration timeline</div>${timeline}</div>` +
          `</div>` +
          // Feature 6: Quick questions — a reply thread visually FENCED OFF from the status
          // controls above. Posting a reply never changes status/iteration.
          `<section class="rvd-qq">` +
            `<div class="rvd-qq-head"><h3 class="rvd-qq-title">Quick questions</h3>` +
              `<span class="rvd-qq-sub">Ask the raising team — replies never change status.</span></div>` +
            (replies.length
              ? `<div class="rvd-qq-thread">` + replies.map((r) =>
                  `<div class="rvd-reply">${teamChip(r.team)}<div class="rvd-rtxt">${esc(r.comment)}</div>` +
                  `<div class="rvd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div>`
              : `<p class="rvd-qq-empty">No questions yet.</p>`) +
            `<div class="rvd-qq-compose">` +
              `<textarea class="rvd-qq-input" placeholder="Write a quick question…" rows="2"></textarea>` +
              `<button class="rvd-a rvd-qq-send" type="button">Post reply</button>` +
            `</div>` +
          `</section>` +
        `</article>`;
      $('#rvd-back').addEventListener('click', () => { entryDetail = null; render(); });
      $('#rvd-entries').querySelectorAll('.rvd-detail-acts .rvd-a[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = roots().find((x) => x.id === btn.dataset.id); if (!rec) return;
          btn.disabled = true;
          await doTeamAction(rec, btn.dataset.action);
        });
      });
      // Feature 10: copy the FULL selector (the clamp is cosmetic; the button holds the value).
      const lc = $('#rvd-entries').querySelector('.rvd-loc-copy');
      if (lc) lc.addEventListener('click', () => copyToClip(lc.dataset.sel, lc, 'Copied ✓'));
      // Feature 6: post a quick-question reply (status untouched).
      const send = $('#rvd-entries').querySelector('.rvd-qq-send');
      const input = $('#rvd-entries').querySelector('.rvd-qq-input');
      if (send && input) send.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        send.disabled = true; send.textContent = 'Posting…';
        try { await store.reply(c, text); await loadData(); }
        catch (e) { send.disabled = false; send.textContent = 'Post reply'; alert('Could not post — ' + e.message); }
      });
      hydrateThumbs($('#rvd-entries'));
    }

    // ---- Notifications (admin: all), newest first, unread flagged ----
    function renderNotifs() {
      $('#rvd-empty').hidden = true;
      const list = (notifs || []).slice().sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
      const unread = list.filter((n) => n.readAdmin === false);
      $('#rvd-view-notifs').innerHTML =
        `<div class="rvd-notifhead">` +
          `<div><h2>Notifications</h2>` +
          `<p class="rvd-deploy-explain">Fired as tickets move through the status machine (started, deployed live, reopened, resubmitted).</p></div>` +
          (unread.length ? `<button class="rvd-a" id="rvd-notif-read">Mark all read (${unread.length})</button>` : '') +
        `</div>` +
        (list.length
          ? `<div class="rvd-notiflist">${list.map(notifItem).join('')}</div>`
          : `<p class="rvd-empty">No notifications yet.</p>`);
      const rb = $('#rvd-notif-read');
      if (rb) rb.addEventListener('click', async () => {
        rb.disabled = true;
        try { await store.markRead(unread.map((n) => n.id), true); await loadData(); }
        catch (e) { rb.disabled = false; alert('Could not update — ' + e.message); }
      });
      $('#rvd-view-notifs').querySelectorAll('.rvd-notif-toggle').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try { await store.markRead([btn.dataset.id], btn.dataset.read === 'true'); await loadData(); }
          catch (e) { btn.disabled = false; alert('Could not update — ' + e.message); }
        });
      });
    }
    // A small speech-bubble glyph marks a Quick-questions reply notification.
    const REPLY_ICO = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    function notifItem(n) {
      const unread = n.readAdmin === false;
      let chip;
      if (n.kind === 'reply') {
        // Feature 6: render a reply notification distinctly (icon + "Reply" label).
        chip = `<span class="rvd-chip rvd-chip-reply">${REPLY_ICO} Reply</span>`;
      } else if (n.kind === 'status' && TEAM_STATUS[n.teamStatus]) {
        const [cls, label] = TEAM_STATUS[n.teamStatus];
        chip = `<span class="rvd-chip ${cls}">${label}</span>`;
      } else if (n.kind === 'directed') {
        chip = `<span class="rvd-chip open">Directed</span>`;
      } else {
        chip = `<span class="rvd-chip deployed">Update</span>`;
      }
      const openPin = n.commentId
        ? `<a class="rvd-openpin" href="${esc(n.path)}?review=1#c=${esc(n.commentId)}" target="_blank" rel="noopener">Open Pin</a>` : '';
      return `<div class="rvd-notif${unread ? ' is-unread' : ''}">` +
        `<span class="rvd-notif-dot"></span>` +
        `<div class="rvd-notif-body">` +
          `<div class="rvd-notif-summary">${esc(n.summary || '')}</div>` +
          `<div class="rvd-notif-meta">${teamChip(n.team)}` +
            `<a class="rvd-slug" href="${esc(n.path)}" target="_blank" rel="noopener">${esc(pageName(n.path))}</a>` +
            `<span class="rvd-time">${esc(fmt(n.updatedAt || n.createdAt))}</span>` +
            chip + openPin +
          `</div>` +
        `</div>` +
        `<button class="rvd-a rvd-notif-toggle" type="button" data-id="${esc(n.id)}" data-read="${unread ? 'true' : 'false'}">` +
          `${unread ? 'Mark read' : 'Mark unread'}</button>` +
      `</div>`;
    }

    function render() {
      $('#rvd-view-dash').hidden = view !== 'dash';
      $('#rvd-view-entries').hidden = view !== 'entries';
      $('#rvd-view-notifs').hidden = view !== 'notifs';
      const iv = $('#rvd-view-insights'); if (iv) iv.hidden = view !== 'insights';
      const dep = $('#rvd-view-deploy'); if (dep) dep.hidden = true;
      if (view === 'entries') { renderEntries(); return; }
      if (view === 'notifs') { renderNotifs(); return; }
      if (view === 'insights') { renderInsights(); return; }

      // Feature 11: the saved "Team views" quick-select chips sit atop the list.
      renderViewChips();
      const host = $('#rvd-list');
      const rs = currentRoots();

      // Feature 9: "By Page" is the group-by-page mechanism (per-page count header); the
      // "All" tab is the flat sort. Toggling between them loses no data (both read `rs`).
      if (tab === 'page') {
        const paths = [...new Set(rs.map((c) => c.page.path))].sort();
        host.innerHTML = paths.map((p) => {
          const group = rs.filter((c) => c.page.path === p);
          const tbiN = group.filter((c) => teamStatusOf(c) === 'to_be_initiated').length;
          const progN = group.filter((c) => teamStatusOf(c) === 'in_progress').length;
          return `<div class="rvd-group"><h2 class="rvd-gh">` +
            `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
            `<span class="rvd-gh-rollup">${group.length} open · ${tbiN} TBI · ${progN} in progress</span>` +
            `<span class="rvd-gh-actions"><button class="rvd-gh-copy" data-page="${esc(p)}">Copy prompts</button></span>` +
            `</h2><div class="rvd-grid">${group.map(card).join('')}</div></div>`;
        }).join('');
        host.querySelectorAll('.rvd-gh-copy').forEach((b) => b.addEventListener('click', () =>
          copyToClip(promptsText(rs.filter((c) => c.page.path === b.dataset.page)), b, 'Copied ✓')));
      } else {
        host.innerHTML = `<div class="rvd-grid">${rs.map(card).join('')}</div>`;
      }
      const emp = $('#rvd-empty');
      emp.hidden = rs.length > 0;
      if (!rs.length) emp.textContent = search ? 'No tickets match your search.' : 'Nothing in the Team Queue.';
      bindActions();
      updateSelectToggle();
      hydrateThumbs(host);
    }

    // ---- Team views (Feature 11): capture / apply / persist the current filter set ----
    // A view captures {search, sort, tab (group-by), teamFilter}. Shared per admin key.
    const currentFilterState = () => ({ search, sort, tab, teamFilter });
    function applyView(v) {
      const f = (v && v.filters) || {};
      search = f.search || ''; sort = f.sort || 'new'; tab = f.tab || 'all'; teamFilter = f.teamFilter || '';
      activeViewName = v ? v.name : '';
      const se = $('#rvd-search'); if (se) se.value = search;
      if (sortDD && sortDD.setValue) sortDD.setValue(sort);
      $('#rvd-tabs').querySelectorAll('.rvd-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
      buildTeamChips();
      render();
    }
    function renderViewChips() {
      const host = $('#rvd-views'); if (!host) return;
      if (!savedViews.length) { host.hidden = true; host.innerHTML = ''; return; }
      host.hidden = false;
      host.innerHTML = `<span class="rvd-views-lbl">Team views</span>` +
        savedViews.map((v, i) =>
          `<span class="rvd-viewchip${v.name === activeViewName ? ' is-active' : ''}">` +
            `<button type="button" class="rvd-viewchip-go" data-i="${i}">${esc(v.name)}</button>` +
            `<button type="button" class="rvd-viewchip-x" data-del="${i}" aria-label="Delete view">×</button>` +
          `</span>`).join('');
      host.querySelectorAll('.rvd-viewchip-go').forEach((b) =>
        b.addEventListener('click', () => applyView(savedViews[+b.dataset.i])));
      host.querySelectorAll('.rvd-viewchip-x').forEach((b) =>
        b.addEventListener('click', async () => {
          const i = +b.dataset.del; const removed = savedViews[i];
          const next = savedViews.filter((_, x) => x !== i);
          try { await store.saveViews(next); savedViews = next; if (removed && removed.name === activeViewName) activeViewName = ''; renderViewChips(); }
          catch (e) { alert('Could not delete view — ' + e.message); }
        }));
    }
    async function saveCurrentView() {
      const name = (prompt('Name this view (shared with everyone on this key):') || '').trim();
      if (!name) return;
      const next = savedViews.filter((v) => v.name !== name).concat([{ name, filters: currentFilterState() }]);
      try { await store.saveViews(next); savedViews = next; activeViewName = name; renderViewChips(); }
      catch (e) { alert('Could not save view — ' + e.message); }
    }
    async function loadViews() {
      try { const v = await store.getViews(); savedViews = Array.isArray(v) ? v : []; }
      catch { savedViews = []; }
    }

    // ---- Insights (Feature 12) — the five aggregates. computeMetrics mirrors the Worker's
    // exact algorithm so demo mode (localMetrics) and a deployed Worker return identical shapes. ----
    function computeMetrics(events, from, to) {
      const evs = (Array.isArray(events) ? events : [])
        .filter((e) => e && e.at && (!from || e.at >= from) && (!to || e.at <= to))
        .slice().sort((a, b) => (a.at < b.at ? -1 : 1));
      const deployedPerPage = {}, volumeByType = {}, reopenByType = {};
      let createdTotal = 0, reopenTotal = 0;
      const pendingByPage = {}, deployDeltas = [], perPageDeltas = {}, byDay = {};
      for (const e of evs) {
        const page = e.page || '/', ct = e.commentType || 'general', day = String(e.at).slice(0, 10);
        if (!byDay[day]) byDay[day] = { opened: 0, deployed: 0 };
        if (e.event === 'created' || e.event === 'resubmitted') {
          if (e.event === 'created') { createdTotal++; volumeByType[ct] = (volumeByType[ct] || 0) + 1; }
          (pendingByPage[page] || (pendingByPage[page] = [])).push(e.at);
          byDay[day].opened++;
        } else if (e.event === 'team-complete') {
          deployedPerPage[page] = (deployedPerPage[page] || 0) + 1;
          byDay[day].deployed++;
          const q = pendingByPage[page];
          if (q && q.length) {
            const startAt = q.shift();
            const hours = (Date.parse(e.at) - Date.parse(startAt)) / 3600000;
            if (isFinite(hours) && hours >= 0) { deployDeltas.push(hours); (perPageDeltas[page] || (perPageDeltas[page] = [])).push(hours); }
          }
        } else if (e.event === 'team-reopen') {
          reopenTotal++; reopenByType[ct] = (reopenByType[ct] || 0) + 1;
        }
      }
      const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const round2 = (n) => Math.round(n * 100) / 100;
      const avgPerPage = {};
      for (const p of Object.keys(perPageDeltas)) avgPerPage[p] = round2(mean(perPageDeltas[p]));
      const reopenPerType = {};
      for (const t of Object.keys(volumeByType)) reopenPerType[t] = volumeByType[t] ? round2((reopenByType[t] || 0) / volumeByType[t]) : 0;
      for (const t of Object.keys(reopenByType)) if (reopenPerType[t] === undefined) reopenPerType[t] = 0;
      let openRunning = 0;
      const openTrend = Object.keys(byDay).sort().map((d) => { openRunning += byDay[d].opened - byDay[d].deployed; return { date: d, count: openRunning }; });
      return {
        deployedPerPage, volumeByType,
        avgHoursToDeploy: { global: round2(mean(deployDeltas)), perPage: avgPerPage },
        reopenRate: { global: createdTotal ? round2(reopenTotal / createdTotal) : 0, perType: reopenPerType },
        openTrend,
      };
    }

    // A token-styled CSS bar chart from [label, value, displayValue] rows, sorted desc.
    function barChart(title, rows, fill) {
      if (!rows.length) return `<div class="pk-bars"><div class="rvd-ins-h">${esc(title)}</div><p class="rvd-ins-empty">No data in range.</p></div>`;
      const max = Math.max(...rows.map((r) => r[1]), 0) || 1;
      const body = rows.map((r) => {
        const pct = Math.max(2, Math.round((r[1] / max) * 100));
        return `<div class="pk-bar-row"><span class="pk-bar-key" title="${esc(r[0])}">${esc(r[0])}</span>` +
          `<span class="pk-bar-track"><span class="pk-bar-fill${fill ? ' pk-bar-fill--' + fill : ''}" style="--pct:${pct}%"></span></span>` +
          `<span class="pk-bar-val">${esc(r[2] != null ? r[2] : r[1])}</span></div>`;
      }).join('');
      return `<div class="pk-bars"><div class="rvd-ins-h">${esc(title)}</div>${body}</div>`;
    }
    const entriesOf = (obj) => Object.keys(obj || {}).map((k) => [k, obj[k]]).sort((a, b) => b[1] - a[1]);

    function fillInsights() {
      const host = $('#rvd-ins-body'); if (!host) return;
      const m = metricsData;
      if (!m) { host.innerHTML = `<p class="rvd-ins-empty">Loading…</p>`; return; }
      const totalTickets = Object.values(m.volumeByType || {}).reduce((s, x) => s + x, 0);
      const totalDeploys = Object.values(m.deployedPerPage || {}).reduce((s, x) => s + x, 0);
      const tiles =
        `<div class="pk-tiles">` +
          `<div class="pk-tile"><div class="pk-tile-val">${totalTickets}</div><div class="pk-tile-label">Tickets raised</div></div>` +
          `<div class="pk-tile"><div class="pk-tile-val">${totalDeploys}</div><div class="pk-tile-label">Edits deployed</div></div>` +
          `<div class="pk-tile"><div class="pk-tile-val">${m.avgHoursToDeploy.global}h</div><div class="pk-tile-label">Avg time to deploy</div></div>` +
          `<div class="pk-tile"><div class="pk-tile-val">${Math.round((m.reopenRate.global || 0) * 100)}%</div><div class="pk-tile-label">Reopen rate</div></div>` +
        `</div>`;
      const deployRows = entriesOf(m.deployedPerPage).map((r) => [pageName(r[0]), r[1]]);
      const typeRows = entriesOf(m.volumeByType).map((r) => { const meta = typeMeta(r[0]); return [meta ? meta.label : r[0], r[1]]; });
      const perPageRows = entriesOf(m.avgHoursToDeploy.perPage).map((r) => [pageName(r[0]), r[1], r[1] + 'h']);
      const reopenRows = entriesOf(m.reopenRate.perType).map((r) => { const meta = typeMeta(r[0]); return [meta ? meta.label : r[0], r[1], Math.round(r[1] * 100) + '%']; });
      const trendRows = (m.openTrend || []).map((d) => [d.date, d.count]);
      host.innerHTML = tiles +
        barChart('Edits deployed · by page', deployRows, 'green') +
        barChart('Ticket volume · by type', typeRows, 'blue') +
        barChart('Avg hours to deploy · by page', perPageRows, 'amber') +
        barChart('Reopen rate · by type', reopenRows, 'softred') +
        barChart('Open-ticket trend · by day', trendRows, '');
    }
    async function loadMetrics() {
      const host = $('#rvd-ins-body'); if (host) host.innerHTML = `<p class="rvd-ins-empty">Loading…</p>`;
      try {
        const to = metricsTo ? metricsTo + 'T23:59:59.999Z' : '';
        metricsData = await store.metrics(metricsFrom || '', to);
      } catch (e) { metricsData = null; if (host) host.innerHTML = `<p class="rvd-ins-empty">Could not load insights — ${esc(e.message)}</p>`; return; }
      fillInsights();
    }
    let insightsBuilt = false;
    function renderInsights() {
      const host = $('#rvd-view-insights'); if (!host) return;
      if (!insightsBuilt) {
        host.innerHTML =
          `<div class="rvd-ins-head"><div><h2>Insights</h2>` +
            `<p class="rvd-deploy-explain">Aggregate ticket metrics across every page. Pick a date range to focus.</p></div>` +
            `<div class="rvd-ins-range">` +
              `<label class="rvd-ins-lbl">From<input type="date" id="rvd-ins-from" class="rvd-ins-date"></label>` +
              `<label class="rvd-ins-lbl">To<input type="date" id="rvd-ins-to" class="rvd-ins-date"></label>` +
              `<button type="button" id="rvd-ins-apply" class="rvd-a">Apply</button>` +
              `<button type="button" id="rvd-ins-clear" class="rvd-a">Clear</button>` +
            `</div>` +
          `</div>` +
          `<div class="pk-insights" id="rvd-ins-body"></div>`;
        insightsBuilt = true;
        const fromEl = $('#rvd-ins-from'), toEl = $('#rvd-ins-to');
        fromEl.value = metricsFrom; toEl.value = metricsTo;
        $('#rvd-ins-apply').addEventListener('click', () => { metricsFrom = fromEl.value; metricsTo = toEl.value; loadMetrics(); });
        $('#rvd-ins-clear').addEventListener('click', () => { metricsFrom = ''; metricsTo = ''; fromEl.value = ''; toEl.value = ''; loadMetrics(); });
      }
      loadMetrics();
    }

    function updateBulk() {
      const n = sel.size;
      const bar = $('#rvd-bulk');
      bar.hidden = !(selectMode && n > 0);
      if (n) $('#rvd-bulk-n').textContent = n + ' selected';
      updateSelectToggle();
    }

    function updateSelectToggle() {
      const btn = $('#rvd-selectall'); if (!btn) return;
      btn.textContent = selectMode ? 'Deselect All' : 'Select';
      btn.classList.toggle('is-active', selectMode);
    }
    function setSelectMode(on) {
      selectMode = on;
      if (!on) sel.clear();
      updateBulk(); render();
    }

    function bindActions(scope) {
      const host = scope || $('#rvd-list');
      host.querySelectorAll('.rvd-sel').forEach((cb) => {
        cb.addEventListener('change', () => {
          cb.checked ? sel.add(cb.dataset.id) : sel.delete(cb.dataset.id);
          updateBulk(); render();
        });
      });
      host.querySelectorAll('.rvd-a[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = roots().find((c) => c.id === btn.dataset.id); if (!rec) return;
          btn.disabled = true;
          await doTeamAction(rec, btn.dataset.action);
        });
      });
      host.querySelectorAll('.rvd-copyone').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = all.find((c) => c.id === btn.dataset.copy); if (!rec) return;
          copyToClip(localPrompt(rec), btn, 'Copied ✓');
        });
      });
      host.querySelectorAll('.delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = roots().find((c) => c.id === btn.dataset.id) || all.find((c) => c.id === btn.dataset.id); if (!rec) return;
          rowDelete(rec);
        });
      });
      host.querySelectorAll('.rvd-morebtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const el = btn.parentElement.querySelector('.rvd-comment-text');
          const clamped = el.classList.toggle('rvd-clamp');
          btn.textContent = clamped ? 'Show more' : 'Show less';
        });
      });
      host.querySelectorAll('.rvd-repliestoggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wrap = host.querySelector('.rvd-replies[data-replies-for="' + btn.dataset.replies + '"]');
          if (!wrap) return;
          const open = wrap.hasAttribute('hidden');
          if (open) wrap.removeAttribute('hidden'); else wrap.setAttribute('hidden', '');
          btn.classList.toggle('is-open', open);
        });
      });
      revealClamps(host);
    }

    document.querySelector('.rvd-side').addEventListener('click', (e) => {
      const b = e.target.closest('.rvd-nav'); if (!b) return;
      view = b.dataset.view; entryDetail = null;
      document.querySelectorAll('.rvd-nav').forEach((n) => n.classList.toggle('is-active', n === b));
      render();
    });

    $('#rvd-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.rvd-tab'); if (!b) return;
      tab = b.dataset.tab;
      $('#rvd-tabs').querySelectorAll('.rvd-tab').forEach((t) => t.classList.toggle('is-active', t === b));
      render();
    });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    $('#rvd-refresh').addEventListener('click', async () => {
      const btn = $('#rvd-refresh');
      if (btn.classList.contains('is-refreshing')) return;
      btn.classList.remove('is-done');
      btn.classList.add('is-refreshing');
      const t0 = Date.now();
      try {
        await loadData();
        await wait(Math.max(0, 650 - (Date.now() - t0)));
        btn.classList.remove('is-refreshing');
        btn.classList.add('is-done');
        setTimeout(() => {
          btn.classList.add('is-resetting');
          btn.classList.remove('is-done');
          setTimeout(() => btn.classList.remove('is-resetting'), 550);
        }, 1100);
      } catch (e) {
        btn.classList.remove('is-refreshing');
        alert('Could not refresh — ' + e.message);
      }
    });
    // ---- toolbar: search / sort / export / copy-all-prompts ----
    $('#rvd-search').addEventListener('input', (e) => { search = e.target.value.trim(); render(); });
    $('#rvd-selectall').addEventListener('click', () => setSelectMode(!selectMode));
    // Feature 11: "Save view" captures the current filter set as a shared Team view.
    const saveViewBtn = $('#rvd-saveview'); if (saveViewBtn) saveViewBtn.addEventListener('click', () => saveCurrentView());
    const IC = {
      newest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
      oldest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
      page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v6h6"/></svg>',
      copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
      md: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
      json: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
    };
    const sortDD = buildDropdown({
      small: true, value: sort,
      items: [
        { value: 'new', label: 'Newest first', icon: IC.newest },
        { value: 'old', label: 'Oldest first', icon: IC.oldest },
        { value: 'page', label: 'Page A–Z', icon: IC.page },
      ],
      onSelect: (v) => { sort = v; render(); },
    });
    $('#rvd-sort-mount').appendChild(sortDD.el);
    let copyDD;
    const flashCopy = () => { copyDD.setLabel('Copied ✓'); setTimeout(() => copyDD.setLabel('Copy'), 1400); };
    copyDD = buildDropdown({
      small: true, fixedLabel: 'Copy', menuAlign: 'right',
      items: [
        { label: 'Copy prompts', icon: IC.copy, onSelect: () => { copyToClip(promptsText(currentRoots()), null); flashCopy(); } },
        { label: 'Copy MD', icon: IC.md, onSelect: () => { copyToClip(mdExport(currentRoots()), null); flashCopy(); } },
        { label: 'Download JSON', icon: IC.json, onSelect: () => downloadJSON() },
      ],
    });
    $('#rvd-copy-mount').appendChild(copyDD.el);

    // ---- bulk actions on the selected tickets (Start / Mark Complete / Reopen) ----
    // Reopen goes through the shared modal (Feature 3), one reason/note applied to the batch.
    async function runBulk(act, recs, extra) {
      [...$('#rvd-bulk').querySelectorAll('.rvd-bulk-a')].forEach((x) => (x.disabled = true));
      try {
        for (const rec of recs) {
          if (act === 'start') { Object.assign(rec, await store.teamAction(rec, 'start')); }
          else if (act === 'complete') { Object.assign(rec, await store.teamAction(rec, 'complete')); }
          else if (act === 'reopen') { Object.assign(rec, await store.teamAction(rec, 'reopen', extra.reason, extra.note)); }
          else if (act === 'delete') { await store.del(rec); const rid = rec.parentId || rec.id; all = all.filter((c) => c.id !== rid && c.parentId !== rid); }
        }
        sel.clear(); updateBulk(); counts(); render(); lastSig = dataSig();
      } catch (err) { alert('Bulk action failed — ' + err.message); }
      finally { [...$('#rvd-bulk').querySelectorAll('.rvd-bulk-a')].forEach((x) => (x.disabled = false)); }
    }
    $('#rvd-bulk').addEventListener('click', async (e) => {
      const b = e.target.closest('.rvd-bulk-a'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'all') { currentRoots().forEach((c) => sel.add(c.id)); updateBulk(); render(); return; }
      const recs = [...sel].map((id) => roots().find((c) => c.id === id)).filter(Boolean);
      if (!recs.length) return;
      if (act === 'copy') { copyToClip(promptsText(recs), b, 'Copied ✓'); return; }
      if (act === 'delete' && !confirm(`Delete ${recs.length} ticket chain${recs.length > 1 ? 's' : ''} (all iterations + replies)? This cannot be undone.`)) return;
      if (act === 'reopen') {
        openReopenModal(({ reason, note }) => runBulk('reopen', recs, { reason, note }),
          `Reopen ${recs.length} selected ticket${recs.length > 1 ? 's' : ''} with one reason.`);
        return;
      }
      runBulk(act, recs, {});
    });
    $('#rvd-bulk-clear').addEventListener('click', () => { sel.clear(); updateBulk(); render(); });

    buildTeamChips();

    // "Team dashboards" — admin can open ANY team's board. Teams not enabled in this phase
    // (config.js: isTeamEnabled) are greyed out + non-navigable.
    const teamViewMount = $('#rvd-teamview-mount');
    if (teamViewMount) {
      const teamViewDD = buildDropdown({
        block: true, fixedLabel: 'Jump To Team',
        // Teams gated off via config.js (isTeamEnabled) render greyed + inert (buildDropdown
        // honours `disabled`: aria-disabled, out of the focus order, click is a no-op).
        items: TEAMS.map((t) => ({
          value: t, label: t, disabled: !teamEnabled(t),
          onSelect: () => window.open('/teamdash?team=' + encodeURIComponent(t), '_blank', 'noopener'),
        })),
      });
      teamViewMount.appendChild(teamViewDD.el);
    }

    init();
  })();
