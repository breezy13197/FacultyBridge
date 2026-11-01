// One complete synthetic workflow per tool, from file load to checked export.
// Shared by workflows.spec.js (online) and offline.spec.js (network disabled after load),
// so both prove the same thing. Synthetic data only; see tests/README.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  expect, parseCsv, downloadFrom, syntheticDocx, syntheticSyllabus, DOCX_MIME,
  syntheticItemCsv, syntheticExamRtf,
} from './fixtures.js';

const JSZip = createRequire(import.meta.url)('../vendor/jszip-3.10.1.min.js');

export const gradeExamCsv = [
  'StudentID,First Name,Last Name,Pts,%',
  '1001,Anna,Able,45,90',
  '1002,Ben,Baker,40,80',
  '1003,Cara,Clark,50,100',
].join('\r\n') + '\r\n';
export const gradeBrightCsv = [
  'OrgDefinedId,Username,Last Name,First Name,Exam 1 Points Grade,End-of-Line Indicator',
  '00001,#aable,Able,Anna,,#',
  '00002,#bbaker,Baker,Ben,,#',
  '00003,#cclark,Clark,Cara,,#',
  '00004,#ddavis,Davis,Dan,,#',
].join('\r\n') + '\r\n';
export const groupRosterCsv = 'Last Name,First Name,Username,Org Defined ID,Exam 1 Points Grade\r\n' +
  'Able,Anna,#aable,00001,80\r\nBaker,Ben,bbaker,00002,70\r\nClark,Cara,cclark,00003,90\r\nDavis,Dan,ddavis,00004,\r\n';

const csvFile = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

