import { test, expect } from './fixtures.js';

// Regression check for legacy ExamSoft .rtf uploads. All questions are synthetic.
//
// 1. A Poll Everywhere "ExamSoft legacy" export puts the title and the numbered stem on
//    one line ("Title: Question 7 1. ..."). QuestionBridge found no question numbers and
//    refused the file.
// 2. A Word-saved ExamSoft import file puts "Title:" on its own line before each question
//    and a "~" rationale before the answer choices. The title was glued onto the previous
//    question's stem, the rationale became stem text, the font table leaked into the
//    text, and Word's source line wrapping split words in two.

const pollRtf = '{\\rtf1\\ansi\\uc1\\deff0{\\fonttbl{\\f0 Calibri;}}\\fs22 '
  + 'Title: Question 7 1. Which molecule carries oxygen in red blood cells?\\line a. Glucose\\line *b. Hemoglobin\\line c. Insulin\\line d. Collagen\\line \\line '
  + 'Title: Question 2 2. Which organelle makes most of the cell\\rquote s ATP?\\line *a. Mitochondrion\\line b. Ribosome\\line c. Nucleus\\line d. Golgi apparatus\\line \\line '
  + 'Title: Question 3 3. Which vitamin is needed to clot blood?\\line a. Vitamin C\\line b. Vitamin D\\line *c. Vitamin K\\line d. Vitamin B12\\line \\line }';

// Word wraps long RTF source lines at about 250 characters, even mid-word. Those raw
// line breaks are not text and must be ignored.
const wordRtf = [
  '{\\rtf1\\adeflang1025\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\froman\\fcharset0\\fprq2{\\*\\panose 02020603050405020304}Times New Roman;}{\\f1\\fswiss Arial;}}',
  '{\\colortbl;\\red0\\green0\\blue0;}{\\*\\rsidtbl \\rsid123\\rsid456}{\\*\\generator Microsoft Word;}{\\info{\\author Synthetic Author}}',
  '\\pard\\plain \\f1\\fs22 Title: Enzyme that joins molecules',
  '\\par 1. Which enzyme class joins two molecules using energy from ATP?\\hich\\f1 ',
  '\\par ~ A ligase joins two molecules and uses ATP to do it. A hydrolase breaks a bond with water instead, so it is a tempting but wrong choice. T',
  'ransferases move a group from one molecule to another.',
  '\\par a. Transferase',
  '\\par *b. Ligase',
  '\\par c. Hydrolase',
  '\\par d. Lyase',
  '\\par ',
  '\\par Title: Enzyme that moves a phosphate',
  '\\par 2. A kinase moves a phosphate group from ATP to a protein. To which class does it belong?',
  '\\par ~ Moving a group between two molecules defines a transferase.',
  '\\par a. Hydrolase',
  '\\par *b. Transferase',
  '\\par c. Isomerase',
  '\\par d. Ligase',
  '\\par }',
].join('\r\n');

async function upload(page, name, rtf) {
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#fileInput').setInputFiles({ name, mimeType: 'application/rtf', buffer: Buffer.from(rtf, 'latin1') });
}

async function openQuestion(page, index) {
  await page.locator('#questionList .qb-question-item').nth(index).click();
  return {
    title: await page.locator('#qTitle').inputValue(),
    stem: await page.locator('#stem').inputValue(),
    rationale: await page.locator('#rationale').inputValue(),
    answers: await page.locator('#answersArea .qb-answer-input').evaluateAll(els => els.map(e => e.value)),
    correct: await page.locator('#answersArea .qb-answer-marker').evaluateAll(els => els.map(e => e.getAttribute('aria-pressed') === 'true')),
  };
}

test('QuestionBridge: a Poll Everywhere legacy ExamSoft .rtf loads with titles, stems, and answer keys', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await upload(page, 'synthetic-poll-everywhere-examsoft-legacy.rtf', pollRtf);
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(3);

  const first = await openQuestion(page, 0);
  expect(first.title).toBe('Question 7');
  expect(first.stem).toBe('Which molecule carries oxygen in red blood cells?');
  expect(first.answers).toEqual(['Glucose', 'Hemoglobin', 'Insulin', 'Collagen']);
  expect(first.correct).toEqual([false, true, false, false]);

  const second = await openQuestion(page, 1);
  expect(second.stem).toBe('Which organelle makes most of the cell’s ATP?');
  expect(second.correct).toEqual([true, false, false, false]);
});

test('QuestionBridge: a Word-saved ExamSoft .rtf keeps title and rationale out of the stem', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await upload(page, 'synthetic-examsoft-import.rtf', wordRtf);
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(2);

  const first = await openQuestion(page, 0);
  expect(first.title).toBe('Enzyme that joins molecules');
  expect(first.stem).toBe('Which enzyme class joins two molecules using energy from ATP?');
  expect(first.rationale).toBe('A ligase joins two molecules and uses ATP to do it. A hydrolase breaks a bond with water instead, so it is a tempting but wrong choice. Transferases move a group from one molecule to another.');
  expect(first.answers).toEqual(['Transferase', 'Ligase', 'Hydrolase', 'Lyase']);
  expect(first.correct).toEqual([false, true, false, false]);

  const second = await openQuestion(page, 1);
  expect(second.title).toBe('Enzyme that moves a phosphate');
  expect(second.stem).toBe('A kinase moves a phosphate group from ATP to a protein. To which class does it belong?');
  expect(second.rationale).toBe('Moving a group between two molecules defines a transferase.');
  expect(second.correct).toEqual([false, true, false, false]);
  for (const q of [first, second]) expect(q.stem).not.toMatch(/Title:|~|Times New Roman|Arial/);
});
