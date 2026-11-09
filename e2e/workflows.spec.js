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

// Calendar files must say class times are Eastern, so they land at the right hour in any
// calendar app and on any computer. The exporting computer here is set to Pacific time, and
// the course runs across the November daylight-saving change.
test.describe('CalendarBridge time zone', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('calendar files carry Eastern time across daylight saving, whatever the computer zone', async ({ page, openTool }) => {
    const syllabus = { ...syntheticSyllabus, paragraphs: syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule') };
    await openTool('syllabusbridge');
    await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syllabus) });
    await page.locator('#runValidation').click();
    const { text } = await downloadFrom(page, async () => {
      await page.locator('#exportCourseJsonReport').click();
      await page.getByRole('dialog', { name: 'Export with validation issues?' }).getByRole('button', { name: 'Export anyway' }).click();
    });
    // Move the three Mon/Wed/Mon classes to straddle 1 Nov 2026, when Eastern time leaves daylight saving.
    const course = JSON.parse(text);
    const moved = { '2026-09-21': '2026-10-26', '2026-09-23': '2026-10-28', '2026-09-28': '2026-11-02' };
    course.schedule.forEach(e => { e.date = moved[e.date]; });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-')), 'course.json');
    fs.writeFileSync(file, JSON.stringify(course));

    await openTool('calendarbridge');
    await page.locator('#courseJsonInput').setInputFiles(file);
    await page.locator('#toFaculty').click();
    await page.locator('#toExport').click();
    await expect(page.locator('#screen-export')).toContainText('Eastern Time');
    const ics = (await downloadFrom(page, () => page.locator('#downloadSharedIcs').click())).text;
    // Class times keep their clock time and carry the Eastern zone; none is left without a zone.
    const events = ics.slice(ics.indexOf('BEGIN:VEVENT'));
    expect(events.match(/^DTSTART.*$/gm)).toEqual(['DTSTART;TZID=America/New_York:20261026T090000',
      'DTSTART;TZID=America/New_York:20261028T090000', 'DTSTART;TZID=America/New_York:20261102T090000']);
    expect(events.match(/^DTEND.*$/gm)).toEqual(['DTEND;TZID=America/New_York:20261026T100000',
      'DTEND;TZID=America/New_York:20261028T100000', 'DTEND;TZID=America/New_York:20261102T100000']);
    // One zone definition with the US daylight-saving rules, before the first event.
    const zone = ics.slice(ics.indexOf('BEGIN:VTIMEZONE'), ics.indexOf('END:VTIMEZONE'));
    expect(ics.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1);
    expect(ics.indexOf('END:VTIMEZONE')).toBeLessThan(ics.indexOf('BEGIN:VEVENT'));
    for (const line of ['TZID:America/New_York', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'BEGIN:STANDARD', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU']) expect(zone).toContain(line);
  });
});

// A revised syllabus must update events already in faculty calendars, not add second copies.
// Calendar apps recognize an update by the same UID with a higher SEQUENCE, so each event keeps
// its UID across revisions, unchanged events keep their SEQUENCE, and changed events go up by one.
test('CalendarBridge revised calendars keep event IDs and number each change', async ({ page, openTool }) => {
  const header = ['PHA9999 - Synthetic Course', 'COURSE COORDINATOR: Ada Faculty, PharmD', 'Email: afaculty@example.edu', 'Fall 2026', 'Course Schedule'];
  const row = (date, time, topic) => [date, time, topic, 'Ada Faculty'];
  const syllabus = rows => ({ paragraphs: header, table: [['Date', 'Time', 'Topic', 'Faculty'], ...rows] });
  const original = [row('9/21/2026', '9:00 AM - 10:00 AM', 'Proteins'), row('9/23/2026', '9:00 AM - 10:00 AM', 'Enzymes'),
    row('9/28/2026', '9:00 AM - 10:00 AM', 'Hemoglobin')];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  const events = ics => Object.fromEntries(ics.split('BEGIN:VEVENT').slice(1).map(v => [v.match(/^SUMMARY:.*: (.+)$/m)[1],
    { uid: v.match(/^UID:(.+)$/m)[1], seq: v.match(/^SEQUENCE:(.+)$/m)?.[1] }]));
  const exportShared = async () => {
    await page.locator('#toFaculty').click();
    await page.locator('#toExport').click();
    return events((await downloadFrom(page, () => page.locator('#downloadSharedIcs').click())).text);
  };
  const saveAndReopen = async (name, revised) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, (await downloadFrom(page, () => page.locator('#saveProject').click())).text);
    await openTool('calendarbridge');
    await page.locator('#projectInput').setInputFiles(file);
    await expect(page.locator('#screen-review')).toBeVisible();
    await page.locator('#revisionInput').setInputFiles({ name: 'revised.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syllabus(revised)) });
    await expect(page.locator('#revisionPanel')).toBeVisible();
  };

  await openTool('calendarbridge');
  await page.locator('#fileInput').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syllabus(original)) });
  await expect(page.locator('#screen-review')).toBeVisible();
  const first = await exportShared();
  expect(Object.values(first).map(e => e.seq)).toEqual(['0', '0', '0']);
  // The export screen tells faculty what to do when the syllabus changes.
  await expect(page.locator('#screen-export')).toContainText('If the syllabus changes');

  // Revision 1: Enzymes moves to the afternoon and a Lipids class is added.
  const rev1 = [original[0], row('9/23/2026', '1:00 PM - 2:00 PM', 'Enzymes'), original[2], row('9/30/2026', '9:00 AM - 10:00 AM', 'Lipids')];
  await saveAndReopen('v1.json', rev1);
  await expect(page.locator('#revChanged')).toHaveText('1');
  const second = await exportShared();
  expect(second.Proteins).toEqual(first.Proteins);
  expect(second.Hemoglobin).toEqual(first.Hemoglobin);
  expect(second.Enzymes).toEqual({ uid: first.Enzymes.uid, seq: '1' });
  expect(second.Lipids.seq).toBe('0');
  expect(new Set(Object.values(second).map(e => e.uid)).size).toBe(4);

  // Revision 2, compared with the project saved after revision 1: Enzymes moves again.
  const rev2 = [rev1[0], row('9/23/2026', '2:00 PM - 3:00 PM', 'Enzymes'), rev1[2], rev1[3]];
  await saveAndReopen('v2.json', rev2);
  const third = await exportShared();
  expect(third.Enzymes).toEqual({ uid: first.Enzymes.uid, seq: '2' });
  expect(third.Proteins).toEqual(first.Proteins);
  expect(third.Lipids).toEqual(second.Lipids);

  // Revision 3: Enzymes moves to another day. Without a lecture number the comparison matches
  // events by date, so a moved event must still be recognized as the same event: same UID, next
  // SEQUENCE, and no "removed" copy carrying that UID.
  const rev3 = [rev2[0], row('9/25/2026', '2:00 PM - 3:00 PM', 'Enzymes'), rev2[2], rev2[3]];
  await saveAndReopen('v3.json', rev3);
  await expect(page.locator('#revChanged')).toHaveText('1');
  await expect(page.locator('#revAdded')).toHaveText('0');
  await expect(page.locator('#revRemoved')).toHaveText('0');
  const fourth = await exportShared();
  expect(fourth.Enzymes).toEqual({ uid: first.Enzymes.uid, seq: '3' });
  expect(fourth.Proteins).toEqual(first.Proteins);
  expect(new Set(Object.values(fourth).map(e => e.uid)).size).toBe(4);
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
