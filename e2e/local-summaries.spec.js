import fs from 'node:fs';
import { test, expect } from './fixtures.js';
import { downloadedQuestionCount } from './local-export-counts.js';

test('QuestionBridge downloaded question counts cover every question type and format', async ({ page }) => {
  await page.goto('/QuestionBridge/');
  await page.evaluate(() => {
    const question = (type, extra = {}) => normalizeQuestion({ type, stem: `Synthetic ${type} question`,
      confidence: 'high', answers: [{ text: 'True', correct: true }, { text: 'False', correct: false }], ...extra });
    state.questions = [question('mc', { stem: 'A multiline stem\nwith "quoted" text' }),
      question('mr', { answers: [{ text: 'First', correct: true }, { text: 'Second', correct: true }] }),
      question('tf'), question('sa', { accepted: ['Synthetic answer'] }),
      question('fitb', { stem: 'Supply __1__ and __2__.', blanks: [
        { id: 1, accepted: ['First'] }, { id: 2, accepted: ['Second'] }] }), question('essay')];
    state.sourceName = 'Synthetic export count check';
    state.selected = 0;
    renderReview();
    show('export');
  });
  // Exact expectations independent of selectedQuestionsFor or validation totals.
  const expected = { brightspace: 5, examsoft: 6, kahoot: 3, poll: 6 };
  const platforms = await page.evaluate(() => Object.keys(platformDefs));
  for (const [i, platform] of platforms.entries()) {
    const pending = page.waitForEvent('download');
    await page.locator('#exportGrid .downloadBtn').nth(i).click();
    const download = await pending;
    const count = await downloadedQuestionCount(platform, fs.readFileSync(await download.path()));
    expect(count, platform).toBe(expected[platform]);
    await download.delete();
  }
});
