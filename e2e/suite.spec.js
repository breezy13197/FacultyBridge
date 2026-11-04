import fs from 'node:fs';
import { test, expect, syntheticExamRtf } from './fixtures.js';

const suite = JSON.parse(fs.readFileSync(new URL('../suite.json', import.meta.url)));
// Theme buttons differ by tool; the hub plus six tools share one of these ids.
const THEME_BUTTON = '#themeToggle, #themeBtn, #theme';
const theme = page => page.locator('html').evaluate(el => el.dataset.ftTheme ?? 'light');

for (const tool of suite.tools) {
  test(`${tool.name}: fresh start, version, theme, local assets`, async ({ page, openTool }) => {
    await openTool(tool.id);
    await expect(page.locator('.ft-build-label')).toContainText(`Build ${suite.suiteVersion}`);
    await expect(page.locator('header, .ft-topbar').first()).toContainText(`v${tool.version}`);
    const before = await theme(page);
    await page.locator(THEME_BUTTON).first().click();
    const after = await theme(page);
    expect(after).not.toBe(before);
    await page.reload();
    expect(await theme(page)).toBe(after);
    if (!tool.route) await expect(page.locator('[data-tool-link]')).toHaveCount(suite.tools.length - 1);
  });
}

test('QuestionBridge: synthetic question review, validation, persistence, deletion', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await expect(page.locator('[data-screen="review"]')).toBeDisabled();
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill('1. Which molecule transports oxygen?\n*A. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP');
  await page.locator('#parsePaste').click();
  await expect(page.locator('#stem')).toHaveValue(/transports oxygen/);
  const question = await page.evaluate(() => state.questions[0]);
  expect(question.answers).toHaveLength(4);
  expect(question.answers.filter(c => c.correct).map(c => c.text)).toEqual(['Hemoglobin']);
  for (const step of ['validate', 'export']) {
    await page.locator(`[data-screen="${step}"]`).click();
    await expect(page.locator(`#${step}`)).toBeVisible();
  }
  await page.reload();
  await page.locator('[data-screen="review"]').click();
  await expect(page.locator('#stem')).toHaveValue(/transports oxygen/);
  await page.locator('#deleteQuestion').click();
  await page.getByRole('dialog', { name: 'Delete question?' }).getByRole('button', { name: 'Delete question' }).click();
  await expect(page.locator('[data-screen="export"]')).toBeDisabled();
  expect(await page.evaluate(() => state.questions.length)).toBe(0);
});

test('ExamBridge: invalid export gives actionable error', async ({ page, openTool }) => {
  await openTool('exambridge');
  await page.locator('#fileInput').setInputFiles({ name: 'invalid.doc', mimeType: 'application/msword', buffer: Buffer.from('invalid export') });
  await expect(page.locator('#uploadError')).toContainText('RTF');
  await expect(page.locator('#uploadError')).toContainText('ExamSoft');
  await expect(page.locator('#resultsView')).toBeHidden();
});

test('ExamBridge: synthetic RTF export loads and generates a report', async ({ page, openTool }) => {
  await openTool('exambridge');
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic.doc', mimeType: 'application/msword', buffer: Buffer.from(syntheticExamRtf) });
  await expect(page.locator('#resultsView')).toBeVisible();
  expect(await page.evaluate(() => window.__ExamBridgeQA.getState().exam.questions.length)).toBe(2);
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('#printBtn').click();
  await page.locator('#generateReportBtn').click();
  await expect(page.locator('#reportOutput')).toContainText('PHA9999');
});

test('ItemBridge: score report instead of item analysis is rejected clearly', async ({ page, openTool }) => {
  await openTool('itembridge');
  await page.locator('#fileInput').setInputFiles({ name: 'scores.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Score\nA,1\nB,2\nC,3\nD,4\n') });
  await expect(page.locator('#uploadNotice')).toContainText('ExamSoft');
  await expect(page.locator('#workspace')).toBeHidden();
});
