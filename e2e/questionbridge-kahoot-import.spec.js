import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from './fixtures.js';

const JSZip = createRequire(import.meta.url)('../vendor/jszip-3.10.1.min.js');

// Regression check: QuestionBridge advertises Kahoot (.xlsx) upload, but the upload
// always failed because the page never loaded a spreadsheet reader. This round-trips
// QuestionBridge's own Kahoot export back through upload. All content is synthetic.

const questions = [
  '1. Which molecule transports oxygen?\n*A. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP',
  '2. Which of these are noble gases? (Select all that apply)\n*A. Neon\nB. Nitrogen\n*C. Argon\nD. Oxygen',
].join('\n\n');

// QuestionBridge logs a rejected upload with console.error(err). Chromium prints the
// message, but Firefox prints only "Error", so the shared guard cannot match it by text.
// Capture the logged errors in the page instead and require exactly the expected one.
async function captureConsoleErrors(page) {
  await page.evaluate(() => {
    window.__loggedErrors = [];
    console.error = (...args) => window.__loggedErrors.push(args.map(a => a?.message ?? String(a)).join(' '));
  });
}
const loggedErrors = page => page.evaluate(() => window.__loggedErrors);

async function editorContents(page) {
  return {
    stem: await page.locator('#stem').inputValue(),
    type: await page.locator('#questionType').inputValue(),
    answers: await page.locator('#answersArea .qb-answer-input').evaluateAll(els => els.map(e => e.value)),
    correct: await page.locator('#answersArea .qb-answer-marker').evaluateAll(els => els.map(e => e.getAttribute('aria-pressed') === 'true')),
  };
}

test('QuestionBridge: a Kahoot spreadsheet export can be uploaded again with its answers and answer key', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(questions);
  await page.locator('#parsePaste').click();
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(2);
  // Pasted text reads two starred answers as one-answer; make question 2 select-all.
  await page.locator('#questionList .qb-question-item').nth(1).click();
  await page.locator('#questionType').selectOption('mr');

  // Download only the Kahoot export.
  await page.locator('[data-screen="export"]').click();
  const kahootButton = page.locator('#exportGrid button:has-text("Download")').filter({ hasText: /Kahoot/i })
    .or(page.locator('#exportGrid > *').filter({ hasText: /Kahoot/i }).locator('button:has-text("Download")'));
  const pending = page.waitForEvent('download');
  await kahootButton.first().click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/kahoot\.xlsx$/);
  const buffer = fs.readFileSync(await download.path());
  await download.delete();

  // Upload the downloaded spreadsheet and replace the current questions with it.
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#fileInput').setInputFiles({
    name: 'synthetic-kahoot.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await page.locator('#importReplaceBtn').click();

  const items = page.locator('#questionList .qb-question-item');
  await expect(items).toHaveCount(2);

  await items.nth(0).click();
  expect(await editorContents(page)).toEqual({
    stem: 'Which molecule transports oxygen?',
    type: 'mc',
    answers: ['Hemoglobin', 'Glycogen', 'DNA', 'ATP'],
    correct: [true, false, false, false],
  });

  await items.nth(1).click();
  const second = await editorContents(page);
  expect(second.stem).toContain('Which of these are noble gases?');
  expect(second).toMatchObject({
    type: 'mr',
    answers: ['Neon', 'Nitrogen', 'Argon', 'Oxygen'],
    correct: [true, false, true, false],
  });
});

