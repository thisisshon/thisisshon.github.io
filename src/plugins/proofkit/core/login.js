  import { WORKER_URL, PROOFKIT_ENABLED, checkReviewPassword, getSession, isTeamEnabled } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    const LOCAL = !WORKER_URL;
    const PASS_KEY = 'reviewAdminPass'; // admin password (shared with the dashboard)
    const DASH = '/reviewdash';

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
          '<div class="rvd-login-card" role="dialog" aria-modal="true">' +
          '<div class="rvd-login-title">Content Review</div>' +
          '<div class="rvd-login-sub">Enter the review password to open the dashboard.</div>' +
          '<input class="rvd-login-input" type="password" placeholder="Password" autocomplete="current-password">' +
          '<div class="rvd-login-err" hidden></div>' +
          '<div class="rvd-login-actions"><button type="button" class="rvd-login-btn">Login</button></div>' +
          '<div class="rvd-login-brand">Proofkit</div>' +
          '</div>';
        const input = loginEl.querySelector('.rvd-login-input');
        const go = () => tryLogin(input);
        loginEl.querySelector('.rvd-login-btn').addEventListener('click', go);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      document.body.appendChild(loginEl);
      loginEl.querySelector('.rvd-login-input').focus();
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
