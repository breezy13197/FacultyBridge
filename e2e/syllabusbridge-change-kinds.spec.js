// SyllabusBridge v2.2 kinds of change: every change is a syllabus edit unless
// faculty mark it "SyllabusBridge misread this" (a reading correction, never
// written into the Word syllabus). Synthetic data only.
import { test, expect, downloadFrom, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';

const paragraphs = syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule');
const syllabusFile = async () => ({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx({ paragraphs, table: syntheticSyllabus.table }) });
async function setField(locator, value) { await locator.fill(value); await locator.press('Tab'); }
const dialog = page => page.getByRole('dialog', { name: 'Change summary' });
// [item, kind] for each summary row; kind is the checkbox state in the pop-up, or the words in the report.
async function kinds(root) {
  return root.locator('.sb-change-table tbody tr').evaluateAll(rows => rows.map(tr => {
    const box = tr.querySelector('.sb-kind-reading');
    return [tr.cells[1].innerText.trim(), box ? (box.checked ? 'Reading correction' : 'Syllabus edit') : tr.cells[4].innerText.trim()];
  }));
}
async function openSummary(page) { await page.locator('#reviewChanges').click(); await expect(dialog(page)).toBeVisible(); }
async function closeSummary(page) { await dialog(page).getByRole('button', { name: 'Close', exact: true }).click(); }
const readingBox = (page, item) => dialog(page).locator('tbody tr').filter({ hasText: item }).locator('.sb-kind-reading');

async function start(page, openTool) {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles(await syllabusFile());
  await expect(page.locator('#screen-review')).toBeVisible();
  await setField(page.locator('#courseTitle'), 'Revised Synthetic Course');
  await setField(page.locator('#scheduleBody .s-topic').nth(1), 'Enzyme kinetics');
}

test('every change is a syllabus edit until marked; marking shows in the summary and the report', async ({ page, openTool }) => {
  await start(page, openTool);
  await openSummary(page);
  expect(await kinds(dialog(page))).toEqual([['Course title', 'Syllabus edit'], ['9/23/2026 · Enzyme kinetics', 'Syllabus edit']]);
  await expect(dialog(page)).toContainText('2 syllabus edits, 0 reading corrections');

  await readingBox(page, 'Enzyme kinetics').check();
  await expect(dialog(page)).toContainText('1 syllabus edit, 1 reading correction');
  await closeSummary(page);
  await expect(page.locator('#historyStatus')).toHaveText('Marked as a reading correction.');

  // The printable report states each row's kind in words.
  await page.locator('#runValidation').click();
  expect(await kinds(page.locator('#reportChanges'))).toEqual([['Course title', 'Syllabus edit'], ['9/23/2026 · Enzyme kinetics', 'Reading correction']]);
  await expect(page.locator('#reportChanges')).toContainText('1 syllabus edit, 1 reading correction');
  // Marking changes no data, so the change count is unchanged.
  expect(await page.evaluate(() => editorDiffCount())).toBe(2);
});

test('marking can be undone and redone like any other step', async ({ page, openTool }) => {
  await start(page, openTool);
  await openSummary(page);
  await readingBox(page, 'Enzyme kinetics').check();
  await closeSummary(page);
  await page.locator('#undoEdit').click();
  await openSummary(page);
  await expect(readingBox(page, 'Enzyme kinetics')).not.toBeChecked();
  await closeSummary(page);
  await page.locator('#redoEdit').click();
  await openSummary(page);
  await expect(readingBox(page, 'Enzyme kinetics')).toBeChecked();
});

test('a mark is cleared when its change goes away, so a later change starts as a syllabus edit', async ({ page, openTool }) => {
  await start(page, openTool);
  const original = await page.evaluate(() => state.editorBaseline.course.title);
  await openSummary(page);
  await readingBox(page, 'Course title').check();
  await closeSummary(page);
  await setField(page.locator('#courseTitle'), original);
  await setField(page.locator('#courseTitle'), 'Another Title');
  await openSummary(page);
  await expect(readingBox(page, 'Course title')).not.toBeChecked();
  expect(await page.evaluate(() => state.changeKinds)).toEqual({});
});

test('kinds are saved in the project (format 2) and restored; format 1 projects still open', async ({ page, openTool }) => {
  await start(page, openTool);
  const file = await syllabusFile();
  // Re-upload this exact copy so the project fingerprint matches on reopen.
  await page.locator('#file').setInputFiles(file);
  await expect(page.locator('#screen-review')).toBeVisible();
  await setField(page.locator('#courseTitle'), 'Revised Synthetic Course');
  await setField(page.locator('#scheduleBody .s-topic').nth(1), 'Enzyme kinetics');
  await openSummary(page);
  await readingBox(page, 'Enzyme kinetics').check();
  await closeSummary(page);
  const { text } = await downloadFrom(page, () => page.locator('#saveProject').click());
  const project = JSON.parse(text);
  expect(project.formatVersion).toBe(2);
  expect(Object.values(project.changeKinds)).toEqual(['reading-correction']);

  const reopen = async value => {
    await page.reload();
    await page.locator('#openProject').click();
    await page.locator('#projectFile').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await page.locator('#file').setInputFiles(file);
    await expect(page.locator('#screen-review')).toBeVisible();
    await openSummary(page);
    return kinds(dialog(page));
  };
  expect(await reopen(project)).toEqual([['Course title', 'Syllabus edit'], ['9/23/2026 · Enzyme kinetics', 'Reading correction']]);

  const formatOne = structuredClone(project);
  formatOne.formatVersion = 1;
  delete formatOne.changeKinds;
  expect(await reopen(formatOne)).toEqual([['Course title', 'Syllabus edit'], ['9/23/2026 · Enzyme kinetics', 'Syllabus edit']]);
});

test('a damaged kind in a project file is refused with a plain explanation', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles(await syllabusFile());
  const { text } = await downloadFrom(page, () => page.locator('#saveProject').click());
  const project = JSON.parse(text);
  project.changeKinds = { 'course:title': 'something else' };
  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  await page.locator('#openProject').click();
  await page.locator('#projectFile').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('#uploadError')).toContainText('problem found in: kinds of change');
});

