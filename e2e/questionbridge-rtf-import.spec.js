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

// The checks below call QuestionBridge's own reader functions in the page, so many
// layouts can be covered quickly. They also cover pasted and .txt text, which goes
// through the same reader as .rtf. All questions are synthetic.

const summarize = qs => qs.map(q => ({
  title: q.title, type: q.type, topic: q.topic || '', stem: q.stem, rationale: q.rationale || '',
  answers: ['mc', 'mr', 'tf'].includes(q.type) ? q.answers.map(a => (a.correct ? '*' : '') + a.text) : [],
  accepted: q.type === 'sa' ? q.accepted : [],
  blanks: q.type === 'fitb' ? (q.blanks || []).map(b => b.accepted) : [],
  warnings: q.parseWarnings.length,
}));
const readText = (page, text) => page.evaluate(t => parseTextQuestions(t, 'synthetic'), text).then(summarize);
const readRtf = (page, rtf) => page.evaluate(r => parseExamsoftRtf(r, 'synthetic.rtf').questions, rtf).then(summarize);

test('QuestionBridge: a title on the question line ends at the question number that continues the sequence', async ({ page, openTool }) => {
  await openTool('questionbridge');
  // A number with a period inside the title is not mistaken for the question number.
  let qs = await readText(page, 'Title: Chapter 2. Enzymes 1. Which enzyme joins molecules?\na. Transferase\n*b. Ligase');
  expect(qs).toHaveLength(1);
  expect(qs[0]).toMatchObject({ title: 'Chapter 2. Enzymes', stem: 'Which enzyme joins molecules?', answers: ['Transferase', '*Ligase'], warnings: 0 });

  // A title that is itself numbered ("Question 12") stays whole.
  qs = await readText(page, [
    'Title: Question 1 1. First?\n*a. Yes\nb. No',
    'Title: Question 2 2. Second?\n*a. Yes\nb. No',
    'Title: Question 12 3. Third?\na. Yes\n*b. No',
  ].join('\n\n'));
  expect(qs.map(q => [q.title, q.stem])).toEqual([['Question 1', 'First?'], ['Question 2', 'Second?'], ['Question 12', 'Third?']]);

  // A numbered title on its own line, followed by the numbered question, stays whole.
  qs = await readText(page, 'Title: Step 1. Overview\n1. Which step comes first?\n*a. Overview\nb. Summary');
  expect(qs).toHaveLength(1);
  expect(qs[0]).toMatchObject({ title: 'Step 1. Overview', stem: 'Which step comes first?', warnings: 0 });

  // When no number continues the sequence and several could be the question number,
  // the question is flagged for review instead of being split silently.
  qs = await readText(page, 'Title: pH 2. Pepsin 7. Which enzyme works in the stomach?\n*a. Pepsin\nb. Trypsin');
  expect(qs).toHaveLength(1);
  expect(qs[0].warnings).toBe(1);
  const flagged = await page.evaluate(() => parseTextQuestions('Title: pH 2. Pepsin 7. Which enzyme works in the stomach?\n*a. Pepsin\nb. Trypsin', 'synthetic')[0]);
  expect(flagged.confidence).not.toBe('high');
  expect(flagged.parseWarnings[0]).toMatch(/could not be sure where the title ends/);
});

test('QuestionBridge: Type:, Title:, and Category: labels set the question type, title, and topic', async ({ page, openTool }) => {
  await openTool('questionbridge');
  // Labels on their own lines, as ExamSoft import files often have them.
  let qs = await readText(page, [
    'Type: MA\nTitle: Noble gases\n1. Which are noble gases?\n*a. Neon\nb. Nitrogen\n*c. Argon',
    'Type: E\nTitle: Kinetics essay\n2. Explain what Km tells you about an enzyme.',
    'Type: F\nTitle: Powerhouse\n3. The powerhouse of the cell is the [blank].\na. mitochondrion|mitochondria',
    'Category: Cardiology\nTitle: Heart\n4. Which organ pumps blood?\n*a. Heart\nb. Lung',
  ].join('\n\n'));
  expect(qs).toEqual([
    { title: 'Noble gases', type: 'mr', topic: '', stem: 'Which are noble gases?', rationale: '', answers: ['*Neon', 'Nitrogen', '*Argon'], accepted: [], blanks: [], warnings: 0 },
    { title: 'Kinetics essay', type: 'essay', topic: '', stem: 'Explain what Km tells you about an enzyme.', rationale: '', answers: [], accepted: [], blanks: [], warnings: 0 },
    { title: 'Powerhouse', type: 'fitb', topic: '', stem: 'The powerhouse of the cell is the [blank].', rationale: '', answers: [], accepted: [], blanks: [['mitochondrion', 'mitochondria']], warnings: 0 },
    { title: 'Heart', type: 'mc', topic: 'Cardiology', stem: 'Which organ pumps blood?', rationale: '', answers: ['*Heart', 'Lung'], accepted: [], blanks: [], warnings: 0 },
  ]);
  // All labels on the question line, as QuestionBridge's own ExamSoft export writes them.
  qs = await readText(page, 'Type: MA Title: Gases Category: Chemistry 1. Which are noble gases?\n~ Neon and argon are noble gases.\n*a. Neon\nb. Nitrogen\n*c. Argon');
  expect(qs[0]).toMatchObject({ title: 'Gases', type: 'mr', topic: 'Chemistry', stem: 'Which are noble gases?', rationale: 'Neon and argon are noble gases.', answers: ['*Neon', 'Nitrogen', '*Argon'] });
});

