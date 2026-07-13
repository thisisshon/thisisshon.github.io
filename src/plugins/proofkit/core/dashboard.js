  import { TEAMS, TEAM_COLORS, WORKER_URL, PROOFKIT_ENABLED, checkReviewPassword, pageName,
    initTheme, mountThemeToggle } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    // Theme skins come from design/tokens.css (linked by the adapter); apply the
    // global choice and mount the admin toggle.
    initTheme(); mountThemeToggle();
    const LOCAL = !WORKER_URL;
    const PASS_KEY = 'reviewAdminPass'; // admin password for the dashboard (separate from reviewer Team ID)

    async function apiFetch(path, opts = {}) {
      const headers = { 'Content-Type': 'application/json' };
      const pass = sessionStorage.getItem(PASS_KEY);
      if (pass) headers['X-Review-Pass'] = pass;
      const res = await fetch(WORKER_URL + path, { ...opts, headers });
      if (res.status === 401) { sessionStorage.removeItem(PASS_KEY); throw new Error('unauthorized'); }
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
    // Set the working status locally + mirror the Worker's completedAt/closedAt/validation stamping.
    function localStatus(rec, status) {
      const key = 'rvc:' + rec.page.path;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const r = arr.find((x) => x.id === rec.id);
      const now = new Date().toISOString();
      if (!r) return { ...rec, status };
      r.status = status;
      if (status === 'completed') {
        r.completedAt = now;
        r.validation = { ok: true, method: 'manual', detail: 'Local mode — not auto-verified.', checkedAt: now };
      } else if (status === 'closed') {
        r.closedAt = now;
      } else {
        r.validation = null; // reopened
      }
      localStorage.setItem(key, JSON.stringify(arr));
      return { ...r };
    }
    // A local notification for one just-published root comment (shape mirrors the Worker's makeNotif).
    function localMakeNotif(r, now) {
      const done = r.publishedStatus === 'closed' ? 'closed' : 'marked Done';
      const where = (r.page && r.page.title) || (r.page && r.page.path) || 'a page';
      return {
        id: uid(), createdAt: now, team: r.team || '', commentId: r.id,
        path: (r.page && r.page.path) || '/', pageName: where, publishedStatus: r.publishedStatus,
        summary: 'Your comment on ' + where + ' was ' + done + '.', readTeam: false, readAdmin: false,
      };
    }
    // Publish the whole local bucket: every completed/closed record not already live.
    function localDeploy() {
      const now = new Date().toISOString();
      const created = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('rvc:')) continue;
        let arr; try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
        let dirty = false;
        for (const r of arr) {
          let st = r.status || 'open'; if (st === 'resolved') st = 'completed';
          const ready = st === 'completed' || st === 'closed';
          const alreadyLive = r.published && r.publishedStatus === st;
          if (ready && !alreadyLive) {
            r.status = st; r.published = true; r.publishedStatus = st; r.publishedAt = now; dirty = true;
            if (!r.parentId) created.push(localMakeNotif(r, now));
          }
        }
        if (dirty) localStorage.setItem(k, JSON.stringify(arr));
      }
      if (created.length) {
        let ex = []; try { ex = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch {}
        ex.push(...created);
        localStorage.setItem(NOTIF_KEY, JSON.stringify(ex));
      }
      return { deployed: created.length, notifications: created };
    }
    function localNotifs() {
      let arr = []; try { arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch {}
      arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
      arr = arr.filter((r) => r.id !== rec.id && r.parentId !== rec.id); // root + replies
      localStorage.setItem(key, JSON.stringify(arr));
    }
    // No-Worker gate (static/live included): the local store has no server, so check
    // the session password against the configured review password (hash-compared).
    // Throws the same 'unauthorized' the Worker would, so login/init handle it alike.
    const localGuard = async () => {
      if (!(await checkReviewPassword(sessionStorage.getItem(PASS_KEY) || ''))) throw new Error('unauthorized');
    };
    const store = LOCAL
      ? {
          all: async () => { await localGuard(); return localAll(); },
          // working status: open | completed | closed (stamps validation on completed).
          status: async (rec, status) => { await localGuard(); return localStatus(rec, status); },
          // back-compat: route the old resolve() through status ('resolved' ⇒ 'completed').
          resolve: async (rec, status) => { await localGuard(); return localStatus(rec, status === 'resolved' ? 'completed' : status); },
          deploy: async () => { await localGuard(); return localDeploy(); },
          notifications: async () => { await localGuard(); return localNotifs(); },
          markRead: async (ids, read = true) => { await localGuard(); return localMarkRead(ids, read); },
          del: async (rec) => { await localGuard(); localDelete(rec); return { ok: true }; },
        }
      : {
          all: () => apiFetch('/comments'),
          // the UI drives /status; the Worker keeps /resolve only as a back-compat alias.
          status: (rec, status) => apiFetch('/status', { method: 'POST', body: JSON.stringify({ id: rec.id, path: rec.page.path, status }) }),
          resolve: (rec, status) => apiFetch('/status', { method: 'POST', body: JSON.stringify({ id: rec.id, path: rec.page.path, status: status === 'resolved' ? 'completed' : status }) }),
          deploy: () => apiFetch('/deploy', { method: 'POST', body: '{}' }),
          notifications: () => apiFetch('/notifications'),
          markRead: (ids, read = true) => apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ ids, read }) }),
          del: (rec) => apiFetch('/delete', { method: 'POST', body: JSON.stringify({ id: rec.id, path: rec.page.path }) }),
        };

    let loginEl = null, refreshTimer = null;

    async function loadData() {
      all = await store.all();
      // Notifications drive the nav badge + the Notifications view; a failure here
      // must never break the dashboard, so fall back to the last-known list.
      try { notifs = await store.notifications(); } catch (e) { notifs = notifs || []; }
      counts(); render();
      // Mark "seen" once per dashboard open, so the NEW badges clear on the next visit.
      if (!seenMarked) { seenMarked = true; try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (e) {} }
    }

    // Keep the review page current: submits land in the DB instantly; poll so the
    // dashboard reflects new comments without a manual Refresh.
    function startAutoRefresh() {
      if (refreshTimer) return;
      refreshTimer = setInterval(() => { if (!document.hidden) loadData().catch(() => {}); }, 30000);
      window.addEventListener('focus', () => loadData().catch(() => {}));
    }

    function showLogin() {
      if (!loginEl) {
        loginEl = document.createElement('div'); loginEl.className = 'rvd-login';
        loginEl.innerHTML =
          '<div class="rvd-login-card" role="dialog" aria-modal="true">' +
          '<div class="rvd-login-title">Content Review</div>' +
          '<div class="rvd-login-sub">Enter the review password to open the dashboard.</div>' +
          '<input class="rvd-login-input" type="password" placeholder="Password" autocomplete="current-password">' +
          '<div class="rvd-login-err" hidden></div>' +
          '<div class="rvd-login-actions"><button type="button" class="rvd-login-btn">Login</button></div>' +
          '</div>';
        const input = loginEl.querySelector('.rvd-login-input');
        const go = () => tryLogin(input);
        loginEl.querySelector('.rvd-login-btn').addEventListener('click', go);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      document.body.appendChild(loginEl);
      loginEl.querySelector('.rvd-login-input').focus();
    }
    function hideLogin() { loginEl && loginEl.remove(); }

    async function tryLogin(input) {
      const id = input.value.trim(); if (!id) { input.focus(); return; }
      const err = loginEl.querySelector('.rvd-login-err');
      const btn = loginEl.querySelector('.rvd-login-btn');
      sessionStorage.setItem(PASS_KEY, id);
      btn.disabled = true; btn.textContent = 'Checking…'; err.hidden = true;
      try { await loadData(); hideLogin(); startAutoRefresh(); }
      catch (e) {
        sessionStorage.removeItem(PASS_KEY);
        btn.disabled = false; btn.textContent = 'Login';
        err.textContent = e.message === 'unauthorized' ? 'Incorrect password. Please try again.' : ('Could not connect — ' + e.message);
        err.hidden = false; input.focus(); input.select();
      }
    }

    function init() {
      if (sessionStorage.getItem(PASS_KEY)) {
        loadData().then(startAutoRefresh).catch((e) => {
          if (e.message === 'unauthorized') { sessionStorage.removeItem(PASS_KEY); showLogin(); }
          else { $('#rvd-empty').hidden = false; $('#rvd-empty').textContent = 'Could not load — ' + e.message; }
        });
      } else showLogin();
    }

    const $ = (s) => document.querySelector(s);
    const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    const fmt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
    // Dark-mode chip colours derived from each team's identity hue (TEAM_COLORS'
    // saturated ink value), blended toward the canvas for a muted dark fill + a
    // brightened readable label — instead of the bright light pastels used on-page.
    const mix = (a, b, t) => {
      const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
      const ch = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
      return '#' + ch(ar, br) + ch(ag, bg) + ch(ab, bb);
    };
    const isLight = () => document.documentElement.getAttribute('data-pk-theme') === 'light';
    const teamStyle = (team) => {
      const tc = TEAM_COLORS[team] || ['#e8e8e8', '#888'];
      // Light: the on-page pastel chip (light bg + dark ink). Dark: hue muted toward the canvas.
      if (isLight()) return { bg: tc[0], fg: tc[1], bd: mix(tc[1], '#ffffff', 0.62) };
      const accent = tc[1];
      return { bg: mix(accent, '#181818', 0.82), fg: mix(accent, '#ffffff', 0.55), bd: mix(accent, '#181818', 0.5) };
    };
    const teamChip = (team) => {
      if (!team) return '';
      const s = teamStyle(team);
      return `<span class="rvd-team-chip" style="background:${s.bg};color:${s.fg};border:1px solid ${s.bd}">${esc(team)}</span>`;
    };
    // ---- lifecycle (deploy gate) ----
    // Working status the admin controls (legacy 'resolved' ⇒ 'completed').
    const workingStatus = (c) => { let s = (c && c.status) || 'open'; return s === 'resolved' ? 'completed' : s; };
    // In the DEPLOY BUCKET: completed/closed but not yet published to teams (matches the
    // Worker's deploy readiness — published AND publishedStatus===status means it's live).
    const isBucketed = (c) => {
      const s = workingStatus(c);
      return (s === 'completed' || s === 'closed') && !(c.published && c.publishedStatus === s);
    };
    const isOpen = (c) => workingStatus(c) === 'open';
    const isDeployed = (c) => !!c.published && c.publishedStatus === 'completed';
    const isClosedLive = (c) => !!c.published && c.publishedStatus === 'closed';
    // Four display states from status + published + publishedStatus.
    const displayState = (c) => {
      if (isOpen(c)) return 'open';
      if (isBucketed(c)) return 'bucket';
      return c.publishedStatus === 'closed' ? 'closed' : 'deployed';
    };
    const STATUS_META = {
      open: ['open', 'Open'],
      bucket: ['bucket', 'In Bucket'],
      deployed: ['deployed', 'Deployed'],
      closed: ['closed', 'Closed'],
    };
    const statusLabel = (c) => STATUS_META[displayState(c)][1];
    const statusChip = (c) => {
      const [cls, label] = STATUS_META[displayState(c)];
      return `<span class="rvd-chip ${cls}">${label}</span>`;
    };
    // Card validation flag — only for content-copy-match (manual completions show nothing).
    const validLine = (c) => {
      const v = c && c.validation;
      if (!v || v.method !== 'content-copy-match') return '';
      const t = esc(v.detail || '');
      return v.ok
        ? `<div class="rvd-valid ok" title="${t}">✓ Verified on live page</div>`
        : `<div class="rvd-valid warn" title="${t}">⚠ Not verified on live page yet</div>`;
    };
    let all = [], notifs = [], tab = 'all', teamFilter = '', entryDetail = null, view = 'dash', search = '', sort = 'new', deployResult = '';
    const sel = new Set(); // bulk-selected root ids

    // ---- unread: comments arrived since the last dashboard visit ----
    const SEEN_KEY = 'reviewLastSeen';
    const seenAt = localStorage.getItem(SEEN_KEY) || '';
    let seenMarked = false;
    const isNew = (c) => !!seenAt && c.createdAt > seenAt;

    // ---- search / sort ----
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
    // Roots for the current Dashboard view (tab + team + search + sort) - shared by
    // the list render and the toolbar's copy/export actions ("what's in view").
    function currentRoots() {
      let rs = roots();
      // "All" = the active worklist only: open + in-bucket. Anything published (deployed
      // or closed-live) drops out here; it still shows under its own tab + in Master Log.
      if (tab === 'all') rs = rs.filter((c) => isOpen(c) || isBucketed(c));
      if (tab === 'open') rs = rs.filter(isOpen);
      if (tab === 'bucket') rs = rs.filter(isBucketed);
      if (tab === 'deployed') rs = rs.filter(isDeployed);
      if (tab === 'closed') rs = rs.filter(isClosedLive);
      if (teamFilter) rs = rs.filter((c) => c.team === teamFilter);
      return sortRoots(rs.filter(matchesSearch));
    }

    // ---- AI prompt text (falls back to a deterministic instruction) ----
    function localPrompt(c) {
      if (c.aiPrompt) return c.aiPrompt;
      const a = c.anchor || {};
      const where = a.snippet ? `the “${a.snippet}” ${a.tag || 'element'}` : (a.tag || 'the element');
      let s = `On page ${c.page.path}, in ${where}: ${c.comment}`;
      if (c.changeTo) s += `\nChange the content to exactly (preserve casing/punctuation): “${c.changeTo}”`;
      return s;
    }
    // Bulleted, stackable list of change-prompts (each prompt one bullet; wrapped
    // lines indented under it) — ready to paste into a coding agent.
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
        lines.push(`- **${c.page.path}** — ${c.team || '—'} · ${statusLabel(c)}`);
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
        if (team) { const s = teamStyle(team); style = `background:${s.bg};color:${s.fg};border-color:${active ? '#da291c' : s.bd}`; }
        else style = active ? 'background:#da291c;color:#fff;border-color:#da291c'
          : isLight() ? 'background:#f0efe9;color:#565650;border-color:#e4e1d9'
                      : 'background:#242424;color:#c9c9c9;border-color:#333';
        return `<button class="rvd-tchip" data-team="${esc(team)}" style="${style}">${esc(label)}</button>`;
      };
      $('#rvd-teamchips').innerHTML = one('All Teams', '') + TEAMS.map((t) => one(t, t)).join('');
      $('#rvd-teamchips').querySelectorAll('.rvd-tchip').forEach((b) => {
        b.addEventListener('click', () => { teamFilter = b.dataset.team; buildTeamChips(); render(); });
      });
    }

    // Live re-skin: when the admin flips the global theme, the JS-inlined chip colours
    // must be re-derived — repaint the team chips + the current view on the new palette.
    document.addEventListener('pk:themechange', () => {
      try { buildTeamChips(); if (typeof counts === 'function') counts(); render(); } catch (e) {}
    });
    const roots = () => all.filter((c) => !c.parentId);
    const repliesOf = (id) => all.filter((c) => c.parentId === id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

    function counts() {
      const rs = roots();
      const open = rs.filter(isOpen).length;
      const bucket = rs.filter(isBucketed).length;
      const deployed = rs.filter(isDeployed).length;
      const newN = rs.filter(isNew).length;
      $('#rvd-counts').innerHTML =
        `<span class="rvd-count"><b>${open}</b> open</span>` +
        `<span class="rvd-count"><b>${bucket}</b> in bucket</span>` +
        `<span class="rvd-count"><b>${deployed}</b> deployed</span>` +
        (newN ? `<span class="rvd-count rvd-count-new"><b>${newN}</b> new</span>` : '');
      updateBadges();
    }
    // Live counts on the Deploy + Notifications nav items.
    function updateBadges() {
      const bucket = roots().filter(isBucketed).length;
      const unread = (notifs || []).filter((n) => n.readAdmin === false).length;
      const bd = $('#rvd-badge-deploy'); if (bd) { bd.textContent = bucket; bd.hidden = !bucket; }
      const nd = $('#rvd-badge-notifs'); if (nd) { nd.textContent = unread; nd.hidden = !unread; }
    }

    // Scalable comment card — HEADER / BODY / CALLOUT / FOOTER. Shared by the
    // Overview list and the Deploy bucket. Stays clean for 1 or 50 lines of comment,
    // short or long Change-to copy, and 0 or many replies (see the F-section CSS).
    function card(root) {
      const a = root.anchor || {};
      const replies = repliesOf(root.id);
      const repliesHtml = replies.length
        ? `<button class="rvd-repliestoggle" type="button" data-replies="${esc(root.id)}">` +
            `<span class="rvd-caret">▸</span>${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}</button>` +
          `<div class="rvd-replies" hidden>` + replies.map((r) =>
            `<div class="rvd-reply">${teamChip(r.team)}<div class="rvd-rtxt">${esc(r.comment)}</div>` +
            (r.changeTo ? `<div class="rvd-change"><span>Change to</span><div>${esc(r.changeTo)}</div></div>` : '') +
            `<div class="rvd-rmeta">${esc(fmt(r.createdAt))}</div></div>`).join('') + `</div>`
        : '';
      return (
        `<article class="rvd-item">` +
          // HEADER
          `<header class="rvd-card-head">` +
            `<input type="checkbox" class="rvd-sel" data-id="${esc(root.id)}"${sel.has(root.id) ? ' checked' : ''} aria-label="Select">` +
            (isNew(root) ? `<span class="rvd-chip rvd-new">New</span>` : '') +
            statusChip(root) +
            teamChip(root.team) +
            `<a class="rvd-slug" href="${esc(root.page.path)}" target="_blank" rel="noopener">${esc(pageName(root.page.path))}</a>` +
            `<span class="rvd-time">${esc(fmt(root.createdAt))}</span>` +
            `<div class="rvd-acts">` +
              `<a class="rvd-openpin" href="${esc(root.page.path)}?review=1#c=${esc(root.id)}" target="_blank" rel="noopener">Open Pin</a>` +
              lifecycleActions(root) +
              `<button class="rvd-del delete" data-id="${esc(root.id)}">Delete</button>` +
            `</div>` +
          `</header>` +
          // BODY (comment, clamped until expanded)
          `<div class="rvd-card-body">` +
            `<div class="rvd-comment-text rvd-clamp">${esc(root.comment)}</div>` +
            `<button class="rvd-morebtn" type="button" hidden>Show more</button>` +
            (a.snippet ? `<div class="rvd-snip">on “${esc(a.snippet)}”</div>` : '') +
            validLine(root) +
          `</div>` +
          // CALLOUT (Change-to)
          (root.changeTo ? `<div class="rvd-change"><span>Change to</span><div>${esc(root.changeTo)}</div></div>` : '') +
          // FOOTER (replies)
          repliesHtml +
        `</article>`
      );
    }

    // After a card render, reveal the comment "Show more" button only where the
    // clamped text actually overflows (measure in the live, visible DOM).
    function revealClamps(host) {
      host.querySelectorAll('.rvd-comment-text.rvd-clamp').forEach((el) => {
        const btn = el.parentElement.querySelector('.rvd-morebtn');
        if (btn) btn.hidden = el.scrollHeight <= el.clientHeight + 2;
      });
    }

    // Status buttons per working state (section 1): open→Mark Complete; completed→Reopen
    // (+ Re-verify when content-copy-match failed); Close on any non-closed; closed→Reopen.
    function lifecycleActions(root) {
      const id = esc(root.id);
      const st = workingStatus(root);
      const v = root.validation;
      const reverify = (st === 'completed' && v && v.method === 'content-copy-match' && !v.ok)
        ? `<button class="rvd-a" data-id="${id}" data-status="completed">Re-verify</button>` : '';
      let btns;
      if (st === 'open') btns = `<button class="rvd-a" data-id="${id}" data-status="completed">Mark Complete</button>`;
      else if (st === 'completed') btns = reverify + `<button class="rvd-a" data-id="${id}" data-status="open">Reopen</button>`;
      else btns = `<button class="rvd-a" data-id="${id}" data-status="open">Reopen</button>`; // closed
      if (st !== 'closed') btns += `<button class="rvd-a" data-id="${id}" data-status="closed">Close</button>`;
      return btns;
    }

    // ---- Master Log: tabular log of every root change, with drill-in detail ----
    function renderEntries() {
      if (entryDetail) { renderEntryDetail(); return; }
      const rs = sortRoots(roots());
      $('#rvd-empty').hidden = rs.length > 0;
      if (!rs.length) { $('#rvd-entries').innerHTML = ''; return; }
      $('#rvd-entries').innerHTML =
        `<div class="rvd-entrieshead"><h2>Master Log <span style="font-weight:500;color:var(--pk-muted)">(${rs.length})</span></h2></div>` +
        `<div class="rvd-logwrap"><table class="rvd-log"><thead><tr>` +
        `<th>When</th><th>Page</th><th>Element</th><th>Team</th><th>Status</th><th>Prompt</th>` +
        `</tr></thead><tbody>` +
        rs.map((c) => {
          const a = c.anchor || {};
          const el = a.snippet ? '“' + esc(a.snippet.slice(0, 40)) + '”' : esc(a.tag || '—');
          return `<tr class="rvd-logrow" data-id="${esc(c.id)}">` +
            `<td>${esc(fmt(c.createdAt))}</td>` +
            `<td><a class="rvd-slug" href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a></td>` +
            `<td>${el}</td>` +
            `<td>${teamChip(c.team) || '—'}</td>` +
            `<td>${statusChip(c)}</td>` +
            `<td><button class="rvd-prompt-btn" data-more="${esc(c.id)}">View more</button></td>` +
          `</tr>`;
        }).join('') +
        `</tbody></table></div>`;
      // Clicking a row (or its "View more") opens the entry detail. The page link + the
      // View-more button are handled separately so they don't double-fire.
      const open = (id) => { entryDetail = id; render(); };
      $('#rvd-entries').querySelectorAll('.rvd-logrow').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('a')) return; // let the page link through
          open(tr.dataset.id);
        });
      });
    }

    // Build the status-history timeline: use record.history when present, else
    // synthesize it from the lifecycle timestamps (old records predate history).
    function entryHistory(c) {
      if (Array.isArray(c.history) && c.history.length) {
        return c.history.slice().map((h) => ({
          at: h.at,
          label: h.event === 'created' ? 'Created (open)'
            : h.event === 'deployed' ? 'Deployed — ' + (h.status === 'closed' ? 'closed' : 'completed')
            : 'Status → ' + (h.status || 'open'),
        })).sort((a, b) => (a.at < b.at ? -1 : 1));
      }
      const out = [];
      if (c.createdAt) out.push({ at: c.createdAt, label: 'Created (open)' });
      if (c.completedAt) out.push({ at: c.completedAt, label: 'Status → completed' });
      if (c.closedAt) out.push({ at: c.closedAt, label: 'Status → closed' });
      if (c.publishedAt) out.push({ at: c.publishedAt, label: 'Deployed — ' + (c.publishedStatus === 'closed' ? 'closed' : 'completed') });
      return out.sort((a, b) => (a.at < b.at ? -1 : 1));
    }

    function renderEntryDetail() {
      const c = all.find((x) => x.id === entryDetail);
      if (!c) { entryDetail = null; return renderEntries(); }
      $('#rvd-empty').hidden = true;
      const a = c.anchor || {};
      const v = c.validation;
      const validTxt = v
        ? (v.method === 'content-copy-match'
            ? (v.ok ? '✓ Verified on live page' : '⚠ Not verified on live page yet') + (v.detail ? ' — ' + esc(v.detail) : '')
            : 'Manual completion' + (v.detail ? ' — ' + esc(v.detail) : ''))
        : '—';
      const where = a.snippet ? '“' + esc(a.snippet) + '”' + (a.tag ? ' · ' + esc(a.tag) : '') : (a.tag ? esc(a.tag) : '—');
      const hist = entryHistory(c);
      const field = (k, vHtml) => `<div class="rvd-field"><div class="rvd-field-k">${k}</div><div class="rvd-field-v">${vHtml}</div></div>`;
      const timeline = hist.length
        ? `<ol class="rvd-timeline">` + hist.map((h, i) =>
            `<li class="rvd-tl${i === hist.length - 1 ? ' is-current' : ''}">` +
              `<div class="rvd-tl-top"><span class="rvd-tl-event">${esc(h.label)}</span>` +
              `<span class="rvd-tl-time">${esc(fmt(h.at))}</span></div>` +
            `</li>`).join('') + `</ol>`
        : '—';
      $('#rvd-entries').innerHTML =
        `<button class="rvd-back" id="rvd-back">← Back to Master Log</button>` +
        `<article class="rvd-detail">` +
          `<h2 class="rvd-detail-title">${esc(c.comment)}</h2>` +
          `<div class="rvd-detail-chips">${statusChip(c)}${teamChip(c.team)}` +
            `<a class="rvd-slug" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">Open pin</a></div>` +
          `<div class="rvd-fields">` +
            field('Page', `<a href="${esc(c.page.path)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a> <span style="color:var(--pk-muted)">${esc(c.page.path)}</span>`) +
            field('Element / anchor', where) +
            field('Reviewer', esc(c.name || 'anonymous') + (c.team ? ' · ' + esc(c.team) : '')) +
            field('Submitted', esc(fmt(c.createdAt))) +
            (c.changeTo ? `<div class="rvd-field"><div class="rvd-field-k">Change to</div><div class="rvd-change"><div>${esc(c.changeTo)}</div></div></div>` : '') +
            field('Current status', esc(statusLabel(c))) +
            field('Validation', validTxt) +
            `<div class="rvd-field"><div class="rvd-field-k">AI prompt</div>` +
              (c.aiPrompt ? `<div class="rvd-field-prompt">${esc(c.aiPrompt)}</div>`
                          : `<div class="rvd-field-v" style="color:var(--pk-muted);font-style:italic">Generating — usually ready within seconds of submit. Refresh in a moment.</div>`) + `</div>` +
            `<div class="rvd-field"><div class="rvd-field-k">Status history</div>${timeline}</div>` +
          `</div>` +
        `</article>`;
      $('#rvd-back').addEventListener('click', () => { entryDetail = null; render(); });
    }

    // AI change-prompt overlay (precise, ready-to-hand-to-a-dev instruction)
    function openPrompt(c) {
      if (!c) return;
      const a = c.anchor || {};
      const el = document.createElement('div'); el.className = 'rvd-prompt';
      const body = c.aiPrompt
        ? `<div class="rvd-prompt-box">${esc(c.aiPrompt)}</div>` +
          `<div class="rvd-prompt-actions"><button class="rvd-prompt-copy">Copy prompt</button></div>`
        : `<div class="rvd-prompt-box rvd-prompt-gen">Generating the AI prompt — usually ready within seconds of submit. This view auto-refreshes; reopen in a moment.</div>`;
      el.innerHTML =
        `<div class="rvd-prompt-card">` +
          `<div class="rvd-prompt-head"><div class="rvd-prompt-title">AI Change Prompt</div>` +
          `<button class="rvd-prompt-x" aria-label="Close">×</button></div>` +
          `<div class="rvd-prompt-meta">${teamChip(c.team)}` +
            `<a class="rvd-slug" href="${esc(c.page.path)}?review=1#c=${esc(c.id)}" target="_blank" rel="noopener">${esc(pageName(c.page.path))}</a>` +
            (a.tag ? `<span>·</span><span>${esc(a.tag)}</span>` : '') + `</div>` +
          body +
        `</div>`;
      document.body.appendChild(el);
      const close = () => el.remove();
      el.querySelector('.rvd-prompt-x').addEventListener('click', close);
      el.addEventListener('click', (e) => { if (e.target === el) close(); });
      const copy = el.querySelector('.rvd-prompt-copy');
      if (copy) copy.addEventListener('click', () => {
        navigator.clipboard.writeText(c.aiPrompt || '').then(() => {
          copy.textContent = 'Copied ✓'; setTimeout(() => { copy.textContent = 'Copy prompt'; }, 1500);
        }).catch(() => {});
      });
    }

    // ---- Deploy Bucket: every root completed/closed but not yet published ----
    function renderDeploy() {
      $('#rvd-empty').hidden = true;
      const bucket = sortRoots(roots().filter(isBucketed));
      const banner = deployResult
        ? `<div class="rvd-deploy-banner">${esc(deployResult)}</div>` : '';
      const body = bucket.length
        ? `<div class="rvd-grid">${bucket.map(card).join('')}</div>`
        : `<p class="rvd-empty">Nothing waiting to deploy. Mark comments complete to fill the bucket.</p>`;
      $('#rvd-view-deploy').innerHTML =
        `<div class="rvd-deployhead">` +
          `<div><h2>Deploy Bucket</h2>` +
          `<p class="rvd-deploy-explain">Publishing releases these status changes to teams and sends notifications.</p></div>` +
          `<button class="rvd-deploy-btn" id="rvd-deploy-go"${bucket.length ? '' : ' disabled'}>Deploy${bucket.length ? ' ' + bucket.length : ''}</button>` +
        `</div>` + banner + body;
      const go = $('#rvd-deploy-go');
      if (go && bucket.length) go.addEventListener('click', doDeploy);
      bindActions($('#rvd-view-deploy'));
    }
    async function doDeploy() {
      const go = $('#rvd-deploy-go'); if (!go) return;
      if (!confirm('Deploy all completed/closed comments now? This publishes them to teams and sends notifications.')) return;
      go.disabled = true; go.textContent = 'Deploying…';
      try {
        const res = await store.deploy();
        const n = res.deployed || 0, nn = (res.notifications || []).length;
        deployResult = `Deployed ${n} update${n === 1 ? '' : 's'} · ${nn} notification${nn === 1 ? '' : 's'} sent`;
        await loadData(); // refreshes bucket + notifs; render() redraws this view with the banner
      } catch (e) { go.disabled = false; go.textContent = 'Deploy'; alert('Deploy failed — ' + e.message); }
    }

    // ---- Notifications (admin: all), newest first, unread flagged ----
    function renderNotifs() {
      $('#rvd-empty').hidden = true;
      const list = (notifs || []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const unread = list.filter((n) => n.readAdmin === false);
      $('#rvd-view-notifs').innerHTML =
        `<div class="rvd-notifhead">` +
          `<div><h2>Notifications</h2>` +
          `<p class="rvd-deploy-explain">Fired when a deploy publishes a comment to its team.</p></div>` +
          (unread.length ? `<button class="rvd-a" id="rvd-notif-read">Mark all read (${unread.length})</button>` : '') +
        `</div>` +
        (list.length
          ? `<div class="rvd-notiflist">${list.map(notifItem).join('')}</div>`
          : `<p class="rvd-empty">No notifications yet. Deploy the bucket to notify teams.</p>`);
      const rb = $('#rvd-notif-read');
      if (rb) rb.addEventListener('click', async () => {
        rb.disabled = true;
        try { await store.markRead(unread.map((n) => n.id), true); await loadData(); }
        catch (e) { rb.disabled = false; alert('Could not update — ' + e.message); }
      });
      // per-item read/unread toggle: data-read is the target state (true = mark read)
      $('#rvd-view-notifs').querySelectorAll('.rvd-notif-toggle').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try { await store.markRead([btn.dataset.id], btn.dataset.read === 'true'); await loadData(); }
          catch (e) { btn.disabled = false; alert('Could not update — ' + e.message); }
        });
      });
    }
    function notifItem(n) {
      const unread = n.readAdmin === false;
      const done = n.publishedStatus === 'closed' ? 'closed' : 'deployed';
      return `<div class="rvd-notif${unread ? ' is-unread' : ''}">` +
        `<span class="rvd-notif-dot"></span>` +
        `<div class="rvd-notif-body">` +
          `<div class="rvd-notif-summary">${esc(n.summary || '')}</div>` +
          `<div class="rvd-notif-meta">${teamChip(n.team)}` +
            `<a class="rvd-slug" href="${esc(n.path)}" target="_blank" rel="noopener">${esc(n.pageName || pageName(n.path))}</a>` +
            `<span class="rvd-time">${esc(fmt(n.createdAt))}</span>` +
            `<span class="rvd-chip ${done}">${done === 'closed' ? 'Closed' : 'Deployed'}</span>` +
          `</div>` +
        `</div>` +
        `<button class="rvd-a rvd-notif-toggle" type="button" data-id="${esc(n.id)}" data-read="${unread ? 'true' : 'false'}">` +
          `${unread ? 'Mark read' : 'Mark unread'}</button>` +
      `</div>`;
    }

    function render() {
      // left-panel view: Overview / Deploy / Notifications / Master Log.
      $('#rvd-view-dash').hidden = view !== 'dash';
      $('#rvd-view-entries').hidden = view !== 'entries';
      $('#rvd-view-deploy').hidden = view !== 'deploy';
      $('#rvd-view-notifs').hidden = view !== 'notifs';
      if (view === 'entries') { renderEntries(); return; }
      if (view === 'deploy') { renderDeploy(); return; }
      if (view === 'notifs') { renderNotifs(); return; }

      const host = $('#rvd-list');
      const rs = currentRoots();

      if (tab === 'page') {
        const paths = [...new Set(rs.map((c) => c.page.path))].sort();
        host.innerHTML = paths.map((p) => {
          const group = rs.filter((c) => c.page.path === p);
          const openN = group.filter(isOpen).length;
          const bucketN = group.filter(isBucketed).length;
          const deployedN = group.filter(isDeployed).length;
          const closedN = group.filter(isClosedLive).length;
          return `<div class="rvd-group"><h2 class="rvd-gh">` +
            `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(pageName(p))}</a>` +
            `<span class="rvd-gh-rollup">${openN} open · ${bucketN} in bucket · ${deployedN} deployed${closedN ? ' · ' + closedN + ' closed' : ''}</span>` +
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
      if (!rs.length) emp.textContent = search ? 'No comments match your search.' : 'No comments yet.';
      bindActions();
    }

    function updateBulk() {
      const n = sel.size;
      const bar = $('#rvd-bulk');
      bar.hidden = n === 0;
      if (n) $('#rvd-bulk-n').textContent = n + ' selected';
    }

    function bindActions(scope) {
      const host = scope || $('#rvd-list');
      host.querySelectorAll('.rvd-sel').forEach((cb) => {
        cb.addEventListener('change', () => {
          cb.checked ? sel.add(cb.dataset.id) : sel.delete(cb.dataset.id);
          updateBulk();
        });
      });
      host.querySelectorAll('.rvd-a[data-status]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = all.find((c) => c.id === btn.dataset.id); if (!rec) return;
          btn.disabled = true;
          try { const updated = await store.status(rec, btn.dataset.status); Object.assign(rec, updated); counts(); render(); }
          catch (e) { btn.disabled = false; alert('Could not update — ' + e.message); }
        });
      });
      host.querySelectorAll('.delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const rec = all.find((c) => c.id === btn.dataset.id); if (!rec) return;
          if (!confirm('Delete this whole thread (comment + all replies)? This cannot be undone.')) return;
          btn.disabled = true;
          try {
            await store.del(rec);
            all = all.filter((c) => c.id !== rec.id && c.parentId !== rec.id);
            counts(); render();
          } catch (e) { btn.disabled = false; alert('Could not delete — ' + e.message); }
        });
      });
      // comment body: Show more / Show less (clamp toggle)
      host.querySelectorAll('.rvd-morebtn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const el = btn.parentElement.querySelector('.rvd-comment-text');
          const clamped = el.classList.toggle('rvd-clamp');
          btn.textContent = clamped ? 'Show more' : 'Show less';
        });
      });
      // footer: expand / collapse replies
      host.querySelectorAll('.rvd-repliestoggle').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wrap = btn.nextElementSibling; if (!wrap) return;
          const open = wrap.hasAttribute('hidden');
          if (open) wrap.removeAttribute('hidden'); else wrap.setAttribute('hidden', '');
          btn.classList.toggle('is-open', open);
        });
      });
      revealClamps(host); // reveal Show-more only where the comment actually overflows
    }

    document.querySelector('.rvd-side').addEventListener('click', (e) => {
      const b = e.target.closest('.rvd-nav'); if (!b) return;
      view = b.dataset.view; entryDetail = null; // reset Master Log drill-in when switching views
      deployResult = ''; // the deploy banner only shows right after a deploy action
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
      if (btn.classList.contains('is-refreshing')) return; // ignore rapid re-clicks
      btn.classList.remove('is-done');
      btn.classList.add('is-refreshing');
      const t0 = Date.now();
      try {
        await loadData();
        await wait(Math.max(0, 650 - (Date.now() - t0))); // keep the spin visible for instant local loads
        btn.classList.remove('is-refreshing');
        btn.classList.add('is-done');       // tick morphs in
        setTimeout(() => {
          btn.classList.add('is-resetting');  // ring pulses out + tick morphs back to refresh
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
    $('#rvd-sort').addEventListener('change', (e) => { sort = e.target.value; render(); });
    $('#rvd-copyall').addEventListener('click', (e) => copyToClip(promptsText(currentRoots()), e.currentTarget, 'Copied ✓'));
    $('#rvd-md').addEventListener('click', (e) => copyToClip(mdExport(currentRoots()), e.currentTarget, 'Copied ✓'));
    $('#rvd-json').addEventListener('click', () => downloadJSON());

    // ---- bulk actions on the selected comments ----
    $('#rvd-bulk').addEventListener('click', async (e) => {
      const b = e.target.closest('.rvd-bulk-a'); if (!b) return;
      const act = b.dataset.act;
      const recs = [...sel].map((id) => all.find((c) => c.id === id)).filter(Boolean);
      if (!recs.length) return;
      if (act === 'copy') { copyToClip(promptsText(recs), b, 'Copied ✓'); return; }
      if (act === 'delete' && !confirm(`Delete ${recs.length} thread${recs.length > 1 ? 's' : ''} + their replies? This cannot be undone.`)) return;
      [...$('#rvd-bulk').querySelectorAll('.rvd-bulk-a')].forEach((x) => (x.disabled = true));
      try {
        for (const rec of recs) {
          if (act === 'complete') { Object.assign(rec, await store.status(rec, 'completed')); }
          else if (act === 'reopen') { Object.assign(rec, await store.status(rec, 'open')); }
          else if (act === 'close') { Object.assign(rec, await store.status(rec, 'closed')); }
          else if (act === 'delete') { await store.del(rec); all = all.filter((c) => c.id !== rec.id && c.parentId !== rec.id); }
        }
        sel.clear(); updateBulk(); counts(); render();
      } catch (err) { alert('Bulk action failed — ' + err.message); }
      finally { [...$('#rvd-bulk').querySelectorAll('.rvd-bulk-a')].forEach((x) => (x.disabled = false)); }
    });
    $('#rvd-bulk-clear').addEventListener('click', () => { sel.clear(); updateBulk(); render(); });

    buildTeamChips();
    init();
  })();
