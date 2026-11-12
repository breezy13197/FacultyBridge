// Synthetic Word syllabus for the SyllabusBridge write-back (round-trip) tests.
//
// Every name and value here is made up. The structure copies the features that
// matter in the approved School of Pharmacy syllabus template: bold labels
// followed by red instruction text in the same paragraph, text split across
// several formatting runs with spell-check markers, bullet lists, tab-aligned
// contact lines, blank paragraphs, a grading table, a table whose header row is
// one merged cell, a link, and text that already has unaccepted tracked changes.
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const jszipModule = { exports: {} };
new Function('module', 'exports', fs.readFileSync(new URL('vendor/jszip-3.10.1.min.js', root), 'utf8'))(jszipModule, jszipModule.exports);
export const JSZip = jszipModule.exports;

// The prototype writer runs as a browser script; load it the same way here.
export function loadWriter() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('apps/syllabusbridge/docx-writeback.js', root), 'utf8'), context);
  return context.SyllabusDocxWriter;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const BOLD = '<w:rPr><w:b/></w:rPr>';
const RED = '<w:rPr><w:color w:val="FF0000"/></w:rPr>';
const cell = (...paragraphs) => `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${paragraphs.join('')}</w:tc>`;
const plain = text => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

// Paragraph numbers (paragraphIndex) count only paragraphs directly in the
// body, including blank ones; tables are counted separately.
export const P = {
  title: 0, blank: 1, description: 2, clo1: 3, redBullet: 4, coordinator: 5,
  link: 6, pendingChange: 7, bookmarked: 8, afterTables: 9, last: 10,
};

export const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>` +
  // 0 title: two runs
  `<w:p w:rsidR="00A1"><w:pPr><w:jc w:val="center"/></w:pPr><w:r w:rsidR="00A1">${BOLD}<w:t xml:space="preserve">PHA9999 – </w:t></w:r><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Synthetic Course</w:t></w:r></w:p>` +
  // 1 blank
  `<w:p/>` +
  // 2 bold label + red instruction split across runs with spell-check markers
  `<w:p w:rsidR="00A2"><w:r w:rsidR="00B1">${BOLD}<w:t>COURSE DESCRIPTION</w:t></w:r><w:r>${BOLD}<w:t xml:space="preserve">: </w:t></w:r>` +
  `<w:r w:rsidR="00B2">${RED}<w:t xml:space="preserve">“Copy and Paste” Course Description from the approved </w:t></w:r><w:proofErr w:type="spellStart"/>` +
  `<w:r w:rsidR="00B2">${RED}<w:t>ACO</w:t></w:r><w:proofErr w:type="spellEnd"/><w:r w:rsidR="00B2">${RED}<w:t xml:space="preserve"> here.</w:t></w:r></w:p>` +
  // 3 numbered/bulleted CLO
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">CLO1 – Describe synthetic outcomes.</w:t></w:r></w:p>` +
  // 4 red instruction bullet faculty should delete
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r>${RED}<w:t>Identify if iPads or tablets are acceptable</w:t></w:r></w:p>` +
  // 5 tab-aligned contact line
  `<w:p><w:r>${BOLD}<w:t>COURSE COORDINATOR:</w:t></w:r><w:r><w:tab/><w:t>Dr. Ada Faculty</w:t></w:r></w:p>` +
  // 6 link (writer must refuse)
  `<w:p><w:r><w:t xml:space="preserve">See the </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>library guide</w:t></w:r></w:hyperlink></w:p>` +
  // 7 already has an unaccepted tracked change (writer must refuse)
  `<w:p><w:r><w:t xml:space="preserve">COURSE LEARNING </w:t></w:r><w:del w:id="40" w:author="Template Editor" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>OBJECTIVES</w:delText></w:r></w:del><w:ins w:id="41" w:author="Template Editor" w:date="2026-01-01T00:00:00Z"><w:r><w:t>OUTCOMES</w:t></w:r></w:ins></w:p>` +
  // 8 text inside a bookmark
  `<w:p><w:bookmarkStart w:id="7" w:name="Engagement"/><w:r><w:t>STUDENT ENGAGEMENT</w:t></w:r><w:bookmarkEnd w:id="7"/></w:p>` +
  // table 0: grading scale; one cell has two paragraphs, one has a line break
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
  `<w:tr>${cell(plain('% Grade'), )}${cell(plain('GPA'))}${cell(plain('Notes'))}</w:tr>` +
  `<w:tr>${cell(plain('&gt;=90'))}${cell(plain('4'))}${cell(plain('Top band'), plain('Second line'))}</w:tr>` +
  `<w:tr>${cell(plain('76'))}${cell(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r w:rsidRPr="00C1"><w:rPr><w:sz w:val="20"/></w:rPr><w:t>2.6</w:t></w:r></w:p>`)}${cell(`<w:p><w:r><w:t>Week 1</w:t><w:br/><w:t>Week 2</w:t></w:r></w:p>`)}</w:tr>` +
  `</w:tbl>` +
  // table 1: header is one merged cell, like Program Mapping
  `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
  `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${plain('Program Mapping')}</w:tc></w:tr>` +
  `<w:tr>${cell(plain('CLO1 – Describe synthetic outcomes.'))}${cell(plain('PSLO 2'))}</w:tr>` +
  `</w:tbl>` +
  // 9 after tables, 10 last paragraph, then the page-layout section
  `<w:p><w:r><w:t>Total</w:t></w:r><w:r><w:tab/><w:t>100%</w:t></w:r></w:p>` +
  `<w:p><w:r><w:t>End of synthetic syllabus.</w:t></w:r></w:p>` +
  `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;

const parts = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://library.example.edu/" TargetMode="External"/></Relationships>`,
  'word/document.xml': documentXml,
  'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`,
  'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
};

export async function syllabusDocx() {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(parts)) zip.file(name, text);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// Read every part of a .docx as bytes, in the order stored.
export async function docxParts(bytes) {
  const zip = await JSZip.loadAsync(bytes), out = new Map();
  for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) out.set(name, Buffer.from(await zip.file(name).async('uint8array')));
  return out;
}

// What Word shows after "Accept All Changes": deleted rows, deleted text, and
// paragraphs whose paragraph mark was deleted disappear; inserted text, rows,
// and paragraphs stay.
export function acceptAll(xml) {
  return xml
    .replace(/<w:tr\b[^>]*>(?:(?!<\/w:tr>)[\s\S])*?<w:trPr>(?:(?!<\/w:trPr>)[\s\S])*?<w:del [^>]*\/>[\s\S]*?<\/w:tr>/g, '')
    .replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<w:rPr><w:del [^>]*\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '')
    .replace(/<w:(ins|del) [^>]*\/>/g, '')
    .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '')
    .replace(/<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g, '$1');
}
