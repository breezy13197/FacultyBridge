# ItemBridge v1.9 — QA Regression Baseline

These expected values were recorded by running ItemBridge v1.9's own `parseExam()` and `analyze()` logic against the three real ExamSoft exports used during ItemBridge development. Use the default Analysis Settings when comparing recommendation counts.

| Fixture | Takers | Items | Parse status | Item types | Priority | Remove | Revise | Review | Strong | Monitor | Healthy |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| PHA3134 Item-Analysis_Exam_2.csv | 72 | 50 | 50 ok · 0 unreadable | 38 SBA · 11 MR · 1 T/F | 15 | 3 | 8 | 4 | 29 | 2 | 4 |
| Item-Analysis_PHA3109_-_Exam_1.csv | 56 | 52 | 52 ok · 0 unreadable | 41 SBA · 10 MR · 1 FITB | 16 | 4 | 8 | 4 | 29 | 5 | 2 |
| Item-Analysis_PHA4220_-_Exam_1.csv | 56 | 57 | 57 ok · 0 unreadable | 49 SBA · 5 MR · 2 FITB · 1 T/F | 29 | 9 | 15 | 5 | 22 | 4 | 2 |

`Priority = Consider removal + Revision suggested + Needs review`.

## Parser exclusions

All three fixtures currently have:
- 0 unsupported sections
- 0 skipped item rows
- 0 unreadable items

Any future change from these values must be investigated and explained before release.

## v1.9 edge-case gates

- **Comma in free-text answer key:** a single-best-answer item whose `Correct Answer` text contains a comma remains `choice`, retains one keyed option, and parses `ok` when the option-level Correct flag identifies the key.
- **Small cohort:** a severe item at N=12 is downgraded to `Needs review`, and its action text explicitly states that the cohort is too small to recommend revision or retirement from psychometrics alone.
- **Blocked browser storage:** startup still wires the ItemBridge API, Choose Files control, and theme control when access to `localStorage` throws; persistence simply becomes unavailable.
- **Spreadsheet formula injection:** text cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with a single quote; numeric negative psychometric values remain numeric.
- **Keyed difficulty alignment:** all three real fixtures have 0 items rejected by the keyed-answer/difficulty coherence check after accounting for unanswered responses.

## Release procedure

For every ItemBridge release, rerun these three fixtures, compare every value above, and update this document only when a changed result is understood and intentionally accepted.
