# SyllabusBridge Word round-trip test (v2.2)

Status: **done**. Roadmap item: [v2.2 item 5](SYLLABUSBRIDGE-ROADMAP.md#5-word-round-trip-test-groundwork-for-v25).

## Why this test exists

In v2.5, SyllabusBridge will write faculty edits back into their Word syllabus.
Before saving and reopening projects is built in v2.2, we need to know what
information that export will need. Otherwise projects saved in v2.2 might not
work with v2.5.

This test builds a small **prototype writer** and checks it against tricky Word
files. The prototype is not part of the app yet. Faculty see no change, and it
is not included in the built site.

## Results

| What we checked | Result |
|---|---|
| **No edits:** the file comes back unchanged | **Pass.** Every part of the Word file is byte-for-byte identical, in the same order. |
| **One table cell edited:** only that cell changes | **Pass.** Everything outside the edited paragraph is identical, and the cell keeps its alignment and font size. |
| **Bold label + red instruction on one line** (for example "**COURSE DESCRIPTION:** *Copy and Paste…*") | **Pass**, after a fix (see finding 2). The label is untouched, and the new text keeps the instruction's formatting. |
| **Bullet item edited** | **Pass.** The bullet, list style, and indentation are kept. |
| **Text split across several formatting pieces** | **Pass.** Only the pieces holding changed words are rewritten. |
| **Tab-aligned line, text inside a bookmark, a second line in a cell, a line break inside a cell** | **Pass.** |
| **Red instruction bullet deleted** | **Pass.** |
| **Safety:** stale or unsafe edits are refused, not guessed | **Pass.** Refused with a plain reason: text no longer matches, location missing, link, existing tracked changes, deleting the last paragraph in a cell or document, two edits to one paragraph. |
| **Tracked-change mode** | **Pass.** Edits appear as Word tracked changes by "SyllabusBridge" with a date, as whole words ("~~2.6~~ 2.7"). Accepting them gives exactly the same text as a direct edit. |
| **SyllabusBridge re-reads the edited file** | **Pass**, in both modes, on the website build and the single-file build. New text is read and deleted text is ignored, including deleted red instructions. |

### Also checked by hand, on the real template (not committed)

The approved syllabus policy template (SUSOP Syllabus Policy, updated
2026-09-28) was run through the prototype on a development machine:

- No-edit round trip: all 37 parts of the file were identical.
- Four edits (grading table cell, description line, coordinator line, deleting
  a red bullet): placed correctly in both modes. One stale edit was correctly
  refused.
- The edited files opened in **LibreOffice** and **python-docx**. LibreOffice's
  text export differed from the original in exactly the four edited places.
  LibreOffice displayed the tracked changes as real tracked changes.
- **Not yet checked in Microsoft Word itself.** This environment does not have
  Word. Opening the tracked and direct files in Word is a required manual check
  before v2.5 ships (see "Still open" below).

## Findings

### 1. Splice edits into the original file; don't rebuild it

The writer changes only the characters of the edited paragraph and copies every
other byte exactly as Word wrote it. Rebuilding the whole document with the
browser's XML tools would quietly rewrite quoting, namespaces, and empty tags,
differently in each browser. Splicing avoids that, and it is why the no-edit
round trip is identical.

### 2. Change only the words that changed

Many template lines hold a bold black label and red instruction text in **one**
paragraph. Replacing the whole paragraph would have made the line all bold or
all red. The writer now:

- leaves unchanged words, and their formatting, exactly as they were;
- gives new text the formatting of the first word it replaces;
- widens a change to whole words, so tracked changes read "~~2.6~~ 2.7" and
  not "2.~~6~~7".

### 3. The official template already contains unaccepted tracked changes

The 2026-09-28 template has **pending tracked changes in 31 of its 157
paragraphs**, plus every cell of the Program Mapping table, all from an earlier
policy revision. Syllabi built from this template will carry them too.

- SyllabusBridge already reads these as if they were accepted. Inserted text
  counts and deleted text does not.
- The writer **refuses** to edit a paragraph that has pending changes, because
  mixing them safely is complex. As things stand, about one paragraph in five
  of a template-based syllabus could not be edited automatically.

**Recommendation (added to v2.2):** when a syllabus with unaccepted tracked
changes is uploaded, tell faculty plainly: "This syllabus has unaccepted
tracked changes. In Word, choose Review → Accept All Changes (or reject them),
save, and upload again." The check is quick and makes export reliable.

### 4. What the v2.2 project file must store for each edit

This is the main output of the test. Each edit needs:

| Field | Why |
|---|---|
| **Fingerprint (SHA-256) of the original .docx** (once per project) | Locations are only valid for that exact file. |
| **Location type**: table cell or body paragraph | They are counted differently. |
| **Table cell:** table number, row number, cell number, and paragraph number within the cell | Rows count from 0, which is usually the header row. The cell number counts **cells, not visual columns**: a merged header (like Program Mapping) is one cell. A cell can hold several paragraphs. |
| **Schedule edits:** also the line number within the cell | Schedule cells often put several lines in one cell, using line breaks or separate paragraphs. |
| **Body paragraph:** paragraph number, **counting blank paragraphs** | SyllabusBridge's current line list skips blank paragraphs and records no paragraph numbers. **The parser must start recording them in v2.2.** Without them, body text edits can't be placed. |
| **Expected text**: the text as stored in Word, **without automatic bullets or list numbers** | This is the safety check before writing. SyllabusBridge's display text adds "• " or "1." in front of list items, which is not in the file, so the raw text must be stored separately. Spacing differences are ignored. |
| **New text**, or "delete paragraph" | |
| **Kind of change**, and the linked finding if any | Parser corrections are never written to Word. |

Two rules follow:

- **Always export from the original file, in one pass.** Deleting a paragraph
  renumbers everything after it, so locations do not carry over to an exported
  copy.
- Recording paragraph numbers means a small change to `syllabusbridge.js`.
  That will need a reviewed update to `tests/import-baseline.json` in v2.2.

### 5. Things SyllabusBridge doesn't read at all

These can't be checked or edited until the parser reads them:

- **Headers and footers.** The template footer holds the placeholder "Course
  Number, Quarter, Year", which SyllabusBridge never reads. It is a good
  candidate for a future template-cleanup check.
- **Tables or rows inside content controls** (Word "form fields"), and tables
  nested inside other tables. The template has none, but faculty copies might.

### 6. Edits the writer refuses (the future "couldn't place" list)

A paragraph is left for faculty to edit by hand when it contains: a link, a
field (such as a page number), a picture or shape, an embedded object, a
footnote or endnote, a Word comment, unaccepted tracked changes, a content
control, a smart tag, custom XML, or a symbol Word stores separately. The
writer also refuses to delete a paragraph that ends a page-layout section, or
the last paragraph in a cell or document. Each refusal has a plain-language
reason, ready for v2.5's "couldn't place" list.

## Still open (not covered by this test)

- **Open the exported files in Microsoft Word** (desktop and web), in both
  modes, and accept all changes. Required before v2.5 ships.
- Adding and removing table rows (roadmap v2.5, stage 2).
- One edit that spans several paragraphs (for example a multi-paragraph course
  description).
- Editing text that already has unaccepted tracked changes. The current answer
  is the upload warning above.
- Headers and footers.

## Files and how to run the tests

| File | What it is |
|---|---|
| `apps/syllabusbridge/docx-writeback.js` | The prototype writer. Not loaded by the app and not in the build. |
| `tests/helpers/syllabus-docx.mjs` | Builds the synthetic test syllabus. All names and values are made up; its structure copies the template's tricky features. |
| `tests/syllabusbridge-writeback.test.mjs` | 12 round-trip tests. They run with the other Node tests in `npm test` (part of `npm run check`). |
| `e2e/syllabusbridge-writeback.spec.js` | Uploads edited files into SyllabusBridge, in all three browsers and both builds. Part of `npm run test:e2e`. |

To run just the round-trip tests from the repository folder:

```bash
node --test tests/syllabusbridge-writeback.test.mjs
```

To run just the browser read-back tests:

```bash
npx playwright test e2e/syllabusbridge-writeback.spec.js
```
