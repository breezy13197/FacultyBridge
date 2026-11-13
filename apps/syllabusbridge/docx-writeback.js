'use strict';
// SyllabusBridge Word writer (v2.5 "Export edited Word syllabus").
//
// Began as the v2.2 round-trip prototype (docs/SYLLABUSBRIDGE-ROUNDTRIP.md).
// Since v2.5 the page loads it: docx-export.js turns the editor's syllabus edits
// into the edits below, and this file writes them into a copy of the Word file.
//
// Approach: edits are spliced into the original word/document.xml text. Only
// the edited paragraph's characters change; every other byte of the file is
// left exactly as Word wrote it. The whole document is never re-serialized,
// because browser XML serializers rewrite namespaces, quoting, and empty tags.
//
// Locations ("anchors") use the same counting as SyllabusBridge's parser:
//   cell:      { type:'cell', tableIndex, rowIndex, columnIndex, paragraphIndex }
//              tableIndex = position among tables that are direct children of
//              <w:body>; rowIndex = position among the table's <w:tr> (0 = first
//              row, usually the header); columnIndex = position among the row's
//              <w:tc>; paragraphIndex = position among the cell's <w:p> (default 0).
//   paragraph: { type:'paragraph', paragraphIndex }
//              position among paragraphs that are direct children of <w:body>,
//              counting blank paragraphs (the parser's line list skips them).
//   row:       { type:'row', tableIndex, rowIndex }  (v2.5 row edits)
// Every text edit also carries expectedText, the text originally read at that spot.
// If the file no longer says that, the edit is refused instead of guessed.
//
// Kinds of edit (edit.action):
//   'replace' (default)  newText replaces the paragraph's text; null deletes it.
//   'insert-after' / 'insert-before'  a new paragraph with newText, next to the
//        anchor paragraph and formatted like it (or like formatAnchor, another
//        paragraph, when given). keepList:false drops the bullet or numbering.
//   'delete-row'         removes the table row at a row anchor (expectedText is
//        the row's text).
//   'insert-row-after'   adds a row after the row anchor, formatted like it;
//        cells: one string per cell ("\n" starts a new line in the cell).
(function (root) {
  const W = 'w:';
  const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>';
    if (k === 'quot') return '"'; if (k === 'apos') return "'";
    return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
  const encode = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const encodeAttr = s => encode(s).replace(/"/g, '&quot;');

  // Minimal XML tree that remembers where each element starts and ends in the
  // original text. Word's document.xml has no DTD or CDATA, so this is enough.
  // Position just after the next `marker`; a missing marker means the file is
  // cut off or damaged, which must be an error (never a loop back to the start).
  function skipPast(xml, marker, from) {
    const at = xml.indexOf(marker, from);
    if (at < 0) throw new Error('Word document XML is cut off or damaged.');
    return at + marker.length;
  }
  function parseTree(xml) {
    const rootNode = { name: '#root', start: 0, end: xml.length, children: [], parent: null };
    let cur = rootNode, i = 0;
    while (i < xml.length) {
      const lt = xml.indexOf('<', i);
      if (lt < 0) break;
      if (xml.startsWith('<?', lt)) { i = skipPast(xml, '?>', lt); continue; }
      if (xml.startsWith('<!--', lt)) { i = skipPast(xml, '-->', lt); continue; }
      if (xml.startsWith('<![CDATA[', lt)) { i = skipPast(xml, ']]>', lt); continue; }
      let gt = lt + 1, quote = '';
      for (; gt < xml.length; gt++) {
        const c = xml[gt];
        if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break;
      }
      if (gt >= xml.length) throw new Error('Word document XML ends inside a tag.');
      if (xml[lt + 1] === '/') {
        const name = xml.slice(lt + 2, gt).trim();
        if (cur.name !== name) throw new Error(`Word document XML is not well formed near </${name}>.`);
        cur.innerEnd = lt; cur.end = gt + 1; cur = cur.parent;
      } else {
        const selfClosing = xml[gt - 1] === '/';
        const tag = xml.slice(lt + 1, selfClosing ? gt - 1 : gt);
        const name = tag.match(/^[^\s/>]+/)[0];
        const node = { name, start: lt, openEnd: gt + 1, innerStart: gt + 1, children: [], parent: cur, attrs: tag.slice(name.length) };
        cur.children.push(node);
        if (selfClosing) { node.innerEnd = node.innerStart; node.end = gt + 1; } else cur = node;
      }
      i = gt + 1;
    }
    if (cur !== rootNode) throw new Error(`Word document XML ends before </${cur.name}>.`);
    return rootNode;
  }
  const kids = (n, name) => n.children.filter(c => c.name === name);
  const find = (n, name) => n.children.find(c => c.name === name);
  const descendants = (n, out = []) => { for (const c of n.children) { out.push(c); descendants(c, out); } return out; };
  const raw = (xml, n) => xml.slice(n.start, n.end);
  const inner = (xml, n) => xml.slice(n.innerStart, n.innerEnd);

  // Visible text of a paragraph, as SyllabusBridge reads it: <w:t> text, with
  // <w:br>/<w:cr> as line breaks and <w:tab> as a tab. Deleted text is skipped.
  function paragraphText(xml, p) {
    let out = '';
    const walk = n => {
      for (const c of n.children) {
        if (c.name === W + 't') out += decode(inner(xml, c));
        else if (c.name === W + 'br' || c.name === W + 'cr') out += '\n';
        else if (c.name === W + 'tab' && n.name === W + 'r') out += '\t';
        else if (c.name === W + 'del' || c.name === W + 'pPr' || c.name === W + 'rPr') continue;
        else walk(c);
      }
    };
    walk(p);
    return out;
  }

  function documentModel(xml) {
    const tree = parseTree(xml);
    const doc = tree.children.find(n => n.name === W + 'document');
    const body = doc && find(doc, W + 'body');
    if (!body) throw new Error('This Word file does not contain a readable document body.');
    const paragraphs = kids(body, W + 'p');
    const tables = kids(body, W + 'tbl').map(tbl => ({
      node: tbl,
      rows: kids(tbl, W + 'tr').map(tr => ({ node: tr, cells: kids(tr, W + 'tc').map(tc => ({ node: tc, paragraphs: kids(tc, W + 'p') })) })),
    }));
    return { tree, body, paragraphs, tables };
  }

  function locateRow(model, anchor) {
    return anchor?.type === 'row' ? model.tables[anchor.tableIndex]?.rows[anchor.rowIndex] || null : null;
  }
  function locate(model, anchor) {
    if (anchor?.type === 'paragraph') return model.paragraphs[anchor.paragraphIndex] || null;
    if (anchor?.type === 'cell') {
      const cell = model.tables[anchor.tableIndex]?.rows[anchor.rowIndex]?.cells[anchor.columnIndex];
      return cell?.paragraphs[anchor.paragraphIndex ?? 0] || null;
    }
    return null;
  }

  // Things inside a paragraph that a plain text replacement would break.
  // These edits are reported as "could not place" so faculty make them by hand.
  const UNSAFE = new Map([
    ['w:fldChar', 'contains a Word field (for example a page number or cross-reference)'],
    ['w:fldSimple', 'contains a Word field (for example a page number or cross-reference)'],
    ['w:instrText', 'contains a Word field (for example a page number or cross-reference)'],
    ['w:hyperlink', 'contains a link'],
    ['w:drawing', 'contains a picture or shape'],
    ['w:pict', 'contains a picture or shape'],
    ['w:object', 'contains an embedded object'],
    ['w:footnoteReference', 'contains a footnote'],
    ['w:endnoteReference', 'contains an endnote'],
    ['w:commentReference', 'contains a Word comment'],
    ['w:ins', 'already has unaccepted tracked changes'],
    ['w:del', 'already has unaccepted tracked changes'],
    ['w:moveFrom', 'already has unaccepted tracked changes'],
    ['w:moveTo', 'already has unaccepted tracked changes'],
    ['w:sdt', 'contains a content control'],
    ['w:smartTag', 'contains a smart tag'],
    ['w:customXml', 'contains custom XML markup'],
  ]);
  // True when the paragraph holds the start or end of a comment, bookmark, or
  // other marked range whose other end is in a different paragraph.
  function splitRange(p) {
    const ends = new Map;
    for (const n of descendants(p)) {
      const m = n.name.match(/^w:(.+?)(RangeStart|RangeEnd|Start|End)$/);
      if (!m || !/^(comment|bookmark|perm|moveFrom|moveTo|customXmlInsRange|customXmlDelRange)/.test(m[1])) continue;
      const id = (n.attrs.match(/\bw:id="([^"]*)"/) || [])[1] ?? '';
      const key = `${m[1]}:${id}`, side = /Start$/.test(m[2]) ? 1 : 2;
      ends.set(key, (ends.get(key) || 0) | side);
    }
    return [...ends.values()].some(v => v !== 3);
  }
  function unsafeReason(p) {
    for (const n of descendants(p)) if (UNSAFE.has(n.name)) return UNSAFE.get(n.name);
    return '';
  }

  // A paragraph broken into "atoms": one per character of text, tab, or line
  // break, each remembering which run (and so which formatting) it came from.
  const RUN_OK = new Set(['w:rPr', 'w:t', 'w:tab', 'w:br', 'w:cr', 'w:lastRenderedPageBreak']);
  function paragraphAtoms(xml, p) {
    const runs = kids(p, W + 'r'), atoms = [];
    for (const run of runs) {
      const rPr = find(run, W + 'rPr');
      run.rPrXml = rPr ? raw(xml, rPr) : '';
      run.atoms = [];
      for (const c of run.children) {
        if (!RUN_OK.has(c.name)) return { unsafe: 'contains a symbol or special character Word stores separately' };
        if (c.name === W + 't') for (const ch of decode(inner(xml, c))) run.atoms.push({ run, kind: 't', text: ch });
        else if (c.name === W + 'tab') run.atoms.push({ run, kind: 'tab', text: '\t', raw: raw(xml, c) });
        else if (c.name === W + 'br' || c.name === W + 'cr') run.atoms.push({ run, kind: 'br', text: '\n', raw: raw(xml, c) });
      }
      for (const a of run.atoms) { a.pos = atoms.length; atoms.push(a); }
    }
    return { runs, atoms, text: atoms.map(a => a.text).join('') };
  }
  // New text as run content: line breaks become <w:br/>, tabs become <w:tab/>.
  function textContent(text, tag = 'w:t') {
    const parts = [];
    String(text).split('\n').forEach((line, li) => {
      if (li) parts.push('<w:br/>');
      line.split('\t').forEach((piece, ti) => {
        if (ti) parts.push('<w:tab/>');
        if (piece) parts.push(`<${tag} xml:space="preserve">${encode(piece)}</${tag}>`);
      });
    });
    return parts.join('');
  }
  // Kept or deleted atoms written back as run content.
  function atomContent(atoms, deleted) {
    let out = '', buf = '';
    const tag = deleted ? 'w:delText' : 'w:t';
    const flush = () => { if (buf) out += `<${tag} xml:space="preserve">${encode(buf)}</${tag}>`; buf = ''; };
    for (const a of atoms) { if (a.kind === 't') buf += a.text; else { flush(); out += a.raw; } }
    flush();
    return out;
  }

  // Rewrite one paragraph, changing only the characters that differ.
  // Unchanged runs before and after the change are kept byte-for-byte, so a bold
  // label such as "COURSE DESCRIPTION:" keeps its formatting when the text after
  // it changes. New text takes the formatting of the first changed character.
  // Paragraph properties (style, bullets/numbering, indentation) and bookmarks
  // are never touched. newText === null deletes the whole paragraph.
  // markIns: also record the paragraph mark as inserted (a new paragraph follows; see applyEdits).
  function rewriteParagraph(xml, p, parts, newText, opts, nextId, markIns = false) {
    // Positions are counted in whole characters, one per atom. A JavaScript
    // string counts some characters (emoji, rare symbols) as two units, which
    // would shift every position after them.
    const { runs, atoms } = parts;
    const text = atoms.map(at => at.text);
    const stamp = () => `w:id="${nextId()}" w:author="${encodeAttr(opts.author)}" w:date="${encodeAttr(opts.date)}"`;
    const remove = newText === null;
    const target = remove ? [] : Array.from(String(newText));
    if (!remove && text.join('') === target.join('')) return null; // nothing changed
    let a = 0, b = 0;
    if (!remove) {
      while (a < text.length && a < target.length && text[a] === target[a]) a++;
      while (b < text.length - a && b < target.length - a && text[text.length - 1 - b] === target[target.length - 1 - b]) b++;
      // Widen the change to whole words, so a reviewer sees "2.6 → 2.7" rather
      // than "2.(6 → 7)".
      // Only widen when the change actually splits a word.
      const word = c => c !== undefined && !/\s/.test(c);
      if (word(text[a - 1]) && (word(text[a]) || word(target[a]))) while (a > 0 && word(text[a - 1])) a--;
      const tb = target.length - b;
      if (word(text[text.length - b]) && (word(text[text.length - b - 1]) || word(target[tb - 1]))) while (b > 0 && word(text[text.length - b])) b--;
    }
    const delEnd = text.length - b, inserted = target.slice(a, target.length - b).join('');
    const fmt = (atoms[a] || atoms[a - 1] || runs[0])?.run?.rPrXml ?? runs[0]?.rPrXml ?? '';
    let placed = !inserted;
    const place = () => {
      if (placed) return '';
      placed = true;
      const run = `<w:r>${fmt}${textContent(inserted)}</w:r>`;
      return opts.tracked ? `<w:ins ${stamp()}>${run}</w:ins>` : run;
    };
    const isDeleted = at => at.pos >= a && at.pos < delEnd;
    // Rebuild only the runs that hold changed characters.
    const renderRun = run => {
      if (!run.atoms.some(isDeleted) && !(!placed && run.atoms.length && run.atoms[0].pos < delEnd && run.atoms.at(-1).pos >= delEnd)) {
        return raw(xml, run);
      }
      const open = xml.slice(run.start, run.openEnd).replace(/\/>$/, '>');
      let out = '', group = [], groupDeleted = null;
      const flush = () => {
        if (!group.length) return;
        const body = `${open}${run.rPrXml}${atomContent(group, groupDeleted && opts.tracked)}</w:r>`;
        if (!groupDeleted) out += body;
        else if (opts.tracked) out += `<w:del ${stamp()}>${body}</w:del>`;
        group = [];
      };
      for (const at of run.atoms) {
        if (at.pos === delEnd && !placed) { flush(); out += place(); }
        const d = isDeleted(at);
        if (d !== groupDeleted) { flush(); groupDeleted = d; }
        group.push(at);
      }
      flush();
      return out;
    };
    let body = '';
    const pPr = find(p, W + 'pPr');
    for (const c of p.children) {
      if (c === pPr) continue;
      if (c.name === W + 'r') {
        if (c.atoms.length && c.atoms[0].pos >= delEnd) body += place();
        body += renderRun(c);
        // New text that goes right after this run's last character.
        if (c.atoms.length && c.atoms.at(-1).pos === delEnd - 1) body += place();
      } else body += raw(xml, c);
    }
    body += place(); // paragraph had no text at all
    let pPrXml = pPr ? raw(xml, pPr) : '';
    if (remove) {
      if (!opts.tracked) return '';
      // Also mark the paragraph mark deleted, so accepting removes the empty line.
      const mark = `<w:del ${stamp()}/>`;
      const pRPr = pPr && find(pPr, W + 'rPr');
      if (!pPr) pPrXml = `<w:pPr><w:rPr>${mark}</w:rPr></w:pPr>`;
      else if (pRPr && raw(xml, pRPr).endsWith('/>')) pPrXml = xml.slice(pPr.start, pRPr.start) + `<w:rPr>${mark}</w:rPr>` + xml.slice(pRPr.end, pPr.end);
      else if (pRPr) pPrXml = xml.slice(pPr.start, pRPr.openEnd) + mark + xml.slice(pRPr.openEnd, pPr.end);
      else if (raw(xml, pPr).endsWith('/>')) pPrXml = `<w:pPr><w:rPr>${mark}</w:rPr></w:pPr>`;
      else {
        // <w:rPr> goes after everything in <w:pPr> except sectPr/pPrChange.
        const after = pPr.children.find(c => c.name === W + 'sectPr' || c.name === W + 'pPrChange');
        const at = after ? after.start : pPr.innerEnd;
        pPrXml = xml.slice(pPr.start, at) + `<w:rPr>${mark}</w:rPr>` + xml.slice(at, pPr.end);
      }
    }
    if (markIns && !remove) pPrXml = pPrWithMark(pPrXml, `<w:ins ${stamp()}/>`);
    const open = xml.slice(p.start, p.openEnd).replace(/\/>$/, '>');
    return `${open}${pPrXml}${body}</w:p>`;
  }

  // Properties copied from existing content for new content. Tracked-change
  // records, page-layout sections, and earlier formatting changes are left out:
  // they belong to the original, not to the copy.
  const copyProps = x => String(x || '')
    .replace(/<w:(pPrChange|rPrChange|tcPrChange|trPrChange|sectPr)\b[^>]*\/>/g, '')
    .replace(/<w:(pPrChange|rPrChange|tcPrChange|trPrChange|sectPr)\b[\s\S]*?<\/w:\1>/g, '')
    .replace(/<w:(ins|del|moveFrom|moveTo|cellIns|cellDel|cellMerge)\b[^>]*\/>/g, '');
  // Paragraph properties with the paragraph mark recorded as a tracked change.
  // In the paragraph mark's <w:rPr>, <w:ins>/<w:del> come first.
  function pPrWithMark(pPrXml, mark) {
    if (!mark) return pPrXml;
    if (!pPrXml || /^<w:pPr\s*\/>$/.test(pPrXml)) return `<w:pPr><w:rPr>${mark}</w:rPr></w:pPr>`;
    if (/<w:rPr\s*\/>/.test(pPrXml)) return pPrXml.replace(/<w:rPr\s*\/>/, `<w:rPr>${mark}</w:rPr>`);
    if (/<w:rPr>/.test(pPrXml)) return pPrXml.replace(/<w:rPr>/, `<w:rPr>${mark}`);
    if (/<w:rPr\s[^>]*>/.test(pPrXml)) return pPrXml.replace(/(<w:rPr\s[^>]*>)/, `$1${mark}`);
    // <w:rPr> goes before <w:sectPr> and <w:pPrChange>, if the paragraph has them.
    const at = pPrXml.search(/<w:(sectPr|pPrChange)\b/);
    return at >= 0 ? pPrXml.slice(0, at) + `<w:rPr>${mark}</w:rPr>` + pPrXml.slice(at) : pPrXml.replace(/<\/w:pPr>$/, `<w:rPr>${mark}</w:rPr></w:pPr>`);
  }
  // A new paragraph formatted like `model` (an existing paragraph node).
  // markOwn (tracked mode): record this paragraph's own mark as inserted.
  function newParagraph(xml, model, text, opts, nextId, { keepList = true, runFrom = 'first', markOwn = true } = {}) {
    const stamp = () => `w:id="${nextId()}" w:author="${encodeAttr(opts.author)}" w:date="${encodeAttr(opts.date)}"`;
    const pPr = model && find(model, W + 'pPr');
    let pPrXml = copyProps(pPr ? raw(xml, pPr) : '');
    if (!keepList) pPrXml = pPrXml.replace(/<w:numPr\b[\s\S]*?<\/w:numPr>|<w:numPr\b[^>]*\/>/g, '');
    if (/^<w:pPr>\s*<\/w:pPr>$/.test(pPrXml)) pPrXml = '';
    const runs = model ? kids(model, W + 'r').filter(r => r.children.some(c => c.name === W + 't')) : [];
    const run = runFrom === 'last' ? runs.at(-1) : runs[0];
    const rPr = run && find(run, W + 'rPr');
    const rPrXml = copyProps(rPr ? raw(xml, rPr) : '');
    const content = String(text ?? '') === '' ? '' : `<w:r>${rPrXml}${textContent(text)}</w:r>`;
    const body = content && opts.tracked ? `<w:ins ${stamp()}>${content}</w:ins>` : content;
    return `<w:p>${opts.tracked && markOwn ? pPrWithMark(pPrXml, `<w:ins ${stamp()}/>`) : pPrXml}${body}</w:p>`;
  }
  // Row properties with the row recorded as inserted or deleted.
  function trWithMark(xml, tr, mark) {
    const trPr = find(tr, W + 'trPr');
    if (!trPr) {
      const ex = find(tr, W + 'tblPrEx');
      const at = ex ? ex.end : tr.openEnd;
      return { at, end: at, text: `<w:trPr>${mark}</w:trPr>` };
    }
    if (trPr.innerEnd === trPr.innerStart && raw(xml, trPr).endsWith('/>')) return { at: trPr.start, end: trPr.end, text: `<w:trPr>${mark}</w:trPr>` };
    const change = find(trPr, W + 'trPrChange');
    const at = change ? change.start : trPr.innerEnd;
    return { at, end: at, text: mark };
  }
  // Apply replacements [{at, end, text}] to the span [start, end) of xml.
  function spliceSpan(xml, start, end, reps) {
    let out = xml.slice(start, end);
    for (const r of [...reps].sort((a, b) => b.at - a.at || b.end - a.end)) out = out.slice(0, r.at - start) + r.text + out.slice(r.end - start);
    return out;
  }
  function rowText(xml, row) {
    return row.cells.map(c => c.paragraphs.map(p => paragraphText(xml, p)).join('\n')).join('\n');
  }

  // Text fingerprint used to confirm an edit still points at the right place.
  // Spacing is ignored because SyllabusBridge's reader drops tabs and collapses
  // spaces; everything else (letters, digits, punctuation) must match.
  const fingerprint = s => String(s ?? '').replace(/\s+/g, '');

  // Apply edits to word/document.xml text.
  // edits: [{ id?, anchor, action?, expectedText, newText, keepList?, cells? }]
  //        (see "Kinds of edit" at the top). expectedText is the text as stored
  //        in Word, without automatic bullet or list numbers.
  // opts:  { tracked: boolean, author, date }
  // Returns { xml, applied, unchanged, refused: [{ edit, reason }] }.
  function applyEdits(xml, edits, opts = {}) {
    const options = { tracked: !!opts.tracked, author: opts.author || 'SyllabusBridge', date: opts.date || new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
    const model = documentModel(xml);
    const applied = [], unchanged = [], refused = [], splices = [], seen = new Set();
    const refuse = (edit, reason) => refused.push({ edit, reason });
    let maxId = 0;
    for (const m of xml.matchAll(/\sw:id="(-?\d+)"/g)) maxId = Math.max(maxId, +m[1]);
    const nextId = () => ++maxId;
    // Two edits may not change the same part of the file. New paragraphs and
    // rows go between existing ones, so they only clash with a change that
    // replaces the content around them.
    const clash = (start, end) => splices.some(s => (end > start && s.end > s.start) ? start < s.end && s.start < end
      : end === start ? s.start < start && start < s.end : s.start > start && s.start < end);
    const add = (edit, start, end, render, extra = {}) => {
      if (clash(start, end)) { refuse(edit, 'Another edit already changes this part of the Word file (for example, its table row is being removed).'); return null; }
      const s = { start, end, edit, render, order: splices.length, ...extra };
      splices.push(s);
      return s;
    };
    for (const edit of edits) {
      const action = edit.action || 'replace';
      if (action === 'delete-row' || action === 'insert-row-after') {
        const row = locateRow(model, edit.anchor);
        if (!row) { refuse(edit, 'The table row no longer exists in this Word file.'); continue; }
        const trPr = find(row.node, W + 'trPr');
        if (trPr && descendants(trPr).some(n => /^w:(ins|del)$/.test(n.name))) { refuse(edit, 'This table row already has unaccepted tracked changes, so the edit must be made by hand in Word.'); continue; }
        if (row.node.children.some(c => c.name !== W + 'tc' && c.name !== W + 'trPr' && c.name !== W + 'tblPrEx')) { refuse(edit, 'This table row contains a content control or other special markup, so the edit must be made by hand in Word.'); continue; }
        if (action === 'delete-row') {
          if (fingerprint(rowText(xml, row)) !== fingerprint(edit.expectedText)) { refuse(edit, 'The text in this table row is not what SyllabusBridge originally read, so the row was not removed.'); continue; }
          const table = model.tables[edit.anchor.tableIndex];
          if (table.rows.length < 2) { refuse(edit, 'Word requires a table to keep at least one row; delete the whole table in Word instead.'); continue; }
          let why = '';
          for (const c of row.cells) for (const p of c.paragraphs) why = why || unsafeReason(p) || paragraphAtoms(xml, p).unsafe || '';
          if (why) { refuse(edit, `This table row ${why}, so it must be removed by hand in Word.`); continue; }
          if (row.cells.some(c => descendants(c.node).some(n => n.name === W + 'tbl'))) { refuse(edit, 'This table row holds another table, so it must be removed by hand in Word.'); continue; }
          add(edit, row.node.start, row.node.end, () => {
            if (!options.tracked) return '';
            // Like Word: the row, its text, and each paragraph mark in it are marked deleted.
            const reps = [];
            for (const c of row.cells) for (const p of c.paragraphs) reps.push({ at: p.start, end: p.end, text: rewriteParagraph(xml, p, paragraphAtoms(xml, p), null, options, nextId) });
            const m = trWithMark(xml, row.node, `<w:del w:id="${nextId()}" w:author="${encodeAttr(options.author)}" w:date="${encodeAttr(options.date)}"/>`);
            reps.push(m);
            return spliceSpan(xml, row.node.start, row.node.end, reps);
          });
        } else {
          const cells = (edit.cells || []).map(x => String(x ?? ''));
          if (cells.length > row.cells.length) { refuse(edit, 'The new row has more columns than the table row it would copy, so it must be added by hand in Word.'); continue; }
          if (row.cells.some(c => { const tcPr = find(c.node, W + 'tcPr'); return tcPr && descendants(tcPr).some(n => n.name === W + 'vMerge'); })) { refuse(edit, 'The table row next to it has merged cells, so the new row must be added by hand in Word.'); continue; }
          add(edit, row.node.end, row.node.end, () => {
            const stamp = () => `w:id="${nextId()}" w:author="${encodeAttr(options.author)}" w:date="${encodeAttr(options.date)}"`;
            const ex = find(row.node, W + 'tblPrEx'), trPr = find(row.node, W + 'trPr');
            let trPrXml = copyProps(trPr ? raw(xml, trPr) : '');
            if (/^<w:trPr\s*\/>$|^<w:trPr>\s*<\/w:trPr>$/.test(trPrXml)) trPrXml = '';
            if (options.tracked) trPrXml = trPrXml ? trPrXml.replace(/<\/w:trPr>$/, `<w:ins ${stamp()}/></w:trPr>`) : `<w:trPr><w:ins ${stamp()}/></w:trPr>`;
            const tcs = row.cells.map((c, i) => {
              const tcPr = find(c.node, W + 'tcPr');
              const lines = String(cells[i] ?? '').split('\n');
              const model0 = c.paragraphs[0];
              const ps = lines.map(line => newParagraph(xml, model0, line, options, nextId, { keepList: false }));
              return `<w:tc>${copyProps(tcPr ? raw(xml, tcPr) : '')}${ps.join('')}</w:tc>`;
            });
            return `<w:tr>${ex ? raw(xml, ex) : ''}${trPrXml}${tcs.join('')}</w:tr>`;
          });
        }
        continue;
      }
      const p = locate(model, edit.anchor);
      if (!p) { refuse(edit, 'The location no longer exists in this Word file.'); continue; }
      if (fingerprint(paragraphText(xml, p)) !== fingerprint(edit.expectedText)) {
        refuse(edit, 'The text at this location is not what SyllabusBridge originally read, so the edit was not placed.');
        continue;
      }
      if (action === 'insert-after' || action === 'insert-before') {
        const at = action === 'insert-after' ? p.end : p.start;
        const like = (edit.formatAnchor && locate(model, edit.formatAnchor)) || p;
        const s = add(edit, at, at, () => newParagraph(xml, like, edit.newText, options, nextId, { keepList: edit.keepList !== false, runFrom: like !== p || action === 'insert-before' ? 'first' : 'last', markOwn: s.markOwn !== false }), { after: action === 'insert-after' ? p : null });
        continue;
      }
      if (seen.has(p.start)) { refuse(edit, 'Another edit already changes this paragraph.'); continue; }
      const why = unsafeReason(p);
      if (why) { refuse(edit, `This paragraph ${why}, so the edit must be made by hand in Word.`); continue; }
      const parts = paragraphAtoms(xml, p);
      if (parts.unsafe) { refuse(edit, `This paragraph ${parts.unsafe}, so the edit must be made by hand in Word.`); continue; }
      if (edit.newText === null && !options.tracked && splitRange(p)) {
        refuse(edit, 'This paragraph holds one end of a Word comment or bookmark that continues into another paragraph, so deleting it would break that comment or bookmark. Delete its text instead.');
        continue;
      }
      if (edit.newText === null) {
        const pPr = find(p, W + 'pPr');
        if (pPr && find(pPr, W + 'sectPr')) { refuse(edit, 'This paragraph ends a page layout section; delete its text instead.'); continue; }
        const owner = edit.anchor.type === 'cell'
          ? model.tables[edit.anchor.tableIndex].rows[edit.anchor.rowIndex].cells[edit.anchor.columnIndex].paragraphs
          : model.paragraphs;
        if (owner.length < 2 || (edit.anchor.type === 'cell' && owner.at(-1) === p) || (edit.anchor.type === 'paragraph' && p === model.body.children.filter(c => c.name !== W + 'sectPr').at(-1))) {
          refuse(edit, 'Word requires this paragraph to stay (it is the last one in its cell or document); delete its text instead.');
          continue;
        }
      }
      const s = add(edit, p.start, p.end, () => rewriteParagraph(xml, p, parts, edit.newText, options, nextId, !!s.markIns), { replaces: p });
      if (s) seen.add(p.start);
    }
    // New paragraphs after an existing one, recorded the way Word records pressing
    // Enter at the end of it and typing: the existing paragraph's mark and each new
    // one's except the last are "inserted". Rejecting them in Word then gives back
    // exactly the original paragraph (otherwise some programs join it to the next).
    // A paragraph that is itself being deleted, or whose mark already carries a
    // tracked change, keeps the simpler form: each new paragraph's own mark.
    if (options.tracked) {
      const groups = new Map();
      for (const s of splices) if (s.after) { if (!groups.has(s.after)) groups.set(s.after, []); groups.get(s.after).push(s); }
      for (const [p, group] of groups) {
        const replace = splices.find(s => s.replaces === p);
        const pPr = find(p, W + 'pPr'), pRPr = pPr && find(pPr, W + 'rPr');
        if (replace?.edit.newText === null || (pRPr && descendants(pRPr).some(n => /^w:(ins|del|moveFrom|moveTo)$/.test(n.name)))) continue;
        group.forEach((s, i) => { s.markOwn = i < group.length - 1; });
        if (replace) replace.markIns = true;
        else splices.push({ start: p.start, end: p.end, edit: group[0].edit, order: splices.length, mark: true, render: () => {
          const stamp = `<w:ins w:id="${nextId()}" w:author="${encodeAttr(options.author)}" w:date="${encodeAttr(options.date)}"/>`;
          const open = xml.slice(p.start, p.openEnd).replace(/\/>$/, '>');
          return `${open}${pPrWithMark(pPr ? raw(xml, pPr) : '', stamp)}${p.children.filter(c => c !== pPr).map(c => raw(xml, c)).join('')}</w:p>`;
        } });
      }
    }
    // Render in document order (so tracked-change ids read in order), then
    // splice from the end of the file backwards so earlier positions stay valid.
    // At one position: content being replaced goes first, then new paragraphs or
    // rows, so the first one asked for comes first in the file.
    splices.sort((a, b) => a.start - b.start || a.order - b.order);
    for (const s of splices) s.out = s.render();
    let out = xml;
    const backwards = [...splices].sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start) || b.order - a.order);
    for (const s of backwards) {
      if (s.out === null) continue;
      out = out.slice(0, s.start) + s.out + out.slice(s.end);
    }
    const done = new Set(splices.filter(s => !s.mark).map(s => s.edit));
    for (const edit of edits) if (done.has(edit)) (splices.find(s => s.edit === edit && !s.mark).out === null ? unchanged : applied).push(edit);
    return { xml: out, applied, unchanged, refused };
  }

  // Open a .docx (bytes), apply edits, and return new .docx bytes.
  // Parts other than word/document.xml are never rewritten. If no edit was
  // placed, word/document.xml is left untouched too.
  async function writeDocx(JSZip, bytes, edits, opts = {}) {
    const zip = await JSZip.loadAsync(bytes);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new Error('This Word file does not contain a readable document body.');
    const xml = await entry.async('string');
    const result = applyEdits(xml, edits, opts);
    if (result.applied.length) zip.file('word/document.xml', result.xml);
    const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { bytes: out, applied: result.applied, unchanged: result.unchanged, refused: result.refused };
  }

  root.SyllabusDocxWriter = { parseTree, documentModel, paragraphText, locate, locateRow, rowText, applyEdits, writeDocx };
})(typeof globalThis !== 'undefined' ? globalThis : this);
