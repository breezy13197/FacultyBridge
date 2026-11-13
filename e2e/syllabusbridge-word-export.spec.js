// SyllabusBridge v2.5: "Export edited Word syllabus". Syllabus edits are written
// into a new copy of the Word file as tracked changes; reading corrections are
// not; anything that can't be placed is listed. Synthetic data only.
import fs from 'node:fs';
import { test, expect, syntheticDocxBody, DOCX_MIME } from './fixtures.js';
import { JSZip, acceptAll } from '../tests/helpers/syllabus-docx.mjs';

const schedule = [['Date', 'Time', 'Topic', 'Faculty'],
  ['9/21/2026', '9:00 AM - 10:00 AM', 'Proteins', 'Dr. Ada Faculty'],
  ['9/23/2026', '9:00 AM - 10:00 AM', 'Enzymes', 'Dr. Ada Faculty'],
  ['9/28/2026', '9:00 AM - 10:00 AM', 'Hemoglobin', 'Dr. Ada Faculty']];
const body = [
  'PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'ada.faculty@example.edu', 'LOCATION: Room 101', 'Fall 2026',
  'COURSE DESCRIPTION:', 'A synthetic course about proteins.', 'Students practice with enzymes.',
  'REQUIRED HARDWARE AND SOFTWARE:', 'A laptop with ExamSoft (current annual subscription).',
  'GRADING SCALE:', [['% Grade', 'GPA'], ['≥90', '4.0'], ['76', '2.5'], ['≤64', '0']],
  'Course Schedule', schedule,
];
const syllabus = async () => ({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
async function upload(page, file) { await page.locator('#file').setInputFiles(file); await expect(page.locator('#screen-review')).toBeVisible(); }
async function setField(locator, value) { await locator.fill(value); await locator.press('Tab'); }
const exportDialog = page => page.getByRole('dialog', { name: 'Export edited Word syllabus' });
const scaleTable = page => page.locator('.sb-structured-editor').filter({ hasText: 'Grading scale' });

// Open the export pop-up, download the file, and return its name and Word XML.
async function exportWord(page, button = '#exportWord') {
  await page.locator(button).click();
  const dialog = exportDialog(page);
  await expect(dialog.getByRole('button', { name: 'Download edited Word syllabus' })).toBeEnabled();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download edited Word syllabus' }).click();
  const download = await pending;
  const bytes = fs.readFileSync(await download.path());
  await download.delete();
  const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
  // The pop-up stays open after the download, so the "make by hand" list stays in view.
  await expect(dialog).toContainText(`Downloaded ${download.suggestedFilename()}.`);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  return { name: download.suggestedFilename(), bytes, xml };
}
// The exported file after Word's "Accept All Changes", as an uploadable .docx.
async function accepted(bytes, name = 'accepted.docx') {
  const zip = await JSZip.loadAsync(bytes);
  zip.file('word/document.xml', acceptAll(await zip.file('word/document.xml').async('string')));
  return { name, mimeType: DOCX_MIME, buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) };
}

test('syllabus edits are written as tracked changes in a new copy; reading corrections are not; the rest is listed', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await syllabus());
  // A reading correction (marked below) and a year change (can't be placed).
  await setField(page.locator('#courseTitle'), 'Synthetic Course Corrected');
  await setField(page.locator('#courseYear'), '2031');
  // Course description: one line changed, one line added.
  await setField(page.locator('#review-description textarea'), 'A synthetic course about proteins.\nStudents practice with enzyme kinetics.\nWeekly quizzes check progress.');
  // Grading scale: a cell changed, a row added, a row removed.
  const scale = scaleTable(page);
  const row76 = scale.locator('tbody tr').filter({ has: page.locator('textarea', { hasText: /^76$/ }) });
  await setField(row76.locator('textarea').nth(1), '2.6');
  await scale.locator('tbody tr').filter({ has: page.locator('textarea', { hasText: /^≤64$/ }) }).getByRole('button', { name: /^Remove/ }).click();
  await scale.getByRole('button', { name: '+ Add row' }).click();
  const added = scale.locator('tbody tr').last();
  await setField(added.locator('textarea').nth(0), '≤64 (below)');
  await setField(added.locator('textarea').nth(1), '0.0');
  // Schedule: a topic changed, an entry removed, an entry added.
  await setField(page.locator('#scheduleBody .s-topic').nth(1), 'Enzyme kinetics');
  await page.locator('#scheduleBody tr').nth(2).getByRole('button', { name: 'Remove schedule row' }).click();
  await page.locator('#addScheduleRow').click();
  const newRow = page.locator('#scheduleBody tr').last();
  await setField(newRow.locator('.s-date'), '10/1/2026');
  await setField(newRow.locator('.s-topic'), 'Review session');

  await page.locator('#reviewChanges').click();
  const summary = page.getByRole('dialog', { name: 'Change summary' });
  await summary.locator('tbody tr').filter({ hasText: 'Course title' }).locator('.sb-kind-reading').check();
  await summary.getByRole('button', { name: 'Close', exact: true }).click();

  // Preview before download: what is written, what is not, and why.
  await page.locator('#exportWord').click();
  const dialog = exportDialog(page);
  await expect(dialog).toContainText('syllabus.docx');
  await expect(dialog).toContainText('syllabus-SyllabusBridge-edits.docx');
  const total = await page.evaluate(() => editorDiffCount());
  await expect(dialog).toContainText(`${total - 2} syllabus edits will be written as tracked changes.`);
  await expect(dialog).toContainText('1 reading correction is not written');
  await expect(dialog).toContainText('1 syllabus edit could not be placed');
  const unplaced = dialog.locator('.sb-export-unplaced tbody tr');
  await expect(unplaced).toHaveCount(1);
  await expect(unplaced).toContainText('Year');
  await expect(unplaced).toContainText('2031');
  await expect(unplaced).toContainText('Change the year by hand in Word');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  const pendingDownload = page.waitForEvent('download');
  await page.locator('#exportWord').click();
  await dialog.getByRole('button', { name: 'Download edited Word syllabus' }).click();
  await (await pendingDownload).delete();
  await expect(dialog).toContainText('Downloaded syllabus-SyllabusBridge-edits.docx. Remember the 1 edit to make by hand, listed above.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  const out = await exportWord(page);
  expect(out.name).toBe('syllabus-SyllabusBridge-edits.docx');
  // Every change is a tracked change by SyllabusBridge, and the original is untouched.
  const marks = [...out.xml.matchAll(/<w:(ins|del) w:id="\d+" w:author="([^"]*)"/g)];
  expect(marks.length).toBeGreaterThan(6);
  expect(new Set(marks.map(m => m[2]))).toEqual(new Set(['SyllabusBridge']));
  expect(out.xml).not.toContain('Corrected');
  expect(out.xml).not.toContain('2031');
  const original = await (await JSZip.loadAsync((await syllabus()).buffer)).file('word/document.xml').async('string');
  expect(await page.evaluate(() => state.sourceBytes.byteLength)).toBe((await syllabus()).buffer.length);
  expect(original).toContain('Students practice with enzymes.');

  // SyllabusBridge reads the exported copy (with changes pending, read as accepted)
  // and the copy after Accept All Changes the same way, with every edit in place.
  // (A removed row still waiting in Word as a tracked change is read as an empty
  // row until it is accepted, so empty rows are left out here.)
  for (const file of [{ name: 'tracked.docx', mimeType: DOCX_MIME, buffer: out.bytes }, await accepted(out.bytes)]) {
    await upload(page, file);
    const read = await page.evaluate(() => ({
      title: state.course.title, description: state.policies.description,
      scale: state.structuredTables.find(t => t.type === 'gradingScale').rows.map(r => r.cells.map(c => c.text)).filter(r => r.some(Boolean)),
      schedule: state.schedule.map(e => `${e.date} ${e.topic}`),
    }));
    expect(read.title).toBe('Synthetic Course');
    expect(read.description).toBe('A synthetic course about proteins.\nStudents practice with enzyme kinetics.\nWeekly quizzes check progress.');
    expect(read.scale).toEqual([['≥90', '4.0'], ['76', '2.6'], ['≤64 (below)', '0.0']]);
    expect(read.schedule).toEqual(['9/21/2026 Proteins', '9/23/2026 Enzyme kinetics', '10/1/2026 Review session']);
  }
});

