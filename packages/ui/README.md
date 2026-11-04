# Faculty Tools UI Framework

A lightweight shared design system for Faculty Tools applications such as GradeBridge and QuestionBridge.

## Contents

- `themes.css` — centralized identity themes and compatibility aliases
- `runtime.js` — shared theme preference, storage fallback (`FTStorage.persistent` is false when saves only last until the tab closes), and visible build identity
- `dialog.js` — shared pop-up (`FTDialog`) and unsaved-work warning (`FTUnsavedWork`)
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

## Pop-ups and unsaved work

Load `dialog.js` after `runtime.js`. It replaces the browser's built-in `alert()`, `confirm()`, and `prompt()` boxes with one shared pop-up that matches the tool's theme, is announced to screen readers, closes with Escape, and returns focus afterward.

```js
// Ask before a destructive action. Resolves true or false.
if (!await FTDialog.confirm('The question and its answers will be removed.', {
  title: 'Delete question?', confirmLabel: 'Delete question', danger: true
})) return;

// Something that must be acknowledged.
await FTDialog.alert('Choose a Brightspace student first.', { title: 'Choose a student' });

// Typed input. Resolves with the text, or null if cancelled.
const points = await FTDialog.prompt('Every question will get this point value.', {
  title: 'Set points', label: 'Points per question', defaultValue: '1',
  validate: v => Number(v) >= 0 ? '' : 'Enter a point value of 0 or greater.'
});

// A richer pop-up written into the page as <dialog class="ft-dialog">.
const help = FTDialog.manage(document.getElementById('helpDialog'));
help.open();

// Warn before the page closes while there is unsaved work.
FTUnsavedWork.watch(() => groups.length > 0);
const work = FTUnsavedWork.track(() => JSON.stringify(state)); // compares to the last save
work.markSaved();
```

See the "Pop-ups" section of `examples/component-gallery.html` for a live example.

## Theme

Set dark mode on the root element:

```js
document.documentElement.dataset.ftTheme = 'dark';
```

Remove the attribute or set it to `light` for light mode.

## Governance

When a visual pattern is reused by more than one Faculty Tool, promote it into this framework. Avoid adding app-specific behavior to shared CSS unless the pattern is demonstrably reusable.
