# Faculty Tools — UI Agent Instructions

You are working within the Faculty Tools ecosystem.

Before creating or substantially modifying UI:

1. Read `DESIGN-SYSTEM.md`.
2. Read `PRODUCT-PRINCIPLES.md`.
3. Reuse `tokens.css`, `components.css`, and `utilities.css` wherever practical.
4. Review `examples/component-gallery.html` before inventing new patterns.

## Required conventions

- Use `--ft-*` design tokens instead of hard-coded shared colors, radii, spacing, or shadows.
- Use `ft-*` classes for shared framework components.
- Use an application prefix (`qb-*`, `gb-*`, etc.) for app-specific styles.
- Maintain light and dark mode support.
- Preserve visible focus states and keyboard usability.
- Do not introduce a new palette, font system, card treatment, button system, spacing scale, status language, or navigation pattern without a clear product need.
- Prefer plain academic/faculty language over technical implementation terminology.
- Do not silently discard or transform user data.
- Preview and validate before irreversible actions or downloads.

If a new pattern will plausibly be useful in multiple Faculty Tools, implement it first as a shared framework component and add it to the component gallery.
