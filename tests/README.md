# Automated Bridge validation

Use Node 22 or later. Install dependencies with `npm ci` and browsers with
`npx playwright install` (Linux CI: add `--with-deps`).

```sh
npm run validate:quick  # build/structural tests + Chromium browser smoke
npm run validate       # quick checks + all six E2E projects
```

The individual `check`, `test:browser`, and `test:e2e` commands remain available.
For a focused E2E run, for example:

```sh
npm run test:e2e -- --project=chromium --grep QuestionBridge
```

Focused runs give fast development feedback; they do not replace full pre-merge
validation. CI runs the quick stage in `verify`, then E2E in `test`, without
duplicating smoke checks in a second workflow. The tag workflow reuses these
same two jobs before preparing draft release assets. See
[development](../docs/DEVELOPMENT.md) and [releases](../docs/RELEASING.md).

`test:e2e` builds the site, starts its own server on port 4173, and runs
Chromium, Firefox, and WebKit twice each: against the served site and against
the single-file standalone build opened from disk (`<browser>-standalone`
projects). Stop any existing preview on that port first.

What it covers, using synthetic data only:

- `suite.spec.js`: every tool's fresh start, version, theme, and external
  network requests, plus QuestionBridge navigation guards and ExamBridge and
  ItemBridge invalid-file handling.
- `workflows.spec.js`: one complete load, process, export workflow per tool,
  with the downloaded file checked (not just that a download happened):
  ItemBridge CSV columns and per-item recommendations, ExamBridge report
  content, all four QuestionBridge formats, the exact GradeBridge Brightspace
  CSV, GroupBridge enrollment rows, and SyllabusBridge Course JSON handed to
  CalendarBridge and exported as `.ics`. GradeBridge safety gates (percentage-only
  exports, Excel-mangled IDs, duplicates, unmatched students, missing scores)
  are tested to confirm unsafe files are refused.
- `syllabusbridge-writeback.spec.js`: Word files edited by the SyllabusBridge
  write-back prototype (direct and tracked-change edits) are uploaded back into
  SyllabusBridge, which must read the new text and ignore deleted text. The
  matching Node tests are in `syllabusbridge-writeback.test.mjs`; see
  [the round-trip findings](../docs/SYLLABUSBRIDGE-ROUNDTRIP.md).
- `syllabusbridge-undo.spec.js`: SyllabusBridge editor undo/redo by button and
  keyboard, one step per typing burst, redo cleared by a new edit, Reset edits
  undoable, and typing undo left alone inside text boxes. It also replays a
  late screen refresh after "+ Add row": that refresh used to move the cursor
  back to the new row's first cell after typing had moved on, which made CI
  runs flaky ("Participation10"). The cell is now focused immediately. It also
  checks that, after Undo, the grade boxes show the restored values: WebKit
  (Safari) used to keep the typed text in the rebuilt boxes.
- `syllabusbridge-project.spec.js`: SyllabusBridge project save and reopen:
  every edit comes back with the same Word file, a different Word file is
  warned about before anything is applied (and so is any file that can't be
  verified by fingerprint), damaged project contents are refused before
  anything changes, non-project files get a plain error, and the leave-page
  warning tracks saving.
- `syllabusbridge-change-summary.spec.js`: SyllabusBridge change summary:
  one row per counted change, grouped by section with before and after, the
  same list in the printable report, and table cells/rows under their table.
- `syllabusbridge-change-kinds.spec.js`: SyllabusBridge kinds of change:
  syllabus edit by default, "SyllabusBridge misread this" marks a reading
  correction (shown in the summary and report), marking undo/redo, marks
  cleared when their change goes away, and kinds saved in project format 2
  (now 3) while format 1 projects still open.
