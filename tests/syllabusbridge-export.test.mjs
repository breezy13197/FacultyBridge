// SyllabusBridge v2.5 "Export edited Word syllabus" (apps/syllabusbridge/docx-export.js).
// Synthetic data only. The browser flow is in e2e/syllabusbridge-word-export.spec.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSZip, loadWriter, syllabusDocx, documentXml, acceptAll, P } from './helpers/syllabus-docx.mjs';

const W = loadWriter();
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../apps/syllabusbridge/docx-export.js', import.meta.url), 'utf8'), context);
const X = context.SyllabusDocxExport;
const DATE = '2026-11-12T00:00:00Z';

// What SyllabusBridge's reader (parseDocx) makes of the synthetic syllabus: blank
// paragraphs skipped, a bullet in front of list items, tabs dropped, then each
// table's non-blank cell lines.
const lines = [
  'PHA9999 – Synthetic Course',
  'COURSE DESCRIPTION: “Copy and Paste” Course Description from the approved ACO here.',
  '• CLO1 – Describe synthetic outcomes.',
  '• Identify if iPads or tablets are acceptable',
  'COURSE COORDINATOR:Dr. Ada Faculty',
  'See the library guide',
  'COURSE LEARNING OUTCOMES',
  'STUDENT ENGAGEMENT',
  '% Grade', 'GPA', 'Notes', '>=90', '4', 'Top band', 'Second line', '76', '2.6', 'Week 1', 'Week 2',
  'Program Mapping', 'CLO1 – Describe synthetic outcomes.', 'PSLO 2',
  'Total100%',
  'End of synthetic syllabus.',
];
const L = text => lines.indexOf(text);
const change = (key, targets, extra = {}) => ({ key, kind: 'syllabus-edit', section: 'Test', action: 'Changed', what: key, before: '', after: '', targets, ...extra });
const run = (changes, opts = {}) => X.exportXml(W, documentXml, { lines, changes }, { date: DATE, ...opts });
// Plain copies: values made inside the loaded scripts belong to another JavaScript realm.
const plain = v => JSON.parse(JSON.stringify(v));
const texts = xml => {
  const m = W.documentModel(xml);
  return plain({ body: m.paragraphs.map(p => W.paragraphText(xml, p)), cells: m.tables.map(t => t.rows.map(r => r.cells.map(c => c.paragraphs.map(p => W.paragraphText(xml, p)).join('\n')))) });
};

test('the Word file is read line for line the way SyllabusBridge reads it', () => {
  const map = X.sourceMap(W, documentXml, lines);
  assert.equal(map.aligned, true);
  assert.ok(map.lines.every(l => l.ok), 'every line matches, including bullets, tabs, blank paragraphs, and line breaks in cells');
  const shifted = X.sourceMap(W, documentXml, lines.slice(1));
  assert.equal(shifted.aligned, false, 'a different line count is noticed');
  assert.ok(shifted.lines.every(l => !l.ok), 'and then no line is trusted');
});

test('only the changed words are written; the Word spacing (a tab) is kept', () => {
  const r = run([change('faculty:1', [{ type: 'substitute', lines: [L('COURSE COORDINATOR:Dr. Ada Faculty')], from: 'Dr. Ada Faculty', to: 'Dr. Grace Teacher' }])], { tracked: false });
  assert.equal(r.placed.length, 1);
  assert.equal(texts(r.xml).body[P.coordinator], 'COURSE COORDINATOR:\tDr. Grace Teacher');
});

test('bullets shown by SyllabusBridge are not written as text; new list lines copy the bullet only when typed with one', () => {
  const r = run([change('policy:clos', [{ type: 'lines', start: 0,
    before: ['• CLO1 – Describe synthetic outcomes.', '• Identify if iPads or tablets are acceptable'],
    after: ['• CLO1 – Explain synthetic outcomes.', '• Identify if iPads or tablets are acceptable', '• CLO2 – A new outcome.', 'A closing note.'] }])], { tracked: false });
  assert.equal(r.placed.length, 1, r.unplaced.map(u => u.reason).join());
  const body = texts(r.xml).body, m = W.documentModel(r.xml);
  assert.equal(body[P.clo1], 'CLO1 – Explain synthetic outcomes.', 'unchanged long dash kept; no bullet character written');
  assert.equal(body[P.redBullet + 1], 'CLO2 – A new outcome.');
  assert.equal(body[P.redBullet + 2], 'A closing note.');
  const xmlOf = i => r.xml.slice(m.paragraphs[i].start, m.paragraphs[i].end);
  assert.match(xmlOf(P.redBullet + 1), /<w:numPr>/, 'a new line typed with the bullet is a list item');
  assert.doesNotMatch(xmlOf(P.redBullet + 2), /<w:numPr>/, 'a new line typed without it is not');
});

