/**
 * CSP-safe stylesheet injection.
 *
 * The host site enforces `style-src 'self'` (no 'unsafe-inline') to close the
 * "CSP: style-src unsafe-inline" VAPT finding. That directive governs <style>
 * ELEMENTS as well as style attributes — including ones built at runtime with
 * `document.createElement('style')`, which is how this tool used to mount its
 * CSS. Under the strict policy the browser drops those sheets and the overlay
 * renders unstyled.
 *
 * Constructable stylesheets are CSSOM, not markup, so CSP does not police them.
 * `adoptedStyleSheets` is therefore the primary path. The <style> fallback is
 * only for engines without it (pre-2023); there the strict policy would block
 * the sheet anyway, so nothing is lost by trying.
 */
export function injectCss(css, id) {
  if (typeof document === 'undefined') return () => {};

  if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
    let sheet;
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    } catch {
      sheet = null;
    }
    if (sheet) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return () => {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
      };
    }
  }

  const el = document.createElement('style');
  if (id) el.id = id;
  el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
  return () => el.remove();
}

/**
 * THE OVERLAY'S FONT, on somebody else's page.
 *
 * Every board loads Outfit with a <link> in its own HTML. The OVERLAY does not have its own HTML —
 * it mounts onto the customer's page, which has never heard of Outfit. So `--pk-font` fell straight
 * through to the system fallback and the whole review UI rendered in whatever the host site's
 * default happened to be, subtly wrong everywhere and jarring next to the boards.
 *
 * A stylesheet <link> is governed by `style-src`, not `script-src`, and a host with a strict policy
 * may refuse it — in which case nothing breaks and the fallback is exactly what shipped before.
 * Idempotent by id, because the overlay can be mounted and unmounted several times on one page.
 */
export function injectFont() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('pk-font-link')) return;
  try {
    const link = document.createElement('link');
    link.id = 'pk-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300..800&display=swap';
    // The font is a nicety, never a blocker: if it is slow or refused, the UI is already usable in
    // the fallback and swapping in late is better than holding the overlay back for it.
    link.media = 'print';
    link.onload = () => { link.media = 'all'; };
    (document.head || document.documentElement).appendChild(link);
  } catch (e) { /* a host that refuses it keeps the system fallback */ }
}
