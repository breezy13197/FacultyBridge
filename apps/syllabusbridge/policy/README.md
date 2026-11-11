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
  read, the wording each requirement looks for (`patterns`), the field "Fix
  this" opens (`fixField`), and the suggested action shown when it fails.
- **`confirmed`**: `false` means that part was not copied from the official
  policy document. The report says so next to the result. Once someone has
  checked it against the policy, change it to `true`.

The file ends in `.js` rather than `.json` only so the single-file offline
version of SyllabusBridge can include it. Everything inside the braces is
ordinary JSON data.

## Before the 2026-09-28 profile is released

The grading scale is confirmed (the official SUSOP scale supplied with the QA
review). One part is still marked `"confirmed": false`:

- **Accessibility statement.** The approved wording was not available, so the
  check looks for key phrases: disability or accessibility; reasonable (and
  appropriate) accommodations; and whom to contact (Disability Services or
  Student Affairs). Replace or add phrases from the approved statement, and
  fill in `campus.studentAffairsContact` if the contact should be checked.

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