export const workflows = {
  // Load an ExamSoft Item Analysis, export the review, and verify every flagged item.
  async itembridge({ page, openTool }) {
    await openTool('itembridge');
    await page.locator('#fileInput').setInputFiles(csvFile('synthetic.csv', syntheticItemCsv));
    await expect(page.locator('#workspace')).toBeVisible();
    const { name, text } = await downloadFrom(page, () => page.locator('#exportReview').click());
    expect(name).toMatch(/\.csv$/);
    const rows = parseCsv(text);
    const header = rows.find(r => r[0] === 'Item #');
    expect(header).toEqual(expect.arrayContaining(['ItemID', 'Recommendation', 'Difficulty', 'Discrimination', 'Point Biserial', 'Item Text', 'Parse Status']));
    const col = n => header.indexOf(n);
    const items = rows.slice(rows.indexOf(header) + 1).filter(r => /^\d+$/.test(r[0]));
    expect(items.map(r => r[col('ItemID')])).toEqual(['SYN-1', 'SYN-2', 'SYN-3']);
    // Values survive the round trip unchanged.
    expect(items.map(r => [r[col('Difficulty')], r[col('Discrimination')], r[col('Point Biserial')]]))
      .toEqual([['0.85', '0.3', '0.35'], ['0.2', '0.02', '0.01'], ['0.5', '-0.2', '-0.25']]);
    expect(items.map(r => r[col('Item Text')])[0]).toBe('Which molecule transports oxygen?');
    // Every item must actually be analyzed (guards against fixtures that silently parse as unreadable).
    expect(items.map(r => r[col('Parse Status')])).toEqual(['ok', 'ok', 'ok']);
    const rec = items.map(r => r[col('Recommendation')]);
    expect(rec[0]).toMatch(/Strong item|No concern/);
    expect(rec[1]).toMatch(/Needs review|Revision suggested|Consider removal/);
    expect(rec[2]).toMatch(/Revision suggested|Consider removal/);
  },

  // Load a synthetic ExamSoft RTF export, generate the report, and check its content.
  async exambridge({ page, openTool }) {
    await openTool('exambridge');
    await page.locator('#fileInput').setInputFiles({ name: 'synthetic.doc', mimeType: 'application/msword', buffer: Buffer.from(syntheticExamRtf) });
    await expect(page.locator('#resultsView')).toBeVisible();
    const exam = await page.evaluate(() => {
      const e = window.__ExamBridgeQA.getState().exam;
      return { n: e.questions.length, stems: e.questions.map(q => q.stem) };
    });
    expect(exam.n).toBe(2);
    expect(exam.stems.join(' ')).toContain('oxygen');
    await page.evaluate(() => { window.print = () => {}; });
    await page.locator('#printBtn').click();
    await page.locator('#generateReportBtn').click();
    const report = await page.locator('#reportOutput').innerText();
    expect(report).toContain('PHA9999');
    expect(report).toContain('Which molecule transports oxygen?');
    expect(report).toContain('Which organelle makes most ATP?');
  },

  // Paste questions and download all four export formats; check each one's content.
  async questionbridge({ page, openTool }) {
    await openTool('questionbridge');
    await page.locator('[data-screen="upload"]').click();
    await page.locator('#pasteText').fill('1. Which molecule transports oxygen?\n*A. Hemoglobin\nB. Glycogen\nC. DNA\nD. ATP');
    await page.locator('#parsePaste').click();
    await expect(page.locator('#stem')).toHaveValue(/transports oxygen/);
    await page.locator('[data-screen="export"]').click();
    const buttons = page.locator('#exportGrid button:has-text("Download")');
    await expect(buttons).toHaveCount(4);
    const files = {};
    for (let i = 0; i < 4; i++) {
      const pending = page.waitForEvent('download');
      await buttons.nth(i).click();
      const download = await pending;
      files[download.suggestedFilename().replace(/^.*-(brightspace|examsoft-legacy|kahoot|poll-everywhere)\./, '$1.')] =
        fs.readFileSync(await download.path());
      await download.delete();
    }
    const text = name => files[Object.keys(files).find(k => k.startsWith(name))].toString('utf8');
    // Brightspace: the correct option carries 100, the others 0.
    const bright = text('brightspace');
    expect(bright).toContain('QuestionText,Which molecule transports oxygen?');
    expect(bright).toMatch(/Option,100,Hemoglobin/);
    for (const wrong of ['Glycogen', 'DNA', 'ATP']) expect(bright).toMatch(new RegExp(`Option,0,${wrong}`));
    // Legacy ExamSoft RTF: the correct answer is starred.
    const rtf = text('examsoft-legacy');
    expect(rtf).toMatch(/^\{\\rtf1/);
    expect(rtf).toContain('*a. Hemoglobin');
    // Poll Everywhere: the correct option is marked with ***.
    expect(text('poll-everywhere')).toContain('***Hemoglobin,Glycogen,DNA,ATP');
    // Kahoot is an XLSX (zip) that contains the question and every answer.
    const kahoot = files[Object.keys(files).find(k => k.startsWith('kahoot'))];
    expect(kahoot.subarray(0, 2).toString()).toBe('PK');
    const sheet = await JSZip.loadAsync(kahoot);
    const strings = await sheet.file('xl/sharedStrings.xml')?.async('string');
    const cells = strings ?? await sheet.file('xl/worksheets/sheet1.xml').async('string');
    for (const t of ['Which molecule transports oxygen?', 'Hemoglobin', 'Glycogen', 'DNA', 'ATP']) expect(cells).toContain(t);
  },

  // Convert ExamSoft + Brightspace files to a Brightspace import and verify the CSV exactly.
  async gradebridge({ page, openTool }) {
    await openTool('gradebridge');
    await page.locator('#examFile').setInputFiles(csvFile('exam.csv', gradeExamCsv));
    await page.locator('#brightFile').setInputFiles(csvFile('grades.csv', gradeBrightCsv));
    await expect(page.locator('#preflightCard')).toBeVisible();
    await expect(page.locator('#pfExam')).toHaveText('3');
    await expect(page.locator('#pfBright')).toHaveText('4');
    await expect(page.locator('#maxPoints')).toHaveValue('50'); // inferred from Pts / %
    await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
    await page.locator('#continueBtn').click();
    await expect(page.locator('#reviewCard')).toBeVisible();
    await expect(page.locator('#mAttention')).toHaveText('0');
    await expect(page.locator('#mResolved')).toHaveText('3');
    await expect(page.locator('#mBrightOnly')).toHaveText('1'); // Dan Davis is not in ExamSoft
    await page.locator('#prepareBtn').click();
    await expect(page.locator('#auditCard')).toBeVisible();
    // Raw points must not be downloadable until the maximum is confirmed.
    await expect(page.locator('#downloadBtn')).toBeDisabled();
    await page.locator('#maxConfirm').check();
    const { name, text } = await downloadFrom(page, () => page.locator('#downloadBtn').click());
    expect(name).toBe('Brightspace_Exam_1.csv');
    // Leading zeros in IDs are preserved; scores are raw points, not percentages.
    expect(text).toBe('OrgDefinedId,Exam 1 Points Grade,End-of-Line Indicator\r\n00001,45,#\r\n00002,40,#\r\n00003,50,#\r\n');
  },

  // Generate balanced groups, name them, and verify both exports.
  async groupbridge({ page, openTool }) {
    await openTool('groupbridge');
    await page.locator('#fileInput').setInputFiles(csvFile('roster.csv', groupRosterCsv));
    await page.locator('#toConfig').click();
    await page.locator('#groupCount').fill('2');
    await page.locator('#balanceCol').selectOption('Exam 1 Points Grade');
    await page.locator('#generateBtn').click();
    await expect(page.locator('.member')).toHaveCount(4);
    await expect(page.locator('.score.missing')).toHaveCount(1); // Dan has no score and is disclosed
    await page.locator('#toExport').click();
    await page.locator('#gCode0').fill('G1');
    await page.locator('#gCode1').fill('G2');
    await expect(page.locator('#downloadBright')).toBeEnabled();
    const { name, text } = await downloadFrom(page, () => page.locator('#downloadBright').click());
    expect(name).toMatch(/^GroupBridge-Brightspace-Group-Import-\d{4}-\d{2}-\d{2}\.csv$/);
    const rows = parseCsv(text).filter(r => r.length > 1 || r[0]);
    expect(rows).toHaveLength(4);
    expect(rows.every(r => r[0] === 'ENROLL')).toBe(true);
    expect(rows.map(r => r[1]).sort()).toEqual(['aable', 'bbaker', 'cclark', 'ddavis']); // '#' prefix stripped
    expect(rows.map(r => r[2]).sort()).toEqual(['00001', '00002', '00003', '00004']);
    // Every student is enrolled exactly once, in one of the two groups, using the codes we typed.
    expect(new Set(rows.map(r => r[3]))).toEqual(new Set(['Group 1', 'Group 2']));
    expect(new Set(rows.map(r => r[4]))).toEqual(new Set(['G1', 'G2']));
    expect(rows.filter(r => r[4] === 'G1')).toHaveLength(2);
    expect(rows.filter(r => r[4] === 'G2')).toHaveLength(2);
    expect(text.charCodeAt(0)).not.toBe(0xFEFF); // Brightspace import must have no BOM
  },

  // Word syllabus -> validation -> Course JSON -> CalendarBridge -> .ics calendars.
  async syllabusbridge({ page, openTool }) {
    const syllabus = { ...syntheticSyllabus, paragraphs: syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule') };
    await openTool('syllabusbridge');
    await page.locator('#file').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syllabus) });
    await expect(page.locator('#screen-review')).toBeVisible();
    await expect(page.locator('#mSchedule')).toHaveText('3');
    await page.locator('#runValidation').click();
    await expect(page.locator('#screen-report')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    const { text } = await downloadFrom(page, () => page.locator('#exportCourseJsonReport').click());
    const course = JSON.parse(text);
    expect(course.schema).toBe('facultybridge.course');
    expect(course.course).toMatchObject({ code: 'PHA9999', title: 'Synthetic Course', year: 2026 });
    expect(course.faculty.map(f => f.name)).toEqual(['Dr. Ada Faculty']);
    expect(course.schedule.map(e => e.date)).toEqual(['2026-09-21', '2026-09-23', '2026-09-28']);
    expect(course.schedule.map(e => e.startTime)).toEqual(['09:00', '09:00', '09:00']);

    // Hand the exported Course JSON to CalendarBridge.
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-')), 'course.json');
    fs.writeFileSync(file, text);
    await openTool('calendarbridge');
    await page.locator('#courseJsonInput').setInputFiles(file);
    await expect(page.locator('#screen-review')).toBeVisible();
    await page.locator('#toFaculty').click();
    await expect(page.locator('#toExport')).toBeEnabled();
    await page.locator('#toExport').click();
    const shared = await downloadFrom(page, () => page.locator('#downloadSharedIcs').click());
    const ics = shared.text;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/^DTSTART:\d{8}T\d{6}$/gm)).toEqual(['DTSTART:20260921T090000', 'DTSTART:20260923T090000', 'DTSTART:20260928T090000']);
    expect(ics.match(/^DTEND:\d{8}T\d{6}$/gm)).toEqual(['DTEND:20260921T100000', 'DTEND:20260923T100000', 'DTEND:20260928T100000']);
    for (const topic of ['Proteins', 'Enzymes', 'Hemoglobin']) expect(ics).toContain(`SUMMARY:PHA9999 – Synthetic Course: ${topic}`);
    // UIDs must be unique or calendar apps merge events.
    const uids = ics.match(/^UID:.+$/gm);
    expect(new Set(uids).size).toBe(3);
    // Per-faculty file holds that instructor's events only.
    const faculty = await downloadFrom(page, () => page.locator('#directExportList button').first().click());
    expect(faculty.name).toBe('Faculty-PHA9999.ics');
    expect(faculty.text.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    // Project save/restore round-trips every event.
    const project = JSON.parse((await downloadFrom(page, () => page.locator('#saveProject').click())).text);
    expect(project.events).toHaveLength(3);
  },

  // CalendarBridge on its own: a Word schedule with no faculty must block export until fixed.
  async calendarbridge({ page, openTool }) {
    await openTool('calendarbridge');
    await page.locator('#fileInput').setInputFiles({ name: 'syllabus.docx', mimeType: DOCX_MIME, buffer: await syntheticDocx(syntheticSyllabus) });
    await expect(page.locator('#screen-review')).toBeVisible();
    const events = await page.evaluate(() => state.events.map(e => [e.date, e.topic, eventIssues(e)]));
    expect(events.map(e => e[1])).toEqual(['Proteins', 'Enzymes', 'Hemoglobin']);
    expect(events.every(e => e[2].includes('faculty'))).toBe(true);
    await page.locator('#toFaculty').click();
    await expect(page.locator('#toExport')).toBeDisabled();
    await expect(page.locator('#facultyValidation')).not.toContainText('Ready to export');
  },
};
