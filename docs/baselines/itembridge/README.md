# ItemBridge v1.9

ItemBridge is a local, browser-based ExamSoft item-analysis review tool in the Faculty Tools suite. It prioritizes items that deserve faculty review, supports ExamSoft tag filtering, repeated-item comparison, and CSV export. Uploaded exam data remains in memory for the current session and is not sent over the network.

## v1.9 — Reliability & Regression Hardening

- Uses guarded browser-storage helpers so blocked localStorage only disables persistence; it no longer disables the application.
- Restores accessible dark-mode muted/warning colors.
- Softens both status and action language for small cohorts.
- Determines multiple-response structurally from keyed options rather than commas in free-text answer-key content.
- Accounts for unanswered responses in keyed-answer/difficulty coherence validation.
- Hardens CSV export against spreadsheet formula injection.
- Makes workflow completion truthful: Upload is complete only after a file loads; Review/Compare are views rather than falsely completed steps.
- Fixes the undefined `ft-mt-3` utility use and expands the item-detail touch target.
- Removes the dependency on an unshipped Inter font and normalizes nonstandard font weights.
- Clarifies Priority total as an aggregate of removal/revision/review tiers.
- Adds QA-REGRESSION.md with the three real ExamSoft regression fixtures and expected parser/recommendation results.

## Prior release lineage

- **v1.8.4:** flexible Administration period + optional Assessment metadata for chronological Compare.
- **v1.8.3:** source-level fixes for ExamSoft callout padding and Stem table geometry.
- **v1.8.2:** Compare redesign centered on question stems and exam-by-exam psychometrics.
- **v1.8:** Faculty Tools design-system/accessibility alignment.
- **v1.7:** parser/recommendation trust hardening, duplicate detection, chronological history metadata, current-view export, accessibility improvements.
- **v1.4–1.6:** unified review workspace, stem-based history matching, responsive expanded details.
- **v1.1–1.3:** teal/cyan identity, tag filters, exam removal, sortable All Items table.

## Storage

Persistent browser storage is limited to `itembridge-settings` and `ft-theme`. If browser storage is unavailable, ItemBridge continues to work; those preferences simply do not persist. Uploaded exams, questions, psychometrics, tags, administration periods, and Compare data remain in memory only.
