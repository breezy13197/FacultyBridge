// SyllabusBridge: choosing another file while a syllabus is open must never lose
// edits unless faculty agree to replace it. Synthetic data only.
import { test, expect, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';

const otherSyllabus = { ...syntheticSyllabus, paragraphs: ['PHA8888 - Second Synthetic Course', ...syntheticSyllabus.paragraphs.slice(1)] };
const pdf = { name: 'syllabus.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic, not a Word file') };
const brokenDocx = { name: 'damaged.docx', mimeType: DOCX_MIME, buffer: Buffer.from('this is not a zip file') };
const docx = async (name, content) => ({ name, mimeType: DOCX_MIME, buffer: await syntheticDocx(content) });
const read = page => page.evaluate(() => ({ title: state.course.title, code: state.course.code, changes: editorDiffCount(), lines: state.lines.length }));

// The two ways faculty give SyllabusBridge a file: the file picker and drag-and-drop.
const entryPoints = {
  picker: (page, file) => page.locator('#file').setInputFiles(file),
  drop: (page, file) => page.evaluate(({ name, mimeType, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), data = new DataTransfer();
    data.items.add(new File([bytes], name, { type: mimeType }));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  }, { name: file.name, mimeType: file.mimeType, b64: file.buffer.toString('base64') }),
};

async function openEdited(page, openTool) {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles(await docx('syllabus.docx', syntheticSyllabus));
  await expect(page.locator('#screen-review')).toBeVisible();
  await page.locator('#courseTitle').fill('Edited Synthetic Course');
  await page.locator('#courseTitle').press('Tab');
  const edited = await read(page);
  expect(edited.changes).toBeGreaterThan(0);
  return edited;
}
// The edited syllabus is still open, still counted as edited, undoable, and saveable.
// Saving is optional: once saved to a project, nothing is left to lose.
async function expectDraftKept(page, edited, { save = true } = {}) {
  expect(await read(page)).toEqual(edited);
  await page.locator('.sb-step[data-step="review"]').click();
  await expect(page.locator('#screen-review')).toBeVisible();
  await expect(page.locator('#courseTitle')).toHaveValue('Edited Synthetic Course');
  await expect(page.locator('#editCount')).toHaveText(`${edited.changes} net change${edited.changes === 1 ? '' : 's'}`);
  await expect(page.locator('#undoEdit')).toBeEnabled();
  if (!save) return;
  const download = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  expect((await download).suggestedFilename()).toMatch(/SyllabusBridge-project\.json$/);
}

for (const [via, give] of Object.entries(entryPoints)) {
  test(`a non-Word file (${via}) keeps the edited syllabus`, async ({ page, openTool }) => {
    const edited = await openEdited(page, openTool);
    await give(page, pdf);
    await expect(page.locator('#uploadError')).toContainText('accepts .docx Word syllabi only');
    await expect(page.locator('#uploadError')).toContainText('still open');
    await expectDraftKept(page, edited);
  });

  test(`a damaged Word file (${via}) keeps the edited syllabus`, async ({ page, openTool, guard }) => {
    const edited = await openEdited(page, openTool);
    await give(page, brokenDocx);
    await expect(page.locator('#uploadError')).toContainText('could not be opened as a Word document');
    guard.allowConsoleError('could not be opened as a Word document');
    await expectDraftKept(page, edited);
  });

  test(`a good Word file (${via}) asks before replacing edits`, async ({ page, openTool }) => {
    const edited = await openEdited(page, openTool);
    const ask = page.getByRole('dialog', { name: 'Replace the syllabus you’re editing?' });

    await give(page, await docx('second.docx', otherSyllabus));
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toBeHidden();
    // Cancel returns to the syllabus being edited.
    await expect(page.locator('#screen-review')).toBeVisible();
    await expectDraftKept(page, edited, { save: false });

    await give(page, await docx('second.docx', otherSyllabus));
    await ask.getByRole('button', { name: 'Replace syllabus' }).click();
    await expect(page.locator('#screen-review')).toBeVisible();
    await expect(page.locator('#courseTitle')).toHaveValue('Second Synthetic Course');
    await expect(page.locator('#editCount')).toHaveText('0 net changes');
  });
}

test('without unsaved edits a good Word file opens straight away', async ({ page, openTool }) => {
  await openEdited(page, openTool);
  // Saved to a project file, so nothing would be lost.
  const download = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  await download;
  await page.locator('#file').setInputFiles(await docx('second.docx', otherSyllabus));
  await expect(page.locator('#screen-review')).toBeVisible();
  await expect(page.locator('#courseTitle')).toHaveValue('Second Synthetic Course');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('when two files are chosen quickly, the last one chosen is opened', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  const [first, second] = await Promise.all([docx('first.docx', syntheticSyllabus), docx('second.docx', otherSyllabus)]);
  await page.evaluate(([a, b]) => {
    const file = ({ name, b64 }) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name);
    handleFile(file(a)); handleFile(file(b));
  }, [first, second].map(f => ({ name: f.name, b64: f.buffer.toString('base64') })));
  await expect(page.locator('#screen-review')).toBeVisible();
  await expect(page.locator('#courseTitle')).toHaveValue('Second Synthetic Course');
  expect(await page.evaluate(() => state.sourceName)).toBe('second.docx');
});
