import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatorSummary, questionAnswerSummary, syllabusExtractionSummary,
  calendarExtractionSummary, answerCompletenessSummary, questionIssueSummary } from '../e2e/local-summaries.js';
import { downloadedQuestionCount, examsoftQuestionCount, JSZip } from '../e2e/local-export-counts.js';

test('coordinator counts include every syllabus role and unique valid calendar ID', () => {
  assert.deepEqual(coordinatorSummary({}), { coordinators: 0, coordinatorDetected: false });
  assert.equal(coordinatorSummary({ faculty: [{ role: 'coordinator' }, { role: 'faculty' },
    { role: 'coordinator' }], coordinator: {} }).coordinators, 2);
  assert.equal(coordinatorSummary({ faculty: [{ id: 'a' }, { id: 'b' }],
    coordinatorIds: ['a', 'a', 'b', 'missing'] }).coordinators, 2);
});

test('syllabus coverage keeps failed candidates and missing contact information visible', () => {
  const summary = syllabusExtractionSummary({ extraction: { scheduleCandidates: 4, scheduleFailures: [{}, {}], cloCandidates: 3 },
    schedule: [{}, {}], clos: [{}], faculty: [{ role: 'coordinator', email: '' }, { role: 'coordinator', email: 'a@example.test' },
      { role: 'faculty', email: ' ' }], cloMappings: [{}], plos: [{}, {}], meetingPatterns: [{}],
    grading: [{ pct: 33.3 }, { pct: 66.7 }] });
  assert.deepEqual(summary.scheduleCoverage, { candidates: 4, parsed: 2, failed: 2 });
  assert.deepEqual(summary.cloCoverage, { candidates: 3, parsed: 1 });
  assert.deepEqual(summary.contacts, { faculty: { withEmail: 1, withoutEmail: 2 },
    coordinators: { withEmail: 1, withoutEmail: 1 } });
  assert.deepEqual(summary.courseStructure, { cloMappings: 1, plos: 2, meetingPatterns: 1, gradingRows: 2, gradingPercentTotal: 100 });
});

test('calendar coverage separates overlapping issues, excluded events, duplicate copies and broken references', () => {
  const event = { include: true, type: 'lecture', date: '2026-11-05', time: '', topic: 'Synthetic topic',
    location: '', facultyIds: ['__coordinator__'], failures: ['time', 'inferred-time'] };
  const summary = calendarExtractionSummary({ events: [event, { ...event },
    { include: false, type: 'no-class', location: 'Room', facultyIds: ['missing'], failures: [] }],
    faculty: [{ id: 'a' }], coordinatorIds: ['missing'] }, e => e.failures);
  assert.equal(summary.issues.time, 2);
  assert.equal(summary.issues['inferred-time'], 2);
  assert.equal(summary.eventCoverage.included, 2);
  assert.equal(summary.eventCoverage.excluded, 1);
  assert.equal(summary.eventCoverage.duplicates, 1);
  assert.equal(summary.eventCoverage.missingLocation, 2);
  assert.equal(summary.eventCoverage.byType.lecture, 2);
  assert.deepEqual(summary.facultyCoverage, { faculty: 1, unresolvedFacultyEvents: 3, unresolvedCoordinatorReferences: 1 });
});

test('answer completeness separates partial blanks, missing keys and invalid single-answer keys', () => {
  const choice = correct => ({ text: 'Choice', correct });
  const summary = answerCompletenessSummary([
    { type: 'mc', answers: [choice(true), choice(true)] },
    { type: 'mr', answers: [choice(true), choice(true)] },
    { type: 'tf', answers: [choice(false), choice(false)] },
    { type: 'mc', answers: [{ text: ' ', correct: true }] },
    { type: 'sa', accepted: ['Answer'] },
    { type: 'fitb', stem: 'two', blanks: [{ accepted: ['Answer'] }, { accepted: [] }] },
    { type: 'fitb', stem: 'two', blanks: [{ accepted: ['Answer'] }] },
    { type: 'fitb', stem: 'one', blanks: [{ accepted: ['Answer'] }] },
    { type: 'fitb', stem: 'one', blanks: [] },
    { type: 'essay' },
  ], stem => Array.from({ length: stem === 'two' ? 2 : 1 }));
  assert.deepEqual(summary.completeness, { complete: 3, partial: 2, missing: 2, invalid: 2, notApplicable: 1 });
  assert.equal(summary.answerChoices, 6);
  assert.deepEqual(summary.correctChoiceCounts, { 0: 2, 2: 2 });
  assert.equal(summary.blankFields, 4);
  assert.equal(summary.answeredBlankFields, 3);
});

