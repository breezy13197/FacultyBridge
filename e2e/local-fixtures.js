import fs from 'node:fs';
import path from 'node:path';

// Shared by e2e/local-files.spec.js and scripts/test-local-files.mjs so the numbered
// test names and the printed file list always agree.
export const fixtureRoot = path.resolve(process.env.BRIDGE_FIXTURE_DIR || 'tests/test files');

// `optional` folders are tested when present but are not required by the inventory check.
export const groups = [
  { folder: 'exams', extensions: ['.doc'], route: 'ExamBridge', input: '#fileInput', ready: '#resultsView' },
  { folder: 'item analysis', extensions: ['.csv'], route: 'ItemBridge', input: '#fileInput', ready: '#workspace' },
  { folder: 'syllabi', extensions: ['.docx'], route: 'SyllabusBridge', input: '#file', ready: '#screen-review' },
  { folder: 'syllabi', extensions: ['.docx'], route: 'CalendarBridge', input: '#fileInput', ready: '#screen-review' },
  { folder: 'course schedule', extensions: ['.docx'], route: 'CalendarBridge', input: '#fileInput', ready: '#screen-review' },
  { folder: 'questions', extensions: ['.docx', '.txt', '.csv', '.xlsx', '.rtf'], route: 'QuestionBridge',
    input: '#fileInput', ready: '#review', optional: true },
];

// Word, Excel, and PowerPoint create a hidden "~$name.docx" owner file while a document is
// open. It is not a real document, so it, other hidden files ("."), and macOS "._" copies are skipped.
export const isTemporaryFile = name => name.startsWith('~$') || name.startsWith('.');

export function fixtureFiles(group, root = fixtureRoot) {
  const dir = path.join(root, group.folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => !isTemporaryFile(name) && group.extensions.some(ext => name.toLowerCase().endsWith(ext)))
    .filter(name => fs.statSync(path.join(dir, name)).isFile())
    .sort();
}

export function skippedTemporaryFiles(group, root = fixtureRoot) {
  const dir = path.join(root, group.folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => isTemporaryFile(name) &&
    group.extensions.some(ext => name.toLowerCase().endsWith(ext)));
}

export const testTitle = (group, index) => `${group.route} ${group.folder} fixture ${index + 1}`;
