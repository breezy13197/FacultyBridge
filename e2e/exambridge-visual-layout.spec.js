// ExamBridge visual layout checks reported from faculty use. Synthetic exam only;
// see tests/README.md.
import { test, expect, syntheticExamRtf } from './fixtures.js';

async function loadExam(page, openTool) {
  await openTool('exambridge');
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic.doc', mimeType: 'application/msword', buffer: Buffer.from(syntheticExamRtf) });
  await expect(page.locator('#resultsView')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  test(`ExamBridge: report "Findings to include" heading sits inside its box, not on the border (${theme})`, async ({ page, openTool }) => {
    await loadExam(page, openTool);
    await page.evaluate(t => document.documentElement.setAttribute('data-ft-theme', t), theme);
    await page.locator('#printBtn').click();
    const box = page.locator('.eb-report-findings-picker');
    await expect(box).toBeVisible();
    const pos = await box.evaluate(fs => {
      const legend = fs.querySelector('legend').getBoundingClientRect();
      const border = fs.getBoundingClientRect();
      const css = getComputedStyle(fs);
      // A heading inside the box starts below the top border and padding. A heading drawn
      // on the border starts at the very top edge of the box.
      return { legendTop: legend.top, insideTop: border.top + parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop) - 1 };
    });
    expect(pos.legendTop, 'heading crosses the top border of the box').toBeGreaterThanOrEqual(pos.insideTop);
  });
}

for (const reducedMotion of ['no-preference', 'reduce']) {
test(`ExamBridge: opening a question low on the screen scrolls its details into view (motion: ${reducedMotion})`, async ({ page, openTool }) => {
  // People who turn on "reduce motion" get an instant jump instead of a smooth scroll.
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadExam(page, openTool);
  const row = page.locator('.eb-qrow').first();
  // Put the question at the very bottom of the screen, like the faculty screenshot.
  await row.evaluate(r => r.scrollIntoView({ block: 'end' }));
  await row.click();
  const detail = page.locator('.eb-detail-row .eb-inline-detail');
  await expect(detail).toBeVisible();
  // The question text and its answer choices are on screen without manual scrolling.
  await expect(page.locator('.eb-detail-row .eb-detail-stem')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.eb-detail-row .eb-option').first()).toBeInViewport({ ratio: 1 });
  // The clicked question row is not hidden behind the sticky top bar.
  await expect.poll(() => page.evaluate(() => {
    const bar = document.querySelector('.ft-topbar').getBoundingClientRect().bottom;
    return document.querySelector('.eb-qrow[aria-expanded="true"]').getBoundingClientRect().top >= bar;
  })).toBe(true);
});
}

test('ExamBridge: opening a question that already fits on screen does not move the page', async ({ page, openTool }) => {
  await page.setViewportSize({ width: 1280, height: 1600 });
  await loadExam(page, openTool);
  const row = page.locator('.eb-qrow').first();
  // The synthetic exam is short, so add test-only space below it; then place the
  // question near the top of the screen, below the top bar, with room for its details.
  await row.evaluate(r => {
    document.body.insertAdjacentHTML('beforeend', '<div style="height:3000px"></div>');
    r.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -200);
  });
  const before = await page.evaluate(() => window.scrollY);
  await row.click();
  await expect(page.locator('.eb-detail-row')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
