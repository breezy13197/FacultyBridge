// SyllabusBridge v2.3 policy content checks, the dated policy profile, and
// "Fix this" links from report findings into the editor. Synthetic data only.
import { test, expect, downloadFrom, syntheticDocxBody, DOCX_MIME } from './fixtures.js';

// The official scale as recorded in the policy profile: >=90 = 4.0,
// 89..65 = (percent - 50) / 10, <=64 = 0.
const officialScale = [['≥90', '4.0'], ...Array.from({ length: 25 }, (_, i) => [String(89 - i), ((39 - i) / 10).toFixed(1)]), ['≤64', '0']];
const schedule = [['Date', 'Time', 'Topic', 'Faculty'],
  ['9/21/2026', '9:00 AM - 10:00 AM', 'Proteins', 'Dr. Ada Faculty'],
  ['9/23/2026', '9:00 AM - 10:00 AM', 'Enzymes', 'Dr. Ada Faculty']];
const compliant = {
  scale: officialScale,
  materials: 'Use South University Library databases for the drug information research paper.',
  hardware: 'A laptop with ExamSoft (current annual subscription) and a privacy filter.',
  accessibility: 'Students with a disability who need reasonable accommodations should contact the Office of Student Affairs.',
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
  await expect(card(page, 'policy-accessibility')).toContainText('Not found: offers reasonable accommodations and tells students to contact Student Affairs.');
  await expect(card(page, 'policy-library')).toContainText('Research detected: "Complete the literature review using PubMed."');
  // Wording not yet confirmed against the official policy says so in the report.
  await expect(card(page, 'policy-accessibility')).toContainText('has not yet been confirmed against the official policy');
  await expect(card(page, 'policy-hardware')).not.toContainText('has not yet been confirmed');
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
