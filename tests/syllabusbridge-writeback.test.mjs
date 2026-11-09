// SyllabusBridge v2.2 Word round-trip tests for the write-back prototype
// (apps/syllabusbridge/docx-writeback.js). Findings: docs/SYLLABUSBRIDGE-ROUNDTRIP.md.
// Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSZip, loadWriter, syllabusDocx, docxParts, documentXml, acceptAll, P } from './helpers/syllabus-docx.mjs';

const W = loadWriter();
const model = W.documentModel(documentXml);
const para = i => model.paragraphs[i];
const textOf = (xml, node) => W.paragraphText(xml, node);
const cellPara = (t, r, c, i = 0) => model.tables[t].rows[r].cells[c].paragraphs[i];
const DATE = '2026-11-09T00:00:00Z';
const edit = (anchor, newText, expectedText) => ({
  anchor, newText,
  expectedText: expectedText ?? textOf(documentXml, W.locate(model, anchor)),
});
// The edited file's word/document.xml must equal the original everywhere
// except inside the one paragraph that was edited.
function assertOnlyParagraphChanged(out, node) {
  assert.equal(out.slice(0, node.start), documentXml.slice(0, node.start), 'text before the edited paragraph changed');
  const tail = documentXml.length - node.end;
  assert.equal(out.slice(out.length - tail), documentXml.slice(node.end), 'text after the edited paragraph changed');
}
async function write(edits, opts) {
  const original = await syllabusDocx();
  const result = await W.writeDocx(JSZip, original, edits, { date: DATE, ...opts });
  const before = await docxParts(original), after = await docxParts(result.bytes);
  return { ...result, before, after, xml: after.get('word/document.xml').toString('utf8') };
}

test('locations are counted the way SyllabusBridge reads the file', () => {
  assert.equal(model.paragraphs.length, 11, 'blank paragraphs count; table paragraphs do not');
  assert.equal(model.tables.length, 2);
  assert.equal(textOf(documentXml, para(P.blank)), '');
  assert.equal(textOf(documentXml, para(P.description)), 'COURSE DESCRIPTION: “Copy and Paste” Course Description from the approved ACO here.');
  assert.equal(textOf(documentXml, para(P.pendingChange)), 'COURSE LEARNING OUTCOMES', 'deleted text is not read; inserted text is');
  assert.equal(textOf(documentXml, cellPara(0, 2, 1)), '2.6');
  assert.equal(textOf(documentXml, cellPara(0, 2, 2)), 'Week 1\nWeek 2');
  assert.equal(model.tables[1].rows[0].cells.length, 1, 'a merged header row has one cell, so column numbers count cells, not grid columns');
});

test('no edits: every part of the Word file comes back byte-for-byte identical', async () => {
  const r = await write([]);
  assert.deepEqual([...r.after.keys()], [...r.before.keys()], 'parts and their order are unchanged');
  for (const [name, bytes] of r.before) assert.ok(bytes.equals(r.after.get(name)), `${name} changed`);
  assert.equal(r.applied.length, 0);
});

test('an edit that matches the current text changes nothing', async () => {
  const r = await write([edit({ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1 }, '2.6')]);
  assert.equal(r.unchanged.length, 1);
  assert.ok(r.before.get('word/document.xml').equals(r.after.get('word/document.xml')));
});

test('one table cell edited: only that cell changes, and its formatting is kept', async () => {
  const anchor = { type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1 };
  const r = await write([edit(anchor, '2.7')]);
  assert.equal(r.applied.length, 1);
  assert.equal(r.refused.length, 0);
  for (const [name, bytes] of r.before) if (name !== 'word/document.xml') assert.ok(bytes.equals(r.after.get(name)), `${name} changed`);
  assertOnlyParagraphChanged(r.xml, cellPara(0, 2, 1));
  const m = W.documentModel(r.xml), p = m.tables[0].rows[2].cells[1].paragraphs[0], px = r.xml.slice(p.start, p.end);
  assert.equal(textOf(r.xml, p), '2.7');
  assert.match(px, /<w:pPr><w:jc w:val="center"\/><\/w:pPr>/, 'paragraph alignment kept');
  assert.match(px, /<w:rPr><w:sz w:val="20"\/><\/w:rPr><w:t xml:space="preserve">2\.7<\/w:t>/, 'font size kept');
});

