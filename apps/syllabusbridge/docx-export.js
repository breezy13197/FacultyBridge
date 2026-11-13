'use strict';
// SyllabusBridge v2.5: "Export edited Word syllabus".
//
// Turns the structured editor's syllabus edits into edits for the Word writer
// (docx-writeback.js) and writes them into a NEW copy of the original .docx as
// Word tracked changes by "SyllabusBridge". The original file is never changed.
//
// Rules (docs/SYLLABUSBRIDGE-ROADMAP.md, v2.5):
// - Reading corrections ("SyllabusBridge misread this") are never written.
// - Every syllabus edit is either placed exactly once or listed as "could not
//   place" with a plain reason. Nothing is dropped silently.
// - A change is placed whole or not at all: if any part of it can't be placed
//   safely, none of it is written and the whole change is listed.
//
// Where things are: SyllabusBridge's reader (parseDocx) turns the Word file into
// a list of lines: each non-blank paragraph directly in the document body, then,
// for each table, each non-blank line of each cell. This file rebuilds that same
// list from the Word XML with the writer's own reader, so each line SyllabusBridge
// read is tied to a paragraph (and, inside table cells, a line within it). The
// two readings must agree line by line; where they don't, edits there are not
// placed.
//
// Input (built by syllabusbridge.js; plain data, so tests can build it too):
//   { lines: [string],                 SyllabusBridge's lines (state.lines)
//     changes: [{ key, kind, section, what, before, after, targets: [target] }] }
// Targets (what one change asks for in the Word file):
//   { type:'lines', start, before:[line], after:[line] }
//        Lines of a section: before is what SyllabusBridge read (in file order,
//        found from line `start` on); after is the edited text.
//   { type:'substitute', lines:[lineIndex], from, to }
//        Replace `from` by `to` in exactly one of those lines.
//   { type:'cell', tableIndex, rowIndex, columnIndex, before:[line], after:[line] }
//   { type:'cell-substitute', tableIndex, rowIndex, columnIndex, from, to }
//   { type:'delete-row', tableIndex, rowIndex, before:[[line]] }  (one array per cell)
//   { type:'add-row', tableIndex, afterRowIndex, order, id, cells:[string] }
//   { type:'new-section', before|after: lineIndex, heading, lines:[line], headingLike, bodyLike }
//        A section the Word file lacks: new paragraphs before or after that
//        line; the heading formatted like line headingLike, the text like bodyLike.
//   { type:'manual', reason }   cannot be placed; listed with the reason.
(function (root) {
  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  const fp = s => String(s ?? '').replace(/\s+/g, '');
  const dashes = s => String(s ?? '').replace(/[–—−]/g, '-');
  // A bullet pasted from Word as a symbol-font character (shown as a box
  // elsewhere) is written as an ordinary bullet.
  const bulletText = s => clean(s).replace(/^[\uF000-\uF0FF•▪◦]\s*/, '• ');
  class PlaceError extends Error {}
  const fail = reason => { throw new PlaceError(reason); };
  const NOT_MATCHED = 'SyllabusBridge could not match this text to one place in the Word file, so it was not placed.';

  // ---- Reading the Word file the way SyllabusBridge does --------------------
  function sourceMap(W, xml, parserLines) {
    const model = W.documentModel(xml);
    const paragraphs = new Map(), lines = [];
    const hasList = p => p.children.some(c => c.name === 'w:pPr' && c.children.some(x => x.name === 'w:numPr'));
    const addParagraph = (key, node, anchor, inCell) => {
      const raw = W.paragraphText(xml, node);
      // Body paragraphs are one line to SyllabusBridge (line breaks are not
      // separate lines there); in table cells each line break starts a new line.
      const entry = { key, node, anchor, raw, segments: inCell ? raw.split('\n') : [raw], list: hasList(node), inCell, lineRefs: [] };
      paragraphs.set(key, entry);
      return entry;
    };
    let pi = 0, ti = 0;
    const cells = new Map(), rows = new Map();
    for (const child of model.body.children) {
      if (child.name === 'w:p') {
        const e = addParagraph(`p:${pi}`, child, { type: 'paragraph', paragraphIndex: pi }, false);
        pi++;
        if (fp(e.raw) || e.list) { e.lineRefs[0] = lines.length; lines.push({ key: e.key, seg: 0 }); }
      } else if (child.name === 'w:tbl') {
        const table = model.tables[ti];
        table.rows.forEach((row, ri) => {
          rows.set(`${ti}:${ri}`, row);
          row.cells.forEach((cell, ci) => {
            const list = [];
            cell.paragraphs.forEach((node, k) => {
              const e = addParagraph(`c:${ti}:${ri}:${ci}:${k}`, node, { type: 'cell', tableIndex: ti, rowIndex: ri, columnIndex: ci, paragraphIndex: k }, true);
              e.segments.forEach((seg, s) => {
                list.push({ key: e.key, seg: s });
                if (fp(seg) || (s === 0 && e.list)) { e.lineRefs[s] = lines.length; lines.push({ key: e.key, seg: s }); }
              });
            });
            cells.set(`${ti}:${ri}:${ci}`, list);
          });
        });
        ti++;
      }
    }
    // Each of SyllabusBridge's lines must say what the Word file says there.
    const aligned = !parserLines || lines.length === parserLines.length;
    if (parserLines) lines.forEach((ref, i) => {
      const e = paragraphs.get(ref.key);
      ref.ok = aligned && sameLine(parserLines[i], e.segments[ref.seg], e.list && ref.seg === 0);
    });
    return { model, paragraphs, lines, cells, rows, aligned };
  }
  // SyllabusBridge shows a bullet or list number ("• ", "1. ") in front of a list
  // item. Word adds those when it displays the item; they are not in the text.
  function listPrefix(line, raw, list) {
    const a = fp(line), b = fp(raw);
    if (a === b) return '';
    if (!list || !a.endsWith(b) || a.length - b.length > 12) return null;
    return a.slice(0, a.length - b.length);
  }
  const sameLine = (line, raw, list) => listPrefix(line, raw, list) !== null;
  // Remove a list prefix (given as its characters without spaces) from a line.
  function stripPrefix(line, prefix) {
    if (!prefix) return line;
    let i = 0, k = 0;
    while (i < line.length && k < prefix.length) { if (/\s/.test(line[i])) { i++; continue; } if (line[i] !== prefix[k]) return null; i++; k++; }
    return k === prefix.length ? line.slice(i).trimStart() : null;
  }

  // Put an edited line back into the Word text it was read from. SyllabusBridge
  // tidies spacing (tabs and runs of spaces become one space); the Word text
  // keeps its own spacing everywhere outside the words that changed.
  function transplant(raw, oldLine, newLine, list) {
    const prefix = listPrefix(oldLine, raw, list);
    if (prefix === null) fail(NOT_MATCHED);
    const oldBody = clean(stripPrefix(oldLine, prefix) ?? '');
    let newBody = clean(newLine);
    if (prefix) { const s = stripPrefix(newBody, prefix); if (s !== null) newBody = clean(s); }
    if (oldBody === newBody) return raw;
    const lo = oldBody.length, ln = newBody.length;
    let a = 0, b = 0;
    while (a < lo && a < ln && oldBody[a] === newBody[a]) a++;
    while (b < lo - a && b < ln - a && oldBody[lo - 1 - b] === newBody[ln - 1 - b]) b++;
    const nonWs = [];
    for (let i = 0; i < raw.length; i++) if (!/\s/.test(raw[i])) nonWs.push(i);
    const count = s => fp(s).length;
    const k1 = count(oldBody.slice(0, a)), k2 = count(oldBody.slice(0, lo - b));
    // Start at the first changed character; if the change begins with a space,
    // start right after the last unchanged character (taking Word's spacing).
    let start = a < lo && !/\s/.test(oldBody[a]) ? nonWs[k1] : (k1 ? nonWs[k1 - 1] + 1 : 0);
    let end = k2 > k1 ? nonWs[k2 - 1] + 1 : start;
    if (lo - b > a && /\s/.test(oldBody[lo - b - 1])) while (end < raw.length && /\s/.test(raw[end])) end++;
    if (end < start) end = start;
    const out = raw.slice(0, start) + newBody.slice(a, ln - b) + raw.slice(end);
    if (fp(out) !== fp(newBody)) fail(NOT_MATCHED);
    return out;
  }

  // Line-by-line difference: which lines were kept, changed, removed, or added.
  // Returns [{ op:'replace'|'delete', i, text? } | { op:'insert', after, text }]
  // where i and after are positions in `before` (after = -1: before line 0).
  function lineDiff(before, after) {
    const A = before.map(clean), B = after.map(clean), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    const hunk = (dels, ins) => {
      const k = Math.min(dels.length, ins.length);
      for (let x = 0; x < k; x++) ops.push({ op: 'replace', i: dels[x], text: B[ins[x]] });
      for (let x = k; x < dels.length; x++) ops.push({ op: 'delete', i: dels[x] });
      const after = k ? dels[k - 1] : (dels.length ? dels[0] - 1 : i - 1);
      for (let x = k; x < ins.length; x++) ops.push({ op: 'insert', after, text: B[ins[x]] });
    };
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { i++; j++; continue; }
      const dels = [], ins = [];
      while ((i < n || j < m) && !(i < n && j < m && A[i] === B[j])) {
        if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) ins.push(j++);
        else dels.push(i++);
      }
      hunk(dels, ins);
    }
    return ops;
  }

  // ---- Planning: what each change does to which paragraph -------------------
  function planner(W, map, parserLines) {
    const work = new Map(), rowOps = new Map();
    let owner = '';
    const state = key => {
      if (!work.has(key)) {
        const e = map.paragraphs.get(key);
        work.set(key, {
          key, segs: e.segments.map((raw, s) => ({ orig: s, raw, line: e.lineRefs[s] != null ? parserLines[e.lineRefs[s]] : clean(raw), list: e.list && s === 0 })),
          deleted: false, before: [], after: [], keys: new Set(), structural: '', touched: false,
        });
      }
      return work.get(key);
    };
    const touch = (w, structural) => {
      if (w.structural && w.structural !== owner) fail('Another edit already changes this paragraph, so this one was not placed.');
      if (w.deleted) fail('Another edit removes this paragraph, so this one was not placed.');
      if (structural) w.structural = owner;
      w.keys.add(owner); w.touched = true;
    };
    const segOf = (w, orig) => { const s = w.segs.find(x => x.orig === orig); if (!s) fail('Another edit already changes this paragraph, so this one was not placed.'); return s; };
    const lineRef = i => { const r = map.lines[i]; if (!r || !r.ok) fail(NOT_MATCHED); return r; };
    const rowDeleted = (t, r) => rowOps.has(`del:${t}:${r}`);
    const inDeletedRow = key => { const m = key.match(/^c:(\d+):(\d+):/); return m && rowDeleted(+m[1], +m[2]); };
    function setSeg(key, orig, newLine) {
      if (inDeletedRow(key)) fail('This table row is being removed, so this edit was not placed.');
      const w = state(key); touch(w, false);
      const s = segOf(w, orig);
      s.raw = transplant(s.raw, s.line, newLine, s.list);
      s.line = clean(newLine);
    }
    function deleteSeg(key, orig) {
      const w = state(key), e = map.paragraphs.get(key);
      touch(w, true);
      if (w.segs.length > 1) { w.segs.splice(w.segs.indexOf(segOf(w, orig)), 1); return; }
      // A cell keeps at least one paragraph: empty it instead of removing it.
      if (e.inCell) {
        const m = key.match(/^c:(\d+):(\d+):(\d+):(\d+)$/), cellKeys = new Set(map.cells.get(`${m[1]}:${m[2]}:${m[3]}`).map(x => x.key));
        const left = [...cellKeys].filter(k => !(work.get(k)?.deleted));
        if (left.length === 1) { const s = segOf(w, orig); s.raw = ''; s.line = ''; return; }
      }
      w.deleted = true;
    }
    function insertNear(key, orig, text, where) {
      const w = state(key), e = map.paragraphs.get(key);
      touch(w, false);
      // In a cell line that uses line breaks, a new line is a new line break.
      // New lines go after any already added after the same line, in order.
      if (e.inCell && e.segments.length > 1) {
        touch(w, true);
        let at = w.segs.indexOf(segOf(w, orig));
        if (where === 'after') { at++; while (at < w.segs.length && w.segs[at].addedAfter === orig) at++; }
        w.segs.splice(at, 0, { orig: -1, raw: clean(text), line: clean(text), list: false, addedAfter: where === 'after' ? orig : undefined });
        return;
      }
      // A new list item copies the bullet when the new line starts with it.
      const prefix = e.list ? listPrefix(w.segs[0]?.line ?? '', e.segments[0], true) : '';
      let body = clean(text), keepList = !!e.list;
      if (e.list) { const s = prefix ? stripPrefix(body, prefix) : null; if (s !== null) body = clean(s); else keepList = false; }
      w[where].push({ text: body, keepList, key: owner });
    }

    const targets = {
      manual(t) { fail(t.reason || 'SyllabusBridge cannot place this kind of edit in the Word file yet.'); },
      substitute(t) {
        const from = clean(t.from), to = clean(t.to);
        if (!from) fail(NOT_MATCHED);
        const hits = [];
        for (const i of t.lines || []) {
          const ref = map.lines[i]; if (!ref) continue;
          const w = state(ref.key), s = w.segs.find(x => x.orig === ref.seg); if (!s) continue;
          const hay = dashes(s.line), needle = dashes(from);
          let at = hay.indexOf(needle);
          while (at >= 0) { hits.push({ i, at, line: s.line }); at = hay.indexOf(needle, at + 1); }
        }
        if (hits.length !== 1) fail(NOT_MATCHED);
        const { i, at, line } = hits[0];
        // Write only the words that differ, so unchanged characters (such as a
        // long dash the reader shows as "-") stay exactly as they are in Word.
        let a = 0, b = 0;
        while (a < from.length && a < to.length && from[a] === to[a]) a++;
        while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
        const updated = line.slice(0, at + a) + to.slice(a, to.length - b) + line.slice(at + from.length - b);
        const ref = lineRef(i);
        setSeg(ref.key, ref.seg, updated);
      },
      lines(t) {
        const before = (t.before || []).map(clean).filter(Boolean), after = (t.after || []).map(clean).filter(Boolean);
        // Find each line SyllabusBridge read, in order, from the section start.
        // A section's first line can be the text after its heading's colon
        // ("ACCESSIBILITY: text"); then only the text after the colon changes.
        const found = [];
        let cursor = Math.max(0, t.start || 0);
        for (const line of before) {
          let hit = -1, tail = false;
          for (let j = cursor; j < parserLines.length; j++) {
            const l = clean(parserLines[j]), colon = l.indexOf(':');
            if (l === line) { hit = j; break; }
            if (colon >= 0 && clean(l.slice(colon + 1)) === line) { hit = j; tail = true; break; }
          }
          if (hit < 0) fail(NOT_MATCHED);
          found.push({ index: hit, tail });
          cursor = hit + 1;
        }
        const full = (k, text) => {
          if (!found[k].tail) return text;
          const l = clean(parserLines[found[k].index]);
          return `${l.slice(0, l.indexOf(':') + 1)} ${text}`;
        };
        const ops = lineDiff(before, after);
        if (!before.length && ops.length) fail('SyllabusBridge did not read any text for this section from the Word file, so there is nowhere to place the new text. Add it in Word.');
        // Changed and removed lines last first, so positions in a line-break cell
        // stay valid; then new lines in order.
        for (const op of [...ops].reverse()) {
          if (op.op === 'replace') { const r = lineRef(found[op.i].index); setSeg(r.key, r.seg, full(op.i, op.text)); }
          else if (op.op === 'delete') {
            const r = lineRef(found[op.i].index);
            if (found[op.i].tail) setSeg(r.key, r.seg, full(op.i, ''));
            else deleteSeg(r.key, r.seg);
          }
        }
        for (const op of ops) {
          if (op.op !== 'insert') continue;
          if (op.after >= 0) { const r = lineRef(found[op.after].index); insertNear(r.key, r.seg, op.text, 'after'); }
          else {
            if (found[0].tail) fail('New text before a section heading cannot be placed safely. Add it in Word.');
            const r = lineRef(found[0].index); insertNear(r.key, r.seg, op.text, 'before');
          }
        }
      },
      cell(t) {
        const list = map.cells.get(`${t.tableIndex}:${t.rowIndex}:${t.columnIndex}`);
        if (!list) fail('This table cell is not in the Word file where SyllabusBridge read it.');
        if (rowDeleted(t.tableIndex, t.rowIndex)) fail('This table row is being removed, so this edit was not placed.');
        const before = (t.before || []).map(x => String(x ?? ''));
        if (before.length !== list.length || !list.every((ref, k) => { const e = map.paragraphs.get(ref.key); return sameLine(before[k], e.segments[ref.seg], e.list && ref.seg === 0); }))
          fail('This table cell in the Word file does not match what SyllabusBridge read, so the edit was not placed.');
        // Present the cell's lines as the "line" each segment was read as.
        for (const [k, ref] of list.entries()) { const w = state(ref.key), s = w.segs.find(x => x.orig === ref.seg); if (s && !w.touched) s.line = clean(before[k]); }
        const after = (t.after || []).map(x => String(x ?? ''));
        const ops = before.length === after.length
          ? before.map((b, i) => clean(b) === clean(after[i]) ? null : { op: 'replace', i, text: clean(after[i]) }).filter(Boolean)
          : lineDiff(before, after);
        for (const op of [...ops].reverse()) {
          if (op.op === 'replace') setSeg(list[op.i].key, list[op.i].seg, op.text);
          else if (op.op === 'delete') deleteSeg(list[op.i].key, list[op.i].seg);
        }
        for (const op of ops) {
          if (op.op !== 'insert') continue;
          if (op.after >= 0) insertNear(list[op.after].key, list[op.after].seg, op.text, 'after');
          else insertNear(list[0].key, list[0].seg, op.text, 'before');
        }
      },
      'cell-substitute'(t) {
        const list = map.cells.get(`${t.tableIndex}:${t.rowIndex}:${t.columnIndex}`);
        if (!list) fail('This table cell is not in the Word file where SyllabusBridge read it.');
        if (rowDeleted(t.tableIndex, t.rowIndex)) fail('This table row is being removed, so this edit was not placed.');
        const from = clean(t.from), to = clean(t.to);
        if (!from) fail(NOT_MATCHED);
        const hits = [];
        for (const ref of list) {
          const w = state(ref.key), s = w.segs.find(x => x.orig === ref.seg); if (!s) continue;
          const hay = dashes(s.line);
          for (let at = hay.indexOf(dashes(from)); at >= 0; at = hay.indexOf(dashes(from), at + 1)) hits.push({ ref, at, line: s.line });
        }
        if (hits.length !== 1) fail('SyllabusBridge could not find this value exactly once in its table cell in the Word file, so it was not placed.');
        const { ref, at, line } = hits[0];
        setSeg(ref.key, ref.seg, line.slice(0, at) + to + line.slice(at + from.length));
      },
      'new-section'(t) {
        const at = t.before ?? t.after, ref = lineRef(at), e = map.paragraphs.get(ref.key);
        if (e.inCell) fail('SyllabusBridge could not place this section without changing a table. Add the heading and text by hand in Word.');
        const format = i => { const r = map.lines[i]; const f = r && r.ok && map.paragraphs.get(r.key); return f && !f.inCell ? f.anchor : e.anchor; };
        const entries = [];
        if (t.heading) entries.push({ text: clean(t.heading), keepList: false, format: format(t.headingLike), key: owner });
        for (const line of t.lines || []) if (clean(line)) entries.push({ text: bulletText(line), keepList: false, format: format(t.bodyLike), key: owner });
        if (!entries.length) fail('This section is empty. Type its text in SyllabusBridge, or add it by hand in Word.');
        const w = state(ref.key); touch(w, false);
        w[t.before != null ? 'before' : 'after'].push(...entries);
      },
      'delete-row'(t) {
        const row = map.rows.get(`${t.tableIndex}:${t.rowIndex}`);
        if (!row) fail('This table row is not in the Word file where SyllabusBridge read it.');
        const id = `del:${t.tableIndex}:${t.rowIndex}`;
        if (rowOps.has(id)) { rowOps.get(id).keys.add(owner); return; }
        for (const k of work.keys()) if (k.startsWith(`c:${t.tableIndex}:${t.rowIndex}:`) && work.get(k).touched) fail('Another edit changes this table row, so it was not removed.');
        if (t.before) {
          // Each cell must hold what SyllabusBridge read (a list bullet may be shown in front).
          const same = row.cells.every((c, ci) => {
            const refs = map.cells.get(`${t.tableIndex}:${t.rowIndex}:${ci}`) || [], want = t.before[ci] || [];
            if (!want.length) return !refs.some(ref => fp(map.paragraphs.get(ref.key).segments[ref.seg]));
            return refs.length === want.length && refs.every((ref, k) => { const e = map.paragraphs.get(ref.key); return sameLine(want[k], e.segments[ref.seg], e.list && ref.seg === 0); });
          });
          if (!same) fail('This table row in the Word file does not match what SyllabusBridge read, so it was not removed.');
        }
        rowOps.set(id, { kind: 'delete-row', tableIndex: t.tableIndex, rowIndex: t.rowIndex, keys: new Set([owner]) });
      },
      'add-row'(t) {
        const id = `add:${t.tableIndex}:${t.id}`;
        if (rowOps.has(id)) { rowOps.get(id).keys.add(owner); return; }
        if (!map.rows.get(`${t.tableIndex}:${t.afterRowIndex}`)) fail('SyllabusBridge could not find where this row goes in the Word table, so it was not added.');
        rowOps.set(id, { kind: 'insert-row-after', tableIndex: t.tableIndex, rowIndex: t.afterRowIndex, order: t.order ?? 0, cells: (t.cells || []).map(x => String(x ?? '')), keys: new Set([owner]) });
      },
    };

    // Saved copies let a change that fails part way leave no trace.
    const snapshot = () => ({ work: new Map([...work].map(([k, w]) => [k, { ...w, segs: w.segs.map(s => ({ ...s })), before: [...w.before], after: [...w.after], keys: new Set(w.keys) }])), rows: new Map([...rowOps].map(([k, r]) => [k, { ...r, keys: new Set(r.keys) }])) });
    const restore = s => { work.clear(); for (const [k, v] of s.work) work.set(k, v); rowOps.clear(); for (const [k, v] of s.rows) rowOps.set(k, v); };
    return {
      place(change) {
        const saved = snapshot();
        owner = change.key;
        try {
          if (!change.targets?.length) fail('SyllabusBridge cannot place this kind of edit in the Word file yet.');
          for (const t of change.targets) {
            const handler = targets[t.type];
            if (!handler) fail('SyllabusBridge cannot place this kind of edit in the Word file yet.');
            handler(t);
          }
          return '';
        } catch (e) {
          restore(saved);
          if (e instanceof PlaceError) return e.message;
          throw e;
        }
      },
      // Writer edits, each tagged with the changes it carries.
      edits() {
        const out = [];
        for (const w of work.values()) {
          const e = map.paragraphs.get(w.key);
          if (!w.touched) continue;
          for (const ins of w.before) out.push({ anchor: e.anchor, action: 'insert-before', expectedText: e.raw, newText: ins.text, keepList: ins.keepList, formatAnchor: ins.format, keys: new Set([ins.key]) });
          if (w.deleted) out.push({ anchor: e.anchor, expectedText: e.raw, newText: null, keys: w.keys });
          else {
            const text = w.segs.map(s => s.raw).join('\n');
            if (text !== e.raw) out.push({ anchor: e.anchor, expectedText: e.raw, newText: text, keys: w.keys });
          }
          for (const ins of w.after) out.push({ anchor: e.anchor, action: 'insert-after', expectedText: e.raw, newText: ins.text, keepList: ins.keepList, formatAnchor: ins.format, keys: new Set([ins.key]) });
        }
        const rows = [...rowOps.values()].sort((a, b) => a.tableIndex - b.tableIndex || a.rowIndex - b.rowIndex || (a.order ?? 0) - (b.order ?? 0));
        for (const r of rows) {
          const anchor = { type: 'row', tableIndex: r.tableIndex, rowIndex: r.rowIndex };
          const row = W.locateRow(map.model, anchor);
          out.push(r.kind === 'delete-row'
            ? { anchor, action: 'delete-row', expectedText: W.rowText(map.xml, row), keys: r.keys }
            : { anchor, action: 'insert-row-after', cells: r.cells, keys: r.keys });
        }
        return out;
      },
    };
  }

  // Plan and write. Returns { xml, placed:[change], unplaced:[{change, reason}],
  // skipped:[change] } where skipped are reading corrections.
  function exportXml(W, xml, input, opts = {}) {
    const map = sourceMap(W, xml, input.lines);
    map.xml = xml;
    const changes = input.changes || [];
    const skipped = changes.filter(c => c.kind === 'reading-correction');
    const wanted = changes.filter(c => c.kind !== 'reading-correction');
    const unplaced = new Map();
    let result = null;
    // Writing can still refuse an edit (for example a paragraph with a link).
    // Every change in a refused edit is then listed, and the rest is planned
    // again without it, so no change is ever half written.
    for (let round = 0; round <= wanted.length; round++) {
      const plan = planner(W, map, input.lines || []);
      for (const c of wanted) {
        if (unplaced.has(c.key)) continue;
        const why = plan.place(c);
        if (why) unplaced.set(c.key, why);
      }
      const edits = plan.edits();
      result = W.applyEdits(xml, edits, { tracked: opts.tracked !== false, author: opts.author || 'SyllabusBridge', date: opts.date });
      if (!result.refused.length) break;
      for (const r of result.refused) for (const k of r.edit.keys) if (!unplaced.has(k)) unplaced.set(k, r.reason);
    }
    const placed = wanted.filter(c => !unplaced.has(c.key));
    return { xml: placed.length ? result.xml : xml, placed, unplaced: wanted.filter(c => unplaced.has(c.key)).map(change => ({ change, reason: unplaced.get(change.key) })), skipped, aligned: map.aligned };
  }

  // Open the original .docx (bytes), write the syllabus edits as tracked changes,
  // and return the new file's bytes. Only word/document.xml can change.
  async function exportDocx(JSZip, W, bytes, input, opts = {}) {
    const zip = await JSZip.loadAsync(bytes);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('This Word file does not contain a readable document body.');
    const xml = await entry.async('string');
    const out = exportXml(W, xml, input, opts);
    if (out.placed.length) zip.file('word/document.xml', out.xml);
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { ...out, bytes: data };
  }

  root.SyllabusDocxExport = { sourceMap, transplant, lineDiff, exportXml, exportDocx };
})(typeof globalThis !== 'undefined' ? globalThis : this);
