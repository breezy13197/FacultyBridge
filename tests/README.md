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
`syllabi/`, and `course schedule/` subfolders. Set `BRIDGE_FIXTURE_DIR` to use
another root. These files and local baselines are ignored by Git; never commit
real exams, student records, or credentials. CI uses synthetic tests only.

```sh
# Record current numeric behavior, then review the results:
npm run test:e2e:local -- --capture
# Compare subsequent runs against those reviewed counts:
npm run test:e2e:local
```

The local runner uses Chromium and a single worker. It uploads each file through
the UI, checks nonempty extraction, generates exam reports, verifies item CSV
downloads, runs syllabus validation, and tests Course JSON export or its blocking
date validation. CalendarBridge tests both syllabi and course schedules, recording
whether each document is accepted, the event count, and events needing review.
Ready calendars also export a project; unresolved events must block export.
Rejection by CalendarBridge is a recorded outcome, not a claim that the file was
successfully converted.

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
