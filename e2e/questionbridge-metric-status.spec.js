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

test('With issues card is red when any question is blocked', async ({ page, openTool }) => {
  await openValidate(page, openTool, blockedQuestion);
  await expect(card(page)).toHaveText('1');
  await expect(detail(page)).toContainText('1 blocked');
  await expect(card(page)).toHaveClass(/\bft-status-error\b/);
  await expect(card(page)).not.toHaveClass(/\bft-status-warning\b/);
});

test('With issues card is amber when there are only warnings', async ({ page, openTool }) => {
  await openValidate(page, openTool, warningQuestion);
  await expect(card(page)).toHaveText('1');
  await expect(detail(page)).toContainText('0 blocked');
  await expect(detail(page)).toContainText('1 warning');
  await expect(card(page)).toHaveClass(/\bft-status-warning\b/);
  await expect(card(page)).not.toHaveClass(/\bft-status-error\b/);
});

test('With issues card has no warning or error color when there are no issues', async ({ page, openTool }) => {
  await openValidate(page, openTool, cleanQuestion);
  await expect(card(page)).toHaveText('0');
  await expect(card(page)).not.toHaveClass(/\bft-status-(warning|error)\b/);
});

// Blocked and warning issue cards use the shared status tokens, so they follow the
// dark theme instead of keeping a near-white light-mode background.
const luminance = rgb => {
  const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => {
    c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('Blocked issue card follows the dark theme and stays readable', async ({ page, openTool }) => {
  await openValidate(page, openTool, blockedQuestion);
  await page.evaluate(() => { document.documentElement.dataset.ftTheme = 'dark'; });
  const issue = page.locator('#issuesList .qb-issue.is-blocked').first();
  await expect(issue).toBeVisible();
  const colors = await issue.evaluate(el => {
    // Browsers report computed colors in different formats (rgb(), color(srgb ...)),
    // so paint each one onto a canvas and read back plain 0-255 RGB values.
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const toRgb = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return `rgb(${[...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).join(',')})`; };
    const cs = e => new Proxy(getComputedStyle(e), { get: (t, k) => toRgb(t[k]) });
    const banner = el.querySelector('.qb-blocked-banner');
    const line = el.querySelector('.qb-platform-error');
    return {
      card: cs(el).backgroundColor,
      bannerBg: cs(banner).backgroundColor, bannerText: cs(banner).color,
      line: cs(line).color,
    };
  });
  // A dark card, not the light-mode #fff5f4.
  expect(luminance(colors.card)).toBeLessThan(0.1);
  expect(contrast(colors.line, colors.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.bannerText, colors.bannerBg)).toBeGreaterThanOrEqual(4.5);
});

test('With issues detail sits on its own line under the label', async ({ page, openTool }) => {
  await openValidate(page, openTool, blockedQuestion);
  const label = page.locator('#metricAttention ~ span');
  const labelBox = await label.boundingBox();
  const detailBox = await detail(page).boundingBox();
  expect(detailBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height - 1);
});
