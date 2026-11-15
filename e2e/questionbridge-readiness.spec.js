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

// Clearing must also empty what is still on screen: pasted text, file status, and editor fields
// would otherwise let the next person on a shared computer read or re-parse the exam.
test('M4: clearing saved work also empties pasted text and editor fields', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, markedQuestion);
  await page.locator('#rationale').fill('Synthetic rationale');
  await step(page, 'export').click();
  await page.locator('#export').getByRole('button', { name: 'Clear saved work from this computer' }).click();
  await page.getByRole('dialog', { name: 'Clear saved work from this computer?' }).getByRole('button', { name: 'Clear saved work' }).click();
  await expect(page.locator('#pasteText')).toHaveValue('');
  for (const id of ['stem', 'rationale', 'qTitle', 'topic', 'tags', 'shortAnswers', 'kahootStem', 'pollStem'])
    await expect(page.locator(`#${id}`)).toHaveValue('');
  await expect(page.locator('#answersArea .qb-answer-input')).toHaveCount(0);
  await expect(page.locator('#fileName')).toHaveText('No file selected');
  await expect(page.locator('#parseStatus')).toBeEmpty();
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('transports oxygen');
  expect(text).not.toContain('Hemoglobin');
});

// Preview must not offer a download the export card itself refuses.
test('Preview of an export with no includable questions offers no download', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, keyedQuestion);
  await step(page, 'export').click();
  const bright = page.locator('#exportGrid .qb-export-card:has-text("Brightspace")');
  await expect(bright.locator('.downloadBtn')).toBeDisabled();
  await bright.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('dialog', { name: /preview/i });
  await expect(preview).toContainText('No questions can be included yet');
  await expect(preview.getByRole('button', { name: 'Download' })).toBeHidden();
  await page.keyboard.press('Escape');
  // Even if a download is requested another way, no empty file is produced.
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.evaluate(() => downloadExport('brightspace'));
  await expect(page.getByRole('dialog', { name: 'Nothing to download yet' })).toBeVisible();
  expect(downloaded).toBe(false);
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

// Every text inside a blocked-question box must stay readable (WCAG AA, 4.5:1) in both themes.
// Before this check, the box kept a light pink background in dark mode, hiding its headings.
const blockedQuestions = `${markedQuestion}\n\n2. Which organelle makes most ATP?\nA. Mitochondrion`;
test('blocked-question box text meets AA contrast in light and dark themes', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await paste(page, blockedQuestions);
  await step(page, 'validate').click();
  const box = page.locator('.qb-issue.is-blocked').first();
  await expect(box).toBeVisible();
  // Switch off color fades so a theme change applies at once and every color is measured settled.
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important}' });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => { document.documentElement.dataset.ftTheme = t; }, theme);
    const failures = await box.evaluate(root => {
      const parse = c => {
        const n = (c.match(/[\d.]+/g) || []).map(Number);
        const scale = c.startsWith('color(') ? 255 : 1; // color(srgb r g b / a) uses 0-1 channels
        return { rgb: n.slice(0, 3).map(v => v * scale), a: n.length > 3 ? n[3] : 1 };
      };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const background = el => { for (let e = el; e; e = e.parentElement) { const bg = parse(getComputedStyle(e).backgroundColor); if (bg.a > 0.5) return bg.rgb; } return parse(getComputedStyle(document.body).backgroundColor).rgb; }; // assumes solid backgrounds
      const out = [];
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!own || !el.getClientRects().length) continue;
        const [a, b] = [lum(parse(getComputedStyle(el).color).rgb), lum(background(el))];
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) out.push(`"${el.textContent.trim().slice(0, 40)}" ${ratio.toFixed(2)}:1`);
      }
      return out;
    });
    expect(failures, `${theme} theme text below 4.5:1`).toEqual([]);
  }
});
