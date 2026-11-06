import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, downloadFrom, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';
import { workflows, gradeExamCsv, gradeBrightCsv } from './workflows.js';

// Full load -> process -> export workflow for every tool, with exported files checked.
for (const [tool, run] of Object.entries(workflows)) {
  test(`${tool}: synthetic workflow produces correct exports`, async ({ page, openTool }) => {
    await run({ page, openTool });
  });
}

// Import files must carry answers exactly as written. Signed numbers are common
// in calculation questions; an added apostrophe would show up in the student's quiz.
test('QuestionBridge Brightspace and Poll Everywhere exports keep answers starting with - + = @', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill('1. What is the net charge at pH 12?\n*A. -2\nB. +1\nC. =0\nD. @ pH 7, -1');
  await page.locator('#parsePaste').click();
  await expect(page.locator('#stem')).toHaveValue(/net charge/);
  await page.locator('[data-screen="validate"]').click();
  await expect(page.locator('body')).toContainText('begins with =, +, -, or @');
  await page.locator('[data-screen="export"]').click();
  const download = async name => {
    const pending = page.waitForEvent('download');
    await page.locator(`#exportGrid .qb-export-card:has-text("${name}") button:has-text("Download")`).click();
    const file = await pending;
    const text = fs.readFileSync(await file.path(), 'utf8');
    await file.delete();
    return text;
  };
  const bright = await download('Brightspace');
  expect(bright).toContain('Option,100,-2,');
  expect(bright).toContain('Option,0,+1,');
  expect(bright).toContain('Option,0,=0,');
  expect(bright).toContain('Option,0,"@ pH 7, -1",');
  expect(bright).not.toContain("'");
  const poll = await download('Poll Everywhere');
  expect(poll).toContain('***-2,+1,=0,"@ pH 7, -1"');
  expect(poll).not.toContain("'");
});

const csvFile = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
async function loadGrades(page, openTool, exam, bright) {
  await openTool('gradebridge');
  await page.locator('#examFile').setInputFiles(csvFile('exam.csv', exam));
  await page.locator('#brightFile').setInputFiles(csvFile('grades.csv', bright));
}

// GradeBridge must refuse, not guess, whenever the file could produce wrong grades.
test.describe('GradeBridge safety gates', () => {
  test('percentage-only ExamSoft export is rejected', async ({ page, openTool }) => {
    await loadGrades(page, openTool, 'StudentID,First Name,Last Name,%\r\n1001,Anna,Able,90\r\n', gradeBrightCsv);
    await expect(page.locator('#examStatus')).toContainText('percentages but no raw points');
    await expect(page.locator('#preflightCard')).toBeHidden();
  });

  test('Excel-mangled Brightspace IDs are rejected', async ({ page, openTool }) => {
    const mangled = gradeBrightCsv.replace('00001', '1.00E+04');
    await loadGrades(page, openTool, gradeExamCsv, mangled);
    await expect(page.locator('#brightStatus')).toContainText('scientific notation');
    await expect(page.locator('#preflightCard')).toBeHidden();
  });

  test('non-CSV upload is rejected with guidance', async ({ page, openTool }) => {
    await openTool('gradebridge');
    await page.locator('#examFile').setInputFiles({ name: 'exam.xlsx', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await expect(page.locator('#examStatus')).toContainText('CSV');
  });

  test('duplicate and unmatched students block the audit until resolved', async ({ page, openTool }) => {
    const exam = gradeExamCsv + '1003,Cara,Clark,30,60\r\n1009,Zed,Zimmer,20,40\r\n';
    await loadGrades(page, openTool, exam, gradeBrightCsv);
    await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
    await page.locator('#continueBtn').click();
    await expect(page.locator('#reviewCard')).toBeVisible();
    // Two Clark attempts share a StudentID and Zimmer is not on the roster.
    await expect(page.locator('#mAttention')).not.toHaveText('0');
    await page.locator('#prepareBtn').click();
    await expect(page.locator('#reviewStatus')).toContainText('Cannot prepare final audit');
    await expect(page.locator('#auditCard')).toBeHidden();
  });

  test('a missing score blocks the audit', async ({ page, openTool }) => {
    await loadGrades(page, openTool, gradeExamCsv.replace('1002,Ben,Baker,40,80', '1002,Ben,Baker,,'), gradeBrightCsv);
    await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
    await page.locator('#continueBtn').click();
    await expect(page.locator('#mAttention')).toHaveText('1');
    await page.locator('#prepareBtn').click();
    await expect(page.locator('#auditCard')).toBeHidden();
  });
});

// A plural "COURSE COORDINATORS:" heading lists several coordinators; all of them must reach
// the faculty list and the Course JSON, and CalendarBridge must see each one as a coordinator.
test('SyllabusBridge keeps every coordinator under a plural heading', async ({ page, openTool }) => {
  const paragraphs = ['PHA9999 - Synthetic Course',
    'COURSE COORDINATORS:Ada Faculty, PharmD, BCPS', 'Assistant Professor of Pharmacy Practice', 'Office: 101', 'Email: afaculty@example.edu', '',
    'Grace Teacher, PharmD, BCPS', 'Assistant Professor of Pharmacy Practice', 'Office: 102', 'Email: gteacher@example.edu', '',
    'COURSE FACULTY: Alan Lecturer, PhD', 'Associate Professor of Pharmaceutical Sciences', 'Email: alecturer@example.edu', '',
    'TIME AND LOCATION: Monday 9:00 AM - 10:00 AM', 'Fall 2026'];
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx({ ...syntheticSyllabus, paragraphs }) });
  await expect(page.locator('#screen-review')).toBeVisible();
  await page.locator('#runValidation').click();
  await expect(page.locator('#screen-report')).toBeVisible();
  const { text } = await downloadFrom(page, async () => {
    await page.locator('#exportCourseJsonReport').click();
    await page.getByRole('dialog', { name: 'Export with validation issues?' }).getByRole('button', { name: 'Export anyway' }).click();
  });
  const course = JSON.parse(text);
  expect(course.faculty.map(f => [f.name, f.role])).toEqual([
    ['Ada Faculty, PharmD, BCPS', 'coordinator'], ['Grace Teacher, PharmD, BCPS', 'coordinator'], ['Alan Lecturer, PhD', 'faculty']]);
  expect(course.coordinatorIds).toEqual(['faculty', 'teacher']);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-')), 'course.json');
  fs.writeFileSync(file, text);
  await openTool('calendarbridge');
  await page.locator('#courseJsonInput').setInputFiles(file);
  await expect(page.locator('#screen-review')).toBeVisible();
  expect(await page.evaluate(() => state.coordinatorIds)).toEqual(['faculty', 'teacher']);
});

