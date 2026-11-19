# Shared schedule reader

`schedule-reader.js` reads the course schedule table out of a Word (.docx)
syllabus. **CalendarBridge and SyllabusBridge both use it**, so when a new
syllabus layout is not read correctly, fixing it here fixes it in both tools.

## What it does

- Finds the schedule table (or tables, when the schedule continues in a second
  table with no header row).
- Works out what each column holds from its heading (Date, Day, Time, Topic,
  Instructor, Reading, Lecture #).
- Gives one entry per dated class period: the date as written, the day, the
  time printed in the row, the topic, the instructor text, and the reading.
- Handles the layouts that have caused trouble before: boxes merged down from
  the row above, "Tuesday (date) or Wednesday (date)" alternate lab sections,
  several dates in one box, "Week N" heading rows, dates written as `9/21/26`,
  `21-Sep`, `Sept 21`, or `December 9th, 2026`, and times such as
  `8:00 a – 5:00 p`.
- Records where each entry came from in the Word file (row, line, and box), so
  SyllabusBridge can write edits back to the right box. A box merged down from
  an earlier row belongs to that earlier row in Word, so it is never given as
  the source of a later row's field.

## What it does not do

It only reads. Each tool keeps its own rules for what to do with the entries.
For example, CalendarBridge turns them into calendar events and fills in missing
times. SyllabusBridge leaves the faculty blank on exam and holiday rows and runs
its validation checks.

## Changing it

1. Add a made-up example of the layout to `tests/browser.mjs` and check
   **both** tools' results. Never use a real syllabus with real names.
2. Run `npm run validate:quick`.
3. The file's logic hash is recorded in `tests/import-baseline.json`. Update it
   only after the change has been reviewed.
