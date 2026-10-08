# Suite build migration — 1.3.0

## Imported attachments

| Application | Supplied version | Identity |
|---|---|---|
| FacultyBridge | 1.2 | Suite landing page |
| CalendarBridge | 7.5.9 | Orange |
| ExamBridge | 1.8 | Purple |
| GradeBridge | 6.0.1 | Blue |
| GroupBridge | 1.2.1 | Coral |
| ItemBridge | 1.9 | Teal |
| QuestionBridge | 4.1 | Green |
| SyllabusBridge | 2.1.2 | Gold/amber |

GroupBridge uses the supplied v1.2.1 attachment, matching the landing page. The supplied ExamBridge v1.8 is also imported as supplied; this migration does not imply the additional v1.8.1 selective-printing feature.

## What changes

Inline CSS/JS becomes modular source, duplicated token/framework definitions are removed, shared classes are added alongside legacy selectors, theme keys are unified, and metadata drives versions/routes. CalendarBridge's CDN JSZip reference becomes a local dependency shared with the two tools that already bundled it. Print/report HTML inside JavaScript template strings is preserved as script content, including its scoped styles.

Undefined QuestionBridge focus/accent/surface variables now reference defined shared tokens. Muted and warning text use the darker values already adopted by ExamBridge/ItemBridge. The shared stylesheet owns button/card/input foundations, keyboard focus, minimum shared control height, and build labels. Tool-specific layouts and modifier styles are retained; comprehensive visual redesign and replacement of every legacy class/spacing value are outside this migration.

No parser, matching algorithm, question conversion, exam rule, balancing algorithm, or export serializer is changed. The seven imported processing scripts match normalized original hashes after the whitelisted theme/class edits. Landing-page metadata generation is an intentional separate edit.

## Source control and deployment

The proposed tree extends the existing repository commit; it does not delete historical files. A new migration branch and draft pull request keep main unchanged until review. Existing historical single-file paths are superseded for development by apps/, and may be removed separately once migration is accepted. The generated dist/ tree is an artifact, not a second editable source.

The repository remains private. GitHub Actions creates downloadable artifacts; website hosting settings and repository visibility are unchanged. No real faculty/student data or original user uploads are committed.

## Release review still required

Run the original real-exam regression files and the nine-syllabus suite. These inputs were not among the supplied attachments. Also complete managed Windows/Edge testing and the full release checklist. The copied checklist contains historical gates for older versions; review them against current imports rather than treating every old entry as a newly confirmed defect.

QuestionBridge's stepper-completion behavior is preserved from the supplied baseline. This migration fixes undefined styling tokens but does not claim to close all prior tool-specific release gates. GroupBridge v1.2.1 processing logic matches its supplied attachment; targeted regression checks cover its roster, missing-value, swap, and export safeguards.