test('label + red instruction: the bold label is untouched; new text keeps the instruction formatting', async () => {
  const r = await write([edit({ type: 'paragraph', paragraphIndex: P.description }, 'COURSE DESCRIPTION: Synthetic course description.')]);
  assertOnlyParagraphChanged(r.xml, para(P.description));
  const p = W.documentModel(r.xml).paragraphs[P.description], px = r.xml.slice(p.start, p.end);
  assert.equal(textOf(r.xml, p), 'COURSE DESCRIPTION: Synthetic course description.');
  assert.ok(px.startsWith(documentXml.slice(para(P.description).start, documentXml.indexOf('<w:r w:rsidR="00B2">'))), 'label runs kept byte-for-byte');
  assert.match(px, /<w:color w:val="FF0000"\/><\/w:rPr><w:t xml:space="preserve">Synthetic course description\.<\/w:t>/);
});

test('bullet item edited: bullet, style, and indentation are kept', async () => {
  const r = await write([edit({ type: 'paragraph', paragraphIndex: P.clo1 }, 'CLO1 – Explain synthetic outcomes to peers.')]);
  assertOnlyParagraphChanged(r.xml, para(P.clo1));
  const p = W.documentModel(r.xml).paragraphs[P.clo1];
  assert.ok(r.xml.slice(p.start, p.end).includes('<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'));
  assert.equal(textOf(r.xml, p), 'CLO1 – Explain synthetic outcomes to peers.');
});

test('tab-aligned line and text inside a bookmark are edited in place', async () => {
  const r = await write([
    edit({ type: 'paragraph', paragraphIndex: P.coordinator }, 'COURSE COORDINATOR:\tDr. Grace Teacher'),
    edit({ type: 'paragraph', paragraphIndex: P.bookmarked }, 'STUDENT ENGAGEMENT AND WORKLOAD'),
  ]);
  assert.equal(r.applied.length, 2);
  const m = W.documentModel(r.xml);
  assert.equal(textOf(r.xml, m.paragraphs[P.coordinator]), 'COURSE COORDINATOR:\tDr. Grace Teacher');
  const bm = r.xml.slice(m.paragraphs[P.bookmarked].start, m.paragraphs[P.bookmarked].end);
  assert.match(bm, /^<w:p><w:bookmarkStart w:id="7" w:name="Engagement"\/>.*<w:bookmarkEnd w:id="7"\/><\/w:p>$/, 'bookmark kept');
});

test('a line in a multi-paragraph cell, and a cell with a line break, are edited separately', async () => {
  const r = await write([
    edit({ type: 'cell', tableIndex: 0, rowIndex: 1, columnIndex: 2, paragraphIndex: 1 }, 'Revised second line'),
    edit({ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 2 }, 'Week 1\nWeek 3'),
  ]);
  const m = W.documentModel(r.xml);
  assert.equal(textOf(r.xml, m.tables[0].rows[1].cells[2].paragraphs[0]), 'Top band');
  assert.equal(textOf(r.xml, m.tables[0].rows[1].cells[2].paragraphs[1]), 'Revised second line');
  assert.equal(textOf(r.xml, m.tables[0].rows[2].cells[2].paragraphs[0]), 'Week 1\nWeek 3');
});

test('a red instruction bullet can be deleted', async () => {
  const r = await write([edit({ type: 'paragraph', paragraphIndex: P.redBullet }, null)]);
  const m = W.documentModel(r.xml);
  assert.equal(m.paragraphs.length, model.paragraphs.length - 1);
  assert.ok(!r.xml.includes('Identify if iPads'));
  assert.equal(r.xml, documentXml.slice(0, para(P.redBullet).start) + documentXml.slice(para(P.redBullet).end));
});

