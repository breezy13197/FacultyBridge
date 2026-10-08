# ExamBridge v1.7.3 — QA Results

## Scope
Question Review workflow refinements and generalized FITB detection.

## Question Review UX
- PASS — expanded detail is inserted immediately after the selected question row rather than below the full table.
- PASS — filter/faculty re-render removes stale expanded detail.
- PASS — clicking an already-open row toggles the detail closed.
- PASS — question rows expose `aria-expanded`.
- PASS — `All` remains visible; zero-result filters are omitted.
- PASS — the filter bar states how many zero-result filters are hidden.
- PASS — filter counts still use the same underlying filter function as the displayed table.

For the PHA3129 all-faculty view, the visible nonzero filters are:
- All (50)
- Manual Check (11)
- Multiple Response (1)
- Fill in Blank (11)

The remaining eight zero-result filters are hidden with explanatory text.

## FITB parser regression

| Fixture | Questions | MR | K-type | FITB | Length-cue evaluated |
|---|---:|---:|---:|---:|---:|
| PHA3109 | 52 | 10 | 0 | 0 | 41 |
| PHA3129 | 50 | 1 | 0 | 11 | 38 |
| Biochemistry control | 58 | 0 | 2 | 0 | 52 |
| PHA4220 | 57 | 6 | 0 | 2 | 49 |

### PHA3129
FITB items are now:
**Q3, Q9, Q19, Q20, Q24, Q25, Q26, Q33, Q34, Q35, Q49**

Q3 now parses as:
> A solution with a pH of 6.5 is ____ times as acidic as a solution with a pH of 7.9. (Round your answer to the nearest whole number)

The new generalized inline-slot detector also correctly reclassifies Q20 as FITB.

### PHA4220
Q39 and Q44 are now recognized as FITB. Q39 is an inline multi-blank item and was previously classified as Other.

## Structural controls
- PASS — PHA3109 Q28 remains Matching.
- PASS — Biochemistry Q46/Q47 remain the only K-type items.
- PASS — PHA4220 remains 6/57 Multiple Response.
- PASS — zero image filename leaks in stems across all four real exams.
- PASS — JavaScript syntax check.
