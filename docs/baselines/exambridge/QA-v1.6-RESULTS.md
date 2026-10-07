# ExamBridge v1.6 — Build QA Results

Build-time regression checks were run against all four real ExamSoft exports in the regression set plus synthetic parser cases derived from QA Round 3.

## Real exports executed

- **PHA3109 Exam 1 (2026):** 52 questions, 53 points, parser validation Pass, 10 multiple-response, 0 K-type, Q35 wrong-course CLO retained, Q16/Q39 legacy retained, Q28 recognized as Matching/manual-check and retains its weight action. Correct-answer length cueing evaluated 25 of 52 questions and flagged Q47 for Review.
- **PHA3129 Exam 1 (2026):** 50 questions, 54.5 points, parser validation Pass, Q25/Q33/Q49 remain visible as unkeyed-answer findings under the current parser behavior, and the weight rule remains clean for visibly labeled nonstandard weights. Correct-answer length cueing evaluated 1 of 50 questions and produced no finding.
- **PHA3102 Biochemistry II Exam 1 (2021 control):** 58 questions, 66 points, parser validation Pass, K-type detection remains exactly Q46/Q47, and weight actions remain Q20/Q21. Correct-answer length cueing evaluated 15 of 58 questions and produced no finding.

- **PHA4220 Exam 1 (2026):** 57 questions, 57 points, parser validation Pass. Multiple response is 6/57 (10.5%) with Q3, Q21, Q24, Q38, Q47, and Q52 counted; K-type is 0. Q39 and Q44 are Manual Check items because they use nonstandard response formats. Seven legacy-tag questions remain Q11, Q13, Q19, Q21, Q28, Q29, and Q30. Tag-quality reporting identifies 13 cross-course CLO findings and 7 legacy findings, explicitly noting that 7 questions belong to both groups so the counts must not be added as independent problems. Correct-answer length cueing produced no finding on this exam under the v1.6 calibrated rule.

All four real-export fixtures have now been re-executed for v1.6.

## Synthetic reliability checks passed

- Unknown RTF ignorable destinations such as bookmark and field-instruction groups do not leak text.
- Binary payloads are consumed without leaking raw bytes into question text.
- A literal `Question #: 4` appearing mid-stem does not create a phantom question.
- `üA.` is recognized defensively as a keyed answer.
- The pharmacy abbreviation collision (`stage II`, `IV`, `PO`) does not classify as K-type.
- The validated I/II/III/IV K-type pattern remains positive.
- Short drug-name option lists are excluded from answer-length cueing.
- A uniquely longest keyed answer on a sufficiently wordy MCQ is flagged.
