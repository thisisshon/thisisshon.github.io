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
  WORKER_URL, accountLogin, passkeyLogin, hasPlatformAuthenticator, getAccount, getAuthToken, PK_MARK,
} from './config.js';

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

document.body.innerHTML =
  '<main class="pka">' +
    '<div class="pka-mark">' + PK_MARK + '<span>Proofkit</span></div>' +
    '<h1 class="pka-title">Sign in</h1>' +
    '<p class="pka-sub" id="sub">Enter your email to continue.</p>' +
    '<div id="form">' +
      '<div class="pka-field">' +
        '<label class="pka-label" for="email">Email</label>' +
        '<input id="email" class="pka-input" type="text" placeholder="you@company.com" ' +
          'autocomplete="username webauthn" spellcheck="false" autocapitalize="off" autofocus>' +
      '</div>' +
      '<div class="pka-pin" id="pinwrap"><div><div class="pka-field">' +
        '<label class="pka-label" for="pin">PIN</label>' +
        '<input id="pin" class="pka-input" type="password" inputmode="numeric" ' +
          'placeholder="Your PIN" autocomplete="current-password">' +
      '</div></div></div>' +
      '<button type="button" class="pka-btn" id="go">Continue</button>' +
      '<button type="button" class="pka-alt" id="alt" hidden></button>' +
      '<div class="pka-err" id="err" hidden></div>' +
    '</div>' +
    '<p class="pka-note" id="note"></p>' +
  '</main>';

const email = $('#email'), pin = $('#pin'), pinwrap = $('#pinwrap');
const go = $('#go'), alt = $('#alt'), err = $('#err'), sub = $('#sub'), note = $('#note');
const form = $('#form');

let hasBiometric = false;
let pinShown = false;
let busy = false;
let tried = new Set();          // identities we have already offered a biometric for, this visit

const setErr = (m) => { err.textContent = m || ''; err.hidden = !m; };

function showPin(why) {
  if (!pinShown) { pinShown = true; pinwrap.classList.add('is-open'); }
  if (why) sub.textContent = why;
  setTimeout(() => pin.focus(), 180);   // after the row has finished opening
}

/** The biometric moment: replace the form with a single pulsing mark, so the system sheet owns
 *  the screen. Returns a function that puts the form back. */
function scanning() {
  form.hidden = true;
  const s = document.createElement('div');
  s.className = 'pka-scan';
  // An escape hatch is mandatory here, not a nicety: this state hides the whole form, so without
  // it a biometric that never resolves leaves the user with no way back to the PIN at all.
  s.innerHTML = ICON_TOUCH + '<p>Waiting for Touch ID…</p>'
    + '<button type="button" class="pka-alt" id="scan-esc">Use my PIN instead</button>';
  form.parentNode.insertBefore(s, form);
  const restore = () => { s.remove(); form.hidden = false; };
  s.querySelector('#scan-esc').addEventListener('click', () => { restore(); showPin('Enter your PIN to continue.'); });
  return restore;
}

/** Hand the session to the extension, if we were opened by one. Best-effort by design: a failure
 *  here means the tab is not auto-armed, not that the sign-in did not happen. */
async function handOff(body) {
  if (!extId || !chrome?.runtime?.sendMessage) return;
  await new Promise((res) => {
    try {
      chrome.runtime.sendMessage(extId,
        { type: 'proofkit-session', user: body.user, token: body.token, arm: returnTo },
        () => res());
      setTimeout(res, 1500);          // no reply from a missing/updated extension: do not hang
    } catch (e) { res(); }
  });
}

async function finish(body) {
  await handOff(body);
  sub.textContent = 'Signed in as ' + (body.user.name || body.user.email) + '.';
  if (returnTo) location.replace(returnTo);
  else { form.hidden = true; note.textContent = 'You can close this tab and go back to your page.'; }
}

