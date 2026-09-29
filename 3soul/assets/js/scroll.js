/* Weighted scroll, the lenis.dev feel: the page eases toward the
   wheel position instead of stepping to it. Native scroll stays
   underneath, so sticky elements, anchors and the parallax keep
   working. Off for reduced motion; touch keeps the native fling. */
(function (w, d) {
  if (!w.Lenis) return;
  if (w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var hd = d.querySelector('.hd');
  w.lenis = new w.Lenis({
    lerp: 0.1,
    wheelMultiplier: 1,
    smoothWheel: true,
    autoRaf: true,
    anchors: { offset: -((hd ? hd.offsetHeight : 72) + 16) }
  });
})(window, document);
