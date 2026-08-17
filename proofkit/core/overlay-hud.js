/* ==========================================================================
 * PROOFKIT — NEW review overlay ("HUD"). Phases 1–2: the B&W zoom/pan CANVAS
 * (the live page in a same-origin iframe) + the edge-framed HUD CHROME (top
 * strip · resolution/device strip ≤32px · left visibility rail · right
 * inspector/compose rail · bottom action toolbar).
 *
 * Gated by the global `overlayUi` flag; overlay.js calls mountHud() only when
 * the flag is 'new'. The OLD rectangle composer is untouched.
 *
 * Real-data wiring IS DONE (was Phases 4–5; this comment described it as
 * scaffolding long after it stopped being scaffolding). Live now:
 *   - canvas pins render from `ctx.comments` (see `comments` + the pin layer)
 *   - the Pins rail pane lists the same records and is repainted on filter
 *   - the Thread pane shows replies and posts through `ctx.postReply`
 *   - the Compose pane builds from TYPE_FIELDS, keeps a draft batch, and
 *     "Submit all" hands off to `ctx.submitAll` (overlay.js runs the existing
 *     image-upload + batch POST and hands the saved records back)
 *   - `ctx.confirmFix` gives the raiser the deployed_live confirm from the page
 * There are no TODO(phase4)/TODO(phase5) markers left in this file.
 *
 * All CSS is scoped under #pkhud and binds to the --pk-* tokens injected by the
 * overlay at review time (design/tokens.css). Class names live under the host
 * root so nothing leaks onto the marketing page.
 * ======================================================================== */
import { pageName, getSession, ADMIN_TEAM, TEAM_COLORS, STATUS_COLORS, renderSummary, PROJECT_SHORT,
  BASE, TEAM_BASE, boardBase, homeUrl,
  COMMENT_TYPES, TYPE_FIELDS, ENABLED_TEAMS, needsScreenshot,
  // light/dark: the HUD follows the reviewer's setting — see the SKIN block in mountHud
  getTheme, isThemeKey, toggleTheme } from './config.js?v=0ecc9df86d';
import { injectCss, injectFont } from './inject-css.js?v=0ecc9df86d';   // CSP-safe sheet mount (see mountHud)

/* The canvas iframe carries this window.name so overlay.js can bail before
 * arming a nested HUD inside it (see overlay.js top-of-module guard). */
export const CANVAS_FRAME_NAME = 'pkCanvasFrame';

