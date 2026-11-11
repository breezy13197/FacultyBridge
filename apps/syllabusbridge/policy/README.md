# SyllabusBridge policy profiles

This folder holds the rules SyllabusBridge uses to check a syllabus against the
School of Pharmacy (SUSOP) syllabus policy. Each file is one version of the
policy, named by the date the policy was updated, for example
`susop-syllabus-policy-2026-09-28.js`.

Keeping the rules here, instead of inside the SyllabusBridge code, means a
policy change only needs a new file. The validation report says which file it
used ("Checked against SUSOP Syllabus Policy, updated 2026-09-28."), so a
printed report always shows which version of the policy it was checked against.

## What is in a profile

- **`campus`**: details that differ by campus, such as the Student Affairs
  contact named in the accessibility statement. Leave a value blank (`""`) to
  skip that comparison; the report then says it was not compared.
- **`gradingScale`**: the official percent → GPA table. Each row is a band of
  whole percents (`min` to `max`) and its GPA.
- **`contentChecks`**: one entry per check. Each lists the syllabus sections to
  read, the wording each requirement looks for (`patterns`) or the exact
  approved wording (`approvedText`), the field "Fix
  this" opens (`fixField`), and the suggested action shown when it fails.
- **`confirmed`**: `false` means that part was not copied from the official
  policy document. The report says so next to the result. Once someone has
  checked it against the policy, change it to `true`.

The file ends in `.js` rather than `.json` only so the single-file offline
version of SyllabusBridge can include it. Everything inside the braces is
ordinary JSON data.

## The 2026-09-28 profile

Every part is confirmed against the official policy: the grading scale (the
official SUSOP scale) and the accessibility statement (the approved wording
from the syllabus template, supplied 2026-11-11).

**Approved wording.** A check with `approvedText` compares the syllabus with
that text sentence by sentence. Capital letters, punctuation, quote marks, and
spacing are ignored. A word in braces, such as `{studentAffairsContact}`, marks
a campus-specific part that may say anything; the value set under `campus` is
then checked separately (for the accessibility statement, the Student Affairs
contact's name). If a campus has a different contact, change that setting.

## Adding a new version of the policy

1. Copy the newest file and rename the copy with the new policy date.
2. Change `id` (it must match the new file name without `.js`) and `updated`.
3. Edit the rules that changed.
4. In `apps/syllabusbridge/index.html`, add a line loading the new file next to
   the existing one, before `syllabusbridge.js`. Keep the old file and its line.
   SyllabusBridge uses the profile with the newest `updated` date.
5. Run `npm run check`. The test `tests/syllabusbridge-policy.test.mjs` checks
   that the new file is loaded, the grading scale covers every percent exactly
   once, and every pattern and field name is valid.
