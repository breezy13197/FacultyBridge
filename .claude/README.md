# Claude Code setup for FacultyBridge

This folder holds settings that Claude Code, the AI coding assistant, uses
automatically when it works in this repository. It makes Claude follow the
rules in `AGENTS.md` consistently instead of relying on it to remember them.
Nothing here changes the Bridge tools themselves or what faculty see.

Everything is plain text and can be edited like any other file in the repository.

## Hooks: rules Claude cannot skip

A hook is a small script that runs every time Claude does a certain thing. The
hooks are listed in `settings.json`, and the scripts are in `hooks/`.

| Hook | When it runs | What it does | Why |
|---|---|---|---|
| `protect-files.mjs` | Before Claude edits or creates a file | **Blocks** edits to `dist/` and to the private course-file folders (`tests/test files/`, `tests/test-files/`, `tests/local-baselines/`). **Asks you first** before Claude changes `tests/import-baseline.json`. | `dist/` is generated and would be overwritten. The private folders may hold real course material. The baseline should change only after a reviewed logic change. |
| `check-syntax.mjs` | After Claude edits a `.js` or `.mjs` file | Checks the file can be read as valid code, in under a second. If not, Claude is shown the error and fixes it. | Catches a missing bracket right away instead of minutes later in `npm run check`. |

The protection hook covers Claude's file-editing tools. It does not inspect
shell commands, so it is a strong safeguard rather than an absolute one. The
CI fixture guard and the privacy reviewer below are additional layers.

## Skills: saved step-by-step workflows

Start a skill by typing its name with a slash in Claude Code.

| Command | What it does |
|---|---|
| `/bridge-change <what to change>` | The standard workflow for a fix or feature: agree on what "done" means, prove a bug with a failing test, make the change following the design system, validate, run the reviewers, and write the handoff note. Claude may also start this one on its own when it fits. |
| `/release-prep` | Prepares a release: what changed, proposed version numbers, the version-bump PR, draft release notes, and a started release record. **It never pushes a tag or publishes a release.** Those stay your deliberate steps. Only you can start this one. |

The files are `skills/bridge-change/SKILL.md` and `skills/release-prep/SKILL.md`.

## Subagents: specialist reviewers

A subagent is a second copy of Claude with one narrow job and its own
instructions (in `agents/`). It reviews with fresh eyes and reports back. It is
told not to edit files; the main Claude makes any fixes, where you can see them.

| Reviewer | Checks |
|---|---|
| `design-reviewer` | UI changes against `packages/ui/DESIGN-SYSTEM.md`, the product principles, and the design-critique checks: tokens, fixed tool colors, shared components, both themes, accessibility, plain language. |
| `privacy-reviewer` | New or changed files for anything that looks like real student records, grades, exam content, course files, or credentials. It knows this repo's synthetic-data conventions (see `e2e/data/`), so realistic made-up names are not flagged. |

Claude uses them automatically when a change matches their description, and the
`/bridge-change` workflow calls them. You can also ask directly, for example
"have the privacy reviewer check this before committing."

**Limits:** reviewers are a helpful second check, not a guarantee. The design
reviewer reads code; it does not see the rendered screen. The privacy reviewer
cannot know for certain whether realistic data is real, so it marks unclear cases
for you to check.

## Changing or turning things off

- To stop a hook, remove its entry from `settings.json`.
- To change what a skill or reviewer does, edit its `.md` file; the instructions
  are written in plain English.
- Personal settings that should not be shared go in `settings.local.json`, which
  Claude Code keeps out of git automatically.
