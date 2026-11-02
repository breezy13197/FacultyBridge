// Shared pop-up (FTDialog) and unsaved-work warning (FTUnsavedWork) in every tool.
// Synthetic data only. Each test checks behavior a faculty member would notice:
// the pop-up is announced as a dialog, Escape cancels it, focus returns to the
// button that opened it, and leaving the page warns only when work could be lost.
import { test, expect, syntheticDocx, syntheticSyllabus, syntheticItemCsv, syntheticExamRtf, DOCX_MIME, downloadFrom } from './fixtures.js';
import { gradeExamCsv, gradeBrightCsv, groupRosterCsv } from './workflows.js';

const csvFile = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

// Fires the page's real beforeunload handlers and reports whether any asked to stay.
const warnsBeforeLeaving = page => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

// The browser's built-in boxes must never appear; fail loudly if one does.
test.beforeEach(({ page }) => {
  page.on('dialog', dialog => {
    if (dialog.type() === 'beforeunload') return dialog.accept();
    throw new Error(`Browser ${dialog.type()} box appeared instead of the shared pop-up: ${dialog.message()}`);
  });
});

const sharedDialog = (page, name) => page.getByRole('dialog', name ? { name } : undefined);

test('FacultyBridge: About pop-up closes with Escape and returns focus', async ({ page, openTool }) => {
  await openTool('facultybridge');
  await page.locator('#aboutButton').click();
  const dialog = sharedDialog(page, 'About FacultyBridge');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#aboutButton')).toBeFocused();
});

test('QuestionBridge: delete and bulk edits use the shared pop-up', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill('1. Which molecule transports oxygen?\n*A. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP');
  await page.locator('#parsePaste').click();
  await expect(page.locator('#stem')).toHaveValue(/transports oxygen/);

  // Escape cancels a deletion and keeps the question.
  await page.locator('#deleteQuestion').click();
  const confirmDelete = sharedDialog(page, 'Delete question?');
  await expect(confirmDelete).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmDelete).toBeHidden();
  await expect(page.locator('#deleteQuestion')).toBeFocused();
  expect(await page.evaluate(() => state.questions.length)).toBe(1);

  // Typed input: an invalid value is explained in place; a valid one is applied.
  await page.locator('#bulkPoints').click();
  const points = sharedDialog(page, 'Set points for all questions');
  await expect(points).toBeVisible();
  await points.getByLabel('Points per question').fill('-2');
  await points.getByRole('button', { name: 'Apply' }).click();
  await expect(points.getByRole('alert')).toContainText('0 or greater');
  await points.getByLabel('Points per question').fill('3');
  await points.getByRole('button', { name: 'Apply' }).click();
  await expect(points).toBeHidden();
  expect(await page.evaluate(() => state.questions.map(q => q.points))).toEqual([3]);

  // The preview pop-up is announced as a dialog and closes with Escape.
  await page.locator('[data-screen="export"]').click();
  await page.locator('#exportGrid button:has-text("Preview")').first().click();
  const preview = sharedDialog(page, /preview/i);
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();

  // Autosave protects the work, so leaving does not warn...
  expect(await warnsBeforeLeaving(page)).toBe(false);
  // ...unless the browser refuses to save it.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage full'); }; });
  await page.locator('[data-screen="review"]').click();
  await page.locator('#stem').fill('Which protein transports oxygen?');
  await page.locator('#saveNext').click();
  expect(await warnsBeforeLeaving(page)).toBe(true);

  // Confirming deletes.
  await page.locator('#deleteQuestion').click();
  await sharedDialog(page, 'Delete question?').getByRole('button', { name: 'Delete question' }).click();
  expect(await page.evaluate(() => state.questions.length)).toBe(0);
});

test('GradeBridge: manual decisions warn before leaving until the CSV is downloaded', async ({ page, openTool }) => {
  await openTool('gradebridge');
  await page.locator('#helpBtn').click();
  const help = sharedDialog(page, 'How GradeBridge works');
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(page.locator('#helpBtn')).toBeFocused();

  await page.locator('#examFile').setInputFiles(csvFile('exam.csv', gradeExamCsv.replace('1002,Ben,Baker,40,80', '1002,Ben,Baker,,')));
  await page.locator('#brightFile').setInputFiles(csvFile('grades.csv', gradeBrightCsv));
  await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
  await page.locator('#continueBtn').click();
  await expect(page.locator('#mAttention')).toHaveText('1');
  expect(await warnsBeforeLeaving(page)).toBe(false);

  await page.getByRole('button', { name: 'Enter 0' }).click();
  const zero = sharedDialog(page, 'Enter a score of 0?');
  await expect(zero).toBeVisible();
  await zero.getByRole('button', { name: 'Enter 0' }).click();
  await expect(page.locator('#mAttention')).toHaveText('0');
  expect(await warnsBeforeLeaving(page)).toBe(true);

  await page.locator('#prepareBtn').click();
  await page.locator('#maxConfirm').check();
  const { text } = await downloadFrom(page, () => page.locator('#downloadBtn').click());
  expect(text).toContain('00002,0,#');
  expect(await warnsBeforeLeaving(page)).toBe(false);
});

test('GradeBridge: choosing a match without a student explains what to do', async ({ page, openTool }) => {
  await openTool('gradebridge');
  await page.locator('#examFile').setInputFiles(csvFile('exam.csv', gradeExamCsv + '1009,Zed,Zimmer,20,40\r\n'));
  await page.locator('#brightFile').setInputFiles(csvFile('grades.csv', gradeBrightCsv));
  await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
  await page.locator('#continueBtn').click();
  await page.getByRole('button', { name: 'Confirm match' }).click();
  const notice = sharedDialog(page, 'Choose a student');
  await expect(notice).toContainText('Choose a Brightspace student first');
  await page.keyboard.press('Escape');
  await expect(notice).toBeHidden();
});

