  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, pageName, pageHref, pageUrlText, ADMIN_TEAM,
    pageHost, pageLabel, pageLabelFull, pageGroupKey,
    VIEW_SEGMENTS, SEGMENT_VIEWS, teamSlug, teamFromSlug, boardBase, BASE,
    buildAccessLogin, accessLogin, passkeyLoginDiscoverable, ACCOUNT_KEY_SENTINEL, buildDropdown, getSession, setSession, clearSession, authHeaders, getAccount, getAuthToken, accountLogin, lockTab, clearAccount, initTheme, mountThemeToggle, buildThemeToggle, getTheme, LIGHT_THEME, ensureDemoReset, isTeamEnabled,
    getOverlayUi, getOverlayUiOverride, setOverlayUiOverride, syncOverlayUi, startScopeStream,
    COMMENT_TYPES, TYPE_FIELDS, REOPEN_REASONS, STATUS_COLORS, reopenReasonLabel, renderSummary, needsExpectedOutcome, PROJECT_SHORT } from './config.js?v=2cb6fa0359';

  // Host-project tag (5.0): Proofkit ships unbranded, so the markup carries an empty, hidden
  // element and it is filled ONLY when PROJECT_SHORT is configured. Previously the host project's
  // name was hardcoded into the markup of every entry.
  document.querySelectorAll('[data-pk-project-short]').forEach((el) => {
    if (PROJECT_SHORT) { el.textContent = PROJECT_SHORT; el.hidden = false; }
  });

  import { PK_VERSION } from './version.js?v=2cb6fa0359';
  import { createCardRenderer } from './card.js?v=2cb6fa0359';
  import { ICON } from './icons.js?v=2cb6fa0359';
  import { pkConfirm, pkAlert, pkPrompt } from './modal.js?v=2cb6fa0359';
  import { openReopenModal, openDisregardModal } from './action-modals.js?v=2cb6fa0359';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter). Colour mode is this
    // team's OWN preference — nobody else's board changes with it. initTheme paints the
    // remembered choice (kept per team, so it survives log out and a shared browser) and
    // follows this user's other tabs; the toggle flips and saves it.
    // The switch itself now lives in the side rail (mounted below, next to Log out) and in
    // Settings → Appearance — the same two entry points Builder has. The old header toggle is
    // gone; it sat in the same viewport as the rail row, so the pair read as two switches.
    initTheme();
    // Refresh the SHARED overlay default so Settings reports it truthfully. No stream here:
    // a team running its own pick is unaffected by the default moving, and a team following
    // it picks the change up on its next visit rather than through a forced reload.
    syncOverlayUi();
    // The revamped board is PERMANENT (no longer gated on the overlayUi flag, which now only picks
    // the on-page overlay). The root marker stays so the compact-header CSS keeps its hook.
    try { document.documentElement.setAttribute('data-pk-newui', '1'); } catch (e) {}
    const LOCAL = !WORKER_URL;

    // Admin override: Builder (admin) can open ANY team's board via /teamdash?team=<T>
    // (the "Jump To Team" dropdown on the admin dashboard). The admin key has full access
    // on the Worker, so it returns that team's inbox. Non-admins can never impersonate —
    // the param is honoured only for an admin session, and the Worker enforces it too.
    /* The board's identity comes from the URL — /proofkit/<slug> — not a `?team=` query.
     * An ADMIN session may open any team's board (the "Jump To Team" preview); a team session
     * may only ever be on its own. guardBoardIdentity() below enforces that in the browser, and
     * the Worker enforces it again on every read, so the slug is a label and never a key. */
    const OVERRIDE = (() => {
      try {
        const segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
        const t = teamFromSlug(segs[BASE.split('/').filter(Boolean).length] || '');
        return t && TEAMS.includes(t) && getSession().team === ADMIN_TEAM ? t : '';
      } catch { return ''; }
    })();

    // The effective team: the admin-chosen override, else the signed-in team (config).
    const team = () => OVERRIDE || getSession().team;

    /* URL identity guard. A signed-in team that hand-edits the slug gets a HARD RESET back to its
     * own board — no partial state, no empty board that looks like a permissions bug. Returns
     * false when it has taken over navigation and the caller should stop.
     *
     * Builder is the one exception worth a message rather than a bounce: asking for the admin
     * board is a legitimate thing to want, so /proofkit/builder is handled by the Builder board
     * itself (dashboard.js), which offers the upgrade-access prompt. Everything else is silent —
     * a reviewer typing another team's name has simply made a mistake. */
    function guardBoardIdentity() {
      const s = getSession();
      if (!s.key || !s.team) return true;               // signed out: the login panel owns this
      if (s.team === ADMIN_TEAM) return true;           // admin may preview any board
      const want = teamFromSlug(slugInUrl());
      if (want === s.team) return true;                 // own board
      location.replace(boardBase(s.team));              // hard reset — reload, not a soft rewrite
      return false;
    }

    // ---- transport: Worker (X-Review-Pass) or the localStorage demo store ----
    async function apiFetch(path, opts = {}) {
      // 6.0: an account token when this tab is unlocked, else the legacy team key. Additive —
      // a browser with no account behaves exactly as before.
      const headers = { 'Content-Type': 'application/json', ...authHeaders() };
      const res = await fetch(WORKER_URL + path, { ...opts, headers });
      if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }
    // The team-visible projection (matches the Worker's maskForTeam) for LOCAL mode. The
    // teamStatus state machine is the single source of truth — no hidden admin lifecycle,
    // no deploy bucket. The full history[] rides along so both sides can draw the timeline.
    const maskLocal = (c) => ({
      id: c.id, ticket: c.ticket || '', parentId: c.parentId || null, iteration: c.iteration || 1,
      pageSeq: c.pageSeq || 0,   // the on-page pin number — carried through so team cards can show it
      createdAt: c.createdAt, team: c.team || '', toTeam: c.toTeam || '',
      name: c.name || '', comment: c.comment, changeTo: c.changeTo || '',
      aiPrompt: c.aiPrompt || '',
      // v3 structured payload (Feature 1/8/4) — every field defaults when missing so
      // pre-v3 records mask cleanly (mirrors the Worker's maskForTeam pass-through).
      commentType: c.commentType || 'general',
      templateFields: (c.templateFields && typeof c.templateFields === 'object') ? c.templateFields : {},
      summary: c.summary || '',
      expectedOutcome: c.expectedOutcome || '',
      imageId: c.imageId || '',
      viewportImageId: c.viewportImageId || '',   // full-viewport screenshot (F4b)
      display: c.display || null,                  // screen resolution + display scale
      page: c.page, anchor: c.anchor || {},
      // the real-time state machine (to_be_initiated | in_progress | deployed_live | reopened)
      teamStatus: c.teamStatus || 'to_be_initiated', teamStatusAt: c.teamStatusAt || '',
      // reopen is an enum + optional note (Feature 3); the raiser sees the reason label + note
      reopenReason: c.reopenReason || '', reopenNote: c.reopenNote || '',
      clarifyNote: c.clarifyNote || '',   // the pending "needs clarification" question (optional)
      // Bug-fix confirmation (raiser verifies a deployed fix) — carried so demo mode + Verified tab work.
      bugFixConfirmed: !!c.bugFixConfirmed, bugFixConfirmedAt: c.bugFixConfirmedAt || '', bugFixConfirmedBy: c.bugFixConfirmedBy || '',
      revoked: !!c.revoked, revokedAt: c.revokedAt || '', revokedBy: c.revokedBy || '',
      // Comments-tab read state for this team (mirror of the Worker's maskForTeam readTeam).
      readTeam: (c.readTeams && c.readTeams[team()] === false) ? false : true,
      history: Array.isArray(c.history) ? c.history : [],
    });
    const luid = () => (crypto.randomUUID ? crypto.randomUUID() : 'n_' + Date.now() + '_' + Math.random().toString(16).slice(2));

    // ---- LOCAL writer: resubmit (mirror of the Worker's POST /resubmit) ----
    // A 'reopened' ticket spawns a NEW sub-ticket that shares the origin's base ticket with
    // a '-<n>' suffix, chains to the origin root via parentId, bumps iteration, and starts
    // back at to_be_initiated — landing in Builder's queue. The prior iteration is retained
    // untouched for the timeline. Also drops a status notification to the receiver (Builder).
    function localResubmit(rec) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return { ...rec };
      if ((r.teamStatus || '') !== 'reopened') return maskLocal(r);
      const now = new Date().toISOString();
      const rootId = r.parentId || r.id;
      let maxIter = 1, baseTicket = '';
      for (const x of arr) {
        if (x.id === rootId || x.parentId === rootId) { if ((x.iteration || 1) > maxIter) maxIter = x.iteration || 1; }
        if (x.id === rootId) baseTicket = String(x.ticket || '').replace(/-\d+$/, '');
      }
      const nextIter = maxIter + 1;
      const sub = {
        id: luid(), ticket: baseTicket ? baseTicket + '-' + (nextIter - 1) : '', createdAt: now,
        teamStatus: 'to_be_initiated', teamStatusAt: now, iteration: nextIter,
        // fresh pass: the reopen reason/note belonged to the prior iteration, so reset them.
        reopenReason: '', reopenNote: '',
        parentId: rootId, team: r.team || '', toTeam: r.toTeam || '',
        name: r.name || 'anonymous', comment: r.comment || '', changeTo: r.changeTo || '',
        // carry the v3 structured payload forward so the next iteration keeps its typed data.
        commentType: r.commentType || 'general',
        templateFields: (r.templateFields && typeof r.templateFields === 'object') ? r.templateFields : {},
        summary: r.summary || '', expectedOutcome: r.expectedOutcome || '', imageId: r.imageId || '',
        aiPrompt: r.aiPrompt || '', page: r.page, anchor: r.anchor || {},
        history: [{ status: 'to_be_initiated', at: now, event: 'resubmitted', iteration: nextIter }],
      };
      arr.push(sub);
      localStorage.setItem(key, JSON.stringify(arr));
      // notify the receiver (Builder) that a fresh iteration landed
      const where = pageLabelFull(sub.page) || 'a page';
      const notif = {
        id: luid(), createdAt: now, updatedAt: now, team: sub.toTeam || '', kind: 'status',
        chainId: rootId, commentId: sub.id, ticket: sub.ticket || '', teamStatus: 'to_be_initiated',
        iteration: nextIter, reason: '', fromTeam: sub.team || '',
        path: (sub.page && sub.page.path) || '/', pageName: where,
        summary: 'Resubmitted ' + (sub.ticket ? '#' + sub.ticket + ' ' : '') + 'for another pass.',
        readTeam: false, readAdmin: false,
      };
      let ex = []; try { ex = JSON.parse(localStorage.getItem('rvc-notifications') || '[]'); } catch {}
      ex.push(notif);
      localStorage.setItem('rvc-notifications', JSON.stringify(ex));
      return maskLocal(sub);
    }

    // Every task this team is part of — ones it RAISED (team) AND ones DIRECTED to it
    // (toTeam) — thread-aware, so a matching root carries its replies AND its resubmit
    // sub-tickets (both chain to the origin via parentId). Masked to the team projection.
    function localComments(t) {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rvc:')) { try { out.push(...JSON.parse(localStorage.getItem(k) || '[]')); } catch {} }
      }
      const mine = new Set(out.filter((c) => !c.parentId && ((c.team || '') === t || (c.toTeam || '') === t)).map((c) => c.id));
      return out
        .filter((c) => (!c.parentId && mine.has(c.id)) || (c.parentId && mine.has(c.parentId)))
        .map(maskLocal).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    function localNotifs(t) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem('rvc-notifications') || '[]'); } catch {}
      return arr.filter((n) => n.team === t).sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
    }
    function localMarkRead(ids, read = true) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem('rvc-notifications') || '[]'); } catch {}
      let updated = 0;
      for (const n of arr) { if (ids.includes(n.id) && n.team === team() && n.readTeam !== read) { n.readTeam = read; updated++; } }
      if (updated) localStorage.setItem('rvc-notifications', JSON.stringify(arr));
      return { ok: true, updated };
    }
    // Demo mirror of POST /comments/read (team copy): flip this team's bit in the root's
    // `readTeams` map. items:[{id,path}] grouped by their `rvc:<path>` store; roots only.
    function localMarkThreadsRead(items, read = true) {
      const byPath = {};
      for (const it of (items || [])) { const p = (it && it.path) || '/'; (byPath[p] = byPath[p] || new Set()).add((it && it.id) || ''); }
      const t = team();
      let updated = 0;
      for (const p of Object.keys(byPath)) {
        const key = 'rvc:' + p; let arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch { continue; }
        let dirty = false;
        for (const r of arr) {
          if (r.parentId || !byPath[p].has(r.id)) continue;
          if (!r.readTeams || typeof r.readTeams !== 'object') r.readTeams = {};
          if (r.readTeams[t] !== read) { r.readTeams[t] = read; dirty = true; updated++; }
        }
        if (dirty) localStorage.setItem(key, JSON.stringify(arr));
      }
      return { ok: true, updated };
    }

    // ---- LOCAL writer: a Quick-questions reply (Feature 6, mirror of POST /comments
    // with a parentId). A reply chains to the origin root, is iteration 1, and NEVER
    // changes the ticket's status/iteration. It fires a `kind:'reply'` notification to
    // the OTHER side (contract §4): replier === raiser (root.team) ⇒ notify toTeam, else
    // notify team — so whoever asked the question, the other party is pinged.
    function localReply(root, text) {
      const key = 'rvc:' + root.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const rootId = root.parentId || root.id;
      const now = new Date().toISOString();
      const reply = {
        id: luid(), parentId: rootId, iteration: 1, createdAt: now,
        team: team(), toTeam: root.toTeam || '', name: getSession().team || team() || 'anonymous',
        comment: String(text || '').slice(0, 4000), changeTo: '',
        commentType: 'general', templateFields: {}, summary: '', expectedOutcome: '', imageId: '',
        aiPrompt: '', page: root.page, anchor: root.anchor || {},
        teamStatus: root.teamStatus || 'to_be_initiated', teamStatusAt: '',
        reopenReason: '', reopenNote: '', history: [],
      };
      arr.push(reply);
      const target = (team() === (root.team || '')) ? (root.toTeam || '') : (root.team || '');
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
          id: luid(), createdAt: now, updatedAt: now, team: target, kind: 'reply',
          chainId: rootId, commentId: reply.id, ticket: root.ticket || '', fromTeam: team() || '',
          path: (root.page && root.page.path) || '/', pageName: where,
          summary: (team() || 'Someone') + ' replied' + (root.ticket ? ' on #' + root.ticket : '') + ': “' + reply.comment.slice(0, 80) + '”',
          readTeam: false, readAdmin: false,
        };
        let ex = []; try { ex = JSON.parse(localStorage.getItem('rvc-notifications') || '[]'); } catch {}
        ex.push(notif);
        localStorage.setItem('rvc-notifications', JSON.stringify(ex));
      }
      return maskLocal(reply);
    }

    // ---- LOCAL writer: revoke (mirror of the Worker's POST /revoke) ----
    // Soft delete: flag the root `revoked` in place. It leaves every team + Builder queue but
    // survives in Builder's Master Log stamped "Revoked". Never removes the record.
    function localRevoke(rec) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const rootId = rec.parentId || rec.id;
      const root = arr.find((x) => x.id === rootId);
      if (root && !root.revoked) {
        // Only revocable before Builder starts it (still to_be_initiated).
        if ((root.teamStatus || 'to_be_initiated') !== 'to_be_initiated') throw new Error('already started');
        const now = new Date().toISOString();
        root.revoked = true; root.revokedAt = now; root.revokedBy = team() || '';
        (root.history = root.history || []).push({ status: root.teamStatus || 'to_be_initiated', at: now, event: 'revoked', iteration: root.iteration || 1, by: root.revokedBy });
        localStorage.setItem(key, JSON.stringify(arr));
        // Local mirror of the Worker's revoke notification — Builder gets an unread alert.
        try {
          const where = pageLabelFull(root.page) || 'a page';
          const nx = JSON.parse(localStorage.getItem('rvc-notifications') || '[]');
          nx.push({
            id: luid(), createdAt: now, team: root.toTeam || ADMIN_TEAM, kind: 'revoked',
            fromTeam: root.revokedBy || root.team || '', commentId: root.id, chainId: root.id,
            ticket: root.ticket || '', path: (root.page && root.page.path) || '/', pageName: where,
            summary: `Comment ${root.ticket ? '#' + root.ticket + ' ' : ''}on ${where} was revoked` + (root.revokedBy ? ` by ${root.revokedBy}` : ''),
            readTeam: false, readAdmin: false,
          });
          localStorage.setItem('rvc-notifications', JSON.stringify(nx));
        } catch (e) { /* best-effort */ }
      }
      return { ok: true };
    }

    // ---- LOCAL writer: delete a single quick question (a reply the team authored) — demo mirror
    // of POST /delete on a reply id. Removes just that reply record from the page bucket. ----
    function localDeleteReply(reply) {
      const key = 'rvc:' + reply.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const next = arr.filter((r) => r.id !== reply.id);
      localStorage.setItem(key, JSON.stringify(next));
      return { ok: true };
    }

    // ---- LOCAL writer: team-status (demo mirror of POST /team-status) ----
    // A team drives status only for items DIRECTED to it (toTeam === me) — the same guard the
    // Worker enforces. The two transitions a team dashboard exposes:
    //   clarify : to_be_initiated | in_progress -> needs_clarification  (park + notify the raiser)
    //   start   : needs_clarification            -> in_progress          (resume once clarified)
    //   reset   : needs_clarification            -> to_be_initiated      (revoke the parking → TBI)
    const TEAM_NEXT = {
      clarify: { from: ['to_be_initiated', 'in_progress'], to: 'needs_clarification' },
      start: { from: ['needs_clarification'], to: 'in_progress' },
      reset: { from: ['needs_clarification'], to: 'to_be_initiated' },
      complete: { from: ['to_be_initiated', 'in_progress'], to: 'deployed_live' },
    };
    function localTeamAction(rec, action, reason, note, redirectTo) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return maskLocal(rec);
      const cur = r.teamStatus || 'to_be_initiated';
      const step = TEAM_NEXT[action];
      if (!step || step.from.indexOf(cur) === -1) return maskLocal(r); // invalid transition → no-op
      const now = new Date().toISOString();
      r.iteration = r.iteration || 1;
      let to = step.to;
      // Complete-with-redirect (demo mirror of the worker): the completing team hands the ticket
      // to the chosen team — re-target toTeam and land it in their queue as TBI, not deployed_live.
      const redirect = action === 'complete' && redirectTo && redirectTo !== (r.toTeam || '') ? redirectTo : '';
      if (redirect) { r.toTeam = redirect; to = 'to_be_initiated'; }
      r.teamStatus = to; r.teamStatusAt = now;
      if (action === 'clarify') r.clarifyNote = note || '';
      if (action === 'start' || action === 'reset') r.clarifyNote = ''; // leaving the bucket clears the question
      if (!Array.isArray(r.history)) r.history = [];
      const h = { status: to, at: now, event: 'team-' + action, iteration: r.iteration };
      if (action === 'clarify' && note) h.note = note;
      if (redirect) h.redirectTo = redirect;
      r.history.push(h);
      localStorage.setItem(key, JSON.stringify(arr));
      // notify the RAISER (r.team) that clarification was requested (mirror of pushStatusNotif)
      if (action === 'clarify') {
        const where = pageLabelFull(r.page) || 'a page';
        const tick = r.ticket ? '#' + r.ticket + ' ' : '';
        const notif = {
          id: luid(), createdAt: now, updatedAt: now, team: r.team || '', kind: 'status',
          chainId: r.parentId || r.id, commentId: r.id, ticket: r.ticket || '',
          teamStatus: 'needs_clarification', iteration: r.iteration || 1, reason: '', reasonLabel: '',
          note: note || '', fromTeam: r.toTeam || '', path: (r.page && r.page.path) || '/', pageName: where,
          summary: 'Clarity needed on ' + tick + 'on ' + where + (note ? ': ' + note : '') + '.',
          readTeam: false, readAdmin: false,
        };
        let ex = []; try { ex = JSON.parse(localStorage.getItem('rvc-notifications') || '[]'); } catch {}
        ex.push(notif); localStorage.setItem('rvc-notifications', JSON.stringify(ex));
      }
      return maskLocal(r);
    }

    // ---- LOCAL writer: confirm a deployed bug fix (demo mirror of POST /confirm) ----
    // The raiser verifies Builder's fix. Sets bugFixConfirmed on the deployed_live record + notifies
    // the deployer (toTeam / Builder). Ownership/state gate is enforced by the UI affordance.
    function localConfirm(rec) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return maskLocal(rec);
      if ((r.teamStatus || '') !== 'deployed_live') throw new Error('not deployed');
      if (r.bugFixConfirmed) return maskLocal(r);
      const now = new Date().toISOString();
      r.bugFixConfirmed = true; r.bugFixConfirmedAt = now; r.bugFixConfirmedBy = team() || r.team || '';
      (r.history = r.history || []).push({ status: 'deployed_live', at: now, event: 'confirmed', iteration: r.iteration || 1, by: r.bugFixConfirmedBy });
      localStorage.setItem(key, JSON.stringify(arr));
      try {
        const where = pageLabelFull(r.page) || 'a page';
        const tick = r.ticket ? '#' + r.ticket + ' ' : '';
        const nx = JSON.parse(localStorage.getItem('rvc-notifications') || '[]');
        nx.push({
          id: luid(), createdAt: now, updatedAt: now, team: r.toTeam || ADMIN_TEAM, kind: 'confirmed',
          fromTeam: r.bugFixConfirmedBy || r.team || '', chainId: r.parentId || r.id, commentId: r.id,
          ticket: r.ticket || '', teamStatus: 'deployed_live', path: (r.page && r.page.path) || '/', pageName: where,
          summary: `Bug fix confirmed on ${tick}on ${where}` + (r.bugFixConfirmedBy ? ` by ${r.bugFixConfirmedBy}` : '') + '.',
          readTeam: false, readAdmin: false,
        });
        localStorage.setItem('rvc-notifications', JSON.stringify(nx));
      } catch (e) { /* best-effort */ }
      return maskLocal(r);
    }

    // ---- LOCAL writer: raiser reopens a deployed fix (demo mirror of POST /reopen-fix) — rejects
    // it back to Builder as TBI, clears the confirm flag, records the reason, notifies Builder. ----
    function localReopenFix(rec, reason, note) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      if (!r) return maskLocal(rec);
      if ((r.teamStatus || '') !== 'deployed_live') throw new Error('not deployed');
      const now = new Date().toISOString();
      r.teamStatus = 'to_be_initiated'; r.teamStatusAt = now;
      r.bugFixConfirmed = false; r.bugFixConfirmedAt = ''; r.bugFixConfirmedBy = '';
      r.reopenReason = reason; r.reopenNote = note || '';
      (r.history = r.history || []).push({ status: 'to_be_initiated', at: now, event: 'raiser-reopen', iteration: r.iteration || 1, reason, note: note || '', by: team() || r.team || '' });
      localStorage.setItem(key, JSON.stringify(arr));
      try {
        const where = pageLabelFull(r.page) || 'a page';
        const tick = r.ticket ? '#' + r.ticket + ' ' : '';
        const label = reopenReasonLabel(reason) || reason;
        const nx = JSON.parse(localStorage.getItem('rvc-notifications') || '[]');
        nx.push({
          id: luid(), createdAt: now, updatedAt: now, team: r.toTeam || ADMIN_TEAM, kind: 'status',
          fromTeam: team() || r.team || '', chainId: r.parentId || r.id, commentId: r.id,
          ticket: r.ticket || '', teamStatus: 'to_be_initiated', reason, reasonLabel: label, note: note || '',
          path: (r.page && r.page.path) || '/', pageName: where,
          summary: (team() || 'The team') + ' reopened ' + tick + 'on ' + where + ' — ' + label + (note ? ': ' + note : ''),
          readTeam: false, readAdmin: false,
        });
        localStorage.setItem('rvc-notifications', JSON.stringify(nx));
      } catch (e) { /* best-effort */ }
      return maskLocal(r);
    }

    // ---- LOCAL saved views (Feature 11) — the team's shared quick-select filter sets.
    // Stored under one 'rvc-views' map keyed by team (mirrors the Worker's per-caller
    // `views:<team>` KV key), so each team reads/writes only its own set. POST replaces.
    function localGetViews(t) {
      let map = {}; try { map = JSON.parse(localStorage.getItem('rvc-views') || '{}'); } catch {}
      const v = map && map[t]; return Array.isArray(v) ? v : [];
    }
    function localSaveViews(t, views) {
      let map = {}; try { map = JSON.parse(localStorage.getItem('rvc-views') || '{}'); } catch {}
      if (!map || typeof map !== 'object') map = {};
      map[t] = Array.isArray(views) ? views : [];
      try { localStorage.setItem('rvc-views', JSON.stringify(map)); } catch {}
      return { ok: true, views: map[t] };
    }

    const store = LOCAL
      ? {
          comments: async () => localComments(team()),
          commentsEtag: async () => ({ data: localComments(team()), etag: '' }), // no 304 in demo
          notifs: async () => localNotifs(team()),
          notifsEtag: async () => ({ data: localNotifs(team()), etag: '' }),     // no 304 in demo
          markRead: async (ids, read = true) => localMarkRead(ids, read),
          markThreadsRead: async (items, read = true) => localMarkThreadsRead(items, read),
          // A team drives status only for items directed to it (clarify / resume) — demo mirror.
          teamAction: async (rec, action, reason, note, redirectTo) => localTeamAction(rec, action, reason, note, redirectTo),
          // The raiser confirms a deployed bug fix — demo mirror.
          confirm: async (rec) => localConfirm(rec),
          // Raiser reopens a deployed fix — back to Builder (TBI). Demo mirror of POST /reopen-fix.
          reopenFix: async (rec, reason, note) => localReopenFix(rec, reason, note),
          resubmit: async (rec) => localResubmit(rec),
          // Revoke (soft delete) — a team may revoke a comment IT raised.
          revoke: async (rec) => localRevoke(rec),
          // Delete a single quick question (a reply the team authored) — demo mirror of POST /delete.
          delReply: async (reply) => localDeleteReply(reply),
          // Quick-questions reply (Feature 6) — no ticket, no status change.
          reply: async (root, text) => localReply(root, text),
          // Saved views (Feature 11), scoped to the signed-in team.
          getViews: async () => localGetViews(team()),
          saveViews: async (views) => localSaveViews(team(), views),
          // Screenshot dataURL (Feature 4) stored under rvc-img:<id> in demo mode.
          image: async (id) => { try { return { dataUrl: localStorage.getItem('rvc-img:' + id) || '' }; } catch { return { dataUrl: '' }; } },
        }
      : {
          comments: () => apiFetch('/comments?team=' + encodeURIComponent(team())),
          // Phase 3.1 parity with Builder: conditional GET on the team scope. Send If-None-Match;
          // the Worker answers 304 (no body, no D1 read) when `team:<name>` has not moved since the
          // last poll. Returns {notModified} or {data, etag} — same shape as the Builder's allEtag.
          commentsEtag: async (etag) => {
            /* authHeaders(), NOT the raw session key. An account session's key is the SENTINEL —
             * a marker, not a credential — so sending it as X-Review-Pass asks the Worker to
             * authenticate with the literal string 'pk-account-session'. It 401s, the 401 handler
             * below calls clearSession(), and the board shows its sign-in panel to somebody who is
             * signed in. That is the whole "the team board keeps asking me to log in" bug: the
             * poller was the only thing on the board still authenticating the old way.
             * authHeaders() sends the bearer token when there is one and the team key when there
             * is not, so both kinds of session work here. */
            const headers = { ...authHeaders() };
            if (etag) headers['If-None-Match'] = etag;
            const res = await fetch(WORKER_URL + '/comments?team=' + encodeURIComponent(team()), { headers });
            if (res.status === 304) return { notModified: true };
            if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return { data: await res.json(), etag: res.headers.get('ETag') || '' };
          },
          notifs: () => apiFetch('/notifications?team=' + encodeURIComponent(team())),
          // Same treatment for notifications. Both endpoints gate on the SAME `team:<name>` scope,
          // so they share one ETag value — an idle board 304s on both and transfers nothing.
          notifsEtag: async (etag) => {
            const headers = { ...authHeaders() };   // see commentsEtag above
            if (etag) headers['If-None-Match'] = etag;
            const res = await fetch(WORKER_URL + '/notifications?team=' + encodeURIComponent(team()), { headers });
            if (res.status === 304) return { notModified: true };
            if (res.status === 401) { clearSession(); throw new Error('unauthorized'); }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return { data: await res.json(), etag: res.headers.get('ETag') || '' };
          },
          markRead: (ids, read = true) => apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids, team: team(), read }) }),
          markThreadsRead: (items, read = true) => apiFetch('/comments/read', { method: 'POST', body: JSON.stringify({ items, read }) }),
          // Drive status for an inbound item directed to this team. Body: { id, action, reason?, note? }.
          teamAction: (rec, action, reason, note, redirectTo) => apiFetch('/team-status', { method: 'POST', body: JSON.stringify({ id: rec.id, action, reason, note, redirectTo: redirectTo || '' }) }),
          // The raiser confirms a deployed bug fix. Body: { id }.
          confirm: (rec) => apiFetch('/confirm', { method: 'POST', body: JSON.stringify({ id: rec.id }) }),
          // Raiser reopens a deployed fix — the Worker sends it back to Builder as TBI. Body: { id, reason, note }.
          reopenFix: (rec, reason, note) => apiFetch('/reopen-fix', { method: 'POST', body: JSON.stringify({ id: rec.id, reason, note }) }),
          // Content re-raises a reopened ticket. Contract body: { id }.
          resubmit: (rec) => apiFetch('/resubmit', { method: 'POST', body: JSON.stringify({ id: rec.id }) }),
          // Revoke (soft delete) — the raising team retracts its own comment. Body: { id, path }.
          // 5.0: `url` rides along with `path` so the write resolves on the raising origin.
          revoke: (rec) => apiFetch('/revoke', { method: 'POST', body: JSON.stringify({ id: rec.parentId || rec.id, path: rec.page.path, url: rec.page.url }) }),
          // Delete a single quick question the team authored (worker enforces reply+ownership). Body: { id, path }.
          delReply: (reply) => apiFetch('/delete', { method: 'POST', body: JSON.stringify({ id: reply.id, path: reply.page.path, url: reply.page.url }) }),
          // A reply is POST /comments with a parentId — the Worker skips the ticket/arrival
          // notif and fires a kind:'reply' notification to the other side (contract §4).
          reply: (root, text) => apiFetch('/comments', { method: 'POST', body: JSON.stringify({
            parentId: root.parentId || root.id, comment: text, team: team(), toTeam: root.toTeam || '',
            page: root.page, anchor: root.anchor || {},
          }) }),
          // Saved views — GET returns the caller's set, POST replaces it (Feature 11).
          getViews: () => apiFetch('/views'),
          saveViews: (views) => apiFetch('/views', { method: 'POST', body: JSON.stringify({ views }) }),
          // Screenshot dataURL by id (Feature 4).
          image: (id) => apiFetch('/image?id=' + encodeURIComponent(id)),
        };

    // ---- helpers ----
    const $ = (s) => document.querySelector(s);
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
    // "11:11:53 | 14 July, 2026" — the rail timestamp format (per the Figma card).
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmtTimeDate = (iso) => {
      try {
        const d = new Date(iso);
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} | ${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
      } catch { return String(iso || ''); }
    };

    // ---- change-type vocab (Feature 1) — shared from config; `general` = no typed fields ----
    const typeMeta = (t) => COMMENT_TYPES.find((x) => x.value === t) || null;
    // Every card carries a change-type chip — `general` (the freeform default) shows "General"
    // too, so the category band is present at all times; unknown/missing types fall back to it.
    const typeLabel = (c) => { const m = typeMeta((c && c.commentType) || 'general'); return m ? m.label : ''; };
    const fieldsFor = (t) => (TYPE_FIELDS[t] || []);
    // The one-line preview: the record's server-rendered summary, else derived locally.
    const summaryOf = (c) => c.summary || renderSummary(c.commentType || 'general', c.templateFields || {}, c.comment || '');
    // The reopen label the RAISER sees (enum label; falls back to any legacy free-text reason).
    const reopenLabelOf = (c) => reopenReasonLabel(c && c.reopenReason) || (c && c.reopenReason) || '';
    // A single detail field row (shared by renderDetail + typedFieldRows).
    const fieldRow = (k, vHtml) => `<div class="pk-field"><div class="pk-field-k">${k}</div><div class="pk-field-v">${vHtml}</div></div>`;
    // Typed template-field rows for the detail (labelled rows, NEVER raw JSON; §3).
    function typedFieldRows(c) {
      const t = c.commentType || 'general';
      if (t === 'general') return '';
      const tf = c.templateFields || {};
      return fieldsFor(t).map((f) => {
        const v = tf[f.key];
        if (v == null || String(v).trim() === '') return '';
        return fieldRow(esc(f.label), esc(v));
      }).join('');
    }

    // ---- screenshot thumbnails (Feature 4) — thin-infra: fetch the dataURL by id and
    // fill the placeholder in place. ANY miss/failure ⇒ a "preview unavailable" tile
    // (a screenshot never blocks anything). Marked data-hydrated so a poll re-render
    // that re-emits the same markup doesn't re-fetch.
    async function loadImage(imageId) {
      if (!imageId) return '';
      try { const j = await store.image(imageId); return (j && j.dataUrl) || ''; }
      catch { return ''; }
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
    // A thumbnail tile (small on cards, large in detail). Empty imageId ⇒ nothing.
    const thumbTile = (imageId, big) => imageId
      ? `<span class="pk-thumb${big ? ' pk-thumb-lg' : ''}" data-imgid="${esc(imageId)}"><span class="pk-thumb-ph">preview…</span></span>`
      : '';
    // Display context line (screen resolution + display scale). The browser can't split OS scaling
    // from browser zoom, so `dpr` is the combined value — labelled as such.
    const displayText = (d) => !d ? '—' :
      `Screen ${d.physW || '?'}×${d.physH || '?'} px (${d.screenW || '?'}×${d.screenH || '?'} CSS) · ` +
      `Display scale ${d.dpr || '?'}× (OS scaling × browser zoom) · Viewport ${d.viewportW || '?'}×${d.viewportH || '?'}`;

    // ---- the real-time status, framed for the RAISER (Content): everything Content
    // submitted sits "with builder" until it goes live or is bounced back. ----
    const TEAM_STATUS = {
      to_be_initiated: ['tbi', 'With builder – TBI'],
      in_progress: ['inprog', 'With builder – in progress'],
      deployed_live: ['deployed', 'Deployed – Pending Confirmation'],
      reopened: ['reopened', 'Reopened'],
      disregarded: ['disregarded', 'Invalid — Closed'],
      needs_clarification: ['clarify', 'Need Clarity'],
    };
    const teamStatusOf = (c) => (TEAM_STATUS[c && c.teamStatus] ? c.teamStatus : 'to_be_initiated');
    // A confirmed deployed fix shows as its own terminal "Bug Closed" state — a display overlay on
    // deployed_live (the raiser has signed off), not a real teamStatus. [cssClass, label].
    const VERIFIED = ['verified', 'Bug Closed'];
    // Revoked wins over teamStatus: the record keeps whatever status it held when it was pulled back
    // (usually to_be_initiated), so reading the status alone renders a withdrawn item as live work.
    const REVOKED = ['disregarded', 'Revoked'];
    const isVerified = (c) => teamStatusOf(c) === 'deployed_live' && !!(c && c.bugFixConfirmed);
    const statusPair = (c) => (c && c.revoked) ? REVOKED : (isVerified(c) ? VERIFIED : TEAM_STATUS[teamStatusOf(c)]);
    const dataState = (c) => statusPair(c)[0];
    const statusLabel = (c) => statusPair(c)[1];
    // Phase 6: auto-verify badge (mirrors the builder) — shows the /verify result on copy/link fixes.
    const verifChip = (c) => {
      const v = c && c.verification; if (!v || !v.status) return '';
      // Colour is a modifier class, not `style=` — the host CSP (`style-src 'self'`) drops attributes.
      const map = { verified: '✓ Auto-verified', mismatch: '⚠ Content mismatch', unreachable: 'Verify: unreachable' };
      const m = map[v.status]; if (!m) return '';
      return ` <span class="pk-status-chip pk-status-chip--${v.status}" title="${esc(v.found || '')}">${m}</span>`;
    };
    const statusChip = (c) => { const [cls, label] = statusPair(c); return `<span class="pk-status-chip ${cls}">${label}</span>` + verifChip(c); };

    // Team chip colour derived from the team's identity hue (mirrors Dashboard.astro).
    const mix = (a, b, t) => {
      const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
      const ch = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
      return '#' + ch(ar, br) + ch(ag, bg) + ch(ab, bb);
    };
    const isLight = () => document.documentElement.getAttribute('data-pk-theme') === 'light';
    const tokenHex = (name, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; } catch { return fb; } };
    const teamStyle = (t) => {
      const tc = TEAM_COLORS[t] || ['#e8e8e8', '#888'];
      const white = tokenHex('--pk-on-accent', '#ffffff');
      if (isLight()) return { bg: tc[0], fg: tc[1], bd: mix(tc[1], white, 0.62) };
      const canvas = tokenHex('--pk-canvas', '#181818');
      const accent = tc[1];
      return { bg: mix(accent, canvas, 0.82), fg: mix(accent, white, 0.55), bd: mix(accent, canvas, 0.5) };
    };
    const teamChip = (t) => {
      if (!t) return '';
      const slug = TEAM_COLORS[t] ? t.toLowerCase() : 'none';
      return `<span class="pk-team-chip pk-team-chip--${slug}">${esc(t)}</span>`;
    };

    // ---- ticket-chain (iteration) model ----
    // A resubmit sub-ticket AND a comment reply both carry a parentId → the origin root id.
    // They are told apart by iteration: a reply is iteration 1 (parentId set), a sub-ticket
    // is iteration ≥ 2. Iteration members = the origin root + its resubmit sub-tickets; the
    // LIVE record of a chain is the highest-iteration member (its teamStatus is "now").
    const isReply = (c) => !!c.parentId && (c.iteration || 1) < 2;
    const chainOf = (c) => c.parentId || c.id; // origin root id for the whole family
    // The chain's ORIGIN root record — where read-state (and replies) live. A resubmitted ticket's
    // live card is a sub-ticket, so read/unread must key off the origin, not the displayed card.
    const threadOrigin = (r) => comments.find((x) => x.id === chainOf(r)) || r;
    // The on-page pin number = the per-page sequence stored on the chain's ORIGIN root (the record
    // that carries the pin); a resubmit sub-ticket inherits it via the origin. '' when unknown
    // (legacy pre-pageSeq records). Same value the pin marker + popover show, so it cross-references.
    const pinNoOf = (rec) => { const o = comments.find((x) => x.id === chainOf(rec)); return o && o.pageSeq ? o.pageSeq : ''; };

    // The AI change-prompt (falls back to a deterministic instruction if not ready yet).
    function localPrompt(c) {
      if (c.aiPrompt) return c.aiPrompt;
      const a = c.anchor || {};
      const where = a.snippet ? `the “${a.snippet}” ${a.tag || 'element'}` : (a.tag || 'the element');
      let s = `On page ${c.page.path}, in ${where}: ${c.comment}`;
      if (c.changeTo) s += `\nChange the content to exactly (preserve casing/punctuation): “${c.changeTo}”`;
      return s;
    }
    async function copyToClip(text, btn, ok) {
      try {
        await navigator.clipboard.writeText(text);
        if (btn) { const t = btn.textContent; btn.textContent = ok || 'Copied ✓'; setTimeout(() => { btn.textContent = t; }, 1400); }
      } catch (e) { pkAlert('Copy failed — ' + e.message); }
    }
    // Human label for one history event (Content framing).
    function eventLabel(h) {
      const e = h.event || '', st = h.status || '';
      if (e === 'created') return 'Raised';
      if (e === 'edited') return 'Edited' + (h.by ? ' by ' + h.by : '');
      if (e === 'resubmitted' || e === 'resubmit') return 'Resubmitted for another pass';
      if (e === 'team-reset' || e === 'reset') return 'Moved back to TBI';
      if (e === 'team-start' || e === 'start' || st === 'in_progress') return 'Builder started — in progress';
      if (e === 'confirmed') return 'Bug Closed — fix confirmed';
      if (h.redirectTo) return 'Completed' + (h.by ? ' by ' + h.by : '') + ' — redirected to ' + h.redirectTo + ' (TBI)';
      if (e === 'team-complete' || e === 'complete' || st === 'deployed_live') return 'Deployed Live';
      if (e === 'team-reopen' || e === 'reopen' || st === 'reopened') {
        const label = reopenReasonLabel(h.reason) || h.reason || '';
        return 'Reopened by Builder' + (label ? ' — ' + label : '') + (h.note ? ' (' + h.note + ')' : '');
      }
      if (e === 'team-disregard' || e === 'disregard' || st === 'disregarded') {
        return 'Closed as invalid finding by Builder' + (h.note ? ' — ' + h.note : '');
      }
      if (e === 'team-clarify' || e === 'clarify' || st === 'needs_clarification') {
        return 'Need Clarity' + (h.note ? ' — ' + h.note : '');
      }
      return 'Status → ' + (st || '');
    }

    // ---- state ----
    let comments = [], notes = [], view = 'queue', filter = 'all', byPage = false;
    // Unified "My Tickets" model (mirrors the admin Queue): direction is a control, status is a
    // chip row, and density flips cards ⇄ the full ledger. `filter` is retained only for the now-
    // dormant per-view renderers (renderComments/renderActive) kept for deep-link/landing safety.
    let dir = 'outbound';         // teams default to Outbound (items they raised); 'inbound' = directed to me
    let statusFilter = 'open';    // status chip: open | needsyou | <status> | verified | all | revoked
    let statusMoreOpen = false;   // "More" overflow drawer open
    let density = 'cards';        // cards | table (full ledger of all my tickets)
    let settingsSection = 'appearance'; // active tab in the Settings view (appearance | about)
    const STATUS_CHIPS = [
      { f: 'needsyou', label: 'Needs You', primary: true, smart: true },
      { f: 'open', label: 'Open', primary: true },
      { f: 'deployed_live', label: 'Deployed', primary: true },
      { f: 'to_be_initiated', label: 'With Builder', primary: false },
      { f: 'in_progress', label: 'In Progress', primary: false },
      { f: 'reopened', label: 'Reopened', primary: false },
      { f: 'needs_clarification', label: 'Need Clarity', primary: true },
      { f: 'all', label: 'All', primary: false },
      { f: 'verified', label: 'Bug Closed', primary: false },
      { f: 'revoked', label: 'Revoked', primary: false },
    ];
    // Density persists per browser (teamdash has no full prefs store — a single key suffices).
    const DENSITY_KEY = 'tmdDensity';
    const saveDensity = () => { try { localStorage.setItem(DENSITY_KEY, density); } catch {} };
    try { const d = localStorage.getItem(DENSITY_KEY); if (d === 'cards' || d === 'table') density = d; } catch {}
    // Detail-view: which collapsible side cards are folded (per browser), mirroring the builder's.
    const DCOL_KEY = 'tmdDetailCollapsed';
    let detailCollapsed = {};
    try { detailCollapsed = JSON.parse(localStorage.getItem(DCOL_KEY) || '{}') || {}; } catch {}
    const saveDcol = () => { try { localStorage.setItem(DCOL_KEY, JSON.stringify(detailCollapsed)); } catch {} };
    let search = '', sort = 'new', fromFilter = '', entryDetail = null;

    /* ---- URL as state: real paths under /proofkit/team ------------------------------------
     *   /proofkit/team                    the queue (home)
     *   /proofkit/team/tickets/<number>   a ticket, by its HUMAN ticket number
     *   /proofkit/team/notifications · /threads · /settings
     *
     * Mirrors the Builder exactly, one level down. The admin's `?team=` preview override is a
     * QUERY param and is deliberately preserved on every write — it selects whose board this is,
     * which is orthogonal to where in the board you are.
     *
     * Legacy `?detail=` / `?ticket=` links are accepted and normalised into a path.
     * -------------------------------------------------------------------------------------- */
    function ticketNoOf(id) {
      const r = comments.find((x) => x.id === id);
      return (r && r.ticket) ? String(r.ticket) : id;
    }
    function idOfTicketNo(no) {
      if (!no) return '';
      const byTicket = comments.find((x) => String(x.ticket || '') === String(no));
      return byTicket ? byTicket.id : no;
    }
    function readUrl() {
      let segs = [];
      try { segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean); } catch { return { view: '', ticket: '' }; }
      const rest = segs.slice(BASE.split('/').filter(Boolean).length + 1);
      let q = null;
      try { q = new URLSearchParams(location.search); } catch {}
      const legacy = q ? (q.get('ticket') || q.get('detail') || '') : '';
      if (legacy) return { view: '', ticket: legacy };
      if (!rest.length) return { view: '', ticket: '' };
      if (rest[0] === 'tickets') return { view: '', ticket: rest[1] || '' };
      return { view: SEGMENT_VIEWS[rest[0]] || '', ticket: '' };
    }
    /** The identity segment currently in the address bar ('' if none). */
    function slugInUrl() {
      try {
        const segs = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
        return segs[BASE.split('/').filter(Boolean).length] || '';
      } catch { return ''; }
    }
    /* This board's root. It follows the URL's identity, not the session's, so an ADMIN previewing
     * /proofkit/content keeps writing /proofkit/content — the preview stays on the board it opened
     * instead of silently rewriting itself to the admin's own slug. guardBoardIdentity() below is
     * what makes that safe: a non-admin can never be on someone else's slug in the first place. */
    const myBase = () => BASE + '/' + (slugInUrl() || teamSlug(team() || ''));
    function pathFor(v, detailId) {
      if (detailId) return myBase() + '/tickets/' + encodeURIComponent(ticketNoOf(detailId));
      const seg = VIEW_SEGMENTS[v];
      return seg ? myBase() + '/' + seg : myBase();
    }
    function syncUrl(replace) {
      try {
        const next = pathFor(view, entryDetail);
        if (next === location.pathname + location.search) return;
        history[replace ? 'replaceState' : 'pushState'](null, '', next);
      } catch (e) {}
    }
    function setDetail(id, replace) { entryDetail = id || null; syncUrl(replace); render(); }

    let landed = false; // set once we've landed on the first visible tab (post first load)
    let lastSig = '';   // signature of the last-rendered data — lets polling skip no-op re-renders
    // Phase 3.1: last ETag seen per endpoint, sent back as If-None-Match. Both gate on the same
    // `team:<name>` scope so the values track each other — kept separate anyway, since one endpoint
    // 304ing while the other 200s is a legitimate interleaving, not a bug to paper over.
    let lastCommentsEtag = '', lastNotifsEtag = '';
    // By Page: per-page expand/collapse state (persisted; a collapsed page hides its cards).
    const COLLAPSE_KEY = 'teamCollapsedPages';
    const collapsedPages = (() => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch (e) { return new Set(); } })();
    const saveCollapsed = () => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsedPages])); } catch (e) {} };
    // Feature 11 (Team views): the team's shared saved filter sets, loaded once.
    let savedViews = [], activeViewName = '', viewsLoaded = false;
    const dataSig = () => JSON.stringify([comments, notes]);

    // Iteration members of a chain (root + resubmit sub-tickets), oldest→newest by iteration.
    function chainMembers(rec) {
      const cid = chainOf(rec);
      return comments.filter((c) => !isReply(c) && chainOf(c) === cid)
        .sort((a, b) => (a.iteration || 1) - (b.iteration || 1) || (a.createdAt < b.createdAt ? -1 : 1));
    }
    // The LIVE record per chain (highest iteration) — one card per ticket family.
    function families() {
      const byChain = new Map();
      for (const c of comments) {
        if (isReply(c)) continue;
        const cid = chainOf(c);
        const prev = byChain.get(cid);
        if (!prev || (c.iteration || 1) > (prev.iteration || 1)) byChain.set(cid, c);
      }
      return [...byChain.values()];
    }
    const roots = () => families();
    // Stats-only view of the queue, mirroring dashboard.js: a smoke-test ticket stays VISIBLE in the
    // lists (so it can be found and deleted) but never contributes to a metric tile — deleting one
    // therefore leaves the numbers untouched. Without this the team tiles counted test tickets.
    const statRoots = () => families().filter((c) => !c.isTest);
    // Comment replies threaded under a chain (iteration 1, parentId set).
    const repliesOf = (rec) => comments.filter((c) => isReply(c) && chainOf(c) === chainOf(rec)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    // The full iteration timeline: every iteration member's history, merged + time-sorted.
    function chainHistory(rec) {
      const evs = [];
      for (const m of chainMembers(rec)) {
        (Array.isArray(m.history) ? m.history : []).forEach((h) => evs.push({ ...h, iteration: h.iteration || m.iteration || 1 }));
      }
      if (!evs.length) evs.push({ at: rec.createdAt, event: 'created', iteration: rec.iteration || 1 });
      return evs.sort((a, b) => (a.at < b.at ? -1 : 1));
    }
    const unreadNotes = () => notes.filter((n) => n.readTeam === false);

    function matchesSearch(c) {
      if (!search) return true;
      const a = c.anchor || {};
      const tf = c.templateFields || {};
      return [c.comment, c.changeTo, c.summary, c.expectedOutcome, c.page && c.page.path, c.name, c.team,
        c.reopenReason, reopenLabelOf(c), c.reopenNote, a.snippet, a.tag, ...Object.values(tf)]
        .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
    }
    function matchesNoteSearch(n) {
      if (!search) return true;
      return [n.summary, n.path, pageName(n.path || '/')]
        .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
    }
    function sortRoots(rs) {
      const s = rs.slice();
      if (sort === 'old') s.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      // 5.0: sort on host+path so each origin forms a contiguous block (see dashboard.js).
      else if (sort === 'page') s.sort((a, b) => pageGroupKey(a.page).localeCompare(pageGroupKey(b.page)) || (a.createdAt < b.createdAt ? 1 : -1));
      else s.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest
      return s;
    }
    // COMPLETED tab — everything Content submitted that is still in flight or live
    // (to_be_initiated / in_progress / deployed_live). Reopened items drop OUT to Active.
    // Completed sub-filters. A deployed fix splits into "Deployed live" (awaiting the raiser's
    // confirmation) and "Verified" (raiser confirmed). "Pending Confirmation" is the actionable
    // slice — deployed + unconfirmed + raised by ME — and is the default landing tab.
    const isDeployedUnconfirmed = (c) => teamStatusOf(c) === 'deployed_live' && !c.bugFixConfirmed;
    const isVerifiedFix = (c) => teamStatusOf(c) === 'deployed_live' && !!c.bugFixConfirmed;
    const isPendingMine = (c) => isDeployedUnconfirmed(c) && (c.team || '') === team();
    function completedRoots() {
      let rs = roots().filter((c) => teamStatusOf(c) !== 'reopened' && teamStatusOf(c) !== 'needs_clarification' && !c.revoked);
      if (filter === 'pending_confirmation') rs = rs.filter(isPendingMine);
      else if (filter === 'to_be_initiated') rs = rs.filter((c) => teamStatusOf(c) === 'to_be_initiated');
      else if (filter === 'in_progress') rs = rs.filter((c) => teamStatusOf(c) === 'in_progress');
      else if (filter === 'deployed_live') rs = rs.filter(isDeployedUnconfirmed);
      else if (filter === 'verified') rs = rs.filter(isVerifiedFix);
      if (fromFilter) rs = rs.filter((c) => (c.team || '') === fromFilter);
      return sortRoots(rs.filter(matchesSearch));
    }
    // TEAM QUEUE — the team's live working set: every ticket still OPEN, i.e. in a
    // non-terminal iteration (with Builder as TBI / in progress, or reopened and awaiting
    // resubmit). Deployed-live items drop OUT (they're done → Completed). The raiser-side
    // mirror of Builder's Team Queue. Honours the queue status sub-filter (all / TBI /
    // in-progress / reopened), from-team, search and sort.
    // Inbound = open items directed TO this team (To = me); Outbound = open items this team RAISED
    // and sent to another team (From = me). The from-team chip matches the counterparty: who SENT
    // it (From) on Inbound, who it was SENT TO (To) on Outbound.
    const isOutbound = () => dir === 'outbound';
    function queueRoots() {
      const out = isOutbound();
      const me = team();
      // needs_clarification is parked in its own bucket — out of the inbound/outbound queue.
      let rs = roots().filter((c) => teamStatusOf(c) !== 'deployed_live' && teamStatusOf(c) !== 'needs_clarification' && !c.revoked);
      rs = rs.filter((c) => out ? ((c.team || '') === me) : ((c.toTeam || '') === me));
      if (filter === 'to_be_initiated') rs = rs.filter((c) => teamStatusOf(c) === 'to_be_initiated');
      else if (filter === 'in_progress') rs = rs.filter((c) => teamStatusOf(c) === 'in_progress');
      else if (filter === 'reopened') rs = rs.filter((c) => teamStatusOf(c) === 'reopened');
      if (fromFilter) rs = rs.filter((c) => (out ? (c.toTeam || '') : (c.team || '')) === fromFilter);
      return sortRoots(rs.filter(matchesSearch));
    }
    // ACTIVE queue — items Builder bounced back (reopened) for Content to clarify + resubmit.
    function activeRoots() {
      let rs = roots().filter((c) => teamStatusOf(c) === 'reopened' && !c.revoked);
      if (fromFilter) rs = rs.filter((c) => (c.team || '') === fromFilter);
      return sortRoots(rs.filter(matchesSearch));
    }
    // The canonical (unfiltered) active set — drives the nav badge + counts.
    const reopenedRoots = () => roots().filter((c) => teamStatusOf(c) === 'reopened' && !c.revoked);
    // NEEDS CLARIFICATION bucket — every ticket this team is part of (raised OR directed to it)
    // that has been parked in needs_clarification. Its own left-nav tab, outside the queue.
    function clarifyRoots() {
      const me = team();
      const rs = roots().filter((c) => teamStatusOf(c) === 'needs_clarification' && !c.revoked &&
        ((c.team || '') === me || (c.toTeam || '') === me));
      return sortRoots(rs.filter(matchesSearch));
    }
    // Unfiltered count (nav badge) — independent of search/sort.
    const clarifyCount = () => roots().filter((c) => teamStatusOf(c) === 'needs_clarification' && !c.revoked &&
      ((c.team || '') === team() || (c.toTeam || '') === team())).length;
    // COMMENTS bucket — every ticket-chain (this team's) with ≥1 discussion reply, newest activity first.
    const lastActivity = (r) => { const rp = repliesOf(r); return (rp.length ? rp[rp.length - 1].createdAt : (r.teamStatusAt || r.createdAt)) || ''; };
    function threadRoots() {
      const rs = roots().filter((c) => !c.revoked && repliesOf(c).length > 0).filter(matchesSearch);
      return rs.sort((a, b) => (lastActivity(a) < lastActivity(b) ? 1 : -1));
    }
    const threadCount = () => roots().filter((c) => !c.revoked && repliesOf(c).length > 0).length;
    // Comments-tab unread (this team's copy) — drives the Mark-all-read control + per-item state.
    // Keyed off the chain ORIGIN (where read-state lives), not the displayed live card.
    const unreadThreads = () => threadRoots().filter((c) => threadOrigin(c).readTeam === false);

    // ---- Unified "My Tickets" roots (direction + status chip) — replaces the separate
    // queue / completed / active / clarify views with one filterable surface. ----
    // "Needs you" = the raiser/receiver's actionable slice: a fix awaiting your confirm, an item
    // parked for YOU to clarify, or one Builder bounced back for you to resubmit.
    const needsYou = (c) => {
      const s = teamStatusOf(c);
      return s === 'reopened' || (s === 'needs_clarification' && (c.toTeam || '') === team()) || isPendingMine(c);
    };
    function statusMatch(c, f) {
      const s = teamStatusOf(c);
      switch (f) {
        case 'all': return true;
        case 'open': return s === 'to_be_initiated' || s === 'in_progress' || s === 'reopened';
        case 'needsyou': return needsYou(c);
        case 'deployed_live': return isDeployedUnconfirmed(c); // deployed, awaiting the raiser's confirm
        case 'verified': return isVerifiedFix(c);              // deployed + confirmed
        case 'revoked': return true;                            // revoked set isolated upstream
        default: return s === f; // to_be_initiated | in_progress | reopened | needs_clarification
      }
    }
    // Direction-filtered pool (before the status chip) — inbound = directed to me, outbound = raised
    // by me; the from-team chip matches the counterparty (To on outbound, From on inbound).
    function directionRoots() {
      const out = isOutbound(), me = team();
      let rs = roots().filter((c) => out ? ((c.team || '') === me) : ((c.toTeam || '') === me));
      if (fromFilter) rs = rs.filter((c) => (out ? (c.toTeam || '') : (c.team || '')) === fromFilter);
      return rs.filter(matchesSearch);
    }
    function myRoots() {
      let rs = directionRoots().filter((c) => statusFilter === 'revoked' ? c.revoked : !c.revoked);
      rs = rs.filter((c) => statusMatch(c, statusFilter));
      return sortRoots(rs);
    }
    const statusCount = (f) => directionRoots().filter((c) => (f === 'revoked' ? c.revoked : !c.revoked) && statusMatch(c, f)).length;
    // The full ledger for the Table density — every ticket of mine (both directions, all statuses,
    // incl. revoked), honouring only the toolbar search.
    const ledgerRoots = () => {
      const me = team();
      return sortRoots(roots().filter((c) => (c.team || '') === me || (c.toTeam || '') === me).filter(matchesSearch));
    };

    // ---- data ----
    async function loadData() {
      // Feature 11: pull the team's saved "Team views" ONCE (not on every 5s poll).
      if (!viewsLoaded) { viewsLoaded = true; loadViews().then(() => renderViewChips()); }
      // Phase 3.1 conditional poll: a 304 costs no body and no D1 read, so an idle board is
      // near-free. `comments` is left exactly as it was on 304 — that is what makes the dataSig()
      // short-circuit below fire and skip the whole re-render. Falls back to the plain fetch if
      // the conditional path throws, so a Worker without D1 (ETags disabled) still works.
      try {
        const [r, rn] = await Promise.all([
          store.commentsEtag(lastCommentsEtag),
          store.notifsEtag(lastNotifsEtag),
        ]);
        if (!(r && r.notModified)) { comments = Array.isArray(r.data) ? r.data : []; lastCommentsEtag = r.etag || lastCommentsEtag; }
        if (!(rn && rn.notModified)) { notes = Array.isArray(rn.data) ? rn.data : []; lastNotifsEtag = rn.etag || lastNotifsEtag; }
      } catch (e) {
        if (e && e.message === 'unauthorized') throw e;
        const [c, n] = await Promise.all([store.comments(), store.notifs()]);
        comments = Array.isArray(c) ? c : [];
        notes = Array.isArray(n) ? n : [];
      }
      // Polling runs every ~5s; skip the whole re-render when the data is byte-identical
      // to what's already on screen. This stops the entry animation replaying (and the DOM
      // churn / scroll jump) on every idle poll — we only repaint when something actually changed.
      const sig = dataSig();
      if (landed && sig === lastSig) return;
      lastSig = sig;
      renderHeader(); counts();   // counts() → updateActiveBadge() toggles the Active tab's visibility
      // Land on the first VISIBLE tab on first load; thereafter only re-home if the
      // current tab has just been hidden (e.g. Active after its last item is resubmitted).
      const cur = document.querySelector('.pk-nav[data-view="' + view + '"]');
      // Landing on the first visible tab is not a navigation the user made — replace, so the
      // board does not open with a phantom history entry that Back would walk into.
      if (!landed || !cur || cur.hidden) { landed = true; setView(firstVisibleView(), true); }
      render();
    }
    // Poll on the shared ~5s debounced cadence (the Worker coalesces server-side).
    //
    // Phase 3.2: mirrors the Builder. While this team's SSE stream is up the hub carries the
    // changes, so the poll stretches from 30s to a 5-minute SAFETY NET rather than stopping —
    // a hub that goes quiet without dropping the socket must not be able to strand the board.
    // (Unlike the Builder this board has no conditional-GET poll yet, so the net is a full
    // fetch; at one every 5 minutes that is still far below the 30s it replaces.)
    const POLL_SECS = 30, SSE_NET_SECS = 300;
    let refreshTimer = null, sseUp = false, stopStream = null;
    function startAutoRefresh() {
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      const secs = sseUp ? SSE_NET_SECS : POLL_SECS;
      refreshTimer = setInterval(() => { if (!document.hidden) loadData().catch(() => {}); }, secs * 1000);
      if (!startAutoRefresh._focusBound) { window.addEventListener('focus', () => loadData().catch(() => {})); startAutoRefresh._focusBound = true; }
    }

    // Subscribe to THIS board's team scope. `team()` is the team on screen, which for an admin
    // previewing a board is the previewed team, not Builder — the worker lets an admin key
    // subscribe to any team scope, so the preview goes live too. Idempotent; null return
    // (local-demo, no key) leaves the unchanged poll as the only path, which is the fallback.
    function startLiveUpdates() {
      if (stopStream || LOCAL) return;
      const me = team();
      if (!me) return;
      stopStream = startScopeStream('team:' + me, {
        onChange: () => { if (!document.hidden) loadData().catch(() => {}); },
        onUp: () => { if (!sseUp) { sseUp = true; startAutoRefresh(); } },
        onDown: (fatal) => {
          if (sseUp) { sseUp = false; startAutoRefresh(); }
          if (fatal && stopStream) { stopStream = null; }   // browser will not retry; poll owns it now
        },
      });
    }
    function stopLiveUpdates() {
      if (stopStream) { stopStream(); stopStream = null; }
      if (sseUp) { sseUp = false; startAutoRefresh(); }
    }

    function renderHeader() {
      const h1 = document.querySelector('.pk-h1');
      if (h1) {
        const nm = team();
        // The team name is highlighted in brand red. When an admin (Builder) is viewing a
        // team board via OVERRIDE, a small red bold "(Unlocked)" sits bottom-right of the
        // name in place of the old full-width admin ribbon.
        // The team NAME is a route back to Builder: if this board is being viewed under a Builder
        // session (OVERRIDE) it returns to the admin dashboard; otherwise it offers the Builder
        // sign-in (?builder=1, which /reviewdash honours instead of bouncing back here).
        h1.innerHTML = nm
          ? `<button type="button" class="pk-h1-team pk-h1-teamlink" id="tmd-teamlink" title="${OVERRIDE ? 'Back to the Builder dashboard' : 'Log in as Builder'}">${esc(nm)}</button> Team` +
              (OVERRIDE ? ` <svg class="pk-h1-unlock" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Unlocked — admin full access"><rect x="3.5" y="11" width="17" height="10.5" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.6-1.9"/></svg>` : '')
          : 'Team';
      }
      const teamLink = document.getElementById('tmd-teamlink');
      if (teamLink) teamLink.addEventListener('click', () => {
        location.href = boardBase(ADMIN_TEAM) + (OVERRIDE ? '' : '?builder=1');
      });
      const badge = $('#tmd-navbadge');
      const u = unreadNotes().length;
      if (badge) { badge.textContent = u; badge.hidden = u === 0; }
    }

    // ---- Settings (team member) ------------------------------------------------
    // A focused personal-preferences pane — the non-admin subset of Builder's Settings,
    // built on the same global .pk-set-* component library. A team member controls their
    // own appearance (theme is LOCAL to this browser) and can review their session; the
    // global-theme / worker-health / team-key controls stay admin-only.
    function renderSettings() {
      const host = $('#tmd-view-settings');
      if (!host) return;
      const SECTIONS = [{ k: 'appearance', label: 'Appearance' }, { k: 'about', label: 'About' }];
      if (!SECTIONS.some((s) => s.k === settingsSection)) settingsSection = 'appearance';

      // shared row/card builders (mirror Builder's, minus the pref-store plumbing)
      const row = (label, desc, ctl) => `<div class="pk-set-row"><div class="pk-set-row-main"><div class="pk-set-row-label">${label}</div>${desc ? `<div class="pk-set-row-desc">${desc}</div>` : ''}</div><div class="pk-set-ctl">${ctl}</div></div>`;
      const card = (title, sub, rowsHTML) => `<section class="pk-set-card"><header class="pk-set-card-h"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</header><div class="pk-set-card-b">${rowsHTML}</div></section>`;
      const actBtn = (act, label, cls) => `<button class="pk-a${cls ? ' ' + cls : ''}" type="button" data-act="${act}">${esc(label)}</button>`;
      const kbd = (k) => `<kbd class="pk-set-kbd">${k}</kbd>`;

      let panel = '';
      if (settingsSection === 'appearance') {
        const light = getTheme() === LIGHT_THEME;
        // Overlay style, the team-side twin of Builder's card. Builder sets the shared
        // default for everyone; this picks the overlay THIS browser reviews in, so a team
        // switching never moves anyone else's page (the worker write stays admin-only).
        const ovMine = getOverlayUiOverride();
        const ovNew = getOverlayUi() === 'new';
        panel =
          card('Theme', 'Light or dark — your own preference, saved to this browser.',
            row('Color mode', `Currently <b>${light ? 'Light' : 'Dark'}</b>. Switches your skin only — no other team sees it.`, `<span data-pk-set-theme></span>`)) +
          card('Overlay UI', 'The on-page review overlay ONLY — your board is unaffected. Saved to this browser, so only the pages YOU review change.',
            row('Overlay style', `Currently <b>${ovNew ? 'New (HUD)' : 'Old (box)'}</b>${ovMine ? '' : ', following the team default'}. New is the full-screen review HUD; Old is the classic pop-up box on the live page.`,
              `<div class="pk-set-seg" role="group">` +
                `<button class="pk-set-segbtn${ovNew ? '' : ' is-active'}" type="button" data-overlayui="old">Old</button>` +
                `<button class="pk-set-segbtn${ovNew ? ' is-active' : ''}" type="button" data-overlayui="new">New</button>` +
              `</div>` +
              (ovMine ? ' ' + actBtn('overlayui-default', 'Use default', 'pk-a--quiet') : ''))) +
          card('Layout', 'How your ticket list is shown.',
            row('Default density', 'Cards is roomy; Table is the full ledger. Also on the My Tickets toolbar.',
              `<div class="pk-set-seg" role="group">` +
                `<button class="pk-set-segbtn${density === 'cards' ? ' is-active' : ''}" type="button" data-set-den="cards">Cards</button>` +
                `<button class="pk-set-segbtn${density === 'table' ? ' is-active' : ''}" type="button" data-set-den="table">Table</button>` +
              `</div>`));
      } else {
        /* No Teams card here. It listed every team in the project and which were switched off —
         * which is the Builder's business, not a reviewer's. It told a member of one team nothing
         * they could act on, and told them the shape of the whole organisation to do it. It lives
         * on the Builder board, where the person reading it is the person who sets it. */
        panel =
          card('Proofkit', 'Portable content-review tooling.',
            row('Version', 'This dashboard build.', `<span class="pk-set-pill">v${PK_VERSION}</span>`) +
            row('Signed in as', 'Your current team session.', `<span class="pk-set-pill">${esc(team() || 'team')}</span>`)) +
          card('Keyboard shortcuts', 'While a ticket detail or reply box is open.',
            row('Post reply / question', 'Send without reaching for the mouse.', `${kbd('⌘/Ctrl')} ${kbd('Enter')}`) +
            row('Close / dismiss', 'Back out of a detail or overlay.', kbd('Esc'))) +
          card('Session', '', row('Log out', 'End this session on this browser.', actBtn('logout', 'Log out', 'danger')));
      }

      host.innerHTML =
        `<div class="pk-set-head"><h2 class="pk-h2">Settings</h2>` +
          `<p class="pk-set-sub">Your personal preferences. Everything here is saved to <b>this browser</b> only.</p></div>` +
        `<div class="pk-set">` +
          `<nav class="pk-set-nav" role="tablist">` +
            SECTIONS.map((s) => `<button class="pk-set-tab${s.k === settingsSection ? ' is-active' : ''}" role="tab" aria-selected="${s.k === settingsSection}" data-sec="${s.k}">${s.label}</button>`).join('') +
          `</nav>` +
          `<div class="pk-set-panel">${panel}</div>` +
        `</div>`;

      // Wire the theme toggle into its slot (guards against a double-mount internally).
      mountThemeToggle('[data-pk-set-theme]');

      // Delegated click handler — attach ONCE (the host element persists across re-renders).
      if (!host.dataset.wired) {
        host.dataset.wired = '1';
        host.addEventListener('click', async (e) => {
          const tab = e.target.closest('.pk-set-tab');
          if (tab) { settingsSection = tab.dataset.sec; renderSettings(); return; }
          const den = e.target.closest('[data-set-den]');
          if (den) { if (density !== den.dataset.setDen) { density = den.dataset.setDen; saveDensity(); syncDensToggle(); } renderSettings(); return; }
          // Overlay style: this browser's own pick (or back to the shared default). Local
          // only — the overlay reads it the next time this user arms review mode.
          const ov = e.target.closest('[data-overlayui]');
          if (ov) { setOverlayUiOverride(ov.dataset.overlayui === 'new' ? 'new' : 'old'); renderSettings(); return; }
          const act = e.target.closest('[data-act]');
          if (act && act.dataset.act === 'overlayui-default') { setOverlayUiOverride(''); renderSettings(); return; }
          if (act && act.dataset.act === 'logout') {
            if (!(await pkConfirm({ title: 'Log out', message: 'Log out of Proofkit?', confirmLabel: 'Log out' }))) return;
            stopLiveUpdates();   // the SSE socket is authenticated — it goes with the session
            if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }  // after: stopLiveUpdates re-arms the poll
            clearSession(); showLogin();
          }
        });
      }
    }

    // A status-token dot (STATUS_COLORS: teamStatus → --pk-* token) leading a count tile.
    // Colour via modifier class, not `style=` — the host CSP (`style-src 'self'`) drops style
    // attributes, which rendered these dots invisible. Classes live in design/components.css.
    const statusDot = (s) => `<span class="pk-count-dot pk-count-dot--${s}"></span>`;
    function counts() {
      const rs = statRoots().filter((c) => !c.revoked); // revoked items aren't live work; test tickets aren't a metric
      // "With builder" means exactly what it says: TBI + in-progress sitting with the BUILDER.
      // Direction, not authorship — an item directed to another team is that team's work, not the
      // builder's, and must not inflate this tile. No raising-team filter: whoever raised it, if
      // it is with the builder it counts. (`toTeam` empty = Builder, the codebase-wide default.)
      const withBuilder = (c) => (c.toTeam || ADMIN_TEAM) === ADMIN_TEAM;
      const inFlight = rs.filter((c) => withBuilder(c) && (teamStatusOf(c) === 'to_be_initiated' || teamStatusOf(c) === 'in_progress')).length;
      const live = rs.filter((c) => teamStatusOf(c) === 'deployed_live').length;
      // Pending Signoff = deployed but not yet confirmed from this team's end — the fixes I raised
      // that are live and awaiting my sign-off (mirror of the Deployed chip on My Tickets). The
      // tile is a shortcut into that exact slice (Outbound → Deployed).
      const pending = rs.filter(isPendingMine).length;
      const el = $('#tmd-counts');
      if (el) el.innerHTML =
        `<span class="pk-count pk-count-inprog"><b>${inFlight}</b><span class="pk-count-lbl">${statusDot('in_progress')}With builder</span></span>` +
        `<span class="pk-count pk-count-done"><b>${live}</b><span class="pk-count-lbl">${statusDot('deployed_live')}Deployed live</span></span>` +
        `<button type="button" class="pk-count pk-count-reopened pk-count-btn" data-goto-deployed aria-label="Pending Signoff — ${pending} deployed ${pending === 1 ? 'fix' : 'fixes'} awaiting your confirmation; view them"><b>${pending}</b><span class="pk-count-lbl">${statusDot('reopened')}Pending Signoff</span></button>`;
      updateActiveBadge();
      updateClarifyBadge();
      updateThreadsBadge();
    }
    // The Needs Clarification nav badge — count of parked items involving this team.
    function updateClarifyBadge() {
      const n = clarifyCount();
      const b = $('#tmd-badge-clarify');
      if (b) { b.textContent = n; b.hidden = n === 0; }
    }
    // The Comments nav badge — count of this team's ticket-chains with a discussion thread.
    function updateThreadsBadge() {
      const n = threadCount();
      const b = $('#tmd-badge-threads');
      if (b) { b.textContent = n; b.hidden = n === 0; }
    }
    // The Active (bounceback) category only exists when Builder has reopened something.
    // Hide the whole nav tab — indication and all — when the queue is empty; show it
    // (with its live count) the moment an item is bounced back.
    function updateActiveBadge() {
      const n = reopenedRoots().length;
      const b = $('#tmd-badge-delivery');
      if (b) { b.textContent = n; b.hidden = n === 0; }
      const navBtn = $('.pk-nav[data-view="delivery"]');
      if (navBtn) navBtn.hidden = n === 0;
    }

    // The reopen band on an Active card: Builder's reason + a Resubmit action. Content can
    // clarify in context via "Open Pin" (the on-page overlay is the add/edit surface), then
    // resubmit to spawn the next iteration back into Builder's queue.
    // The reopen band (Feature 3): a "Reopened: <label>" badge with the enum reason +
    // Builder's note, both visible to the raiser, and the Resubmit action.
    function reopenBand(root) {
      const id = esc(root.id);
      const label = reopenLabelOf(root);
      const note = (root.reopenNote || '').trim();
      return `<div class="tmd-ack">` +
        `<div class="tmd-ack-main">` +
          `<span class="tmd-ack-lbl"><span class="pk-reopen-badge">Reopened${label ? ': ' + esc(label) : ''}</span> by <b>${esc(root.toTeam || 'Builder')}</b></span>` +
          (note ? `<span class="tmd-ack-note">“${esc(note)}”</span>` : '') +
        `</div>` +
        `<span class="tmd-ack-btns">` +
          `<button type="button" class="tmd-ack-btn tmd-ack-conclude" data-resubmit="${id}">Resubmit</button>` +
        `</span>` +
      `</div>`;
    }

    // The clarification band on a parked (needs_clarification) card — shows who asked and the
    // question. No inline action: the receiver resumes via the ⋮ menu; the raiser replies in the
    // detail thread. Reuses the reopen band's `.tmd-ack` styling.
    function clarifyBand(root) {
      const note = (root.clarifyNote || '').trim();
      const by = (root.toTeam || 'Builder');
      return `<div class="tmd-ack tmd-ack--clarify">` +
        `<div class="tmd-ack-main">` +
          `<span class="tmd-ack-lbl"><span class="pk-reopen-badge pk-reopen-badge--clarify">Need Clarity</span> from <b>${esc(by)}</b></span>` +
          (note ? `<span class="tmd-ack-note">“${esc(note)}”</span>` : '') +
        `</div>` +
      `</div>`;
    }

    // Queue/Completed card — the SHARED Figma card (./card.js + ./card.css, `.pkc-*`), same
    // as the admin dashboard. The team's role slots: Open Pin + a "View details" hint (the
    // team doesn't action tickets — Builder does, so no lifecycle buttons / ⋮ menu), and the
    // reopen band as the after-change-to block when Builder has bounced an item back.
    /* Bulk select. The shared card renderer has always accepted `selectSlot` and `extraClass`;
     * the team board simply never passed them, so the Builder had bulk actions and a team did
     * the same work one card at a time. Every action offered here is one a team can already
     * perform on a single ticket — doing ten at once is a speed difference, never a permission
     * one — so nothing about who-may-do-what changes. */
    let selectMode = false;
    const sel = new Set();

    const card = createCardRenderer({
      esc, fmt, teamStyle, thumbTile, pageName, repliesOf, typeLabel,
      displayState: dataState,
      statusText: statusLabel,
      selectSlot: (root) => (selectMode
        ? `<label class="pkc-sel-wrap"><input type="checkbox" class="pkc-sel" data-id="${esc(root.id)}"` +
          `${sel.has(root.id) ? ' checked' : ''} aria-label="Select ticket"></label>`
        : ''),
      extraClass: (root) => ((selectMode && sel.has(root.id)) ? ' is-selected' : ''),
      actionsSlot: (root) => {
        const id = esc(root.id);
        const canRevoke = (root.team || '') === team();  // a team may revoke only what IT raised
        const amReceiver = (root.toTeam || '') === team(); // items directed to me — I can clarify / resume
        // The raiser confirms a deployed fix: "Confirm Bug Fix" REPLACES "View details" until confirmed.
        const canConfirm = (root.team || '') === team() && teamStatusOf(root) === 'deployed_live' && !root.bugFixConfirmed;
        const primaryBtn = canConfirm
          ? `<button type="button" class="pkc-btn pkc-btn-confirm" data-confirmfix="${id}">Confirm Bug Fix</button>`
          : `<button type="button" class="pkc-btn" data-viewdetails="${id}">View details</button>`;
        // When the raiser can confirm, they can also REOPEN (reject) the deployed fix — the 3rd CTA.
        const reopenBtn = canConfirm ? `<button type="button" class="pkc-btn pkc-btn-reopen" data-reopenfix="${id}">Reopen</button>` : '';
        return `<a class="pkc-btn" href="${esc(root.page.path)}?review=1#c=${id}" target="_blank" rel="noopener">Open Pin</a>` +
          primaryBtn + reopenBtn +
          ((canRevoke || amReceiver) ? `<button class="pkc-more" type="button" data-more="${id}" aria-label="More actions" aria-haspopup="menu">` +
            `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>` +
          `</button>` : '');
      },
      extraSlot: (root) => teamStatusOf(root) === 'reopened' ? reopenBand(root)
        : teamStatusOf(root) === 'needs_clarification' ? clarifyBand(root) : '',
    });

    // ---- card ⋮ menu — Edit opens the on-page overlay editor (new tab), deep-linked to this pin
    // with &edit=1 so the overlay opens the composer straight onto it. The overlay re-checks the
    // TBI + ownership gate before allowing the save.
    function openEditPin(root) {
      const url = root.page.path + '?review=1#c=' + encodeURIComponent(root.id) + '&edit=1';
      window.open(url, '_blank', 'noopener');
    }
    // ---- card ⋮ menu — the team's Revoke action (soft delete of a comment it raised) ----
    async function rowRevoke(root) {
      if (!(await pkConfirm({ title: 'Revoke comment', message: 'Revoke this comment? It is removed from everyone’s queue but stays in the Master Log as revoked.', confirmLabel: 'Revoke', danger: true }))) return;
      try { await store.revoke(root); await loadData(); }
      catch (e) {
        const started = e.message === 'already started' || e.message === 'HTTP 409';
        pkAlert(started ? 'Builder has already started this comment — it can no longer be revoked.' : 'Could not revoke — ' + e.message);
        if (started) { try { await loadData(); } catch (_) {} }
      }
    }
    // ---- delete a single quick question (a reply the team authored) — used in the ticket detail thread ----
    async function delReply(reply) {
      if (!(await pkConfirm({ title: 'Delete question', message: 'Delete this quick question? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      try { await store.delReply(reply); await loadData(); }
      catch (e) { pkAlert(e.message === 'HTTP 403' ? 'You can only delete your own questions.' : 'Could not delete — ' + e.message); }
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
    function onRowMenuDoc(e) {
      if (!rowMenuEl) return;
      if (rowMenuEl.contains(e.target) || (rowMenuBtn && rowMenuBtn.contains(e.target))) return;
      closeRowMenu();
    }
    function onRowMenuKey(e) { if (e.key === 'Escape') closeRowMenu(); }
    // Flatten [group, group, …] → a flat item list with { divider:true } between non-empty groups.
    function groupMenu(groups) {
      const out = [];
      groups.filter((g) => g && g.length).forEach((g, i) => { if (i) out.push({ divider: true }); out.push(...g); });
      return out;
    }
    function openRowMenu(btn, root, customItems) {
      if (rowMenuEl && rowMenuBtn === btn) { closeRowMenu(); return; } // toggle
      closeRowMenu();
      rowMenuBtn = btn;
      let items = customItems || [];
      const s = teamStatusOf(root);
      if (!customItems) {
        const amReceiver = (root.toTeam || '') === team(); // items directed to me — I drive their status
        // Receiver lifecycle — the worker already authorises the toTeam to drive status; this exposes
        // it in the UI. These gates ARE the rule — the matrix is written up in ../ACTION-MODEL.md,
        // which documents them but does not enforce them. Change here, then update that file.
        const acts = [];
        if (!root.revoked && amReceiver) {
          if (s === 'to_be_initiated' || s === 'needs_clarification') acts.push({ label: s === 'needs_clarification' ? 'Resume (clarified)' : 'Start', icon: ICON.start, onSelect: () => doTeamAction(root, 'start') });
          if (s === 'to_be_initiated' || s === 'in_progress') acts.push({ label: 'Mark Complete', icon: ICON.complete, onSelect: () => openCompleteModal(root) });
          if (s === 'in_progress' || s === 'deployed_live') acts.push({ label: 'Reopen', icon: ICON.reopen, onSelect: () => openReopenModal(({ reason, note }) => { store.teamAction(root, 'reopen', reason, note).then(loadData).catch((e) => pkAlert('Could not reopen — ' + e.message)); }) });
          if (s === 'needs_clarification' || s === 'in_progress') acts.push({ label: 'Move to TBI', icon: ICON.reset, onSelect: () => doTeamAction(root, 'reset') });
          if (s === 'to_be_initiated' || s === 'in_progress') acts.push({ label: 'Need Clarity', icon: ICON.clarify, onSelect: () => doClarify(root) });
          if (s === 'to_be_initiated' || s === 'in_progress') acts.push({ label: 'Close as invalid', icon: ICON.disregard, onSelect: () => openDisregardModal(({ note }) => doTeamAction(root, 'disregard', note)) });
        }
        // Edit + Revoke are raiser-owned, TBI-only (before Builder starts it). Edit opens the on-page
        // overlay composer (new tab) armed on this pin.
        const raiserEdit = [];
        if (!root.revoked && (root.team || '') === team() && s === 'to_be_initiated') raiserEdit.push({ label: 'Edit comment', icon: ICON.edit, onSelect: () => openEditPin(root) });
        // Copy — teams get everything EXCEPT the AI prompt (builder-only, per the action model).
        const util = [
          { label: 'Copy ticket ID', icon: ICON.copy, onSelect: () => copyToClip(root.ticket || root.id, null) },
          { label: 'Copy pin link', icon: ICON.copy, onSelect: () => copyToClip(location.origin + root.page.path + '?review=1#c=' + root.id, null) },
        ];
        if (root.anchor && root.anchor.selector) util.push({ label: 'Copy selector', icon: ICON.copy, onSelect: () => copyToClip(root.anchor.selector, null) });
        const danger = [];
        if (!root.revoked && (root.team || '') === team() && s === 'to_be_initiated') danger.push({ label: 'Revoke Comment', danger: true, icon: ICON.revoke, onSelect: () => rowRevoke(root) });
        items = groupMenu([acts, raiserEdit, util, danger]);
      }
      const menu = document.createElement('div'); menu.className = 'pk-rowmenu';
      menu.innerHTML = items.map((it, i) =>
        it.divider ? '<div class="pk-rowmenu-sep" role="separator"></div>'
        : `<button type="button" class="pk-rowmenu-item${it.danger ? ' danger' : ''}" data-i="${i}">` +
            (it.icon || '<span class="pk-mi"></span>') + `<span class="pk-rowmenu-lbl">${esc(it.label)}</span></button>`).join('');
      document.body.appendChild(menu); rowMenuEl = menu;
      const r = btn.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      let left = r.right - mw; if (left + mw > innerWidth - 8) left = innerWidth - mw - 8; if (left < 8) left = 8;
      let top = r.bottom + 6; if (top + mh > innerHeight - 8) top = r.top - mh - 6; if (top < 8) top = 8;
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
      menu.querySelectorAll('.pk-rowmenu-item').forEach((b) =>
        b.addEventListener('click', () => { const it = items[+b.dataset.i]; closeRowMenu(); it.onSelect(); }));
      setTimeout(() => {
        document.addEventListener('click', onRowMenuDoc, true);
        document.addEventListener('keydown', onRowMenuKey, true);
        window.addEventListener('scroll', closeRowMenu, true);
        window.addEventListener('resize', closeRowMenu);
      }, 0);
    }

    // From-team filter chips — the teams that raised the items in this inbox.
    // Underline-tab chip (matches the admin filter). Active = solid fill + white ink; inactive
    // = team-colour text over a 1.5px bottom rule; a transparent 1.5px border keeps the box a
    // constant size so nothing shifts on switch.
    const teamChipHTML = (label, t) => {
      const active = fromFilter === t;
      // Team colour can't be enumerated in CSS — carried as a data-attr and applied via CSSOM
      // (paintDynamic), which the host CSP does not police, unlike a `style=` attribute.
      let cls = '', dyn = '';
      if (active) {
        const acc = t ? ((TEAM_COLORS[t] || [])[1] || 'var(--pk-red)') : 'var(--pk-red)';
        dyn = ` data-pk-accent="${esc(acc)}"`;
      } else if (t) {
        cls = 'pk-tchip--ghost'; dyn = ` data-pk-fg="${esc(teamStyle(t).fg)}"`;
      } else {
        cls = 'pk-tchip--ghost pk-tchip--none';
      }
      return `<button class="pk-tchip ${cls}${active ? ' is-active' : ''}" data-team="${esc(t)}"${dyn}>${esc(label)}</button>`;
    };
    // The counterparty teams present in the data: who SENT to us (From) on Inbound, who we SENT
    // to (To) on Outbound — so the chip picker lists the teams that actually appear this side.
    const presentTeams = () => [...new Set(roots().map((c) => isOutbound() ? c.toTeam : c.team).filter(Boolean))].sort((a, b) => TEAMS.indexOf(a) - TEAMS.indexOf(b));
    // Collapsed by default: "From" + the selected filter + a ▸ arrow, stuck right. The arrow /
    // chip opens the full picker (delegated handler → openTeamOverlay) as a blurred overlay.
    function buildTeamChips() {
      const host = $('#tmd-teamchips'); if (!host) return;
      const present = presentTeams();
      host.hidden = present.length < 2;
      if (present.length < 2) { host.innerHTML = ''; return; }
      host.innerHTML = '<span class="pk-chips-from">' + (isOutbound() ? 'To' : 'From') + '</span>' + teamChipHTML(fromFilter || 'All Teams', fromFilter || '') +
        '<button class="pk-chips-more" type="button" aria-label="Choose team" aria-haspopup="true" aria-expanded="false">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
        '</button>';
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
      const host = $('#tmd-teamchips');
      // Pin the current width, then collapse to 0 so the reveal animates shut.
      if (reveal) { reveal.style.width = reveal.scrollWidth + 'px'; reveal.getBoundingClientRect(); reveal.style.width = '0px'; }
      el.classList.remove('is-open');
      setTimeout(() => { el.remove(); if (host) host.style.visibility = ''; }, 320);
      document.removeEventListener('keydown', onTeamOverlayKey, true);
    }
    function openTeamOverlay() {
      closeTeamOverlay();
      const host = $('#tmd-teamchips'); if (!host) return;
      const r = host.getBoundingClientRect();
      // Every option except the one already showing as the anchor chip — those unveil on open.
      const opts = [{ label: 'All Teams', t: '' }, ...presentTeams().map((t) => ({ label: t, t }))]
        .filter((o) => o.t !== (fromFilter || ''));
      const ov = document.createElement('div'); ov.className = 'pk-chips-overlay';
      ov.innerHTML =
        '<div class="pk-chips-rail">' +
          '<span class="pk-chips-from">' + (isOutbound() ? 'To' : 'From') + '</span>' +
          teamChipHTML(fromFilter || 'All Teams', fromFilter || '') +
          '<span class="pk-chips-reveal">' + opts.map((o) => teamChipHTML(o.label, o.t)).join('') + '</span>' +
          '<button class="pk-chips-more is-open" type="button" aria-label="Close team picker" aria-expanded="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
          '</button>' +
        '</div>';
      document.body.appendChild(ov); teamOverlayEl = ov;
      const rail = ov.querySelector('.pk-chips-rail');
      const reveal = ov.querySelector('.pk-chips-reveal');
      rail.style.top = Math.round(r.top) + 'px';
      rail.style.right = Math.round(innerWidth - r.right) + 'px';
      host.style.visibility = 'hidden';   // hide the static control the rail now stands in for
      // Selecting a chip (including the anchor) commits the filter; the arrow just closes.
      ov.querySelectorAll('.pk-tchip').forEach((b) => b.addEventListener('click', () => {
        fromFilter = b.dataset.team; closeTeamOverlay(); entryDetail = null; syncUrl(true); render();
      }));
      ov.querySelector('.pk-chips-more').addEventListener('click', closeTeamOverlay);
      ov.addEventListener('click', (e) => { if (e.target === ov) closeTeamOverlay(); });
      document.addEventListener('keydown', onTeamOverlayKey, true);
      // Grow the reveal strip to its natural width — the slide.
      requestAnimationFrame(() => {
        ov.classList.add('is-open');
        reveal.style.width = reveal.scrollWidth + 'px';
      });
    }

    // ---- comment detail (typed fields · screenshot · AI prompt · timeline · quick questions) ----
    // Which ordered list a detail was opened from — powers the prev/next stepper. Mirrors the
    // list the user sees: the thread view, the full ledger (Table), or the filtered My Tickets.
    function detailList() {
      if (view === 'threads') return threadRoots();
      if (density === 'table') return ledgerRoots();
      return myRoots();
    }
    // Revamped detail: sticky bar (back · prev/next · open pin) → header → 2-col grid
    // (main cards + collapsible side rail). Same global .pk-detail* system as the builder.
    function renderDetail() {
      const c = roots().find((x) => x.id === entryDetail);
      const host = $('#tmd-list');
      if (!c) { entryDetail = null; syncUrl(true); return renderComments(); }
      const hist = chainHistory(c);
      const replies = repliesOf(c);            // Feature 6: the quick-questions thread
      const tl = typeLabel(c);                 // change-type chip label ('' for general)
      const sum = summaryOf(c);                // one-line typed preview
      const reopLabel = reopenLabelOf(c);      // reopen enum label the raiser sees
      const reopened = teamStatusOf(c) === 'reopened';
      const pinNo = pinNoOf(c);
      // Feature 8: the team's own success criteria (they submitted it) — read-only here.
      const outcome = needsExpectedOutcome(c.commentType) ? (c.expectedOutcome || '') : '';

      // Prev/Next position within the list this detail was opened from.
      const list = detailList();
      const idx = list.findIndex((x) => x.id === c.id);
      const hasList = idx >= 0 && list.length > 1;
      const prevId = hasList && idx > 0 ? list[idx - 1].id : '';
      const nextId = hasList && idx < list.length - 1 ? list[idx + 1].id : '';

      // Timeline — one entry per event, connected-rail styling from the global .pk-tl.
      const timeline = `<ol class="pk-timeline">` + hist.map((h, i) =>
        `<li class="pk-tl${i === hist.length - 1 ? ' is-current' : ''}">` +
          `<span class="pk-tl-event">${esc(eventLabel(h))}${h.event === 'created' && c.team ? ' · ' + esc(c.team) : ''}</span>` +
          `<span class="pk-tl-time">${esc(fmt(h.at))}</span></li>`).join('') + `</ol>`;
      // NB: no "Edit history" card here — the team data projection (maskLocal / worker maskForTeam)
      // deliberately strips versions[], so a team member never receives an edit trail to show.

      // Card builders — collapsible side card (open/closed remembered) + static main card.
      const sideCard = (key, title, bodyHTML, count) => {
        if (!bodyHTML) return '';
        const col = !!detailCollapsed[key];
        return `<section class="pk-dcard${col ? ' is-collapsed' : ''}" data-card="${key}">` +
          `<button class="pk-dcard-h" type="button" data-collapse="${key}" aria-expanded="${!col}">` +
            `<span>${esc(title)}${count != null ? ` <span class="pk-dcard-n">${count}</span>` : ''}</span>` +
            `<svg class="pk-dcard-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>` +
          `</button><div class="pk-dcard-b">${bodyHTML}</div></section>`;
      };
      const mainCard = (title, bodyHTML, headExtra) => bodyHTML
        ? `<section class="pk-dcard"><div class="pk-dcard-h pk-dcard-h-static"><span>${esc(title)}</span>${headExtra || ''}</div><div class="pk-dcard-b">${bodyHTML}</div></section>` : '';

      // Side-rail metadata (definition list).
      const metaRow = (k, vHtml) => `<div class="pk-dmeta-row"><dt>${esc(k)}</dt><dd>${vHtml}</dd></div>`;
      const metaBody = `<dl class="pk-dmeta">` +
        metaRow('Ticket', c.ticket ? `<span class="pk-ticket">#${esc(c.ticket)}</span>` : '—') +
        metaRow('Pin', pinNo ? `Comment ${esc(pinNo)}` : '—') +
        metaRow('Iteration', String(c.iteration || 1)) +
        metaRow('Page', `<a href="${esc(pageHref(c.page))}" target="_blank" rel="noopener">${esc(pageLabel(c.page))}</a>` +
          `<span class="pk-dmeta-sub">${esc(pageUrlText(c.page))}</span>`) +
        (c.display ? metaRow('Display', esc(displayText(c.display))) : '') +
        metaRow('Raised by', c.team ? teamChip(c.team) : '—') +
        metaRow('Directed to', c.toTeam ? teamChip(c.toTeam) : '—') +
        metaRow('Submitted', esc(fmt(c.createdAt))) +
        metaRow('Status', statusChip(c)) +
      `</dl>`;

      // Main-column bodies.
      const typedRows = typedFieldRows(c);
      const sumRow = tl && sum && sum !== c.comment ? `<div class="pk-field"><div class="pk-field-k">Summary</div><div class="pk-field-v">${esc(sum)}</div></div>` : '';
      const commentBody = `<div class="pk-field-v pk-detail-comment">${esc(c.comment)}</div>` +
        (sumRow || typedRows ? `<div class="pk-fields">${sumRow}${typedRows}</div>` : '');
      const hasPrompt = !!(c.aiPrompt || c.comment);
      const promptBody = hasPrompt
        ? `<div class="pk-field-prompt">${esc(localPrompt(c))}</div>`
        : `<div class="pk-field-v pk-u-pending">Generating…</div>`;
      const promptCopy = hasPrompt ? `<button class="pk-a pk-a--quiet pk-prompt-copybtn" type="button" data-copyprompt="1">Copy</button>` : '';
      const shotsBody = (c.imageId || c.viewportImageId)
        ? `<div class="pk-detail-media">` +
            (c.imageId ? `<figure class="pk-shot"><figcaption>Element</figcaption>${thumbTile(c.imageId, true)}</figure>` : '') +
            (c.viewportImageId ? `<figure class="pk-shot"><figcaption>Full viewport</figcaption>${thumbTile(c.viewportImageId, true)}</figure>` : '') +
          `</div>` : '';
      const qqBody =
        (replies.length
          ? `<div class="pk-qq-thread">` + replies.map((r) => {
              const mine = (r.team || '') === team(); // a team may delete only its OWN quick questions
              return `<div class="pk-reply">${teamChip(r.team)}<div class="pk-reply-txt">${esc(r.comment)}</div>` +
                `<div class="pk-reply-meta">${esc(fmt(r.createdAt))}</div>` +
                (mine ? `<button class="pk-reply-x" type="button" data-delreply="${esc(r.id)}" aria-label="Delete this question" title="Delete">×</button>` : '') +
              `</div>`;
            }).join('') + `</div>`
          : `<p class="pk-empty--inline">No questions yet.</p>`) +
        `<div class="pk-qq-compose">` +
          `<textarea class="pk-qq-input" placeholder="Write a quick question…" rows="2"></textarea>` +
          `<button class="pk-a pk-qq-send" type="button">Post reply</button>` +
        `</div>`;

      host.innerHTML =
        `<div class="pk-detailwrap">` +
          // ---- sticky action bar ----
          `<div class="pk-detail-bar">` +
            `<div class="pk-detail-bar-l">` +
              `<button class="pk-backlink" id="tmd-back">← Back</button>` +
              (hasList ? `<div class="pk-detail-step">` +
                `<button class="pk-stepbtn" type="button" data-detnav="prev"${prevId ? '' : ' disabled'} aria-label="Previous ticket"><svg class="pk-stepbtn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>` +
                `<span class="pk-detail-pos">${idx + 1} / ${list.length}</span>` +
                `<button class="pk-stepbtn" type="button" data-detnav="next"${nextId ? '' : ' disabled'} aria-label="Next ticket"><svg class="pk-stepbtn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>` +
              `</div>` : '') +
            `</div>` +
            `<div class="pk-detail-bar-r">` +
              // same ink as the admin detail bar's Open pin — a live control, not a disabled one
              `<a class="pk-a" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">Open pin ↗</a>` +
            `</div>` +
          `</div>` +
          `<article class="pk-detail">` +
            `<header class="pk-detail-head">` +
              `<h2 class="pk-detail-title">${esc(tl && sum ? sum : c.comment)}</h2>` +
              `<div class="pk-detail-chips">${statusChip(c)}` +
                (pinNo ? `<span class="pk-pinno">Comment ${esc(pinNo)}</span>` : '') +
                (tl ? `<span class="pk-type-chip">${esc(tl)}</span>` : '') +
                (reopened ? `<span class="pk-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` : '') +
              `</div>` +
              // Detail-page action parity: same model-driven ⋮ menu as the card (receiver lifecycle /
              // raiser edit+revoke / copy), shown when this team is the receiver or the raiser.
              ((((c.toTeam || '') === team()) || ((c.team || '') === team())) ? `<button class="pkc-more pk-detail-more" type="button" data-detmore="1" aria-label="Actions" aria-haspopup="menu"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg></button>` : '') +
              // Feature 8: prominent Success-criteria callout for layout-tweak / image-swap.
              (outcome ? `<div class="pk-criteria"><div class="pk-criteria-k">Success criteria</div><div class="pk-criteria-v">${esc(outcome)}</div></div>` : '') +
            `</header>` +
            // Feature 3: the reopen band — badge + reason label + Builder's note + Resubmit.
            (reopened ? reopenBand(c) : '') +
            `<div class="pk-detail-grid">` +
              `<div class="pk-detail-main">` +
                mainCard('Comment', commentBody) +
                (c.changeTo ? mainCard('Change to', `<div class="pk-callout pk-callout--scroll"><div>${esc(c.changeTo)}</div></div>`) : '') +
                mainCard('Optional prompt', promptBody, promptCopy) +
                (shotsBody ? mainCard('Screenshots', shotsBody) : '') +
                `<section class="pk-dcard pk-qq"><div class="pk-dcard-h pk-dcard-h-static"><span>Quick questions</span>` +
                  `<span class="pk-qq-sub">Ask Builder — replies never change status</span></div>` +
                  `<div class="pk-dcard-b">${qqBody}</div></section>` +
              `</div>` +
              `<aside class="pk-detail-side">` +
                sideCard('meta', 'Details', metaBody) +
                sideCard('timeline', 'Timeline', timeline) +
              `</aside>` +
            `</div>` +
          `</article>` +
        `</div>`;

      // ---- wiring ----
      $('#tmd-back').addEventListener('click', () => setDetail(null));
      host.querySelectorAll('[data-detnav]').forEach((btn) => btn.addEventListener('click', () => {
        const id = btn.dataset.detnav === 'prev' ? prevId : nextId; if (id) setDetail(id);
      }));
      host.querySelectorAll('[data-collapse]').forEach((btn) => btn.addEventListener('click', () => {
        const key = btn.dataset.collapse;
        detailCollapsed[key] = !detailCollapsed[key]; saveDcol();
        const card = btn.closest('.pk-dcard');
        if (card) card.classList.toggle('is-collapsed', !!detailCollapsed[key]);
        btn.setAttribute('aria-expanded', String(!detailCollapsed[key]));
      }));
      const cp = host.querySelector('[data-copyprompt]');
      if (cp) cp.addEventListener('click', () => copyToClip(localPrompt(c), cp, 'Copied ✓'));
      const dm = host.querySelector('[data-detmore]');
      if (dm) dm.addEventListener('click', () => openRowMenu(dm, c));
      // Feature 6: post a quick-question reply (status untouched). ⌘/Ctrl+Enter posts too.
      const send = host.querySelector('.pk-qq-send');
      const input = host.querySelector('.pk-qq-input');
      if (send && input) {
        const submit = async () => {
          if (send.disabled) return;
          const text = input.value.trim();
          if (!text) { input.focus(); return; }
          send.disabled = true; send.textContent = 'Posting…';
          try { await store.reply(c, text); await loadData(); }
          catch (e) { send.disabled = false; send.textContent = 'Post reply'; pkAlert('Could not post — ' + e.message); }
        };
        send.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
      }
      // Delete one of the team's own quick questions (a reply it authored).
      host.querySelectorAll('.pk-reply-x[data-delreply]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const reply = comments.find((x) => x.id === btn.dataset.delreply); if (reply) delReply(reply);
        });
      });
      // Feature 4: hydrate the full-size screenshot thumbnail in place.
      hydrateThumbs(host);
    }

    // Shared "By Page" grouping: bucket items by page path (A–Z), each a titled .tmd-grid.
    // Each group header is a toggle that collapses/expands its cards; state persists per page.
    function groupByPage(items, pathOf, renderItem, meta) {
      const paths = [...new Set(items.map(pathOf))].sort();
      return paths.map((p) => {
        // Within a page, order by the on-page comment number (ascending) — oldest/first-raised first.
        const group = items.filter((it) => pathOf(it) === p)
          .sort((a, b) => (a.pageSeq || 0) - (b.pageSeq || 0));
        const collapsed = collapsedPages.has(p);
        return `<div class="pk-group${collapsed ? ' is-collapsed' : ''}">` +
          `<h2 class="pk-gh"><button type="button" class="pk-gh-toggle" data-page="${esc(p)}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="Collapse or expand this page"><span class="pk-gh-caret" aria-hidden="true"></span></button>` +
          `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
          (meta ? `<span>${esc(meta(group))}</span>` : '') +
          `</h2><div class="pk-grid">${group.map(renderItem).join('')}</div></div>`;
      }).join('');
    }

    // Wire the By-Page collapse toggles inside a just-rendered host. Idempotent per render.
    function bindPageToggles(host) {
      if (!host) return;
      host.querySelectorAll('.pk-gh-toggle').forEach((b) => b.addEventListener('click', () => {
        const p = b.dataset.page, grp = b.closest('.pk-group');
        const nowCollapsed = grp.classList.toggle('is-collapsed');
        if (nowCollapsed) collapsedPages.add(p); else collapsedPages.delete(p);
        b.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
        saveCollapsed();
      }));
    }

    // COMPLETED tab (default) — everything submitted, live status labels, standard utilities.
    function renderComments() {
      const host = $('#tmd-list');
      const controls = $('#tmd-controls');
      if (entryDetail) { if (controls) controls.hidden = true; renderDetail(); return; }
      if (controls) controls.hidden = false;
      buildTeamChips();
      const rs = completedRoots();
      if (byPage) {
        host.innerHTML = groupByPage(rs, (c) => c.page.path, card, (group) => {
          const inFlight = group.filter((c) => teamStatusOf(c) !== 'deployed_live').length;
          const live = group.filter((c) => teamStatusOf(c) === 'deployed_live').length;
          return `${inFlight} with builder · ${live} live`;
        });
      } else {
        host.innerHTML = `<div class="pk-grid">${rs.map(card).join('')}</div>`;
      }
      if (selectMode) bindSelects(host);
      const emp = $('#tmd-empty');
      emp.hidden = rs.length > 0;
      if (!rs.length) emp.textContent = search ? 'No items match your search.'
        : (filter !== 'all' || fromFilter) ? 'Nothing in this filter.'
        : 'Nothing submitted yet.';
      bindPageToggles(host);
      hydrateThumbs(host);   // Feature 4: fill card thumbnails in place
    }

    // ACTIVE tab — reopened items awaiting Content's clarify + resubmit.
    function renderActive() {
      const host = $('#tmd-view-delivery');
      const rs = activeRoots();
      let body;
      if (!reopenedRoots().length) {
        body = `<p class="pk-empty">Nothing reopened. When Builder bounces an item back it lands here for you to clarify and resubmit.</p>`;
      } else if (!rs.length) {
        body = `<p class="pk-empty">No reopened items match your search.</p>`;
      } else if (byPage) {
        body = groupByPage(rs, (c) => c.page.path, card, (g) => `${g.length} to resubmit`);
      } else {
        body = `<div class="pk-grid">${rs.map(card).join('')}</div>`;
      }
      host.innerHTML = body;
      bindPageToggles(host);
      hydrateThumbs(host);   // Feature 4: fill card thumbnails in place
    }

    // NEEDS CLARIFICATION tab — items parked for clarification (raised by OR directed to this team).
    // Items you received (To = me) carry a Resume action in the ⋮ menu once clarified; items you
    // raised (From = me) sit here read-only until the other side resumes them.
    function renderClarify() {
      const host = $('#tmd-view-clarify');
      const rs = clarifyRoots();
      let body;
      if (!rs.length) {
        body = `<p class="pk-empty">${search ? 'No parked items match your search.' : 'Nothing needs clarity right now.'}</p>`;
      } else if (byPage) {
        body = groupByPage(rs, (c) => c.page.path, card, (g) => `${g.length} awaiting clarity`);
      } else {
        body = `<div class="pk-grid">${rs.map(card).join('')}</div>`;
      }
      host.innerHTML = body;
      bindPageToggles(host);
      enhanceClarifyTags(host);
      hydrateThumbs(host);   // Feature 4: fill card thumbnails in place
    }

    // The parked card's status tag becomes a dropdown to REVOKE the needs_clarification parking —
    // back to TBI or straight to Start (In Progress). Only the RECEIVER (toTeam === me) may act.
    function enhanceClarifyTags(host) {
      host.querySelectorAll('.pkc-card[data-id]').forEach((cardEl) => {
        const rec = roots().find((c) => c.id === cardEl.dataset.id);
        if (!rec || teamStatusOf(rec) !== 'needs_clarification') return;
        if ((rec.toTeam || '') !== team()) return; // only the receiver can move it
        const chip = cardEl.querySelector('.pkc-status'); if (!chip) return;
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

    // COMMENTS tab — every ticket-chain (this team's) with a discussion thread, newest activity
    // first. Open one to read + reply (⌘/Ctrl+Enter posts). Same card + utilities as the queues.
    function renderThreads() {
      const host = $('#tmd-view-threads');
      const rs = threadRoots();
      const unread = rs.filter((c) => threadOrigin(c).readTeam === false);
      // Wrap each card in a read/unread bar (mirrors the Notifications toggle). The toggle is a
      // <button>, which the shared .pk-content card-open handler ignores, so drill-in still works.
      // Read-state keys off the chain ORIGIN (see threadOrigin), not the displayed live card.
      const threadCard = (c) => {
        const o = threadOrigin(c);
        const u = o.readTeam === false;
        return `<div class="pk-thread-item${u ? ' is-unread' : ''}">` +
          `<div class="pk-thread-mark"><span class="pk-thread-dot"></span>` +
            `<button class="tmd-note-toggle pk-thread-toggle" type="button" data-id="${esc(o.id)}" data-path="${esc(o.page.path)}" data-url="${esc(o.page.url || '')}" data-read="${u ? '1' : '0'}">${u ? 'Mark read' : 'Mark unread'}</button>` +
          `</div>` + card(c) +
        `</div>`;
      };
      let body;
      if (!rs.length) {
        body = `<p class="pk-empty">${search ? 'No threads match your search.' : 'No comment threads yet. Replies on any ticket show up here.'}</p>`;
      } else if (byPage) {
        body = groupByPage(rs, (c) => c.page.path, threadCard, (g) => `${g.length} with a thread`);
      } else {
        body = `<div class="pk-grid">${rs.map(threadCard).join('')}</div>`;
      }
      const head = unread.length
        ? `<div class="pk-thread-head"><button class="tmd-note-toggle" type="button" id="tmd-thread-read">Mark all read (${unread.length})</button></div>`
        : '';
      host.innerHTML = head + body;
      bindPageToggles(host);
      hydrateThumbs(host);
    }

    // TEAM QUEUE tab (default landing) — the open working set, rendered with the SAME card
    // + utilities as Completed (search · sort · By Page · from-team chips · saved views ·
    // thumbnails · drill-in). Queue cards open the shared detail host, same as Completed.
    // The status-chip row on My Tickets (mirror of the admin Queue). Pure filter — never changes
    // direction/search/sort; the active chip is a solid fill; overflow chips hide behind "More".
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
      if (overflow.some((c) => c.f === statusFilter)) statusMoreOpen = true;
      host.innerHTML =
        STATUS_CHIPS.filter((c) => c.primary).map((c) => chip(c)).join('') +
        `<button class="pk-schip pk-schip--more${statusMoreOpen ? ' is-open' : ''}" type="button" aria-expanded="${statusMoreOpen}">More <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>` +
        (statusMoreOpen ? overflow.map((c, i) => chip(c, i)).join('') : '');
    }
    // The Table density = the full ledger (both directions + every status, incl. revoked).
    function ledgerTableHTML(rs) {
      return `<div class="pk-entrieshead"><h2>All tickets <span class="pk-u-count">(${rs.length})</span></h2></div>` +
        `<div class="pk-logwrap"><table class="pk-log"><thead><tr>` +
        `<th>Ticket</th><th>When</th><th>Page</th><th>From</th><th>To</th><th>Status</th></tr></thead><tbody>` +
        rs.map((c) => `<tr class="pk-logrow" data-id="${esc(c.id)}">` +
          `<td><span class="pk-ticket">${c.ticket ? esc(c.ticket) : '—'}</span></td>` +
          `<td>${esc(fmt(c.createdAt))}</td>` +
          `<td><a class="pk-pagecell" href="${esc(pageHref(c.page))}" target="_blank" rel="noopener">` +
            `<span class="pk-pagecell-t">${esc(pageLabel(c.page))}</span>` +
            `<span class="pk-pagecell-u">${esc(pageUrlText(c.page))}</span></a></td>` +
          `<td>${teamChip(c.team) || '—'}</td><td>${teamChip(c.toTeam) || '—'}</td><td>${statusChip(c)}</td></tr>`).join('') +
        `</tbody></table></div>`;
    }
    function renderQueue() {
      const host = $('#tmd-view-queue');
      buildTeamChips();
      renderStatusChips();
      syncDirToggle(); syncDensToggle();
      const dv = $('#tmd-view-queue'); if (dv) dv.setAttribute('data-density', density);
      // Table density — full ledger; row click drills into the shared detail.
      if (density === 'table') {
        const lr = ledgerRoots();
        host.innerHTML = lr.length ? ledgerTableHTML(lr) : '';
        host.querySelectorAll('.pk-logrow').forEach((tr) => tr.addEventListener('click', (e) => {
          if (e.target.closest('a')) return; setDetail(tr.dataset.id);
        }));
        const empT = $('#tmd-empty');
        empT.hidden = lr.length > 0;
        if (!lr.length) empT.textContent = search ? 'No tickets match your search.' : 'No tickets yet.';
        return;
      }
      const rs = myRoots();
      if (byPage) {
        host.innerHTML = groupByPage(rs, (c) => c.page.path, card, (group) => {
          const tbi = group.filter((c) => teamStatusOf(c) === 'to_be_initiated').length;
          const inp = group.filter((c) => teamStatusOf(c) === 'in_progress').length;
          const reo = group.filter((c) => teamStatusOf(c) === 'reopened').length;
          return `${tbi} TBI · ${inp} in progress · ${reo} reopened`;
        });
      } else {
        host.innerHTML = `<div class="pk-grid">${rs.map(card).join('')}</div>`;
      }
      const emp = $('#tmd-empty');
      emp.hidden = rs.length > 0;
      if (!rs.length) {
        const lbl = (STATUS_CHIPS.find((c) => c.f === statusFilter) || {}).label || '';
        emp.textContent = search ? 'No items match your search.'
          : (statusFilter !== 'open' && statusFilter !== 'all') ? `No ${lbl} tickets ${isOutbound() ? 'you raised' : 'directed to your team'}.`
          : isOutbound() ? 'Nothing here — you haven’t raised any requirements yet.'
          : 'Nothing here — no requirements are currently directed to your team.';
      }
      bindPageToggles(host);
      hydrateThumbs(host);   // Feature 4: fill card thumbnails in place
    }

    // A small speech-bubble glyph marks a Quick-questions reply notification (Feature 6).
    const REPLY_ICO = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    function noteItem(n) {
      const unread = n.readTeam === false;
      // Feature 6: a reply notification is flagged distinctly ("Reply"); everything else
      // is a status update and carries no chip.
      const chip = n.kind === 'reply' ? `<span class="pk-status-chip pk-status-chip--reply">${REPLY_ICO} Reply</span>`
        : n.kind === 'revoked' ? `<span class="pk-status-chip pk-status-chip--revoked">Revoked</span>` : '';
      // The whole card opens the ticket's detail (its chain root). Only clickable when the
      // notification carries a chain id; keyboard-focusable when so.
      const chain = n.chainId || '';
      const clickable = chain ? ` data-chain="${esc(chain)}" tabindex="0" role="button" aria-label="View ticket details"` : '';
      return `<article class="pk-notif${unread ? ' is-unread' : ''}${chain ? ' is-clickable' : ''}"${clickable}>` +
        `<span class="pk-notif-dot"></span>` +
        `<div class="pk-notif-body">` +
          `<div class="pk-notif-sum">${esc(n.summary || 'Your comment was updated.')}</div>` +
          `<div class="pk-notif-meta">` +
            `<a class="pk-slug" href="${esc(n.path || '/')}" target="_blank" rel="noopener">${esc(pageName(n.path || '/'))}</a>` +
            `<span class="tmd-time">${esc(fmt(n.updatedAt || n.createdAt))}</span>` +
            chip +
            (n.commentId ? `<a class="pk-openpin" href="${esc(n.path || '/')}?review=1#c=${esc(n.commentId)}" target="_blank" rel="noopener">Open Pin</a>` : '') +
          `</div>` +
        `</div>` +
        `<button class="tmd-note-toggle" type="button" data-id="${esc(n.id)}" data-read="${unread ? '1' : '0'}">` +
          (unread ? 'Mark read' : 'Mark unread') +
        `</button>` +
      `</article>`;
    }

    function sortNotes(ns) {
      const s = ns.slice();
      if (sort === 'old') s.sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? -1 : 1));
      else if (sort === 'page') s.sort((a, b) => (a.path || '/').localeCompare(b.path || '/') || ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
      else s.sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1));
      return s;
    }
    function renderNotes() {
      const host = $('#tmd-notes');
      const list = sortNotes(notes.filter(matchesNoteSearch));
      if (byPage) {
        host.innerHTML = list.length
          ? [...new Set(list.map((n) => n.path || '/'))].sort().map((p) => {
              const group = list.filter((n) => (n.path || '/') === p);
              const unread = group.filter((n) => n.readTeam === false).length;
              const collapsed = collapsedPages.has(p);
              return `<div class="pk-group${collapsed ? ' is-collapsed' : ''}">` +
                `<h2 class="pk-gh"><button type="button" class="pk-gh-toggle" data-page="${esc(p)}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-label="Collapse or expand this page"><span class="pk-gh-caret" aria-hidden="true"></span></button>` +
                `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
                `<span>${group.length} notification${group.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}</span>` +
                `</h2><div class="pk-notes">${group.map(noteItem).join('')}</div></div>`;
            }).join('')
          : '';
      } else {
        host.innerHTML = list.length ? `<div class="pk-notes">${list.map(noteItem).join('')}</div>` : '';
      }
      bindPageToggles(host);
      const emp = $('#tmd-empty');
      emp.hidden = list.length > 0;
      if (!list.length) emp.textContent = search ? 'No notifications match your search.' : 'No notifications yet.';
    }

    // ---- Team views (Feature 11): capture / apply / persist the current filter set ----
    // A view captures the full Completed/Active filter state {search, sort, status filter,
    // from-team, By-Page, tab}. Shared per team key (store.getViews/saveViews scope to the
    // signed-in team — Worker `views:<team>` KV or demo `rvc-views` under the team key).
    const currentFilterState = () => ({ search, sort, filter, fromFilter, byPage, view });
    function applyView(v) {
      const f = (v && v.filters) || {};
      search = f.search || ''; sort = f.sort || 'new'; filter = f.filter || 'all';
      fromFilter = f.fromFilter || ''; byPage = !!f.byPage;
      activeViewName = v ? v.name : '';
      const se = $('#tmd-search'); if (se) se.value = search;
      if (sortDD && sortDD.setValue) sortDD.setValue(sort);
      const bp = $('#tmd-bypage'); if (bp) bp.classList.toggle('is-active', byPage);
      const ff = $('#tmd-filters');
      if (ff) ff.querySelectorAll('.tmd-filter').forEach((x) => x.classList.toggle('is-active', x.dataset.filter === filter));
      setView(f.view || 'comments');   // reproduce the exact tab too
      render();
    }
    function renderViewChips() {
      const host = $('#tmd-views'); if (!host) return;
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
      const name = ((await pkPrompt({ title: 'Save view', message: 'Name this view (shared with your team):', placeholder: 'View name', confirmLabel: 'Save' })) || '').trim();
      if (!name) return;
      const next = savedViews.filter((v) => v.name !== name).concat([{ name, filters: currentFilterState() }]);
      try { await store.saveViews(next); savedViews = next; activeViewName = name; renderViewChips(); }
      catch (e) { pkAlert('Could not save view — ' + e.message); }
    }
    async function loadViews() {
      try { const v = await store.getViews(); savedViews = Array.isArray(v) ? v : []; }
      catch { savedViews = []; }
    }

    // ---- resubmit ----
    async function doResubmit(btn) {
      const rec = roots().find((c) => c.id === btn.dataset.resubmit); if (!rec) return;
      if (!(await pkConfirm({ title: 'Resubmit', message: 'Resubmit this to ' + (rec.toTeam || 'Builder') + ' for another pass?', confirmLabel: 'Resubmit' }))) return;
      btn.disabled = true;
      try { await store.resubmit(rec); await loadData(); }
      catch (e) { btn.disabled = false; pkAlert('Could not resubmit — ' + e.message); }
    }
    // The raiser confirms a deployed bug fix — moves Deployed Live → Bug Closed + clears the page pin.
    async function doConfirm(btn) {
      const rec = roots().find((c) => c.id === btn.dataset.confirmfix); if (!rec) return;
      if (!(await pkConfirm({ title: 'Confirm bug fix', message: 'Confirm this bug fix is live and correct? It moves to Bug Closed and clears the page pin.', confirmLabel: 'Confirm' }))) return;
      btn.disabled = true; btn.textContent = 'Confirming…';
      try { await store.confirm(rec); await loadData(); }
      catch (e) { btn.disabled = false; btn.textContent = 'Confirm Bug Fix'; pkAlert('Could not confirm — ' + e.message); }
    }
    // ---- raiser reopens a deployed fix — the counterpart to Confirm. A REQUIRED reason (enum,
    // 'other' needs a note) is captured, then the ticket goes back to Builder as TBI. Reuses the
    // shared `.pk-reopen` overlay/card; buttons carry teamdash classes. ----
    function doReopenFix(btn) {
      const rec = roots().find((c) => c.id === btn.dataset.reopenfix); if (!rec) return;
      const el = document.createElement('div'); el.className = 'pk-reopen';
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Reopen bug fix">` +
          `<h2 class="pk-reopen-title">Reopen bug fix</h2>` +
          `<p class="pk-reopen-sub">The deployed fix isn’t right — send it back to <b>${esc(rec.toTeam || 'Builder')}</b> for another pass. Pick a reason (shared with them).</p>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">Reason <span class="pk-u-req">· required</span></span><div class="tmd-reopen-reason"></div></div>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">Note<span class="tmd-reopen-req" hidden> · required for “Other”</span></span>` +
            `<textarea class="pk-reopen-note" placeholder="Add context for ${esc(rec.toTeam || 'Builder')} (required for “Other”)"></textarea></div>` +
          `<div class="pk-reopen-err pk-u-errtext" tmd-err hidden></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="tmd-modal-btn tmd-reopen-cancel">Cancel</button>` +
            `<button type="button" class="tmd-modal-btn tmd-modal-btn--go tmd-reopen-go">Reopen</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      let reason = '';
      const req = el.querySelector('.tmd-reopen-req');
      const err = el.querySelector('[tmd-err]');
      const note = el.querySelector('.pk-reopen-note');
      const reasonDD = buildDropdown({
        block: true, placeholder: 'Select a reason',
        items: REOPEN_REASONS.map((r) => ({ value: r.value, label: r.label })),
        onSelect: (v) => { reason = v; req.hidden = reason !== 'other'; err.hidden = true; },
      });
      el.querySelector('.tmd-reopen-reason').appendChild(reasonDD.el);
      const close = () => el.remove();
      el.querySelector('.tmd-reopen-cancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      el.querySelector('.tmd-reopen-go').addEventListener('click', async () => {
        const n = note.value.trim();
        if (!reason) { err.textContent = 'Please choose a reason.'; err.hidden = false; return; }
        if (reason === 'other' && !n) { err.textContent = 'A note is required when the reason is “Other”.'; err.hidden = false; return; }
        close();
        try { await store.reopenFix(rec, reason, n); await loadData(); }
        catch (e) { pkAlert('Could not reopen — ' + e.message); }
      });
      if (reasonDD.focus) reasonDD.focus();
    }

    // ---- team status actions (clarify / resume) — the two transitions a team drives on the
    // items directed TO it. Reload-then-repaint (like resubmit) keeps this simple + consistent. ----
    /* ---- bulk select ---------------------------------------------------------------------- */
    function updateBulk() {
      const n = sel.size;
      const bar = $('#tmd-bulk'); if (bar) bar.hidden = !(selectMode && n > 0);
      const nEl = $('#tmd-bulk-n'); if (nEl && n) nEl.textContent = n + (n === 1 ? ' selected' : ' selected');
      const btn = $('#tmd-selectall');
      if (btn) { btn.textContent = selectMode ? 'Done' : 'Select'; btn.classList.toggle('is-active', selectMode); }
    }
    function setSelectMode(on) {
      selectMode = on;
      if (!on) sel.clear();
      updateBulk(); render();
    }
    /* Selection is pruned to what is on screen. Changing a filter with things selected used to be
     * the classic bulk-action trap: the count still says 12 and four of them are no longer in
     * front of you, so "Mark Complete" reaches tickets you can no longer see. */
    function pruneSelection() {
      const visible = new Set(myRoots().map((r) => r.id));
      for (const id of [...sel]) if (!visible.has(id)) sel.delete(id);
    }
    function bindSelects(scope) {
      (scope || document).querySelectorAll('.pkc-sel').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          cb.checked ? sel.add(cb.dataset.id) : sel.delete(cb.dataset.id);
          updateBulk(); render();
        });
      });
    }
    async function runBulk(act) {
      const bar = $('#tmd-bulk');
      const btns = bar ? [...bar.querySelectorAll('.pk-bulk-a')] : [];
      const chosen = myRoots().filter((r) => sel.has(r.id));
      if (act === 'all') { myRoots().forEach((r) => sel.add(r.id)); updateBulk(); render(); return; }
      if (act === 'clear') { setSelectMode(false); return; }
      if (!chosen.length) return;

      if (act === 'copy') {
        const text = chosen.map((r) => (r.changePrompt || r.comment || '')).filter(Boolean).join('\n\n---\n\n');
        try { await navigator.clipboard.writeText(text); pkAlert(chosen.length + ' prompt(s) copied.'); }
        catch (e) { pkAlert('Could not copy — ' + e.message); }
        return;
      }

      /* Only tickets the action actually applies to. Sending 'start' to something already in
       * progress is not harmless — it writes a history event that says work restarted when it
       * did not, and the timeline is the thing people trust. */
      const applies = act === 'start'
        ? chosen.filter((r) => ['to_be_initiated', 'needs_clarification'].includes(teamStatusOf(r)))
        : chosen.filter((r) => teamStatusOf(r) === 'in_progress');
      const skipped = chosen.length - applies.length;
      if (!applies.length) {
        pkAlert('None of the selected tickets can be ' + (act === 'start' ? 'started' : 'completed') + ' from their current status.');
        return;
      }
      const label = act === 'start' ? 'Start' : 'Mark Complete';
      if (!(await pkConfirm({
        title: label + ' — ' + applies.length + ' ticket(s)',
        message: skipped
          ? applies.length + ' will change. ' + skipped + ' are skipped because their status does not allow it.'
          : 'This applies ' + label.toLowerCase() + ' to ' + applies.length + ' ticket(s).',
        confirmLabel: label,
      }))) return;

      btns.forEach((b) => (b.disabled = true));
      let failed = 0;
      try {
        for (const r of applies) {
          try { await store.teamAction(r, act === 'start' ? 'start' : 'complete', '', ''); }
          catch (e) { failed += 1; }
        }
        await loadData();
      } finally { btns.forEach((b) => (b.disabled = false)); }
      sel.clear(); updateBulk(); render();
      if (failed) pkAlert(failed + ' of ' + applies.length + ' could not be updated.');
    }

    async function doTeamAction(rec, action, note) {
      try { await store.teamAction(rec, action, '', note || ''); await loadData(); }
      catch (e) { pkAlert('Could not update — ' + e.message); }
    }
    // Needs-clarification modal — parks an inbound item for the raising team to clarify. The note
    // (the question) is OPTIONAL; when given it is logged + shared with the raiser. Reuses the
    // shared `.pk-reopen` overlay/card (design/components.css); the buttons carry teamdash classes.
    function doClarify(root) {
      const el = document.createElement('div'); el.className = 'pk-reopen';
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Mark as need clarity">` +
          `<h2 class="pk-reopen-title">Need Clarity</h2>` +
          `<p class="pk-reopen-sub">Move this into the <b>Need Clarity</b> bucket and let the raising team know what’s unclear. It leaves your inbound queue until you resume it.</p>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">What needs clarifying? <span class="pk-u-opt">· optional</span></span>` +
            `<textarea class="pk-reopen-note" placeholder="Ask the raising team what you need to proceed (shared with them)"></textarea></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="tmd-modal-btn tmd-clarify-cancel">Cancel</button>` +
            `<button type="button" class="tmd-modal-btn tmd-modal-btn--go tmd-clarify-go">Mark for clarity</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      const note = el.querySelector('.pk-reopen-note');
      const close = () => el.remove();
      el.querySelector('.tmd-clarify-cancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      const go = () => { close(); doTeamAction(root, 'clarify', note.value.trim()); };
      el.querySelector('.tmd-clarify-go').addEventListener('click', go);
      // ⌘/Ctrl+Enter from the note triggers the primary CTA (Mark for clarification).
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
      note.focus();
    }
    // Mark Complete modal — the completing team picks who the ticket is REDIRECTED to next
    // (default Builder). Redirecting re-targets the ticket (toTeam) and lands it in that team's
    // queue as TBI; the handoff is stamped on the history entry. Reuses the shared `.pk-reopen`
    // overlay/card, same as Need Clarity above.
    function openCompleteModal(root) {
      const me = team();
      const targets = [ADMIN_TEAM, ...TEAMS].filter((t, i, a) => t && t !== me && a.indexOf(t) === i);
      let target = ADMIN_TEAM;
      const el = document.createElement('div'); el.className = 'pk-reopen';
      el.innerHTML =
        `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Mark Complete">` +
          `<h2 class="pk-reopen-title">Mark Complete</h2>` +
          `<p class="pk-reopen-sub">Your action on this ticket is done. Pick the team it should be redirected to next — it lands in their queue as <b>TBI</b>.</p>` +
          `<div class="pk-reopen-field"><span class="pk-reopen-label">Redirect to</span><div class="tmd-complete-team"></div></div>` +
          `<div class="pk-reopen-actions">` +
            `<button type="button" class="tmd-modal-btn tmd-complete-cancel">Cancel</button>` +
            `<button type="button" class="tmd-modal-btn tmd-modal-btn--go tmd-complete-go">Mark Complete</button>` +
          `</div>` +
        `</div>`;
      document.body.appendChild(el);
      const dd = buildDropdown({
        block: true, value: ADMIN_TEAM,
        items: targets.map((t) => ({ value: t, label: t })),
        onSelect: (v) => { target = v; },
      });
      el.querySelector('.tmd-complete-team').appendChild(dd.el);
      const close = () => el.remove();
      el.querySelector('.tmd-complete-cancel').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
      el.querySelector('.tmd-complete-go').addEventListener('click', async () => {
        close();
        try { await store.teamAction(root, 'complete', '', '', target); await loadData(); }
        catch (e) { pkAlert('Could not complete — ' + e.message); }
      });
    }

    // The status sub-filter tabs serve BOTH Team Queue and Completed, but with a
    // view-specific vocabulary: Team Queue filters the OPEN set (adds Reopened, drops
    // Deployed live); Completed filters the submitted ledger (adds Deployed live, drops
    // Reopened). The bar is rebuilt only when the active view's set changes; active state is
    // re-synced every render. Switching to a view whose set excludes the current filter
    // resets it to All (so e.g. a "Deployed live" filter doesn't leak into the queue).
    let filterBarView = '';
    // Completed: "Pending Confirmation" leads (default landing) — deployed fixes awaiting the raiser's
    // confirm; "Bug Closed" trails after Deployed live — the raiser confirmed them.
    const FILTER_SETS = {
      comments: [['pending_confirmation', 'Pending Confirmation'], ['all', 'All'], ['to_be_initiated', 'TBI'], ['in_progress', 'In Progress'], ['deployed_live', 'Deployed Live'], ['verified', 'Bug Closed']],
      queue:    [['all', 'All'], ['to_be_initiated', 'TBI'], ['in_progress', 'In Progress'], ['reopened', 'Reopened']],
    };
    function buildFilterBar() {
      const host = $('#tmd-filters'); if (!host) return;
      // Inbound (queue) + Outbound share the OPEN-set vocabulary; Completed uses the ledger set.
      const forView = view === 'comments' ? 'comments' : 'queue';
      const set = FILTER_SETS[forView];
      if (!set.some(([v]) => v === filter)) filter = 'all';
      // Per-tab counts: the view's base set (Queue drops Deployed live; Completed drops Reopened)
      // with the status sub-filter EXCLUDED — each tab counts its own bucket — but honouring the
      // from-team + search filters so a tab's [n] equals what selecting it would show. Rebuilt
      // every render (not just on view change) so the counts track live data.
      const dropped = forView === 'queue' ? 'deployed_live' : 'reopened';
      const out = isOutbound();
      // needs_clarification lives in its own bucket — never counted in the queue/completed tabs.
      let base = roots().filter((c) => teamStatusOf(c) !== dropped && teamStatusOf(c) !== 'needs_clarification' && !c.revoked);
      if (forView === 'queue') base = base.filter((c) => out ? ((c.team || '') === team()) : ((c.toTeam || '') === team()));
      const cpField = (forView === 'queue' && out) ? 'toTeam' : 'team'; // counterparty: To on Outbound, else From
      if (fromFilter) base = base.filter((c) => (c[cpField] || '') === fromFilter);
      base = base.filter(matchesSearch);
      const countFor = (v) => {
        if (v === 'all') return base.length;
        if (v === 'pending_confirmation') return base.filter(isPendingMine).length;
        if (v === 'deployed_live') return base.filter(isDeployedUnconfirmed).length; // deployed + awaiting confirm
        if (v === 'verified') return base.filter(isVerifiedFix).length;
        return base.filter((c) => teamStatusOf(c) === v).length;
      };
      filterBarView = forView;
      host.innerHTML = set.map(([v, l]) =>
        `<button class="tmd-filter${v === filter ? ' is-active' : ''}" data-filter="${esc(v)}">${esc(l)} <span class="tmd-filter-n">[${countFor(v)}]</span></button>`).join('');
    }

    // The shared toolbar reconciles the parts that differ per view. My Tickets carries the direction
    // toggle + status chips + density; Threads/Notifications are plain lists. The old view-aware
    // status-tab bar (#tmd-filters) is retired — the status CHIPS replace it.
    function syncControls() {
      const note = $('#tmd-viewnote');
      const prim = $('#tmd-primary');
      const searchEl = $('#tmd-search');
      const isQ = view === 'queue';
      const cardMode = isQ && density === 'cards'; // the card-only filters don't apply to the full-ledger table
      const oldFilters = $('#tmd-filters'); if (oldFilters) oldFilters.hidden = true; // retired
      // Direction toggle + status chips + team chips + By Page apply to CARD mode only; the density
      // toggle stays visible in both so you can switch back.
      ['#tmd-dirtoggle', '#pk-statuschips', '#tmd-teamchips'].forEach((sel) => { const el = $(sel); if (el) el.hidden = !cardMode; });
      const dens = $('#tmd-denstoggle'); if (dens) dens.hidden = !isQ;
      const bp = $('#tmd-bypage'); if (bp) bp.hidden = !cardMode;
      const tr = document.querySelector('.pk-tabsrow'); if (tr) tr.hidden = !cardMode; // its only live child is the team picker
      const sv = $('#tmd-saveview'); if (sv) sv.hidden = !isQ;
      if (isQ) {
        searchEl.placeholder = isOutbound() ? 'Search items you raised…' : 'Search items directed to you…';
        note.hidden = true;
        prim.textContent = 'Clear filters';
        prim.disabled = !(search || statusFilter !== 'open' || fromFilter || byPage || sort !== 'new' || dir !== 'outbound' || density !== 'cards');
      } else if (view === 'threads') {
        searchEl.placeholder = 'Search comment threads…';
        note.hidden = false;
        note.textContent = 'Every ticket with a discussion thread, most recent first. Open one to read and reply (⌘/Ctrl+Enter posts).';
        prim.textContent = 'Clear filters';
        prim.disabled = !(search || sort !== 'new');
      } else { // notifs
        searchEl.placeholder = 'Search notifications…';
        note.hidden = true;
        prim.textContent = 'Mark all read';
        prim.disabled = unreadNotes().length === 0;
      }
    }

    // Point `view` at a nav tab and sync the highlight (does not render).
    function setView(v, replace) {
      view = v; entryDetail = null;
      // A view change IS a navigation — this is what Back walks back through. `replace` is for
      // landing on the first visible tab at load, which the user did not choose.
      syncUrl(replace);
      document.querySelectorAll('.pk-nav').forEach((n) => n.classList.toggle('is-active', n.dataset.view === v));
    }
    // The first nav tab that's actually visible — the landing target on load, and the
    // fallback when the current tab (e.g. Active) gets hidden out from under us.
    function firstVisibleView() {
      const first = [...document.querySelectorAll('.pk-side .pk-nav')].find((n) => !n.hidden);
      return first ? first.dataset.view : 'comments';
    }

    // ---- CSP-safe dynamic styling ----
    // The host enforces `style-src 'self'`, which drops `style=` ATTRIBUTES from markup. Values
    // that can't be enumerated as CSS classes (team colours) are emitted as data-attributes and
    // applied here through CSSOM — scripted CSSOM is not policed by CSP. Call after innerHTML.
    function paintDynamic(scope) {
      const r = scope || document;
      r.querySelectorAll('[data-pk-accent]').forEach((el) => {
        const a = el.dataset.pkAccent;
        el.style.background = a; el.style.border = '1.5px solid ' + a; el.style.color = 'var(--pk-on-accent)';
      });
      r.querySelectorAll('[data-pk-fg]').forEach((el) => {
        el.style.borderBottomColor = el.dataset.pkFg; el.style.color = el.dataset.pkFg;
      });
      r.querySelectorAll('[data-pk-bg]').forEach((el) => { el.style.background = el.dataset.pkBg; });
    }

    function render() {
      const detail = !!entryDetail; // a drilled-in ticket detail renders in the shared comments host
      const isQueue = view === 'queue'; // the single "My Tickets" view; direction is a control
      $('#tmd-view-comments').hidden = !detail;               // host reused for the detail drill-in
      $('#tmd-view-queue').hidden = detail || !isQueue;
      $('#tmd-view-notifs').hidden = detail || view !== 'notifs';
      $('#tmd-view-delivery').hidden = true;                  // retired — folded into the Reopened chip
      const cv = $('#tmd-view-clarify'); if (cv) cv.hidden = true; // retired — Needs Clarification chip
      const tv = $('#tmd-view-threads'); if (tv) tv.hidden = detail || view !== 'threads';
      const sv = $('#tmd-view-settings'); if (sv) sv.hidden = detail || view !== 'settings';
      $('#tmd-empty').hidden = true;
      renderViewChips();   // Feature 11: keep the saved "Team views" chips in sync
      const ctrl = $('#tmd-controls');
      if (detail) { if (ctrl) ctrl.hidden = true; renderDetail(); renderHeader(); return; }
      // Settings is a self-contained preferences pane — no queue controls above it.
      if (view === 'settings') { if (ctrl) ctrl.hidden = true; renderSettings(); renderHeader(); return; }
      if (ctrl) ctrl.hidden = false;
      const bulkBar = $('#tmd-bulk');
      if (view === 'notifs') { if (bulkBar) bulkBar.hidden = true; renderNotes(); }
      else if (view === 'threads') { if (bulkBar) bulkBar.hidden = true; renderThreads(); }
      else { pruneSelection(); renderQueue(); updateBulk(); }  // 'queue' (My Tickets) is the default ticket view
      syncControls();
      renderHeader();
      paintDynamic();   // CSP: apply data-attr team colours via CSSOM after the HTML lands
    }

    {
      const selBtn = $('#tmd-selectall');
      if (selBtn) selBtn.addEventListener('click', () => setSelectMode(!selectMode));
      const bar = $('#tmd-bulk');
      if (bar) bar.addEventListener('click', (e) => {
        const b = e.target.closest('.pk-bulk-a'); if (!b) return;
        runBulk(b.dataset.act);
      });
    }

    // My Tickets primary: reset Search, Sort, status chip, direction, density, From-team and By Page.
    function clearFilters() {
      search = ''; sort = 'new'; statusFilter = 'open'; filter = 'all'; fromFilter = ''; byPage = false;
      dir = 'outbound'; density = 'cards'; saveDensity();
      activeViewName = ''; // dropping the filters drops the active saved-view highlight
      $('#tmd-search').value = '';
      sortDD.setValue('new');
      $('#tmd-bypage').classList.remove('is-active');
      render();
    }
    // Keep the Inbound/Outbound + Cards/Table segmented controls in step with state.
    function syncDirToggle() {
      document.querySelectorAll('#tmd-dirtoggle .pk-segbtn').forEach((b) => {
        const on = b.dataset.dir === dir; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    function syncDensToggle() {
      document.querySelectorAll('#tmd-denstoggle .pk-segbtn').forEach((b) => {
        const on = b.dataset.den === density; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    // Notifications primary: mark every unread item read.
    async function markAllRead() {
      const ids = unreadNotes().map((n) => n.id);
      if (!ids.length) return;
      const prim = $('#tmd-primary'); prim.disabled = true;
      try {
        await store.markRead(ids, true);
        notes.forEach((n) => { if (ids.includes(n.id)) n.readTeam = true; });
        counts(); render(); lastSig = dataSig();
      } catch (err) { prim.disabled = false; pkAlert('Could not update — ' + err.message); }
    }

    // ---- login (the shared common login — Team + Key) ----
    let login = null;
    /* An account session carries no team key — the sentinel opens the board locally while
     * authHeaders() authenticates every call with the bearer token. A key belonging to a PERSON
     * also means the board can send them to the right place: their own team's, not whichever one
     * they happened to pick from a dropdown. */
    function afterAccount(user) {
      /* A BUILDER who signs in on a team board is here to see THAT team. Sending them to the
       * Builder board — which is what `role === 'builder' -> ADMIN_TEAM` did — answers a question
       * they did not ask, and makes the team dropdown look broken: pick a team, get asked to sign
       * in, end up back where you started.
       *
       * Their session team stays ADMIN_TEAM, because that is what OVERRIDE keys on to grant a
       * Builder read of someone else's board. OVERRIDE is computed once at module load, before
       * this sign-in happened, so a reload is what puts them in the team view — with the session
       * already established, it comes straight up. */
      const isBuilder = user.role === 'builder';
      const slugTeam = teamFromSlug(slugInUrl());
      if (isBuilder) {
        setSession(ADMIN_TEAM, ACCOUNT_KEY_SENTINEL);
        location.reload();
        return;
      }
      const t = user.team || '';
      if (!t) { login.setError('This account has no team assigned. Ask the Builder to add you to one.'); return; }
      setSession(t, ACCOUNT_KEY_SENTINEL);
      if (teamSlug(t) !== teamSlug(slugTeam || t)) { location.replace(boardBase(t)); return; }
      loadData()
        .then(() => { hideLogin(); openPendingDetail(); startAutoRefresh(); startLiveUpdates(); })
        .catch((e) => { clearSession(); clearAccount(); login.setError('Signed in, but the board would not load — ' + e.message); });
    }

    function showLogin() {
      if (!login) {
        /* The access key, the same screen as everywhere else. It replaces a Team dropdown plus a
         * shared team key: two questions where there is one, and a credential belonging to a team
         * rather than to a person — so the board could not tell who had opened it, and anyone with
         * the key could open any team they chose. */
        login = buildAccessLogin({
          title: 'Access Key',
          sub: 'Two letters, then six digits.',
          onSubmit: async (code) => {
            login.setBusy(true);
            try {
              const body = await accessLogin(WORKER_URL, code);
              login.setBusy(false); login.accept(); afterAccount(body.user);
            } catch (e) {
              login.setBusy(false);
              login.reject(e && e.locked ? 'Too many attempts. Try again shortly.'
                                         : 'Access denied. Please enter the correct access key.');
            }
          },
          onBiometric: async () => {
            login.setBusy(true);
            try {
              const body = await passkeyLoginDiscoverable(WORKER_URL);
              login.setBusy(false); login.accept(); afterAccount(body.user);
            } catch (e) {
              login.setBusy(false);
              login.setError('No passkey was used. Enter your access key instead.');
            }
          },
          onEmail: () => { location.href = BASE + '/login/'; },
        });
      }
      login.setError('');
      document.body.appendChild(login.el);
      login.el.hidden = false;
      login.focus();
    }
    function hideLogin() { login && login.el.remove(); }

    // Reveal the gated-off stub and hide the app shell (init calls this when the
    // signed-in/previewed team is parked off via TEAM_ENABLED). CSS keys `display`
    // off `:not([hidden])`, so clearing/​setting `hidden` is all that's needed.
    function showBlocked() {
      const b = $('#tmd-blocked'); const app = $('.pk-app');
      if (b) b.hidden = false;
      if (app) app.hidden = true;
    }

    async function tryLogin() {
      const t = login.getTeam();
      const key = login.keyInput.value.trim();
      if (!t) { login.focusTeam(); login.setError('Please choose your team.'); return; }
      if (!key) { login.keyInput.focus(); return; }
      setSession(t, key);
      login.setBusy(true, 'Authenticating'); login.setError('');
      if (t === ADMIN_TEAM && !OVERRIDE) { location.replace(boardBase(ADMIN_TEAM)); return; }
      try { await loadData(); hideLogin(); openPendingDetail(); startAutoRefresh(); startLiveUpdates(); }
      catch (e) {
        clearSession();
        login.setBusy(false, 'Authenticate');
        login.setError(e.message === 'unauthorized' ? 'Incorrect team or key.' : ('Could not connect — ' + e.message));
        login.keyInput.focus(); login.keyInput.select();
      }
    }

    // Deep-link: the on-page overlay's "View details" button lands here as `?detail=<id>` — open
    // that ticket's detail straight away (once data is loaded), then strip the param (keeping any
    // other, e.g. ?team=) so a refresh/Back doesn't re-trigger. No-ops if the id isn't in this team's data.
    /* Apply the URL to the board — once after first load, and on every Back/Forward.
     * An id this team cannot see is the shared-link case (the Worker masks other teams' tickets),
     * and it must be explained rather than silently ignored. */
    let missingDetail = '';
    function applyUrl(replace) {
      const u = readUrl();
      if (u.view) setView(u.view, true);
      const id = u.ticket ? idOfTicketNo(u.ticket) : '';
      let absent = '';
      if (id) {
        if (roots().find((x) => x.id === id) || comments.find((x) => x.id === id)) entryDetail = id;
        else { entryDetail = null; absent = u.ticket; }
      } else entryDetail = null;
      syncUrl(replace);
      render();
      if (absent && absent !== missingDetail) {
        missingDetail = absent;
        pkAlert({ title: 'Ticket not available', message: 'That ticket isn’t on this board — it may belong to another team, or it may have been deleted. Showing your queue instead.' });
      }
      if (!absent) missingDetail = '';
    }
    // Kept for its old call sites; it is now "restore from the URL", not "consume a one-shot param".
    function openPendingDetail() { applyUrl(true); }
    window.addEventListener('popstate', () => { if (!getSession().key) return; applyUrl(true); });

    function init() {
      if (LOCAL) ensureDemoReset();
      // The status sub-filter vocabulary is view-aware and owned by buildFilterBar() (Team
      // Queue vs Completed); it's built on the first render, so nothing to seed here.
      const s = getSession();
      // Before anything renders: a team on someone else's slug is bounced to its own board.
      if (!guardBoardIdentity()) return;
      // An admin who landed here WITHOUT a team slug wants the Builder board.
      if (s.key && s.team === ADMIN_TEAM && !OVERRIDE) { location.replace(boardBase(ADMIN_TEAM)); return; }
      // Team parked off via TEAM_ENABLED while still signed in: show the "no access"
      // stub instead of the app (login.js blocks new sign-ins; this catches a live
      // session whose team was disabled). Admin override previewing a parked team also
      // lands here — that team's board genuinely isn't available.
      if (s.key && team() && !isTeamEnabled(team())) { showBlocked(); return; }
      if (s.key && (s.team || OVERRIDE)) {
        loadData().then(() => { openPendingDetail(); startAutoRefresh(); startLiveUpdates(); }).catch((e) => {
          if (e.message === 'unauthorized') { clearSession(); showLogin(); }
          else { $('#tmd-empty').hidden = false; $('#tmd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else showLogin();
    }

    // ---- events ----
    // Nav-tab switch with motion around Settings — mirrors the Builder dashboard. Settings is much
    // shorter than the ticket list, so rendering it while scrolled would shrink the page and clamp
    // the scroll in one abrupt jump. Entering Settings from a scrolled view first glides to the top
    // on the current (tall) content, waits for that scroll to finish, THEN swaps + plays the
    // slide-in. Leaving just renders and nudges to top if needed. Honours reduced-motion.
    function pkNavSwitch(prev, next, renderFn, settingsViewId) {
      const enterSettings = next === 'settings' && prev !== 'settings';
      const leaveSettings = prev === 'settings' && next !== 'settings';
      const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const slideIn = () => {
        if (!enterSettings) return;
        const sv = document.getElementById(settingsViewId);
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
    $('.pk-side').addEventListener('click', (e) => {
      const b = e.target.closest('.pk-nav'); if (!b) return;
      const prev = view;
      view = b.dataset.view; entryDetail = null;
      syncUrl();   // a nav click IS a navigation — this is what Back walks back through
      document.querySelectorAll('.pk-nav').forEach((n) => n.classList.toggle('is-active', n === b));
      pkNavSwitch(prev, view, () => render(), 'tmd-view-settings');
    });
    // Direction toggle (Inbound │ Outbound) — a control on My Tickets; flips From⇄To, resets the
    // counterparty filter, re-renders in place (search/status/sort untouched).
    const tmdDir = $('#tmd-dirtoggle');
    if (tmdDir) tmdDir.addEventListener('click', (e) => {
      const b = e.target.closest('.pk-segbtn'); if (!b || b.dataset.dir === dir) return;
      dir = b.dataset.dir; fromFilter = '';
      syncDirToggle(); render();
    });
    // Density toggle (Cards │ Table).
    const tmdDens = $('#tmd-denstoggle');
    if (tmdDens) tmdDens.addEventListener('click', (e) => {
      const b = e.target.closest('.pk-segbtn'); if (!b || b.dataset.den === density) return;
      density = b.dataset.den; saveDensity();
      syncDensToggle(); render();
    });
    // Status-chip row — pure filter; "More" expands the overflow slices.
    const tmdChips = $('#pk-statuschips');
    if (tmdChips) tmdChips.addEventListener('click', (e) => {
      const more = e.target.closest('.pk-schip--more');
      if (more) { statusMoreOpen = !statusMoreOpen; renderStatusChips(); return; }
      const b = e.target.closest('.pk-schip'); if (!b || !b.dataset.f || b.dataset.f === statusFilter) return;
      statusFilter = b.dataset.f; entryDetail = null; syncUrl(true); render();
    });
    // Pending Signoff hero tile — a shortcut into the deployed-awaiting-my-confirm slice:
    // land on My Tickets, Outbound, Deployed chip (the exact set the tile counts).
    const tmdCounts = $('#tmd-counts');
    if (tmdCounts) tmdCounts.addEventListener('click', (e) => {
      if (!e.target.closest('[data-goto-deployed]')) return;
      setView('queue');
      dir = 'outbound'; fromFilter = ''; statusFilter = 'deployed_live'; entryDetail = null; syncUrl(true);
      render();
    });
    // Resubmit + card-open detail (delegated across both card containers).
    $('.pk-content').addEventListener('click', (e) => {
      const rs = e.target.closest('[data-resubmit]');
      if (rs) { e.stopPropagation(); doResubmit(rs); return; }
      // Confirm Bug Fix — the raiser verifies a deployed fix (replaces View details until confirmed).
      const cf = e.target.closest('[data-confirmfix]');
      if (cf) { e.stopPropagation(); doConfirm(cf); return; }
      // Reopen — the raiser rejects a deployed fix, sending it back to Builder (with a reason).
      const rf = e.target.closest('[data-reopenfix]');
      if (rf) { e.stopPropagation(); doReopenFix(rf); return; }
      // View details button — open the ticket detail (same as clicking the card body).
      const vd = e.target.closest('[data-viewdetails]');
      if (vd) { e.stopPropagation(); setDetail(vd.dataset.viewdetails); return; }
      // ⋮ menu — the team's Revoke action.
      const more = e.target.closest('[data-more]');
      if (more) { e.stopPropagation(); const root = roots().find((x) => x.id === more.dataset.more); if (root) openRowMenu(more, root); return; }
      // Comments toggle (shared card) — animate the thread open/closed.
      const tog = e.target.closest('.pkc-commentstoggle');
      if (tog) {
        const wrap = document.querySelector('.pkc-comments[data-replies-for="' + tog.dataset.replies + '"]');
        if (wrap) { const open = !wrap.classList.contains('is-open'); wrap.classList.toggle('is-open', open); tog.classList.toggle('is-open', open); }
        return;
      }
      if (e.target.closest('a, button')) return;
      const item = e.target.closest('.pkc-card[data-id]'); if (!item) return;
      // In select mode the card IS the checkbox — drilling in mid-selection loses the set.
      if (selectMode) {
        e.preventDefault();
        const id = item.dataset.id;
        sel.has(id) ? sel.delete(id) : sel.add(id);
        updateBulk(); render();
        return;
      }
      setDetail(item.dataset.id);
    });
    $('#tmd-filters').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-filter'); if (!b) return;
      filter = b.dataset.filter; entryDetail = null; syncUrl(true);
      // Dispatch through render() so the ACTIVE view repaints — Team Queue OR Completed
      // (both share this filter bar now); buildFilterBar re-syncs the is-active state.
      render();
    });
    // By Page — shared across all tabs.
    $('#tmd-bypage').addEventListener('click', (e) => {
      byPage = !byPage; entryDetail = null; syncUrl(true);
      e.currentTarget.classList.toggle('is-active', byPage);
      render();
    });
    // Primary button — one slot, one action per tab.
    $('#tmd-primary').addEventListener('click', () => {
      if (view === 'notifs') markAllRead();
      else clearFilters();
    });
    // Feature 11: capture the current filter set as a shared Team view.
    const saveViewBtn = $('#tmd-saveview');
    if (saveViewBtn) saveViewBtn.addEventListener('click', () => saveCurrentView());
    // Keyboard-open a card's detail (links/buttons inside pass through).
    $('.pk-content').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest && e.target.closest('.pkc-card[data-id]'); if (!item) return;
      e.preventDefault(); setDetail(item.dataset.id);
    });
    // Search across the active view.
    $('#tmd-search').addEventListener('input', (e) => { search = e.target.value.trim(); entryDetail = null; syncUrl(true); render(); });
    // From-team filter chips.
    // The collapsed chip or the ▸ arrow opens the full team picker overlay.
    $('#tmd-teamchips').addEventListener('click', (e) => {
      if (e.target.closest('.pk-tchip, .pk-chips-more')) openTeamOverlay();
    });
    // Sort — the shared custom dropdown.
    const sortDD = buildDropdown({
      small: true, value: sort,
      items: [
        { value: 'new', label: 'Newest First' },
        { value: 'old', label: 'Oldest First' },
        { value: 'page', label: 'Page A–Z' },
      ],
      onSelect: (v) => { sort = v; entryDetail = null; syncUrl(true); render(); },
    });
    $('#tmd-sort-mount').appendChild(sortDD.el);
    // Admin can push a global theme (SSE); repaint so JS-inlined chip colours re-derive.
    document.addEventListener('pk:themechange', () => { try { render(); } catch (e) {} });
    // Comments-tab read state: per-item toggle + "Mark all read" (mirror of the Notifications
    // controls). Bound once on the threads host; the buttons are ignored by the card-open handler.
    const threadsHostEl = $('#tmd-view-threads');
    if (threadsHostEl) threadsHostEl.addEventListener('click', async (e) => {
      const one = e.target.closest('.pk-thread-toggle');
      const all = one ? null : e.target.closest('#tmd-thread-read');
      if (!one && !all) return;
      const btn = one || all; btn.disabled = true;
      try {
        const items = one
          ? [{ id: one.dataset.id, path: one.dataset.path, url: one.dataset.url || '' }]
          : unreadThreads().map(threadOrigin).map((o) => ({ id: o.id, path: o.page.path, url: o.page.url || '' }));
        const read = one ? (one.dataset.read === '1') : true;
        await store.markThreadsRead(items, read);
        const ids = new Set(items.map((i) => i.id));
        comments.forEach((c) => { if (!c.parentId && ids.has(c.id)) c.readTeam = read; });
        counts(); render(); lastSig = dataSig();
      } catch (err) { btn.disabled = false; pkAlert('Could not update — ' + err.message); }
    });
    // Per-item read/unread toggle + whole-card drill-in to the ticket detail.
    $('#tmd-notes').addEventListener('click', async (e) => {
      const b = e.target.closest('.tmd-note-toggle');
      if (b) {
        const id = b.dataset.id;
        const read = b.dataset.read === '1';
        b.disabled = true;
        try {
          await store.markRead([id], read);
          const n = notes.find((x) => x.id === id);
          if (n) n.readTeam = read;
          counts(); render(); lastSig = dataSig();
        } catch (err) { b.disabled = false; pkAlert('Could not update — ' + err.message); }
        return;
      }
      // Card click → open the notification's ticket detail (its chain root). Links/buttons
      // inside (Open Pin, Mark read) pass through and are handled above / by the browser.
      if (e.target.closest('a, button')) return;
      const note = e.target.closest('.pk-notif[data-chain]');
      if (note && note.dataset.chain) setDetail(note.dataset.chain);
    });
    // Keyboard-open a notification card's ticket detail.
    $('#tmd-notes').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const note = e.target.closest && e.target.closest('.pk-notif[data-chain]');
      if (!note || !note.dataset.chain) return;
      e.preventDefault(); setDetail(note.dataset.chain);
    });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    $('#tmd-refresh').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.classList.contains('is-refreshing')) return;
      btn.classList.add('is-refreshing');
      const t0 = Date.now();
      try { await loadData(); await wait(Math.max(0, 550 - (Date.now() - t0))); }
      catch (err) { pkAlert('Could not refresh — ' + err.message); }
      finally { btn.classList.remove('is-refreshing'); }
    });
    // Log out — end the session and return to the sign-in panel.
    const logoutEl = $('#tmd-logout');
    if (logoutEl) logoutEl.addEventListener('click', async () => {
      if (!(await pkConfirm({ title: 'Log out', message: 'Log out of Proofkit?', confirmLabel: 'Log out' }))) return;
      stopLiveUpdates();   // the SSE socket is authenticated — it goes with the session
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }  // after: stopLiveUpdates re-arms the poll
      clearSession();
      showLogin();
    });

    // Footer link. For a real team member it's the faded "Upgrade access to admin" (drops the
    // team session → admin door). For an admin previewing a team board (OVERRIDE = unlocked),
    // it becomes a "Builder Mode" bar pinned to the bottom of the screen that returns to the
    // admin console with the admin session intact.
    /* The "← Builder Mode" bar is gone. It was a full-width fixture pinned to the bottom of every
     * page of every team board, saying what the heading already says: the team NAME is the route
     * back, and it carries a title explaining so. One affordance, in the place a person is already
     * looking, beats a second one shouting from the floor of the screen. */
    const upgrade = $('#tmd-upgrade');
    if (upgrade) {
      const foot = upgrade.closest('.tmd-foot');
      if (foot) foot.remove(); else upgrade.remove();
    }

    // Jump to Builder Mode: an admin previewing a team board (OVERRIDE) keeps its session; a real
    // team member drops the team session and lands on the Builder login (authenticate as Builder).
    function goBuilder() {
      if (OVERRIDE) { location.href = boardBase(ADMIN_TEAM); return; } // back to Builder Mode (session kept)
      clearSession();
      location.href = boardBase(ADMIN_TEAM) + '?login=builder';
    }

    // Keyboard shortcut: press "B" on a team dashboard to jump to Builder Mode. Ignored while
    // typing in a field, with a modifier held, or on key-repeat.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'b' && e.key !== 'B') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      goBuilder();
    });

    // Colour mode in the rail, above Log out — the same labelled row Builder's rail carries, and
    // the same control Settings → Appearance mounts (one preference, several entry points).
    try {
      const sideTheme = document.querySelector('[data-pk-sidetheme]');
      if (sideTheme && !sideTheme.firstChild) sideTheme.appendChild(buildThemeToggle({ row: true }));
    } catch (e) {}

    // Side-rail logout mirrors the header control — same confirm + teardown, one implementation.
    try {
      const sideOut = document.querySelector('[data-pk-sidelogout]');
      const headOut = document.getElementById('tmd-logout');
      if (sideOut && headOut) sideOut.addEventListener('click', () => headOut.click());
    } catch (e) {}

    init();
  })();