test('QuestionBridge: pasted text banks in the usual layouts read the same as before', async ({ page, openTool }) => {
  await openTool('questionbridge');
  const bank = [
    '1. Which molecule carries oxygen?\na. Glucose\n*b. Hemoglobin\nc. Insulin',
    '2) Which is a noble gas?\nA) Neon\nB) Nitrogen\nAnswer: A',
    '3. Which vitamin helps blood clot?\na. C\n*b. K\nRationale: Vitamin K activates clotting factors.',
    '4. Which ion triggers muscle contraction?\na. Sodium\n*b. Calcium\n~ Calcium binds troponin.',
    '5. ~50% of patients respond to drug A. Which drug is it?\na. Drug B\n*b. Drug A',
    '6. A dose is given.\n~ 10 mg/kg per day.\nWhich drug was given?\na. Drug B\n*b. Drug A',
    '7. A patient arrives with a fever.\nShe feels tired.\nWhat is the next step?\na. Rest\n*b. Test',
    '8. The heart has four chambers.\n*a. True\nb. False',
    '9. Blood type: which is the universal donor?\n*a. O negative\nb. AB positive',
    '10. Name the enzyme that unwinds DNA.\nAnswer: helicase',
  ].join('\n\n');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(bank);
  await page.locator('#parsePaste').click();
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(10);
  const qs = summarize(await page.evaluate(() => state.questions));
  expect(qs.map(q => [q.type, q.stem, q.rationale, q.answers.join('|')])).toEqual([
    ['mc', 'Which molecule carries oxygen?', '', 'Glucose|*Hemoglobin|Insulin'],
    ['mc', 'Which is a noble gas?', '', '*Neon|Nitrogen'],
    ['mc', 'Which vitamin helps blood clot?', 'Vitamin K activates clotting factors.', 'C|*K'],
    ['mc', 'Which ion triggers muscle contraction?', 'Calcium binds troponin.', 'Sodium|*Calcium'],
    // A stem that starts with "~", or has a "~" line in its middle, stays stem text.
    ['mc', '~50% of patients respond to drug A. Which drug is it?', '', 'Drug B|*Drug A'],
    ['mc', 'A dose is given.\n~ 10 mg/kg per day.\nWhich drug was given?', '', 'Drug B|*Drug A'],
    ['mc', 'A patient arrives with a fever.\nShe feels tired.\nWhat is the next step?', '', 'Rest|*Test'],
    ['tf', 'The heart has four chambers.', '', '*True|False'],
    // "type:" inside a stem is not mistaken for a Type: label.
    ['mc', 'Blood type: which is the universal donor?', '', '*O negative|AB positive'],
    ['sa', 'Name the enzyme that unwinds DNA.', '', ''],
  ]);
  expect(qs[9].accepted).toEqual(['helicase']);
  expect(qs.map(q => q.title)).toEqual(Array.from({ length: 10 }, (_, i) => `Question ${i + 1}`));
});