// Syllabi that number outcomes "CO1, CO2…", misspell "ACCOMODATION", and use colon-free policy
// headings (EXCUSED ABSENCE POLICY, ELECTRONIC DEVICES, COPYRIGHT) must still split into the
// right sections, and a bulleted policy reference must not end the course-specific policies.
test('SyllabusBridge reads CO-numbered outcomes and colon-free policy headings', async ({ page, openTool }) => {
  const paragraphs = ['PHA9999 - Synthetic Course', 'COURSE LEARNING OBJECTIVES:',
    '• CO1 – Describe synthetic organisms and the conditions they cause.',
    '• CO2 – Explain synthetic immune responses to pathogenic organisms.',
    'ACCESSIBILITY AND DISABILITY ACCOMODATION:', 'Synthetic University provides accommodations to qualified students.',
    'PROGRAM STUDENT LEARNING OUTCOMES (PSLO)',
    'COURSE SPECIFIC POLICIES', 'Please refer to the synthetic handbook for:', '• Grading Scale', '• Academic Honesty and Integrity', 'Instructors may dismiss students who violate classroom policies.',
    'EXCUSED ABSENCE POLICY', 'A student may receive an excused absence for synthetic reasons.',
    'INCOMPLETE POLICY', 'Incompletes are given at the discretion of the faculty member.',
    'ELECTRONIC DEVICES', 'No unapproved electronic devices are allowed during exams.',
    'COPYRIGHT', 'Course materials are protected by copyright law.',
    'PROFESSIONALISM', 'Students are expected to come to class prepared.'];
  const table = [['Program Mapping Course Learning Objectives to Program Student Learning Outcomes'],
    ['CO1 - Describe synthetic organisms and the conditions they cause.', 'PSLO 1.4'],
    ['CO2 – Explain synthetic immune responses to pathogenic organisms.', 'PSLO 1.1, 1.4']];
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx({ paragraphs, table }) });
  await expect(page.locator('#screen-review')).toBeVisible();
  const s = await page.evaluate(() => ({ clos: state.clos.length, maps: state.cloMappings.map(m => [m.clo, m.pslos]), p: state.policies }));
  expect(s.clos).toBe(2);
  expect(s.maps).toEqual([['CLO1', ['1.4']], ['CLO2', ['1.1', '1.4']]]);
  expect(s.p.accessibility).toBe('Synthetic University provides accommodations to qualified students.');
  expect(s.p.absence).toBe('A student may receive an excused absence for synthetic reasons.');
  expect(s.p.incomplete).toBe('Incompletes are given at the discretion of the faculty member.');
  expect(s.p.electronicPolicy).toBe('No unapproved electronic devices are allowed during exams.');
  expect(s.p.coursePolicies).toContain('Instructors may dismiss students who violate classroom policies.');
  await expect(page.locator('#mClos')).toHaveText('2');
  await expect(page.locator('#mPlos')).toHaveText('2');
});
