/* --------------------------------------------------------------------------
 * COMMENT VOCABULARY (v3 features 1/3/8) — the ONE framework-neutral source of
 * truth for comment types, their per-type template fields, reopen reasons, and
 * the one-line summary renderer.
 *
 * This module is imported by BOTH sides of Proofkit:
 *   • the frontend — via core/config.js, which re-exports every name here so the
 *     overlay composer, both dashboards, and the demo store keep their imports.
 *   • the Cloudflare Worker — worker/worker.js imports the same constants +
 *     helpers directly (wrangler/esbuild bundles this file in).
 * Because there is now a SINGLE definition, a type/field/reason/summary change is
 * one edit that CANNOT drift across the client↔server boundary (which it silently
 * did while the Worker kept its own hardcoded copy).
 *
 * Keep this file PURE: plain data + string helpers only, NO DOM / browser or
 * Worker globals, so both bundlers can include it unchanged.
 * ------------------------------------------------------------------------ */

/** The comment types (Feature 1) as `{ value, label }` — the set the composer
 *  OFFERS as chips. `general` = the original freeform behaviour (zero regression).
 *  Order = the order the composer chips render in. */
// NOTE: 'image-swap' is intentionally NOT offered for now — it is parked until the image
// pipeline is integrated. Its field defs (TYPE_FIELDS below), summary rendering and Worker
// acceptance are left in place (dormant) — see KNOWN_COMMENT_TYPES — so re-adding the line
// here restores the chip everywhere at once.
export const COMMENT_TYPES = [
  { value: 'copy-fix', label: 'Copy fix' },
  { value: 'link-fix', label: 'Link fix' },
  { value: 'layout-tweak', label: 'Layout tweak' },
  { value: 'general', label: 'General' },
];

/**
 * Per-type template-field meta (Feature 1, §3). Keyed by commentType; each entry
 * is an ordered array of field descriptors the composer renders into
 * `record.templateFields`:
 *   { key, label, placeholder, autoFill, required, readOnly? }
 * - `autoFill` true ⇒ the overlay pre-fills it from the clicked element
 *   (`currentImage` from src/alt/selector, `currentUrl` from the <a> href) and
 *   shows it read-only. `general` carries no template fields (freeform textarea).
 * This object also defines the FULL set of types the server accepts (its keys) —
 * including the parked `image-swap` — even when a type is not offered as a chip.
 * NOTE: `layout-tweak` + `image-swap` ALSO require the separate `expectedOutcome`
 * record field (Feature 8) — that lives on the record, not in templateFields, so
 * it is not listed here; see EXPECTED_OUTCOME_TYPES.
 */
export const TYPE_FIELDS = {
  'copy-fix': [
    { key: 'currentText', label: 'Selected Element', placeholder: 'The text as it reads now', autoFill: false, required: false },
    { key: 'newText', label: 'Change To', placeholder: 'The corrected text', autoFill: false, required: true },
  ],
  'image-swap': [
    { key: 'currentImage', label: 'Current Image', placeholder: 'Auto-filled from the clicked image', autoFill: true, required: false, readOnly: true },
    { key: 'replacementDesc', label: 'Replacement', placeholder: 'Describe the image that should replace it', autoFill: false, required: true },
  ],
  'link-fix': [
    { key: 'currentUrl', label: 'Active URL', placeholder: 'Auto-filled from the clicked link', autoFill: true, required: false },
    { key: 'newUrl', label: 'Corrected URL', placeholder: 'Where it should point', autoFill: false, required: true },
  ],
  'layout-tweak': [
    { key: 'currentLayout', label: 'How Is It Now?', placeholder: 'Describe the current layout / spacing', autoFill: false, required: false },
    { key: 'whatToChange', label: 'How Do You Think It Should Be?', placeholder: 'Describe how it should look instead', autoFill: false, required: true },
  ],
  'general': [],
};

/** Every comment type the SERVER accepts (the keys of TYPE_FIELDS) — a superset of
 *  the offered COMMENT_TYPES, so the parked `image-swap` still validates. */
export const KNOWN_COMMENT_TYPES = Object.keys(TYPE_FIELDS);

/** True when `t` is a comment type the server will accept (Feature 1). */
export function isValidCommentType(t) {
  return Object.prototype.hasOwnProperty.call(TYPE_FIELDS, t);
}

