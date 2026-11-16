import { createRequire } from 'node:module';
import { test, expect, DOCX_MIME } from './fixtures.js';

const JSZip = createRequire(import.meta.url)('../vendor/jszip-3.10.1.min.js');

// Regression check for ExamSoft-style Word (.docx) question files. All questions are synthetic.
//
// The plain-text and .rtf reader already handles these layouts; the Word reader did not:
// 1. "Title:" on its own line before a question was glued onto the previous question's
//    stem, and the question kept the generic "Question N" title.
// 2. "Title: Question 7 1. Stem..." on one line was not seen as a question at all.
// 3. A "~" rationale just before the answer choices became stem text. (As in the text
//    reader, a "~" line elsewhere in a stem, such as "~ 10 mg/kg", stays stem text.)
// 4. Standalone "Type: MA" and "Category:" lines were glued onto the previous stem.

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t, bold = false) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
// Each paragraph is a string, or an array of [text, bold] runs.
// { auto: 'text' } is a paragraph in a Word automatic numbered list (1., 2., ...).
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const autoNumbered = '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>';
const para = p => p?.auto !== undefined ? `<w:p>${autoNumbered}${run(p.auto)}</w:p>`
  : `<w:p>${typeof p === 'string' ? run(p) : p.map(([t, b]) => run(t, b)).join('')}</w:p>`;
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>`
  + '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
  + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';

async function docx(paragraphs) {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>`
    + paragraphs.map(para).join('') + '</w:body></w:document>';
  const zip = new JSZip();
  zip.file('word/document.xml', xml);
  if (paragraphs.some(p => p?.auto !== undefined)) zip.file('word/numbering.xml', numbering);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

const examsoftParagraphs = [
  'Title: Enzyme that joins molecules',
  [['1. Which enzyme class joins two molecules using energy from ', false], ['ATP', true], ['?', false]],
  '~ A ligase joins two molecules and uses ATP to do it. A hydrolase breaks a bond with water instead. Transferases move a group from one molecule to another.',
  'a. Transferase',
  '*b. Ligase',
  'c. Hydrolase',
  'd. Lyase',
  '',
  'Title: Noble gases',
  'Type: MA',
  'Category: Chemistry',
  '2. Which of these are noble gases?',
  '~ Noble gases sit in the last column of the periodic table.',
  '*a. Neon',
  'b. Nitrogen',
  '*c. Argon',
  'd. Oxygen',
  '',
  'Title: Question 7 3. Which molecule carries oxygen in red blood cells?',
  'a. Glucose',
  '*b. Hemoglobin',
  'c. Insulin',
  'd. Collagen',
  '',
  'Title: Dose route',
  '4. A drug is ordered at the dose below.',
  '~ 10 mg/kg every 8 hours',
  'By which route is this dose given?',
  '~ The order is for an oral tablet.',
  '*a. Oral',
  'b. Intravenous',
];

const autoNumberedParagraphs = [
  'Title: Chapter 2. Enzymes',
  { auto: 'Which enzyme class breaks a bond using water?' },
  '~ Hydrolases add water across a bond.',
  'a. Ligase',
  '*b. Hydrolase',
  '',
  'Type: MA',
  'Title: Lipids',
  { auto: 'Which of these are lipids?' },
  '*a. Cholesterol',
  'b. Glucose',
  '*c. Triglyceride',
];

async function openQuestion(page, index) {
  await page.locator('#questionList .qb-question-item').nth(index).click();
  return {
    title: await page.locator('#qTitle').inputValue(),
    type: await page.locator('#questionType').inputValue(),
    topic: await page.locator('#topic').inputValue(),
    stem: await page.locator('#stem').inputValue(),
    rationale: await page.locator('#rationale').inputValue(),
    answers: await page.locator('#answersArea .qb-answer-input').evaluateAll(els => els.map(e => e.value)),
    correct: await page.locator('#answersArea .qb-answer-marker').evaluateAll(els => els.map(e => e.getAttribute('aria-pressed') === 'true')),
  };
}

test('QuestionBridge: an ExamSoft-style Word file keeps titles, types, and rationales out of the stem', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic-examsoft-import.docx', mimeType: DOCX_MIME, buffer: await docx(examsoftParagraphs) });
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(4);

  const first = await openQuestion(page, 0);
  expect(first.title).toBe('Enzyme that joins molecules');
  expect(first.stem).toBe('Which enzyme class joins two molecules using energy from ATP?');
  expect(first.rationale).toBe('A ligase joins two molecules and uses ATP to do it. A hydrolase breaks a bond with water instead. Transferases move a group from one molecule to another.');
  expect(first.topic).toBe('');
  expect(first.answers).toEqual(['Transferase', 'Ligase', 'Hydrolase', 'Lyase']);
  expect(first.correct).toEqual([false, true, false, false]);
  // Word formatting in the stem is still kept.
  expect(await page.evaluate(() => state.questions[0].stemHtml)).toMatch(/<strong>ATP<\/strong>/);

  const second = await openQuestion(page, 1);
  expect(second.title).toBe('Noble gases');
  expect(second.type).toBe('mr');
  expect(second.topic).toBe('Chemistry');
  expect(second.stem).toBe('Which of these are noble gases?');
  expect(second.rationale).toBe('Noble gases sit in the last column of the periodic table.');
  expect(second.correct).toEqual([true, false, true, false]);

  const third = await openQuestion(page, 2);
  expect(third.title).toBe('Question 7');
  expect(third.stem).toBe('Which molecule carries oxygen in red blood cells?');
  expect(third.answers).toEqual(['Glucose', 'Hemoglobin', 'Insulin', 'Collagen']);
  expect(third.correct).toEqual([false, true, false, false]);

  for (const q of [first, second, third]) expect(q.stem).not.toMatch(/Title:|Type:|Category:|~/);

  // A "~" line inside the stem stays stem text; only the one just before the choices is the rationale.
  const fourth = await openQuestion(page, 3);
  expect(fourth.title).toBe('Dose route');
  expect(fourth.stem).toBe('A drug is ordered at the dose below.\n~ 10 mg/kg every 8 hours\nBy which route is this dose given?');
  expect(fourth.rationale).toBe('The order is for an oral tablet.');
  expect(fourth.correct).toEqual([true, false]);
});

test('QuestionBridge: Title and Type lines attach to Word automatically numbered questions', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic-examsoft-autonumbered.docx', mimeType: DOCX_MIME, buffer: await docx(autoNumberedParagraphs) });
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(2);

  // The title is followed by a numbered paragraph, so "Chapter 2." is part of the title, not a question number.
  const first = await openQuestion(page, 0);
  expect(first.title).toBe('Chapter 2. Enzymes');
  expect(first.stem).toBe('Which enzyme class breaks a bond using water?');
  expect(first.rationale).toBe('Hydrolases add water across a bond.');
  expect(first.correct).toEqual([false, true]);

  const second = await openQuestion(page, 1);
  expect(second.title).toBe('Lipids');
  expect(second.type).toBe('mr');
  expect(second.stem).toBe('Which of these are lipids?');
  expect(second.correct).toEqual([true, false, true]);
  for (const q of [first, second]) expect(q.stem).not.toMatch(/Title:|Type:|~/);
});
