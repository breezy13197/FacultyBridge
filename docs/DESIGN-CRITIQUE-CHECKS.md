# Design Critique — Checks Reference

**What this file is.** A written-out version of the checks a structured design critique runs. Drop it into a project folder (alongside `DESIGN-SYSTEM.md` and `PRODUCT-PRINCIPLES.md`) so that any reviewer — a person or an AI assistant — is working from the same list every time.

**Why write it down.** A critique done from memory drifts. One week you notice contrast problems, the next week you're focused on layout and contrast never comes up. A fixed list means the same questions get asked of every screen, so a problem can't survive just because nobody thought to look for it that day.

**How to use it.** Give the reviewer three things: the design (screenshot, live file, or description), the context (what it is, who uses it, what stage it's at), and optionally a focus ("just the upload screen"). Then walk the five sections below in order.

---

## Before you start: three inputs

| Input | Why it matters |
|---|---|
| **The design** | A screenshot, a live file, a URL, or a written description. Vague input gets vague feedback. |
| **The context** | What is this screen? Who uses it? What are they trying to do? A critique with no context defaults to generic advice. |
| **The stage** | Early exploration, refinement, or final polish. Early work should get feedback on direction and structure; final work should get feedback on spacing, contrast, and copy. Giving polish notes on a rough sketch wastes everyone's time, and giving direction notes the day before release is worse. |

---

## 1 · First impression (the two-second test)

Look at the screen for about two seconds, then look away and answer from memory. The point is to catch what a real user takes in before they start reading, because that first glance decides where they click.

- **What drew the eye first?** And was that the right thing? On a screen whose job is "upload a file," the eye should land on the drop zone, not the navigation bar.
- **What was the emotional reaction?** Calm and in control, or busy and uncertain? Faculty Tools are meant to feel calm and professional, so "cluttered" is a real finding, not a matter of taste.
- **Was the purpose obvious?** Could you tell what the screen is for without reading a paragraph?

---

## 2 · Usability

This asks whether someone can actually get their job done, which is a different question from whether the screen looks good.

- **Can the user accomplish their goal?** Walk one complete task start to finish, not screen by screen in isolation.
- **Is the navigation intuitive?** Can they tell where they are, where they've been, and how to go back without losing work?
- **Are interactive elements obvious?** Does a button look like a button? Is it clear which things can be clicked, dragged, or edited?
- **Are there unnecessary steps?** Every extra click needs to justify itself. Advanced options are fine as long as the basic path stays short.

---

## 3 · Visual hierarchy

Hierarchy is how the design tells the eye what to read first, second, and third. When it's wrong, everything looks equally important and the user has to work out the priority themselves.

- **Is there a clear reading order?** Trace how the eye moves through the layout. It should follow the order the task actually happens in.
- **Are the right elements emphasized?** One primary action per screen should visually dominate its area. If three buttons look equally strong, none of them is the primary.
- **Is whitespace doing real work?** Space is what groups related things together and separates unrelated ones. Cramped layouts read as harder than they are.
- **Is typography creating hierarchy?** Headings, labels, and body text should be distinguishable at a glance without relying on color.

---

## 4 · Consistency

Consistency is what lets someone who learned one tool already know how to use the next one.

- **Does it follow the design system?** Check against the documented tokens, components, and patterns rather than against your own taste.
- **Are spacing, color, and typography consistent?** Look specifically for hard-coded values where a token should be used — a one-off hex color or a `13px` gap that matches nothing else. These are the most common source of slow drift.
- **Do similar elements behave similarly?** If cards lift on hover in one place, they should lift everywhere they're clickable — and stay still everywhere they're not.
- **Are the tokens being referenced actually defined?** A variable that was never defined makes the whole CSS rule invalid and silently do nothing. This is easy to miss by reading and easy to catch by looking at the rendered screen.

---

## 5 · Accessibility

These are the checks that catch the failures affecting real users who don't work the way you do.

- **Color contrast.** Text against its background should meet WCAG AA — 4.5:1 for normal text, 3:1 for large text. Muted grays and amber warning text are the usual offenders.
- **Touch targets.** Primary controls should be roughly 40–44px. A control can stay visually small as long as the clickable area around it is large enough.
- **Text readability.** Font size and line height comfortable at arm's length, not just on your own screen at your own zoom level.
- **Alternative text.** Icons and images that carry meaning need a text equivalent.
- **Status not conveyed by color alone.** Pair every color state with an icon or a word, so red/green isn't the only signal.
- **Keyboard access and visible focus.** Tab through the screen. You should be able to see where focus is at every step and reach the primary action without a mouse.

---

## How to phrase the feedback

The framework is only half of it. The other half is whether the feedback is usable.

- **Be specific.** "The export button competes with the navigation bar" is actionable. "The layout feels confusing" is not.
- **Explain why.** Tie each finding to a principle or a user need, so it can be argued with on the merits rather than treated as personal preference.
- **Propose a fix.** Identifying a problem without suggesting a direction leaves the work half-done.
- **Say what works.** Not politeness — if a reviewer only lists problems, the good decisions get accidentally refactored away later.
- **Match the stage.** Direction notes early, polish notes late.

---

## Output format

Ask for findings in this shape so results stay comparable across reviews.

```markdown
## Design Critique: [Design Name]

### Overall Impression
[1–2 sentences — what works, and the single biggest opportunity]

### Usability
| Finding | Severity | Recommendation |
|---------|----------|----------------|
| [Issue] | Critical / Moderate / Minor | [Fix] |

### Visual Hierarchy
- **What draws the eye first**: [Element] — [Is that correct?]
- **Reading flow**: [How the eye moves through the layout]
- **Emphasis**: [Are the right things emphasized?]

### Consistency
| Element | Issue | Recommendation |
|---------|-------|----------------|
| [Typography / spacing / color] | [Inconsistency] | [Fix] |

### Accessibility
- **Color contrast**: [Pass/fail for key text]
- **Touch targets**: [Adequate size?]
- **Text readability**: [Font size, line height]

### What Works Well
- [Observation]
- [Observation]

### Priority Recommendations
1. **[Most impactful change]** — [Why and how]
2. **[Second priority]** — [Why and how]
3. **[Third priority]** — [Why and how]
```

**On severity.** Critical means a user cannot complete their task or is excluded from using it. Moderate means they can finish but with friction or confusion. Minor means polish. Keeping these distinct is what stops a list of twenty findings from becoming a list nobody acts on.

---

## Two limits worth knowing

**A critique looks at the design, not the behavior.** It will catch a focus ring with poor contrast; it will not catch a focus ring that fails to render because it references an undefined color. That belongs to testing, not critique — the two are complementary and neither substitutes for the other.

**A critique is a snapshot.** It describes one state of one screen. Empty states, error states, loading states, and long-content states each need their own pass, and they are where most real problems live.