// Review finding: reopening a project against a different Word file can make a
// saved change disappear (the new file already says the same thing). Its mark
// must go too, or the next edit to that item wrongly starts as a reading correction.
test('reopening against a different Word file drops marks whose change no longer exists', async ({ page, openTool }) => {
  const original = await syllabusFile();
  const alreadyCorrected = { name: 'syllabus-revised.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx({
    paragraphs: ['PHA9999 - Revised Synthetic Course', ...paragraphs.slice(1)], table: syntheticSyllabus.table }) };
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles(original);
  await expect(page.locator('#screen-review')).toBeVisible();
  await setField(page.locator('#courseTitle'), 'Revised Synthetic Course');
  await openSummary(page);
  await readingBox(page, 'Course title').check();
  await closeSummary(page);
  const { text } = await downloadFrom(page, () => page.locator('#saveProject').click());

  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  await page.locator('#openProject').click();
  await page.locator('#projectFile').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.locator('#file').setInputFiles(alreadyCorrected);
  await page.getByRole('dialog', { name: 'Different Word file?' }).getByRole('button', { name: 'Open project anyway' }).click();
  await expect(page.locator('#screen-review')).toBeVisible();
  expect(await page.evaluate(() => editorDiffCount())).toBe(0);
  expect(await page.evaluate(() => state.changeKinds)).toEqual({});

  await setField(page.locator('#courseTitle'), 'A New Intentional Title');
  await openSummary(page);
  expect(await kinds(dialog(page))).toEqual([['Course title', 'Syllabus edit']]);
});
