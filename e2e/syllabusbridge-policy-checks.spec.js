// SyllabusBridge v2.3 policy content checks, the dated policy profile, and
// "Fix this" links from report findings into the editor. Synthetic data only.
import { test, expect, downloadFrom, syntheticDocxBody, DOCX_MIME } from './fixtures.js';

// The official SUSOP scale: >=90 = 4.0; 89..70 go down 0.1 per percent;
// 69..65 go down 0.2 per percent (69 = 1.8 ... 65 = 1.0); <=64 = 0.
const gpaFor = p => p >= 70 ? (p - 50) / 10 : 2 - (70 - p) * 0.2;
const officialScale = [['≥90', '4.0'], ...Array.from({ length: 25 }, (_, i) => [String(89 - i), gpaFor(89 - i).toFixed(1)]), ['≤64', '0']];
const schedule = [['Date', 'Time', 'Topic', 'Faculty'],
  ['9/21/2026', '9:00 AM - 10:00 AM', 'Proteins', 'Dr. Ada Faculty'],
  ['9/23/2026', '9:00 AM - 10:00 AM', 'Enzymes', 'Dr. Ada Faculty']];
// The approved accessibility statement (policy profile), with a made-up campus
// contact in place of the template's {studentAffairsContact} part.
const approvedAccessibility = 'South University provides accommodations to qualified students with disabilities. The Disability Services office assists qualified students with disabilities in acquiring reasonable and appropriate accommodations and in supporting equal access to services, programs, and activities at South University. Students who seek reasonable accommodations should notify the Student Affairs Office, Dean Pat Example at 555-0100 or by email. Students should let the Student Affairs Office know of their specific limitations and, if known, their specific requested accommodations. Students will be asked to supply medical documentation of the need for accommodation. Classroom accommodations are not retroactive, but are effective only upon the student sharing approved accommodations with the instructor. Therefore, students are encouraged to request accommodations as early as feasible with the Student Affairs Office to allow time to gather necessary documentation. Complaints will be handled in accordance with the school\u2019s Internal Grievance Procedure for Complaints of Discrimination and Harassment included in the General Complaint Procedure section of the Academic Catalog.';
const compliant = {
  scale: officialScale,
  materials: 'Use South University Library databases for the drug information research paper.',
  hardware: 'A laptop with ExamSoft (current annual subscription) and a privacy filter.',
  accessibility: approvedAccessibility,
  // Policy sentences are kept longer than a heading: SyllabusBridge reads a short line that
  // contains a heading phrase ("quarter credit hour", "course coordinator") as a new section.
  engagement: 'Students are expected to engage with this course for 10 hours of instruction and 20 hours of outside work for every quarter credit hour earned.',
  programAssessment: 'The program uses ExamSoft, the end-of-course survey, and course-embedded assessments.',
  coursePolicies: 'Students must follow the SUSOP Student Handbook and the University Handbook.',
};
function syllabus(overrides = {}) {
  const s = { ...compliant, ...overrides }, body = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026'];
  if (s.scale) body.push('GRADING SCALE:', [['% Grade', 'GPA'], ...s.scale]);
  for (const [heading, key] of [['REQUIRED TEXTBOOKS AND RELATED MATERIALS:', 'materials'], ['REQUIRED HARDWARE AND SOFTWARE:', 'hardware'],
    ['ACCESSIBILITY AND DISABILITY ACCOMMODATIONS:', 'accessibility'], ['STUDENT ENGAGEMENT:', 'engagement'],
    ['PROGRAM-WIDE ASSESSMENT TOOLS:', 'programAssessment'], ['COURSE SPECIFIC POLICIES:', 'coursePolicies']])
    if (s[key] !== null) body.push(heading, s[key]);
  body.push('Course Schedule', schedule);
  return body;
}
const docx = async (overrides, name = 'syllabus.docx') => ({ name, mimeType: DOCX_MIME, buffer: await syntheticDocxBody(syllabus(overrides)) });
async function upload(page, file) { await page.locator('#file').setInputFiles(file); await expect(page.locator('#screen-review')).toBeVisible(); }
async function report(page) { await page.locator('#runValidation').click(); await expect(page.locator('#screen-report')).toBeVisible(); }
const policyStatuses = page => page.evaluate(() => Object.fromEntries(state.results.filter(r => r.category === 'Policy content').map(r => [r.id, r.status])));
const card = (page, id) => page.locator(`#check-${id}`);
const allPass = { 'policy-grading-scale': 'passed', 'policy-accessibility': 'passed', 'policy-engagement': 'passed', 'policy-hardware': 'passed',
  'policy-library': 'passed', 'policy-programAssessment': 'passed', 'policy-coursePolicies': 'passed' };

