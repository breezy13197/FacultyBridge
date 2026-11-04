/* Shared runtime handles suite preferences, storage availability, and build identification. */
(() => {
  'use strict';
  /*
   * Storage fallback. Strict privacy settings, managed browsers, and embedded
   * previews (email, Teams, LMS) can block browser storage, and any access then
   * throws. Tools read their theme at startup, so an unguarded read stopped some
   * tools before their upload buttons were wired. When storage is unavailable,
   * substitute a temporary in-memory store: the tool works normally and settings
   * last until the tab closes. Runs before every tool script.
   */
  const memoryStorage = () => {
    const items = new Map();
    return {
      getItem: key => (items.has(String(key)) ? items.get(String(key)) : null),
      setItem: (key, value) => { items.set(String(key), String(value)); },
      removeItem: key => { items.delete(String(key)); },
      clear: () => { items.clear(); },
      key: index => [...items.keys()][index] ?? null,
      get length() { return items.size; }
    };
  };
  const persistent = {};
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const store = window[name];
      if (!store) throw new Error('unavailable');
      store.getItem('ft-storage-check');
      persistent[name] = true;
    } catch (_) {
      persistent[name] = false;
      try { Object.defineProperty(window, name, { configurable: true, value: memoryStorage() }); } catch (__) { /* leave as-is */ }
    }
  }
  /*
   * Tools ask FTStorage.persistent before trusting that something "saved" to
   * localStorage will still be there after the tab closes. False means saves
   * only reach the temporary in-memory store above, so work must be warned
   * about and saved to a file instead.
   */
  window.FTStorage = Object.freeze({ persistent: persistent.localStorage, sessionPersistent: persistent.sessionStorage });
  const root = document.documentElement;
  try {
    let theme = localStorage.getItem('ft-theme');
    if (!theme) {
      for (const key of ['qbTheme', 'groupbridge-theme', 'gradebridge_theme', 'itembridge-theme']) {
        const legacy = localStorage.getItem(key);
        if (legacy === 'dark' || legacy === 'light') { theme = legacy; break; }
      }
      if (theme) localStorage.setItem('ft-theme', theme);
    }
    root.dataset.ftTheme = theme === 'dark' ? 'dark' : 'light';
  } catch (_) { root.dataset.ftTheme = 'light'; }
  const build = window.FacultyBridgeBuild;
  if (!build) return;
  const label = document.createElement('span');
  label.className = 'ft-build-label';
  label.textContent = `Build ${build.suiteVersion}`;
  label.title = `Shared UI ${build.uiVersion}`;
  const header = document.querySelector('header, .ft-topbar');
  if (!header) return;
  const tool = build.tools.find(t => t.id === build.toolId);
  if (tool && !header.textContent.includes(`v${tool.version}`)) label.textContent = `v${tool.version} · ${label.textContent}`;
  /*
   * In the published site, each tool's top bar gets a button back to the
   * FacultyBridge home page, styled like the tool's other top-bar buttons and
   * placed just before the build label. Standalone single-file copies have no
   * home page to return to, so they get no link.
   */
  if (build.toolId !== 'facultybridge' && build.output === 'site') {
    const link = document.createElement('a');
    link.className = 'ft-btn ft-suite-link';
    link.href = '../index.html';
    link.textContent = '← FacultyBridge';
    link.title = 'Back to the FacultyBridge home page';
    header.appendChild(link);
  }
  header.appendChild(label);
})();
