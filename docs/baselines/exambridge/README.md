# ExamBridge v1.8

ExamBridge is a local-browser Faculty Tools application for reviewing ExamSoft exam exports against faculty-approved exam-writing and tagging guidelines.

## Run

Open `index.html` in a current Chrome, Edge, Firefox, or Safari browser. No server or installation is required.

## Supported input

- ExamSoft Word exports saved as `.doc` when the file is RTF-based (the format used by the provided ExamSoft export)
- `.rtf`

The exam is parsed entirely in the browser. ExamBridge does not send the file to a server.

## v1 checks

- Multiple-response questions: maximum 20% of exam questions
- Answer options: maximum 5 per question
- K-type questions: maximum 2 without approved exception
- Question weights: visible in the stem for questions >2 points or when an item differs from the predominant exam weight
- Required ExamSoft tagging: Course Name, Faculty Name, PSLO, CLO, abbreviated Bloom's level
- Tag-quality review: >2 PSLO/CLO tags, legacy curriculum tags, CLO tags from a different detected course
- Approved-exception recording for exceeded exam-level maxima
- Printable / Save-as-PDF report

## Important v1 assumptions

- Multiple response is detected primarily by more than one keyed correct answer, with common stem-language fallbacks.
- K-type detection is validated against known K-type Questions 46 and 47 from the supplied PHA3102 exam. It requires a Roman-numeral statement set including I/II/III plus combination-style Roman-numeral answer choices.
- A `PHA#### - Course Name` category is recognized as the course tag even when ExamSoft stores it inside the CLO taxonomy. The course inferred from the Exam Folder is displayed separately and is not treated as satisfying the required tag by itself.
- Figure integrity flags a likely figure/image reference when no attachment is detected. Attachments do not need an explicit “see figure” phrase.

## Files

- `index.html` — application shell
- `exambridge.js` — RTF parser, ExamSoft parser, rule engine, rendering
- `exambridge.css` — ExamBridge-specific styles
- `tokens.css`, `components.css`, `utilities.css` — Faculty Tools shared UI framework


## v1.1 changes

- Fixed padding in the loaded-exam summary card so exam metadata sits correctly inside the pill/card.
- Relaxed the variable-weight rule: ExamBridge requires weights on every stem only when more than 30% of questions differ from the predominant weight. Questions worth more than 2 points still require a visible weight individually.
- Corrected course-tag classification for ExamSoft taxonomies that store the `PHA#### - Course Name` category beneath the CLO hierarchy.
- Added bidirectional figure/attachment checks: a stem that references a figure must have an attachment, and an attached figure should be referenced by the stem.

## v1.2 K-type validation
K-type detection is now validated against an ExamSoft export containing two known K-type items (Questions 46 and 47). Detection requires both: (1) at least two distinct Roman-numeral statements in the stem and (2) at least two Roman-numeral combination answer choices such as "I and II only" or "I, II and III only." This reduces false positives from ordinary questions that merely contain Roman numerals.


## v1.2.2
- Fixed K-type parsing: Roman-numeral statement `I.` was previously misclassified as answer option I by the generic A–Z choice parser. Answer-choice parsing now accepts A–H, preserving I/II/III/IV statement blocks for K-type detection.
- Validated against the complete 58-question ExamSoft export: Questions 46 and 47 are detected as K-type.

## v1.3
- Added a Faculty filter to Question Review. Faculty can be combined with Action Needed, Review, Multiple Response, Weight, Figures, and Tags filters.
- Added an "Unassigned / missing faculty tag" filter so untagged questions remain auditable.
- Replaced the previous screen-print behavior with a purpose-built Exam Review Report.
- Print / Save PDF now opens a report-scope dialog where the user selects All Faculty, a specific faculty member, or unassigned questions.
- Faculty-specific reports filter question-level action/review items while preserving exam-wide compliance rules based on the complete exam.
- Printable report includes an action summary, required changes by question, review recommendations, exam-wide guideline status, approved exceptions, and optional notes.


## v1.4 changes