test('after accepting the exported changes in Word, the finding a fix was made for is resolved', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await syllabus());
  await page.locator('#runValidation').click();
  const card = page.locator('#check-policy-hardware');
  await expect(card).toContainText('Warning');
  await card.getByRole('button', { name: /^Fix this/ }).click();
  await setField(page.locator('#review-hardware textarea'), 'A laptop with ExamSoft (current annual subscription) and a privacy filter.');
  await page.locator('#fixContext').getByRole('button', { name: 'Revalidate and return to report' }).click();
  await expect(card).toContainText('Resolved by your edit');

  const out = await exportWord(page, '#exportWordReport');
  await upload(page, await accepted(out.bytes));
  await page.locator('#runValidation').click();
  await expect(card.locator('.pill')).toHaveText('Passed');
  expect(await page.evaluate(() => editorDiffCount())).toBe(0);
});

test('with no syllabus edits there is nothing to download', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await syllabus());
  await page.locator('#exportWord').click();
  const dialog = exportDialog(page);
  await expect(dialog).toContainText('You have not made any syllabus edits yet');
  await expect(dialog.getByRole('button', { name: 'Download edited Word syllabus' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close Word export' }).click();
  await expect(page.locator('#exportWord')).toBeFocused();

  // Only reading corrections: still nothing to write.
  await setField(page.locator('#courseTitle'), 'Synthetic Course Corrected');
  await page.locator('#reviewChanges').click();
  await page.getByRole('dialog', { name: 'Change summary' }).locator('.sb-kind-reading').check();
  await page.getByRole('dialog', { name: 'Change summary' }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#exportWord').click();
  await expect(dialog).toContainText('All your changes are reading corrections');
  await expect(dialog.getByRole('button', { name: 'Download edited Word syllabus' })).toBeDisabled();
});

test('a reopened project exports against the Word file chosen when reopening', async ({ page, openTool }) => {
  const file = await syllabus();
  await openTool('syllabusbridge');
  await upload(page, file);
  await setField(page.locator('#scheduleBody .s-topic').nth(0), 'Protein structure');
  const pending = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  const project = fs.readFileSync(await (await pending).path());

  await page.reload();
  await page.locator('#projectFile').setInputFiles({ name: 'PHA9999-SyllabusBridge-project.json', mimeType: 'application/json', buffer: project });
  await page.locator('#file').setInputFiles(file);
  await expect(page.locator('#screen-review')).toBeVisible();
  const out = await exportWord(page);
  await upload(page, await accepted(out.bytes));
  expect(await page.evaluate(() => state.schedule.map(e => e.topic))).toEqual(['Protein structure', 'Enzymes', 'Hemoglobin']);
});

// Review finding on PR #35: a new schedule entry must not lose fields the Word
// table has no column for. The whole entry is listed instead. A day worked out
// from the date is not something the faculty member typed, so it may be left out.
async function addEntry(page, { date, time, topic, faculty }) {
  // Keyboard, as faculty can: the page may still be scrolling from the last row.
  await page.locator('#addScheduleRow').focus();
  await page.keyboard.press('Enter');
  const row = page.locator('#scheduleBody tr').last();
  await setField(row.locator('.s-date'), date);
  if (time) await setField(row.locator('.s-time'), time);
  await setField(row.locator('.s-topic'), topic);
  if (faculty) await setField(row.locator('.s-faculty'), faculty);
}
const shortSchedule = [['Date', 'Topic'], ['9/21/2026', 'Proteins'], ['9/23/2026', 'Enzymes'], ['9/28/2026', 'Hemoglobin']];
const scheduleOnly = async table => ({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026', 'Course Schedule', table]) });

test('a new schedule entry with a time and faculty the table has no columns for is listed, not partly written', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await scheduleOnly(shortSchedule));
  await addEntry(page, { date: '10/1/2026', time: '9:00 AM - 10:00 AM', topic: 'Review session', faculty: 'Dr. Grace Teacher' });
  await addEntry(page, { date: '10/5/2026', topic: 'Case discussion' });

  await page.locator('#exportWord').click();
  const dialog = exportDialog(page);
  await expect(dialog).toContainText('1 syllabus edit will be written as tracked changes.');
  await expect(dialog).toContainText('1 syllabus edit could not be placed');
  const listed = dialog.locator('.sb-export-unplaced tbody tr');
  await expect(listed).toHaveCount(1);
  await expect(listed).toContainText('Review session');
  await expect(listed).toContainText('has no time or faculty column');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  const out = await exportWord(page);
  expect(out.xml).toContain('Case discussion');
  for (const text of ['Review session', 'Grace Teacher', '9:00 AM']) expect(out.xml).not.toContain(text);
  await upload(page, await accepted(out.bytes));
  expect(await page.evaluate(() => state.schedule.map(e => `${e.date} ${e.topic}`))).toEqual(['9/21/2026 Proteins', '9/23/2026 Enzymes', '9/28/2026 Hemoglobin', '10/5/2026 Case discussion']);
});

test('a new schedule entry is written in full when the table has a column for each field', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await scheduleOnly(schedule));
  await addEntry(page, { date: '10/1/2026', time: '1:00 PM - 2:00 PM', topic: 'Review session', faculty: 'Dr. Grace Teacher' });
  await page.locator('#exportWord').click();
  await expect(exportDialog(page)).toContainText('1 syllabus edit will be written as tracked changes.');
  await expect(exportDialog(page).locator('.sb-export-unplaced')).toHaveCount(0);
  await exportDialog(page).getByRole('button', { name: 'Close', exact: true }).click();

  const out = await exportWord(page);
  await upload(page, await accepted(out.bytes));
  const added = await page.evaluate(() => state.schedule.find(e => e.topic === 'Review session'));
  expect([added.date, added.time, added.faculty]).toEqual(['10/1/2026', '1:00 PM – 2:00 PM', 'Dr. Grace Teacher']);
});