- `syllabusbridge-policy-checks.spec.js`: SyllabusBridge v2.3 policy content
  checks: a syllabus that follows the policy passes all seven, each failing
  check says exactly what is missing or different, checks that can't be made
  say Not evaluated, the report (and its printed copy) names the policy it
  checked against, grading scale rows written in other common ways are read,
  and "Fix this" opens the right field, links the edit to the finding (through
  Undo/Redo and in project format 3), and shows "Resolved by your edit" after
  revalidating. Four regression tests from the PR #34 review: wording deleted
  in the editor no longer counts as library evidence, a fix undone and typed
  again stays linked, no research means Not evaluated even when the library is
  mentioned, and a "Percent | GPA" table can be fixed in the editor.
  Tests named "QA: …" reproduce the PHA4330/PHA4331 QA review with synthetic
  data: the official 65–69% values and an unlabeled third column pair, wording
  in the places real syllabi put it, and schedules with several dates per
  row, week heading rows, a TBD final exam, and "Tuesday and Thursday".
  Second-round review tests: wording deleted from an inline heading line is
  not evidence, and wording in both a paragraph and a table counts until both
  are changed. In `syllabusbridge-project.spec.js`, a project saved by the
  earlier SyllabusBridge (before TBD rows were read) is reopened and keeps the
  final exam. Its files, `e2e/data/syllabusbridge/project-saved-before-tbd-rows.json`
  and `syllabus-with-tbd-final.docx`, are synthetic; the project was saved by
  the build of `main` at 056eb67 and must not be regenerated with a newer one.
  Template cleanup tests: Fix this opens the field with the placeholder
  selected and the edit resolves the finding; the textbooks heading (even
  misspelled) is not a placeholder, and a table-header placeholder the editor
  cannot change is still found.
  Third-round review tests: an edited or removed schedule row is not
  evidence (library check and template cleanup), and template cleanup's Fix
  this opens the exact rubric cell (row 2, column 2), the second CLO, and the
  second schedule row, with the placeholder selected.
  `syllabusbridge-policy.test.mjs` (Node) checks every dated
  policy profile file: loaded by the page, a grading scale with no gaps or
  overlaps, patterns that work, and known section and editor field names.
- `syllabusbridge-tracked-changes.spec.js`: SyllabusBridge warns about
  unaccepted Word tracked changes (with the Review ▸ Accept All Changes steps),
  shows nothing for a clean file, keeps working, and notes it in the report.
- `offline.spec.js`: the same workflows with the network disabled after the page
  loads, to prove nothing is lazy-loaded from outside the computer.

Workflows live in `e2e/workflows.js` so the online and offline specs cannot
drift apart. Any new tool or export format should add one entry there. The
existing `test:browser` also covers site and standalone builds, UI contrast,
and synthetic Word parsing.

- `gradebridge-rosters.spec.js`: the synthetic Brightspace rosters and ExamSoft
  exports in `tests/test files/rosters/` (Git-ignored; the spec skips when the
  folder is missing). Covers encoding, line-ending, Excel-mangled, percent-only,
  banner-row, duplicate, name-variant, and missing-score files.

## Uploaded files: local regression only

Keep course material in `tests/test files/` with `exams/`, `item analysis/`,
`syllabi/`, and `course schedule/` subfolders, plus an optional `questions/`
subfolder for QuestionBridge (`.docx`, `.txt`, `.csv`, `.xlsx`, or `.rtf`). Set
`BRIDGE_FIXTURE_DIR` to use another root. These files and local baselines are ignored by Git; never commit
real exams, student records, or credentials. CI uses synthetic tests only.

```sh
# Record current numeric behavior, then review the results:
npm run test:e2e:local -- --capture
# After adding files, record baselines only for files that have none yet
# (existing reviewed baselines are left untouched):
npm run test:e2e:local -- --capture-missing
# Compare subsequent runs against those reviewed counts:
npm run test:e2e:local
```

Tests are numbered by each folder's alphabetical file order, so adding a file can
change which number a file has. Before running, the runner prints which file each
numbered test uses (in your terminal only). Office temporary files whose names
start with `~$` (created while a document is open in Word or Excel) and other
hidden files are skipped and listed as skipped. A test failing with "Missing
reviewed baseline" means the file is new or changed: review it, then run
`--capture-missing`.

