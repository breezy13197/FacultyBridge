---
name: bridge-change
description: The standard FacultyBridge workflow for a fix or feature in one of the Bridge tools or the shared UI. Use when starting any nontrivial change to apps/<tool>/, packages/ui/, the build, or tests. It covers acceptance criteria, a failing regression check for bugs, design-system rules, validation, reviewer passes, and the handoff note.
argument-hint: "[what to change, e.g. 'GradeBridge: keep leading zeros in IDs']"
---

# FacultyBridge change workflow

The change requested: $ARGUMENTS

The person you are working with is not a programmer. Explain what you are doing
and why in plain language at each step, and ask before anything hard to undo.

Follow these steps in order. Do not skip one silently; if a step does not apply,
say so and why.

## 1. Understand and agree on what "done" looks like

- Identify which tool(s) are affected and read the relevant source in `apps/<tool>/`
  (and `packages/ui/` if shared UI is involved). Look for an existing GitHub issue.
- Write **observable acceptance criteria**: things a faculty member could see or
  check, such as "an ID of 00123 is still 00123 in the exported CSV", not "refactor
  parser". Show them to the person and get agreement before changing code
  (`docs/DEVELOPMENT.md`).
- Note whether the change touches **processing/export logic** (what goes into a
  downloaded file) or only **UI**. This decides the baseline and review steps below.

## 2. For a bug: prove it first

If the problem can be reproduced, add a check that **fails before the fix**:
a Node test in `tests/*.test.mjs`, or a Playwright test in `e2e/` (workflow
checks live in `e2e/workflows.js`). Run it and show it failing. Check exported
values and decisions, not just that a button works or a file downloads.
Use synthetic data only (see `e2e/data/` for the conventions: made-up names,
`@university.edu` emails, IDs like `900100001`). Never use real student records,
grades, exams, or credentials.

## 3. Make the change

- Edit only canonical sources: `apps/<tool>/`, `packages/ui/`, `scripts/`, `tests/`,
  `e2e/`. Never edit `dist/` (it is generated, and a hook blocks it).
- Keep each tool's business logic independent. Move UI into `packages/ui/` only
  if it is genuinely reused.
- **For any visible change**, first read `packages/ui/DESIGN-SYSTEM.md`,
  `packages/ui/PRODUCT-PRINCIPLES.md`, `packages/ui/DESIGN-CRITIQUE-CHECKS.md`, and
  `packages/ui/AGENTS.md`. Use the `--ft-*` tokens and `ft-*` components, keep tool
  identity colors fixed (ItemBridge teal, CalendarBridge orange, ExamBridge purple,
  QuestionBridge green, GradeBridge blue, SyllabusBridge gold/amber, GroupBridge
  coral), and keep status colors semantic. Support light and dark themes.
- Write user-facing text in plain faculty language, with American English spelling.

## 4. Baselines and versions

- `tests/import-baseline.json`: update it **only** for a deliberate, reviewed change
  to processing logic, never to make a failure go away and never for UI-only work.
  If it needs updating, explain why to the person first (a hook will ask them).
- Do not bump a tool version in `suite.json` unless the person says this is an
  intentional tool release. Shared build/UI changes use `suiteVersion`/`uiVersion`.

## 5. Validate

- While working: `npm run validate:quick`. For a focused browser check:
  `npm run test:e2e -- --project=chromium --grep <ToolName>`.
- Before handing off a source/build change: `npm run validate` (all browsers, both
  formats). Stop any preview using port 4173 first.
- For a bug, rerun the regression check from step 2 and show it now passes.
- Report real results. If something fails or could not be run, say so plainly.

## 6. Independent review

- If anything visible changed, use the **design-reviewer** subagent.
- Before committing, use the **privacy-reviewer** subagent on the changes, especially
  if any test data or fixtures were added.
- Fix confirmed findings, or explain to the person why a finding does not apply.

## 7. Commit, PR, and handoff

- Commit on the working branch with a clear message. Never push a release tag or
  publish a release; those are separate release actions (`docs/RELEASING.md`).
- Open the PR using `.github/pull_request_template.md`. Required CI jobs are
  `verify` and `test`.
- Finish with a handoff note in plain language covering:
  1. **What changed** for faculty (the behavior, not the code).
  2. **Commands run and their results**, including the before/after regression check.
  3. **What is still unverified**: for example private course-file regression
     (`npm run test:e2e:local`), managed Windows/Edge checks, or checking an import
     in Brightspace/ExamSoft. Also note release implications.
