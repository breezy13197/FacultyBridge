# ExamBridge v1.7 — Implementation QA

## Implemented
- Writing Review is advisory (`affectsOverall: false`).
- Student-visible scope: stems and parsed answer choices; rationales excluded.
- Added Writing filter and report rule.
- Added high-confidence pharmacy-aware typo suggestions.
- Added doubled-word and unbalanced punctuation checks.
- Added negative-stem detection; negative tasks are recommended for positive rewriting rather than capitalization/bolding.
- Added article-option grammatical cue detection.
- Writing rule reports full vs partial coverage.
- v1.7 version is visible in the top bar.

## Regression expectations
See `QA-REGRESSION.md`. The four real ExamSoft exports remain the release fixtures. Positive controls include PHA4220 Q48 `this this`, Biochemistry Q45 `Phospholiase`, and Biochemistry Q33 unbalanced parenthesis.

## Scope limitation
This release intentionally does not claim general grammar checking. The deterministic Writing Review is a proofreading aid, not certification that an item is error-free.