- Course detection now reads the full ExamSoft category path and no longer removes a category from CLO classification merely because the path also identifies the course. Course codes support optional spaces and 3–4 digits.
- Removed the noisy “attachment present but not referenced” warning. ExamBridge now flags only a likely figure reference with no detected attachment.
- Added fallback attachment recognition for hot-spot exports that emit a bare image filename.
- Added **Manual Check** for item formats whose option-dependent composition rules cannot be evaluated automatically.
- Multiple-response classification is preserved even when an export has no conventional option list.
- Questions with parsed answer options but no marked correct answer are Action Needed.
- AI authorship tags are surfaced as neutral information and are never treated as a policy violation.
- Parser validation compares parsed question/point totals with the export header and cross-checks per-question categories against `Categories Used in Exam` when available.
- Weight guidance now flags a missing visible weight when an item is worth more than 2 points **or differs from the predominant exam weight**.
- Reports include parser/audit metadata and an administration notice when exam-taker results are present.
- Question rows support keyboard activation, and dark-mode primary button contrast was corrected.
- See `QA-REGRESSION.md` for known real-export regression expectations.


## v1.5 item-quality check (superseded by v1.7 calibration)

- Adds an advisory **Answer-choice length balance** review.
- Evaluates conventional multiple-choice and multiple-response questions with at least three parsed options.
- Flags an option when its word count is at least 2× or at most 0.5× the median option length for that question.
- Excludes K-type and nonstandard item formats such as matching, hotspot, and fill-in/numeric items.
- Displays option word counts in question details and adds a **Choice Length** question filter.
- Findings are **Review**, not Action Needed, because unequal option length is a possible cue rather than an automatic guideline violation.


## v1.7 reliability release

- Corrected the v1.5 item-quality type guard by using the parser's canonical `MCQ` type constant.
- Recalibrated answer-length review to target the actual cueing risk: a single keyed MCQ answer that is uniquely longest, at least 2× the median option length, with a median of at least 4 words. “All/None/Both of the above” options are excluded from the calculation.
- Item-quality length findings remain question-level **Review** notes and do not turn the exam-wide status amber by themselves.
- Every rule now reports how many questions it evaluated, preventing a rule from displaying a confident pass after examining zero eligible questions.
- Hardened RTF parsing: all `\*` ignorable destinations are skipped by default while binary payloads are still consumed safely.
- Question boundaries now require `Question #:` at the beginning of a line, preventing literal stem text from creating phantom questions.
- Added defensive recognition of legacy `ü`/Wingdings-style correct-answer marks.
- Tightened K-type detection to require at least I, II, and III in the statement set, reducing false positives from pharmacy abbreviations such as IV/PO.
- Added canonical item-type constants to reduce string-drift bugs across rules.
- Workflow step buttons are now functional: Upload returns to file selection, Review returns to results, and Report opens report options.
- Approved-exception entries and report notes persist in local storage per exam. Choosing another exam now asks for confirmation; saved work is restored if the exam is reopened.
- Tag-quality summaries explicitly describe overlap when a category is both wrong-course and legacy rather than implying independent findings.
- Violet remains the intentional ExamBridge product identity; the shared Faculty Tools structure and semantic status colors remain unchanged.


## v1.7 — Writing Review

Writing Review is a local, advisory proofreading aid for student-visible question stems and answer choices. It does not alter the exam's compliance status and does not auto-correct faculty content.

Initial deterministic checks:
- pharmacy-aware high-confidence spelling corrections and drug-name handling
- doubled words and unbalanced punctuation
- negatively worded question tasks (NOT / EXCEPT / LEAST / FALSE / INCORRECT), which are flagged for rewriting rather than emphasis
- article-option grammatical cueing
- coverage reporting distinguishes fully evaluated from partially evaluated questions

General grammar checking is intentionally deferred because sentence-fragment answer choices create excessive false positives. Rationales are excluded.


## v1.7.1 — Accessibility and presentation refinement

This release does not add new analysis rules.

