// ExamBridge results view at phone width: nothing may push the page wider than
// the screen, in light or dark mode. Synthetic exam only; see tests/README.md.
import { test, expect, syntheticExamRtf } from './fixtures.js';

for (const theme of ['light', 'dark']) {
  test(`ExamBridge results view has no horizontal page scroll at 390px (${theme})`, async ({ page, openTool }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTool('exambridge');
    await page.evaluate(t => document.documentElement.setAttribute('data-ft-theme', t), theme);
    await page.locator('#fileInput').setInputFiles({ name: 'synthetic.doc', mimeType: 'application/msword', buffer: Buffer.from(syntheticExamRtf) });
    await expect(page.locator('#resultsView')).toBeVisible();
    const size = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      summary: Math.round(document.getElementById('summaryGrid').getBoundingClientRect().width),
      summaryColumns: getComputedStyle(document.getElementById('summaryGrid')).gridTemplateColumns.split(' ').length,
      hiddenSections: [...document.querySelectorAll('.eb-sidebar-nav button')].filter(b => b.getBoundingClientRect().right > window.innerWidth).length,
    }));
    expect(size.page, 'page is wider than the screen').toBeLessThanOrEqual(size.viewport);
    expect(size.summary, 'summary cards are wider than the screen').toBeLessThanOrEqual(size.viewport);
    // Phone layout stacks: one summary card per row, and every section button is on screen.
    expect(size.summaryColumns, 'summary cards stack in one column').toBe(1);
    expect(size.hiddenSections, 'section buttons pushed off screen').toBe(0);
  });
}
