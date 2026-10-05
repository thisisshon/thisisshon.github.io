/* ============================================================
   Choice groups (see choice.css). Tap an option and its section
   folds to one line showing the choice; tap the header to open it
   again. Shared by index.html and estimate.html.

   Choice.bind(root, onPick, { required })
     onPick(key, value, button) runs on every change.
     required: an answer can't be cleared, only changed.
   ============================================================ */
(function () {
  'use strict';

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function each(sel, root, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); }

  // the option's own words, without its small print
  function label(btn) { return btn ? (btn.dataset.label || btn.firstChild.textContent).trim() : ''; }

  function setOpen(g, open) {
    g.classList.toggle('is-closed', !open);
    g.querySelector('.cg-h').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function select(g, btn) {
    each('.cg-o button', g, function (x) { x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); });
    g.querySelector('.cg-v').textContent = label(btn);
  }

  function value(g) {
    var b = g.querySelector('.cg-o button[aria-pressed="true"]');
    return b ? b.dataset.v : '';
  }

  function bind(root, onPick, opts) {
    opts = opts || {};
    root.addEventListener('click', function (e) {
      var head = e.target.closest('.cg-h');
      if (head && root.contains(head)) { setOpen(head.parentNode, head.getAttribute('aria-expanded') !== 'true'); return; }
      var btn = e.target.closest('.cg-o button');
      if (!btn || !root.contains(btn)) return;
      var g = btn.closest('.cg'), on = btn.getAttribute('aria-pressed') === 'true';
      if (on && opts.required) { setOpen(g, false); return; }
      select(g, on ? null : btn);
      // a choice folds its section away after a beat, so the tap reads first
      if (!on) setTimeout(function () { setOpen(g, false); }, RM ? 0 : 260);
      onPick(g.dataset.k, on ? '' : btn.dataset.v, btn);
    });
  }

  window.Choice = { bind: bind, setOpen: setOpen, select: select, value: value, label: label };
})();