test('QuestionBridge: a spreadsheet that is not a Kahoot quiz gets a plain explanation', async ({ page, openTool }) => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row></sheetData></worksheet>');
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await captureConsoleErrors(page);
  await page.locator('#fileInput').setInputFiles({
    name: 'synthetic-roster.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await expect(page.locator('#parseStatus')).toContainText('This spreadsheet does not look like a Kahoot quiz.');
  await expect(page.locator('#parseStatus')).not.toContainText('.docx or .txt');
  expect(await loggedErrors(page)).toEqual([expect.stringContaining('This spreadsheet does not look like a Kahoot quiz.')]);
});

// Excel (and Kahoot's own import template) store text in a shared-strings list, put
// instructions above the header, and may start the table in a later column.
test('QuestionBridge: an Excel-saved Kahoot template with shared text is read correctly', async ({ page, openTool }) => {
  const strings = ['Quiz template instructions', 'Question - max 120 characters', 'Answer 1 - max 75 characters',
    'Answer 2 - max 75 characters', 'Answer 3 - max 75 characters', 'Answer 4 - max 75 characters',
    'Time limit (sec)', 'Correct answer(s) - choose at least one',
    'Which vitamin is made in skin exposed to sunlight?', 'Vitamin A', 'Vitamin D', 'Vitamin C',
    'Which are primary colors of light?', 'Red', 'Yellow', 'Blue', 'Brown', '1,3'];
  const s = text => strings.indexOf(text);
  const cell = (ref, text) => `<c r="${ref}" t="s"><v>${s(text)}</v></c>`;
  const num = (ref, n) => `<c r="${ref}"><v>${n}</v></c>`;
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    `<row r="1">${cell('B1', 'Quiz template instructions')}</row>` +
    `<row r="3">${cell('B3', 'Question - max 120 characters')}${cell('C3', 'Answer 1 - max 75 characters')}${cell('D3', 'Answer 2 - max 75 characters')}${cell('E3', 'Answer 3 - max 75 characters')}${cell('F3', 'Answer 4 - max 75 characters')}${cell('G3', 'Time limit (sec)')}${cell('H3', 'Correct answer(s) - choose at least one')}</row>` +
    `<row r="4">${num('A4', 1)}${cell('B4', 'Which vitamin is made in skin exposed to sunlight?')}${cell('C4', 'Vitamin A')}${cell('D4', 'Vitamin D')}${cell('E4', 'Vitamin C')}${num('G4', 20)}${num('H4', 2)}</row>` +
    `<row r="5">${num('A5', 2)}${cell('B5', 'Which are primary colors of light?')}${cell('C5', 'Red')}${cell('D5', 'Yellow')}${cell('E5', 'Blue')}${cell('F5', 'Brown')}${num('G5', 30)}${cell('H5', '1,3')}</row>` +
    '</sheetData></worksheet>';
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId3"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/quiz.xml"/></Relationships>');
  zip.file('xl/worksheets/quiz.xml', sheet);
  zip.file('xl/sharedStrings.xml', '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    strings.map((t, i) => i === s('Blue') ? '<si><r><t>Bl</t></r><r><rPr><b/></rPr><t>ue</t></r></si>' : `<si><t>${t}</t></si>`).join('') + '</sst>');

  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#fileInput').setInputFiles({
    name: 'synthetic-kahoot-template.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  const items = page.locator('#questionList .qb-question-item');
  await expect(items).toHaveCount(2);
  await items.nth(0).click();
  expect(await editorContents(page)).toEqual({
    stem: 'Which vitamin is made in skin exposed to sunlight?', type: 'mc',
    answers: ['Vitamin A', 'Vitamin D', 'Vitamin C'], correct: [false, true, false],
  });
  await items.nth(1).click();
  expect(await editorContents(page)).toEqual({
    stem: 'Which are primary colors of light?', type: 'mr',
    answers: ['Red', 'Yellow', 'Blue', 'Brown'], correct: [true, false, true, false],
  });
});

test('QuestionBridge: a file named .xlsx that is not a real spreadsheet gets save-as steps', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await captureConsoleErrors(page);
  await page.locator('#fileInput').setInputFiles({
    name: 'synthetic-not-a-spreadsheet.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('Question,Answer 1\nThis is plain text, not a workbook.,Yes\n'),
  });
  await expect(page.locator('#parseStatus')).toContainText('This .xlsx file could not be opened.');
  await expect(page.locator('#parseStatus')).toContainText('File → Save As → Excel Workbook (.xlsx)');
  await expect(page.locator('#parseStatus')).not.toContainText('.docx or .txt');
  expect(await loggedErrors(page)).toEqual([expect.stringContaining('This .xlsx file could not be opened.')]);
});
