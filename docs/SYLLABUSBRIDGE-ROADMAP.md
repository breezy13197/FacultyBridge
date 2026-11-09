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

### 1. Undo and redo

- Undo/redo for every edit in the structured editor (cell changes, added rows,
  removed rows, faculty and CLO changes).
- Built on the existing edit log, not on full copies of the whole syllabus.
- **Ctrl+Z inside a text box keeps doing normal typing undo.** Whole-edit undo
  happens only from the Undo/Redo buttons, or from the keyboard when focus is
  not in a text box.

Acceptance criteria:
- Make three different edits, undo three times: the editor matches the parsed
  syllabus and the change count is 0.
- Redo three times: all three edits come back.
- Making a new edit after an undo clears the redo history.

### 2. Save and reopen a SyllabusBridge project

- A **"Save SyllabusBridge project"** button downloads a file ending in
  `.syllabusbridge.json`. The name is deliberately different from "Export
  Course JSON" so faculty don't confuse the two.
- The file contains:
  - a **format version number**, so later releases know how to read it;
  - a **fingerprint (hash) of the original .docx**, plus its file name;
  - the full edit log, including the kind of each change (see item 3);
  - the SyllabusBridge version that saved it.
- **Reopening:** faculty choose the project file and attach the original .docx
  again. If the .docx doesn't match the fingerprint, SyllabusBridge warns:
  "This project was made from a different version of the syllabus." Faculty
  can stop, or continue and see which edits no longer line up.
- The project file holds syllabus content only. Syllabi contain faculty
  contact details but no student records; even so, project files from real
  courses are never committed to this repository.

Acceptance criteria:
- Save after edits, reload the page, reopen with the same .docx: every edit,
  its kind, and the change count are restored.
- Reopen with a different .docx: a clear warning appears before anything is
  applied.
- A project file from an older format version opens (or explains plainly why
  it can't).

### 3. Three kinds of change

Every edit is labeled as one of:

| Kind | What it means | Written into the exported .docx? |
|---|---|---|
| **Parser correction** | "SyllabusBridge read this wrong." | **No** |
| **Fix for a finding** | An edit made in response to a specific warning or issue in the report. | Yes |
| **Other intentional edit** | Any other content change faculty want. | Yes |

- Default labeling: an edit made after jumping from a finding (see v2.3 item 2)
  is labeled "Fix for a finding" and linked to that check. Other edits ask once,
  with a simple choice: "Correcting how SyllabusBridge read this" or "Changing
  the syllabus."
- Faculty can change the label later in the change summary.
- When a linked fix is made and the syllabus is revalidated, the report marks
  that finding **"Resolved by your edit."**
- Parser corrections can be exported as a separate **parser QA log** (what was
  read, what it should have been, where). This shows where the parser needs
  work. Logs from real courses stay out of this repository; turn patterns into
  synthetic test fixtures instead.

Why this matters for later versions:
- **v2.5 export:** only content edits go back into Word (principle 2).
- **Year-over-year rollover:** next year's syllabus can carry forward the
  intentional edits; parser corrections become parser fixes instead.

### 4. Change summary

- A screen listing exactly what changed, grouped **by syllabus section**, with
  "before" and "after" for each change and its kind.
- Can also be grouped **by finding**, showing which report items each edit
  addressed.
- Printable, so it can go to a coordinator or committee with the syllabus.

### 5. Word round-trip test (groundwork for v2.5)

This is a technical test, not a feature faculty see.

- Open a .docx and write it back out with no edits: the result opens in Word
  and its content and formatting are unchanged.
- Change one table cell and write it out: only that cell differs.
- Try one body paragraph, one bullet list item, and one piece of red
  instruction text, including text Word has split across several formatting
  pieces ("runs").
- Record what location details each case needs, and make sure the v2.2 project
  file stores them. **This is the main reason to do this test now:** finding
  out in v2.5 that the save format is missing something would break projects
  people saved in v2.2.

Use synthetic test syllabi built from the approved template, not real course
files.

---

## v2.3 — Policy content checks

### 1. A separate, dated policy profile

- Move policy rules into a data file such as
  `apps/syllabusbridge/policy/susop-syllabus-policy-2026-09-28.json` instead of
  writing them into the code.
- The report states which policy it checked against, for example: "Checked
  against SUSOP Syllabus Policy, updated 2026-09-28."
- When the policy changes, add a new dated profile. Old reports can still say
  which version they used.
- Campus-specific details (for example, the Student Affairs contact named in
  the accessibility statement) are settings in the profile, not fixed text in
  the code.

### 2. New content checks from the 2026-09-28 policy

| Check | What it compares |
|---|---|
| Grading scale | The percent → GPA table matches the official scale (≥90 = 4.0 … ≤64 = 0). |
| Accessibility statement | Matches the approved wording, apart from the campus-specific parts. |
| Student engagement | Includes the 10 hours of instruction and 20 hours of outside work per quarter credit hour. |
| Required hardware and software | Lists ExamSoft (current annual subscription) and a privacy filter. |
| Library resources | If assignments involve research, the syllabus points to South University Library resources. |
| Program-wide assessment tools | Mentions ExamSoft, the end-of-course survey, and course-embedded assessments. |
| Course-specific policies | References the SUSOP Student Handbook and University Handbook policies. |

Each check follows the existing rule: if SyllabusBridge can't tell, it says
**Not evaluated** rather than passing.

### 3. Jump from a finding to the field

- Each finding in the report gets a **"Fix this"** link that opens the editor at
  the matching field.
- Edits made from there are automatically labeled "Fix for a finding" and
  linked to that check (see v2.2 item 3).

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
