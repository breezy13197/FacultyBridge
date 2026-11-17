import { test, expect } from './fixtures.js';

// Regression check: jumping to a question from the Validate screen (or opening a saved
// project) must not copy the previously displayed question's stem and settings into the
// newly selected question. All content is synthetic.

const longStem = 'Which synthetic enzyme converts compound alpha into compound beta while also producing a cofactor?';
const pasted = [
  `1. ${longStem}\n*A. Cofactor one\nB. Cofactor two\nC. Cofactor three\nD. Cofactor four`,
  '2. Which synthetic organelle stores compound gamma?\n*A. Organelle one\nB. Organelle two\nC. Organelle three\nD. Organelle four',
  '3. Which synthetic compound blocks pathway delta?\n*A. Blocker one\nB. Blocker two\nC. Blocker three\nD. Blocker four',
].join('\n\n');

const items = page => page.locator('#questionList .qb-question-item');
// Topic and points-like settings live under the collapsed "Optional metadata" section.
async function showMetadata(page) {
  const details = page.locator('details:has(#topic)');
  if (!(await details.evaluate(d => d.open))) await details.locator('summary').click();
}

test('QuestionBridge: Open question from Validate keeps each question\'s own stem and settings', async ({ page, openTool }) => {
  expect(longStem.length).toBeGreaterThan(95); // over Kahoot's limit, so question 1 is listed on Validate
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await expect(items(page)).toHaveCount(3);

  // View question 3 and give it a topic, so it differs from question 1 in more than the stem.
  await items(page).nth(2).click();
  await expect(page.locator('#stem')).toHaveValue(/blocks pathway delta/);
  await showMetadata(page);
  await page.locator('#topic').fill('Synthetic topic for question 3');

  // Jump to question 1 from the Validate screen.
  await page.locator('[data-screen="validate"]').click();
  await page.locator('button:has-text("Open question")').first().click();

  await expect(page.locator('#editorEyebrow')).toHaveText(/Question 1 of 3/i);
  await expect(page.locator('#stem')).toHaveValue(longStem);
  await expect(page.locator('#topic')).toHaveValue('');

  // Question 3 still has its own stem and topic.
  await items(page).nth(2).click();
  await expect(page.locator('#stem')).toHaveValue(/blocks pathway delta/);
  await expect(page.locator('#topic')).toHaveValue('Synthetic topic for question 3');
});

test('QuestionBridge: opening a saved project does not copy the on-screen question into it', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await items(page).nth(2).click();
  await showMetadata(page);
  await page.locator('#topic').fill('Topic from the old project');

  const project = {
    schema: 'questionbridge', sourceName: 'Synthetic saved project',
    questions: [{
      id: 'synthetic-project-q1', type: 'mc', stem: 'Which synthetic vitamin is stored in project epsilon?', points: 2,
      topic: 'Saved project topic', confidence: 'high',
      answers: [{ text: 'Vitamin one', correct: true }, { text: 'Vitamin two', correct: false }],
    }],
  };
  await page.locator('#projectInput').setInputFiles({
    name: 'synthetic.questionbridge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  });

  await expect(items(page)).toHaveCount(1);
  await expect(page.locator('#stem')).toHaveValue('Which synthetic vitamin is stored in project epsilon?');
  await expect(page.locator('#topic')).toHaveValue('Saved project topic');
  await expect(page.locator('#points')).toHaveValue('2');
});

// Every editable question field, as the editor shows it. Used to compare project B
// field by field after it replaces an edited project A.
const editorFields = ['stem', 'questionType', 'points', 'qTitle', 'topic', 'bloom', 'objective', 'difficulty', 'tags', 'rationale', 'kahootStem', 'pollStem'];
const readEditor = page => page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).value])), editorFields);
const readAutosave = page => page.evaluate(() => JSON.parse(localStorage.getItem('questionbridge-autosave') || 'null'));
const fieldsOf = q => {
  const { stem, type, points, title, topic, bloom, objective, difficulty, tags, rationale, kahootStem, pollStem, answers } = q;
  return { stem, type, points, title, topic, bloom, objective, difficulty, tags, rationale, kahootStem, pollStem, answers: answers.map(a => ({ text: a.text, correct: a.correct })) };
};

