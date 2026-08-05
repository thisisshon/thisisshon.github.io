/* ===========================================================================
   PROOFKIT SHARED CARD RENDERER — one queue-card, used by BOTH dashboards.

   createCardRenderer(deps) returns renderCard(root) that produces the Figma
   card markup (styled by ./card.css, neutral `.pkc-*`). The shared skeleton is
   identical across dashboards; the role-specific pieces are passed as slots:

     deps.esc/fmt/teamStyle/thumbTile/pageName/repliesOf/typeLabel  — host helpers
     deps.displayState(root)   -> state key ('tbi'|'inprog'|'deployed'|'reopened')
     deps.statusText(root)     -> the status label ("To Be Initiated", …)
     deps.selectSlot(root)     -> leading checkbox html (admin bulk-select) | ''
     deps.actionsSlot(root)    -> header-right buttons (Open Pin · lifecycle · ⋮  /  Open Pin · View details)
     deps.extraSlot(root)      -> block after change-to (team reopen band) | ''
     deps.extraClass(root)     -> extra <article> class suffix (e.g. ' is-selected') | ''

   No behaviour lives here — the host wires its own click/lifecycle/menu bindings
   to the `.pkc-*` hooks (data-action / .pkc-more / .pkc-commentstoggle / …).
   =========================================================================== */

export function createCardRenderer(deps) {
  const { esc, fmt, teamStyle, thumbTile, pageName, repliesOf, typeLabel, displayState, statusText } = deps;
  const selectSlot = deps.selectSlot || (() => '');
  const actionsSlot = deps.actionsSlot || (() => '');
  const extraSlot = deps.extraSlot || (() => '');
  const extraClass = deps.extraClass || (() => '');

  const routeTeam = (t) => {
    if (!t) return `<span class="pkc-route-team" style="color:var(--pk-muted)">—</span>`;
    const s = teamStyle(t);
    return `<span class="pkc-route-team" style="color:${s.fg}">${esc(t)}</span>`;
  };

  return function renderCard(root) {
    const a = root.anchor || {};
    const id = esc(root.id);
    const tl = typeLabel(root);
    const state = displayState(root);
    const replies = repliesOf(root);
    const commentsToggle = replies.length
      ? `<button class="pkc-commentstoggle" type="button" data-replies="${id}"><span class="pkc-caret">▸</span>${replies.length} comment${replies.length === 1 ? '' : 's'}</button>`
      : '';
    const commentsBlock = replies.length
      ? `<div class="pkc-comments" data-replies-for="${id}"><div class="pkc-comments-inner">` + replies.map((r) => {
          const cs = teamStyle(r.team);
          return `<div class="pkc-comment">` +
            `<div class="pkc-comment-meta">` +
              `<span class="pkc-comment-team" style="color:${cs.fg}">${esc(r.team || '—')}</span>` +
              `<span class="pkc-comment-time">${esc(fmt(r.createdAt))}</span>` +
            `</div>` +
            `<div class="pkc-comment-body">${esc(r.comment)}` +
              (r.changeTo ? `<span class="pkc-comment-change"><span>Change to</span> ${esc(r.changeTo)}</span>` : '') +
            `</div>` +
          `</div>`;
        }).join('') + `</div></div>`
      : '';
    const thumb = root.imageId ? thumbTile(root.imageId, false)
      : `<span class="pkc-thumb-empty"><span class="pkc-thumb-ph">preview…</span></span>`;
    const snip = a.snippet ? `<div class="pkc-snip">on “${esc(a.snippet)}”</div>` : '';
    const paramBits = [];
    if (root.ticket) paramBits.push(`<span class="pkc-meta-tk">#${esc(root.ticket)}</span>`);
    // The on-page pin sequence (what the detail view shows as "Comment N") — sits next to the ticket.
    if (root.pageSeq) paramBits.push(`<span class="pkc-meta-pin">Comment ${esc(root.pageSeq)}</span>`);
    // The raw element tag (<strong>, <section>, …) is deliberately NOT shown here — the snippet
    // above already says what was pinned, and the tag is developer noise on a review card.
    paramBits.push(`<span class="pkc-meta-time">${esc(fmt(root.createdAt))}</span>`);
    if ((root.iteration || 1) > 1) paramBits.push(`<span class="pkc-meta-iter">Iteration ${root.iteration}</span>`);
    const meta = paramBits.join(`<span class="pkc-meta-sep" aria-hidden="true">·</span>`);
    const extra = extraSlot(root);
    return (
      `<article class="pkc-card${extraClass(root)}" data-id="${id}" data-state="${state}" tabindex="0" role="button" aria-label="View ticket details">` +
        selectSlot(root) +
        `<div class="pkc-head">` +
          `<div class="pkc-head-l">` +
            (tl ? `<span class="pkc-type">${esc(tl)}</span>` : '') +
            `<div class="pkc-route">${routeTeam(root.team)}<span class="pkc-route-arrow" aria-hidden="true">→</span>${routeTeam(root.toTeam)}</div>` +
          `</div>` +
          `<div class="pkc-head-r">` +
            `<span class="pkc-status is-${state}">${esc(statusText(root))}</span>` +
            `<div class="pkc-acts">${actionsSlot(root)}</div>` +
          `</div>` +
        `</div>` +
        `<div class="pkc-body">` +
          `<div class="pkc-body-main">` +
            `<a class="pkc-slug" href="${esc(root.page.path)}" target="_blank" rel="noopener">Page : ${esc(pageName(root.page.path))}</a>` +
            `<div class="pkc-title">${esc(root.comment)}</div>` +
            snip +
            `<div class="pkc-meta">${meta}</div>` +
          `</div>` +
          `<div class="pkc-thumb-box">${thumb}</div>` +
        `</div>` +
        (root.changeTo ? `<div class="pkc-change"><span class="pkc-change-k">Change to</span><div class="pkc-change-v">${esc(root.changeTo)}</div></div>` : '') +
        (extra ? `<div class="pkc-extra">${extra}</div>` : '') +
        (commentsToggle ? `<div class="pkc-foot"><span class="pkc-foot-rule" aria-hidden="true"></span>${commentsToggle}</div>` : '') +
        commentsBlock +
      `</article>`
    );
  };
}
