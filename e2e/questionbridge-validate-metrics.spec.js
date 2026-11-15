import { test, expect } from './fixtures.js';

// Regression check: on Validate, the "With issues" label and its detail line
// ("0 warnings · 1 blocked") ran together as "With issues0 warnings". The detail must
// sit on its own line below the label. All content is synthetic.

const longStem = 'Which synthetic enzyme converts compound alpha into compound beta while also producing a cofactor?';

test('QuestionBridge: the "With issues" detail is on its own line below the label', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  // Over Kahoot's 95-character limit, so the question is blocked for Kahoot.
  await page.locator('#pasteText').fill(`1. ${longStem}\n*A. Cofactor one\nB. Cofactor two\nC. Cofactor three\nD. Cofactor four`);
  await page.locator('#parsePaste').click();
  await page.locator('[data-screen="validate"]').click();

  const card = page.locator('.ft-metric:has(#metricAttention)');
  const label = card.locator('span', { hasText: 'With issues' });
  const detail = page.locator('#metricAttentionDetail');
  await expect(detail).toHaveText('0 warnings · 1 blocked');
  const labelBox = await label.boundingBox();
  const detailBox = await detail.boundingBox();
  expect(detailBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height);
});