test('unsafe or stale edits are refused with a reason, and nothing is guessed', async () => {
  const r = await write([
    edit({ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1 }, '2.7', '2.5'),
    edit({ type: 'cell', tableIndex: 5, rowIndex: 0, columnIndex: 0 }, 'x', 'y'),
    edit({ type: 'paragraph', paragraphIndex: P.link }, 'See the library website'),
    edit({ type: 'paragraph', paragraphIndex: P.pendingChange }, 'COURSE LEARNING OUTCOMES (CLOs)'),
    edit({ type: 'cell', tableIndex: 0, rowIndex: 0, columnIndex: 0 }, null),
    edit({ type: 'paragraph', paragraphIndex: P.last }, null),
    edit({ type: 'paragraph', paragraphIndex: P.title }, 'PHA9999 – Revised Course'),
    edit({ type: 'paragraph', paragraphIndex: P.title }, 'PHA9999 – Another Title'),
  ]);
  const reasons = r.refused.map(x => x.reason);
  assert.equal(r.applied.length, 1, 'only the first title edit is placed');
  assert.match(reasons[0], /not what SyllabusBridge originally read/);
  assert.match(reasons[1], /no longer exists/);
  assert.match(reasons[2], /contains a link/);
  assert.match(reasons[3], /unaccepted tracked changes/);
  assert.match(reasons[4], /last one in its cell/);
  assert.match(reasons[5], /last one in its cell or document/);
  assert.match(reasons[6], /Another edit already changes this paragraph/);
});

test('spacing differences do not block an edit; SyllabusBridge reads tabs as spaces', async () => {
  const r = await write([edit({ type: 'paragraph', paragraphIndex: P.coordinator }, 'COURSE COORDINATOR:\tDr. Grace Teacher', 'COURSE COORDINATOR: Dr. Ada Faculty')]);
  assert.equal(r.applied.length, 1);
});

test('tracked-change mode: edits show as Word tracked changes and accepting them gives the same text as a direct edit', async () => {
  const edits = [
    edit({ type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1 }, '2.7'),
    edit({ type: 'paragraph', paragraphIndex: P.description }, 'COURSE DESCRIPTION: Synthetic course description.'),
    edit({ type: 'paragraph', paragraphIndex: P.clo1 }, 'CLO1 – Explain synthetic outcomes to peers.'),
    edit({ type: 'paragraph', paragraphIndex: P.redBullet }, null),
  ];
  const tracked = await write(edits, { tracked: true, author: 'SyllabusBridge' });
  const direct = await write(edits);
  assert.equal(tracked.applied.length, 4);
  for (const [name, bytes] of tracked.before) if (name !== 'word/document.xml') assert.ok(bytes.equals(tracked.after.get(name)), `${name} changed`);

  const marks = [...tracked.xml.matchAll(/<w:(ins|del) w:id="(\d+)" w:author="([^"]*)" w:date="([^"]*)"/g)];
  const added = marks.filter(m => +m[2] > 41);
  assert.ok(added.length >= 6, 'insertions and deletions are marked');
  assert.ok(added.every(m => m[3] === 'SyllabusBridge' && m[4] === DATE), 'each change names SyllabusBridge and the date');
  assert.equal(new Set(marks.map(m => m[2])).size, marks.length, 'tracked-change ids are unique, including the template\'s own');
  assert.match(tracked.xml, /<w:del [^>]*><w:r w:rsidRPr="00C1"><w:rPr><w:sz w:val="20"\/><\/w:rPr><w:delText xml:space="preserve">2\.6<\/w:delText><\/w:r><\/w:del><w:ins [^>]*><w:r><w:rPr><w:sz w:val="20"\/><\/w:rPr><w:t xml:space="preserve">2\.7<\/w:t><\/w:r><\/w:ins>/,
    'a reviewer sees "2.6" replaced by "2.7" as whole words');
  assert.equal(W.documentModel(tracked.xml).paragraphs.length, model.paragraphs.length, 'deleted paragraph stays until the change is accepted');
  assert.match(tracked.xml, /<w:pPr><w:pStyle w:val="ListParagraph"\/><w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr><w:rPr><w:del [^>]*\/><\/w:rPr><\/w:pPr>/,
    'the deleted bullet\'s paragraph mark is marked deleted, so accepting removes the empty line');

  const accepted = W.documentModel(acceptAll(tracked.xml)), plain = W.documentModel(direct.xml);
  const texts = (m, xml) => [...m.paragraphs.map(p => textOf(xml, p)), ...m.tables.flatMap(t => t.rows.flatMap(row => row.cells.flatMap(c => c.paragraphs.map(p => textOf(xml, p)))))];
  assert.deepEqual(texts(accepted, acceptAll(tracked.xml)), texts(plain, direct.xml));
});

