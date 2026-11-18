// ItemBridge visual layout checks reported from faculty use. Synthetic item analysis only;
// see tests/README.md.
import { test, expect, syntheticItemCsv } from './fixtures.js';

const csvFile = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

async function loadExam(page, openTool) {
  await openTool('itembridge');
  await page.locator('#fileInput').setInputFiles(csvFile('synthetic.csv', syntheticItemCsv));
  await expect(page.locator('#workspace')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  test(`ItemBridge: the remove-exam × button stays inside its exam card, beside the exam name (${theme})`, async ({ page, openTool }) => {
    await loadExam(page, openTool);
    await page.evaluate(t => document.documentElement.setAttribute('data-ft-theme', t), theme);
    const remove = page.locator('#examList [data-remove-exam]').first();
    await remove.hover();
    const box = await remove.evaluate(btn => {
      const b = btn.getBoundingClientRect(), row = btn.closest('.ib-exam-row').getBoundingClientRect();
      const name = btn.closest('.ib-exam-row').querySelector('.ib-exam-btn').getBoundingClientRect();
      const period = btn.closest('.ib-exam-row').querySelector('.ib-exam-period').getBoundingClientRect();
      return { right: b.right, rowRight: row.right, bottom: b.bottom, nameBottom: name.bottom, periodTop: period.top, width: b.width, height: b.height };
    });
    // The hover box must not spill past the card's right edge...
    expect(box.right, 'remove button spills past the right edge of the exam card').toBeLessThanOrEqual(box.rowRight + 0.5);
    // ...or stretch down beside the period and assessment fields.
    expect(box.bottom, 'remove button stretches down beside the period fields').toBeLessThanOrEqual(box.periodTop + 0.5);
    // It still keeps a comfortable click target.
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
  });
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`ItemBridge: opening a question near the bottom of the screen brings its full details into view (motion: ${reducedMotion})`, async ({ page, openTool }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1280, height: 720 });
    await loadExam(page, openTool);
    const row = page.locator('#itemsTable .ib-table-row').last();
    // Put the last item row right at the bottom edge of the window, the way faculty
    // reach a question by scrolling down the list.
    await row.evaluate(r => { const b = r.getBoundingClientRect(); window.scrollBy(0, b.bottom - window.innerHeight + 2); });
    const number = await row.getAttribute('data-number');
    await row.locator('td').nth(2).click();
    const detail = page.locator('#itemsTable .ib-detail-row');
    await expect(detail).toBeVisible();
    await expect.poll(() => detail.evaluate(d => {
      const b = d.getBoundingClientRect(), headerBottom = document.querySelector('.ft-topbar').getBoundingClientRect().bottom;
      const row = d.previousElementSibling.getBoundingClientRect();
      // The question's row and its whole details panel sit below the pinned header and above the bottom edge.
      return row.top >= headerBottom - 0.5 && b.bottom <= window.innerHeight + 0.5;
    }), { message: 'the opened question details are not fully on screen', timeout: 3000 }).toBe(true);
    await expect(page.locator(`#itemsTable .ib-table-row[data-number="${number}"]`)).toHaveClass(/is-selected/);
  });
}

test('ItemBridge: opening a question that is already fully visible does not scroll the page', async ({ page, openTool }) => {
  await page.setViewportSize({ width: 1280, height: 2000 });
  await loadExam(page, openTool);
  const row = page.locator('#itemsTable .ib-table-row').first();
  await row.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await row.locator('td').nth(2).click();
  await expect(page.locator('#itemsTable .ib-detail-row')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('ItemBridge: a question whose details are taller than the screen opens with its row at the top', async ({ page, openTool }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 420 });
  await loadExam(page, openTool);
  const row = page.locator('#itemsTable .ib-table-row').last();
  await row.evaluate(r => { const b = r.getBoundingClientRect(); window.scrollBy(0, b.bottom - window.innerHeight + 2); });
  await row.locator('td').nth(2).click();
  await expect(page.locator('#itemsTable .ib-detail-row')).toBeVisible();
  const pos = await row.evaluate(r => ({ top: r.getBoundingClientRect().top, headerBottom: document.querySelector('.ft-topbar').getBoundingClientRect().bottom }));
  // The row is just below the pinned header, so faculty read the details from the start.
  expect(pos.top).toBeGreaterThanOrEqual(pos.headerBottom - 0.5);
  expect(pos.top).toBeLessThanOrEqual(pos.headerBottom + 40);
});

test('ItemBridge: opening a question with the keyboard shows its details and keeps focus on its button', async ({ page, openTool }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadExam(page, openTool);
  const row = page.locator('#itemsTable .ib-table-row').last();
  await row.evaluate(r => { const b = r.getBoundingClientRect(); window.scrollBy(0, b.bottom - window.innerHeight + 2); });
  const number = await row.getAttribute('data-number');
  await row.locator('[data-expand]').focus();
  await page.keyboard.press('Enter');
  const detail = page.locator('#itemsTable .ib-detail-row');
  await expect(detail).toBeVisible();
  await expect.poll(() => detail.evaluate(d => d.getBoundingClientRect().bottom <= window.innerHeight + 0.5)).toBe(true);
  const button = page.locator(`#itemsTable [data-expand="${number}"]`);
  await expect(button).toBeFocused();
  // Closing with the keyboard keeps focus too.
  await page.keyboard.press('Enter');
  await expect(detail).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('ItemBridge: searching or sorting with a question open does not scroll the page', async ({ page, openTool }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadExam(page, openTool);
  const row = page.locator('#itemsTable .ib-table-row').last();
  await row.evaluate(r => { const b = r.getBoundingClientRect(); window.scrollBy(0, b.bottom - window.innerHeight + 2); });
  await row.locator('td').nth(2).click();
  await expect(page.locator('#itemsTable .ib-detail-row')).toBeVisible();
  // Hide the open question with a search, then clear the search to show it again.
  await page.locator('#itemSearch').evaluate(el => el.scrollIntoView({ block: 'center' }));
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('#itemSearch').fill('zzz-no-match');
  await expect(page.locator('#itemsTable .ib-detail-row')).toHaveCount(0);
  await page.locator('#itemSearch').fill('');
  await expect(page.locator('#itemsTable .ib-detail-row')).toBeVisible();
  await page.locator('#itemsTable [data-sort="difficulty"]').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
