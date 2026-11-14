# FacultyBridge development

Read packages/ui/DESIGN-SYSTEM.md, packages/ui/PRODUCT-PRINCIPLES.md, and packages/ui/DESIGN-CRITIQUE-CHECKS.md before UI changes. Use the shared tokens, components, utilities, and component gallery. Follow packages/ui/AGENTS.md.

Canonical editable sources are apps/<tool>/; generated dist/ output must never be edited or committed. Use npm run validate:quick while developing and npm run validate before merging source/build changes. Documentation-only changes can use a reduced check scope if the PR explains it. Keep CI job names verify and test; the main branch ruleset requires both. See docs/DEVELOPMENT.md for issue/PR workflow and docs/RELEASING.md for the current draft-release process. Use docs/RELEASE-CHECKLIST.md for real-course regression and release sign-off. Never put real student records, grades, exams, or credentials in the repository. Test with synthetic or deidentified fixtures.

Keep tool business logic independent. Promote genuinely reused UI into packages/ui. Identity colors are fixed: ItemBridge teal; CalendarBridge orange; ExamBridge purple; QuestionBridge green; GradeBridge blue; SyllabusBridge gold/amber; GroupBridge coral. Status colors remain semantic.

suite.json is the source of version metadata, tool identities, source provenance, and routes. Bump a tool version only for an intentional tool release. Shared build changes use suiteVersion/uiVersion and visible build labels. Update tests/import-baseline.json only after a reviewed, intentional business-logic change; the imported hashes establish processing-code parity with the supplied attachments.

Claude Code configuration lives in .claude/ (see .claude/README.md): hooks block dist/ and private-fixture edits, a /bridge-change skill covers the change workflow, and design-reviewer and privacy-reviewer subagents review UI changes and new data before commits.

Start nontrivial work with observable acceptance criteria. For reproducible bugs, demonstrate a regression check failing before the fix and passing after it where practical. Every handoff states changed behavior, commands/results, and remaining verification or release limitations. Never push a release tag or publish a release as part of routine implementation; these are separate release actions.