/** Try the passkey for `id`. Returns true when it signed us in. */
async function tryPasskey(id, manual) {
  if (busy || !id) return false;
  if (!manual && tried.has(id)) return false;   // never re-prompt for the same identity unasked
  tried.add(id);
  busy = true; setErr('');
  const restore = scanning();
  try {
    const body = await passkeyLogin(workerUrl, id);
    if (body) { await finish(body); return true; }
    restore();
    // `null` is the ordinary outcome, not a fault: no passkey on this account, no reader on this
    // machine, or the sheet was dismissed. All three mean the same thing to the user — use the PIN.
    showPin(hasBiometric ? 'Enter your PIN to continue.' : 'Enter your PIN to continue.');
    if (hasBiometric) { alt.hidden = false; alt.innerHTML = 'Try Touch ID again'; }
    return false;
  } catch (e) {
    restore();
    setErr(e.message || 'Could not sign in.');
    showPin('');
    return false;
  } finally { busy = false; }
}

async function submit() {
  const id = email.value.trim();
  if (!id) { email.focus(); setErr('Enter your email.'); return; }
  if (!pinShown) { if (await tryPasskey(id, true)) return; return; }
  const p = pin.value.trim();
  if (!p) { pin.focus(); return; }
  busy = true; setErr(''); go.disabled = true; go.textContent = 'Signing in…';
  try {
    const body = await accountLogin(workerUrl, id, p);
    await finish(body);
  } catch (e) {
    setErr(e.locked
      ? 'Too many attempts. Try again in ' + Math.ceil((e.retryAfter || 60) / 1000) + 's.'
      : (e.message || 'Could not sign in.'));
    pin.value = ''; pin.focus();
  } finally { busy = false; go.disabled = false; go.textContent = 'Continue'; }
}

/* The core of what was asked for: finishing the identity IS the request to authenticate. We fire
 * on a settled pause rather than on every keystroke, so `builder` raises exactly one prompt
 * instead of six as the word is typed. */
let idle;
email.addEventListener('input', () => {
  clearTimeout(idle);
  setErr('');
  const id = email.value.trim();
  if (!hasBiometric || pinShown || busy || id.length < 3) return;
  idle = setTimeout(() => tryPasskey(id, false), 420);
});
email.addEventListener('blur', () => {
  clearTimeout(idle);
  if (hasBiometric && !pinShown && !busy && email.value.trim().length >= 3) tryPasskey(email.value.trim(), false);
});
email.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(idle); submit(); } });
pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
go.addEventListener('click', submit);
alt.addEventListener('click', () => tryPasskey(email.value.trim(), true));

(async function init() {
  /* ALREADY SIGNED IN? Then this page has nothing to ask. Without this check the page prompts on
   * every load whenever an email is remembered, so anything that lands back here after a
   * successful sign-in prompts again — and again. That is the loop: authenticate, return, get
   * asked to authenticate. A door you have already walked through should just be open.
   *
   * The token is verified against the Worker rather than trusted, so an expired or revoked one
   * falls through to a normal sign-in instead of bouncing the user somewhere they cannot load. */
  const existing = getAuthToken();
  if (existing) {
    try {
      const r = await fetch(workerUrl.replace(/\/$/, '') + '/auth/me', { headers: { Authorization: 'Bearer ' + existing } });
      if (r.ok) {
        const me = await r.json();
        sub.textContent = 'Already signed in as ' + (me.user.name || me.user.email) + '.';
        form.hidden = true;
        if (returnTo) { location.replace(returnTo); return; }
        note.textContent = 'You can close this tab and go back to your page.';
        return;
      }
    } catch (e) { /* unreachable Worker — fall through and let them sign in normally */ }
  }

  hasBiometric = await hasPlatformAuthenticator();
  if (hasBiometric) {
    sub.textContent = 'Enter your email — Touch ID will do the rest.';
    go.innerHTML = ICON_TOUCH_SM + '<span>Continue</span>';
  } else {
    // No reader here, so there is nothing to wait for: show the PIN straight away rather than
    // making the user discover that the promised biometric is not coming.
    showPin('Enter your email and PIN to continue.');
  }
  const pre = params.get('email') || (getAccount() || {}).email || '';
  if (pre) {
    email.value = pre;
    if (hasBiometric) tryPasskey(pre, false); else pin.focus();
  } else email.focus();
  note.textContent = returnTo
    ? 'You’ll be returned to ' + new URL(returnTo).host + ' once you’re in.'
    : '';
})();
