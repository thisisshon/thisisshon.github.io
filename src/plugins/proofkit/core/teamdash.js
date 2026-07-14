  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, pageName, ADMIN_TEAM,
    buildPanelLogin, buildDropdown, getSession, setSession, clearSession, initTheme, ensureDemoReset } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter). This is a
    // GLOBAL, admin-controlled setting — team users have NO toggle; initTheme just
    // reads + applies whatever the admin set (synced from the Worker).
    initTheme();
    const LOCAL = !WORKER_URL;

    // Admin override: Builder (admin) can open ANY team's board via /teamdash?team=<T>
    // (the "View a team's board" dropdown on the admin dashboard). The admin key has
    // full access on the Worker, so it returns that team's inbox. Non-admins can never
    // impersonate — the param is honoured only for an admin session, and the Worker
    // enforces it regardless.
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
    // The team-visible projection (matches the Worker's maskForTeam) for LOCAL mode.
    const maskLocal = (c) => ({
      id: c.id, parentId: c.parentId || null, createdAt: c.createdAt, team: c.team || '', toTeam: c.toTeam || '',
      name: c.name || '', comment: c.comment, changeTo: c.changeTo || '',
      aiPrompt: c.aiPrompt || '', validation: c.validation || null,
      page: c.page, anchor: c.anchor || {},
      status: c.published ? (c.publishedStatus || 'open') : 'open', // masked
      publishedStatus: c.published ? (c.publishedStatus || '') : '', publishedAt: c.publishedAt || '',
    });
    // Every task this team is part of — ones it RAISED (team) AND ones DIRECTED to it
    // (toTeam) — so the raiser and the receiver both see it. Thread-aware.
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
      return arr.filter((n) => n.team === t).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    function localMarkRead(ids, read = true) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem('rvc-notifications') || '[]'); } catch {}
      let updated = 0;
      for (const n of arr) { if (ids.includes(n.id) && n.team === team() && n.readTeam !== read) { n.readTeam = read; updated++; } }
      if (updated) localStorage.setItem('rvc-notifications', JSON.stringify(arr));
      return { ok: true, updated };
    }

    const store = LOCAL
      ? {
          comments: async () => localComments(team()),
          notifs: async () => localNotifs(team()),
          markRead: async (ids, read = true) => localMarkRead(ids, read),
        }
      : {
          comments: () => apiFetch('/comments?team=' + encodeURIComponent(team())),
          notifs: () => apiFetch('/notifications?team=' + encodeURIComponent(team())),
          markRead: (ids, read = true) => apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids, team: team(), read }) }),
        };

    // ---- helpers ----
    const $ = (s) => document.querySelector(s);
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
    // Team chip colour derived from the team's identity hue (mirrors Dashboard.astro).
    const mix = (a, b, t) => {
      const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
      const ch = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
      return '#' + ch(ar, br) + ch(ag, bg) + ch(ab, bb);
    };
    const isLight = () => document.documentElement.getAttribute('data-pk-theme') === 'light';
    const teamStyle = (t) => {
      const tc = TEAM_COLORS[t] || ['#e8e8e8', '#888'];
      // Light: the on-page pastel chip (light bg + dark ink). Dark: hue muted toward the canvas.
      if (isLight()) return { bg: tc[0], fg: tc[1], bd: mix(tc[1], '#ffffff', 0.62) };
      const accent = tc[1];
      return { bg: mix(accent, '#181818', 0.82), fg: mix(accent, '#ffffff', 0.55), bd: mix(accent, '#181818', 0.5) };
    };
    const teamChip = (t) => {
      if (!t) return '';
      const s = teamStyle(t);
      return `<span class="tmd-team-chip" style="background:${s.bg};color:${s.fg};border:1px solid ${s.bd}">${esc(t)}</span>`;
    };
    // Statuses are framed for the team — the deploy bucket is never shown.
    const statusChip = (c) => c.status === 'completed'
      ? `<span class="tmd-chip done">Done</span>`
      : c.status === 'closed'
        ? `<span class="tmd-chip closed">Closed</span>`
        : `<span class="tmd-chip pending">Pending</span>`;
    const statusLabel = (c) => c.status === 'completed' ? 'Done' : c.status === 'closed' ? 'Closed' : 'Pending';

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
    // Team-safe status history: only the events a team should see (Raised → Marked
    // done/Closed on deploy). Pre-deploy transitions (the bucket) are never surfaced.
    function teamHistory(c) {
      const out = [{ at: c.createdAt, label: 'Raised' }];
      if (c.publishedAt) out.push({ at: c.publishedAt, label: c.publishedStatus === 'closed' ? 'Closed' : 'Marked done' });
      return out;
    }
    // Completion validation, framed for the team (only content-copy-match is meaningful).
    function validLine(c) {
      const v = c && c.validation;
      if (!v) return '—';
      if (v.method === 'content-copy-match') return (v.ok ? '✓ Verified on the live page' : '⚠ Not verified on the live page yet') + (v.detail ? ' — ' + esc(v.detail) : '');
      return 'Confirmed by admin' + (v.detail ? ' — ' + esc(v.detail) : '');
    }

    // ---- state ----
    let comments = [], notes = [], view = 'comments', filter = 'all', byPage = false;
    let search = '', sort = 'new', fromFilter = '', entryDetail = null;
    const roots = () => comments.filter((c) => !c.parentId);
    const repliesOf = (id) => comments.filter((c) => c.parentId === id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const unreadNotes = () => notes.filter((n) => n.readTeam === false);

    function matchesSearch(c) {
      if (!search) return true;
      const a = c.anchor || {};
      return [c.comment, c.changeTo, c.page && c.page.path, c.name, c.team, a.snippet, a.tag]
        .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
    }
    function sortRoots(rs) {
      const s = rs.slice();
      if (sort === 'old') s.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      else if (sort === 'page') s.sort((a, b) => a.page.path.localeCompare(b.page.path) || (a.createdAt < b.createdAt ? 1 : -1));
      else s.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest
      return s;
    }
    function currentRoots() {
      let rs = roots();
      if (filter === 'pending') rs = rs.filter((c) => c.status === 'open');
      else if (filter === 'done') rs = rs.filter((c) => c.status === 'completed');
      else if (filter === 'closed') rs = rs.filter((c) => c.status === 'closed');
      if (fromFilter) rs = rs.filter((c) => (c.team || '') === fromFilter); // raised-by team
      return sortRoots(rs.filter(matchesSearch));
    }

    // ---- data ----
    async function loadData() {
      const [c, n] = await Promise.all([store.comments(), store.notifs()]);
      comments = Array.isArray(c) ? c : [];
      notes = Array.isArray(n) ? n : [];
      renderHeader(); counts(); render();
    }
    let refreshTimer = null;
    function startAutoRefresh() {
      if (refreshTimer) return;
      refreshTimer = setInterval(() => { if (!document.hidden) loadData().catch(() => {}); }, 30000);
      window.addEventListener('focus', () => loadData().catch(() => {}));
    }

    function renderHeader() {
      // Team is the third section of the brand tag: "Content Review | Shriram FS | <Team>",
      // with the team name highlighted in a contrasting blue.
      const tt = $('#tmd-tag-team');
      if (tt) tt.innerHTML = team() ? ' | <span class="tmd-team-hi">' + esc(team()) + '</span>' : '';
      const badge = $('#tmd-navbadge');
      const u = unreadNotes().length;
      badge.textContent = u;
      badge.hidden = u === 0;
    }

    function counts() {
      const rs = roots();
      const pending = rs.filter((c) => c.status === 'open').length;
      const done = rs.filter((c) => c.status === 'completed').length;
      const unread = unreadNotes().length;
      $('#tmd-counts').innerHTML =
        `<span class="tmd-count tmd-count-pending"><b>${pending}</b> Pending</span>` +
        `<span class="tmd-count tmd-count-done"><b>${done}</b> Done</span>` +
        `<span class="tmd-count"><b>${unread}</b> Notifications</span>`;
    }

    function card(root) {
      const a = root.anchor || {};
      const replies = repliesOf(root.id);
      const repliesHtml = replies.length
        ? `<div class="tmd-replies">` + replies.map((r) =>
            `<div class="tmd-reply">${teamChip(r.team)}<div class="tmd-rtxt">${esc(r.comment)}</div>` +
            (r.changeTo ? `<div class="tmd-change"><span>Change to</span><div>${esc(r.changeTo)}</div></div>` : '') +
            `<div class="tmd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div>`
        : '';
      return (
        `<article class="tmd-item" data-id="${esc(root.id)}" tabindex="0" role="button" aria-label="View comment details">` +
          `<div class="tmd-line">` +
            statusChip(root) +
            // Direction: received → "Raised By <them>"; raised by us to another team → "To <them>".
            ((root.team && root.team !== team())
              ? `<span class="tmd-from">Raised By ${teamChip(root.team)}</span>`
              : (root.toTeam && root.toTeam !== team() && root.toTeam !== ADMIN_TEAM)
                ? `<span class="tmd-from">To ${teamChip(root.toTeam)}</span>`
                : '') +
            `<div class="tmd-headline">` +
              `<div class="tmd-comment">${esc(root.comment)}` +
                (replies.length ? `<span class="tmd-n">${replies.length + 1} comments</span>` : '') + `</div>` +
              (a.snippet ? `<div class="tmd-snip">on “${esc(a.snippet)}”</div>` : '') +
            `</div>` +
          `</div>` +
          (root.changeTo ? `<div class="tmd-change"><span>Change to</span><div>${esc(root.changeTo)}</div></div>` : '') +
          `<div class="tmd-meta">` +
            `<a class="tmd-slug" href="${esc(root.page.path)}" target="_blank" rel="noopener">${esc(pageName(root.page.path))}</a>` +
            `<span class="tmd-time">${esc(fmt(root.createdAt))}</span>` +
            `<a class="tmd-openpin" href="${esc(root.page.path)}?review=1#c=${esc(root.id)}" target="_blank" rel="noopener">Open Pin</a>` +
            `<span class="tmd-detailhint">View details →</span>` +
          `</div>` +
          repliesHtml +
        `</article>`
      );
    }

    // From-team filter chips — the teams that raised the items in this inbox. "All"
    // (red) clears; a team chip fills with its own identity colour when active.
    function buildTeamChips() {
      const host = $('#tmd-teamchips'); if (!host) return;
      const present = [...new Set(roots().map((c) => c.team).filter(Boolean))]
        .sort((a, b) => TEAMS.indexOf(a) - TEAMS.indexOf(b));
      const one = (label, t) => {
        const active = fromFilter === t;
        let style;
        if (active && t) { const acc = (TEAM_COLORS[t] || [])[1] || '#da291c'; style = `background:${acc};color:#fff;border-color:${acc}`; }
        else if (active) style = 'background:#da291c;color:#fff;border-color:#da291c';
        else if (t) { const s = teamStyle(t); style = `background:${s.bg};color:${s.fg};border-color:${s.bd}`; }
        else style = isLight() ? 'background:#f0efe9;color:#565650;border-color:#e4e1d9' : 'background:#242424;color:#c9c9c9;border-color:#333';
        return `<button class="tmd-tchip${active ? ' is-active' : ''}" data-team="${esc(t)}" style="${style}">${esc(label)}</button>`;
      };
      host.hidden = present.length < 2; // only worth showing when items come from ≥2 teams
      host.innerHTML = present.length < 2 ? ''
        : '<span class="tmd-chips-from">From</span>' + one('All Teams', '') + present.map((t) => one(t, t)).join('');
    }

    // ---- comment detail (reviewer, AI prompt, validation, status history) ----
    function renderDetail() {
      const c = roots().find((x) => x.id === entryDetail);
      const host = $('#tmd-list');
      if (!c) { entryDetail = null; return renderComments(); }
      const a = c.anchor || {};
      const where = a.snippet ? '“' + esc(a.snippet) + '”' + (a.tag ? ' · ' + esc(a.tag) : '') : (a.tag ? esc(a.tag) : '—');
      const hist = teamHistory(c);
      const replies = repliesOf(c.id);
      const field = (k, vHtml) => `<div class="tmd-field"><div class="tmd-field-k">${k}</div><div class="tmd-field-v">${vHtml}</div></div>`;
      const timeline = `<ol class="tmd-timeline">` + hist.map((h, i) =>
        `<li class="tmd-tl${i === hist.length - 1 ? ' is-current' : ''}"><span class="tmd-tl-event">${esc(h.label)}</span>` +
        `<span class="tmd-tl-time">${esc(fmt(h.at))}</span></li>`).join('') + `</ol>`;
      const repliesHtml = replies.length
        ? `<div class="tmd-field"><div class="tmd-field-k">Replies</div><div class="tmd-replies">` + replies.map((r) =>
            `<div class="tmd-reply">${teamChip(r.team)}<div class="tmd-rtxt">${esc(r.comment)}</div>` +
            `<div class="tmd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div></div>`
        : '';
      host.innerHTML =
        `<button class="tmd-back" id="tmd-back">← Back to list</button>` +
        `<article class="tmd-detail">` +
          `<h2 class="tmd-detail-title">${esc(c.comment)}</h2>` +
          `<div class="tmd-detail-chips">${statusChip(c)}${c.team ? '<span class="tmd-from">from ' + teamChip(c.team) + '</span>' : ''}` +
            `<a class="tmd-slug" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">Open pin</a></div>` +
          `<div class="tmd-fields">` +
            field('Page', `<a class="tmd-slug" href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a> <span style="color:var(--pk-muted)">${esc(c.page.path)}</span>`) +
            field('Element / anchor', where) +
            field('Raised by', esc(c.name || 'anonymous') + (c.team ? ' · ' + esc(c.team) : '')) +
            field('Submitted', esc(fmt(c.createdAt))) +
            (c.changeTo ? `<div class="tmd-field"><div class="tmd-field-k">Change to</div><div class="tmd-change"><div>${esc(c.changeTo)}</div></div></div>` : '') +
            field('Status', esc(statusLabel(c))) +
            field('Validation', validLine(c)) +
            `<div class="tmd-field"><div class="tmd-field-k">AI change prompt</div>` +
              (c.aiPrompt || c.comment
                ? `<div class="tmd-prompt-box">${esc(localPrompt(c))}</div><button class="tmd-copyprompt" type="button">Copy prompt</button>`
                : `<div class="tmd-field-v" style="color:var(--pk-muted);font-style:italic">Generating…</div>`) + `</div>` +
            `<div class="tmd-field"><div class="tmd-field-k">Status history</div>${timeline}</div>` +
            repliesHtml +
          `</div>` +
        `</article>`;
      $('#tmd-back').addEventListener('click', () => { entryDetail = null; render(); });
      const cp = $('.tmd-copyprompt');
      if (cp) cp.addEventListener('click', () => copyToClip(localPrompt(c), cp, 'Copied ✓'));
    }

    function renderComments() {
      const host = $('#tmd-list');
      const controls = $('#tmd-controls');
      // Detail drill-in: hide the list controls, show the single-comment detail.
      if (entryDetail) { if (controls) controls.hidden = true; renderDetail(); return; }
      if (controls) controls.hidden = false;
      buildTeamChips();
      const rs = currentRoots();
      if (byPage) {
        const paths = [...new Set(rs.map((c) => c.page.path))].sort();
        host.innerHTML = paths.map((p) => {
          const group = rs.filter((c) => c.page.path === p);
          const pend = group.filter((c) => c.status === 'open').length;
          const done = group.filter((c) => c.status === 'completed').length;
          return `<div class="tmd-group"><h2 class="tmd-gh">` +
            `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
            `<span>${pend} pending · ${done} done</span>` +
            `</h2><div class="tmd-grid">${group.map(card).join('')}</div></div>`;
        }).join('');
      } else {
        host.innerHTML = `<div class="tmd-grid">${rs.map(card).join('')}</div>`;
      }
      const emp = $('#tmd-empty');
      emp.hidden = rs.length > 0;
      if (!rs.length) emp.textContent = search ? 'No comments match your search.'
        : (filter !== 'all' || fromFilter) ? 'Nothing in this filter.'
        : 'Nothing directed to your team yet.';
    }

    function noteItem(n) {
      const unread = n.readTeam === false;
      return `<article class="tmd-note${unread ? ' is-unread' : ''}">` +
        `<span class="tmd-note-dot"></span>` +
        `<div class="tmd-note-body">` +
          `<div class="tmd-note-sum">${esc(n.summary || 'Your comment was updated.')}</div>` +
          `<div class="tmd-note-meta">` +
            `<a class="tmd-slug" href="${esc(n.path || '/')}" target="_blank" rel="noopener">${esc(n.pageName || pageName(n.path || '/'))}</a>` +
            `<span class="tmd-time">${esc(fmt(n.createdAt))}</span>` +
            (n.commentId ? `<a class="tmd-openpin" href="${esc(n.path || '/')}?review=1#c=${esc(n.commentId)}" target="_blank" rel="noopener">Open Pin</a>` : '') +
          `</div>` +
        `</div>` +
        `<button class="tmd-note-toggle" type="button" data-id="${esc(n.id)}" data-read="${unread ? '1' : '0'}">` +
          (unread ? 'Mark read' : 'Mark unread') +
        `</button>` +
      `</article>`;
    }

    function renderNotes() {
      const list = notes.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      $('#tmd-notes').innerHTML = list.map(noteItem).join('');
      const u = unreadNotes().length;
      $('#tmd-markall').disabled = u === 0;
      const emp = $('#tmd-empty');
      emp.hidden = list.length > 0;
      if (!list.length) emp.textContent = 'No notifications yet.';
    }

    function render() {
      $('#tmd-view-comments').hidden = view !== 'comments';
      $('#tmd-view-notifs').hidden = view !== 'notifs';
      $('#tmd-empty').hidden = true;
      if (view === 'notifs') renderNotes(); else renderComments();
      renderHeader();
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

    async function tryLogin() {
      const t = login.getTeam();
      const key = login.keyInput.value.trim();
      if (!t) { login.focusTeam(); login.setError('Please choose your team.'); return; }
      if (!key) { login.keyInput.focus(); return; }
      setSession(t, key); // the one shared per-tab session
      login.setBusy(true, 'Authenticating'); login.setError('');
      // ADMIN_TEAM ('Builder') is the admin door → hand off to /reviewdash, UNLESS an
      // admin is opening a specific team's board here (?team=…), which we render inline.
      if (t === ADMIN_TEAM && !OVERRIDE) { location.replace('/reviewdash'); return; }
      // Team: validate the key against the team-scoped read.
      try { await loadData(); hideLogin(); startAutoRefresh(); }
      catch (e) {
        clearSession();
        login.setBusy(false, 'Authenticate');
        login.setError(e.message === 'unauthorized' ? 'Incorrect team or key.' : ('Could not connect — ' + e.message));
        login.keyInput.focus(); login.keyInput.select();
      }
    }

    function init() {
      if (LOCAL) ensureDemoReset(); // demo mode: start clean (clears old demo rows once)
      const s = getSession();
      if (OVERRIDE) mountAdminBar(); // admin is viewing a specific team's board
      // A live admin session (Builder) → straight to the admin panel, UNLESS viewing a
      // specific team's board (?team=…), which loads below with the admin key.
      if (s.key && s.team === ADMIN_TEAM && !OVERRIDE) { location.replace('/reviewdash'); return; }
      // A team session (or an admin viewing a team) → load it; else ask to log in once.
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
    $('#tmd-filters').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-filter'); if (!b) return;
      filter = b.dataset.filter; entryDetail = null;
      $('#tmd-filters').querySelectorAll('.tmd-filter').forEach((f) => f.classList.toggle('is-active', f === b));
      renderComments();
    });
    $('#tmd-bypage').addEventListener('click', (e) => {
      byPage = !byPage;
      e.currentTarget.classList.toggle('is-active', byPage);
      renderComments();
    });
    // Open a comment's full detail (click/Enter a card; links inside pass through).
    $('#tmd-list').addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const item = e.target.closest('.tmd-item[data-id]'); if (!item) return;
      entryDetail = item.dataset.id; renderComments();
    });
    $('#tmd-list').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest && e.target.closest('.tmd-item[data-id]'); if (!item) return;
      e.preventDefault(); entryDetail = item.dataset.id; renderComments();
    });
    // Search across the inbox.
    $('#tmd-search').addEventListener('input', (e) => { search = e.target.value.trim(); entryDetail = null; renderComments(); });
    // From-team filter chips.
    $('#tmd-teamchips').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-tchip'); if (!b) return;
      fromFilter = b.dataset.team; entryDetail = null; renderComments();
    });
    // Sort — the shared custom dropdown.
    const sortDD = buildDropdown({
      small: true, value: sort,
      items: [
        { value: 'new', label: 'Newest first' },
        { value: 'old', label: 'Oldest first' },
        { value: 'page', label: 'Page A–Z' },
      ],
      onSelect: (v) => { sort = v; entryDetail = null; renderComments(); },
    });
    $('#tmd-sort-mount').appendChild(sortDD.el);
    // Admin can push a global theme (SSE); repaint so JS-inlined chip colours re-derive.
    document.addEventListener('pk:themechange', () => { try { render(); } catch (e) {} });
    $('#tmd-markall').addEventListener('click', async (e) => {
      const ids = unreadNotes().map((n) => n.id);
      if (!ids.length) return;
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await store.markRead(ids, true);
        notes.forEach((n) => { if (ids.includes(n.id)) n.readTeam = true; });
        counts(); render();
      } catch (err) { btn.disabled = false; alert('Could not update — ' + err.message); }
    });
    // Per-item read/unread toggle. data-read="1" = currently unread ⇒ mark read; "0" ⇒ mark unread.
    $('#tmd-notes').addEventListener('click', async (e) => {
      const b = e.target.closest('.tmd-note-toggle'); if (!b) return;
      const id = b.dataset.id;
      const read = b.dataset.read === '1';
      b.disabled = true;
      try {
        await store.markRead([id], read);
        const n = notes.find((x) => x.id === id);
        if (n) n.readTeam = read;
        counts(); render();
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

    // Admin-view ribbon: shown when Builder is viewing a specific team's board. Makes
    // the impersonation explicit and offers a one-click way back to the admin panel.
    function mountAdminBar() {
      const app = $('.tmd-app'); if (!app || $('#tmd-adminbar')) return;
      const bar = document.createElement('div');
      bar.className = 'tmd-adminbar'; bar.id = 'tmd-adminbar';
      bar.innerHTML = `<span class="tmd-adminbar-txt">Admin view — <b>${esc(OVERRIDE)}</b> team board (full access)</span>` +
        `<a class="tmd-adminbar-back" href="/reviewdash">← Back to admin</a>`;
      app.prepend(bar);
      const foot = $('.tmd-foot'); if (foot) foot.hidden = true; // no "upgrade to admin" while already admin
    }

    // "Upgrade access to admin" — drop this team session and go to the admin door
    // (/reviewdash), where the user can sign in as Builder (admin, access to everything).
    const upgrade = $('#tmd-upgrade');
    if (upgrade) upgrade.addEventListener('click', (e) => {
      e.preventDefault();
      clearSession();
      location.href = '/reviewdash?login=builder'; // prefill the login's Team to Builder
    });

    init();
  })();
