// SyllabusBridge v2.2 save and reopen a project. Synthetic data only.
import { test, expect, downloadFrom, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';

const paragraphs = syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule');
const rubricDoc = rows => syntheticDocx({ paragraphs, table: [['Component', 'Points'], ...rows] });
const docxFile = async (name, rows = [['Exam', '50'], ['Project', '50']]) => ({ name, mimeType: DOCX_MIME, buffer: await rubricDoc(rows) });
const jsonFile = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });

const editor = page => page.locator('.sb-structured-editor').filter({ has: page.locator('.add-structured-row') }).first();
// What a faculty member would expect to get back after reopening.
const read = page => page.evaluate(() => ({
  title: state.course.title,
  changes: editorDiffCount(),
  rubric: state.structuredTables.flatMap(t => t.rows.map(r => ({ id: r.rowIndex == null ? r.editorRowId : r.rowIndex, text: r.cells.map(c => c.text) }))),
  adds: state.tableMutations.filter(m => m.action === 'add-row' && m.active !== false).map(m => ({ id: m.editorRowId, text: m.row.cells.map(c => c.text) })),
  updates: state.tableMutations.filter(m => m.action === 'update-cell' && m.active !== false).map(m => [m.sourceRowIndex, m.sourceColumnIndex, m.newValue]),
}));
const unsaved = page => page.evaluate(() => FTUnsavedWork.hasUnsavedWork());

async function upload(page, file) {
  await page.locator('#file').setInputFiles(file);
  await expect(page.locator('#screen-review')).toBeVisible();
}
// A title change, an edited source cell, and a new filled-in row.
async function makeEdits(page) {
  await page.locator('#courseTitle').fill('Revised Synthetic Course');
  await page.locator('#courseTitle').press('Tab');
  await editor(page).locator('tbody tr').first().locator('textarea').nth(1).fill('45');
  await editor(page).locator('.add-structured-row').click();
  const added = editor(page).locator('tbody tr').last().locator('textarea');
  await added.nth(0).fill('Participation');
  await added.nth(1).fill('5');
}
async function saveProject(page) {
  const { name, text } = await downloadFrom(page, () => page.locator('#saveProject').click());
  return { name, project: JSON.parse(text), text };
}
async function openProject(page, file) {
  await page.locator('#screen-upload').getByRole('button', { name: 'Open SyllabusBridge project' }).click();
  await page.locator('#projectFile').setInputFiles(file);
}

test('save a project, reopen it with the same Word file, and get every edit back', async ({ page, openTool }) => {
  // One copy of the Word file: each new copy carries its own save time, so it is a different file.
  const syllabus = await docxFile('rubric.docx');
  await openTool('syllabusbridge');
  await upload(page, syllabus);
  await makeEdits(page);
  const before = await read(page);
  expect(before.adds).toHaveLength(1);
  expect(before.changes).toBeGreaterThan(0);

  const { name, project } = await saveProject(page);
  expect(name).toBe('PHA9999-SyllabusBridge-project.json');
  expect(project).toMatchObject({ format: 'SyllabusBridge project', formatVersion: 2, savedBy: { tool: 'SyllabusBridge' }, source: { fileName: 'rubric.docx' } });
  expect(project.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(project.source.size).toBeGreaterThan(0);
  expect(project.editor.course.title).toBe('Revised Synthetic Course');
  expect(project.tableMutations.some(m => m.action === 'add-row')).toBe(true);
  await expect(page.locator('#historyStatus')).toContainText('Project saved as PHA9999-SyllabusBridge-project.json');
  expect(await unsaved(page)).toBe(false);

  // Start again in a fresh page, as if the browser had been closed.
  await page.reload();
  await openProject(page, jsonFile(name, project));
  await expect(page.locator('#projectPending')).toContainText('rubric.docx');
  await upload(page, syllabus);
  expect(await read(page)).toEqual(before);
  await expect(page.locator('#courseTitle')).toHaveValue('Revised Synthetic Course');
  await expect(editor(page).locator('tbody tr').last().locator('textarea').nth(0)).toHaveValue('Participation');
  await expect(page.locator('#editCount')).toHaveText(`${before.changes} net change${before.changes === 1 ? '' : 's'}`);
  await expect(page.locator('#historyStatus')).toContainText('Opened the project saved');
  await expect(page.locator('#projectPending')).toBeHidden();
  await expect(page.locator('#undoEdit')).toBeDisabled();
  expect(await unsaved(page)).toBe(false);

  // The reopened added row is still linked to its change record.
  await editor(page).locator('tbody tr').last().locator('.sb-mini-remove').click();
  const after = await read(page);
  expect(after.adds).toHaveLength(0);
  expect(after.rubric.some(r => r.text[0] === 'Participation')).toBe(false);
});

test('a different Word file is warned about before any saved edit is applied', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docxFile('rubric.docx'));
  await makeEdits(page);
  const { name, project } = await saveProject(page);

  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  await openProject(page, jsonFile(name, project));
  const other = await docxFile('rubric-2027.docx', [['Exam', '60'], ['Project', '40']]);
  await page.locator('#file').setInputFiles(other);
  const warning = page.getByRole('dialog', { name: 'Different Word file?' });
  await expect(warning).toContainText('rubric.docx');
  await warning.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#screen-upload')).toBeVisible();
  expect(await page.evaluate(() => state.lines.length)).toBe(0);
  await expect(page.locator('#projectPending')).toBeVisible();

  await page.locator('#file').setInputFiles(other);
  await page.getByRole('dialog', { name: 'Different Word file?' }).getByRole('button', { name: 'Open project anyway' }).click();
  await expect(page.locator('#screen-review')).toBeVisible();
  await expect(page.locator('#courseTitle')).toHaveValue('Revised Synthetic Course');
  await expect(page.locator('#historyStatus')).toContainText('different Word file');
});

