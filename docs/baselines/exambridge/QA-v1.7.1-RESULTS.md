# ExamBridge v1.7.1 — QA Results

## Scope
Accessibility and presentation refinement only. No new analysis rules were added relative to v1.7.

## Static / implementation checks
- PASS — JavaScript syntax (`node --check`)
- PASS — visible version is v1.7.1
- PASS — `:focus-visible` exists for shared buttons, workflow steps, icon buttons, upload zone, and ExamBridge filter chips
- PASS — workflow maintains `aria-current="step"`
- PASS — sidebar maintains `aria-current="true"`
- PASS — report modal supports Escape, Tab/Shift+Tab trapping, and focus restoration
- PASS — Item Quality sidebar entry is labeled Advisory
- PASS — `Evaluated X of Y questions` remains visible on every rule
- PASS — Writing Review groups identical findings and preserves all locations

## Contrast verification
Light-theme ratios after the token updates:
- `--ft-text-muted` (`#5c6660`) on page background: **5.57:1**
- `--ft-text-muted` on soft surface: **5.38:1**
- `--ft-text-muted` on white: **5.96:1**
- `--ft-warning` (`#8a5300`) on white: **6.33:1**

These clear WCAG AA for normal text.

## Four-exam regression
The actual v1.7.1 parser/evaluator was executed against all four real ExamSoft exports.

| Fixture | Questions | Points | Multiple response | K-type | Writing Review |
|---|---:|---:|---:|---:|---|
| PHA3109 | 52 | 53 | 10 | 0 | 0 questions |
| PHA3129 | 50 | 54.5 | 1 | 0 | 0 questions |
| Biochemistry control | 58 | 66 | 0 | 2 | Q11, Q26, Q30, Q33, Q35, Q44, Q45, Q48 |
| PHA4220 | 57 | 57 | 6 | 0 | Q41, Q48, Q55, Q56 |

### Positive controls
- PASS — Biochemistry Q33: unbalanced parenthesis detected
- PASS — Biochemistry Q45: `Phospholiase` → `phospholipase`
- PASS — Biochemistry Q45 duplicate locations collapse to one finding: **options A, B, C, D**
- PASS — PHA4220 Q48: doubled word `this this`
- PASS — known Biochemistry K-type items remain exactly 2
- PASS — PHA4220 multiple-response count remains 6/57
- PASS — no duplicate Writing finding text remained within a question

PHA4220 also surfaces several additional high-confidence spelling corrections already supported by v1.7 (`symtpoms`, `tirzapatide`, `slimepiride`, `medulary`). These are not new v1.7.1 analysis rules.

## Release note
v1.7.1 retains ExamBridge violet as its intentional product hue. The README documents the suite convention: individual tools may use distinct brand hues while shared structure, typography, semantic status colors, accessibility behavior, spacing, and components remain consistent.
