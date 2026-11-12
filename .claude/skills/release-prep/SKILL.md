---
name: release-prep
description: Prepare (but never publish) a FacultyBridge release. Works out what changed since the last release, proposes version numbers, prepares the version-bump PR, drafts faculty release notes, and starts a release record from the checklist. Only the person can start it.
disable-model-invocation: true
argument-hint: "[optional: tools in scope or intended suite version]"
---

# Prepare a FacultyBridge release

Extra details from the person, if any: $ARGUMENTS

The person you are working with is not a programmer. Explain each step in plain
language and why it matters.

## Hard limits (read first)

- **Never** create or push a `facultybridge-v*` tag, publish a GitHub Release, or
  deploy anything. Pushing the tag is the person's deliberate action after every
  gate is signed off (`docs/RELEASING.md`).
- **Never** mark a checklist item as done unless you ran the check yourself and
  saw it pass on the exact commit. Manual, private-file, managed-machine, and
  receiving-system checks belong to the person; list them as open for them to do.
- Never put real course files, student data, or private evidence into the repo,
  release notes, or PR. Record only *where* private evidence lives.

## Steps

1. **Find the starting point.** `git fetch origin main --tags`. Find the last release
   tag (`git tag --list 'facultybridge-v*' --sort=-v:refname | head -1`). If there is
   none, say so and use the versions in `suite.json` as the baseline.

2. **Work out what changed** since that tag: `git log --oneline <tag>..origin/main`
   and `git diff --stat <tag>..origin/main`. Group the changes by tool, shared UI
   (`packages/ui/`), and build/test/docs only.

3. **Propose versions** and wait for the person to agree:
   - A tool version changes only if that tool is intentionally being released with
     changes. Tools with no changes keep their version.
   - Shared UI/build changes raise `uiVersion` and/or `suiteVersion`.
   - Never change `sourceVersion`, `sourceFile`, or source hashes. They record where
     the code originally came from, not release numbers.
   - Workflow-only changes do not need a version bump by themselves.

4. **Prepare the version-bump change** on a branch (main is protected): update
   `suite.json`, plus `version` in `package.json` and `package-lock.json` to match
   `suiteVersion`. Refresh the "Reviewed status" table in
   `docs/RELEASE-CHECKLIST.md` if versions there are out of date. Run
   `npm run validate` and report the real results. Open a draft PR using the PR template.

5. **Draft faculty release notes** in plain language: what each changed tool now
   does differently, anything faculty must do (for example, export saved work before
   switching from a downloaded copy to the website), and known issues with
   workarounds. Show them to the person in the conversation; do not commit them
   unless asked.

6. **Start the release record** from `docs/release-record-template.md` and
   `docs/RELEASE-CHECKLIST.md`. Fill in only facts you can confirm (commit, versions,
   automated results you saw). Show it to the person and ask where they keep release
   records. It may reference private evidence, so do not commit it unless asked.

7. **Hand off** with a clear list:
   - What you prepared (PR link, versions, draft notes).
   - Automated gates you saw pass, and on which commit.
   - **Open items for the person**: private course-file regression
     (`npm run test:e2e:local`), the tool-specific content checks in section 4 of the
     checklist, managed Windows/Edge and offline standalone checks, receiving-system
     imports, and sign-off.
   - The next deliberate step, which is theirs: after the PR merges and all gates are
     signed off, push the tag `facultybridge-v<suiteVersion>` on that main commit to
     request a **draft** release, then review and publish it per `docs/RELEASING.md`.
