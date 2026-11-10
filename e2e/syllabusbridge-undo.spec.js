// SyllabusBridge v2.2 undo/redo in the structured editor. Synthetic data only.
import { test, expect, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';

const topics = page => page.locator('#scheduleBody .s-topic');
const read = page => page.evaluate(() => ({
  title: state.course.title,
  topics: state.schedule.map(e => e.topic),
  changes: editorDiffCount(),
}));

async function openSyllabus(page, openTool) {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syntheticSyllabus) });
  await expect(page.locator('#screen-review')).toBeVisible();
  return read(page);
}
// Course and schedule text fields save when faculty leave them (Tab), as they do today.
async function setField(locator, value) { await locator.fill(value); await locator.press('Tab'); }
// Three different kinds of change: a course field, a schedule cell, and a new row.
async function makeThreeEdits(page) {
  await setField(page.locator('#courseTitle'), 'Revised Synthetic Course');
  await setField(topics(page).nth(1), 'Enzyme kinetics');
  await page.locator('#addScheduleRow').click();
}

test('undo three edits returns to the parsed syllabus; redo brings them all back', async ({ page, openTool }) => {
  const original = await openSyllabus(page, openTool);
  const undo = page.locator('#undoEdit'), redo = page.locator('#redoEdit');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await makeThreeEdits(page);
  const edited = await read(page);
  expect(edited.title).toBe('Revised Synthetic Course');
  expect(edited.topics).toHaveLength(original.topics.length + 1);
  expect(edited.changes).toBeGreaterThan(0);

  for (let i = 0; i < 3; i++) await undo.click();
  expect(await read(page)).toEqual(original);
  await expect(page.locator('#editCount')).toHaveText('0 net changes');
  await expect(page.locator('#courseTitle')).toHaveValue(original.title);
  await expect(topics(page).nth(1)).toHaveValue(original.topics[1]);
  await expect(undo).toBeDisabled();
  await expect(page.locator('#historyStatus')).toHaveText('Undid the last change.');

  for (let i = 0; i < 3; i++) await redo.click();
  expect(await read(page)).toEqual(edited);
  await expect(page.locator('#courseTitle')).toHaveValue('Revised Synthetic Course');
  await expect(redo).toBeDisabled();
  await expect(page.locator('#liveValidation')).toHaveText('Changes not revalidated');
});

test('a new edit after undo clears the redo history', async ({ page, openTool }) => {
  await openSyllabus(page, openTool);
  await makeThreeEdits(page);
  await page.locator('#undoEdit').click();
  await expect(page.locator('#redoEdit')).toBeEnabled();
  await setField(topics(page).nth(0), 'Protein structure');
  await expect(page.locator('#redoEdit')).toBeDisabled();
  await expect(page.locator('#undoEdit')).toBeEnabled();
});

test('continuous typing in one field is one undo step', async ({ page, openTool }) => {
  await openSyllabus(page, openTool);
  const dates = () => page.evaluate(() => state.schedule.map(e => e.date));
  const before = await dates();
  // The date field saves on every keystroke, so this is many saves in a row.
  const field = page.locator('#scheduleBody .s-date').nth(2);
  await field.fill('');
  await field.pressSequentially('9/30/2026');
  expect((await dates())[2]).toBe('9/30/2026');
  await page.locator('#undoEdit').click();
  expect(await dates()).toEqual(before);
  await expect(page.locator('#undoEdit')).toBeDisabled();
});

test('keyboard shortcuts undo and redo, but leave typing undo inside text boxes alone', async ({ page, openTool }) => {
  const original = await openSyllabus(page, openTool);
  await makeThreeEdits(page);
  const edited = await read(page);

  // Outside a text box, Ctrl+Z undoes the last whole edit (the added row).
  await page.locator('#reviewNav').click();
  await page.keyboard.press('ControlOrMeta+z');
  expect((await read(page)).topics.length).toBe(original.topics.length);
  await page.keyboard.press('ControlOrMeta+y');
  expect((await read(page)).topics.length).toBe(edited.topics.length);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await read(page)).toEqual(edited);
  await expect(page.locator('#historyStatus')).toHaveText('Redid the change.');

  // Inside a text box, Ctrl+Z belongs to the browser's own typing undo, so
  // SyllabusBridge's whole-edit undo must not run.
  await topics(page).nth(0).click();
  await page.keyboard.type('x');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#historyStatus')).toHaveText('Redid the change.');
  expect((await read(page)).topics.length).toBe(edited.topics.length);
});

