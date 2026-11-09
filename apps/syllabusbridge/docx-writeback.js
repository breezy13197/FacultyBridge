'use strict';
// SyllabusBridge Word write-back prototype (v2.2 round-trip test).
//
// Not loaded by index.html and not shipped in the build. It exists so the
// round-trip tests can show what v2.5 export needs before the v2.2 project file
// format is fixed. See docs/SYLLABUSBRIDGE-ROUNDTRIP.md.
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
// Every edit also carries expectedText, the text originally read at that spot.
// If the file no longer says that, the edit is refused instead of guessed.
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
  function parseTree(xml) {
    const rootNode = { name: '#root', start: 0, end: xml.length, children: [], parent: null };
    let cur = rootNode, i = 0;
    while (i < xml.length) {
      const lt = xml.indexOf('<', i);
      if (lt < 0) break;
      if (xml.startsWith('<?', lt)) { i = xml.indexOf('?>', lt) + 2; continue; }
      if (xml.startsWith('<!--', lt)) { i = xml.indexOf('-->', lt) + 3; continue; }
      if (xml.startsWith('<![CDATA[', lt)) { i = xml.indexOf(']]>', lt) + 3; continue; }
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
  function rewriteParagraph(xml, p, parts, newText, opts, nextId) {
    const { runs, atoms, text } = parts;
    const stamp = () => `w:id="${nextId()}" w:author="${encodeAttr(opts.author)}" w:date="${encodeAttr(opts.date)}"`;
    const remove = newText === null;
    const target = remove ? '' : String(newText);
    if (!remove && text === target) return null; // nothing changed
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
    const delEnd = text.length - b, inserted = target.slice(a, target.length - b);
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
    const open = xml.slice(p.start, p.openEnd).replace(/\/>$/, '>');
    return `${open}${pPrXml}${body}</w:p>`;
  }

  // Text fingerprint used to confirm an edit still points at the right place.
  // Spacing is ignored because SyllabusBridge's reader drops tabs and collapses
  // spaces; everything else (letters, digits, punctuation) must match.
  const fingerprint = s => String(s ?? '').replace(/\s+/g, '');

  // Apply edits to word/document.xml text.
  // edits: [{ id?, anchor, expectedText, newText }]  (newText null = delete paragraph)
  //        expectedText is the paragraph's text as stored in Word, without
  //        automatic bullet or list numbers (Word adds those when it displays).
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
    for (const edit of edits) {
      const p = locate(model, edit.anchor);
      if (!p) { refuse(edit, 'The location no longer exists in this Word file.'); continue; }
      if (seen.has(p.start)) { refuse(edit, 'Another edit already changes this paragraph.'); continue; }
      if (fingerprint(paragraphText(xml, p)) !== fingerprint(edit.expectedText)) {
        refuse(edit, 'The text at this location is not what SyllabusBridge originally read, so the edit was not placed.');
        continue;
      }
      const why = unsafeReason(p);
      if (why) { refuse(edit, `This paragraph ${why}, so the edit must be made by hand in Word.`); continue; }
      const parts = paragraphAtoms(xml, p);
      if (parts.unsafe) { refuse(edit, `This paragraph ${parts.unsafe}, so the edit must be made by hand in Word.`); continue; }
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
      seen.add(p.start);
      splices.push({ start: p.start, end: p.end, edit, p, parts });
    }
    // Render in document order (so tracked-change ids read in order), then
    // splice from the end of the file backwards so earlier positions stay valid.
    splices.sort((a, b) => a.start - b.start);
    for (const s of splices) s.out = rewriteParagraph(xml, s.p, s.parts, s.edit.newText, options, nextId);
    let out = xml;
    for (let k = splices.length - 1; k >= 0; k--) {
      const s = splices[k];
      if (s.out === null) continue;
      out = out.slice(0, s.start) + s.out + out.slice(s.end);
    }
    for (const s of splices) (s.out === null ? unchanged : applied).push(s.edit);
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

  root.SyllabusDocxWriter = { parseTree, documentModel, paragraphText, locate, applyEdits, writeDocx };
})(typeof globalThis !== 'undefined' ? globalThis : this);
