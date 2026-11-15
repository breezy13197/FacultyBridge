import { test, expect } from './fixtures.js';

// The "With issues" card on the Validate screen must use a semantic status color
// that matches its worst issue: red when any question is blocked from an export,
// amber when there are only warnings, and no status color when there are none.
// The detail line keeps the words, so status is never shown by color alone.
// All content is synthetic.

// Answer marked on the question itself: no issues for the default destinations.
const cleanQuestion = '1. Which molecule transports oxygen?\n*A. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP';
// Answer marked, but an option begins with "=", which only earns a CSV warning.
const warningQuestion = '1. Which value is the identity for multiplication?\n*A. =1\nB. 0\nC. 2\nD. 10';
// Answer only appears in an answer key, so it is guessed and blocks export.
const blockedQuestion = '1. Which organ produces insulin?\nA. Liver\nB. Pancreas\nC. Kidney\nD. Spleen\n\nAnswer key: 1. B';

async function openValidate(page, openTool, text) {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(text);
  await page.locator('#parsePaste').click();
  await page.locator('.ft-step[data-screen="validate"]').click();
  await expect(page.locator('#validate')).toBeVisible();
}
const card = page => page.locator('#metricAttention');
const detail = page => page.locator('#metricAttentionDetail');
// Checks the color actually shown, not just class names: the number must match the
// given status token (--ft-danger, --ft-warning) or the plain text color (--ft-text).
async function expectShownColor(page, token) {
  const [shown, wanted] = await card(page).evaluate((el, name) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).join(','); };
    return [rgb(getComputedStyle(el).color), rgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim())];
  }, token);
  expect(shown).toBe(wanted);
}

test('With issues card is red when any question is blocked', async ({ page, openTool }) => {
  await openValidate(page, openTool, blockedQuestion);
  await expect(card(page)).toHaveText('1');
  await expect(detail(page)).toContainText('1 blocked');
  await expectShownColor(page, '--ft-danger');
});

test('With issues card is amber when there are only warnings', async ({ page, openTool }) => {
  await openValidate(page, openTool, warningQuestion);
  await expect(card(page)).toHaveText('1');
  await expect(detail(page)).toContainText('0 blocked');
  await expect(detail(page)).toContainText('1 warning');
  await expectShownColor(page, '--ft-warning');
});

test('With issues card has no warning or error color when there are no issues', async ({ page, openTool }) => {
  await openValidate(page, openTool, cleanQuestion);
  await expect(card(page)).toHaveText('0');
  await expectShownColor(page, '--ft-text');
});