test('Reset edits can itself be undone', async ({ page, openTool }) => {
  await openSyllabus(page, openTool);
  await makeThreeEdits(page);
  const edited = await read(page);
  await page.locator('#resetEdits').click();
  await page.getByRole('dialog', { name: 'Reset all edits?' }).getByRole('button', { name: 'Reset edits' }).click();
  expect((await read(page)).changes).toBe(0);
  await page.locator('#undoEdit').click();
  expect(await read(page)).toEqual(edited);
});

test('uploading another syllabus starts a fresh undo history', async ({ page, openTool }) => {
  await openSyllabus(page, openTool);
  await makeThreeEdits(page);
  await page.evaluate(() => { state.dirty = false; });
  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  await page.locator('#file').setInputFiles({ name: 'second.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syntheticSyllabus) });
  await expect(page.locator('#screen-review')).toBeVisible();
  await expect(page.locator('#undoEdit')).toBeDisabled();
  await expect(page.locator('#redoEdit')).toBeDisabled();
});

// Review finding: undo must keep each added structured-table row's identity, or
// the visible editor and the exported change records disagree.
test('undo and redo keep added table rows linked to their change records', async ({ page, openTool }) => {
  const rubric = { paragraphs: syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule'), table: [['Component', 'Points'], ['Exam', '50'], ['Project', '50']] };
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'rubric.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(rubric) });
  await expect(page.locator('#screen-review')).toBeVisible();
  const editor = page.locator('.sb-structured-editor').filter({ has: page.locator('.add-structured-row') }).first();
  const lastRow = () => editor.locator('tbody tr').last();
  // Every visible added row must have exactly one matching add-row record, holding its current text.
  const linkage = () => page.evaluate(() => {
    const rows = state.structuredTables.flatMap(t => t.rows.filter(r => r.rowIndex == null));
    const adds = state.tableMutations.filter(m => m.action === 'add-row' && m.active !== false);
    return {
      rows: rows.map(r => ({ id: r.editorRowId ?? null, text: r.cells.map(c => c.text) })),
      adds: adds.map(m => ({ id: m.editorRowId, text: m.row.cells.map(c => c.text) })),
      changes: editorDiffCount(),
      exportedAdds: buildFacultyBridgeCourse().tableMutations.filter(m => m.action === 'add-row' && m.active !== false).length,
    };
  });

  // 1. Add and fill in a rubric row.
  await editor.locator('.add-structured-row').click();
  await lastRow().locator('textarea').nth(0).fill('Participation');
  await lastRow().locator('textarea').nth(1).fill('10');
  // 2. Change the course title, then undo that change.
  await page.locator('#courseTitle').fill('Revised Synthetic Course');
  await page.locator('#courseTitle').press('Tab');
  await page.locator('#undoEdit').click();
  let seen = await linkage();
  expect(seen.rows).toHaveLength(1);
  expect(seen.rows[0].id).not.toBeNull();
  expect(seen.adds).toEqual(seen.rows);

  // 3. Edit the restored row again: its add-row record must follow.
  await lastRow().locator('textarea').nth(1).fill('15');
  seen = await linkage();
  expect(seen.adds).toEqual(seen.rows);
  expect(seen.rows[0].text).toEqual(['Participation', '15']);

  // Redo and undo again keep the link too.
  await page.locator('#undoEdit').click();
  await page.locator('#redoEdit').click();
  seen = await linkage();
  expect(seen.adds).toEqual(seen.rows);

  // 4. Delete the row: no phantom addition remains in the editor or the Course JSON.
  await lastRow().locator('.sb-mini-remove').click();
  seen = await linkage();
  expect(seen.rows).toHaveLength(0);
  expect(seen.adds).toHaveLength(0);
  expect(seen.exportedAdds).toBe(0);
  expect(seen.changes).toBe(0);
});
