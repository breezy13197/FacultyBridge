# ExamBridge v1.7 — Regression Expectations

These expectations combine the real-export regression set from v1.4/v1.5 with the reliability cases added after QA Round 3. The source exam files are not bundled with ExamBridge.

## Real-export structural checks

### PHA3109 — Exam 1 (2026)
- 52 questions, 53 points; parser validation passes.
- Multiple response: 10.
- K-type: 0.
- Wrong-course CLO remains Q35; legacy findings remain Q16 and Q39.
- AI authorship tags remain visible on 10 questions.
- Q28 remains a Matching/manual-check item and retains its weight action; it is not treated as an unkeyed MCQ.
- Correct-answer length rule evaluates eligible MCQs and must never report a pass with an evaluated count of 0 unless there are genuinely zero eligible questions.

### PHA3129 — Exam 1 (2026)
- 50 questions, 54.5 points; parser validation passes.
- Course/CLO full-path classification remains clean.
- Unkeyed findings remain Q25, Q33, and Q49 under the current v1 parser behavior.
- Non-predominant weights that visibly declare their weight remain clean.

### PHA3102 Biochemistry II — Exam 1 (2021 control)
- 58 questions, 66 points; parser validation passes.
- K-type detection: Q46 and Q47 only.
- K-type limit passes at 2.
- Weight actions: Q20 and Q21.
- Legacy taxonomy remains surfaced.

### PHA4220 — Exam 1 (2026)
- 57 questions, 57 points; parser validation passes.
- Multiple response: 6/57 (10.5%): Q3, Q21, Q24, Q38, Q47, Q52.
- K-type: 0.
- Manual Check: Q39 and Q44.
- Six current PHA4221 wrong-course CLO findings plus seven PHA5372 legacy/wrong-course overlaps are reported as 13 cross-course findings with explicit overlap; they are not summed as 20 independent problems.
- Seven legacy-tag findings remain Q11, Q13, Q19, Q21, Q28, Q29, Q30.
- Correct-answer length cueing produces no finding under the v1.7 calibrated rule.

## v1.7 synthetic reliability checks

- `answerChoiceLengthCheck` recognizes canonical `MCQ`; there must be no `Multiple choice` type string in rule guards.
- Length cueing: only single-key MCQs with at least 3 non-meta choices and median option length >=4 words are eligible. The keyed answer must be the unique longest option and >=2× the median.
- `None of the above`, `All of the above`, and `Both of the above` are excluded from length calculations.
- Every rendered rule shows `Evaluated X of Y questions`.
- RTF `{\*\bkmkstart ...}` and `{\*\fldinst ...}`-style ignorable destinations do not leak text into parsed output.
- RTF `\binN` data is consumed even inside skipped groups; raw image bytes must not leak into stems.
- Literal `Question #: 4` embedded mid-stem does not create a phantom question; question markers must begin a line.
- A correct-answer marker exported as `üA.` is treated as keyed.
- Pharmacy abbreviation collision such as stem `stage II ... IV therapy` with options `IV only / PO only / IV and PO only` is **not** K-type.
- Known K-type pattern with I, II, III, IV statements and combination answers remains K-type.
- Workflow step buttons have active click behavior.
- Exceptions and report notes save to local storage using an exam-specific key and restore on reopening the same exam.


## v1.7 Writing Review gates
- Writing findings are Review/advisory and must not change overall compliance status.
- Writing scope is student-visible stems and parsed answer choices; rationales are excluded.
- PHA4220 Q48: doubled word `this this` must be detected.
- Biochemistry Q45: `Phospholiase` should suggest `phospholipase`.
- Biochemistry Q33: unbalanced parenthesis must be detected.
- Negative question tasks using NOT / EXCEPT / LEAST / FALSE / INCORRECT are flagged for positive-stem rewriting, not merely emphasis.
- Parser artifacts such as image filenames, HYPERLINK destinations, and checkmark glyphs must not generate Writing findings.
- Report full vs partial Writing Review coverage.
- Target spelling finding rate remains <10% across the four real regression exams.


