// FacultyBridge shared schedule reader.
//
// Reads the course schedule table out of a Word (.docx) syllabus: which tables
// are schedules, what each column holds, and one entry per dated class period
// (date, printed day, time, topic, instructor text, reading, lecture number).
// CalendarBridge and SyllabusBridge both use it, so a syllabus layout fixed here
// is fixed in both tools.
//
// It only reads. What a tool does with an entry (calendar events, faculty IDs,
// meeting times filled in, validation checks) stays in that tool.
//
// Each entry also records where it came from in the Word file (row, line, and
// the box used for each field), so SyllabusBridge can write edits back to the
// right box. A box merged down from the row above (Word vMerge) belongs to that
// row in Word, so it is never given as the source of a field on a later row.
(function (global) {
  'use strict';
  const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  // A date box that says the date is not set yet ("TBD").
  const DATE_PLACEHOLDER = /^(?:TBD|TBA|to be (?:determined|announced))\.?$/i;

  // ---- Text ----
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function normalizeDashes(s) { return clean(s).replace(/[–—−]/g, '–').replace(/\s*-\s*/g, ' – '); }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---- Dates ----
  // Dates as syllabi write them: 9/21, 9/21/26, 21-Sep, 21 Sep 2026, Sep21, Sept 21, Sept. 21, September 21, 2026,
  // December 9th.
  // A number followed by ":" is a time ("Oct 5 - 10:00 AM"), never a year.
  const MONTH = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const DAY_FIRST = `(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–—]\\s*|\\s+)(${MONTH})\\.?(?:(?:\\s*[-–—,]\\s*|\\s+)(\\d{2,4})(?![:\\d]))?`;
  const MONTH_FIRST = `(${MONTH})(?:\\.?\\s*[-–—]?\\s*)(\\d{1,2})(?:st|nd|rd|th)?(?:(?:\\s*[-–—,]\\s*|\\.)(\\d{2,4})(?![:\\d]))?`;
  const NUMERIC = '(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?';
  const plain = re => re.replace(/\((?!\?)/g, '(?:');
  const DATE_RE = new RegExp(`\\b(?:${plain(NUMERIC)}|${plain(DAY_FIRST)}|${plain(MONTH_FIRST)})\\b`, 'gi');
  function parseLooseDateToken(s) {
    s = clean(s);
    let m = s.match(new RegExp(`\\b${NUMERIC}\\b`));
    if (m) return {mo: +m[1], d: +m[2], y: m[3] || '', raw: m[0], hadYear: !!m[3]};
    m = s.match(new RegExp(`\\b${DAY_FIRST}\\b`, 'i'));
    if (m) return {mo: MONTHS[m[2].toLowerCase()], d: +m[1], y: m[3] || '', raw: m[0], hadYear: !!m[3]};
    m = s.match(new RegExp(`\\b${MONTH_FIRST}\\b`, 'i'));
    if (m) return {mo: MONTHS[m[1].toLowerCase()], d: +m[2], y: m[3] || '', raw: m[0], hadYear: !!m[3]};
    return null;
  }
  // "9/21/26" -> "9/21/2026"; a date without a year takes the given course year.
  function normalizeDate(s, year) {
    const p = parseLooseDateToken(s);
    if (!p) return clean(s);
    let y = p.y || year;
    if (y && String(y).length === 2) y = '20' + y;
    return `${p.mo}/${p.d}/${y || ''}`.replace(/\/$/, '');
  }
  function parseDateParts(s) {
    const m = clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const mo = +m[1], d = +m[2], y = +m[3], dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? {y, mo, d} : null;
  }
  function dayFromDate(date, year) {
    const d = parseDateParts(normalizeDate(date, year));
    return d ? DAY_NAMES[new Date(d.y, d.mo - 1, d.d).getDay()] : '';
  }
  function extractDates(t) { return [...clean(t).matchAll(DATE_RE)].map(m => m[0]); }

  // ---- Days ----
  function normalizeDay(d) {
    const n = clean(d).toLowerCase().replace(/[^a-z]/g, '');
    return n.startsWith('m') ? 'Monday' : n.startsWith('tu') || n === 't' ? 'Tuesday' : n.startsWith('w') ? 'Wednesday' : n.startsWith('th') ? 'Thursday' : n.startsWith('f') ? 'Friday' : '';
  }
  function extractDayTokens(t) { return [...clean(t).matchAll(/\b(Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|M|T|W|Th|F)\b/gi)].map(m => normalizeDay(m[1])); }
  function firstDay(t) { return extractDayTokens(t)[0] || ''; }
  // Full or abbreviated day name written next to a date in the same cell; single letters are too ambiguous here.
  function namedDay(t) { const m = clean(t).match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tues?|Wed|Thu(?:rs?)?|Fri)\b/i); return m ? normalizeDay(m[1]) : ''; }
  function isDayOnlyText(t) {
    const parts = clean(t).split(/\s*[;,|/]\s*|\s+/).filter(Boolean);
    if (!parts.length) return false;
    return parts.every(p => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|M|T|W|Th|F)[.]?$/i.test(p));
  }
  function dayTokensFromCell(cell) {
    if (!cell) return [];
    const lines = (cell.lines || []).map(clean).filter(Boolean);
    if (lines.length && lines.every(isDayOnlyText)) return lines.flatMap(extractDayTokens);
    return isDayOnlyText(cell.text) ? extractDayTokens(cell.text) : [];
  }

  // ---- Times ----
  function hasTimeRangeShape(s) { s = clean(s).replace(/\./g, ':').replace(/[–—−-]/g, '–'); return /^\d{1,2}:\d{2}\s*(?:AM|PM)?\s*–\s*\d{1,2}:\d{2}\s*(?:AM|PM)?$/i.test(s); }
  // "8:00 a - 5:00 p" -> "8:00 AM – 5:00 PM".
  function extractTimeText(text) {
    const m = clean(text).match(/\b\d{1,2}(?::|\.)\d{2}\s*(?:[Aa][Mm]|[Pp][Mm]|[ap](?![A-Za-z]))?\s*[–—−-]\s*\d{1,2}(?::|\.)\d{2}\s*(?:[Aa][Mm]\b|[Pp][Mm]\b|[ap](?![A-Za-z]))?/);
    return m ? normalizeDashes(m[0].replace(/\./g, ':').replace(/(\d)\s*([ap])(?![A-Za-z])/g, (x, d, ap) => `${d} ${ap.toUpperCase()}M`)) : '';
  }
  // Recurring meeting times in the syllabus header ("Mondays (9:00 am - 10:00 am)", "Tue/Thu 1:00-3:00 PM").
  function extractMeetingPatterns(lines) {
    const patterns = {Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: []};
    const add = (day, time) => { day = normalizeDay(day); time = normalizeDashes(clean(time).replace(/\./g, ':')); if (day && hasTimeRangeShape(time) && !patterns[day].includes(time)) patterns[day].push(time); };
    const scope = lines.slice(0, 110);
    for (let i = 0; i < scope.length; i++) {
      const line = clean(scope[i]).replace(/\s+to\s+/gi, ' – ');
      if (/exam review/i.test(line)) continue;
      const matches = [...line.matchAll(/(\d{1,2}(?::|\.)\d{2}\s*(?:AM|PM)?\s*[–—-]\s*\d{1,2}(?::|\.)\d{2}\s*(?:AM|PM)?)/gi)];
      if (matches.length) {
        let cursor = 0, lastDays = [];
        for (const m of matches) {
          const prefix = line.slice(cursor, m.index), days = extractDayTokens(prefix);
          if (days.length) lastDays = days;
          if (lastDays.length) lastDays.forEach(d => add(d, m[1]));
          cursor = m.index + m[0].length;
        }
      }
      const onlyDay = extractDayTokens(line);
      if (onlyDay.length === 1 && /^\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue(?:s)?|Wed|Thu(?:rs)?|Fri|M|T|W|Th|F)\s*:?\s*$/i.test(line)) {
        for (let j = i + 1; j <= Math.min(i + 3, scope.length - 1); j++) {
          const candidate = clean(scope[j]);
          if (/^(QUARTER|GRADING|REQUIRED|COURSE CLASSIFICATION)/i.test(candidate)) break;
          const tm = candidate.match(/^(\d{1,2}(?::|\.)\d{2}\s*(?:AM|PM)?\s*[–—-]\s*\d{1,2}(?::|\.)\d{2}\s*(?:AM|PM)?)$/i);
          if (tm) { add(onlyDay[0], tm[1]); break; }
        }
      }
    }
    return patterns;
  }

  // ---- What kind of class period a topic is ----
  // A "(Quiz 1 due at 8 AM)" note is a deadline, not the meeting itself, and a review period that names an exam is
  // still a class meeting. A "Pre-Lab Quiz" inside a lecture topic does not make the period an exam.
  function classifyTopic(topic) {
    const t = clean(topic).toLowerCase(), moved = /\bclass(?:es)?\s+(?:will\s+be|is|are)\s+(?:held|moved|rescheduled)\b/.test(t);
    if (/no class/.test(t) || (!moved && /holiday|thanksgiving|veteran/.test(t))) return 'no-class';
    let core = t.replace(/\([^)]*\bdue\b[^)]*\)/g, ' ');
    const lesson = core.replace(/\bpre[\s–—-]*(?:lab|class)\b\s*:?\s*quiz\s*\d*\s*(?:\([^)]*\))?/g, ' ');
    if (lesson !== core && /[a-z]{3}/.test(lesson)) core = lesson;
    if (/\breview\b/.test(core.replace(/\([^)]*\)/g, ' '))) return 'activity';
    if (/exam|quiz/.test(core)) return 'assessment';
    if (/reinforcement|in[- ]?class activit|activity/.test(core)) return 'activity';
    return 'lecture';
  }

  // ---- Faculty names ----
  // `faculty` is a list of {id, name, short}.
  function normName(s) { return clean(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ''); }
  function lastNameFrom(name) {
    const base = clean(name).replace(/^(dr\.?|guest lecturers?:)\s*/i, '').replace(/,.*$/, '');
    const parts = base.split(/\s+/).filter(Boolean);
    return parts.at(-1) || '';
  }
  function editDistance(a, b) {
    a = normName(a); b = normName(b);
    if (Math.abs(a.length - b.length) > 2) return 99;
    const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function facultyAliases(f) {
    const last = lastNameFrom(f.name) || f.short;
    const aliases = new Set([f.short, last, f.name]);
    clean(last).split(/[-–—]/).map(clean).filter(x => x.length >= 4).forEach(x => aliases.add(x));
    if (/mensah.?kane/i.test(f.name)) aliases.add('M-Kane');
    if (/lesslie/i.test(f.name)) aliases.add('Leslie');
    return [...aliases].map(clean).filter(Boolean);
  }
  // IDs of the faculty named in the text, allowing one typo in names of five letters or more.
  function findFacultyIds(text, faculty) {
    text = clean(text);
    if (!text) return [];
    const low = text.toLowerCase(), out = [];
    for (const f of faculty || []) {
      let hit = false;
      for (const a of facultyAliases(f)) {
        const al = a.toLowerCase();
        if (al && low.includes(al)) { hit = true; break; }
        const tokens = low.split(/[^a-z]+/).filter(Boolean);
        if (al.length >= 5 && tokens.some(t => editDistance(t, al) <= 1)) { hit = true; break; }
      }
      if (hit) out.push(f.id);
    }
    return [...new Set(out)];
  }
  // A topic with a faculty name in it ("Antibiotics (Mentor)"): the IDs found and the topic without the name.
  function extractFacultyFromTopic(topic, faculty) {
    const ids = findFacultyIds(topic, faculty);
    let cleaned = clean(topic);
    for (const id of ids) {
      const f = (faculty || []).find(x => x.id === id);
      if (!f) continue;
      for (const a of facultyAliases(f).sort((a, b) => b.length - a.length)) {
        const token = new RegExp(`\b${escapeRe(a)}\b`, 'ig');
        cleaned = cleaned.replace(token, ' ');
      }
    }
    cleaned = clean(cleaned.replace(/\(\s*(?:&|,|\/|and)?\s*\)/gi, ' ').replace(/\[\s*\]/g, ' ').replace(/\s*[-–—/]\s*(?=$)/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' '));
    cleaned = cleaned.replace(/\(\s*\)$/, '').replace(/^[-–—/\s]+|[-–—/\s]+$/g, '').trim();
    return {ids, topic: cleaned || clean(topic)};
  }
  function looksLikeReading(t) { return /\b(ch\.?|chapter|dipiro|katzung|golan|foye|stry|lemke|zeind|porth)\b/i.test(t); }
  function looksLikeInstructor(t, faculty) { return /^dr\.?\s+/i.test(t) || findFacultyIds(t, faculty).length > 0; }

  // ---- Word tables ----
  // The lines of one table box: each paragraph, split at line breaks.
  function cellLines(tc) {
    const result = [];
    for (const p of [...tc.children].filter(x => x.localName === 'p')) {
      let buf = '';
      const walk = n => {
        for (const ch of n.childNodes) {
          if (ch.localName === 't') buf += ch.textContent || '';
          else if (ch.localName === 'br' || ch.localName === 'cr') { if (clean(buf)) { result.push(clean(buf)); buf = ''; } }
          else walk(ch);
        }
      };
      walk(p);
      if (clean(buf)) result.push(clean(buf));
    }
    return result;
  }
  function cellSpan(c) { return Math.max(1, parseInt(c?.span || 1, 10) || 1); }
  function logicalCellAt(cells, logicalIdx) {
    let pos = 0;
    for (const c of cells || []) {
      const span = cellSpan(c);
      if (logicalIdx >= pos && logicalIdx < pos + span) return c;
      pos += span;
    }
    return null;
  }
  // A box merged down from the row above (Word vMerge) shows that box's text on this row too. A merged date box is
  // left empty so the continuation-row handling in readScheduleRows still flags them for review.
  function inheritMergedCells(row, above) {
    if (!above) return;
    const aboveDateCell = above.find(c => extractDates(c.text).length);
    let pos = 0;
    for (const c of row) {
      const src = c.mergedFromAbove && !c.text ? logicalCellAt(above, pos) : null;
      if (src && src.text && src !== aboveDateCell) { c.text = src.text; c.lines = src.lines.slice(); c.fromRow = src.fromRow ?? src.rowIndex; }
      pos += cellSpan(c);
    }
  }
  // Every table in the document (nested ones included), as rows of boxes:
  // {text, lines, span, mergedFromAbove, index (box number in its row), rowIndex, fromRow (set when the text is
  // merged down from an earlier row)}. `element` is the table's <w:tbl> node.
  function readWordTables(doc) {
    const tables = [];
    for (const tbl of [...doc.getElementsByTagNameNS(NS, 'tbl')]) {
      const rows = [];
      for (const r of [...tbl.children].filter(x => x.localName === 'tr')) {
        const rowIndex = rows.length;
        const row = [...r.children].filter(x => x.localName === 'tc').map((c, index) => {
          const lines = cellLines(c), spanEl = [...c.getElementsByTagNameNS(NS, 'gridSpan')][0];
          const span = Math.max(1, parseInt(spanEl?.getAttributeNS(NS, 'val') || spanEl?.getAttribute('w:val') || spanEl?.getAttribute('val') || '1', 10) || 1);
          const pr = [...c.children].find(x => x.localName === 'tcPr'), vm = pr && [...pr.children].find(x => x.localName === 'vMerge');
          const vmVal = vm ? (vm.getAttributeNS(NS, 'val') || vm.getAttribute('w:val') || '') : '';
          return {text: clean(lines.join(' ')), lines, span, mergedFromAbove: !!vm && vmVal !== 'restart', index, rowIndex};
        });
        inheritMergedCells(row, rows.at(-1));
        rows.push(row);
      }
      tables.push({element: tbl, rows});
    }
    return tables;
  }

  // ---- Schedule tables ----
  // What each column holds, from its heading. Headings either tool used to recognize: "#", "Lecture #", "Day",
  // "Week", "Date", "(a) Date", "Date/Time", "Time", "Topic(s)", "Course Topics", "Readings", "Book Chapter",
  // "Instructor(s)", "Course Faculty", "Lecturer", "Facilitator", "Presenter".
  function detectHeaders(rows) {
    const headers = [], headerRows = rows.slice(0, 3), texts = headerRows.flatMap(r => r.map(c => clean(c.text).toLowerCase()));
    const topicHead = /^(?:topics?|topic\(s\)|course topics?|lecture topics?)$/;
    const hasExplicitTopic = texts.some(t => topicHead.test(t));
    headerRows.forEach(r => {
      let logicalIdx = 0;
      r.forEach(c => {
        const t = clean(c.text).toLowerCase();
        if (/^(#|lecture #|lecture number)$/.test(t) || (t === 'lecture' && hasExplicitTopic)) headers[logicalIdx] = 'lecture';
        else if (/^(day|weekday|day of week)$/.test(t)) headers[logicalIdx] = 'day';
        else if (/^(week|wk)$/.test(t)) headers[logicalIdx] = 'week';
        else if (/^(?:\(?[a-z]\)?\s*)?(?:date|class date|date\s*\/\s*time|date time)$/.test(t)) headers[logicalIdx] = 'date';
        else if (/^time$|^class time$/.test(t)) headers[logicalIdx] = 'time';
        else if (topicHead.test(t) || (t === 'lecture' && !hasExplicitTopic)) headers[logicalIdx] = 'topic';
        else if (/^(reading|readings|related readings?|reading assignments?|required readings?|book chapters?|book chap|chapters?|textbook)$/.test(t)) headers[logicalIdx] = 'reading';
        else if (/^(?:course\s+)?(?:instructor|faculty|presenter|lead instructor|lecturer|facilitator)s?$/.test(t)) headers[logicalIdx] = 'instructor';
        logicalIdx += cellSpan(c);
      });
    });
    return headers;
  }
  function dateCount(rows) { return rows.reduce((n, r) => n + r.reduce((m, c) => m + extractDates(c.text).length, 0), 0); }
  function isLikelyScheduleTable(rows) {
    const head = rows.slice(0, 2).flatMap(r => r.map(c => clean(c.text).toLowerCase())).join(' | '), dates = dateCount(rows);
    const hasTopic = /\b(topic|course topics?|lecture)\b/.test(head), hasFaculty = /\b(instructor|faculty|presenter|lead instructor)\b/.test(head);
    const hasStructure = /\b(day|week|time|date\/time|time frame|lecture)\b/.test(head), dueOnly = /due date/.test(head) && !hasFaculty && !/\b(day|week|time)\b/.test(head);
    return dates >= 3 && hasTopic && (hasFaculty || hasStructure) && !dueOnly;
  }
  // A table without its own header row that carries on the schedule table before it.
  function isScheduleContinuation(rows, headers) {
    const dateIdx = headers.findIndex(x => x === 'date'), dayIdx = headers.findIndex(x => x === 'day'), timeIdx = headers.findIndex(x => x === 'time'), topicIdx = headers.findIndex(x => x === 'topic');
    if (dateIdx < 0 || topicIdx < 0) return false;
    let aligned = 0;
    for (const r of rows) {
      const dateCell = logicalCellAt(r, dateIdx), dayCell = dayIdx >= 0 ? logicalCellAt(r, dayIdx) : null, timeCell = timeIdx >= 0 ? logicalCellAt(r, timeIdx) : null, topicCell = logicalCellAt(r, topicIdx);
      if (!dateCell || !extractDates(dateCell.text).length) continue;
      const hasDay = dayIdx < 0 || !!dayCell, hasTime = timeIdx < 0 || !!timeCell, hasTopic = !!topicCell;
      if (hasDay && hasTime && hasTopic) aligned++;
    }
    return aligned >= 2;
  }
  // The schedule tables among `tables` (lists of rows), in order: [{tableIndex, headers, continuation}]. A
  // continuation table has no header row of its own; it uses the headers of the schedule table before it.
  function findScheduleTables(tables) {
    const out = [];
    let continuationHeaders = null;
    tables.forEach((rows, tableIndex) => {
      const count = dateCount(rows), detected = detectHeaders(rows);
      if (count >= 3 && isLikelyScheduleTable(rows, detected)) { continuationHeaders = detected.slice(); out.push({tableIndex, headers: detected}); }
      else if (continuationHeaders && count >= 2 && isScheduleContinuation(rows, continuationHeaders)) out.push({tableIndex, headers: continuationHeaders.slice(), continuation: true});
      else if (count < 2 || !continuationHeaders || !isScheduleContinuation(rows, continuationHeaders)) continuationHeaders = null;
    });
    return out;
  }

  // ---- Reading one schedule table ----
  function splitLikelyTopics(s) { s = clean(s); if (!s) return []; s = s.replace(/([a-z)])([A-Z]{2,}\b)/g, '$1|$2').replace(/(Overview)(ANS\b)/g, '$1|$2'); return s.split('|').map(clean).filter(Boolean); }
  function expandTopics(arr, n) { if (arr.length === n) return arr; if (arr.length > n) return arr.slice(0, n); return [...arr, ...Array(n - arr.length).fill('')]; }
  function expandToN(a, n) { if (a.length >= n) return a.slice(0, n); return [...a, ...Array(n - a.length).fill('')]; }
  // Spreads a column's lines over the dates of a row; a reading or lecture number belongs only to the kind of
  // period that has one.
  function alignOptional(values, topics, n, kind) {
    values = values.map(clean).filter(Boolean);
    const out = Array(n).fill('');
    if (!values.length) return out;
    const candidates = [];
    for (let i = 0; i < n; i++) {
      const type = classifyTopic(topics[i] || '');
      const eligible = kind === 'lecture' ? type === 'lecture' : kind === 'faculty' ? type === 'lecture' || type === 'activity' : type !== 'assessment' && type !== 'no-class';
      if (eligible) candidates.push(i);
    }
    if (values.length === n) { for (let i = 0; i < n; i++) out[i] = values[i]; return out; }
    if (values.length === candidates.length) { values.forEach((v, j) => out[candidates[j]] = v); return out; }
    values.forEach((v, j) => { if (j < candidates.length) out[candidates[j]] = v; });
    return out;
  }
  // "Tuesday (9/22/26) or Wednesday (9/23/26)": the same session offered on alternate days, so each date gets the whole row.
  function isAlternateSectionDates(text, dates) {
    text = clean(text);
    let from = 0;
    const gaps = [];
    for (const d of dates) {
      const at = text.indexOf(d, from);
      if (at < 0) return false;
      if (from) gaps.push(text.slice(from, at));
      from = at + d.length;
    }
    return gaps.length > 0 && gaps.every(g => /\bor\b/i.test(g));
  }
  function headerCell(cells, headers, name) { const i = headers.findIndex(x => x === name); return i >= 0 ? logicalCellAt(cells, i) : null; }
  function findDayCell(cells, dateIdx, headers) {
    const hc = headerCell(cells, headers, 'day');
    if (hc && dayTokensFromCell(hc).length) return hc;
    for (let i = Math.max(0, dateIdx - 2); i <= Math.min(cells.length - 1, dateIdx + 1); i++) if (dayTokensFromCell(cells[i]).length) return cells[i];
    return null;
  }
  function findTopicCell(cells, dateIdx, headers, faculty) {
    const topicIdx = headers.findIndex(x => x === 'topic'), topicHeaderCell = topicIdx >= 0 ? logicalCellAt(cells, topicIdx) : null;
    if (topicHeaderCell && clean(topicHeaderCell.text)) return topicHeaderCell;
    const timeIdx = headers.findIndex(x => x === 'time'), timeHeaderCell = timeIdx >= 0 ? logicalCellAt(cells, timeIdx) : null;
    if (topicIdx >= 0 && !topicHeaderCell && timeHeaderCell) {
      const mergedText = clean(timeHeaderCell.text);
      if (mergedText && !hasTimeRangeShape(mergedText) && !extractTimeText(mergedText) && !looksLikeReading(mergedText) && !looksLikeInstructor(mergedText, faculty)) return timeHeaderCell;
    }
    for (let i = dateIdx + 1; i < cells.length; i++) {
      if (i === timeIdx) continue;
      const t = cells[i].text;
      if (!t || hasTimeRangeShape(t) || extractTimeText(t) || looksLikeReading(t) || looksLikeInstructor(t, faculty)) continue;
      if (extractDayTokens(t).length && clean(t).length < 16) continue;
      if (cells[i].lines.length && cells[i].lines.every(x => /^\d{1,3}$/.test(clean(x)))) continue;
      return cells[i];
    }
    return null;
  }
  function findLectureValue(cells, dateIdx, headers) {
    const hc = headerCell(cells, headers, 'lecture');
    if (hc) { const m = clean(hc.text).match(/^(\d{1,3})$/); if (m) return m[1]; }
    for (let i = 0; i < cells.length; i++) {
      if (i === dateIdx) continue;
      const m = clean(cells[i].text).match(/^(\d{1,3}|--|---)$/);
      if (m && /^\d/.test(m[1])) return m[1];
    }
    return '';
  }
  function findLectureLines(cells, dateIdx, n) {
    const candidates = cells.map((c, i) => ({i, vals: c.lines.filter(x => /^\d{1,3}$/.test(clean(x)))})).filter(x => x.i !== dateIdx && x.vals.length >= Math.max(2, n - 2));
    if (!candidates.length) return [];
    candidates.sort((a, b) => b.vals.length - a.vals.length || Math.abs(a.i - dateIdx) - Math.abs(b.i - dateIdx));
    return candidates[0].vals;
  }
  // The class time printed in the row, and the box it is in.
  function findTimeCell(cells, headers) {
    const hc = headerCell(cells, headers, 'time');
    if (hc) {
      const t = extractTimeText(hc.text);
      if (t) return {time: t, cell: hc};
      const raw = normalizeDashes(clean(hc.text).replace(/\./g, ':'));
      if (hasTimeRangeShape(raw)) return {time: raw, cell: hc};
    }
    for (const c of cells) { const t = extractTimeText(c.text); if (t) return {time: t, cell: c}; }
    return {time: '', cell: null};
  }
  function findReadingCell(cells, topicCell) { const i = cells.indexOf(topicCell); return cells.slice(i + 1).find(c => looksLikeReading(c.text)) || null; }
  function findReadingLines(cells, topicCell) { const i = cells.indexOf(topicCell), c = cells.slice(i + 1).find(c => c.lines.some(looksLikeReading)); return c ? c.lines.filter(looksLikeReading) : []; }
  function findInstructorCell(cells, topicCell, headers, faculty) {
    const hc = headerCell(cells, headers, 'instructor');
    if (hc) return hc;
    const i = cells.indexOf(topicCell);
    for (const c of cells.slice(i + 1)) if (looksLikeInstructor(c.text, faculty)) return c;
    return null;
  }
  function findInstructorCellLines(cells, topicCell, headers, faculty) {
    const hc = headerCell(cells, headers, 'instructor');
    if (hc) return {lines: (hc.lines?.length ? hc.lines : [hc.text]).map(clean).filter(Boolean), cell: hc};
    const i = cells.indexOf(topicCell), c = cells.slice(i + 1).find(c => c.lines.some(x => looksLikeInstructor(x, faculty)));
    return c ? {lines: c.lines.filter(x => looksLikeInstructor(x, faculty)), cell: c} : {lines: [], cell: null};
  }
  // The Word box a field was read from, for write-back. A box merged down from an earlier row is that row's box
  // in Word, so it is not this row's source.
  function own(cell) { return cell && cell.fromRow == null && cell.index != null ? cell.index : null; }
  function ownOr(cell, cells, headers, name) { return cell ? own(cell) : own(headerCell(cells, headers, name)); }

  // One entry per dated class period in a schedule table:
  // {lecture, date (as written), day, time, timeLine, topic, instructor (text), reading, continuationRow, multiDate,
  //  confidence, lectureSource, source:{rowIndex, lineIndex, columnMap:{date, day, time, topic, faculty}}}.
  // A row with several dates gives one entry per date. A row with no date continues the date above it
  // (continuationRow). Options: faculty [{id, name, short}] (to recognize names), year (for undated years),
  // placeholderDates (keep "TBD" date rows).
  function readScheduleRows(rows, headers = null, options = {}) {
    const faculty = options.faculty || [], year = options.year || '';
    const entries = [];
    let carryInstructor = '', carryDate = '';
    headers = headers?.length ? headers.slice() : detectHeaders(rows);
    const hasLectureHeader = headers.includes('lecture'), lectureSource = hasLectureHeader ? 'header' : 'heuristic';
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = rows[ri];
      let dateCellIndex = cells.findIndex(c => extractDates(c.text).length);
      let inheritedDate = false, placeholder = false;
      if (dateCellIndex < 0 && options.placeholderDates) {
        // A "TBD" date on a row that has other content is an event still to be dated (for example the final exam).
        const dc = headerCell(cells, headers, 'date');
        if (dc && DATE_PLACEHOLDER.test(clean(dc.text)) && cells.some(c => c !== dc && clean(c.text) && c.fromRow == null)) { placeholder = true; dateCellIndex = cells.indexOf(dc); }
      }
      if (dateCellIndex < 0) {
        if (!carryDate) continue;
        inheritedDate = true;
        const dayIdx = headers.findIndex(x => x === 'day');
        dateCellIndex = dayIdx >= 0 ? dayIdx : Math.max(0, cells.findIndex(c => dayTokensFromCell(c).length));
      }
      const dates = placeholder ? [clean(cells[dateCellIndex].text)] : inheritedDate ? [carryDate] : extractDates(cells[dateCellIndex]?.text || '');
      if (!dates.length) continue;
      const dayCell = findDayCell(cells, dateCellIndex, headers), dayLines = dayTokensFromCell(dayCell);
      if (!inheritedDate && !placeholder) carryDate = dates[dates.length - 1];
      const topicCell = findTopicCell(cells, dateCellIndex, headers, faculty);
      if (!topicCell) continue;
      let topics = topicCell.lines.length ? topicCell.lines : [topicCell.text];
      if (inheritedDate && /^week\s*\d+$/i.test(clean(topicCell.text))) continue;
      topics = topics.flatMap(splitLikelyTopics).filter(Boolean);
      const dateCol = inheritedDate ? null : own(cells[dateCellIndex]), dayCol = ownOr(dayCell, cells, headers, 'day');
      if (dates.length === 1) {
        const topic = topics.join(' ');
        if (inheritedDate && !clean(topic)) continue;
        const printedDay = firstDay(dayCell?.text || '') || (inheritedDate || placeholder ? '' : namedDay(cells[dateCellIndex]?.text || ''));
        const day = printedDay || (inheritedDate || placeholder ? '' : dayFromDate(dates[0], year));
        const lecture = findLectureValue(cells, dateCellIndex, headers), timeFound = findTimeCell(cells, headers), readingCell = findReadingCell(cells, topicCell);
        const instructorCell = findInstructorCell(cells, topicCell, headers, faculty), explicitInstructor = instructorCell ? clean(instructorCell.text) : '';
        if (explicitInstructor) carryInstructor = explicitInstructor;
        const embedded = extractFacultyFromTopic(topic, faculty), instructor = explicitInstructor || embedded.ids.length ? explicitInstructor : carryInstructor;
        entries.push({lecture, date: dates[0], day, time: timeFound.time, timeLine: '', topic, instructor, reading: readingCell?.text || '',
          continuationRow: inheritedDate, placeholderDate: placeholder, multiDate: false, confidence: inheritedDate ? 'review' : 'high', lectureSource,
          source: {rowIndex: ri, lineIndex: 0, columnMap: {date: dateCol, day: dayCol, time: ownOr(timeFound.cell, cells, headers, 'time'), topic: own(topicCell),
            faculty: ownOr(instructorCell, cells, headers, 'instructor')}}});
        continue;
      }
      const n = dates.length, dateCellLines = (cells[dateCellIndex]?.lines || []).filter(x => extractDates(x).length);
      const days = dayLines.length ? expandToN(dayLines, n) : dateCellLines.length === n ? dateCellLines.map(namedDay) : [];
      const topicArr = expandTopics(topics, n), lectureArr = alignOptional(findLectureLines(cells, dateCellIndex, n), topicArr, n, 'lecture');
      const facultyFound = findInstructorCellLines(cells, topicCell, headers, faculty), facultySource = facultyFound.lines, readingSource = findReadingLines(cells, topicCell);
      const facultyArr = alignOptional(facultySource, topicArr, n, 'faculty'), readingArr = alignOptional(readingSource, topicArr, n, 'reading');
      if (isAlternateSectionDates(cells[dateCellIndex]?.text || '', dates)) {
        const whole = topics.join(' '), fac = facultySource.join(' '), rd = readingSource.join(' '), lec = findLectureValue(cells, dateCellIndex, headers);
        for (let i = 0; i < n; i++) { topicArr[i] = whole; facultyArr[i] = fac; readingArr[i] = rd; lectureArr[i] = lec; }
      }
      const timeCell = headerCell(cells, headers, 'time'), timeLines = (timeCell?.lines || []).map(clean).filter(Boolean);
      for (let i = 0; i < n; i++) {
        const topic = topicArr[i] || '';
        if (!topic) continue;
        const timeLine = timeLines.length ? extractTimeText(timeLines[i] || timeLines[timeLines.length - 1]) : '';
        entries.push({lecture: lectureArr[i] || '', date: dates[i], day: days[i] || dayFromDate(dates[i], year), time: '', timeLine, topic, instructor: facultyArr[i] || '',
          reading: readingArr[i] || '', continuationRow: false, placeholderDate: false, multiDate: true, confidence: 'high', lectureSource,
          source: {rowIndex: ri, lineIndex: i, columnMap: {date: dateCol, day: dayCol, time: own(timeCell), topic: own(topicCell), faculty: ownOr(facultyFound.cell, cells, headers, 'instructor')}}});
      }
    }
    return entries;
  }

  global.FacultyBridgeScheduleReader = {
    NS, MONTHS, DATE_PLACEHOLDER,
    clean, normalizeDashes, escapeRe,
    parseLooseDateToken, normalizeDate, parseDateParts, dayFromDate, extractDates,
    normalizeDay, extractDayTokens, firstDay, namedDay, isDayOnlyText, dayTokensFromCell,
    hasTimeRangeShape, extractTimeText, extractMeetingPatterns,
    classifyTopic,
    normName, lastNameFrom, editDistance, facultyAliases, findFacultyIds, extractFacultyFromTopic, looksLikeReading, looksLikeInstructor,
    cellLines, cellSpan, logicalCellAt, readWordTables,
    detectHeaders, isLikelyScheduleTable, isScheduleContinuation, findScheduleTables,
    readScheduleRows,
  };
})(typeof window !== 'undefined' ? window : globalThis);