test('a syllabus that follows the policy passes all seven content checks, and the report names the policy', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx());
  await report(page);
  expect(await policyStatuses(page)).toEqual(allPass);
  await expect(page.locator('#reportPolicy')).toHaveText('Checked against SUSOP Syllabus Policy, updated 2026-09-28.');
  // The policy named in the report is part of the printed copy.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#reportPolicy')).toBeVisible();
  for (const button of await page.locator('.sb-fix').all()) await expect(button).toBeHidden();
});

test('each check explains what is missing or different', async ({ page, openTool }) => {
  const scale = officialScale.map(([p, g]) => p === '76' ? [p, '2.5'] : [p, g]).filter(([p]) => p !== '70');
  await openTool('syllabusbridge');
  await upload(page, await docx({
    scale,
    hardware: 'A laptop with ExamSoft (current annual subscription).',
    engagement: 'Students are expected to engage with this course for 10 hours of instruction for every quarter credit hour that the course carries this quarter.',
    coursePolicies: 'Students must follow the SUSOP Student Handbook.',
    accessibility: 'Students with a disability should talk to their instructor as early in the quarter as possible so that plans can be made in time.',
    programAssessment: 'The program uses ExamSoft.',
    materials: 'Complete the literature review using PubMed.',
  }));
  await report(page);
  expect(await policyStatuses(page)).toEqual({ 'policy-grading-scale': 'issue', 'policy-accessibility': 'warning', 'policy-engagement': 'warning',
    'policy-hardware': 'warning', 'policy-library': 'warning', 'policy-programAssessment': 'warning', 'policy-coursePolicies': 'warning' });
  await expect(card(page, 'policy-grading-scale')).toContainText('76% shows 2.5; the official scale is 2.6');
  await expect(card(page, 'policy-grading-scale')).toContainText('Missing: 70%');
  await expect(card(page, 'policy-hardware')).toContainText('Not found: a privacy filter.');
  await expect(card(page, 'policy-engagement')).toContainText('Not found: 20 hours of outside work.');
  await expect(card(page, 'policy-coursePolicies')).toContainText('Not found: the University Handbook.');
  await expect(card(page, 'policy-programAssessment')).toContainText('Not found: the end-of-course survey and course-embedded assessments.');
  await expect(card(page, 'policy-accessibility')).toContainText('8 of 8 sentences of the approved wording are missing or different.');
  await expect(card(page, 'policy-library')).toContainText('Research detected: "Complete the literature review using PubMed."');
  // Every part of the 2026-09-28 profile is now confirmed against the official policy.
  await expect(page.locator('#results')).not.toContainText('has not yet been confirmed');
});

test('checks SyllabusBridge cannot make say Not evaluated instead of passing', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx({ scale: null, engagement: null, materials: 'Bring a calculator.' }));
  await report(page);
  const statuses = await policyStatuses(page);
  expect(statuses['policy-grading-scale']).toBe('not-evaluated');
  expect(statuses['policy-engagement']).toBe('not-evaluated');
  // No research assignment: library resources are not required, so not evaluated (not passed).
  expect(statuses['policy-library']).toBe('not-evaluated');
  await expect(card(page, 'policy-grading-scale')).toContainText('The grading scale table was not found');
});

