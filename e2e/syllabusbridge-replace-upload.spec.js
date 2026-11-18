// SyllabusBridge: choosing another file while a syllabus is open must never lose
// edits unless faculty agree to replace it. Synthetic data only.
import { test, expect, syntheticDocx, syntheticDocxBody, syntheticSyllabus, DOCX_MIME } from './fixtures.js';

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

// SyllabusBridge logs an unreadable file with console.error(err). Chromium prints the
// message, but Firefox prints only "Error", so the shared guard cannot match it by text.
// Capture the logged errors in the page instead and require exactly the expected one.
async function captureConsoleErrors(page) {
  await page.evaluate(() => {
    window.__loggedErrors = [];
    console.error = (...args) => window.__loggedErrors.push(args.map(a => a?.message ?? String(a)).join(' '));
  });
}
const loggedErrors = page => page.evaluate(() => window.__loggedErrors);

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

  test(`a damaged Word file (${via}) keeps the edited syllabus`, async ({ page, openTool }) => {
    const edited = await openEdited(page, openTool);
    await captureConsoleErrors(page);
    await give(page, brokenDocx);
    await expect(page.locator('#uploadError')).toContainText('could not be opened as a Word document');
    expect(await loggedErrors(page)).toEqual([expect.stringContaining('could not be opened as a Word document')]);
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

// Review of PR #66: gaps found in the first version of this fix.
const replaceQuestion = page => page.getByRole('dialog', { name: 'Replace the syllabus you’re editing?' });
const unsavedWork = page => page.evaluate(() => FTUnsavedWork.hasUnsavedWork());
// Run handleFile in the page with files built from { name, b64 } (no b64 = a small non-Word file).
const inPage = files => files.map(f => ({ name: f.name, b64: f.buffer ? f.buffer.toString('base64') : '' }));

test('the leave-page warning keeps protecting the draft while the replace question is open', async ({ page, openTool }) => {
  await openEdited(page, openTool);
  await page.locator('#file').setInputFiles(await docx('second.docx', otherSyllabus));
  await expect(replaceQuestion(page)).toBeVisible();
  expect(await unsavedWork(page)).toBe(true);
  await replaceQuestion(page).getByRole('button', { name: 'Cancel' }).click();
  expect(await unsavedWork(page)).toBe(true);
});

test('edits to a blank Word file are protected like any other syllabus', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'blank.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody([]) });
  await expect(page.locator('#screen-review')).toBeVisible();
  await page.locator('#courseTitle').fill('Typed Into A Blank File');
  await page.locator('#courseTitle').press('Tab');
  expect(await page.evaluate(() => editorDiffCount())).toBeGreaterThan(0);

  await page.locator('#file').setInputFiles(await docx('second.docx', otherSyllabus));
  await replaceQuestion(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#courseTitle')).toHaveValue('Typed Into A Blank File');

  await page.locator('#file').setInputFiles(pdf);
  await expect(page.locator('#uploadError')).toContainText('still open');
  await expect(page.locator('.sb-step[data-step="review"]')).toHaveAttribute('aria-disabled', 'false');
  expect(await page.evaluate(() => state.course.title)).toBe('Typed Into A Blank File');
});

test('a project saved for one Word file does not make another file look saved', async ({ page, openTool }) => {
  await openEdited(page, openTool);
  const download = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  await download;
  // A different Word file (same text, so the same edit gives the same editor contents).
  await page.locator('#file').setInputFiles(await docx('other-copy.docx', syntheticSyllabus));
  await expect(page.locator('#screen-review')).toBeVisible();
  expect(await page.evaluate(() => state.sourceName)).toBe('other-copy.docx');
  await page.locator('#courseTitle').fill('Edited Synthetic Course');
  await page.locator('#courseTitle').press('Tab');
  expect(await unsavedWork(page)).toBe(true);
  await page.locator('#file').setInputFiles(await docx('third.docx', otherSyllabus));
  await expect(replaceQuestion(page)).toBeVisible();
});

test('a non-Word file chosen during a slow read shows its error and stops the progress bar', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await page.evaluate(([slow, later]) => {
    const load = JSZip.loadAsync.bind(JSZip);
    JSZip.loadAsync = (...args) => new Promise(r => setTimeout(r, 400)).then(() => load(...args));
    const file = ({ name, b64 }) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name);
    handleFile(file(slow)); handleFile(file(later));
  }, inPage([await docx('slow.docx', syntheticSyllabus), { name: 'later.pdf' }]));
  await expect(page.locator('#uploadError')).toContainText('later.pdf');
  await expect(page.locator('#loading')).not.toHaveClass(/\bshow\b/);
  await page.waitForTimeout(600);
  await expect(page.locator('#screen-upload')).toBeVisible();
  await expect(page.locator('#uploadError')).toContainText('later.pdf');
  await expect(page.locator('#loading')).not.toHaveClass(/\bshow\b/);
});

test('an error for a file chosen right after another opens is not hidden by the earlier one', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await page.evaluate(([first, later]) => {
    const file = ({ name, b64 }) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name);
    handleFile(file(first)).then(() => handleFile(file(later)));
  }, inPage([await docx('first.docx', syntheticSyllabus), { name: 'later.pdf' }]));
  await expect(page.locator('#uploadError')).toContainText('later.pdf');
  await page.waitForTimeout(500);
  await expect(page.locator('#screen-upload')).toBeVisible();
  await expect(page.locator('#uploadError')).toContainText('later.pdf');
  await expect(page.locator('#loading')).not.toHaveClass(/\bshow\b/);
});
