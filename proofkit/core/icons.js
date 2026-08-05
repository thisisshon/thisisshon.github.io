/* --------------------------------------------------------------------------
 * MENU ICONS — one small SVG per menu action, shared by both dashboards so the
 * ⋮ row menus, the status-tag dropdown, and the Start split menu all read the
 * same visual vocabulary. Feather-style: 15px, stroke=currentColor (inherits the
 * item's colour, incl. the red danger items). Pure strings — no DOM.
 * ------------------------------------------------------------------------ */
const wrap = (paths) =>
  '<svg class="pk-mi" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

export const ICON = {
  view: wrap('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>'),
  pin: wrap('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>'),
  teams: wrap('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  edit: wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  start: wrap('<polygon points="5 3 19 12 5 21 5 3"/>'),
  complete: wrap('<path d="M20 6 9 17l-5-5"/>'),
  completeDirect: wrap('<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>'),
  reopen: wrap('<path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>'),
  clarify: wrap('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  reset: wrap('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  disregard: wrap('<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>'),
  copy: wrap('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  revoke: wrap('<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>'),
  delete: wrap('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
};
