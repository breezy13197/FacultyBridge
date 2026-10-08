# ExamBridge v1.8 — QA Results

## Scope
Adds four faculty-approved question-writing checks: rationale presence, stem/key wording overlap, 3–5 answer choices, and targeted problematic wording.

## Four-exam regression

| Fixture | Questions | Missing rationale | Stem/key overlap | Wording review | 3–5 choice violations |
|---|---:|---:|---:|---:|---:|
| PHA3109 | 52 | 30 | 4 | 9 | 0 |
| PHA3129 | 50 | 49 | 0 | 5 | 0 |
| Biochemistry control | 58 | 58 | 1 | 14 | 0 |
| PHA4220 | 57 | 14 | 3 | 7 | 0 |

Parser validation remains Pass on all four real exports.

## Rationale
- PASS — ExamSoft `Rationale:` text is parsed into a dedicated question field.
- PASS — rationale text is excluded from student-visible stem parsing.
- PASS — missing rationale generates Review, not Action Needed.
- PASS — rationale text is visible in expanded question detail when present.

## Stem / correct-answer overlap
Expected advisory findings:
- PHA3109: Q6, Q12, Q13, Q25
- PHA3129: none
- Biochemistry: Q50
- PHA4220: Q27, Q45, Q54

The rule evaluates conventional single-key MCQs and excludes common question/function words. It requires overlap to be distinctive to the keyed answer rather than shared by distractors.

## 3–5 answer choices
The current real-exam fixtures contain no parsed conventional choice-based violations.

Synthetic controls:
- PASS — 2-choice conventional MCQ → Action Needed
- PASS — 6-choice conventional MCQ → Action Needed
- PASS — zero-option/nonstandard formats are excluded from this hard rule and remain Manual Check when necessary.

## Targeted wording
ExamBridge reviews:
- absolute terms: `always`, `never`, `only`, `all`
- vague terms: `frequently`, `occasionally`, `usually`, `commonly`
- negative terms: `NOT`, `EXCEPT`, `INCORRECT`
- `All of the Above`
- `None of the Above`

Noise controls:
- PASS — `Select all that apply` does not produce a generic `all` warning.
- PASS — All of the Above is not duplicated as a generic `all` warning.
- PASS — structural K-type `only` wording is excluded from the generic absolute-term rule.

## Existing controls retained
- PHA3109: 52 questions, 10 MR
- PHA3129: 50 questions, 11 FITB, length-cue denominator 38
- Biochemistry: 58 questions, K-type exactly Q46/Q47
- PHA4220: 57 questions, 6 MR, Q39/Q44 FITB
- Image filenames remain excluded from parsed stems.
- JavaScript syntax check passes.
