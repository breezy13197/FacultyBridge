import { test, expect } from './fixtures.js';

// Regression check: jumping to a question from the Validate screen (or opening a saved
// project) must not copy the previously displayed question's stem and settings into the
// newly selected question. All content is synthetic.

const longStem = 'Which synthetic enzyme converts compound alpha into compound beta while also producing a cofactor?';
const pasted = [
  `1. ${longStem}\n*A. Cofactor one\nB. Cofactor two\nC. Cofactor three\nD. Cofactor four`,
  '2. Which synthetic organelle stores compound gamma?\n*A. Organelle one\nB. Organelle two\nC. Organelle three\nD. Organelle four',
  '3. Which synthetic compound blocks pathway delta?\n*A. Blocker one\nB. Blocker two\nC. Blocker three\nD. Blocker four',
].join('\n\n');

const items = page => page.locator('#questionList .qb-question-item');
// Topic and points-like settings live under the collapsed "Optional metadata" section.
async function showMetadata(page) {
  const details = page.locator('details:has(#topic)');
  if (!(await details.evaluate(d => d.open))) await details.locator('summary').click();
}

test('QuestionBridge: Open question from Validate keeps each question\'s own stem and settings', async ({ page, openTool }) => {
  expect(longStem.length).toBeGreaterThan(95); // over Kahoot's limit, so question 1 is listed on Validate
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await expect(items(page)).toHaveCount(3);

  // View question 3 and give it a topic, so it differs from question 1 in more than the stem.
  await items(page).nth(2).click();
  await expect(page.locator('#stem')).toHaveValue(/blocks pathway delta/);
  await showMetadata(page);
  await page.locator('#topic').fill('Synthetic topic for question 3');

  // Jump to question 1 from the Validate screen.
  await page.locator('[data-screen="validate"]').click();
  await page.locator('button:has-text("Open question")').first().click();

  await expect(page.locator('#editorEyebrow')).toHaveText(/Question 1 of 3/i);
  await expect(page.locator('#stem')).toHaveValue(longStem);
  await expect(page.locator('#topic')).toHaveValue('');

  // Question 3 still has its own stem and topic.
  await items(page).nth(2).click();
  await expect(page.locator('#stem')).toHaveValue(/blocks pathway delta/);
  await expect(page.locator('#topic')).toHaveValue('Synthetic topic for question 3');
});

test('QuestionBridge: opening a saved project does not copy the on-screen question into it', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await items(page).nth(2).click();
  await showMetadata(page);
  await page.locator('#topic').fill('Topic from the old project');

  const project = {
    schema: 'questionbridge', sourceName: 'Synthetic saved project',
    questions: [{
      id: 'synthetic-project-q1', type: 'mc', stem: 'Which synthetic vitamin is stored in project epsilon?', points: 2,
      topic: 'Saved project topic', confidence: 'high',
      answers: [{ text: 'Vitamin one', correct: true }, { text: 'Vitamin two', correct: false }],
    }],
  };
  await page.locator('#projectInput').setInputFiles({
    name: 'synthetic.questionbridge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });

  await expect(items(page)).toHaveCount(1);
  await expect(page.locator('#stem')).toHaveValue('Which synthetic vitamin is stored in project epsilon?');
  await expect(page.locator('#topic')).toHaveValue('Saved project topic');
  await expect(page.locator('#points')).toHaveValue('2');
});