test('tracked changes: each edit is marked by SyllabusBridge, and accepting them gives the direct result', () => {
  const changes = [
    change('policy:description', [{ type: 'lines', start: L(lines[1]), before: ['“Copy and Paste” Course Description from the approved ACO here.'], after: ['A synthetic description.', 'A second paragraph.'] }]),
    change('cell:0:2:2', [{ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 2, before: ['Week 1', 'Week 2'], after: ['Week 1', 'Week 3', 'Week 4'] }]),
    change('remove:0:1', [{ type: 'delete-row', tableIndex: 0, rowIndex: 1, before: [['>=90'], ['4'], ['Top band', 'Second line']] }]),
    change('add:0:x', [{ type: 'add-row', tableIndex: 0, afterRowIndex: 2, order: 0, id: 'x', cells: ['65', '1.0', 'New\nband'] }]),
  ];
  const tracked = run(changes), direct = run(changes, { tracked: false });
  assert.equal(tracked.placed.length, 4, tracked.unplaced.map(u => u.reason).join());
  const authors = [...tracked.xml.matchAll(/<w:(?:ins|del) w:id="(\d+)" w:author="([^"]*)" w:date="([^"]*)"/g)].filter(m => +m[1] > 41);
  assert.ok(authors.length >= 8 && authors.every(m => m[2] === 'SyllabusBridge' && m[3] === DATE));
  assert.match(tracked.xml, /<w:trPr><w:del [^>]*\/><\/w:trPr>/, 'removed row is a tracked row deletion');
  assert.match(tracked.xml, /<w:trPr><w:ins [^>]*\/><\/w:trPr>/, 'added row is a tracked row insertion');
  // A new paragraph after the description is recorded the way Word records pressing
  // Enter: the description's own paragraph mark is "inserted", the new one's is not,
  // so rejecting it gives back the description exactly (checked in LibreOffice).
  const m = W.documentModel(tracked.xml), at = i => tracked.xml.slice(m.paragraphs[i].start, m.paragraphs[i].end);
  assert.match(at(P.description), /^<w:p[^>]*><w:pPr><w:rPr><w:ins [^>]*\/><\/w:rPr><\/w:pPr>/);
  assert.doesNotMatch(at(P.description + 1), /<w:pPr>.*<w:ins /);
  assert.deepEqual(texts(acceptAll(tracked.xml)), texts(direct.xml));
  const t = texts(direct.xml);
  assert.equal(t.body[P.description], 'COURSE DESCRIPTION: A synthetic description.', 'the heading label is kept');
  assert.equal(t.body[P.description + 1], 'A second paragraph.');
  assert.deepEqual(t.cells[0], [['% Grade', 'GPA', 'Notes'], ['76', '2.6', 'Week 1\nWeek 3\nWeek 4'], ['65', '1.0', 'New\nband']]);
});

test('reading corrections are never written', () => {
  const r = run([change('course:title', [{ type: 'substitute', lines: [0], from: 'Synthetic Course', to: 'Misread Course' }], { kind: 'reading-correction' })]);
  assert.equal(r.placed.length, 0);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.xml, documentXml);
});

