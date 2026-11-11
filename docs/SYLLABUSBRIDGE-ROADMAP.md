# SyllabusBridge roadmap

Status: planning document. Nothing here is built yet unless a section says so.
Current release: SyllabusBridge **2.1.2** (see `suite.json`).

## The goal

Faculty upload a Word syllabus, SyllabusBridge checks it against the School of
Pharmacy syllabus policy, faculty fix what the report finds, and SyllabusBridge
gives back a **new .docx with those fixes in it**. The original file is never
overwritten.

```
Upload .docx  →  Check against policy  →  Fix findings in the editor  →  Export edited .docx
```

## Where things stand (2.1.2)

These pieces already exist and the plan below builds on them:

- **Structured editor.** Faculty can correct course info, faculty, CLOs, the
  grading table, the schedule, and other structured tables.
- **Edit log.** Each table edit is recorded with its location in the original
  Word file (table, row, column) and its original value. This is the
  foundation that writing changes back into the .docx will need.
- **"Reset edits"** returns everything to what was read from the file.
- **"Export Course JSON"** hands course data to FacultyBridge. It is not a way
  to save and reopen a SyllabusBridge session.
- **Validation checks** mostly confirm that required sections are *present*.
  They do not yet check that required wording (for example, the grading scale
  or the accessibility statement) *matches* the policy.

## Guiding principles

1. **Evaluate, don't author.** SyllabusBridge suggests and records changes;
   faculty decide. Exported changes must be reviewable in Word.
2. **Never write a parser correction into the syllabus.** If SyllabusBridge
   misread the file, the file was right. Only real content edits go back into
   the .docx.
3. **Never overwrite the original.** Export always makes a new copy.
4. **Saved projects must keep working.** A project saved in an earlier version
   must still open in a later one.

---

## v2.2 — Editing safety and saving your work

Main purpose: make editing safe, let faculty save and come back later, and lay
the groundwork that v2.5's Word export depends on.

### 1. Undo and redo — done (unreleased)

- **Undo** and **Redo** buttons sit at the left of the editor's status bar.
  They cover every edit in the structured editor: course fields, faculty,
  CLOs, grading, schedule cells, added and removed rows, and **Reset edits**,
  so an accidental reset can be undone.
- Keyboard: Ctrl+Z undoes; Ctrl+Y or Ctrl+Shift+Z redoes (Cmd on a Mac).
  **Inside a text box, Ctrl+Z keeps doing normal typing undo.**
- Typing in one field without a 2-second pause counts as one step. Leaving a
  field without changing it is not a step.
- How it works: after each change, the whole editor state is copied onto a
  history list (up to 100 steps). The roadmap first said "built on the edit
  log"; full copies were chosen instead because the editor data is small and
  copies make undo exact.
- Uploading another syllabus starts a fresh history. History is not saved with
  the project file.

Acceptance criteria (each covered by `e2e/syllabusbridge-undo.spec.js`):
- [x] Make three different edits, undo three times: the editor matches the
  parsed syllabus and the change count is 0.
- [x] Redo three times: all three edits come back.
- [x] Making a new edit after an undo clears the redo history.
- [x] Ctrl+Z inside a text box does not trigger whole-edit undo.

### 2. Save and reopen a SyllabusBridge project — done (unreleased)

