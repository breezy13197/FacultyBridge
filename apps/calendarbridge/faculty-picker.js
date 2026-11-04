/*
 * Faculty picker menus open inside scrolling tables, which clip anything that
 * extends past their edges, so the list of faculty was cut off. While a menu
 * is open it is positioned against the window instead, flipped above the
 * picker when there is no room below, and closed when the page scrolls, the
 * window resizes, focus moves away, or Escape is pressed.
 *
 * Kept separate from calendarbridge.js so the schedule-processing code stays
 * unchanged (see tests/import-baseline.json).
 */
(() => {
  'use strict';
  const PICKER = '.cb-faculty-picker';
  const closeAll = except => document.querySelectorAll(`${PICKER}[open]`).forEach(d => { if (d !== except) d.open = false; });
  const place = picker => {
    const menu = picker.querySelector('.cb-faculty-menu');
    const summary = picker.querySelector('summary');
    if (!menu || !summary) return;
    const r = summary.getBoundingClientRect(), gap = 6, edge = 8;
    menu.classList.add('is-floating');
    menu.style.maxHeight = '';
    const below = innerHeight - r.bottom - gap - edge, above = r.top - gap - edge;
    const natural = menu.scrollHeight, up = natural > below && above > below;
    menu.style.maxHeight = `${Math.max(120, Math.min(natural, up ? above : below))}px`;
    menu.style.top = `${up ? r.top - gap - menu.offsetHeight : r.bottom + gap}px`;
    menu.style.left = `${Math.max(edge, Math.min(r.left, innerWidth - menu.offsetWidth - edge))}px`;
  };
  // "toggle" does not bubble, so listen during the capture phase.
  document.addEventListener('toggle', e => {
    const picker = e.target;
    if (picker.matches?.(PICKER) && picker.open) { closeAll(picker); place(picker); }
  }, true);
  document.addEventListener('click', e => { if (!e.target.closest?.(PICKER)) closeAll(); });
  document.addEventListener('focusin', e => { if (!e.target.closest?.(PICKER)) closeAll(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const picker = e.target.closest?.(`${PICKER}[open]`);
    if (picker) { picker.open = false; picker.querySelector('summary').focus(); }
  });
  window.addEventListener('scroll', e => { if (!e.target.closest?.('.cb-faculty-menu')) closeAll(); }, true);
  window.addEventListener('resize', () => closeAll());
})();
