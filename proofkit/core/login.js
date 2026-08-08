  import { WORKER_URL, PROOFKIT_ENABLED, getSession, isTeamEnabled, BASE,
           buildAccessLogin, accessLogin, passkeyLoginDiscoverable, getAccount, boardBase } from './config.js';
  (() => {
    if (!PROOFKIT_ENABLED) return; // master switch (./config.ts)
    let loginEl = null;
    let screen = null;

    /* The gate asks for an ACCESS KEY — the same eight boxes, the same component, the same
     * Advanced routes as the extension popup and the hosted sign-in page. It used to ask for the
     * shared review password (ADMIN_PASS, kept in sessionStorage as `reviewAdminPass`), which was
     * one secret for everyone: it identified nobody, so the dashboard behind it could not tell who
     * had opened it, and changing it meant telling every reviewer at once. A key belongs to a
     * person, and signing in with one produces a real session with a real identity.
     */
    function showLogin() {
      if (!loginEl) {
        loginEl = document.createElement('div');
        loginEl.className = 'rvd-login';
        screen = buildAccessLogin({
          title: 'Access Key',
          sub: 'Two letters, then six digits.',
          onSubmit: (code) => submit(code),
          onBiometric: () => viaPasskey(),
          // The email + password form lives on the hosted sign-in page. One implementation of it,
          // reached from here, rather than a second copy of the same three fields.
          onEmail: () => { location.href = BASE + '/auth/'; },
        });
        loginEl.appendChild(screen.el);
        screen.el.hidden = false;

        // Close (✕) — the gate is dismissible; you can read the page without reviewing it.
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'rvd-login-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        close.addEventListener('click', hideLogin);
        screen.el.querySelector('.pk-access-card').appendChild(close);

        loginEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLogin(); });
        loginEl.addEventListener('mousedown', (e) => { if (e.target === loginEl) hideLogin(); });
      }
      document.body.appendChild(loginEl);
      screen.focus();
    }

    function hideLogin() {
      if (loginEl && loginEl.parentNode) loginEl.parentNode.removeChild(loginEl);
    }

    /** Where a signed-in user belongs: their own board. */
    function landing(user) {
      return boardBase((user && user.team) || getSession().team);
    }

    function enter(user) {
      sessionStorage.setItem('reviewMode', '1'); // arm the on-page Comment dock site-wide
      location.replace(landing(user));
    }

    async function submit(code) {
      /* Defence in depth: a session belonging to a team parked off via TEAM_ENABLED is refused
       * here, before the Worker is asked anything. */
      const sTeam = getSession().team;
      if (sTeam && !isTeamEnabled(sTeam)) {
        screen.reject("This team's review access isn't currently available.");
        return;
      }
      screen.setBusy(true);
      try {
        const body = await accessLogin(WORKER_URL, code);
        screen.setBusy(false);
        screen.accept();
        await screen.dismiss();
        enter(body.user);
      } catch (e) {
        screen.setBusy(false);
        screen.reject(e && e.locked
          ? 'Too many attempts. Try again shortly.'
          : 'Access denied. Please enter the correct access key.');
      }
    }

    /* Biometrics run HERE rather than handing off: this page is on our own origin, which is the
     * origin the passkey was created for. */
    async function viaPasskey() {
      screen.setBusy(true);
      try {
        const body = await passkeyLoginDiscoverable(WORKER_URL);
        screen.setBusy(false);
        screen.accept();
        await screen.dismiss();
        enter(body && body.user);
      } catch (e) {
        screen.setBusy(false);
        screen.setError('No passkey was used. Enter your access key instead.');
      }
    }

    // Already signed in? Skip the gate entirely — the account session is the whole credential now,
    // and it is the same one the extension seeds through bridge.js.
    async function init() {
      if (getAccount()) { sessionStorage.setItem('reviewMode', '1'); location.replace(landing(getAccount())); return; }
      showLogin();
    }

    init();
  })();
