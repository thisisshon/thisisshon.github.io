  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, checkReviewPassword, pageName, pageHref, pinHref, pageUrlText,
    pageHost, pageLabel, pageLabelFull, pageGroupKey,
    BASE, loginUrl, signInUrl, routeParts, boardHome, IDENTITY_IN_PATH, VIEW_SEGMENTS, SEGMENT_VIEWS, teamSlug, teamFromSlug, boardBase,
    ADMIN_TEAM, buildDropdown, getSession, setSession, clearSession, authHeaders, getAccount, getAuthToken, accountLogin, lockTab, clearAccount,
    initTheme, mountThemeRailButton, animateRailReflow, getTheme, toggleTheme, DEFAULT_THEME, LIGHT_THEME, ENABLED_TEAMS,
    getGlobalOverlayUi, setGlobalOverlayUi, syncOverlayUi, startOverlayUiStream, startScopeStream,
    ensureDemoReset, isTeamEnabled, ACCOUNT_KEY_SENTINEL, accessChange,
    hasPlatformAuthenticator, passkeyEnrol, passkeyList, passkeyRemove,
    COMMENT_TYPES, TYPE_FIELDS, REOPEN_REASONS, STATUS_COLORS, renderSummary,
    reopenReasonLabel, needsExpectedOutcome, PROJECT_SHORT } from './config.js?v=1e381fed60';

  // Host-project tag (5.0): Proofkit ships unbranded, so the markup carries an empty, hidden
  // element and it is filled ONLY when PROJECT_SHORT is configured. Previously the host project's
  // name was hardcoded into the markup of every entry.
  document.querySelectorAll('[data-pk-project-short]').forEach((el) => {
    if (PROJECT_SHORT) { el.textContent = PROJECT_SHORT; el.hidden = false; }
  });

  import { PK_VERSION } from './version.js?v=1e381fed60';
  import { createCardRenderer } from './card.js?v=1e381fed60';
  import { ICON } from './icons.js?v=1e381fed60';
  import { pkConfirm, pkAlert, pkPrompt } from './modal.js?v=1e381fed60';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter). Colour mode is a
    // PERSONAL preference — the admin's flip re-skins the admin, nobody else (every team
    // has the same control on its own board). initTheme paints the remembered choice and
    // follows this user's other tabs; the toggle itself sits in the side rail (under the team
    // picker) and in the Settings view — one control, two entry points.
    initTheme();
    // The overlay-UI flag IS global (the admin picks HUD vs box for everyone) — reconcile it
    // and subscribe, which the retired theme stream used to do on this board's behalf.
    syncOverlayUi(); startOverlayUiStream();
    // The revamped board + detail view are PERMANENT (they no longer ride the overlayUi flag —
    // that setting now only picks the on-page overlay: HUD vs rectangle). The root marker stays
    // so the compact-header CSS keeps its hook.
    try { document.documentElement.setAttribute('data-pk-newui', '1'); } catch (e) {}
    const LOCAL = !WORKER_URL;
    // Whether a team is active in this phase (config.js owns the list). Defensive: if the
    // export is missing/throws, fall back to "enabled" so navigation never hard-breaks.
    const teamEnabled = (t) => { try { return typeof isTeamEnabled === 'function' ? !!isTeamEnabled(t) : true; } catch { return true; } };

    async function apiFetch(path, opts = {}) {
      // 6.0: an account token when this tab is unlocked, else the legacy team key. Additive —
      // a browser with no account behaves exactly as before.
      const headers = { 'Content-Type': 'application/json', ...authHeaders() };
      const res = await fetch(WORKER_URL + path, { ...opts, headers });
      if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
      if (!res.ok) {
        /* The SERVER'S message, not the status code. Every refusal here is written for a person —
         * "Move or delete its 5 team(s) first." — and throwing 'HTTP 409' discarded it and showed a
         * number instead, which tells you something failed and nothing about what to do. The code
         * is kept only when there is no message to show. */
        let msg = '';
        try { msg = ((await res.json()) || {}).error || ''; } catch (e) { msg = ''; }
        throw new Error(msg || ('HTTP ' + res.status));
      }
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
      // start also RESUMES a clarified item (needs_clarification -> in_progress).
      start: { from: ['to_be_initiated', 'needs_clarification'], to: 'in_progress' },
      // complete also supports a DIRECT tbi -> deployed_live (the Start split button's "Mark Complete — Directly").
      complete: { from: ['in_progress', 'to_be_initiated'], to: 'deployed_live' },
      reopen: { from: ['in_progress', 'deployed_live'], to: 'reopened' },
      disregard: { from: ['to_be_initiated', 'in_progress'], to: 'disregarded' },
      clarify: { from: ['to_be_initiated', 'in_progress'], to: 'needs_clarification' },
      // reset moves an item back to TBI — either revoking the needs_clarification parking, or
      // undoing a Builder "Start" (in_progress → to_be_initiated).
      reset: { from: ['needs_clarification', 'in_progress'], to: 'to_be_initiated' },
    };
    function localTeamAction(rec, action, reason, note, redirectTo) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return { ...rec };
      const cur = r.teamStatus || 'to_be_initiated';
      const step = TEAM_NEXT[action];
      if (!step || step.from.indexOf(cur) === -1) return { ...r }; // invalid transition → no-op
      const now = new Date().toISOString();
      r.iteration = r.iteration || 1;
      let to = step.to;
      // Complete-with-redirect (demo mirror of the worker): hand the ticket to the chosen team —
      // re-target toTeam and land it in their queue as TBI, not deployed_live.
      const redirect = action === 'complete' && redirectTo && redirectTo !== (r.toTeam || ADMIN_TEAM) ? redirectTo : '';
      if (redirect) { r.toTeam = redirect; to = 'to_be_initiated'; }
      r.teamStatus = to; r.teamStatusAt = now;
      if (!Array.isArray(r.history)) r.history = [];
      const h = { status: to, at: now, event: 'team-' + action, iteration: r.iteration };
      if (redirect) { h.redirectTo = redirect; h.by = ADMIN_TEAM; }
      // v3 (Feature 3): reopen carries the enum reason + optional note; both land on the
      // record AND the history entry so the raiser sees the label + note in the timeline.
      if (action === 'reopen') {
        h.reason = reason || ''; if (note) h.note = note;
        r.reopenReason = reason || ''; r.reopenNote = note || '';
      }
      if (action === 'disregard') { if (note) h.note = note; r.disregardNote = note || ''; }
      if (action === 'clarify') { if (note) h.note = note; r.clarifyNote = note || ''; }
      if (action === 'start' || action === 'reset') r.clarifyNote = ''; // leaving the bucket clears the question
      r.history.push(h);
      localStorage.setItem(key, JSON.stringify(arr));
      // Deploy-live ('complete') fires NO notification to the raiser — they track it in their
      // table (status → "Deployed – Pending Confirmation") and the loop only pings again once
      // THEY confirm (kind:'confirmed' → Builder). Reopen/disregard/clarify still notify.
      if (action === 'reopen' || action === 'disregard' || action === 'clarify') {
        const n = localStatusNotif(r, step.to, action === 'reopen' ? reason : '', note);
        if (n) { let ex = []; try { ex = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch {}
          ex.push(n); localStorage.setItem(NOTIF_KEY, JSON.stringify(ex)); }
      }
      return { ...r };
    }
    // A status notification to the RAISING team when Builder deploys live or reopens. The
    // reopen summary shows the human reason LABEL (mirrors the Worker's statusSummary).
    function localStatusNotif(r, next, reason, note) {
      const where = pageLabelFull(r.page) || 'a page';
      const tick = r.ticket ? '#' + r.ticket + ' ' : '';
      const reasonLabel = reason ? (reopenReasonLabel(reason) || reason) : '';
      const summary = next === 'reopened'
        ? 'Builder reopened ' + tick + 'on ' + where + (reasonLabel ? ': ' + reasonLabel : '') + '.'
        : next === 'disregarded'
        ? 'Builder closed ' + tick + 'on ' + where + ' as an invalid finding.'
        : next === 'needs_clarification'
        ? 'Clarity needed on ' + tick + 'on ' + where + (note ? ': ' + note : '') + '.'
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
    // Demo mirror of POST /comments/read (admin copy): flip `readAdmin` on the thread roots.
    // items:[{id,path}] grouped by their `rvc:<path>` store; roots only.
    function localMarkThreadsRead(items, read = true) {
      const byPath = {};
      for (const it of (items || [])) { const p = (it && it.path) || '/'; (byPath[p] = byPath[p] || new Set()).add((it && it.id) || ''); }
      let updated = 0;
      for (const p of Object.keys(byPath)) {
        const key = 'rvc:' + p; let arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch { continue; }
        let dirty = false;
        for (const r of arr) { if (!r.parentId && byPath[p].has(r.id) && r.readAdmin !== read) { r.readAdmin = read; dirty = true; updated++; } }
        if (dirty) localStorage.setItem(key, JSON.stringify(arr));
      }
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
    // Remove a SINGLE quick-question reply by its own id (never a root chain) — demo mirror of
    // POST /delete scoped to a reply. Admin-only affordance; the UI gates it.
    function localDeleteReply(reply) {
      const key = 'rvc:' + reply.page.path;
      let arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr = arr.filter((r) => r.id !== reply.id);
      localStorage.setItem(key, JSON.stringify(arr));
    }
    // Soft delete (demo mirror of POST /revoke): flag the root `revoked` in place — it leaves
    // every queue but survives in the Master Log stamped "Revoked". Never removes the record.
    function localRevoke(rec) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const rootId = rec.parentId || rec.id;
      const root = arr.find((r) => r.id === rootId);
      if (root && !root.revoked) {
        // Only revocable before Builder starts it (still to_be_initiated).
        if ((root.teamStatus || 'to_be_initiated') !== 'to_be_initiated') throw new Error('already started');
        const now = new Date().toISOString();
        root.revoked = true; root.revokedAt = now; root.revokedBy = getSession().team || ADMIN_TEAM;
        (root.history = root.history || []).push({ status: root.teamStatus || 'to_be_initiated', at: now, event: 'revoked', iteration: root.iteration || 1, by: root.revokedBy });
        localStorage.setItem(key, JSON.stringify(arr));
        pushRevokeNotif(root);   // let Builder know it was pulled
      }
      return { ok: true };
    }
    // Local mirror of the Worker's revoke notification (kind:'revoked'), so demo mode notifies Builder.
    function pushRevokeNotif(root) {
      try {
        const where = pageLabelFull(root.page) || 'a page';
        const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
        arr.push({
          id: uid(), createdAt: root.revokedAt || new Date().toISOString(), team: root.toTeam || ADMIN_TEAM,
          kind: 'revoked', fromTeam: root.revokedBy || root.team || '', commentId: root.id, chainId: root.id,
          ticket: root.ticket || '', path: (root.page && root.page.path) || '/', pageName: where,
          summary: `Comment ${root.ticket ? '#' + root.ticket + ' ' : ''}on ${where} was revoked` + (root.revokedBy ? ` by ${root.revokedBy}` : ''),
          readTeam: false, readAdmin: false,
        });
        localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
      } catch (e) { /* best-effort */ }
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
        reopenReason: '', reopenNote: '', disregardNote: '', history: [],
      };
      arr.push(reply);
      const target = (me === (root.team || '')) ? (root.toTeam || '') : (root.team || '');
      // A reply re-flags the thread UNREAD for Builder + the target team (mirror of the Worker).
      const rootRec = arr.find((x) => x.id === rootId);
      if (rootRec) {
        rootRec.readAdmin = false;
        if (target) { if (!rootRec.readTeams || typeof rootRec.readTeams !== 'object') rootRec.readTeams = {}; rootRec.readTeams[target] = false; }
      }
      localStorage.setItem(key, JSON.stringify(arr));
      if (target) {
        const where = pageLabelFull(root.page) || 'a page';
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
        // A redirected complete is a handoff, not a deploy — mirror the worker's rollup naming
        // ('team-redirect') so computeMetrics never counts it under "Fixes deployed".
        for (const h of hist) out.push({ at: h.at || r.createdAt, event: (h.event === 'team-complete' && h.redirectTo) ? 'team-redirect' : (h.event || ''), page, commentType: ct, iteration: h.iteration || r.iteration || 1 });
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
          allEtag: async () => { await localGuard(); return { data: localAll(), etag: '' }; }, // no 304 in demo
          // Builder drives the status machine: start | complete | reopen(reason, note).
          teamAction: async (rec, action, reason, note, redirectTo) => { await localGuard(); return localTeamAction(rec, action, reason, note, redirectTo); },
          notifications: async () => { await localGuard(); return localNotifs(); },
          markRead: async (ids, read = true) => { await localGuard(); return localMarkRead(ids, read); },
          clearNotifs: async () => { await localGuard(); try { localStorage.removeItem('rvc-notifications'); } catch (e) {} return { ok: true }; },
          markThreadsRead: async (items, read = true) => { await localGuard(); return localMarkThreadsRead(items, read); },
          del: async (rec) => { await localGuard(); localDelete(rec); return { ok: true }; },
          delReply: async (reply) => { await localGuard(); localDeleteReply(reply); return { ok: true }; },
          revoke: async (rec) => { await localGuard(); return localRevoke(rec); },
          setTeams: async (rec, team, toTeam) => { await localGuard(); return localSetTeams(rec, team, toTeam); },
          // Phase 9.1: assignment.
          assign: async (rec, assignee) => { await localGuard(); const r = all.find((c) => c.id === rec.id); if (r) r.assignee = assignee; return { ok: true, assignee }; },
          // Phase 8: clustering is a worker (D1) feature — no local-demo equivalent.
          patterns: async () => ({ clusters: [] }),
          fragile: async () => ({ items: [] }),
          umbrella: async () => { throw new Error('Patterns need the worker backend'); },
          projects: async () => [{ id: 'default', name: 'Default', kind: 'owned', originAllowlist: [] }],
          createProject: async () => { throw new Error('Projects need the worker backend'); },
          trashList: async () => ({ items: [], waitMs: 86400000 }),
          trashRestore: async () => { throw new Error('Needs the worker backend'); },
          trashArm: async () => { throw new Error('Needs the worker backend'); },
          trashPurge: async () => { throw new Error('Needs the worker backend'); },
          auditLog: async () => [],
          policyGet: async () => ({ sessionHours: 12, lockAfter: 5, hardLockAfter: 15, requirePasskeyForBuilder: false }),
          policySet: async () => { throw new Error('Needs the worker backend'); },
          teamRename: async () => { throw new Error('Needs the worker backend'); },
          teamPermissions: async () => { throw new Error('Needs the worker backend'); },
          projectUpdate: async () => { throw new Error('Needs the worker backend'); },
          projectDelete: async () => { throw new Error('Needs the worker backend'); },
          userDelete: async () => { throw new Error('Needs the worker backend'); },
          userAccessId: async () => { throw new Error('Needs the worker backend'); },
          accessBackfill: async () => ({ issued: [] }),
          usersBulk: async () => { throw new Error('Needs the worker backend'); },
          exportProject: async () => { throw new Error('Needs the worker backend'); },
          exportTeam: async () => { throw new Error('Needs the worker backend'); },
          importData: async () => { throw new Error('Needs the worker backend'); },
          // Team management is worker-only: local-demo has no team store to manage.
          teamsList: async () => [],
          teamCreate: async () => { throw new Error('Team management needs the worker backend'); },
          teamUpdate: async () => { throw new Error('Team management needs the worker backend'); },
          teamDelete: async () => { throw new Error('Team management needs the worker backend'); },
          sessions: async () => ({ sessions: [] }),
          // Quick-questions reply (Feature 6) — no ticket, no status change.
          reply: async (root, text) => { await localGuard(); return localReply(root, text); },
          // Screenshot dataURL by id (Feature 4).
          image: async (id) => { await localGuard(); return localImage(id); },
          // Saved "team views" (Feature 11), admin-scoped.
          getViews: async () => { await localGuard(); return localGetViews(); },
          saveViews: async (views) => { await localGuard(); return localSaveViews(views); },
          // Insights aggregates (Feature 12) — computed client-side from local records.
          metrics: async (from, to) => { await localGuard(); return localMetrics(from, to); },
          insights: async () => null,   // Phase 7 D1 analytics — worker-only (no local-demo equivalent)
          stats: async () => null,      // Phase 0 usage counters — worker-only
        }
      : {
          all: () => apiFetch('/comments' + projectQuery()),
          // Phase 3.1: conditional GET — send If-None-Match, get 304 (near-free) when the admin scope
          // is unchanged since the last poll. Returns {notModified} or {data, etag}.
          allEtag: async (etag) => {
            // This was the ONE call that built its own headers from the team key, so a session
            // authenticated by account (PIN or passkey) polled with no credential at all and got
            // 401s that logged it straight back out. authHeaders() picks the bearer token when
            // there is one and the team key otherwise, which is what every other call already did.
            const headers = { ...authHeaders() };
            if (etag) headers['If-None-Match'] = etag;
            const res = await fetch(WORKER_URL + '/comments' + projectQuery(), { headers });
            if (res.status === 304) return { notModified: true };
            if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return { data: await res.json(), etag: res.headers.get('ETag') || '' };
          },
          // Contract body: { id, action:'start'|'complete'|'reopen', reason?, note? }. No `path`.
          teamAction: (rec, action, reason, note, redirectTo) => apiFetch('/team-status', { method: 'POST', body: JSON.stringify({ id: rec.id, action, reason, note, redirectTo: redirectTo || '' }) }),
          // 6.0 accounts — Builder-only account administration. The Builder can create, reset,
          // unlock and disable, but no endpoint ever returns a PIN or its hash.
          // 7.x visibility + hierarchy. Enforcement lives server-side in canSee(); these only
          // read and write the policy the Builder chooses.
          overview: () => apiFetch('/admin/overview'),
          visibilityGet: (project) => apiFetch('/admin/visibility?project=' + encodeURIComponent(project || 'default')),
          visibilityMode: (project, mode) => apiFetch('/admin/visibility/mode', { method: 'POST', body: JSON.stringify({ project, mode }) }),
          visibilityPair: (project, viewerTeam, subjectTeam, canSee) => apiFetch('/admin/visibility/pair', { method: 'POST', body: JSON.stringify({ project, viewerTeam, subjectTeam, canSee }) }),
          teamProject: (team, project) => apiFetch('/admin/teams/project', { method: 'POST', body: JSON.stringify({ team, project }) }),
          /* MOVE vs ALSO-IN. `teamProject` above moves a team — one project, the old one forgotten.
           * This one adds or removes a MEMBERSHIP, so a team can be worked with on several projects
           * at once. The server refuses to remove the last one (409) and says why; apiFetch surfaces
           * that message, so callers do not have to guard against it themselves. */
          teamProjectLink: (team, projectId, remove, confirm) => apiFetch('/teams/projects', { method: 'POST', body: JSON.stringify({ team, projectId, remove: !!remove, confirm: confirm || '' }) }),
          projectLinks: () => apiFetch('/admin/project-links'),
          projectLinkSet: (viewerProject, subjectProject, canSee) => apiFetch('/admin/project-links', { method: 'POST', body: JSON.stringify({ viewerProject, subjectProject, canSee }) }),
          // ---- 10.0 ----
          trashList: () => apiFetch('/admin/trash'),
          trashRestore: (kind, ref) => apiFetch('/admin/trash/restore', { method: 'POST', body: JSON.stringify({ kind, ref }) }),
          trashArm: (kind, ref, password) => apiFetch('/admin/trash/arm', { method: 'POST', body: JSON.stringify({ kind, ref, password }) }),
          /* One shape for one and for many: the caller always passes a LIST, and the Worker takes
           * `items` for a batch. Keeping the old (kind, ref) signature beside it would have meant
           * two call paths into the one endpoint that destroys things. */
          trashPurge: (items, password) => apiFetch('/admin/trash/purge', { method: 'POST', body: JSON.stringify({ items, password }) }),
          auditLog: (kind, ref) => apiFetch('/admin/audit-log' + (kind && ref ? '?kind=' + encodeURIComponent(kind) + '&ref=' + encodeURIComponent(ref) : '')),
          policyGet: () => apiFetch('/admin/settings'),
          policySet: (patch) => apiFetch('/admin/settings', { method: 'POST', body: JSON.stringify(patch) }),
          teamRename: (from, to) => apiFetch('/teams/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
          teamPermissions: (name, perms) => apiFetch('/teams/permissions', { method: 'POST', body: JSON.stringify({ name, ...perms }) }),
          projectUpdate: (id, name) => apiFetch('/projects/update', { method: 'POST', body: JSON.stringify({ id, name }) }),
          projectDelete: (id) => apiFetch('/projects/delete', { method: 'POST', body: JSON.stringify({ id }) }),
          userDelete: (email) => apiFetch('/admin/users/delete', { method: 'POST', body: JSON.stringify({ email }) }),
          userAccessId: (email, accessId) => apiFetch('/admin/users/access-id', { method: 'POST', body: JSON.stringify({ email, accessId }) }),
          accessBackfill: () => apiFetch('/admin/users/access-id/backfill', { method: 'POST', body: JSON.stringify({}) }),
          usersBulk: (team, people) => apiFetch('/admin/users/bulk', { method: 'POST', body: JSON.stringify({ team, people }) }),
          exportProject: (id) => apiFetch('/admin/export?project=' + encodeURIComponent(id)),
          exportTeam: (name) => apiFetch('/admin/export?team=' + encodeURIComponent(name)),
          importData: (payload) => apiFetch('/admin/import', { method: 'POST', body: JSON.stringify(payload) }),
          usersList: () => apiFetch('/admin/users'),
          userCreate: (u) => apiFetch('/admin/users', { method: 'POST', body: JSON.stringify(u) }),
          userUpdate: (u) => apiFetch('/admin/users/update', { method: 'POST', body: JSON.stringify(u) }),
          userResetPin: (email, pin) => apiFetch('/admin/users/reset', { method: 'POST', body: JSON.stringify({ email, pin }) }),
          userUnlock: (email) => apiFetch('/admin/users/unlock', { method: 'POST', body: JSON.stringify({ email }) }),
          resetsList: () => apiFetch('/admin/resets'),
          resetApprove: (id, pin) => apiFetch('/admin/resets/approve', { method: 'POST', body: JSON.stringify({ id, pin }) }),
          resetDismiss: (id) => apiFetch('/admin/resets/dismiss', { method: 'POST', body: JSON.stringify({ id }) }),
          accountAudit: (email) => apiFetch('/admin/audit' + (email ? '?email=' + encodeURIComponent(email) : '')),
          notifications: () => apiFetch('/notifications'),
          markRead: (ids, read = true) => apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids, read }) }),
          // Admin-only on the Worker: notifications are a shared log, and a team emptying
          // "all" would clear a record other people still work from.
          clearNotifs: () => apiFetch('/notifications/clear', { method: 'POST', body: JSON.stringify({}) }),
          markThreadsRead: (items, read = true) => apiFetch('/comments/read', { method: 'POST', body: JSON.stringify({ items, read }) }),
          // 5.0: `url` accompanies `path` on every page-addressed write, so the worker resolves the
          // record on the ORIGIN it was raised on. It rides along from the record itself.
          del: (rec) => apiFetch('/delete', { method: 'POST', body: JSON.stringify({ id: rec.parentId || rec.id, path: rec.page.path, url: rec.page.url }) }),
          // Delete just a reply (its OWN id — /delete removes that record + any children; a reply has none).
          delReply: (reply) => apiFetch('/delete', { method: 'POST', body: JSON.stringify({ id: reply.id, path: reply.page.path, url: reply.page.url }) }),
          revoke: (rec) => apiFetch('/revoke', { method: 'POST', body: JSON.stringify({ id: rec.parentId || rec.id, path: rec.page.path, url: rec.page.url }) }),
          setTeams: (rec, team, toTeam) => apiFetch('/teams', { method: 'POST', body: JSON.stringify({ id: rec.id, path: rec.page.path, url: rec.page.url, team, toTeam }) }),
          assign: (rec, assignee) => apiFetch('/assign', { method: 'POST', body: JSON.stringify({ id: rec.id, assignee }) }),
          // Phase 8: clustering + fragile areas + umbrella (fix at source).
          patterns: (min) => apiFetch('/patterns?minSize=' + (min || 3)),
          fragile: () => apiFetch('/fragile'),
          umbrella: (memberIds, summary) => apiFetch('/umbrella', { method: 'POST', body: JSON.stringify({ memberIds, summary }) }),
          // Phase 11: projects.
          projects: () => apiFetch('/projects'),
          createProject: (id, name, kind) => apiFetch('/projects/create', { method: 'POST', body: JSON.stringify({ id, name, kind }) }),
          /* Team management (admin). A team has a name, a colour and the projects it works on —
           * no credential of any kind, so there is nothing here to show once or rotate. */
          teamsList: () => apiFetch('/teams/list'),
          teamCreate: (name, color) => apiFetch('/teams/create', { method: 'POST', body: JSON.stringify({ name, color }) }),
          teamUpdate: (name, patch) => apiFetch('/teams/update', { method: 'POST', body: JSON.stringify({ name, ...patch }) }),
          teamDelete: (name, confirm) => apiFetch('/teams/delete', { method: 'POST', body: JSON.stringify({ name, confirm }) }),
          sessions: (email) => apiFetch('/admin/sessions' + (email ? '?email=' + encodeURIComponent(email) : '')),
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
          // Phase 7 D1 analytics (first-time-fix, dwell, reopen breakdown, inflow) + Phase 0 counters.
          insights: (from, to) => apiFetch('/insights?from=' + encodeURIComponent(from || '') + '&to=' + encodeURIComponent(to || '')),
          stats: (from, to) => apiFetch('/stats?from=' + encodeURIComponent(from || '') + '&to=' + encodeURIComponent(to || '')),
        };

    let login = null, refreshTimer = null, viewsLoaded = false;
    // Desktop-notification / chime state (Settings → Notifications). We track the unread count
    // between polls and only alert on a genuine INCREASE, after the first load has primed it
    // (so opening the dashboard never fires a burst for the existing backlog).
    let notifPrimed = false, lastUnread = 0;
    function playChime() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
        const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        o.start(); o.stop(ctx.currentTime + 0.36);
        o.onended = () => { try { ctx.close(); } catch {} };
      } catch {}
    }
    function maybeNotifyNewActivity() {
      const unread = (notifs || []).filter((n) => n.readAdmin === false).length;
      if (notifPrimed && unread > lastUnread && (prefs.desktopNotif || prefs.sound)) {
        const delta = unread - lastUnread;
        if (prefs.sound) playChime();
        if (prefs.desktopNotif && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const n = new Notification('Proofkit — ' + delta + ' new update' + (delta > 1 ? 's' : ''), {
              body: 'New activity on the review board.', tag: 'proofkit-activity', silent: !prefs.sound,
            });
            n.onclick = () => { try { window.focus(); view = 'notifs'; entryDetail = null; syncUrl(); syncNav(); render(); } catch {} };
          } catch {}
        }
      }
      lastUnread = unread; notifPrimed = true;
    }

    let lastAllEtag = '';
    async function loadData() {
      // Phase 3.1 conditional poll: skip the payload + server read when the admin scope is unchanged.
      try {
        const r = await store.allEtag(lastAllEtag);
        if (!(r && r.notModified)) { all = r.data; lastAllEtag = r.etag || lastAllEtag; }
      } catch (e) { all = await store.all().catch(() => all || []); }
      try { notifs = await store.notifications(); } catch (e) { notifs = notifs || []; }
      maybeNotifyNewActivity();   // OS notification / chime on a genuine unread increase
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

    // Poll on the admin's chosen cadence (Settings → Behavior; default ~5s). `refreshSecs:0`
    // turns polling off entirely (manual refresh still works). restartAutoRefresh() re-arms it
    // when the pref changes without a reload.
    //
    // Phase 3.2: when the `admin` SSE stream is up, the poll is not needed to carry changes —
    // the hub pushes them — so it stretches to a SAFETY NET (5 min) instead of stopping. A hub
    // that goes quiet without dropping the socket would otherwise strand the board silently,
    // and on this dashboard an idle poll is a conditional GET that 304s, so the net is cheap.
    // `refreshSecs:0` still means off: the admin asked for no polling, and SSE is why that is
    // now a reasonable thing to ask for.
    const SSE_NET_SECS = 300;
    let sseUp = false, stopStream = null;
    function pollSecs() {
      const secs = Number(prefs.refreshSecs) || 0;
      if (!secs) return 0;
      return sseUp ? Math.max(secs, SSE_NET_SECS) : secs;
    }
    function startAutoRefresh() {
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      const secs = pollSecs();
      if (secs > 0) refreshTimer = setInterval(() => { if (!document.hidden) loadData().catch(() => {}); }, secs * 1000);
      if (!startAutoRefresh._focusBound) { window.addEventListener('focus', () => loadData().catch(() => {})); startAutoRefresh._focusBound = true; }
    }
    function restartAutoRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } startAutoRefresh(); }

    // Subscribe to the admin scope. Idempotent — a second call is a no-op — so the two login
    // paths (fresh login, restored session) can both just ask for it. Null return = SSE is not
    // available here (local-demo, no key), and the unchanged poll is already the fallback.
    function startLiveUpdates() {
      if (stopStream || LOCAL) return;
      stopStream = startScopeStream('admin', {
        onChange: () => { if (!document.hidden) loadData().catch(() => {}); },
        onUp: () => { if (!sseUp) { sseUp = true; restartAutoRefresh(); } },
        onDown: (fatal) => {
          if (sseUp) { sseUp = false; restartAutoRefresh(); }
          if (fatal && stopStream) { stopStream = null; }   // browser will not retry; poll owns it now
        },
      });
    }
    function stopLiveUpdates() {
      if (stopStream) { stopStream(); stopStream = null; }
      if (sseUp) { sseUp = false; restartAutoRefresh(); }
    }

    /* An account session has no team key — the sentinel opens the board locally while
     * authHeaders() authenticates every call with the bearer token. */

    /* SIGN-IN IS A PAGE, on its own host. This board used to draw its own copy of the access card
     * whenever it had no session — a third implementation of one screen, on an origin where a
     * passkey enrolled here would not work on the sign-in host and vice versa. Credentials belong
     * to ONE origin now, and it is the one whose whole job is sign-in.
     *
     * ?return= carries where they were, so a session that expires on a ticket comes back to that
     * ticket rather than to the board root.
     *
     * THE GUARD. A board that redirects on every missing session, plus a sign-in that hands the
     * session back across origins, is two halves of a loop: if the handoff ever fails to take, the
     * two hosts bounce forever and the page never renders anything a person can act on. So a
     * second bounce inside a few seconds stops and shows the card in place instead. A form you can
     * submit is a bad outcome; a loop you cannot escape is a worse one. */
    const BOUNCE_KEY = 'pkSignInBounce';
    function toSignIn() {
      let last = 0;
      try { last = Number(sessionStorage.getItem(BOUNCE_KEY) || 0); } catch (e) {}
      const now = new Date().getTime();
      if (last && now - last < 6000) { showLogin(); return; }   // came straight back — do not loop
      try { sessionStorage.setItem(BOUNCE_KEY, String(now)); } catch (e) {}
      location.replace(signInUrl() + '?return=' + encodeURIComponent(location.href));
    }
    /* Cleared on a session that works, so the next genuine expiry redirects rather than inheriting
     * a stale mark and showing the fallback for no reason. */
    function signInSettled() { try { sessionStorage.removeItem(BOUNCE_KEY); } catch (e) {} }

    /* NO SIGN-IN ON THIS HOST. The boards are an authenticated surface at all times: every route
     * that finds no session leaves for the sign-in origin. What is left here is not a sign-in — it
     * is what the loop guard shows when LEAVING did not work.
     *
     * There used to be a full access-key card here, with its own submit, its own passkey route and
     * its own error states: a third implementation of one screen, and a second origin for a
     * credential to bind to. A passkey enrolled against this host would not work on the sign-in
     * host, and neither screen could be changed without someone remembering the other. */
    function showLogin() {
      if (!login) {
        const el = document.createElement('div');
        el.className = 'pk-signin-stop';
        el.innerHTML =
          '<div class="pk-signin-stop-in">' +
            '<h1 class="pk-signin-stop-h">Signing in did not stick</h1>' +
            '<p class="pk-signin-stop-p">You were sent to sign in and came straight back, which ' +
              'usually means the session could not be stored — most often a browser set to block ' +
              'site data for this site.</p>' +
            '<a class="pk-unlock-go pk-signin-stop-go" href="' + signInUrl() + '">Try again</a>' +
          '</div>';
        login = { el };
      }
      document.body.appendChild(login.el);
    }
    function hideLogin() { login && login.el.remove(); }

    // Reveal the gated-off stub and hide the app shell (init calls this when a
    // signed-in identity is parked off via TEAM_ENABLED). CSS keys `display` off
    // `:not([hidden])`, so toggling `hidden` is all that's needed.
    function showBlocked() {
      const b = $('#rvd-blocked'); const app = $('.pk-app');
      if (b) b.hidden = false;
      if (app) app.hidden = true;
    }


    // Deep-link: the on-page overlay's "View details" button lands here as `?detail=<id>` — open
    // that ticket's detail straight away (once data is loaded), then strip the param so a refresh
    // or Back doesn't re-trigger. Silently no-ops if the id isn't in this view's data.
    /* Apply the URL to the board. Runs once after the first load (`replace`, so we never push a
     * history entry the user did not create) and again on every popstate.
     *
     * A ticket id that is not in this board's data is NOT silently dropped — that is precisely
     * the shared-link case (wrong account, deleted ticket, or a team-masked record), and a blank
     * screen reads as broken. `missingDetail` makes render() explain it instead. */
    let missingDetail = '';   // last id we already explained, so Back/Forward doesn't re-nag
    function applyUrl(replace) {
      const u = readUrl();
      if (u.view) { view = u.view; syncNav(); }
      // Restore where in Organisation the link pointed, before render() reads either of them.
      if (u.orgTab) orgTab = u.orgTab;
      if (u.orgPath) orgPath = u.orgPath;
      const id = u.ticket ? idOfTicketNo(u.ticket) : '';
      let absent = '';
      if (id) {
        if (roots().find((x) => x.id === id) || all.find((x) => x.id === id)) entryDetail = id;
        else { entryDetail = null; absent = u.ticket; }   // report what the LINK said, not our lookup
      } else entryDetail = null;
      /* Always REPLACE when a path came in through `?pk=`: the query string was a transport, not
       * somewhere the person navigated to, and leaving it in history means Back returns to a URL
       * that only exists to bounce them here again. */
      let carried = false;
      try { carried = !!new URLSearchParams(location.search).get('pk'); } catch (e) {}
      syncUrl(replace || carried);   // normalises a legacy ?detail= into ?ticket= without adding an entry
      render();
      // Explain an unreachable ticket ONCE per id. Silence here is the failure mode: the whole
      // point of a shareable link is that the recipient learns why it did not open.
      if (absent && absent !== missingDetail) {
        missingDetail = absent;
        pkAlert({ title: 'Ticket not available', message: 'That ticket isn’t on this account — it may belong to another team, or it may have been deleted. Showing your queue instead.' });
      }
      if (!absent) missingDetail = '';
    }
    // Kept for its old call sites; it is now "restore from the URL", not "consume a one-shot param".
    function openPendingDetail() { applyUrl(true); }
    // Back / Forward inside the board. Never writes history here — that would fight the browser.
    window.addEventListener('popstate', () => { if (!getSession().key) return; applyUrl(true); });

    function init() {
      if (LOCAL) ensureDemoReset();
      buildQueueTabs();   // rebuild the tab bar for the Phase-1 Team Queue
      relabelNav();       // "Team Queue" + retire the Delivery nav
      syncNav();          // reflect the landing-view pref in the sidebar's active state
      const s = getSession();
      // `?builder=1` is the "log in as Builder" escape hatch used by the team-board name link.
      // Without it a team session visiting /reviewdash is bounced straight back to /teamdash and
      // could never reach the Builder sign-in. We drop the team identity and show the panel.
      let wantsBuilder = false;
      try { wantsBuilder = new URLSearchParams(location.search).get('builder') === '1'; } catch (e) {}
      if (wantsBuilder && s.team !== ADMIN_TEAM) {
        clearSession();
        // Drop ONLY the escape-hatch flag. This used to reset to `location.pathname`, which threw
        // away the whole query — including the `ticket=` of a shared link the user is signing in
        // to open. The destination has to survive the login, so keep everything else.
        try { const u = new URL(location.href); u.searchParams.delete('builder'); history.replaceState(null, '', u.pathname + (u.search || '')); } catch (e) {}
        toSignIn(); return;
      }
      /* A team session asking for the BUILDER board. Unlike asking for another team's board —
       * which the team board silently resets, because it is just a typo — this is a coherent
       * thing to want, so it gets an answer: offer the upgrade, then return them to their own
       * board either way.
       *
       * A shared ticket link is the exception: they were SENT somewhere, so carry the ticket to
       * their own board and say nothing. Prompting there would be answering a question nobody
       * asked. */
      if (s.key && s.team && s.team !== ADMIN_TEAM) {
        let ticket = '';
        try { ticket = readUrl().ticket || ''; } catch (e) {}
        const home = ticket ? boardBase(s.team) + '/tickets/' + encodeURIComponent(ticket) : boardHome(s.team);
        if (ticket) { location.replace(home); return; }
        pkConfirm({
          title: 'Builder access',
          message: 'The Builder board is the admin view — your ' + s.team + ' key does not open it. '
            + 'Sign in with the Builder key to upgrade access, or go back to your own board.',
          confirmLabel: 'Sign in as Builder',
          cancelLabel: 'Back to my board',
        }).then((yes) => {
          if (yes) { clearSession(); location.replace(boardHome(ADMIN_TEAM) + '?builder=1'); }
          else location.replace(home);
        }).catch(() => location.replace(home));
        return;
      }
      // Defence-in-depth: a signed-in identity parked off via TEAM_ENABLED gets the
      // "no access" stub, not the app. Builder/ADMIN_TEAM is always enabled, so this
      // is belt-and-braces rather than a path hit in normal operation.
      if (s.key && s.team && !isTeamEnabled(s.team)) { showBlocked(); return; }
      if (s.key && s.team === ADMIN_TEAM) {
        loadData().then(() => { signInSettled(); openPendingDetail(); startAutoRefresh(); startLiveUpdates(); }).catch((e) => {
          if (e.message === 'unauthorized') { clearSession(); toSignIn(); }
          else { $('#rvd-empty').hidden = false; $('#rvd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else toSignIn();
    }

    // Rebuild the Team Queue tab bar (the shell markup carries the retired lifecycle tabs).
    function buildQueueTabs() {
      const el = $('#pk-tabs'); if (!el) return;
      el.innerHTML =
        `<button class="pk-tab is-active" data-tab="all">All <span class="pk-tab-n">[0]</span></button>` +
        `<button class="pk-tab" data-tab="page">By Page <span class="pk-tab-n">[0]</span></button>`;
      tab = 'all';
    }
    // Relabel Overview→Team Queue and retire the Delivery (deploy-gate) nav item.
    function relabelNav() {
      const nav = (v) => document.querySelector('.pk-nav[data-view="' + v + '"]');
      // Relabel the TEXT ONLY — `textContent =` would wipe the button's icon (and any badge).
      const dash = nav('dash');
      if (dash) {
        const t = [].find.call(dash.childNodes, (n) => n.nodeType === 3 && n.textContent.trim());
        if (t) t.textContent = 'Queue'; else if (!dash.querySelector('svg')) dash.textContent = 'Queue';
      }
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
      const slug = TEAM_COLORS[team] ? team.toLowerCase() : 'none';
      return `<span class="pk-team-chip pk-team-chip--${slug}">${esc(team)}</span>`;
    };
    // ---- change-type vocab (Feature 1) — shared from config; `general` = no typed fields ----
    const typeMeta = (t) => COMMENT_TYPES.find((x) => x.value === t) || null;
    // Every card carries a change-type chip — `general` (the freeform default) shows "General"
    // too, so the category band is present at all times; unknown/missing types fall back to it.
    const typeLabel = (c) => { const m = typeMeta((c && c.commentType) || 'general'); return m ? m.label : ''; };
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
        return `<div class="pk-field"><div class="pk-field-k">${esc(f.label)}</div><div class="pk-field-v">${esc(v)}</div></div>`;
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
        else { el.classList.add('is-empty'); el.innerHTML = `<span class="pk-thumb-ph">preview unavailable</span>`; }
      }
    }
    const thumbTile = (imageId, big) => imageId
      ? `<span class="pk-thumb${big ? ' pk-thumb-lg' : ''}" data-imgid="${esc(imageId)}"><span class="pk-thumb-ph">preview…</span></span>`
      : '';
    // Display context line (screen resolution + display scale). The browser can't split OS scaling
    // from browser zoom, so `dpr` is the combined value — labelled as such.
    const displayText = (d) => !d ? '—' :
      `Screen ${d.physW || '?'}×${d.physH || '?'} px (${d.screenW || '?'}×${d.screenH || '?'} CSS) · ` +
      `Display scale ${d.dpr || '?'}× (OS scaling × browser zoom) · Viewport ${d.viewportW || '?'}×${d.viewportH || '?'}`;

    // ---- real-time status (Builder framing) ----
    const TEAM_STATUS = {
      to_be_initiated: ['tbi', 'TBI'],
      in_progress: ['inprog', 'In Progress'],
      deployed_live: ['deployed', 'Deployed – Pending Confirmation'],
      reopened: ['reopened', 'Reopened'],
      disregarded: ['disregarded', 'Invalid — Closed'],
      needs_clarification: ['clarify', 'Need Clarity'],
    };
    const teamStatusOf = (c) => (TEAM_STATUS[c && c.teamStatus] ? c.teamStatus : 'to_be_initiated');
    // A confirmed deployed fix shows as its own terminal "Bug Closed" state — a display overlay on
    // deployed_live keyed off bugFixConfirmed (the raiser has signed off), not a real teamStatus.
    // Mirrors the raiser-side pseudo-status in teamdash.js. [cssClass, label].
    const BUG_CLOSED = ['verified', 'Bug Closed'];
    // Revoked is a display overlay too — the raiser pulled the comment back before Builder started it.
    // It must WIN over teamStatus: a revoked record keeps whatever teamStatus it had (usually
    // to_be_initiated), so reading the status alone renders it as live work. Styled like a close.
    const REVOKED = ['disregarded', 'Revoked'];
    const isBugClosed = (c) => teamStatusOf(c) === 'deployed_live' && !!(c && c.bugFixConfirmed);
    const statusPair = (c) => (c && c.revoked) ? REVOKED : (isBugClosed(c) ? BUG_CLOSED : TEAM_STATUS[teamStatusOf(c)]);
    const statusLabel = (c) => statusPair(c)[1];
    const displayState = (c) => statusPair(c)[0];
    // Phase 6: auto-verify badge (copy/link fixes checked against the live page on Mark Complete).
    const verifChip = (c) => {
      const v = c && c.verification; if (!v || !v.status) return '';
      // Colour is a modifier class, not `style=` — the host CSP (`style-src 'self'`) drops attributes.
      const map = { verified: '✓ Auto-verified', mismatch: '⚠ Content mismatch', unreachable: 'Verify: unreachable' };
      const m = map[v.status]; if (!m) return '';
      return ` <span class="pk-status-chip pk-status-chip--${v.status}" title="${esc(v.found || '')}">${m}</span>`;
    };
    const statusChip = (c) => {
      if (c && c.revoked) return `<span class="pk-status-chip pk-status-chip--revoked">Revoked</span>`;
      const [cls, label] = statusPair(c); return `<span class="pk-status-chip ${cls}">${label}</span>` + verifChip(c);
    };
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
    // The chain's ORIGIN root record — where read-state (and replies) live. A resubmitted ticket's
    // live card is a sub-ticket (parentId set), so read/unread must key off the origin, not the card.
    const threadOrigin = (r) => all.find((x) => x.id === chainOf(r)) || r;
    // On-page pin number = the per-page sequence stored on the chain's ORIGIN root (the pinned
    // record); admin sees every page's pins, so this always matches the page. '' for legacy records.
    const pinNoOf = (rec) => { const o = all.find((x) => x.id === chainOf(rec)); return o && o.pageSeq ? o.pageSeq : ''; };

    let all = [], notifs = [], tab = 'all', teamFilter = '', entryDetail = null, view = 'dash', search = '', sort = 'new';

    /* ---- URL as state: real paths under /proofkit -----------------------------------------
     * Every dashboard URL is a clean, hierarchical path — no query strings, no opaque ids:
     *
     *   /proofkit                      the queue (home)
     *   /proofkit/tickets/<number>     a ticket, addressed by its HUMAN ticket number
     *   /proofkit/notifications · /threads · /patterns · /insights · /settings
     *
     * The path carries the ticket NUMBER (`rec.ticket`, e.g. 2608010001), not the internal
     * record id — that is what makes a link readable and quotable in a message. Records that
     * predate ticket numbering fall back to their id so their URLs still work.
     *
     * Legacy `?detail=` / `?ticket=` (what the on-page overlay's "View details" still sends, and
     * any 3.96.0-era link) are accepted on arrival and normalised into a path, so nothing that
     * already exists in someone's history or notes breaks.
     * -------------------------------------------------------------------------------------- */
    /** Ticket number for a record id — the URL-facing identifier. Falls back to the id. */
    function ticketNoOf(id) {
      const r = all.find((x) => x.id === id);
      return (r && r.ticket) ? String(r.ticket) : id;
    }
    /** Resolve a URL segment back to a record id. Accepts a ticket number OR a raw id. */
    function idOfTicketNo(no) {
      if (!no) return '';
      const byTicket = all.find((x) => String(x.ticket || '') === String(no));
      if (byTicket) return byTicket.id;
      return all.find((x) => x.id === no) ? no : no;   // unknown ids pass through so they can be reported
    }
    function readUrl() {
      /* `?pk=` is a path that arrived through the 404 fallback.
       *
       * A static host cannot serve /builder/people/<email> — there is no such file — so it serves
       * 404.html, which hands the path here as a parameter. Read it as if it had been the path all
       * along and put the real address back (see applyUrl), so the link somebody shared is the link
       * they end up looking at rather than a query string. */
      let segs = [];
      try {
        let pathname = location.pathname;
        const q0 = new URLSearchParams(location.search);
        const carried = q0.get('pk');
        if (carried) pathname = myBase() + (carried.startsWith('/') ? carried : '/' + carried);
        segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      } catch { return { view: '', ticket: '' }; }
      /* ONE parser, in config.js. This used to drop `base + 1` segments inline, which hard-coded
       * the assumption that an identity is always in the path — the assumption this host breaks. */
      const rest = routeParts(pathname).rest;   // `pathname` may be the ?pk= carry, not location's
      // Legacy query params still win when present — they are only ever produced by older links.
      let q = null;
      try { q = new URLSearchParams(location.search); } catch {}
      const legacy = q ? (q.get('ticket') || q.get('detail') || '') : '';
      if (legacy) return { view: 'dash', ticket: legacy };
      // 7.4: Builder lands on the tiled Home. The queue keeps the internal name 'dash' so every
      // existing `view === 'dash'` branch is untouched — only its URL moved to /queue. Team boards
      // parse their own URLs, so their queue stays at their root.
      if (!rest.length) return { view: 'home', ticket: '' };
      if (rest[0] === 'tickets') return { view: 'dash', ticket: rest[1] || '' };
      if (rest[0] === 'queue') return { view: 'dash', ticket: '' };
      /* The Organisation lists and everything under them. `projects` also arrives from older links
       * that only ever meant the list, and those still land on the list — the extra segments are
       * simply absent. */
      if (rest[0] === 'projects' || rest[0] === 'teams' || rest[0] === 'people') {
        const dec = (x) => { try { return decodeURIComponent(x || ''); } catch (e) { return x || ''; } };
        const tab = rest[0];
        const org = { project: null, team: null, person: null };
        if (tab === 'projects') {
          if (rest[1]) org.project = dec(rest[1]);
          if (rest[2]) org.team = dec(rest[2]);
          if (rest[3]) org.person = dec(rest[3]);
        } else if (tab === 'teams') {
          if (rest[1]) org.team = dec(rest[1]);
          if (rest[2]) org.person = dec(rest[2]);
        } else if (rest[1]) org.person = dec(rest[1]);
        return { view: 'org', ticket: '', orgTab: tab, orgPath: org };
      }
      const v = SEGMENT_VIEWS[rest[0]];
      return { view: v && v !== 'queue' ? v : 'home', ticket: '' };
    }
    /** The path this board's current state should live at. */
    /** This board's root — Builder is the only identity that renders here. */
    const myBase = () => boardBase(ADMIN_TEAM);
    function pathFor(v, detailId) {
      if (detailId) return myBase() + '/tickets/' + encodeURIComponent(ticketNoOf(detailId));
      if (v === 'home') return myBase() || '/';          // the tiles are the board root ('' is not a url)
      if (v === 'dash') return myBase() + '/queue';      // …so the queue needs its own segment
      /* ORGANISATION IS A PATH, NOT A PAGE.
       *
       * Every screen under it — the three lists, a project, a team, a person — used to share one
       * address, so a reload dropped you back at the top, Back walked out of the module instead of
       * up a level, and a link to "Alvar's account" was a link to the projects list. The URL now
       * carries what you are looking at:
       *
       *   /projects · /teams · /people
       *   /projects/<project> · /projects/<project>/<team> · /projects/<project>/<team>/<email>
       *   /teams/<team> · /people/<email>
       *
       * Segments are encoded, so a team called "Legal Ops" and an email both survive the trip. */
      if (v === 'org') {
        const parts = [orgTab];
        if (orgTab === 'projects' && orgPath.project) parts.push(orgPath.project);
        if (orgPath.team) parts.push(orgPath.team);
        if (orgPath.person) parts.push(orgPath.person);
        return myBase() + '/' + parts.map(encodeURIComponent).join('/');
      }
      const seg = VIEW_SEGMENTS[v];
      return seg ? myBase() + '/' + seg : (myBase() || '/');
    }
    /* Write the current view + open ticket to the address bar. `replace` for state the user did
     * not navigate to (first paint, normalising a legacy link) so we never add a history entry
     * they did not create; push otherwise, which is what gives them Back. */
    function syncUrl(replace) {
      try {
        const next = pathFor(view, entryDetail);
        if (next === location.pathname && !location.search) return;   // no-op: don't stack duplicates
        history[replace ? 'replaceState' : 'pushState'](null, '', next);
      } catch (e) {}
    }
    /* Single funnel for opening/closing a ticket, so every entry point (row click, ⋮ menu,
     * keyboard, detail prev/next, Back) lands in the same place and the URL cannot drift. */
    function setDetail(id, replace) {
      entryDetail = id || null;
      syncUrl(replace);
      render();
    }
    // Queue direction is a CONTROL on the single Queue view, not a nav destination:
    // 'inbound' = tickets directed to Builder · 'outbound' = tickets Builder raised for a team.
    let dir = 'inbound';
    // Status filter — a chip row on the Queue. 'open' (TBI + In Progress) is the default working
    // set (zero regression). Lifecycle slices + smart 'needsyou' + the 'all'/archive slices let the
    // single Queue reach every status a ticket can hold (Needs Clarification, Deployed, Revoked…).
    let statusFilter = 'open';
    let statusMoreOpen = false;
    // Queue density: 'cards' (the working card list, filtered by direction + status) or 'table'
    // (the full ledger — every ticket, both directions, all statuses; the old Master Log view).
    let density = 'cards';
    // Primary chips render inline; non-primary sit behind a "More" disclosure.
    const STATUS_CHIPS = [
      { f: 'needsyou', label: 'Needs You', primary: true, smart: true },
      { f: 'open', label: 'Open', primary: true },
      { f: 'deployed_live', label: 'Deployed', primary: true },
      { f: 'to_be_initiated', label: 'TBI', primary: false },
      { f: 'in_progress', label: 'In Progress', primary: false },
      { f: 'reopened', label: 'Reopened', primary: false },
      { f: 'needs_clarification', label: 'Need Clarity', primary: true },
      { f: 'all', label: 'All', primary: false },
      { f: 'verified', label: 'Bug Closed', primary: false },
      { f: 'disregarded', label: 'Invalid', primary: false },
      { f: 'revoked', label: 'Revoked', primary: false },
    ];
    // Feature 11 (Team views) + Feature 12 (Insights) state.
    let savedViews = [], activeViewName = '';
    let metricsData = null, metricsFrom = '', metricsTo = '';
    /* Active Settings sub-nav section. Seeded from a one-shot handoff so a round trip through the
     * auth page returns to the tab the user actually left — landing them back on Appearance after
     * signing in specifically to enrol a passkey would make them find their place again. */
    let settingsSection = 'org';
    try {
      const want = sessionStorage.getItem('pkSettingsSection');
      if (want) { settingsSection = want; sessionStorage.removeItem('pkSettingsSection'); }
    } catch (e) {}
    /* Where we are inside Organisation. The hierarchy IS the navigation — projects contain teams
     * contain people — so one path replaces what used to be four sibling screens each re-stating
     * the same structure. Null means "the level above this one". */
    let orgPath = { project: null, team: null, person: null };
    /* WHICH LIST THE ORGANISATION MODULE OPENS ON.
     *
     * Projects → teams → people was a containment tree, and it stopped being true the moment a team
     * could work on several projects: the team page lists the projects it is in, and the same team
     * appears in every one of their branches. Teams and people are instance-wide — a team name is
     * globally unique and so is an email — so each gets a flat list of its own, and all three drill
     * into the SAME team and person pages rather than a second copy of them.
     *
     * The project page keeps its own Teams card. "Who works on this project" is membership; this is
     * the team itself. Two questions that happen to share a noun. */
    let orgTab = 'projects';   // projects | teams | people
    /* Which project the BOARD is looking at. '' means all of them — the Builder's cross-boundary
     * view, and what this dashboard has always shown, so the default changes nothing.
     *
     * It is a lens, not a permission. Every team-scoped read is still governed by canSee(); this
     * only decides how much of what the Builder may already see is on screen at once.
     *
     * Persisted per browser: someone who works inside one project works inside it all week, and
     * re-choosing on every visit would be the kind of small tax that makes a feature go unused. */
    let projectScope = '';
    try { projectScope = localStorage.getItem('pkProjectScope') || ''; } catch (e) {}
    const projectQuery = () => (projectScope ? '?projectId=' + encodeURIComponent(projectScope) : '');

    let orgQuery = '';   // Organisation search. Fine at six teams; the point is thirty.
    /* Team multi-select on the project page. Off by default and left behind the More menu:
     * selecting is not what you come here to do, and a checkbox on every tile all the time
     * makes browsing feel like filing. */
    let teamSelectMode = false;
    const teamSel = new Set();
    /* The same for people, keyed by EMAIL — the one thing about a person that is unique
     * instance-wide, so a selection cannot follow a rename or point at two accounts. */
    let peopleSelectMode = false;
    const peopleSel = new Set();
    /* The recycle bin's picks, as "<kind>:<ref>" — a ref alone is not unique across kinds, and a
     * team called the same thing as a project would have shared a checkbox. No select MODE here,
     * unlike teams and people: clearing out is what you come to the bin to do, so the boxes are
     * always on. */
    const trashSel = new Set();
    let orgData = { projects: [], teams: [], users: [] };   // last load, for the delegated handlers
    /* What a team may do. Everyone used to have identical powers: anyone who could see a ticket
     * could resolve or reopen it. Order is least-to-most consequential. */
    const PERM_LABELS = [
      ['comment', 'Comment'],
      ['resolve', 'Mark resolved'],
      ['reopen', 'Reopen'],
      ['close', 'Close'],
      ['invite', 'Add people'],
    ];
    const sel = new Set();
    let selectMode = false;
    let lastSig = '';   // signature of the last-rendered data — lets polling skip no-op re-renders

    // ---- By Page: per-page expand/collapse state (persisted; a collapsed page hides its cards) ----
    const COLLAPSE_KEY = 'reviewCollapsedPages';
    const collapsedPages = (() => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch (e) { return new Set(); } })();
    const saveCollapsed = () => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedPages])); } catch (e) {} };
    const dataSig = () => JSON.stringify([all, notifs]);

    // ---- unread: chains touched since the last dashboard visit ----
    const SEEN_KEY = 'reviewLastSeen';
    const seenAt = localStorage.getItem(SEEN_KEY) || '';
    let seenMarked = false;
    const isNew = (c) => !!seenAt && (c.teamStatusAt || c.createdAt) > seenAt;

    // ================= Admin preferences (per-browser) =================
    // Everything the Settings view controls, cached in localStorage. The GLOBAL theme is the
    // one setting that is NOT here (it lives server-side via /settings); every pref below is
    // this-browser-only, so two admins can each keep their own density / sort / refresh cadence.
    const PREFS_KEY = 'reviewPrefs';
    // Curated accent presets — each sets BOTH the base red token and its hover shade so the
    // whole button system stays coherent. '' = the theme's own accent (no override).
    const ACCENTS = {
      '':       null,
      crimson:  { name: 'Crimson',  red: '#da291c', red2: '#b21f14' },
      blue:     { name: 'Ocean',    red: '#2563eb', red2: '#1d4ed8' },
      violet:   { name: 'Violet',   red: '#7c3aed', red2: '#6d28d9' },
      emerald:  { name: 'Emerald',  red: '#059669', red2: '#047857' },
      amber:    { name: 'Amber',    red: '#d97706', red2: '#b45309' },
    };
    const PREF_DEFAULTS = {
      density: 'comfortable',     // comfortable | compact
      accent: '',                 // key into ACCENTS ('' = theme default)
      reduceMotion: false,        // kill animations/transitions
      landingView: 'dash',        // nav view opened on load ('' = remember last)
      rememberView: false,        // persist the last-used view and reopen it
      lastView: 'dash',
      queueDensity: 'cards',      // Queue layout: cards | table (full ledger)
      defaultSort: 'new',         // new | old | page | team
      refreshSecs: 30,            // 0 = off; else poll cadence (seconds) — default 30s for everyone
      confirmDelete: true,        // guard destructive deletes with a modal
      notifEvents: { status: true, reply: true, directed: true, revoked: true },
      notifBadges: true,          // show unread counts on the nav
      desktopNotif: false,        // OS notifications on new activity
      sound: false,               // soft chime on new activity
      detailCollapsed: {},        // remembered open/closed of detail side sections
    };
    let prefs = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        return { ...PREF_DEFAULTS, ...saved, notifEvents: { ...PREF_DEFAULTS.notifEvents, ...(saved.notifEvents || {}) }, detailCollapsed: { ...(saved.detailCollapsed || {}) } };
      } catch { return JSON.parse(JSON.stringify(PREF_DEFAULTS)); }
    })();
    const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };
    // Reflect the visual prefs onto the DOM: density + reduce-motion are data-attributes the CSS
    // keys off; the accent overrides the two red tokens at :root (or clears the override).
    function applyPrefs() {
      const rvd = $('.rvd');
      if (rvd) {
        rvd.setAttribute('data-pk-density', prefs.density);
        rvd.toggleAttribute('data-pk-reduce', !!prefs.reduceMotion);
      }
      const root = document.documentElement.style;
      const a = ACCENTS[prefs.accent];
      if (a) { root.setProperty('--pk-red', a.red); root.setProperty('--pk-red-2', a.red2); }
      else { root.removeProperty('--pk-red'); root.removeProperty('--pk-red-2'); }
    }
    // Seed the initial view + sort from prefs BEFORE the toolbar dropdowns build below (they
    // read `sort`) and before the first render. Settings/Insights are valid landing views too.
    if (['new', 'old', 'page'].includes(prefs.defaultSort)) sort = prefs.defaultSort;
    (() => {
      const want = prefs.rememberView ? (prefs.lastView || prefs.landingView) : prefs.landingView;
      if (want) view = want;
    })();
    // Migration: 'outbound' is no longer a standalone view — it's the Queue's Outbound direction.
    // Map any persisted 'outbound' landing/last view onto the Queue with the direction preset.
    if (view === 'outbound') { view = 'dash'; dir = 'outbound'; }
    if (prefs.landingView === 'outbound') prefs.landingView = 'dash';
    if (prefs.lastView === 'outbound') prefs.lastView = 'dash';
    // Migration: 'clarify' is no longer a standalone view — it's the Queue's Needs Clarification chip.
    if (view === 'clarify') { view = 'dash'; statusFilter = 'needs_clarification'; }
    if (prefs.landingView === 'clarify') prefs.landingView = 'dash';
    if (prefs.lastView === 'clarify') prefs.lastView = 'dash';
    // Migration: 'entries' (Master Log) is now the Queue's Table density, not a standalone view.
    if (view === 'entries') { view = 'dash'; density = 'table'; }
    if (prefs.landingView === 'entries') prefs.landingView = 'dash';
    if (prefs.lastView === 'entries') prefs.lastView = 'dash';
    if (['cards', 'table'].includes(prefs.queueDensity)) density = prefs.queueDensity;
    applyPrefs();
    // Keep the sidebar's active state in step with `view` when it changes programmatically
    // (landing pref, deep-links) — the click handler already does this for user clicks.
    /* Slide the submenu's active marker to whichever sub-item is lit. Driven from JS because the
     * distance is a layout fact — it depends on how many items the group has and how tall each row
     * is — and a CSS-only version would have to hard-code offsets that break the moment an item is
     * added. Uses transform so the movement is composited rather than laying out every frame. */
    function positionSubnavMarker() {
      document.querySelectorAll('.pk-subnav').forEach((panel) => {
        const marker = panel.querySelector('.pk-subnav-marker');
        if (!marker) return;
        const active = panel.querySelector('.pk-nav--sub.is-active');
        if (!active) { marker.classList.remove('is-on'); return; }
        // Centre the 14px bar against the row, whatever the row height is.
        const y = active.offsetTop + (active.offsetHeight - marker.offsetHeight) / 2;
        marker.style.setProperty('--pk-marker-y', y + 'px');
        // Reveal only AFTER it has a position, so the first appearance is a fade rather than a
        // slide down from the top of the list.
        if (!marker.classList.contains('is-on')) requestAnimationFrame(() => marker.classList.add('is-on'));
      });
    }

    /* Which views live under which group in the sidebar. Patterns and Insights are ways of LOOKING
     * at the queue, not separate destinations, so they sit under it rather than beside it. */
    const NAV_GROUPS = { queue: ['dash', 'threads', 'patterns', 'insights'], org: ['org'] };

    function syncNav() {
      document.querySelectorAll('.pk-nav').forEach((n) => {
        // The group header highlights for any of its children, so the rail always shows where you
        // are even when the group is collapsed.
        const g = n.dataset.group;
        const inGroup = g && (NAV_GROUPS[g] || []).includes(view);
        /* Inbound and Outbound share data-view="dash" and differ only by direction, so matching
         * on the view alone would light both at once. Projects, Teams and People do the same thing
         * with data-org-tab — one view, three lists. */
        const onView = n.dataset.view === view
          && (!n.dataset.dir || n.dataset.dir === dir)
          && (!n.dataset.orgTab || n.dataset.orgTab === orgTab);
        n.classList.toggle('is-active', onView || !!inGroup);
      });
      positionSubnavMarker();

      /* Follow the view: open the group you are inside, close the ones you are not. Only opening
       * left the submenu hanging open on Home, which reads as four top-level items again. */
      Object.keys(NAV_GROUPS).forEach((key) => {
        const inside = NAV_GROUPS[key].includes(view);
        const head = document.querySelector(`.pk-nav--group[data-group="${key}"]`);
        const panel = document.querySelector(`.pk-subnav[data-subnav="${key}"]`);
        if (!head || !panel) return;
        head.setAttribute('aria-expanded', inside ? 'true' : 'false');
        panel.classList.toggle('is-open', inside);
      });
    }

    // ---- search / sort ----
    function matchesSearch(c) {
      if (!search) return true;
      const a = c.anchor || {};
      const tf = c.templateFields || {};
      return [c.comment, c.changeTo, c.summary, c.expectedOutcome, c.page && c.page.path, c.name, c.team, c.toTeam,
        c.reopenReason, reopenLabelOf(c), c.reopenNote, c.disregardNote, a.snippet, a.tag, ...Object.values(tf)]
        .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
    }
    function sortRoots(rs) {
      const s = rs.slice();
      if (sort === 'old') s.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      // 5.0: sort on host+path so each origin forms a contiguous block instead of interleaving
      // two sites' identical paths.
      else if (sort === 'page') s.sort((a, b) => pageGroupKey(a.page).localeCompare(pageGroupKey(b.page)) || (a.createdAt < b.createdAt ? 1 : -1));
      else s.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return s;
    }
    // Team Queue roots for the current view (tab + team + search + sort).
    // Inbound = tickets directed to Builder (To = Builder, or legacy blank → Builder). Outbound =
    // tickets Builder raised for another team (From = Builder). The team-chip filter matches the
    // COUNTERPARTY: who SENT it (From) on Inbound, who it was SENT TO (To) on Outbound.
    const isOutbound = () => dir === 'outbound';
    // A ticket has an OPEN question when its newest reply came from the counterparty (not Builder) —
    // i.e. someone asked and Builder hasn't answered yet. Drives the "Needs you" smart filter.
    const hasOpenQuestion = (c) => { const rp = repliesOf(c); return rp.length > 0 && (rp[rp.length - 1].team || '') !== ADMIN_TEAM; };
    // "Needs you" = the actionable slice for Builder: a fresh ticket to start (TBI) or an unanswered
    // question. Deployed work (Pending Confirmation or Bug Closed — both deployed_live) is out of
    // Builder's hands even with an open question, so it never surfaces here.
    const needsYou = (c) => teamStatusOf(c) !== 'deployed_live' && (teamStatusOf(c) === 'to_be_initiated' || hasOpenQuestion(c));
    // Does a root pass the active status chip? (Direction + revoked are applied by currentRoots.)
    function statusMatch(c, f) {
      const s = teamStatusOf(c);
      switch (f) {
        case 'all': return true;
        case 'open': return inQueue(c);
        case 'needsyou': return needsYou(c);
        case 'revoked': return true; // the revoked set is already isolated upstream
        case 'deployed_live': return s === 'deployed_live' && !c.bugFixConfirmed; // live, awaiting sign-off (Bug Closed is its own slice)
        case 'verified': return isBugClosed(c); // deployed + raiser-confirmed → Bug Closed
        default: return s === f; // to_be_initiated | in_progress | reopened | needs_clarification | disregarded
      }
    }
    // The direction-filtered set BEFORE the status chip — the pool the chip counts are drawn from.
    function directionRoots() {
      const out = isOutbound();
      let rs = roots().filter((c) => out ? (c.team === ADMIN_TEAM) : ((c.toTeam || ADMIN_TEAM) === ADMIN_TEAM));
      if (teamFilter) rs = rs.filter((c) => (out ? (c.toTeam || '') : (c.team || '')) === teamFilter);
      return rs.filter(matchesSearch);
    }
    function currentRoots() {
      // Revoked (soft-deleted) tickets surface ONLY under the Revoked chip; every other chip hides them.
      let rs = directionRoots().filter((c) => statusFilter === 'revoked' ? c.revoked : !c.revoked);
      rs = rs.filter((c) => statusMatch(c, statusFilter));
      return sortRoots(rs);
    }
    // Count for a status chip within the current direction + team + search context.
    function statusCount(f) {
      return directionRoots().filter((c) => (f === 'revoked' ? c.revoked : !c.revoked) && statusMatch(c, f)).length;
    }
    // The status-chip row on the Queue. Primary chips render inline; the rest live behind "More".
    // Each chip carries its live count; the active chip is a solid fill. Clicking is a pure filter —
    // it never changes the view, so search / sort / direction / scroll all stay put.
    function renderStatusChips() {
      const host = $('#pk-statuschips'); if (!host) return;
      // `i` is the chip's position in the revealed run — CSS staggers the sweep-in off it.
      const chip = (c, i) => {
        const n = statusCount(c.f);
        const on = statusFilter === c.f;
        const extra = i === undefined ? '' : ` pk-schip--extra" style="--i:${i}`;
        return `<button class="pk-schip${on ? ' is-active' : ''}${c.smart ? ' pk-schip--smart' : ''}${extra}" type="button" role="tab" aria-selected="${on}" data-f="${c.f}">` +
          `${esc(c.label)}${n ? `<span class="pk-schip-n">${n}</span>` : ''}</button>`;
      };
      const overflow = STATUS_CHIPS.filter((c) => !c.primary);
      // If a non-primary chip is the active one, keep the drawer open so the selection stays visible.
      if (overflow.some((c) => c.f === statusFilter)) statusMoreOpen = true;
      host.innerHTML =
        STATUS_CHIPS.filter((c) => c.primary).map((c) => chip(c)).join('') +
        `<button class="pk-schip pk-schip--more${statusMoreOpen ? ' is-open' : ''}" type="button" aria-expanded="${statusMoreOpen}">More ${CARET}</button>` +
        (statusMoreOpen ? overflow.map((c, i) => chip(c, i)).join('') : '');
    }
    // Needs-Clarification bucket — every ticket involving Builder (raised BY or directed TO) that
    // has been parked in needs_clarification. Its own left-nav tab; it sits OUTSIDE the inbound
    // queue (currentRoots excludes it via inQueue). Honours search + sort like the queue.
    function clarifyRoots() {
      const rs = roots().filter((c) => teamStatusOf(c) === 'needs_clarification' && !c.revoked &&
        ((c.toTeam || ADMIN_TEAM) === ADMIN_TEAM || c.team === ADMIN_TEAM));
      return sortRoots(rs.filter(matchesSearch));
    }
    // Comments bucket — every ticket-chain that has ≥1 discussion reply (Quick-questions),
    // most-recent-activity first, honouring the search box. One place to catch up on + continue
    // every conversation; clicking a card opens its detail (thread + composer).
    const lastActivity = (r) => { const rp = repliesOf(r); return (rp.length ? rp[rp.length - 1].createdAt : (r.teamStatusAt || r.createdAt)) || ''; };
    function threadRoots() {
      const rs = roots().filter((c) => !c.revoked && repliesOf(c).length > 0).filter(matchesSearch);
      return rs.sort((a, b) => (lastActivity(a) < lastActivity(b) ? 1 : -1));
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
      } catch (e) { pkAlert('Copy failed — ' + e.message); }
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
    function downloadBlob(text, type, name) {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a'); aEl.href = url; aEl.download = name;
      document.body.appendChild(aEl); aEl.click(); aEl.remove(); URL.revokeObjectURL(url);
    }
    function downloadJSON() { downloadBlob(JSON.stringify(all, null, 2), 'application/json', 'proofkit-comments.json'); }
    // CSV export (Settings → Data): one row per record, RFC-4180 quoting. Excel-friendly (CRLF).
    function csvExport(list) {
      const cols = ['id', 'page', 'pin', 'raisedBy', 'directedTo', 'status', 'type', 'iteration', 'comment', 'changeTo', 'createdAt'];
      const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const rows = [cols.join(',')];
      list.forEach((c) => rows.push([c.id, c.page && c.page.path, pinNoOf(c), c.team, c.toTeam, statusLabel(c), typeLabel(c), c.iteration || 1, c.comment, c.changeTo || '', c.createdAt].map(q).join(',')));
      return rows.join('\r\n');
    }
    // Worker health probe (Settings → Data): round-trip a GET /settings and report status + latency.
    async function pingWorker(targetEl) {
      if (!WORKER_URL) { targetEl.textContent = 'Demo mode — no worker to ping.'; return; }
      targetEl.textContent = 'Pinging…';
      const t0 = Date.now();
      try {
        const r = await fetch(WORKER_URL + '/settings', { cache: 'no-store' });
        targetEl.textContent = (r.ok ? '✓ OK' : '⚠ HTTP ' + r.status) + ' · ' + (Date.now() - t0) + ' ms';
      } catch (e) { targetEl.textContent = '✕ Unreachable — ' + e.message; }
    }

    // Underline-tab chip (Figma 2053:11691): the active filter is a solid fill with white ink
    // (team colour, or brand red for "All Teams"); every inactive team is its colour as text
    // over a 1.5px bottom rule. A 1.5px border on all sides (transparent when inactive) keeps
    // the box a constant size so nothing shifts on switch.
    const teamChipHTML = (label, team) => {
      const active = teamFilter === team;
      let cls = '', dyn = '';
      if (active) {
        const accent = team ? ((TEAM_COLORS[team] || [])[1] || 'var(--pk-red)') : 'var(--pk-red)';
        dyn = ` data-pk-accent="${esc(accent)}"`;
      } else if (team) {
        // Team colour can't be enumerated in CSS — carried as a data-attr and applied via CSSOM
        // (paintDynamic), which the host CSP does not police, unlike a `style=` attribute.
        cls = 'pk-tchip--ghost'; dyn = ` data-pk-fg="${esc(teamStyle(team).fg)}"`;
      } else {
        cls = 'pk-tchip--ghost pk-tchip--none';
      }
      return `<button class="pk-tchip ${cls}${active ? ' is-active' : ''}" data-team="${esc(team)}"${dyn}>${esc(label)}</button>`;
    };
    // Collapsed by default: "From" + the selected filter + a ▸ arrow, stuck to the right
    // margin. The arrow (or the chip) opens the full team picker as a blurred overlay that
    // expands in place from the same rectangle.
    function buildTeamChips() {
      const host = $('#rvd-teamchips'); if (!host) return;
      host.innerHTML = '<span class="pk-chips-from">' + (isOutbound() ? 'To' : 'From') + '</span>' + teamChipHTML(teamFilter || 'All Teams', teamFilter || '') +
        '<button class="pk-chips-more" type="button" aria-label="Choose team" aria-haspopup="true" aria-expanded="false">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
        '</button>';
      host.querySelector('.pk-chips-more').addEventListener('click', openTeamOverlay);
      const sel = host.querySelector('.pk-tchip'); if (sel) sel.addEventListener('click', openTeamOverlay);
    }
    // The team picker is a horizontal reveal, not a pop-over. A fixed rail sits exactly over the
    // collapsed control; opening it grows a clipped "reveal" strip that lives between the selected
    // chip and the ▸ arrow. Because the rail is right-anchored, growing that strip slides the
    // "From" + selected chip leftward while the other teams unveil from behind the arrow. The dark,
    // blurred backdrop is delayed so it only kicks in once the chips are almost fully out.
    let teamOverlayEl = null;
    const onTeamOverlayKey = (e) => { if (e.key === 'Escape') closeTeamOverlay(); };
    function closeTeamOverlay() {
      if (!teamOverlayEl) return;
      const el = teamOverlayEl; teamOverlayEl = null;
      const reveal = el.querySelector('.pk-chips-reveal');
      const host = $('#rvd-teamchips');
      if (reveal) { reveal.style.width = reveal.scrollWidth + 'px'; reveal.getBoundingClientRect(); reveal.style.width = '0px'; }
      el.classList.remove('is-open');
      setTimeout(() => { el.remove(); if (host) host.style.visibility = ''; }, 320);
      document.removeEventListener('keydown', onTeamOverlayKey, true);
    }
    function openTeamOverlay() {
      closeTeamOverlay();
      const host = $('#rvd-teamchips'); if (!host) return;
      const r = host.getBoundingClientRect();
      // Every option except the one already showing as the anchor chip — those unveil on open.
      const opts = [{ label: 'All Teams', t: '' }, ...TEAMS.map((t) => ({ label: t, t }))]
        .filter((o) => o.t !== (teamFilter || ''));
      const ov = document.createElement('div'); ov.className = 'pk-chips-overlay';
      ov.innerHTML =
        '<div class="pk-chips-rail">' +
          '<span class="pk-chips-from">' + (isOutbound() ? 'To' : 'From') + '</span>' +
          teamChipHTML(teamFilter || 'All Teams', teamFilter || '') +
          '<span class="pk-chips-reveal">' + opts.map((o) => teamChipHTML(o.label, o.t)).join('') + '</span>' +
          '<button class="pk-chips-more is-open" type="button" aria-label="Close team picker" aria-expanded="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
          '</button>' +
        '</div>';
      document.body.appendChild(ov);
      teamOverlayEl = ov;
      const rail = ov.querySelector('.pk-chips-rail');
      const reveal = ov.querySelector('.pk-chips-reveal');
      rail.style.top = Math.round(r.top) + 'px';
      rail.style.right = Math.round(innerWidth - r.right) + 'px';
      host.style.visibility = 'hidden';
      ov.querySelectorAll('.pk-tchip').forEach((b) => b.addEventListener('click', () => {
        teamFilter = b.dataset.team; closeTeamOverlay(); buildTeamChips(); render();
      }));
      ov.querySelector('.pk-chips-more').addEventListener('click', closeTeamOverlay);
      ov.addEventListener('click', (e) => { if (e.target === ov) closeTeamOverlay(); });
      document.addEventListener('keydown', onTeamOverlayKey, true);
      requestAnimationFrame(() => {
        ov.classList.add('is-open');
        reveal.style.width = reveal.scrollWidth + 'px';
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
    // Stats-only view of the queue: smoke-test tickets are excluded from every metric tile/count,
    // while remaining visible in the lists so they can be located and deleted.
    const statRoots = () => families().filter((c) => !c.isTest);
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
      if (e === 'edited') return 'Edited' + (h.by ? ' by ' + h.by : '');
      if (e === 'resubmitted' || e === 'resubmit') return 'Resubmitted (TBI)';
      if (e === 'team-reset' || e === 'reset') return 'Moved back to TBI';
      if (e === 'team-start' || e === 'start' || st === 'in_progress') return 'Started — in progress';
      if (e === 'confirmed') return 'Bug Closed — raiser confirmed the fix';
      if (h.redirectTo) return 'Completed' + (h.by ? ' by ' + h.by : '') + ' — redirected to ' + h.redirectTo + ' (TBI)';
      if (e === 'team-complete' || e === 'complete' || st === 'deployed_live') return 'Deployed Live';
      if (e === 'team-reopen' || e === 'reopen' || st === 'reopened') {
        const label = reopenReasonLabel(h.reason) || h.reason || '';
        return 'Reopened' + (label ? ' — ' + label : '') + (h.note ? ' (' + h.note + ')' : '');
      }
      if (e === 'team-disregard' || e === 'disregard' || st === 'disregarded') {
        return 'Closed as invalid finding' + (h.note ? ' — ' + h.note : '');
      }
      if (e === 'team-clarify' || e === 'clarify' || st === 'needs_clarification') {
        return 'Need Clarity' + (h.note ? ' — ' + h.note : '');
      }
      return 'Status → ' + (st || '');
    }

    // A status token dot (STATUS_COLORS: teamStatus → --pk-* token) leading a count tile.
    // Colour via modifier class, not `style=` — the host CSP (`style-src 'self'`) drops style
    // attributes, which rendered these dots invisible. Classes live in design/components.css.
    const statusDot = (s) => `<span class="pk-count-dot pk-count-dot--${s}"></span>`;
    function counts() {
      // Tiles reflect the active section (Inbound vs Outbound), minus revoked.
      // `isTest` tickets are smoke-test artefacts: they stay VISIBLE in the queue (so they can be
      // found and deleted) but never contribute to a metric — so deleting one leaves stats untouched.
      const out = isOutbound();
      const rs = statRoots().filter((c) => !c.revoked && (out ? (c.team === ADMIN_TEAM) : ((c.toTeam || ADMIN_TEAM) === ADMIN_TEAM)));
      const tbi = rs.filter((c) => teamStatusOf(c) === 'to_be_initiated').length;
      const clar = rs.filter((c) => teamStatusOf(c) === 'needs_clarification').length;
      // Deployed Live = the TOTAL count Builder has pushed live, with OR without sign-off — every
      // deployed_live fix across ALL teams (confirmed "Bug Closed" ones included). Superset of the
      // Pending Signoff tile below; section-independent, so switching Inbound/Outbound doesn't change it.
      const live = statRoots().filter((c) => !c.revoked && teamStatusOf(c) === 'deployed_live').length;
      // Pending Signoff (admin only) = every deployed-but-unconfirmed fix across ALL teams,
      // not just the active Inbound/Outbound section — the org-wide sign-off backlog. A fix is
      // "pending signoff" while it is deployed_live and the raiser has not confirmed it
      // (bugFixConfirmed flips it to Bug Closed). Section-independent by design, so switching
      // Inbound/Outbound does not change it.
      // statRoots(), not roots() — this is a metric tile like its three siblings above, so a smoke-test
      // ticket must not move it. (It used roots() and was the one tile isTest still inflated.)
      const pendingSignoff = statRoots().filter((c) => !c.revoked && teamStatusOf(c) === 'deployed_live' && !c.bugFixConfirmed).length;
      $('#rvd-counts').innerHTML =
        `<span class="pk-count pk-count-tbi"><b>${tbi}</b><span class="pk-count-lbl">${statusDot('to_be_initiated')}TBI</span></span>` +
        `<span class="pk-count pk-count-clarify" title="Open Need Clarity" aria-label="Need Clarity — ${clar}; open the Need Clarity view"><b>${clar}</b><span class="pk-count-lbl">${statusDot('needs_clarification')}Need Clarity</span></span>` +
        `<span class="pk-count pk-count-done"><b>${live}</b><span class="pk-count-lbl">${statusDot('deployed_live')}Deployed live</span></span>` +
        `<span class="pk-count pk-count-reopened"><b>${pendingSignoff}</b><span class="pk-count-lbl">${statusDot('reopened')}Pending Signoff</span></span>`;
      updateBadges();
    }
    function updateBadges() {
      // Settings → Notifications can hide the unread nav counts entirely.
      const unread = (notifs || []).filter((n) => n.readAdmin === false).length;
      const nd = $('#rvd-badge-notifs'); if (nd) { nd.textContent = unread; nd.hidden = !unread || !prefs.notifBadges; }
      const cn = clarifyRoots().length;
      const cb = $('#rvd-badge-clarify'); if (cb) { cb.textContent = cn; cb.hidden = !cn; }
      const tn = roots().filter((c) => !c.revoked && repliesOf(c).length > 0).length;
      const tb = $('#rvd-badge-threads'); if (tb) { tb.textContent = tn; tb.hidden = !tn; }
    }

    function routeRow(root) {
      const chip = (t) => t ? teamChip(t) : `<span class="pk-team-chip rvd-team-none">—</span>`;
      return `<div class="rvd-route">` + chip(root.team) +
        `<span class="rvd-route-arrow" aria-hidden="true">→</span>` + chip(root.toTeam) + `</div>`;
    }


    // Team-Queue card — the canonical queue-card layout (Figma node 2044:10460), rendered by
    // the SHARED renderer (./card.js + ./card.css, `.pkc-*`) so the admin + team dashboards
    // stay in lock-step. Admin passes its role slots: bulk-select checkbox, the Open Pin +
    // lifecycle + ⋮ actions, and the `is-selected` class.
    // The card's longer-form labels (the chips use the terser TEAM_STATUS wording). Every teamStatus
    // needs a key here — a missing one silently falls back to "To Be Initiated", which is how a
    // closed-as-invalid ticket used to render as open work.
    const F_STATUS = { to_be_initiated: 'To Be Initiated', in_progress: 'In Progress', deployed_live: 'Deployed – Pending Confirmation', reopened: 'Reopened', needs_clarification: 'Need Clarity', disregarded: 'Invalid — Closed' };
    // The Start button is a SPLIT button (Builder): the main click does the normal tbi → in_progress;
    // the caret opens a menu with "Mark Complete — Directly" (tbi → deployed_live, skipping in_progress).
    const CARET = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    const startSplit = (id, cls) =>
      `<span class="pk-split">` +
        `<button class="${cls} pk-split-main" data-action="start" data-id="${id}">Start</button>` +
        `<button class="${cls} pk-split-caret" type="button" data-startmenu data-id="${id}" aria-label="More start options" aria-haspopup="menu">${CARET}</button>` +
      `</span>`;
    function openStartMenu(btn, rec) {
      openRowMenu(btn, rec, [
        { label: 'Mark Complete — Directly', icon: ICON.completeDirect, onSelect: () => doTeamAction(rec, 'complete') },
        redirectItem(rec),
      ]);
    }
    // "Redirect to team ▸" — hand the ticket to another team: complete-with-redirect re-targets
    // toTeam and lands it in that team's queue as TBI (same handoff the team dashboards use).
    function redirectItem(root) {
      const cur = root.toTeam || ADMIN_TEAM;
      return {
        label: 'Redirect to team', icon: ICON.teams,
        submenu: TEAMS.filter((t) => t !== cur).map((t) => ({ label: t, onSelect: () => doRedirect(root, t) })),
      };
    }
    async function doRedirect(rec, toTeam) {
      try { Object.assign(rec, await store.teamAction(rec, 'complete', '', '', toTeam)); counts(); render(); lastSig = dataSig(); }
      catch (e) { pkAlert('Could not redirect — ' + e.message); }
    }
    const fLifecycle = (root) => {
      // A revoked comment was pulled back by the raiser — it carries no lifecycle action, whatever
      // teamStatus it still holds. Without this the card offered "Start" on a withdrawn ticket.
      if (root.revoked) return '';
      const id = esc(root.id), st = teamStatusOf(root);
      if (st === 'to_be_initiated') return startSplit(id, 'pkc-btn');
      if (st === 'in_progress') return `<button class="pkc-btn" data-action="complete" data-id="${id}">Mark Complete</button>`;
      if (st === 'deployed_live') return `<button class="pkc-btn" data-action="reopen" data-id="${id}">Reopen</button>`;
      // A clarified item resumes back into the working queue (needs_clarification -> in_progress).
      if (st === 'needs_clarification') return `<button class="pkc-btn" data-action="start" data-id="${id}">Resume</button>`;
      return '';
    };
    const cardFigma = createCardRenderer({
      esc, fmt, teamStyle, thumbTile, pageName, repliesOf, typeLabel, displayState,
      // Same precedence as statusPair(): revoked wins, then Bug Closed, then the teamStatus label.
      statusText: (root) => root.revoked ? 'Revoked' : (isBugClosed(root) ? 'Bug Closed' : (F_STATUS[teamStatusOf(root)] || 'To Be Initiated')),
      selectSlot: (root) => selectMode
        ? `<input type="checkbox" class="pkc-sel" data-id="${esc(root.id)}"${sel.has(root.id) ? ' checked' : ''} aria-label="Select">` : '',
      actionsSlot: (root) => {
        const id = esc(root.id);
        return `<a class="pkc-btn" href="${esc(pinHref(root.page, root.id))}" target="_blank" rel="noopener">Open Pin</a>` +
          fLifecycle(root) +
          `<button class="pkc-more" type="button" data-id="${id}" aria-label="More actions" aria-haspopup="menu">` +
            `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
          `</button>`;
      },
      extraClass: (root) => (selectMode && sel.has(root.id)) ? ' is-selected' : '',
    });

    function revealClamps(host) {
      host.querySelectorAll('.rvd-comment-text.rvd-clamp').forEach((el) => {
        const btn = el.parentElement.querySelector('.pk-morebtn');
        if (btn) btn.hidden = el.scrollHeight <= el.clientHeight + 2;
      });
    }

    // Status actions per state: TBI→Start · In Progress→Mark Complete + Reopen ·
    // Deployed live→Reopen. Reopen prompts for a required reason.
    function lifecycleActions(root) {
      const id = esc(root.id);
      const s = teamStatusOf(root);
      // "Close as invalid" now lives in the detail ⋮ menu (not the bar); "Needs clarification"
      // stays inline as a quiet action. Both remain available only while the ticket is pre-terminal.
      // Isolated-design toolbar: every action leads with its icon, and the FIRST action of the
      // bar is the primary (red fill) so the next step is obvious at a glance.
      const ico = (k) => (ICON[k] ? `<span class="pk-a-ico">${ICON[k]}</span>` : '');
      const act = (action, label, iconKey, cls) =>
        `<button class="pk-a${cls ? ' ' + cls : ''}" data-action="${action}" data-id="${id}">${ico(iconKey)}${esc(label)}</button>`;
      const P = 'pk-a--primary';   // the lead action
      // ONLY the lead action lives on the bar (plus Open pin, added by the caller); every other
      // lifecycle action moves into the categorised ⋮ menu so the bar stays a clear next-step.
      const lead = lifecycleList(root)[0];
      return lead ? (lead.action === 'start' && s === 'to_be_initiated'
        ? startSplit(id, 'pk-a')
        : act(lead.action, lead.label, lead.icon, P)) : '';
    }

    // The lifecycle actions valid for a ticket, lead action first. One source of truth shared by
    // the detail bar (takes the lead) and the ⋮ menu (takes the rest).
    function lifecycleList(root) {
      const s = teamStatusOf(root);
      if (s === 'to_be_initiated') return [
        { action: 'start', label: 'Start', icon: 'start' },
        { action: 'complete', label: 'Mark deployed live', icon: 'completeDirect' },
        { action: 'clarify', label: 'Need Clarity', icon: 'clarify' }];
      if (s === 'in_progress') return [
        { action: 'complete', label: 'Mark Complete', icon: 'complete' },
        { action: 'reset', label: 'Move to TBI', icon: 'reset' },
        { action: 'reopen', label: 'Reopen ticket', icon: 'reopen' },
        { action: 'clarify', label: 'Need Clarity', icon: 'clarify' }];
      if (s === 'deployed_live') return [{ action: 'reopen', label: 'Reopen ticket', icon: 'reopen' }];
      if (s === 'needs_clarification') return [
        { action: 'start', label: 'Resume', icon: 'start' },
        { action: 'reset', label: 'Move to TBI', icon: 'reset' }];
      return [];
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

    // ---- disregard-and-close modal — closes a raised bug as an INVALID finding. Terminal. The
    // reason is REQUIRED (logged on the record + timeline, shared with the raising team). ----
    function openDisregardModal(onConfirm) {
      const el = document.createElement('div'); el.className = 'pk-reopen';
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Close as invalid finding">` +
          `<h2 class="pk-reopen-title">Close as invalid finding</h2>` +
          `<p class="pk-reopen-sub">Close this raised bug as an <b>invalid finding</b> — it isn’t a valid issue. This is final; it won’t be actioned or built.</p>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">Reason <span class="pk-u-req">· required</span></span>` +
            `<textarea class="pk-reopen-note" placeholder="Why is this an invalid finding? (logged + shared with the raising team)"></textarea></div>` +
          `<div class="pk-reopen-err" hidden></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="rvd-editbtn rvd-reopen-cancel">Cancel</button>` +
            `<button type="button" class="rvd-editbtn rvd-editsave rvd-reopen-go">Close as invalid</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      const note = el.querySelector('.pk-reopen-note');
      const err = el.querySelector('.pk-reopen-err');
      const close = () => el.remove();
      el.querySelector('.rvd-reopen-cancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      const go = () => {
        const n = note.value.trim();
        if (!n) { err.textContent = 'A reason is required to close a finding as invalid.'; err.hidden = false; note.focus(); return; }
        close();
        onConfirm({ note: n });
      };
      el.querySelector('.rvd-reopen-go').addEventListener('click', go);
      // ⌘/Ctrl+Enter from the note triggers the primary CTA (Close as invalid).
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
      note.focus();
    }

    // ---- needs-clarification modal — flags an inbound item as needing clarification. The item
    // leaves the inbound queue for the Needs-Clarification bucket; the note (the question) is
    // OPTIONAL and, when given, is logged on the timeline + shared with the raising team. ----
    function openClarifyModal(onConfirm) {
      const el = document.createElement('div'); el.className = 'pk-reopen';
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Mark as need clarity">` +
          `<h2 class="pk-reopen-title">Need Clarity</h2>` +
          `<p class="pk-reopen-sub">Move this into the <b>Need Clarity</b> bucket and let the raising team know what’s unclear. It leaves the inbound queue until you resume it.</p>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">What needs clarifying? <span class="pk-u-opt">· optional</span></span>` +
            `<textarea class="pk-reopen-note" placeholder="Ask the raising team what you need to proceed (shared with them)"></textarea></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="rvd-editbtn rvd-reopen-cancel">Cancel</button>` +
            `<button type="button" class="rvd-editbtn rvd-editsave rvd-reopen-go">Mark for clarity</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      const note = el.querySelector('.pk-reopen-note');
      const close = () => el.remove();
      el.querySelector('.rvd-reopen-cancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      const go = () => { close(); onConfirm({ note: note.value.trim() }); };
      el.querySelector('.rvd-reopen-go').addEventListener('click', go);
      // ⌘/Ctrl+Enter from the note triggers the primary CTA (Mark for clarification).
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
      note.focus();
    }

    // ---- status actions ----
    async function doTeamAction(rec, action) {
      if (action === 'clarify') {
        openClarifyModal(async ({ note }) => {
          try { Object.assign(rec, await store.teamAction(rec, 'clarify', '', note)); counts(); render(); lastSig = dataSig(); }
          catch (e) { pkAlert('Could not update — ' + e.message); }
        });
        return;
      }
      if (action === 'reopen') {
        openReopenModal(async ({ reason, note }) => {
          try { Object.assign(rec, await store.teamAction(rec, 'reopen', reason, note)); counts(); render(); lastSig = dataSig(); }
          catch (e) { pkAlert('Could not update — ' + e.message); }
        });
        return;
      }
      if (action === 'disregard') {
        openDisregardModal(async ({ note }) => {
          try { Object.assign(rec, await store.teamAction(rec, 'disregard', '', note)); counts(); render(); lastSig = dataSig(); }
          catch (e) { pkAlert('Could not update — ' + e.message); }
        });
        return;
      }
      try { Object.assign(rec, await store.teamAction(rec, action)); counts(); render(); lastSig = dataSig(); }
      catch (e) { pkAlert('Could not update — ' + e.message); }
    }
    async function rowDelete(root) {
      // Settings → Behavior can waive the confirm for power users; the default keeps the guard.
      if (prefs.confirmDelete && !(await pkConfirm({ title: 'Delete ticket', message: 'Delete this whole ticket chain (all iterations + replies)? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      try {
        await store.del(root);
        const rootId = root.parentId || root.id;
        all = all.filter((c) => c.id !== rootId && c.parentId !== rootId);
        counts(); render(); lastSig = dataSig();
      } catch (e) { pkAlert('Could not delete — ' + e.message); }
    }
    // Revoke = soft delete: it leaves every queue but stays in the Master Log stamped "Revoked".
    async function rowRevoke(root) {
      if (!(await pkConfirm({ title: 'Revoke comment', message: 'Revoke this comment? It is removed from everyone’s queue but stays in the Master Log as revoked.', confirmLabel: 'Revoke', danger: true }))) return;
      try {
        const rootId = root.parentId || root.id;
        const rec = await store.revoke(root);
        // reflect the flag locally so the UI updates without waiting for the next poll
        all = all.map((c) => (c.id === rootId ? { ...c, revoked: true, revokedAt: (rec && rec.revokedAt) || new Date().toISOString(), revokedBy: (rec && rec.revokedBy) || '' } : c));
        counts(); render(); lastSig = dataSig();
      } catch (e) {
        const started = e.message === 'already started' || e.message === 'HTTP 409';
        pkAlert(started ? 'Builder has already started this comment — it can no longer be revoked.' : 'Could not revoke — ' + e.message);
        if (started) { try { await loadData(); render(); } catch (_) {} } // resync the now-started status
      }
    }
    // The ⋮ menu, organised into groups (navigate · edit · status actions · utility · danger).
    // groupMenu() flattens the non-empty groups, inserting a divider between them.
    function rowMenuItems(root) {
      const s = teamStatusOf(root);
      const navigate = [
        { label: 'View details', icon: ICON.view, onSelect: () => setDetail(root.id) },
        { label: 'Open pin', icon: ICON.pin, onSelect: () => window.open(pinHref(root.page, root.id), '_blank', 'noopener') },
      ];
      // Edit the comment's CONTENT — opens the on-page overlay editor (new tab). Builder is admin,
      // so it may edit ANY comment at any status; the overlay + Worker snapshot the prior version.
      const edit = [{ label: 'Edit teams (From / To)', icon: ICON.teams, onSelect: () => openEditTeams(root) }];
      if (!root.revoked) edit.push({ label: 'Edit comment', icon: ICON.edit, onSelect: () => window.open(pinHref(root.page, root.id, { edit: true }), '_blank', 'noopener') });
      edit.push({ label: root.assignee ? ('Reassign — ' + root.assignee) : 'Assign…', icon: ICON.teams, onSelect: () => assignPrompt(root) });
      const acts = [];
      if (s === 'needs_clarification') acts.push({ label: 'Resume (clarified)', icon: ICON.start, onSelect: () => doTeamAction(root, 'start') });
      // Move a parked item back to TBI (was the Needs-Clarification view's status-tag action, now that
      // the view is folded into the Queue's Needs Clarification chip — see enhanceClarifyTags/reset).
      if (s === 'needs_clarification') acts.push({ label: 'Move to TBI', icon: ICON.reset, onSelect: () => doTeamAction(root, 'reset') });
      // Undo a Builder "Start" — send an in-progress item back to TBI.
      if (s === 'in_progress') acts.push({ label: 'Move to TBI', icon: ICON.reset, onSelect: () => doTeamAction(root, 'reset') });
      if (s === 'to_be_initiated') acts.push({ label: 'Start', icon: ICON.start, onSelect: () => doTeamAction(root, 'start') });
      if (s === 'to_be_initiated') acts.push({ label: 'Mark Complete — Directly', icon: ICON.completeDirect, onSelect: () => doTeamAction(root, 'complete') });
      if (s === 'to_be_initiated') acts.push(redirectItem(root));
      if (s === 'in_progress') acts.push({ label: 'Mark complete', icon: ICON.complete, onSelect: () => doTeamAction(root, 'complete') });
      if (s === 'in_progress' || s === 'deployed_live') acts.push({ label: 'Reopen', icon: ICON.reopen, onSelect: () => doTeamAction(root, 'reopen') });
      if (s === 'to_be_initiated' || s === 'in_progress') acts.push({ label: 'Need Clarity', icon: ICON.clarify, onSelect: () => doTeamAction(root, 'clarify') });
      if (s === 'to_be_initiated' || s === 'in_progress') acts.push({ label: 'Close as invalid finding', icon: ICON.disregard, onSelect: () => doTeamAction(root, 'disregard') });
      const util = [{ label: 'Copy prompt', icon: ICON.copy, onSelect: () => copyToClip(localPrompt(root), null) }];
      const danger = [];
      if (!root.revoked && s === 'to_be_initiated') danger.push({ label: 'Revoke Comment', danger: true, icon: ICON.revoke, onSelect: () => rowRevoke(root) });
      danger.push({ label: 'Delete', danger: true, icon: ICON.delete, onSelect: () => rowDelete(root) });
      return groupMenu([navigate, edit, acts, util, danger]);
    }
    // Flatten [group, group, …] → a flat item list with { divider:true } between non-empty groups.
    function groupMenu(groups) {
      const out = [];
      groups.filter((g) => g && g.length).forEach((g, i) => { if (i) out.push({ divider: true }); out.push(...g); });
      return out;
    }
    let rowMenuEl = null, rowMenuBtn = null;
    function closeRowMenu() {
      if (!rowMenuEl) return;
      rowMenuEl.remove(); rowMenuEl = null; rowMenuBtn = null;
      document.removeEventListener('click', onRowMenuDoc, true);
      document.removeEventListener('keydown', onRowMenuKey, true);
      window.removeEventListener('scroll', closeRowMenu, true);
      window.removeEventListener('resize', closeRowMenu);
    }
    // Outside-click closes the menu — but a click on the trigger that opened it is left
    // for that trigger's own handler to TOGGLE closed (below), so the icon doesn't
    // close-then-reopen the menu on a second click.
    function onRowMenuDoc(e) {
      if (!rowMenuEl) return;
      if (rowMenuEl.contains(e.target)) return;
      if (rowMenuBtn && rowMenuBtn.contains(e.target)) return;
      closeRowMenu();
    }
    function onRowMenuKey(e) { if (e.key === 'Escape') closeRowMenu(); }
    function openRowMenu(btn, root, customItems) {
      // Clicking the same icon again closes the open menu (toggle).
      if (rowMenuEl && rowMenuBtn === btn) { closeRowMenu(); return; }
      closeRowMenu();
      rowMenuBtn = btn;
      const rootItems = customItems || rowMenuItems(root);
      const menu = document.createElement('div'); menu.className = 'pk-rowmenu pk-rowmenu--rise';
      document.body.appendChild(menu); rowMenuEl = menu;
      const CHEV = '<svg class="pk-rowmenu-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';
      const BACK = '<svg class="pk-mi" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
      // Drill down IN PLACE: a `submenu` item swaps the panel's contents (with a back row) rather
      // than opening a second floating layer — one popup, one dismiss path, no nested positioning.
      function paint(items, parent, title) {
        menu.innerHTML =
          (parent ? `<button type="button" class="pk-rowmenu-item pk-rowmenu-back" data-back="1">${BACK}<span class="pk-rowmenu-lbl">${esc(title || 'Back')}</span></button><div class="pk-rowmenu-sep" role="separator"></div>` : '') +
          items.map((it, i) =>
            it.header ? `<div class="pk-rowmenu-h">${esc(it.header)}</div>`
            : it.divider ? '<div class="pk-rowmenu-sep" role="separator"></div>'
            : `<button type="button" class="pk-rowmenu-item${it.danger ? ' danger' : ''}" data-i="${i}">` +
                (it.icon || '<span class="pk-mi"></span>') + `<span class="pk-rowmenu-lbl">${esc(it.label)}</span>` +
                (it.submenu ? CHEV : '') + `</button>`).join('');
        const back = menu.querySelector('[data-back]');
        if (back) back.addEventListener('click', (ev) => { ev.stopPropagation(); paint(parent, null); });
        menu.querySelectorAll('.pk-rowmenu-item[data-i]').forEach((b) =>
          b.addEventListener('click', (ev) => {
            const it = items[+b.dataset.i];
            if (it.submenu) { ev.stopPropagation(); paint(it.submenu, items, it.label); return; }
            closeRowMenu(); it.onSelect();
          }));
        place();
      }
      function place() {
        const r2 = btn.getBoundingClientRect();
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        let left = r2.right - mw;
        if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
        if (left < 8) left = 8;
        let top = r2.bottom + 6;
        if (top + mh > innerHeight - 8) top = r2.top - mh - 6;
        if (top < 8) top = 8;
        menu.style.left = left + 'px'; menu.style.top = top + 'px';
      }
      paint(rootItems, null);
      setTimeout(() => {
        document.addEventListener('click', onRowMenuDoc, true);
        document.addEventListener('keydown', onRowMenuKey, true);
        window.addEventListener('scroll', closeRowMenu, true);
        window.addEventListener('resize', closeRowMenu);
      }, 0);
    }

    // Phase 9.1: assign / reassign a ticket to a builder (blank = unassign).
    async function assignPrompt(root) {
      const name = await pkPrompt({ title: 'Assign ticket', message: 'Assign to (builder name; leave blank to unassign):', value: root.assignee || '', confirmLabel: 'Assign' });
      if (name === null) return;
      try { Object.assign(root, await store.assign(root, name.trim())); counts(); render(); lastSig = dataSig(); }
      catch (e) { pkAlert('Could not assign — ' + e.message); }
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
        catch (e) { save.disabled = false; save.textContent = 'Save'; pkAlert('Could not save — ' + e.message); }
      });
    }

    // ---- Master Log / Table density: tabular log of ticket chains (live state), with drill-in ----
    // The table markup, shared by the Queue's Table density (#rvd-list) and any standalone use.
    function ledgerTableHTML(rs, title) {
      return `<div class="pk-entrieshead"><h2>${esc(title)} <span class="pk-u-count">(${rs.length})</span></h2></div>` +
        `<div class="pk-logwrap"><table class="pk-log"><thead><tr>` +
        `<th>Ticket</th><th>When</th><th>Page</th><th>From</th><th>To</th><th>Status</th><th>More</th>` +
        `</tr></thead><tbody>` +
        rs.map((c) => {
          return `<tr class="pk-logrow" data-id="${esc(c.id)}">` +
            `<td><span class="pk-ticket">${c.ticket ? esc(c.ticket) : '—'}</span></td>` +
            `<td>${esc(fmt(c.createdAt))}</td>` +
            `<td><a class="pk-pagecell" href="${esc(pageHref(c.page))}" target="_blank" rel="noopener">` +
              `<span class="pk-pagecell-t">${esc(pageLabel(c.page))}</span>` +
              `<span class="pk-pagecell-u">${esc(pageUrlText(c.page))}</span></a></td>` +
            `<td>${teamChip(c.team) || '—'}</td>` +
            `<td>${teamChip(c.toTeam) || '—'}</td>` +
            `<td>${statusChip(c)}</td>` +
            `<td class="pk-log-morecell"><button class="rvd-moreopts" data-more="${esc(c.id)}" aria-label="More options" aria-haspopup="menu">` +
              `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
            `</button></td>` +
          `</tr>`;
        }).join('') +
        `</tbody></table></div>`;
    }
    // Wire row clicks (drill-in) + ⋮ menus for a rendered ledger table inside `host`.
    function bindLedger(host) {
      host.querySelectorAll('.pk-logrow').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('a, .rvd-moreopts')) return;
          setDetail(tr.dataset.id);
        });
      });
      host.querySelectorAll('.rvd-moreopts').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const rec = roots().find((c) => c.id === b.dataset.more); if (rec) openRowMenu(b, rec);
        });
      });
    }
    // Standalone Master Log view (still reachable as a landing/deep-link target; the nav item is
    // retired in favour of the Queue's Table density, which renders the same table into #rvd-list).
    function renderEntries() {
      if (entryDetail) { renderEntryDetail(); return; }
      const rs = sortRoots(roots());
      $('#rvd-empty').hidden = rs.length > 0;
      const host = $('#rvd-entries');
      if (!rs.length) { host.innerHTML = ''; return; }
      host.innerHTML = ledgerTableHTML(rs, 'Master Log');
      bindLedger(host);
    }
    // The full ledger for the Table density — every ticket (both directions, all statuses, incl.
    // revoked), honouring only the toolbar search so it stays a useful superset of the card view.
    const ledgerRoots = () => sortRoots(roots().filter(matchesSearch));

    // The ordered ticket list backing the detail's Prev/Next — mirrors whichever view the
    // drill-in came from, so ‹/› step through exactly what's on screen behind it.
    function detailList() {
      if (view === 'dash') return density === 'table' ? ledgerRoots() : currentRoots();
      if (view === 'clarify') return clarifyRoots();
      if (view === 'threads') return threadRoots();
      return roots();
    }
    const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    // Full-screen screenshot lightbox (Esc / click-away to close).
    function openLightbox(src, caption) {
      const ov = document.createElement('div'); ov.className = 'rvd-lightbox'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.innerHTML = `<figure class="rvd-lightbox-fig"><img src="${esc(src)}" alt="${esc(caption || 'Screenshot')}">` +
        (caption ? `<figcaption>${esc(caption)}</figcaption>` : '') + `</figure>` +
        `<button class="rvd-lightbox-x" type="button" aria-label="Close">×</button>`;
      const close = () => { ov.remove(); document.removeEventListener('keydown', onk, true); };
      const onk = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('.rvd-lightbox-x')) close(); });
      document.addEventListener('keydown', onk, true);
      document.body.appendChild(ov);
    }

    // ---- revamped detail helpers (overlayUi === 'new') ----
    // The four lifecycle stages, resolved against the ticket's current teamStatus. Terminal
    // states (disregarded) collapse to "closed" so the stepper never implies pending work.
    const DETAIL_STAGES = [
      { key: 'raised', label: 'Raised' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'deployed_live', label: 'Deployed Live' },
      { key: 'signed', label: 'Signed off' },
    ];
    function stageIndexOf(c) {
      const st = teamStatusOf(c);
      if (c.bugFixConfirmed) return 3;
      if (st === 'deployed_live') return 2;
      if (st === 'in_progress') return 1;
      return 0;                       // to_be_initiated / reopened / needs_clarification / disregarded
    }
    function statusStepper(c) {
      const cur = stageIndexOf(c);
      return `<div class="pkd-status">${statusChip(c)}</div>` +
        `<ol class="pkd-steps">` + DETAIL_STAGES.map((sg, i) => {
          const cls = i < cur ? ' is-done' : (i === cur ? ' is-current' : '');
          const mark = i < cur ? '✓' : String(i + 1);
          return `<li class="pkd-step${cls}"><span class="pkd-step-n">${mark}</span>` +
                 `<span class="pkd-step-t">${esc(sg.label)}</span></li>`;
        }).join('') + `</ol>`;
    }
    // Full-width lifecycle band: real history events first, then the stages still to come.
    function fullTimeline(c, hist) {
      const cur = stageIndexOf(c);
      const done = (hist || []).map((h, i) => {
        const isLast = i === hist.length - 1;
        return `<div class="pkd-node${isLast ? ' is-current' : ' is-done'}"><span class="pkd-dot"></span>` +
          `<div class="pkd-stage">${esc(eventLabel(h))}</div>` +
          `<div class="pkd-actor">${esc(h.by || (h.event === 'created' ? (c.team || '—') : (c.toTeam || ADMIN_TEAM)))}</div>` +
          `<div class="pkd-when">${esc(fmt(h.at))}</div></div>`;
      });
      const pending = DETAIL_STAGES.slice(cur + 1).map((sg) =>
        `<div class="pkd-node"><span class="pkd-dot"></span>` +
        `<div class="pkd-stage">${esc(sg.label)}</div>` +
        `<div class="pkd-actor">${esc(sg.key === 'signed' ? (c.team || '—') : (c.toTeam || ADMIN_TEAM))}</div>` +
        `<div class="pkd-when">Pending</div></div>`);
      const all = done.concat(pending);
      return `<div class="pkd-ftl">` + (all.length ? all.join('') : '<p class="pk-empty--inline">No history.</p>') + `</div>`;
    }

    function renderEntryDetail() {
      const c = roots().find((x) => x.id === entryDetail) || all.find((x) => x.id === entryDetail);
      if (!c) { setDetail(null); return; }
      $('#rvd-empty').hidden = true;
      const a = c.anchor || {};
      const hist = chainHistory(c);
      const field = (k, vHtml) => `<div class="pk-field"><div class="pk-field-k">${k}</div><div class="pk-field-v">${vHtml}</div></div>`;
      const versions = Array.isArray(c.versions) ? c.versions : [];
      const versionsBody = versions.length
        ? `<ol class="pk-versions">` +
            versions.slice().reverse().map((v) =>
              `<li class="pk-ver"><div class="pk-ver-meta">Edited by ${esc(v.by || '—')} · ${esc(fmt(v.at))}</div>` +
                `<div class="pk-ver-txt">${esc(v.summary || v.comment || '—')}</div>` +
                (v.toTeam ? `<div class="pk-ver-sub">Was directed to ${esc(v.toTeam)}</div>` : '') +
              `</li>`).join('') + `</ol>`
        : '';
      const acts = lifecycleActions(c);
      const tl = typeLabel(c);
      const sum = summaryOf(c);
      const isReopened = teamStatusOf(c) === 'reopened';
      const reopLabel = reopenLabelOf(c);
      const outcome = needsExpectedOutcome(c.commentType) ? (c.expectedOutcome || '') : '';
      const selector = (a.selector || '').trim();
      const replies = repliesOf(c);
      const pinNo = pinNoOf(c);
      // Prev/Next position within the originating list.
      const list = detailList();
      const idx = list.findIndex((x) => x.id === c.id);
      const hasList = idx >= 0 && list.length > 1;
      const prevId = hasList && idx > 0 ? list[idx - 1].id : '';
      const nextId = hasList && idx < list.length - 1 ? list[idx + 1].id : '';

      // Collapsible side card (open/closed remembered per section key).
      const sideCard = (key, title, bodyHTML, count) => {
        if (!bodyHTML) return '';
        const col = !!prefs.detailCollapsed[key];
        return `<section class="pk-dcard${col ? ' is-collapsed' : ''}" data-card="${key}">` +
          `<button class="pk-dcard-h" type="button" data-collapse="${key}" aria-expanded="${!col}">` +
            `<span>${esc(title)}${count != null ? ` <span class="pk-dcard-n">${count}</span>` : ''}</span>` +
            `<svg class="pk-dcard-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>` +
          `</button><div class="pk-dcard-b">${bodyHTML}</div></section>`;
      };
      // `cls` marks the one card that keeps the red accent stroke (The ask); the rest read as
      // neutral surfaces so the accent means "this is the request", not "this is a card".
      const mainCard = (title, bodyHTML, headExtra, cls) => bodyHTML
        ? `<section class="pk-dcard${cls ? ' ' + cls : ''}"><div class="pk-dcard-h pk-dcard-h-static"><span>${esc(title)}</span>${headExtra || ''}</div><div class="pk-dcard-b">${bodyHTML}</div></section>` : '';

      // ---- metadata definition list (side rail) ----
      const metaRow = (k, vHtml) => `<div class="pk-dmeta-row"><dt>${esc(k)}</dt><dd>${vHtml}</dd></div>`;
      // Revamped Details: grouped accordions, and every fact has exactly ONE home. Pin, iteration,
      // raised-by/directed-to and status now live in the head + stepper, so they are dropped here
      // rather than repeated. Reference (ticket) is deprioritised into a collapsed group.
      const metaGroup = (key, label, rowsHTML, collapsed) =>
        `<div class="pkd-acc${collapsed ? ' is-collapsed' : ''}" data-acc="${key}">` +
          `<button class="pkd-acc-h" type="button" data-accbtn="${key}">${esc(label)}` +
            `<svg class="pkd-acc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button><div class="pkd-acc-b"><dl class="pk-dmeta">${rowsHTML}</dl></div></div>`;
      const metaBodyNew =
        metaGroup('placement', 'Placement',
          metaRow('Page', `<a href="${esc(pageHref(c.page))}" target="_blank" rel="noopener">${esc(pageLabel(c.page))}</a>` +
            `<span class="pk-dmeta-sub">${esc(pageUrlText(c.page))}</span>`) +
          (c.display ? metaRow('Display', esc(displayText(c.display))) : '')) +
        metaGroup('reference', 'Reference',
          metaRow('Ticket', c.ticket ? `<span class="pk-ticket">${esc(c.ticket)}</span>` : '—') +
          metaRow('Submitted', esc(fmt(c.createdAt))), true) +
        ((isReopened && (reopLabel || c.reopenNote)) || teamStatusOf(c) === 'disregarded'
          ? metaGroup('flags', 'Flags',
              (isReopened && (reopLabel || c.reopenNote)
                ? metaRow('Reopen reason', `<span class="pk-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` + (c.reopenNote ? `<div class="rvd-reopen-note">“${esc(c.reopenNote)}”</div>` : ''))
                : '') +
              (teamStatusOf(c) === 'disregarded'
                ? metaRow('Invalid finding', 'Closed as invalid.' + (c.disregardNote ? `<div class="rvd-reopen-note">“${esc(c.disregardNote)}”</div>` : ''))
                : ''))
          : '');
      // ---- main column ----
      const typedRows = typedFieldRows(c);
      // The title already shows the summary; repeating an identical comment line adds nothing.
      const titleText = (tl && sum) ? sum : c.comment;
      // Suppress the echoed comment ONLY when the typed rows still give the card something to
      // show — otherwise "The ask" would render empty and mainCard would drop it entirely.
      const showComment = !(typedRows && String(c.comment || '').trim() === String(titleText || '').trim());
      const commentBody = (showComment ? `<div class="pk-field-v pk-detail-comment">${esc(c.comment)}</div>` : '')
        + (typedRows ? `<div class="pk-fields">${typedRows}</div>` : '')
        // Success criteria used to sit in the head; it belongs with the ask it qualifies.
        + (outcome ? `<div class="pk-criteria"><div class="pk-criteria-k">Success criteria</div><div class="pk-criteria-v">${esc(outcome)}</div></div>` : '');
      const promptBody = c.aiPrompt
        ? `<div class="pk-field-prompt">${esc(c.aiPrompt)}</div>`
        : `<div class="pk-field-v pk-u-pending">Generating — usually ready within seconds of submit. Refresh in a moment.</div>`;
      const promptCopy = c.aiPrompt ? `<button class="pk-a pk-a--quiet pk-prompt-copybtn" type="button" data-copyprompt="1">Copy</button>` : '';
      const shotsBody = (c.imageId || c.viewportImageId)
        ? `<div class="pk-detail-media">` +
            (c.imageId ? `<figure class="pk-shot"><figcaption>Element</figcaption>${thumbTile(c.imageId, true)}</figure>` : '') +
            (c.viewportImageId ? `<figure class="pk-shot"><figcaption>Full viewport</figcaption>${thumbTile(c.viewportImageId, true)}</figure>` : '') +
          `</div>` : '';

      const CANNED = [
        'Could you clarify the exact location on the page?',
        'Can you share a screenshot of the issue?',
        'This is now live — please verify on your end.',
        'Which page or section does this refer to?',
      ];
      const qqBody =
        (replies.length
          ? `<div class="pk-qq-thread">` + replies.map((r) =>
              `<div class="pk-reply">${teamChip(r.team)}<div class="pk-reply-txt">${esc(r.comment)}</div>` +
              `<div class="pk-reply-meta">${esc(fmt(r.createdAt))}</div>` +
              `<button class="pk-reply-x" type="button" data-delreply="${esc(r.id)}" aria-label="Remove this question" title="Remove">×</button>` +
              `</div>`).join('') + `</div>`
          : `<p class="pk-empty--inline">No questions yet.</p>`) +
        `<div class="pk-qq-canned">` + CANNED.map((t) => `<button class="pk-qq-preset" type="button" data-canned="${esc(t)}">${esc(clip(t, 34))}</button>`).join('') + `</div>` +
        `<div class="pk-qq-compose">` +
          `<textarea class="pk-qq-input" placeholder="Write a quick question…" rows="2"></textarea>` +
          `<button class="pk-a pk-qq-send" type="button">Post reply</button>` +
        `</div>`;

      $('#rvd-entries').innerHTML =
        `<div class="pk-detailwrap">` +
          // ---- sticky action bar ----
          `<div class="pk-detail-bar">` +
            `<div class="pk-detail-bar-l">` +
              `<button class="pk-backlink" id="rvd-back">← Back</button>` +
              (hasList ? `<div class="pk-detail-step">` +
                `<button class="pk-stepbtn" type="button" data-detnav="prev"${prevId ? '' : ' disabled'} aria-label="Previous ticket"><svg class="pk-stepbtn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>` +
                `<span class="pk-detail-pos">${idx + 1} / ${list.length}</span>` +
                `<button class="pk-stepbtn" type="button" data-detnav="next"${nextId ? '' : ' disabled'} aria-label="Next ticket"><svg class="pk-stepbtn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>` +
              `</div>` : '') +
            `</div>` +
            `<div class="pk-detail-bar-r">` +
              (acts ? `<div class="pk-detail-acts">${acts}</div>` : '') +
              // NOT --quiet: muted ink beside the lifecycle button read as disabled, and both of
              // these are live controls. They carry the same ink as Start; the outline, not the
              // text colour, is what marks them as secondary to it.
              `<a class="pk-a" href="${esc(pinHref(c.page, c.id))}" target="_blank" rel="noopener">Open pin ↗</a>` +
              `<button class="pk-a pk-detail-more" type="button" id="pk-detail-more" aria-label="More actions" aria-haspopup="menu">` +
                `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
              `</button>` +
            `</div>` +
          `</div>` +
          `<article class="pk-detail">` +
            // Head: identity on the left, routing as plain text on the right.
            `<header class="pk-detail-head pkd-head">` +
              `<div class="pkd-id">` +
                `<span class="pkd-eyebrow">Comment` +
                  (pinNo ? ` <span class="pkd-sep">·</span> Pin <b>${esc(pinNo)}</b>` : '') +
                  (tl ? ` <span class="pkd-sep">·</span> <span class="pk-type-chip">${esc(tl)}</span>` : '') +
                  (isReopened ? ` <span class="pk-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` : '') +
                `</span>` +
                `<h2 class="pk-detail-title">${esc(tl && sum ? sum : c.comment)}</h2>` +
                `<span class="pkd-sub">${esc(pageLabel(c.page))} <span class="pkd-sep">·</span> <a href="${esc(pageHref(c.page))}" target="_blank" rel="noopener">${esc(pageUrlText(c.page))}</a></span>` +
              `</div>` +
              `<div class="pkd-route">` +
                `<span class="pkd-route-k">Routing</span>` +
                `<span class="pkd-route-v">${esc(c.team || '—')}<span>→</span>${esc(c.toTeam || ADMIN_TEAM)}</span>` +
                `<span class="pkd-route-i">Iteration ${esc(String(c.iteration || 1))}</span>` +
              `</div>` +
            `</header>` +
            `<div class="pk-detail-grid">` +
              `<div class="pk-detail-main">` +
                mainCard('The ask', commentBody, '<span class="pk-qq-sub">What the reviewer wants changed</span>', 'pk-dcard--accent') +
                // The typed rows inside "The ask" already carry Change-to for copy-fix, so the
                // standalone card would repeat it verbatim. Only show it when nothing else does.
                ((c.changeTo && !(typedRows && /change to/i.test(typedRows)))
                  ? mainCard('Change to', `<div class="pk-callout pk-callout--scroll"><div>${esc(c.changeTo)}</div></div>`) : '') +
                mainCard('AI prompt', promptBody, promptCopy) +
                (shotsBody ? mainCard('Screenshots', shotsBody) : '') +
                `<section class="pk-dcard pk-qq"><div class="pk-dcard-h pk-dcard-h-static"><span>Quick questions</span>` +
                  `<span class="pk-qq-sub">Replies never change status</span></div>` +
                  `<div class="pk-dcard-b">${qqBody}</div></section>` +
              `</div>` +
              `<aside class="pk-detail-side">` +
                sideCard('status', 'Status', statusStepper(c)) +
                sideCard('meta', 'More Details', metaBodyNew) +
                sideCard('versions', 'Edit history', versionsBody, versions.length || null) +
              `</aside>` +
            `</div>` +
            // The full history is a full-width band under the grid, not a rail card.
            `<section class="pk-dcard"><div class="pk-dcard-h pk-dcard-h-static"><span>Complete timeline</span>` +
              `<span class="pk-qq-sub">Full lifecycle · ${esc(c.team || '—')} → ${esc(c.toTeam || ADMIN_TEAM)} → Signoff</span></div>` +
              `<div class="pk-dcard-b">${fullTimeline(c, hist)}</div></section>` +
          `</article>` +
        `</div>`;

      // ---- wiring ----
      // grouped Details accordions (revamped rail)
      $('#rvd-entries').querySelectorAll('[data-accbtn]').forEach((b) => b.addEventListener('click', () => {
        const box = b.closest('[data-acc]'); if (box) box.classList.toggle('is-collapsed');
      }));
      $('#rvd-back').addEventListener('click', () => setDetail(null));
      $('#rvd-entries').querySelectorAll('[data-detnav]').forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.dataset.detnav === 'prev' ? prevId : nextId; if (id) setDetail(id);
      }));
      // lifecycle action buttons (same contract as before)
      $('#rvd-entries').querySelectorAll('.pk-detail-acts .pk-a[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = roots().find((x) => x.id === btn.dataset.id); if (!rec) return;
          btn.disabled = true; await doTeamAction(rec, btn.dataset.action);
        });
      });
      $('#rvd-entries').querySelectorAll('.pk-detail-acts [data-startmenu]').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const rec = roots().find((x) => x.id === btn.dataset.id); if (rec) openStartMenu(btn, rec); });
      });
      // The Copy set lives in the ⋮ menu — the menu dismisses itself on select, so there is no
      // toolbar dropdown left to flash "Copied ✓" on (copyToClip alerts only on failure).
      // More menu (lifecycle rest / copy / edit / directed / print / export / revoke / delete)
      const moreBtn = $('#pk-detail-more');
      if (moreBtn) moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const canDisregard = ['to_be_initiated', 'in_progress'].includes(teamStatusOf(c));
        // Categorised ⋮: it carries everything the bar sheds — the non-lead lifecycle actions
        // and the whole Copy set (there is no Copy dropdown on the toolbar).
        const rest = lifecycleList(c).slice(1);
        const items = [
          ...(rest.length ? [{ header: 'Ticket lifecycle' }] : []),
          ...rest.map((a) => ({ label: a.label, icon: ICON[a.icon], onSelect: () => doTeamAction(c, a.action) })),
          ...(canDisregard ? [{ label: 'Close as invalid', icon: ICON.disregard, onSelect: () => doTeamAction(c, 'disregard') }] : []),
          // no section header here — the row names itself, a header above it would say it twice
          { divider: true },
          { label: 'Copy & share', icon: ICON.copy, submenu: [
            { label: 'AI prompt', icon: ICON.copy, onSelect: () => copyToClip(localPrompt(c), null) },
            { label: 'Ticket link', icon: ICON.copy, onSelect: () => copyToClip(pinHref(c.page, c.id), null) },
            { label: 'Ticket ID', icon: ICON.copy, onSelect: () => copyToClip(c.ticket || c.id, null) },
            ...(selector ? [{ label: 'Selector', icon: ICON.copy, onSelect: () => copyToClip(selector, null) }] : []),
            { label: 'As Markdown', icon: ICON.copy, onSelect: () => copyToClip(mdExport([c]), null) },
          ] },
          { header: 'Ticket' },
          { label: 'Edit comment', icon: ICON.edit, onSelect: () => window.open(pinHref(c.page, c.id, { edit: true }), '_blank', 'noopener') },
          { label: 'Change directed team', icon: ICON.teams, onSelect: () => openEditTeams(c) },
          { label: 'Print ticket', icon: ICON.copy, onSelect: () => window.print() },
          { label: 'Export ticket (JSON)', icon: ICON.copy, onSelect: () => downloadBlob(JSON.stringify(chainMembers(c), null, 2), 'application/json', 'ticket-' + (c.ticket || c.id).toString().slice(0, 24) + '.json') },
          { divider: true },
          ...(c.revoked ? [] : [{ label: 'Revoke', icon: ICON.revoke, danger: true, onSelect: () => rowRevoke(c) }]),
          { label: 'Delete', icon: ICON.delete, danger: true, onSelect: () => rowDelete(c) },
        ];
        openRowMenu(moreBtn, c, items);
      });
      // prompt copy button (card header)
      const pcb = $('#rvd-entries').querySelector('[data-copyprompt]');
      if (pcb) pcb.addEventListener('click', () => copyToClip(c.aiPrompt || '', pcb, 'Copied ✓'));
      // collapsible side cards
      $('#rvd-entries').querySelectorAll('[data-collapse]').forEach((h) => h.addEventListener('click', () => {
        const key = h.dataset.collapse; const cardEl = h.closest('.pk-dcard');
        const now = !cardEl.classList.contains('is-collapsed'); cardEl.classList.toggle('is-collapsed', now);
        h.setAttribute('aria-expanded', String(!now)); prefs.detailCollapsed[key] = now; savePrefs();
      }));
      // canned replies
      const input = $('#rvd-entries').querySelector('.pk-qq-input');
      $('#rvd-entries').querySelectorAll('[data-canned]').forEach((b) => b.addEventListener('click', () => { if (input) { input.value = b.dataset.canned; input.focus(); } }));
      // post a quick-question reply (⌘/Ctrl+Enter posts)
      const send = $('#rvd-entries').querySelector('.pk-qq-send');
      if (send && input) {
        /* Letters-only fields strip as you type rather than complaining after you submit. Names take
       * spaces, hyphens and apostrophes — Mary-Jane, O'Brien — so "letters only" means no DIGITS
       * and no full stops, not no punctuation at all. The full stop is barred specifically because
       * these names are typed from an address book where initials arrive as "N.V." */
      el.querySelectorAll('[data-letters]').forEach((i) => i.addEventListener('input', () => {
        const clean = i.value.replace(/[^A-Za-z\u00C0-\u024F' -]/g, '').replace(/\s{2,}/g, ' ');
        if (clean !== i.value) {
          const at = i.selectionStart - (i.value.length - clean.length);
          i.value = clean;
          try { i.setSelectionRange(at, at); } catch (e) {}
        }
      }));

      const submit = async () => {
          if (send.disabled) return;
          const text = input.value.trim(); if (!text) { input.focus(); return; }
          send.disabled = true; send.textContent = 'Posting…';
          try { await store.reply(c, text); await loadData(); }
          catch (e) { send.disabled = false; send.textContent = 'Post reply'; pkAlert('Could not post — ' + e.message); }
        };
        send.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
      }
      // remove a quick question
      $('#rvd-entries').querySelectorAll('.pk-reply-x[data-delreply]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const reply = all.find((x) => x.id === btn.dataset.delreply); if (!reply) return;
          if (!(await pkConfirm({ title: 'Remove question', message: 'Remove this quick question from the thread? This cannot be undone.', confirmLabel: 'Remove', danger: true }))) return;
          btn.disabled = true;
          try { await store.delReply(reply); await loadData(); }
          catch (e) { btn.disabled = false; pkAlert('Could not remove — ' + e.message); }
        });
      });
      // screenshot lightbox (zoom on hydrated thumbs)
      hydrateThumbs($('#rvd-entries'));
      $('#rvd-entries').querySelectorAll('.pk-shot .pk-thumb').forEach((t) => {
        t.classList.add('pk-thumb-zoom');
        t.addEventListener('click', () => { const img = t.querySelector('img'); if (img && img.src) openLightbox(img.src, (t.closest('.pk-shot').querySelector('figcaption') || {}).textContent || ''); });
      });
    }

    // ---- Notifications (admin: all), newest first, unread flagged ----
    function renderNotifs() {
      $('#rvd-empty').hidden = true;
      // Settings → Notifications filters which event kinds surface here (display-only; nothing
      // is deleted server-side). Unknown/legacy kinds always show so nothing silently vanishes.
      const evOn = (k) => prefs.notifEvents[k] !== false;
      const list = (notifs || []).slice()
        .filter((n) => !['status', 'reply', 'directed', 'revoked'].includes(n.kind) || evOn(n.kind))
        .sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
      const unread = list.filter((n) => n.readAdmin === false);
      $('#rvd-view-notifs').innerHTML =
        `<div class="rvd-notifhead">` +
          `<div><h2>Notifications</h2>` +
          `<p class="rvd-deploy-explain">Fired as tickets move through the status machine (started, deployed live, reopened, resubmitted).</p></div>` +
          `<div class="rvd-notifacts">` +
            (unread.length ? `<button class="pk-a" id="rvd-notif-read">Mark all read (${unread.length})</button>` : '') +
            /* Delete All lives behind the More icon, not beside Mark all read. The two are not
             * peers: one is routine and reversible, the other empties the log. Giving them
             * matching buttons an inch apart is how a tired thumb loses the lot. */
            (list.length ? `<button class="rvd-moreopts" id="rvd-notif-more" aria-label="More options" aria-haspopup="menu">` +
              `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
            `</button>` : '') +
          `</div>` +
        `</div>` +
        (list.length
          ? `<div class="pk-notes">${list.map(notifItem).join('')}</div>`
          : `<p class="pk-empty">No notifications yet.</p>`);
      const mb = $('#rvd-notif-more');
      if (mb) mb.addEventListener('click', (e) => {
        e.stopPropagation();
        openRowMenu(mb, null, [{
          label: 'Delete All', icon: ICON.delete, danger: true,
          onSelect: async () => {
            if (!(await pkConfirm({
              title: 'Delete all notifications',
              message: 'Remove all ' + list.length + ' ' + (list.length === 1 ? 'notification' : 'notifications') + '? Notifications are a record of ticket movement — the tickets themselves are not touched.',
              confirmLabel: 'Delete All', danger: true,
            }))) return;
            await store.clearNotifs();
            await loadData();
          },
        }]);
      });
      const rb = $('#rvd-notif-read');
      if (rb) rb.addEventListener('click', async () => {
        rb.disabled = true;
        try { await store.markRead(unread.map((n) => n.id), true); await loadData(); }
        catch (e) { rb.disabled = false; pkAlert('Could not update — ' + e.message); }
      });
      $('#rvd-view-notifs').querySelectorAll('.rvd-notif-toggle').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try { await store.markRead([btn.dataset.id], btn.dataset.read === 'true'); await loadData(); }
          catch (e) { btn.disabled = false; pkAlert('Could not update — ' + e.message); }
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
        chip = `<span class="pk-status-chip pk-status-chip--reply">${REPLY_ICO} Reply</span>`;
      } else if (n.kind === 'status' && TEAM_STATUS[n.teamStatus]) {
        const [cls, label] = TEAM_STATUS[n.teamStatus];
        chip = `<span class="pk-status-chip ${cls}">${label}</span>`;
      } else if (n.kind === 'directed') {
        chip = `<span class="pk-status-chip open">Directed</span>`;
      } else if (n.kind === 'revoked') {
        chip = `<span class="pk-status-chip pk-status-chip--revoked">Revoked</span>`;
      } else {
        chip = `<span class="pk-status-chip deployed">Update</span>`;
      }
      const openPin = n.commentId
        ? `<a class="pk-openpin" href="${esc(pinHref({ path: n.path, url: n.url }, n.commentId))}" target="_blank" rel="noopener">Open Pin</a>` : '';
      // The whole card opens the ticket's detail (its chain root) when it carries one.
      const chain = n.chainId || '';
      const clickable = chain ? ` data-chain="${esc(chain)}" tabindex="0" role="button" aria-label="View ticket details"` : '';
      return `<div class="pk-notif${unread ? ' is-unread' : ''}${chain ? ' is-clickable' : ''}"${clickable}>` +
        `<span class="pk-notif-dot"></span>` +
        `<div class="pk-notif-body">` +
          `<div class="pk-notif-sum">${esc(n.summary || '')}</div>` +
          `<div class="pk-notif-meta">${teamChip(n.team)}` +
            `<a class="pk-slug" href="${esc(n.path)}" target="_blank" rel="noopener">${esc(pageName(n.path))}</a>` +
            `<span class="rvd-time">${esc(fmt(n.updatedAt || n.createdAt))}</span>` +
            chip + openPin +
          `</div>` +
        `</div>` +
        `<button class="pk-a rvd-notif-toggle" type="button" data-id="${esc(n.id)}" data-read="${unread ? 'true' : 'false'}">` +
          `${unread ? 'Mark read' : 'Mark unread'}</button>` +
      `</div>`;
    }

    // ---- Needs Clarification bucket — its own left-nav tab (self-contained header + card grid) ----
    function renderClarify() {
      $('#rvd-empty').hidden = true;
      const host = $('#rvd-view-clarify');
      const rs = clarifyRoots();
      const grid = rs.length
        ? `<div class="pk-grid">${rs.map((r) => cardFigma(r)).join('')}</div>`
        : `<p class="pk-empty">Nothing needs clarity. Flag an inbound ticket as “Need Clarity” and it lands here until you resume it.</p>`;
      host.innerHTML =
        `<div class="rvd-notifhead">` +
          `<div><h2>Need Clarity</h2>` +
          `<p class="rvd-deploy-explain">Tickets you parked for the raising team to clarify. They leave the inbound queue until you resume them.</p></div>` +
        `</div>` + grid;
      bindActions(host);
      enhanceClarifyTags(host);
      hydrateThumbs(host);
    }

    // Make each parked card's status tag a dropdown that REVOKES the needs_clarification parking —
    // moving the ticket back to TBI or straight to In Progress (Start). Builder (admin) may act on any.
    function enhanceClarifyTags(host) {
      host.querySelectorAll('.pkc-card[data-id]').forEach((card) => {
        const rec = roots().find((c) => c.id === card.dataset.id);
        if (!rec || teamStatusOf(rec) !== 'needs_clarification') return;
        const chip = card.querySelector('.pkc-status'); if (!chip) return;
        chip.classList.add('pkc-status--menu');
        chip.setAttribute('role', 'button'); chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-haspopup', 'menu'); chip.title = 'Revoke needs-clarification';
        const open = (e) => {
          e.stopPropagation();
          openRowMenu(chip, rec, [
            { label: 'Move to TBI', icon: ICON.reset, onSelect: () => doTeamAction(rec, 'reset') },
            { label: 'Start (In Progress)', icon: ICON.start, onSelect: () => doTeamAction(rec, 'start') },
          ]);
        };
        chip.addEventListener('click', open);
        chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
      });
    }

    // ---- Comments bucket — every ticket-chain with a discussion thread, newest activity first ----
    function renderThreads() {
      $('#rvd-empty').hidden = true;
      const host = $('#rvd-view-threads');
      const rs = threadRoots();
      const unread = rs.filter((r) => threadOrigin(r).readAdmin === false);
      // Each card wears a small read/unread bar (mirrors the Notifications toggle); the card itself
      // is untouched so its click-to-open + actions keep working (the toggle is a <button>, which
      // the shared cardClick handler ignores). Read-state keys off the chain ORIGIN (see threadOrigin).
      const grid = rs.length
        ? `<div class="pk-grid">${rs.map((r) => {
            const o = threadOrigin(r);
            const u = o.readAdmin === false;
            return `<div class="pk-thread-item${u ? ' is-unread' : ''}">` +
              `<div class="pk-thread-mark"><span class="pk-thread-dot"></span>` +
                `<button class="pk-a pk-thread-toggle" type="button" data-id="${esc(o.id)}" data-path="${esc(o.page.path)}" data-url="${esc(o.page.url || '')}" data-read="${u ? 'true' : 'false'}">${u ? 'Mark read' : 'Mark unread'}</button>` +
              `</div>` + cardFigma(r) +
            `</div>`;
          }).join('')}</div>`
        : `<p class="pk-empty">No comment threads yet. Replies on any ticket (⌘/Ctrl+Enter to post) show up here.</p>`;
      host.innerHTML =
        `<div class="rvd-notifhead">` +
          `<div><h2>Comments</h2>` +
          `<p class="rvd-deploy-explain">Every ticket with a discussion thread, most recent first. Open one to read and reply.</p></div>` +
          (unread.length ? `<button class="pk-a" id="rvd-thread-read">Mark all read (${unread.length})</button>` : '') +
        `</div>` + grid;
      bindActions(host);
      hydrateThumbs(host);
    }

    // ---- Settings view — admin preferences (per-browser), organised into a sub-nav of cards ----
    /* ---- 7.4: the Builder home ---------------------------------------------------------------
     * A tiled index of everything Builder mode can do. It exists because the sidebar had grown to
     * six items while the capabilities behind it had grown to fifteen — People, Visibility,
     * Projects and the rest were buried inside Settings with no indication they were there.
     *
     * Numbers come from ONE /admin/overview call spanning every project, since Builder is the only
     * role that reads across the boundary. Tiles paint immediately with skeleton counts and fill in
     * when it lands, so the page is never blank while waiting.
     */
    let overviewCache = null;
    function renderHome() {
      const host = $('#rvd-view-home');
      if (!host) return;

      const go = (v) => `data-home-view="${v}"`;
      const goSet = (sec) => `data-home-settings="${sec}"`;
      const tile = (o) => {
        const badge = o.badge ? `<span class="pk-tile-badge">${esc(String(o.badge))}</span>` : '';
        const stat = o.stat != null ? `<div class="pk-tile-stat">${esc(String(o.stat))}</div>` : '';
        const sub = o.sub ? `<div class="pk-tile-sub">${esc(o.sub)}</div>` : '';
        return `<button class="pk-tile${o.wide ? ' is-wide' : ''}${o.accent ? ' is-accent' : ''}" type="button" ${o.attr}>` +
          `<div class="pk-tile-head"><span class="pk-tile-title">${esc(o.title)}</span>${badge}</div>` +
          stat + sub + `<div class="pk-tile-desc">${esc(o.desc)}</div></button>`;
      };

      const d = overviewCache;
      const n = (v) => (d ? String(v) : '—');
      const t = d ? d.totals : null;

      // Queue first: it is the only tile that represents work waiting on you.
      const queueSub = t ? `${t.tbi} to start · ${t.inProgress} in progress · ${t.reopened} reopened` : 'Loading…';

      host.innerHTML =
        `<div class="rvd-notifhead"><div><h2>Builder</h2>` +
          `<p class="rvd-deploy-explain">Everything Builder mode can do. Numbers span <b>every project</b> — the one view that crosses the boundary.</p></div></div>` +
        `<div class="pk-tiles">` +
          tile({ title: 'Queue', attr: go('dash'), accent: true, wide: true,
                 stat: t ? (t.tbi + t.inProgress + t.reopened) : '—',
                 badge: d && d.unreadNotifications ? d.unreadNotifications + ' unread' : '',
                 sub: queueSub, desc: 'Tickets, notifications, comments and patterns.' }) +
          tile({ title: 'Insights', attr: go('insights'),
                 stat: t ? t.deployed : '—', sub: t ? `${t.total} tickets all-time` : '',
                 desc: 'Totals and a per-project breakdown.' }) +
          tile({ title: 'People', attr: go('org'),
                 stat: n(d && d.people), badge: d && d.pendingResets ? d.pendingResets + ' reset' + (d.pendingResets === 1 ? '' : 's') : '',
                 sub: d && d.lockedAccounts ? `${d.lockedAccounts} locked out` : '',
                 desc: 'Accounts, PIN resets and lockouts.' }) +
          tile({ title: 'Teams', attr: go('org'), stat: n(d && d.teams),
                 desc: 'Create teams, move them between projects, and see who is in each.' }) +
          tile({ title: 'Visibility', attr: go('org'),
                 sub: d && d.projects && d.projects[0] ? `Mode: ${d.projects[0].visibilityMode}` : '',
                 desc: 'Who sees whose work, and grants across projects.' }) +
          tile({ title: 'Projects', attr: go('org'), stat: n(d && d.projects && d.projects.length),
                 desc: 'The tenancy boundary every ticket lives inside.' }) +
          tile({ title: 'Notifications', attr: go('notifs'),
                 badge: d && d.unreadNotifications ? String(d.unreadNotifications) : '',
                 desc: 'Status pushes, arrivals and replies.' }) +
          /* Comments carries its count. A tile that shows a number when there is work and nothing
             at all when there is none reads as broken rather than empty — zero is an answer, blank
             is not. Patterns deliberately does NOT: this board gets patterns from GET /patterns,
             which the home view has not called, so any number here would be invented rather than
             counted. An honest blank beats a confident wrong number. */
          tile({ title: 'Comments', attr: go('threads'), stat: threadRoots().length,
                 desc: 'Every thread, including replies.' }) +
          tile({ title: 'Patterns', attr: go('patterns'), desc: 'Repeat findings and fragile elements.' }) +
          tile({ title: 'Concerns from teams', attr: go('dash'),
                 stat: t ? (t.reopened + t.clarify) : '—',
                 desc: 'Reopened tickets and requests for clarification.' }) +
          tile({ title: 'Data & maintenance', attr: goSet('data'), desc: 'Backups, migration and consistency.' }) +
          tile({ title: 'Settings', attr: goSet('appearance'), desc: 'Appearance, behaviour and notifications.' }) +
        `</div>` +
        (d && d.projects && d.projects.length > 1
          ? `<section class="pk-set-card pk-home-byproject"><div class="pk-set-card-h"><h3>By project</h3>` +
            `<p>Each project is isolated unless you have granted access in Visibility.</p></div><div class="pk-set-card-b">` +
            /* Each row OPENS that project. It read as a link already — a name, its counts, a
             * total — and did nothing, so the only way to reach the project you were looking at
             * was to go to Projects and find it again by name. */
            d.projects.map((p) => `<button class="pk-set-row pk-set-row--go" type="button" ` +
              `data-home-project="${esc(p.id)}"><div class="pk-set-row-main">` +
              /* A binned project that still holds work is listed and SAID to be binned. Silently
                 dropping it would take its tickets out of this breakdown while leaving them in the
                 totals above — one discrepancy traded for a quieter one. */
              `<div class="pk-set-row-label">${esc(p.name)}${p.deleted ? ` <span class="pk-set-pill">in the recycle bin</span>` : ''}</div>` +
              `<div class="pk-set-row-desc">${p.tbi} to start · ${p.inProgress} in progress · ${p.reopened} reopened · ${p.deployed} deployed</div>` +
            `</div><div class="pk-set-ctl"><span class="pk-set-pill">${p.total} total</span>` +
              `<span class="pk-set-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>` +
            `</div></button>`).join('') +
            `</div></section>`
          : '');

      if (!overviewCache) {
        store.overview().then((o) => { overviewCache = o; if (view === 'home') renderHome(); })
          .catch(() => { /* tiles stay usable with em-dashes rather than erroring the whole page */ });
      }
    }

    /* Your own Access Key, and changing it. Only meaningful with an account session — the admin
     * key is not a person, so there is no code to show behind it. */
    async function wireMyAccess() {
      const host = $('#pk-my-access'); if (!host) return;
      const acct = getAccount();
      if (!getAuthToken() || !acct) {
        host.innerHTML = `<div class="pk-set-row"><div class="pk-set-row-main">` +
          `<div class="pk-set-row-label">Sign in with your account</div>` +
          `<div class="pk-set-row-desc">An Access Key belongs to a person, and this board is open on the admin key.</div>` +
          `</div></div>`;
        return;
      }
      let mine = '';
      try {
        // There is no per-person read endpoint, and adding one would expose codes more widely than
        // the admin list already does. A Builder can see their own row in the list they already read.
        const list = await store.usersList();
        mine = (list.find((u) => u.email === acct.email) || {}).accessId || '';
      } catch (e) { mine = ''; }

      host.innerHTML =
        `<div class="pk-set-row"><div class="pk-set-row-main">` +
          `<div class="pk-set-row-label">Your code</div>` +
          `<div class="pk-set-row-desc">Two letters, then six digits. This is all you type to sign in.</div>` +
        `</div><div class="pk-set-ctl"><span class="pk-u-inlinerow">` +
          `<code class="pk-set-kbd pk-accesscode">${esc(mine || '— not set —')}</code>` +
          (mine ? `<button class="pk-a" type="button" id="pk-my-access-copy">Copy</button>` : '') +
          `<button class="pk-a" type="button" id="pk-my-access-change">Change</button>` +
        `</span></div></div>`;

      const copyBtn = $('#pk-my-access-copy');
      if (copyBtn) copyBtn.addEventListener('click', (e) => copyToClip(mine, e.currentTarget, 'Copied ✓'));
      $('#pk-my-access-change').addEventListener('click', async () => {
        /* The OLD key first, then the new one.
         *
         * A signed-in tab is not proof of who is at the keyboard — it is proof that somebody signed
         * in on this machine at some point today. Swapping the credential is exactly what a person
         * who found that tab would do, and its owner would not discover it until the next morning.
         * Asking for the key being replaced makes the change cost what it should. */
        const current = await pkPrompt({
          title: 'Change your Access Key',
          message: 'Enter the Access Key you use now.',
          value: '', confirmLabel: 'Continue', password: true,
        });
        if (current === null || !current.trim()) return;
        /* NOT masked, deliberately — unlike the one above. This one is being CHOSEN, not proved:
           you have to read what you typed to avoid setting a key you cannot reproduce, and the
           product shows it back on the next screen anyway. Masking here would buy nothing and cost
           typos. */
        const next = await pkPrompt({
          title: 'Your new Access Key',
          message: 'Two letters, then six digits — like AB123456. Leave it blank to have one drawn for you.\n\nThe old one stops working immediately.',
          value: '', confirmLabel: 'Change',
        });
        if (next === null) return;
        try {
          const res = await accessChange(WORKER_URL, next.trim() || genAccessKey(), current.trim());
          await pkAlert({ title: 'Changed', message: 'Your Access Key is now ' + res.accessId + '. Nothing else about your account changed.' });
          wireMyAccess();
        } catch (e) { pkAlert({ title: 'Could not change it', message: e.message }); }
      });
    }

    /* ---- 8.0 passkeys ---------------------------------------------------------------------
     * Three honest states, because "Enrol" on a machine that cannot enrol is the failure this
     * screen exists to avoid:
     *   no sensor      — say so plainly, offer nothing
     *   not signed in  — a passkey attaches to an account, and the Builder key is not one
     *   ready          — one button
     */
    async function wirePasskeys() {
      const stateEl = $('#pk-pk-state');
      const listEl = $('#pk-pk-list');
      if (!stateEl) return;
      const rowMain = (label, desc, ctl) =>
        `<div class="pk-set-row-main"><div class="pk-set-row-label">${label}</div>` +
        (desc ? `<div class="pk-set-row-desc">${desc}</div>` : '') + `</div>` +
        (ctl ? `<div class="pk-set-ctl">${ctl}</div>` : '');

      const supported = await hasPlatformAuthenticator();
      if (!supported) {
        stateEl.innerHTML = rowMain('No biometric sensor here',
          'This browser or machine has no Touch ID / Windows Hello. Sign in with your PIN, and enrol on a device that does.');
        listEl.innerHTML = '';
        return;
      }
      if (!getAuthToken()) {
        // This board is open on the BUILDER KEY, which is not a person — so telling someone to
        // "sign in with your email and PIN" here pointed at a field that does not exist on this
        // screen. The account session can only be created on the auth page, so send them there and
        // bring them straight back to this tab, where the token will be waiting.
        stateEl.innerHTML = rowMain('Sign in with your account first',
          'A passkey attaches to a person, and this board is currently open on the Builder key. '
          + 'Signing in takes one step and returns you here.',
          `<button class="pk-a pk-a--primary" type="button" id="pk-pk-signin">Sign in to enrol</button>`);
        $('#pk-pk-signin').addEventListener('click', () => {
          try { sessionStorage.setItem('pkSettingsSection', 'passkeys'); } catch (e) {}
          location.href = loginUrl('/auth/') + '?return=' + encodeURIComponent(location.href);
        });
        listEl.innerHTML = '';
        return;
      }

      stateEl.innerHTML = rowMain('Touch ID is available',
        'Enrolling stores a public key for this device. The private half never leaves the machine.',
        `<button class="pk-a pk-a--primary" type="button" id="pk-pk-add">Enrol this device</button>`);
      $('#pk-pk-add').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Waiting for Touch ID…';
        try {
          await passkeyEnrol(WORKER_URL, deviceLabel());
          pkAlert({ title: 'Enrolled', message: 'Touch ID will sign you in on this device from now on. Your PIN still works.' });
          refreshList();
        } catch (err) {
          // A cancelled sheet is a decision, not a fault, and must not be dressed up as an error.
          const cancelled = /NotAllowed|abort/i.test(String(err && err.name) + String(err && err.message));
          if (!cancelled) pkAlert({ title: 'Could not enrol', message: err.message || 'Something went wrong.' });
        } finally { btn.disabled = false; btn.textContent = 'Enrol this device'; }
      });

      async function refreshList() {
        try {
          const rows = await passkeyList(WORKER_URL);
          listEl.innerHTML = rows.length
            ? rows.map((r) =>
                `<div class="pk-set-row">` +
                  rowMain(esc(r.label || 'Device'),
                    'Added ' + fmtWhen(r.created_at) + (r.last_used_at ? ' · last used ' + fmtWhen(r.last_used_at) : ' · never used'),
                    `<button class="pk-a danger" type="button" data-pk-rm="${esc(r.id)}">Remove</button>`) +
                `</div>`).join('')
            : `<div class="pk-set-row"><div class="pk-set-row-main"><div class="pk-set-row-desc">No devices enrolled yet.</div></div></div>`;
          listEl.querySelectorAll('[data-pk-rm]').forEach((b) => b.addEventListener('click', async () => {
            b.disabled = true;
            try { await passkeyRemove(WORKER_URL, b.dataset.pkRm); refreshList(); }
            catch (err) { b.disabled = false; pkAlert({ title: 'Could not remove', message: err.message }); }
          }));
        } catch (err) {
          listEl.innerHTML = `<div class="pk-set-row"><div class="pk-set-row-main"><div class="pk-set-row-desc">Could not load: ${esc(err.message)}</div></div></div>`;
        }
      }
      refreshList();
    }

    /** A name the owner will recognise in a list six months from now. */
    function deviceLabel() {
      const ua = navigator.userAgent || '';
      const os = /Mac/i.test(ua) ? 'Mac' : /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : 'This device';
      const br = /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : /Firefox\//i.test(ua) ? 'Firefox' : '';
      return br ? os + ' · ' + br : os;
    }

    function fmtWhen(iso) {
      const t = Date.parse(iso || '');
      if (!t) return 'recently';
      return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /* ---- Settings 9.0 ---------------------------------------------------------------------
     * Four sections instead of ten. Eight of the ten were describing ONE structure from
     * different angles: a person sits in a team, a team sits in a project, and visibility is a
     * property of a project rather than a thing in its own right. Those are now a single
     * drill-down instead of sibling screens that each had to re-explain the hierarchy.
     *
     * The split is "whose setting is this?":
     *   Organisation  shared, server-side  — projects → teams → people, and who sees whom
     *   Preferences   yours, this browser  — appearance + behaviour + notifications
     *   Account       yours, everywhere    — passkeys, session
     *   System        the deployment       — storage, export, maintenance, about
     *
     * Screens are action-first: a labelled control, not a paragraph. Explanatory copy survives
     * ONLY where an action cannot be undone — rotating a key, deleting, disabling someone.
     */
    /** Organisation is its own module now. It reuses this function's machinery rather than forking
     *  it — the screens, helpers and handlers are identical; only the shell around them differs. */
    function renderOrg() { renderSettings({ orgOnly: true }); }

    function renderSettings(opts) {
      const orgOnly = !!(opts && opts.orgOnly);
      $('#rvd-empty').hidden = true;
      const host = $(orgOnly ? '#rvd-view-org' : '#rvd-view-settings');
      /* Only ONE of the two hosts may hold content at a time. Both render a #pk-set-panel, and the
       * screens inside look their elements up by id — with both populated those ids would be
       * duplicated and every lookup would silently resolve into the hidden view. */
      const other = $(orgOnly ? '#rvd-view-settings' : '#rvd-view-org');
      if (other) other.innerHTML = '';
      if (orgOnly) settingsSection = 'org';
      const SECTIONS = [
        { k: 'prefs', label: 'Preferences' },
        { k: 'account', label: 'Account' },
        { k: 'trash', label: 'Recycle bin' },
        { k: 'system', label: 'System' },
      ];
      // Organisation is no longer one of these — it is a module of its own in the rail.
      if (!orgOnly && settingsSection === 'org') settingsSection = 'prefs';
      // Old section keys still arrive from deep links and the auth-page handoff. Map rather than
      // drop, so an existing link lands somewhere sensible instead of on a default screen.
      const LEGACY = {
        appearance: 'prefs', behavior: 'prefs', notifications: 'prefs',
        data: 'system', about: 'system',
        passkeys: 'account',
        // people/visibility/teams/projects are no longer Settings at all — they moved to the
        // Organisation module. A deep link using one lands on Preferences rather than a blank tab.
        people: 'prefs', visibility: 'prefs', teams: 'prefs', projects: 'prefs',
      };
      if (!orgOnly && LEGACY[settingsSection]) settingsSection = LEGACY[settingsSection];
      // 'org' is intentionally absent from SECTIONS — it is its own module — so the org-only
      // render must be exempt from the "unknown section" fallback that would otherwise evict it.
      if (!orgOnly && !SECTIONS.some((s) => s.k === settingsSection)) settingsSection = 'prefs';

      host.innerHTML = orgOnly
        // No tab rail: Organisation IS the screen, so a sub-nav with one entry would be furniture.
        ? `<div class="rvd-notifhead" id="pk-org-head"></div>` +
          `<div class="pk-set pk-set--solo"><div class="pk-set-panel" id="pk-set-panel"></div></div>`
        : `<div class="rvd-notifhead"><div><h2>Settings</h2></div></div>` +
          `<div class="pk-set">` +
            `<nav class="pk-set-nav" role="tablist">` +
              SECTIONS.map((s) => `<button class="pk-set-tab${s.k === settingsSection ? ' is-active' : ''}" role="tab" aria-selected="${s.k === settingsSection}" data-sec="${s.k}">` +
                `<span>${s.label}</span><span class="pk-set-tab-badge" data-badge="${s.k}" hidden></span></button>`).join('') +
            `</nav>` +
            `<div class="pk-set-panel" id="pk-set-panel"></div>` +
          `</div>`;
      host.querySelectorAll('.pk-set-tab').forEach((b) => b.addEventListener('click', () => {
        if (settingsSection !== b.dataset.sec) { settingsSection = b.dataset.sec; renderSettings(); }
      }));
      setTimeout(paintDynamic, 0);   // CSP: swatches take their --sw via CSSOM once the panel lands

      const panel = host.querySelector('#pk-set-panel');
      /* Repaint in the SAME shell. `renderSettings()` with no arguments renders the Settings host,
       * so an org screen calling it would paint itself into the wrong container and clear its own —
       * which is exactly what made the project drill-down look like it did nothing. */
      const rerender = () => renderSettings(opts);
      const getPref = (k) => k.includes('.') ? ((prefs[k.split('.')[0]] || {})[k.split('.')[1]]) : prefs[k];
      const setPref = (k, v) => { if (k.includes('.')) { const [a, b] = k.split('.'); prefs[a] = prefs[a] || {}; prefs[a][b] = v; } else prefs[k] = v; };
      const swCtl = (key) => `<button class="pk-set-switch" type="button" role="switch" aria-checked="${!!getPref(key)}" data-pref-toggle="${key}"><span class="pk-set-switch-thumb"></span></button>`;
      const segCtl = (key, opts) => `<div class="pk-set-seg" role="group">` + opts.map((o) => `<button class="pk-set-segbtn${getPref(key) === o.v ? ' is-active' : ''}" type="button" data-pref-choice="${key}" data-val="${esc(o.v)}">${esc(o.l)}</button>`).join('') + `</div>`;
      const row = (label, desc, ctl) => `<div class="pk-set-row"><div class="pk-set-row-main"><div class="pk-set-row-label">${label}</div>${desc ? `<div class="pk-set-row-desc">${desc}</div>` : ''}</div><div class="pk-set-ctl">${ctl}</div></div>`;
      /* An untitled card drops its header entirely rather than rendering an empty <h3>. The
       * header carries the red accent rule, so an empty one leaves a bar and a blank line
       * above the content — furniture for a label that is not there. */
      const card = (title, sub, rowsHTML) => `<section class="pk-set-card">`
        + (title ? `<header class="pk-set-card-h"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</header>` : '')
        + `<div class="pk-set-card-b">${rowsHTML}</div></section>`;
      const actBtn = (act, label, cls) => `<button class="pk-a${cls ? ' ' + cls : ''}" type="button" data-act="${act}">${esc(label)}</button>`;

      /* A row that goes somewhere. The count IS the description — "3 teams · 11 people" tells you
       * more about a project than a sentence explaining what a project is, and it makes the whole
       * hierarchy legible without opening anything. */
      const CHEV = `<svg class="pk-set-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
      const drillRow = (attrs, label, counts, trailing) =>
        `<button class="pk-set-row pk-set-row--go" type="button" ${attrs}>` +
          `<span class="pk-set-row-main"><span class="pk-set-row-label">${label}</span>` +
          (counts ? `<span class="pk-set-row-desc">${counts}</span>` : '') + `</span>` +
          `<span class="pk-set-ctl">${trailing || ''}${CHEV}</span>` +
        `</button>`;
      /* A card, for the two levels that are BROWSED rather than scanned. Projects and teams are
       * things you pick one of; a row list is for things you read down. The stat strip is the
       * point of the card — it answers "which one do I need" without opening any of them. */
      const drillCard = (attrs, label, tag, stats) =>
        `<button class="pk-card-tile" type="button" ${attrs}>` +
          `<span class="pk-card-tile-h"><span class="pk-card-tile-name">${label}</span>` +
            (tag ? `<span class="pk-card-tile-tag">${tag}</span>` : '') + `</span>` +
          `<span class="pk-card-tile-stats">` +
            stats.map((st) => `<span class="pk-card-tile-stat"><b>${st[0]}</b><i>${st[1]}</i></span>`).join('') +
          `</span>` +
        `</button>`;
      const tileGrid = (inner, rows) => `<div class="pk-card-grid${rows ? ' pk-card-grid--rows' : ''}">${inner}</div>`;
      // Empty states carry the action rather than explaining the concept.
      const emptyRow = (text, btnHtml) =>
        `<div class="pk-set-empty">${text}${btnHtml ? ` <span class="pk-set-empty-act">${btnHtml}</span>` : ''}</div>`;
      // Anything irreversible lives here, at the bottom, away from the routine controls.
      /* CRITICAL ACTIONS, and closed by default — every time, not remembered.
       *
       * It was "Danger zone", open, with the destructive controls sitting in the page like any
       * other row. Two changes, for the same reason: the name says what the section is FOR rather
       * than how to feel about it, and a closed disclosure means deleting a project or disabling an
       * account takes a deliberate act to even reach. It does not remember being opened, because
       * "I opened this once" is not consent for the next visit.
       *
       * <details> rather than a scripted toggle: it is open/closed state and nothing else, the
       * browser already does the keyboard and screen-reader work, and there is no JS to forget. */
      const dangerCard = (rowsHTML) => rowsHTML
        ? `<details class="pk-set-card pk-set-card--danger pk-crit">` +
            `<summary class="pk-set-card-h pk-crit-h"><h3>Critical Actions</h3>` +
              `<svg class="pk-crit-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>` +
            `</summary>` +
            `<div class="pk-set-card-b">${rowsHTML}</div></details>`
        : '';
      const crumbs = (parts) =>
        `<nav class="pk-set-crumbs">` + parts.map((p, i) => (p.go
          ? `<button type="button" class="pk-set-crumb" data-crumb="${p.go}">${esc(p.label)}</button>`
          : `<span class="pk-set-crumb is-here">${esc(p.label)}</span>`)
          + (i < parts.length - 1 ? `<span class="pk-set-crumb-sep">/</span>` : '')).join('') + `</nav>`;
      const pill = (t) => `<span class="pk-set-pill">${esc(t)}</span>`;
      const n = (c, one, many) => `${c} ${c === 1 ? one : (many || one + 's')}`;

      const mounts = [];
      const mkDropdown = (slotId, opts) => { const dd = buildDropdown({ small: true, menuAlign: 'right', ...opts }); mounts.push({ slotId, dd }); return `<span id="${slotId}"></span>`; };

      /* Drilling in is a NAVIGATION, so it writes history. Without this the address bar sat still
       * while the screen changed, Back left the module rather than going up a level, and a reload
       * landed on the list you started from. */
      const go = (patch) => { Object.assign(orgPath, patch); syncUrl(); rerender(); };

      let html = '';

      // =========================================================================================
      // ORGANISATION
      // =========================================================================================
      if (settingsSection === 'org') {
        html =
          // Search sits in the header beside the title, not in a band of its own above the content.
          // It is a control on this module, and the header is where this module's controls live.
          `<div id="pk-org-resets"></div><div id="pk-org">` + card('Loading…', '', '') + `</div>`;
      }

      // =========================================================================================
      // RECYCLE BIN — nothing here has been destroyed, and nothing here can be destroyed quickly.
      // =========================================================================================
      else if (settingsSection === 'trash') {
        html = `<div id="pk-trash">` + card('Loading…', '', '') + `</div>`;
      }

      // =========================================================================================
      // PREFERENCES — appearance + behaviour + notifications, merged. All three were "this
      // browser only"; three tabs for a dozen toggles was a split that earned nothing.
      // =========================================================================================
      else if (settingsSection === 'prefs') {
        const light = getTheme() === LIGHT_THEME;
        const swatches = Object.keys(ACCENTS).map((k) =>
          `<button class="pk-set-swatch${prefs.accent === k ? ' is-active' : ''}${k ? '' : ' pk-set-swatch-def'}" type="button" data-pref-choice="accent" data-val="${k}" title="${esc(k ? ACCENTS[k].name : 'Theme default')}"${k ? ` data-pk-sw="${esc(ACCENTS[k].red)}"` : ''}><span></span></button>`).join('');
        const ovNew = getGlobalOverlayUi() === 'new';
        const viewOpts = [
          { value: 'dash', label: 'Queue' }, { value: 'notifs', label: 'Notifications' },
          { value: 'threads', label: 'Comments' }, { value: 'patterns', label: 'Patterns' },
          { value: 'insights', label: 'Insights' }, { value: 'settings', label: 'Settings' },
        ];
        html =
          card('Appearance', '',
            /* The same switch as every other toggle on this screen, reading the way a switch is
             * expected to: ON means the thing named in the label is on. The bespoke sun/moon pill
             * it replaces was the only control here with its own shape AND its own semantics —
             * it showed the mode you would GET rather than the mode you were IN, so half the time
             * it looked like it was reporting the opposite of the truth. */
            row('Dark mode', '',
              `<button class="pk-set-switch" type="button" role="switch" aria-checked="${!light}" data-theme-toggle><span class="pk-set-switch-thumb"></span></button>`) +
            row('Accent', '', `<div class="pk-set-swatches">${swatches}</div>`) +
            row('Density', '', segCtl('density', [{ v: 'comfortable', l: 'Comfortable' }, { v: 'compact', l: 'Compact' }])) +
            row('Reduce motion', '', swCtl('reduceMotion'))) +
          card('Startup', '',
            row('Remember last view', '', swCtl('rememberView')) +
            row('Landing view', '', mkDropdown('pk-set-landing', {
              value: prefs.landingView, items: viewOpts.map((o) => ({ ...o, onSelect: () => { prefs.landingView = o.value; savePrefs(); } })),
            }))) +
          card('Queue', '',
            row('Default sort', '', mkDropdown('pk-set-sort', {
              value: prefs.defaultSort, items: [
                { value: 'new', label: 'Newest First' }, { value: 'old', label: 'Oldest First' }, { value: 'page', label: 'Page A–Z' },
              ].map((o) => ({ ...o, onSelect: () => { prefs.defaultSort = o.value; sort = o.value; savePrefs(); } })),
            })) +
            row('Auto-refresh', '', mkDropdown('pk-set-refresh', {
              value: String(prefs.refreshSecs), items: [
                { value: '0', label: 'Off' }, { value: '5', label: 'Every 5s' }, { value: '15', label: 'Every 15s' },
                { value: '30', label: 'Every 30s' }, { value: '60', label: 'Every 60s' },
              ].map((o) => ({ ...o, onSelect: () => { prefs.refreshSecs = +o.value; savePrefs(); restartAutoRefresh(); } })),
            })) +
            row('Confirm before delete', '', swCtl('confirmDelete'))) +
          card('Notifications', '',
            row('Status changes', '', swCtl('notifEvents.status')) +
            row('Replies', '', swCtl('notifEvents.reply')) +
            row('Directed to you', '', swCtl('notifEvents.directed')) +
            row('Revoked', '', swCtl('notifEvents.revoked')) +
            row('Nav badge counts', '', swCtl('notifBadges')) +
            row('Desktop notifications', '', swCtl('desktopNotif')) +
            row('Sound', '', swCtl('sound'))) +
          // Shared, not personal — so it says so. This is the one setting on this screen that
          // changes what other people see.
          card('Overlay style', 'Applies to everyone, in real time.',
            row('Style', `Currently ${ovNew ? 'New (HUD)' : 'Old (box)'}.`,
              `<div class="pk-set-seg" role="group" id="pk-set-overlayui">` +
                `<button class="pk-set-segbtn${ovNew ? '' : ' is-active'}" type="button" data-overlayui="old">Old</button>` +
                `<button class="pk-set-segbtn${ovNew ? ' is-active' : ''}" type="button" data-overlayui="new">New</button>` +
              `</div>`)) +
          dangerCard(row('Reset preferences', 'Restores every setting on this screen to its default.', actBtn('reset-prefs', 'Reset', 'danger')));
      }

      // =========================================================================================
      // ACCOUNT
      // =========================================================================================
      else if (settingsSection === 'account') {
        const acct = getAccount();
        html =
          card('Signed in', '',
            row('Identity', '', pill(acct ? (acct.email || '') : (getSession().team || ADMIN_TEAM))) +
            (acct && acct.role ? row('Role', '', pill(acct.role)) : '')) +
          card('Access ID', '',
            `<div id="pk-my-access"><div class="pk-set-row"><div class="pk-set-row-main">` +
              `<div class="pk-set-row-desc">Loading…</div></div></div></div>`) +
          card('Touch ID', '',
            `<div id="pk-pk-state" class="pk-set-row"><div class="pk-set-row-main"><div class="pk-set-row-label">Checking this device…</div></div></div>` +
            `<div id="pk-pk-list"></div>`) +
          dangerCard(row('Log out', 'Ends this session on this browser.', actBtn('logout', 'Log out', 'danger')));
      }

      // =========================================================================================
      // SYSTEM
      // =========================================================================================
      else {
        const mode = LOCAL ? 'Demo (localStorage)' : 'Cloudflare Worker';
        const kbd = (k) => `<kbd class="pk-set-kbd">${k}</kbd>`;
        html =
          card('Storage', '',
            row('Mode', '', pill(mode)) +
            (LOCAL ? '' : row('Worker URL', esc(WORKER_URL), actBtn('copy-worker', 'Copy', 'pk-a--quiet'))) +
            (LOCAL ? '' : row('Health check', '', `<span class="pk-set-ping" id="pk-set-ping">—</span> ${actBtn('ping', 'Ping', 'pk-a--quiet')}`))) +
          card('Export', '',
            row(`${n(all.length, 'record')}`, '', actBtn('export-json', 'JSON', 'pk-a--quiet') + ' ' + actBtn('export-csv', 'CSV', 'pk-a--quiet') + ' ' + actBtn('export-md', 'Markdown', 'pk-a--quiet'))) +
          card('Policy', '', `<div id="pk-policy">${emptyRow('Loading…')}</div>`) +
          card('Sign-ins', 'When each person signed in, and how long they stayed.', `<div id="pk-sessions">${emptyRow('Loading…')}</div>`) +
          card('Recent changes', '', `<div id="pk-auditlog">${emptyRow('Loading…')}</div>`) +
          card('About', '',
            row('Version', '', pill('v' + PK_VERSION)) +
            row('Navigate tickets', '', `${kbd('J')} ${kbd('K')}`) +
            row('Close detail', '', kbd('Esc')) +
            row('Post reply', '', `${kbd('⌘/Ctrl')} ${kbd('Enter')}`)) +
          (LOCAL ? dangerCard(row('Clear demo data', 'Deletes every locally-stored demo ticket. Cannot be undone.', actBtn('clear-demo', 'Clear', 'danger'))) : '');
      }

      panel.innerHTML = html;

      mounts.forEach((m) => { const el = document.getElementById(m.slotId); if (el) el.appendChild(m.dd.el); });
      if (settingsSection === 'account') { wirePasskeys(); wireMyAccess(); }
      if (settingsSection === 'org') {
        fillOrg();
        const q = $('#pk-org-q');
        if (q) {
          // Re-filter in place rather than re-rendering the section, so the caret never moves.
          q.addEventListener('input', () => { orgQuery = q.value; fillOrg(); });
        }
      }
      if (settingsSection === 'trash') fillTrash();
      if (settingsSection === 'system') { fillPolicy(); fillSessions(); fillAuditLog(); }

      // Pending PIN resets mean somebody is locked out RIGHT NOW. That is a queue, not a setting,
      // so it is badged on the tab and surfaced above everything else until it is cleared.
      (async () => {
        if (LOCAL) return;
        try {
          const pending = await store.resetsList();
          const b = host.querySelector('[data-badge="org"]');
          if (b && pending.length) { b.textContent = String(pending.length); b.hidden = false; }
        } catch (e) { /* a badge is never worth an error */ }
      })();

      // ---- shared helpers for the Organisation screens ---------------------------------------
      const showOnce = (who, secret, what) => pkAlert(
        `${what} for ${who}:\n\n${secret}\n\nCopy it now — it is stored hashed and cannot be shown again.`);
      /* The pair a new person needs, and NOT a show-once: the Access Key stays readable in the
       * people table and on their page, deliberately, because the Builder is the one who reads it
       * back to them when they lose it. Only the PIN is hashed and gone after this. */
      const showSignIn = (who, accessKey, pin) => pkAlert(
        `Sign-in details for ${who}:\n\n` +
        `Access Key   ${accessKey || '(being issued)'}\n` +
        `PIN          ${pin}\n\n` +
        `The Access Key is on their page whenever you need it again. The PIN is stored hashed — hand it over now.`);
      const askPin = async (title) => {
        const v = await pkPrompt({ title, message: '6–12 digits. Not a repeated digit or a run (e.g. 123456).', value: '', confirmLabel: 'Set PIN' });
        return v === null ? null : String(v).trim();
      };

      /* Deployment policy. Each of these was a constant in the worker — a decision wearing a
       * constant's clothing. Changing one here changes behaviour, not just this screen. */
      async function fillPolicy() {
        const holder = $('#pk-policy'); if (!holder) return;
        let pol;
        try { pol = await store.policyGet(); }
        catch (e) { holder.innerHTML = emptyRow('Could not load — ' + esc(e.message)); return; }
        const num = (k, label, desc, opts) =>
          row(label, desc, `<div class="pk-set-seg" role="group">` +
            opts.map((o) => `<button class="pk-set-segbtn${pol[k] === o ? ' is-active' : ''}" type="button" data-policy="${k}" data-pval="${o}">${o}</button>`).join('') + `</div>`);
        const sw = (k, label, desc) =>
          row(label, desc, `<button class="pk-set-switch" type="button" role="switch" aria-checked="${!!pol[k]}" data-policy="${k}" data-pval="${!pol[k]}"><span class="pk-set-switch-thumb"></span></button>`);
        holder.innerHTML =
          num('sessionHours', 'Session length', 'Hours before a tab asks for the PIN again.', [4, 8, 12, 24]) +
          num('lockAfter', 'Lock after', 'Failed attempts before a cool-off.', [3, 5, 10]) +
          num('hardLockAfter', 'Hard lock after', 'Failed attempts before only you can clear it.', [10, 15, 25]) +
          /* No "allow shared team keys" switch. There is no shared team key to allow — it was
           * removed rather than made optional, which is the only version of "off" that cannot be
           * switched back on by somebody who does not know what it did. */
          sw('requirePasskeyForBuilder', 'Builders must use a passkey', 'PIN sign-in is refused for Builder accounts.');
        holder.querySelectorAll('[data-policy]').forEach((b) => b.addEventListener('click', async () => {
          const raw = b.dataset.pval;
          const v = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
          try { await store.policySet({ [b.dataset.policy]: v }); fillPolicy(); }
          catch (e) { pkAlert('Could not save — ' + e.message); }
        }));
      }

      /* Sign-in history. The live session table cannot answer this — it deletes the row when the
       * session ends, which is precisely when the duration becomes knowable — so the server keeps
       * an append-only copy and works the duration out there. Nothing is computed here beyond
       * formatting, so this screen cannot disagree with the API about how long anyone was on. */
      async function fillSessions() {
        const holder = $('#pk-sessions'); if (!holder) return;
        let rows;
        try { rows = (await store.sessions()).sessions || []; }
        catch (e) { holder.innerHTML = emptyRow('Could not load — ' + esc(e.message)); return; }
        if (!rows.length) { holder.innerHTML = emptyRow('No sign-ins recorded yet.'); return; }

        // Rounded, not precise. "4h 20m" is what somebody reads this for; seconds would be noise.
        const dur = (ms) => {
          const mins = Math.round(ms / 60000);
          if (mins < 1) return 'under a minute';
          if (mins < 60) return mins + 'm';
          const h = Math.floor(mins / 60), m = mins % 60;
          return m ? `${h}h ${m}m` : `${h}h`;
        };
        const when = (iso) => new Date(iso).toLocaleString(undefined,
          { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        /* Why it ended, in words. 'expired' and 'signout' are ordinary; the rest happened TO the
         * person — their account was switched off, their PIN was reset — and reading "ended:
         * disabled" beside a short session is often the actual answer to why they called. */
        const REASON = {
          signout: 'signed out', expired: 'expired', 'pin-change': 'PIN changed',
          disabled: 'account disabled', deleted: 'account deleted', revoked: 'revoked',
        };
        holder.innerHTML = rows.slice(0, 50).map((s) => row(
          esc(s.email) + (s.team ? ' · ' + esc(s.team) : ''),
          when(s.startedAt) + ' · ' + (s.live ? 'still signed in' : dur(s.durationMs) + ' · ' + esc(REASON[s.endedReason] || s.endedReason || 'ended')),
          s.live ? pill('live') : pill(dur(s.durationMs)))).join('');
      }

      /* Who changed what. account_audit only ever covered accounts, so "who deleted this team"
       * and "who changed visibility" had no answer at all. */
      async function fillAuditLog() {
        const holder = $('#pk-auditlog'); if (!holder) return;
        try {
          const rows = await store.auditLog();
          holder.innerHTML = rows.length
            ? rows.slice(0, 25).map((r) => row(esc(r.action),
                `${esc(r.target_ref)} · ${esc(r.actor)} · ${esc((r.at || '').slice(0, 16).replace('T', ' '))}${r.detail ? ' · ' + esc(r.detail) : ''}`, '')).join('')
            : emptyRow('Nothing yet.');
        } catch (e) { holder.innerHTML = emptyRow('Could not load — ' + esc(e.message)); }
      }

      /* The recycle bin. Restoring is one click; destroying takes the Builder password twice, a
       * day apart. The screen states where each item is in that sequence rather than presenting a
       * Delete button that sometimes works — a control that refuses half the time teaches people
       * to click it twice, which is the opposite of the point. */
      async function fillTrash() {
        const holder = $('#pk-trash'); if (!holder) return;
        let data;
        try { data = await store.trashList(); }
        catch (e) { holder.innerHTML = card('Recycle bin', '', emptyRow('Could not load — ' + esc(e.message))); return; }
        const items = data.items || [];
        if (!items.length) {
          holder.innerHTML = card('Recycle bin', '', emptyRow('Nothing deleted.'));
          return;
        }
        const when = (iso) => !iso ? '' : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const waitLabel = (iso) => {
          const left = Date.parse(iso) - Date.now();
          if (left <= 0) return 'ready now';
          const hrs = Math.ceil(left / 3600000);
          const days = Math.ceil(hrs / 24);
          return hrs > 24 ? 'in ' + days + (days === 1 ? ' day' : ' days') : 'in ' + hrs + 'h';
        };
        /* SELECTION LIVES HERE, not in a mode. The bin is a list you came to clear out, so the
         * checkbox is on every row from the moment you arrive rather than behind a "Select" button
         * — the People table hides selection because browsing is what you mostly do there, and the
         * opposite is true here. */
        const selectable = items.map((it) => it.kind + ':' + it.ref);
        for (const k of [...trashSel]) if (!selectable.includes(k)) trashSel.delete(k);   // drop stale picks
        const allPicked = selectable.length > 0 && trashSel.size === selectable.length;

        holder.innerHTML =
          card('Recycle bin', 'Deleted items keep their history. Access already ended.',
            (items.length
              ? `<div class="pk-set-row pk-trash-bar"><div class="pk-set-row-main">` +
                  `<label class="pk-u-inlinerow"><input type="checkbox" class="pk-tsel-inline" data-trash-all${allPicked ? ' checked' : ''}>` +
                  `<span class="pk-set-row-label">${trashSel.size ? trashSel.size + ' selected' : 'Select all'}</span></label>` +
                `</div><div class="pk-set-ctl">` +
                  (trashSel.size
                    ? `<button class="pk-a danger" type="button" data-trash-purge-batch>Delete ${trashSel.size} permanently</button>`
                    : '') +
                `</div></div>`
              : '') +
            items.map((it) => {
              const key = it.kind + ':' + it.ref;
              return row(
                `<label class="pk-u-inlinerow"><input type="checkbox" class="pk-tsel-inline" data-trash-pick="${esc(key)}"` +
                  `${trashSel.has(key) ? ' checked' : ''}> ${esc(it.name || it.ref)}</label>`,
                `${esc(it.kind)} · deleted ${esc(when(it.deletedAt))}${it.deletedBy ? ' by ' + esc(it.deletedBy) : ''}`,
                `<span class="pk-u-inlinerow">` +
                  `<button class="pk-a pk-a--primary" type="button" data-trash-restore="${esc(it.kind)}" data-trash-ref="${esc(it.ref)}">Restore</button>` +
                  `<button class="pk-a danger" type="button" data-trash-purge="${esc(it.kind)}" data-trash-ref="${esc(it.ref)}">Delete permanently</button>` +
                `</span>`);
            }).join('') || emptyRow('Nothing in the bin.')) +
          card('How permanent deletion works', '',
            emptyRow('One Builder password, and it is gone — a project, a team or a person, singly or as many as you select at once. ' +
              'What each one held is written to the audit log before it is destroyed, because once the record is gone there is nowhere left to look it up.'));

        /* One password for the whole batch, asked once. The list is spelled out IN the prompt:
         * a count is not a confirmation — "delete 12 items" tells you nothing about whether the
         * twelfth is the one you meant to keep. */
        const purge = async (list) => {
          if (!list.length) return;
          const names = list.map((x) => `  · ${x.kind} — ${x.name}`).join('\n');
          const pw = await pkPrompt({
            title: list.length === 1 ? 'Delete permanently' : `Delete ${list.length} permanently`,
            message: `This cannot be undone.\n\n${names}\n\nWhat each one held is recorded in the audit log as it goes.\n\nEnter the Builder password.`,
            value: '', confirmLabel: 'Delete for good', password: true,
          });
          if (pw === null || !pw) return;
          const res = await store.trashPurge(list.map((x) => ({ kind: x.kind, ref: x.ref })), pw);
          trashSel.clear();
          const failed = (res && res.failed) || [];
          if (failed.length) {
            await pkAlert({ title: `Deleted ${res.deleted} of ${list.length}`,
              message: 'These were not deleted:\n' + failed.map((f) => `  · ${f.kind} ${f.ref} — ${f.error}`).join('\n') });
          } else if (res && res.done && res.done.length === 1) {
            await pkAlert({ title: 'Deleted', message: `Recorded in the audit log:\n${res.done[0].detail}` });
          }
          fillTrash();
        };

        holder.querySelectorAll('[data-trash-pick]').forEach((b) => b.addEventListener('change', () => {
          const k = b.dataset.trashPick;
          b.checked ? trashSel.add(k) : trashSel.delete(k);
          fillTrash();
        }));
        holder.querySelector('[data-trash-all]')?.addEventListener('change', (e) => {
          trashSel.clear();
          if (e.target.checked) selectable.forEach((k) => trashSel.add(k));
          fillTrash();
        });
        holder.querySelector('[data-trash-purge-batch]')?.addEventListener('click', async () => {
          const picked = items.filter((it) => trashSel.has(it.kind + ':' + it.ref))
                              .map((it) => ({ kind: it.kind, ref: it.ref, name: it.name || it.ref }));
          try { await purge(picked); } catch (err) { pkAlert(err.message); }
        });
        holder.querySelectorAll('[data-trash-restore],[data-trash-purge]').forEach((b) => {
          b.addEventListener('click', async () => {
            const d = b.dataset;
            try {
              if (d.trashRestore) { await store.trashRestore(d.trashRestore, d.trashRef); return fillTrash(); }
              const it = items.find((x) => x.kind === d.trashPurge && x.ref === d.trashRef);
              await purge([{ kind: d.trashPurge, ref: d.trashRef, name: (it && it.name) || d.trashRef }]);
            } catch (err) { pkAlert(err.message); }
          });
        });
      }

      /* Who is in what — read from `orgData`, which is the last thing fillOrg loaded.
       *
       * These lived INSIDE fillOrg, and the delegated click handler is outside it, so every branch
       * of the team multi-select toolbar threw "teamsIn is not defined" before it did anything:
       * Select all, Clear, Enable, Disable, Delete and Done all failed together, because the line
       * that broke ran before the branch that told them apart. One definition, both callers.
       */
      const projOf = (t) => (t && t.projectId) || 'default';
      /* Where a team IS, which is now a list. `projectId` is only its ORIGIN — the project it was
       * created in — and a team added to a second project still carries the first one there. Fall
       * back to the origin so a server that predates /teams/projects still renders correctly. */
      const projectsOf = (t) => (t && t.projectIds && t.projectIds.length ? t.projectIds : [projOf(t)]);
      const teamsIn = (pid) => (orgData.teams || []).filter((t) => projectsOf(t).includes(pid));
      const peopleIn = (teamName) => (orgData.users || []).filter((u) => (u.team || '') === teamName);
      const peopleInProject = (pid) => {
        const names = new Set(teamsIn(pid).map((t) => t.name));
        return (orgData.users || []).filter((u) => names.has(u.team || ''));
      };
      const ticketsFor = (name) => roots().filter((c) => (c.team || '') === name || (c.toTeam || '') === name).length;
      /** The same count, narrowed to one project — what a team's tile means on a project page. */
      const ticketsHere = (name, pid) => roots().filter((c) =>
        ((c.team || '') === name || (c.toTeam || '') === name) && (c.projectId || 'default') === pid).length;
      /** The Organisation search box, as a predicate. Outside fillOrg for the same reason. */
      const orgHit = (x) => {
        const q2 = orgQuery.trim().toLowerCase();
        return !q2 || String(x || '').toLowerCase().includes(q2);
      };

      async function fillOrg() {
        const outer = $('#pk-org'); if (!outer) return;

        let projects = [], teams = [], users = [];
        try {
          [projects, teams, users] = await Promise.all([
            store.projects().catch(() => []),
            store.teamsList().catch(() => []),
            store.usersList().catch(() => []),
          ]);
        } catch (e) { outer.innerHTML = card('Organisation', '', emptyRow('Could not load — ' + esc(e.message))); return; }
        // Handlers live outside fillOrg (one delegated listener), so what fillOrg loaded has to be
        // reachable from there. Without this the "additional teams" editor threw on `users`.
        orgData = { projects, teams, users };

        /* The page heading says WHERE YOU ARE, not what the module is called.
         *
         * It read "Projects" at every depth — so three levels into Shriram Credit / Content, the
         * largest text on screen still said the one thing you already knew. The title is now the
         * level you are on, with the trail above it and a back button that goes UP one level, not
         * back in history: history would take you to wherever you came from, which after a rename
         * or a delete is often this same page again.
         */
        {
          const head = $('#pk-org-head');
          if (head) {
            const proj = (projects.find((p) => p.id === orgPath.project) || {});
            const TAB_LABEL = { projects: 'Projects', teams: 'Teams', people: 'People' };
            /* A person's heading is their NAME. orgPath.person is an email because that is what is
             * unique, but "ALVAR.DINESH@SHRIRAMCREDIT.IN" as the largest text on the screen is an
             * identifier shouting where a name should be. */
            const whoHere = orgPath.person
              ? ((users.find((x) => x.email === orgPath.person) || {}).displayName || orgPath.person)
              : '';
            const here = whoHere || orgPath.team || proj.name || orgPath.project || TAB_LABEL[orgTab];
            /* The eyebrow is the BREADCRUMB, and every step in it is a link. It was the parent's
             * name as flat text, which told you where you had come from and gave you no way to go
             * there — a trail you can read and not walk. */
            /* The trail names the route you TOOK, not one canonical path. A team reached from the
             * Teams list has no project above it — inventing one would send Back to a project the
             * team merely happens to be in, which is exactly the false containment this tab set
             * exists to stop implying. */
            const steps = [];
            if (orgPath.project) steps.push({ label: 'Projects', go: 'projects' });
            if (orgPath.team && orgPath.project) steps.push({ label: proj.name || orgPath.project, go: 'project' });
            if (orgPath.team && !orgPath.project) steps.push({ label: 'Teams', go: 'teams' });
            if (orgPath.person && orgPath.team) steps.push({ label: orgPath.team, go: 'team' });
            if (orgPath.person && !orgPath.team) steps.push({ label: 'People', go: 'people' });
            const trail = steps.map((x) => x.label);
            const up = orgPath.person ? (orgPath.team ? 'team' : 'people')
              : orgPath.team ? (orgPath.project ? 'project' : 'teams')
              : orgPath.project ? 'projects' : '';
            head.innerHTML =
              /* The trail is its own line ABOVE the row. Inside the row it made the text block two
               * lines tall against a one-line button, so "centred" put the button level with the
               * gap between them and nothing looked aligned with anything. Now every control in the
               * row — back, title, search, More — sits on one axis. */
              (steps.length
                ? `<nav class="pk-org-head-trail">` + steps.map((x, i) =>
                    `<button type="button" class="pk-org-crumb" data-crumb="${x.go}">${esc(x.label)}</button>` +
                    (i < steps.length - 1 ? `<span class="pk-org-crumb-sep">/</span>` : '')).join('') + `</nav>`
                : '') +
              `<div class="pk-org-head">` +
                (up ? `<button type="button" class="pk-org-back" data-crumb="${up}" aria-label="Back to ${esc(trail[trail.length - 1] || 'Projects')}">` +
                  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>` : '') +
                `<div class="pk-org-head-t">` +
                  `<h2>${esc(here)}</h2>` +
                `</div>` +
                /* `.pk-search`, the toolbar search every other screen uses — NOT `.pk-login-input`,
                 * which is 56px because the login form is one deliberately marquee surface. That is
                 * why this box stood a head taller than the buttons beside it and than the search on
                 * every other page. */
                `<div class="pk-org-head-search"><input id="pk-org-q" class="pk-search" type="search" ` +
                  `placeholder="Search projects, teams and people" autocomplete="off" value="${esc(orgQuery)}"></div>` +
                /* ONE ICON, at the top level only. Six creation and import actions spread across
                 * three lists was six buttons competing with a search box for the same strip, and
                 * the strip changed shape every time you switched list. Behind a single More the
                 * header stays the same on all three, and the menu names every action in full —
                 * which an icon row never can. Deeper in, the actions belong to the thing you are
                 * looking at, so this is not offered beside one team three levels down. */
                (up ? '' : `<span class="pk-u-inlinerow pk-org-head-acts">` +
                  `<button class="rvd-moreopts" id="pk-org-more" aria-label="Add or import" aria-haspopup="menu">` +
                    `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
                      `<circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
                  `</button></span>`) +
              `</div>`;
          }
        }

        // The reset queue rides above every Organisation screen, not just the people list.
        (async () => {
          const rh = $('#pk-org-resets'); if (!rh || LOCAL) return;
          try {
            const pending = await store.resetsList();
            rh.innerHTML = !pending.length ? '' : card('Locked out', `${n(pending.length, 'person', 'people')} waiting on you.`,
              pending.map((r) => row(esc(r.email), esc(r.team || '') + (r.requested_at ? ' · ' + esc(r.requested_at.slice(0, 10)) : ''),
                `<span class="pk-u-inlinerow">` +
                  `<button class="pk-a pk-a--primary" type="button" data-reset-approve="${esc(r.id)}" data-reset-email="${esc(r.email)}">Assign new PIN</button>` +
                  `<button class="pk-a" type="button" data-reset-dismiss="${esc(r.id)}">Dismiss</button>` +
                `</span>`)).join(''));
          } catch (e) { rh.innerHTML = ''; }
        })();


        const q = orgQuery.trim().toLowerCase();
        const hit = (x) => !q || String(x || '').toLowerCase().includes(q);
        // ---- level: a person ------------------------------------------------------------------
        if (orgPath.person) {
          const u = users.find((x) => x.email === orgPath.person);
          if (!u) { orgPath.person = null; return fillOrg(); }
          const locked = u.hardLocked || (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now());
          const flags = [];
          if (u.role === 'builder') flags.push('Builder');
          if (!u.hasPin) flags.push('no PIN set');
          if (u.mustChangePin) flags.push('must change PIN');
          if (locked) flags.push(u.hardLocked ? 'locked out' : 'temporarily locked');
          outer.innerHTML =
            /* The trail is the route you TOOK. Reached from the People list there is no project and
             * no team above this person, and printing those steps anyway rendered "Projects / / /"
             * — two empty crumbs and two separators leading nowhere. Built from what is actually
             * set, so it reads People / name, or Projects / Site / Team / name when you drilled. */
            crumbs([
              ...(orgPath.project
                ? [{ label: 'Projects', go: 'projects' },
                   { label: (projects.find((p) => p.id === orgPath.project) || {}).name || orgPath.project, go: 'project' }]
                : [{ label: 'People', go: 'people' }]),
              ...(orgPath.team ? [{ label: orgPath.team, go: 'team' }] : []),
              { label: u.displayName || u.name || u.email },
            ]) +
            /* THREE CARDS, NOT ONE LIST.
             *
             * This was nine rows in a single card — name, status, team, role, access id, PIN, moves
             * — with read-only pills and live buttons at the same weight and nothing saying which
             * belonged together. A person has three separable questions: who they are, where they
             * belong, and how they get in. Grouping them means you can find the one you came for
             * without reading the other six, and it puts the credentials in one place rather than
             * scattered between a rename and a team move.
             *
             * Headed by what they are CALLED, with the record underneath. A roster full of
             * "Valluri Navya Lakshmi Sai Madhav" is correct and unreadable; the person opening this
             * screen is looking for Sai. */
            card(esc(u.displayName || u.name || u.email), esc(u.email) + (flags.length ? ' · ' + flags.join(' · ') : ''),
              row('Full name', 'As it is written on the record.',
                `<span class="pk-u-inlinerow"><span>${esc(u.name || '—')}</span>` +
                `<button class="pk-a" type="button" data-person-rename="${esc(u.email)}" data-person-name="${esc(u.name || '')}" data-person-called="${esc(u.calledName || '')}">Edit</button></span>`) +
              /* THE ROW THAT SHOWS A THING CARRIES THE BUTTON THAT CHANGES IT. Both of these were
               * read-only pills whose real action lived elsewhere — the preferred name behind the
               * Full name row's Edit, the team behind a "Move to another team" row four lines down
               * — so the two attributes people most often correct looked like facts about the
               * account rather than settings of it. */
              row('Preferred to be called', 'What appears through the tool.',
                `<span class="pk-u-inlinerow">${pill(u.calledName || 'Full name')}` +
                `<button class="pk-a" type="button" data-person-rename="${esc(u.email)}" data-person-name="${esc(u.name || '')}" data-person-called="${esc(u.calledName || '')}">Edit</button></span>`)) +

            card('Where they belong', '',
              row('Team', 'Their history moves with them; their tickets become visible inside the new team’s project.',
                `<span class="pk-u-inlinerow">${pill(u.team || 'None')}` +
                `<button class="pk-a" type="button" data-person-move="${esc(u.email)}" data-person-team="${esc(u.team || '')}">Change</button></span>`) +
              // A person spanning two teams was unrepresentable. The primary team still decides
              // which board they land on; this is extra reach on top of it.
              row('Also in', (u.extraTeams || []).join(', ') || 'No other teams',
                `<button class="pk-a" type="button" data-person-extra="${esc(u.email)}">Edit</button>`) +
              row('Role', '', pill(u.role || 'member')) +
              row('Status', '', pill(u.status === 'active' ? 'Active' : 'Disabled'))) +

            card('Signing in', 'Two ways in. The Access ID is the everyday one.',
              /* The Access ID is SHOWN, not masked. The whole reason it is stored readably is so the
               * Builder can tell someone what theirs is — hiding it here would keep the security
               * cost of storing it in the clear and throw away the reason. */
              row('Access ID', 'What they type to sign in.',
                `<span class="pk-u-inlinerow"><code class="pk-set-kbd pk-accesscode">${esc(u.accessId || '— none —')}</code>` +
                `<button class="pk-a" type="button" data-access-copy="${esc(u.accessId || '')}">Copy</button>` +
                `<button class="pk-a" type="button" data-access-new="${esc(u.email)}">New code</button></span>`) +
              row('PIN', 'Backup sign-in, if they lose their Access ID.', `<button class="pk-a" type="button" data-person-reset="${esc(u.email)}">Reset PIN</button>`) +
              (locked ? row('Locked', 'Too many failed attempts.', `<button class="pk-a pk-a--primary" type="button" data-person-unlock="${esc(u.email)}">Unlock</button>`) : '') +
              (u.lastLoginAt ? row('Last signed in', '', pill(u.lastLoginAt.slice(0, 10))) : '')) +
            `<div id="pk-person-audit"></div>` +
            dangerCard(row(u.status === 'active' ? 'Disable account' : 'Enable account',
              u.status === 'active' ? 'Signs them out immediately and blocks sign-in. Their history is kept.' : 'Restores sign-in.',
              `<button class="pk-a danger" type="button" data-person-toggle="${esc(u.email)}" data-person-status="${esc(u.status)}">${u.status === 'active' ? 'Disable' : 'Enable'}</button>`) +
              row('Delete account', 'Moves it to the recycle bin. Access ends now; the record can be restored.',
                `<button class="pk-a danger" type="button" data-person-delete="${esc(u.email)}">Delete</button>`));
          // The audit trail belongs beside the person it describes, not on a screen of its own.
          (async () => {
            const ah = $('#pk-person-audit'); if (!ah) return;
            try {
              const rows = await store.accountAudit(u.email);
              ah.innerHTML = rows.length
                ? card('History', '', rows.slice(0, 12).map((r) =>
                    row(esc(r.action), esc((r.at || '').slice(0, 16).replace('T', ' ')) + (r.note ? ' · ' + esc(r.note) : ''), '')).join(''))
                : '';
            } catch (e) { ah.innerHTML = ''; }
          })();
          return;
        }

        // ---- level: a team --------------------------------------------------------------------
        if (orgPath.team) {
          const t = teams.find((x) => x.name === orgPath.team);
          if (!t) { orgPath.team = null; return fillOrg(); }
          const members = peopleIn(t.name);
          const used = ticketsFor(t.name);
          // A missing key means allowed, so a team that predates permissions keeps its powers.
          let perms = {}; try { perms = JSON.parse(t.permissions || '{}'); } catch (e) {}
          const mine = roots().filter((c) => (c.team || '') === t.name || (c.toTeam || '') === t.name);
          const openOnes = mine.filter((c) => c.status !== 'deployed_live' && c.status !== 'closed');
          const incoming = openOnes.filter((c) => (c.toTeam || '') === t.name);
          const oldest = incoming.slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))[0];
          const health = {
            open: openOnes.length,
            incoming: incoming.length,
            oldest: oldest && oldest.at ? String(oldest.at).slice(0, 10) : '',
          };
          outer.innerHTML =
            // Same rule as the person page: a team opened from the Teams list has no project above
            // it, and printing one would send Back to a project it merely happens to be in.
            crumbs([
              ...(orgPath.project
                ? [{ label: 'Projects', go: 'projects' },
                   { label: (projects.find((p) => p.id === orgPath.project) || {}).name || orgPath.project, go: 'project' }]
                : [{ label: 'Teams', go: 'teams' }]),
              { label: t.name },
            ]) +
            /* A TABLE, not a stack of rows. A team is a list of people you scan across — is
             * everyone's Access ID issued, who is still without a PIN — and stacked rows put every
             * answer on a different line, so the eye has to travel instead of compare. Columns let
             * you read down one and see the gaps at once. */
            card('People', '',
              (() => {
                const shownM = members.filter((u) => hit(u.email) || hit(u.name) || hit(u.calledName));
                if (!shownM.length) return emptyRow(q ? 'No matches.' : 'No people yet.');
                return `<div class="pk-tablewrap"><table class="pk-ptable"><thead><tr>` +
                  `<th>Full name</th><th>Preferred name</th><th>Email</th><th>Team</th><th>Access ID</th><th class="pk-ptable-more"></th>` +
                  `</tr></thead><tbody>` +
                  shownM.map((u) => {
                    /* Team only, in the list. The flags moved to the person's own page: they are
                     * exceptions — disabled, Builder — and a column of mostly-empty exceptions
                     * costs width on every row to say nothing about nearly all of them. */
                    return `<tr class="pk-ptable-row" data-person-open="${esc(u.email)}">` +
                      `<td>${esc(u.name || '—')}</td>` +
                      `<td>${esc(u.calledName || '—')}</td>` +
                      `<td class="pk-ptable-mail">${esc(u.email)}</td>` +
                      `<td>${esc(u.team || '—')}</td>` +
                      `<td>${u.accessId ? `<code class="pk-accesscode">${esc(u.accessId)}</code>` : '<span class="pk-ptable-none">— none —</span>'}</td>` +
                      `<td class="pk-ptable-more"><span class="pk-set-go" aria-hidden="true">` +
                        `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>` +
                      `</span></td></tr>`;
                  }).join('') + `</tbody></table></div>`;
              })() +
              row('', '', `<span class="pk-u-inlinerow">` +
                `<button class="pk-a pk-a--primary" type="button" id="pk-person-add">Add a person</button>` +
                `<button class="pk-a" type="button" id="pk-person-bulk">Add many</button></span>`)) +
            // The board's health, here, so you do not have to leave settings to find out a team is
            // drowning — which is exactly when you would be on this screen.
            card('Workload', '',
              row('Open', '', pill(String(health.open))) +
              row('Awaiting this team', '', pill(String(health.incoming))) +
              row('Oldest unanswered', '', pill(health.oldest || 'none'))) +
            card('Permissions', '',
              PERM_LABELS.map(([k, label]) =>
                row(label, '', `<button class="pk-set-switch" type="button" role="switch" aria-checked="${perms[k] !== false}" ` +
                  `data-perm-team="${esc(t.name)}" data-perm-key="${esc(k)}" data-perm-on="${perms[k] !== false}"><span class="pk-set-switch-thumb"></span></button>`)).join('')) +
            card('Team', '',
              row('Name', '', `<button class="pk-a" type="button" data-team-rename="${esc(t.name)}">Rename</button>`) +
              row('Status', '', pill(t.enabled ? 'Active' : 'Inactive')) +
              row('Tickets', '', pill(String(used))) +
              /* Two different questions, so two rows. "Project" is still the team's ORIGIN and still
               * moves it. "Also in" is every project it is worked with on — the plural answer, which
               * a single Move button cannot give and would misrepresent as a choice of one. */
              row('Project', '', `<button class="pk-a" type="button" data-team-project="${esc(t.name)}" data-team-current="${esc(projOf(t))}">${esc(projOf(t))}</button>`) +
              row('In projects', projectsOf(t).map((id) => (projects.find((x) => x.id === id) || {}).name || id).join(', '),
                orgPath.project
                  ? `<button class="pk-a" type="button" data-team-unlink="${esc(t.name)}" data-team-unlink-project="${esc(orgPath.project)}">Remove from this project</button>`
                  : '') +
              row('Board', '', `<button class="pk-a" type="button" data-team-view="${esc(t.name)}">Open board</button>`) +
              /* No password row. A team has no credential to change — the people in it each have
               * their own Access Key, and taking someone's access away means moving them off the
               * team or disabling their account, both of which are on their own page. */
              row('Export', 'Structure, people and work. No Access Keys or PINs travel.', `<button class="pk-a" type="button" data-export-team="${esc(t.name)}">Export team</button>`)) +
            dangerCard(
              row(t.enabled ? 'Disable team' : 'Enable team',
                t.enabled ? 'Nobody on it can sign in. Tickets and history are kept.' : 'Its people can sign in again.',
                `<button class="pk-a danger" type="button" data-team-toggle="${esc(t.name)}" data-team-enabled="${t.enabled ? '1' : '0'}">${t.enabled ? 'Disable' : 'Enable'}</button>`) +
              // No longer blocked by ticket count: deletion is recoverable now, so the reason for
              // that block (orphaning history forever) no longer applies.
              row('Delete team', 'Moves it to the recycle bin. Its people are signed out immediately; the record can be restored.',
                `<button class="pk-a danger" type="button" data-team-delete="${esc(t.name)}" data-team-used="${used}">Delete</button>`));
          return;
        }

        // ---- level: a project -----------------------------------------------------------------
        if (orgPath.project) {
          const p = projects.find((x) => x.id === orgPath.project);
          if (!p) { orgPath.project = null; return fillOrg(); }
          const ts = teamsIn(p.id);
          outer.innerHTML =
            crumbs([{ label: 'Projects', go: 'projects' }, { label: p.name || p.id }]) +
            /* No 'Project' heading. The breadcrumb directly above already reads
             * Projects / <this project>, and the page is the project — a card labelled Project
             * inside it restates the thing you are looking at. */
            card('', '',
              row('Name', '', `<button class="pk-a" type="button" data-project-rename="${esc(p.id)}" data-project-name="${esc(p.name || p.id)}">Rename</button>`) +
              row('Kind', '', pill(p.kind || 'owned'))) +
            card('Teams', '',
              (ts.filter((t) => hit(t.name)).length
                ? tileGrid(ts.filter((t) => hit(t.name)).map((t) => (teamSelectMode
                    ? `<label class="pk-set-tile pk-tsel${teamSel.has(t.name) ? ' is-picked' : ''}">` +
                        `<input type="checkbox" class="pk-tsel-box" data-team-pick="${esc(t.name)}"${teamSel.has(t.name) ? ' checked' : ''}>` +
                        `<span class="pk-set-tile-t">${esc(t.name)}${t.enabled ? '' : ' · inactive'}</span>` +
                        `<span class="pk-set-tile-n">${peopleIn(t.name).length} people · ${ticketsHere(t.name, p.id)} tickets</span>` +
                      `</label>`
                    : drillCard(`data-team-open="${esc(t.name)}"`,
                        esc(t.name), t.enabled ? '' : 'inactive', [
                          [peopleIn(t.name).length, 'people'],
                          /* THIS project's tickets for this team, not the team's total. On a
                           * project page a team working on three projects would otherwise show the
                           * same number on all three, and the number would answer a question the
                           * page is not asking. The team's own page still shows its total. */
                          [ticketsHere(t.name, p.id), 'tickets'],
                        ]))).join(''))
                : emptyRow(q ? 'No matches.' : 'No teams yet.')) +
              (teamSelectMode
                ? row('', '', `<span class="pk-u-inlinerow">` +
                    `<span class="pk-tsel-n">${teamSel.size} selected</span>` +
                    `<button class="pk-a" type="button" data-tsel="all">Select all</button>` +
                    `<button class="pk-a" type="button" data-tsel="none">Clear</button>` +
                    `<button class="pk-a" type="button" data-tsel="enable">Enable</button>` +
                    `<button class="pk-a" type="button" data-tsel="disable">Disable</button>` +
                    `<button class="pk-a danger" type="button" data-tsel="delete">Delete</button>` +
                    `<button class="pk-a" type="button" data-tsel="done">Done</button></span>`)
                : '') +
              /* Add a team is the daily act and stays a button. Import and Export are neither daily
               * nor reversible-by-accident, and sitting as equal siblings they read as three things
               * you might do next — so they move behind the More icon, the same pattern Delete All
               * uses on notifications. */
              /* "Add an existing team" sits beside "Add a team" because from here they are the same
               * intention — this project needs Content — and the difference is only whether Content
               * already exists somewhere else. Hidden when every team is already here, so it never
               * opens onto an empty list. */
              row('', '', `<span class="pk-u-inlinerow">` +
                `<button class="pk-a pk-a--primary" type="button" id="pk-team-add">Add a team</button>` +
                (teams.some((t) => !projectsOf(t).includes(p.id))
                  ? `<button class="pk-a" type="button" id="pk-team-existing">Add an existing team</button>` : '') +
                `<button class="rvd-moreopts" id="pk-proj-more" aria-label="More options" aria-haspopup="menu">` +
                  `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
                    `<circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
                `</button></span>`)) +
            `<div id="pk-vis-mode"></div><div id="pk-vis-matrix"></div><div id="pk-vis-links"></div>` +
            (p.id === 'default' ? '' : dangerCard(
              row('Delete project', 'Moves it to the recycle bin. Move or delete its teams first.',
                `<button class="pk-a danger" type="button" data-project-delete="${esc(p.id)}">Delete</button>`)));
          fillVisibility(p.id);
          return;
        }

        /* ---- top level: three flat lists ------------------------------------------------------
         *
         * Projects, teams and people are three INDEPENDENT lists of the same instance, not three
         * depths of one tree. Only projects contain anything; a team is worked with on projects and
         * a person belongs to a team, and neither is owned by one place any more. */
        /* No in-page tab strip. The rail's Organization group already names the three lists, and
         * a second switch immediately under it would be the same control twice — two things to
         * keep in step, and a moment's doubt about whether they mean different things. */

        if (orgTab === 'teams') {
          /* A TABLE, like the people list on a team page: a team is now something you scan ACROSS —
           * which projects, how many people, how much work — and stacked tiles put each answer on a
           * different line, so the eye travels instead of comparing. */
          const shownT = teams.filter((t) => hit(t.name) || projectsOf(t).some((id) => hit(id)));
          outer.innerHTML =
            card('', '', shownT.length
              ? `<div class="pk-tablewrap"><table class="pk-ptable"><thead><tr>` +
                `<th>Team</th><th>In projects</th><th>People</th><th>Tickets</th><th>Status</th><th class="pk-ptable-more"></th>` +
                `</tr></thead><tbody>` +
                shownT.map((t) => `<tr class="pk-ptable-row" data-team-open="${esc(t.name)}">` +
                  `<td>${esc(t.name)}</td>` +
                  `<td>${esc(projectsOf(t).map((id) => (projects.find((p) => p.id === id) || {}).name || id).join(', '))}</td>` +
                  `<td>${peopleIn(t.name).length}</td>` +
                  `<td>${ticketsFor(t.name)}</td>` +
                  `<td>${t.enabled ? 'Active' : 'Inactive'}</td>` +
                  `<td class="pk-ptable-more"><span class="pk-set-go" aria-hidden="true">` +
                    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>` +
                  `</span></td></tr>`).join('') + `</tbody></table></div>`
              : emptyRow(q ? 'No matches.' : 'No teams yet.'));
          return;
        }

        if (orgTab === 'people') {
          /* Every account in the instance. An email is unique instance-wide, so this is the only
           * list that can honestly claim to be all of them — reaching a person used to mean knowing
           * which team they were on and drilling three levels to get there. */
          const shownP = users.filter((u) => hit(u.email) || hit(u.name) || hit(u.calledName) || hit(u.team));
          /* SELECT MODE, the same shape the project page gives teams: off by default and reached
           * from More, because selecting is not what you come here to do — a checkbox on all 132
           * rows all the time makes browsing feel like filing.
           *
           * In select mode the row TICKS instead of opening. A row that both navigates and selects
           * has to guess which you meant from where you clicked, and gets it wrong often enough to
           * be worse than either. */
          const sel = peopleSelectMode;
          /* ONE LIST, NOT A STACK OF TEAM CARDS.
           *
           * Grouping by team put the org chart first and the person second: finding somebody meant
           * knowing their team, and the answer to "where is this person" was spread over eleven
           * cards. The team is a COLUMN now — and an editable one, so the fix for a wrong team is
           * on the row that shows it rather than three levels away on their page.
           *
           * PROJECT COMES FIRST because the team depends on it: which teams a person can be put on
           * is a question about the project those teams work in, so the narrowing column is read
           * first. It is derived and read-only — a person's project comes from their team, so
           * showing it as editable would offer a choice the data model does not have. */
          const teamsByName = new Map((teams || []).map((t) => [t.name, t]));
          const projName = (id) => (projects.find((x) => x.id === id) || {}).name || id;
          /* Every project this person's team works on. Their own `projectId` is the team's ORIGIN;
           * the join table is where the team actually works, so a team on three sites shows three. */
          const projectsOfPerson = (u) => {
            const t = teamsByName.get(u.team);
            const ids = t ? projectsOf(t) : (u.projectId ? [u.projectId] : []);
            return [...new Set(ids)].map(projName).sort((a, b) => a.localeCompare(b));
          };

          const personRow = (u) => {
            const ps = projectsOfPerson(u);
            /* The Team cell READS. It was a live dropdown, which made this column the one place in
             * the table where a click did something other than open the person — and it was a
             * second way to do a thing the person's own page already does properly, with a pill
             * and a Change button that explains what moving them costs. Two controls for one
             * action means one of them is the wrong one to have used, and this was it: a menu that
             * reassigns somebody's team on a mis-click, in a row you were trying to open.
             *
             * A BUILDER IS NOT UNALLOCATED. They are exempt from needing a team — they are the
             * ones who hand teams out — so offering them the fix for a problem they do not have
             * would put a red call-to-action on the healthiest row on the screen. */
            const exempt = u.role === 'builder';
            const teamCell = u.team
              ? `<span class="pk-cellteam">${esc(u.team)}</span>`
              : exempt
              ? `<span class="pk-set-pill">Builder</span>`
              /* No team is not an empty cell. It is the one state that stops this person signing
                 in, so it says so and offers the fix in place. */
              : `<button class="pk-a pk-a--primary pk-cellcta" type="button" data-person-allocate="${esc(u.email)}">Allocate</button>`;
            return `<tr class="pk-ptable-row${sel && peopleSel.has(u.email) ? ' is-picked' : ''}${u.team || exempt ? '' : ' is-unallocated'}" ` +
            (sel ? `data-person-pick="${esc(u.email)}"` : `data-person-open="${esc(u.email)}"`) + `>` +
            (sel ? `<td class="pk-ptable-pick"><input type="checkbox" class="pk-tsel-box" tabindex="-1"` +
              `${peopleSel.has(u.email) ? ' checked' : ''}></td>` : '') +
            /* PREFERRED NAME, and only that. The full name was the first column and the preferred
               one sat beside it repeating most of it — two columns to say who somebody is, when the
               name people actually use is the one you scan for. The full name is on their page. */
            `<td>${esc(u.calledName || u.name || '—')}</td>` +
            `<td data-cell="team">${teamCell}</td>` +
            /* ONE project, named. A person can reach several; listing them all made the widest
               column on the table out of the least-read value. The rest are on their page. */
            `<td>${ps.length ? esc(projLabel(ps[0])) + (ps.length > 1 ? `<span class="pk-ptable-none"> +${ps.length - 1}</span>` : '') : '<span class="pk-ptable-none">— none —</span>'}</td>` +
            `<td class="pk-ptable-mail">${esc(u.email)}</td>` +
            /* Copy in the LISTING. Reading a code back to somebody meant opening their page first;
               the code is right here, so the button that hands it over should be too. */
            `<td>${u.accessId
              ? `<span class="pk-u-inlinerow"><code class="pk-accesscode">${esc(u.accessId)}</code>` +
                `<button class="pk-a pk-copyid" type="button" data-copy-id="${esc(u.accessId)}" aria-label="Copy ${esc(u.accessId)}" title="Copy">${ICON.copy}</button></span>`
              : '<span class="pk-ptable-none">— none —</span>'}</td>` +
            `<td class="pk-ptable-more">${sel ? '' : `<span class="pk-set-go" aria-hidden="true">` +
              `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>` +
            `</span>`}</td></tr>`;
          };
          /* THE PROJECT'S OWN NAME, not the organisation's.
           *
           * Projects here are named "Shriram Credit | Website Revamp", and every row in the column
           * repeated the same six characters before saying anything that distinguished it. The
           * segment after the last separator is the part that varies, which is the part worth
           * reading in a column. The full name is unchanged everywhere else — this is a label for
           * a narrow cell, not a rename. */
          const projLabel = (name) => {
            const parts = String(name || '').split(/\s*[|·–—]\s*/).filter(Boolean);
            return parts.length > 1 ? parts[parts.length - 1] : String(name || '');
          };

          /* Unallocated first. They are the only rows that represent something broken — an account
           * that cannot sign in — so they are the ones worth seeing without scrolling. */
          const stranded = (u) => !u.team && u.role !== 'builder';
          const ordered = [...shownP].sort((a, b) =>
            (stranded(a) ? 0 : 1) - (stranded(b) ? 0 : 1)
            || (a.team || '').localeCompare(b.team || '')
            || (a.name || a.email).localeCompare(b.name || b.email));

          /* ONE GEOMETRY FOR EVERY GROUP.
           *
           * Each team is its own <table>, and a table sizes its columns from its OWN content — so
           * Marketing's five short names gave it a narrow first column while Products' fifteen long
           * ones gave it a wide one, and the headings marched left and right down the page. Widths
           * are declared here and the layout fixed, so every group lines up whatever is in it.
           *
           * Fixed layout means a long value has to be told what to do instead of stretching its
           * column: the cells ellipsize (see .pk-ptable--fixed in components.css). */
          const cols = (sel ? `<col class="pk-c-pick">` : '') +
            `<col class="pk-c-pref"><col class="pk-c-team"><col class="pk-c-proj">` +
            `<col class="pk-c-mail"><col class="pk-c-id"><col class="pk-c-go">`;
          /* WIDTHS ARE A DEFAULT, NOT A RULING. Every column that carries a value can be dragged
           * by its right edge and is remembered afterwards — see applyColWidths(), which re-applies
           * the remembered pixels after each of the many innerHTML writes this function makes.
           *
           * The grip names its own <col> class rather than counting on position, because the pick
           * column comes and goes with select mode and an index would slide by one the moment it
           * did. The pick and chevron columns get no grip at all: they are 36px of furniture, and
           * a resize handle on them offers a choice with nothing on either side of it. */
          const grip = (c) => `<span class="pk-colgrip" data-colgrip="${c}" aria-hidden="true" ` +
            `title="Drag to resize · double-click to reset"></span>`;
          const peopleTable = (list) => `<div class="pk-tablewrap"><table class="pk-ptable pk-ptable--fixed pk-ptable--resize">` +
            `<colgroup>${cols}</colgroup><thead><tr>` +
            (sel ? `<th class="pk-ptable-pick"></th>` : '') +
            `<th>Name${grip('pk-c-pref')}</th><th>Team${grip('pk-c-team')}</th>` +
            `<th>Project${grip('pk-c-proj')}</th><th>Email${grip('pk-c-mail')}</th>` +
            `<th>Access ID${grip('pk-c-id')}</th><th class="pk-ptable-more"></th>` +
            `</tr></thead><tbody>` + withGaps(list) + `</tbody></table></div>`;

          /* A ROW OF SPACE BETWEEN TEAMS.
           *
           * The list is one table so every column lines up — that was the whole point of flattening
           * it — but 36 unbroken rows read as one undifferentiated block, and the Team column alone
           * is not enough to see where one ends and the next begins. A blank row is the cheapest
           * possible divider: it needs no heading, no border and no collapsing behaviour, and it
           * cannot fall out of step with the sort because it is derived from it.
           *
           * Not before the first group, and not after the last — a gap at either end is padding
           * pretending to be structure. */
          const withGaps = (list) => list.map((u, i) => {
            const key = (x) => (x.team || (x.role === 'builder' ? '\u0000builder' : ''));
            const gap = i > 0 && key(list[i - 1]) !== key(u)
              ? `<tr class="pk-ptable-gap" aria-hidden="true"><td colspan="${sel ? 7 : 6}"></td></tr>` : '';
            return gap + personRow(u);
          }).join('');

          const homeless = shownP.filter((u) => !u.team && u.role !== 'builder').length;
          outer.innerHTML =
            (shownP.length
              ? card('', n(shownP.length, 'person', 'people') +
                  (homeless ? ` · ${homeless} cannot sign in` : ''), peopleTable(ordered)) +
                /* The bar sits under ALL the groups, because a selection spans them: ticking two
                 * people from Content and one from Design is one action, not three. */
                (sel ? card('', '', row('', '', `<span class="pk-u-inlinerow">` +
                  `<span class="pk-tsel-n">${peopleSel.size} selected</span>` +
                  `<button class="pk-a" type="button" data-psel="all">Select all</button>` +
                  `<button class="pk-a" type="button" data-psel="none">Clear</button>` +
                  `<button class="pk-a pk-a--primary" type="button" data-psel="access">Issue Access IDs</button>` +
                  `<button class="pk-a" type="button" data-psel="enable">Enable</button>` +
                  `<button class="pk-a" type="button" data-psel="disable">Disable</button>` +
                  `<button class="pk-a danger" type="button" data-psel="delete">Delete</button>` +
                  `<button class="pk-a" type="button" data-psel="done">Done</button></span>`)) : '')
              : card('', '', emptyRow(q ? 'No matches.' : 'No people yet.')));
          /* This is a render point like any other, and it is the one that rewrites this table.
           * Everything the CSP forbids in markup — the remembered column widths, the enhanced
           * dropdowns in the Team cells — is applied by paintDynamic, and fillOrg is asynchronous:
           * the paint renderSettings() schedules for the next tick has already come and gone by the
           * time this HTML lands, so waiting for it means waiting forever. */
          paintDynamic(outer);
          return;
        }

        // ---- level: all projects --------------------------------------------------------------
        const shown = projects.filter((p) => hit(p.name) || hit(p.id)
          || teamsIn(p.id).some((t) => hit(t.name)) || peopleInProject(p.id).some((u) => hit(u.email)));
        /* Counted by the ticket's OWN project, not by which teams work here.
         *
         * Deriving it from team names double-counted the moment a team worked on two projects: the
         * same ticket answered for both, so two projects each claimed all five. A ticket has said
         * which project it belongs to since pins started carrying one — ask it, rather than
         * inferring from its author. Older rows carry the derived value and still answer correctly. */
        const ticketsInProject = (pid) =>
          roots().filter((c) => (c.projectId || 'default') === pid).length;
        outer.innerHTML =
          (shown.length
            ? tileGrid(shown.map((p) => drillCard(`data-project-open="${esc(p.id)}"`,
                esc(p.name || p.id), esc(p.kind || 'owned'), [
                  [teamsIn(p.id).length, 'teams'],
                  [peopleInProject(p.id).length, 'people'],
                  [ticketsInProject(p.id), 'tickets'],
                ])).join(''), true)
            : `<div class="pk-set-card"><div class="pk-set-card-b">${emptyRow(q ? 'No matches.' : 'No projects yet.')}</div></div>`) +
          '';   // the actions live in the page header now — see fillOrg's header block
      }

      /* Who sees whose comments. It lives INSIDE a project because that is what it is a property
       * of — editing it three screens away from the project it governs was most of why it read as
       * confusing. */
      async function fillVisibility(PROJECT) {
        const modeHost = $('#pk-vis-mode'), gridHost = $('#pk-vis-matrix'), linkHost = $('#pk-vis-links');
        if (!modeHost) return;
        let data;
        try { data = await store.visibilityGet(PROJECT); }
        catch (e) { modeHost.innerHTML = card('Visibility', '', emptyRow('Could not load — ' + esc(e.message))); return; }

        const mode = (data.project && data.project.visibility_mode) || 'project';
        const tnames = (data.teams || []).map((t) => t.name);
        const ov = new Map((data.overrides || []).map((o) => [o.viewer_team + ' ' + o.subject_team, !!o.can_see]));

        /* ONE row, two choices, on the right where every other control on this screen lives.
         * It was two rows each carrying its own Selected/Select button — four words of state for
         * a single either-or, and "Selected" beside "Select" reads as two buttons doing different
         * things rather than one setting with two positions. A segmented control says the whole
         * thing at a glance: these are the options, that is the one in force. */
        /* The label sits in the ROW, not in a card header above it. As a header it took a line of
         * its own and left the control stranded on the next one — two rows for one setting. In the
         * row it reads the way every other setting on this screen does: name on the left, control
         * on the right, one line. */
        modeHost.innerHTML = card('', '',
          row('Who sees what', '',
            `<div class="pk-set-seg" role="group" aria-label="Who sees what">` +
              `<button class="pk-set-segbtn${mode === 'project' ? ' is-active' : ''}" type="button" data-vis-mode="project">Everyone in this project</button>` +
              `<button class="pk-set-segbtn${mode === 'team' ? ' is-active' : ''}" type="button" data-vis-mode="team">Own threads only</button>` +
            `</div>`));

        if (!tnames.length) { gridHost.innerHTML = ''; }
        else {
          const cell = (viewer, subject) => {
            if (viewer === subject) return `<td class="pk-vis-self" title="A team always sees its own work">—</td>`;
            const key = viewer + ' ' + subject;
            const explicit = ov.has(key);
            const on = explicit ? ov.get(key) : (mode === 'project');
            return `<td><button class="pk-vis-cell${on ? ' is-on' : ''}${explicit ? ' is-set' : ''}" type="button" ` +
              `data-vis-viewer="${esc(viewer)}" data-vis-subject="${esc(subject)}" data-vis-state="${explicit ? (on ? 'on' : 'off') : 'default'}" ` +
              `title="${esc(viewer)} → ${esc(subject)}: ${explicit ? (on ? 'allowed' : 'blocked') : 'following the mode'}">${on ? '✓' : '✕'}</button></td>`;
          };
          gridHost.innerHTML = card('Overrides', 'Rows see columns. Click to cycle: follow the mode → allow → block.',
            `<div class="pk-vis-wrap"><table class="pk-vis-table"><thead><tr><th></th>` +
              tnames.map((t) => `<th>${esc(t)}</th>`).join('') + `</tr></thead><tbody>` +
              tnames.map((v) => `<tr><th>${esc(v)}</th>` + tnames.map((sj) => cell(v, sj)).join('') + `</tr>`).join('') +
            `</tbody></table></div>`);
        }

        try {
          const pl = await store.projectLinks();
          const ps = pl.projects || [], links = pl.links || [];
          const pairs = [];
          for (const b of ps) if (b.id !== PROJECT) pairs.push(b);
          linkHost.innerHTML = pairs.length
            ? card('Access to other projects', 'Each grant is one-way.',
                pairs.map((b) => {
                  const on = links.some((l) => l.viewer_project === PROJECT && l.subject_project === b.id && l.can_see);
                  return row(`Can see ${esc(b.name || b.id)}`, '',
                    `<button class="pk-a${on ? ' pk-a--primary' : ''}" type="button" data-link-viewer="${esc(PROJECT)}" data-link-subject="${esc(b.id)}" data-link-on="${on}">${on ? 'Granted' : 'Grant'}</button>`);
                }).join(''))
            : '';
        } catch (e) { linkHost.innerHTML = ''; }
      }

      // ---- one delegated click handler for every Organisation action -------------------------
      if (settingsSection === 'org') {
        /* TWO hosts, not one. The page header (#pk-org-head) is a sibling of the panel, not a
         * child, so a single listener on the panel could never see the back button or the
         * breadcrumb — they carried the right data-crumb and nothing was listening. Same handler,
         * bound to both, rather than a second handler that would drift from this one. */
        const onOrgClick = async (e) => {
          const t = e.target.closest('[data-crumb],[data-project-open],[data-team-open],[data-person-open],' +
            '[data-vis-mode],[data-vis-viewer],[data-link-viewer],[data-team-project],[data-team-view],' +
            '[data-team-rotate],[data-team-toggle],[data-team-delete],[data-person-reset],[data-person-unlock],[data-tsel],[data-team-pick],' +
            '[data-person-toggle],[data-reset-approve],[data-reset-dismiss],[data-team-rename],[data-perm-team],' +
            '[data-project-rename],[data-project-delete],[data-person-delete],[data-person-move],[data-person-extra],[data-person-rename],' +
            '[data-access-copy],[data-access-new],[data-person-allocate],' +
            '[data-export-project],[data-export-team],[data-team-unlink],[data-org-tab],[data-psel],[data-person-pick],' +
            '#pk-proj-add,#pk-team-add,#pk-team-add-global,#pk-team-existing,#pk-person-add,#pk-person-bulk,' +
            '#pk-proj-import,#pk-team-import,#pk-proj-more,#pk-org-more');
          if (!t) return;
          const d = t.dataset;
          try {
            // navigation
            if (d.crumb === 'projects') { orgTab = 'projects'; return go({ project: null, team: null, person: null }); }
            if (d.crumb === 'teams') { orgTab = 'teams'; return go({ project: null, team: null, person: null }); }
            if (d.crumb === 'people') { orgTab = 'people'; return go({ project: null, team: null, person: null }); }
            if (d.crumb === 'project') return go({ team: null, person: null });
            if (d.crumb === 'team') return go({ person: null });
            // The tab strip at the top level. Same handler as the crumbs — they navigate to the
            // same three places, and two implementations of that would drift.
            if (d.orgTab) { orgTab = d.orgTab; return go({ project: null, team: null, person: null }); }
            if (d.projectOpen) return go({ project: d.projectOpen, team: null, person: null });
            if (d.teamOpen) return go({ team: d.teamOpen, person: null });
            if (d.personOpen) return go({ person: d.personOpen });

            // creation
            if (t.id === 'pk-proj-add') return openAddProject();
            if (t.id === 'pk-team-add') return openAddTeam();
            if (t.id === 'pk-team-add-global') return openAddTeam(true);
            if (t.id === 'pk-team-existing') return openAddExistingTeams();
            if (t.id === 'pk-person-add') return openAddPerson();
            if (t.id === 'pk-person-bulk') return openBulkAdd();
            /* Import and Export, behind More. Both act on the WHOLE project, so they are grouped
             * where a whole-project action belongs rather than beside Add a team. */
            if (t.id === 'pk-proj-more') {
              e.stopPropagation();
              return openRowMenu(t, null, [
                { label: teamSelectMode ? 'Stop Selecting Teams' : 'Select Teams', icon: ICON.edit,
                  onSelect: () => { teamSelectMode = !teamSelectMode; teamSel.clear(); fillOrg(); } },
                { label: 'Import People or a Team', icon: ICON.upload || ICON.edit, onSelect: () => openImport() },
                { label: 'Download People Template', icon: ICON.download || ICON.copy,
                  onSelect: () => downloadBlob(peopleTemplateCsv(), 'text/csv', 'proofkit-people-template.csv') },
                { label: 'Export Project', icon: ICON.download || ICON.copy,
                  onSelect: () => exportProject(orgPath.project) },
              ]);
            }
            if (t.id === 'pk-proj-import' || t.id === 'pk-team-import') return openImport();
            /* THE MENU BELONGS TO THE LIST YOU ARE ON.
             *
             * Teams and People offer their own two actions and nothing else — a list of teams is
             * not where you go to add a person, and six items to read for the two that apply is
             * work the screen can do for you.
             *
             * Projects is the exception, because it is the whole instance's landing screen: it
             * keeps all six, split into Add and Import so the first thing you read is which KIND of
             * act you want. openRowMenu drills down IN PLACE, so a submenu is one popup with a back
             * row rather than a second floating layer to position and dismiss. */
            if (t.id === 'pk-org-more') {
              e.stopPropagation();
              const addProject = { label: 'Add a project', icon: ICON.edit, onSelect: () => openAddProject() };
              const addTeam = { label: 'Add a team', icon: ICON.teams, onSelect: () => openAddTeam(true) };
              const addPeople = { label: 'Add people', icon: ICON.teams, onSelect: () => openBulkAdd() };
              const impProject = { label: 'Import projects', icon: ICON.copy, onSelect: () => openImport('projects') };
              const impTeams = { label: 'Import teams', icon: ICON.copy, onSelect: () => openImport('teams') };
              const impPeople = { label: 'Import people', icon: ICON.copy, onSelect: () => openImport('people') };
              /* The template sits with the import it belongs to. Downloading it is the FIRST half
               * of importing — you cannot fill in a shape you have not seen — so hiding it on a
               * different screen from the upload is how a template goes unused and people invent
               * their own columns. */
              const tplProject = { label: 'Download project template', icon: ICON.view, onSelect: () => downloadTemplate('projects') };
              const tplTeams = { label: 'Download team template', icon: ICON.view, onSelect: () => downloadTemplate('teams') };
              const tplPeople = { label: 'Download people template', icon: ICON.view, onSelect: () => downloadTemplate('people') };
              const items = orgTab === 'teams' ? [addTeam, impTeams, tplTeams]
                : orgTab === 'people' ? [
                    { label: peopleSelectMode ? 'Stop selecting' : 'Select people', icon: ICON.edit,
                      onSelect: () => { peopleSelectMode = !peopleSelectMode; peopleSel.clear(); fillOrg(); } },
                    addPeople, impPeople, tplPeople,
                  ]
                : [
                    { label: 'Add', icon: ICON.edit, submenu: [addProject, addTeam, addPeople] },
                    { label: 'Import', icon: ICON.copy, submenu: [impProject, impTeams, impPeople] },
                    { label: 'Templates', icon: ICON.view, submenu: [tplProject, tplTeams, tplPeople] },
                  ];
              return openRowMenu(t, null, items);
            }
            if (d.exportProject) return doExport('project', d.exportProject);
            if (d.exportTeam) return doExport('team', d.exportTeam);

            // rename
            if (d.teamRename) {
              const to = await pkPrompt({ title: 'Rename team', message: 'The new name is carried through tickets, accounts and visibility rules.', value: d.teamRename, confirmLabel: 'Rename' });
              if (to === null || !to.trim() || to.trim() === d.teamRename) return;
              await store.teamRename(d.teamRename, to.trim());
              return go({ team: to.trim() });
            }
            if (d.projectRename) {
              const to = await pkPrompt({ title: 'Rename project', message: '', value: d.projectName || '', confirmLabel: 'Rename' });
              if (to === null || !to.trim()) return;
              await store.projectUpdate(d.projectRename, to.trim());
              return fillOrg();
            }
            if (d.projectDelete) {
              if (!(await pkConfirm({ title: 'Delete project', message: 'Move this project to the recycle bin? It can be restored, and nothing is destroyed until a two-day confirmation.', confirmLabel: 'Delete', danger: true }))) return;
              await store.projectDelete(d.projectDelete);
              return go({ project: null, team: null, person: null });
            }
            if (d.personRename) {
              const em = d.personRename;
              return openFormModal({
                title: 'Edit name',
                fields: [
                  { key: 'name', label: 'Full Name', placeholder: 'As written on the record', letters: true, value: d.personName || '' },
                  { key: 'calledName', label: 'Preferred To Be Called', placeholder: 'Leave empty to use the full name', letters: true, optional: true, value: d.personCalled || '' },
                ],
                confirmLabel: 'Save',
                onSubmit: async (v) => {
                  if (!v.name) throw new Error('A full name is required.');
                  // calledName is sent even when empty — '' is how you clear one.
                  await store.userUpdate({ email: em, name: v.name, calledName: v.calledName || '' });
                  fillOrg();
                },
              });
            }
            if (d.personDelete) {
              if (!(await pkConfirm({ title: 'Delete account', message: 'Move this account to the recycle bin? They are signed out immediately, and the record can be restored.', confirmLabel: 'Delete', danger: true }))) return;
              await store.userDelete(d.personDelete);
              return go({ person: null });
            }
            if (d.personMove) {
              return openTeamPicker({
                title: 'Move to another team',
                sub: 'Their history stays with them. Their tickets move to the new team\u2019s project.',
                exclude: d.personTeam || '',
                confirmLabel: 'Move',
                onPick: async (to) => {
                  await store.userUpdate({ email: d.personMove, team: to });
                  go({ person: null, team: null });
                },
              });
            }
            if (d.personExtra) {
              const cur = (orgData.users.find((x) => x.email === d.personExtra) || {}).extraTeams || [];
              const me = (orgData.users.find((x) => x.email === d.personExtra) || {});
              return openTeamPicker({
                title: 'Also in',
                sub: 'Extra teams they can see. Their primary team still decides which board they land on.',
                multi: true,
                chosen: cur,
                exclude: me.team || '',
                confirmLabel: 'Save',
                onPick: async (list) => {
                  await store.userUpdate({ email: d.personExtra, extraTeams: list });
                  fillOrg();
                },
              });
            }
            if (d.accessCopy !== undefined) {
              if (!d.accessCopy) { pkAlert({ title: 'No Access ID', message: 'This account has no code yet. Use “New code” to issue one.' }); return; }
              copyToClip(d.accessCopy, t, 'Copied ✓');
              return;
            }
            if (d.accessNew) {
              if (!(await pkConfirm({
                title: 'Issue a new Access ID',
                message: 'The current code stops working immediately, and anyone using it is signed out at their next sign-in. Give them the new one.',
                confirmLabel: 'Issue new code', danger: true }))) return;
              const res = await store.userAccessId(d.accessNew, '');
              await pkAlert({ title: 'New Access ID', message: `${d.accessNew}\n\n${res.accessId}\n\nHand this over — it is what they type to sign in.` });
              return fillOrg();
            }
            if (d.permTeam) {
              await store.teamPermissions(d.permTeam, { [d.permKey]: d.permOn !== 'true' });
              return fillOrg();
            }

            // team actions
            if (d.teamView) { location.href = boardHome(d.teamView); return; }   // same tab: see Jump To Team
            if (d.teamProject) {
              const next = await pkPrompt({ title: 'Move team', message: 'Everyone on this team moves with it, and their tickets become visible only inside the new project.', value: d.teamCurrent || 'default', confirmLabel: 'Move' });
              if (next === null) return;
              await store.teamProject(d.teamProject, next.trim() || 'default');
              return go({ team: null, person: null });
            }
            /* Removing a team from a project takes away a MEMBERSHIP, not the team — nobody is
             * deleted and no ticket moves — so it asks plainly rather than in red. The server is the
             * one that knows whether this is the last project; it refuses with a reason, and the
             * catch below shows that reason as it was written. */
            if (d.teamUnlink) {
              const pname = (orgData.projects.find((x) => x.id === d.teamUnlinkProject) || {}).name || d.teamUnlinkProject;
              /* Your OWN Access Key, not a shared password — the same one you signed in with, and
               * the Builder types theirs. Removal is the one direction with nothing left on screen
               * to show it happened: the project's board simply stops carrying that team's work. So
               * it asks for the credential of the person the audit line will name, rather than a
               * yes/no that a mis-aimed click can answer. */
              const key = await pkPrompt({
                title: 'Remove from this project',
                message: `Take “${d.teamUnlink}” out of ${pname}? The team, its people and its tickets all stay — it simply is not worked with on this project any more.\n\nEnter your Access Key to confirm.`,
                value: '', confirmLabel: 'Remove', password: true,
              });
              if (key === null || !key.trim()) return;
              await store.teamProjectLink(d.teamUnlink, d.teamUnlinkProject, true, key.trim());
              return go({ team: null, person: null });
            }
            if (d.teamToggle) { await store.teamUpdate(d.teamToggle, { enabled: d.teamEnabled !== '1' }); return fillOrg(); }
            /* Allocate a team to somebody who has none, from the row that says they have none.
             * The overlay lists every team rather than a free-text box: the name has to match a
             * real team or the Worker refuses it, so offering typing would only offer a mistake. */
            if (d.personAllocate) {
              const list = (orgData.teams || []).filter((t) => t.enabled !== false);
              if (!list.length) return pkAlert({ title: 'No teams yet', message: 'Create a team first — there is nothing to allocate anybody to.' });
              return openTeamPicker({
                title: 'Allocate a team',
                sub: `Which team does ${d.personAllocate} work on? Until they have one they cannot sign in.`,
                items: list.map((t) => ({ value: t.name, label: t.name })),
                confirmLabel: 'Allocate',
                emptyText: 'There are no teams yet.',
                onPick: async (choice) => {
                  const nameT = Array.isArray(choice) ? choice[0] : choice;
                  if (!nameT) return;
                  try { await store.userUpdate({ email: d.personAllocate, team: nameT }); }
                  catch (e2) { return pkAlert({ title: 'Could not allocate', message: e2.message }); }
                  fillOrg();
                },
              });
            }
            if (d.teamPick !== undefined) {
              teamSel.has(d.teamPick) ? teamSel.delete(d.teamPick) : teamSel.add(d.teamPick);
              return fillOrg();
            }
            if (d.personPick !== undefined) {
              peopleSel.has(d.personPick) ? peopleSel.delete(d.personPick) : peopleSel.add(d.personPick);
              return fillOrg();
            }
            if (d.psel) {
              const shownEmails = (orgData.users || [])
                .filter((u) => orgHit(u.email) || orgHit(u.name) || orgHit(u.calledName) || orgHit(u.team))
                .map((u) => u.email);
              if (d.psel === 'done') { peopleSelectMode = false; peopleSel.clear(); return fillOrg(); }
              if (d.psel === 'all') { shownEmails.forEach((em) => peopleSel.add(em)); return fillOrg(); }
              if (d.psel === 'none') { peopleSel.clear(); return fillOrg(); }
              const picked = [...peopleSel];
              if (!picked.length) { pkAlert('Nothing is selected.'); return; }

              /* ACCESS IDS, IN ONE PASS — the reason this screen needed selection.
               *
               * Issued one at a time and shown once each, this is the job that gets abandoned half
               * way through a roster. They are handed back as a LIST you can copy, because an
               * Access ID that is only ever shown in a dialog you dismissed is an account nobody
               * can sign in to. Anyone who already has one keeps it: re-issuing silently would
               * lock out whoever was mid-review with the old one. */
              if (d.psel === 'access') {
                const already = picked.filter((em) => (orgData.users.find((u) => u.email === em) || {}).accessId);
                const need = picked.filter((em) => !already.includes(em));
                if (!need.length) {
                  pkAlert({ title: 'Nothing to issue', message: 'Everyone selected already has an Access ID. Issue a replacement from a person\'s own page — that ends their current one.' });
                  return;
                }
                if (!(await pkConfirm({
                  title: `Issue ${n(need.length, 'Access ID')}`,
                  message: (already.length ? `${n(already.length, 'person', 'people')} already ${already.length === 1 ? 'has one and is' : 'have one and are'} skipped.\n\n` : '') +
                    'You get the list once — copy it before closing.',
                  confirmLabel: 'Issue' }))) return;
                const issued = [], failed = [];
                for (const em of need) {
                  try { const r = await store.userAccessId(em, ''); issued.push(`${em}  ${r.accessId}`); }
                  catch (e2) { failed.push(`${em} — ${e2.message}`); }
                }
                peopleSel.clear(); peopleSelectMode = false;
                await fillOrg();
                await pkAlert({ title: `${n(issued.length, 'Access ID')} issued`, message:
                  issued.join('\n') + (failed.length ? `\n\nNot issued:\n` + failed.join('\n') : '') +
                  `\n\nHand these over — an Access ID is what they type to sign in.` });
                return;
              }

              if (d.psel === 'enable' || d.psel === 'disable') {
                const on = d.psel === 'enable';
                for (const em of picked) {
                  try { await store.userUpdate({ email: em, status: on ? 'active' : 'disabled' }); } catch (e2) {}
                }
                peopleSel.clear(); return fillOrg();
              }

              if (d.psel === 'delete') {
                if (!(await pkConfirm({
                  title: `Delete ${n(picked.length, 'account')}`,
                  message: picked.join(', ') +
                    `\n\nThey are signed out immediately. Nothing is destroyed — the records go to the recycle bin and can be restored.`,
                  confirmLabel: `Delete ${picked.length}`, danger: true }))) return;
                let failed = 0;
                for (const em of picked) { try { await store.userDelete(em); } catch (e2) { failed += 1; } }
                peopleSel.clear(); peopleSelectMode = false;
                await fillOrg();
                if (failed) pkAlert(`${failed} of ${picked.length} could not be deleted.`);
                return;
              }
            }
            if (d.tsel) {
              const shownTeams = teamsIn(orgPath.project).filter((x) => orgHit(x.name)).map((x) => x.name);
              if (d.tsel === 'done') { teamSelectMode = false; teamSel.clear(); return fillOrg(); }
              if (d.tsel === 'all') { shownTeams.forEach((n2) => teamSel.add(n2)); return fillOrg(); }
              if (d.tsel === 'none') { teamSel.clear(); return fillOrg(); }
              const picked = [...teamSel];
              if (!picked.length) { pkAlert('Nothing is selected.'); return; }

              if (d.tsel === 'enable' || d.tsel === 'disable') {
                const on = d.tsel === 'enable';
                for (const n2 of picked) { try { await store.teamUpdate(n2, { enabled: on }); } catch (e2) {} }
                teamSel.clear(); return fillOrg();
              }
              if (d.tsel === 'delete') {
                /* The count of what LEAVES WITH THEM, not just the count of teams. Deleting five
                 * teams is an abstract act; deleting five teams and 63 tickets is a decision. */
                const held = picked.reduce((a, n2) => a + ticketsFor(n2), 0);
                const folk = picked.reduce((a, n2) => a + peopleIn(n2).length, 0);
                if (!(await pkConfirm({
                  title: `Delete ${n(picked.length, 'team')}`,
                  /* "1 ticket", "0 tickets" — n() agrees the noun with its number. "ticket(s)" is a
                   * template showing through: it asks the reader to do the agreement the sentence
                   * already knows the answer to. */
                  message: picked.join(', ') +
                    `\n\n${n(folk, 'person', 'people')} and ${n(held, 'ticket')} go to the recycle bin with them.` +
                    `\nNothing is destroyed — all of it can be restored.`,
                  confirmLabel: `Delete ${picked.length}`, danger: true }))) return;
                let failed = 0;
                for (const n2 of picked) { try { await store.teamDelete(n2); } catch (e2) { failed += 1; } }
                teamSel.clear(); teamSelectMode = false;
                await fillOrg();
                if (failed) pkAlert(`${failed} of ${picked.length} could not be deleted.`);
                return;
              }
            }
            /* Two steps, and they ask different questions. The first is "did you mean to click
             * this" — a plain yes/no, which is all a mis-aimed click needs to be caught by. The
             * second is "who is doing it", answered with an Access Key, because the log entry is
             * about to name somebody and a shared Builder tab would otherwise name the tab. Any
             * active account's key is accepted; it is an attribution, not a second permission. */
            if (d.teamDelete) {
              const held = +d.teamUsed;
              if (!(await pkConfirm({
                title: 'Delete team',
                message: `Move “${d.teamDelete}” to the recycle bin? Its people lose the board`
                  + (held ? `, and its ${n(held, 'ticket')} ${held === 1 ? 'goes' : 'go'} with it` : '')
                  + '. Nothing is destroyed — you can restore it.',
                confirmLabel: 'Delete', danger: true }))) return;
              const key = await pkPrompt({
                title: 'Who is deleting ' + d.teamDelete + '?',
                message: 'Enter your Access Key. It is recorded against this deletion, so the log '
                  + 'names a person rather than whichever session the tab is holding.',
                value: '', confirmLabel: 'Delete', password: true,
              });
              if (key === null || !key.trim()) return;
              const res = await store.teamDelete(d.teamDelete, key.trim());
              // Said back, because the whole point was attribution: you should see which name went
              // into the log, especially if you typed somebody else's key by mistake.
              if (res && res.by) await pkAlert({ title: 'Deleted ' + d.teamDelete, message: 'Recorded against ' + res.by + '. It is in the recycle bin and can be restored.' });
              return go({ team: null, person: null });
            }

            // person actions
            if (d.personReset) {
              const pin = await askPin('New PIN for ' + d.personReset);
              if (!pin) return;
              await store.userResetPin(d.personReset, pin);
              showOnce(d.personReset, pin, 'New PIN');
              return fillOrg();
            }
            if (d.personUnlock) { await store.userUnlock(d.personUnlock); return fillOrg(); }
            if (d.personToggle) {
              await store.userUpdate({ email: d.personToggle, status: d.personStatus === 'active' ? 'disabled' : 'active' });
              return fillOrg();
            }

            // the locked-out queue
            if (d.resetApprove) {
              const pin = await askPin('One-time PIN for ' + (d.resetEmail || ''));
              if (!pin) return;
              await store.resetApprove(d.resetApprove, pin);
              showOnce(d.resetEmail || '', pin, 'One-time PIN');
              return rerender();
            }
            if (d.resetDismiss) { await store.resetDismiss(d.resetDismiss); return rerender(); }

            // visibility
            if (d.visMode) { await store.visibilityMode(orgPath.project, d.visMode); return fillVisibility(orgPath.project); }
            if (d.visViewer) {
              const next = { default: true, on: false, off: null }[d.visState];
              await store.visibilityPair(orgPath.project, d.visViewer, d.visSubject, next);
              return fillVisibility(orgPath.project);
            }
            if (d.linkViewer) {
              await store.projectLinkSet(d.linkViewer, d.linkSubject, d.linkOn !== 'true');
              return fillVisibility(orgPath.project);
            }
          } catch (err) { pkAlert('That did not work — ' + err.message); }
        };
        panel.addEventListener('click', onOrgClick);
        const headEl = $('#pk-org-head'); if (headEl) headEl.addEventListener('click', onOrgClick);

        /* The Team column is a control INSIDE a row that navigates. Without this, choosing a team
         * also opens the person — the click reaches the row on its way up and both things happen,
         * which reads as the dropdown having thrown you somewhere. */
        panel.addEventListener('click', (e) => {
          if (e.target.closest('[data-cell="team"]')) e.stopPropagation();
        }, true);

        /* Changing the team saves immediately. There is no Save button on a table of 132 rows —
         * a change here is one field with one obvious meaning, and a pending state nobody
         * committed is how a roster ends up disagreeing with itself. */
        /* Copy the Access ID from the row. Stops the event, or the click that copies also opens
         * the person — a control inside a clickable row has to say it handled it. */
        panel.addEventListener('click', (e) => {
          const cp = e.target.closest('[data-copy-id]');
          if (!cp) return;
          e.stopPropagation(); e.preventDefault();
          copyToClip(cp.dataset.copyId, cp, 'Copied ✓');
        });


      }

      /* Pick teams for a person — one (Move) or several (Also in).
       *
       * Both of these were free-text prompts: "type the team name", comma-separated for the second.
       * That asks somebody to spell from memory a value the system has to match exactly, and a typo
       * did not fail — it silently created a person in a team that does not exist. A list cannot be
       * mistyped.
       *
       * The teams come from orgData, which is what is actually in the instance, not from the TEAMS
       * constant — that ships empty now, so a constant-driven list would offer nothing.
       */
      function openTeamPicker(opts) {
        /* `only` narrows the list to a set the caller has already worked out — teams not yet in this
         * project. Narrowing beats disabling here: a team already in the project is not a choice you
         * got wrong, it is one there is nothing to do about, and listing it greyed out would fill the
         * dialog with rows that answer a question nobody asked. */
        /* `items` lets the same dialog pick PROJECTS — a team being created outside any project has
         * to say where it will work, and that is the same "tick from a list you cannot mistype"
         * problem this was built for. Values and labels differ there (id vs name), so an item is a
         * pair; the team case stays a plain list of names. */
        const all = opts.items
          ? opts.items.map((it) => ({ value: it.value, label: it.label || it.value }))
          : (orgData.teams || []).map((t) => t.name).filter(Boolean)
              .filter((nm) => !opts.only || opts.only.includes(nm))
              .sort((a, b) => a.localeCompare(b))
              .map((nm) => ({ value: nm, label: nm }));
        const chosen = new Set(opts.chosen || []);
        const el = document.createElement('div'); el.className = 'pk-reopen';
        const esc2 = (x) => esc(x);
        el.innerHTML =
          `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="${esc2(opts.title)}">` +
            `<h2 class="pk-reopen-title">${esc2(opts.title)}</h2>` +
            (opts.sub ? `<p class="pk-reopen-sub">${esc2(opts.sub)}</p>` : '') +
            (all.length
              ? `<div class="pk-teampick">` + all.map((it) => {
                  const on = chosen.has(it.value);
                  const dis = opts.exclude === it.value;
                  return `<label class="pk-teampick-i${dis ? ' is-off' : ''}">` +
                    `<input type="${opts.multi ? 'checkbox' : 'radio'}" name="pk-tp" value="${esc2(it.value)}"` +
                      `${on ? ' checked' : ''}${dis ? ' disabled' : ''}>` +
                    `<span>${esc2(it.label)}${dis ? ' · current team' : ''}</span></label>`;
                }).join('') + `</div>`
              : `<p class="pk-reopen-sub">${esc2(opts.emptyText || 'There are no teams yet. Create one first.')}</p>`) +
            `<div class="pk-reopen-err" hidden></div>` +
            `<div class="pk-reopen-actions">` +
              // "Cancel" is wrong when the thing was already created and this dialog only adds to
              // it — backing out of Add-a-project's team picker cancels nothing. Callers say so.
              `<button type="button" class="pk-a pk-tp-cancel">${esc2(opts.cancelLabel || 'Cancel')}</button>` +
              `<button type="button" class="pk-a pk-a--primary pk-tp-go"${all.length ? '' : ' disabled'}>${esc2(opts.confirmLabel || 'Save')}</button>` +
            `</div></div>`;
        document.body.appendChild(el);
        const close = () => { el.remove(); document.removeEventListener('keydown', onEsc); };
        function onEsc(e2) { if (e2.key === 'Escape') close(); }
        document.addEventListener('keydown', onEsc);
        el.addEventListener('click', (e2) => { if (e2.target === el) close(); });
        el.querySelector('.pk-tp-cancel').addEventListener('click', close);
        el.querySelector('.pk-tp-go').addEventListener('click', async () => {
          const picked = [...el.querySelectorAll('input:checked')].map((i) => i.value);
          if (!opts.multi && !picked.length) {
            const err = el.querySelector('.pk-reopen-err');
            err.textContent = 'Choose a team.'; err.hidden = false; return;
          }
          close();
          await opts.onPick(opts.multi ? picked : picked[0]);
        });
      }

      /* Add a team — into the project currently open, or, from the Teams list where there is no
       * project in context, into whichever projects you then pick.
       *
       * A team has to be in at least one project: the Worker refuses to leave one in none, because
       * a team no project reaches is unreachable rather than tidy. So creating one from the flat
       * list asks the same question the project page answers implicitly by being open. */
      function openAddTeam(askProjects) {
        openFormModal({
          title: 'Add a team',
          fields: [
            { key: 'name', label: 'Team name', placeholder: 'e.g. Compliance' },
            { key: 'color', label: 'Chip colour', placeholder: '#da291c — optional', optional: true },
          ],
          confirmLabel: 'Add team',
          onSubmit: async (v) => {
            if (!v.name) throw new Error('A team name is required.');
            // A name and a colour. There is no password to set or hand out: a team is reached by
            // being put in it, and the people you add next each bring their own Access Key.
            await store.teamCreate(v.name, v.color);
            if (orgPath.project && orgPath.project !== 'default') {
              try { await store.teamProject(v.name, orgPath.project); } catch (e) { /* created regardless */ }
            }
            await fillOrg();
            if (!askProjects) return;
            // Created first, placed second — the team exists either way, and a dialog that fails
            // half way through should not take the team down with it.
            openTeamPicker({
              title: 'Where does ' + v.name + ' work?',
              sub: 'The projects this team reviews. It starts in Default until you choose, and can be added to more later.',
              multi: true,
              items: (orgData.projects || []).map((p) => ({ value: p.id, label: p.name || p.id })),
              confirmLabel: 'Add',
              cancelLabel: 'Leave in Default',
              emptyText: 'There are no projects yet.',
              onPick: async (list) => {
                for (const pid of (list || [])) {
                  try { await store.teamProjectLink(v.name, pid, false); } catch (e) { /* reported below */ }
                }
                fillOrg();
              },
            });
          },
        });
      }

      /* Create a project, and bring the teams that will work on it with you.
       *
       * A new project used to arrive empty and stay that way until somebody remembered to go and
       * add teams to it — which, before memberships existed, they could not do at all: importing a
       * roster into it skipped every team, because the teams already existed globally. Naming the
       * project and saying who works on it are one intention, so they are one dialog.
       *
       * The teams are optional. A project with none is a perfectly good empty project, and the
       * picker is skipped entirely when the instance has no teams yet.
       */
      async function openAddProject() {
        const name = await pkPrompt({ title: 'Add a project', message: 'Project name:', value: '', confirmLabel: 'Create' });
        if (name === null || !name.trim()) return;
        const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await store.createProject(id, name.trim(), 'owned');
        await fillOrg();

        const all = (orgData.teams || []).map((t) => t.name).filter(Boolean);
        if (!all.length) return;
        openTeamPicker({
          title: 'Who works on ' + name.trim() + '?',
          sub: 'Existing teams that will review this project. They keep everything they already have — the same team, working on one more project. You can change this later.',
          multi: true,
          only: all,
          confirmLabel: 'Add',
          cancelLabel: 'Not now',
          onPick: async (list) => {
            const failed = [];
            for (const t2 of (list || [])) {
              try { await store.teamProjectLink(t2, id, false); }
              catch (e) { failed.push(`${t2} — ${e.message}`); }
            }
            await fillOrg();
            if (failed.length) pkAlert({ title: 'Some teams were not added', message: failed.join('\n') });
          },
        });
      }

      /* Put teams that already exist into the project you are looking at.
       *
       * This is the answer to the import that "skipped everything": team names are globally unique,
       * so a roster naming Content in a second project could only ever refuse to make another one.
       * Nothing was wrong — the team simply had to be ADDED here rather than created again, and until
       * now there was no way to say so.
       *
       * One request per team rather than a batch endpoint: each is independent, and a failure part
       * way through leaves the ones before it correctly added instead of rolling back work that was
       * fine. Whatever the server said about the rest is what the reader sees.
       */
      function openAddExistingTeams() {
        const pid = orgPath.project;
        if (!pid) return;
        const inHere = (t) => (t.projectIds && t.projectIds.length ? t.projectIds : [t.projectId || 'default']).includes(pid);
        const available = (orgData.teams || []).filter((t) => !inHere(t)).map((t) => t.name);
        const pname = (orgData.projects.find((x) => x.id === pid) || {}).name || pid;
        openTeamPicker({
          title: 'Add an existing team',
          sub: `Teams that exist elsewhere in this instance. They are added to ${pname} and keep everything they already have — the same team, worked with on one more project.`,
          multi: true,
          only: available,
          emptyText: 'Every team is already in this project.',
          confirmLabel: 'Add',
          onPick: async (list) => {
            if (!list.length) return;
            const failed = [];
            for (const name of list) {
              try { await store.teamProjectLink(name, pid, false); }
              catch (e) { failed.push(`${name} — ${e.message}`); }
            }
            await fillOrg();
            if (failed.length) pkAlert({ title: 'Some teams were not added', message: failed.join('\n') });
          },
        });
      }

      /* Export downloads a file; import reads one. Deliberately a FILE rather than a
       * copy-project button, because the useful case is moving a shape between deployments —
       * staging to production, one client's setup as the template for the next.
       *
       * Nothing secret travels: PIN hashes, Access Keys and sessions all stay behind, so an
       * imported team arrives disabled and imported people arrive unable to sign in until the
       * Builder gives them credentials. That is the correct default for a file that will end up
       * in an inbox. */
      async function doExport(kind, ref) {
        try {
          const data = kind === 'project' ? await store.exportProject(ref) : await store.exportTeam(ref);
          const name = `proofkit-${kind}-${String(ref).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
          downloadBlob(JSON.stringify(data, null, 2), 'application/json', name);
          pkAlert({ title: 'Exported', message:
            `${name}\n\n${data.counts ? `${n(data.counts.teams, 'team')}, ${n(data.counts.people, 'person', 'people')}, ${n(data.counts.tickets, 'ticket')}.` : ''}` +
            `\n\nNo Access Keys or PINs are in this file. Imported people are issued their own on arrival, and you hand those out from their pages.` });
        } catch (e) { pkAlert('Could not export — ' + e.message); }
      }

      /* The template, generated rather than shipped as a file: it can never fall out of step with
       * the columns the parser looks for, because both are in this repo and this one is two lines
       * from them. CSV because every spreadsheet opens it and none of them argue. */
      const peopleTemplateCsv = () =>
        'Employee Name,Mail id,Team,One Name\n' +
        'EXAMPLE - delete this row,them@company.com,Marketing,Example\n';

      /* ONE TEMPLATE PER THING YOU CAN IMPORT.
       *
       * A person needs an email and a team; a team needs a name and the projects it works on; a
       * project needs a name. Sharing one sheet across all three would mean columns that are
       * required in one row and meaningless in the next, which is how a spreadsheet turns into a
       * form nobody fills in correctly. Each carries an EXAMPLE row the parsers drop by name, so
       * the shape is demonstrated rather than described.
       *
       * CSV, because every spreadsheet opens it and none of them argue — and the same reader takes
       * .xlsx back, so filling it in Excel and saving as either works. */
      const TEMPLATES = {
        people: ['proofkit-people-template.csv', peopleTemplateCsv],
        teams: ['proofkit-teams-template.csv', () =>
          'Team,Projects,Colour\n' +
          'EXAMPLE - delete this row,"Alpha Site, Beta Site",#da291c\n'],
        projects: ['proofkit-projects-template.csv', () =>
          'Project,Teams\n' +
          'EXAMPLE - delete this row,"Content, Design"\n'],
      };
      const downloadTemplate = (kind) => {
        const [name, build] = TEMPLATES[kind] || TEMPLATES.people;
        downloadBlob(build(), 'text/csv', name);
      };

      /* The import preview, as a screen rather than an alert.
       *
       * It was a text blob in a confirm dialog: 49 lines of monospace-ish prose wrapping mid-email,
       * in a box sized for a sentence. The thing being previewed is TABULAR — people in teams — and
       * the only way to check it is to scan columns, which prose cannot be scanned as. So it gets
       * the room it needs and the shape the data already has.
       *
       * Resolves true to import, false to walk away. "Discard for now" rather than "Cancel" because
       * cancelling suggests the file is lost; it is not, and the wording should not imply a cost
       * that does not exist.
       */
      function openImportPreview(roster) {
        const byTeam = {};
        for (const pr of roster.people) (byTeam[pr.team] = byTeam[pr.team] || []).push(pr);
        return new Promise((resolve) => {
          const el = document.createElement('div');
          el.className = 'pk-reopen pk-impv';
          el.innerHTML =
            `<div class="pk-impv-card" role="dialog" aria-modal="true" aria-label="Review this import">` +
              `<header class="pk-impv-head">` +
                `<h2>Review this import</h2>` +
                `<p>${roster.people.length} people into ${roster.teams.length} teams. Nothing is written until you confirm.</p>` +
              `</header>` +
              `<div class="pk-impv-body">` +
                `<section><h3>Teams (${roster.teams.length})</h3>` +
                  `<div class="pk-tablewrap"><table class="pk-ptable"><thead><tr><th>Team</th><th>People</th><th>Status</th></tr></thead><tbody>` +
                    roster.teams.map((t) => `<tr><td>${esc(t)}</td><td>${byTeam[t].length}</td>` +
                      `<td>${(orgData.teams || []).some((x) => x.name === t) ? '<span class="pk-impv-dim">exists — skipped</span>' : 'new'}</td></tr>`).join('') +
                  `</tbody></table></div></section>` +
                `<section><h3>People (${roster.people.length})</h3>` +
                  `<div class="pk-tablewrap"><table class="pk-ptable"><thead><tr>` +
                    `<th>Full name</th><th>Preferred</th><th>Email</th><th>Team</th></tr></thead><tbody>` +
                    roster.people.map((pr) => `<tr>` +
                      `<td>${esc(pr.name)}</td><td>${esc(pr.calledName || '—')}</td>` +
                      `<td class="pk-ptable-mail">${esc(pr.email)}</td><td>${esc(pr.team)}</td></tr>`).join('') +
                  `</tbody></table></div></section>` +
                (roster.problems.length
                  ? `<section><h3 class="pk-impv-warn">Skipped (${roster.problems.length})</h3>` +
                      `<p class="pk-impv-dim">These rows will not be imported.</p>` +
                      `<ul class="pk-impv-probs">` + roster.problems.map((x) => `<li>${esc(x)}</li>`).join('') + `</ul></section>`
                  : '') +
                `<section class="pk-impv-note">` +
                  `<p>Everyone gets an Access ID, and its six digits are their PIN — they can sign in and open their board straight away.</p>` +
                  `<p>Anything that already exists is skipped, never overwritten.</p>` +
                `</section>` +
              `</div>` +
              `<footer class="pk-impv-foot">` +
                `<button type="button" class="pk-a pk-impv-no">Discard for now</button>` +
                `<button type="button" class="pk-a pk-a--primary pk-impv-yes">Import ${roster.people.length}</button>` +
              `</footer>` +
            `</div>`;
          document.body.appendChild(el);
          const done = (v) => { el.remove(); document.removeEventListener('keydown', onEsc); resolve(v); };
          function onEsc(e2) { if (e2.key === 'Escape') done(false); }
          document.addEventListener('keydown', onEsc);
          el.addEventListener('click', (e2) => { if (e2.target === el) done(false); });
          el.querySelector('.pk-impv-no').addEventListener('click', () => done(false));
          el.querySelector('.pk-impv-yes').addEventListener('click', () => done(true));
          el.querySelector('.pk-impv-yes').focus();
        });
      }

      /* ONE dialog, framed for what you came to import.
       *
       * The file decides what actually happens — a project export carries its teams and people, a
       * people sheet carries neither — so there is one reader, one endpoint and one set of rules
       * about what is skipped. `kind` only changes what the dialog SAYS, because "Import teams" and
       * "Import people" are different intentions arriving at the same door, and a dialog that
       * ignores which one you pressed makes you wonder whether it heard you.
       *
       * Worth knowing: an existing team named in a file is now ADDED to the target project rather
       * than skipped, which is what makes importing a roster into a second project work at all. */
      const IMPORT_COPY = {
        projects: ['Import projects', 'The project template (.xlsx / .csv) — one project per row, with the teams that work on it — or a Proofkit project export (.json), which carries its teams, people and visibility rules.'],
        teams: ['Import teams', 'The team template (.xlsx / .csv) — one team per row, with the projects it works on — or a Proofkit export (.json). A team that already exists is ADDED to those projects rather than duplicated.'],
        people: ['Import people', 'The people template (.xlsx / .csv), or a Proofkit export (.json). People arrive without a way to sign in until you issue credentials.'],
      };
      function openImport(kind) {
        const [title, sub] = IMPORT_COPY[kind] ||
          ['Import', 'A Proofkit export, or a filled people template (.xlsx / .csv). Importing only ADDS — anything that already exists is skipped, never overwritten.'];
        const el = document.createElement('div'); el.className = 'pk-reopen';
        el.innerHTML =
          `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
            `<h2 class="pk-reopen-title">${esc(title)}</h2>` +
            `<p class="pk-reopen-sub">${esc(sub)}</p>` +
            `<div class="pk-reopen-field"><span class="pk-reopen-label">File</span>` +
              `<input type="file" accept=".json,.xlsx,.csv,application/json" class="pk-login-input pk-imp-file"></div>` +
            `<div class="pk-reopen-field"><span class="pk-reopen-label">Import as project id <span style="color:var(--pk-muted);font-weight:400">· optional</span></span>` +
              `<input class="pk-login-input pk-imp-as" placeholder="Leave blank to keep the id in the file" autocomplete="off"></div>` +
            `<div class="pk-reopen-err" hidden></div>` +
            `<div class="pk-reopen-actions">` +
              `<button type="button" class="pk-a pk-imp-cancel">Cancel</button>` +
              `<button type="button" class="pk-a pk-a--primary pk-imp-go">Import</button>` +
            `</div></div>`;
        document.body.appendChild(el);
        const file = el.querySelector('.pk-imp-file'), asId = el.querySelector('.pk-imp-as');
        const err = el.querySelector('.pk-reopen-err'), goB = el.querySelector('.pk-imp-go');
        const close = () => { el.remove(); document.removeEventListener('keydown', onEsc); };
        function onEsc(e2) { if (e2.key === 'Escape') close(); }
        document.addEventListener('keydown', onEsc);
        el.addEventListener('click', (e2) => { if (e2.target === el) close(); });
        el.querySelector('.pk-imp-cancel').addEventListener('click', close);
        goB.addEventListener('click', async () => {
          const f = file.files && file.files[0];
          if (!f) { err.textContent = 'Choose a file first.'; err.hidden = false; return; }
          goB.disabled = true; goB.textContent = 'Importing…';
          try {
            /* One dialog, two shapes of file. A spreadsheet is turned into the SAME payload the
             * export path produces, so there is one import endpoint and one set of rules about
             * what gets skipped — a second server route for "but from a sheet" would drift. */
            let payload;
            const nm = (f.name || '').toLowerCase();
            const isSheet = nm.endsWith('.xlsx') || nm.endsWith('.csv');

            /* The TEAMS and PROJECTS templates carry no people, so they take their own route to the
             * same endpoint. A team names the projects it works on and a project names its teams —
             * the same relationship written from either end — and both become `teams` + `project`
             * in the payload the export path already produces. */
            if (isSheet && (kind === 'teams' || kind === 'projects')) {
              const sheet = await import('./sheet.js?v=1e381fed60');
              const rows = await sheet.readSheet(f);
              const targetPid = () => asId.value.trim() || orgPath.project || 'default';
              if (kind === 'teams') {
                const { teams, problems } = sheet.teamsFromRows(rows);
                if (!teams.length) {
                  throw new Error(problems.length ? 'Nothing importable. ' + problems.slice(0, 4).join(' ')
                    : 'That sheet has no teams in it.');
                }
                /* Land them in the FIRST project the sheet names, not in whatever was open. A team
                 * whose row says "Alpha Site, Beta Site" and then appears in Default as well has a
                 * membership nobody asked for, and the reader has to work out where it came from. */
                const named = teams.find((t) => t.projects.length);
                const firstNamed = named && (orgData.projects || []).find((p) =>
                  p.id === named.projects[0] || (p.name || '').toLowerCase() === named.projects[0].toLowerCase());
                payload = {
                  proofkitExport: 1,
                  asProject: (firstNamed && firstNamed.id) || targetPid(),
                  teams: teams.map((t) => ({ name: t.name, color: t.color || '' })),
                };
                /* A team that names several projects is created once and LINKED to each. The
                 * import endpoint places it in the target project; the extra projects are the
                 * memberships this whole feature exists for, so they are applied here. */
                const rep0 = await store.importData(payload);
                for (const t of teams) {
                  for (const pname of t.projects) {
                    const proj = (orgData.projects || []).find((p) =>
                      p.id === pname || (p.name || '').toLowerCase() === pname.toLowerCase());
                    if (proj) { try { await store.teamProjectLink(t.name, proj.id, false); } catch (e3) { /* reported below */ } }
                  }
                }
                close();
                await pkAlert({ title: 'Imported', message:
                  `Teams: ${(rep0.teams || []).length}` +
                  ((rep0.skipped || []).length ? `\n\nSkipped:\n` + rep0.skipped.slice(0, 12).join('\n') : '') +
                  (problems.length ? `\n\nRows with problems:\n` + problems.slice(0, 8).join('\n') : '') });
                fillOrg();
                return;
              }
              const { projects, problems } = sheet.projectsFromRows(rows);
              if (!projects.length) {
                throw new Error(problems.length ? 'Nothing importable. ' + problems.slice(0, 4).join(' ')
                  : 'That sheet has no projects in it.');
              }
              /* One project per row, each created and then given the teams the row names — whether
               * or not those teams exist yet.
               *
               * Both halves go through the SAME import call, because the endpoint already answers
               * both: a name it does not know becomes a team in this project, and a name it does
               * know is ADDED to this project rather than duplicated. Distinguishing them here
               * would be a second copy of a rule the server already owns, and the version that
               * skipped unknown teams meant importing projects before teams quietly produced empty
               * projects — an order dependency nothing on screen told you about.
               *
               * Teams arrive without a key, exactly as the roster import leaves them: people sign
               * in with their own Access ID, and a team switched off would block a board for no
               * reason anybody could see. */
              let made = 0;
              const teamReport = [];
              for (const pr of projects) {
                const id = pr.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                try { await store.createProject(id, pr.name, 'owned'); made += 1; } catch (e3) { /* already exists */ }
                if (!pr.teams.length) continue;
                try {
                  const rep = await store.importData({
                    proofkitExport: 1, asProject: id, teams: pr.teams.map((name) => ({ name })),
                  });
                  teamReport.push(...(rep.teams || []));
                } catch (e3) { problems.push(`${pr.name}: could not add its teams — ${e3.message}`); }
              }
              close();
              await pkAlert({ title: 'Imported', message:
                `Projects: ${made} of ${projects.length}` +
                (teamReport.length ? `\nTeams: ${teamReport.length}\n  ` + teamReport.slice(0, 10).join('\n  ') : '') +
                (problems.length ? `\n\nRows with problems:\n` + problems.slice(0, 8).join('\n') : '') +
                `\n\nA team has no password of its own — people reach it by being put in it, using their own Access Key.` });
              fillOrg();
              return;
            }

            if (isSheet) {
              const { readSheet, rosterFromRows } = await import('./sheet.js?v=1e381fed60');
              const roster = rosterFromRows(await readSheet(f));
              if (!roster.people.length) {
                throw new Error(roster.problems.length
                  ? 'Nothing importable. ' + roster.problems.slice(0, 4).join(' ')
                  : 'That sheet has no people in it.');
              }
              const pid = asId.value.trim() || orgPath.project || 'default';
              payload = {
                proofkitExport: 1,
                asProject: pid,
                teams: roster.teams.map((t) => ({ name: t })),
                people: roster.people,
              };
              // Nothing is written until this resolves true.
              if (!(await openImportPreview(roster))) { goB.disabled = false; goB.textContent = 'Import'; return; }
            } else {
              payload = JSON.parse(await f.text());
              if (asId.value.trim()) payload.asProject = asId.value.trim();
            }
            const rep = await store.importData(payload);
            close();
            await pkAlert({ title: 'Imported', message:
              `Teams: ${(rep.teams || []).length}\nPeople: ${(rep.people || []).length}` +
              ((rep.projects || []).length ? `\nProjects: ${rep.projects.length}` : '') +
              (rep.tickets ? `\nTickets: ${rep.tickets}` : '') +
              ((rep.skipped || []).length ? `\n\nSkipped (already existed):\n` + rep.skipped.slice(0, 12).join('\n') : '') +
              `\n\nImported people arrive with their own Access Key, readable on each person’s page. Anyone the file left without a team cannot sign in until you allocate one.` });
            fillOrg();
          } catch (e2) {
            goB.disabled = false; goB.textContent = 'Import';
            err.textContent = e2.message; err.hidden = false;
          }
        });
      }

      /* Adding eight people used to be eight dialogs. Paste a list, get PINs, hand them out once.
       * Reports per-address outcomes rather than failing the whole batch on one bad entry — a
       * typo in row six must not discard rows one to five. */
      /* Add many — a grid of people, not a list of addresses.
       *
       * It used to take emails, one per line, and nothing else: everybody arrived nameless and in
       * whatever team happened to be open. A person has a name, a name people actually use, and a
       * team, and none of those are optional information — leaving them out just moves the work to
       * whoever opens the roster afterwards and finds thirty rows reading "—".
       *
       * Rows are added one at a time, because that is how two or three people get added. For thirty
       * there is the sheet, and the button that says so sits right here rather than somewhere else
       * in the menu.
       */
      function openBulkAdd() {
        const teams = (orgData.teams || []).map((t) => t.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
        const el = document.createElement('div'); el.className = 'pk-reopen';
        const teamOpts = (sel) => teams.map((t) =>
          `<option value="${esc(t)}"${t === sel ? ' selected' : ''}>${esc(t)}</option>`).join('');
        const rowHtml = () =>
          `<tr class="pk-bulk-row">` +
            `<td><input class="pk-login-input" data-k="name" placeholder="Full name" data-letters="1" autocomplete="off"></td>` +
            `<td><input class="pk-login-input" data-k="calledName" placeholder="Preferred" data-letters="1" autocomplete="off"></td>` +
            `<td><input class="pk-login-input" data-k="email" placeholder="them@company.com" autocomplete="off"></td>` +
            `<td><select class="pk-login-input" data-k="team">${teamOpts(orgPath.team || '')}</select></td>` +
            /* Blank means "draw me one", which is what almost every row wants. It is here at all
             * because somebody handing out pre-printed cards needs to be able to type theirs. */
            `<td><input class="pk-login-input" data-k="accessKey" placeholder="auto" autocomplete="off" spellcheck="false"></td>` +
            `<td class="pk-bulk-x"><button type="button" class="pk-a pk-bulk-del" aria-label="Remove row">✕</button></td>` +
          `</tr>`;
        el.innerHTML =
          `<div class="pk-reopen-card pk-bulk-card" role="dialog" aria-modal="true" aria-label="Add many people">` +
            `<h2 class="pk-reopen-title">Add many people</h2>` +
            `<p class="pk-reopen-sub">An Access Key and a PIN are generated for each. Leave a key blank to have one drawn.</p>` +
            (teams.length
              ? `<div class="pk-tablewrap"><table class="pk-bulk-tbl"><thead><tr>` +
                  `<th>Full name</th><th>Preferred name</th><th>Email</th><th>Team</th><th>Access Key</th><th></th>` +
                `</tr></thead><tbody class="pk-bulk-body">${rowHtml()}${rowHtml()}</tbody></table></div>` +
                `<div class="pk-u-inlinerow pk-bulk-tools">` +
                  `<button type="button" class="pk-a pk-bulk-more">Add another person</button>` +
                  `<button type="button" class="pk-a pk-bulk-sheet">Upload a sheet instead</button>` +
                `</div>`
              : `<p class="pk-reopen-sub">There are no teams yet. Create one first.</p>`) +
            `<div class="pk-reopen-err" hidden></div>` +
            `<div class="pk-reopen-actions">` +
              `<button type="button" class="pk-a pk-bulk-cancel">Cancel</button>` +
              `<button type="button" class="pk-a pk-a--primary pk-bulk-go"${teams.length ? '' : ' disabled'}>Add</button>` +
            `</div></div>`;
        document.body.appendChild(el);
        const body = el.querySelector('.pk-bulk-body');
        const err = el.querySelector('.pk-reopen-err'), goB = el.querySelector('.pk-bulk-go');
        const close = () => { el.remove(); document.removeEventListener('keydown', onEsc); };
        function onEsc(e2) { if (e2.key === 'Escape') close(); }
        document.addEventListener('keydown', onEsc);
        el.addEventListener('click', (e2) => { if (e2.target === el) close(); });
        el.querySelector('.pk-bulk-cancel').addEventListener('click', close);
        el.querySelector('.pk-bulk-sheet')?.addEventListener('click', () => { close(); openImport(); });
        el.querySelector('.pk-bulk-more')?.addEventListener('click', () => {
          body.insertAdjacentHTML('beforeend', rowHtml());
          enhanceSelects(body.lastElementChild);   // a row added later needs it too
          body.lastElementChild.querySelector('input').focus();
        });
        // Never leave zero rows — an empty grid gives you nothing to type into.
        body.addEventListener('click', (e2) => {
          if (!e2.target.closest('.pk-bulk-del')) return;
          if (body.children.length > 1) e2.target.closest('tr').remove();
        });
        // Letters-only on the two name columns, stripped as typed (same rule as the single form).
        body.addEventListener('input', (e2) => {
          const i = e2.target;
          if (!i.matches('[data-letters]')) return;
          const clean = i.value.replace(/[^A-Za-z\u00C0-\u024F' -]/g, '').replace(/\s{2,}/g, ' ');
          if (clean !== i.value) i.value = clean;
        });

        goB.addEventListener('click', async () => {
          const rows = [...body.querySelectorAll('.pk-bulk-row')].map((tr) => {
            const g = (k) => (tr.querySelector(`[data-k="${k}"]`) || {}).value || '';
            return { name: g('name').trim(), calledName: g('calledName').trim(),
                     email: g('email').trim().toLowerCase(), team: g('team'),
                     accessKey: g('accessKey').trim().toUpperCase() };
          }).filter((r) => r.name || r.email);
          if (!rows.length) { err.textContent = 'Fill in at least one person.'; err.hidden = false; return; }
          const bad = rows.find((r) => !r.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))
                   || rows.find((r) => !r.name);
          if (bad) {
            err.textContent = !bad.email ? 'Every person needs an email address.'
              : !bad.name ? `${bad.email} has no name.` : `"${bad.email}" is not an email address.`;
            err.hidden = false; return;
          }
          goB.disabled = true; goB.textContent = 'Adding…';
          const done = [], failed = [];
          for (const r of rows) {
            const pin = memorablePin();
            try {
              const made = await store.userCreate({ email: r.email, name: r.name, calledName: r.calledName,
                team: r.team, pin, role: 'member', accessId: r.accessKey });
              done.push({ ...r, pin, accessKey: (made && made.accessId) || r.accessKey });
            } catch (e2) { failed.push({ ...r, error: e2.message }); }
          }
          close();
          await pkAlert({ title: done.length ? `Added ${done.length}` : 'Nobody was added',
            message:
              (done.length
                ? done.map((r) => `${r.name}  ${r.email}  ${r.accessKey}  ${r.pin}`).join('\n') +
                  '\n\nHand the PINs over now — those are stored hashed. The Access Keys stay readable on each person’s page.'
                : '') +
              (failed.length ? `\n\nSkipped ${failed.length}:\n` + failed.map((r) => `${r.email} — ${r.error}`).join('\n') : '') });
          fillOrg();
        });
        enhanceSelects(el);
        body.querySelector('input')?.focus();
      }

      /* Add a person, into the team currently open — or, from the People list where no team is in
       * context, into whichever team is chosen here.
       *
       * THE TEAM IS NOT OPTIONAL. It is what a person's sign-in opens; without one the account is
       * created and then refused at the door, which is a worse outcome than a required field.
       *
       * The Access Key can be typed or drawn. Left blank, the Worker draws one — either way it is
       * shown on the way out and stays readable in the people table, because the Builder is the
       * one who reads it out to whoever it belongs to. */
      function openAddPerson() {
        const teams = (orgData.teams || []).filter((t) => t.enabled !== false).map((t) => ({ value: t.name, label: t.name }));
        openFormModal({
          title: 'Add a person',
          fields: [
            { key: 'name', label: 'Full Name', placeholder: 'Their name as it is written', letters: true },
            { key: 'calledName', label: 'Preferred To Be Called', placeholder: 'What people actually call them', letters: true, optional: true },
            { key: 'email', label: 'Email', placeholder: 'them@company.com' },
            /* Outside a team, both questions have to be asked. The role used to be decided by
             * WHERE the dialog was opened from — a person added from the People list silently
             * became a Builder — which was never visible to whoever was filling the form in. */
            ...(orgPath.team ? [] : [
              { key: 'role', label: 'Role', options: [{ value: 'member', label: 'Member' }, { value: 'builder', label: 'Builder' }], value: 'member' },
              { key: 'team', label: 'Team', options: teams, placeholder: 'Choose a team…',
                hint: 'Where they land when they sign in. A Member without one cannot sign in at all.' },
            ]),
            { key: 'accessKey', label: 'Access Key', placeholder: 'Leave blank to generate one', generate: true, gen: genAccessKey,
              hint: 'Two letters, then six digits. This is all they type to sign in.', optional: true },
            { key: 'pin', label: 'PIN', placeholder: '6–12 digits', generate: true, gen: memorablePin },
          ],
          confirmLabel: 'Add person',
          onSubmit: async (v) => {
            if (!v.name) throw new Error('A full name is required.');
            if (!v.email) throw new Error('An email address is required.');
            if (!v.pin) throw new Error('A PIN is required.');
            const role = orgPath.team ? 'member' : (v.role || 'member');
            const team = orgPath.team || v.team || '';
            if (!team && role !== 'builder') throw new Error('Choose a team — a Member with no team cannot sign in.');
            const made = await store.userCreate({ email: v.email, name: v.name, calledName: v.calledName || '',
              team, pin: v.pin, role, accessId: (v.accessKey || '').toUpperCase() });
            showSignIn(v.email, (made && made.accessId) || (v.accessKey || '').toUpperCase(), v.pin);
            fillOrg();
          },
        });
      }

      const afterChange = async (key) => {
        savePrefs(); applyPrefs();
        if (key === 'notifBadges') updateBadges();
        if (key === 'sound' && prefs.sound) playChime();
        if (key === 'desktopNotif' && prefs.desktopNotif && typeof Notification !== 'undefined') {
          try { if (Notification.permission === 'default') await Notification.requestPermission(); } catch {}
          if (Notification.permission !== 'granted') { prefs.desktopNotif = false; savePrefs(); pkAlert('Desktop notifications are blocked — enable them in your browser settings.'); }
        }
        rerender();
      };
      const doAction = async (act, el) => {
        if (act === 'export-json') return downloadJSON();
        if (act === 'export-csv') return downloadBlob(csvExport(all), 'text/csv', 'proofkit-comments.csv');
        if (act === 'export-md') return downloadBlob(mdExport(all), 'text/markdown', 'proofkit-comments.md');
        if (act === 'copy-worker') return copyToClip(WORKER_URL || '', el, 'Copied ✓');
        if (act === 'ping') return pingWorker($('#pk-set-ping'));
        if (act === 'reset-prefs') {
          if (!(await pkConfirm({ title: 'Reset preferences', message: 'Reset every preference on this browser to its default? The global theme is unaffected.', confirmLabel: 'Reset', danger: true }))) return;
          prefs = JSON.parse(JSON.stringify(PREF_DEFAULTS)); savePrefs(); applyPrefs(); restartAutoRefresh(); rerender(); return;
        }
        if (act === 'clear-demo') {
          if (!(await pkConfirm({ title: 'Clear demo data', message: 'Delete ALL locally-stored demo tickets and notifications on this browser? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
          try { const rm = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith('rvc:') || k === 'rvc-notifications' || k === 'rvc-views')) rm.push(k); } rm.forEach((k) => localStorage.removeItem(k)); } catch {}
          location.reload(); return;
        }
        if (act === 'logout') {
          if (!(await pkConfirm({ title: 'Log out', message: 'Log out of Proofkit?', confirmLabel: 'Log out', danger: true }))) return;
          stopLiveUpdates();
          if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
          clearSession(); clearAccount(); toSignIn(); return;
        }
      };
      panel.addEventListener('click', (e) => {
        const theme = e.target.closest('[data-theme-toggle]');
        if (theme) { toggleTheme(); rerender(); return; }
        const tog = e.target.closest('[data-pref-toggle]');
        if (tog) { const k = tog.dataset.prefToggle; setPref(k, !getPref(k)); afterChange(k); return; }
        const ch = e.target.closest('[data-pref-choice]');
        if (ch) { setPref(ch.dataset.prefChoice, ch.dataset.val); afterChange(ch.dataset.prefChoice); return; }
        const ov = e.target.closest('[data-overlayui]');
        if (ov) {
          const v = ov.dataset.overlayui === 'new' ? 'new' : 'old';
          /* A refused save now THROWS rather than resolving quietly — this used to swallow the
           * 401 and repaint as though the choice had stuck, which is why the switch appeared to
           * do nothing: it flipped, then the next sync pulled the server's unchanged value back. */
          if (v !== getGlobalOverlayUi()) {
            setGlobalOverlayUi(v)
              .then(() => rerender())
              .catch((err) => { rerender(); pkAlert({ title: 'Could not change the overlay', message: err.message }); });
          }
          return;
        }
        const act = e.target.closest('[data-act]');
        if (act) { doAction(act.dataset.act, act); return; }
      });
    }

    /* One modal for every "create a thing" on the Organisation screens. The old code hand-built a
     * bespoke dialog per entity, which is how they drifted apart. Uses the same shell as the
     * reopen/clarify dialogs, so fields and buttons inherit the tool's styling. */
/* A PIN somebody can carry in their head.
 *
 * The old generator was `100000 + random*899999` — six independent digits, which is the strongest
 * six-digit PIN available and the least usable one. Nobody memorises 738214, so it gets written on
 * a card or pasted into a note, and the strength evaporates on the way.
 *
 * These are three SHAPES instead. Each is one small thing to remember rather than six:
 *   ABCABC   a three-digit block, said twice        482482
 *   AABBCC   three doubled digits                   449955
 *   ABCCBA   a mirror                               481184
 *
 * And a blocklist, which is the part the shapes make necessary. Patterned PINs land on the common
 * ones far more often than random digits do — 121212 and 112233 are both shapes AND top-20
 * passwords — so anything that comes out matching one is rejected and redrawn. A generator that
 * can hand somebody 123123 is worse than the random one it replaced.
 *
 * crypto.getRandomValues, not Math.random: the shape is predictable by design, so the digits
 * filling it are the only entropy there is.
 */
const COMMON_PINS = new Set([
  '123456', '111111', '000000', '121212', '112233', '123123', '654321', '666666', '696969',
  '112211', '123321', '999999', '888888', '777777', '222222', '333333', '444444', '555555',
  '101010', '110110', '456456', '789789', '147147', '159159', '012012', '100100',
]);
function memorablePin() {
  const d = () => {
    const b = new Uint8Array(1);
    // Rejection-sample so 0–9 are equally likely; 256 % 10 leaves a bias if you just modulo.
    do { crypto.getRandomValues(b); } while (b[0] >= 250);
    return b[0] % 10;
  };
  for (let attempt = 0; attempt < 60; attempt++) {
    const a = d(), b = d(), c = d();
    const shape = d() % 3;
    const pin = shape === 0 ? `${a}${b}${c}${a}${b}${c}`
              : shape === 1 ? `${a}${a}${b}${b}${c}${c}`
              :               `${a}${b}${c}${c}${b}${a}`;
    if (COMMON_PINS.has(pin)) continue;
    if (a === b && b === c) continue;                 // 444444 and friends
    if (b === a + 1 && c === b + 1) continue;         // an ascending run inside any shape
    if (b === a - 1 && c === b - 1) continue;         // and a descending one
    return pin;
  }
  return String(100000 + Math.floor(Math.random() * 899999));   // never hand back nothing
}

/* An Access Key: two letters, then six digits — AB123456.
 *
 * Mirrors the Worker's own rules rather than trusting it to correct us, because this runs in a
 * dialog where the Builder is looking at the value: a code that comes back rejected after they
 * have read it out is worse than one that was never offered. I and O are absent from the letters
 * for the same reason they are absent server-side — I/1 and O/0 are what people get wrong when a
 * code is read aloud or copied off a screen.
 */
function genAccessKey() {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const pick = (n) => {
    const b = new Uint8Array(1);
    const limit = 256 - (256 % n);
    do { crypto.getRandomValues(b); } while (b[0] >= limit);   // no modulo bias
    return b[0] % n;
  };
  for (let attempt = 0; attempt < 60; attempt++) {
    const digits = Array.from({ length: 6 }, () => pick(10)).join('');
    if (/^(\d)\1{5}$/.test(digits)) continue;                            // 000000 and friends
    if ('0123456789'.includes(digits) || '9876543210'.includes(digits)) continue;   // a run
    return ALPHA[pick(ALPHA.length)] + ALPHA[pick(ALPHA.length)] + digits;
  }
  return '';   // let the server draw one instead of handing back something it would refuse
}

    function openFormModal(opts) {
      const el = document.createElement('div'); el.className = 'pk-reopen';
      const esc2 = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="${esc2(opts.title)}">` +
          `<h2 class="pk-reopen-title">${esc2(opts.title)}</h2>` +
          opts.fields.map((f) =>
            `<div class="pk-reopen-field"><span class="pk-reopen-label">${esc2(f.label)}` +
              (f.optional ? ` <span style="color:var(--pk-muted);font-weight:400">· optional</span>` : '') + `</span>` +
              /* Three shapes: a list to choose from, a value with a Generate button beside it, and
               * a plain box. `options` exists because some fields are a choice from what already
               * exists — a team, above all — and typing a name that has to match one is a way to
               * get it wrong rather than a way to be flexible. */
              (f.options
                ? `<select class="pk-login-input" data-f="${esc2(f.key)}">` +
                    (f.placeholder ? `<option value="">${esc2(f.placeholder)}</option>` : '') +
                    f.options.map((o) => `<option value="${esc2(o.value)}"${o.value === f.value ? ' selected' : ''}>${esc2(o.label)}</option>`).join('') +
                  `</select>`
                : f.generate
                ? `<div style="display:flex;gap:8px;align-items:center">` +
                    `<input class="pk-login-input" data-f="${esc2(f.key)}" placeholder="${esc2(f.placeholder || '')}" value="${esc2(f.value || '')}" autocomplete="off" style="flex:1">` +
                    `<button type="button" class="pk-a" data-gen="${esc2(f.key)}">Generate</button></div>`
                : `<input class="pk-login-input" data-f="${esc2(f.key)}" placeholder="${esc2(f.placeholder || '')}" value="${esc2(f.value || '')}" autocomplete="off"${f.letters ? ' data-letters="1"' : ''}>`) +
              (f.hint ? `<div class="pk-set-row-desc">${esc2(f.hint)}</div>` : '') +
            `</div>`).join('') +
          `<div class="pk-reopen-err" hidden></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="pk-a pk-fm-cancel">Cancel</button>` +
            `<button type="button" class="pk-a pk-a--primary pk-fm-go">${esc2(opts.confirmLabel || 'Save')}</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      const err = el.querySelector('.pk-reopen-err'), goBtn = el.querySelector('.pk-fm-go');
      const close = () => { el.remove(); document.removeEventListener('keydown', onEsc); };
      function onEsc(e2) { if (e2.key === 'Escape') close(); }
      document.addEventListener('keydown', onEsc);
      el.addEventListener('click', (e2) => { if (e2.target === el) close(); });
      el.querySelector('.pk-fm-cancel').addEventListener('click', close);
      /* A Generate button needs a generator that knows what shape the value has to be. The old
       * default here was a 14-character string — the shape of the team password, the one field
       * that no longer exists — and it would now quietly fill an Access Key or a PIN box with
       * something the server refuses. A field that asks for Generate has to say how. */
      el.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => {
        const f = opts.fields.find((x) => x.key === b.dataset.gen);
        if (!f || !f.gen) return;
        const input = el.querySelector(`[data-f="${b.dataset.gen}"]`);
        input.value = f.gen(); input.focus();
      }));
      const submit = async () => {
        const v = {};
        el.querySelectorAll('[data-f]').forEach((i) => { v[i.dataset.f] = i.value.trim(); });
        goBtn.disabled = true; const label = goBtn.textContent; goBtn.textContent = 'Working…';
        try { await opts.onSubmit(v); close(); }
        catch (e2) { goBtn.disabled = false; goBtn.textContent = label; err.textContent = e2.message; err.hidden = false; }
      };
      goBtn.addEventListener('click', submit);
      el.addEventListener('keydown', (e2) => { if (e2.key === 'Enter' && e2.target.tagName === 'INPUT') { e2.preventDefault(); submit(); } });
      enhanceSelects(el);
      const first = el.querySelector('[data-f]'); if (first) first.focus();
    }
    // ---- CSP-safe dynamic styling ----
    // The host enforces `style-src 'self'`, which drops `style=` ATTRIBUTES from markup. Values
    // that can't be enumerated as CSS classes (team colours, accent swatches, bar percentages)
    // are emitted as data-attributes and applied here through CSSOM — `el.style.*` is scripted
    // CSSOM, not markup, so CSP does not police it. Call after any innerHTML write.
    /* NATIVE <select> IS THE ONE CONTROL THE DESIGN SYSTEM CANNOT REACH.
     *
     * Its closed state can be styled; its OPEN list is drawn by the operating system and ignores
     * every token — so a screen built entirely from pk-* components still dropped into Chrome's own
     * menu the moment somebody picked a team, which is exactly the moment they are looking at it.
     *
     * ENHANCED, NOT REPLACED. The <select> stays in the DOM as the source of truth and is merely
     * hidden: its value is what form code reads, and the pk-dropdown writes back to it and fires the
     * same `change` event. So every existing handler — the delegated save on the People table, the
     * value collection in openFormModal, the bulk grid — keeps working untouched, and a browser
     * where this never ran still has a usable native control rather than nothing.
     */
    function enhanceSelects(scope) {
      (scope || document).querySelectorAll('select:not([data-pk-enhanced])').forEach((sel) => {
        sel.dataset.pkEnhanced = '1';
        const build = () => buildDropdown({
          items: [...sel.options].map((o) => ({ value: o.value, label: o.textContent })),
          value: sel.value,
          placeholder: sel.getAttribute('data-placeholder') || '',
          block: true,
          small: sel.classList.contains('pk-cellsel'),
          onSelect: (v) => {
            if (sel.value === v) return;
            sel.value = v;
            // bubbles, because every consumer listens on a container rather than the control.
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          },
        });
        const dd = build();
        if (sel.getAttribute('aria-label')) dd.el.setAttribute('aria-label', sel.getAttribute('aria-label'));
        // display:none via CSSOM, not a style attribute — the host enforces `style-src 'self'`.
        sel.style.display = 'none';
        sel.insertAdjacentElement('afterend', dd.el);
        /* The handler that saves a team change disables the <select> while the request is in
         * flight and restores its value if the server refuses. Mirror both onto the visible
         * control, or a refused move leaves the dropdown showing a team the server rejected. */
        sel.addEventListener('pk-sync', () => dd.setValue(sel.value));
      });
    }

    /* ---- Columns the reader re-cuts, on the People table ---------------------------------------
     *
     * WHY THE STYLESHEET CANNOT FINISH THIS JOB. The widths in components.css are percentages,
     * which is the right default — the table should fill its card at any window size — but a
     * percentage is a guess about the data, and the guess is wrong in both directions depending on
     * whose instance it is. The reader is the only one who knows which column they came here to
     * read, so the split is theirs to set and ours to remember.
     *
     * PIXELS FOR WHAT WAS DRAGGED, PERCENTAGES FOR THE REST. Freezing all six columns the first
     * time one is dragged would be the easy implementation and the wrong behaviour: the table would
     * stop responding to the window forever because somebody once widened Email by 40px. Only the
     * dragged column is remembered. The others are measured at their CSS width on each paint and
     * pinned for the life of that paint, which is what makes the drag track the pointer one-to-one
     * — `table-layout:fixed` hands leftover space back to whichever columns are still elastic, so
     * without pinning the lot the edge follows the cursor at whatever fraction it decided to keep.
     *
     * The table then declares its total in pixels instead of 100%, so the widths always sum to
     * exactly the table width and a widened column pushes the table past the card rather than
     * stealing from its neighbours. `.pk-tablewrap` already scrolls sideways, so that is a scroll
     * and not a clipping.
     */
    const COLW_KEY = 'reviewPeopleColWidths';
    /* Room for the heading and its ellipsis. The number that matters is that it is not zero: a
     * column dragged to nothing has no edge left to take hold of, so it could never be dragged
     * back — an unrecoverable state reached by one careless flick of the wrist. */
    const COLW_MIN = 64;
    const loadColW = () => { try { return JSON.parse(localStorage.getItem(COLW_KEY) || '{}') || {}; } catch { return {}; } };
    const saveColW = (m) => { try { localStorage.setItem(COLW_KEY, JSON.stringify(m)); } catch {} };
    // The <col>'s own pk-c-* class is the column's identity — stable across select mode, which adds
    // and removes a leading column and would slide any positional key by one.
    const colKeyOf = (col) => [...col.classList].find((c) => c.startsWith('pk-c-')) || '';
    /* The chevron column absorbs the slack. A table narrower than the card it sits in reads as
     * broken — a ruled block stopping short of the edge every other element lines up with — and the
     * last column is the only place the spare room costs nothing, because all it holds is an 18px
     * chevron already pinned to its right. */
    const layoutCols = (table, cols, w) => {
      const room = table.parentElement ? table.parentElement.clientWidth : 0;
      const total = w.reduce((a, b) => a + b, 0);
      const slack = room && total < room ? room - total : 0;
      const last = cols.length - 1;
      cols.forEach((c, k) => { c.style.width = (w[k] + (k === last ? slack : 0)) + 'px'; });
      table.style.width = (total + slack) + 'px';
    };
    function applyColWidths(table) {
      const cols = [...table.querySelectorAll('colgroup > col')];
      const ths = [...table.querySelectorAll('thead th')];
      if (!cols.length || cols.length !== ths.length) return;
      /* Clear first, ALWAYS — including on the path that then returns. This runs after every
       * render, but it also runs after a drag and after a double-click reset on markup that is
       * still carrying the pixels the last pass wrote, and measuring those would make each pass
       * inherit the previous one's answer instead of the stylesheet's. */
      table.style.width = '';
      cols.forEach((c) => { c.style.width = ''; });
      const saved = loadColW();
      if (!Object.keys(saved).length) return;   // nothing remembered: the percentages are the answer
      const nat = ths.map((th) => th.getBoundingClientRect().width);
      // A hidden view measures as zero. Pinning zeros would be worse than doing nothing, and the
      // next render of a visible table will call this again anyway.
      if (nat.some((x) => !x)) return;
      // A stored value below the minimum is not ours — a hand-edited or half-written localStorage
      // entry should fall back to the default rather than reinstate the unrecoverable state.
      const w = cols.map((c, i) => {
        const s = saved[colKeyOf(c)];
        return typeof s === 'number' && s >= COLW_MIN ? s : nat[i];
      });
      layoutCols(table, cols, w);
    }
    function wireColGrips(scope) {
      (scope || document).querySelectorAll('.pk-colgrip:not([data-pk-grip])').forEach((g) => {
        g.dataset.pkGrip = '1';
        /* NOTHING BELOW CALLS preventDefault ON pointerdown. It is the obvious way to stop the
         * drag selecting the heading text, and it also suppresses the compatibility mouse events
         * — which takes the double-click reset with it. Selection is killed in CSS instead
         * (`.is-colresize`), and the events are stopped from travelling rather than cancelled. */
        const stop = (e) => e.stopPropagation();
        /* The grip sits in a <th>, which nothing navigates from — but the Organisation pane listens
         * for clicks at the top and matches data-attributes anywhere beneath it, and the click that
         * ends a drag is exactly the kind of stray event that finds a handler it was never meant
         * for. It stops here, at every stage of the gesture. */
        g.addEventListener('mousedown', stop);
        g.addEventListener('click', stop);
        g.addEventListener('pointerdown', (e) => {
          if (e.button) return;
          e.stopPropagation();
          const table = g.closest('table'); if (!table) return;
          const cols = [...table.querySelectorAll('colgroup > col')];
          const ths = [...table.querySelectorAll('thead th')];
          const i = cols.findIndex((c) => colKeyOf(c) === g.dataset.colgrip);
          if (i < 0 || cols.length !== ths.length) return;
          const w = ths.map((th) => Math.round(th.getBoundingClientRect().width));
          layoutCols(table, cols, w);   // pin the lot, so the dragged edge is the only thing moving
          const x0 = e.clientX, w0 = w[i];
          table.classList.add('is-colresize');
          // The pointer leaves a 9px strip in the first frame of any real drag; capture is what
          // keeps the move and up events coming to the grip instead of to whatever is under them.
          try { g.setPointerCapture(e.pointerId); } catch {}
          const move = (ev) => { w[i] = Math.max(COLW_MIN, w0 + (ev.clientX - x0)); layoutCols(table, cols, w); };
          const done = () => {
            g.removeEventListener('pointermove', move);
            g.removeEventListener('pointerup', done);
            g.removeEventListener('pointercancel', done);
            table.classList.remove('is-colresize');
            // Only a drag that actually moved something is worth remembering. A plain click — and
            // the two of them a double-click is made of — must leave no trace, or resetting a
            // column would store the very width it was meant to forget.
            if (w[i] !== w0) { const m = loadColW(); m[g.dataset.colgrip] = w[i]; saveColW(m); }
            applyColWidths(table);   // re-derive from storage, so the DOM and the record agree
          };
          g.addEventListener('pointermove', move);
          g.addEventListener('pointerup', done);
          g.addEventListener('pointercancel', done);
        });
        /* Reset FORGETS the column rather than storing its default. The default is a share of
         * whatever the window is now, so writing today's pixel measurement back would pin the
         * column to today's window and call it the default from then on. */
        g.addEventListener('dblclick', (e) => {
          e.stopPropagation(); e.preventDefault();
          const m = loadColW(); delete m[g.dataset.colgrip]; saveColW(m);
          const table = g.closest('table'); if (table) applyColWidths(table);
        });
      });
    }

    function paintDynamic(scope) {
      const r = scope || document;
      enhanceSelects(r);
      r.querySelectorAll('[data-pk-accent]').forEach((el) => {
        const a = el.dataset.pkAccent;
        el.style.background = a; el.style.border = '1.5px solid ' + a; el.style.color = 'var(--pk-on-accent)';
      });
      r.querySelectorAll('[data-pk-fg]').forEach((el) => {
        el.style.borderBottomColor = el.dataset.pkFg; el.style.color = el.dataset.pkFg;
      });
      r.querySelectorAll('[data-pk-sw]').forEach((el) => el.style.setProperty('--sw', el.dataset.pkSw));
      r.querySelectorAll('[data-pk-pct]').forEach((el) => el.style.setProperty('--pct', el.dataset.pkPct + '%'));
      r.querySelectorAll('[data-pk-bg]').forEach((el) => { el.style.background = el.dataset.pkBg; });
      /* Column widths belong here for the same reason the colours do: a `style=` attribute in the
       * markup is dropped by the host CSP, and `col.style.width` from script is not. Last, because
       * the widths are measured off the laid-out header and the passes above can still change what
       * a cell contains. */
      r.querySelectorAll('table.pk-ptable--resize').forEach(applyColWidths);
      wireColGrips(r);
    }

    function render() {
      // A drilled-in ticket detail reuses the Master Log's detail host, shown regardless of
      // which view (Team Queue / Notifications / Master Log) the card was clicked from. The
      // Back button clears entryDetail and re-renders the ORIGINAL view (view is untouched).
      const detail = !!entryDetail;
      const isQueue = view === 'dash'; // the single Queue view; Inbound/Outbound is a direction control
      const homeEl = $('#rvd-view-home'); if (homeEl) homeEl.hidden = detail || view !== 'home';
      // The TBI / Need clarity / Deployed / Pending-signoff strip belongs to the Queue: it counts
      // what is IN the queue. Showing it above the home tiles duplicated numbers the Queue tile
      // already carries, and read as global chrome rather than as part of a view.
      // Keep the rail highlight on whatever is actually rendered. It was set once at load from the
      // remembered view and never re-synced, so landing on Home showed Queue as active.
      syncNav();   // one implementation — it also handles groups and Organisation
      const countsBox = $('#rvd-counts');   // .pk-counts is the strip itself; there is no wrapper
      if (countsBox) countsBox.hidden = detail || view !== 'dash';
      $('#rvd-view-dash').hidden = detail || !isQueue;
      $('#rvd-view-entries').hidden = !detail && view !== 'entries';
      $('#rvd-view-notifs').hidden = detail || view !== 'notifs';
      const iv = $('#rvd-view-insights'); if (iv) iv.hidden = detail || view !== 'insights';
      const ptv = $('#rvd-view-patterns'); if (ptv) ptv.hidden = detail || view !== 'patterns';
      const cv = $('#rvd-view-clarify'); if (cv) cv.hidden = detail || view !== 'clarify';
      const tv = $('#rvd-view-threads'); if (tv) tv.hidden = detail || view !== 'threads';
      const sv = $('#rvd-view-settings'); if (sv) sv.hidden = detail || view !== 'settings';
      const ov = $('#rvd-view-org'); if (ov) ov.hidden = detail || view !== 'org';
      const dep = $('#rvd-view-deploy'); if (dep) dep.hidden = true;
      // The stat tiles + bulk bar belong to the ticket views; Settings and Organisation hide them.
      const barEl = $('.pk-bar'); if (barEl) barEl.hidden = !detail && (view === 'settings' || view === 'org');
      if (detail) { renderEntryDetail(); return; }
      if (view === 'home') { renderHome(); return; }
      if (view === 'settings') { renderSettings(); return; }
      if (view === 'org') { renderOrg(); return; }
      if (view === 'entries') { renderEntries(); return; }
      if (view === 'notifs') { renderNotifs(); return; }
      if (view === 'insights') { renderInsights(); return; }   // fillInsights() paints once its async data lands
      if (view === 'patterns') { renderPatterns(); return; }
      if (view === 'clarify') { counts(); renderClarify(); return; }
      if (view === 'threads') { counts(); renderThreads(); return; }

      // Feature 11: the saved "Team views" quick-select chips sit atop the list.
      renderViewChips();
      syncDirToggle();     // keep the Inbound/Outbound segmented control in step with `dir`
      syncDensToggle();    // keep the Cards/Table density control in step with `density`
      renderStatusChips(); // the status filter row (with live counts)
      counts();   // the count tiles track the active section (Inbound vs Outbound)
      const dv = $('#rvd-view-dash'); if (dv) dv.setAttribute('data-density', density);
      const host = $('#rvd-list');

      // Table density = the full ledger (both directions + every status, incl. revoked). The CSS
      // hides the direction toggle / status chips / grouping tabs while it's active (they don't
      // apply to an all-in view); only the toolbar search narrows it. Rows drill in like the cards.
      if (density === 'table') {
        const lr = ledgerRoots();
        host.innerHTML = lr.length ? ledgerTableHTML(lr, 'All tickets') : '';
        bindLedger(host);
        const empT = $('#rvd-empty');
        empT.hidden = lr.length > 0;
        if (!lr.length) empT.textContent = search ? 'No tickets match your search.' : 'No tickets yet.';
        return;
      }
      const rs = currentRoots();

      // Tab counts [n] — "All" shows the ticket count; "By Page" shows how many distinct PAGES
      // have edits (not the ticket total), since that tab groups the same set by page.
      const tabsEl = $('#pk-tabs');
      if (tabsEl) {
        const pageCount = new Set(rs.map((c) => c.page.path)).size;
        tabsEl.querySelectorAll('.pk-tab').forEach((t) => {
          const n = t.querySelector('.pk-tab-n'); if (!n) return;
          n.textContent = '[' + (t.dataset.tab === 'page' ? pageCount : rs.length) + ']';
        });
      }

      // Every queue card renders the Figma layout (node 2044:10460).
      const oneCard = (r) => cardFigma(r);

      // Feature 9: "By Page" is the group-by-page mechanism (per-page count header); the
      // "All" tab is the flat sort. Toggling between them loses no data (both read `rs`).
      if (tab === 'page') {
        const paths = [...new Set(rs.map((c) => c.page.path))].sort();
        host.innerHTML = paths.map((p) => {
          // Within a page, order by the on-page comment number (ascending) so the oldest/first-raised
          // bug is worked first. pageSeq is stable + never recompacts, so this stays 1, 3, 4… as items close.
          const group = rs.filter((c) => c.page.path === p)
            .sort((a, b) => (a.pageSeq || 0) - (b.pageSeq || 0));
          const tbiN = group.filter((c) => teamStatusOf(c) === 'to_be_initiated').length;
          const progN = group.filter((c) => teamStatusOf(c) === 'in_progress').length;
          const collapsed = collapsedPages.has(p);
          return `<div class="pk-group${collapsed ? ' is-collapsed' : ''}">` +
            `<h2 class="pk-gh"><button type="button" class="pk-gh-toggle" data-page="${esc(p)}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="Collapse or expand this page"><span class="pk-gh-caret" aria-hidden="true"></span></button>` +
            `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
            `<span class="rvd-gh-rollup">${group.length} open · ${tbiN} TBI · ${progN} in progress</span>` +
            `<span class="rvd-gh-actions"><button class="rvd-gh-copy" data-page="${esc(p)}">Copy prompts</button></span>` +
            `</h2><div class="pk-grid">${group.map(oneCard).join('')}</div></div>`;
        }).join('');
        host.querySelectorAll('.rvd-gh-copy').forEach((b) => b.addEventListener('click', () =>
          copyToClip(promptsText(rs.filter((c) => c.page.path === b.dataset.page)), b, 'Copied ✓')));
        host.querySelectorAll('.pk-gh-toggle').forEach((b) => b.addEventListener('click', () => {
          const p = b.dataset.page, grp = b.closest('.pk-group');
          const nowCollapsed = grp.classList.toggle('is-collapsed');
          if (nowCollapsed) collapsedPages.add(p); else collapsedPages.delete(p);
          b.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
          saveCollapsed();
        }));
      } else {
        host.innerHTML = `<div class="pk-grid">${rs.map(oneCard).join('')}</div>`;
      }
      /* AN EMPTY LIST ONLY SPEAKS WHEN IT HAS SOMETHING TO EXPLAIN.
       *
       * A search or a status chip that matched nothing is worth saying, because the reader just
       * asked a question and the blank space is the answer. "Nothing directed to Builder yet." is
       * not: the queue is visibly empty, the counts above already say zero, and a sentence stating
       * what the screen has already shown is furniture. */
      const emp = $('#rvd-empty');
      const chipLabel = (STATUS_CHIPS.find((c) => c.f === statusFilter) || {}).label || '';
      const narrowed = !!search || (statusFilter !== 'open' && statusFilter !== 'all');
      emp.hidden = rs.length > 0 || !narrowed;
      if (!rs.length && narrowed) {
        emp.textContent = search ? 'No tickets match your search.'
          : `No ${chipLabel} tickets ${isOutbound() ? 'sent to other teams' : 'directed to Builder'}.`;
      }
      bindActions();
      updateSelectToggle();
      hydrateThumbs(host);
      paintDynamic();   // CSP: apply data-attr colours/percentages via CSSOM after the HTML lands
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
      $('#pk-tabs').querySelectorAll('.pk-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === tab));
      buildTeamChips();
      render();
    }
    function renderViewChips() {
      const host = $('#rvd-views'); if (!host) return;
      if (!savedViews.length) { host.hidden = true; host.innerHTML = ''; return; }
      host.hidden = false;
      host.innerHTML = `<span class="pk-views-lbl">Team views</span>` +
        savedViews.map((v, i) =>
          `<span class="pk-viewchip${v.name === activeViewName ? ' is-active' : ''}">` +
            `<button type="button" class="pk-viewchip-go" data-i="${i}">${esc(v.name)}</button>` +
            `<button type="button" class="pk-viewchip-x" data-del="${i}" aria-label="Delete view">×</button>` +
          `</span>`).join('');
      host.querySelectorAll('.pk-viewchip-go').forEach((b) =>
        b.addEventListener('click', () => applyView(savedViews[+b.dataset.i])));
      host.querySelectorAll('.pk-viewchip-x').forEach((b) =>
        b.addEventListener('click', async () => {
          const i = +b.dataset.del; const removed = savedViews[i];
          const next = savedViews.filter((_, x) => x !== i);
          try { await store.saveViews(next); savedViews = next; if (removed && removed.name === activeViewName) activeViewName = ''; renderViewChips(); }
          catch (e) { pkAlert('Could not delete view — ' + e.message); }
        }));
    }
    async function saveCurrentView() {
      const name = ((await pkPrompt({ title: 'Save view', message: 'Name this view (shared with everyone on this key):', placeholder: 'View name', confirmLabel: 'Save' })) || '').trim();
      if (!name) return;
      const next = savedViews.filter((v) => v.name !== name).concat([{ name, filters: currentFilterState() }]);
      try { await store.saveViews(next); savedViews = next; activeViewName = name; renderViewChips(); }
      catch (e) { pkAlert('Could not save view — ' + e.message); }
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
      if (!rows.length) return `<div class="pk-bars"><div class="rvd-ins-h">${esc(title)}</div><p class="pk-empty--inline">No data in range.</p></div>`;
      const max = Math.max(...rows.map((r) => r[1]), 0) || 1;
      const body = rows.map((r) => {
        const pct = Math.max(2, Math.round((r[1] / max) * 100));
        return `<div class="pk-bar-row"><span class="pk-bar-key" title="${esc(r[0])}">${esc(r[0])}</span>` +
          `<span class="pk-bar-track"><span class="pk-bar-fill${fill ? ' pk-bar-fill--' + fill : ''}" data-pk-pct="${pct}"></span></span>` +
          `<span class="pk-bar-val">${esc(r[2] != null ? r[2] : r[1])}</span></div>`;
      }).join('');
      return `<div class="pk-bars"><div class="rvd-ins-h">${esc(title)}</div>${body}</div>`;
    }
    const entriesOf = (obj) => Object.keys(obj || {}).map((k) => [k, obj[k]]).sort((a, b) => b[1] - a[1]);

    let insightsData = null, statsData = null;   // Phase 7 /insights + Phase 0 /stats (worker-only)
    function fillInsights() {
      const host = $('#rvd-ins-body'); if (!host) return;
      const m = metricsData;
      if (!m) { host.innerHTML = `<p class="pk-empty--inline">Loading…</p>`; return; }
      // Ticket-outcome split (client-side, ALL Builder tickets — independent of the active Queue
      // direction/team/search filter). Every ticket sits in exactly ONE current state, so these
      // buckets PARTITION the total: they sum to Total Tickets Raised. Same classification the
      // Queue status chips use (revoked flag > teamStatus), windowed by createdAt against the same
      // date range as the worker-driven charts below.
      // statRoots(), not roots(): a smoke-test ticket never contributes to a metric — the rule the
      // count tiles already follow. With roots() a single isTest ticket showed up here (e.g. "Needs
      // clarification 1") while the tile above it read 0, which looked like a bug in the tile.
      const from = metricsFrom || '';
      const toEnd = metricsTo ? metricsTo + 'T23:59:59.999Z' : '';
      const inRange = (c) => { const a = c.createdAt || ''; return (!from || a >= from) && (!toEnd || a <= toEnd); };
      const pool = statRoots().filter(inRange);
      let open = 0, clarify = 0, deployedPending = 0, verified = 0, invalid = 0, revoked = 0;
      for (const c of pool) {
        if (c.revoked) { revoked++; continue; }
        const s = teamStatusOf(c);
        if (s === 'disregarded') invalid++;
        else if (s === 'needs_clarification') clarify++;
        else if (s === 'deployed_live') { c.bugFixConfirmed ? verified++ : deployedPending++; }
        else open++; // to_be_initiated | in_progress | reopened
      }
      const totalRaised = pool.length;
      const fixesDeployed = deployedPending + verified; // total pushed live (with/without sign-off)
      const tiles =
        `<div class="pk-tiles">` +
          `<div class="pk-tile"><div class="pk-tile-val">${totalRaised}</div><div class="pk-tile-label">Total tickets raised</div></div>` +
          `<div class="pk-tile"><div class="pk-tile-val">${fixesDeployed}</div><div class="pk-tile-label">Fixes deployed</div></div>` +
          `<div class="pk-tile"><div class="pk-tile-val">${clarify}</div><div class="pk-tile-label">Needs clarification</div></div>` +
        `</div>`;
      // Fixed logical order (barChart preserves row order); zero-rows dropped. Sums to totalRaised.
      const outcomeRows = [
        ['Open / In Progress', open],
        ['Needs Clarity', clarify],
        ['Deployed (pending sign-off)', deployedPending],
        ['Verified / Bug Closed', verified],
        ['Invalid — Closed', invalid],
        ['Revoked', revoked],
      ].filter((r) => r[1] > 0);
      // Per-team workload (same windowed pool): what each raising team currently has open.
      // Open comments = TBI + In Progress + Reopened; TBI is the not-yet-started subset of it;
      // Needs clarity sits outside it (the ball is with the raiser, not the fixer).
      // Pending sign-off = deployed live but not yet confirmed by the raiser — the ball is with
      // them too, so it also sits outside Open comments.
      const byTeam = {};
      for (const c of pool) {
        if (c.revoked) continue;
        const s = teamStatusOf(c);
        if (s === 'disregarded') continue;
        const t = c.team || ADMIN_TEAM;
        const r = byTeam[t] || (byTeam[t] = { pending: 0, tbi: 0, clarify: 0, signoff: 0 });
        if (s === 'deployed_live') { if (!c.bugFixConfirmed) r.signoff++; }
        else if (s === 'needs_clarification') r.clarify++;
        else { r.pending++; if (s === 'to_be_initiated') r.tbi++; }
      }
      const teamKeys = Object.keys(byTeam).sort((a, b) => (byTeam[b].pending - byTeam[a].pending) || a.localeCompare(b));
      const teamTbl = !teamKeys.length ? '' :
        `<div class="rvd-ins-head pk-u-secgap"><div><h2>Team workload</h2>` +
          `<p class="rvd-deploy-explain">Open tickets by raising team. Open Comments = TBI + In Progress + Reopened; TBI is the untouched subset. Pending Sign-Off is deployed and awaiting the raiser's confirmation.</p></div></div>` +
        `<div class="pk-teamtbl">` +
          `<div class="pk-teamtbl-row pk-teamtbl-head"><span>Team</span><span>Open Comments</span><span>TBI</span><span>Needs Clarity</span><span>Pending Sign-Off</span></div>` +
          teamKeys.map((t) => { const r = byTeam[t]; return `<div class="pk-teamtbl-row"><span class="pk-teamtbl-team">${esc(t)}</span><span>${r.pending}</span><span>${r.tbi}</span><span>${r.clarify}</span><span>${r.signoff}</span></div>`; }).join('') +
        `</div>`;
      const deployRows = entriesOf(m.deployedPerPage).map((r) => [pageName(r[0]), r[1]]);
      const typeRows = entriesOf(m.volumeByType).map((r) => { const meta = typeMeta(r[0]); return [meta ? meta.label : r[0], r[1]]; });
      const trendRows = (m.openTrend || []).map((d) => [d.date, d.count]);
      // Phase 7 (D1) analytics — first-time-fix, reopen breakdown, dwell, inflow (worker-only; null in demo).
      let p7 = '';
      if (insightsData) {
        const ftf = Math.round((insightsData.firstTimeFixRate || 0) * 100);
        p7 += `<div class="rvd-ins-head pk-u-secgap"><h2>Quality (first-time-fix &amp; flow)</h2></div>` +
          `<div class="pk-tiles">` +
            `<div class="pk-tile"><div class="pk-tile-val">${ftf}%</div><div class="pk-tile-label">First-time-fix rate</div></div>` +
            `<div class="pk-tile"><div class="pk-tile-val">${insightsData.closedRoots || 0}</div><div class="pk-tile-label">Tickets closed</div></div>` +
          `</div>`;
        const rb = insightsData.reopenBreakdown || {};
        p7 += barChart('Reopens · by reason', entriesOf(rb.byReason || {}).map((r) => [reopenReasonLabel(r[0]) || r[0], r[1]]), 'amber');
        const tis = insightsData.timeInState || {};
        p7 += barChart('Median dwell (hrs) · by status', Object.keys(tis).map((k) => [k.replace(/_/g, ' '), tis[k].median]), 'blue');
        p7 += barChart('Defect inflow · opened per week', (insightsData.defectInflow || []).map((d) => [d.week, d.opened]), 'green');
      }
      // Phase 0 — System usage counters card (worker-only).
      let sys = '';
      if (statsData && statsData.series && statsData.series.length) {
        let polls = 0, reqs = 0; const teams = new Set();
        for (const d of statsData.series) { polls += d.polls || 0; for (const k in (d.req || {})) reqs += d.req[k]; for (const t in (d.teams || {})) teams.add(t); }
        sys = `<div class="rvd-ins-head pk-u-secgap"><h2>System</h2></div>` +
          `<div class="pk-tiles">` +
            `<div class="pk-tile"><div class="pk-tile-val">${reqs}</div><div class="pk-tile-label">Requests</div></div>` +
            `<div class="pk-tile"><div class="pk-tile-val">${polls}</div><div class="pk-tile-label">Poll requests</div></div>` +
            `<div class="pk-tile"><div class="pk-tile-val">${teams.size}</div><div class="pk-tile-label">Active teams</div></div>` +
          `</div>`;
      }
      host.innerHTML = tiles + teamTbl +
        barChart('Tickets raised · by outcome', outcomeRows, 'amber') +
        barChart('Fixes deployed · by page', deployRows, 'green') +
        barChart('Ticket volume · by type', typeRows, 'blue') +
        barChart('Open-ticket trend · by day', trendRows, '') +
        p7 + sys;
      // Every bar's width is a `--pct` custom property applied through CSSOM (the host CSP drops
      // `style=` attributes). render() cannot do it for us — it calls paintDynamic() the moment
      // renderInsights() returns, which is BEFORE this async fill lands, so the bars stayed at
      // width:0. Paint here, where the markup actually exists.
      paintDynamic(host);
    }
    async function loadMetrics() {
      const host = $('#rvd-ins-body'); if (host) host.innerHTML = `<p class="pk-empty--inline">Loading…</p>`;
      try {
        const to = metricsTo ? metricsTo + 'T23:59:59.999Z' : '';
        metricsData = await store.metrics(metricsFrom || '', to);
      } catch (e) { metricsData = null; if (host) host.innerHTML = `<p class="pk-empty--inline">Could not load insights — ${esc(e.message)}</p>`; return; }
      // Phase 7 (D1) analytics + Phase 0 counters — best-effort; null in local-demo, rendered when present.
      try { insightsData = await store.insights(metricsFrom || '', metricsTo ? metricsTo + 'T23:59:59.999Z' : ''); } catch (e) { insightsData = null; }
      try { statsData = await store.stats(metricsFrom || '', metricsTo || ''); } catch (e) { statsData = null; }
      fillInsights();
    }
    // Phase 8: Patterns — duplicate clusters across pages + fragile areas + "Fix at source" umbrella.
    async function renderPatterns() {
      const host = $('#rvd-view-patterns'); if (!host) return;
      host.innerHTML = `<div class="rvd-ins-head"><div><h2>Patterns</h2>` +
        `<p class="rvd-deploy-explain">The same issue clustered across pages, plus fragile areas reopened repeatedly. “Fix at source” raises one umbrella ticket linking the members.</p></div></div>` +
        `<div id="rvd-pat-body"><p class="pk-empty--inline">Loading…</p></div>`;
      const body = $('#rvd-pat-body');
      let data, frag;
      try { data = await store.patterns(3); frag = await store.fragile(); }
      catch (e) { body.innerHTML = `<p class="pk-empty--inline">Could not load patterns — ${esc(e.message)}</p>`; return; }
      const clusters = (data && data.clusters) || [];
      const fragile = (frag && frag.items) || [];
      if (!clusters.length && !fragile.length) { body.innerHTML = `<p class="pk-empty--inline">No cross-page clusters or fragile areas yet.</p>`; return; }
      let html = '';
      if (clusters.length) {
        html += `<h3 class="pk-h3 pk-u-h3dup">Duplicate clusters</h3>`;
        html += clusters.map((cl, i) => {
          const label = cl.type === 'selector' ? `Same selector <code>${esc(cl.selector)}</code>` : `Same ${esc(cl.commentType || 'type')} issue`;
          const members = (cl.members || []).map((m) => `<li>${esc(m.ticket ? '#' + m.ticket : m.id)} · <span class="pk-slug">${esc(pageName(m.page))}</span> — ${esc((m.summary || '').slice(0, 80))}</li>`).join('');
          return `<div class="pk-tile pk-u-duptile"><div class="pk-u-duprow">` +
            `<b>${label} — ${cl.size} tickets</b><button class="pk-a" data-cluster="${i}">Fix at source</button></div>` +
            `<ul class="pk-u-list">${members}</ul></div>`;
        }).join('');
      }
      if (fragile.length) {
        html += `<h3 class="pk-h3 pk-u-h3frag">Fragile areas (≥2 reopens)</h3><ul class="pk-u-list-flush">` +
          fragile.map((f) => `<li><span class="pk-slug">${esc(pageName(f.page_path))}</span> · <code>${esc(f.selector)}</code> — <b>${f.reopens}</b> reopens</li>`).join('') + `</ul>`;
      }
      body.innerHTML = html;
      body.querySelectorAll('[data-cluster]').forEach((b) => b.addEventListener('click', async () => {
        const cl = clusters[+b.dataset.cluster]; if (!cl) return;
        const ids = (cl.members || []).map((m) => m.id);
        b.disabled = true; b.textContent = 'Creating…';
        try { await store.umbrella(ids, 'Fix at source: ' + cl.size + ' related tickets'); pkAlert('Umbrella ticket created linking ' + ids.length + ' tickets — it’s in the queue.'); renderPatterns(); }
        catch (e) { b.disabled = false; b.textContent = 'Fix at source'; pkAlert('Could not create umbrella — ' + e.message); }
      }));
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
              `<button type="button" id="rvd-ins-apply" class="pk-a">Apply</button>` +
              `<button type="button" id="rvd-ins-clear" class="pk-a">Clear</button>` +
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
      const btn = $('#pk-selectall'); if (!btn) return;
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
      host.querySelectorAll('.pkc-sel').forEach((cb) => {
        cb.addEventListener('change', () => {
          cb.checked ? sel.add(cb.dataset.id) : sel.delete(cb.dataset.id);
          updateBulk(); render();
        });
      });
      host.querySelectorAll('.pk-a[data-action], .pkc-btn[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = roots().find((c) => c.id === btn.dataset.id); if (!rec) return;
          btn.disabled = true;
          await doTeamAction(rec, btn.dataset.action);
        });
      });
      // Start split-button caret → the "Mark Complete — Directly" menu.
      host.querySelectorAll('[data-startmenu]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rec = roots().find((c) => c.id === btn.dataset.id); if (rec) openStartMenu(btn, rec);
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
      host.querySelectorAll('.pkc-more').forEach((btn) => {
        btn.addEventListener('click', () => {
          const rec = roots().find((c) => c.id === btn.dataset.id); if (!rec) return;
          openRowMenu(btn, rec);
        });
      });
      host.querySelectorAll('.pk-morebtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const el = btn.parentElement.querySelector('.rvd-comment-text');
          const clamped = el.classList.toggle('rvd-clamp');
          btn.textContent = clamped ? 'Show more' : 'Show less';
        });
      });
      host.querySelectorAll('.pkc-commentstoggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wrap = host.querySelector('.pkc-comments[data-replies-for="' + btn.dataset.replies + '"]');
          if (!wrap) return;
          // The comments list animates open/closed via the grid-rows technique (see card.css).
          const open = !wrap.classList.contains('is-open');
          wrap.classList.toggle('is-open', open);
          btn.classList.toggle('is-open', open);
        });
      });
      revealClamps(host);
    }

    // Nav-tab switch with motion around Settings. Settings is much shorter than the Queue, so
    // rendering it while scrolled would shrink the page and the browser would clamp the scroll in
    // one abrupt jump (the "shift up"). So when ENTERING Settings from a scrolled view we first
    // glide to the top on the current (tall) content, wait for that smooth scroll to finish
    // (scrollend, timeout fallback), THEN swap + play the slide-in. Leaving Settings just renders
    // (the page grows back, no clamp) and nudges to top if needed. Honours reduced-motion.
    function pkNavSwitch(prev, next, renderFn, settingsViewId) {
      // Every view switch animates the same way. This used to fire only when entering or leaving
      // Settings, so Settings visibly slid while every other tab swapped instantly — the switch
      // felt broken on five tabs and deliberate on one.
      const enterSettings = next !== prev;
      const leaveSettings = prev === 'settings' && next !== 'settings';
      const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const VIEW_EL = { settings: 'rvd-view-settings', home: 'rvd-view-home', dash: 'rvd-view-dash',
                        notifs: 'rvd-view-notifs', threads: 'rvd-view-threads',
                        patterns: 'rvd-view-patterns', insights: 'rvd-view-insights' };
      const slideIn = () => {
        if (!enterSettings) return;
        const sv = document.getElementById(VIEW_EL[next] || settingsViewId);
        if (sv) { sv.classList.remove('pk-view-enter'); void sv.offsetWidth; sv.classList.add('pk-view-enter'); }
      };
      const swap = () => { renderFn(); slideIn(); };
      // Enter Settings from a scrolled, taller view: glide to the top on the CURRENT (tall) content
      // FIRST via a self-driven rAF tween (render deferred), so swapping in the shorter Settings view
      // afterward can't clamp the scroll into one abrupt jump. Deterministic — no scrollend flakiness.
      if (enterSettings && !rm && (window.scrollY || 0) > 4) {
        const startY = window.scrollY, t0 = performance.now(), dur = 340, ease = (p) => 1 - Math.pow(1 - p, 3);
        let done = false;
        // Safety net: rAF is paused while the tab is hidden, so a background switch would never
        // finish the tween. Force the swap (and the scroll) if the glide hasn't landed in time.
        const guard = setTimeout(() => { if (done) return; done = true; window.scrollTo(0, 0); swap(); }, dur + 260);
        const step = (now) => {
          if (done) return;
          const p = Math.min(1, (now - t0) / dur);
          window.scrollTo(0, Math.round(startY * (1 - ease(p))));
          if (p < 1) { requestAnimationFrame(step); return; }
          done = true; clearTimeout(guard); swap();
        };
        requestAnimationFrame(step);
        return;
      }
      swap();
      // Leaving Settings: page grows back (no clamp); if Settings was scrolled, glide to the top.
      if (leaveSettings && (window.scrollY || 0) > 4) { try { window.scrollTo({ top: 0, behavior: rm ? 'auto' : 'smooth' }); } catch (e) {} }
    }
    /* A tile is a navigation, exactly like a sidebar click — same bookkeeping, so Back works and
     * the sidebar highlight follows. Settings tiles additionally pick the section to land on.
     *
     * Bound to the DOCUMENT, not to `.pk-side`. It used to live on the sidebar listener, but the
     * tiles render into #rvd-view-home in the main column — nowhere near the rail — so the handler
     * could never fire and not one tile on the Builder home was clickable. */
    document.addEventListener('click', (e) => {
      const tileEl = e.target.closest('[data-home-view],[data-home-settings],[data-home-project]');
      if (!tileEl) return;
      const prevT = view;
      /* A project row on the home screen goes to THAT project's page, not to the list of projects.
       * Landing on the list would make you find by name the thing you had just clicked on. */
      if (tileEl.dataset.homeProject) {
        /* 'org' is a VIEW of its own, not a section of Settings — setting settingsSection to it
         * lands on Preferences, because the settings renderer falls back when it does not
         * recognise the section. Set the path first so the Organisation module opens ON the
         * project rather than on the list of them. */
        orgPath = { project: tileEl.dataset.homeProject, team: null, person: null };
        view = 'org';
      }
      else if (tileEl.dataset.homeSettings) { settingsSection = tileEl.dataset.homeSettings; view = 'settings'; }
      else view = tileEl.dataset.homeView;
      entryDetail = null;
      syncUrl();
      if (prefs.rememberView) { prefs.lastView = view; savePrefs(); }
      syncNav();   // one implementation — it also handles groups and Organisation
      pkNavSwitch(prevT, view, () => render(), 'rvd-view-settings');
    });

    document.querySelector('.pk-side').addEventListener('click', (e) => {
      const b = e.target.closest('.pk-nav'); if (!b) return;
      const prev = view;

      /* A group header both NAVIGATES and EXPANDS. Making it expand-only would cost a second click
       * to reach the view it is named after; making it navigate-only would leave no way to see
       * what is underneath. Clicking it again while already there collapses it. */
      if (b.dataset.group) {
        const panel = document.querySelector(`.pk-subnav[data-subnav="${b.dataset.group}"]`);
        const alreadyHere = (NAV_GROUPS[b.dataset.group] || []).includes(view);
        const open = alreadyHere ? !panel.classList.contains('is-open') : true;
        panel.classList.toggle('is-open', open);
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (alreadyHere && view === b.dataset.view) return;   // pure expand/collapse, no navigation
      }

      /* Inbound and Outbound are the Queue in two directions, not two views. They set the same
       * `dir` the in-page segmented control sets, so the rail and that control can never disagree. */
      if (b.dataset.dir && b.dataset.dir !== dir) { dir = b.dataset.dir; teamFilter = ''; }

      /* Organisation is a view in its own right, so it needs none of the special-casing that
       * pairing it with Settings used to require. Its three sub-items pick which LIST it opens on
       * — and clicking any of them returns to the top of that list, since a sub-item is a
       * destination, not a filter over wherever you happened to be. */
      if (b.dataset.view === 'org') {
        if (b.dataset.orgTab) orgTab = b.dataset.orgTab;
        orgPath = { project: null, team: null, person: null };
      }
      view = b.dataset.view; entryDetail = null;
      syncUrl();   // a nav click IS a navigation — this is what Back walks back through
      if (prefs.rememberView) { prefs.lastView = view; savePrefs(); }
      syncNav();
      if (b.dataset.dir) { syncDirToggle(); buildTeamChips(); }
      pkNavSwitch(prev, view, () => render(), 'rvd-view-settings');
    });

    /* Sidebar collapse — labels out, icons only. Persisted per browser because it is a working
     * preference, not a session state: someone who wants the room wants it every time. */
    (function wireCollapse() {
      const KEY = 'pkSideCollapsed';
      /* `animate` is false on the first paint — there is no previous layout worth honouring — and
         true for every real toggle, where the content's cards travel to their new columns instead
         of teleporting. See animateRailReflow() in config.js. */
      const apply = (on, animate) => animateRailReflow(() => {
        document.documentElement.classList.toggle('pk-side-collapsed', !!on);
        const b = document.querySelector('[data-pk-collapse]');
        if (b) {
          b.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
          b.setAttribute('title', on ? 'Expand sidebar' : 'Collapse sidebar');
        }
        /* The submenu's rows are a different height when collapsed, so the marker's offset is
         * measured against a layout that no longer exists. Re-measure after the width transition
         * has settled — reading mid-animation just banks a second wrong number. */
        setTimeout(positionSubnavMarker, 300);
      }, { animate: !!animate });
      let on = false;
      try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
      apply(on);
      document.addEventListener('click', (e) => {
        if (!e.target.closest('[data-pk-collapse]')) return;
        on = !on;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
        apply(on, true);
      });
    })();

    // Direction toggle (Inbound │ Outbound) — a control ON the single Queue, not a nav change.
    // Flips the counterparty meaning (From⇄To), resets the team filter, and re-renders in place;
    // search, sort and scroll are untouched. Lives in the toolbar so it only shows on the Queue.
    function syncDirToggle() {
      /* The in-page Inbound/Outbound control is gone — direction is chosen in the rail, where the
       * two are pages rather than a filter, so showing the same switch twice invited them to
       * disagree. Kept as a named no-op because several call sites pair it with buildTeamChips(),
       * and syncNav() is what lights the rail now. */
    }


    // Density toggle (Cards │ Table) — Cards is the filtered working list; Table is the full ledger.
    // The choice persists per browser (prefs.queueDensity) so the dashboard reopens how you left it.
    function syncDensToggle() {
      document.querySelectorAll('#rvd-denstoggle .pk-segbtn').forEach((b) => {
        const on = b.dataset.den === density;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    const densToggleEl = $('#rvd-denstoggle');
    if (densToggleEl) densToggleEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pk-segbtn'); if (!b || b.dataset.den === density) return;
      density = b.dataset.den; prefs.queueDensity = density; savePrefs();
      syncDensToggle(); render();
    });

    // Status-chip row — a pure filter on the Queue. "More" expands the archive slices; a chip click
    // sets the active status and re-renders in place (view/search/sort/direction untouched).
    const statusChipsEl = $('#pk-statuschips');
    if (statusChipsEl) statusChipsEl.addEventListener('click', (e) => {
      const more = e.target.closest('.pk-schip--more');
      if (more) { statusMoreOpen = !statusMoreOpen; renderStatusChips(); return; }
      const b = e.target.closest('.pk-schip'); if (!b || !b.dataset.f) return;
      if (b.dataset.f === statusFilter) return;
      statusFilter = b.dataset.f;
      render();
    });

    // The "Need Clarity" stat tile is a shortcut into the Queue's Need Clarity filter (the standalone
    // clarify view was folded into that chip — see the migration near load). Delegated so it survives
    // the counts() innerHTML rebuild; the tile itself is unrestyled (only a pointer cursor via CSS).
    const countsEl = $('#rvd-counts');
    if (countsEl) countsEl.addEventListener('click', (e) => {
      if (!e.target.closest('.pk-count-clarify')) return;
      view = 'dash'; entryDetail = null; statusFilter = 'needs_clarification'; syncUrl();
      render();
    });

    // Keyboard nav on the ticket detail: Esc closes, J/K step through the originating list.
    // Ignored while typing or when any modal/menu/lightbox is open.
    document.addEventListener('keydown', (e) => {
      if (!entryDetail) return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], .rvd-lightbox, .pk-rowmenu, .pk-dropdown.is-open')) return;
      if (e.key === 'Escape') { setDetail(null); return; }
      const k = e.key.toLowerCase();
      if (k !== 'j' && k !== 'k') return;
      const list = detailList(); const idx = list.findIndex((x) => x.id === entryDetail); if (idx < 0) return;
      const ni = k === 'j' ? idx + 1 : idx - 1;
      if (ni >= 0 && ni < list.length) { e.preventDefault(); setDetail(list[ni].id); }
    });

    // Whole-card drill-in to the ticket detail (delegated, survives re-renders). A click on
    // any Team-Queue card, or any notification card, opens that ticket's detail — the shared
    // detail host reused across views. Interactive controls inside (links/buttons/inputs, the
    // route chips' menus, checkboxes) pass through untouched.
    const openTicketFromCard = (el) => {
      const item = el.closest('.pkc-card[data-id]');
      if (item) { setDetail(item.dataset.id); return true; }
      const note = el.closest('.pk-notif[data-chain]');
      if (note && note.dataset.chain) { setDetail(note.dataset.chain); return true; }
      return false;
    };
    const cardClick = (e) => {
      if (e.target.closest('a, button, input, select, textarea, label')) return;
      // In bulk-select mode a Team-Queue card click belongs to selection, not drill-in.
      if (selectMode && e.target.closest('.pkc-card')) return;
      openTicketFromCard(e.target);
    };
    const cardKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('a, button, input, select, textarea, label')) return;
      const item = e.target.closest && (e.target.closest('.pkc-card[data-id]') || e.target.closest('.pk-notif[data-chain]'));
      if (item) { e.preventDefault(); openTicketFromCard(e.target); }
    };
    $('#rvd-list').addEventListener('click', cardClick);
    $('#rvd-list').addEventListener('keydown', cardKey);
    $('#rvd-view-notifs').addEventListener('click', cardClick);
    $('#rvd-view-notifs').addEventListener('keydown', cardKey);
    const clarifyHost = $('#rvd-view-clarify');
    if (clarifyHost) { clarifyHost.addEventListener('click', cardClick); clarifyHost.addEventListener('keydown', cardKey); }
    const threadsHost = $('#rvd-view-threads');
    if (threadsHost) { threadsHost.addEventListener('click', cardClick); threadsHost.addEventListener('keydown', cardKey); }
    // Comments-tab read state: per-item toggle + "Mark all read". These are <button>s, so the
    // cardClick handler above ignores them; this listener owns them (bound once, survives re-renders).
    if (threadsHost) threadsHost.addEventListener('click', async (e) => {
      const one = e.target.closest('.pk-thread-toggle');
      const all = one ? null : e.target.closest('#rvd-thread-read');
      if (!one && !all) return;
      const btn = one || all; btn.disabled = true;
      try {
        const items = one
          ? [{ id: one.dataset.id, path: one.dataset.path, url: one.dataset.url || '' }]
          : threadRoots().map(threadOrigin).filter((o) => o.readAdmin === false).map((o) => ({ id: o.id, path: o.page.path, url: o.page.url || '' }));
        const read = one ? (one.dataset.read === 'true') : true;
        await store.markThreadsRead(items, read);
        await loadData();
      } catch (err) { btn.disabled = false; pkAlert('Could not update — ' + err.message); }
    });

    $('#pk-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.pk-tab'); if (!b) return;
      tab = b.dataset.tab;
      $('#pk-tabs').querySelectorAll('.pk-tab').forEach((t) => t.classList.toggle('is-active', t === b));
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
        pkAlert('Could not refresh — ' + e.message);
      }
    });
    /* Log out — end the session and return to the sign-in panel.
     *
     * A real function rather than a handler bolted to one button. The header logout it used to
     * live on was deleted in the header cleanup, and the rail button "shared" it by forwarding a
     * click to that element by id — so once the element was gone, the rail button silently did
     * nothing at all. Every caller now invokes the same function directly. */
    async function doLogout() {
      if (!(await pkConfirm({ title: 'Log out', message: 'Log out of Proofkit?', confirmLabel: 'Log out', danger: true }))) return;
      stopLiveUpdates();   // the SSE socket is authenticated — it goes with the session
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }  // after: stopLiveUpdates re-arms the poll
      // Both credentials go. Clearing only the team key left an account session alive, which is
      // its own way back in — logging out has to mean logged out.
      clearSession();
      clearAccount();
      /* And the extension, if it is here. One session across three surfaces means signing out of
       * any one of them signs out of all — otherwise the extension quietly hands the session
       * straight back on the next page load (see extension/bridge.js) and the logout undoes
       * itself. A no-op in a plain browser: nothing is listening. */
      try { window.dispatchEvent(new CustomEvent('proofkit-signout')); } catch (e) {}
      /* Logging out lands on the sign-in page. No ?return=: they chose to leave, so sending
       * them back to the screen they just left is not helpful. The bounce mark goes too —
       * this redirect is deliberate, and must not look like the loop the guard watches for. */
      signInSettled();
      location.replace(signInUrl());
    }
    $('#rvd-logout') && $('#rvd-logout').addEventListener('click', doLogout);
    // ---- toolbar: search / sort / export / copy-all-prompts ----
    $('#rvd-search').addEventListener('input', (e) => { search = e.target.value.trim(); render(); });
    $('#pk-selectall').addEventListener('click', () => setSelectMode(!selectMode));
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
        { value: 'new', label: 'Newest First', icon: IC.newest },
        { value: 'old', label: 'Oldest First', icon: IC.oldest },
        { value: 'page', label: 'Page A–Z', icon: IC.page },
      ],
      onSelect: (v) => { sort = v; render(); },
    });
    $('#rvd-sort-mount').appendChild(sortDD.el);

    /* ---- project scope (12.0) --------------------------------------------------------------
     * The switcher is built from the project list, so it can only ever offer projects that exist.
     * Changing it re-fetches rather than filtering what is already loaded: the ETag is per-project
     * now, and filtering client-side would keep every project's tickets in memory and in every
     * derived view — patterns and insights included — which is the project-blindness this replaces.
     *
     * Rendered only when there is more than one project. On a single-project deployment a control
     * whose every option produces the same screen is furniture. */
    (async function mountProjectScope() {
      const mount = $('#rvd-projscope');
      if (!mount || LOCAL) return;
      let projects = [];
      try { projects = await store.projects(); } catch (e) { return; }
      if (!projects || projects.length < 2) return;

      // A scope pointing at a project that has since been deleted would silently show an empty
      // board; fall back to all rather than to a lie.
      if (projectScope && !projects.some((p) => p.id === projectScope)) {
        projectScope = '';
        try { localStorage.removeItem('pkProjectScope'); } catch (e) {}
      }

      const items = [{ value: '', label: 'All projects' }].concat(
        projects.map((p) => ({ value: p.id, label: p.name || p.id })));
      const dd = buildDropdown({
        small: true, menuAlign: 'right', value: projectScope, items,
        placeholder: 'All projects',
        onSelect: async (v) => {
          if (v === projectScope) return;
          projectScope = v;
          try { v ? localStorage.setItem('pkProjectScope', v) : localStorage.removeItem('pkProjectScope'); } catch (e) {}
          // The cached ETag belongs to the previous scope; keeping it would send an
          // If-None-Match that can never match and, worse, read as "unchanged" if it ever did.
          lastAllEtag = '';
          overviewCache = null;
          try { await loadData(); render(); } catch (e) { pkAlert('Could not load that project — ' + e.message); }
        },
      });
      mount.appendChild(dd.el);
    })();

    // Phase 10: export a Claude Code fix-brief (.md) for the selected tickets — built client-side so
    // it works in demo + worker mode (mirrors the Worker's /fix-brief). Grouped by page, ordered by
    // selector depth; acceptance = expectedOutcome.
    function briefSelectorDepth(sel) { return (String(sel || '').match(/[ >]+/g) || []).length; }
    function buildBrief(recs) {
      const byPage = {};
      for (const r of recs) { const p = (r.page && r.page.path) || '/'; (byPage[p] || (byPage[p] = [])).push(r); }
      let md = '# Proofkit fix brief\n\nApply the changes below. Preserve copy casing/punctuation verbatim.\n\n';
      for (const p of Object.keys(byPage)) {
        md += '## ' + p + '\n\n';
        const list = byPage[p].sort((a, b) => briefSelectorDepth(a.anchor && a.anchor.selector) - briefSelectorDepth(b.anchor && b.anchor.selector));
        for (const r of list) {
          const tf = r.templateFields || {};
          md += '### ' + (r.ticket ? '#' + r.ticket + ' — ' : '') + (r.commentType || 'general') + '\n';
          md += '- **Element:** `' + ((r.anchor && r.anchor.selector) || '(no selector)') + '`\n';
          if (r.comment) md += '- **Note:** ' + r.comment + '\n';
          if (r.commentType === 'copy-fix' && tf.newText) md += '- **Change text to:** "' + tf.newText + '"\n';
          else if (r.commentType === 'link-fix' && tf.newUrl) md += '- **Change link to:** ' + tf.newUrl + '\n';
          else if (r.changeTo) md += '- **Change to:** ' + r.changeTo + '\n';
          if (r.aiPrompt) md += '- **Suggested instruction:** ' + r.aiPrompt + '\n';
          md += '- **Acceptance:** ' + (r.expectedOutcome || 'the change is visible and matches the note') + '\n\n';
        }
      }
      return md;
    }
    function exportBrief(recs) {
      const blob = new Blob([buildBrief(recs)], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'proofkit-fix-brief.md';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    // ---- bulk actions on the selected tickets (Start / Mark Complete / Reopen) ----
    // Reopen goes through the shared modal (Feature 3), one reason/note applied to the batch.
    async function runBulk(act, recs, extra) {
      [...$('#rvd-bulk').querySelectorAll('.pk-bulk-a')].forEach((x) => (x.disabled = true));
      try {
        for (const rec of recs) {
          if (act === 'start') { Object.assign(rec, await store.teamAction(rec, 'start')); }
          else if (act === 'complete') { Object.assign(rec, await store.teamAction(rec, 'complete')); }
          else if (act === 'reopen') { Object.assign(rec, await store.teamAction(rec, 'reopen', extra.reason, extra.note)); }
          else if (act === 'delete') { await store.del(rec); const rid = rec.parentId || rec.id; all = all.filter((c) => c.id !== rid && c.parentId !== rid); }
        }
        sel.clear(); updateBulk(); counts(); render(); lastSig = dataSig();
      } catch (err) { pkAlert('Bulk action failed — ' + err.message); }
      finally { [...$('#rvd-bulk').querySelectorAll('.pk-bulk-a')].forEach((x) => (x.disabled = false)); }
    }
    $('#rvd-bulk').addEventListener('click', async (e) => {
      const b = e.target.closest('.pk-bulk-a'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'all') { currentRoots().forEach((c) => sel.add(c.id)); updateBulk(); render(); return; }
      const recs = [...sel].map((id) => roots().find((c) => c.id === id)).filter(Boolean);
      if (!recs.length) return;
      if (act === 'copy') { copyToClip(promptsText(recs), b, 'Copied ✓'); return; }
      if (act === 'brief') { exportBrief(recs); return; }
      if (act === 'delete' && !(await pkConfirm({ title: 'Delete tickets', message: `Delete ${recs.length} ticket chain${recs.length > 1 ? 's' : ''} (all iterations + replies)? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;
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
    if (teamViewMount) (async () => {
      /* THE TEAMS THAT EXIST, not the ones the config was shipped with.
       *
       * This listed `TEAMS` from config.js — a constant that ships EMPTY, because teams are rows in
       * D1 now and are created through this very screen. So the menu was blank however many teams
       * you had, and the one control whose whole job is "take me to a team's board" could not name
       * a single one. Read live, exactly as the team picker does; the constant is only a fallback
       * for a deployment still driving teams from config.
       */
      let names = [];
      try {
        const live = await store.teamsList();
        names = (live || []).map((t) => ({ name: t.name, enabled: t.enabled !== false }));
      } catch (e) { /* fall through to the constant below */ }
      if (!names.length) names = (TEAMS || []).map((t) => ({ name: t, enabled: teamEnabled(t) }));

      const teamViewDD = buildDropdown({
        block: true, fixedLabel: 'Jump To Team',
        // Opens to the right, bottom-aligned: this sits at the foot of the rail, so a menu
        // dropping down would run off-screen and one opening upward would cover the nav.
        placement: 'right-end',
        // A disabled team renders greyed + inert (buildDropdown honours `disabled`), and an empty
        // instance says so rather than opening onto nothing.
        /* Same tab, deliberately. This opened a new one with `noopener`, and `noopener` is what
         * made it ask for a password: it severs the new tab from this one, so the tab starts with
         * a FRESH sessionStorage — and `pkAuthToken` lives only there. The Builder was signed in
         * the whole time; the tab they landed in simply had no token to prove it with.
         *
         * Navigating in place keeps sessionStorage intact, so the team board opens already
         * authenticated. It is also just what switching views should do — a new tab per team
         * leaves a trail of boards nobody closes. Back returns to the Builder board. */
        items: names.length
          ? names.map((t) => ({
              value: t.name, label: t.name, disabled: !t.enabled,
              onSelect: () => { location.href = boardHome(t.name); },
            }))
          : [{ value: '', label: 'No teams yet', disabled: true }],
      });
      teamViewMount.appendChild(teamViewDD.el);
    })();

    // Colour mode in the rail, right under the team picker — the same personal light/dark
    // switch Settings mounts (one control, two entry points), in its labelled row form.
    /* 7.9: the rail's theme control is a plain button, not a switch — see buildThemeRailButton() in
     * config.js for why. It was built inline here, which is exactly why the team board mounted the
     * switch instead: there was nothing to share. It is shared now, and this board is one of its two
     * callers rather than its owner. */
    try {
      mountThemeRailButton('[data-pk-sidetheme]');
    } catch (e) {}

    // Side-rail logout calls the shared implementation directly. It used to forward a click to
    // the header button by id; that button no longer exists, so the rail button did nothing.
    try {
      const sideOut = document.querySelector('[data-pk-sidelogout]');
      if (sideOut) sideOut.addEventListener('click', doLogout);
    } catch (e) {}

    init();
  })();
