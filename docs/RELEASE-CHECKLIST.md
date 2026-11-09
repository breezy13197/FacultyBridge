# FacultyBridge — Release Checklist

Use this before distributing a suite build or an individual tool to colleagues. Copy it into a release record, leave this template unchecked, and record evidence for the exact commit and artifacts being shipped. An unchecked required item blocks distribution; an exception needs an owner, rationale, and explicit sign-off.

Both the hosted website and downloaded HTML files come from `apps/` and the shared `packages/ui/` sources. A downloaded copy cannot be recalled, and replacing a hosted build does not update files colleagues already saved. Catch failures before distribution and keep one canonical place to get the current release.

## Release record

| Field | Value |
|---|---|
| Release owner / reviewer | |
| Release date | |
| Commit SHA / pull request | |
| Scope: changed tools and shared UI/build | |
| Suite version / UI version (`suite.json`) | |
| Tool versions (`suite.json`) | |
| Tag (`facultybridge-v<suiteVersion>`) | |
| Distribution URL and formats (website / standalone) | |
| Test runs and private regression evidence location | |
| Browsers / OS / managed-machine results | |
| Known issues, impact, workaround, and owner | |
| Exceptions accepted by / reason | |
| Previous release and recovery location | |

Keep course content, student identifiers, grades, exams, credentials, and content-bearing screenshots or logs out of public/shared release evidence. Record a private evidence location rather than attaching sensitive material.

## 1 · Source, versions, and scope

- [ ] Changes are reviewed in canonical `apps/<tool>/`, `packages/ui/`, or build/test sources. No generated `dist/` files or superseded historical HTML sources are edited or committed.
- [ ] `suite.json` identifies the intended suite/UI/tool versions, routes, and original source provenance. Tool versions change only for intentional tool releases; shared build/UI changes use suite/UI versions and visible build labels. Original `sourceVersion`/source hashes remain provenance, not release counters.
- [ ] Suite/package metadata (`package.json` and lockfile where applicable) and release notes agree with the intended release. Notes identify behavior changes, compatibility limits, and known issues.
- [ ] Each affected page visibly shows the expected tool version and `Build <suiteVersion>`. Standalone filenames match: `<Tool>-v<toolVersion>-build<suiteVersion>.html`.
- [ ] Shared changes are checked across the landing page and all seven tools, not only the tool where the change began.

