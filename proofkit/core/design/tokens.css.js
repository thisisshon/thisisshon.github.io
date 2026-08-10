// GENERATED from tokens.css by scripts/build-css-modules.mjs — do not edit.
// Edit tokens.css and re-run that script.
export default `/* ===========================================================================
   PROOFKIT DESIGN TOKENS — the single source of truth for COLOUR + THEME.

   Distilled from the two reference kits in ./reference/ (kept as inspiration only,
   nothing imports them): "Red Moon" — the signature near-black canvas with a scarce
   Rosso Corsa voltage — is the default dark skin; "Dark Cream" is the warm dark alt.
   A third "light" skin completes the light/dark system.

   Two skins, keyed by [data-pk-theme]; :root defaults to Red Moon so the very
   first paint is already themed (before JS sets the attribute).

   CONSUMERS
   - design/components.css + the dashboards + /reviewdash/product link/import this.
   - The on-page overlay can't link a stylesheet, so it imports this file directly as
     a string (\`tokens.css?inline\` in overlay.js) and injects it at review time — real
     visitors download nothing. THIS FILE IS THE SOLE SOURCE; there is no JS mirror.

   THE TOKEN CONTRACT (semantic --pk-* roles — bind components to these, never hexes)
     canvas  page floor       card   surface         elev   raised surface
     input   field background red    brand voltage   red-2  brand pressed
     ink     primary text     body   secondary text  muted  tertiary text
     hair    hairline/border  amber  warning/open    green  success  softred danger
     hover   surface on hover hover-line  hairline on hover

   THE ONE ALPHA EXCEPTION: colour is solid hex everywhere EXCEPT the two token
   families that are intrinsically translucent — elevation (\`--pk-shadow-*\`) and
   backdrops (\`--pk-scrim*\`). Every other colour, incl. focus rings, is a solid token.
   Scales: spacing/radius/type/tracking/border/motion are tokens too (4/8 grid, no
   decimals) — components bind to them, never to raw px.
   =========================================================================== */

/* ---- SKIN 1 · Red Moon (default dark) ---- */
/* ---- side rail geometry ----
   Not colour, so not part of either skin: these are the same in light and dark. They were
   declared in dashboard.css, which only the Builder board loads — the team board renders the
   same rail from the same markup and could see none of them, so its Collapse row had no
   geometry at all and drew a 40px chevron in a full-width box. */
:root {
  --pk-rail-w: 208px;
  --pk-rail-w-min: 64px;
  --pk-rail-gutter: 23px;        /* (64 - 18) / 2 — an 18px icon reads centred when collapsed */
  --pk-rail-row-h: 48px;
}

:root,
:root[data-pk-theme="red-moon"] {
  color-scheme: dark;
  --pk-canvas:#181818; --pk-card:#1e1e1e; --pk-elev:#242424; --pk-input:#141414;
  --pk-red:#da291c; --pk-red-2:#b01e0a; --pk-ink:#ffffff; --pk-body:#a7a7a7;
  /* --pk-red-ink is red AS TEXT. The brand red is a FILL/STROKE colour: at #da291c it measures
     only 3.2–3.8:1 on this skin's surfaces, under the 4.5:1 AA floor, so setting it as a text
     colour failed everywhere it was used. This is the same value as --pk-softred (which already
     clears 4.6–5.5:1 on every dark surface) but named for the job, so a later softred retune
     cannot silently break contrast. --pk-red itself is unchanged — fills and borders keep the
     exact brand red. */
  --pk-red-ink:#ef5b50;
  /* --pk-muted was #7d7d7d: 3.5:1 at worst across canvas/card/elev/input/closed/active. */
  --pk-muted:#919191; --pk-hair:#333333; --pk-amber:#f5a623; --pk-green:#3ddc84; --pk-softred:#ef5b50; --pk-clarify:#a78bfa;
  /* hover pair — the listing row's pointer feedback (see the token contract note above).
     --pk-hover sits ONE step above --pk-input and stays BELOW --pk-card, so the queue card
     rises out of its well without overtaking the blocks printed on it (route / status /
     change-to all sit on --pk-card and must keep reading as raised). */
  --pk-hover:#1a1a1a; --pk-hover-line:#474747;
  /* status-tint pairs (chip bg + ink) — bound by the chips so a page never hardcodes them */
  --pk-open-bg:#3a2a12; --pk-open-ink:var(--pk-amber);
  --pk-done-bg:#16281c; --pk-done-ink:var(--pk-green);
  --pk-closed-bg:#2a2a2a; --pk-closed-ink:var(--pk-muted);
  --pk-new-bg:#3a1512; --pk-new-ink:#ff8a7a;
  --pk-callout-bg:#241a10; --pk-callout-line:#4a3417; /* "change to" callout */
  --pk-active-bg:#202020;  /* active sidebar-nav fill */
  --pk-thead-bg:#161616;   /* Master Log table header */
  --pk-floor:#141414;      /* pre-paint page floor behind the app (overscroll) */
  /* sanctioned-alpha backdrops (modal scrim + lighter picker veil) */
  --pk-scrim:rgba(6,6,6,.8); --pk-scrim-veil:rgba(10,10,10,.42);
  --pk-shadow-inset:inset 0 1px 2px rgba(0,0,0,.28); /* switch-track well */
  /* solid focus/selection halo — replaces every color-mix / rgba ring */
  --pk-ring-red:#431c19;
  /* fixed inks on the ALWAYS-dark lightbox (never flip with the skin) */
  --pk-on-media:#ffffff; --pk-on-media-sub:#dddddd; --pk-on-media-line:#4d4d4d;
  /* per-team chip tint pairs (bg + ink) — dark skin (several reuse status tints) */
  --pk-team-product-bg:#15243d;   --pk-team-product-ink:#8fbaf8;
  --pk-team-seo-bg:#16281c;       --pk-team-seo-ink:#3ddc84;
  --pk-team-marketing-bg:#3a2412; --pk-team-marketing-ink:#f0a875;
  --pk-team-content-bg:#241a3d;   --pk-team-content-ink:#c4b5fd;
  --pk-team-design-bg:#123430;    --pk-team-design-ink:#5fd6c8;
  --pk-team-business-bg:#3a1220;  --pk-team-business-ink:#f08aa8;
  --pk-team-builder-bg:#3a2a12;   --pk-team-builder-ink:#f5a623;
  --pk-team-none-bg:#2a2a2a;      --pk-team-none-ink:#a7a7a7;
}

/* ---- SKIN 2 · Light (warm off-white; brand red kept; status colours darkened) ---- */
:root[data-pk-theme="light"] {
  color-scheme: light;
  --pk-canvas:#f2f1ec; --pk-card:#ffffff; --pk-elev:#f8f7f3; --pk-input:#ffffff;
  --pk-red:#c81e12; --pk-red-2:#a5170c; --pk-ink:#1c1c1a; --pk-body:#565650;
  --pk-red-ink:#c81e12;   /* dark red on a light surface already clears 5.1–5.8:1 — same value */
  /* --pk-muted was #8c8c84 (2.8:1 at worst) and --pk-amber #a86a12 (3.9:1); both now clear 4.5:1. */
  --pk-muted:#696961; --pk-hair:#e4e1d9; --pk-amber:#9d5f07; --pk-green:#1d7a46; --pk-softred:#c0392b; --pk-clarify:#7c3aed;
  /* Light inverts the move: the card IS white here, so hover WARMS it a shade (still lighter
     than the --pk-canvas floor, so the card never sinks into the page) and the white blocks
     printed on it lift out. The hairline carries most of the signal on this skin. */
  --pk-hover:#f7f6f1; --pk-hover-line:#cbc7bb;
  /* status-tint pairs (light skin) */
  --pk-open-bg:#f6e8c9; --pk-open-ink:#8a5a12;
  --pk-done-bg:#dbeee1; --pk-done-ink:#1d7a46;
  --pk-closed-bg:#ece9e1; --pk-closed-ink:#6b6b63;
  --pk-new-bg:#fbe3df; --pk-new-ink:#b23120;
  --pk-callout-bg:#fbf3e2; --pk-callout-line:#ecdcb6;
  --pk-active-bg:#ece9e1; --pk-thead-bg:#efece4;
  --pk-floor:#f2f1ec;      /* light floor = the light canvas */
  /* backdrops + ring + inset, re-tinted for a light surface */
  --pk-scrim:rgba(20,20,20,.55); --pk-scrim-veil:rgba(255,255,255,.5);
  --pk-shadow-inset:inset 0 1px 2px rgba(40,38,32,.12);
  --pk-ring-red:#f6d7d3;
  /* --pk-on-media* inherit :root — the lightbox is dark in every skin */
  /* per-team chip tint pairs — light skin (the historical TEAM_COLORS values) */
  --pk-team-product-bg:#e7f0fb;   --pk-team-product-ink:#1b5fa8;
  --pk-team-seo-bg:#e7f7ee;       --pk-team-seo-ink:#1d7a46;
  --pk-team-marketing-bg:#fdeee6; --pk-team-marketing-ink:#b5541f;
  --pk-team-content-bg:#f1eafb;   --pk-team-content-ink:#6b3fa0;
  --pk-team-design-bg:#e4f5f3;    --pk-team-design-ink:#0f6d64;
  --pk-team-business-bg:#fce8ee;  --pk-team-business-ink:#a12a4f;
  --pk-team-builder-bg:#fbeeda;   --pk-team-builder-ink:#8a5a12;
  --pk-team-none-bg:#ece9e1;      --pk-team-none-ink:#6b6b63;
}

/* ---- NON-THEME tokens (stable across skins) ---- */
:root {
  /* extra functional accents — ship-ready blue (deploy bucket) + deploy green */
  --pk-blue:#3b82f6; --pk-blue-bg:#15243d; --pk-blue-ink:#8fbaf8;
  /* --pk-blue-fill is the blue that carries WHITE text. --pk-blue pulls the other way: it has to
     stay light enough to read AS text on a dark surface, which leaves white on it at only 3.7:1.
     One value cannot do both jobs, so the fill is its own token (white on it = 6.0:1). */
  --pk-blue-fill:#1c5fc4;
  /* needs-clarification status-tint pair (violet) — dark default; re-tinted for light below */
  --pk-clarify-bg:#241a3d; --pk-clarify-ink:#c4b5fd;
  --pk-deploy:#1a7f37; --pk-deploy-hover:#14682c;
  /* always-white ink for text/icons sitting ON a coloured fill (brand/deploy buttons,
     badges, pins) — stays white in every skin, unlike --pk-ink which flips for light. */
  --pk-on-accent:#ffffff;
  /* accent gold (the host-project wordmark tag) */
  --pk-brand-gold:#f3b83f;

  /* ---- ALWAYS-DARK surfaces. Two places in the product deliberately ignore the skin: the auth
     door (a hard cut away from wherever you came from) and the media lightbox (a photo needs a
     neutral dark surround, not a themed one). They are the same problem, so they share one role
     family instead of each hardcoding its own greys — which is what auth.css did, with 19 raw
     hexes including a hand-typed copy of the brand red.

     The ink values are set by CONTRAST, not by eye. Measured against --pk-fixed-bg (#000) and the
     raised --pk-fixed-elev (#0d0d0d), because a placeholder sitting in the input well is the
     worst case and it is the one that used to fail:
       --pk-fixed-sub   6.1:1 on bg / 5.4:1 on elev   (was #8a8a8a — already passing, kept)
       --pk-fixed-faint 4.9:1 on bg / 4.5:1 on elev   (replaces #6e6e6e 4.1:1, #5a5a5a 3.3:1 and
                                                       placeholder #4e4e4e 2.1:1 — all failed AA) */
  --pk-fixed-bg:#000000;    --pk-fixed-elev:#0d0d0d;  --pk-fixed-line:#2c2c2c;
  --pk-fixed-ink:#ffffff;   --pk-fixed-sub:#8a8a8a;   --pk-fixed-faint:#7a7a7a;
  /* The white a captured page or an attachment is composited on. It must NOT flip with the skin:
     a screenshot of a white page sitting on a dark card reads as a rendering fault, and a
     transparent PNG flattened onto anything but white changes what the reviewer is looking at. */
  --pk-media-bg:#ffffff;
  --pk-fixed-danger:#ef5b50; /* error ink that must not flip to the light skin's dark red */
  --pk-fixed-ring:#431c19;   /* solid focus halo — the ONE ring value, never an rgba() */

  /* accent presets (skin-agnostic) — the admin appearance picker's theme swatches.
     crimson-2 is the brand pressed red (matches --pk-red-2), not a fourth red. */
  --pk-accent-crimson:#da291c; --pk-accent-crimson-2:#b01e0a;
  --pk-accent-blue:#2563eb;    --pk-accent-blue-2:#1d4ed8;
  --pk-accent-violet:#7c3aed;  --pk-accent-violet-2:#6d28d9;
  --pk-accent-emerald:#059669; --pk-accent-emerald-2:#047857;
  --pk-accent-amber:#d97706;   --pk-accent-amber-2:#b45309;

  /* uniform chip width (parity) — every badge chip is as wide as the longest label. */
  --pk-chip-w:92px;      /* team + status badge chips */

  /* ---- CONTROL HEIGHTS — ONE ladder for every interactive control: buttons, inputs, selects,
     chips, segmented controls, toolbar controls, icon buttons. Not a ladder per component.

     Five rungs, every one a multiple of 8. Before the 12.1 cleanup this ladder was declared and
     referenced ZERO times, while the product shipped TWELVE distinct control heights — 24, 26, 28,
     30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 54, 56. That is what a dormant ladder costs: a 42px
     search box beside a 40px button beside a 34px bulk action, in one toolbar, and nobody able to
     say why the row looks off. Controls that do not share a ladder do not line up.

     Adoption moved every control by at most 4px. If a new control needs a sixth rung, that is a
     design decision to escalate — not a token to add quietly. */
  --pk-control-h-xs:24px;  /* inline chips, pills, badges, the settings switch */
  --pk-control-h-sm:32px;  /* small buttons, filter chips, dense row actions */
  --pk-control-h-md:40px;  /* toolbar controls, search, selects, secondary buttons */
  --pk-control-h-lg:48px;  /* primary buttons, fields, nav rows — and the mobile tap target */
  --pk-control-h-xl:56px;  /* the login form only: one marquee surface, deliberately larger */
  --pk-nav-h:48px;         /* = --pk-control-h-lg; the rail row IS a control-sized row */

  /* type — ONE typeface, Outfit, everywhere in the tool (matches the host site's single
     family; loaded by the page shell / on-page overlay). No second font, no monospace —
     design-system rule 3. Numeric columns use font-variant-numeric:tabular-nums, not a mono
     face. */
  --pk-font:'Outfit',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;

  /* type scale — a CLOSED ramp. Every font-size in the product is one of these; the check in
     scripts/design-conformance.sh fails if a literal size appears outside it.

     Renumbered during the 12.1 cleanup: the ramp declared 8 steps while the product shipped 19
     distinct sizes, including 11.5px and 12.5px — a half-pixel is always someone matching a mock by
     eye, never a decision. Off-ramp values were snapped to a neighbour (11.5/12.5→12, 26→28), or
     promoted to a step where they were load-bearing (15, 16, 20), or turned out not to be sizes at
     all (a stray 21px was a line-height written in px). Names are ordered by value, so a name
     predicts its size and adjacent names are adjacent sizes. */
  --pk-text-3xs:9px;   /* tracked uppercase micro-badge — a designed micro-label, not an accident */
  --pk-text-2xs:10px; --pk-text-xs:11px; --pk-text-sm:12px; --pk-text-md:13px;
  --pk-text-base:14px;                    /* the UI default: buttons, rows, chrome */
  --pk-text-lg:15px;                      /* card titles and comment bodies — the reading size */
  --pk-text-xl:16px;                      /* text inputs: 16px is the floor below which iOS zooms
                                             the viewport on focus. Not a taste decision. */
  --pk-text-2xl:18px; --pk-text-3xl:20px; --pk-text-4xl:28px; --pk-text-5xl:32px;
  /* Fluid display type. One clamp is ONE decision, not three sizes — bind the whole expression so
     its call sites cannot drift apart, which is what had happened to the two count tiles. */
  --pk-text-count:clamp(30px,4vw,42px);      /* the big stat numerals */
  --pk-text-display:clamp(30px,4.4vw,44px);  /* page h1 */
  --pk-w-regular:400; --pk-w-medium:500; --pk-w-semibold:600; --pk-w-bold:700;
  --pk-lh-none:1; --pk-lh-body:1.5; --pk-lh-heading:1.2;
  /* tracking — the only sanctioned letter-spacing values (no decimals) */
  --pk-track-1:1px; --pk-track-2:2px;

  /* ---- SPACING LADDER — 4px grid, 8px wherever the ladder offers it. Every gap, padding and
     margin in the product is one of these steps.

     Two steps (40px, 56px) were added during the 12.1 cleanup because the product was already
     using them deliberately and they had nowhere to bind. Everything else off the ladder was
     snapped to its nearest step — 13 off-grid values across ~110 declarations, none moving by more
     than 2px. Values below 4px are NOT spacing: a 1–3px offset is an optical nudge on a border or
     an icon baseline, and forcing those onto the grid would move things that were placed by eye
     against a stroke. The check exempts them for that reason, and only for that reason. */
  --pk-space-2:4px;  --pk-space-3:8px;  --pk-space-3h:12px; --pk-space-4:16px; --pk-space-4h:20px;
  --pk-space-5:24px; --pk-space-6:32px; --pk-space-6h:40px; --pk-space-7:48px; --pk-space-7h:56px;
  --pk-space-8:64px; --pk-space-9:96px; --pk-space-10:128px;

  /* radius — sharp corners are the signature; curves used sparingly */
  --pk-radius-sm:4px; --pk-radius-md:8px; --pk-radius-lg:12px; --pk-radius-full:9999px;

  /* border widths — the only sanctioned stroke sizes (retire 1.5px decimals) */
  --pk-border-hair:1px; --pk-border-strong:2px;

  /* elevation — a sanctioned-alpha family (see contract header) */
  --pk-shadow-sm:0 1px 4px rgba(0,0,0,.28);
  --pk-shadow-md:0 6px 20px rgba(0,0,0,.28);
  --pk-shadow-lg:0 24px 64px rgba(0,0,0,.5);

  /* ---- STACKING ORDER — the whole ladder, in order, and the only place a z-index is written.
     The numbers are the ones the components already carried; naming them was a rename, not a
     retune, so adopting the scale could not change what sits above what. The gaps are deliberate
     (room to insert a layer without renumbering its neighbours).

     Unscaled z-index decays in a predictable sequence — 1 → 20 → 60 → 210 → 9999 → max-int — and
     this file is the evidence: ProofKit had every one of those. Once a codebase contains a raw
     9999, every later stacking decision is made by escalation instead of by design.

     Six rungs, because six is what the product actually stacks. A first draft of this ladder also
     carried a \`raised:10\` and a \`nav:100\` copied from a reference scale; nothing referenced either,
     so both were deleted the same day. A rung nobody stands on asserts the ladder is complete while
     the code stacks by accident — worse than the gap it was added to fill. Add one back at the
     moment a component needs it, in the commit that uses it. */
  --pk-z-sticky:20;        /* sticky bars inside a scroller (detail bar) */
  --pk-z-fab:60;           /* floating action bar — must clear the sticky bar */
  --pk-z-popover:210;      /* in-page anchored menus (dropdown) */
  --pk-z-overlay:9998;     /* modal layer */
  --pk-z-gate:9999;        /* the login gate — covers the modal layer it may be raised over */
  --pk-z-lightbox:10000;   /* media viewer — the top of the ordinary stack */
  /* The embedded exception, and the ONLY place max-int is correct: the overlay and the widgets it
     shares (row menu, chip rail) inject into arbitrary host pages whose stacking contexts are
     unknown and unbounded. Two rungs so a panel always clears its own scrim. A bare 2147483400 in
     a rule reads as panic; a named token reads as a decision. */
  /* The overlay's own ladder, in order. It injects into third-party pages, so every rung sits in
     max-int territory — but "near max-int" is not a design, and before these were named the
     overlay carried 2147480000 / 2147483000 / 2147483003 / 2147483004 / 2147483039 / 2147483040 /
     2147483200 as bare numbers, each one chosen by nudging the last. Values unchanged; naming
     them was a rename, not a retune. */
  --pk-z-ov-backdrop:2147480000;  /* click-catcher behind everything the overlay draws */
  --pk-z-ov-pin:2147483000;       /* the pins themselves, on the page */
  --pk-z-ov-pop:2147483003;       /* a pin's composer popover */
  --pk-z-ov-toast:2147483004;     /* transient confirmations */
  --pk-z-ov-tray:2147483039;      /* draft tray, just under the dock */
  --pk-z-ov-dock:2147483040;      /* the always-there dock / dash / logout controls */
  --pk-z-ov-hud:2147483200;       /* the full-screen HUD, above the page-level overlay */
  --pk-z-access:2147483600;       /* the access-key gate — above the panel it locks */
  --pk-z-embed-scrim:2147483300;
  --pk-z-embed-panel:2147483400;

  /* LOCAL ordering inside #pkhud, which establishes its own stacking context via the rung above.
     These order siblings against each other and cannot escape the HUD, so they are not layers on
     the ladder — but there are five of them, which is too many to leave as bare numbers. */
  --pk-z-hud-pins:3; --pk-z-hud-label:6;
  --pk-z-hud-flyout:120; --pk-z-hud-panel:125; --pk-z-hud-rail:130;

  /* motion */
  --pk-ease:cubic-bezier(.4,0,.2,1);
  --pk-spring:cubic-bezier(.34,1.56,.64,1);
  --pk-ease-rise:cubic-bezier(.2,.7,.2,1); /* the enter/rise curve, inlined 11× today */
  --pk-dur-fast:.12s; --pk-dur-base:.15s; --pk-dur-slow:.3s;
}

/* light-mode: soften shadows + re-tint the ship-ready blue for a light surface */
:root[data-pk-theme="light"] {
  --pk-blue-bg:#e2ecfb; --pk-blue-ink:#1c5fc4;
  --pk-clarify-bg:#ece5fb; --pk-clarify-ink:#5b21b6;
  --pk-shadow-sm:0 1px 3px rgba(40,38,32,.12);
  --pk-shadow-md:0 8px 24px rgba(40,38,32,.12);
  --pk-shadow-lg:0 24px 64px rgba(40,38,32,.16);
}
`;
