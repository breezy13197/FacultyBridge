# ExamBridge v1.7.2 — QA Results

## Scope
Parser correctness and Question Review UX. v1.7.2 implements the five issues identified during PHA3129 review: filter counts, attention-first rule ordering, correct length-cue coverage, FITB classification, and removal of attachment/response artifacts from stems.

## Static checks
- PASS — JavaScript syntax (`node --check`)
- PASS — visible version is v1.7.2
- PASS — canonical `Fill in the blank` item type exists
- PASS — Question Review includes `Fill in Blank` filter
- PASS — filter pill counts use the same filtering function as the displayed table
- PASS — rule cards use attention-first ordering
- PASS — attachment block is separated before student-visible stem parsing

## Four real-exam parser/evaluator regression

| Fixture | Questions | Points | Multiple response | K-type | FITB | Parser |
|---|---:|---:|---:|---:|---:|---|
| PHA3109 | 52 | 53 | 10 | 0 | 0 | Pass |
| PHA3129 | 50 | 54.5 | 1 | 0 | 9 | Pass |
| Biochemistry control | 58 | 66 | 0 | 2 | 0 | Pass |
| PHA4220 | 57 | 57 | 6 | 0 | 1 | Pass |

### PHA3129 FITB
Detected as `Fill in the blank`:
**Q9, Q19, Q24, Q25, Q26, Q33, Q34, Q35, Q49**

The user-reported Q24–Q26 are all correctly classified as FITB.

Expected PHA3129 Question Review counts in the all-faculty scope:
- All: 50
- Action Needed: 0
- Needs Review: 0
- Manual Check: 11
- Multiple Response: 1
- Fill in Blank: 9
- Weight: 0
- Figures: 0
- Answer Key: 0
- Length Cue: 0
- Writing: 0
- Tags: 0

The Manual Check total includes the nine FITB items plus two remaining nonconventional `Other` items (Q3 and Q20).

## Correct-answer length cueing
The evaluation denominator now means “conventional single-key MCQs structurally examined,” while the median >=4-word threshold remains only a noise-control threshold for producing a finding.

- PHA3109: evaluated 41 of 52; Q47 review finding retained
- PHA3129: evaluated **38 of 50**; no finding
- Biochemistry control: evaluated 52 of 58; no finding
- PHA4220: evaluated 49 of 57; no finding

This resolves the misleading PHA3129 `Evaluated 1 of 50 questions` display.

## Answer-key correction
PHA3129 Q25, Q33, and Q49 no longer generate false conventional missing-answer-key actions. The PHA3129 Correct-answer keys rule is now Pass and evaluates the 39 questions with conventional parsed options.

## Stem / attachment separation
Across all four real exams:
- PASS — zero `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, or `.tiff` filenames remain in parsed stems
- PASS — zero pipe-delimited FITB answer-key artifacts remain in parsed stems

PHA3129 Q24 now ends with the faculty-written `(See attachment)` text rather than `1 1. 8 Figure for question 120723.png`. Q25 and Q26 likewise exclude response banks, keyed answers, and image filenames.

## Structural controls retained
- PASS — PHA3109 Q28 remains `Matching`, not FITB
- PASS — Biochemistry K-type remains exactly Q46/Q47
- PASS — PHA4220 multiple response remains 6/57
- PASS — PHA4220 Q44 is recognized as FITB
- PASS — Writing Review positive controls remain intact

## Filter semantics
Action Needed, Needs Review, and Manual Check pills count questions carrying that finding level, even when a higher-priority primary status is also present. This keeps the pill count aligned with “questions tagged by this check” rather than hiding overlapping findings.

## Persistence
The v1.7.1 localStorage namespace is intentionally retained so saved exceptions and report notes carry forward into v1.7.2.
