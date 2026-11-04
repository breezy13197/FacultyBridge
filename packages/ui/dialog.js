/*
 * Shared pop-up (FTDialog) and unsaved-work warning (FTUnsavedWork).
 *
 * Every Faculty Tool loads this file after runtime.js. It replaces the
 * browser's built-in alert/confirm/prompt boxes and the separate pop-up
 * designs each tool used to have, so pop-ups look and behave the same
 * everywhere:
 *
 *   - Built on the native <dialog> element, so screen readers announce it
 *     as a dialog and keyboard focus stays inside it while it is open.
 *   - Escape, the close (×) button, and clicking outside the pop-up all
 *     close it the same way as choosing Cancel.
 *   - Focus returns to the control that opened it.
 *
 * Usage (see packages/ui/README.md and the component gallery):
 *
 *   if (!await FTDialog.confirm('Delete this question?', { danger: true, confirmLabel: 'Delete' })) return;
 *   await FTDialog.alert('Choose a Brightspace student first.');
 *   const points = await FTDialog.prompt('Point value for all questions', { defaultValue: '1' });
 *   const preview = FTDialog.manage(document.getElementById('previewDialog'));
 *   preview.open();
 *
 *   FTUnsavedWork.watch(() => hasEdits);               // simple yes/no check
 *   const work = FTUnsavedWork.track(() => snapshot()); // compares to last save
 *   work.markSaved();
 */
