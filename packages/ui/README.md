# Faculty Tools UI Framework

A lightweight shared design system for Faculty Tools applications such as GradeBridge and QuestionBridge.

## Contents

- `themes.css` — centralized identity themes and compatibility aliases
- `runtime.js` — shared theme preference and visible build identity
- `tokens.css` — colors, type scale, spacing, radii, shadows, layout, dark-mode tokens
- `components.css` — reusable Faculty Tools UI components
- `utilities.css` — small layout helpers
- `DESIGN-SYSTEM.md` — visual and interaction rules
- `PRODUCT-PRINCIPLES.md` — product-level UX principles
- `examples/component-gallery.html` — interactive visual reference
- `templates/app-shell.html` — starter shell for new applications
- `AGENTS.md` — instructions for coding agents working with the framework

## Quick start

Copy or reference the three CSS files in your application:

```html
<link rel="stylesheet" href="path/to/faculty-tools-ui/tokens.css">
<link rel="stylesheet" href="path/to/faculty-tools-ui/themes.css">
<link rel="stylesheet" href="path/to/faculty-tools-ui/components.css">
<link rel="stylesheet" href="path/to/faculty-tools-ui/utilities.css">
```

Then use shared classes:

```html
<div class="ft-card ft-p-6">
  <div class="ft-eyebrow">Step 1</div>
  <h2 class="ft-page-title">Upload a file</h2>
  <p class="ft-muted">Choose a supported source file to continue.</p>
  <button class="ft-btn ft-btn-primary">Choose file</button>
</div>
```

## Theme

Set dark mode on the root element:

```js
document.documentElement.dataset.ftTheme = 'dark';
```

Remove the attribute or set it to `light` for light mode.

## Governance

When a visual pattern is reused by more than one Faculty Tool, promote it into this framework. Avoid adding app-specific behavior to shared CSS unless the pattern is demonstrably reusable.
