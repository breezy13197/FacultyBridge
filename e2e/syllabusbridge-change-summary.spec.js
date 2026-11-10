// SyllabusBridge v2.2 change summary: every net change, grouped by section,
// with before and after, in the editor and in the printable report. Synthetic data only.
import { test, expect, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';

const paragraphs = syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule');
async function open(page, openTool, table) {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx({ paragraphs, table }) });
  await expect(page.locator('#screen-review')).toBeVisible();
}
async function setField(locator, value) { await locator.fill(value); await locator.press('Tab'); }
// The summary as data: [section, action, item, before, after] rows.
async function summaryRows(root) {
  return root.locator('.sb-change-group').evaluateAll(groups => groups.flatMap(g => {
    const section = g.querySelector('h3').firstChild.textContent.trim();
    return [...g.querySelectorAll('tbody tr')].map(tr => [section, ...[...tr.cells].map(td => td.innerText.trim())]);
  }));
}
const netChanges = page => page.evaluate(() => editorDiffCount());

test('the change summary lists every net change by section, with before and after', async ({ page, openTool }) => {
  await open(page, openTool, syntheticSyllabus.table);
  const originalTitle = await page.locator('#courseTitle').inputValue();
  const topics = page.locator('#scheduleBody .s-topic');

  await setField(page.locator('#courseTitle'), 'Revised Synthetic Course');
  await setField(topics.nth(1), 'Enzyme kinetics');
  await page.locator('#scheduleBody .sb-mini-remove').nth(2).click();
  await page.locator('#addScheduleRow').click();
  await page.locator('#addFacultyRow').click();
  await page.locator('#addGradeRow').click();

  await page.locator('#reviewChanges').click();
  const dialog = page.getByRole('dialog', { name: 'Change summary' });
  await expect(dialog).toBeVisible();
  const rows = await summaryRows(dialog);
  // One row per counted change, so the summary and "N net changes" always agree.
  expect(rows).toHaveLength(await netChanges(page));
  await expect(page.locator('#editCount')).toHaveText(`${rows.length} net changes`);
  expect(rows).toContainEqual(['Course information', 'Changed', 'Course title', originalTitle, 'Revised Synthetic Course']);
  const schedule = rows.filter(r => r[0] === 'Course schedule');
  expect(schedule.find(r => r[1] === 'Changed')).toEqual(expect.arrayContaining([expect.stringContaining('Enzymes'), expect.stringContaining('Enzyme kinetics')]));
  expect(schedule.find(r => r[1] === 'Removed')[3]).toContain('Hemoglobin');
  expect(schedule.find(r => r[1] === 'Removed')[4]).toBe('(removed)');
  expect(schedule.find(r => r[1] === 'Added')[3]).toBe('(new)');
  expect(rows.some(r => r[0] === 'Coordinator & course faculty' && r[1] === 'Added')).toBe(true);
  expect(rows.some(r => r[0] === 'Grading' && r[1] === 'Added' && r[4].includes('New grade item'))).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();

  // The printable report carries the same summary.
  await page.locator('#runValidation').click();
  await expect(page.locator('#screen-report')).toBeVisible();
  expect(await summaryRows(page.locator('#reportChanges'))).toEqual(rows);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#reportChanges')).toBeVisible();
  await expect(page.locator('#reportChanges')).toContainText('Changes made in SyllabusBridge');
});

test('table edits, added rows, and removed rows appear under their table', async ({ page, openTool }) => {
  await open(page, openTool, [['Component', 'Points'], ['Exam', '50'], ['Project', '50']]);
  const editor = page.locator('.sb-structured-editor').filter({ has: page.locator('.add-structured-row') }).first();
  await editor.locator('tbody tr').first().locator('textarea').nth(1).fill('45');
  await editor.locator('tbody tr').nth(1).locator('.sb-mini-remove').click();
  await editor.locator('.add-structured-row').click();
  await editor.locator('tbody tr').last().locator('textarea').nth(0).fill('Participation');
  await editor.locator('tbody tr').last().locator('textarea').nth(1).fill('5');

  await page.locator('#reviewChanges').click();
  const rows = await summaryRows(page.getByRole('dialog', { name: 'Change summary' }));
  expect(rows).toHaveLength(await netChanges(page));
  expect(rows).toEqual(expect.arrayContaining([
    ['Project / Assignment Rubric', 'Changed', 'Row 1, Points', '50', '45'],
    ['Project / Assignment Rubric', 'Removed', 'Row 2', 'Project | 50', '(removed)'],
    ['Project / Assignment Rubric', 'Added', 'New row', '(new)', 'Participation | 5'],
  ]));
});

test('with no edits, or after undoing them, the summary says nothing has changed', async ({ page, openTool }) => {
  await open(page, openTool, syntheticSyllabus.table);
  await page.locator('#reviewChanges').click();
  const dialog = page.getByRole('dialog', { name: 'Change summary' });
  await expect(dialog).toContainText('No changes. Everything still matches');
  await page.keyboard.press('Escape');
  await setField(page.locator('#courseTitle'), 'Revised Synthetic Course');
  await page.locator('#undoEdit').click();
  await page.locator('#reviewChanges').click();
  await expect(dialog).toContainText('No changes. Everything still matches');
  expect(await summaryRows(dialog)).toHaveLength(0);
});
