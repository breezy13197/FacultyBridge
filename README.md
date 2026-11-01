# FacultyBridge

One repository for the FacultyBridge landing page and seven faculty tools. All eight applications use the same source layout and shared UI foundation. A single build produces a complete static website and self-contained HTML downloads from those same sources.

## Work locally

Node.js 22 or later is required. Building and the structural tests use Node built-ins and need no installed packages or network. Browser tests use the pinned Playwright development dependency.

```sh
npm run check
npm run preview
```

Open http://127.0.0.1:4173. For browser verification:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

For cross-browser Playwright tests, run `npx playwright install` followed by
`npm run test:e2e`. Uploaded course-file regression tests run locally with
`npm run test:e2e:local`; see [the testing guide](tests/README.md) for baseline
capture, privacy, coverage, and review requirements.

## Structure

| Location | Purpose |
|---|---|
| apps/facultybridge/ | Landing page |
| apps/<tool>/index.html | Tool markup |
| apps/<tool>/<tool>.css | Workflow-specific layout and styles |
| apps/<tool>/<tool>.js | Tool processing and interaction logic |
| packages/ui/ | One token, identity-theme, component, utility, and small shared-runtime library |
| vendor/ | One locally bundled JSZip dependency with its original license notice |
| suite.json | Suite/UI/tool versions, routes, imported source versions and SHA-256 provenance |
| scripts/ | Dependency-free build and preview server |
| tests/ | Build checks, imported processing-code parity, offline browser smoke checks |
| docs/baselines/ | Original tool documentation and regression expectations |
| dist/site/ | Generated website, ready for static hosting |
| dist/standalone/ | Generated individual HTML files and matching offline landing page |

Generated files are ignored by Git. Edit the source files and rebuild; do not maintain a second standalone source. Existing historical repository paths remain in Git as baselines. New work belongs under apps/.

The website retains the landing page's case-sensitive routes: /CalendarBridge/, /ExamBridge/, /GradeBridge/, /GroupBridge/, /ItemBridge/, /QuestionBridge/, and /SyllabusBridge/. All use relative paths so the site can be hosted under a repository subdirectory. Each tool links back to FacultyBridge. Standalone downloads include their own CSS and JS; keep the eight generated HTML files together to use the offline landing page.

## Shared design foundation

Typography, background/surface/text/status colors, spacing, radii, shadows, focus styles, and common components come from packages/ui. Each tool has its specified identity color in themes.css; success/warning/error colors remain separate. Compatibility aliases let existing selectors and processing code remain intact during the migration. Application-specific tables, editors, diagrams, and workflow layouts stay local. Existing per-tool class names remain alongside shared ft-* classes so their event handlers continue to work.

Dark/light preferences now use ft-theme across all tools. The shared runtime can import an earlier tool-specific theme preference. Saved questions, grade profiles, and other data keys retain their original names and formats. Browser storage belongs to its origin: moving a file to a hosted site cannot automatically transfer saved projects; export them from the original file first.

## Versions and releases

Suite 1.3.0 imports the provided baseline tool versions. This is a build/UI migration, not a replacement claim for a tool's feature release. Tool labels retain their supplied versions, with a visible Build 1.3.0 identifier; filenames include both. The landing-page version and seven tool labels/routes come from suite.json.

Use one branch/pull request per change. In the GitHub web UI, review and merge the migration pull request into main. Future releases use the tag facultybridge-v<the suiteVersion>, e.g. facultybridge-v1.3.0. The tag-triggered workflow validates the matching version, runs checks, and creates a GitHub Release with website ZIP, standalone ZIP, and checksums. Per-tool source versions remain independently tracked in suite.json. No website is deployed by this migration.

Pull requests and pushes run the same checks and upload downloadable build/QA artifacts. Review docs/RELEASE-CHECKLIST.md and use actual course files before distributing a release to colleagues. Automated migration checks do not replace the recorded exam and syllabus regression suites.

See docs/MIGRATION.md and docs/QA-MIGRATION.md for scope and remaining checks.