test('grading scale rows written in other common ways are read correctly', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx());
  const bands = await page.evaluate(() => ['≥ 90%', '>=90', '90-100', '90 – 100%', '90 and above', '90+', '76', '76%', '≤64', '64 and below', '<65', 'below 65', '0-64', 'A', ''].map(t => parsePercentBand(t)));
  expect(bands).toEqual([...Array(6).fill({ min: 90, max: 100 }), { min: 76, max: 76 }, { min: 76, max: 76 }, ...Array(5).fill({ min: 0, max: 64 }), null, null]);
  // Side-by-side columns (% Grade | GPA | % Grade | GPA) are read as two scales.
  const half = officialScale.length / 2 | 0, left = officialScale.slice(0, half), right = officialScale.slice(half);
  const rows = left.map((l, i) => [...l, ...(right[i] || ['', ''])]);
  if (right.length > left.length) rows.push(['', '', ...right.at(-1)]);
  const body = syllabus().map(x => Array.isArray(x) && x[0][0] === '% Grade' ? [['% Grade', 'GPA', '% Grade', 'GPA'], ...rows] : x);
  await upload(page, { name: 'paired.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await report(page);
  expect((await policyStatuses(page))['policy-grading-scale']).toBe('passed');
  // A letter-grade column between the percent and GPA columns is skipped.
  const lettered = syllabus().map(x => Array.isArray(x) && x[0][0] === '% Grade' ? [['% Grade', 'Letter Grade', 'GPA'], ...officialScale.map(([p, g]) => [p, 'X', g])] : x);
  await page.locator('#screen-report').getByRole('button', { name: '← Structured editor' }).click();
  await upload(page, { name: 'lettered.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(lettered) });
  await report(page);
  expect((await policyStatuses(page))['policy-grading-scale']).toBe('passed');
});

test('Fix this opens the field, links the edit to the finding, and shows it resolved after revalidating', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx({ hardware: 'A laptop with ExamSoft (current annual subscription).' }));
  await report(page);
  // Passing checks have no Fix this link.
  await expect(card(page, 'policy-engagement').locator('.sb-fix')).toHaveCount(0);
  await card(page, 'policy-hardware').getByRole('button', { name: 'Fix this: Required hardware and software' }).click();

  await expect(page.locator('#screen-review')).toBeVisible();
  const field = page.locator('#review-hardware textarea');
  await expect(field).toBeFocused();
  await expect(page.locator('#fixContext')).toContainText('Fixing: Required hardware and software');
  await field.fill('A laptop with ExamSoft (current annual subscription) and a privacy filter.');
  await field.press('Tab');
  await expect(page.locator('#fixContext')).toContainText('1 change linked so far.');
  await page.locator('#revalidateNow').click();
  await expect(page.locator('#fixContext')).toContainText('This finding now passes. Resolved by your edit.');

  await page.locator('#fixContext').getByRole('button', { name: 'Revalidate and return to report' }).click();
  await expect(page.locator('#screen-report')).toBeVisible();
  await expect(card(page, 'policy-hardware')).toContainText('Resolved by your edit');
  expect((await policyStatuses(page))['policy-hardware']).toBe('passed');
  // The change summary in the report labels the change as a fix for that finding.
  const row = page.locator('#reportChanges tbody tr').filter({ hasText: 'Required hardware and software' });
  await expect(row).toContainText('Syllabus edit');
  await expect(row).toContainText('Fix for a finding: Required hardware and software');
  await expect(page.locator('#reportChanges')).toContainText('1 was made to fix a report finding.');

  // Back in the editor without Fix this, new edits are not linked.
  await page.locator('#screen-report').getByRole('button', { name: '← Structured editor' }).click();
  await expect(page.locator('#fixContext')).toBeHidden();
  await page.locator('#courseTitle').fill('Renamed Course');
  await page.locator('#courseTitle').press('Tab');
  expect(await page.evaluate(() => Object.keys(state.changeFindings))).toEqual(['policy:hardware']);
});

test('Fix this on the grading scale opens the editable grading scale table', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx({ scale: officialScale.map(([p, g]) => p === '76' ? [p, '2.5'] : [p, g]) }));
  await report(page);
  await card(page, 'policy-grading-scale').getByRole('button', { name: /^Fix this/ }).click();
  const table = page.locator('.sb-structured-editor').filter({ hasText: 'Grading scale' });
  await expect(table.locator('textarea').first()).toBeFocused();
  const row = table.locator('tbody tr').filter({ has: page.locator('textarea', { hasText: /^76$/ }) });
  await row.locator('textarea').nth(1).fill('2.6');
  await row.locator('textarea').nth(1).press('Tab');
  await page.locator('#runValidation').click();
  await expect(card(page, 'policy-grading-scale')).toContainText('Resolved by your edit');
  expect((await policyStatuses(page))['policy-grading-scale']).toBe('passed');
});