test('ItemBridge: removing an exam can be cancelled with Escape; loaded exams warn before leaving', async ({ page, openTool }) => {
  await openTool('itembridge');
  expect(await warnsBeforeLeaving(page)).toBe(false);
  await page.locator('#fileInput').setInputFiles(csvFile('synthetic.csv', syntheticItemCsv));
  await expect(page.locator('#workspace')).toBeVisible();
  expect(await warnsBeforeLeaving(page)).toBe(true);
  const removeButton = page.locator('#examList [data-remove-exam]').first();
  await removeButton.click();
  const remove = sharedDialog(page, 'Remove loaded exam?');
  await expect(remove).toBeVisible();
  // Destructive confirmation starts on Cancel, and Escape keeps the exam.
  await expect(remove.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(remove).toBeHidden();
  await expect(removeButton).toBeFocused();
  await expect(page.locator('#workspace')).toBeVisible();
});

test('ExamBridge: report options and "choose another exam" use the shared pop-up', async ({ page, openTool }) => {
  await openTool('exambridge');
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic.doc', mimeType: 'application/msword', buffer: Buffer.from(syntheticExamRtf) });
  await expect(page.locator('#resultsView')).toBeVisible();
  await page.locator('#printBtn').click();
  const report = sharedDialog(page, 'Choose the report scope');
  await expect(report).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(report).toBeHidden();
  await expect(page.locator('#printBtn')).toBeFocused();

  await page.locator('#changeFileBtn').click();
  const another = sharedDialog(page, 'Choose another exam?');
  await expect(another).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#resultsView')).toBeVisible();
  await page.locator('#changeFileBtn').click();
  await sharedDialog(page, 'Choose another exam?').getByRole('button', { name: 'Choose another exam' }).click();
  await expect(page.locator('#uploadView')).toBeVisible();
});

test('CalendarBridge: schedule edits warn before leaving until the project is saved', async ({ page, openTool }) => {
  await openTool('calendarbridge');
  await page.locator('#fileInput').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syntheticSyllabus) });
  await expect(page.locator('#screen-review')).toBeVisible();
  expect(await warnsBeforeLeaving(page)).toBe(false);
  // Moving between steps without editing is not unsaved work.
  await page.locator('#toFaculty').click();
  expect(await warnsBeforeLeaving(page)).toBe(false);
  await page.locator('.ft-step[data-step="review"], [data-go="review"]').first().click();
  await page.locator('#reviewBody .ev-delete, #scheduleBody .ev-delete').first().click();
  expect(await warnsBeforeLeaving(page)).toBe(true);
  // The Save button sits on the Export step, which this faculty-less schedule cannot reach; call what it runs.
  const saved = await downloadFrom(page, () => page.evaluate(() => saveProject()));
  expect(JSON.parse(saved.text).events).toHaveLength(2);
  expect(await warnsBeforeLeaving(page)).toBe(false);

  // Applying recurring times asks first; cancelling leaves every time unchanged.
  const times = () => page.evaluate(() => state.events.map(e => e.time));
  const before = await times();
  await page.evaluate(() => { state.meetingPatterns = { Monday: ['9:00'] }; applyMeetingPatterns(); });
  await expect(sharedDialog(page, 'Times need AM or PM')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.evaluate(() => { state.meetingPatterns = { Monday: ['1:00 PM – 2:00 PM'], Wednesday: ['1:00 PM – 2:00 PM'] }; applyMeetingPatterns(); });
  const apply = sharedDialog(page, 'Apply the course schedule?');
  await expect(apply).toContainText('replace the start and end times');
  await page.keyboard.press('Escape');
  await expect(apply).toBeHidden();
  expect(await times()).toEqual(before);

  await page.evaluate(() => openPreview({ id: 'synthetic', short: 'Dr. Synthetic' }));
  const preview = sharedDialog(page, /Dr\. Synthetic/);
  await expect(preview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});

test('SyllabusBridge: edits warn before leaving; export warnings use the shared pop-up', async ({ page, openTool }) => {
  const syllabus = { ...syntheticSyllabus, paragraphs: syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule') };
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syllabus) });
  await expect(page.locator('#screen-review')).toBeVisible();
  expect(await warnsBeforeLeaving(page)).toBe(false);
  await page.locator('#courseTitle').fill('Synthetic Course Revised');
  await page.locator('#courseTitle').dispatchEvent('change');
  expect(await warnsBeforeLeaving(page)).toBe(true);

  await page.locator('#runValidation').click();
  await expect(page.locator('#screen-report')).toBeVisible();
  await page.locator('#exportCourseJsonReport').click();
  const anyway = sharedDialog(page, 'Export with validation issues?');
  await expect(anyway).toBeVisible();
  const { text } = await downloadFrom(page, () => anyway.getByRole('button', { name: 'Export anyway' }).click());
  expect(JSON.parse(text).course.title).toBe('Synthetic Course Revised');
});

test('GroupBridge: generated groups warn before leaving', async ({ page, openTool }) => {
  await openTool('groupbridge');
  await page.locator('#fileInput').setInputFiles(csvFile('roster.csv', groupRosterCsv));
  expect(await warnsBeforeLeaving(page)).toBe(false);
  await page.locator('#toConfig').click();
  await page.locator('#groupCount').fill('2');
  await page.locator('#balanceCol').selectOption('Exam 1 Points Grade');
  await page.locator('#generateBtn').click();
  await expect(page.locator('.member')).toHaveCount(4);
  expect(await warnsBeforeLeaving(page)).toBe(true);
});
