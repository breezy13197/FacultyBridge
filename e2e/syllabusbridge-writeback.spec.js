// SyllabusBridge v2.2 Word round-trip: a Word file edited by the write-back
// prototype must read back correctly in SyllabusBridge, in every browser and
// build. Synthetic data only. See docs/SYLLABUSBRIDGE-ROUNDTRIP.md.
import { test, expect, syntheticDocx, syntheticSyllabus, DOCX_MIME } from './fixtures.js';
import { JSZip, loadWriter, syllabusDocx, P } from '../tests/helpers/syllabus-docx.mjs';

const W = loadWriter();

async function upload(page, openTool, bytes) {
  await openTool('syllabusbridge');
  await page.locator('#file').setInputFiles({ name: 'edited.docx', mimeType: DOCX_MIME, buffer: Buffer.from(bytes) });
  await expect(page.locator('#screen-review')).toBeVisible();
  return page.evaluate(() => ({
    lines: state.lines,
    cells: state.rawTables.flat(2).map(c => c.text),
    redText: state.redText,
    topics: state.schedule.map(e => e.topic),
  }));
}

for (const tracked of [false, true]) {
  const mode = tracked ? 'tracked changes' : 'direct edits';

  test(`SyllabusBridge reads back a syllabus written with ${mode}`, async ({ page, openTool }) => {
    const original = await syllabusDocx();
    const xml = await (await JSZip.loadAsync(original)).file('word/document.xml').async('string');
    const model = W.documentModel(xml);
    const current = anchor => W.paragraphText(xml, W.locate(model, anchor));
    const anchors = {
      grade: { type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 1 },
      description: { type: 'paragraph', paragraphIndex: P.description },
      redBullet: { type: 'paragraph', paragraphIndex: P.redBullet },
    };
    const { bytes, applied } = await W.writeDocx(JSZip, original, [
      { anchor: anchors.grade, expectedText: current(anchors.grade), newText: '2.7' },
      { anchor: anchors.description, expectedText: current(anchors.description), newText: 'COURSE DESCRIPTION: Synthetic course description.' },
      { anchor: anchors.redBullet, expectedText: current(anchors.redBullet), newText: null },
    ], { tracked });
    expect(applied.length).toBe(3);

    const read = await upload(page, openTool, bytes);
    expect(read.lines).toContain('COURSE DESCRIPTION: Synthetic course description.');
    expect(read.lines.join('\n')).not.toContain('Copy and Paste');
    expect(read.cells).toContain('2.7');
    expect(read.cells).not.toContain('2.6');
    // Deleted red instructions no longer count as template text left behind.
    expect(read.redText.join('\n')).not.toContain('Identify if iPads');
  });

  test(`SyllabusBridge reads an edited schedule row written with ${mode}`, async ({ page, openTool }) => {
    const syllabus = { ...syntheticSyllabus, paragraphs: syntheticSyllabus.paragraphs.filter(p => p !== 'Course Schedule') };
    const original = await syntheticDocx(syllabus);
    const anchor = { type: 'cell', tableIndex: 0, rowIndex: 2, columnIndex: 2 };
    const { bytes, applied } = await W.writeDocx(JSZip, original, [{ anchor, expectedText: 'Enzymes', newText: 'Enzyme kinetics' }], { tracked });
    expect(applied.length).toBe(1);
    const read = await upload(page, openTool, bytes);
    expect(read.topics).toEqual(['Proteins', 'Enzyme kinetics', 'Hemoglobin']);
  });
}
