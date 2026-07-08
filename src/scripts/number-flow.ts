/**
 * number-flow - a tiny, dependency-free odometer.
 *
 * Renders a formatted number as a row of per-digit vertical reels (0–9).
 * Updating rolls each digit column through the intermediate values to its
 * target via a single CSS transform transition, and re-targets smoothly when
 * called again mid-roll (rapid slider drags). Non-digit characters (₹, commas,
 * a decimal point, "/mo" …) render as static cells around the reels.
 *
 * Digit cells are 1.5em tall so the reels ride the site's global line-height
 * (1.5) - no line-height exception needed. Styling lives in global.css (.nf*);
 * the elements are created here at runtime, so the CSS must be global (Astro's
 * scoped styles would never match dynamically-created nodes).
 */
const STEP = 1.5; // em per digit row - matches the global line-height:1.5

export type FlowUpdate = (formatted: string, animate?: boolean) => void;

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

export function createFlow(host: HTMLElement): FlowUpdate {
  host.classList.add('nf');
  host.textContent = '';
  const prefixEl = el('span', 'nf-fix');
  const coreEl = el('span', 'nf-core');
  const suffixEl = el('span', 'nf-fix');
  host.append(prefixEl, coreEl, suffixEl);

  const cells: HTMLElement[] = []; // digit cells, index 0 = units (rightmost)
  let shape = ''; // core digit/sep pattern, e.g. "D,DD,DD,DDD"
  let printed = '';

  function makeCell(): HTMLElement {
    const cell = el('span', 'nf-d');
    const reel = el('span', 'nf-reel');
    for (let n = 0; n <= 9; n++) {
      const s = document.createElement('span');
      s.textContent = String(n);
      reel.appendChild(s);
    }
    cell.appendChild(reel);
    return cell;
  }
  function roll(cell: HTMLElement, d: number, animate: boolean) {
    const reel = cell.firstElementChild as HTMLElement;
    if (!animate) reel.style.transition = 'none';
    reel.style.transform = 'translateY(' + -d * STEP + 'em)';
    if (!animate) {
      void reel.offsetHeight; // flush, so the next change animates again
      reel.style.transition = '';
    }
  }

  return function update(formatted: string, animate = true) {
    if (formatted === printed) return;
    printed = formatted;

    // span of the number within the string: [first digit .. last digit]
    let first = -1;
    let last = -1;
    for (let k = 0; k < formatted.length; k++) {
      const c = formatted.charCodeAt(k);
      if (c >= 48 && c <= 57) {
        if (first < 0) first = k;
        last = k;
      }
    }
    if (first < 0) {
      prefixEl.textContent = formatted;
      coreEl.textContent = '';
      suffixEl.textContent = '';
      shape = '';
      return;
    }
    prefixEl.textContent = formatted.slice(0, first);
    suffixEl.textContent = formatted.slice(last + 1);
    const core = formatted.slice(first, last + 1);

    const digitsOnly = core.replace(/\D/g, '');
    const newLen = digitsOnly.length;

    while (cells.length < newLen) cells.push(makeCell());
    cells.splice(newLen).forEach((c) => c.remove());

    // roll every digit to its target (index counted from the right)
    for (let i = 0; i < newLen; i++) {
      roll(cells[i], +digitsOnly[newLen - 1 - i], animate);
    }

    // Rebuild the core's DOM order only when the digit/separator pattern
    // changes. Same-shape updates leave the reels in place so their transitions
    // stay alive (smooth) across a drag; a length change reflows once.
    const newShape = core.replace(/[0-9]/g, 'D');
    if (newShape !== shape) {
      shape = newShape;
      const frag = document.createDocumentFragment();
      let fromLeft = 0;
      for (let k = 0; k < core.length; k++) {
        const ch = core[k];
        if (ch >= '0' && ch <= '9') {
          frag.appendChild(cells[newLen - 1 - fromLeft]);
          fromLeft++;
        } else {
          const sep = el('span', 'nf-sep');
          sep.textContent = ch;
          frag.appendChild(sep);
        }
      }
      coreEl.replaceChildren(frag);
    }
  };
}
