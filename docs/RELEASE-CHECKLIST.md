# Faculty Tools — Release Checklist

Run this before sending any version of a Faculty Tool to a colleague.

**Why this exists.** Most software can be un-released: you revert the server and everyone gets the old version on their next visit. Faculty Tools cannot. Once someone has the file, they have it forever, and they will keep using it after you have fixed the bug. That single fact is what shapes this whole checklist — the goal is to catch problems *before* the file leaves your hands, because afterwards you have very little control.

Copy this file for each release and tick the boxes as you go.

---

## Release information

Fill this in first. It takes thirty seconds and it is what lets you answer "which version are you on?" six months from now.

| Field | Value |
|---|---|
| Tool | |
| Version number | |
| Date | |
| What changed in this release | |
| Known issues shipping with it | |

Writing down known issues is not an admission of failure. It is how you avoid re-investigating a problem you already knew about when a colleague reports it.

---

## 1 · Version visibility

- [ ] The version number appears somewhere a user can read without hunting for it
- [ ] The version number in the interface matches the version in the filename
- [ ] The version number matches what you wrote above

**What this is doing.** When a colleague emails "it flagged forty questions and that seems wrong," your first question has to be which build they are running. If the version is buried at the bottom of the fourth screen, they will not find it, and you will spend an hour debugging a problem you fixed two releases ago.

Put it in the top bar. One small line of muted text is enough.

---

## 2 · Distribution

- [ ] The file lives in one shared location (a Drive folder, a department page) rather than being emailed around
- [ ] Older versions have been removed or clearly marked as superseded
- [ ] You have opened the file *from that location* and confirmed it still works

**What this is doing.** A single shared location is the closest thing you have to a rollback button. If everyone opens the file from the same folder, replacing that file updates everyone. If the file has been emailed to fifteen people, you have fifteen permanent copies and no way to reach them.

The third item matters more than it sounds. Email systems and some Drive configurations will alter large HTML files in transit — stripping embedded content, changing character encoding, or refusing to serve the file as a web page at all. QuestionBridge in particular embeds a Word template directly in the file as a long block of encoded text; that is exactly the kind of thing that gets mangled. Always test the copy your colleagues will actually open, not the one on your own desktop.

---

## 3 · Fresh-start test

- [ ] Opened the tool in a private/incognito window, or a browser profile you have never used it in
- [ ] The first screen renders correctly with no saved data
- [ ] Every screen is reachable and does not error when it has nothing to display

**What this is doing.** These tools remember things — your theme choice, your saved project, your place in a workflow. That saved information lives in the browser and is invisible to you because you have been using the tool all along. Your colleague has none of it.

A private window gives you a browser with no memory of the tool, which is exactly the state every new user starts in. This is the single highest-value test on this list, because first-run is the state you never see and every colleague sees once.

---

## 4 · Real-content walkthrough

- [ ] Completed one full workflow start to finish using a real file, not a test fixture
- [ ] Did not open the code or use developer tools at any point
- [ ] The final output (report, export, download) is correct and openable

**What this is doing.** Automated tests check the parts. This checks the whole. Bugs that only appear when steps are combined — state left over from step two breaking step four — are invisible to unit tests and obvious within thirty seconds of actually using the thing.

The "did not open the code" item is the important one. If you find yourself opening the console to check whether something worked, that is a finding: your colleague cannot do that, so the interface is not telling them something it needs to.

---

## 5 · Browser and environment

- [ ] Tested in the browser your faculty actually use
- [ ] Tested on a university-managed machine if that is where it will run
- [ ] Tested with the network disconnected

**What this is doing.** Testing in your own browser tells you it works in your own browser. If your colleagues are on Edge on managed Windows machines with restrictive security policies, that is the environment that matters, and it can behave differently.

The offline test verifies a promise both tools make. ExamBridge and QuestionBridge both tell users their content is processed locally and never sent anywhere. Disconnecting the network and confirming everything still works is how you know that claim is true. It is also a real scenario — a colleague working from a hospital or a conference wifi that blocks things.

---

## 6 · Accessibility spot-check

- [ ] Pressed Tab through the main screen and could see where the focus was at every step
- [ ] Reached and activated the primary action using only the keyboard
- [ ] Status information (ready / needs review / error) is distinguishable without relying on color

**What this is doing.** Not every colleague uses a mouse, and some will have low vision or color blindness. These three checks catch the most common failures without needing specialist tooling.

The focus check is worth doing carefully. QuestionBridge v4.1 has a focus style written in the CSS that looks correct but does not render, because it references a color that was never defined. Reading the code would not have caught it. Pressing Tab does.

