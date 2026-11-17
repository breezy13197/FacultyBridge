// Keep screen behavior separate from the imported exam-processing logic in
// exambridge.js, whose code is protected by tests/import-baseline.json.
//
// When a question row opens its inline details, scroll just enough to show them.
// The question row stays visible below the sticky top bar, and the page does not
// move when everything already fits on screen. Closing a question never scrolls.
(() => {
  const table = document.getElementById('questionRows') || document;
  const gap = 12;

  function reveal(row) {
    const detail = row.nextElementSibling;
    if (!detail || !detail.classList.contains('eb-detail-row')) return;
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

  // exambridge.js marks the opened row with aria-expanded="true" right after it
  // adds the detail row, for both mouse clicks and the Enter/Space keys.
  new MutationObserver(changes => {
    for (const change of changes) {
      const row = change.target;
      if (row.classList && row.classList.contains('eb-qrow') && row.getAttribute('aria-expanded') === 'true') reveal(row);
    }
  }).observe(table, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
})();