test('validation categories retain severity without storing dynamic or unknown message text', () => {
  const summary = questionIssueSummary({ questions: [{ parseWarnings: ['private warning'] }], platforms: ['kahoot'],
    validate: () => [{ level: 'error', msg: 'Kahoot question text is 123 characters; the spreadsheet limit is 95.' },
      { level: 'warning', msg: 'Parsing confidence: private text' }, { level: 'warning', msg: 'unrecognized private text' }] });
  assert.deepEqual(summary.parseWarnings, { questions: 1, total: 1 });
  assert.deepEqual(summary.platforms.kahoot, { 'stem-too-long': { error: 1, warning: 0 },
    confidence: { error: 0, warning: 1 }, other: { error: 0, warning: 1 } });
  assert.equal(JSON.stringify(summary).includes('private'), false);
});

test('download counts respect CSV multiline fields and XLSX question rows', async () => {
  const csv = '\uFEFFActivity,Type,Title,Option 1\r\nPoll,Multiple choice,"Stem\nPoll,not a record",Choice\r\nPoll,Open-ended,"Quoted ""stem"""\r\n';
  assert.equal(await downloadedQuestionCount('poll', Buffer.from(csv)), 2);
  assert.equal(await downloadedQuestionCount('brightspace', Buffer.from('NewQuestion,MC\r\nQuestionText,"Stem\nNewQuestion,not a record"\r\nNewQuestion,SA')), 2);
  const zip = new JSZip();
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"/><row r="2"/><row r="3"/></sheetData></worksheet>');
  assert.equal(await downloadedQuestionCount('kahoot', await zip.generateAsync({ type: 'nodebuffer' })), 2);
});

test('ExamSoft record count excludes numbered blank answers and literal RTF controls', () => {
  const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Calibri;}}\fs22 Type: F Title: Synthetic 1. Supply two blanks\line 1. First|\line 2. Second|\line \line 2. Literal \\line and \{braces\}\line *a. Yes\line b. No\line \line }`;
  assert.equal(examsoftQuestionCount(rtf), 2);
});

test('answer detection covers each supported type without counting empty or unmarked answers', () => {
  const summary = questionAnswerSummary([
    { type: 'mc', answers: [{ text: 'Choice', correct: true }], confidence: 'high' },
    { type: 'mr', answers: [{ text: 'Choice', correct: false }] },
    { type: 'tf', answers: [{ text: ' ', correct: true }] },
    { type: 'sa', accepted: [' ', 'Answer'], confidence: 'high' },
    { type: 'fitb', blanks: [{ accepted: [] }, { accepted: ['Answer'] }], confidence: 'medium' },
    { type: 'fitb', blanks: [{ accepted: [' '] }] },
    { type: 'essay' },
  ]);
  assert.equal(summary.detected, true);
  assert.equal(summary.withDetectedAnswer, 3);
  assert.equal(summary.withoutDetectedAnswer, 3);
  assert.equal(summary.notApplicable, 1);
  assert.deepEqual(summary.byType.fitb, { withDetectedAnswer: 1, withoutDetectedAnswer: 1 });
  assert.deepEqual(summary.confidence, { high: 2, unknown: 3, medium: 1 });
  assert.equal(questionAnswerSummary([]).detected, false);
});
