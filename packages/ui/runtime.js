/* Shared runtime handles suite preferences and build identification only. */
(() => {
  'use strict';
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
  if (header) {
    const tool = build.tools.find(t => t.id === build.toolId);
    if (tool && !header.textContent.includes(`v${tool.version}`)) label.textContent = `v${tool.version} · ${label.textContent}`;
    header.appendChild(label);
  }
  if (build.toolId !== 'facultybridge' && build.output === 'site') {
    const link = document.createElement('a');
    link.className = 'ft-suite-link';
    link.href = '../index.html';
    link.textContent = '← FacultyBridge';
    const app = document.querySelector('.ft-app, .app, .container') || document.body;
    app.appendChild(link);
  }
})();
