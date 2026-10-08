# Migration QA — FacultyBridge build 1.3.0

Verification repeated on 2026-10-08 using Node.js 24 and headless Chromium 138 on Linux.

| Check | Result |
|---|---|
| Eight site pages and eight self-contained HTML files build successfully | Pass |
| All referenced local assets resolve; no runtime CDN dependencies | Pass |
| Scripts compile, including report/print templates nested inside JS | Pass |
| Every referenced CSS token has a definition | Pass |
| Shared foundational token definitions are absent from application styles | Pass |
| Seven normalized processing-script hashes match the original attachments | Pass |
| Repeated builds produce identical files and checksum manifests | Pass |
| Fresh browser startup without stored projects, in both output formats | 16/16 pass |
| Theme toggles, visible version/build labels and desktop/mobile captures | 16/16 pass |
| Visible keyboard focus on the active smoke-test navigation path | 16/16 pass |
| Visible enabled shared primary/accent buttons meet 4.5:1 contrast in dark mode | Pass |
| Landing-page tool versions and links match the manifest | Pass |
| Shared dark theme persists from landing page to GradeBridge | Pass |
| Quoted CSV parsing preserves commas and leading-zero identifiers | Pass (GradeBridge/GroupBridge) |
| GroupBridge v1.2.1 synthetic roster generates two groups and exports four enrollment actions | Pass in both formats |
| GroupBridge missing-value denominators, full-group swaps, invalid roster retention, replacement cleanup, duplicate identifiers and group-code/integrity export guards | Pass in both formats |
| Local JSZip round trips work with external network requests blocked | Pass (CalendarBridge/QuestionBridge/SyllabusBridge) |
| Synthetic Word schedule extracts three events/rows | Pass (CalendarBridge/SyllabusBridge) |
| Pasted QuestionBridge question reaches the review editor | Pass in both formats |
| ExamBridge rejects a malformed non-RTF .doc upload with an actionable message | Pass in both formats |
| ItemBridge rejects an invalid item-analysis input | Pass in both formats |

Screenshots are generated into test-results/ (light, dark and 390-pixel mobile layouts). Animations are disabled during browser assertions and screenshots so transitional colors do not affect final-state checks. Light-mode desktop captures were visually reviewed across all eight applications, with selected full-size and dark-mode views checked for readability. This is a build migration smoke pass, not a comprehensive accessibility audit or tool release certification.

## Required before general faculty distribution

- The original four exam exports and nine test syllabi were not supplied here. Run their recorded regression expectations, including CalendarBridge faculty/coordinator mapping.
- Validate real file imports and final outputs on faculty-managed Windows/Edge machines.
- Review the QuestionBridge stepper completion state and other historical release gates against the actual imported versions.
- Complete docs/RELEASE-CHECKLIST.md. Keep the migration pull request as a draft pending those checks.