test('finding links follow Undo and are saved in the project (format 3); format 2 projects still open', async ({ page, openTool }) => {
  const file = await docx({ hardware: 'A laptop with ExamSoft (current annual subscription).' });
  await openTool('syllabusbridge');
  await upload(page, file);
  await report(page);
  await card(page, 'policy-hardware').getByRole('button', { name: /^Fix this/ }).click();
  const field = page.locator('#review-hardware textarea');
  await field.fill('ExamSoft (current annual subscription) and a privacy filter.');
  await field.press('Tab');
  expect(await page.evaluate(() => state.changeFindings)).toEqual({ 'policy:hardware': { id: 'policy-hardware', title: 'Required hardware and software' } });
  await page.locator('#undoEdit').click();
  expect(await page.evaluate(() => state.changeFindings)).toEqual({});
  await page.locator('#redoEdit').click();
  expect(Object.keys(await page.evaluate(() => state.changeFindings))).toEqual(['policy:hardware']);

  const { text } = await downloadFrom(page, () => page.locator('#saveProject').click());
  const project = JSON.parse(text);
  expect(project.formatVersion).toBe(3);
  expect(project.changeFindings).toEqual({ 'policy:hardware': { id: 'policy-hardware', title: 'Required hardware and software' } });

  const reopen = async value => {
    await page.reload();
    await page.locator('#openProject').click();
    await page.locator('#projectFile').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
    await page.locator('#file').setInputFiles(file);
    await expect(page.locator('#screen-review')).toBeVisible();
    return page.evaluate(() => ({ links: state.changeFindings, changes: editorDiffCount() }));
  };
  expect(await reopen(project)).toEqual({ links: project.changeFindings, changes: 1 });
  await report(page);
  await expect(card(page, 'policy-hardware')).toContainText('Resolved by your edit');

  const formatTwo = structuredClone(project);
  formatTwo.formatVersion = 2;
  delete formatTwo.changeFindings;
  expect(await reopen(formatTwo)).toEqual({ links: {}, changes: 1 });

  const damaged = structuredClone(project);
  damaged.changeFindings = { 'policy:hardware': 'not a link' };
  await page.reload();
  await page.locator('#openProject').click();
  await page.locator('#projectFile').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(damaged)) });
  await expect(page.locator('#uploadError')).toContainText('problem found in: links to findings');
});

// Review findings (PR #34). Each failed before its fix.
test('deleted library wording no longer counts as evidence after an edit', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx());
  const materials = page.locator('#review-materials textarea');
  await materials.fill('Complete the research paper using PubMed.');
  await materials.press('Tab');
  await report(page);
  expect((await policyStatuses(page))['policy-library']).toBe('warning');
  await expect(card(page, 'policy-library')).not.toContainText('South University Library databases');
  await expect(card(page, 'policy-library')).toContainText('Not found: points to South University Library resources.');
});

test('a fix that is undone and typed again is still linked to its finding', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx({ hardware: 'A laptop with ExamSoft (current annual subscription).' }));
  await report(page);
  await card(page, 'policy-hardware').getByRole('button', { name: /^Fix this/ }).click();
  const field = page.locator('#review-hardware textarea'), fixed = 'A laptop with ExamSoft (current annual subscription) and a privacy filter.';
  await field.fill(fixed);
  await field.press('Tab');
  await page.locator('#undoEdit').click();
  expect(await page.evaluate(() => state.changeFindings)).toEqual({});
  await page.locator('#review-hardware textarea').fill(fixed);
  await page.locator('#review-hardware textarea').press('Tab');
  expect(Object.keys(await page.evaluate(() => state.changeFindings))).toEqual(['policy:hardware']);
  await page.locator('#fixContext').getByRole('button', { name: 'Revalidate and return to report' }).click();
  await expect(card(page, 'policy-hardware')).toContainText('Resolved by your edit');
});

test('with no research assignment the library check is Not evaluated, even when the library is mentioned', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  await upload(page, await docx({ materials: 'South University Library resources are available to every student in this course.' }));
  await report(page);
  expect((await policyStatuses(page))['policy-library']).toBe('not-evaluated');
  await expect(card(page, 'policy-library')).toContainText('No assignment that involves research was detected');
});

