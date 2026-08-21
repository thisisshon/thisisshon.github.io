/**
 * Proofkit — shared action MODALS (extracted from dashboard.js so both dashboards share them).
 * reopen (reason enum + note, note required for "other"), disregard/close-as-invalid (note
 * required), and clarify/need-clarity (optional note). Each fires `onConfirm(payload)` once valid.
 */
import { buildDropdown, REOPEN_REASONS } from './config.js?v=24f9058039';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Reopen — reason dropdown + note (required only when reason === 'other'). onConfirm({reason,note}).
export function openReopenModal(onConfirm, sub) {
  const el = document.createElement('div'); el.className = 'pk-reopen';
  el.innerHTML =
    `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Reopen ticket">` +
      `<h2 class="pk-reopen-title">Reopen</h2>` +
      `<p class="pk-reopen-sub">${esc(sub || 'Bounce this back to the raising team with a reason.')}</p>` +
      `<div class="pk-reopen-field"><span class="pk-reopen-label">Reason</span><div class="rvd-reopen-reason"></div></div>` +
      `<div class="pk-reopen-field"><span class="pk-reopen-label">Note<span class="rvd-reopen-req" hidden> · required</span></span>` +
        `<textarea class="pk-reopen-note" placeholder="Add context for the raising team (required for “Other”)"></textarea></div>` +
      `<div class="pk-reopen-err" hidden></div>` +
      `<div class="pk-reopen-actions">` +
        `<button type="button" class="rvd-editbtn rvd-reopen-cancel">Cancel</button>` +
        `<button type="button" class="rvd-editbtn rvd-editsave rvd-reopen-go">Reopen</button>` +
      `</div>` +
    `</div>`;
  document.body.appendChild(el);
  let reason = '';
  const req = el.querySelector('.rvd-reopen-req');
  const err = el.querySelector('.pk-reopen-err');
  const note = el.querySelector('.pk-reopen-note');
  const syncReq = () => { req.hidden = reason !== 'other'; };
  const reasonDD = buildDropdown({
    block: true, placeholder: 'Select a reason',
    items: REOPEN_REASONS.map((r) => ({ value: r.value, label: r.label })),
    onSelect: (v) => { reason = v; syncReq(); err.hidden = true; },
  });
  el.querySelector('.rvd-reopen-reason').appendChild(reasonDD.el);
  const close = () => el.remove();
  el.querySelector('.rvd-reopen-cancel').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
  el.querySelector('.rvd-reopen-go').addEventListener('click', () => {
    const n = note.value.trim();
    if (!reason) { err.textContent = 'Please choose a reason.'; err.hidden = false; return; }
    if (reason === 'other' && !n) { err.textContent = 'A note is required when the reason is “Other”.'; err.hidden = false; return; }
    close();
    onConfirm({ reason, note: n });
  });
  reasonDD.focus();
}

// Close-as-invalid (disregard) — required reason note. onConfirm({note}).
export function openDisregardModal(onConfirm) {
  const el = document.createElement('div'); el.className = 'pk-reopen';
  el.innerHTML =
    `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Close as invalid finding">` +
      `<h2 class="pk-reopen-title">Close as invalid finding</h2>` +
      `<p class="pk-reopen-sub">Close this raised bug as an <b>invalid finding</b> — it isn’t a valid issue. This is final; it won’t be actioned or built.</p>` +
      `<div class="pk-reopen-field"><span class="pk-reopen-label">Reason <span style="color:var(--pk-softred);font-weight:700">· required</span></span>` +
        `<textarea class="pk-reopen-note" placeholder="Why is this an invalid finding? (logged + shared with the raising team)"></textarea></div>` +
      `<div class="pk-reopen-err" hidden></div>` +
      `<div class="pk-reopen-actions">` +
        `<button type="button" class="rvd-editbtn rvd-reopen-cancel">Cancel</button>` +
        `<button type="button" class="rvd-editbtn rvd-editsave rvd-reopen-go">Close as invalid</button>` +
      `</div>` +
    `</div>`;
  document.body.appendChild(el);
  const note = el.querySelector('.pk-reopen-note');
  const err = el.querySelector('.pk-reopen-err');
  const close = () => el.remove();
  el.querySelector('.rvd-reopen-cancel').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
  const go = () => {
    const n = note.value.trim();
    if (!n) { err.textContent = 'A reason is required.'; err.hidden = false; return; }
    close();
    onConfirm({ note: n });
  };
  el.querySelector('.rvd-reopen-go').addEventListener('click', go);
  note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
  note.focus();
}

// Need-clarity (clarify) — optional note. onConfirm({note}).
export function openClarifyModal(onConfirm) {
  const el = document.createElement('div'); el.className = 'pk-reopen';
  el.innerHTML =
    `<div class="pk-reopen-card" role="dialog" aria-modal="true" aria-label="Mark as need clarity">` +
      `<h2 class="pk-reopen-title">Need Clarity</h2>` +
      `<p class="pk-reopen-sub">Move this into the <b>Need Clarity</b> bucket and let the raising team know what’s unclear. It leaves the inbound queue until you resume it.</p>` +
      `<div class="pk-reopen-field"><span class="pk-reopen-label">What needs clarifying? <span style="color:var(--pk-muted)">· optional</span></span>` +
        `<textarea class="pk-reopen-note" placeholder="Ask the raising team what you need to proceed (shared with them)"></textarea></div>` +
      `<div class="pk-reopen-actions">` +
        `<button type="button" class="rvd-editbtn rvd-reopen-cancel">Cancel</button>` +
        `<button type="button" class="rvd-editbtn rvd-editsave rvd-reopen-go">Mark for clarity</button>` +
      `</div>` +
    `</div>`;
  document.body.appendChild(el);
  const note = el.querySelector('.pk-reopen-note');
  const close = () => el.remove();
  el.querySelector('.rvd-reopen-cancel').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
  const go = () => { close(); onConfirm({ note: note.value.trim() }); };
  el.querySelector('.rvd-reopen-go').addEventListener('click', go);
  note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
  note.focus();
}