- Added visible `:focus-visible` treatment for shared buttons, workflow steps, icon buttons, upload controls, and ExamBridge filter chips.
- Added `aria-current` state to the workflow stepper and results sidebar navigation.
- Added Escape-to-close, Tab focus trapping, and focus restoration to the report dialog.
- Improved light-theme contrast for muted/help text and warning text.
- Kept `Evaluated X of Y questions` visible on every rule as a deliberate reliability safeguard.
- Deduplicated identical Writing Review findings across multiple answer choices while preserving all affected locations.
- Shortened Item Quality explanatory copy and marked the sidebar entry as Advisory.
- Writing Review remains advisory and does not change compliance status.

### Faculty Tools brand-hue convention

Individual Bridge tools may use a distinct product brand hue. Shared structure, spacing, typography, semantic status colors, accessibility behavior, and components remain consistent across Faculty Tools. ExamBridge intentionally retains violet as its product identity.


## v1.7.2 — Parser correctness and review UX

- Question Review filter pills now show the number of questions the active faculty scope will display.
- Added a dedicated `Fill in Blank` filter.
- Exam composition, ExamSoft tagging, Item Quality, and report rule rows sort attention-first: Action Needed → Review → Manual Check → Pass.
- Correct-answer length cueing now reports the number of structurally inspectable conventional single-key MCQs examined. The four-word median threshold remains a finding/noise-control threshold, not an evaluation-denominator threshold.
- Added canonical `Fill in the blank` item type.
- ExamSoft FITB response banks and keyed responses are separated from student-visible prompt text before analysis.
- FITB items do not generate false conventional answer-key errors.
- Attachment blocks are separated before stem parsing so image filenames cannot leak into displayed question stems.
- Explicit classic matching prompts retain `Matching` classification even when they also contain text-entry instructions.

### PHA3129 validation
The current regression export identifies nine FITB items: Q9, Q19, Q24, Q25, Q26, Q33, Q34, Q35, and Q49. Q24–Q26 now display clean student-visible stems and Q25 no longer produces a false missing-answer-key Action Needed finding.

Saved v1.7.1 exceptions and report notes remain available in v1.7.2; the persistence namespace is retained for compatibility.


## v1.7.3 — Question Review workflow and FITB refinement

- Expanded question details now open immediately beneath the selected table row rather than at the bottom of the entire question table.
- Changing a question filter or faculty scope automatically closes any previously expanded question detail, preventing stale detail from remaining visible outside the active filter.
- Question Review shows `All` plus only filters that currently contain matching questions. A short note reports how many zero-result filters are hidden.
- Filter counts continue to respect the active faculty scope.
- FITB detection now recognizes inline ExamSoft response-slot markers embedded within a sentence or calculation prompt.
- Med Chem Q3 is now FITB. The same generalized detection correctly identifies Med Chem Q20 and PHA4220 Q39 as FITB as well.
- Inline response-slot numbers are rendered as a readable `____` in the student-visible stem instead of exposing ExamSoft's internal response marker.


## v1.8 — Faculty question-writing guideline checks

This release adds four checks from the approved question-writing guideline.

### Rationale included — Review
ExamBridge parses the ExamSoft `Rationale:` block and warns when no rationale is detected. Missing rationale is advisory and does not create a compliance failure. When present, the rationale is shown in expanded question detail.

### Stem / correct-answer overlap — Review
For conventional single-key MCQs, ExamBridge compares meaningful stem wording with the keyed choice. It flags distinctive words repeated in the stem and keyed answer when those words do not also occur in distractors. Common function/question words are excluded to reduce noise.

### 3–5 answer choices — Action Needed
Conventional choice-based items with parsed answer choices must contain 3–5 choices. Nonstandard zero-option formats, FITB, Matching, and image-based response items are not falsely failed; they remain Manual Check when ExamBridge cannot evaluate conventional answer-choice structure.

### Wording elements — Review
ExamBridge identifies the guideline's targeted wording elements:
- Absolute terms: always, never, only, all
- Vague terms: frequently, occasionally, usually, commonly
- Negative terms: NOT, EXCEPT, INCORRECT
- All of the Above
- None of the Above

Findings name the location (stem or option). `Select all that apply` is not treated as an absolute-term finding because it is an item-format instruction. K-type combination-choice `only` wording is also suppressed because it is structural to that format.
