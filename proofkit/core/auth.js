/**
 * Proofkit auth page — sign in once, biometrically where possible, then go back to work.
 *
 * WHY THIS PAGE EXISTS
 * Chrome refuses WebAuthn from `chrome-extension://` origins, so the popup can never raise Touch
 * ID itself. It opens this page on a normal https origin, we authenticate here, and the session is
 * handed back to the extension, which arms the tab the user actually came from.
 *
 * THE INTERACTION
 * Typing an identity is the ONLY thing asked for up front. The moment that identity settles —
 * a short pause in typing, a blur, or Enter — we ask the server whether it has a passkey and, if
 * so, raise the biometric immediately. For `builder` that means: type the word, get the prompt.
 * No button, no PIN, no second step.
 *
 * The PIN field stays out of the way until it is actually needed (no passkey on this account, no
 * platform authenticator on this machine, or the biometric was cancelled). It is never removed as
 * an option — a fingerprint reader that is asleep, wet, or simply refusing must not be the reason
 * someone cannot reach their own work.
 *
 * URL parameters:
 *   ?return=<url>   where to send the user afterwards (an http/https URL, validated)
 *   ?ext=<id>       a Chrome extension to hand the session to before returning
 *   ?email=<addr>   pre-fill, e.g. when the popup already knows who is signed in
 */
import {
  WORKER_URL, accountLogin, accessLogin, buildAccessLogin,
  passkeyLoginDiscoverable, hasPlatformAuthenticator, getAccount, getAuthToken, PK_MARK,
} from './config.js?v=a6df712487';

const $ = (s) => document.querySelector(s);
const workerUrl = window.PROOFKIT_WORKER_URL || WORKER_URL;
const params = new URLSearchParams(location.search);

/* An open redirect on a login page hands an attacker a credible way to bounce someone straight
 * from a real Proofkit sign-in onto a page of their choosing. Only http(s) is allowed through,
 * and anything unparseable falls back to this page's own origin. */
function safeReturn(raw) {
  try {
    const u = new URL(String(raw || ''), location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    // A return URL pointing back at THIS page is an infinite loop: sign in, come back here, get
    // prompted again, forever — and because the biometric state hides the form there is no way
    // out of it by hand. Refuse it outright rather than trusting the caller to get it right.
    if (u.origin === location.origin && u.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, '')) return '';
    return u.href;
  } catch (e) { return ''; }
}
const returnTo = safeReturn(params.get('return'));
const extId = (params.get('ext') || '').replace(/[^a-p]/g, '');   // extension ids are a–p only

const ICON_TOUCH =
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 10v4a8 8 0 0 1-.4 2.5"/><path d="M8.5 8.5a5 5 0 0 1 7 3.5v2"/>' +
  '<path d="M5.5 6.5a9 9 0 0 1 13 5.5v2.5"/><path d="M8 20a12 12 0 0 0 1.2-3"/>' +
  '<path d="M15.5 19.5A16 16 0 0 0 16 15"/></svg>';
const ICON_TOUCH_SM = ICON_TOUCH.replace('width="34" height="34"', 'width="19" height="19"');

/* THE SCREEN. One question — the access key — and nothing else above the fold.
 *
 * Email + PIN and biometrics are still here, but as RECOVERY: the answer to "I have lost my key",
 * not a choice to weigh on every sign-in. They live behind a collapsed Advanced at the bottom.
 */
/* Hand the session to the extension, if one opened this page. Best-effort by design: a failure
 * here means the tab is not auto-armed, not that the sign-in did not happen. */
