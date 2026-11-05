import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

// The vendored browser UMD bundle needs an explicit CommonJS wrapper under
// Node versions that otherwise interpret .js files using the root ESM setting.
const zipModule = { exports: {} };
const zipPath = new URL('../vendor/jszip-3.10.1.min.js', import.meta.url);
new vm.Script(`(function(module, exports, require) {${fs.readFileSync(zipPath, 'utf8')}\n})`,
  { filename: 'jszip-3.10.1.min.js' }).runInThisContext()(zipModule, zipModule.exports, createRequire(import.meta.url));
export const JSZip = zipModule.exports;

// Count records in downloaded bytes, independently of the app's export selection.
// CSV parsing must respect quoted multiline stems and escaped quotation marks.
export function csvRecords(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (ch === '\n') { rows.push(row); row = []; }
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

export async function downloadedQuestionCount(platform, bytes) {
  if (platform === 'kahoot') {
    const zip = await JSZip.loadAsync(bytes);
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    return Math.max(0, (sheet.match(/<(?:\w+:)?row\b/g) || []).length - 1);
  }
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  if (platform === 'examsoft') {
    return examsoftQuestionCount(text);
  }
  const rows = csvRecords(text);
  if (platform === 'brightspace') return rows.filter(r => r[0] === 'NewQuestion').length;
  if (platform === 'poll') return rows.filter(r => r[0] === 'Poll').length;
  throw new Error('Unknown export platform');
}

export function examsoftQuestionCount(rtf) {
  // Tokenize controls so literal backslashes/braces do not become formatting.
  // Blank paragraphs delimit exported records; numbered FITB answers inside
  // a record must not count as new questions.
  const paragraphs = [''], stack = [];
  let skip = false;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (ch === '{') { stack.push(skip); continue; }
    if (ch === '}') { skip = stack.pop() ?? false; continue; }
    if (ch !== '\\') { if (!skip && ch !== '\r' && ch !== '\n') paragraphs[paragraphs.length - 1] += ch; continue; }
    const next = rtf[++i];
    if (['\\', '{', '}'].includes(next)) { if (!skip) paragraphs[paragraphs.length - 1] += next; continue; }
    const control = rtf.slice(i).match(/^([a-z]+)(-?\d+)? ?/i);
    if (!control) continue;
    i += control[0].length - 1;
    const word = control[1];
    if (['fonttbl', 'colortbl', 'stylesheet', 'info'].includes(word)) skip = true;
    if (skip) continue;
    if (word === 'line' || word === 'par') paragraphs.push('');
    if (word === 'u') {
      paragraphs[paragraphs.length - 1] += String.fromCharCode((Number(control[2]) + 65536) % 65536);
      if (rtf[i + 1] === '?') i++;
    }
  }
  let count = 0, atRecordStart = true;
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) { atRecordStart = true; continue; }
    if (atRecordStart && /^(?:Type: [A-Z]+\s+)?(?:Title: .*?\s+)?(?:Category: .*?\s+)?\d+\.\s/.test(paragraph.trimStart())) count++;
    atRecordStart = false;
  }
  return count;
}
