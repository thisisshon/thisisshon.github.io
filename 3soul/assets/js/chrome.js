/* ============================================================
   Site chrome: header, navigation drawer, breadcrumbs.
   Shared by every page of the rebuild. A page mounts it with:

     <script>window.PAGE = { crumbs: [['Price It','index.html'],['Upload']] };</script>
     <script src="assets/js/menu-data.js"></script>
     <script src="assets/js/chrome.js"></script>

   The menu mirrors 3soul.in (see menu-data.js). Catalogue links open
   the live site in a new tab; our own pages stay in this tab.

   Motion: 240ms scrim, 420ms panel (ease-out-quint), 30ms item
   stagger, 300ms burger morph. All of it off under reduced motion.
   ============================================================ */
(function () {
  'use strict';

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(.22,1,.36,1)';
  var PAGE = window.PAGE || {};
  var MENU = window.SOUL_MENU || [];
  var SITE = 'https://3soul.in';
  var WA = 'https://wa.me/919819033336';
  var doc = document;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* CoreUI Icons Free (CC BY 4.0), served from one sprite. */
  var SPRITE = (PAGE.base || '') + 'assets/img/icons.svg';
  function ic(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="' + SPRITE + '#' + name + '"/></svg>';
  }

  var SOCIAL = [
    ['Instagram', 'https://instagram.com/3soul.in', 'cib-instagram'],
    ['Facebook', 'https://www.facebook.com/3soul.in', 'cib-facebook'],
    ['YouTube', 'https://www.youtube.com/@3souljewellery', 'cib-youtube'],
    ['Pinterest', 'https://in.pinterest.com/3SoulJewellery/', 'cib-pinterest']
  ];

  /* ---------- markup ---------- */
  function crumbs() {
    var items = [['Home', SITE]].concat(PAGE.crumbs || []);
    return '<nav class="crumbs" aria-label="Breadcrumb"><ol>' + items.map(function (c, i) {
      var last = i === items.length - 1;
      var href = c[1], out = /^https?:/.test(href || '');
      return '<li>' + (last || !href
        ? '<span aria-current="page">' + esc(c[0]) + '</span>'
        : '<a href="' + esc(href) + '"' + (out ? ' target="_blank" rel="noopener"' : '') + '>' + esc(c[0]) + '</a>') + '</li>';
    }).join('') + '</ol></nav>';
  }

  function branch(node, depth) {
    if (!node.c) {
      return '<li><a class="nav-l" href="' + esc(node.h) + '" target="_blank" rel="noopener">' + esc(node.t) + '</a></li>';
    }
    return '<li><div class="nav-g" data-depth="' + depth + '">' +
      '<button class="nav-t" type="button" aria-expanded="false">' + esc(node.t) +
      ic('cil-chevron-bottom', 'nav-car') +
      '</button><div class="nav-p"><ul>' + node.c.map(function (k) { return branch(k, depth + 1); }).join('') + '</ul></div>' +
      '</div></li>';
  }

  function build() {
    var logo = '<img src="' + (PAGE.base || '') + 'assets/img/3soul-logo.svg" alt="3Soul" width="96" height="21">';
    var header =
      '<header class="hdr" id="hdr">' +
        '<div class="hdr-in">' +
          '<button class="burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav">' +
            ic('cil-hamburger-menu', 'burger-o') + ic('cil-x', 'burger-c') + '</button>' +
          '<a class="hdr-logo" href="' + SITE + '" target="_blank" rel="noopener" aria-label="3Soul home">' + logo + '</a>' +
          '<div class="hdr-act">' +
            '<a class="hdr-ic sm-hide" href="' + SITE + '/search" target="_blank" rel="noopener" aria-label="Search 3Soul">' + ic('cil-search') + '</a>' +
            '<a class="hdr-ic" href="' + WA + '" target="_blank" rel="noopener" aria-label="WhatsApp 3Soul">' + ic('cib-whatsapp') + '</a>' +
            '<a class="hdr-ic" href="' + SITE + '/cart" target="_blank" rel="noopener" aria-label="Cart">' + ic('cil-cart') + '</a>' +
          '</div>' +
        '</div>' + crumbs() +
      '</header>';

    var ours = (PAGE.ours || []).map(function (o) {
      return '<a class="nav-own' + (o[2] ? ' is-here' : '') + '" href="' + esc(o[1]) + '">' +
        '<b>' + esc(o[0]) + '</b><small>' + esc(o[3] || '') + '</small></a>';
    }).join('');

    var drawer =
      '<div class="nav" id="nav" hidden>' +
        '<div class="nav-scrim" data-close></div>' +
        '<aside class="nav-panel" role="dialog" aria-modal="true" aria-label="Menu">' +
          '<div class="nav-top">' + logo +
            '<button class="nav-x" type="button" data-close aria-label="Close menu">' +
              ic('cil-x') +
            '</button></div>' +
          '<div class="nav-scroll">' +
            (ours ? '<div class="nav-own-wrap">' + ours + '</div>' : '') +
            '<nav class="nav-main" aria-label="Shop"><ul>' + MENU.map(function (g) { return branch(g, 0); }).join('') + '</ul></nav>' +
            '<div class="nav-foot">' +
              '<div class="nav-soc">' + SOCIAL.map(function (s) {
                return '<a href="' + s[1] + '" target="_blank" rel="noopener" aria-label="' + s[0] + '">' + ic(s[2]) + '</a>';
              }).join('') + '</div>' +
              '<a class="nav-row" href="' + SITE + '/account" target="_blank" rel="noopener">' + ic('cil-user') + 'Log In</a>' +
              '<a class="nav-row" href="' + WA + '" target="_blank" rel="noopener">' + ic('cib-whatsapp') + '+91 98190 33336</a>' +
            '</div>' +
          '</div>' +
        '</aside>' +
      '</div>';

    doc.body.insertAdjacentHTML('afterbegin', header + drawer);
  }

  /* ---------- the drawer ---------- */
  var nav, panel, scrim, burger, open = false, lastFocus = null;

  function items() { return $$('.nav-own, .nav-t, .nav-main > ul > li > .nav-g, .nav-foot', panel); }

  function show() {
    if (open) return;
    open = true;
    lastFocus = doc.activeElement;
    nav.hidden = false;
    doc.documentElement.classList.add('nav-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    if (!RM) {
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'both' });
      panel.animate([{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: 420, easing: EASE, fill: 'both' });
      $$('.nav-own-wrap > *, .nav-main > ul > li, .nav-foot', panel).slice(0, 16).forEach(function (el, i) {
        el.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }],
          { duration: 320, delay: 90 + i * 30, easing: EASE, fill: 'backwards' });
      });
    }
    setTimeout(function () { $('.nav-x', panel).focus(); }, RM ? 0 : 200);
  }

  function hide() {
    if (!open) return;
    open = false;
    doc.documentElement.classList.remove('nav-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    function done() { nav.hidden = true; }
    if (RM) return done();
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'both' });
    panel.animate([{ transform: 'none' }, { transform: 'translateX(-100%)' }],
      { duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'both' }).onfinish = done;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // accordions: height is animated, so it works the same in every engine
  function toggle(btn) {
    var group = btn.parentNode, pane = $('.nav-p', group), on = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', on ? 'false' : 'true');
    group.classList.toggle('is-open', !on);
    if (RM) { pane.style.height = on ? '0px' : 'auto'; return; }
    var from = pane.getBoundingClientRect().height;
    pane.style.height = 'auto';
    var to = on ? 0 : pane.getBoundingClientRect().height;
    pane.style.height = from + 'px';
    pane.getAnimations().forEach(function (a) { a.cancel(); });
    pane.animate([{ height: from + 'px' }, { height: to + 'px' }],
      { duration: Math.min(460, 220 + to * 0.35), easing: EASE }).onfinish = function () {
      pane.style.height = on ? '0px' : 'auto';
    };
    if (!on) {
      $$(':scope > ul > li', pane).slice(0, 10).forEach(function (li, i) {
        li.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, delay: 60 + i * 22, easing: EASE, fill: 'backwards' });
      });
    }
  }

  function wire() {
    nav = $('#nav'); panel = $('.nav-panel'); scrim = $('.nav-scrim'); burger = $('#burger');
    burger.addEventListener('click', function () { open ? hide() : show(); });
    nav.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) hide(); });
    doc.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button:not([disabled])', panel).filter(function (el) { return el.offsetParent; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    panel.addEventListener('click', function (e) {
      var t = e.target.closest('.nav-t');
      if (t) { e.preventDefault(); toggle(t); return; }
      if (e.target.closest('a')) hide();
    });
    // swipe the panel away
    var sx = null, sy = null;
    panel.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    panel.addEventListener('pointerup', function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (dx < -56 && Math.abs(dy) < Math.abs(dx)) hide();
    });
  }

  /* ---------- the header follows the app ---------- */
  function sync() {
    var app = $('#app');
    if (app) doc.documentElement.classList.add('app-page');
    var hdr = $('#hdr');
    if (!app) return;
    function apply() {
      var step = +(app.dataset.step || 1);
      hdr.classList.toggle('is-slim', step > 1);
      hdr.classList.toggle('is-gone', app.classList.contains('kb'));
    }
    apply();
    new MutationObserver(apply).observe(app, { attributes: true, attributeFilter: ['data-step', 'class'] });
  }

  function measure() {
    var hdr = $('#hdr');
    var h = hdr.getBoundingClientRect().height;
    doc.documentElement.style.setProperty('--hdr-h', Math.round(h) + 'px');
  }
  // the header shrinks over 420ms: keep --hdr-h in step with it
  ['transitionend', 'transitionrun'].forEach(function (ev) {
    doc.addEventListener(ev, function (e) {
      if (e.target && e.target.closest && e.target.closest('#hdr')) measure();
    }, true);
  });

  build();
  wire();
  sync();
  measure();
  if (window.ResizeObserver) new ResizeObserver(measure).observe($('#hdr'));
  window.addEventListener('resize', measure);
})();
