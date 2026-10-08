# Faculty Tools UI Framework — Design System

## Purpose

This framework captures the shared aesthetic and interaction language established in GradeBridge and QuestionBridge so future Faculty Tools feel like one product family.

## Visual identity

The core aesthetic is calm, academic, modern, and approachable rather than “enterprise IT.” Use an off-white canvas, white cards, a distinct identity color for each tool, and semantic green/amber/red status colors. Rounded cards, thin borders, subtle shadows, and generous whitespace are preferred.

### Brand palette

Tool identities are centralized in `themes.css`: ItemBridge teal, CalendarBridge orange, ExamBridge purple, QuestionBridge green, GradeBridge blue, SyllabusBridge gold/amber, and GroupBridge coral. The baseline green identity is used for the suite and gallery. Shared components consume `--ft-brand-*`; status tokens remain independent.

- `--ft-brand-900`, `--ft-brand-700`, `--ft-brand-500`: tool primary, link/focus, and accent colors
- `--ft-brand-200`: soft identity background
- `--ft-on-primary`: contrasting text on primary/accent controls

Use design tokens rather than hard-coded colors in application CSS.

- `--ft-bg`: page background
- `--ft-surface`: cards, dialogs, sticky navigation
- `--ft-text`: primary text
- `--ft-text-muted`: supporting text and labels
- `--ft-green-900`: strongest brand / primary button
- `--ft-green-700`: links, accents, ready states
- `--ft-lime-500`: highlight / call-to-action accent
- `--ft-lime-200`: selected rows, active steps, soft emphasis
- `--ft-warning`: needs review
- `--ft-danger`: error or destructive state

Dark mode is defined entirely through token overrides using `[data-ft-theme="dark"]`.

## Typography

Use Inter when available, falling back to native system sans-serif fonts. Headings should be confident, compact, and slightly tighter than body text. Hero headings may use negative letter spacing. Labels are small, uppercase, and letter-spaced.

Avoid decorative typefaces or overly dense UI typography.

## Spacing

Use the shared spacing scale. Most component gaps should be 8–24 px. Major panels generally use 20–32 px internal padding. Avoid arbitrary one-off values unless required by a specific component.

## Shape and depth

- Small controls: 8–12 px radius
- Cards/panels: 18–22 px radius
- Hero panels: up to 28 px radius
- Pills/chips: fully rounded
- Shadows should remain soft and low contrast

## Application shell

Faculty Tools should generally include:

1. A maximum-width centered application canvas.
2. A sticky rounded top navigation bar.
3. A shared Faculty Tools family identifier plus application name.
4. Step navigation for workflows with three or more stages.
5. A right-side utility area for theme, save, help, or project actions.

The application name is prominent; “Faculty Tools” acts as a suite identifier rather than competing brand text.

## Buttons

Use three primary button treatments:

- **Primary**: strong tool-identity background. The strongest action on a screen.
- **Accent**: tool-identity accent background. Useful for positive secondary actions, save/export, or highlighted entry points.
- **Secondary**: surface background with border.

Only one action within a local decision area should visually dominate.

Destructive actions should use text/border danger styling and require confirmation when data loss is meaningful.

## Cards

Cards are the core organizational primitive. Use them for upload areas, platform choices, question editors, metrics, validation panels, dashboards, and settings. Cards should not be nested more than necessary.

Interactive cards can lift subtly on hover; informational cards should remain static.

## Forms

Inputs use the page background inside white cards. Labels sit above controls, in muted uppercase text. Focus states must be visible. Do not rely on placeholder text as the only label.

For high-stakes decisions (e.g., correct answer, student mapping, exclusions), make current state visible even when the control is not focused.

## Status language

Use three primary workflow states across Faculty Tools:

- **Ready** — check mark + green
- **Needs Review** — exclamation + amber
- **Error / Blocked** — x or clear error icon + red

Always pair color with text/iconography.

Examples:

- `✓ Ready`
- `! Needs review`
- `× Cannot export`

## Workflow navigation

Multi-step tools should prefer an explicit stepper such as:

`1 Upload → 2 Review → 3 Validate → 4 Export`

Completed stages may display a check mark only when their actual work is complete. Users should usually be able to return to prior steps without losing state.

## Upload pattern

Use a large, friendly drop zone with a dashed green-toned border, concise instructions, supported file types, and a clear “Choose file” action. Drag-over should visibly change the border.

Whenever practical, pair upload with a paste/manual-entry alternative.

## Validation pattern

Validation should happen before final output and, where possible, continuously during editing. A validation summary should include totals plus direct links/actions for issues.

Good:

> Question 6 is not compatible with Kahoot. Exclude it from Kahoot or convert the question type.

Avoid:

> Validation failed.

## Tables

Tables should use subtle dividers, quiet headers, and horizontal scrolling when necessary. Avoid dense grid lines. Highlight selected or unresolved rows using soft lime/amber treatments.

## Empty states

Empty states should explain what is missing and provide a direct next action. Keep illustrations/icons simple and lightweight.

## Dialogs and toasts

Dialogs use the same card radius and border system as the main UI. Toasts are for short confirmations, not critical warnings. Critical issues belong inline or in a dialog requiring acknowledgement.

## Accessibility

- Preserve keyboard navigation.
- Use native controls when possible.
- Provide visible focus states.
- Maintain semantic heading order.
- Ensure status is not conveyed by color alone.
- Respect `prefers-reduced-motion`.
- Target WCAG AA contrast.
- Keep minimum touch targets near 40–44 px for primary controls.

## Responsive behavior

Complex multi-column workspaces should collapse into stacked sections. A stepper may scroll horizontally. Avoid squeezing sidebars into unusable widths.

## Copy style

Use concise, plain-language instructions. Faculty Tools should explain what the software is doing without exposing technical file-format details unless the user asks.

Prefer:

> 3 students need attention

Over:

> 3 unmatched records detected in parsing layer

## Naming conventions

CSS classes provided by the framework use the `ft-` prefix. Design tokens use the `--ft-` prefix. Application-specific classes should use a tool-specific prefix (`qb-`, `gb-`, etc.) to avoid collisions.

## New-component rule

Before inventing a new visual pattern, check the component gallery and shared styles. Create a new shared component when a pattern is likely to appear in two or more Faculty Tools. Application-specific components should remain local until reuse is demonstrated.