// Faculty feedback on real syllabi, reproduced with synthetic data.
// 1. A required section missing from the Word file, written in the editor, counts
//    as the section, and export adds it (heading and text) where the template puts it.
const withoutIncomplete = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026',
  'EXCUSED ABSENCE POLICY', 'Students who miss an exam must notify the coordinator before the exam begins.',
  'ELECTRONIC DEVICES', 'Phones are silenced during class.', 'Course Schedule', schedule];
const incompleteText = 'Synthetic incomplete wording for testing only.\n\uF0B7\tA synthetic pasted bullet.\nIncompletes are given at the discretion of the faculty member.';

test('a required section written in the editor counts as found, and export adds it with its heading', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, { name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(withoutIncomplete) });
  await page.locator('#runValidation').click();
  const card = page.locator('#check-section-incomplete');
  await expect(card.locator('.pill')).toHaveText('Issue');
  await card.getByRole('button', { name: /^Fix this/ }).click();
  await setField(page.locator('#review-incomplete textarea'), incompleteText);
  await page.locator('#fixContext').getByRole('button', { name: 'Revalidate and return to report' }).click();
  await expect(card.locator('.pill')).toHaveText('Passed');
  await expect(card).toContainText('Resolved by your edit');
  await expect(card).toContainText('Incomplete policy was added in SyllabusBridge.');
  await expect(card).toContainText('Choose “Export edited Word syllabus” to add it to the Word file.');

  const out = await exportWord(page, '#exportWordReport');
  await upload(page, await accepted(out.bytes));
  const read = await page.evaluate(() => ({ lines: state.lines, incomplete: state.policies.incomplete }));
  const at = read.lines.indexOf('INCOMPLETE POLICY:');
  expect(at).toBeGreaterThan(read.lines.indexOf('Students who miss an exam must notify the coordinator before the exam begins.'));
  expect(at).toBeLessThan(read.lines.indexOf('ELECTRONIC DEVICES'));
  expect(read.incomplete).toBe('Synthetic incomplete wording for testing only.\n• A synthetic pasted bullet.\nIncompletes are given at the discretion of the faculty member.');
  await page.locator('#runValidation').click();
  await expect(card.locator('.pill')).toHaveText('Passed');
});

