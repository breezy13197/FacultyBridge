# ItemBridge v1.9 — QA Notes

## Release intent
Reliability & regression hardening based on the v1.8.4 Lead QA review.

## Closed release gates
- B1 guarded all localStorage access and verified startup with storage blocked.
- B2 restored dark-theme contrast-safe muted and warning tokens.
- B3 made `index.html` self-contained by inlining the four stylesheet payloads; the CSS files remain in the package as maintainable source copies but are not required at runtime.
- M1 re-derived small-cohort action prose after recommendation downgrade.
- M2 multiple-response classification no longer depends on punctuation in the Correct Answer field.
- M3 real ExamSoft fixtures exercised and expected parse/recommendation counts recorded in QA-REGRESSION.md.
- M4 removed the undefined ft-mt-3 use; class-usage audit run as part of this release.
- M5 CSV cells beginning with spreadsheet formula triggers are neutralized unless the source value is numeric.
- M6 stepper no longer marks Review complete merely because Compare is open.

## Minor QA cleanup
- Expand control meets 40px minimum hit target.
- Small-cohort copy no longer produces “Consider before reuse.”
- Parsing banner handles singular/plural grammar.
- Changelog rebuilt with accurate version lineage.
- Inter removed from the font stack; nonstandard 750/850/900 weights normalized.
- Priority total now explicitly shows its removal/revision/review components.

## Required regression fixtures
1. PHA3134 Item-Analysis_Exam_2.csv
2. Item-Analysis_PHA3109_-_Exam_1.csv
3. Item-Analysis_PHA4220_-_Exam_1.csv

See QA-REGRESSION.md for recorded expected values.

## Verification performed
- All three real ExamSoft fixtures: 159/159 items parsed `ok`; 0 unreadable, unsupported, or skipped rows.
- Simulated blocked localStorage: application bootstrap still wires ItemBridge, Choose Files, and theme controls.
- Single-best-answer item with a comma in Correct Answer free text remains SBA when option-level Correct flags identify one key.
- Formula-like CSV text is neutralized; numeric negative psychometrics remain numeric.
- Faculty Tools class audit: 29 `ft-*` classes used, all defined.
- `index.html` has no external stylesheet/script dependency or network URL.
