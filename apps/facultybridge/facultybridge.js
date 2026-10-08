const FB_TOOLS = [
  {
    id: 'syllabusbridge',
    name: 'SyllabusBridge',
    version: 'v2.1',
    category: 'Course preparation',
    description: 'Preflight a Word syllabus, review the structured extraction, and validate course information, outcomes, assessments, policies, and schedule data.',
    input: 'Course DOCX',
    output: 'Validated syllabus data',
    url: './SyllabusBridge/index.html',
    status: 'Available',
    accent: '#d6a51d',
    icon: 'syllabus'
  },
  {
    id: 'calendarbridge',
    name: 'CalendarBridge',
    version: 'v7.5.3',
    category: 'Course preparation',
    description: 'Turn a syllabus or FacultyBridge Course JSON into reviewed faculty calendars and standard calendar files.',
    input: 'DOCX / Course JSON',
    output: 'Faculty calendars',
    url: './CalendarBridge/index.html',
    status: 'Available',
    accent: '#f07a24',
    icon: 'calendar'
  },
  {
    id: 'questionbridge',
    name: 'QuestionBridge',
    version: 'v4.2',
    category: 'Assessment development',
    description: 'Convert, edit, validate, and export assessment questions across the platforms faculty already use.',
    input: 'Question banks',
    output: 'LMS & quiz platforms',
    url: './QuestionBridge/index.html',
    status: 'Available',
    accent: '#4a9a36',
    icon: 'questions'
  },
  {
    id: 'exambridge',
    name: 'ExamBridge',
    version: 'v1.8.1',
    category: 'Pre-exam quality',
    description: 'Review an ExamSoft draft against faculty-approved exam-writing rules, question weights, tagging, and figure checks before administration.',
    input: 'ExamSoft exam export',
    output: 'Quality review report',
    url: './ExamBridge/index.html',
    status: 'In development',
    accent: '#8b5bb7',
    icon: 'exam'
  },
  {
    id: 'itembridge',
    name: 'ItemBridge',
    version: 'v1.8.4',
    category: 'Post-exam analysis',
    description: 'Prioritize ExamSoft items for faculty review using psychometrics, tags, distractor performance, and repeated-item history.',
    input: 'Item Analysis CSV',
    output: 'Prioritized item review',
    url: './ItemBridge/index.html',
    status: 'In development',
    accent: '#169c9b',
    icon: 'items'
  },
  {
    id: 'gradebridge',
    name: 'GradeBridge',
    version: 'v6.0.1',
    category: 'Grade management',
    description: 'Match student records and move raw grades from ExamSoft into a Brightspace-ready file with a faculty-controlled final audit.',
    input: 'ExamSoft + Brightspace',
    output: 'Brightspace grade CSV',
    url: './GradeBridge/index.html',
    status: 'Available',
    accent: '#2588d8',
    icon: 'grades'
  },
  {
    id: 'groupbridge',
    name: 'GroupBridge',
    version: 'v1.2.1',
    category: 'Class management',
    description: 'Create random or grade-balanced student groups from a Brightspace roster, respect pair constraints, review the result, and export enrollments.',
    input: 'Brightspace roster',
    output: 'Groups & enrollment CSV',
    url: './GroupBridge/index.html',
    status: 'Available',
    accent: '#c94f38',
    icon: 'groups'
  },
  {
    id: 'futurebridge',
    name: 'More Bridges ahead',
    version: '',
    category: 'Faculty workflows',
    description: 'FacultyBridge is designed to grow. New tools can join the suite without changing the landing-page structure.',
    input: 'Repeated task',
    output: 'Simpler workflow',
    url: '',
    status: 'Coming soon',
    accent: '#9aa69e',
    icon: 'plus'
  }
];

for (const tool of FB_TOOLS) {
  const entry = window.FacultyBridgeBuild.tools.find(item => item.id === tool.id);
  if (entry) { tool.version = `v${entry.version}`; tool.url = `./${entry.route}/index.html`; tool.accent = `var(--ft-tool-${entry.id})`; }
}

const ICONS = {
  syllabus: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6M9 19h4"/><path d="m7.5 7.5 1 1 2-2"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/></svg>`,
  questions: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h8M8 10h5"/><path d="M6 17.5 3.5 20v-4.2A7.8 7.8 0 0 1 2 11c0-4.4 4-8 9-8s9 3.6 9 8-4 8-9 8c-1.8 0-3.5-.5-5-1.5Z"/><path d="M16.5 14.25h.01"/></svg>`,
  exam: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h5"/><path d="m9 17 1.5 1.5L15 14"/></svg>`,
  items: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><circle cx="4" cy="6" r="1.5"/><circle cx="10" cy="3" r="1.5"/><circle cx="16" cy="9" r="1.5"/></svg>`,
  grades: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 6 5-3 6 4 5-4"/></svg>`,
  groups: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/><path d="M14 15c.8-.7 1.8-1 3-1 2.6 0 4 1.7 4.3 5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/></svg>`
};

function renderTools() {
  const grid = document.getElementById('toolGrid');
  grid.innerHTML = FB_TOOLS.map(tool => {
    const coming = !tool.url;
    const inDevelopment = tool.status === 'In development';
    const statusClass = coming ? 'ft-status-warning' : (inDevelopment ? 'ft-status-info' : 'ft-status-ready');
    const statusIcon = coming ? '○' : (inDevelopment ? '◐' : '✓');
    return `<article class="ft-card ft-card-interactive fb-tool-card ${coming ? 'fb-coming' : ''}" style="--fb-accent:${tool.accent}">
      <div class="fb-tool-top">
        <div class="fb-tool-icon">${ICONS[tool.icon]}</div>
        <div class="fb-tool-badges">
          ${tool.version ? `<span class="ft-badge fb-version">${tool.version}</span>` : ''}
          <span class="ft-badge ${statusClass} fb-tool-status">${statusIcon} ${tool.status}</span>
        </div>
      </div>
      <div class="fb-tool-category">${tool.category}</div>
      <h3>${tool.name}</h3>
      <p class="fb-tool-description">${tool.description}</p>
      <div class="fb-flow" aria-label="${tool.input} to ${tool.output}">
        <span class="fb-flow-node">${tool.input}</span><span class="fb-flow-arrow" aria-hidden="true">→</span><span class="fb-flow-node">${tool.output}</span>
      </div>
      <div class="fb-tool-actions">
        ${coming
          ? `<button class="ft-btn" type="button" disabled>Coming soon</button>`
          : `<a class="ft-btn ft-btn-primary" href="${tool.url}" data-tool-link="${tool.id}">Open ${tool.name}</a>`}
      </div>
    </article>`;
  }).join('');
}

function setupTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('ft-theme');
    if (saved === 'dark') root.dataset.ftTheme = 'dark';
  } catch (_) {}
  document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = root.dataset.ftTheme === 'dark';
    root.dataset.ftTheme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ft-theme', dark ? 'light' : 'dark'); } catch (_) {}
  });
}

function setupToolLinks() {
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-tool-link]');
    if (!link) return;
    try { localStorage.setItem('facultybridge-last-tool', link.dataset.toolLink); } catch (_) {}
  });
}

function setupAboutDialog() {
  const modal = document.getElementById('aboutModal');
  const closeButton = document.getElementById('closeAbout');
  const aboutButton = document.getElementById('aboutButton');
  const open = () => { modal.classList.add('is-open'); closeButton.focus(); };
  const close = () => { modal.classList.remove('is-open'); aboutButton.focus(); };
  aboutButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('is-open')) close(); });
}

renderTools();
setupTheme();
setupToolLinks();
setupAboutDialog();