The local runner uses Chromium and a single worker. It uploads each file through
the UI, checks nonempty extraction, generates exam reports, verifies item CSV
downloads, runs syllabus validation, and tests Course JSON export or its blocking
date validation. CalendarBridge tests both syllabi and course schedules, recording
whether each document is accepted, the event count, and events needing review.
Accepted CalendarBridge documents and SyllabusBridge baselines also record
`coordinators` and `coordinatorDetected`, counting all detected coordinator roles.
Rejected calendars omit extraction counts because parsing did not complete.
Ready calendars also export a project; unresolved events must block export.
Rejection by CalendarBridge is a recorded outcome, not a claim that the file was
successfully converted. QuestionBridge records the question count, question
types, image count, and blocked/warning counts for each export platform, then
downloads each export that includes at least one question and checks it is not
empty. A QuestionBridge file that cannot be read fails the test.

QuestionBridge's `answers` summary records whether any answer was detected,
question counts with and without detected answers, counts by question type, and
parser confidence counts. Detection means a nonempty marked correct choice,
an accepted short answer, or at least one blank with an accepted answer.
Partially answered fill-in-the-blank questions count as detected; platform
validation still checks completeness. Essay/unsupported types count as
`notApplicable`. Confidence describes the parser's overall question confidence,
not independent proof that an answer is correct. No answer text is stored.

Additional extraction coverage:

- SyllabusBridge records schedule candidates, parsed rows, and failed rows;
  CLO candidates and parsed CLOs; faculty/coordinator contact completeness;
  CLO mappings, PLOs, meeting patterns, grading rows, and the grading percentage
  total (rounded to four decimal places). Candidate/failure counts come from
  parser diagnostics; they are not guaranteed to partition source rows because
  parsing can deduplicate or expand entries. Faculty contact counts include coordinators.
- CalendarBridge records each review issue separately, including overlapping
  issues on the same event. These follow the app's validation rules, which skip
  excluded events. Separate coverage counts include all events: categories,
  included/excluded counts, missing locations, exact duplicate copies, and
  unresolved faculty/coordinator references. Duplicate comparison uses date,
  time, topic, location, type, and the set of faculty assignments. A missing
  location is informational; the app does not treat it as a blocking issue.
- QuestionBridge records complete, partial, missing, invalid, and inapplicable
  answer keys, total nonempty choices, correct-choice count distribution, and
  blank fields with/without answers. Complete keys satisfy answer cardinality;
  they do not establish that the question itself is valid or the answer is right.
  Partial keys have some accepted blank answers but not all expected blanks.
  Invalid keys include multiple correct choices for a single-answer question,
  marked empty choices, or inconsistent blank structure. Parse-warning totals
  and validation issues are grouped into fixed test codes with error/warning
  counts; unrecognized messages use `other`, never the source message text.
- Each QuestionBridge destination records eligible questions, whether a download
  occurred, and questions read from the actual download. CSV records and XLSX
  data rows are counted; ExamSoft RTF question records are counted using RTF
  paragraph boundaries, excluding numbered blank answers within records.
  These counts check coverage, not LMS import success or answer-key parity.
  Download counts must equal eligible counts. Brightspace with images
  uses the explicit **Download without images** option; this verifies question
  coverage but does not verify the image package or image references. Destinations
  with no eligible questions record zero and are not downloaded.

`local-summaries.test.mjs` tests aggregate semantics with synthetic data.
`local-summaries.spec.js` checks exact downloaded counts for all six QuestionBridge
question types across all four destinations, in each browser/build format.

When upgrading older baselines to these additional fields, `--capture-missing`
does not update existing files. Use `--capture`, verify that all previous fields
are unchanged, and review the new counts against the documents before treating
the expanded baselines as reviewed.

Baselines in `tests/local-baselines/` use tool names and source SHA-256 hashes,
with numeric counts and acceptance flags only. A changed source file requires a
new baseline. Capture records observed behavior; **it does not establish that
the results are correct**. Review counts against the original document and
expected findings before relying on them. Only recapture after explaining each
difference. These baselines are separate from `tests/import-baseline.json`, which
must not be updated for test setup changes.

Screenshots, videos, and traces are disabled. Playwright failure reports may
still contain page text, local paths, and document names. Keep local reports and
`test-results/` private; do not upload them to CI or issue trackers. Downloads are
read in Playwright's temporary storage and deleted after validation. Local tests
block external HTTP requests and fail if an application attempts one.

These checks detect extraction/count regressions and broken workflow guards;
they do not establish the correctness of every finding, event date, or export
field. Follow `docs/RELEASE-CHECKLIST.md` for content review and release sign-off.