test('files that are not SyllabusBridge projects get a plain explanation', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  const error = page.locator('#uploadError');
  await openProject(page, jsonFile('notes.json', 'not json at all'));
  await expect(error).toContainText('Project could not be opened');
  await expect(error).toContainText('could not be read as a SyllabusBridge project');

  await openProject(page, jsonFile('course.json', { course: { code: 'PHA9999' }, schedule: [] }));
  await expect(error).toContainText('A Course JSON export cannot be reopened here');

  await openProject(page, jsonFile('future.json', { format: 'SyllabusBridge project', formatVersion: 99, savedBy: { version: '9.0' } }));
  await expect(error).toContainText('saved by a newer SyllabusBridge (version 9.0)');

  await openProject(page, jsonFile('broken.json', { format: 'SyllabusBridge project', formatVersion: 1 }));
  await expect(error).toContainText('some saved edits are missing');
  await expect(page.locator('#projectPending')).toBeHidden();
});

test('the leave-page warning tracks edits made since the last save', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docxFile('rubric.docx'));
  expect(await unsaved(page)).toBe(false);
  await makeEdits(page);
  expect(await unsaved(page)).toBe(true);
  await saveProject(page);
  expect(await unsaved(page)).toBe(false);
  await page.locator('#courseTitle').fill('Another Title');
  await page.locator('#courseTitle').press('Tab');
  expect(await unsaved(page)).toBe(true);
  await page.locator('#undoEdit').click();
  expect(await unsaved(page)).toBe(false);
});

// Review findings: identity must be proven by two matching fingerprints, and
// damaged projects must be refused before anything on screen changes.
test('without file fingerprints, reopening always asks before applying edits', async ({ page, openTool }) => {
  // Simulate a browser that cannot compute SHA-256 fingerprints.
  await page.addInitScript(() => Object.defineProperty(Crypto.prototype, 'subtle', { get: () => undefined }));
  const original = await docxFile('rubric.docx', [['Exam', '50'], ['Project', '50']]);
  const sameSizeDifferent = await docxFile('rubric.docx', [['Exam', '60'], ['Project', '40']]);
  expect(sameSizeDifferent.buffer.length).toBe(original.buffer.length);
  await openTool('syllabusbridge');
  await upload(page, original);
  await makeEdits(page);
  const { name, project } = await saveProject(page);
  expect(project.source.sha256).toBeNull();

  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  await openProject(page, jsonFile(name, project));
  await page.locator('#file').setInputFiles(sameSizeDifferent);
  const notVerified = page.getByRole('dialog', { name: 'Word file not verified' });
  await expect(notVerified).toContainText('could not confirm');
  await notVerified.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.evaluate(() => state.lines.length)).toBe(0);

  // Even the identical file cannot be proven identical without fingerprints.
  await page.locator('#file').setInputFiles(original);
  await page.getByRole('dialog', { name: 'Word file not verified' }).getByRole('button', { name: 'Open project anyway' }).click();
  await expect(page.locator('#courseTitle')).toHaveValue('Revised Synthetic Course');
});

test('damaged project contents are refused with a plain explanation before anything changes', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docxFile('rubric.docx'));
  const { name, project } = await saveProject(page);
  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  const damaged = [
    ['structured tables', p => { p.editor.structuredTables = [null]; }],
    ['structured tables', p => { p.editor.structuredTables[0].rows[0].cells = [{ columnIndex: 0 }]; }],
    ['change records', p => { p.tableMutations = [{ key: 'add:0:x', action: 'add-row', tableIndex: 0, editorRowId: 'x' }]; }],
    ['faculty', p => { p.editor.faculty = [5]; }],
    ['course details', p => { p.editor.course = 'PHA9999'; }],
  ];
  for (const [where, damage] of damaged) {
    const copy = structuredClone(project);
    damage(copy);
    await openProject(page, jsonFile(name, copy));
    await expect(page.locator('#uploadError')).toContainText(`problem found in: ${where}`);
    await expect(page.locator('#projectPending')).toBeHidden();
    expect(await page.evaluate(() => state.sourceName)).toBe('rubric.docx');
  }
});