async function handOff(body) {
  if (!extId || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return null;
  return new Promise((res) => {
    let done = false;
    const settle = (v) => { if (!done) { done = true; res(v); } };
    try {
      chrome.runtime.sendMessage(extId,
        { type: 'proofkit-session', user: body.user, token: body.token, arm: returnTo },
        (reply) => settle(chrome.runtime.lastError ? null : (reply || null)));
      setTimeout(() => settle(null), 2500);   // a missing or stale extension must not hang this
    } catch (e) { settle(null); }
  });
}

/** Signed in — hand off if asked, then go back where they came from. */
async function finish(body) {
  const reply = await handOff(body);
  /* When the extension owns this tab it does the whole return trip: it arms the tab the user came
   * from, focuses it, and closes THIS one. Navigating as well would leave two tabs on the same
   * page, so wait to be closed and only take over if that does not happen. */
  if (reply && reply.closing) {
    login.el.hidden = true;
    const note = document.createElement('p');
    note.className = 'pka-note';
    note.textContent = 'Taking you back…';
    document.body.appendChild(note);
    setTimeout(() => { if (returnTo) location.replace(returnTo); }, 3000);
    return;
  }
  if (returnTo) { location.replace(returnTo); return; }
  login.el.hidden = true;   // already dismissed on the access-key path; a no-op there
  if (fallback) fallback.hidden = true;
  const note = document.createElement('p');
  note.className = 'pka-note';
  note.textContent = 'Signed in as ' + (body.user.name || body.user.email) + '. You can close this tab.';
  document.body.appendChild(note);
}

/** A bare waiting screen for the biometric path — the OS sheet should own the attention, and the
 *  page behind it should not be a form the user might start typing into. */
function showWaiting() {
  const el = document.createElement('div');
  el.className = 'pk-access-login';
  el.innerHTML =
    '<div class="pk-access-card pk-access-card--wait">' +
      '<div class="pk-access-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
      '<div class="pka-scan">' + ICON_TOUCH + '<p>Waiting for Touch ID…</p></div>' +
      '<button type="button" class="pk-access-alt" id="waitKey">Use My Access Key Instead</button>' +
    '</div>';
  document.body.appendChild(el);
  el.querySelector('#waitKey').addEventListener('click', () => { el.remove(); login.el.hidden = false; login.focus(); });
  return el;
}

/** The biometric route. Returns quietly when there is nothing to use. */
async function tryPasskey(auto) {
  // On the auto path the key screen has not been shown yet; on the manual one it has.
  const waiting = auto ? showWaiting() : null;
  if (!auto) login.setBusy(true);
  try {
    /* DISCOVERABLE, not passkeyLogin(''). passkeyLogin asks the server which credentials a NAMED
     * account has; with an empty email it finds nobody, reports hasPasskey:false and returns
     * without ever raising a prompt — which read as "no passkey on this device" when the real
     * answer was "you never asked". Discoverable mode sends an empty allowCredentials and lets the
     * authenticator offer whatever it holds, which is the whole point of a usernameless sign-in. */
    const body = await passkeyLoginDiscoverable(workerUrl);
    if (body) { await finish(body); return; }
    // Cancelled, or nothing enrolled. Either way the access key is the way forward, so land there
    // rather than on a dead end explaining what did not happen.
    if (waiting) waiting.remove();
    login.el.hidden = false;
    login.setBusy(false);
    login.setError('No passkey used. Enter your access key instead.');
    login.focus();
  } catch (e) {
    if (waiting) waiting.remove();
    login.el.hidden = false;
    login.setBusy(false);
    login.setError(e.message || 'Could not sign in with biometrics.');
    login.focus();
  }
}

let hasBiometric = false;
let fallback = null;
/* Arrived from the extension's Biometrics button. The click that opened this tab already WAS the
 * request, so the page raises the prompt on load rather than showing a screen that asks again. */
const wantBiometric = (params.get('auth') || '') === 'biometric';                 // the email + PIN form, built only if someone asks for it

const login = buildAccessLogin({
  title: 'Access Key',
  sub: 'Two letters, then six digits.',
  onSubmit: (code) => signInWithAccess(code),
  onBiometric: () => tryPasskey(false),
  onEmail: () => showEmailFallback(),
});
document.body.appendChild(login.el);

async function signInWithAccess(code) {
  login.setBusy(true);
  try {
    const body = await accessLogin(workerUrl, code);
    // Hold the accepted state for a beat before leaving, or a correct code looks identical to a
    // dropped keystroke until the next page paints.
    // Green for a beat, then play the screen out and hand over on the beat it lands.
    login.accept();
    await new Promise((r) => setTimeout(r, 260));
    await login.dismiss();
    await finish(body);
  } catch (e) {
    login.setBusy(false);
    // A locked-out message names the wait; anything else is just "not recognised", because
    // distinguishing a wrong code from an unknown one would say which codes exist.
    login.reject(e.locked
      ? 'Too many attempts. Try again in ' + Math.ceil((e.retryAfter || 60000) / 1000) + 's.'
      : 'Access denied. Please enter the correct access key.');
  }
}

/** The email + PIN route, built on demand — it is a fallback, so it does not exist until asked for. */
function showEmailFallback() {
  if (fallback) { fallback.hidden = false; fallback.querySelector('#email').focus(); return; }
  fallback = document.createElement('div');
  fallback.className = 'pka';
  fallback.innerHTML =
    '<div class="pka-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
    '<h1 class="pka-title">Sign in</h1>' +
    '<p class="pka-sub" id="sub">Use your email and PIN.</p>' +
    '<div id="form">' +
      '<div class="pka-field"><label class="pka-label" for="email">Email</label>' +
        '<input id="email" class="pka-input" type="text" autocomplete="username" spellcheck="false" autocapitalize="off"></div>' +
      '<div class="pka-pin is-open" id="pinwrap"><div><div class="pka-field">' +
        '<label class="pka-label" for="pin">PIN</label>' +
        '<input id="pin" class="pka-input" type="password" inputmode="numeric" autocomplete="current-password"></div></div></div>' +
      '<button type="button" class="pka-btn" id="go">Continue</button>' +
      '<button type="button" class="pka-alt" id="backToKey">Back to access key</button>' +
      '<div class="pka-err" id="err" hidden></div>' +
    '</div>';
  document.body.appendChild(fallback);
  login.el.hidden = true;

  const $$ = (sel) => fallback.querySelector(sel);
  const setErr = (m) => { const e = $$('#err'); e.textContent = m || ''; e.hidden = !m; };
  const submit = async () => {
    const id = $$('#email').value.trim(), p = $$('#pin').value.trim();
    if (!id || !p) { setErr('Enter your email and PIN.'); return; }
    const go = $$('#go'); go.disabled = true; go.textContent = 'Signing in…';
    try { await finish(await accountLogin(workerUrl, id, p)); }
    catch (e) {
      go.disabled = false; go.textContent = 'Continue';
      setErr(e.locked ? 'Too many attempts. Try again shortly.' : (e.message || 'Could not sign in.'));
    }
  };
  $$('#go').addEventListener('click', submit);
  $$('#pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  $$('#email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $$('#pin').focus(); });
  $$('#backToKey').addEventListener('click', () => { fallback.hidden = true; login.el.hidden = false; login.focus(); });
  $$('#email').focus();
}

(async function init() {
  /* ALREADY SIGNED IN? Then this page has nothing to ask. Without this the page prompts on every
   * load, so anything landing back here after a successful sign-in prompts again — and again.
   * The token is verified rather than trusted, so an expired one falls through to a normal
   * sign-in instead of bouncing someone somewhere they cannot load. */
  const existing = getAuthToken();
  if (existing) {
    try {
      const r = await fetch(workerUrl.replace(/\/$/, '') + '/auth/me', { headers: { Authorization: 'Bearer ' + existing } });
      if (r.ok) {
        const me = await r.json();
        login.el.hidden = true;
        const done = document.createElement('p');
        done.className = 'pka-note';
        done.textContent = 'Already signed in as ' + (me.user.name || me.user.email) + '.';
        document.body.appendChild(done);
        if (returnTo) { location.replace(returnTo); return; }
        done.textContent += ' You can close this tab.';
        return;
      }
    } catch (e) { /* unreachable Worker — fall through and let them sign in normally */ }
  }

  hasBiometric = await hasPlatformAuthenticator();
  // Only offer a route that can actually run here.
  if (!hasBiometric) {
    const bio = login.el.querySelector('[data-alt="bio"]');
    if (bio) bio.remove();
  }

  if (wantBiometric && hasBiometric) {
    // Straight to the prompt. The key screen stays built and hidden, so cancelling lands on it
    // instantly rather than after a second page load.
    login.el.hidden = true;
    tryPasskey(true);
    return;
  }
  if (wantBiometric && !hasBiometric) {
    login.setError('This device has no biometric reader. Use your access key.');
  }
  login.focus();
})();