(() => {
  'use strict';
  if (window.FTDialog) return;

  const supportsModal = typeof HTMLDialogElement === 'function' && typeof HTMLDialogElement.prototype.showModal === 'function';
  const controllers = new WeakMap();

  // Safari does not move focus to a button when it is clicked, so "the focused
  // element" is often the page itself when a pop-up opens. Remember the last
  // control that was clicked (capture phase runs before the click opens anything)
  // so focus can still go back to it when the pop-up closes.
  let lastClicked = null;
  document.addEventListener('click', event => {
    const control = event.target instanceof Element
      ? event.target.closest('button, [href], input, select, textarea, summary, [tabindex]')
      : null;
    if (control) lastClicked = control;
  }, true);
  function openerFor(explicit) {
    if (explicit) return explicit;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return active;
    return lastClicked && lastClicked.isConnected ? lastClicked : null;
  }

  function focusable(root) {
    return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
  }

  function clickedOutside(dialog, event) {
    if (event.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    // Keyboard-triggered clicks report 0,0; only treat real pointer clicks outside the box as dismissal.
    if (event.clientX === 0 && event.clientY === 0) return false;
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  }

  /*
   * Wire an existing <dialog class="ft-dialog"> in the page. Returns a small
   * controller. Buttons marked data-ft-dialog-close close it.
   *   onClose(value): runs after every close, including Escape.
   *   initialFocus: element or CSS selector to focus when opened.
   *   dismissible: false keeps Escape/outside clicks from closing it.
   */
  function manage(dialog, options = {}) {
    if (!dialog) throw new Error('FTDialog.manage needs a dialog element.');
    if (controllers.has(dialog)) return controllers.get(dialog);
    const settings = { dismissible: true, ...options };
    let returnFocus = null;
    let open = false;
    let closingValue;

    if (dialog.localName !== 'dialog') {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
    }
    dialog.classList.add('ft-dialog');

    const controller = {
      element: dialog,
      get isOpen() { return open; },
      open(opener) {
        if (open) return controller;
        returnFocus = openerFor(opener);
        open = true;
        if (dialog.localName === 'dialog' && supportsModal) {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
          dialog.classList.add('is-open');
        }
        const target = typeof settings.initialFocus === 'string'
          ? dialog.querySelector(settings.initialFocus)
          : settings.initialFocus;
        const first = target || dialog.querySelector('[autofocus]') || focusable(dialog)[0];
        if (first) first.focus(); else { dialog.tabIndex = -1; dialog.focus(); }
        return controller;
      },
      close(value) {
        if (!open) return;
        open = false;
        closingValue = value;
        if (dialog.localName === 'dialog' && supportsModal) {
          if (dialog.open) dialog.close();
        } else {
          dialog.removeAttribute('open');
          dialog.classList.remove('is-open');
        }
        const back = returnFocus;
        returnFocus = null;
        if (back && back.isConnected && typeof back.focus === 'function') back.focus();
        if (settings.onClose) settings.onClose(closingValue);
      }
    };

    // Escape: the browser fires "cancel" on a modal <dialog>.
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (settings.dismissible) controller.close(settings.dismissValue);
    });
    // Fallback Escape handling and focus containment for non-native dialogs.
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !(dialog.localName === 'dialog' && supportsModal)) {
        event.preventDefault();
        if (settings.dismissible) controller.close(settings.dismissValue);
      }
      if (event.key === 'Tab' && !(dialog.localName === 'dialog' && supportsModal)) {
        const items = focusable(dialog);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    dialog.addEventListener('click', event => {
      const closer = event.target.closest('[data-ft-dialog-close]');
      if (closer && dialog.contains(closer)) { controller.close(settings.dismissValue); return; }
      if (settings.dismissible && clickedOutside(dialog, event)) controller.close(settings.dismissValue);
    });
    // If something else closes a native dialog (form method="dialog"), keep state in sync.
    dialog.addEventListener('close', () => { if (open) controller.close(settings.dismissValue); });

    controllers.set(dialog, controller);
    return controller;
  }

  // Plain text only: blank lines become separate paragraphs, single line breaks are kept.
  function textBlock(message) {
    const wrap = document.createElement('div');
    wrap.className = 'ft-dialog-body';
    if (message instanceof Node) { wrap.appendChild(message); return wrap; }
    String(message ?? '').split(/\n\s*\n/).forEach(part => {
      if (!part.trim()) return;
      const p = document.createElement('p');
      p.style.whiteSpace = 'pre-line';
      p.textContent = part.trim();
      wrap.appendChild(p);
    });
    return wrap;
  }

  let uid = 0;
  /*
   * Build a temporary pop-up and resolve with the chosen action's value.
   *   title, eyebrow, message (text or a DOM node), wide
   *   actions: [{ label, value, variant: 'primary'|'accent'|'danger'|'secondary', autofocus }]
   *   dismissValue: value used for Escape, ×, or clicking outside (default undefined)
   */
  function open(options = {}) {
    const id = `ft-dialog-${++uid}`;
    const dialog = document.createElement(supportsModal ? 'dialog' : 'div');
    dialog.className = 'ft-dialog' + (options.wide ? ' ft-dialog-wide' : '');
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-body`);

    const head = document.createElement('div');
    head.className = 'ft-dialog-head';
    const heading = document.createElement('div');
    if (options.eyebrow) {
      const eyebrow = document.createElement('div');
      eyebrow.className = 'ft-eyebrow';
      eyebrow.textContent = options.eyebrow;
      heading.appendChild(eyebrow);
    }
    const title = document.createElement('h2');
    title.className = 'ft-dialog-title';
    title.id = `${id}-title`;
    title.textContent = options.title || 'Please confirm';
    heading.appendChild(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ft-icon-btn ft-dialog-close';
    close.setAttribute('aria-label', 'Close');
    close.setAttribute('data-ft-dialog-close', '');
    close.textContent = '×';
    head.append(heading, close);

    const body = textBlock(options.message);
    body.id = `${id}-body`;
    if (options.content) body.appendChild(options.content);

    const actions = document.createElement('div');
    actions.className = 'ft-dialog-actions';
    let autofocusButton = null;
    (options.actions || [{ label: 'OK', value: true, variant: 'primary' }]).forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      const variant = action.variant === 'primary' ? ' ft-btn-primary'
        : action.variant === 'accent' ? ' ft-btn-accent'
        : action.variant === 'danger' ? ' ft-btn-danger ft-dialog-danger' : '';
      button.className = 'ft-btn' + variant;
      button.textContent = action.label;
      if (action.name) button.dataset.ftDialogAction = action.name;
      button.addEventListener('click', () => {
        if (action.validate && !action.validate()) return;
        controller.close(typeof action.value === 'function' ? action.value() : action.value);
      });
      if (action.autofocus) autofocusButton = button;
      actions.appendChild(button);
    });

    dialog.append(head, body, actions);
    document.body.appendChild(dialog);

    let resolve;
    const result = new Promise(r => { resolve = r; });
    const controller = manage(dialog, {
      dismissValue: options.dismissValue,
      initialFocus: options.initialFocus || autofocusButton,
      onClose: value => { dialog.remove(); resolve(value); }
    });
    controller.open();
    return result;
  }

  function confirm(message, options = {}) {
    const danger = !!options.danger;
    return open({
      title: options.title || 'Please confirm',
      eyebrow: options.eyebrow,
      message,
      dismissValue: false,
      actions: [
        { label: options.cancelLabel || 'Cancel', value: false, name: 'cancel', autofocus: danger },
        { label: options.confirmLabel || 'Continue', value: true, name: 'confirm', variant: danger ? 'danger' : 'primary', autofocus: !danger }
      ]
    });
  }

  function alert(message, options = {}) {
    return open({
      title: options.title || 'Please note',
      eyebrow: options.eyebrow,
      message,
      dismissValue: undefined,
      actions: [{ label: options.okLabel || 'OK', value: undefined, name: 'confirm', variant: 'primary', autofocus: true }]
    }).then(() => undefined);
  }

  /*
   * Ask for typed input. Resolves with the text, or null when cancelled.
   *   label: visible field label (defaults to the message)
   *   validate(value): return an error sentence to keep the pop-up open
   */
  function prompt(message, options = {}) {
    const id = `ft-dialog-input-${++uid}`;
    const field = document.createElement('div');
    field.className = 'ft-field ft-dialog-field';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = options.label || 'Value';
    const input = document.createElement('input');
    input.id = id;
    input.className = 'ft-input';
    input.type = options.type || 'text';
    if (options.inputMode) input.inputMode = options.inputMode;
    input.value = options.defaultValue == null ? '' : String(options.defaultValue);
    const error = document.createElement('div');
    error.className = 'ft-dialog-error ft-status-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    input.setAttribute('aria-describedby', `${id}-error`);
    error.id = `${id}-error`;
    field.append(label, input, error);

    const check = () => {
      const problem = options.validate ? options.validate(input.value) : '';
      error.hidden = !problem;
      error.textContent = problem ? `× ${problem}` : '';
      input.setAttribute('aria-invalid', problem ? 'true' : 'false');
      if (problem) input.focus();
      return !problem;
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const ok = input.closest('.ft-dialog').querySelector('[data-ft-dialog-action="confirm"]');
        if (ok) ok.click();
      }
    });

    return open({
      title: options.title || 'Enter a value',
      eyebrow: options.eyebrow,
      message,
      content: field,
      dismissValue: null,
      initialFocus: input,
      actions: [
        { label: options.cancelLabel || 'Cancel', value: null, name: 'cancel' },
        { label: options.confirmLabel || 'Apply', value: () => input.value, name: 'confirm', variant: 'primary', validate: check }
      ]
    });
  }

  window.FTDialog = Object.freeze({ manage, open, confirm, alert, prompt });

  /*
   * Unsaved-work warning. When any registered check reports unsaved work,
   * closing, refreshing, or leaving the page shows the browser's standard
   * "Leave site? Changes you made may not be saved." question. Browsers do
   * not allow pages to change that wording.
   */
  const checks = new Set();
  let leaving = false;

  function hasUnsavedWork() {
    for (const check of checks) {
      try { if (check()) return true; } catch (_) { /* a failing check never blocks leaving */ }
    }
    return false;
  }

  function watch(check) {
    checks.add(check);
    return () => checks.delete(check);
  }

  // Compare a snapshot of the work against the last saved/exported copy.
  // snapshot() returns null (or undefined) when there is nothing to lose.
  function track(snapshot) {
    const serialize = () => {
      const value = snapshot();
      if (value == null) return null;
      return typeof value === 'string' ? value : JSON.stringify(value);
    };
    let saved = null;
    const isDirty = () => {
      const now = serialize();
      return now !== null && now !== saved;
    };
    const stop = watch(isDirty);
    return {
      isDirty,
      markSaved() { saved = serialize(); },
      stop
    };
  }

  // For an intentional "Start over" reload the tool has already confirmed.
  function allowLeave() { leaving = true; }

  window.addEventListener('beforeunload', event => {
    if (leaving || !hasUnsavedWork()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.FTUnsavedWork = Object.freeze({ watch, track, hasUnsavedWork, allowLeave });
})();