// Review findings on the prototype. Small hand-built documents keep each case clear.
const doc = body => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
const textAt = (xml, i) => { const m = W.documentModel(xml); return W.paragraphText(xml, m.paragraphs[i]); };

test('characters outside the basic range (emoji, some symbols) do not shift an edit', () => {
  const xml = doc('<w:p><w:r><w:t>😀 alpha beta</w:t></w:r></w:p><w:p><w:r><w:t>End</w:t></w:r></w:p>');
  const e = [{ anchor: { type: 'paragraph', paragraphIndex: 0 }, expectedText: '😀 alpha beta', newText: '😀 alpha gamma' }];
  assert.equal(textAt(W.applyEdits(xml, e).xml, 0), '😀 alpha gamma');
  const tracked = W.applyEdits(xml, e, { tracked: true, date: DATE }).xml;
  assert.equal(textAt(acceptAll(tracked), 0), '😀 alpha gamma');
  assert.match(tracked, /<w:delText xml:space="preserve">beta<\/w:delText>/, 'only the changed word is marked');
  const twoEmoji = [{ anchor: { type: 'paragraph', paragraphIndex: 0 }, expectedText: '😀 alpha beta', newText: '😀🎉 alpha beta' }];
  assert.equal(textAt(W.applyEdits(xml, twoEmoji).xml, 0), '😀🎉 alpha beta');
});

test('a paragraph holding one end of a comment or bookmark that spans paragraphs is not deleted directly', () => {
  const xml = doc(
    '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>First</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Second</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>' +
    '<w:p><w:bookmarkStart w:id="3" w:name="Span"/><w:r><w:t>Third</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Fourth</w:t></w:r><w:bookmarkEnd w:id="3"/></w:p>' +
    '<w:p><w:bookmarkStart w:id="4" w:name="Whole"/><w:r><w:t>Fifth</w:t></w:r><w:bookmarkEnd w:id="4"/></w:p>' +
    '<w:p><w:r><w:t>End</w:t></w:r></w:p>');
  const del = (i, text) => ({ anchor: { type: 'paragraph', paragraphIndex: i }, expectedText: text, newText: null });
  const r = W.applyEdits(xml, [del(0, 'First'), del(2, 'Third'), del(3, 'Fourth'), del(4, 'Fifth')]);
  assert.equal(r.refused.length, 3);
  for (const x of r.refused) assert.match(x.reason, /comment or bookmark that continues into another paragraph/);
  assert.equal(r.applied.length, 1, 'a bookmark wholly inside the paragraph goes with it');
  assert.ok(r.xml.includes('<w:commentRangeStart w:id="0"/>') && r.xml.includes('<w:commentRangeEnd w:id="0"/>'));
  // Tracked deletion keeps the paragraph (and its markers) until a person accepts it in Word.
  const t = W.applyEdits(xml, [del(0, 'First')], { tracked: true, date: DATE });
  assert.equal(t.applied.length, 1);
  assert.ok(t.xml.includes('<w:commentRangeStart w:id="0"/>') && t.xml.includes('<w:commentRangeEnd w:id="0"/>'));
});

test('malformed XML gives an error instead of hanging', async () => {
  const { spawnSync } = await import('node:child_process');
  const helper = new URL('./helpers/syllabus-docx.mjs', import.meta.url).href;
  for (const broken of ['<w:document><w:body><!-- never closed', '<w:document><?pi never closed', '<w:document><![CDATA[ never closed', '<w:document><w:body']) {
    const code = `const { loadWriter } = await import(${JSON.stringify(helper)});
      try { loadWriter().parseTree(${JSON.stringify(broken)}); console.log('no error'); } catch (e) { console.log('error: ' + e.message); }`;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 5000, encoding: 'utf8' });
    assert.notEqual(run.error?.code, 'ETIMEDOUT', `hung on ${JSON.stringify(broken)}`);
    assert.match(run.stdout, /^error: /, `no error for ${JSON.stringify(broken)}`);
  }
});