test('a change is written whole or not at all, and every unplaced change says why', () => {
  const r = run([
    // One part is fine, the other is in a paragraph with a link: nothing of it is written.
    change('policy:two-places', [
      { type: 'substitute', lines: [L('STUDENT ENGAGEMENT')], from: 'ENGAGEMENT', to: 'WORKLOAD' },
      { type: 'substitute', lines: [L('See the library guide')], from: 'library guide', to: 'library website' },
    ]),
    change('policy:pending', [{ type: 'substitute', lines: [L('COURSE LEARNING OUTCOMES')], from: 'OUTCOMES', to: 'OUTCOMES (CLOs)' }]),
    change('cell:stale', [{ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1, before: ['2.5'], after: ['2.7'] }]),
    change('remove:stale', [{ type: 'delete-row', tableIndex: 0, rowIndex: 2, before: [['77'], ['2.6'], ['Week 1', 'Week 2']] }]),
    change('course:year', [{ type: 'manual', reason: 'Change the year by hand in Word.' }]),
    change('clo:missing', [{ type: 'substitute', lines: [L('PHA9999 – Synthetic Course')], from: 'not there', to: 'x' }]),
    change('cell:ok', [{ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1, before: ['2.6'], after: ['2.7'] }]),
  ]);
  const why = Object.fromEntries(r.unplaced.map(u => [u.change.key, u.reason]));
  assert.deepEqual(r.placed.map(c => c.key), ['cell:ok']);
  assert.match(why['policy:two-places'], /contains a link/);
  assert.match(why['policy:pending'], /unaccepted tracked changes/);
  assert.match(why['cell:stale'], /does not match what SyllabusBridge read/);
  assert.match(why['remove:stale'], /does not match what SyllabusBridge read/);
  assert.equal(why['course:year'], 'Change the year by hand in Word.');
  assert.match(why['clo:missing'], /could not match this text to one place/);
  assert.ok(!r.xml.includes('WORKLOAD'), 'the safe half of a refused change is not written');
  assert.ok(r.xml.includes('2.7'));
});

test('two changes in one paragraph are combined; an edit inside a removed row is listed', () => {
  const r = run([
    change('course:code', [{ type: 'substitute', lines: [0], from: 'PHA9999', to: 'PHA9998' }]),
    change('course:title', [{ type: 'substitute', lines: [0], from: 'Synthetic Course', to: 'Renamed Course' }]),
    change('remove:0:2', [{ type: 'delete-row', tableIndex: 0, rowIndex: 2, before: [['76'], ['2.6'], ['Week 1', 'Week 2']] }]),
    change('cell:0:2:1', [{ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1, before: ['2.6'], after: ['2.7'] }]),
  ], { tracked: false });
  assert.deepEqual(r.placed.map(c => c.key), ['course:code', 'course:title', 'remove:0:2']);
  assert.match(r.unplaced[0].reason, /row is being removed/);
  assert.equal(texts(r.xml).body[P.title], 'PHA9998 – Renamed Course');
});

test('the exported .docx changes only word/document.xml, and only when something was placed', async () => {
  const bytes = await syllabusDocx();
  const none = await X.exportDocx(JSZip, W, bytes, { lines, changes: [] }, { date: DATE });
  const zipOf = async b => JSZip.loadAsync(b);
  const [a, b] = [await zipOf(bytes), await zipOf(none.bytes)];
  const names = Object.keys(a.files).filter(n => !a.files[n].dir);
  for (const name of names) assert.equal(await b.file(name).async('string'), await a.file(name).async('string'));
  const one = await X.exportDocx(JSZip, W, bytes, { lines, changes: [change('cell:ok', [{ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1, before: ['2.6'], after: ['2.7'] }])] }, { date: DATE });
  const c = await zipOf(one.bytes);
  for (const name of names) if (name !== 'word/document.xml') assert.equal(await c.file(name).async('string'), await a.file(name).async('string'), name);
  assert.match(await c.file('word/document.xml').async('string'), /<w:ins [^>]*w:author="SyllabusBridge"/);
});

test('line differences pair changed lines and keep the rest', () => {
  assert.deepEqual(plain(X.lineDiff(['a', 'b', 'c'], ['a', 'B', 'c', 'd'])), [{ op: 'replace', i: 1, text: 'B' }, { op: 'insert', after: 2, text: 'd' }]);
  assert.deepEqual(plain(X.lineDiff(['a', 'b', 'c'], ['x', 'a', 'c'])), [{ op: 'insert', after: -1, text: 'x' }, { op: 'delete', i: 1 }]);
  assert.equal(X.transplant('LABEL:\tOld  value here', 'LABEL:Old value here', 'LABEL:New value here', false), 'LABEL:\tNew  value here');
});
