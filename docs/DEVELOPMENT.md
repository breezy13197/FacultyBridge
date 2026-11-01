# FacultyBridge development workflow

## A small backlog

Use [GitHub Issues](https://github.com/breezy13197/FacultyBridge/issues) as the
shared work list. The development-work-item form asks for kind, priority,
problem, observable acceptance criteria, and validation/scope. High priority
means a safe workflow or release is blocked; normal means planned work; low can
wait. Avoid creating issues for every cosmetic adjustment.

For each nontrivial change, settle the criteria before implementation. For
example, a grade-import fix might require preserving leading-zero identifiers,
blocking ambiguous matches, and clearing old matches when input is replaced.
Keep real student/course files and private test output out of public issues.

The initial backlog is [#6: QuestionBridge completion states](https://github.com/breezy13197/FacultyBridge/issues/6),
[#7: export answer-key assertions](https://github.com/breezy13197/FacultyBridge/issues/7),
and [#8: first broader faculty release pilot](https://github.com/breezy13197/FacultyBridge/issues/8).
The pilot is a high-priority gate before broader distribution; the two targeted
QuestionBridge improvements are normal-priority development work.

## One coherent change per branch

Start with a clean working tree. From the repository root:

```sh
git switch main
git pull --ff-only origin main
git switch -c fix/short-description
```

If another PR merges while your change is underway, commit or safely set aside
your work, fetch, and merge `origin/main` into your feature branch. Resolve
conflicts and rerun the relevant checks. Do not pull another feature branch into
main just to inspect it.

Edit canonical `apps/`, `packages/ui/`, or build/test sources. Leave generated
`dist/` output uncommitted. Preserve business-logic baselines unless a deliberate,
reviewed processing change requires updating them.

## Fast feedback and complete validation

Install with `npm ci` and `npx playwright install`. Linux machines may also need
`npx playwright install --with-deps`; managed Windows machines do not use apt.
CI uses Node 22; local Node must satisfy the package's supported engine range.

| Command | Use |
|---|---|
| `npm run check` | Fast build, structural, syntax, token, baseline, and reproducibility checks. |
| `npm run validate:quick` | Build checks plus Chromium browser smoke for site and standalone. |
| `npm run test:e2e -- --project=chromium --grep QuestionBridge` | Example focused development run for one tool/browser. |
| `npm run validate` | Full pre-merge gate: quick checks, then Chromium/Firefox/WebKit in both formats. |
| `npm run test:e2e:local` | Private course-file regression; follow `tests/README.md`. |

Stop any preview using port 4173 before E2E. Shared runtime/build/UI changes
require all affected tools and formats. Documentation-only changes can use a
reduced scope with a reason recorded in the PR.

For a reproducible bug, make a meaningful regression check fail against the old
behavior and pass with the fix where practical. Check exported values and
decisions, not merely that a button works or a file downloads. Do not recapture
baselines just to make a failure disappear.

## Review and merge

Use the PR template. Link the issue (use `Closes #N` when it will actually be
resolved), describe the resulting behavior, and record commands/results plus
anything unverified. Review the actual diff for unrelated edits, accidental
baseline changes, and private data. A separate review pass is useful for
processing/export changes even when the author used an AI coding assistant.

The single **Suite checks** workflow contains:

1. `verify`: fixture guard, build checks, browser smoke, and the build artifact.
2. `test`: all six E2E projects, after `verify` succeeds.

Both job names are required by the active main-branch ruleset. Keep these names
stable or update the ruleset deliberately when changing CI. Full validation runs
on PRs into main/master and pushes to those branches, plus manual runs. Feature
branches without a PR use local checks until a PR is opened. New pushes cancel
superseded runs for the same PR/ref. Synthetic E2E reports are retained even on
success so retries and flaky outcomes can be inspected. Private local tests
remain outside CI.

Before merging, wait for both required checks on the latest commit and satisfy
the up-to-date-branch requirement. A green run is evidence for the automated
scope, not proof that manual/private release checks were completed.

## Handoff and release

Every handoff should state changed behavior, validation results, remaining
limitations, and release implications. Merge and release are separate actions:
follow [RELEASING.md](RELEASING.md) when preparing a distribution. Routine feature
work should not push tags or publish a release.
