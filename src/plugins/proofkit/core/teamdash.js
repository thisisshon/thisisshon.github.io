  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, pageName, ADMIN_TEAM,
    buildPanelLogin, buildDropdown, getSession, setSession, clearSession, initLocalTheme, mountThemeToggle, ensureDemoReset, isTeamEnabled,
    COMMENT_TYPES, TYPE_FIELDS, REOPEN_REASONS, STATUS_COLORS, reopenReasonLabel, renderSummary, needsExpectedOutcome } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter). Each team member
    // controls their OWN light/dark mode — an individual, per-browser toggle (never the
    // admin's global one). initLocalTheme applies the remembered choice; the toggle flips
    // it locally and persists it, so the next login on this browser starts in that mode.
    initLocalTheme(); mountThemeToggle('[data-pk-toggle]', { local: true });
    const LOCAL = !WORKER_URL;

    // Admin override: Builder (admin) can open ANY team's board via /teamdash?team=<T>
    // (the "Jump To Team" dropdown on the admin dashboard). The admin key has full access
    // on the Worker, so it returns that team's inbox. Non-admins can never impersonate —
    // the param is honoured only for an admin session, and the Worker enforces it too.
    const OVERRIDE = (() => {
      try {
        const t = new URLSearchParams(location.search).get('team');
        return t && TEAMS.includes(t) && getSession().team === ADMIN_TEAM ? t : '';
      } catch { return ''; }
    })();

    // The effective team: the admin-chosen override, else the signed-in team (config).
    const team = () => OVERRIDE || getSession().team;

    // ---- transport: Worker (X-Review-Pass) or the localStorage demo store ----
    async function apiFetch(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json' };
      const pass = getSession().key; // the one shared session key
      if (pass) headers['X-Review-Pass'] = pass;
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
      page: c.page, anchor: c.anchor || {},
      // the real-time state machine (to_be_initiated | in_progress | deployed_live | reopened)
      teamStatus: c.teamStatus || 'to_be_initiated', teamStatusAt: c.teamStatusAt || '',
      // reopen is an enum + optional note (Feature 3); the raiser sees the reason label + note
      reopenReason: c.reopenReason || '', reopenNote: c.reopenNote || '',
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
      const where = (sub.page && sub.page.title) || (sub.page && sub.page.path) || 'a page';
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
      localStorage.setItem(key, JSON.stringify(arr));
      const target = (team() === (root.team || '')) ? (root.toTeam || '') : (root.team || '');
      if (target) {
        const where = (root.page && root.page.title) || (root.page && root.page.path) || 'a page';
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
          notifs: async () => localNotifs(team()),
          markRead: async (ids, read = true) => localMarkRead(ids, read),
          resubmit: async (rec) => localResubmit(rec),
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
          notifs: () => apiFetch('/notifications?team=' + encodeURIComponent(team())),
          markRead: (ids, read = true) => apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids, team: team(), read }) }),
          // Content re-raises a reopened ticket. Contract body: { id }.
          resubmit: (rec) => apiFetch('/resubmit', { method: 'POST', body: JSON.stringify({ id: rec.id }) }),
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
    const typeLabel = (c) => { const m = typeMeta(c && c.commentType); return (m && c.commentType !== 'general') ? m.label : ''; };
    const fieldsFor = (t) => (TYPE_FIELDS[t] || []);
    // The one-line preview: the record's server-rendered summary, else derived locally.
    const summaryOf = (c) => c.summary || renderSummary(c.commentType || 'general', c.templateFields || {}, c.comment || '');
    // The reopen label the RAISER sees (enum label; falls back to any legacy free-text reason).
    const reopenLabelOf = (c) => reopenReasonLabel(c && c.reopenReason) || (c && c.reopenReason) || '';
    // A single detail field row (shared by renderDetail + typedFieldRows).
    const fieldRow = (k, vHtml) => `<div class="tmd-field"><div class="tmd-field-k">${k}</div><div class="tmd-field-v">${vHtml}</div></div>`;
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
        else { el.classList.add('is-empty'); el.innerHTML = `<span class="tmd-thumb-ph">preview unavailable</span>`; }
      }
    }
    // A thumbnail tile (small on cards, large in detail). Empty imageId ⇒ nothing.
    const thumbTile = (imageId, big) => imageId
      ? `<span class="tmd-thumb${big ? ' tmd-thumb-lg' : ''}" data-imgid="${esc(imageId)}"><span class="tmd-thumb-ph">preview…</span></span>`
      : '';

    // ---- the real-time status, framed for the RAISER (Content): everything Content
    // submitted sits "with builder" until it goes live or is bounced back. ----
    const TEAM_STATUS = {
      to_be_initiated: ['tbi', 'With builder – TBI'],
      in_progress: ['inprog', 'With builder – in progress'],
      deployed_live: ['deployed', 'Deployed live'],
      reopened: ['reopened', 'Reopened'],
    };
    const teamStatusOf = (c) => (TEAM_STATUS[c && c.teamStatus] ? c.teamStatus : 'to_be_initiated');
    const dataState = (c) => TEAM_STATUS[teamStatusOf(c)][0];
    const statusLabel = (c) => TEAM_STATUS[teamStatusOf(c)][1];
    const statusChip = (c) => { const [cls, label] = TEAM_STATUS[teamStatusOf(c)]; return `<span class="tmd-chip ${cls}">${label}</span>`; };

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
      const s = teamStyle(t);
      return `<span class="tmd-team-chip" style="background:${s.bg};color:${s.fg};border:1px solid ${s.bd}">${esc(t)}</span>`;
    };

    // ---- ticket-chain (iteration) model ----
    // A resubmit sub-ticket AND a comment reply both carry a parentId → the origin root id.
    // They are told apart by iteration: a reply is iteration 1 (parentId set), a sub-ticket
    // is iteration ≥ 2. Iteration members = the origin root + its resubmit sub-tickets; the
    // LIVE record of a chain is the highest-iteration member (its teamStatus is "now").
    const isReply = (c) => !!c.parentId && (c.iteration || 1) < 2;
    const chainOf = (c) => c.parentId || c.id; // origin root id for the whole family

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
      } catch (e) { alert('Copy failed — ' + e.message); }
    }
    // Human label for one history event (Content framing).
    function eventLabel(h) {
      const e = h.event || '', st = h.status || '';
      if (e === 'created') return 'Raised';
      if (e === 'resubmitted' || e === 'resubmit') return 'Resubmitted for another pass';
      if (e === 'team-start' || e === 'start' || st === 'in_progress') return 'Builder started — in progress';
      if (e === 'team-complete' || e === 'complete' || st === 'deployed_live') return 'Deployed live';
      if (e === 'team-reopen' || e === 'reopen' || st === 'reopened') {
        const label = reopenReasonLabel(h.reason) || h.reason || '';
        return 'Reopened by Builder' + (label ? ' — ' + label : '') + (h.note ? ' (' + h.note + ')' : '');
      }
      return 'Status → ' + (st || '');
    }

    // ---- state ----
    let comments = [], notes = [], view = 'comments', filter = 'all', byPage = false;
    let search = '', sort = 'new', fromFilter = '', entryDetail = null;
    let landed = false; // set once we've landed on the first visible tab (post first load)
    let lastSig = '';   // signature of the last-rendered data — lets polling skip no-op re-renders
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
      else if (sort === 'page') s.sort((a, b) => a.page.path.localeCompare(b.page.path) || (a.createdAt < b.createdAt ? 1 : -1));
      else s.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest
      return s;
    }
    // COMPLETED tab — everything Content submitted that is still in flight or live
    // (to_be_initiated / in_progress / deployed_live). Reopened items drop OUT to Active.
    function completedRoots() {
      let rs = roots().filter((c) => teamStatusOf(c) !== 'reopened');
      if (filter === 'to_be_initiated') rs = rs.filter((c) => teamStatusOf(c) === 'to_be_initiated');
      else if (filter === 'in_progress') rs = rs.filter((c) => teamStatusOf(c) === 'in_progress');
      else if (filter === 'deployed_live') rs = rs.filter((c) => teamStatusOf(c) === 'deployed_live');
      if (fromFilter) rs = rs.filter((c) => (c.team || '') === fromFilter);
      return sortRoots(rs.filter(matchesSearch));
    }
    // ACTIVE queue — items Builder bounced back (reopened) for Content to clarify + resubmit.
    function activeRoots() {
      let rs = roots().filter((c) => teamStatusOf(c) === 'reopened');
      if (fromFilter) rs = rs.filter((c) => (c.team || '') === fromFilter);
      return sortRoots(rs.filter(matchesSearch));
    }
    // The canonical (unfiltered) active set — drives the nav badge + counts.
    const reopenedRoots = () => roots().filter((c) => teamStatusOf(c) === 'reopened');

    // ---- data ----
    async function loadData() {
      // Feature 11: pull the team's saved "Team views" ONCE (not on every 5s poll).
      if (!viewsLoaded) { viewsLoaded = true; loadViews().then(() => renderViewChips()); }
      const [c, n] = await Promise.all([store.comments(), store.notifs()]);
      comments = Array.isArray(c) ? c : [];
      notes = Array.isArray(n) ? n : [];
      // Polling runs every ~5s; skip the whole re-render when the data is byte-identical
      // to what's already on screen. This stops the entry animation replaying (and the DOM
      // churn / scroll jump) on every idle poll — we only repaint when something actually changed.
      const sig = dataSig();
      if (landed && sig === lastSig) return;
      lastSig = sig;
      renderHeader(); counts();   // counts() → updateActiveBadge() toggles the Active tab's visibility
      // Land on the first VISIBLE tab on first load; thereafter only re-home if the
      // current tab has just been hidden (e.g. Active after its last item is resubmitted).
      const cur = document.querySelector('.tmd-nav[data-view="' + view + '"]');
      if (!landed || !cur || cur.hidden) { landed = true; setView(firstVisibleView()); }
      render();
    }
    // Poll on the shared ~5s debounced cadence (the Worker coalesces server-side).
    let refreshTimer = null;
    function startAutoRefresh() {
      if (refreshTimer) return;
      refreshTimer = setInterval(() => { if (!document.hidden) loadData().catch(() => {}); }, 5000);
      window.addEventListener('focus', () => loadData().catch(() => {}));
    }

    function renderHeader() {
      const tt = $('#tmd-tag-team');
      if (tt) tt.innerHTML = team() ? ' | <span class="tmd-team-hi">' + esc(team()) + '</span>' : '';
      const h1 = document.querySelector('.tmd-h1');
      if (h1) h1.textContent = team() ? team() + ' Team' : 'Team';
      const badge = $('#tmd-navbadge');
      const u = unreadNotes().length;
      if (badge) { badge.textContent = u; badge.hidden = u === 0; }
      // Relabel the nav for the Phase-1 workflow (shell text is generic).
      const nav = (v) => document.querySelector('.tmd-nav[data-view="' + v + '"]');
      const cn = nav('comments'); if (cn && cn.firstChild) cn.firstChild.textContent = 'Completed';
      const dn = nav('delivery'); if (dn && dn.firstChild) dn.firstChild.textContent = 'Active';
    }

    // A status-token dot (STATUS_COLORS: teamStatus → --pk-* token) leading a count tile.
    const statusDot = (s) => `<span class="tmd-count-dot" style="background:var(${STATUS_COLORS[s] || '--pk-muted'})"></span>`;
    function counts() {
      const rs = roots();
      const inFlight = rs.filter((c) => teamStatusOf(c) === 'to_be_initiated' || teamStatusOf(c) === 'in_progress').length;
      const live = rs.filter((c) => teamStatusOf(c) === 'deployed_live').length;
      const reop = reopenedRoots().length;
      const el = $('#tmd-counts');
      if (el) el.innerHTML =
        `<span class="tmd-count tmd-count-inprog"><b>${inFlight}</b>${statusDot('in_progress')} With builder</span>` +
        `<span class="tmd-count tmd-count-done"><b>${live}</b>${statusDot('deployed_live')} Deployed live</span>` +
        `<span class="tmd-count tmd-count-reopened"><b>${reop}</b>${statusDot('reopened')} Reopened</span>`;
      updateActiveBadge();
    }
    // The Active (bounceback) category only exists when Builder has reopened something.
    // Hide the whole nav tab — indication and all — when the queue is empty; show it
    // (with its live count) the moment an item is bounced back.
    function updateActiveBadge() {
      const n = reopenedRoots().length;
      const b = $('#tmd-badge-delivery');
      if (b) { b.textContent = n; b.hidden = n === 0; }
      const navBtn = $('.tmd-nav[data-view="delivery"]');
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
          `<span class="tmd-ack-lbl"><span class="tmd-reopen-badge">Reopened${label ? ': ' + esc(label) : ''}</span> by <b>${esc(root.toTeam || 'Builder')}</b></span>` +
          (note ? `<span class="tmd-ack-note">“${esc(note)}”</span>` : '') +
        `</div>` +
        `<span class="tmd-ack-btns">` +
          `<button type="button" class="tmd-ack-btn tmd-ack-conclude" data-resubmit="${id}">Resubmit</button>` +
        `</span>` +
      `</div>`;
    }

    function card(root) {
      const a = root.anchor || {};
      const tl = typeLabel(root);        // '' for general (zero regression)
      const sum = summaryOf(root);       // one-line typed preview
      const replies = repliesOf(root);
      const repliesHtml = replies.length
        ? `<div class="tmd-replies">` + replies.map((r) =>
            `<div class="tmd-reply">${teamChip(r.team)}<div class="tmd-rtxt">${esc(r.comment)}</div>` +
            (r.changeTo ? `<div class="tmd-change"><span>Change to</span><div>${esc(r.changeTo)}</div></div>` : '') +
            `<div class="tmd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div>`
        : '';
      const id = esc(root.id);
      const iter = root.iteration || 1;
      const isReopened = teamStatusOf(root) === 'reopened';
      // Direction: raised by us TO Builder (Phase 1 receiver is always Builder).
      const dir = (root.toTeam && root.toTeam !== team())
        ? `To <b>${esc(root.toTeam)}</b>` : '';
      return (
        `<article class="tmd-item" data-id="${id}" data-state="${dataState(root)}" tabindex="0" role="button" aria-label="View comment details">` +
          `<div class="tmd-card-row">` +
            `<div class="tmd-card-main">` +
              `<div class="tmd-card-top">` +
                `<div class="tmd-card-title">` +
                  (tl ? `<p class="tmd-typeline"><span class="tmd-type-chip">${esc(tl)}</span>` +
                    (sum && sum !== root.comment ? `<span class="tmd-type-sum">${esc(sum)}</span>` : '') + `</p>` : '') +
                  `<p class="tmd-comment">${esc(root.comment)}` +
                    (replies.length ? ` <span class="tmd-n">${replies.length + 1} comments</span>` : '') + `</p>` +
                  (a.snippet
                    ? `<p class="tmd-selel"><span class="tmd-selel-lbl">Selected element:</span> ` +
                      `<span class="tmd-selel-val">“${esc(a.snippet)}” on ` +
                      `<a class="tmd-selel-page" href="${esc(root.page.path)}" target="_blank" rel="noopener">${esc(pageName(root.page.path))}</a></span></p>`
                    : '') +
                `</div>` +
                (dir ? `<p class="tmd-raised">${dir}</p>` : '') +
              `</div>` +
              (root.imageId ? `<div class="tmd-media">${thumbTile(root.imageId, false)}</div>` : '') +
              (root.changeTo ? `<div class="tmd-change"><span>Change to</span><div>${esc(root.changeTo)}</div></div>` : '') +
              (isReopened ? reopenBand(root) : '') +
              `<div class="tmd-card-actions">` +
                `<a class="tmd-openpin" href="${esc(root.page.path)}?review=1#c=${id}" target="_blank" rel="noopener">Open Pin</a>` +
                `<span class="tmd-detailhint">View details →</span>` +
              `</div>` +
            `</div>` +
            `<div class="tmd-card-rail">` +
              `<div class="tmd-rail-top">` +
                statusChip(root) +
                (root.ticket ? `<span class="tmd-ticket">#${esc(root.ticket)}</span>` : '') +
                (iter > 1 ? `<span class="tmd-iter">Iteration ${iter}</span>` : '') +
              `</div>` +
              `<span class="tmd-card-time">${esc(fmtTimeDate(root.createdAt))}</span>` +
            `</div>` +
          `</div>` +
          repliesHtml +
        `</article>`
      );
    }

    // From-team filter chips — the teams that raised the items in this inbox.
    function buildTeamChips() {
      const host = $('#tmd-teamchips'); if (!host) return;
      const present = [...new Set(roots().map((c) => c.team).filter(Boolean))]
        .sort((a, b) => TEAMS.indexOf(a) - TEAMS.indexOf(b));
      const one = (label, t) => {
        const active = fromFilter === t;
        let style;
        if (active && t) { const acc = (TEAM_COLORS[t] || [])[1] || 'var(--pk-red)'; style = `background:${acc};color:var(--pk-on-accent);border-color:${acc}`; }
        else if (active) style = 'background:var(--pk-red);color:var(--pk-on-accent);border-color:var(--pk-red)';
        else if (t) { const s = teamStyle(t); style = `background:${s.bg};color:${s.fg};border-color:${s.bd}`; }
        else style = 'background:var(--pk-elev);color:var(--pk-body);border-color:var(--pk-hair)';
        return `<button class="tmd-tchip${active ? ' is-active' : ''}" data-team="${esc(t)}" style="${style}">${esc(label)}</button>`;
      };
      host.hidden = present.length < 2;
      host.innerHTML = present.length < 2 ? ''
        : '<span class="tmd-chips-from">From</span>' + one('All Teams', '') + present.map((t) => one(t, t)).join('');
    }

    // ---- comment detail (typed fields · screenshot · AI prompt · timeline · quick questions) ----
    function renderDetail() {
      const c = roots().find((x) => x.id === entryDetail);
      const host = $('#tmd-list');
      if (!c) { entryDetail = null; return renderComments(); }
      const a = c.anchor || {};
      const where = a.snippet ? '“' + esc(a.snippet) + '”' + (a.tag ? ' · ' + esc(a.tag) : '') : (a.tag ? esc(a.tag) : '—');
      const hist = chainHistory(c);
      const replies = repliesOf(c);            // Feature 6: the quick-questions thread
      const tl = typeLabel(c);                 // change-type chip label ('' for general)
      const sum = summaryOf(c);                // one-line typed preview
      const reopLabel = reopenLabelOf(c);      // reopen enum label the raiser sees
      const reopened = teamStatusOf(c) === 'reopened';
      // Feature 8: the team's own success criteria (they submitted it) — read-only here.
      const outcome = needsExpectedOutcome(c.commentType) ? (c.expectedOutcome || '') : '';
      const field = (k, vHtml) => `<div class="tmd-field"><div class="tmd-field-k">${k}</div><div class="tmd-field-v">${vHtml}</div></div>`;
      const timeline = `<ol class="tmd-timeline">` + hist.map((h, i) =>
        `<li class="tmd-tl${i === hist.length - 1 ? ' is-current' : ''}">` +
          `<span class="tmd-tl-iter">-${h.iteration || 1}</span>` +
          `<span class="tmd-tl-event">${esc(eventLabel(h))}</span>` +
          `<span class="tmd-tl-time">${esc(fmt(h.at))}</span></li>`).join('') + `</ol>`;
      host.innerHTML =
        `<button class="tmd-back" id="tmd-back">← Back to list</button>` +
        `<article class="tmd-detail">` +
          `<h2 class="tmd-detail-title">${esc(c.comment)}</h2>` +
          `<div class="tmd-detail-chips">${statusChip(c)}` +
            (tl ? `<span class="tmd-type-chip">${esc(tl)}</span>` : '') +
            (reopened ? `<span class="tmd-reopen-badge">Reopened${reopLabel ? ': ' + esc(reopLabel) : ''}</span>` : '') +
            (c.toTeam ? '<span class="tmd-from">with ' + teamChip(c.toTeam) + '</span>' : '') +
            `<a class="tmd-slug" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">Open pin</a></div>` +
          // Feature 8: prominent Success-criteria callout for layout-tweak / image-swap.
          (outcome
            ? `<div class="tmd-criteria"><div class="tmd-criteria-k">Success criteria</div><div class="tmd-criteria-v">${esc(outcome)}</div></div>`
            : '') +
          // Feature 3: the reopen band — badge + reason label + Builder's note + Resubmit.
          (reopened ? reopenBand(c) : '') +
          // Feature 4: the full screenshot (large), placeholder on miss/failure.
          (c.imageId ? `<div class="tmd-field"><div class="tmd-field-k">Screenshot</div><div class="tmd-detail-media">${thumbTile(c.imageId, true)}</div></div>` : '') +
          `<div class="tmd-fields">` +
            // Feature 1: the one-line summary + labelled typed-field rows (never raw JSON).
            (tl && sum && sum !== c.comment ? field('Summary', esc(sum)) : '') +
            typedFieldRows(c) +
            field('Ticket', c.ticket ? `<span class="tmd-ticket">#${esc(c.ticket)}</span>` : '—') +
            field('Iteration', String(c.iteration || 1)) +
            field('Page', `<a class="tmd-slug" href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a> <span style="color:var(--pk-muted)">${esc(c.page.path)}</span>`) +
            field('Element / anchor', where) +
            field('Raised by', esc(c.name || 'anonymous') + (c.team ? ' · ' + esc(c.team) : '')) +
            field('Submitted', esc(fmt(c.createdAt))) +
            (c.changeTo ? `<div class="tmd-field"><div class="tmd-field-k">Change to</div><div class="tmd-change"><div>${esc(c.changeTo)}</div></div></div>` : '') +
            field('Status', esc(statusLabel(c))) +
            `<div class="tmd-field"><div class="tmd-field-k">AI change prompt</div>` +
              (c.aiPrompt || c.comment
                ? `<div class="tmd-prompt-box">${esc(localPrompt(c))}</div><button class="tmd-copyprompt" type="button">Copy prompt</button>`
                : `<div class="tmd-field-v" style="color:var(--pk-muted);font-style:italic">Generating…</div>`) + `</div>` +
            `<div class="tmd-field"><div class="tmd-field-k">Iteration timeline</div>${timeline}</div>` +
          `</div>` +
          // Feature 6: Quick questions — a reply thread fenced off from the status info above.
          // The team can post replies (parentId); posting NEVER changes status/iteration.
          `<section class="tmd-qq">` +
            `<div class="tmd-qq-head"><h3 class="tmd-qq-title">Quick questions</h3>` +
              `<span class="tmd-qq-sub">Ask Builder — replies never change status.</span></div>` +
            (replies.length
              ? `<div class="tmd-qq-thread">` + replies.map((r) =>
                  `<div class="tmd-reply">${teamChip(r.team)}<div class="tmd-rtxt">${esc(r.comment)}</div>` +
                  `<div class="tmd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div>`
              : `<p class="tmd-qq-empty">No questions yet.</p>`) +
            `<div class="tmd-qq-compose">` +
              `<textarea class="tmd-qq-input" placeholder="Write a quick question…" rows="2"></textarea>` +
              `<button class="tmd-ack-btn tmd-qq-send" type="button">Post reply</button>` +
            `</div>` +
          `</section>` +
        `</article>`;
      $('#tmd-back').addEventListener('click', () => { entryDetail = null; render(); });
      const cp = $('.tmd-copyprompt');
      if (cp) cp.addEventListener('click', () => copyToClip(localPrompt(c), cp, 'Copied ✓'));
      // Feature 6: post a quick-question reply (status untouched).
      const send = host.querySelector('.tmd-qq-send');
      const input = host.querySelector('.tmd-qq-input');
      if (send && input) send.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) { input.focus(); return; }
        send.disabled = true; send.textContent = 'Posting…';
        try { await store.reply(c, text); await loadData(); }
        catch (e) { send.disabled = false; send.textContent = 'Post reply'; alert('Could not post — ' + e.message); }
      });
      // Feature 4: hydrate the full-size screenshot thumbnail in place.
      hydrateThumbs(host);
    }

    // Shared "By Page" grouping: bucket items by page path (A–Z), each a titled .tmd-grid.
    function groupByPage(items, pathOf, renderItem, meta) {
      const paths = [...new Set(items.map(pathOf))].sort();
      return paths.map((p) => {
        const group = items.filter((it) => pathOf(it) === p);
        return `<div class="tmd-group"><h2 class="tmd-gh">` +
          `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
          (meta ? `<span>${esc(meta(group))}</span>` : '') +
          `</h2><div class="tmd-grid">${group.map(renderItem).join('')}</div></div>`;
      }).join('');
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
        host.innerHTML = `<div class="tmd-grid">${rs.map(card).join('')}</div>`;
      }
      const emp = $('#tmd-empty');
      emp.hidden = rs.length > 0;
      if (!rs.length) emp.textContent = search ? 'No items match your search.'
        : (filter !== 'all' || fromFilter) ? 'Nothing in this filter.'
        : 'Nothing submitted yet.';
      hydrateThumbs(host);   // Feature 4: fill card thumbnails in place
    }

    // ACTIVE tab — reopened items awaiting Content's clarify + resubmit.
    function renderActive() {
      const host = $('#tmd-view-delivery');
      const rs = activeRoots();
      let body;
      if (!reopenedRoots().length) {
        body = `<p class="tmd-empty">Nothing reopened. When Builder bounces an item back it lands here for you to clarify and resubmit.</p>`;
      } else if (!rs.length) {
        body = `<p class="tmd-empty">No reopened items match your search.</p>`;
      } else if (byPage) {
        body = groupByPage(rs, (c) => c.page.path, card, (g) => `${g.length} to resubmit`);
      } else {
        body = `<div class="tmd-grid">${rs.map(card).join('')}</div>`;
      }
      host.innerHTML = body;
      hydrateThumbs(host);   // Feature 4: fill card thumbnails in place
    }

    // A small speech-bubble glyph marks a Quick-questions reply notification (Feature 6).
    const REPLY_ICO = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    function noteItem(n) {
      const unread = n.readTeam === false;
      // Feature 6: a reply notification is flagged distinctly ("Reply"); everything else
      // is a status update and carries no chip.
      const chip = n.kind === 'reply' ? `<span class="tmd-chip tmd-chip-reply">${REPLY_ICO} Reply</span>` : '';
      return `<article class="tmd-note${unread ? ' is-unread' : ''}">` +
        `<span class="tmd-note-dot"></span>` +
        `<div class="tmd-note-body">` +
          `<div class="tmd-note-sum">${esc(n.summary || 'Your comment was updated.')}</div>` +
          `<div class="tmd-note-meta">` +
            `<a class="tmd-slug" href="${esc(n.path || '/')}" target="_blank" rel="noopener">${esc(pageName(n.path || '/'))}</a>` +
            `<span class="tmd-time">${esc(fmt(n.updatedAt || n.createdAt))}</span>` +
            chip +
            (n.commentId ? `<a class="tmd-openpin" href="${esc(n.path || '/')}?review=1#c=${esc(n.commentId)}" target="_blank" rel="noopener">Open Pin</a>` : '') +
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
              return `<div class="tmd-group"><h2 class="tmd-gh">` +
                `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
                `<span>${group.length} notification${group.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}</span>` +
                `</h2><div class="tmd-notes">${group.map(noteItem).join('')}</div></div>`;
            }).join('')
          : '';
      } else {
        host.innerHTML = list.length ? `<div class="tmd-notes">${list.map(noteItem).join('')}</div>` : '';
      }
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
      host.innerHTML = `<span class="tmd-views-lbl">Team views</span>` +
        savedViews.map((v, i) =>
          `<span class="tmd-viewchip${v.name === activeViewName ? ' is-active' : ''}">` +
            `<button type="button" class="tmd-viewchip-go" data-i="${i}">${esc(v.name)}</button>` +
            `<button type="button" class="tmd-viewchip-x" data-del="${i}" aria-label="Delete view">×</button>` +
          `</span>`).join('');
      host.querySelectorAll('.tmd-viewchip-go').forEach((b) =>
        b.addEventListener('click', () => applyView(savedViews[+b.dataset.i])));
      host.querySelectorAll('.tmd-viewchip-x').forEach((b) =>
        b.addEventListener('click', async () => {
          const i = +b.dataset.del; const removed = savedViews[i];
          const next = savedViews.filter((_, x) => x !== i);
          try { await store.saveViews(next); savedViews = next; if (removed && removed.name === activeViewName) activeViewName = ''; renderViewChips(); }
          catch (e) { alert('Could not delete view — ' + e.message); }
        }));
    }
    async function saveCurrentView() {
      const name = (prompt('Name this view (shared with your team):') || '').trim();
      if (!name) return;
      const next = savedViews.filter((v) => v.name !== name).concat([{ name, filters: currentFilterState() }]);
      try { await store.saveViews(next); savedViews = next; activeViewName = name; renderViewChips(); }
      catch (e) { alert('Could not save view — ' + e.message); }
    }
    async function loadViews() {
      try { const v = await store.getViews(); savedViews = Array.isArray(v) ? v : []; }
      catch { savedViews = []; }
    }

    // ---- resubmit ----
    async function doResubmit(btn) {
      const rec = roots().find((c) => c.id === btn.dataset.resubmit); if (!rec) return;
      if (!confirm('Resubmit this to ' + (rec.toTeam || 'Builder') + ' for another pass?')) return;
      btn.disabled = true;
      try { await store.resubmit(rec); await loadData(); }
      catch (e) { btn.disabled = false; alert('Could not resubmit — ' + e.message); }
    }

    // The shared toolbar (Search · Sort · By Page · primary) sits in the SAME slot for all
    // tabs; this reconciles the parts that differ per view — the status-filter tabs
    // (Completed only), the caption, and the primary button's label / action / enabled-state.
    function syncControls() {
      const filters = $('#tmd-filters');
      const note = $('#tmd-viewnote');
      const prim = $('#tmd-primary');
      const searchEl = $('#tmd-search');
      const inDetail = view === 'comments' && entryDetail;
      if (filters) filters.hidden = view !== 'comments';   // status filters belong to Completed
      if (view !== 'comments') $('#tmd-teamchips').hidden = true;
      // Feature 11: "Save view" captures the filter state — meaningful on Completed/Active only.
      const sv = $('#tmd-saveview'); if (sv) sv.hidden = view === 'notifs';
      if (view === 'comments') {
        searchEl.placeholder = 'Search submitted items, pages…';
        note.hidden = true;
        prim.textContent = 'Clear filters';
        prim.disabled = !(search || filter !== 'all' || fromFilter || byPage || sort !== 'new');
      } else if (view === 'delivery') {
        searchEl.placeholder = 'Search reopened items…';
        note.hidden = false;
        note.textContent = 'Builder reopened these — clarify in context (Open Pin) and resubmit to send another pass back to Builder.';
        prim.textContent = 'Clear filters';
        prim.disabled = !(search || byPage || sort !== 'new');
      } else { // notifs
        searchEl.placeholder = 'Search notifications…';
        note.hidden = true;
        prim.textContent = 'Mark all read';
        prim.disabled = unreadNotes().length === 0;
      }
      note.hidden = note.hidden || inDetail;
    }

    // Point `view` at a nav tab and sync the highlight (does not render).
    function setView(v) {
      view = v; entryDetail = null;
      document.querySelectorAll('.tmd-nav').forEach((n) => n.classList.toggle('is-active', n.dataset.view === v));
    }
    // The first nav tab that's actually visible — the landing target on load, and the
    // fallback when the current tab (e.g. Active) gets hidden out from under us.
    function firstVisibleView() {
      const first = [...document.querySelectorAll('.tmd-side .tmd-nav')].find((n) => !n.hidden);
      return first ? first.dataset.view : 'comments';
    }

    function render() {
      const detail = !!entryDetail; // a drilled-in ticket detail renders in the comments host
      $('#tmd-view-comments').hidden = !(view === 'comments' || detail);
      $('#tmd-view-notifs').hidden = detail || view !== 'notifs';
      $('#tmd-view-delivery').hidden = detail || view !== 'delivery';
      $('#tmd-empty').hidden = true;
      renderViewChips();   // Feature 11: keep the saved "Team views" chips in sync
      if (detail) { const c = $('#tmd-controls'); if (c) c.hidden = true; renderDetail(); renderHeader(); return; }
      if (view === 'notifs') renderNotes();
      else if (view === 'delivery') renderActive();
      else renderComments();
      syncControls();
      renderHeader();
    }

    // Completed/Active primary: reset Search, Sort, status filter, From-team and By Page.
    function clearFilters() {
      search = ''; sort = 'new'; filter = 'all'; fromFilter = ''; byPage = false;
      activeViewName = ''; // dropping the filters drops the active saved-view highlight
      $('#tmd-search').value = '';
      sortDD.setValue('new');
      $('#tmd-bypage').classList.remove('is-active');
      const f = $('#tmd-filters');
      if (f) f.querySelectorAll('.tmd-filter').forEach((x) => x.classList.toggle('is-active', x.dataset.filter === 'all'));
      render();
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
      } catch (err) { prim.disabled = false; alert('Could not update — ' + err.message); }
    }

    // ---- login (the shared common login — Team + Key) ----
    let login = null;
    function showLogin() {
      if (!login) {
        login = buildPanelLogin({ title: 'Panel Login', sub: 'Enter your key to continue.' });
        const go = () => tryLogin();
        login.button.addEventListener('click', go);
        login.keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      login.setError(''); login.keyInput.value = ''; login.setTeam(team() || '');
      document.body.appendChild(login.el);
      if (team()) login.keyInput.focus(); else login.focusTeam();
    }
    function hideLogin() { login && login.el.remove(); }

    // Reveal the gated-off stub and hide the app shell (init calls this when the
    // signed-in/previewed team is parked off via TEAM_ENABLED). CSS keys `display`
    // off `:not([hidden])`, so clearing/​setting `hidden` is all that's needed.
    function showBlocked() {
      const b = $('#tmd-blocked'); const app = $('.tmd-app');
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
      if (t === ADMIN_TEAM && !OVERRIDE) { location.replace('/reviewdash'); return; }
      try { await loadData(); hideLogin(); startAutoRefresh(); }
      catch (e) {
        clearSession();
        login.setBusy(false, 'Authenticate');
        login.setError(e.message === 'unauthorized' ? 'Incorrect team or key.' : ('Could not connect — ' + e.message));
        login.keyInput.focus(); login.keyInput.select();
      }
    }

    function init() {
      if (LOCAL) ensureDemoReset();
      // Rebuild the Completed status filters for the Phase-1 vocabulary (shell markup is generic).
      const f = $('#tmd-filters');
      if (f) f.innerHTML =
        `<button class="tmd-filter is-active" data-filter="all">All</button>` +
        `<button class="tmd-filter" data-filter="to_be_initiated">TBI</button>` +
        `<button class="tmd-filter" data-filter="in_progress">In Progress</button>` +
        `<button class="tmd-filter" data-filter="deployed_live">Deployed live</button>`;
      const s = getSession();
      if (OVERRIDE) mountAdminBar();
      if (s.key && s.team === ADMIN_TEAM && !OVERRIDE) { location.replace('/reviewdash'); return; }
      // Team parked off via TEAM_ENABLED while still signed in: show the "no access"
      // stub instead of the app (login.js blocks new sign-ins; this catches a live
      // session whose team was disabled). Admin override previewing a parked team also
      // lands here — that team's board genuinely isn't available.
      if (s.key && team() && !isTeamEnabled(team())) { showBlocked(); return; }
      if (s.key && (s.team || OVERRIDE)) {
        loadData().then(startAutoRefresh).catch((e) => {
          if (e.message === 'unauthorized') { clearSession(); showLogin(); }
          else { $('#tmd-empty').hidden = false; $('#tmd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else showLogin();
    }

    // ---- events ----
    $('.tmd-side').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-nav'); if (!b) return;
      view = b.dataset.view; entryDetail = null;
      document.querySelectorAll('.tmd-nav').forEach((n) => n.classList.toggle('is-active', n === b));
      render();
    });
    // Resubmit + card-open detail (delegated across both card containers).
    $('.tmd-content').addEventListener('click', (e) => {
      const rs = e.target.closest('[data-resubmit]');
      if (rs) { e.stopPropagation(); doResubmit(rs); return; }
      if (e.target.closest('a, button')) return;
      const item = e.target.closest('.tmd-item[data-id]'); if (!item) return;
      entryDetail = item.dataset.id; render();
    });
    $('#tmd-filters').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-filter'); if (!b) return;
      filter = b.dataset.filter; entryDetail = null;
      $('#tmd-filters').querySelectorAll('.tmd-filter').forEach((f) => f.classList.toggle('is-active', f === b));
      renderComments(); syncControls();
    });
    // By Page — shared across all tabs.
    $('#tmd-bypage').addEventListener('click', (e) => {
      byPage = !byPage; entryDetail = null;
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
    $('.tmd-content').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest && e.target.closest('.tmd-item[data-id]'); if (!item) return;
      e.preventDefault(); entryDetail = item.dataset.id; render();
    });
    // Search across the active view.
    $('#tmd-search').addEventListener('input', (e) => { search = e.target.value.trim(); entryDetail = null; render(); });
    // From-team filter chips.
    $('#tmd-teamchips').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-tchip'); if (!b) return;
      fromFilter = b.dataset.team; entryDetail = null; render();
    });
    // Sort — the shared custom dropdown.
    const sortDD = buildDropdown({
      small: true, value: sort,
      items: [
        { value: 'new', label: 'Newest first' },
        { value: 'old', label: 'Oldest first' },
        { value: 'page', label: 'Page A–Z' },
      ],
      onSelect: (v) => { sort = v; entryDetail = null; render(); },
    });
    $('#tmd-sort-mount').appendChild(sortDD.el);
    // Admin can push a global theme (SSE); repaint so JS-inlined chip colours re-derive.
    document.addEventListener('pk:themechange', () => { try { render(); } catch (e) {} });
    // Per-item read/unread toggle.
    $('#tmd-notes').addEventListener('click', async (e) => {
      const b = e.target.closest('.tmd-note-toggle'); if (!b) return;
      const id = b.dataset.id;
      const read = b.dataset.read === '1';
      b.disabled = true;
      try {
        await store.markRead([id], read);
        const n = notes.find((x) => x.id === id);
        if (n) n.readTeam = read;
        counts(); render(); lastSig = dataSig();
      } catch (err) { b.disabled = false; alert('Could not update — ' + err.message); }
    });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    $('#tmd-refresh').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.classList.contains('is-refreshing')) return;
      btn.classList.add('is-refreshing');
      const t0 = Date.now();
      try { await loadData(); await wait(Math.max(0, 550 - (Date.now() - t0))); }
      catch (err) { alert('Could not refresh — ' + err.message); }
      finally { btn.classList.remove('is-refreshing'); }
    });

    // Admin-view ribbon: shown when Builder is viewing a specific team's board.
    function mountAdminBar() {
      const app = $('.tmd-app'); if (!app || $('#tmd-adminbar')) return;
      const bar = document.createElement('div');
      bar.className = 'tmd-adminbar'; bar.id = 'tmd-adminbar';
      bar.innerHTML = `<span class="tmd-adminbar-txt">Admin view — <b>${esc(OVERRIDE)}</b> team board (full access)</span>` +
        `<a class="tmd-adminbar-back" href="/reviewdash">← Back to admin</a>`;
      app.prepend(bar);
      const foot = $('.tmd-foot'); if (foot) foot.hidden = true;
    }

    // "Upgrade access to admin" — drop this team session and go to the admin door.
    const upgrade = $('#tmd-upgrade');
    if (upgrade) upgrade.addEventListener('click', (e) => {
      e.preventDefault();
      clearSession();
      location.href = '/reviewdash?login=builder';
    });

    init();
  })();