const CSS = `
#pkhud{position:fixed;inset:0;z-index:var(--pk-z-ov-hud);font:400 var(--pk-text-base)/1.5 var(--pk-font);color:var(--pk-ink);
  --hud-top:40px;--hud-device:32px;--hud-bottom:60px;--hud-left:64px;--hud-right:320px}
#pkhud *{box-sizing:border-box}
#pkhud kbd{font-family:var(--pk-font)}

/* ---- a11y: a visible keyboard ring on every control (mouse users never see it) ---- */
#pkhud button:focus-visible,#pkhud input:focus-visible,#pkhud select:focus-visible,
#pkhud textarea:focus-visible,#pkhud [tabindex]:focus-visible{outline:2px solid var(--pk-red);outline-offset:2px}
#pkhud .pkhud-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* right-rail open/close button — only meaningful once the rail is a slide-over */
#pkhud .rail-toggle{display:none;align-items:center;justify-content:center;width:var(--pk-control-h-xs);height:var(--pk-control-h-xs);
  border:1px solid var(--pk-hair);background:var(--pk-card);color:var(--pk-body);cursor:pointer}
#pkhud .rail-toggle svg{width:14px;height:14px}
@media (min-width:1024px) and (hover:hover){#pkhud .rail-toggle:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}

/* ---- CANVAS ---- */
#pkhud .cv{position:absolute;top:calc(var(--hud-top) + var(--hud-device));left:var(--hud-left);right:var(--hud-right);bottom:var(--hud-bottom);
  overflow:auto;background:var(--pk-elev);overscroll-behavior:none;overscroll-behavior-x:none}
#pkhud .cv-pad{min-width:100%;min-height:100%;box-sizing:border-box;padding:48px;display:flex}
#pkhud .cv-sizer{position:relative;flex:none;margin:auto;width:1440px;height:900px}
#pkhud .cv-scale{position:absolute;top:0;left:0;width:1440px;height:900px;transform-origin:0 0}
#pkhud .cv-frame{position:absolute;inset:0;width:1440px;height:900px;border:0;display:block;background:var(--pk-media-bg);filter:grayscale(1) contrast(.98);border-radius:4px;overflow:hidden}
#pkhud .cv-catch{position:absolute;inset:0;z-index:2;cursor:crosshair}
#pkhud .cv-pins{position:absolute;inset:0;z-index:var(--pk-z-hud-pins);pointer-events:none}
#pkhud .cv-pins .pin{pointer-events:auto}
#pkhud .cv:not(.is-nav) .cv-frame{pointer-events:none}
#pkhud .cv.is-nav .cv-catch{pointer-events:none;cursor:default}
#pkhud .cv::-webkit-scrollbar{width:10px;height:10px}
#pkhud .cv::-webkit-scrollbar-thumb{background:var(--pk-hair);border-radius:9999px;border:2px solid var(--pk-elev)}
@media (min-width:1024px) and (hover:hover){#pkhud .cv::-webkit-scrollbar-thumb:hover{background:var(--pk-muted)}}
#pkhud .cv::-webkit-scrollbar-track{background:transparent}
/* snaps to the viewport bottom-center (child of #pkhud, not the scroller — never scrolls away) */
#pkhud .cv-hint{position:absolute;bottom:calc(var(--hud-bottom) + 14px);left:50%;transform:translateX(-50%);
  z-index:var(--pk-z-hud-label);pointer-events:none;white-space:nowrap;padding:8px 12px;background:var(--pk-card);border:1px solid var(--pk-hair);
  box-shadow:var(--pk-shadow-md);font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-body)}
#pkhud .cv-hint kbd{border:1px solid var(--pk-hair);border-radius:var(--pk-radius-sm);padding:1px 4px;color:var(--pk-ink);font-size:var(--pk-text-3xs)}
#pkhud .pin{position:absolute;transform:translate(-50%,-50%);min-width:var(--pk-control-h-xs);height:var(--pk-control-h-xs);padding:0 8px;border-radius:9999px;
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--pk-on-accent);
  font:700 var(--pk-text-sm)/1 var(--pk-font);box-shadow:var(--pk-shadow-md);border:2px solid var(--pk-card);background:var(--pk-red)}
#pkhud .pin--draft{background:var(--pk-elev);color:var(--pk-red-ink);border-style:dashed;border-color:var(--pk-red)}
#pkhud .pkhud-pindot{position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;border:2px solid var(--pk-card)}
#pkhud .pin.is-located{animation:pkhud-locate .6s ease 2}
@keyframes pkhud-locate{0%,100%{transform:translate(-50%,-50%) scale(1)}40%{transform:translate(-50%,-50%) scale(1.5)}}
#pkhud .pkhud-plist{list-style:none;margin:0;padding:0}
#pkhud .pkhud-pli{display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--pk-hair);cursor:pointer;transition:background .12s}
@media (min-width:1024px) and (hover:hover){#pkhud .pkhud-pli:hover,#pkhud .pkhud-pli.is-sel{background:var(--pk-elev)}}
#pkhud .pkhud-pli-n{flex:none;width:22px;height:22px;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;font:700 var(--pk-text-2xs)/1 var(--pk-font);background:var(--pk-red);color:var(--pk-on-accent)}
#pkhud .pkhud-pli-b{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
#pkhud .pkhud-pli-t{font:600 var(--pk-text-md)/1.3 var(--pk-font);color:var(--pk-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pkhud .pkhud-pli-m{font:500 var(--pk-text-xs)/1.2 var(--pk-font);color:var(--pk-muted);text-transform:capitalize}
/* PINS list grouped by team: a collapsible header per team, shown only when that team has pins here. */
#pkhud .pkhud-tghead{display:flex;align-items:center;gap:8px;width:100%;padding:12px 12px;background:var(--pk-elev);
  border:none;border-bottom:1px solid var(--pk-hair);cursor:pointer;color:var(--pk-body);text-align:left;
  font:700 var(--pk-text-2xs)/1 var(--pk-font);letter-spacing:.1em;text-transform:uppercase;transition:background .12s}
@media (min-width:1024px) and (hover:hover){#pkhud .pkhud-tghead:hover{background:var(--pk-card)}}
#pkhud .pkhud-tgchev{width:14px;height:14px;flex:none;color:var(--pk-muted);transition:transform .18s var(--pk-ease)}
#pkhud .pkhud-tghead[aria-expanded="true"] .pkhud-tgchev{transform:rotate(90deg)}
#pkhud .pkhud-tgdot{flex:none;width:8px;height:8px;border-radius:9999px}
#pkhud .pkhud-tgname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pkhud .pkhud-tgcount{flex:none;color:var(--pk-muted);font-weight:700}
#pkhud .pkhud-tgroup.is-collapsed .pkhud-plist{display:none}
#pkhud .pkhud-tgroup .pkhud-pli:last-child{border-bottom:none}
/* "Actionable" group — pulled to the top of PINS, brand-red header so what needs doing reads first. */
#pkhud .pkhud-tgroup--action .pkhud-tghead{background:var(--pk-red);color:var(--pk-on-accent);border-bottom-color:var(--pk-red)}
@media (min-width:1024px) and (hover:hover){#pkhud .pkhud-tgroup--action .pkhud-tghead:hover{background:var(--pk-red);filter:brightness(1.06)}}
#pkhud .pkhud-tgroup--action .pkhud-tgchev,#pkhud .pkhud-tgroup--action .pkhud-tgcount{color:var(--pk-on-accent)}
#pkhud .pkhud-tgbolt{width:12px;height:12px;flex:none}

/* ---- TOP ---- */
#pkhud .hud-top{position:absolute;top:0;left:0;right:0;height:var(--hud-top);display:flex;align-items:center;gap:16px;
  padding:0 16px;background:var(--pk-card);border-bottom:1px solid var(--pk-hair)}
#pkhud .brand{display:flex;align-items:center;gap:8px;flex:none}
#pkhud .brand-mark{width:9px;height:9px;border-radius:50%;background:var(--pk-red);box-shadow:0 0 0 3px var(--pk-ring-red)}
#pkhud .brand-word{font:700 var(--pk-text-md)/1 var(--pk-font)}
#pkhud .brand-proj{font:600 var(--pk-text-xs)/1 var(--pk-font);letter-spacing:.06em;color:var(--pk-muted);padding-left:8px;border-left:1px solid var(--pk-hair)}
#pkhud .top-center{flex:1;min-width:0;text-align:center;font:500 var(--pk-text-sm)/1 var(--pk-font);color:var(--pk-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#pkhud .top-center b{color:var(--pk-ink);font-weight:600}
#pkhud .top-r{display:flex;align-items:center;gap:8px;flex:none}
#pkhud .top-team{font:700 var(--pk-text-xs)/1 var(--pk-font);letter-spacing:.08em;text-transform:uppercase;color:var(--pk-t-product,var(--pk-blue-ink))}
#pkhud .top-count{font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-muted);font-variant-numeric:tabular-nums}
#pkhud .top-dash{height:var(--pk-control-h-xs);padding:0 12px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--pk-hair);
  background:var(--pk-card);color:var(--pk-ink);cursor:pointer;font:700 var(--pk-text-2xs)/1 var(--pk-font);letter-spacing:.08em;text-transform:uppercase}
#pkhud .top-dash svg{width:14px;height:14px}
@media (min-width:1024px) and (hover:hover){#pkhud .top-dash:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}
#pkhud .top-x{width:var(--pk-control-h-xs);height:var(--pk-control-h-xs);display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--pk-red);
  background:var(--pk-red);color:var(--pk-on-accent);cursor:pointer}
@media (min-width:1024px) and (hover:hover){#pkhud .top-x:hover{border-color:var(--pk-red);color:var(--pk-on-accent);filter:brightness(1.08)}}
#pkhud .top-x svg{width:14px;height:14px}

/* ---- DEVICE strip ---- */
#pkhud .hud-device{position:absolute;top:var(--hud-top);left:0;right:0;height:var(--hud-device);display:flex;align-items:center;gap:8px;
  padding:0 16px;background:var(--pk-elev);border-bottom:1px solid var(--pk-hair);overflow:hidden;white-space:nowrap}
#pkhud .dv-lbl{font:700 var(--pk-text-2xs)/1 var(--pk-font);letter-spacing:.1em;text-transform:uppercase;color:var(--pk-muted);flex:none}
#pkhud .dv-presets{display:flex;gap:2px;flex:none}
#pkhud .dv-bp{height:22px;padding:0 8px;border:1px solid transparent;background:transparent;cursor:pointer;font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-body);transition:color .12s,background .12s,border-color .12s}
@media (min-width:1024px) and (hover:hover){#pkhud .dv-bp:hover{color:var(--pk-ink)}}
#pkhud .dv-bp.is-active{background:var(--pk-red);border-color:var(--pk-red);color:var(--pk-on-accent)}
#pkhud .dv-div{width:1px;height:16px;background:var(--pk-hair);flex:none}
#pkhud .dv-custom{display:inline-flex;align-items:center;gap:4px;flex:none;color:var(--pk-muted);font-size:var(--pk-text-xs)}
#pkhud .dv-in{width:var(--pk-control-h-lg);height:22px;padding:0 8px;border:1px solid var(--pk-hair);border-radius:4px;background:var(--pk-input);color:var(--pk-ink);font:500 var(--pk-text-xs)/1 var(--pk-font);text-align:center;font-variant-numeric:tabular-nums}
#pkhud .dv-in::-webkit-inner-spin-button,#pkhud .dv-in::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
#pkhud .dv-in:focus-visible{outline:none;border-color:var(--pk-red)}
#pkhud .dv-set{height:22px;padding:0 8px;border:1px solid var(--pk-hair);background:var(--pk-card);cursor:pointer;font:700 var(--pk-text-3xs)/1 var(--pk-font);letter-spacing:.08em;text-transform:uppercase;color:var(--pk-body)}
@media (min-width:1024px) and (hover:hover){#pkhud .dv-set:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}
#pkhud .dv-readout{margin-left:auto;flex:none;font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-body);font-variant-numeric:tabular-nums}

/* ---- LEFT rail ---- */
#pkhud .hud-left{position:absolute;left:0;top:calc(var(--hud-top) + var(--hud-device));bottom:var(--hud-bottom);width:var(--hud-left);
  display:flex;flex-direction:column;gap:4px;padding:8px 4px;background:var(--pk-card);border-right:1px solid var(--pk-hair)}
#pkhud .lrail-lbl{font:700 var(--pk-text-3xs)/1 var(--pk-font);letter-spacing:.12em;text-transform:uppercase;color:var(--pk-muted);text-align:center;margin:4px 0}
#pkhud .ltool{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 0;border:1px solid transparent;background:transparent;cursor:pointer;color:var(--pk-body);transition:background .15s,color .15s,border-color .15s}
#pkhud .ltool svg{width:20px;height:20px}
#pkhud .ltool span{font:700 var(--pk-text-3xs)/1 var(--pk-font);letter-spacing:.06em;text-transform:uppercase}
@media (min-width:1024px) and (hover:hover){#pkhud .ltool:hover{color:var(--pk-ink);background:var(--pk-elev)}}
#pkhud .ltool.is-on{color:var(--pk-red-ink);border-color:var(--pk-red)}
#pkhud .ltool.is-static{color:var(--pk-ink);cursor:default}
/* Theme + Log out sit at the bottom-left corner of the Show pane — the pair is pushed down
   by margin-top:auto on the FIRST of them (the rail is a fixed-height flex column) and the
   hairline fences the pair off from the visibility tools above. */
#pkhud .ltool--theme{margin-top:auto;border-top:1px solid var(--pk-hair);color:var(--pk-muted)}
@media (min-width:1024px) and (hover:hover){#pkhud .ltool--theme:hover{color:var(--pk-ink)}}
/* one icon per mode: the moon while dark (click → light), the sun while light (click → dark) */
#pkhud .ltool--theme .lt-sun{display:none}
#pkhud .ltool--theme[aria-checked="true"] .lt-sun{display:block}
#pkhud .ltool--theme[aria-checked="true"] .lt-moon{display:none}
#pkhud .ltool--logout{color:var(--pk-muted)}
#pkhud .ltool--logout svg{transform:scaleX(-1)}
@media (min-width:1024px) and (hover:hover){#pkhud .ltool--logout:hover{color:var(--pk-softred);background:var(--pk-elev)}}

/* ---- FILTER panel (4b): multi-facet slice, anchored off the left rail ---- */
#pkhud .flyout{position:absolute;left:calc(var(--hud-left) + 6px);top:calc(var(--hud-top) + var(--hud-device) + 6px);z-index:var(--pk-z-hud-flyout);width:300px;
  max-height:calc(100% - var(--hud-top) - var(--hud-device) - var(--hud-bottom) - 12px);overflow-y:auto;padding:16px;
  background:var(--pk-card);border:1px solid var(--pk-hair);box-shadow:var(--pk-shadow-md);display:none}
#pkhud .flyout.is-open{display:block;animation:pkhud-rise .16s var(--pk-ease-rise) both}
@keyframes pkhud-rise{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes pkhud-fade{from{opacity:0}to{opacity:1}}
#pkhud{animation:pkhud-fade .18s var(--pk-ease) both}
#pkhud .rpane.is-active{animation:pkhud-fade .14s var(--pk-ease) both}
#pkhud .pin{animation:pkhud-fade .18s var(--pk-ease) both}
@media (prefers-reduced-motion:reduce){
  #pkhud,#pkhud .flyout.is-open,#pkhud .rpane.is-active,#pkhud .pin{animation:none}
  #pkhud .hud-right{transition:none}
}
#pkhud .filter-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
#pkhud .filter-title{font:700 var(--pk-text-base)/1 var(--pk-font);color:var(--pk-ink)}
#pkhud .filter-clear{border:none;background:none;cursor:pointer;font:600 var(--pk-text-sm)/1 var(--pk-font);color:var(--pk-muted)}
@media (min-width:1024px) and (hover:hover){#pkhud .filter-clear:hover{color:var(--pk-red-ink)}}
#pkhud .filter-search{width:100%;height:var(--pk-control-h-sm);padding:0 8px;border:1px solid var(--pk-hair);border-radius:4px;background:var(--pk-input);
  color:var(--pk-ink);font:500 var(--pk-text-md)/1 var(--pk-font);font-family:var(--pk-font);margin-bottom:16px}
#pkhud .filter-search:focus-visible{outline:none;border-color:var(--pk-red)}
#pkhud .fgroup{margin-bottom:16px}
#pkhud .fg-lbl{display:block;font:700 var(--pk-text-sm)/1 var(--pk-font);color:var(--pk-body);margin-bottom:8px}
#pkhud .fchips{display:flex;flex-wrap:wrap;gap:8px}
#pkhud .fbtn{display:inline-flex;align-items:center;gap:8px;height:var(--pk-control-h-sm);padding:0 12px;border:1px solid var(--pk-hair);background:var(--pk-card);
  cursor:pointer;font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-body);transition:border-color .12s,color .12s,background .12s}
#pkhud .fbtn i{font-style:normal;font-weight:700;font-size:var(--pk-text-3xs);color:var(--pk-muted);font-variant-numeric:tabular-nums}
@media (min-width:1024px) and (hover:hover){#pkhud .fbtn:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}
#pkhud .fbtn.is-on{background:var(--pk-red);border-color:var(--pk-red);color:var(--pk-on-accent)}
#pkhud .fbtn.is-on i{color:var(--pk-on-accent)}
#pkhud .fseg{display:inline-flex;border:1px solid var(--pk-hair);overflow:hidden;max-width:100%}
#pkhud .fsegb{height:var(--pk-control-h-sm);padding:0 8px;border:none;background:var(--pk-input);cursor:pointer;font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-body);white-space:nowrap}
#pkhud .fsegb + .fsegb{border-left:1px solid var(--pk-hair)}
#pkhud .fsegb.is-active{background:var(--pk-red);color:var(--pk-on-accent)}
#pkhud .filter-foot{position:sticky;bottom:-16px;margin:12px -16px -16px;padding:12px 16px;background:var(--pk-card);
  border-top:1px solid var(--pk-hair);font:600 var(--pk-text-sm)/1 var(--pk-font);color:var(--pk-ink);text-align:center}

/* ---- RIGHT rail ---- */
#pkhud .hud-right{position:absolute;right:0;top:calc(var(--hud-top) + var(--hud-device));bottom:var(--hud-bottom);width:var(--hud-right);
  display:flex;flex-direction:column;background:var(--pk-card);border-left:1px solid var(--pk-hair)}
#pkhud .rrail-seg{flex:none;display:flex;border-bottom:1px solid var(--pk-hair)}
#pkhud .rseg{flex:1;height:var(--pk-control-h-md);border:none;background:transparent;cursor:pointer;color:var(--pk-muted);font:700 var(--pk-text-xs)/1 var(--pk-font);letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid transparent}
#pkhud .rseg.is-active{color:var(--pk-ink);border-bottom-color:var(--pk-red)}
#pkhud .rseg-n{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;margin-left:4px;border-radius:9999px;background:var(--pk-red);color:var(--pk-on-accent);font-size:var(--pk-text-2xs)}
/* The display rule above beats the [hidden] default, so an empty batch painted a red 0 badge. */
#pkhud .rseg-n[hidden]{display:none}
/* One draft. Summary on top, what it is and where it is going underneath, actions on the right —
   the same three facts the Old tray showed, because they are what tells two similar pins apart. */
#pkhud .dft{display:flex;align-items:flex-start;gap:var(--pk-space-3);padding:var(--pk-space-3) var(--pk-space-4);border-bottom:1px solid var(--pk-line)}
#pkhud .dft.is-failed{background:color-mix(in srgb,var(--pk-red) 8%,transparent)}
#pkhud .dft-b{flex:1;min-width:0}
/* Clamped to two lines. A copy-fix summary is "<the old text> → <the new text>", and pinning a
   large element makes the old half the whole paragraph — one draft then fills the pane and the
   list stops being scannable, which is the only thing it is for. The full text stays in the DOM
   as a tooltip. */
#pkhud .dft-s{font:600 var(--pk-text-sm)/1.4 var(--pk-font);color:var(--pk-ink);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#pkhud .dft-m{margin-top:2px;font:500 var(--pk-text-xs)/1.4 var(--pk-font);color:var(--pk-muted)}
#pkhud .dft.is-failed .dft-m{color:var(--pk-red)}
#pkhud .dft-a{display:flex;gap:var(--pk-space-2);flex-shrink:0}
#pkhud .dft-btn{height:var(--pk-control-h-sm);padding:0 var(--pk-space-3);border:1px solid var(--pk-line);border-radius:var(--pk-radius-sm);
  background:transparent;color:var(--pk-ink);cursor:pointer;font:600 var(--pk-text-xs)/1 var(--pk-font)}
#pkhud .dft-btn:hover{border-color:var(--pk-ink)}
#pkhud .dft-btn.is-danger:hover{border-color:var(--pk-red);color:var(--pk-red)}
#pkhud .dft-foot{display:flex;gap:var(--pk-space-2);padding:var(--pk-space-3) var(--pk-space-4)}
/* The editing banner. The composer looks identical in all three modes, so without this there is
   nothing on screen to say that Save will overwrite a submitted comment rather than add a pin. */
#pkhud .cedit{display:flex;align-items:center;gap:var(--pk-space-3);margin-bottom:var(--pk-space-3);
  padding:var(--pk-space-3) var(--pk-space-4);border-left:2px solid var(--pk-red);
  background:color-mix(in srgb,var(--pk-red) 8%,transparent);
  font:600 var(--pk-text-xs)/1.4 var(--pk-font);color:var(--pk-ink)}
#pkhud .cedit button{margin-left:auto;border:none;background:transparent;color:var(--pk-muted);cursor:pointer;
  font:600 var(--pk-text-xs)/1 var(--pk-font);text-decoration:underline}
#pkhud .rrail-body{flex:1 1 auto;min-height:0;overflow-y:auto}
#pkhud .rpane{display:none;flex-direction:column}
#pkhud .rpane.is-active{display:flex}
#pkhud .rpane-empty{padding:24px 16px;color:var(--pk-muted);font-size:var(--pk-text-md);text-align:center}
/* ---- composer (docked, Phase 5) ---- */
#pkhud .cpane{padding:16px;display:flex;flex-direction:column;gap:16px}
#pkhud .fg{display:flex;flex-direction:column;gap:8px}
/* one rhythm: every field group is separated by the same 16px as the pane gap, so an input and a
   non-input block sit on the same vertical grid (the lead divider adds a rule, not extra space) */
#pkhud .fg--lead{padding-bottom:16px;border-bottom:1px solid var(--pk-hair)}
#pkhud .cpane > *{margin:0}
/* Selected Element: read-only context, not a form control — flat surface, no focus affordance */
#pkhud .csel-el{padding:12px 12px;border:1px solid var(--pk-hair);border-left:2px solid var(--pk-red);
  background:var(--pk-elev);color:var(--pk-ink);font:500 var(--pk-text-md)/1.5 var(--pk-font);
  max-height:96px;overflow:auto;overflow-wrap:anywhere}
#pkhud .csel-el.is-empty{color:var(--pk-muted);font-style:italic;border-left-color:var(--pk-hair)}
#pkhud .fl{display:flex;align-items:center;gap:8px;font:700 var(--pk-text-2xs)/1 var(--pk-font);letter-spacing:.1em;text-transform:uppercase;color:var(--pk-muted)}
#pkhud .fl .req{color:var(--pk-red-ink)}
#pkhud .fl .auto{margin-left:auto;font-weight:500;text-transform:none;letter-spacing:.02em}
#pkhud .ctypes{display:flex;flex-wrap:wrap;gap:8px}
#pkhud .ctype{height:var(--pk-control-h-sm);padding:0 12px;border:1px solid var(--pk-hair);background:var(--pk-card);cursor:pointer;font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-body);transition:border-color .15s,color .15s,background .15s}
@media (min-width:1024px) and (hover:hover){#pkhud .ctype:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}
#pkhud .ctype.is-active{background:var(--pk-red);border-color:var(--pk-red);color:var(--pk-on-accent)}
#pkhud .cinp,#pkhud .pkta,#pkhud .csel{width:100%;padding:12px 12px;border:1px solid var(--pk-hair);border-radius:4px;background:var(--pk-input);color:var(--pk-ink);font:500 var(--pk-text-md)/1.5 var(--pk-font);font-family:var(--pk-font)}
#pkhud .csel{height:var(--pk-control-h-lg);cursor:pointer;border-width:2px;font-weight:600}
#pkhud .cinp:disabled{color:var(--pk-muted);background:var(--pk-elev);cursor:default}
#pkhud .cinp:focus-visible,#pkhud .pkta:focus-visible,#pkhud .csel:focus-visible{outline:none;border-color:var(--pk-red)}
#pkhud .pkta{min-height:80px;resize:vertical}
#pkhud .cshot{border:1px dashed var(--pk-hair);border-radius:4px;padding:12px;display:flex;align-items:center;gap:8px;color:var(--pk-muted);font-size:var(--pk-text-xs)}
#pkhud .cshot img{max-width:100%;display:block;border:1px solid var(--pk-hair)}
#pkhud .cshot.is-req{border-color:var(--pk-red);color:var(--pk-body)}
#pkhud .ctest{display:flex;align-items:center;gap:8px;font:500 var(--pk-text-xs)/1.4 var(--pk-font);color:var(--pk-muted);cursor:pointer}
#pkhud .ctest b{color:var(--pk-amber)}
#pkhud .cerr{color:var(--pk-softred);font:600 var(--pk-text-xs)/1.4 var(--pk-font)}
#pkhud .cerr:empty{display:none}
/* Composer lint (Phase 5.2) — ADVISORY. It never blocks the save, so it is styled as a quiet
   note, not an error: a left rule in the severity colour, muted body text. The "missing" score
   borrows the amber open-ink (something is absent) and "vague" the clarify violet (it is there
   but unclear); neither uses red, which in this tool means destructive or selected. */
#pkhud .clint{padding:8px 12px;background:var(--pk-card);border:1px solid var(--pk-hair);
  border-left:var(--pk-border-strong) solid var(--pk-hair);font:400 var(--pk-text-xs)/1.5 var(--pk-font);color:var(--pk-body)}
#pkhud .clint[hidden]{display:none}
#pkhud .clint--missing{border-left-color:var(--pk-amber)}
#pkhud .clint--vague{border-left-color:var(--pk-clarify)}
#pkhud .clint-h{display:block;font-weight:700;font-size:var(--pk-text-3xs);letter-spacing:.1em;
  text-transform:uppercase;color:var(--pk-muted);margin-bottom:4px}
#pkhud .clint ul{margin:0;padding-left:16px}
#pkhud .clint li + li{margin-top:3px}
#pkhud .clint-fix{margin-top:8px;padding-top:8px;border-top:1px solid var(--pk-hair)}
#pkhud .clint-apply{margin-top:4px;border:1px solid var(--pk-hair);background:transparent;
  color:var(--pk-body);cursor:pointer;padding:3px 8px;font:700 var(--pk-text-3xs)/1.4 var(--pk-font);
  letter-spacing:.08em;text-transform:uppercase}
@media (min-width:1024px) and (hover:hover){#pkhud .clint-apply:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}
#pkhud .csave{width:100%;justify-content:center}
#pkhud .ccancel{margin-top:var(--pk-space-2)}
#pkhud .cnote{font:500 var(--pk-text-xs)/1.4 var(--pk-font);color:var(--pk-muted)}
/* ---- thread pane (parity: read + reply + confirm) ---- */
/* NOTE: the container is .pkth, not .th. A host stylesheet is free to own a bare .th (this
   site's data-table header does, in olive) and it would paint straight through the HUD,
   which is a plain DOM child of the host page. The .th-… children are safe — a one-word
   host class cannot match them — so only the bare name is namespaced. */
#pkhud .pkth{padding:16px;display:flex;flex-direction:column;gap:16px}
#pkhud .th-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#pkhud .th-tk{font:700 var(--pk-text-sm)/1 var(--pk-font);color:var(--pk-red-ink);font-variant-numeric:tabular-nums}
#pkhud .th-st{margin-left:auto;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 12px;border-radius:9999px;
  font:700 var(--pk-text-2xs)/1 var(--pk-font);letter-spacing:.06em;text-transform:uppercase;background:var(--pk-elev);color:var(--pk-body)}
#pkhud .th-st i{width:7px;height:7px;border-radius:50%;background:var(--pk-muted);font-style:normal}
#pkhud .th-back{border:none;background:none;padding:0;cursor:pointer;font:700 var(--pk-text-2xs)/1 var(--pk-font);
  letter-spacing:.08em;text-transform:uppercase;color:var(--pk-muted)}
@media (min-width:1024px) and (hover:hover){#pkhud .th-back:hover{color:var(--pk-red-ink)}}
/* title row: summary left, the dashboard hand-off flush to the right margin. It is a link,
   not a button — going to the dashboard is navigation, not one of the thread's actions. */
#pkhud .th-sumrow{display:flex;align-items:flex-start;gap:12px}
#pkhud .th-sum{flex:1 1 auto;min-width:0;font:600 var(--pk-text-base)/1.4 var(--pk-font);color:var(--pk-ink)}
#pkhud .th-dash{flex:none;margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:0;
  border:none;background:none;cursor:pointer;font:600 var(--pk-text-xs)/1.4 var(--pk-font);color:var(--pk-red-ink);white-space:nowrap}
#pkhud .th-dash svg{width:12px;height:12px}
@media (min-width:1024px) and (hover:hover){#pkhud .th-dash:hover{text-decoration:underline}}
#pkhud .th-meta{font:500 var(--pk-text-xs)/1.4 var(--pk-font);color:var(--pk-muted)}
#pkhud .th-body{font:400 var(--pk-text-md)/1.5 var(--pk-font);color:var(--pk-body);white-space:pre-wrap;
  padding-left:12px;border-left:2px solid var(--pk-hair)}
#pkhud .th-reps{display:flex;flex-direction:column;gap:12px;padding-top:12px;border-top:1px solid var(--pk-hair)}
#pkhud .th-rep{display:flex;flex-direction:column;gap:2px}
#pkhud .th-rep-t{font:400 var(--pk-text-md)/1.5 var(--pk-font);color:var(--pk-ink);white-space:pre-wrap}
#pkhud .th-rep-m{font:500 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-muted)}
#pkhud .th-none{font:400 var(--pk-text-sm)/1.4 var(--pk-font);color:var(--pk-muted)}
#pkhud .th-acts{display:flex;gap:8px;flex-wrap:wrap}
#pkhud .th-acts .btool{height:var(--pk-control-h-sm);padding:0 12px;font-size:var(--pk-text-2xs)}
#pkhud .bdraft{display:inline-flex;align-items:center;gap:8px;font:600 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-muted)}
#pkhud .bdraft b{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border-radius:9999px;background:var(--pk-red);color:var(--pk-on-accent);font-size:var(--pk-text-2xs)}

/* ---- BOTTOM toolbar ---- */
#pkhud .hud-bottom{position:absolute;left:0;right:0;bottom:0;height:var(--hud-bottom);display:flex;align-items:center;gap:8px;padding:0 16px;background:var(--pk-card);border-top:1px solid var(--pk-hair)}
#pkhud .bsp{flex:1}
#pkhud .bdiv{width:1px;height:var(--pk-control-h-xs);background:var(--pk-hair)}
#pkhud .btool{height:var(--pk-control-h-md);padding:0 16px;border:1px solid var(--pk-hair);background:transparent;cursor:pointer;color:var(--pk-ink);display:inline-flex;align-items:center;gap:8px;font:700 var(--pk-text-xs)/1 var(--pk-font);letter-spacing:.08em;text-transform:uppercase;transition:border-color .15s,color .15s,background .15s}
#pkhud .btool svg{width:16px;height:16px}
@media (min-width:1024px) and (hover:hover){#pkhud .btool:hover{border-color:var(--pk-red);color:var(--pk-red-ink)}}
#pkhud .btool--primary{background:var(--pk-red);border-color:var(--pk-red);color:var(--pk-on-accent)}
@media (min-width:1024px) and (hover:hover){#pkhud .btool--primary:hover{filter:brightness(1.08);color:var(--pk-on-accent)}}
#pkhud .btool.is-awaiting{background:var(--pk-elev);border-color:var(--pk-amber);color:var(--pk-amber);cursor:default;filter:none;animation:pkhud-pulse 1.2s ease-in-out infinite}
@keyframes pkhud-pulse{0%,100%{opacity:1}50%{opacity:.55}}
#pkhud .btool--icon{width:var(--pk-control-h-md);padding:0;justify-content:center}
#pkhud .bnav{display:inline-flex;align-items:center;gap:8px}
#pkhud .bnav-pos{font:700 var(--pk-text-xs)/1 var(--pk-font);color:var(--pk-muted);min-width:52px;text-align:center;font-variant-numeric:tabular-nums}

/* ---- RESPONSIVE: both rails are fixed-width, so below ~1100px they must stop stealing the
   canvas. The right rail becomes a slide-over sheet; below 700px the left rail becomes a
   horizontal icon strip above the toolbar and the canvas takes the full width. ---- */
@media (max-width:1100px){
  /* the parked slide-over rail sits past the right edge — clip it so it never creates a scrollbar */
  #pkhud{--hud-right:0px;overflow-x:hidden}
  #pkhud .hud-right{width:min(340px,86vw);transform:translateX(100%);transition:transform .2s var(--pk-ease);box-shadow:var(--pk-shadow-lg);z-index:var(--pk-z-hud-rail)}
  #pkhud .hud-right.is-open{transform:none}
  #pkhud .rail-toggle{display:inline-flex}
}
@media (max-width:700px){
  #pkhud{--hud-left:0px;--hud-bottom:56px}
  #pkhud .hud-left{top:auto;bottom:var(--hud-bottom);left:0;right:0;width:auto;height:52px;flex-direction:row;
    align-items:center;justify-content:space-around;border-right:none;border-top:1px solid var(--pk-hair);z-index:var(--pk-z-hud-panel)}
  #pkhud .lrail-lbl{display:none}
  #pkhud .ltool{flex:1;padding:8px 0}
  /* row layout: the bottom-pin margin makes no sense; keep Theme + Log out inline with the tools */
  #pkhud .ltool--theme{margin-top:0;border-top:none}
  #pkhud .cv{bottom:calc(var(--hud-bottom) + 52px)}
  #pkhud .flyout{left:8px;right:8px;width:auto;top:calc(var(--hud-top) + var(--hud-device) + 6px);
    max-height:calc(100% - var(--hud-top) - var(--hud-device) - var(--hud-bottom) - 70px)}
  #pkhud .cv-hint{display:none}                      /* pointer-only guidance, no room on phones */
  #pkhud .hud-device{gap:8px;overflow-x:auto}
  #pkhud .dv-readout{margin-left:8px}
  #pkhud .hud-bottom{gap:4px;padding:0 8px;overflow-x:auto}
  #pkhud .hud-bottom .btool{padding:0 12px;font-size:var(--pk-text-2xs)}
  #pkhud .bdiv{display:none}
  /* the header can't fit the page title + counts at this width — drop what is recoverable
     elsewhere (the title is in the device strip's context, the count in the Pins list) */
  #pkhud .top-center,#pkhud .top-count,#pkhud .brand-proj{display:none}
  #pkhud .hud-top{gap:8px;padding:0 8px}
}
`;