- **Save SyllabusBridge project** (on the Review extraction and Validation
  report screens) downloads a file named like
  `PHA9999-SyllabusBridge-project.json`, matching CalendarBridge's
  "Save CalendarBridge project" naming. (The roadmap first suggested a
  `.syllabusbridge.json` ending; the file says what it is inside instead, and
  SyllabusBridge refuses any JSON that isn't one of its projects.)
- The file contains:
  - `format` ("SyllabusBridge project") and a **format version number** (1);
  - the original Word file's **name, size, and SHA-256 fingerprint**;
  - the full editor state, including every added table row's identifier;
  - the edit log (`tableMutations`) and the parsed starting point (`baseline`);
  - the SyllabusBridge and suite versions that saved it, and when.
- **Reopening:** on the upload screen, **Open SyllabusBridge project**, then
  choose the Word syllabus it was made from. SyllabusBridge reads the Word file
  again and then puts the saved edits back, so **Reset edits** still returns to
  that file's parsed text.
- **Different Word file:** only two matching SHA-256 fingerprints count as the
  same file. If they differ, a "Different Word file?" warning appears *before*
  anything is applied. If either fingerprint is missing (for example, a browser
  that can't compute one), a "Word file not verified" warning appears instead,
  because a matching name and size don't prove it's the same file. Cancel leaves nothing loaded. Continuing applies
  the saved edits, and the change count then compares them with the new file.
  (A per-edit "which edits no longer line up" view needs the paragraph
  locations from the round-trip findings and comes with item 3.)
- **Plain errors** for files that aren't projects (including Course JSON
  exports), damaged projects, and projects saved by a newer SyllabusBridge.
  Every saved field (tables, rows, cells, change records, faculty, schedule)
  is checked before anything on screen changes, and only the fields the editor
  uses are restored.
- The leave-page warning now means "edits not yet saved in a project": it
  clears after saving and returns with the next edit.
- Undo history is not saved; a reopened project starts a fresh history.
- The file holds syllabus content and faculty contact details, never student
  records. Project files from real courses are never committed to this
  repository.
- Not yet stored: paragraph locations for body text and the kind of each
  change. They arrive with item 3 as format version 2, which will still open
  version 1 files.

Acceptance criteria (each covered by `e2e/syllabusbridge-project.spec.js`):
- [x] Save after edits, reload the page, reopen with the same .docx: every
  edit, added rows (still linked to their change records), and the change
  count are restored.
- [x] Reopen with a different .docx: a clear warning appears before anything is
  applied; Cancel loads nothing.
- [x] Non-project files, damaged projects, and newer-format projects get a
  plain explanation.
- [x] The leave-page warning clears after saving and returns with new edits.

### 3. Kinds of change — done (unreleased; finding links came with v2.3)

What shipped (decided 2026-11-10: mark in the summary, labels only this round):

- Every change counts as a **syllabus edit** by default. In the **Change
  summary**, each row has a **"SyllabusBridge misread this"** checkbox that
  marks it as a **reading correction**: the Word file was right, and only how
  SyllabusBridge read it was wrong. No questions interrupt editing.
- The summary and the printable report show each change's kind and the totals
  ("4 syllabus edits, 1 reading correction").
- Marking is a step in Undo/Redo and counts as unsaved work.
- A mark belongs to a change that exists now. If the change goes away (undone,
  typed back to the original, or gone because a project was reopened against a
  Word file that already says the same thing), its mark is cleared, so a later
  change to the same item starts as a syllabus edit again.
- Saved in the project file as `changeKinds` (**format version 2**). Format 1
  files still open, with every change counted as a syllabus edit.
- Reading corrections still fix the data: validation and the Course JSON for
  CalendarBridge use the corrected values. **Word export (v2.5) must skip
  them;** that is the main reason for this distinction.

| Kind | What it means | Written into the exported .docx? |
|---|---|---|
| **Syllabus edit** | A change faculty want in the syllabus. | Yes (v2.5) |
| **Reading correction** | "SyllabusBridge read this wrong." | **No** |

Still to come:

- ~~**Fix for a finding**~~: done in v2.3 (item 3). An edit made from a
  finding's "Fix this" is linked to it, and the report shows "Resolved by your
  edit" after revalidating.
- **Paragraph locations** in the parser for body text (from the round-trip
  findings). This comes with the v2.5 Word export work, because it changes
  the protected parsing code.
- A parser QA log export of reading corrections (to find where the parser
  most needs work).

Why this matters for later versions:
- **v2.5 export:** only syllabus edits go back into Word.
- **Year-over-year rollover:** next year's syllabus can carry forward the
  intentional edits; reading corrections become parser fixes instead.

### 4. Change summary — done (unreleased)

- **Review changes** (under the "N net changes" count in the editor's status
  bar) opens a list of every change, grouped by section: course information,
  coordinator & course faculty, course learning outcomes, grading, policies
  and narrative sections, course schedule, and each structured table.
- Each row shows the kind of change (**Changed**, **Added**, **Removed**, as
  words, not just colors), the item, and the text **before** and **after**.
- The summary is built from the same comparison as the "N net changes" count:
  one row per counted change, so the two always agree. Each row's text shows
  every detail that comparison checks (for grading: type, name, date, and
  weight), so a counted change is never invisible.
- The **Validation report** includes the same summary ("Changes made in
  SyllabusBridge"), so **Print / save PDF** gives a coordinator or committee
  the validation results and the edits together.
- Not yet: grouping by finding (needs findings linked to edits, item 3 and
  v2.3) and showing the kind of change (parser correction vs. syllabus edit,
  item 3). Long narrative sections show the whole before and after text;
  highlighting only the changed words would be a later improvement.

Acceptance criteria (each covered by `e2e/syllabusbridge-change-summary.spec.js`):
- [x] Every counted change appears once, under its section, with before and
  after; the number of rows equals "N net changes".
- [x] Table cell edits, added rows, and removed rows appear under their table.
- [x] The printable report contains the same summary, visible when printing.
- [x] With no edits, or after undoing them, the summary says nothing changed.

### 5. Word round-trip test (groundwork for v2.5) — done

A prototype writer was tested against a synthetic syllabus and, on a
development machine, the approved template. Full results:
[SYLLABUSBRIDGE-ROUNDTRIP.md](SYLLABUSBRIDGE-ROUNDTRIP.md).

- With no edits, the file comes back byte-for-byte identical. A single edit
  changes only that paragraph.
- Bullets, bold labels, red instruction text, and text split across
  formatting pieces all keep their formatting.
- Tracked-change export works and reads as whole-word changes.
- SyllabusBridge reads the edited files correctly.

What this changes for the rest of v2.2:

- The project file must store the locations and original text listed in the
  findings (item 2).
- The parser must start recording **paragraph numbers** for body text, counting
  blank paragraphs. Today it records locations only for table cells. This is a
  change to `syllabusbridge.js` and needs a reviewed baseline update.
- Store each paragraph's text **without** the bullets or list numbers that
  SyllabusBridge adds for display.
- Microsoft Word itself has not opened the test files yet. That manual check is
  required before v2.5 ships.

### 6. Warn about unaccepted tracked changes at upload — done (unreleased)

The approved template contains unaccepted tracked changes in about one
paragraph in five, so syllabi built from it do too. Word export can't safely
edit those paragraphs.

- After upload (and when a project is reopened), a warning above the editor
  says how many unaccepted tracked changes there are and in how many
  paragraphs, what they look like in Word, and how to clear them: **Review**
  tab → **Accept ▸ Accept All Changes** (or **Reject ▸ Reject All Changes**),
  save, and upload again.
- Faculty can keep working; nothing is blocked. The **Validation report**
  carries the same note, including when printed.
- Insertions, deletions, moved text, and inserted or deleted paragraph marks
  all count. Only the main document is checked (not headers or footers),
  matching what SyllabusBridge reads.
- The check reads the Word file on its own; how SyllabusBridge parses the
  syllabus is unchanged.
- On the approved 2026-09-28 template it reports 75 tracked changes in 40
  paragraphs (31 body paragraphs plus 9 Program Mapping table paragraphs),
  matching the round-trip findings.

Acceptance criteria (each covered by `e2e/syllabusbridge-tracked-changes.spec.js`):
- [x] A syllabus with tracked changes shows the message. One without them does not.
- [x] The message names the Word menu steps.
- [x] Work can continue, and the report (and its printed copy) carries the note.

---

## v2.3 — Policy content checks — done (unreleased)

### 1. A separate, dated policy profile — done (unreleased)

- The policy rules live in
  `apps/syllabusbridge/policy/susop-syllabus-policy-2026-09-28.js`, not in the
  code. (The roadmap first suggested a `.json` file. The single-file offline
  version can only carry it as a `.js` file, so the file is JSON data with one
  line around it.) How to read and update it, in plain language:
  [policy/README.md](../apps/syllabusbridge/policy/README.md).
- The report says "Checked against SUSOP Syllabus Policy, updated 2026-09-28.",
  including when printed. If the profile is missing, the report says so and
  the policy checks are Not evaluated.
- When the policy changes, add a new dated profile next to the old one;
  SyllabusBridge uses the newest. Old printed reports still name theirs.
- Campus-specific details are settings in the profile (`campus`). The Student
  Affairs contact is blank for now, so the report says it was not compared.
- **Needs confirmation before release** (marked `"confirmed": false` in the
  profile, and noted next to those results in the report): the grading scale's
  middle rows were inferred (65–89% = (percent − 50) ÷ 10, matching 76% = 2.6
  in the template), and the approved accessibility wording was not available,
  so that check looks for key phrases instead. Decided 2026-11-10: build now,
  confirm against the official policy before release.

### 2. New content checks from the 2026-09-28 policy — done (unreleased)

They appear in the report under **Policy content**.

| Check | What it compares |
|---|---|
| Grading scale | Every row of the percent → GPA table against the official scale (≥90 = 4.0 … ≤64 = 0). A different GPA is an issue; a missing, extra, or unreadable row is a warning. Rows like "≥90", "90–100", "90 and above", "≤64", and side-by-side column pairs are read. |
| Accessibility statement | Key phrases (disability or accessibility, reasonable accommodations, Student Affairs), plus the campus contact once it is set. |
| Student engagement | 10 hours of instruction and 20 hours of outside work per quarter credit hour. |
| Required hardware and software | ExamSoft, a current annual subscription, and a privacy filter. |
| Library resources | If the syllabus mentions research-type work, it points to South University Library resources. With no research found, the check is Not evaluated, even if the library is mentioned. It reads the editor's current text plus only the parts of the Word file the editor has no copy of, so wording deleted in the editor no longer counts. |
| Program-wide assessment tools | ExamSoft, the end-of-course survey, and course-embedded assessments. |
| Course-specific policies | The SUSOP Student Handbook and the University Handbook, in Course Specific Policies or its policy subsections. |

- Each check names what it found (with the words around it) and what it did
  not find. If the section was not found, the check says Not evaluated.
- Wording checks are warnings, not issues, because a syllabus can say the same
  thing in other words. Faculty decide.
- Known limit: SyllabusBridge reads a short line (110 characters or fewer) that
  contains a heading phrase, such as "quarter credit hour" or "course
  coordinator", as the start of a new section. A short policy sentence like
  that can end its section early, and the check then reports Not evaluated or
  a missing phrase. Changing that is a change to the protected parsing code.

### 3. Jump from a finding to the field — done (unreleased)

- Each warning or issue in the report that has a matching editor field gets a
  **Fix this** button (not printed). It opens the structured editor at that
  field, with the cursor in it.
- To make this possible, the **Grading scale** table and **Program-wide
  assessment tools** are now editable in the structured editor. A table with a
  percent column and a GPA column (for example "Percent | GPA") counts as the
  grading scale table even when its header doesn't say "% Grade". If the
  grading scale is in a table the editor can't edit, the suggested action says
  to correct it in Word and upload again.
- While fixing, a note at the top of the editor says "Fixing: [check]" and
  how many changes are linked. Every change made or altered then is linked to
  that finding (including a change undone and then made again). **Revalidate now** says whether the finding now passes
  ("Resolved by your edit"). **Revalidate and return to report** goes back;
  **Stop linking changes** ends linking. Leaving the editor also ends it.
- In the report, a finding that passes and has linked changes shows **Resolved
  by your edit**. One that still fails says how many changes were made for it.
- The change summary marks each linked change "Fix for a finding: [check]" and
  counts them. A fix is still a syllabus edit or a reading correction; the link
  sits alongside its kind (see v2.2 item 3).
- Links follow Undo/Redo, are cleared when their change goes away, and are
  saved in the project file as `changeFindings` (**format version 3**). Format 1
  and 2 files still open, with no links.

Acceptance criteria (covered by `e2e/syllabusbridge-policy-checks.spec.js` and
`tests/syllabusbridge-policy.test.mjs`):
- [x] A syllabus that follows the policy passes all seven checks, and the
  report (including its printed copy) names the policy and its date.
- [x] Each failing check says what is missing or different (for example
  "76% shows 2.5; the official scale is 2.6").
- [x] Missing sections, a missing grading scale table, and a syllabus without
  research work are Not evaluated, not passed.
- [x] Fix this opens the editor with the cursor in the right field; the edit is
  linked; after revalidating, the finding shows "Resolved by your edit".
- [x] Links follow Undo/Redo and are saved and restored in project format 3;
  format 2 projects still open; damaged links are refused.
- [x] Every profile file is loaded by the page, covers every percent exactly
  once, and uses valid patterns, section names, and editor fields.

Still to come:
- Confirm the grading scale and accessibility wording against the official
  policy (see item 1) and mark them confirmed.
- Grouping the change summary by finding.

---

## v2.5 — Export an edited Word syllabus

### 1. Export as Word tracked changes

- SyllabusBridge writes edits into a **new copy** of the original .docx, named
  like `Original-Name-SyllabusBridge-edits.docx`.
- Each edit appears as a **Word tracked change**, with SyllabusBridge as the
  author. Faculty, coordinators, or a committee accept or reject each change in
  Word.
- Why tracked changes and not a silent rewrite:
  - it keeps "Evaluate, don't author" true;
  - if an edit lands in the wrong place, it is visible instead of hidden;
  - reviewers can see exactly what changed.
- Optionally, add a Word comment on each change naming the finding it fixed.
- **Parser corrections are never exported** (principle 2).

### 2. Build it in stages

1. Table cells (grading table, schedule, program mapping, course evaluation).
   The existing edit log already records these locations.
2. Added and removed table rows.
3. Simple single-paragraph fields (course description, time and location).
4. Harder cases: bullet lists, text split across formatting pieces, and
   removing red template instructions.

### 3. Report anything that couldn't be placed

- Before download, show a list of any edit SyllabusBridge could not place
  safely in the Word file, with its before/after text, so faculty can make it
  by hand. **No edit is dropped silently.**

### Acceptance criteria

- Every content edit appears exactly once as a tracked change in the right
  place, or appears in the "couldn't place" list.
- No parser correction appears in the exported file.
- The exported file opens without errors in Word.
- Re-uploading the exported file (after accepting all changes) and running
  validation shows the linked findings resolved.

---

## Later ideas (not scheduled)

- **Year-over-year rollover:** start next year's syllabus from this year's
  project, carrying forward intentional edits and flagging dates to update.
- **University-calendar comparison:** check schedule dates against an
  academic-calendar profile (currently "Not evaluated").

## Release notes for each version

Follow `docs/RELEASING.md` and `docs/RELEASE-CHECKLIST.md`. Each release bumps
the SyllabusBridge version in `suite.json` only when that release ships, and
runs the syllabus regression set described in the release checklist.
