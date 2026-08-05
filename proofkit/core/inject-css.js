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