const projectB = {
  schema: 'questionbridge', sourceName: 'Synthetic project B', brightspaceImageFolder: '/content/enforced/synthetic-b/images',
  questions: [
    {
      id: 'synthetic-b-q1', type: 'mr', stem: 'Which synthetic minerals are stored in project B?', points: 3,
      title: 'Project B title', topic: 'Project B topic', bloom: 'Analyze', objective: 'Project B objective', difficulty: 'Difficult',
      tags: ['b-tag-one', 'b-tag-two'], rationale: 'Project B rationale', kahootStem: 'Project B Kahoot', pollStem: 'Project B poll',
      answers: [{ text: 'Mineral one', correct: true }, { text: 'Mineral two', correct: true }, { text: 'Mineral three', correct: false }],
    },
    {
      id: 'synthetic-b-q2', type: 'tf', stem: 'Synthetic project B has a second question.', points: 1,
      answers: [{ text: 'True', correct: true }, { text: 'False', correct: false }],
    },
  ],
};

test('QuestionBridge: opening project B after editing project A keeps every field of B, on screen and in autosave', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await expect(items(page)).toHaveCount(3);

  // Edit project A's first question in every field without leaving the editor.
  await items(page).first().click();
  await showMetadata(page);
  await page.locator('#stem').fill('Edited project A stem that must not reach project B');
  await page.locator('#points').fill('7');
  for (const [id, v] of [['qTitle', 'A title'], ['topic', 'A topic'], ['objective', 'A objective'], ['tags', 'a-tag'], ['rationale', 'A rationale']]) {
    await page.locator('#' + id).fill(v);
  }

  await page.locator('#projectInput').setInputFiles({
    name: 'synthetic-b.questionbridge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(projectB)),
  });
  await expect(items(page)).toHaveCount(2);
  await expect(page.locator('#editorEyebrow')).toHaveText(/Question 1 of 2/i);

  const b1 = projectB.questions[0];
  expect(await readEditor(page)).toEqual({
    stem: b1.stem, questionType: b1.type, points: String(b1.points), qTitle: b1.title, topic: b1.topic, bloom: b1.bloom,
    objective: b1.objective, difficulty: b1.difficulty, tags: b1.tags.join(', '), rationale: b1.rationale,
    kahootStem: b1.kahootStem, pollStem: b1.pollStem,
  });

  // The autosaved copy is exactly project B, question by question and field by field.
  const saved = await readAutosave(page);
  expect(saved.sourceName).toBe(projectB.sourceName);
  expect(saved.brightspaceImageFolder).toBe(projectB.brightspaceImageFolder);
  expect(saved.questions.map(fieldsOf)).toEqual(projectB.questions.map(q => fieldsOf(Object.assign({ title: '', topic: '', bloom: '', objective: '', difficulty: '', tags: [], rationale: '', kahootStem: '', pollStem: '' }, q))));
  expect(JSON.stringify(saved)).not.toContain('project A');
  // B's questions have no source label of their own, so they take B's name, never A's.
  expect(saved.questions.map(q => q.source)).toEqual([projectB.sourceName, projectB.sourceName]);
  await expect(page.locator('#sourcePill')).toHaveText(projectB.sourceName);

  // Moving around project B afterward still does not mix anything in.
  await items(page).nth(1).click();
  await items(page).first().click();
  expect((await readAutosave(page)).questions.map(fieldsOf)).toEqual(saved.questions.map(fieldsOf));
});