## v1.7.1 accessibility / presentation regression
- Keyboard focus must be visibly indicated on workflow steps, sidebar buttons, filter chips, icon buttons, upload zone, and ordinary `.ft-btn` controls.
- Active workflow step must expose `aria-current="step"`.
- Active sidebar section must expose `aria-current="true"`.
- Report modal must close with Escape, trap Tab/Shift+Tab while open, and restore focus to the invoking control when closed.
- `--ft-text-muted` light-theme token is `#5c6660`; `--ft-warning` is `#8a5300`.
- `Evaluated X of Y questions` remains visible for all rule rows, including complete Pass results.
- Identical Writing Review findings occurring in multiple choices are collapsed into one finding listing all locations.
- Item Quality sidebar entry is visibly labeled Advisory.
- No new analysis rules are introduced relative to v1.7.


## v1.7.2 parser / review UX regression
- Question Review filter pills display counts matching the active faculty scope and actual filter results.
- A Fill in Blank filter is present.
- Rule cards render non-pass findings before passing checks within composition, tagging, and item-quality sections.
- PHA3129 Correct-answer length cueing denominator is 38 conventional single-key MCQs examined, not 1.
- PHA3129 FITB items: Q9, Q19, Q24, Q25, Q26, Q33, Q34, Q35, Q49.
- PHA3129 Q24–Q26 are `Fill in the blank`.
- PHA3129 Q25 has no false conventional answer-key finding.
- PHA3129 FITB stems contain no response-bank/key material.
- No `.png`, `.jpg`, or other image filename appears in any parsed question stem across all four real regression exams.
- PHA3109 Q28 remains Matching, not FITB.
- PHA4220 Q44 is recognized as Fill in the blank.
- Existing parser validation, MR, K-type, weight, tagging, and Writing Review positive controls remain intact.


## v1.7.3 Question Review / FITB regression
- Expanded detail renders directly after the selected question row.
- Clicking the already-expanded row toggles the detail closed.
- Changing a filter or faculty scope removes any expanded detail.
- Zero-result filters are hidden; `All` is always visible.
- The filter area reports how many zero-result filters are hidden.
- PHA3129 FITB set is now Q3, Q9, Q19, Q20, Q24, Q25, Q26, Q33, Q34, Q35, Q49.
- PHA3129 Q3 stem renders `A solution with a pH of 6.5 is ____ times as acidic...`.
- PHA3129 Q20 is also correctly recognized as FITB.
- PHA4220 Q39 and Q44 are FITB.
- PHA3109 Q28 remains Matching.
- No image filenames leak into stems.
- Correct-answer length denominators remain PHA3109 41, PHA3129 38, Biochemistry 52, PHA4220 49.


## v1.8 question-writing guideline regression

### Rationale
- PHA3109: 30 questions missing a rationale
- PHA3129: 49 questions missing a rationale
- Biochemistry control: 58 questions missing a rationale
- PHA4220: 14 questions missing a rationale
- Rationale findings are Review/advisory only.
- Parsed rationale text must not leak into the student-visible stem.

### Stem / correct-answer overlap
- PHA3109: Q6, Q12, Q13, Q25
- PHA3129: none
- Biochemistry control: Q50
- PHA4220: Q27, Q45, Q54
- Rule applies to conventional single-key MCQs only and remains Review/advisory.

### 3–5 answer choices
- All four current regression exams have zero conventional parsed-choice violations.
- Zero-option nonstandard response formats must not fail this rule; they remain Manual Check.
- Synthetic regression should verify both a 2-choice and 6-choice conventional MCQ generate Action Needed.

### Wording elements
- PHA3109: 9 questions to review
- PHA3129: 5 questions to review
- Biochemistry control: 14 questions to review
- PHA4220: 7 questions to review
- `Select all that apply` must not create an absolute-term warning for the word `all`.
- `All of the Above` and `None of the Above` receive their own findings rather than duplicate `all` warnings.
- K-type option wording using `only` is excluded from the generic absolute-term check.

### Existing controls
All v1.7.3 parser/FITB, K-type, multiple-response, tagging, attachment, Writing Review, keyboard/accessibility, and denominator regressions remain in force.
