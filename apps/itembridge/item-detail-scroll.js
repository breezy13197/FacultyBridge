// Keep screen behavior separate from the imported item-analysis logic in
// itembridge.js, whose code is protected by tests/import-baseline.json.
//
// itembridge.js redraws the Items table on every open, close, sort, or filter.
// This file:
//   - scrolls just enough to show a question's full details when faculty open a
//     different question (shared FTRevealDetail in packages/ui/reveal-detail.js).
//     Sorting, filtering, searching, or closing never scrolls the page.
//   - keeps keyboard focus on a question's open/close button across the redraw,
//     so keyboard users do not lose their place.
(() => {
  const view = document.getElementById('reviewView');
  if (!view) return;
  let shown = null, focusedItem = null;
  view.addEventListener('focusin', e => {
    const btn = e.target.closest && e.target.closest('#itemsTable [data-expand]');
    focusedItem = btn ? btn.dataset.expand : null;
  });
  document.addEventListener('focusin', e => { if (!view.contains(e.target)) focusedItem = null; });
  new MutationObserver(() => {
    if (focusedItem != null && (!document.activeElement || document.activeElement === document.body)) {
      const btn = [...view.querySelectorAll('#itemsTable [data-expand]')].find(b => b.dataset.expand === focusedItem);
      if (btn) btn.focus({ preventScroll: true });
    }
    const state = window.ItemBridge && window.ItemBridge.state;
    const selected = state && state.selectedItemNumber != null ? `${state.activeExam}:${state.selectedItemNumber}` : null;
    if (selected == null) { shown = null; return; }
    if (selected === shown) return;
    const detail = view.querySelector('#itemsTable .ib-detail-row');
    if (!detail) return;
    shown = selected;
    window.FTRevealDetail.reveal(detail.previousElementSibling, detail);
  }).observe(view, { subtree: true, childList: true });
})();
