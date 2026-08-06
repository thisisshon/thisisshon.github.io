  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, checkReviewPassword, pageName,
    pageHost, pageLabel, pageLabelFull, pageGroupKey,
    BASE, VIEW_SEGMENTS, SEGMENT_VIEWS, teamSlug, teamFromSlug, boardBase,
    ADMIN_TEAM, buildPanelLogin, buildDropdown, getSession, setSession, clearSession, authHeaders, getAccount, getAuthToken, accountLogin, lockTab, clearAccount,
    initTheme, buildThemeToggle, getTheme, toggleTheme, DEFAULT_THEME, LIGHT_THEME, ENABLED_TEAMS,
    getGlobalOverlayUi, setGlobalOverlayUi, syncOverlayUi, startOverlayUiStream, startScopeStream,
    ensureDemoReset, isTeamEnabled, ACCOUNT_KEY_SENTINEL,
    hasPlatformAuthenticator, passkeyEnrol, passkeyList, passkeyRemove,
    COMMENT_TYPES, TYPE_FIELDS, REOPEN_REASONS, STATUS_COLORS, renderSummary,
    reopenReasonLabel, needsExpectedOutcome, PROJECT_SHORT } from './config.js';

  // Host-project tag (5.0): Proofkit ships unbranded, so the markup carries an empty, hidden
  // element and it is filled ONLY when PROJECT_SHORT is configured. Previously the host project's
  // name was hardcoded into the markup of every entry.
  document.querySelectorAll('[data-pk-project-short]').forEach((el) => {
    if (PROJECT_SHORT) { el.textContent = PROJECT_SHORT; el.hidden = false; }
  });

  import { createCardRenderer } from './card.js';
  import { ICON } from './icons.js';
  import { pkConfirm, pkAlert, pkPrompt } from './modal.js';
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
          policyGet: async () => ({ sessionHours: 12, lockAfter: 5, hardLockAfter: 15, requirePasskeyForBuilder: false, allowTeamKeys: true }),
          policySet: async () => { throw new Error('Needs the worker backend'); },
          teamRename: async () => { throw new Error('Needs the worker backend'); },
          teamPermissions: async () => { throw new Error('Needs the worker backend'); },
          projectUpdate: async () => { throw new Error('Needs the worker backend'); },
          projectDelete: async () => { throw new Error('Needs the worker backend'); },
          userDelete: async () => { throw new Error('Needs the worker backend'); },
          usersBulk: async () => { throw new Error('Needs the worker backend'); },
          exportProject: async () => { throw new Error('Needs the worker backend'); },
          exportTeam: async () => { throw new Error('Needs the worker backend'); },
          importData: async () => { throw new Error('Needs the worker backend'); },
          // Team management is worker-only: local-demo has no key store to manage.
          teamsList: async () => [],
          teamCreate: async () => { throw new Error('Team management needs the worker backend'); },
          teamUpdate: async () => { throw new Error('Team management needs the worker backend'); },
          teamRotate: async () => { throw new Error('Team management needs the worker backend'); },
          teamDelete: async () => { throw new Error('Team management needs the worker backend'); },
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
          all: () => apiFetch('/comments'),
          // Phase 3.1: conditional GET — send If-None-Match, get 304 (near-free) when the admin scope
          // is unchanged since the last poll. Returns {notModified} or {data, etag}.
          allEtag: async (etag) => {
            // This was the ONE call that built its own headers from the team key, so a session
            // authenticated by account (PIN or passkey) polled with no credential at all and got
            // 401s that logged it straight back out. authHeaders() picks the bearer token when
            // there is one and the team key otherwise, which is what every other call already did.
            const headers = { ...authHeaders() };
            if (etag) headers['If-None-Match'] = etag;
            const res = await fetch(WORKER_URL + '/comments', { headers });
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
          projectLinks: () => apiFetch('/admin/project-links'),
          projectLinkSet: (viewerProject, subjectProject, canSee) => apiFetch('/admin/project-links', { method: 'POST', body: JSON.stringify({ viewerProject, subjectProject, canSee }) }),
          // ---- 10.0 ----
          trashList: () => apiFetch('/admin/trash'),
          trashRestore: (kind, ref) => apiFetch('/admin/trash/restore', { method: 'POST', body: JSON.stringify({ kind, ref }) }),
          trashArm: (kind, ref, password) => apiFetch('/admin/trash/arm', { method: 'POST', body: JSON.stringify({ kind, ref, password }) }),
          trashPurge: (kind, ref, password) => apiFetch('/admin/trash/purge', { method: 'POST', body: JSON.stringify({ kind, ref, password }) }),
          auditLog: (kind, ref) => apiFetch('/admin/audit-log' + (kind && ref ? '?kind=' + encodeURIComponent(kind) + '&ref=' + encodeURIComponent(ref) : '')),
          policyGet: () => apiFetch('/admin/settings'),
          policySet: (patch) => apiFetch('/admin/settings', { method: 'POST', body: JSON.stringify(patch) }),
          teamRename: (from, to) => apiFetch('/teams/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),
          teamPermissions: (name, perms) => apiFetch('/teams/permissions', { method: 'POST', body: JSON.stringify({ name, ...perms }) }),
          projectUpdate: (id, name) => apiFetch('/projects/update', { method: 'POST', body: JSON.stringify({ id, name }) }),
          projectDelete: (id) => apiFetch('/projects/delete', { method: 'POST', body: JSON.stringify({ id }) }),
          userDelete: (email) => apiFetch('/admin/users/delete', { method: 'POST', body: JSON.stringify({ email }) }),
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
          // Phase 4 team management (admin). Keys are SHA-256 hashed server-side and NEVER returned;
          // a rotated/created key is shown to the admin once, here, and cannot be read back.
          teamsList: () => apiFetch('/teams/list'),
          teamCreate: (name, key, color) => apiFetch('/teams/create', { method: 'POST', body: JSON.stringify({ name, key, color }) }),
          teamUpdate: (name, patch) => apiFetch('/teams/update', { method: 'POST', body: JSON.stringify({ name, ...patch }) }),
          teamRotate: (name, key) => apiFetch('/teams/rotate', { method: 'POST', body: JSON.stringify({ name, key }) }),
          teamDelete: (name) => apiFetch('/teams/delete', { method: 'POST', body: JSON.stringify({ name }) }),
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

    function showLogin() {
      if (!login) {
        login = buildPanelLogin({
          title: 'Panel Login', sub: 'Enter your key to continue.',
          // Touch ID is offered here because this board runs on the SAME origin the passkey was
          // enrolled against. The in-page overlay deliberately does not pass this: a credential is
          // bound to its origin, so a dashboard passkey cannot be used on a third-party site.
          onPasskey: (body) => {
            // A passkey session has no team key — the sentinel opens the board locally while
            // authHeaders() authenticates every call with the bearer token.
            const team = body.user.role === 'builder' ? ADMIN_TEAM : (body.user.team || ADMIN_TEAM);
            setSession(team, ACCOUNT_KEY_SENTINEL);
            if (team !== ADMIN_TEAM) { location.replace(boardBase(team)); return; }
            loadData()
              .then(() => { hideLogin(); openPendingDetail(); startAutoRefresh(); startLiveUpdates(); })
              .catch((e) => { clearSession(); clearAccount(); login.setError('Signed in, but the board would not load — ' + e.message); });
          },
        });
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
      const b = $('#rvd-blocked'); const app = $('.pk-app');
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
      if (team !== ADMIN_TEAM) { location.replace(boardBase(team)); return; }
      try { await loadData(); hideLogin(); openPendingDetail(); startAutoRefresh(); startLiveUpdates(); }
      catch (e) {
        clearSession();
        login.setBusy(false, 'Authenticate');
        login.setError(e.message === 'unauthorized' ? 'Incorrect key. Please try again.' : ('Could not connect — ' + e.message));
        login.keyInput.focus(); login.keyInput.select();
      }
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
      const id = u.ticket ? idOfTicketNo(u.ticket) : '';
      let absent = '';
      if (id) {
        if (roots().find((x) => x.id === id) || all.find((x) => x.id === id)) entryDetail = id;
        else { entryDetail = null; absent = u.ticket; }   // report what the LINK said, not our lookup
      } else entryDetail = null;
      syncUrl(replace);   // normalises a legacy ?detail= into ?ticket= without adding an entry
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
        showLogin(); return;
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
        const home = boardBase(s.team) + (ticket ? '/tickets/' + encodeURIComponent(ticket) : '');
        if (ticket) { location.replace(home); return; }
        pkConfirm({
          title: 'Builder access',
          message: 'The Builder board is the admin view — your ' + s.team + ' key does not open it. '
            + 'Sign in with the Builder key to upgrade access, or go back to your own board.',
          confirmLabel: 'Sign in as Builder',
          cancelLabel: 'Back to my board',
        }).then((yes) => {
          if (yes) { clearSession(); location.replace(boardBase(ADMIN_TEAM) + '?builder=1'); }
          else location.replace(home);
        }).catch(() => location.replace(home));
        return;
      }
      // Defence-in-depth: a signed-in identity parked off via TEAM_ENABLED gets the
      // "no access" stub, not the app. Builder/ADMIN_TEAM is always enabled, so this
      // is belt-and-braces rather than a path hit in normal operation.
      if (s.key && s.team && !isTeamEnabled(s.team)) { showBlocked(); return; }
      if (s.key && s.team === ADMIN_TEAM) {
        loadData().then(() => { openPendingDetail(); startAutoRefresh(); startLiveUpdates(); }).catch((e) => {
          if (e.message === 'unauthorized') { clearSession(); showLogin(); }
          else { $('#rvd-empty').hidden = false; $('#rvd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else showLogin();
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
      // Path first. Anything under BASE that is not a known segment is treated as the home view.
      let segs = [];
      try {
        segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      } catch { return { view: '', ticket: '' }; }
      // /proofkit/<login>/… — drop the base AND the identity segment.
      const rest = segs.slice(BASE.split('/').filter(Boolean).length + 1);
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
      const v = SEGMENT_VIEWS[rest[0]];
      return { view: v && v !== 'queue' ? v : 'home', ticket: '' };
    }
    /** The path this board's current state should live at. */
    /** This board's root — Builder is the only identity that renders here. */
    const myBase = () => boardBase(ADMIN_TEAM);
    function pathFor(v, detailId) {
      if (detailId) return myBase() + '/tickets/' + encodeURIComponent(ticketNoOf(detailId));
      if (v === 'home') return myBase();                 // the tiles are the board root
      if (v === 'dash') return myBase() + '/queue';      // …so the queue needs its own segment
      const seg = VIEW_SEGMENTS[v];
      return seg ? myBase() + '/' + seg : myBase();
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
      { f: 'needsyou', label: 'Needs you', primary: true, smart: true },
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
    let orgQuery = '';   // Organisation search. Fine at six teams; the point is thirty.
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
    const PK_VERSION = '3.104.0';   // keep in step with VERSION / package.json / CHANGELOG
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
    /* Which views live under which group in the sidebar. Patterns and Insights are ways of LOOKING
     * at the queue, not separate destinations, so they sit under it rather than beside it. */
    const NAV_GROUPS = { queue: ['dash', 'patterns', 'insights'] };

    function syncNav() {
      document.querySelectorAll('.pk-nav').forEach((n) => {
        // The group header highlights for any of its children, so the rail always shows where you
        // are even when the group is collapsed.
        const g = n.dataset.group;
        const inGroup = g && (NAV_GROUPS[g] || []).includes(view);
        // Inbound and Outbound share data-view="dash" and differ only by direction, so matching
        // on the view alone would light both at once.
        const onView = n.dataset.view === view && (!n.dataset.dir || n.dataset.dir === dir);
        n.classList.toggle('is-active', onView || !!inGroup);
      });
      // Organisation is Settings with a section pre-chosen, so it highlights on that pairing only.
      const orgBtn = document.querySelector('.pk-nav[data-view="org"]');
      const setBtn = document.querySelector('.pk-nav[data-view="settings"]');
      if (orgBtn && setBtn) {
        const onOrg = view === 'settings' && settingsSection === 'org';
        orgBtn.classList.toggle('is-active', onOrg);
        setBtn.classList.toggle('is-active', view === 'settings' && !onOrg);
      }
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
      if (e === 'team-complete' || e === 'complete' || st === 'deployed_live') return 'Deployed live';
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
        return `<a class="pkc-btn" href="${esc(root.page.path)}?review=1#c=${id}" target="_blank" rel="noopener">Open Pin</a>` +
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
        { action: 'clarify', label: 'Need clarity', icon: 'clarify' }];
      if (s === 'in_progress') return [
        { action: 'complete', label: 'Mark Complete', icon: 'complete' },
        { action: 'reset', label: 'Move to TBI', icon: 'reset' },
        { action: 'reopen', label: 'Reopen ticket', icon: 'reopen' },
        { action: 'clarify', label: 'Need clarity', icon: 'clarify' }];
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
        { label: 'Open pin', icon: ICON.pin, onSelect: () => window.open(root.page.path + '?review=1#c=' + encodeURIComponent(root.id), '_blank', 'noopener') },
      ];
      // Edit the comment's CONTENT — opens the on-page overlay editor (new tab). Builder is admin,
      // so it may edit ANY comment at any status; the overlay + Worker snapshot the prior version.
      const edit = [{ label: 'Edit teams (From / To)', icon: ICON.teams, onSelect: () => openEditTeams(root) }];
      if (!root.revoked) edit.push({ label: 'Edit comment', icon: ICON.edit, onSelect: () => window.open(root.page.path + '?review=1#c=' + encodeURIComponent(root.id) + '&edit=1', '_blank', 'noopener') });
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
            `<td><a class="pk-slug" href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a></td>` +
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
      { key: 'in_progress', label: 'In progress' },
      { key: 'deployed_live', label: 'Deployed live' },
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
          metaRow('Page', `<a href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a><span class="pk-dmeta-sub">${esc(c.page.path)}</span>`) +
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
              `<a class="pk-a" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">Open pin ↗</a>` +
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
                `<span class="pkd-sub">${esc(pageName(c.page.path))} <span class="pkd-sep">·</span> <a href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(c.page.path)}</a></span>` +
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
            { label: 'Ticket link', icon: ICON.copy, onSelect: () => copyToClip(location.origin + c.page.path + '?review=1#c=' + c.id, null) },
            { label: 'Ticket ID', icon: ICON.copy, onSelect: () => copyToClip(c.ticket || c.id, null) },
            ...(selector ? [{ label: 'Selector', icon: ICON.copy, onSelect: () => copyToClip(selector, null) }] : []),
            { label: 'As Markdown', icon: ICON.copy, onSelect: () => copyToClip(mdExport([c]), null) },
          ] },
          { header: 'Ticket' },
          { label: 'Edit comment', icon: ICON.edit, onSelect: () => window.open(c.page.path + '?review=1#c=' + encodeURIComponent(c.id) + '&edit=1', '_blank', 'noopener') },
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
          (unread.length ? `<button class="pk-a" id="rvd-notif-read">Mark all read (${unread.length})</button>` : '') +
        `</div>` +
        (list.length
          ? `<div class="pk-notes">${list.map(notifItem).join('')}</div>`
          : `<p class="pk-empty">No notifications yet.</p>`);
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
        ? `<a class="pk-openpin" href="${esc(n.path)}?review=1#c=${esc(n.commentId)}" target="_blank" rel="noopener">Open Pin</a>` : '';
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
          tile({ title: 'People', attr: goSet('people'),
                 stat: n(d && d.people), badge: d && d.pendingResets ? d.pendingResets + ' reset' + (d.pendingResets === 1 ? '' : 's') : '',
                 sub: d && d.lockedAccounts ? `${d.lockedAccounts} locked out` : '',
                 desc: 'Accounts, PIN resets and lockouts.' }) +
          tile({ title: 'Teams', attr: goSet('teams'), stat: n(d && d.teams),
                 desc: 'Create teams, set passwords, move them between projects.' }) +
          tile({ title: 'Visibility', attr: goSet('visibility'),
                 sub: d && d.projects && d.projects[0] ? `Mode: ${d.projects[0].visibilityMode}` : '',
                 desc: 'Who sees whose work, and grants across projects.' }) +
          tile({ title: 'Projects', attr: goSet('projects'), stat: n(d && d.projects && d.projects.length),
                 desc: 'The tenancy boundary every ticket lives inside.' }) +
          tile({ title: 'Notifications', attr: go('notifs'),
                 badge: d && d.unreadNotifications ? String(d.unreadNotifications) : '',
                 desc: 'Status pushes, arrivals and replies.' }) +
          tile({ title: 'Comments', attr: go('threads'), desc: 'Every thread, including replies.' }) +
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
            d.projects.map((p) => `<div class="pk-set-row"><div class="pk-set-row-main">` +
              `<div class="pk-set-row-label">${esc(p.name)}</div>` +
              `<div class="pk-set-row-desc">${p.tbi} to start · ${p.inProgress} in progress · ${p.reopened} reopened · ${p.deployed} deployed</div>` +
            `</div><div class="pk-set-ctl"><span class="pk-set-pill">${p.total} total</span></div></div>`).join('') +
            `</div></section>`
          : '');

      if (!overviewCache) {
        store.overview().then((o) => { overviewCache = o; if (view === 'home') renderHome(); })
          .catch(() => { /* tiles stay usable with em-dashes rather than erroring the whole page */ });
      }
    }

    /* ---- 8.0 passkeys ---------------------------------------------------------------------
     * Three honest states, because "Enrol" on a machine that cannot enrol is the failure this
     * screen exists to avoid:
     *   no sensor      — say so plainly, offer nothing
     *   not signed in  — a passkey attaches to an account, and a team key is not one
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
        // This board's own login panel takes a TEAM KEY, which is not a person — so telling someone
        // to "sign in with your email and PIN" here pointed at a field that does not exist on this
        // screen. The account session can only be created on the auth page, so send them there and
        // bring them straight back to this tab, where the token will be waiting.
        stateEl.innerHTML = rowMain('Sign in with your account first',
          'A passkey attaches to a person, and this board is currently open on a team key. '
          + 'Signing in takes one step and returns you here.',
          `<button class="pk-a pk-a--primary" type="button" id="pk-pk-signin">Sign in to enrol</button>`);
        $('#pk-pk-signin').addEventListener('click', () => {
          try { sessionStorage.setItem('pkSettingsSection', 'passkeys'); } catch (e) {}
          location.href = BASE + '/auth/?return=' + encodeURIComponent(location.href);
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
    function renderSettings() {
      $('#rvd-empty').hidden = true;
      const host = $('#rvd-view-settings');
      const SECTIONS = [
        { k: 'org', label: 'Organisation' },
        { k: 'prefs', label: 'Preferences' },
        { k: 'account', label: 'Account' },
        { k: 'trash', label: 'Recycle bin' },
        { k: 'system', label: 'System' },
      ];
      // Old section keys still arrive from deep links and the auth-page handoff. Map rather than
      // drop, so an existing link lands somewhere sensible instead of on a default screen.
      const LEGACY = {
        appearance: 'prefs', behavior: 'prefs', notifications: 'prefs',
        data: 'system', about: 'system',
        people: 'org', visibility: 'org', teams: 'org', projects: 'org',
        passkeys: 'account',
      };
      if (LEGACY[settingsSection]) settingsSection = LEGACY[settingsSection];
      if (!SECTIONS.some((s) => s.k === settingsSection)) settingsSection = 'org';

      host.innerHTML =
        `<div class="rvd-notifhead"><div><h2>Settings</h2></div></div>` +
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

      const panel = $('#pk-set-panel');
      const getPref = (k) => k.includes('.') ? ((prefs[k.split('.')[0]] || {})[k.split('.')[1]]) : prefs[k];
      const setPref = (k, v) => { if (k.includes('.')) { const [a, b] = k.split('.'); prefs[a] = prefs[a] || {}; prefs[a][b] = v; } else prefs[k] = v; };
      const swCtl = (key) => `<button class="pk-set-switch" type="button" role="switch" aria-checked="${!!getPref(key)}" data-pref-toggle="${key}"><span class="pk-set-switch-thumb"></span></button>`;
      const segCtl = (key, opts) => `<div class="pk-set-seg" role="group">` + opts.map((o) => `<button class="pk-set-segbtn${getPref(key) === o.v ? ' is-active' : ''}" type="button" data-pref-choice="${key}" data-val="${esc(o.v)}">${esc(o.l)}</button>`).join('') + `</div>`;
      const row = (label, desc, ctl) => `<div class="pk-set-row"><div class="pk-set-row-main"><div class="pk-set-row-label">${label}</div>${desc ? `<div class="pk-set-row-desc">${desc}</div>` : ''}</div><div class="pk-set-ctl">${ctl}</div></div>`;
      const card = (title, sub, rowsHTML) => `<section class="pk-set-card"><header class="pk-set-card-h"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</header><div class="pk-set-card-b">${rowsHTML}</div></section>`;
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
      const tileGrid = (inner) => `<div class="pk-card-grid">${inner}</div>`;
      // Empty states carry the action rather than explaining the concept.
      const emptyRow = (text, btnHtml) =>
        `<div class="pk-set-empty">${text}${btnHtml ? ` <span class="pk-set-empty-act">${btnHtml}</span>` : ''}</div>`;
      // Anything irreversible lives here, at the bottom, away from the routine controls.
      const dangerCard = (rowsHTML) => rowsHTML
        ? `<section class="pk-set-card pk-set-card--danger"><header class="pk-set-card-h"><h3>Danger zone</h3></header><div class="pk-set-card-b">${rowsHTML}</div></section>`
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

      const go = (patch) => { Object.assign(orgPath, patch); renderSettings(); };

      let html = '';

      // =========================================================================================
      // ORGANISATION
      // =========================================================================================
      if (settingsSection === 'org') {
        html =
          `<div class="pk-set-search"><input id="pk-org-q" class="pk-login-input" type="search" ` +
            `placeholder="Search projects, teams and people" autocomplete="off" value="${esc(orgQuery)}"></div>` +
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
                { value: 'new', label: 'Newest first' }, { value: 'old', label: 'Oldest first' }, { value: 'page', label: 'Page A–Z' },
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
      if (settingsSection === 'account') wirePasskeys();
      if (settingsSection === 'org') {
        fillOrg();
        const q = $('#pk-org-q');
        if (q) {
          // Re-filter in place rather than re-rendering the section, so the caret never moves.
          q.addEventListener('input', () => { orgQuery = q.value; fillOrg(); });
        }
      }
      if (settingsSection === 'trash') fillTrash();
      if (settingsSection === 'system') { fillPolicy(); fillAuditLog(); }

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
      const genKey = () => {
        const a = 'abcdefghijkmnopqrstuvwxyz23456789';   // no l/1/0/o — these get read aloud
        return Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => a[b % a.length]).join('');
      };
      const showOnce = (who, secret, what) => pkAlert(
        `${what} for ${who}:\n\n${secret}\n\nCopy it now — it is stored hashed and cannot be shown again.`);
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
          sw('requirePasskeyForBuilder', 'Builders must use a passkey', 'PIN sign-in is refused for Builder accounts.') +
          sw('allowTeamKeys', 'Allow shared team keys', 'The legacy login. Off means accounts only.');
        holder.querySelectorAll('[data-policy]').forEach((b) => b.addEventListener('click', async () => {
          const raw = b.dataset.pval;
          const v = raw === 'true' ? true : raw === 'false' ? false : Number(raw);
          try { await store.policySet({ [b.dataset.policy]: v }); fillPolicy(); }
          catch (e) { pkAlert('Could not save — ' + e.message); }
        }));
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
          return hrs > 24 ? 'in ' + Math.ceil(hrs / 24) + ' day(s)' : 'in ' + hrs + 'h';
        };
        holder.innerHTML =
          card('Recycle bin', 'Deleted items keep their history. Access already ended.',
            items.map((it) => {
              const stage = !it.purgeArmedAt
                ? `<button class="pk-a danger" type="button" data-trash-arm="${esc(it.kind)}" data-trash-ref="${esc(it.ref)}">Delete permanently</button>`
                : it.canPurgeNow
                  ? `<button class="pk-a danger" type="button" data-trash-purge="${esc(it.kind)}" data-trash-ref="${esc(it.ref)}">Confirm deletion</button>`
                  : `<span class="pk-set-pill">deletable ${esc(waitLabel(it.purgeReadyAt))}</span>`;
              return row(esc(it.name || it.ref),
                `${esc(it.kind)} · deleted ${esc(when(it.deletedAt))}${it.deletedBy ? ' by ' + esc(it.deletedBy) : ''}`,
                `<span class="pk-u-inlinerow">` +
                  `<button class="pk-a pk-a--primary" type="button" data-trash-restore="${esc(it.kind)}" data-trash-ref="${esc(it.ref)}">Restore</button>` +
                  stage +
                `</span>`);
            }).join('')) +
          card('How permanent deletion works', '',
            emptyRow('It takes the Builder password twice, at least a day apart. Nothing here can be destroyed in one sitting.'));

        holder.querySelectorAll('[data-trash-restore],[data-trash-arm],[data-trash-purge]').forEach((b) => {
          b.addEventListener('click', async () => {
            const d = b.dataset;
            try {
              if (d.trashRestore) { await store.trashRestore(d.trashRestore, d.trashRef); return fillTrash(); }
              const kind = d.trashArm || d.trashPurge;
              const first = !!d.trashArm;
              const pw = await pkPrompt({
                title: first ? 'Start permanent deletion' : 'Confirm permanent deletion',
                message: first
                  ? `Enter the Builder password to begin deleting “${d.trashRef}”. It can be confirmed after a day — until then it stays here and can still be restored.`
                  : `Enter the Builder password to destroy “${d.trashRef}”. This cannot be undone.`,
                value: '', confirmLabel: first ? 'Start' : 'Delete for good',
              });
              if (pw === null || !pw) return;
              if (first) await store.trashArm(kind, d.trashRef, pw);
              else await store.trashPurge(kind, d.trashRef, pw);
              fillTrash();
            } catch (err) { pkAlert(err.message); }
          });
        });
      }

      async function fillOrg() {
        const outer = $('#pk-org'); if (!outer) return;
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

        const q = orgQuery.trim().toLowerCase();
        const hit = (x) => !q || String(x || '').toLowerCase().includes(q);
        const projOf = (t) => (t && t.projectId) || 'default';
        const teamsIn = (pid) => teams.filter((t) => projOf(t) === pid);
        const peopleIn = (teamName) => users.filter((u) => (u.team || '') === teamName);
        const peopleInProject = (pid) => {
          const names = new Set(teamsIn(pid).map((t) => t.name));
          return users.filter((u) => names.has(u.team || ''));
        };
        const ticketsFor = (name) => roots().filter((c) => (c.team || '') === name || (c.toTeam || '') === name).length;

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
            crumbs([
              { label: 'Projects', go: 'projects' },
              { label: (projects.find((p) => p.id === orgPath.project) || {}).name || orgPath.project, go: 'project' },
              { label: orgPath.team, go: 'team' },
              { label: u.email },
            ]) +
            card(esc(u.email), '',
              row('Status', '', pill(u.status === 'active' ? 'Active' : 'Disabled')) +
              row('Team', '', pill(u.team || 'None')) +
              row('Role', '', pill(u.role || 'member')) +
              (flags.length ? row('Flags', '', flags.map((f) => pill(f)).join(' ')) : '') +
              (u.lastLoginAt ? row('Last signed in', '', pill(u.lastLoginAt.slice(0, 10))) : '') +
              row('PIN', '', `<button class="pk-a" type="button" data-person-reset="${esc(u.email)}">Reset PIN</button>`) +
              (locked ? row('Locked', 'Too many failed attempts.', `<button class="pk-a pk-a--primary" type="button" data-person-unlock="${esc(u.email)}">Unlock</button>`) : '') +
              // Moving someone was only possible by deleting and recreating them, which lost their
              // history. It belongs on the person, next to the team they are in.
              row('Move to another team', '', `<button class="pk-a" type="button" data-person-move="${esc(u.email)}" data-person-team="${esc(u.team || '')}">Move</button>`) +
              // A person spanning two teams was unrepresentable. The primary team still decides
              // which board they land on; this is extra reach on top of it.
              row('Also in', (u.extraTeams || []).join(', ') || 'No other teams',
                `<button class="pk-a" type="button" data-person-extra="${esc(u.email)}">Edit</button>`)) +
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
            crumbs([
              { label: 'Projects', go: 'projects' },
              { label: (projects.find((p) => p.id === orgPath.project) || {}).name || orgPath.project, go: 'project' },
              { label: t.name },
            ]) +
            card('People', '',
              (members.filter((u) => hit(u.email) || hit(u.name)).length
                ? members.filter((u) => hit(u.email) || hit(u.name)).map((u) => {
                    const bits = [u.status === 'active' ? '' : 'disabled', u.role === 'builder' ? 'Builder' : '', !u.hasPin ? 'no PIN' : ''].filter(Boolean);
                    return drillRow(`data-person-open="${esc(u.email)}"`, esc(u.email), bits.join(' · '));
                  }).join('')
                : emptyRow(q ? 'No matches.' : 'No people yet.')) +
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
              row('Project', '', `<button class="pk-a" type="button" data-team-project="${esc(t.name)}" data-team-current="${esc(projOf(t))}">${esc(projOf(t))}</button>`) +
              row('Board', '', `<button class="pk-a" type="button" data-team-view="${esc(t.name)}">Open board</button>`) +
              row('Export', 'Structure, people and work. No passwords or PINs travel.', `<button class="pk-a" type="button" data-export-team="${esc(t.name)}">Export team</button>`) +
              row('Password', 'Replacing it signs the team out immediately.', `<button class="pk-a" type="button" data-team-rotate="${esc(t.name)}">Change password</button>`)) +
            dangerCard(
              row(t.enabled ? 'Disable team' : 'Enable team',
                t.enabled ? 'Blocks sign-in. Tickets and history are kept.' : 'Restores sign-in.',
                `<button class="pk-a danger" type="button" data-team-toggle="${esc(t.name)}" data-team-enabled="${t.enabled ? '1' : '0'}">${t.enabled ? 'Disable' : 'Enable'}</button>`) +
              // No longer blocked by ticket count: deletion is recoverable now, so the reason for
              // that block (orphaning history forever) no longer applies.
              row('Delete team', 'Moves it to the recycle bin. Its password stops working immediately; the record can be restored.',
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
            card('Project', '',
              row('Name', '', `<button class="pk-a" type="button" data-project-rename="${esc(p.id)}" data-project-name="${esc(p.name || p.id)}">Rename</button>`) +
              row('Kind', '', pill(p.kind || 'owned'))) +
            card('Teams', '',
              (ts.filter((t) => hit(t.name)).length
                ? tileGrid(ts.filter((t) => hit(t.name)).map((t) => drillCard(`data-team-open="${esc(t.name)}"`,
                    esc(t.name), t.enabled ? '' : 'inactive', [
                      [peopleIn(t.name).length, 'people'],
                      [ticketsFor(t.name), 'tickets'],
                    ])).join(''))
                : emptyRow(q ? 'No matches.' : 'No teams yet.')) +
              row('', '', `<span class="pk-u-inlinerow">` +
                `<button class="pk-a pk-a--primary" type="button" id="pk-team-add">Add a team</button>` +
                `<button class="pk-a" type="button" id="pk-team-import">Import a team</button>` +
                `<button class="pk-a" type="button" data-export-project="${esc(p.id)}">Export project</button></span>`)) +
            `<div id="pk-vis-mode"></div><div id="pk-vis-matrix"></div><div id="pk-vis-links"></div>` +
            (p.id === 'default' ? '' : dangerCard(
              row('Delete project', 'Moves it to the recycle bin. Move or delete its teams first.',
                `<button class="pk-a danger" type="button" data-project-delete="${esc(p.id)}">Delete</button>`)));
          fillVisibility(p.id);
          return;
        }

        // ---- level: all projects --------------------------------------------------------------
        const shown = projects.filter((p) => hit(p.name) || hit(p.id)
          || teamsIn(p.id).some((t) => hit(t.name)) || peopleInProject(p.id).some((u) => hit(u.email)));
        const ticketsInProject = (pid) => {
          const names = new Set(teamsIn(pid).map((t) => t.name));
          return roots().filter((c) => names.has(c.team || '') || names.has(c.toTeam || '')).length;
        };
        outer.innerHTML =
          card('Projects', '',
            (shown.length
              ? tileGrid(shown.map((p) => drillCard(`data-project-open="${esc(p.id)}"`,
                  esc(p.name || p.id), esc(p.kind || 'owned'), [
                    [teamsIn(p.id).length, 'teams'],
                    [peopleInProject(p.id).length, 'people'],
                    [ticketsInProject(p.id), 'tickets'],
                  ])).join(''))
              : emptyRow(q ? 'No matches.' : 'No projects yet.')) +
            row('', '', `<span class="pk-u-inlinerow">` +
              `<button class="pk-a pk-a--primary" type="button" id="pk-proj-add">Add a project</button>` +
              `<button class="pk-a" type="button" id="pk-proj-import">Import a project</button></span>`));
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

        modeHost.innerHTML = card('Who sees what', '',
          row('Everyone in this project', '',
            `<button class="pk-a${mode === 'project' ? ' pk-a--primary' : ''}" type="button" data-vis-mode="project">${mode === 'project' ? 'Selected' : 'Select'}</button>`) +
          row('Own threads only', '',
            `<button class="pk-a${mode === 'team' ? ' pk-a--primary' : ''}" type="button" data-vis-mode="team">${mode === 'team' ? 'Selected' : 'Select'}</button>`));

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
        panel.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-crumb],[data-project-open],[data-team-open],[data-person-open],' +
            '[data-vis-mode],[data-vis-viewer],[data-link-viewer],[data-team-project],[data-team-view],' +
            '[data-team-rotate],[data-team-toggle],[data-team-delete],[data-person-reset],[data-person-unlock],' +
            '[data-person-toggle],[data-reset-approve],[data-reset-dismiss],[data-team-rename],[data-perm-team],' +
            '[data-project-rename],[data-project-delete],[data-person-delete],[data-person-move],[data-person-extra],' +
            '[data-export-project],[data-export-team],' +
            '#pk-proj-add,#pk-team-add,#pk-person-add,#pk-person-bulk,#pk-proj-import,#pk-team-import');
          if (!t) return;
          const d = t.dataset;
          try {
            // navigation
            if (d.crumb === 'projects') return go({ project: null, team: null, person: null });
            if (d.crumb === 'project') return go({ team: null, person: null });
            if (d.crumb === 'team') return go({ person: null });
            if (d.projectOpen) return go({ project: d.projectOpen, team: null, person: null });
            if (d.teamOpen) return go({ team: d.teamOpen, person: null });
            if (d.personOpen) return go({ person: d.personOpen });

            // creation
            if (t.id === 'pk-proj-add') {
              const name = await pkPrompt({ title: 'Add a project', message: 'Project name:', value: '', confirmLabel: 'Create' });
              if (name === null || !name.trim()) return;
              const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              await store.createProject(id, name.trim(), 'owned');
              return fillOrg();
            }
            if (t.id === 'pk-team-add') return openAddTeam();
            if (t.id === 'pk-person-add') return openAddPerson();
            if (t.id === 'pk-person-bulk') return openBulkAdd();
            if (t.id === 'pk-proj-import' || t.id === 'pk-team-import') return openImport();
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
            if (d.personDelete) {
              if (!(await pkConfirm({ title: 'Delete account', message: 'Move this account to the recycle bin? They are signed out immediately, and the record can be restored.', confirmLabel: 'Delete', danger: true }))) return;
              await store.userDelete(d.personDelete);
              return go({ person: null });
            }
            if (d.personMove) {
              const to = await pkPrompt({ title: 'Move to another team', message: 'Their history stays with them.', value: d.personTeam || '', confirmLabel: 'Move' });
              if (to === null) return;
              await store.userUpdate({ email: d.personMove, team: to.trim() });
              return go({ person: null, team: null });
            }
            if (d.personExtra) {
              const cur = (orgData.users.find((x) => x.email === d.personExtra) || {}).extraTeams || [];
              const to = await pkPrompt({ title: 'Additional teams', message: 'Comma-separated. Their primary team still decides which board they land on.', value: cur.join(', '), confirmLabel: 'Save' });
              if (to === null) return;
              await store.userUpdate({ email: d.personExtra, extraTeams: to.split(',').map((x) => x.trim()).filter(Boolean) });
              return fillOrg();
            }
            if (d.permTeam) {
              await store.teamPermissions(d.permTeam, { [d.permKey]: d.permOn !== 'true' });
              return fillOrg();
            }

            // team actions
            if (d.teamView) { window.open(boardBase(d.teamView), '_blank', 'noopener'); return; }
            if (d.teamProject) {
              const next = await pkPrompt({ title: 'Move team', message: 'Everyone on this team moves with it, and their tickets become visible only inside the new project.', value: d.teamCurrent || 'default', confirmLabel: 'Move' });
              if (next === null) return;
              await store.teamProject(d.teamProject, next.trim() || 'default');
              return go({ team: null, person: null });
            }
            if (d.teamRotate) {
              const key = await pkPrompt({ title: 'Change password — ' + d.teamRotate, message: 'New password (leave blank to generate one):', value: '', confirmLabel: 'Set password' });
              if (key === null) return;
              const final = key.trim() || genKey();
              await store.teamRotate(d.teamRotate, final);
              showOnce(d.teamRotate, final, 'New password');
              return fillOrg();
            }
            if (d.teamToggle) { await store.teamUpdate(d.teamToggle, { enabled: d.teamEnabled !== '1' }); return fillOrg(); }
            if (d.teamDelete) {
              const held = +d.teamUsed;
              if (!(await pkConfirm({
                title: 'Delete team',
                message: `Move “${d.teamDelete}” to the recycle bin? Its password stops working immediately`
                  + (held ? `, and its ${held} ticket(s) go with it` : '')
                  + '. Nothing is destroyed — you can restore it.',
                confirmLabel: 'Delete', danger: true }))) return;
              await store.teamDelete(d.teamDelete);
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
              return renderSettings();
            }
            if (d.resetDismiss) { await store.resetDismiss(d.resetDismiss); return renderSettings(); }

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
        });
      }

      /** Add a team, into the project currently open. */
      function openAddTeam() {
        openFormModal({
          title: 'Add a team',
          fields: [
            { key: 'name', label: 'Team name', placeholder: 'e.g. Compliance' },
            { key: 'key', label: 'Password', placeholder: 'Leave blank to generate one', generate: true },
            { key: 'color', label: 'Chip colour', placeholder: '#da291c — optional', optional: true },
          ],
          confirmLabel: 'Add team',
          onSubmit: async (v) => {
            if (!v.name) throw new Error('A team name is required.');
            const key = v.key || genKey();
            await store.teamCreate(v.name, key, v.color);
            if (orgPath.project && orgPath.project !== 'default') {
              try { await store.teamProject(v.name, orgPath.project); } catch (e) { /* created regardless */ }
            }
            showOnce(v.name, key, 'Password');
            fillOrg();
          },
        });
      }

      /* Export downloads a file; import reads one. Deliberately a FILE rather than a
       * copy-project button, because the useful case is moving a shape between deployments —
       * staging to production, one client's setup as the template for the next.
       *
       * Nothing secret travels: PIN hashes, team keys and sessions all stay behind, so an
       * imported team arrives disabled and imported people arrive unable to sign in until the
       * Builder gives them credentials. That is the correct default for a file that will end up
       * in an inbox. */
      async function doExport(kind, ref) {
        try {
          const data = kind === 'project' ? await store.exportProject(ref) : await store.exportTeam(ref);
          const name = `proofkit-${kind}-${String(ref).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
          downloadBlob(JSON.stringify(data, null, 2), 'application/json', name);
          pkAlert({ title: 'Exported', message:
            `${name}\n\n${data.counts ? `${data.counts.teams} team(s), ${data.counts.people} people, ${data.counts.tickets} tickets.` : ''}` +
            `\n\nNo passwords or PINs are in this file — people and teams arrive without a way to sign in, and you assign credentials after importing.` });
        } catch (e) { pkAlert('Could not export — ' + e.message); }
      }

      function openImport() {
        const el = document.createElement('div'); el.className = 'pk-reopen';
        el.innerHTML =
          `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Import">` +
            `<h2 class="pk-reopen-title">Import</h2>` +
            `<p class="pk-reopen-sub">Choose a Proofkit export file. Importing only ADDS — anything that already exists is skipped, never overwritten.</p>` +
            `<div class="pk-reopen-field"><span class="pk-reopen-label">File</span>` +
              `<input type="file" accept="application/json,.json" class="pk-login-input pk-imp-file"></div>` +
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
            const payload = JSON.parse(await f.text());
            if (asId.value.trim()) payload.asProject = asId.value.trim();
            const rep = await store.importData(payload);
            close();
            await pkAlert({ title: 'Imported', message:
              `Projects: ${rep.projects.length}\nTeams: ${rep.teams.length}\nPeople: ${rep.people.length}\nTickets: ${rep.tickets}` +
              (rep.skipped.length ? `\n\nSkipped (already existed):\n` + rep.skipped.slice(0, 12).join('\n') : '') +
              `\n\nImported teams arrive disabled and imported people cannot sign in until you assign passwords and PINs.` });
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
      function openBulkAdd() {
        const el = document.createElement('div'); el.className = 'pk-reopen';
        el.innerHTML =
          `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Add many people">` +
            `<h2 class="pk-reopen-title">Add many people</h2>` +
            `<p class="pk-reopen-sub">One email per line. A PIN is generated for each; you will see them once, here.</p>` +
            `<div class="pk-reopen-field"><span class="pk-reopen-label">Emails</span>` +
              `<textarea class="pk-login-input pk-bulk-in" rows="7" placeholder="ana@company.com&#10;bo@company.com"></textarea></div>` +
            `<div class="pk-reopen-err" hidden></div>` +
            `<div class="pk-reopen-actions">` +
              `<button type="button" class="pk-a pk-bulk-cancel">Cancel</button>` +
              `<button type="button" class="pk-a pk-a--primary pk-bulk-go">Add</button>` +
            `</div></div>`;
        document.body.appendChild(el);
        const ta = el.querySelector('.pk-bulk-in'), err = el.querySelector('.pk-reopen-err'), goB = el.querySelector('.pk-bulk-go');
        const close = () => { el.remove(); document.removeEventListener('keydown', onEsc); };
        function onEsc(e2) { if (e2.key === 'Escape') close(); }
        document.addEventListener('keydown', onEsc);
        el.addEventListener('click', (e2) => { if (e2.target === el) close(); });
        el.querySelector('.pk-bulk-cancel').addEventListener('click', close);
        // A PIN that is a run or a repeat is rejected server-side, so generate one that is neither.
        const genPin = () => {
          for (;;) {
            const v = String(Math.floor(100000 + Math.random() * 900000));
            if (!/^(\d)\1+$/.test(v) && !/012345|123456|234567|345678|456789|987654|876543|765432|654321/.test(v)) return v;
          }
        };
        goB.addEventListener('click', async () => {
          const emails = ta.value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
          if (!emails.length) { err.textContent = 'Add at least one address.'; err.hidden = false; return; }
          goB.disabled = true; goB.textContent = 'Adding…';
          try {
            const res = await store.usersBulk(orgPath.team || '', emails.map((email) => ({ email, pin: genPin() })));
            const ok = res.results.filter((r) => r.ok), bad = res.results.filter((r) => !r.ok);
            close();
            await pkAlert(
              (ok.length ? `Added ${ok.length}:\n\n` + ok.map((r) => `${r.email}  ${r.pin}`).join('\n') +
                `\n\nHand these over now — they are stored hashed and cannot be shown again.\n` : 'Nobody was added.\n') +
              (bad.length ? `\nSkipped ${bad.length}:\n` + bad.map((r) => `${r.email || '(blank)'} — ${r.error}`).join('\n') : ''));
            fillOrg();
          } catch (e2) {
            goB.disabled = false; goB.textContent = 'Add';
            err.textContent = e2.message; err.hidden = false;
          }
        });
        ta.focus();
      }

      /** Add a person, into the team currently open. */
      function openAddPerson() {
        openFormModal({
          title: 'Add a person',
          fields: [
            { key: 'email', label: 'Email', placeholder: 'them@company.com' },
            { key: 'pin', label: 'PIN', placeholder: '6–12 digits', generate: true, gen: () => String(Math.floor(100000 + Math.random() * 899999)) },
          ],
          confirmLabel: 'Add person',
          onSubmit: async (v) => {
            if (!v.email) throw new Error('An email address is required.');
            if (!v.pin) throw new Error('A PIN is required.');
            await store.userCreate({ email: v.email, team: orgPath.team || '', pin: v.pin, role: orgPath.team ? 'member' : 'builder' });
            showOnce(v.email, v.pin, 'Initial PIN');
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
        renderSettings();
      };
      const doAction = async (act, el) => {
        if (act === 'export-json') return downloadJSON();
        if (act === 'export-csv') return downloadBlob(csvExport(all), 'text/csv', 'proofkit-comments.csv');
        if (act === 'export-md') return downloadBlob(mdExport(all), 'text/markdown', 'proofkit-comments.md');
        if (act === 'copy-worker') return copyToClip(WORKER_URL || '', el, 'Copied ✓');
        if (act === 'ping') return pingWorker($('#pk-set-ping'));
        if (act === 'reset-prefs') {
          if (!(await pkConfirm({ title: 'Reset preferences', message: 'Reset every preference on this browser to its default? The global theme is unaffected.', confirmLabel: 'Reset', danger: true }))) return;
          prefs = JSON.parse(JSON.stringify(PREF_DEFAULTS)); savePrefs(); applyPrefs(); restartAutoRefresh(); renderSettings(); return;
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
          clearSession(); clearAccount(); showLogin(); return;
        }
      };
      panel.addEventListener('click', (e) => {
        const theme = e.target.closest('[data-theme-toggle]');
        if (theme) { toggleTheme(); renderSettings(); return; }
        const tog = e.target.closest('[data-pref-toggle]');
        if (tog) { const k = tog.dataset.prefToggle; setPref(k, !getPref(k)); afterChange(k); return; }
        const ch = e.target.closest('[data-pref-choice]');
        if (ch) { setPref(ch.dataset.prefChoice, ch.dataset.val); afterChange(ch.dataset.prefChoice); return; }
        const ov = e.target.closest('[data-overlayui]');
        if (ov) {
          const v = ov.dataset.overlayui === 'new' ? 'new' : 'old';
          if (v !== getGlobalOverlayUi()) { setGlobalOverlayUi(v).then(() => renderSettings()); }
          return;
        }
        const act = e.target.closest('[data-act]');
        if (act) { doAction(act.dataset.act, act); return; }
      });
    }

    /* One modal for every "create a thing" on the Organisation screens. The old code hand-built a
     * bespoke dialog per entity, which is how they drifted apart. Uses the same shell as the
     * reopen/clarify dialogs, so fields and buttons inherit the tool's styling. */
    function openFormModal(opts) {
      const el = document.createElement('div'); el.className = 'pk-reopen';
      const esc2 = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="${esc2(opts.title)}">` +
          `<h2 class="pk-reopen-title">${esc2(opts.title)}</h2>` +
          opts.fields.map((f) =>
            `<div class="pk-reopen-field"><span class="pk-reopen-label">${esc2(f.label)}` +
              (f.optional ? ` <span style="color:var(--pk-muted);font-weight:400">· optional</span>` : '') + `</span>` +
              (f.generate
                ? `<div style="display:flex;gap:8px;align-items:center">` +
                    `<input class="pk-login-input" data-f="${esc2(f.key)}" placeholder="${esc2(f.placeholder || '')}" autocomplete="off" style="flex:1">` +
                    `<button type="button" class="pk-a" data-gen="${esc2(f.key)}">Generate</button></div>`
                : `<input class="pk-login-input" data-f="${esc2(f.key)}" placeholder="${esc2(f.placeholder || '')}" autocomplete="off">`) +
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
      el.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => {
        const f = opts.fields.find((x) => x.key === b.dataset.gen);
        const a = 'abcdefghijkmnopqrstuvwxyz23456789';
        const v = f && f.gen ? f.gen() : Array.from(crypto.getRandomValues(new Uint8Array(14)), (n2) => a[n2 % a.length]).join('');
        const input = el.querySelector(`[data-f="${b.dataset.gen}"]`);
        input.value = v; input.focus();
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
      const first = el.querySelector('[data-f]'); if (first) first.focus();
    }
    // ---- CSP-safe dynamic styling ----
    // The host enforces `style-src 'self'`, which drops `style=` ATTRIBUTES from markup. Values
    // that can't be enumerated as CSS classes (team colours, accent swatches, bar percentages)
    // are emitted as data-attributes and applied here through CSSOM — `el.style.*` is scripted
    // CSSOM, not markup, so CSP does not police it. Call after any innerHTML write.
    function paintDynamic(scope) {
      const r = scope || document;
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
      const dep = $('#rvd-view-deploy'); if (dep) dep.hidden = true;
      // The stat tiles + bulk bar belong to the ticket views; the Settings screen hides them.
      const barEl = $('.pk-bar'); if (barEl) barEl.hidden = !detail && view === 'settings';
      if (detail) { renderEntryDetail(); return; }
      if (view === 'home') { renderHome(); return; }
      if (view === 'settings') { renderSettings(); return; }
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
      const emp = $('#rvd-empty');
      emp.hidden = rs.length > 0;
      if (!rs.length) {
        const chipLabel = (STATUS_CHIPS.find((c) => c.f === statusFilter) || {}).label || '';
        emp.textContent = search ? 'No tickets match your search.'
          : (statusFilter !== 'open' && statusFilter !== 'all') ? `No ${chipLabel} tickets ${isOutbound() ? 'sent to other teams' : 'directed to Builder'}.`
          : (isOutbound() ? 'Nothing sent to other teams yet.' : 'Nothing directed to Builder yet.');
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
            `<div class="pk-tile"><div class="pk-tile-val">${teams.size}</div><div class="pk-tile-label">Active team keys</div></div>` +
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
      const tileEl = e.target.closest('[data-home-view],[data-home-settings]');
      if (!tileEl) return;
      const prevT = view;
      if (tileEl.dataset.homeSettings) { settingsSection = tileEl.dataset.homeSettings; view = 'settings'; }
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

      /* 'org' is not a view of its own — it is Settings opened on the Organisation section. The two
       * rail items therefore have to push each other apart: Organisation always opens that section,
       * and Settings never does, or clicking Settings from Organisation would land you exactly
       * where you already were with the wrong item highlighted. */
      const target = b.dataset.view === 'org' ? 'settings' : b.dataset.view;
      if (b.dataset.view === 'org') { settingsSection = 'org'; orgPath = { project: null, team: null, person: null }; }
      if (b.dataset.view === 'settings' && settingsSection === 'org') settingsSection = 'prefs';
      view = target; entryDetail = null;
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
      const apply = (on) => {
        document.documentElement.classList.toggle('pk-side-collapsed', !!on);
        const b = document.querySelector('[data-pk-collapse]');
        if (b) {
          b.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
          b.setAttribute('title', on ? 'Expand sidebar' : 'Collapse sidebar');
        }
      };
      let on = false;
      try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
      apply(on);
      document.addEventListener('click', (e) => {
        if (!e.target.closest('[data-pk-collapse]')) return;
        on = !on;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
        apply(on);
      });
    })();

    // Direction toggle (Inbound │ Outbound) — a control ON the single Queue, not a nav change.
    // Flips the counterparty meaning (From⇄To), resets the team filter, and re-renders in place;
    // search, sort and scroll are untouched. Lives in the toolbar so it only shows on the Queue.
    function syncDirToggle() {
      document.querySelectorAll('#rvd-dirtoggle .pk-segbtn').forEach((b) => {
        const on = b.dataset.dir === dir;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    const dirToggleEl = $('#rvd-dirtoggle');
    if (dirToggleEl) dirToggleEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pk-segbtn'); if (!b || b.dataset.dir === dir) return;
      dir = b.dataset.dir; teamFilter = '';
      syncDirToggle(); buildTeamChips(); syncNav(); render();   // syncNav: the rail shows direction now
    });

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
      showLogin();
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
        { value: 'new', label: 'Newest first', icon: IC.newest },
        { value: 'old', label: 'Oldest first', icon: IC.oldest },
        { value: 'page', label: 'Page A–Z', icon: IC.page },
      ],
      onSelect: (v) => { sort = v; render(); },
    });
    $('#rvd-sort-mount').appendChild(sortDD.el);

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
    if (teamViewMount) {
      const teamViewDD = buildDropdown({
        block: true, fixedLabel: 'Jump To Team',
        // Opens to the right, bottom-aligned: this sits at the foot of the rail, so a menu
        // dropping down would run off-screen and one opening upward would cover the nav.
        placement: 'right-end',
        // Teams gated off via config.js (isTeamEnabled) render greyed + inert (buildDropdown
        // honours `disabled`: aria-disabled, out of the focus order, click is a no-op).
        items: TEAMS.map((t) => ({
          value: t, label: t, disabled: !teamEnabled(t),
          onSelect: () => window.open(boardBase(t), '_blank', 'noopener'),
        })),
      });
      teamViewMount.appendChild(teamViewDD.el);
    }

    // Colour mode in the rail, right under the team picker — the same personal light/dark
    // switch Settings mounts (one control, two entry points), in its labelled row form.
    try {
      // 7.9: the rail's theme control is a plain button, not a switch. A switch needs a track, a
      // knob and a sense of "on", none of which survive the collapsed rail — and it read as a
      // different component from Log out sitting right beneath it. A button says what pressing it
      // does, which is also what the collapsed icon has to convey on its own.
      const sideTheme = document.querySelector('[data-pk-sidetheme]');
      if (sideTheme && !sideTheme.firstChild) {
        const ICONS = {
          // Shown when you are in DARK mode — pressing it takes you to light, so it shows a sun.
          sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
          moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
        };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pk-side-theme-btn';
        const paint = () => {
          const dark = getTheme() !== LIGHT_THEME;
          btn.innerHTML = (dark ? ICONS.sun : ICONS.moon) +
            '<span class="pk-nav-txt">' + (dark ? 'Light' : 'Dark') + ' Mode</span>';
          btn.setAttribute('aria-label', btn.textContent.trim());
          btn.title = btn.textContent.trim();
        };
        paint();
        btn.addEventListener('click', () => { toggleTheme(); paint(); });
        // Another tab flipping the shared theme must update this label too.
        window.addEventListener('storage', paint);
        sideTheme.appendChild(btn);
      }
    } catch (e) {}

    // Side-rail logout calls the shared implementation directly. It used to forward a click to
    // the header button by id; that button no longer exists, so the rail button did nothing.
    try {
      const sideOut = document.querySelector('[data-pk-sidelogout]');
      if (sideOut) sideOut.addEventListener('click', doLogout);
    } catch (e) {}

    init();
  })();