/** Whitelisted template-field KEYS per type (§3), derived from TYPE_FIELDS. The
 *  Worker uses this to drop unknown keys / cap values on save. */
export const TYPE_FIELD_KEYS = Object.fromEntries(
  Object.entries(TYPE_FIELDS).map(([type, fields]) => [type, fields.map((f) => f.key)]),
);

/** Comment types that additionally require the `expectedOutcome` field (Feature 8).
 *  RETIRED: the composer no longer collects `expectedOutcome` (it always sends ''), so
 *  requiring it here made the Worker reject every create/edit of these types with a 400.
 *  Kept as an empty set so the plumbing (needsExpectedOutcome, dashboards) stays intact. */
export const EXPECTED_OUTCOME_TYPES = [];

/** True when `commentType` needs an `expectedOutcome` (Feature 8). */
export function needsExpectedOutcome(commentType) {
  return EXPECTED_OUTCOME_TYPES.indexOf(commentType) !== -1;
}

/**
 * Comment types that REQUIRE a screenshot before the comment can be raised.
 *
 * The split is content swap vs everything else. A swap type carries its own
 * before → after evidence in its template fields — `copy-fix` says exactly which
 * text becomes which, `link-fix` which URL, `image-swap` which asset — so the
 * record is unambiguous without a picture. A layout tweak or a general note is a
 * description of something VISUAL, and prose alone ("the spacing is off", "this
 * looks wrong on my screen") routinely fails to identify what the reviewer was
 * looking at. For those the screenshot is the record.
 *
 * Add a type here and both the composer (blocks the raise) and the dashboards
 * pick it up from this one list.
 */
export const SCREENSHOT_TYPES = ['layout-tweak', 'general'];

/** True when `commentType` cannot be raised without a screenshot attached. */
export function needsScreenshot(commentType) {
  return SCREENSHOT_TYPES.indexOf(commentType) !== -1;
}

/** Reopen reasons (Feature 3) as `{ value, label }` ×4 — the enum the reopen
 *  modal offers and the Worker validates. `other` additionally requires a note. */
export const REOPEN_REASONS = [
  { value: 'needs-clarification', label: 'Need Clarity' },
  { value: 'wrong-element', label: 'Wrong element' },
  { value: 'design-mismatch', label: 'Design mismatch' },
  { value: 'other', label: 'Other' },
];

/** value → label map for reopen reasons, derived from REOPEN_REASONS. The Worker
 *  validates an incoming reason against this and reads the human label off it. */
export const REOPEN_REASON_MAP = Object.fromEntries(REOPEN_REASONS.map((r) => [r.value, r.label]));

/** Human label for a reopen-reason value ('' when unknown/blank). */
export function reopenReasonLabel(v) {
  return REOPEN_REASON_MAP[v] || v || '';
}

/**
 * Render the one-line plain-text `summary` for a comment (Feature 1, §3). Shared by
 * the client (optimistic list line), the demo store, AND the Worker (server-side
 * render when the client omits it) so all three produce identical text. Every field
 * defaults when missing; an empty typed summary falls back to the first 80 chars of
 * the freeform comment so a card is never blank.
 *   copy-fix:     "current → new"
 *   link-fix:     "old → new"
 *   image-swap:   "swap <currentImage>: <replacementDesc>"
 *   layout-tweak: "currentLayout → whatToChange" (falls back to whatToChange alone)
 *   general:      first 80 chars of the comment
 */
export function renderSummary(commentType, templateFields, comment) {
  const f = templateFields || {};
  const s = (v) => String(v == null ? '' : v).trim();
  const arrow = (a, b) => { a = s(a); b = s(b); return a && b ? a + ' → ' + b : (a || b); };
  const fallback = () => s(comment).slice(0, 80);
  switch (commentType) {
    case 'copy-fix': return arrow(f.currentText, f.newText) || fallback();
    case 'link-fix': return arrow(f.currentUrl, f.newUrl) || fallback();
    case 'image-swap': {
      const img = s(f.currentImage) || 'image';
      const desc = s(f.replacementDesc);
      return (desc ? 'swap ' + img + ': ' + desc : 'swap ' + img) || fallback();
    }
    // "now → should be" when both are given (matches copy-fix/link-fix); older records that only
    // carry whatToChange still render exactly as before.
    case 'layout-tweak': return arrow(f.currentLayout, f.whatToChange) || fallback();
    case 'general':
    default: return fallback();
  }
}
