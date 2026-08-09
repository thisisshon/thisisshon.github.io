/* --------------------------------------------------------------------------
 * PROOFKIT MODALS — styled replacements for the native window.confirm / alert /
 * prompt, so every dialog reads in the tool's own style instead of the browser's.
 *
 * Promise-based:  await pkConfirm('Delete?')  ·  pkAlert('Saved')  ·  await pkPrompt('Name?')
 * Each accepts a plain string (the message) OR an options object.
 *
 * Self-contained: injects its own CSS ONCE (so it works on BOTH dashboards AND the
 * on-page overlay, which don't share a stylesheet). Colours bind to the --pk-* theme
 * tokens with literal fallbacks, so it renders even before a skin is applied.
 * ------------------------------------------------------------------------ */
import { injectCss } from './inject-css.js?v=affd2ffcbc';

let injected = false;
function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  injectCss(`
  .pk-modal{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;
    background:var(--pk-scrim,rgba(6,6,6,.8));-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    font-family:var(--pk-font,Outfit,system-ui,-apple-system,sans-serif)}
  .pk-modal-card{width:400px;max-width:100%;background:var(--pk-card,#1e1e1e);color:var(--pk-ink,#fff);
    border:1px solid var(--pk-hair,#333);border-top:2px solid var(--pk-red,#da291c);box-shadow:var(--pk-shadow-lg,0 24px 64px rgba(0,0,0,.5));
    padding:24px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;animation:pk-modal-pop .18s ease both}
  @keyframes pk-modal-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
  .pk-modal-title{margin:0;font:600 18px/1.25 var(--pk-font,Outfit);color:var(--pk-ink,#fff);letter-spacing:-.01em}
  .pk-modal-msg{margin:0;font:400 14px/1.55 var(--pk-font,Outfit);color:var(--pk-body,#a7a7a7);white-space:pre-wrap}
  .pk-modal-input{width:100%;padding:11px 13px;border:1px solid var(--pk-hair,#333);border-radius:0;box-sizing:border-box;
    background:var(--pk-input,#141414);color:var(--pk-ink,#fff);font:500 14px/1.4 var(--pk-font,Outfit)}
  .pk-modal-input:focus{outline:none;border-color:var(--pk-red,#da291c)}
  .pk-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px;flex-wrap:wrap}
  .pk-modal-btn{height:38px;padding:0 18px;border:1px solid var(--pk-hair,#333);background:transparent;color:var(--pk-body,#a7a7a7);
    cursor:pointer;font:700 11px/1 var(--pk-font,Outfit);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;
    transition:border-color .15s,color .15s,background .15s}
  .pk-modal-btn:hover{border-color:var(--pk-body,#a7a7a7);color:var(--pk-ink,#fff)}
  .pk-modal-btn--primary{border-color:var(--pk-red,#da291c);background:var(--pk-red,#da291c);color:var(--pk-on-accent,#fff)}
  .pk-modal-btn--primary:hover{background:var(--pk-red-2,#b01e0a);border-color:var(--pk-red-2,#b01e0a);color:var(--pk-on-accent,#fff)}
  .pk-modal-btn--danger{border-color:var(--pk-softred,#ef5b50);color:var(--pk-softred,#ef5b50)}
  .pk-modal-btn--danger:hover{background:var(--pk-softred,#ef5b50);border-color:var(--pk-softred,#ef5b50);color:var(--pk-on-accent,#fff)}
  `);
}

// The one builder. `buttons` = [{ label, value, kind?, useInput? }]. Resolves with the
// clicked button's `value`, or the input's text when `useInput` is set. Esc / backdrop
// resolve with `cancelValue`.
function openModal({ title, message, buttons, input, cancelValue }) {
  ensureStyles();
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'pk-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    const card = document.createElement('div');
    card.className = 'pk-modal-card';
    if (title) { const h = document.createElement('h2'); h.className = 'pk-modal-title'; h.textContent = title; card.appendChild(h); }
    if (message) { const p = document.createElement('p'); p.className = 'pk-modal-msg'; p.textContent = message; card.appendChild(p); }
    let inputEl = null;
    if (input) {
      inputEl = document.createElement('input');
      inputEl.className = 'pk-modal-input';
      inputEl.type = 'text';
      inputEl.placeholder = input.placeholder || '';
      inputEl.value = input.value || '';
      card.appendChild(inputEl);
    }
    const acts = document.createElement('div');
    acts.className = 'pk-modal-actions';
    let done = false;
    const finish = (val) => {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(cancelValue); }
      else if (e.key === 'Enter' && inputEl) { const b = buttons.find((x) => x.useInput); if (b) { e.preventDefault(); finish(inputEl.value); } }
    };
    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pk-modal-btn' + (b.kind ? ' pk-modal-btn--' + b.kind : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.useInput ? (inputEl ? inputEl.value : '') : b.value));
      acts.appendChild(btn);
    });
    card.appendChild(acts);
    wrap.appendChild(card);
    // Backdrop click (outside the card) cancels.
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) finish(cancelValue); });
    document.addEventListener('keydown', onKey, true);
    (document.body || document.documentElement).appendChild(wrap);
    // Focus the input, else the last (primary/affirmative) button.
    setTimeout(() => { if (inputEl) { inputEl.focus(); inputEl.select(); } else { const bs = acts.querySelectorAll('.pk-modal-btn'); if (bs.length) bs[bs.length - 1].focus(); } }, 0);
  });
}

/** Styled confirm → Promise<boolean>. `opts` may be a string or { title, message, confirmLabel, cancelLabel, danger }. */
export function pkConfirm(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return openModal({
    title: o.title || 'Please confirm',
    message: o.message || '',
    cancelValue: false,
    buttons: [
      { label: o.cancelLabel || 'Cancel', value: false },
      { label: o.confirmLabel || 'Confirm', value: true, kind: o.danger ? 'danger' : 'primary' },
    ],
  });
}

/** Styled alert → Promise<void>. `opts` may be a string or { title, message, okLabel }. */
export function pkAlert(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return openModal({
    title: o.title || 'Notice',
    message: o.message || '',
    cancelValue: undefined,
    buttons: [{ label: o.okLabel || 'OK', value: undefined, kind: 'primary' }],
  });
}

/** Styled prompt → Promise<string|null> (null on cancel). `opts` may be a string or { title, message, placeholder, value, confirmLabel }. */
export function pkPrompt(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return openModal({
    title: o.title || '',
    message: o.message || '',
    input: { placeholder: o.placeholder || '', value: o.value || '' },
    cancelValue: null,
    buttons: [
      { label: 'Cancel', value: null },
      { label: o.confirmLabel || 'Save', useInput: true, kind: 'primary' },
    ],
  });
}
