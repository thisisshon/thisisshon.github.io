  import { WORKER_URL, PROOFKIT_ENABLED, getSession, isTeamEnabled, BASE, homeUrl, loginUrl, handoffUrl, SITE_ORIGIN, boardHome, lockTab, tellExtensionSignedIn, clearSession, clearAccount, onRemoteSignOut,
           buildAccessLogin, accessLogin, passkeyLoginDiscoverable, getAccount, getAuthToken, boardBase } from './config.js?v=84828f2899';
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
        /* The card mounts into the page's own slot. It used to build its own fixed, scrimmed
         * layer with a close button and Escape-to-dismiss, because this file was a GATE thrown
         * over a review in progress — dismissible on purpose, since you can read a page without
         * reviewing it.
         *
         * On its own host that is backwards: sign-in is the destination, nothing is behind it, and
         * offering to close the only thing on screen offers a blank page. */
        loginEl = document.querySelector('.pk-lp-slot');
        if (!loginEl) {                       // a host that laid out no page: make a slot
          loginEl = document.createElement('div');
          loginEl.className = 'pk-lp-slot';
          document.body.appendChild(loginEl);
        }
        screen = buildAccessLogin({
          title: 'Access Key',
          sub: 'Two letters, then six digits.',
          onSubmit: (code) => submit(code),
          onBiometric: () => viaPasskey(),
          // The email + password form lives on the hosted sign-in page. One implementation of it,
          // reached from here, rather than a second copy of the same three fields.
          onEmail: () => { location.href = loginUrl('/auth/'); },
        });
        loginEl.appendChild(screen.el);
        screen.el.hidden = false;
        // Stashed so the signed-in state can rebuild the card without importing the icon again.
        screen.el.querySelector('.pk-access-card').dataset.mark =
          screen.el.querySelector('.pk-access-mark svg').outerHTML;
      }
      screen.focus();
    }

    /* Still called by the signed-in and returning states. It empties the slot rather than
     * detaching a layer — there is no layer any more. */
    function hideLogin() {
      if (loginEl) loginEl.textContent = '';
    }

    /** Where a signed-in user belongs: their own board. */
    /* Where sign-in sends you. Normally your own board; but a board that bounced you here for a
     * session it did not have passes ?return=, so a deep link — a ticket, a person — survives an
     * expiry instead of dumping you on the board root having lost the thing you opened.
     *
     * ALLOWLISTED, not merely parsed. A login page that forwards to any URL it is handed is an
     * open redirect, and this one is reached straight from the product page. */
    function safeReturn(raw) {
      try {
        const u = new URL(String(raw || ''), location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        if (u.origin !== location.origin && u.origin !== SITE_ORIGIN) return '';
        /* A return aimed back at THIS page is a same-page reload loop: with an account present,
         * init() replaces the location with itself, forever. auth.js refuses this for the same
         * reason; the check arrived there first only because its ?return predates this one. */
        if (u.origin === location.origin && u.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, '')) return '';
        return u.href;
      } catch (e) { return ''; }
    }
    const backTo = safeReturn(new URLSearchParams(location.search).get('return'));

    function landing(user) {
      return backTo || boardHome((user && user.team) || getSession().team);
    }

    /* Who asked. `ext` names the extension to hand the finished session to; `return` is the tab
     * they came from, so the extension knows which one to arm. Extension ids are a-p only. */
    const params = new URLSearchParams(location.search);
    const extId = (params.get('ext') || '').replace(/[^a-p]/g, '');
    const returnTo = (() => {
      try {
        const u = new URL(params.get('return') || '', location.href);
        if (!/^https?:$/.test(u.protocol)) return '';
        // Refuse to point back at ourselves — that is a loop, not a return.
        if (u.origin === location.origin && u.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, '')) return '';
        return u.href;
      } catch (e) { return ''; }
    })();

    /* Hand the session to the extension. Best-effort: a failure means the review tab is not armed
     * automatically, not that the sign-in did not happen. `keepOpen` is the difference from the
     * old round trip — the extension must NOT close this tab, because this tab has a second job
     * to do (see below). */
    function handOff(body) {
      if (!extId || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return Promise.resolve(null);
      }
      return new Promise((res) => {
        let done = false;
        const settle = (v) => { if (!done) { done = true; res(v); } };
        try {
          chrome.runtime.sendMessage(extId,
            { type: 'proofkit-session', user: body.user, token: body.token, arm: returnTo, keepOpen: true },
            (reply) => settle(chrome.runtime.lastError ? null : (reply || null)));
          setTimeout(() => settle(null), 2500);   // a stale or missing extension must not hang this
        } catch (e) { settle(null); }
      });
    }

    const HOLD_MS = 20000;

    /* Signed in. Two things now happen at once, and they are the whole point of this page.
     *
     * The extension takes the session, arms the tab they came from and focuses it — so they are
     * back in their review immediately, already signed in, with no second step.
     *
     * THIS tab stays open and, twenty seconds later, loads their dashboard. It is doing useful
     * work while they are pinning: by the time they come back to it, the board has fetched and
     * rendered. The alternative — closing this tab, as the old round trip did — meant opening the
     * dashboard later and waiting for it then.
     */
    async function enterWith(body) {
      sessionStorage.setItem('reviewMode', '1');
      /* The extension gets the session even when it did not open this page. handOff below only
       * fires for ?ext=, which is the extension's own round trip; signing in on the website is the
       * commoner case and used to leave the extension signed out. */
      await tellExtensionSignedIn(body && body.user, body && body.token);
      const reply = await handOff({ user: body && body.user, token: body && body.token });
      const dest = handoffUrl(landing(body && body.user), body && body.user, (body && body.token) || getAuthToken());
      if (reply && reply.ok) { showReturning(dest); return; }
      location.replace(dest);
    }

    async function enter(user) {
      sessionStorage.setItem('reviewMode', '1'); // arm the on-page Comment dock site-wide
      const reply = await handOff({ user, token: undefined });
      const dest = handoffUrl(landing(user), user, getAuthToken());
      if (reply && reply.ok) { showReturning(dest); return; }
      // Nothing took the session — this page is the whole journey, so just go.
      location.replace(dest);
    }

    /* The held state: says what happened, where they are going, and how long they have. A countdown
     * rather than a spinner, because the wait is deliberate and they are meant to leave. */
    function showReturning(dest) {
      const card = loginEl && loginEl.querySelector('.pk-access-card');
      if (!card) { location.replace(dest); return; }
      card.innerHTML =
        '<div class="pk-access-mark">' + card.dataset.mark + '<span>Proofkit</span></div>' +
        '<h1 class="pk-access-title">Signed In</h1>' +
        '<p class="pk-access-sub">Your review is ready in the tab you came from. ' +
        'This tab will open your dashboard in <b class="pk-hold-n">20</b>s — leave it running.</p>' +
        '<button type="button" class="pk-unlock-go pk-hold-go">Open Dashboard Now</button>';
      const n = card.querySelector('.pk-hold-n');
      card.querySelector('.pk-hold-go').addEventListener('click', () => location.replace(dest));
      let left = Math.round(HOLD_MS / 1000);
      const tick = setInterval(() => {
        left -= 1;
        if (n) n.textContent = String(Math.max(0, left));
        if (left <= 0) { clearInterval(tick); location.replace(dest); }
      }, 1000);
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
        await enterWith(body);
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
        await enterWith(body);
      } catch (e) {
        screen.setBusy(false);
        screen.setError('No passkey was used. Enter your access key instead.');
      }
    }

    // Already signed in? Skip the gate entirely — the account session is the whole credential now,
    // and it is the same one the extension seeds through bridge.js.
    /* Signed out somewhere else while this page sat open. Nowhere to navigate — this IS the
     * sign-in page — so drop whatever was remembered and put the form back. */
    onRemoteSignOut(() => {
      try { sessionStorage.removeItem('pkSignInBounce'); } catch (e) {}
      try { hideLogin(); } catch (e) {}
      showLogin();
    });

    async function init() {
      /* ARRIVED FROM A LOGOUT. The boards can only clear their OWN origin, and signing in wrote the
       * account, token and team here — so without this the sign-in page still held a complete,
       * valid session, found it, verified it, and sent the person straight back to the board they
       * had just left. That is the "logged out for a second, then logged back in" everybody saw.
       *
       * Two things happen, and the second is not redundant. The storage is cleared; and the
       * auto-redirect is SKIPPED for this load no matter what. The extension's bridge seeds a
       * session on page load too, so clearing alone is a race against it — one this page would
       * sometimes lose, and losing it means signing the person back in. Refusing to redirect at
       * all on a logout arrival cannot be raced. */
      const params = new URLSearchParams(location.search);
      const justSignedOut = params.get('signout') === '1';
      if (justSignedOut) {
        clearSession();
        clearAccount();
        lockTab();
        // The boards' bounce mark lives on their origin, but this page keeps one of its own
        // through the chooser; clear it so a later genuine expiry is not mistaken for a loop.
        try { sessionStorage.removeItem('pkSignInBounce'); } catch (e) {}
        /* Take it out of the address bar: it has been acted on, and a bookmark or a refresh should
         * not keep re-signing somebody out for the rest of time. */
        try {
          params.delete('signout');
          const q = params.toString();
          history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
        } catch (e) {}
      }


      /* Already signed in — go to the board rather than ask again. handoffUrl rather than a bare
       * path because on a split deploy this page is on the SIGN-IN host, and the path would
       * resolve to this tree's own copy of the board with no session behind it.
       *
       * THE TOKEN IS THE CONDITION, not the account. pkAccount is durable and shared across tabs;
       * the token lives in sessionStorage and is per-tab BY DESIGN, so a new tab knows who you are
       * and cannot prove it. Redirecting on the account alone sent that tab to a board on another
       * origin with nothing to hand over; the board found no session and bounced it straight back
       * here; and this function returned before building the form — so the page sat there with an
       * empty right-hand side, redirecting in a circle.
       *
       * Same origin is exempt: there the board reads the very storage this page wrote, so there is
       * nothing to hand over and nothing to fail. */
      const acct = getAccount();
      let token = getAuthToken();
      if (acct && !justSignedOut) {
        let dest = handoffUrl(landing(acct), acct, token);
        let crosses = false;
        try { crosses = new URL(dest, location.href).origin !== location.origin; } catch (e) {}
        /* VERIFY THE TOKEN BEFORE TRUSTING IT ACROSS AN ORIGIN. A token can be present and dead —
         * the server session expires or is swept, and nothing tells this page. Redirecting on mere
         * existence built a loop with no exit: hand the dead token to the board, the board gets a
         * 401 and bounces back here, and this page hands over the same dead token again, forever.
         * auth.js has verified-not-trusted from the start; this page now does the same. A worker
         * that cannot be reached counts as unverified, because the one screen that must always
         * work is the form below — never a redirect built on an unprovable claim. */
        if (crosses && token && WORKER_URL) {
          try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 2500);
            const r = await fetch(WORKER_URL.replace(/\/$/, '') + '/auth/me',
              { headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal });
            clearTimeout(t);
            if (!r.ok) { lockTab(); token = ''; }
          } catch (e) { token = ''; }
          dest = handoffUrl(landing(acct), acct, token);   // the fragment must not carry a dead token
        }
        if (token || !crosses) {
          sessionStorage.setItem('reviewMode', '1');
          location.replace(dest);
          return;
        }
        /* Otherwise fall through to the form. We still know who they are. */
      }
      showLogin();
    }

    init();
  })();
