import fs from 'node:fs';
import { test, expect } from './fixtures.js';

// Regression checks for the QuestionBridge items in docs/FACULTY-READINESS-REVIEW.md
// (B2 progress bar, M3 guessed answer keys, M4 saved-work notice, m4 answer undo,
// m5 answer-control size). All content is synthetic.

// The answer comes from an answer-key line, so QuestionBridge applied it but did not
// see it marked on the question itself. Faculty must confirm it before export.
const keyedQuestion = '1. Which molecule transports oxygen?\nA. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP\n\nAnswer key: 1. A';
const markedQuestion = '1. Which molecule transports oxygen?\n*A. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP';

async function paste(page, text) {
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(text);
  await page.locator('#parsePaste').click();
  await expect(page.locator('#stem')).toHaveValue(/transports oxygen/);
}
const step = (page, id) => page.locator(`.ft-step[data-screen="${id}"]`);

test('B2: workflow steps are checked only when their work is actually complete', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, keyedQuestion);
  await expect(step(page, 'upload')).toHaveClass(/is-done/);
  // Moving ahead does not mark Review done while a question is unconfirmed.
  await step(page, 'export').click();
  await expect(step(page, 'review')).not.toHaveClass(/is-done/);
  await expect(step(page, 'validate')).not.toHaveClass(/is-done/);
  // Confirming the only question completes Review; no blocking issues completes Validate.
  await step(page, 'review').click();
  await page.locator('#confirmParsedQuestion').click();
  await expect(step(page, 'review')).toHaveClass(/is-done/);
  await expect(step(page, 'validate')).toHaveClass(/is-done/);
  // A new structural problem un-checks Review again.
  await page.locator('#stem').fill('');
  await expect(step(page, 'review')).not.toHaveClass(/is-done/);
});

test('M3: a guessed answer key is held back from export until faculty confirm it', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, keyedQuestion);
  expect(await page.evaluate(() => state.questions[0].confidence)).not.toBe('high');
  await step(page, 'export').click();
  const bright = page.locator('#exportGrid .qb-export-card:has-text("Brightspace")');
  await expect(bright).toContainText('0 of 1');
  await expect(bright).toContainText('1 answer key was guessed and not confirmed');

  // The export card sends faculty to the list of unconfirmed questions.
  await bright.getByRole('button', { name: /Review unconfirmed/ }).click();
  await expect(page.locator('#validate')).toBeVisible();
  await expect(page.locator('#issuesList')).toContainText('BLOCKING');
  await page.locator('#confirmAllParsed').click();
  const dialog = page.getByRole('dialog', { name: 'Confirm 1 guessed answer key?' });
  await expect(dialog).toContainText('Q1');
  await dialog.getByRole('button', { name: 'Confirm 1 question' }).click();
  expect(await page.evaluate(() => state.questions[0].confidence)).toBe('high');

  await step(page, 'export').click();
  await expect(bright).toContainText('1 of 1');
  const pending = page.waitForEvent('download');
  await bright.getByRole('button', { name: /Download/ }).click();
  const file = await pending;
  expect(fs.readFileSync(await file.path(), 'utf8')).toContain('Option,100,Hemoglobin');
  await file.delete();
});

test('M3: an explicitly marked answer exports without extra confirmation', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, markedQuestion);
  await step(page, 'export').click();
  const bright = page.locator('#exportGrid .qb-export-card:has-text("Brightspace")');
  await expect(bright).toContainText('1 of 1');
  await expect(bright).not.toContainText('guessed');
});

test('M4: faculty are told work is saved on this computer and can clear it', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await expect(page.locator('#home')).toContainText('saved in this browser on this computer');
  await paste(page, markedQuestion);
  expect(await page.evaluate(() => localStorage.getItem('questionbridge-autosave'))).toBeTruthy();
  await step(page, 'export').click();
  await page.locator('#export').getByRole('button', { name: 'Clear saved work from this computer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clear saved work from this computer?' });
  await dialog.getByRole('button', { name: 'Clear saved work' }).click();
  expect(await page.evaluate(() => localStorage.getItem('questionbridge-autosave'))).toBeNull();
  expect(await page.evaluate(() => state.questions.length)).toBe(0);
  await page.reload();
  await expect(page.locator('#restoredBanner')).toBeHidden();
  expect(await page.evaluate(() => state.questions.length)).toBe(0);
});

test('m4: a deleted answer can be restored with Undo', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, markedQuestion);
  await page.getByRole('button', { name: 'Delete answer 2' }).click();
  expect(await page.evaluate(() => state.questions[0].answers.map(a => a.text))).toEqual(['Hemoglobin', 'DNA', 'ATP']);
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(page.locator('#answersArea')).toContainText('Answer 2 (“Glycogen”) removed');
  await expect(undo).toBeFocused();
  await undo.click();
  expect(await page.evaluate(() => state.questions[0].answers.map(a => a.text))).toEqual(['Hemoglobin', 'Glycogen', 'DNA', 'ATP']);
  await expect(page.locator('#answersArea')).not.toContainText('removed');
});

test('m5: answer controls are large enough to click and say whether they are correct', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, markedQuestion);
  for (const sel of ['.qb-answer-marker', '.qb-trash']) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box.width, sel).toBeGreaterThanOrEqual(40);
    expect(box.height, sel).toBeGreaterThanOrEqual(40);
  }
  await expect(page.locator('.qb-answer-marker').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.qb-answer-marker').nth(1)).toHaveAttribute('aria-pressed', 'false');
  // Still usable at 200% zoom (a 640 px wide window is the same layout width).
  await page.setViewportSize({ width: 640, height: 900 });
  const box = await page.locator('.qb-answer-marker').first().boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(40);
});