---

## 7 · Regression check

- [ ] Ran the known-good test files through the tool
- [ ] Compared results against the recorded expected values
- [ ] Investigated and explained every difference
- [ ] Updated the expected values where the new result is correct

**What this is doing.** A regression is when something that used to work stops working. They are easy to introduce and hard to notice, because you are focused on the new feature and not watching the old ones.

The defense is a set of files where you already know the right answer. For ExamBridge that is the four real exam exports and `QA-REGRESSION.md`. Run them, compare, and account for every difference — a change you cannot explain is a bug you have not found yet.

The last item matters. When the new result is genuinely better, update the recorded values. A regression file that disagrees with reality gets ignored, and an ignored regression file is worse than none, because it gives false comfort.

---

## 8 · Failure behavior

- [ ] Deliberately fed the tool something wrong (empty file, wrong format, corrupted document)
- [ ] The tool explained the problem in plain language rather than failing silently or showing a code
- [ ] The error message tells the user what to do next

**What this is doing.** Your colleagues will feed these tools things you did not anticipate. What matters is not preventing that, but what happens when it occurs.

Silent failure is the worst outcome, and it is the failure mode both of these tools have shown. A rule that examines nothing and reports a green pass is worse than a rule that crashes, because the user acts on a result that was never checked. When testing, be suspicious of anything that looks fine — ask whether it looked at the data at all.

---

## 9 · Sign-off

- [ ] Every blocker for this release is closed
- [ ] Known issues are written down above
- [ ] You would be comfortable if the most senior person in your department used this tomorrow, unassisted

The last item is the real test. If the honest answer is "I would want to be sitting next to them," the tool is not ready — that hesitation is pointing at something specific, and it is worth naming before you ship.

---

# Current release gates

These are the specific open items as of the last review. Update this section each release.

## ExamBridge v1.5 — not ready

- [ ] **N1** — the answer-choice-length check tests for the question type `'Multiple choice'`, but the parser produces `'MCQ'`. The strings do not match, so the check skips 184 of 200 eligible questions and displays a green pass on two exams it examined nothing in. One-word fix.
- [ ] **N2** — retune the length threshold. As written it flags 19% of every exam, mostly drug-name lists where the finding is meaningless. Recommended: flag only when the longest option is the correct answer *and* at least twice the median length, skipping questions whose median is under four words.
- [ ] **Rule denominators** — have every rule report how many questions it examined, not just its verdict. "Evaluated 51 of 52 questions; no outliers" and "no outliers" are different statements, and only one is trustworthy. This is the systemic fix for the kind of bug N1 is, and it pays off on every rule you write from here.
- [ ] Update `QA-REGRESSION.md` — it records six wrong-course findings for PHA4220; the current build reports thirteen, because seven legacy tags are counted in both buckets. Decide which is correct and make the file agree.

## QuestionBridge v4.1 — one hard gate

- [ ] **Undefined tokens** — six color variables are referenced in the CSS but never defined, so those rules are invalid and do nothing. Most visibly, the keyboard focus ring on the question list does not render. Replace: `--ft-lime` → `--ft-lime-500`, `--ft-accent` → `--ft-lime-500`, `--ft-accent-soft` → `--ft-lime-200`, `--ft-success` → `--ft-green-500`, `--ft-surface-subtle` → `--ft-surface-soft`, `--ft-lime-100` → `--ft-lime-200`.
- [ ] **Stepper completion state** — steps are marked done based on their position in the sequence, not on whether anything happened. Jumping to Export puts check marks on Upload, Review, and Validate even with no questions loaded. Tie each stage to a real condition.

Can follow in a later release:

- [ ] Contrast — `--ft-text-muted` and `--ft-warning` both fall below the 4.5:1 minimum. Darkening to roughly `#5c6660` and `#8a5300` clears three failures across every Faculty Tool at once.
- [ ] Destructive actions — Delete sits in a row of identical-looking buttons next to bulk actions that affect every question. Danger styling, spacing, and a confirmation.
- [ ] Touch targets — the correct-answer marker (22px) and delete-answer control (~18px) are below the 40–44px minimum. Wrap in larger hit areas and keep the visual size.

---

# The gap worth closing

Neither tool has any way to tell you when something goes wrong. A colleague hits a problem, works around it or gives up, and you never find out.

Given that local processing is a deliberate design commitment, sending error data somewhere is not the answer. But a visible message — "Something went wrong on the Validate step. ExamBridge v1.5. Please send this screen to [you]." — costs very little and turns a silent failure into a report you can act on.

That is probably the highest-value thing you could add that is not on the list above.