const CHEV_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function html() {
  const page = pageName ? pageName(location.pathname) : (document.title || 'Page');
  const team = (getSession().team) || 'Reviewer';
  return `
  <div class="hud-top">
    <div class="brand"><span class="brand-mark"></span><span class="brand-word">Proofkit</span>${PROJECT_SHORT ? `<span class="brand-proj">${esc(PROJECT_SHORT)}</span>` : ''}</div>
    <div class="top-center"><b>${esc(page)}</b> · ${esc(location.pathname)}</div>
    <div class="top-r">
      <span class="top-team">${esc(team)}</span>
      <span class="top-count" id="pkhud-count">0 pins</span>
      <button class="rail-toggle" id="pkhud-railtoggle" aria-controls="pkhud-rightrail" aria-expanded="false" title="Show pins &amp; composer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h18M3 12h18M3 19h18"/></svg><span class="pkhud-sr">Toggle the pins and composer panel</span></button>
      <button class="top-dash" id="pkhud-dash" title="Go to dashboard (D)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Dashboard</button>
      <button class="top-x" id="pkhud-exit" title="Exit review"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
  </div>

  <div class="hud-device">
    <span class="dv-lbl">Viewport</span>
    <div class="dv-presets" id="pkhud-presets">
      <button class="dv-bp" data-w="390" data-h="844">Mobile</button>
      <button class="dv-bp" data-w="768" data-h="1024">Tablet</button>
      <button class="dv-bp" data-w="1366" data-h="768">Laptop</button>
      <button class="dv-bp is-active" data-w="1440" data-h="900">Desktop</button>
      <button class="dv-bp" data-w="1920" data-h="1080">Full HD</button>
    </div>
    <span class="dv-div"></span>
    <div class="dv-custom">
      <input class="dv-in" id="pkhud-w" type="number" value="1440" aria-label="Width"><span>×</span><input class="dv-in" id="pkhud-h" type="number" value="900" aria-label="Height">
      <button class="dv-set" id="pkhud-set">Set</button>
    </div>
    <span class="dv-readout" id="pkhud-readout">1440 × 900 · 100%</span>
  </div>

  <div class="hud-left">
    <div class="lrail-lbl">Show</div>
    <button class="ltool is-static is-on" title="My team's pins"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><span>Mine</span></button>
    <button class="ltool" id="pkhud-teams" aria-pressed="false" title="Other teams' pins"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3.5 20a6 6 0 0 1 11 0M14 20a5 5 0 0 1 6.5-4.8"/></svg><span>Teams</span></button>
    <button class="ltool" id="pkhud-resolved" aria-pressed="false" title="Resolved pins"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span>Resolved</span></button>
    <button class="ltool" id="pkhud-filter" aria-expanded="false" aria-controls="pkhud-flyfilter" title="Filter comments"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg><span>Filter</span></button>
    <button class="ltool ltool--theme" id="pkhud-theme" role="switch" aria-checked="false" title="Dark mode — switch to light"><svg class="lt-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg><svg class="lt-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg><span id="pkhud-thlbl">Dark</span></button>
    <button class="ltool ltool--logout" id="pkhud-logout" title="Log out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg><span>Log out</span></button>
  </div>

  <div class="flyout" id="pkhud-flyfilter" role="group" aria-label="Filter comments">
    <div class="filter-head"><span class="filter-title">Filter</span><button class="filter-clear" id="pkhud-fclear">Clear All</button></div>
    <input class="filter-search" id="pkhud-fsearch" type="text" placeholder="Search Comments…">
    <div class="fgroup"><span class="fg-lbl">Status</span>
      <div class="fchips" data-facet="status">
        <button class="fbtn" data-v="to_be_initiated">To Be Initiated <i data-n></i></button>
        <button class="fbtn" data-v="in_progress">In Progress <i data-n></i></button>
        <button class="fbtn" data-v="deployed_live">Deployed Live <i data-n></i></button>
        <button class="fbtn" data-v="needs_clarification">Need Clarity <i data-n></i></button>
        <button class="fbtn" data-v="reopened">Reopened <i data-n></i></button>
        <button class="fbtn" data-v="disregarded">Disregarded <i data-n></i></button>
      </div>
    </div>
    <div class="fgroup"><span class="fg-lbl">Type</span><div class="fchips" data-facet="type" id="pkhud-ftypes"></div></div>
    <div class="fgroup"><span class="fg-lbl">Direction</span>
      <div class="fseg" data-seg="direction">
        <button class="fsegb is-active" data-v="all">All</button>
        <button class="fsegb" data-v="from">Raised By Us</button>
        <button class="fsegb" data-v="to">Directed To Us</button>
      </div>
    </div>
    <div class="fgroup"><span class="fg-lbl">Attributes</span>
      <div class="fchips" data-facet="attr">
        <button class="fbtn" data-v="shot">Has Screenshot</button>
        <button class="fbtn" data-v="replies">Has Replies</button>
        <button class="fbtn" data-v="mine">Raised By Me</button>
      </div>
    </div>
    <div class="fgroup"><span class="fg-lbl">Sort</span>
      <div class="fseg" data-seg="sort">
        <button class="fsegb is-active" data-v="new">Newest</button>
        <button class="fsegb" data-v="old">Oldest</button>
        <button class="fsegb" data-v="seq">Pin No.</button>
      </div>
    </div>
    <div class="filter-foot" id="pkhud-fcount">Showing 0 of 0</div>
  </div>

  <div class="hud-right" id="pkhud-rightrail" aria-label="Review panel">
    <div class="rrail-seg" role="tablist" aria-label="Review panel sections">
      <button class="rseg is-active" data-pane="pins" role="tab" aria-selected="true">Pins</button>
      <button class="rseg" data-pane="thread" role="tab" aria-selected="false">Thread</button>
      <button class="rseg" data-pane="compose" role="tab" aria-selected="false">Compose</button>
      <!-- Drafts carries a count because it is the only pane whose emptiness matters: the number
           is the thing a reviewer is tracking mid-batch, and it belongs next to the way in. -->
      <button class="rseg" data-pane="drafts" role="tab" aria-selected="false">Drafts <span class="rseg-n" id="pkhud-draftn" hidden>0</span></button>
    </div>
    <div class="rrail-body">
      <div class="rpane is-active" data-pane="pins" role="tabpanel" tabindex="0"><div class="rpane-empty">Loading pins…</div></div>
      <div class="rpane" data-pane="thread" role="tabpanel" tabindex="0"><div class="rpane-empty">Select a pin to open its thread.</div></div>
      <div class="rpane" data-pane="drafts" role="tabpanel" tabindex="0"><div class="rpane-empty">Nothing pending.</div></div>
      <div class="rpane" data-pane="compose" role="tabpanel" tabindex="0">
        <div class="cpane">
          <div class="fg"><span class="fl">Selected Element</span><div class="csel-el" id="pkhud-csel">Place a pin to select an element.</div></div>
          <div class="fg fg--lead"><span class="fl">Direct To</span><select class="csel" id="pkhud-to"></select></div>
          <div class="fg"><span class="fl">Comment Type</span><div class="ctypes" id="pkhud-ctypes"></div></div>
          <div id="pkhud-cfields"></div>
          <div class="fg"><span class="fl" id="pkhud-clabel-comment">Optional Comments</span><textarea class="pkta" id="pkhud-ccomment" placeholder="Anything else the builder should know…"></textarea></div>
          <div class="fg"><span class="fl">Screenshot</span><div class="cshot" id="pkhud-cshot">Paste (⌘V) a screenshot to attach.</div></div>
          ${getSession().team === ADMIN_TEAM ? '<label class="ctest"><input type="checkbox" id="pkhud-ctest"><span>Mark as <b>test</b> — excluded from stats, safe to delete</span></label>' : ''}
          <div class="clint" id="pkhud-clint" hidden></div>
          <div class="cerr" id="pkhud-cerr"></div>
          <button class="btool btool--primary csave" id="pkhud-csave">Save to batch</button>
          <button class="btool csave ccancel" id="pkhud-ccancel" hidden>Cancel edit</button>
          <div class="cnote" id="pkhud-cnote">Place a pin on the canvas to start.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="hud-bottom">
    <button class="btool btool--primary" id="pkhud-comment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="pkhud-clabel">Comment</span></button>
    <span class="bdiv"></span>
    <div class="bnav">
      <button class="btool btool--icon" id="pkhud-prev" title="Previous pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="bnav-pos" id="pkhud-pos">0 / 0</span>
      <button class="btool btool--icon" id="pkhud-next" title="Next pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
    <span class="bdiv"></span>
    <div class="bnav">
      <button class="btool btool--icon" id="pkhud-zout" title="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/></svg></button>
      <button class="btool pk-u-zpct" id="pkhud-zpct" title="Reset to 100%">100%</button>
      <button class="btool btool--icon" id="pkhud-zin" title="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      <button class="btool btool--icon" id="pkhud-zfit" title="Fit width"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg></button>
    </div>
    <span class="bsp"></span>
    <span class="bdraft" id="pkhud-draftcount" hidden>Drafts <b>0</b></span>
    <button class="btool btool--primary" id="pkhud-submit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>Submit all</button>
  </div>

  <div class="cv" id="pkhud-cv">
    <div class="cv-pad">
      <div class="cv-sizer" id="pkhud-sizer">
        <div class="cv-scale" id="pkhud-scale">
          <iframe class="cv-frame" id="pkhud-frame" name="${CANVAS_FRAME_NAME}" scrolling="no" title="Review canvas"></iframe>
          <div class="cv-catch" id="pkhud-catch"></div>
          <div class="cv-pins" id="pkhud-pins"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="cv-hint"><kbd>⌘/Ctrl</kbd>-click to mark · Hold <kbd>⇧ Shift</kbd> to navigate · Pinch to zoom</div>`;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

/* Mount the HUD. `ctx.comments` = the page's comment records (Phase 4). Returns { unmount }. */
let removeHudCss = null;

export function mountHud(ctx = {}) {
  unmountHud();

  injectFont();   // the HUD is on the host page too, and Outfit is not there unless we bring it
  removeHudCss = injectCss(CSS, 'pkhud-style');

  const root = document.createElement('div');
  root.id = 'pkhud';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Proofkit review overlay');
  root.innerHTML = html();
  document.body.appendChild(root);
  document.documentElement.style.overflow = 'hidden'; // freeze the host page scroll behind the HUD

  /* ---- SKIN — the HUD opens in the reviewer's own colour mode ----
   * Colour mode is a per-team preference set on that team's dashboard (config.js), and
   * tokens.css carries every skin keyed off `:root[data-pk-theme]` — overlay.js has
   * already injected it — so painting the HUD = putting that attribute on <html> for as
   * long as the HUD is mounted. Nothing else on the marketing page reads the attribute
   * and the HUD covers the page while it is up; unmount puts back whatever the page had,
   * so the reviewer's skin never leaks into the plain site.
   * It also follows a flip made in the SAME user's other tab (`storage`, instant), which
   * is how switching mode on the dashboard re-skins an open HUD. */
  const prevPageTheme = document.documentElement.getAttribute('data-pk-theme');
  const paintTheme = (name) => { if (name) document.documentElement.setAttribute('data-pk-theme', name); };
  paintTheme(getTheme());
  const onThemeEvt = (e) => { paintTheme((e.detail && e.detail.theme) || getTheme()); syncThemeTool(); };
  const onThemeStore = (e) => { if (isThemeKey(e.key)) { paintTheme(getTheme()); syncThemeTool(); } };
  document.addEventListener('pk:themechange', onThemeEvt);
  window.addEventListener('storage', onThemeStore);
  /* The rail's Theme tool flips the SAME per-team preference the dashboards write, so a mode
   * chosen mid-review is the mode that board opens in — this is a shortcut to that setting,
   * not a second one. Label + icon name the mode you are IN, the title what a click does. */
  function syncThemeTool() {
    const btn = root.querySelector('#pkhud-theme'); if (!btn) return;
    const light = getTheme() === 'light';
    btn.setAttribute('aria-checked', String(light));
    btn.title = light ? 'Light mode — switch to dark' : 'Dark mode — switch to light';
    btn.querySelector('#pkhud-thlbl').textContent = light ? 'Light' : 'Dark';
  }

  const $ = (id) => root.querySelector('#pkhud-' + id);
  const cv = $('cv'), sizer = $('sizer'), scale = $('scale'), frame = $('frame'), catch_ = $('catch');

  // load the CURRENT page into the canvas iframe (same-origin). The name guard in
  // overlay.js prevents the overlay from re-arming a nested HUD inside it.
  frame.src = location.pathname + location.search;

  // ---- canvas geometry / zoom / pan ----
  let CW = 1440, CH = 900, deviceH = 900, z = 1;
  const ZMAX = 16, PAD = 48;
  const zpct = $('zpct'), readout = $('readout');
  // below 1% (deep zoom-out on a wide canvas) a whole number rounds to a misleading "0%"
  const pct = () => { const p = z * 100; return (p < 1 ? p.toFixed(1) : Math.round(p)) + '%'; };
  const setReadout = () => { readout.textContent = CW + ' × ' + deviceH + ' · ' + pct(); zpct.textContent = pct(); };
  function applySize() { frame.style.width = CW + 'px'; frame.style.height = CH + 'px'; scale.style.width = CW + 'px'; scale.style.height = CH + 'px'; }
  // real page height at the CURRENT iframe width (same-origin → measurable); 0 until loaded/cross-origin.
  function measuredHeight() {
    try { const d = frame.contentDocument; if (d && d.body) return Math.max(d.body.scrollHeight, d.documentElement.scrollHeight, deviceH); } catch {}
    return 0;
  }
  // Update ONLY the scroll extent to the true height (keeps zoom/scroll steady — no re-center).
  function remeasure() {
    const h = measuredHeight();
    if (h && Math.abs(h - CH) > 1) { CH = h; frame.style.height = CH + 'px'; scale.style.height = CH + 'px'; sizer.style.height = (CH * z) + 'px'; }
    return h;
  }
  function setZoom(nz, ox, oy) {
    const r = cv.getBoundingClientRect();
    const minZ = Math.max(0.001, 0.01 * r.width / CW); // floor: 1% of the viewport width
    nz = Math.min(ZMAX, Math.max(minZ, nz));
    if (ox == null) { ox = r.left + r.width / 2; oy = r.top + r.height / 2; }
    const s0 = scale.getBoundingClientRect(); const cx = (ox - s0.left) / z, cy = (oy - s0.top) / z;
    z = nz;
    sizer.style.width = (CW * z) + 'px'; sizer.style.height = (CH * z) + 'px';
    scale.style.transform = 'scale(' + z + ')';
    const s1 = scale.getBoundingClientRect();
    cv.scrollLeft += (s1.left + cx * z) - ox; cv.scrollTop += (s1.top + cy * z) - oy;
    setReadout();
  }
  const fitWidth = () => { const r = cv.getBoundingClientRect(); setZoom((r.width - PAD * 2) / CW); cv.scrollTop = 0; };
  function setResolution(w, h) {
    CW = Math.max(240, Math.min(7680, w | 0)); if (h) deviceH = h | 0;
    frame.style.width = CW + 'px'; scale.style.width = CW + 'px';   // reflow the real page at the new width
    $('w').value = CW; $('h').value = deviceH; setReadout();
    // let the iframe reflow at the new width, then measure the TRUE height there and center-snap
    requestAnimationFrame(() => setTimeout(() => { remeasure(); fitWidth(); renderHudPins(); }, 30));
  }

  applySize(); fitWidth(); setReadout();
  frame.addEventListener('load', () => {
    try { root._pkhudRO && root._pkhudRO.disconnect(); } catch {}
    remeasure(); fitWidth(); refreshPins();   // real pins anchor once the page is laid out
    // …and only now do the pins have geometry, so a dashboard deep link can be centred on one.
    requestAnimationFrame(() => focusDeepLink());
    // keep the scroll extent accurate as the page's height shifts (late images, expanding sections)
    try {
      const doc = frame.contentDocument;
      // The canvas iframe never scrolls its own document (scrolling="no"; we scroll/scale the
      // frame from outside), so BaseLayout's scroll-reveal IntersectionObserver never fires for
      // below-the-fold blocks — they'd stay at opacity:0 and the page reads blank under the header.
      // The canvas is a static snapshot for annotation, so drop the hidden state: removing
      // `.js-reveal` makes the `[data-reveal]{opacity:0}` rule inert, showing all content at once.
      if (doc) { try { doc.documentElement.classList.remove('js-reveal'); } catch {} }
      if (doc && typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => remeasure()); ro.observe(doc.documentElement); root._pkhudRO = ro; }
      // Keep link navigation INSIDE the HUD canvas. Clicks only reach the page while Shift-nav is
      // active; there, any link — including target=_blank and the browser's Shift/Ctrl/⌘-click
      // "open in new window" — is redirected to load in THIS iframe, never a new tab.
      if (doc) doc.addEventListener('click', (ev) => {
        const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
        if (!a) return;
        const raw = a.getAttribute('href') || '';
        if (!raw || raw[0] === '#' || /^(javascript|mailto|tel):/i.test(raw)) return;
        ev.preventDefault(); ev.stopPropagation();
        try { frame.contentWindow.location.assign(a.href); } catch { frame.src = a.href; }
      }, true);
    } catch {}
  });

  // pinch (ctrl+wheel) zooms to cursor; plain wheel pans (native)
  cv.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(z * (1 - e.deltaY * 0.01), e.clientX, e.clientY); } }, { passive: false });
  $('zin').addEventListener('click', () => setZoom(z * 1.2));
  $('zout').addEventListener('click', () => setZoom(z / 1.2));
  $('zpct').addEventListener('click', () => setZoom(1));
  $('zfit').addEventListener('click', fitWidth);

  // resolution / breakpoints
  $('presets').addEventListener('click', (e) => { const b = e.target.closest('.dv-bp'); if (!b) return;
    root.querySelectorAll('.dv-bp').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); setResolution(+b.dataset.w, +b.dataset.h); });
  $('set').addEventListener('click', () => { root.querySelectorAll('.dv-bp').forEach((x) => x.classList.remove('is-active')); setResolution(+$('w').value, +$('h').value); });
  ['w', 'h'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('set').click(); }));

  // Shift = let clicks reach the page (navigate/interact in-place); default = page inert
  const onKeyDown = (e) => { if (e.key === 'Shift') cv.classList.add('is-nav'); };
  const onKeyUp = (e) => { if (e.key === 'Shift') cv.classList.remove('is-nav'); };
  const onBlur = () => cv.classList.remove('is-nav');
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur);

  // ---- comment placement mode ----
  // Comment CTA → "Awaiting Source" (disabled): a plain click anywhere on the canvas now drops the
  // draft pin, and each FURTHER click MOVES it — until the reviewer starts writing (focuses the
  // composer, Phase 5) or presses Esc. ⌘/Ctrl-click marks directly and also arms placement so a
  // second click repositions.
  let placing = false;
  const commentBtn = $('comment'), commentLabel = commentBtn.querySelector('.pkhud-clabel');
  const showCompose = () => root.querySelector('.rseg[data-pane="compose"]').click();
  function armPlacing() { placing = true; commentBtn.disabled = true; commentBtn.classList.add('is-awaiting'); commentLabel.textContent = 'Awaiting Source'; showCompose(); }
  function endPlacing() { placing = false; commentBtn.disabled = false; commentBtn.classList.remove('is-awaiting'); commentLabel.textContent = 'Comment'; }
  function placePinAt(clientX, clientY) {
    const s = scale.getBoundingClientRect(); const x = (clientX - s.left) / z, y = (clientY - s.top) / z;
    let p = $('pins').querySelector('.pin--draft');
    if (!p) { p = document.createElement('div'); p.className = 'pin pin--draft'; p.textContent = '+'; $('pins').appendChild(p); }
    p.style.left = x + 'px'; p.style.top = y + 'px';
    captureAnchor(x, y);   // resolve the element under the pin INSIDE the canvas (Phase 5)
    return p;
  }
  commentBtn.addEventListener('click', armPlacing);
  // Press-and-DRAG placement (matches the old pin): pressing the canvas drops the draft pin and
  // starts dragging; moving repositions it live; release drops it. The draft pin can be grabbed
  // again and dragged elsewhere. ⌘/Ctrl-press quick-marks + arms. It stays a draft until the
  // reviewer writes (Phase 5) or presses Esc.
  let dragging = false;
  catch_.addEventListener('pointerdown', (e) => {
    if (placing) { e.preventDefault(); placePinAt(e.clientX, e.clientY); dragging = true; }
    else if (e.metaKey || e.ctrlKey) { e.preventDefault(); armPlacing(); placePinAt(e.clientX, e.clientY); dragging = true; }
  });
  $('pins').addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.pin--draft')) return;   // re-grab the existing draft pin to move it
    if (!placing) armPlacing();
    e.preventDefault(); dragging = true;
  });
  const onPinMove = (e) => { if (dragging && placing) placePinAt(e.clientX, e.clientY); };
  const onPinUp = () => { dragging = false; };
  window.addEventListener('pointermove', onPinMove);
  window.addEventListener('pointerup', onPinUp);
  // moving focus into the composer form (Phase 5) = satisfied with the placement
  root.querySelector('.rpane[data-pane="compose"]').addEventListener('focusin', () => { if (placing) endPlacing(); });
  const onEscKey = (e) => { if (e.key === 'Escape' && placing) { const p = $('pins').querySelector('.pin--draft'); if (p) p.remove(); endPlacing(); } };
  window.addEventListener('keydown', onEscKey);

  // Right rail is a fixed column on wide screens and a slide-over sheet below 1100px; this
  // controls the slide-over (a no-op visually when the rail is docked).
  const rail = $('rightrail'), railBtn = $('railtoggle');
  function openRail(on) { rail.classList.toggle('is-open', on !== false); railBtn.setAttribute('aria-expanded', String(on !== false)); }
  railBtn.addEventListener('click', () => openRail(!rail.classList.contains('is-open')));

  // right-rail panes
  root.querySelectorAll('.rseg').forEach((s) => s.addEventListener('click', () => {
    root.querySelectorAll('.rseg').forEach((x) => { x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false'); });
    s.classList.add('is-active'); s.setAttribute('aria-selected', 'true');
    root.querySelectorAll('.rpane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === s.dataset.pane));
    openRail(true);   // on narrow screens the rail is a slide-over — reveal it when a tab is chosen
  }));

  // ---- Phase 4: real pins (canvas + list) · count/nav · Teams/Resolved filter ----
  const comments = ctx.comments || [];
  const myTeam = getSession().team || '';
  const isAdmin = myTeam === ADMIN_TEAM;
  let showTeams = false, showResolved = false, navIdx = -1;
  const collapsedTeams = new Set();   // PINS list: teams the user has collapsed (persists across re-renders)
  const ACTION_KEY = '__actionable__';   // reserved collapse key for the pulled-to-top Actionable group
  const teamStatusOf = (c) => c.teamStatus || 'to_be_initiated';
  // on-page rule (mirrors overlay.js): hide disregarded only. A deployed fix stays pinned until the
  // raiser CONFIRMS it (so pending-confirmation is actionable on-page); the confirmed/resolved ones
  // are gated behind the Resolved quick-toggle in visibleRoots (not permanently hidden here).
  const onPage = (c) => teamStatusOf(c) !== 'disregarded';
  // "Actionable" = a visible root awaiting THIS viewer's action on the page: a deployed fix to
  // confirm (raised by my team, or any when admin), a clarification directed to me, or a ticket
  // Builder bounced back to my team to resubmit. Surfaced in its own top group in the PINS list.
  const isActionable = (c) => {
    const st = teamStatusOf(c), mine = (c.team || '') === myTeam, toMe = (c.toTeam || '') === myTeam;
    if (st === 'deployed_live') return !c.bugFixConfirmed && (isAdmin || mine);
    if (st === 'needs_clarification') return isAdmin || toMe;
    if (st === 'reopened') return mine;
    return false;
  };
  // Filter facets (4b) — empty set = "all". AND-composed with the left-rail quick toggles.
  const fStatus = new Set(), fType = new Set(), fAttr = new Set();
  let fSearch = '', fDirection = 'all', fSort = 'new';
  const hasReplies = (c) => comments.some((r) => r.parentId === c.id);
  function visibleRoots() {
    const out = comments.filter((c) => !c.parentId).filter(onPage).filter((c) => {
      if (!isAdmin && (c.team || '') !== myTeam && !showTeams) return false;       // Mine vs Teams
      const st = teamStatusOf(c);
      // explicit Status facet wins; otherwise the Resolved quick-toggle governs CONFIRMED fixes
      // only — a deployed fix still pending the raiser's confirmation stays on-page (actionable).
      if (fStatus.size) { if (!fStatus.has(st)) return false; }
      else if (st === 'deployed_live' && c.bugFixConfirmed && !showResolved) return false;
      if (fType.size && !fType.has(c.commentType || 'general')) return false;
      if (fDirection === 'from' && (c.team || '') !== myTeam) return false;
      if (fDirection === 'to' && (c.toTeam || '') !== myTeam) return false;
      if (fAttr.has('shot') && !(c.imageId || c.viewportImageId)) return false;
      if (fAttr.has('replies') && !hasReplies(c)) return false;
      if (fAttr.has('mine') && (c.team || '') !== myTeam) return false;
      if (fSearch) {
        const hay = ((c.summary || '') + ' ' + (c.comment || '') + ' ' + ((c.anchor && c.anchor.snippet) || '') + ' ' + (c.ticket || '')).toLowerCase();
        if (hay.indexOf(fSearch) === -1) return false;
      }
      return true;
    });
    const ts = (c) => c.createdAt || '';
    const seq = (c) => c.pageSeq || 0;
    if (fSort === 'old') out.sort((a, b) => (ts(a) < ts(b) ? -1 : 1));
    else if (fSort === 'seq') out.sort((a, b) => seq(a) - seq(b));
    // Resolved ON = "show this page's whole history": run from the FIRST ticket raised on the page
    // onward (pageSeq, then age) instead of newest-first, so the reinstated resolved pins slot into
    // sequence rather than piling up after the live ones. Pin numbers can repeat — pageSeq restarts
    // once a page clears its open bugs — and that is expected here.
    else if (showResolved) out.sort((a, b) => seq(a) - seq(b) || (ts(a) < ts(b) ? -1 : 1));
    else out.sort((a, b) => (ts(a) > ts(b) ? -1 : 1));
    return out;
  }
  // resolve a record's anchor INSIDE the canvas iframe (same page, at the canvas width) → canvas px
  function anchorXY(rec) {
    const a = rec.anchor || {};
    try {
      const d = frame.contentDocument; const el = a.selector ? d.querySelector(a.selector) : null;
      if (el) {
        const vis = el.checkVisibility ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : (el.offsetParent !== null);
        if (!vis) return null;
        const r = el.getBoundingClientRect(); // iframe has scrolling:no + full height → rect is document-space
        return { x: r.left + ((a.xPct || 0) / 100) * r.width, y: r.top + ((a.yPct || 0) / 100) * r.height };
      }
    } catch {}
    if (a.pageX != null) return { x: a.pageX, y: a.pageY };
    return null;
  }
  const cidSel = (id) => '.pin[data-cid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]';
  function renderHudPins() {
    const layer = $('pins');
    layer.querySelectorAll('.pin[data-cid]').forEach((el) => el.remove());   // keep the draft pin
    visibleRoots().forEach((rec, i) => {
      const xy = anchorXY(rec); if (!xy) return;
      const pin = document.createElement('button');
      pin.className = 'pin'; pin.type = 'button'; pin.dataset.cid = rec.id;
      pin.textContent = String(rec.pageSeq || (i + 1));
      const tc = TEAM_COLORS[rec.team || ''];
      if (tc) { pin.style.background = tc[0]; pin.style.color = tc[1]; pin.style.borderColor = tc[1]; }
      pin.style.left = xy.x + 'px'; pin.style.top = xy.y + 'px';
      const dot = document.createElement('span'); dot.className = 'pkhud-pindot';
      dot.style.background = 'var(' + (STATUS_COLORS[teamStatusOf(rec)] || STATUS_COLORS.to_be_initiated) + ')';
      pin.appendChild(dot);
      pin.addEventListener('click', (e) => { e.stopPropagation(); selectPin(rec.id); });
      layer.appendChild(pin);
    });
  }
  // CSP: the host enforces `style-src 'self'`, which drops `style=` attributes. Team/status
  // colours are emitted as data-attrs and applied here via CSSOM, which CSP does not police.
  function paintDynamic(scope) {
    const r = scope || root;
    r.querySelectorAll('[data-pk-bg]').forEach((el) => { el.style.background = el.dataset.pkBg; });
    r.querySelectorAll('[data-pk-fg2]').forEach((el) => { el.style.color = el.dataset.pkFg2; });
  }
  function renderList() {
    const pane = root.querySelector('.rpane[data-pane="pins"]');
    const vs = visibleRoots();
    if (!vs.length) { pane.innerHTML = '<div class="rpane-empty">No comments on this page yet.</div>'; return; }
    // "Actionable" is pulled to the top — every visible root awaiting THIS viewer's action, listed
    // above the team groups so the team lands on what to act on first (incl. Deployed – Pending
    // Confirmation). Remaining pins group by the raising team below it. Numbering stays keyed to
    // rec.pageSeq / position in `vs`, so list numbers still match the canvas pins across groups.
    const actionable = []; const order = []; const groups = {};
    vs.forEach((rec, i) => {
      const item = { rec: rec, n: rec.pageSeq || (i + 1) };
      if (isActionable(rec)) { actionable.push(item); return; }
      const team = rec.team || '—';
      if (!groups[team]) { groups[team] = []; order.push(team); }
      groups[team].push(item);
    });
    // A pin row keeps its raising-team colour on the number chip regardless of which group it sits in.
    const pinRow = ({ rec, n }) => {
      const tc = TEAM_COLORS[rec.team || '']; const bg = tc ? tc[0] : 'var(--pk-red)', fg = tc ? tc[1] : 'var(--pk-on-accent)';
      const sum = rec.summary || renderSummary(rec.commentType, rec.templateFields, rec.comment) || '(no summary)';
      const st = teamStatusOf(rec).replace(/_/g, ' ');
      return '<li class="pkhud-pli" data-cid="' + esc(rec.id) + '"><span class="pkhud-pli-n" data-pk-bg="' + esc(bg) + '" data-pk-fg2="' + esc(fg) + '">' + n + '</span>'
        + '<span class="pkhud-pli-b"><span class="pkhud-pli-t">' + esc(sum) + '</span><span class="pkhud-pli-m">' + esc(st) + '</span></span></li>';
    };
    let html = '';
    if (actionable.length) {
      const collapsed = collapsedTeams.has(ACTION_KEY);
      html += '<div class="pkhud-tgroup pkhud-tgroup--action' + (collapsed ? ' is-collapsed' : '') + '" data-team="' + ACTION_KEY + '">'
        + '<button type="button" class="pkhud-tghead" aria-expanded="' + String(!collapsed) + '">'
        + '<svg class="pkhud-tgchev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
        + '<svg class="pkhud-tgbolt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L3 14h7l-1 8 10-12h-7z"/></svg>'
        + '<span class="pkhud-tgname">Actionable</span>'
        + '<span class="pkhud-tgcount">' + actionable.length + '</span>'
        + '</button><ul class="pkhud-plist">' + actionable.map(pinRow).join('') + '</ul></div>';
    }
    html += order.map((team) => {
      const tc = TEAM_COLORS[team]; const bg = tc ? tc[0] : 'var(--pk-red)';
      const collapsed = collapsedTeams.has(team);
      return '<div class="pkhud-tgroup' + (collapsed ? ' is-collapsed' : '') + '" data-team="' + esc(team) + '">'
        + '<button type="button" class="pkhud-tghead" aria-expanded="' + String(!collapsed) + '">'
        + '<svg class="pkhud-tgchev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
        + '<span class="pkhud-tgdot" data-pk-bg="' + esc(bg) + '"></span>'
        + '<span class="pkhud-tgname">' + esc(team) + '</span>'
        + '<span class="pkhud-tgcount">' + groups[team].length + '</span>'
        + '</button><ul class="pkhud-plist">' + groups[team].map(pinRow).join('') + '</ul></div>';
    }).join('');
    pane.innerHTML = html;
    paintDynamic(pane);   // CSP: colour the pin numbers + team dots via CSSOM
    pane.querySelectorAll('.pkhud-pli').forEach((li) => li.addEventListener('click', () => selectPin(li.dataset.cid)));
    pane.querySelectorAll('.pkhud-tghead').forEach((h) => h.addEventListener('click', () => {
      const g = h.closest('.pkhud-tgroup'); const team = g.dataset.team;
      if (collapsedTeams.has(team)) collapsedTeams.delete(team); else collapsedTeams.add(team);
      const now = collapsedTeams.has(team);
      g.classList.toggle('is-collapsed', now); h.setAttribute('aria-expanded', String(!now));
    }));
  }
  function updateNav() {
    const n = visibleRoots().length;
    $('count').textContent = n + (n === 1 ? ' pin' : ' pins');
    $('pos').textContent = (n ? (navIdx < 0 ? 1 : navIdx + 1) : 0) + ' / ' + n;
  }
  function locatePin(rec) {
    const xy = anchorXY(rec); if (!xy) return;
    const s = scale.getBoundingClientRect(), r = cv.getBoundingClientRect();
    cv.scrollLeft += (s.left + xy.x * z) - (r.left + r.width / 2);
    cv.scrollTop += (s.top + xy.y * z) - (r.top + r.height / 2);
    const pin = $('pins').querySelector(cidSel(rec.id));
    if (pin) { pin.classList.remove('is-located'); void pin.offsetWidth; pin.classList.add('is-located'); }
  }
  function selectPin(id) {
    const vs = visibleRoots(); const idx = vs.findIndex((c) => c.id === id); if (idx < 0) return;
    navIdx = idx; locatePin(vs[idx]); updateNav();
    root.querySelectorAll('.pkhud-pli').forEach((li) => li.classList.toggle('is-sel', li.dataset.cid === id));
    renderThread(vs[idx]);
    root.querySelector('.rseg[data-pane="thread"]').click();
  }

  /* ---- arrival from a dashboard "Open Pin" (…#c=<id>) ----
   * overlay.js resolves the deep link to a ROOT pin on this page and passes it as ctx.focusId.
   * Landing at the top of a long page and leaving the reviewer to find the pin themselves is the
   * whole reason the link is worth clicking, so: centre the canvas on it, pulse it (the same
   * .is-located animation the ‹ › nav uses) and open its thread — once, on the first paint after
   * the iframe lays out, since pin geometry does not exist before then.
   * A pin the filters hide is still shown: the deep link is an explicit request for THAT pin, so
   * the two visibility toggles it could be hiding behind are turned on rather than failing quietly
   * (mirrors the old overlay, which force-shows a deep-linked pin even when terminal). */
  let focusPending = ctx.focusId || null;
  function focusDeepLink() {
    if (!focusPending) return;
    const rec = comments.find((c) => c.id === focusPending && !c.parentId);
    if (!rec) { focusPending = null; return; }          // not on this page — nothing to focus
    if (!visibleRoots().some((c) => c.id === rec.id)) {
      if (!isAdmin && (rec.team || '') !== myTeam && !showTeams) $('teams').click();
      if (!visibleRoots().some((c) => c.id === rec.id) && !showResolved) $('resolved').click();
    }
    if (!visibleRoots().some((c) => c.id === rec.id)) { focusPending = null; return; }
    focusPending = null;
    selectPin(rec.id);
  }

  // ---- thread pane: read the comment, see/post replies, confirm a deployed fix ----
  const STATUS_LABEL = { to_be_initiated: 'To be initiated', in_progress: 'In progress',
    deployed_live: 'Deployed live', reopened: 'Reopened', needs_clarification: 'Need clarity',
    disregarded: 'Invalid — closed' };
  let threadId = null;
  function renderThread(rec) {
    threadId = rec ? rec.id : null;
    const pane = root.querySelector('.rpane[data-pane="thread"]');
    if (!rec) { pane.innerHTML = '<div class="rpane-empty">Select a pin to open its thread.</div>'; return; }
    const st = teamStatusOf(rec);
    const sum = rec.summary || renderSummary(rec.commentType, rec.templateFields, rec.comment) || '(no summary)';
    const reps = comments.filter((c) => c.parentId === rec.id).sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? -1 : 1));
    const when = (v) => { try { return new Date(v).toLocaleString(); } catch { return v || ''; } };
    // A deployed fix is confirmed by the RAISER (their team), and only once.
    const canConfirm = st === 'deployed_live' && !rec.bugFixConfirmed && (isAdmin || (rec.team || '') === myTeam);
    pane.innerHTML =
      '<div class="pkth">' +
        '<div class="th-head">' +
          '<button class="th-back" data-th="back">← Pins</button>' +
          (rec.ticket ? '<span class="th-tk">#' + esc(rec.ticket) + '</span>' : '') +
          '<span class="th-st"><i data-pk-bg="var(' + (STATUS_COLORS[st] || '--pk-muted') + ')"></i>' + esc(STATUS_LABEL[st] || st) + '</span>' +
        '</div>' +
        // title row: the summary, with the dashboard hand-off pinned to the right margin
        '<div class="th-sumrow">' +
          '<div class="th-sum">' + esc(sum) + '</div>' +
          '<button class="th-dash" data-th="dash" title="Open this ticket in the dashboard">Open in dashboard' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="th-meta">' + esc(rec.team || '—') + ' → ' + esc(rec.toTeam || ADMIN_TEAM) + ' · ' + esc(when(rec.createdAt)) + (rec.pageSeq ? ' · pin ' + rec.pageSeq : '') + '</div>' +
        // the body is the reviewer's own words; drop it when the summary already IS those words
        // (a plain comment with no template fields renders a summary identical to the body).
        (rec.comment && rec.comment.trim() !== String(sum).trim() ? '<div class="th-body">' + esc(rec.comment) + '</div>' : '') +
        '<div class="th-reps">' +
          '<span class="fl">Replies' + (reps.length ? ' (' + reps.length + ')' : '') + '</span>' +
          (reps.length ? reps.map((r) => '<div class="th-rep"><span class="th-rep-t">' + esc(r.comment || '') + '</span>' +
            '<span class="th-rep-m">' + esc(r.team || '—') + ' · ' + esc(when(r.createdAt)) + '</span></div>').join('')
            : '<span class="th-none">No replies yet.</span>') +
          '<textarea class="pkta" data-th="text" placeholder="Reply… (⌘/Ctrl+Enter to send)"></textarea>' +
          '<div class="cerr" data-th="err"></div>' +
          '<div class="th-acts">' +
            '<button class="btool" data-th="send">Post reply</button>' +
            /* Edit is offered on the same rule the Old overlay uses and the Worker enforces:
             * Builder at any status, the raising team only while Builder has not started it. When
             * that is false there is no button at all rather than one that explains itself after
             * the click — the answer is the same every time, so asking is theatre. */
            ((ctx.canEditComment && ctx.canEditComment(rec)) ? '<button class="btool" data-th="edit">Edit</button>' : '') +
            (canConfirm ? '<button class="btool btool--primary" data-th="confirm">Confirm fix</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    paintDynamic(pane);   // CSP: colour the status dot in the thread header via CSSOM
  }
  // one delegated handler for every thread action
  root.querySelector('.rpane[data-pane="thread"]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-th]'); if (!b) return;
    const act = b.dataset.th, pane = root.querySelector('.rpane[data-pane="thread"]');
    const rec = comments.find((c) => c.id === threadId);
    if (act === 'back') { root.querySelector('.rseg[data-pane="pins"]').click(); return; }
    if (act === 'dash') { location.href = homeUrl() + '#c=' + encodeURIComponent(threadId || ''); return; }
    if (!rec) return;
    const err = pane.querySelector('[data-th="err"]');
    if (act === 'send') {
      const ta = pane.querySelector('[data-th="text"]'); const txt = String(ta.value || '').trim();
      if (!txt) { ta.focus(); return; }
      b.disabled = true;
      try { const res = await ctx.postReply(rec, txt); if (res) { comments.push(res); renderThread(rec); refreshPins(); } }
      catch (ex) { err.textContent = 'Could not post — ' + ((ex && ex.message) || 'error'); b.disabled = false; }
      return;
    }
    if (act === 'edit') {
      if (!ctx.updateComment) return;
      if (!(await confirmLeaveComposer())) return;
      loadIntoComposer(null, rec);
      return;
    }
    if (act === 'confirm') {
      b.disabled = true;
      try {
        const upd = await ctx.confirmFix(rec.id);
        if (upd) { const i = comments.findIndex((c) => c.id === upd.id); if (i >= 0) comments[i] = upd; renderThread(comments[i] || rec); refreshPins(); }
      } catch (ex) { err.textContent = 'Could not confirm — ' + ((ex && ex.message) || 'error'); b.disabled = false; }
    }
  });
  // ⌘/Ctrl+Enter sends the reply
  root.querySelector('.rpane[data-pane="thread"]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.matches('[data-th="text"]')) {
      e.preventDefault();
      const send = root.querySelector('.rpane[data-pane="thread"] [data-th="send"]'); if (send) send.click();
    }
  });
  function stepPin(d) { const vs = visibleRoots(); if (!vs.length) return; navIdx = ((navIdx < 0 ? 0 : navIdx) + d + vs.length) % vs.length; selectPin(vs[navIdx].id); }
  function refreshPins() { renderHudPins(); renderList(); updateNav(); refreshFacetCounts(); }
  $('prev').addEventListener('click', () => stepPin(-1));
  $('next').addEventListener('click', () => stepPin(1));
  $('teams').addEventListener('click', function () { showTeams = !showTeams; this.classList.toggle('is-on', showTeams); this.setAttribute('aria-pressed', String(showTeams)); refreshPins(); });
  $('resolved').addEventListener('click', function () { showResolved = !showResolved; this.classList.toggle('is-on', showResolved); this.setAttribute('aria-pressed', String(showResolved)); refreshPins(); });
  // ---- Filter panel (4b) ----
  const fly = $('flyfilter');
  $('filter').addEventListener('click', (e) => { e.stopPropagation(); $('filter').setAttribute('aria-expanded', String(fly.classList.toggle('is-open'))); });
  fly.addEventListener('click', (e) => e.stopPropagation());
  const onDocClose = (e) => { if (!e.target.closest('#pkhud-flyfilter,#pkhud-filter')) { fly.classList.remove('is-open'); $('filter').setAttribute('aria-expanded', 'false'); } };
  // Escape closes the filter panel and returns focus to its trigger
  const onFilterEsc = (e) => { if (e.key === 'Escape' && fly.classList.contains('is-open')) { fly.classList.remove('is-open'); $('filter').setAttribute('aria-expanded', 'false'); $('filter').focus(); } };
  window.addEventListener('keydown', onFilterEsc);
  document.addEventListener('click', onDocClose);
  // type facet chips come from the shared vocabulary
  $('ftypes').innerHTML = COMMENT_TYPES.map((t) => '<button class="fbtn" data-v="' + esc(t.value) + '">' + esc(t.label) + ' <i data-n></i></button>').join('');
  const facetSet = { status: fStatus, type: fType, attr: fAttr };
  fly.querySelectorAll('.fchips').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('.fbtn'); if (!b) return;
    const set = facetSet[box.dataset.facet];
    if (b.classList.toggle('is-on')) set.add(b.dataset.v); else set.delete(b.dataset.v);
    refreshPins();
  }));
  fly.querySelectorAll('.fseg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('.fsegb'); if (!b) return;
    seg.querySelectorAll('.fsegb').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active');
    if (seg.dataset.seg === 'direction') fDirection = b.dataset.v; else fSort = b.dataset.v;
    refreshPins();
  }));
  $('fsearch').addEventListener('input', function () { fSearch = String(this.value || '').trim().toLowerCase(); refreshPins(); });
  $('fclear').addEventListener('click', () => {
    fStatus.clear(); fType.clear(); fAttr.clear(); fSearch = ''; fDirection = 'all'; fSort = 'new';
    fly.querySelectorAll('.fbtn.is-on').forEach((b) => b.classList.remove('is-on'));
    fly.querySelectorAll('.fseg').forEach((seg) => seg.querySelectorAll('.fsegb').forEach((x, i) => x.classList.toggle('is-active', i === 0)));
    $('fsearch').value = ''; refreshPins();
  });
  // live per-option counts + the result summary; the Filter tool lights when any facet is active
  function refreshFacetCounts() {
    const pool = comments.filter((c) => !c.parentId).filter(onPage);
    fly.querySelectorAll('.fchips[data-facet="status"] .fbtn').forEach((b) => {
      const n = pool.filter((c) => teamStatusOf(c) === b.dataset.v).length;
      const i = b.querySelector('i'); if (i) i.textContent = n ? String(n) : '';
    });
    fly.querySelectorAll('.fchips[data-facet="type"] .fbtn').forEach((b) => {
      const n = pool.filter((c) => (c.commentType || 'general') === b.dataset.v).length;
      const i = b.querySelector('i'); if (i) i.textContent = n ? String(n) : '';
    });
    const shown = visibleRoots().length;
    $('fcount').textContent = 'Showing ' + shown + ' Filtered of ' + pool.length + ' Total Results';
    const active = !!(fStatus.size || fType.size || fAttr.size || fSearch || fDirection !== 'all');
    $('filter').classList.toggle('is-on', active);
  }
  renderList(); updateNav(); refreshFacetCounts();   // list renders now; canvas pins once the iframe loads

  // ---- Phase 5: docked composer → real drafts/persist (via ctx callbacks into overlay.js) ----
  // A stable-ish CSS path for an element INSIDE the canvas iframe (mirrors overlay.js cssPath:
  // id / [data-cms] short-circuit, else tag + :nth-of-type, capped at 6 levels).
  function cssPathIn(el, doc) {
    if (!el || el.nodeType !== 1) return '';
    const parts = []; let node = el, depth = 0;
    while (node && node.nodeType === 1 && node !== doc.body && depth < 6) {
      if (node.id) { parts.unshift('#' + (window.CSS && CSS.escape ? CSS.escape(node.id) : node.id)); break; }
      const cms = node.getAttribute('data-cms');
      if (cms) { parts.unshift('[data-cms="' + cms + '"]'); break; }
      let sel = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
      }
      parts.unshift(sel); node = node.parentElement; depth++;
    }
    return parts.join(' > ');
  }
  let draftAnchor = null, draftEl = null, draftImage = '', draftText = '';
  // Resolve the element under a canvas point and build the record `anchor` (same shape as Old).
  function captureAnchor(x, y) {
    draftAnchor = null; draftEl = null;
    try {
      const d = frame.contentDocument; if (!d) return;
      // iframe has scrolling:no and is sized to the full page → viewport coords == document coords
      const el = d.elementFromPoint(x, y) || d.body;
      const r = el.getBoundingClientRect();
      draftEl = el;
      draftText = textAtPoint(d, x, y, el);   // the line actually under the pin, not the container's copy
      draftAnchor = {
        selector: cssPathIn(el, d),
        snippet: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        tag: el.tagName.toLowerCase(),
        xPct: r.width ? Math.round(((x - r.left) / r.width) * 100) : 0,
        yPct: r.height ? Math.round(((y - r.top) / r.height) * 100) : 0,
        pageX: Math.round(x), pageY: Math.round(y),
        docHeight: CH, viewportW: CW,
      };
    } catch {}
    renderCFields(); renderSelected(); updateCNote();
  }

  // Direct-to (lead control) — enabled teams + Builder.
  const toSel = $('to');
  toSel.innerHTML = (ENABLED_TEAMS || []).concat([ADMIN_TEAM])
    .filter((t, i, a) => t && a.indexOf(t) === i)
    .map((t) => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
  const defaultTeamFor = (type) => (type === 'copy-fix' ? 'Content' : ADMIN_TEAM);
  let cType = (COMMENT_TYPES[0] && COMMENT_TYPES[0].value) || 'general', toTouched = false;
  toSel.addEventListener('change', () => { toTouched = true; });
  const setTo = (v) => { if ([...toSel.options].some((o) => o.value === v)) toSel.value = v; };

  /* Select a team that may no longer be selectable.
   *
   * `setTo` silently does nothing when the value is not in the list, which is right for a NEW pin
   * — it falls back to the default for the change type. It is dangerous when loading an existing
   * comment: a team that has since been deleted, disabled or renamed is simply not among the
   * options, so the dropdown keeps whatever was selected before and Save re-points the comment at
   * a team nobody chose. Silently re-tagging a comment is the exact failure this whole feature
   * exists to prevent, so the old value is re-added and named as gone instead. */
  function setToPreserving(v) {
    const want = v || ADMIN_TEAM;
    if (![...toSel.options].some((o) => o.value === want)) {
      const opt = document.createElement('option');
      opt.value = want; opt.textContent = want + ' (no longer available)';
      opt.dataset.stale = '1';
      toSel.insertBefore(opt, toSel.firstChild);
    }
    toSel.value = want;
  }
  setTo(defaultTeamFor(cType));

  // Comment-type chips
  $('ctypes').innerHTML = COMMENT_TYPES.map((t) =>
    '<button class="ctype' + (t.value === cType ? ' is-active' : '') + '" type="button" data-t="' + esc(t.value) + '">' + esc(t.label) + '</button>').join('');
  $('ctypes').addEventListener('click', (e) => {
    const b = e.target.closest('.ctype'); if (!b) return;
    cType = b.dataset.t;
    $('ctypes').querySelectorAll('.ctype').forEach((x) => x.classList.toggle('is-active', x.dataset.t === cType));
    if (!toTouched) setTo(defaultTeamFor(cType));
    renderCFields(); syncCommentLabel(); renderShotEmpty();
  });

  // Template fields for the active type. Auto-filled fields (autoFill, plus `currentText`) are
  // populated from the pinned element and rendered DISABLED — the editable ask is "Change to".
  const clean = (t) => String(t || '').trim().replace(/\s+/g, ' ');
  // Pinning a big <section> used to auto-fill ~300 chars of page copy, which is useless to a
  // builder. Resolve the text the reviewer actually pointed at: the caret hit-test gives the exact
  // text node; failing that, walk down to the smallest descendant that still holds the text.
  function textAtPoint(doc, x, y, el) {
    try {
      let node = null;
      if (doc.caretRangeFromPoint) { const rg = doc.caretRangeFromPoint(x, y); node = rg && rg.startContainer; }
      else if (doc.caretPositionFromPoint) { const cp = doc.caretPositionFromPoint(x, y); node = cp && cp.offsetNode; }
      if (node) {
        const host = node.nodeType === 3 ? node.parentElement : node;
        const t = clean(host && host.textContent);
        if (t && t.length <= 400) return t;                      // a genuine text-bearing element
        if (node.nodeType === 3 && clean(node.data)) return clean(node.data).slice(0, 300);
      }
    } catch {}
    // fallback: descend while a single child still carries all of the text
    try {
      let cur = el, guard = 0;
      while (cur && guard++ < 8) {
        const kids = Array.from(cur.children).filter((k) => clean(k.textContent));
        if (kids.length !== 1 || clean(kids[0].textContent) !== clean(cur.textContent)) break;
        cur = kids[0];
      }
      return clean(cur && cur.textContent).slice(0, 300);
    } catch {}
    return clean(el && el.textContent).slice(0, 300);
  }
  const autoValueFor = (key) => {
    if (!draftEl) return '';
    try {
      if (key === 'currentText') return draftText || clean(draftEl.textContent).slice(0, 300);
      if (key === 'currentUrl') { const a = draftEl.closest('a[href]'); return a ? a.getAttribute('href') : ''; }
      if (key === 'currentImage') { const i = draftEl.closest('img') || draftEl.querySelector('img'); return i ? (i.getAttribute('src') || '') : ''; }
    } catch {}
    return '';
  };
  const isAutoField = (f) => !!f.autoFill || f.key === 'currentText';
  // The Selected Element block IS the auto-captured `currentText`, so copy-fix never renders it
  // as a field — the value is still submitted, it just has one home instead of two.
  function renderSelected() {
    const el = $('csel'); if (!el) return;
    const t = draftText || (draftEl ? clean(draftEl.textContent).slice(0, 300) : '');
    el.textContent = t || 'Place a pin to select an element.';
    el.classList.toggle('is-empty', !t);
  }
  function renderCFields() {
    const fields = (TYPE_FIELDS[cType] || []).filter((f) => f.key !== 'currentText');
    $('cfields').innerHTML = fields.map((f) => {
      const auto = isAutoField(f);
      const lab = '<span class="fl">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + (auto ? '<span class="auto">auto-filled</span>' : '') + '</span>';
      const ctl = auto
        ? '<input class="cinp" data-k="' + esc(f.key) + '" value="' + esc(autoValueFor(f.key)) + '" disabled>'
        : '<input class="cinp" data-k="' + esc(f.key) + '" placeholder="' + esc(f.placeholder || '') + '">';
      return '<div class="fg">' + lab + ctl + '</div>';
    }).join('');
  }
  function syncCommentLabel() {
    const l = $('clabel-comment'); if (l) l.textContent = cType === 'general' ? 'Comments' : 'Optional Comments';
  }
  renderCFields(); renderSelected(); syncCommentLabel();

  // paste-to-attach a screenshot (stored as a dataURL on the draft; uploaded by submitAll)
  const shotBox = $('cshot');
  // The empty state states whether the attachment is required for the ACTIVE type, so the
  // rule is visible while composing rather than only on save (SCREENSHOT_TYPES in vocab.js).
  function renderShotEmpty() {
    if (draftImage) return;
    const req = needsScreenshot(cType);
    shotBox.classList.toggle('is-req', req);
    shotBox.textContent = req
      ? 'Paste (⌘V) a screenshot — required for this change type.'
      : 'Paste (⌘V) a screenshot to attach.';
  }
  const onPaste = (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.type && it.type.indexOf('image') === 0) {
        const file = it.getAsFile(); if (!file) continue;
        const fr = new FileReader();
        fr.onload = () => { draftImage = String(fr.result || ''); shotBox.innerHTML = '<img src="' + draftImage + '" alt="">'; };
        fr.readAsDataURL(file); e.preventDefault(); return;
      }
    }
  };
  window.addEventListener('paste', onPaste);

  function updateCNote() { $('cnote').textContent = draftAnchor ? ('Pinned to <' + draftAnchor.tag + '>') : 'Place a pin on the canvas to start.'; }
  function updateDraftCount(n) {
    const el = $('draftcount'); el.hidden = !n; el.querySelector('b').textContent = String(n);
    const tab = $('draftn'); if (tab) { tab.hidden = !n; tab.textContent = String(n); }
    renderDrafts();
  }

  /* ---- Drafts pane ---------------------------------------------------------------------------
   * Reads straight from overlay.js's draft array through ctx, so this list and the Old tray are
   * two views of one batch rather than two batches. Edit PULLS a draft back into the composer
   * (removing it from the batch); Remove drops it. */
  function renderDrafts() {
    const pane = root.querySelector('.rpane[data-pane="drafts"]');
    if (!pane) return;
    const list = (ctx.listDrafts && ctx.listDrafts()) || [];
    if (!list.length) {
      pane.innerHTML = '<div class="rpane-empty">Nothing pending. Saved pins wait here until you submit.</div>';
      return;
    }
    const typeLabel = (v) => (COMMENT_TYPES.find((t) => t.value === v) || {}).label || 'General';
    pane.innerHTML = list.map((d) =>
      '<div class="dft' + (d.error ? ' is-failed' : '') + '">' +
        '<div class="dft-b">' +
          '<div class="dft-s" title="' + esc(d.summary || '') + '">' + esc(d.summary || ('Pin ' + d.n)) + '</div>' +
          '<div class="dft-m">' + esc(d.error
            ? 'Failed: ' + d.error
            : typeLabel(d.commentType) + ' · to ' + (d.toTeam || ADMIN_TEAM) + (d.hasShot ? ' · shot' : '')) + '</div>' +
        '</div>' +
        '<div class="dft-a">' +
          '<button type="button" class="dft-btn" data-df="edit" data-id="' + esc(d.draftId) + '">Edit</button>' +
          '<button type="button" class="dft-btn is-danger" data-df="del" data-id="' + esc(d.draftId) + '">Remove</button>' +
        '</div>' +
      '</div>').join('') +
      '<div class="dft-foot"><button type="button" class="dft-btn is-danger" data-df="clear">Discard all</button></div>';
  }

  root.querySelector('.rpane[data-pane="drafts"]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-df]'); if (!b) return;
    const act = b.dataset.df;
    if (act === 'clear') {
      const n = (ctx.draftCount && ctx.draftCount()) || 0;
      if (!n) return;
      if (!(await ask('Discard all ' + n + ' pending pin(s)? They have not been submitted.',
        { title: 'Discard pending pins', confirmLabel: 'Discard', danger: true }))) return;
      let left = n;
      ((ctx.listDrafts && ctx.listDrafts()) || []).forEach((d) => { left = ctx.removeDraft ? ctx.removeDraft(d.draftId) : left; });
      updateDraftCount(left);
      return;
    }
    if (act === 'del') { updateDraftCount(ctx.removeDraft ? ctx.removeDraft(b.dataset.id) : 0); return; }
    if (act === 'edit') {
      if (!ctx.takeDraft) return;
      if (!(await confirmLeaveComposer())) return;
      const d = ctx.takeDraft(b.dataset.id);
      if (!d) return;
      updateDraftCount((ctx.draftCount && ctx.draftCount()) || 0);
      loadIntoComposer(d, null);
    }
  });
  renderShotEmpty();
  updateCNote(); updateDraftCount((ctx.draftCount && ctx.draftCount()) || 0);

  /* ---- composer modes -------------------------------------------------------------------------
   * The composer serves three: a NEW pin, a draft pulled back out of the batch, and an EDIT of a
   * comment that is already submitted. Only the last behaves differently on Save — it PUTs to
   * /comments/update instead of adding to the batch — so `editing` is the whole of the difference
   * and the banner is what tells the reviewer which one they are in.
   */
  let editing = null;          // the submitted record being edited, or null

  /* Falls back to the browser's own confirm when the host did not supply one — the HUD also runs
   * in the demo page, where there is no modal system to borrow. */
  const ask = (msg, opts) => (ctx.ask ? ctx.ask(msg, opts) : Promise.resolve(window.confirm(msg)));

  /** Warn before blowing away composer content that is not saved anywhere. */
  async function confirmLeaveComposer() {
    const dirty = editing || draftAnchor || String($('ccomment').value || '').trim();
    if (!dirty) return true;
    return editing
      ? ask('Discard the unsaved changes to this comment?', { title: 'Discard changes', confirmLabel: 'Discard', danger: true })
      : ask('The composer still has a pin that has not been saved to the batch. Replace it?', { title: 'Replace draft', confirmLabel: 'Replace', danger: true });
  }

  /** Fill the composer from a draft (`d`) or a submitted record (`rec`). */
  function loadIntoComposer(d, rec) {
    const src = d || rec || {};
    editing = rec || null;
    draftAnchor = src.anchor || null;
    draftEl = null;
    draftImage = (d && d.imageDataUrl) || '';
    draftText = (src.templateFields && src.templateFields.currentText) || '';
    cType = src.commentType || cType;
    toTouched = true;                       // an explicit team came with it; do not re-default it
    $('ctypes').querySelectorAll('.ctype').forEach((x) => x.classList.toggle('is-active', x.dataset.t === cType));
    renderCFields();
    const tf = src.templateFields || {};
    $('cfields').querySelectorAll('.cinp').forEach((i) => { i.value = tf[i.dataset.k] || ''; });
    $('ccomment').value = src.comment || '';
    setToPreserving(src.toTeam);
    if ($('ctest')) $('ctest').checked = !!src.isTest;
    renderSelected(); updateCNote(); renderEditBanner();
    /* A DRAFT still carries its pasted dataURL, so it can be shown again. A SUBMITTED comment
     * carries only an imageId — the bytes live on the Worker — and re-fetching them to fill a box
     * the reviewer is not editing would be a download per Edit click. Say what is attached
     * instead, and leave it attached: `updateComment` passes the existing ids straight through. */
    if (draftImage) shotBox.innerHTML = '<img src="' + draftImage + '" alt="">';
    else if (rec && rec.imageId) { shotBox.classList.remove('is-req'); shotBox.textContent = 'Screenshot attached — paste to replace it.'; }
    else renderShotEmpty();
    showCompose();
  }

  function renderEditBanner() {
    const pane = root.querySelector('.rpane[data-pane="compose"]');
    let bar = pane.querySelector('.cedit');
    $('csave').textContent = editing ? 'Save changes' : 'Save to batch';
    $('ccancel').hidden = !editing;
    if (!editing) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'cedit';
      pane.insertBefore(bar, pane.firstChild);
    }
    bar.innerHTML = 'Editing a submitted comment — saving replaces it.' +
      '<button type="button" data-ce="cancel">Cancel</button>';
  }
  root.querySelector('.rpane[data-pane="compose"]').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-ce="cancel"]')) return;
    if (!(await confirmLeaveComposer())) return;
    resetComposer();
  });
  $('ccancel').addEventListener('click', async () => {
    if (!(await confirmLeaveComposer())) return;
    resetComposer();
  });

  function resetComposer() {
    editing = null; renderEditBanner();
    // Drop any "no longer available" team carried in for an edit — it belongs to that record, not
    // to the next pin, and leaving it would offer a dead team on a fresh comment.
    toSel.querySelectorAll('option[data-stale]').forEach((o) => o.remove());
    draftAnchor = null; draftEl = null; draftImage = ''; draftText = '';
    renderShotEmpty();
    $('ccomment').value = ''; if ($('ctest')) $('ctest').checked = false; renderCFields(); renderSelected(); updateCNote();
    const p = $('pins').querySelector('.pin--draft'); if (p) p.remove();
    // Drop any lint verdict with the draft it described, and cancel an in-flight one — bumping the
    // token makes a late response no-op instead of painting a hint about a composer that is gone.
    lintToken++; clearTimeout(lintTimer);
    const lc = $('clint'); if (lc) { lc.hidden = true; lc.innerHTML = ''; }
    endPlacing();
  }

  /* ---- composer lint (Phase 5.2) --------------------------------------------------------
   * POST /lint scores the draft as it is typed and shows what is missing or vague. It is
   * ADVISORY: it never disables Save, never gates submit, and resolves to null on any failure
   * (no worker, local demo, AI hiccup) — in which case the strip simply stays hidden. A stale
   * response from a superseded keystroke is dropped via a monotonic token, so slow answers can
   * never overwrite a newer verdict.
   * -------------------------------------------------------------------------------------- */
  let lintToken = 0, lintTimer = null;
  const lintEl = () => $('clint');

  function paintLint(res) {
    const el = lintEl();
    if (!el) return;
    if (!res || res.score === 'ok' || !(res.issues || []).length) { el.hidden = true; el.innerHTML = ''; return; }
    const cls = res.score === 'missing' ? 'clint clint--missing' : 'clint clint--vague';
    const head = res.score === 'missing' ? 'Needs one more thing' : 'Could be clearer';
    el.className = cls;
    el.innerHTML =
      '<span class="clint-h">' + head + '</span>' +
      '<ul>' + res.issues.slice(0, 4).map((s) => '<li>' + esc(String(s)) + '</li>').join('') + '</ul>' +
      (res.suggestedRewrite
        ? '<div class="clint-fix">' + esc(res.suggestedRewrite) +
          '<br><button type="button" class="clint-apply" data-apply="1">Use this</button></div>'
        : '');
    el.hidden = false;
    const apply = el.querySelector('[data-apply]');
    if (apply) apply.addEventListener('click', () => {
      $('ccomment').value = res.suggestedRewrite;
      el.hidden = true;
      runLint();            // re-score what we just wrote, rather than assume it is now clean
    });
  }

  function runLint() {
    if (!ctx.lintDraft) return;
    const tf = {};
    $('cfields').querySelectorAll('.cinp').forEach((i) => { const v = String(i.value || '').trim(); if (v) tf[i.dataset.k] = v; });
    if (cType === 'copy-fix' && draftText) tf.currentText = draftText;
    const comment = String($('ccomment').value || '').trim();
    // Nothing typed yet is not a fault — don't scold an empty composer.
    if (!comment && !Object.keys(tf).length) { paintLint(null); return; }
    const mine = ++lintToken;
    ctx.lintDraft({ commentType: cType, templateFields: tf, comment, anchor: draftAnchor })
      .then((res) => { if (mine === lintToken) paintLint(res); })
      .catch(() => {});
  }
  const scheduleLint = () => { clearTimeout(lintTimer); lintTimer = setTimeout(runLint, 700); };
  $('ccomment').addEventListener('input', scheduleLint);
  // Template fields are re-rendered per comment type, so delegate from their container.
  $('cfields').addEventListener('input', scheduleLint);

  // Save to batch → hand a draft to overlay.js (same shape the Old tray/submitAll consumes)
  $('csave').addEventListener('click', async () => {
    const err = $('cerr'); err.textContent = '';
    if (!draftAnchor) { err.textContent = 'Place a pin on the canvas first.'; return; }
    const tf = {};
    $('cfields').querySelectorAll('.cinp').forEach((i) => { const v = String(i.value || '').trim(); if (v) tf[i.dataset.k] = v; });
    // Selected Element carries copy-fix's `currentText`; it has no input, so add it here.
    if (cType === 'copy-fix' && draftText) tf.currentText = draftText;
    const missing = (TYPE_FIELDS[cType] || []).filter((f) => f.required && !isAutoField(f) && !tf[f.key]);
    if (missing.length) { err.textContent = missing[0].label + ' is required.'; return; }
    const comment = String($('ccomment').value || '').trim();
    if (!comment && !Object.keys(tf).length) { err.textContent = 'Add a comment or fill the fields.'; return; }
    // MANDATORY SCREENSHOT for everything that is not a content swap (SCREENSHOT_TYPES in
    // vocab.js). The same gate runs in the Old composer's saveDraft - both UIs raise the
    // same records, so the rule cannot hold in only one of them.
    /* The screenshot requirement is satisfied by one that is ALREADY ATTACHED. When editing a
     * submitted comment the bytes live on the Worker and `draftImage` is empty by design — asking
     * for a fresh paste to fix a typo would mean re-screenshotting a page that may have changed
     * since, which is how an edit quietly replaces evidence. */
    if (needsScreenshot(cType) && !draftImage && !(editing && editing.imageId)) {
      err.textContent = 'A screenshot is required for this change type — paste one (⌘V) to continue.';
      return;
    }
    /* EDITING a submitted comment: straight to /comments/update, never into the batch. The batch
     * is for pins that do not exist yet; a comment that is already raised has an id, a thread and
     * possibly a Builder working on it, and queueing an edit behind "Submit all" would leave the
     * two silently out of step until somebody remembered to press it. */
    if (editing) {
      const btn = $('csave'); btn.disabled = true;
      try {
        const upd = await ctx.updateComment(editing, {
          comment, commentType: cType, templateFields: tf, toTeam: toSel.value || ADMIN_TEAM,
        });
        if (upd) {
          const i = comments.findIndex((c) => c.id === upd.id);
          if (i >= 0) comments[i] = upd; else comments.push(upd);
          const id = upd.id;
          resetComposer(); refreshPins();
          selectPin(id);                      // land back on the thread that was just changed
        }
      } catch (ex) {
        // The Worker enforces the same gate again, so "already started" can come back even though
        // the button was offered — the status can change while the composer is open.
        err.textContent = (ex && ex.message) === 'already started'
          ? 'Builder has already started this one, so it can no longer be edited.'
          : 'Could not save — ' + ((ex && ex.message) || 'error');
      }
      btn.disabled = false;
      return;
    }
    const draft = { anchor: draftAnchor, commentType: cType, templateFields: tf, comment,
      toTeam: toSel.value || ADMIN_TEAM, expectedOutcome: '', imageDataUrl: draftImage,
      isTest: !!($('ctest') && $('ctest').checked) };
    const n = ctx.saveDraft ? ctx.saveDraft(draft) : 0;
    updateDraftCount(n); resetComposer();
    root.querySelector('.rseg[data-pane="pins"]').click();
  });

  // Submit all → overlay.js runs the existing image-upload + batch POST, then hands back the saved records
  $('submit').addEventListener('click', async () => {
    if (!ctx.submitAll) return;
    const btn = $('submit'); btn.disabled = true;
    try {
      const res = await ctx.submitAll();
      if (res && res.comments) { comments.length = 0; res.comments.forEach((c) => comments.push(c)); refreshPins(); }
      updateDraftCount((ctx.draftCount && ctx.draftCount()) || 0);
      // The reason first, the count second — "1 draft failed" is a fact the reviewer cannot use.
      if (res && res.failed) {
        showSubmitError(res.error
          ? res.error + (res.failed > 1 ? ' (' + res.failed + ' drafts still pending.)' : ' Still pending.')
          : res.failed + ' draft(s) failed — still pending.');
        renderDrafts();
      }
    } catch (e) { showSubmitError('Submit failed — ' + ((e && e.message) || 'error')); }
    btn.disabled = false;
  });

  // A submit failure MUST be visible. `cerr` lives in the Compose panel, but Save-to-batch leaves the
  // rail on Pins — so writing to it alone renders the message into a hidden panel and the only on-screen
  // change is a draft count that fails to drop. Surface the Compose panel before writing.
  function showSubmitError(msg) {
    $('cerr').textContent = msg;
    const tab = root.querySelector('.rseg[data-pane="compose"]');
    if (tab) tab.click();
  }

  // Go to dashboard — admins land on /reviewdash, teams on /teamdash (mirrors the Old dashBtn).
  // Disarm on the way out, exactly as $('exit') does: leaving `pkAutoReview` set makes Overlay.astro
  // re-arm review on the NEXT page and rewrite the URL to /<page>/review, so browsing the site after a
  // dashboard trip drops you back into the HUD on every navigation.
  const gotoDashboard = () => {
    try { sessionStorage.removeItem('reviewMode'); sessionStorage.removeItem('pkAutoReview'); } catch {}
    location.href = homeUrl();
  };
  $('dash').addEventListener('click', gotoDashboard);
  // tapping "d" jumps to the dashboard (ignored while typing in a field or with a modifier held)
  const onDashKey = (e) => {
    if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      gotoDashboard();
    }
  };
  window.addEventListener('keydown', onDashKey);

  // exit → full teardown: removes the HUD (and its B&W canvas), strips any stray Old review chrome,
  // disarms review so a reload stays plain, and restores the clean URL.
  $('exit').addEventListener('click', () => {
    // BOTH flags must go. `pkAutoReview` is the /<page>/review router's arm signal; leaving it set
    // makes Overlay.astro load the bundle on the NEXT page, which re-arms review and rewrites the
    // URL to /<page>/review — the overlay reappearing on every navigation after being closed.
    try { sessionStorage.removeItem('reviewMode'); sessionStorage.removeItem('pkAutoReview'); } catch {}
    document.querySelectorAll('.rv-backdrop, .rv-dock, .rv-dash, .rv-logout, .rv-tray-wrap').forEach((el) => el.remove());
    document.documentElement.classList.remove('rv-armed');
    // Drop the /<page>/review suffix too — a refresh must land on the plain page, not back in review.
    try {
      const clean = location.pathname.replace(/\/review\/?$/, '') || '/';
      history.replaceState(null, '', clean + location.search);
    } catch {}
    unmountHud();
    if (ctx.onExit) ctx.onExit();   // re-arm the r / d shortcuts for this tab
  });

  // Theme (Show pane, above Log out) → flip this user's colour mode. applyTheme() fires
  // pk:themechange, which repaints the HUD and re-syncs this tool through onThemeEvt.
  $('theme').addEventListener('click', toggleTheme);
  syncThemeTool();

  // Log out (Show pane) → same teardown as exit, but ALSO drops the reviewer identity and
  // returns to the sign-in panel (delegated to the host via ctx.onLogout). Unlike exit(),
  // a fresh sign-in is required to re-enter review. Confirms first (drafts are discarded).
  $('logout').addEventListener('click', async () => {
    const n = (ctx.draftCount && ctx.draftCount()) || 0;
    const msg = n ? ('Log out? ' + n + ' pending pin(s) not yet submitted will be discarded.')
                  : 'Log out of this review session?';
    if (ctx.confirm ? !(await ctx.confirm(msg)) : !window.confirm(msg)) return;
    try { sessionStorage.removeItem('reviewMode'); sessionStorage.removeItem('pkAutoReview'); } catch {}
    document.documentElement.classList.remove('rv-armed');
    try {
      const clean = location.pathname.replace(/\/review\/?$/, '') || '/';
      history.replaceState(null, '', clean + location.search);
    } catch {}
    unmountHud();
    if (ctx.onLogout) ctx.onLogout();   // host: clearSession() + showLogin()
  });

  const onResize = () => fitWidth();
  window.addEventListener('resize', onResize);

  // stash listeners for clean unmount
  root._pkhudCleanup = () => {
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('keydown', onDashKey); window.removeEventListener('keydown', onEscKey);
    window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPinMove); window.removeEventListener('pointerup', onPinUp);
    window.removeEventListener('paste', onPaste);
    document.removeEventListener('click', onDocClose); window.removeEventListener('keydown', onFilterEsc);
    document.removeEventListener('pk:themechange', onThemeEvt);
    window.removeEventListener('storage', onThemeStore);
    // hand the page back its own skin — the HUD's light mode must not outlive the HUD
    if (prevPageTheme == null) document.documentElement.removeAttribute('data-pk-theme');
    else document.documentElement.setAttribute('data-pk-theme', prevPageTheme);
    try { root._pkhudRO && root._pkhudRO.disconnect(); } catch {}
  };

  return { unmount: unmountHud };
}

export function unmountHud() {
  const root = document.getElementById('pkhud');
  if (root) { try { root._pkhudCleanup && root._pkhudCleanup(); } catch {} root.remove(); }
  if (removeHudCss) { try { removeHudCss(); } catch {} removeHudCss = null; }
  const style = document.getElementById('pkhud-style'); // pre-3.83 fallback path
  if (style) style.remove();
  document.documentElement.style.overflow = '';
}
