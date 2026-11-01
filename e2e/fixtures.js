import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';

const suite = JSON.parse(fs.readFileSync(new URL('../suite.json', import.meta.url)));
const JSZip = createRequire(import.meta.url)('../vendor/jszip-3.10.1.min.js');
export { suite };
export const toolById = id => suite.tools.find(t => t.id === id);

// Auto fixture shared by every spec: blocks external requests and fails the test
// on uncaught errors, console errors, or failed same-origin requests.
// Set `redact: true` for real course files so failures never echo page content.
export const test = base.extend({
  redact: [false, { option: true }],
  // 'site' serves dist/site over HTTP; 'standalone' opens the single-file build from disk.
  format: ['site', { option: true }],
  // Open a tool by suite id in whichever build format the project selects.
  openTool: async ({ page, format }, use) => {
    await use(async id => {
      const tool = toolById(id);
      if (format === 'standalone') {
        const file = path.resolve('dist/standalone', `${tool.name}-v${tool.version}-build${suite.suiteVersion}.html`);
        await page.goto(pathToFileURL(file).href);
      } else await page.goto(`/${tool.route ? tool.route + '/' : ''}`);
    });
  },
  guard: [async ({ page, context, baseURL, redact }, use) => {
    const problems = [];
    const note = (kind, detail) => problems.push(redact ? kind : `${kind}: ${detail}`);
    page.on('pageerror', error => note('Uncaught browser error', error.message));
    page.on('console', message => { if (message.type() === 'error') note('Console error', message.text()); });
    page.on('response', response => {
      if (!/^https?:/.test(response.url())) return;
      const url = new URL(response.url());
      if (url.origin === new URL(baseURL).origin && response.status() >= 400) note('Failed local request', `${response.status()} ${url.pathname}`);
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL).origin) {
        note('External request attempted', url.origin);
        return route.abort();
      }
      return route.continue();
    });
    await use(problems);
    expect(problems).toEqual([]);
  }, { auto: true }],
});
export { expect };

// Synthetic ExamSoft-style fixtures. No real exams or student data.
const itemHeader = 'Item #,Diff(p),Disc. Index,Point Biserial,Upper,Lower,Correct Answer,ItemID,Item Text,' +
  ['A', 'B', 'C', 'D'].map(l => `${l} - Text,${l} - # Selected,${l} - % Selected,${l} - Correct`).join(',') + ',Categories';
const itemRow = (n, d, disc, pb, up, lo, key, id, text, opts) => [n, d, disc, pb, up, lo, key, id, text,
  ...opts.flatMap(([t, count, pct, ok]) => [t, count, pct, ok]), ''].join(',');
// Three items, 60 takers: a healthy item, a hard/non-discriminating item, and a negative-PB item.
// Item 1 should read as fine; items 2 and 3 should be flagged. Response counts sum to 60.
export const syntheticItemCsv = [
  'Exam Name,# of Exam Takers,Date',
  'PHA9999 Synthetic Exam,60,2026-01-01',
  '',
  itemHeader,
  itemRow(1, 0.85, 0.30, 0.35, '95%', '65%', 'A', 'SYN-1', 'Which molecule transports oxygen?',
    [['Hemoglobin', 51, '85%', 'TRUE'], ['Glycogen', 3, '5%', 'FALSE'], ['DNA', 3, '5%', 'FALSE'], ['ATP', 3, '5%', 'FALSE']]),
  itemRow(2, 0.20, 0.02, 0.01, '30%', '28%', 'B', 'SYN-2', 'Which organelle makes most ATP?',
    [['Nucleus', 18, '30%', 'FALSE'], ['Mitochondrion', 12, '20%', 'TRUE'], ['Ribosome', 18, '30%', 'FALSE'], ['Golgi', 12, '20%', 'FALSE']]),
  itemRow(3, 0.50, -0.20, -0.25, '40%', '60%', 'C', 'SYN-3', 'Which ion carries the nerve impulse?',
    [['Calcium', 24, '40%', 'FALSE'], ['Chloride', 3, '5%', 'FALSE'], ['Sodium', 30, '50%', 'TRUE'], ['Iron', 3, '5%', 'FALSE']]),
].join('\r\n');

export const syntheticExamRtf = '{\\rtf1\\ansi\\deff0 ' + [
  'Course Name: PHA9999 Synthetic', '# of Questions: 2',
  'Question #: 1', 'Question Type: Multiple Choice', 'Which molecule transports oxygen?',
  'A. Hemoglobin', 'B. Glycogen', 'C. DNA', 'D. ATP', 'Correct Answer: A',
  'Question #: 2', 'Question Type: Multiple Choice', 'Which organelle makes most ATP?',
  'A. Nucleus', 'B. Mitochondrion', 'C. Ribosome', 'D. Golgi', 'Correct Answer: B',
].join('\\par ') + '}';

// Read a download's text and delete the temp file. Never reads beyond Playwright's temp storage.
export async function readDownload(download) {
  const text = fs.readFileSync(await download.path(), 'utf8');
  await download.delete();
  return text;
}
export async function downloadFrom(page, click) {
  const pending = page.waitForEvent('download');
  await click();
  const download = await pending;
  return { name: download.suggestedFilename(), text: await readDownload(download) };
}
// Minimal CSV parser (quoted fields, CRLF) for checking exported files.
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// Build a synthetic Word syllabus: paragraphs, then one schedule table (array of rows).
export async function syntheticDocx({ paragraphs, table }) {
  const p = t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(p).join('')}<w:tbl>${table.map(r => '<w:tr>' + r.map(t => '<w:tc>' + p(t) + '</w:tc>').join('') + '</w:tr>').join('')}</w:tbl></w:body></w:document>`;
  const zip = new JSZip(); zip.file('word/document.xml', xml);
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const syntheticSyllabus = {
  paragraphs: ['PHA9999 - Synthetic Course', 'Course Coordinator: Dr. Ada Faculty', 'Fall 2026', 'Course Schedule'],
  table: [['Date', 'Time', 'Topic', 'Faculty'],
    ['9/21/2026', '9:00 AM - 10:00 AM', 'Proteins', 'Dr. Ada Faculty'],
    ['9/23/2026', '9:00 AM - 10:00 AM', 'Enzymes', 'Dr. Ada Faculty'],
    ['9/28/2026', '9:00 AM - 10:00 AM', 'Hemoglobin', 'Dr. Ada Faculty']],
};
