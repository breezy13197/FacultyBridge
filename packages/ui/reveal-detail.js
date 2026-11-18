/*
 * Shared "show the opened details" scroll (FTRevealDetail).
 *
 * When a table row opens an inline details row underneath it, faculty should
 * see the whole thing without scrolling by hand. FTRevealDetail.reveal(row, detail)
 * scrolls the page just enough that:
 *
 *   - the row and all of its details sit between the sticky top bar and the
 *     bottom of the window;
 *   - if the details are taller than the window, the row lands just below the
 *     top bar, so reading starts at the beginning;
 *   - nothing moves when everything already fits on screen;
 *   - motion is instant for people who ask for reduced motion.
 *
 * Each tool decides when to call it (see apps/exambridge/question-detail-scroll.js
 * and apps/itembridge/item-detail-scroll.js), so the tools' processing code
 * stays untouched.
 */
(() => {
  const gap = 12;
  function reveal(row, detail) {
    if (!row || !detail) return;
    const bar = document.querySelector('.ft-topbar');
    const topLimit = (bar ? bar.getBoundingClientRect().bottom : 0) + gap;
    const bottomLimit = window.innerHeight - gap;
    const rowTop = row.getBoundingClientRect().top;
    const detailBottom = detail.getBoundingClientRect().bottom;
    let delta = 0;
    if (rowTop < topLimit) delta = rowTop - topLimit;
    else if (detailBottom > bottomLimit) delta = Math.min(detailBottom - bottomLimit, rowTop - topLimit);
    if (Math.abs(delta) < 1) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollBy({ top: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  window.FTRevealDetail = { reveal };
})();
