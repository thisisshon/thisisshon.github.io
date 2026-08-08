  import { WORKER_URL, PROOFKIT_ENABLED, checkReviewPassword, getSession, isTeamEnabled, BASE, PK_MARK } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    const LOCAL = !WORKER_URL;
    const PASS_KEY = 'reviewAdminPass'; // admin password (shared with the dashboard)
    const DASH = BASE;

    // Validate a password. With the Worker: hit the admin-only "list all comments"
    // endpoint (401 => wrong). Without it (static/no-Worker, incl. live): check the
    // configured review password (hash-compared, so it holds on every deployment).
    async function validate(pass) {
      if (LOCAL) {
        if (!(await checkReviewPassword(pass))) throw new Error('unauthorized');
        return true;
      }
      const res = await fetch(WORKER_URL + '/comments', {
        headers: { 'Content-Type': 'application/json', 'X-Review-Pass': pass },
      });
      if (res.status === 401) throw new Error('unauthorized');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return true;
    }

    let loginEl = null;

    function showLogin() {
      if (!loginEl) {
        loginEl = document.createElement('div');
        loginEl.className = 'rvd-login';
        loginEl.innerHTML =
          /* The shared auth card. The .rvd-* classes stay ON the same elements purely as JS
           * hooks — every visual property now comes from .pk-access-* / .pk-unlock-*, so this
           * screen cannot drift from the others by being edited in isolation. */
          '<div class="pk-access-card rvd-login-card" role="dialog" aria-modal="true">' +
          '<button type="button" class="rvd-login-close" aria-label="Close">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
          '<div class="pk-access-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
          '<h1 class="pk-access-title rvd-login-title">Annotate Live Pages</h1>' +
          '<p class="pk-access-sub rvd-login-sub">Enter the review password to open the dashboard.</p>' +
          '<input class="pk-unlock-input pk-unlock-input--text rvd-login-input" type="password" placeholder="Password" autocomplete="current-password">' +
          '<div class="pk-access-err rvd-login-err" hidden></div>' +
          '<button type="button" class="pk-unlock-go rvd-login-btn">Log In</button>' +
          '</div>';
        const input = loginEl.querySelector('.rvd-login-input');
        const go = () => tryLogin(input);
        loginEl.querySelector('.rvd-login-btn').addEventListener('click', go);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        const close = () => hideLogin();
        loginEl.querySelector('.rvd-login-close').addEventListener('click', close);
        // Esc closes; clicking the dimmed backdrop (outside the card) closes too.
        loginEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        loginEl.addEventListener('mousedown', (e) => { if (e.target === loginEl) close(); });
      }
      document.body.appendChild(loginEl);
      loginEl.querySelector('.rvd-login-input').focus();
    }

    function hideLogin() {
      if (loginEl && loginEl.parentNode) loginEl.parentNode.removeChild(loginEl);
    }

    async function tryLogin(input) {
      const pass = input.value.trim();
      if (!pass) { input.focus(); return; }
      const err = loginEl.querySelector('.rvd-login-err');
      const btn = loginEl.querySelector('.rvd-login-btn');
      // Access gate (defence-in-depth): if the shared session belongs to a team
      // parked off via TEAM_ENABLED, reject here — before hitting the Worker.
      const sTeam = getSession().team;
      if (sTeam && !isTeamEnabled(sTeam)) {
        err.textContent = "This team's review access isn't currently available.";
        err.hidden = false; input.focus(); return;
      }
      btn.disabled = true; btn.textContent = 'Checking…'; err.hidden = true;
      try {
        await validate(pass);
        sessionStorage.setItem(PASS_KEY, pass); // dashboard reuses this session token
        sessionStorage.setItem('reviewMode', '1'); // arm the on-page Comment dock site-wide
        location.replace(DASH);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Login';
        err.textContent = e.message === 'unauthorized'
          ? 'Incorrect password. Please try again.'
          : ('Could not connect — ' + e.message);
        err.hidden = false; input.focus(); input.select();
      }
    }

    // Already signed in this session? Verify the stored token still works, then
    // skip straight to the dashboard; otherwise clear it and ask again.
    async function init() {
      const existing = sessionStorage.getItem(PASS_KEY);
      if (existing) {
        try { await validate(existing); sessionStorage.setItem('reviewMode', '1'); location.replace(DASH); return; }
        catch { sessionStorage.removeItem(PASS_KEY); }
      }
      showLogin();
    }

    init();
  })();