test('a heading typed at the top of section text read without one counts as the heading', async ({ page, openTool }) => {
  const body = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026',
    'Incompletes are given at the discretion of the faculty member when course requirements remain.', 'Course Schedule', schedule];
  await openTool('syllabusbridge');
  await upload(page, { name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await page.locator('#runValidation').click();
  const card = page.locator('#check-section-incomplete');
  await expect(card.locator('.pill')).toHaveText('Warning');
  await page.locator('#screen-report').getByRole('button', { name: '← Structured editor' }).click();
  const box = page.locator('#review-incomplete textarea');
  await setField(box, `Incomplete Policy:\n${await box.inputValue()}`);
  await page.locator('#runValidation').click();
  await expect(card.locator('.pill')).toHaveText('Passed');
});

// 2. A date cell that also names the day ("Friday 2/13/26"): changing the date
//    changes the day word in the same cell, in the same form.
test('changing a date in a "Friday 2/13/26" cell also changes the day word', async ({ page, openTool }) => {
  const table = [['Lecture', 'Date', 'Course Topics', 'Instructor'], ['Week 1'],
    ['1', 'Monday 1/4/27', 'Bacteria I', 'Dr. Ada Faculty'], ['2', 'Fri 1/8/27', 'Bacteria II', 'Dr. Ada Faculty'],
    ['3', 'Friday 2/13/26', 'Innate Immunity', 'Dr. Ada Faculty']];
  await openTool('syllabusbridge');
  await upload(page, await scheduleOnly(table));
  await setField(page.locator('#scheduleBody .s-date').nth(2), '2/12/27');
  await setField(page.locator('#scheduleBody .s-date').nth(1), '1/7/27');
  await page.locator('#exportWord').click();
  await expect(exportDialog(page)).toContainText('2 syllabus edits will be written as tracked changes.');
  await expect(exportDialog(page).locator('.sb-export-unplaced')).toHaveCount(0);
  await exportDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  const out = await exportWord(page);
  await upload(page, await accepted(out.bytes));
  expect(await page.evaluate(() => state.rawTables.at(-1).slice(2).map(r => r[1].text))).toEqual(['Monday 1/4/27', 'Thu 1/7/27', 'Friday 2/12/27']);
});

// Review findings: a weekday printed in both the Date cell and a Day column
// changes in both places; when it is not clear which word to change, the whole
// change is listed instead.
test('a date change updates the weekday in the Date cell and the Day column; an unclear weekday is listed', async ({ page, openTool }) => {
  const table = [['Lecture', 'Date', 'Day', 'Course Topics', 'Instructor'],
    ['1', 'Monday 1/4/27', 'Mon', 'Bacteria I', 'Dr. Ada Faculty'],
    ['2', 'Friday 2/13/26', 'Fri', 'Innate Immunity', 'Dr. Ada Faculty'],
    ['3', 'Friday 2/20/27 (Friday lab)', 'Fri', 'Lab review', 'Dr. Ada Faculty']];
  await openTool('syllabusbridge');
  await upload(page, await scheduleOnly(table));
  await setField(page.locator('#scheduleBody .s-date').nth(1), '2/11/27');
  await setField(page.locator('#scheduleBody .s-date').nth(2), '2/18/27');
  await page.locator('#exportWord').click();
  const dialog = exportDialog(page);
  await expect(dialog).toContainText('1 syllabus edit will be written as tracked changes.');
  const listed = dialog.locator('.sb-export-unplaced tbody tr');
  await expect(listed).toHaveCount(1);
  await expect(listed).toContainText('Lab review');
  await expect(listed).toContainText('could not tell which day to change');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const out = await exportWord(page);
  await upload(page, await accepted(out.bytes));
  expect(await page.evaluate(() => state.rawTables.at(-1).slice(1).map(r => `${r[1].text} | ${r[2].text}`)))
    .toEqual(['Monday 1/4/27 | Mon', 'Thursday 2/11/27 | Thu', 'Friday 2/20/27 (Friday lab) | Fri']);
});

// Review finding: several sections added at the same place follow the template order.
test('two missing sections added together are written in template order', async ({ page, openTool }) => {
  const body = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026',
    'REQUIRED TEXTBOOKS AND RELATED MATERIALS:', 'A synthetic textbook, 1st edition.',
    'STUDENT ENGAGEMENT:', 'Synthetic engagement wording for testing only.', 'Course Schedule', schedule];
  await openTool('syllabusbridge');
  await upload(page, { name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await setField(page.locator('#review-accessibility textarea'), 'Synthetic accessibility wording for testing only.');
  await setField(page.locator('#review-hardware textarea'), 'Synthetic hardware wording for testing only.');
  const out = await exportWord(page);
  await upload(page, await accepted(out.bytes));
  const lines = await page.evaluate(() => state.lines);
  const at = t => lines.indexOf(t);
  expect(at('REQUIRED HARDWARE AND SOFTWARE:')).toBeGreaterThan(at('A synthetic textbook, 1st edition.'));
  expect(at('Synthetic hardware wording for testing only.')).toBe(at('REQUIRED HARDWARE AND SOFTWARE:') + 1);
  expect(at('ACCESSIBILITY AND DISABILITY ACCOMMODATION:')).toBe(at('Synthetic hardware wording for testing only.') + 1);
  expect(at('Synthetic accessibility wording for testing only.')).toBe(at('ACCESSIBILITY AND DISABILITY ACCOMMODATION:') + 1);
  expect(at('STUDENT ENGAGEMENT:')).toBe(at('Synthetic accessibility wording for testing only.') + 1);
});