The manifest is the version authority; see [the repository release overview](../README.md#versions-and-releases). This template's status snapshot below is not a substitute for reading the manifest at release time.

## 2 · Automated gates on the release commit

Use Node.js 22 or later. From the repository root, with no preview already using port 4173:

```sh
npm ci
npx playwright install --with-deps
npm run check
npm run test:browser
npm run test:e2e
```

`--with-deps` installs Linux browser prerequisites; see [the testing guide](../tests/README.md) for local setup.

- [ ] `npm run check` passes: builds all eight site pages and eight standalone HTML files; checks local assets, script syntax, defined CSS tokens, imported processing-code hashes, deterministic output, and per-file checksums.
- [ ] `npm run test:browser` passes for website and standalone builds, including smoke workflows, focus, contrast, and local dependency checks.
- [ ] `npm run test:e2e` passes in Chromium, Firefox, and WebKit for both served and standalone builds. Required projects actually ran; missing browsers or a partial run do not count as a complete gate. Private local fixtures are checked separately in section 4.
- [ ] Synthetic workflows verify downloaded contents, not just that a download occurs. Changed workflows/export formats have appropriate coverage in `e2e/workflows.js` and relevant safety/invalid-input cases.
- [ ] Both required jobs, `verify` and `test`, in **Suite checks** are reviewed for the exact release commit. Retain safe evidence, inspect unexpected skips/retries, and investigate every failure. Private local-file skips are expected in CI; missing required browser projects are not.

**Automation boundary:** `.github/workflows/release.yml` checks the tag against `suiteVersion` and requires its commit to be an ancestor of `origin/main`. It calls the shared `ci.yml` workflow: `verify` runs `validate:quick`, then `test` runs all six E2E projects. Only after validation succeeds does packaging use the tested `facultybridge-build` artifact to create a **draft** GitHub Release. Automation does not run private course-file regression, provide manual sign-off, publish the draft, or deploy a website. Follow [RELEASING.md](RELEASING.md) for draft review and explicit publication.

## 3 · Fresh start, saved work, and recovery

- [ ] Open every affected tool in a fresh browser profile/context with no saved data, in each distributed format. The first screen is usable, empty states explain the next action, and navigation cannot imply work was completed when nothing was loaded.
- [ ] Repeat with a synthetic saved project from the previous supported release. Open/save/reopen preserves expected fields, counts, and settings; document any incompatible format or migration.
- [ ] Reload during a workflow and verify promised persistence. Starting over, replacing input, and deleting the final item leave no stale output or enabled unsafe actions.
- [ ] Save/export a project before destructive changes and confirm it can be reopened where supported. Explain browser storage limits and how users recover if storage is unavailable or cleared.
- [ ] Theme preferences and startup remain usable when storage is empty; check blocked/unavailable storage for affected tools.

Storage belongs to a browser origin. Moving from a local file to a hosted site, or changing hosts, does not transfer saved projects automatically. Tell users to export from the old location first.

## 4 · Content regression and complete workflows

- [ ] Complete a full workflow for each affected tool using representative authorized course files, without relying on the console or editing code. Inspect the final output in the intended receiving application or a safe test import.
- [ ] Run private local regression with `npm run test:e2e:local`. Fixtures belong in ignored `tests/test files/` folders or a root selected by `BRIDGE_FIXTURE_DIR`; follow [the testing guide](../tests/README.md#uploaded-files-local-regression-only).
- [ ] Confirm fixture inventory covers the intended release set. The local runner requires nonempty folders, but does not prove all historical cases are present. Its Chromium website/count checks do not replace standalone, cross-browser, or semantic output review.
- [ ] Compare against reviewed expectations and explain every difference. For first capture, use `npm run test:e2e:local -- --capture`, then independently verify the captured results. Capture records behavior; it does not establish correctness.
- [ ] Update expected values only after a reviewed, intentional change. Never recapture simply to make a failing comparison pass. `tests/import-baseline.json` is a separate processing-code parity gate and must not be updated for test setup or UI-only changes.

Use these tool-specific checks as applicable; a shared runtime/build change requires coverage across all tools:

| Tool | Required content/output review |
|---|---|
| FacultyBridge | All seven case-sensitive tool routes, manifest-driven versions, back links, and offline landing links resolve, including under the intended hosting subdirectory. |
| ExamBridge | Run the four real exports against [regression expectations](baselines/exambridge/QA-REGRESSION.md) and [v1.8 results](baselines/exambridge/QA-v1.8-RESULTS.md). Check parser counts, answer keys, FITB/Matching, rule denominators, course/legacy overlap, and advisory vs compliance findings. For v1.8.1, verify report category selection, faculty scope, selected-only counts, passed-check toggle, and empty-selection disclosure. |
| ItemBridge | Run the three exports with default settings against [the v1.9 baseline](baselines/itembridge/QA-REGRESSION.md). Check exclusions/unreadable items, small-cohort safeguards, leading-zero IDs/quoted CSV, and spreadsheet formula protection. |
| QuestionBridge | Upload/paste, edit, validate, save/reopen, and inspect all four export formats (Brightspace, ExamSoft legacy, Kahoot, Poll Everywhere). Exercise correct answers, images/paths, embedded Word template, and deletion/reset. Confirm imports in safe receiving systems where available. |
| GradeBridge | Review identifier/score matching, duplicates, unmatched students, missing scores, confirmed maximum points, raw-point output, and refusal of percentage-only or Excel-mangled inputs. Inspect the Brightspace CSV before any safe test import. |
| GroupBridge | Check roster counts, missing-value denominators, full-group swaps, replacement cleanup, duplicate IDs, and group-code/integrity export guards; inspect enrollment actions. |
| SyllabusBridge / CalendarBridge | Run the nine-syllabus regression set and representative course schedules, including faculty/coordinator mapping. Review extracted dates/times, recurrence, assignments, unresolved-event export guards, and SyllabusBridge Course JSON → CalendarBridge handoff. Inspect/import calendars for correct times and faculty; review revision/removal behavior if affected. |

Keep all real course files, local baselines, downloads, and reports private and uncommitted. Local failure output may contain document names, paths, or page text even with screenshots/traces disabled. CI uses synthetic data only; do not upload private local runs as CI artifacts.

## 5 · Browser, offline, and privacy checks

- [ ] Test on the faculty's actual browser/OS, including managed Windows/Edge where used. Automated Linux browser engines do not establish managed-machine compatibility.
- [ ] Open the standalone HTML directly from disk with the network disconnected, then import, process, and export. Test the offline landing page with all eight sibling HTML files together.
- [ ] For the website, load it online, disconnect, and complete an affected workflow. Do not promise a fresh hosted-page load offline: the automated offline workflow disables networking after initial page load.
- [ ] Confirm processing makes no external HTTP requests, including failed attempts. Offline success alone does not prove nothing was sent when online; review the network assertions and any changed network-using code.
- [ ] Test actual downloads, popups/print reports, and file access under the institution's policies. Inputs remain local, and errors/support instructions do not ask users to disclose student data or exam content.

## 6 · Accessibility and failure behavior

- [ ] Tab through the workflow in both themes: visible focus, logical order, primary actions and file inputs reachable, and no keyboard traps. Check dialogs with Escape and focus restoration.
- [ ] Check statuses and validation without color alone, readable text/contrast, zoom/reflow, mobile layouts, and practical pointer/touch targets. Existing smoke contrast checks are not a comprehensive accessibility audit.
- [ ] Try empty, wrong-format, corrupt, and unsupported inputs. Errors explain the problem and next action; they do not leave a stale success, silently ignore data, or enable unsafe exports.
- [ ] A check that examined no eligible data says so rather than implying a verified pass. Findings, exclusions, and denominators agree with the imported content.
- [ ] Destructive actions make their scope clear and provide confirmation or recovery. Exercise reset, replacement, and bulk edits as well as single-item deletion.
- [ ] Users can identify the tool version/build and find a support contact. Error-report instructions request only a description and safe/deidentified details; screenshots can expose confidential content.

## 7 · Package and distribute

- [ ] Pre-tag automated, private regression, and manual gates and accepted exceptions are recorded. Pushing `facultybridge-v<suiteVersion>` deliberately requests a validated **draft** build; artifact review and publication sign-off follow below.
- [ ] Tag targets the reviewed commit already merged into `main` and matches `suite.json`. The draft packages the tested build artifact as `FacultyBridge-website.zip`, `FacultyBridge-standalone.zip`, and `build-manifest.json`.
- [ ] Download the actual draft release assets and extract each ZIP into a separate folder. ZIP roots contain site/standalone contents, not their parent folders. Verify extracted file bytes against the manifest's corresponding `site/` and `standalone/` SHA-256 entries using those extraction roots. The manifest hashes generated files, not the ZIP archives themselves.
- [ ] Serve the extracted website at the intended host/base path and open the extracted standalone files from disk. Verify all eight pages/files and navigation, plus a representative import/export from the distributed copy.
- [ ] Hosting/deployment is handled explicitly if needed; the release workflow packages files but does not deploy a website. Check the actual shared download location rather than a Drive/email HTML preview.
- [ ] Confirm packages, release notes, and attached QA artifacts contain no private course data, student records, credentials, or private test reports.
- [ ] Release owner/reviewer signs off on the draft artifacts and completed gates or accepted exceptions. Known issues and workarounds are visible, and colleagues can complete the workflow unassisted.
- [ ] Explicitly publish the approved draft in GitHub Releases. Use one canonical distribution location, mark older versions superseded, and retain the previous known-good artifacts for recovery. Tell users with downloaded copies how to replace them.
- [ ] Record a post-publication smoke result from the actual shared copy and how to report problems.

## Reviewed status and remaining gaps

Repository review: **2026-11-01**. This is source/test-coverage evidence, not certification that manual or private regressions passed for a release. Current manifest: suite **1.5.0**, UI **1.2.0**, FacultyBridge **1.3.0**, CalendarBridge **7.5.9**, ExamBridge **1.8.1**, GradeBridge **6.0.1**, GroupBridge **1.2.1**, ItemBridge **1.9**, QuestionBridge **4.1**, SyllabusBridge **2.1.2**.

| Earlier gate / gap | Current evidence and release action |
|---|---|
| ExamBridge v1.5 N1/N2: MCQ guard and length threshold | Superseded by current `apps/exambridge/exambridge.js`: canonical MCQ guard, single key, non-meta choices, median >=4 words, uniquely longest keyed answer >=2× median. Re-run the current four-exam expectations; do not carry the old v1.5 defect forward as an open finding. |
| ExamBridge denominators / PHA4220 discrepancy | Current code renders evaluated counts; the regression baseline explicitly records 13 cross-course findings with seven legacy overlaps, not 20 independent problems. Verify denominators and overlap in current outputs. |
| QuestionBridge undefined focus tokens / shared muted-warning contrast | Token definitions and QuestionBridge focus references are fixed in the shared migration; `check` guards undefined tokens and browser smoke checks sample focus/contrast. Full workflow and both-theme accessibility review remain required. |
| QuestionBridge completion stepper | **Fixed in source:** a step is checked only when its work is done. Upload: questions exist. Review: every question is complete and its answer confirmed. Validate: at least one destination is selected and nothing is blocked. `e2e/questionbridge-readiness.spec.js` covers this. Still confirm it during the manual workflow pass. |
| QuestionBridge destructive controls / touch targets | Question deletion, starting over, and clearing saved work ask first. Deleting an answer shows an Undo note. The answer marker and delete buttons now have 40 × 40 px click areas, covered by `e2e/questionbridge-readiness.spec.js`. Still check the editor by hand at 200% zoom and with a screen reader. |
| Full regression and managed-machine evidence | Historical [migration QA](QA-MIGRATION.md) records missing four-exam/nine-syllabus inputs and pending managed Windows/Edge review. New synthetic/local-runner coverage does not by itself close those gates. Attach current private evidence or keep distribution blocked. |
| Tag automation coverage | The release workflow now reuses `ci.yml` (`verify` then all six E2E projects in `test`) and creates a draft from the tested build artifact. Review full results on the exact tagged commit, exercise the draft assets, and explicitly publish only after private/manual gates and sign-off. |
| Storage fallback and accessibility labels | Suite 1.3.1 adds shared in-memory fallback when browser storage access throws, form labels/status announcements, and landmark/contrast fixes. `tests/browser.mjs` adds blocked-storage startup, form-name, and main-landmark checks. Verify affected workflows and explain that fallback storage does not persist across reopening; these checks do not certify all accessibility or persistence behavior. |
| Shared pop-up and unsaved-work warning | Suite 1.4.0 replaces the browser's built-in boxes and five home-made pop-ups with `packages/ui/dialog.js`. `tests/build.test.mjs` refuses `alert`/`confirm`/`prompt`, home-made `role="dialog"` markup, and per-tool `beforeunload`; `e2e/dialogs.spec.js` checks Escape, focus return, screen-reader role, and when each tool warns before leaving. Each tool's import-baseline hash was updated for pop-up code only. Run each tool's real-course regression below, and check Escape/focus by hand on managed Windows/Edge. Browsers show their own fixed wording for the leave warning. |
| Support and recovery | Suite 1.5.0 shows a support contact (`support.email` in `suite.json`), the exact build, and safe-reporting guidance on every page; `tests/build.test.mjs` requires the contact and `tests/browser.mjs` checks the note on every page in both formats. Before each release, confirm the contact is still monitored. Saved-project recovery and replacement guidance for downloaded copies are still needed. |

Automation statements rechecked against `ci.yml` and `release.yml`: **2026-11-09**. This focused documentation review does not update the manual/private regression status above.

Refresh this status table each release. Historical baseline and migration documents describe their recorded versions; investigate discrepancies against current source and reviewed outputs before changing expectations.
