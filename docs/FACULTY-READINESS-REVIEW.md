# FacultyBridge — Readiness Review for Broader Faculty Use

Review date: 2026-11-06 · Commit reviewed: `c2efa6b` · Suite 1.4.0 / UI 1.1.0

This review asks one question: **can a faculty member who has never seen these tools use them tomorrow, alone, without getting a wrong result they trust?** It covers all seven tools plus the FacultyBridge landing page. It focuses on the areas requested: data-handling risks, confusing workflows, export compatibility, accessibility, and missing instructions.

It does not replace [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). It adds a reviewed findings list and a short rollout checklist for moving from "the author uses it" to "the department uses it."

## Verdict

**Not ready for broad release yet. Ready for a small, supervised pilot after one fix.**

- One confirmed defect changed the text of quiz answers that faculty import into Brightspace and Poll Everywhere (finding B1). It has since been fixed, with a regression test.
- The repository's own release checklist still lists open gates: real-course regression runs, a test on managed Windows/Edge computers, and the QuestionBridge progress-bar issue (B2). Those gates exist for good reasons. They are not yet closed.
- Faculty have no in-tool way to get help, and most tools don't say where to find the file they need (M5, M6). A colleague who gets stuck will quietly stop using the tool, and you won't hear why.

Everything else is fixable in normal follow-up work. The underlying safety design is strong. See [What works well](#what-works-well).

**Severity levels used below:**
- **Blocker:** produces wrong output someone would trust, loses data, or stops some users entirely. Don't release.
- **Major:** the person can finish, but will be confused, need help, or hit it often.
- **Minor:** polish, or a rare case with a workaround.

## Blockers

| # | Tool | Finding | Evidence | Fix |
|---|---|---|---|---|
| B1 | QuestionBridge | **Fixed (QuestionBridge import CSVs now write text exactly as entered; regression test in `e2e/workflows.spec.js`).** **Answers that begin with `-`, `+`, `=`, or `@` get an apostrophe added in Brightspace and Poll Everywhere exports.** An answer of `-2` imports as `'-2`, and `+1` imports as `'+1`. Students would see the stray apostrophe. Pharmacy calculations, charges, and pH questions often have answers like these. | I ran the real shipped file (`dist/standalone/QuestionBridge-v4.1-build1.4.0.html`), loaded one question with answers `-2`, `+1`, `0`, and `@ physiological pH, -1`, and called `makeBrightspace()` and `makePoll()`. Output: `Option,100,'-2,` and `Option,0,'+1,`. The cause is `csvCell()` in `apps/questionbridge/questionbridge.js`. It adds a protective apostrophe meant for spreadsheet files, but these two files go into other systems for import, not into Excel. The Poll Everywhere correct-answer marker hides the problem for correct answers (`***-2` isn't changed) but not for wrong answers (`'+1`). | Use the apostrophe guard only for files people open in Excel (reports). Use a plain CSV writer for import files. Add an end-to-end test with a negative-number answer for each export format. *Note:* this changes business logic, so `tests/import-baseline.json` will need a reviewed update. |
| B2 | All | **QuestionBridge progress bar fixed** (a step is checked only when its work is done; regression test in `e2e/questionbridge-readiness.spec.js`). The other gates below are still open. **Release gates in the repo's own checklist are still open.** These are: the four-exam ExamBridge and nine-syllabus SyllabusBridge/CalendarBridge regression runs, the managed Windows/Edge check, and the QuestionBridge progress bar. The progress bar still marks steps "done" based only on position: `show()` in `questionbridge.js` adds `is-done` to every earlier step, even when nothing was reviewed or validated. | "Reviewed status and remaining gaps" table in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). I confirmed the `show()` logic in the current source. | Close each gate with private evidence, or record an exception with an owner and a reason. For the progress bar, mark a step done only when its work is actually complete. For example, "Review" is done when every question is confirmed, and "Validate" when no errors remain. |

## Major

| # | Tool | Finding | Evidence | Fix |
|---|---|---|---|---|
| M1 | CalendarBridge | **Calendar files have no time zone.** Event times are written as "floating" times, like `20260901T090000`, with no zone attached. Each calendar app then guesses the zone from the device or calendar settings. If a faculty member's calendar is set to another zone (traveling, remote faculty, or a Google Calendar left on a default zone), every class shows up shifted by hours. Nothing in the tool mentions time zones. | `dateTimeStamp()` and `buildIcs()` in `apps/calendarbridge/calendarbridge.js`. A search for "time zone" in CalendarBridge returns nothing. | Write times with the institution's time zone, using a time-zone section (`VTIMEZONE`) and a zone label (`TZID`) in the file, or convert them to UTC. Then confirm by importing into Outlook (desktop and web), Google Calendar, and Apple Calendar on a device set to a different zone. |
| M2 | CalendarBridge | **Updated calendars may duplicate events instead of replacing them.** Changed events keep the same event ID, which is good. But the file has no revision counter (`SEQUENCE`, which calendar apps use to recognize a newer version of an event), and every event is always marked `STATUS:CONFIRMED`. Some calendar apps, Outlook in particular, may ignore the update or add a second copy. Removed events have to be deleted by hand. The tool does say this and offers a removed-events report. | There is no `SEQUENCE` in `buildIcs()`. The removed-events note is in `apps/calendarbridge/index.html`. | Add `SEQUENCE` and increase it for changed events. Test re-importing in each calendar app. Write plain step-by-step instructions for "my syllabus changed — what do I do?" |
| M3 | QuestionBridge | **Fixed (guessed answer keys are held back from every export until confirmed, one at a time or with a "Confirm all" step that names each question; each export card says "N answer keys were guessed and not confirmed"; regression test in `e2e/questionbridge-readiness.spec.js`).** **Guessed answer keys can be exported after only a warning.** When the correct answer is inferred from Word formatting (for example, bold text), the question exports with a yellow warning. Faculty skim past warnings. A wrong key in an LMS quiz silently mis-grades every student. | `baseQuestionIssues()` treats `confidence !== 'high'` as `level:'warning'`, and `renderExport()` counts warned questions as included. | Either require a click to confirm before an inferred key exports, or state on the export card exactly: "N answer keys were guessed from formatting and not confirmed," with a link to each. |
| M4 | QuestionBridge | **Fixed for QuestionBridge (Home says work is saved in this browser on this computer; Home and Export have a "Clear saved work from this computer" button; regression test in `e2e/questionbridge-readiness.spec.js`). Still open: the ExamBridge note and the shared-computer reminder in faculty instructions.** **Exam questions are saved automatically on the computer, without an up-front notice.** Every edit is autosaved to the browser's storage. On a shared office, lab, or classroom podium computer, the next person to open QuestionBridge sees the "restored" exam. GradeBridge handles this well: saving is off unless turned on, and it states that names and IDs stay on this computer. | `saveAutosave()` writes `questionbridge-autosave`. The only mentions on the page are the "Autosave unavailable" and "Restored" banners. | Say on the first screen that work is saved in this browser on this computer. Add a clearly labeled "Clear saved work from this computer" button. Add a shared-computer warning to the instructions. ExamBridge also saves notes and exceptions for each exam. Mention that as well. |
| M5 | All | **Fixed in suite 1.5.0 (support note on every page, from `support.email` in `suite.json`).** **No way to get help or report a problem.** None of the eight pages has a support contact or a "report a problem" link. Faculty who get stuck will give up silently. | A search of every `apps/*/index.html` for support, contact, or report wording returns nothing. | Add a support contact to the shared footer. Include safe-reporting guidance: describe the problem and the tool version, and don't send student data or exam content. |
| M6 | Most | **Missing "how to get the file" and "what to do next" instructions.** The tools name the file they need ("ExamSoft Item Analysis CSV export," "Brightspace roster CSV") but don't say where to click in ExamSoft or Brightspace to get it. Only GradeBridge has a "How it works" panel. ExamBridge, ItemBridge, GroupBridge, SyllabusBridge, and the landing page have none. The repository README is written for developers, and there is no quick-start guide for faculty. | A search of each `index.html` for help or how-to sections. | Write a one-page quick start for each tool: what it does, which file to get and how to export it, the steps, how to check the result, and what to do if something looks wrong. Link it from each tool's header. Faculty-facing text belongs in the tool and in a short guide, not in this repository. |
| M7 | All | **Testing so far covers one browser family and synthetic files only.** This review ran the automated suite in Chromium only. Firefox, Safari (WebKit), managed-Windows Edge, and real course files were not tested. The release workflow also publishes on tag without the full cross-browser end-to-end suite. | See [Coverage](#coverage) below and the "Automation boundary" note in RELEASE-CHECKLIST.md. | Run `npm run test:e2e` (all six projects) and `npm run test:e2e:local` before release. Add `test:e2e` to the tag workflow. |

## Minor

| # | Tool | Finding | Fix |
|---|---|---|---|
| m1 | GroupBridge | The "Group list" CSV, which is meant to be opened in Excel, doesn't guard against cells that Excel would treat as formulas. ItemBridge does. The risk is low because the cells are roster names, but the two tools are inconsistent. | Reuse ItemBridge's `csvCell()` approach for `planCsv()` only. Don't use it for the Brightspace import file. |
| m2 | CalendarBridge | The calendar-file standard (RFC 5545) asks that long lines be split ("folded") at 75 characters. Long descriptions aren't split. Most apps tolerate this, but strict ones may not. | Split long lines when writing the file, and include a long description in the import test. |
| m3 | GroupBridge | The Brightspace group-enrollment file layout (`ENROLL,username,OrgDefinedId,group name,group code`) hasn't been checked against a real Brightspace import in this review. | Do one test import into a Brightspace sandbox course and record the result. |
| m4 | QuestionBridge | **Fixed (an "Answer N removed — Undo" note appears and receives keyboard focus).** Deleting a single answer (trash icon) happens immediately, with no confirmation or undo. Deleting a whole question does ask first. | Add an undo notice ("Answer removed — Undo"). |
| m5 | QuestionBridge | **Fixed (answer marker and delete buttons now have 40 × 40 px click areas, also at a 640 px-wide window, which matches 200% zoom; the marker reports whether it is the correct answer to screen readers).** The repo checklist says the answer-marker control is 22 px, below the 40–44 px target. My automated check covered first screens only, not the editor. | Enlarge its clickable area. Check it in the editor at 200% zoom. |

## What works well

Keep these. They are the reason the tools are close to ready.

- **GradeBridge's safety gates.** It refuses percentage-only exports and student IDs that Excel has damaged. It blocks the audit while any student is duplicated or unmatched or any score is missing. It also makes faculty confirm the Brightspace maximum points before download. All of these have end-to-end tests that pass.
- **CalendarBridge won't export while any event still needs review** (`exportReady()`). It also produces a removed-events report instead of silently dropping changes.
- **QuestionBridge validates each destination's limits as errors, not warnings.** Examples are Kahoot's 95- and 60-character limits and Poll Everywhere's 255-character limit. The export card also says how many questions will be left out.
- **File contents are consistently escaped before being shown on the page** (`safe()`/`esc()` in every tool). A strangely named file or student can't break the page.
- **Privacy:** nothing is sent over the network. The offline workflow tests pass for all tools in both formats. The only web addresses in the standalone files are required file-format identifiers and license links.
- **Accessibility basics hold on every first screen.** Each page has one main heading, no skipped heading levels, a language set, and a visible focus outline at every one of about 35 keyboard stops per page. There are no first-screen controls under 24 px, and every file picker opens from the keyboard.
- **The tools still start when browser storage is blocked**, with a fallback for every tool. Pop-ups are shared and accessible (Escape closes them and focus returns to where it was).
- **The standalone files are small** (60–300 KB), so they're unlikely to be damaged when shared by email or Drive.

## Workflows tested

- **First-time faculty member opening each tool cold.** First screens, keyboard reach, focus visibility, and file-picker access were checked in fresh browser contexts for all eight pages. No blocking problems were found. Where-to-get-the-file guidance is missing (M6).
- **Chemistry or pharmacy-calculation instructor exporting a quiz with negative answers to Brightspace.** This failed. See B1.
- **Course coordinator re-exporting a calendar after a syllabus change.** Reviewed in the code only. There is a duplicate-event risk and no time zone (M1, M2). This needs real calendar-app testing.

## Coverage

**Ran on the reviewed commit:**
- `npm run check`: 14 passed, 0 failed.
- `npm run test:browser`: every site, standalone, and storage-blocked check passed.
- `npx playwright test` limited to the Chromium projects (served website and standalone): 136 passed, 2 skipped. The 2 skips are local-only course-file tests, which need private fixtures.
- Custom checks against the shipped standalone files: the QuestionBridge export reproduction (B1), plus heading order, focus visibility, target size, and keyboard file-picker access on all eight pages.

**Code reviewed:**
- Browser-storage use in every tool, export writers, and CSV/calendar formatting.
- How each tool shows file contents on the page, and its export safeguards.

**Not tested. Don't assume these passed:**
- Firefox and WebKit.
- Managed Windows/Edge.
- Real course files: the four exams, nine syllabi, and real rosters.
- Actual imports into Brightspace, ExamSoft, Kahoot, Poll Everywhere, Outlook, Google Calendar, or Apple Calendar.
- Screen readers.
- Color contrast beyond the existing automated sampling.
- 200% zoom and mobile layouts.
- Screens past the first screen for accessibility.
- ExamBridge and ItemBridge rule-count ("denominator") accuracy on real exports.

## Assumptions worth challenging

1. **That a warning will be read.** This is the most damaging one if it's false. M3 relies on it, and so does every "included with warnings" count. Anything that can change a grade or an answer key should require a click to confirm, not just a yellow label.
2. That everyone's calendar uses the same time zone as campus (M1).
3. That a tool is used on the faculty member's own computer. Lab and podium computers break that (M4).
4. That faculty know how to export the right file from ExamSoft or Brightspace (M6).
5. That a successful download means a successful import. None of the receiving systems has been tested in this review (M7, m3).

## Recommended order of work

1. Fix B1 and add a regression test for every import format. This is the only confirmed silent data change.
2. Add a support contact and safe-reporting guidance to the shared footer (M5). This is cheap, and it's how you'll learn about everything else.
3. Make guessed answer keys require confirmation (M3), and fix the progress bar (B2). *Done for QuestionBridge.*
4. Add a time zone and `SEQUENCE` to calendar files, then test real imports (M1, M2).
5. Add the storage notice and a "Clear saved work" button to QuestionBridge (M4). *Done; the ExamBridge note is still open.*
6. Write a one-page quick start for each tool (M6).
7. Close the remaining RELEASE-CHECKLIST gates with private evidence (B2, M7).

## Practical rollout checklist

Use this together with [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). That checklist covers how to build and verify a release. This one covers how to put the tools in front of colleagues safely. Each item says what to do and why.

### Before anyone else uses it

- [ ] **Blockers fixed and re-tested.** B1 is fixed, with a negative-number answer test for every export format. *Why:* this is the only known wrong-output defect.
- [ ] **Full automated suite passes in all three browser engines.** Run `npm run validate` on the release commit, not just Chromium. *Why:* faculty use Edge, Chrome, and Safari.
- [ ] **Each tool is run once with real (private) course files**, and the output is compared with the recorded expectations. *Why:* sample files are built to pass, and real files contain the odd cases.
- [ ] **One real test import into each receiving system**, using a sandbox or test course:
  - Brightspace grades (GradeBridge)
  - Brightspace groups (GroupBridge)
  - Brightspace quiz, Kahoot, Poll Everywhere, and ExamSoft (QuestionBridge)
  - Outlook, Google Calendar, and Apple Calendar (CalendarBridge)

  Then look at the result *inside* each system. *Why:* a file that downloads correctly can still import wrong.
- [ ] **Tested on one managed Windows computer with Edge**, opening the standalone file from the shared location (not from your desktop) with the network turned off. *Why:* institutional security settings and Drive or email handling are the most likely things to break that you can't see from your own computer.
- [ ] **Support contact and version visible** in every tool. *Why:* people can only report problems if they know where to go.
- [ ] **Quick-start page for each tool exists.** It covers what file to get, where to click to export it, the steps, how to check the result, and what to do if something looks wrong.

### Pilot (3–5 faculty, one or two weeks)

- [ ] **Choose pilot users with different setups**, for example a course coordinator, an adjunct, someone on a shared office computer, and someone who prefers the keyboard or uses zoom. *Why:* each one exercises different risks.
- [ ] **Watch at least one person use each tool for the first time without helping.** Note every point where they hesitate. *Why:* each hesitation is a missing instruction.
- [ ] **Have pilot users check their output inside the receiving system** before students see it, and tell you about anything unexpected.
- [ ] **Log every issue** with the tool version and a description only — no student data or exam content.

### Distribution

- [ ] **One shared location** for the current files, with older versions marked "superseded" or removed. *Why:* downloaded copies can't be recalled. A single source keeps people on the fixed version.
- [ ] **A short release note** that covers what changed, known issues with workarounds, and "if you downloaded an earlier copy, replace it."
- [ ] **A shared-computer reminder** in the release note: clear saved work in QuestionBridge and GradeBridge when you finish on a lab or podium computer.
- [ ] **A post-release check:** a week after release, ask pilot users whether anything went wrong. Re-run the smoke test from the shared location.