test('a Percent | GPA table can be fixed in the editor', async ({ page, openTool }) => {
  const body = syllabus({ scale: officialScale.map(([p, g]) => p === '76' ? [p, '2.5'] : [p, g]) })
    .map(x => Array.isArray(x) && x[0][0] === '% Grade' ? [['Percent', 'GPA'], ...x.slice(1)] : x);
  await openTool('syllabusbridge');
  await upload(page, { name: 'percent.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await report(page);
  expect((await policyStatuses(page))['policy-grading-scale']).toBe('issue');
  await card(page, 'policy-grading-scale').getByRole('button', { name: /^Fix this/ }).click();
  const table = page.locator('.sb-structured-editor').filter({ hasText: 'Grading scale' });
  await expect(table.locator('textarea').first()).toBeFocused();
  const row = table.locator('tbody tr').filter({ has: page.locator('textarea', { hasText: /^76$/ }) });
  await row.locator('textarea').nth(1).fill('2.6');
  await row.locator('textarea').nth(1).press('Tab');
  await page.locator('#runValidation').click();
  expect((await policyStatuses(page))['policy-grading-scale']).toBe('passed');
  await expect(card(page, 'policy-grading-scale')).toContainText('Resolved by your edit');
});

// QA review of real syllabi (PHA4330, PHA4331), reproduced with synthetic data.
// Each failed before its fix.
test('QA: the official 65-69% values, an unlabeled third column pair, and compact table boxes', async ({ page, openTool }) => {
  // The PHA4331 layout: three side-by-side pairs, the third with blank headers.
  const third = Math.ceil(officialScale.length / 3), cols = [0, 1, 2].map(k => officialScale.slice(k * third, (k + 1) * third));
  const rows = cols[0].map((_, i) => cols.flatMap(c => c[i] || ['', '']));
  const body = syllabus().map(x => Array.isArray(x) && x[0][0] === '% Grade' ? [['% Grade', 'GPA', '% Grade', 'GPA', '', ''], ...rows] : x);
  await openTool('syllabusbridge');
  await upload(page, { name: 'three-pairs.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  const box = page.locator('.sb-structured-editor').filter({ hasText: 'Grading scale' }).locator('textarea').first();
  expect((await box.boundingBox()).height).toBeLessThan(80);
  await report(page);
  expect((await policyStatuses(page))['policy-grading-scale']).toBe('passed');
  await expect(card(page, 'policy-grading-scale')).toContainText('All 27 rows match');
  await expect(card(page, 'policy-grading-scale')).not.toContainText('has not yet been confirmed');
  // A table using the old 65-69% values (1.9 ... 1.5) is flagged.
  const old = syllabus({ scale: officialScale.map(([p, g]) => p === '67' ? [p, '1.7'] : [p, g]) });
  await upload(page, { name: 'old.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(old) });
  await report(page);
  await expect(card(page, 'policy-grading-scale')).toContainText('67% shows 1.7; the official scale is 1.4');
});

test('QA: wording found where real syllabi put it', async ({ page, openTool }) => {
  const body = [...syllabus({
    // PHA4331: the privacy filter is listed under textbooks and materials.
    hardware: 'A laptop computer with ExamSoft (current annual subscription) and the University standard browser requirements.',
    materials: 'Required textbooks are listed on the course page. A 3M Privacy Filter or its equivalent is required for exams.',
    // PHA4330/4331: "Course-embedded Learning Assessments".
    programAssessment: 'ExamSoft is used in this course, an end of course survey is conducted, and Course-embedded Learning Assessments are used.',
    // PHA4330: the handbook sentence sits outside Course Specific Policies (added after the schedule below).
    coursePolicies: 'Course policies for this course are listed in the sections that follow below in this syllabus document.',
    // The standard engagement wording mentions research; it is not a research assignment.
    engagement: 'Students can expect 10 hours of instruction and 20 hours of outside work per quarter credit hour, including all research associated with completing assignments.',
  }), 'Please refer to the SUSOP Student Handbook and University Handbook for details on the following policies:'];
  await openTool('syllabusbridge');
  await upload(page, { name: 'wording.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await report(page);
  const statuses = await policyStatuses(page);
  expect(statuses).toMatchObject({ 'policy-hardware': 'passed', 'policy-programAssessment': 'passed', 'policy-coursePolicies': 'passed' });
  // No research assignment once the engagement wording is set aside.
  expect(statuses['policy-library']).toBe('not-evaluated');
});

test('QA: schedule rows, headings, TBD dates, and shared meeting days are read like the real syllabi', async ({ page, openTool }) => {
  const body = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026',
    'TIME AND LOCATION: Lecture: Tuesday and Thursday 1:30-2:50',
    // PHA4330: the calendar heading mentions "course coordinators".
    'COURSE CALENDAR: **Schedule is subject to change at discretion of course coordinators',
    [['#', 'DAY', 'DATE', 'TIME', 'TOPIC'],
      ['Week 1', '', '', '', ''],
      // PHA4330: several dates in one row.
      ['1-2', 'Tu\nTh', '9/22\n9/24', '1:30-2:50\n1:30-2:50', 'Proteins\nEnzymes'],
      ['Week 2', '', '', '', ''],
      ['3', 'Tu', '9/29', '1:30-2:50', 'Hemoglobin'],
      ['Finals Week', '', '', '', ''],
      // PHA4331: the final exam has no date yet.
      ['', '', 'TBD', '8:00-12:30', 'Final Exam']]];
  await openTool('syllabusbridge');
  await upload(page, { name: 'schedule.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  expect(await page.evaluate(() => state.meetingPatterns.map(m => m.day))).toEqual(['Tuesday', 'Thursday']);
  expect(await page.evaluate(() => state.schedule.map(e => [e.date, e.topic]))).toEqual([['9/22', 'Proteins'], ['9/24', 'Enzymes'], ['9/29', 'Hemoglobin'], ['TBD', 'Final Exam']]);
  // The TBD row is shown for faculty to date, not silently dropped.
  await expect(page.locator('#scheduleBody tr.sb-schedule-invalid')).toHaveCount(1);
  await report(page);
  const results = await page.evaluate(() => Object.fromEntries(state.results.map(r => [r.id, [r.status, r.evidence]])));
  // Heading found, and 4 of 4 entries: week rows are not counted as missing.
  expect(results['section-schedule']).toEqual(['passed', 'Heading found · 4 of 4 schedule rows extracted (100% coverage).']);
  expect(results['schedule-internal'][1]).toContain('Parsed 4 schedule entries from 4 source schedule rows');
  expect(results['schedule-internal'][1]).not.toContain('not represented');
  expect(results['schedule-handoff-dates'][0]).toBe('issue');
});

test('the accessibility statement is compared with the approved wording, apart from the campus contact', async ({ page, openTool }) => {
  await openTool('syllabusbridge');
  // Different capitals, spacing, and quote marks still match.
  const restyled = approvedAccessibility.toUpperCase().replace(/ /g, '  ').replace('\u2019', "'");
  await upload(page, await docx({ accessibility: restyled }));
  await report(page);
  expect((await policyStatuses(page))['policy-accessibility']).toBe('passed');
  await expect(card(page, 'policy-accessibility')).toContainText('Matches the approved wording (8 sentences).');

  // PHA4331's version: students are sent to a coordinator, not the Student Affairs Office.
  const changed = approvedAccessibility.replace('let the Student Affairs Office know', 'let their Disability Service Coordinator know');
  await upload(page, await docx({ accessibility: changed }));
  await report(page);
  expect((await policyStatuses(page))['policy-accessibility']).toBe('warning');
  await expect(card(page, 'policy-accessibility')).toContainText('1 of 8 sentences of the approved wording is missing or different.');
  await expect(card(page, 'policy-accessibility')).toContainText('Missing or different: "Students should let the Student Affairs Office know');

  // The campus contact is left blank in the profile, so any contact is accepted and the report says so.
  await expect(card(page, 'policy-accessibility')).toContainText('The campus-specific contact is not set in the policy profile, so it was not compared.');
  // When a campus sets a contact, a statement naming someone else is flagged.
  await upload(page, await docx({ accessibility: approvedAccessibility }));
  await page.evaluate(() => { policyProfile().campus.studentAffairsContact = 'Sam Sample'; });
  await report(page);
  await expect(card(page, 'policy-accessibility')).toContainText('The approved wording is present, but the campus contact is not named.');
  await page.evaluate(() => { policyProfile().campus.studentAffairsContact = 'Pat Example'; });
  await page.locator('#screen-report').getByRole('button', { name: '← Structured editor' }).click();
  await report(page);
  await expect(card(page, 'policy-accessibility')).toContainText('Matches the approved wording (8 sentences), with the campus contact.');
});

// Review findings, round 2. Each failed before its fix.
test('wording deleted from an inline heading line is not evidence', async ({ page, openTool }) => {
  const body = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026',
    'REQUIRED TEXTBOOKS AND RELATED MATERIALS: Use South University Library for the research paper.',
    'Course Schedule', schedule];
  await openTool('syllabusbridge');
  await upload(page, { name: 'inline.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  const materials = page.locator('#review-materials textarea');
  await expect(materials).toHaveValue('Use South University Library for the research paper.');
  await materials.fill('Complete the research paper using PubMed.');
  await materials.press('Tab');
  await report(page);
  expect((await policyStatuses(page))['policy-library']).toBe('warning');
  await expect(card(page, 'policy-library')).not.toContainText('Use South University Library');
});

test('the same wording in a paragraph and a table counts until both are changed', async ({ page, openTool }) => {
  const line = 'Use the South University Library research guide for this course.';
  const body = ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026',
    'REQUIRED TEXTBOOKS AND RELATED MATERIALS:', line,
    'Project rubric', [['Component', 'Points'], [line, '10'], ['Presentation', '10']],
    'Course Schedule', schedule];
  await openTool('syllabusbridge');
  await upload(page, { name: 'duplicate.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await page.locator('#review-materials textarea').fill('Bring a calculator.');
  await page.locator('#review-materials textarea').press('Tab');
  await report(page);
  // The rubric still says it, so the library is still referenced.
  expect((await policyStatuses(page))['policy-library']).toBe('passed');
  await page.locator('#screen-report').getByRole('button', { name: '← Structured editor' }).click();
  const cell = page.locator('.sb-structured-editor').filter({ hasText: 'Project / Assignment Rubric' }).locator('tbody tr').first().locator('textarea').first();
  await cell.fill('Write a research summary.');
  await cell.press('Tab');
  await report(page);
  expect((await policyStatuses(page))['policy-library']).toBe('warning');
  await expect(card(page, 'policy-library')).not.toContainText('South University Library research guide');
});

test('template cleanup: Fix this opens the field with the placeholder selected, and the edit resolves it', async ({ page, openTool }) => {
  const body = [...syllabus(), 'ABSENCE POLICY: Policy is at the discretion of the course coordinator'];
  await openTool('syllabusbridge');
  await upload(page, { name: 'cleanup.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await report(page);
  const finding = card(page, 'template-cleanup');
  await expect(finding).toContainText('Policy is at the discretion of the course coordinator (in Absence policy)');
  await finding.getByRole('button', { name: /^Fix this/ }).click();
  const field = page.locator('#review-absence textarea');
  await expect(field).toBeFocused();
  expect(await field.evaluate(t => t.value.slice(t.selectionStart, t.selectionEnd))).toBe('Policy is at the discretion of the course coordinator');
  await field.fill('Students who miss a graded assessment must notify the course coordinator within 24 hours.');
  await field.press('Tab');
  await page.locator('#runValidation').click();
  await expect(finding).toContainText('Resolved by your edit');
  expect(await page.evaluate(() => state.results.find(r => r.id === 'template-cleanup').status)).toBe('passed');
});

test('template cleanup still finds placeholders the editor cannot change, such as a misspelled heading', async ({ page, openTool }) => {
  const body = [...syllabus({ materials: null }), 'REQUIRED TEXBOOKS AND RELATED MATERIALS', 'Bring a calculator to every class session.'];
  await openTool('syllabusbridge');
  await upload(page, { name: 'heading.docx', mimeType: DOCX_MIME, buffer: await syntheticDocxBody(body) });
  await report(page);
  await expect(card(page, 'template-cleanup')).toContainText('REQUIRED TEXBOOKS AND RELATED MATERIALS');
  expect(await page.evaluate(() => state.results.find(r => r.id === 'template-cleanup').status)).toBe('issue');
});
