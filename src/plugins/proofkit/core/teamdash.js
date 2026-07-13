  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, pageName, ADMIN_TEAM,
    buildPanelLogin, getSession, setSession, clearSession, initTheme } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter). This is a
    // GLOBAL, admin-controlled setting — team users have NO toggle; initTheme just
    // reads + applies whatever the admin set (synced from the Worker).
    initTheme();
    const LOCAL = !WORKER_URL;

    // The signed-in team comes from the ONE shared per-tab session (config).
    const team = () => getSession().team;

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
      id: c.id, parentId: c.parentId || null, createdAt: c.createdAt, team: c.team || '',
      name: c.name || '', comment: c.comment, changeTo: c.changeTo || '', page: c.page, anchor: c.anchor || {},
      status: c.published ? (c.publishedStatus || 'open') : 'open', // masked
      publishedAt: c.publishedAt || '',
    });
    function localComments(t) {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rvc:')) { try { out.push(...JSON.parse(localStorage.getItem(k) || '[]')); } catch {} }
      }
      return out.filter((c) => (c.team || '') === t).map(maskLocal).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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

    // ---- state ----
    let comments = [], notes = [], view = 'comments', filter = 'all', byPage = false;
    const roots = () => comments.filter((c) => !c.parentId);
    const repliesOf = (id) => comments.filter((c) => c.parentId === id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const unreadNotes = () => notes.filter((n) => n.readTeam === false);

    function currentRoots() {
      let rs = roots();
      if (filter === 'pending') rs = rs.filter((c) => c.status === 'open');
      else if (filter === 'done') rs = rs.filter((c) => c.status === 'completed');
      else if (filter === 'closed') rs = rs.filter((c) => c.status === 'closed');
      return rs.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
        `<article class="tmd-item">` +
          `<div class="tmd-line">` +
            statusChip(root) +
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
          `</div>` +
          repliesHtml +
        `</article>`
      );
    }

    function renderComments() {
      const host = $('#tmd-list');
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
      if (!rs.length) emp.textContent = filter === 'all' ? 'No comments from your team yet.' : 'Nothing in this filter.';
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
      // ADMIN_TEAM ('Design') is the admin door → hand off to /reviewdash.
      if (t === ADMIN_TEAM) { location.replace('/reviewdash'); return; }
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
      const s = getSession();
      // A live admin session (Design) → straight to the admin panel.
      if (s.key && s.team === ADMIN_TEAM) { location.replace('/reviewdash'); return; }
      // A team session → load it; otherwise ask to log in once.
      if (s.key && s.team) {
        loadData().then(startAutoRefresh).catch((e) => {
          if (e.message === 'unauthorized') { clearSession(); showLogin(); }
          else { $('#tmd-empty').hidden = false; $('#tmd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else showLogin();
    }

    // ---- events ----
    $('.tmd-side').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-nav'); if (!b) return;
      view = b.dataset.view;
      document.querySelectorAll('.tmd-nav').forEach((n) => n.classList.toggle('is-active', n === b));
      render();
    });
    $('#tmd-filters').addEventListener('click', (e) => {
      const b = e.target.closest('.tmd-filter'); if (!b) return;
      filter = b.dataset.filter;
      $('#tmd-filters').querySelectorAll('.tmd-filter').forEach((f) => f.classList.toggle('is-active', f === b));
      renderComments();
    });
    $('#tmd-bypage').addEventListener('click', (e) => {
      byPage = !byPage;
      e.currentTarget.classList.toggle('is-active', byPage);
      renderComments();
    });
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

    init();
  })();