test('QuestionBridge: a damaged project file leaves the open project and its autosave untouched', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await expect(items(page)).toHaveCount(3);
  await items(page).first().click();
  const before = await readAutosave(page);

  const damagedProject = questions => JSON.stringify({ schema: 'questionbridge', sourceName: 'Damaged synthetic project', brightspaceImageFolder: '/damaged', questions });
  const cases = [
    ['a missing question', damagedProject([projectB.questions[0], null]), '1 of 2 questions in this project file could not be read'],
    ['answers that are not a list', damagedProject([{ ...projectB.questions[0], answers: 'Mineral one' }]), '1 of 1 question in this project file could not be read'],
    ['a file that is not a project', 'not a project at all', 'This file is not a QuestionBridge project'],
    // Values the editor reads directly: each once slipped past the check and replaced project A.
    ['an empty (null) stem', damagedProject([{ ...projectB.questions[0], stem: null }]), '1 of 1 question in this project file could not be read'],
    ['a numeric stem', damagedProject([{ ...projectB.questions[0], stem: 42 }]), '1 of 1 question in this project file could not be read'],
    ['a missing image entry', damagedProject([{ ...projectB.questions[0], images: [null] }]), '1 of 1 question in this project file could not be read'],
    ['blank answers that are not a list', damagedProject([{ id: 'synthetic-fitb', type: 'fitb', stem: 'Synthetic fact: __1__', blanks: [{ token: '__1__', accepted: 'one' }] }]), '1 of 1 question in this project file could not be read'],
    ['an unknown question type', damagedProject([{ ...projectB.questions[0], type: 'hotspot' }]), '1 of 1 question in this project file could not be read'],
  ];
  for (const [label, body, message] of cases) {
    await page.locator('#projectInput').setInputFiles({ name: 'damaged.questionbridge', mimeType: 'application/json', buffer: Buffer.from(body) });
    const dialog = page.locator('.ft-dialog, [role="dialog"]').filter({ hasText: 'Project could not be opened' });
    await expect(dialog, label).toContainText(message);
    await expect(dialog, label).toContainText('Your current work has not changed.');
    await expect(dialog, label).not.toContainText(/is not a function|Unexpected token|JSON/);
    await page.keyboard.press('Escape');
    await expect(dialog, label).toBeHidden();
    await page.locator('#projectInput').setInputFiles([]);
  }

  await expect(items(page)).toHaveCount(3);
  // Any later save (here: moving between questions) must still save project A, not a mix.
  await items(page).nth(1).click();
  const after = await readAutosave(page);
  expect(after.sourceName).toBe(before.sourceName);
  expect(after.brightspaceImageFolder).toBe(before.brightspaceImageFolder);
  expect(after.questions.map(fieldsOf)).toEqual(before.questions.map(fieldsOf));
});

test('QuestionBridge: if showing a new project fails, the open project is put back and nothing is autosaved', async ({ page, openTool }) => {
  await openTool('questionbridge');
  await page.locator('[data-screen="upload"]').click();
  await page.locator('#pasteText').fill(pasted);
  await page.locator('#parsePaste').click();
  await expect(items(page)).toHaveCount(3);
  await items(page).first().click();
  const before = await readAutosave(page);

  // Simulate an unexpected display failure for project B only (a problem no file check caught).
  await page.evaluate(() => {
    const original = window.renderAnswers;
    window.renderAnswers = q => { if (q.id === 'synthetic-b-q1') throw new Error('simulated display failure'); return original(q); };
  });
  await page.locator('#projectInput').setInputFiles({
    name: 'synthetic-b.questionbridge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(projectB)),
  });
  const dialog = page.locator('.ft-dialog, [role="dialog"]').filter({ hasText: 'Project could not be opened' });
  await expect(dialog).toContainText('Your current work has not changed.');
  await page.keyboard.press('Escape');

  // Project A is back on screen, and the autosaved copy was never replaced.
  await expect(items(page)).toHaveCount(3);
  await expect(page.locator('#stem')).toHaveValue(longStem);
  const storedNow = await readAutosave(page);
  expect(storedNow.sourceName).toBe(before.sourceName);
  expect(storedNow.questions.map(fieldsOf)).toEqual(before.questions.map(fieldsOf));
  await items(page).nth(1).click();
  const after = await readAutosave(page);
  expect(after.sourceName).toBe(before.sourceName);
  expect(after.questions.map(fieldsOf)).toEqual(before.questions.map(fieldsOf));
});
