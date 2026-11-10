// SyllabusBridge v2.2: warn about unaccepted Word tracked changes at upload.
// Synthetic data only.
import { test, expect, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';
import { JSZip, syllabusDocx } from '../tests/helpers/syllabus-docx.mjs';

const notice = page => page.locator('#trackedChangesNotice');
const reportNote = page => page.locator('#reportTrackedChanges');
async function upload(page, name, buffer) {
  await page.locator('#file').setInputFiles({ name, mimeType: DOCX_MIME, buffer: Buffer.from(buffer) });
  await expect(page.locator('#screen-review')).toBeVisible();
}
const clean = () => syntheticDocx(syntheticSyllabus);
// A table cell whose text was moved in Word, plus an inserted paragraph mark.
async function movedTextDocx() {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const xml = `<?xml version="1.0"?><w:document ${w}><w:body><w:p><w:r><w:t>PHA9999 - Synthetic Course</w:t></w:r></w:p>`
    + `<w:p><w:pPr><w:rPr><w:ins w:id="1" w:author="Editor" w:date="2026-01-01T00:00:00Z"/></w:rPr></w:pPr><w:r><w:t>Fall 2026</w:t></w:r></w:p>`
    + `<w:tbl><w:tr><w:tc><w:p><w:moveTo w:id="2" w:author="Editor" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Moved text</w:t></w:r></w:moveTo></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
  const zip = new JSZip(); zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'uint8array' });
}

test('a syllabus with tracked changes shows how to clear them, and work can continue', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  // The synthetic syllabus has one paragraph with a deletion and an insertion.
  await upload(page, 'tracked.docx', await syllabusDocx());
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText('2 unaccepted tracked changes in 1 paragraph.');
  await expect(notice(page)).toContainText('open the Review tab, choose Accept ▸ Accept All Changes');
  await expect(notice(page)).toContainText('You can also keep working with this file.');

  // Not a blocker: the report opens, and its printed copy carries the same note.
  await page.locator('#runValidation').click();
  await expect(page.locator('#screen-report')).toBeVisible();
  await expect(reportNote(page)).toContainText('2 unaccepted tracked changes');
  await page.emulateMedia({ media: 'print' });
  await expect(reportNote(page)).toBeVisible();
});

test('a syllabus without tracked changes shows no warning', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, 'clean.docx', await clean());
  await expect(notice(page)).toBeHidden();
  await page.locator('#runValidation').click();
  await expect(reportNote(page)).toBeHidden();
});

test('moved text and inserted paragraph marks count, and the warning clears with a clean file', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, 'moved.docx', await movedTextDocx());
  await expect(notice(page)).toContainText('2 unaccepted tracked changes in 2 paragraphs.');
  await page.locator('#screen-review').getByRole('button', { name: '← Upload' }).click();
  await upload(page, 'clean.docx', await clean());
  await expect(notice(page)).toBeHidden();
});
