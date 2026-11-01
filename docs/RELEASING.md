# Preparing and publishing a FacultyBridge release

This guide describes the current automation. Use it with the manual/content
gates in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). The tag workflow now
prepares a **draft**, rather than publishing automatically. Older checklist
references to immediate publication or a separate Playwright workflow describe
the previous automation; follow the process here for those steps.

## Prepare the release commit

1. Merge reviewed changes into main, satisfying required `verify` and `test`
   checks. Select the exact commit to ship.
2. Confirm `suite.json`, package metadata, visible versions, and release notes
   agree. Workflow-only changes do not themselves require a tool/suite version bump.
3. Complete representative private course-file regression and managed-machine /
   receiving-system checks for that commit, or record any explicitly accepted
   exceptions. Keep sensitive evidence private.
4. Start a release record from [the template](release-record-template.md).
   Preserve the previous known-good distribution for recovery.

## Request a draft build

Only when deliberately preparing a release, create and push
`facultybridge-v<suiteVersion>` on the selected main commit. The workflow:

1. Checks that the tag matches `suite.json` and its commit is already an ancestor
   of `origin/main`.
2. Calls the same `ci.yml` validation used by PRs: `verify`, followed by all six
   E2E projects in `test`. Failure prevents the packaging job.
3. Downloads `facultybridge-build` from that validation run, packages its site
   and standalone outputs, and creates a draft GitHub Release with both ZIPs
   and `build-manifest.json`. Packaging uses the tested build artifact.

No release is public and no website is deployed by these steps. Ordinary branch
pushes/PRs never trigger release preparation. Do not move an existing release
tag to a different commit; use a corrected version/tag if the source changes.
If a run fails, investigate before rerunning it. If draft creation already
succeeded, inspect the existing draft before retrying; the workflow will not
silently replace an existing release.

## Review the draft and publish

- Check that full CI results belong to the exact tagged commit. Review the E2E
  report for unexpected skips or retries. Local-file skips are expected in CI;
  missing required browser projects are not a complete gate.
- Download `FacultyBridge-website.zip`, `FacultyBridge-standalone.zip`, and
  `build-manifest.json` from the draft. Extract each ZIP into a separate folder.
  ZIP roots contain site/standalone **contents**, not their parent folders.
- Verify extracted file bytes against the manifest's `site/` and `standalone/`
  SHA-256 entries using the corresponding extraction root. These are per-file
  hashes, not hashes of the ZIP archives.
- Serve the extracted website at its intended base path and open the standalone
  HTML files directly from disk. Check links and representative import/export,
  including the faculty's managed browser and offline standalone use.
- Complete the release record and checklist, note known issues/workarounds,
  ensure all gates or accepted exceptions have sign-off, and edit the draft's
  generated notes into a concise description for faculty. Do not attach private
  course files, reports, screenshots, or sensitive evidence.
- Explicitly publish the draft in GitHub Releases when ready. Update the
  canonical distribution location, mark superseded versions, and test the
  actual shared copy. A hosted rollback does not update already downloaded
  HTML files; tell colleagues how to obtain the replacement.

Retain a safe release record with the published release or in the team's chosen
record location. Record private evidence locations without exposing their
contents. Browser reports/build artifacts in Actions expire after 14 days;
release assets and the completed release record provide the durable reference.
