// Keep screen behavior separate from the imported exam-processing logic in
// exambridge.js, whose code is protected by tests/import-baseline.json.
//
// When a question row opens its inline details, scroll just enough to show them
// (shared FTRevealDetail in packages/ui/reveal-detail.js). Closing a question
// never scrolls.
(() => {
  const table = document.getElementById('questionRows') || document;

  // exambridge.js marks the opened row with aria-expanded="true" right after it
  // adds the detail row, for both mouse clicks and the Enter/Space keys.
  new MutationObserver(changes => {
    for (const change of changes) {
      const row = change.target;
      if (!row.classList || !row.classList.contains('eb-qrow') || row.getAttribute('aria-expanded') !== 'true') continue;
      const detail = row.nextElementSibling;
      if (detail && detail.classList.contains('eb-detail-row')) window.FTRevealDetail.reveal(row, detail);
    }
  }).observe(table, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
})();