test('QuestionBridge: .rtf text in Windows, Unicode, and Word-numbered encodings reads correctly', async ({ page, openTool }) => {
  await openTool('questionbridge');
  const stemOf = async rtf => (await readRtf(page, rtf)).map(q => q.stem);
  // Windows-1252 bytes written as \'hh.
  expect(await stemOf("{\\rtf1\\ansi\\ansicpg1252 1. The cell\\'92s caf\\'e9 \\'93hub\\'94 costs \\'80 5\\'97cheap?\\par a. Yes\\par *b. No}"))
    .toEqual(['The cell\u2019s caf\u00e9 \u201chub\u201d costs \u20ac 5\u2014cheap?']);
  // Unicode with one, zero, or two fallback characters to skip (\uc1, \uc0, \uc2).
  for (const rtf of [
    '{\\rtf1\\ansi\\uc1 1. The cell\\u8217?s \\u945?-helix?\\par *a. Yes\\par b. No}',
    '{\\rtf1\\ansi\\uc0 1. The cell\\u8217 s \\u945 -helix?\\par *a. Yes\\par b. No}',
    "{\\rtf1\\ansi\\uc2 1. The cell\\u8217\\'3f\\'3fs \\u945??-helix?\\par *a. Yes\\par b. No}",
  ]) expect(await stemOf(rtf)).toEqual(['The cell\u2019s \u03b1-helix?']);
  // Named symbols and escaped characters.
  expect(await stemOf('{\\rtf1\\ansi 1. A\\emdash B\\endash C \\ldblquote y\\rdblquote  is \\{x\\} in C:\\\\temp?\\par *a. Yes\\par b. No}'))
    .toEqual(['A\u2014B\u2013C \u201cy\u201d is {x} in C:\\temp?']);
  // Word automatic numbering (\listtext) still gives the question numbers; pictures are skipped.
  const numbered = await readRtf(page, "{\\rtf1\\ansi{\\*\\listtable{\\list{\\listlevel{\\leveltext\\'02\\'00.;}}}}{\\listtext\\pard\\plain 1.\\tab}Which organ pumps blood?{\\pict\\pngblip 89504e47}\\par a. Lung\\par *b. Heart\\par {\\listtext\\pard\\plain 2.\\tab}Which organ filters blood?\\par *a. Kidney\\par b. Heart}");
  expect(numbered.map(q => [q.stem, q.answers.join('|')])).toEqual([['Which organ pumps blood?', 'Lung|*Heart'], ['Which organ filters blood?', '*Kidney|Heart']]);
});

test('QuestionBridge: every question type survives its own ExamSoft .rtf export and re-upload', async ({ page, openTool }) => {
  await openTool('questionbridge');
  const bank = [
    'Title: Oxygen carrier\n1. Which molecule carries oxygen?\n~ Hemoglobin binds oxygen in red blood cells.\na. Glucose\n*b. Hemoglobin\nc. Insulin',
    'Type: MA\nTitle: Noble gases\n2. Which are noble gases?\n*a. Neon\nb. Nitrogen\n*c. Argon',
    'Title: Heart chambers\n3. The heart has four chambers.\n*a. True\nb. False',
    'Type: E\nTitle: Kinetics essay\n4. Explain what Km tells you about an enzyme.',
    'Type: F\nTitle: Powerhouse\n5. The powerhouse of the cell is the [blank].\na. mitochondrion|mitochondria',
    'Title: Helicase\n6. Name the enzyme that unwinds DNA.\nAnswer: helicase',
  ].join('\n\n');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(bank);
  await page.locator('#parsePaste').click();
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(6);
  // Give the first question a topic so the Category: label is exported too.
  await page.locator('#questionList .qb-question-item').first().click();
  await page.locator('summary', { hasText: 'Optional metadata' }).click();
  await page.locator('#topic').fill('Physiology');
  await page.locator('#topic').blur();
  const before = summarize(await page.evaluate(() => state.questions));
  expect(before.map(q => q.type)).toEqual(['mc', 'mr', 'tf', 'essay', 'fitb', 'sa']);

  await page.locator('[data-screen="export"]').click();
  const examsoftButton = page.locator('#exportGrid > *').filter({ hasText: /ExamSoft/i }).locator('button:has-text("Download")');
  const pending = page.waitForEvent('download');
  await examsoftButton.first().click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/examsoft-legacy\.rtf$/);
  const fs = await import('node:fs');
  const buffer = fs.readFileSync(await download.path());
  await download.delete();

  await page.locator('[data-screen="upload"]').click();
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic-roundtrip.rtf', mimeType: 'application/rtf', buffer });
  await page.locator('#importReplaceBtn').click();
  await expect(page.locator('#questionList .qb-question-item')).toHaveCount(6);
  const after = summarize(await page.evaluate(() => state.questions));

  // ExamSoft writes a blank as "__ 1 ___"; everything else comes back unchanged.
  const sameBlank = q => ({ ...q, stem: q.stem.replace('__ 1 ___', '[blank]') });
  expect(after.map(sameBlank)).toEqual(before);
  expect(after[0].topic).toBe('Physiology');
});
