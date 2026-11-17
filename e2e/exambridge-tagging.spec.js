// ExamBridge tagging checks against the ExamSoft taxonomy layout where the course
// category sits inside the CLO tree (CLOs\...\PHA#### - Course\CLO#). Synthetic
// exam only; the layout mirrors a faculty test quiz with one deliberate tagging
// fault per question.
import { test, expect } from './fixtures.js';

const PSLO = '1.1. Apply synthetic principles.\t1.1 PSLOs (New Curriculum 2022)\\Domain 1: Synthetic\\1.1. Apply synthetic principles.';
const COURSE = 'PHA9999 ‐ Synthetic Biochemistry\t1.2 CLOs (New Curriculum 2022)\\Q2\\PHA9999 ‐ Synthetic Biochemistry';
const OTHER_COURSE = 'PHA9998 ‐ Synthetic Physiology\t1.2 CLOs (New Curriculum 2022)\\Q2\\PHA9998 ‐ Synthetic Physiology';
const clo = n => `CLO${n} – Synthetic outcome ${n}.\t1.2 CLOs (New Curriculum 2022)\\Q2\\PHA9999 ‐ Synthetic Biochemistry\\CLO${n} – Synthetic outcome ${n}.`;
const BLOOM1 = '1. Remembering and Understanding\t1.3 Blooms Taxonomy Abbreviated\\1. Remembering and Understanding';
const BLOOM2 = '2. Applying and Analyzing\t1.3 Blooms Taxonomy Abbreviated\\2. Applying and Analyzing';
const FACULTY = 'Faculty, Ada\t2. Faculty\\Faculty, Ada';

const questions = {
  1: [clo(3), BLOOM1, FACULTY, PSLO, COURSE],          // correct tagging
  4: [PSLO, clo(5), BLOOM1, clo(3), FACULTY],           // course tag missing
  9: [PSLO, clo(4), BLOOM1, FACULTY, OTHER_COURSE],     // tagged to another course
  10: [COURSE, BLOOM2, BLOOM1, FACULTY, clo(6), PSLO],  // two Bloom's levels
};
const block = (n, cats) => [
  `Question #: ${n}`, '', `Synthetic question ${n}?`, '', 'A. One', 'B. Two', 'C. Three', '✓D. Four', '',
  `Item ID: 90000${n} / 1`, 'Item Weight: 1.0', 'Item Categories:', '', 'Category Name\tCategory Path', ...cats,
  'Item Creator: faculty@university.edu', '',
].join('\n');
const text = ['Synthetic Quiz - Confidential', 'Course Name: -', `# of Questions: ${Object.keys(questions).length}`,
  'Exam Folder: Courses\\PHA 9999 Synthetic Biochemistry', '',
  ...Object.entries(questions).map(([n, cats]) => block(n, cats))].join('\n');

test('ExamBridge flags missing course, wrong course, and multiple Bloom\'s tags', async ({ page, openTool }) => {
  await openTool('exambridge');
  const result = await page.evaluate(t => {
    const qa = window.__ExamBridgeQA;
    const exam = qa.evaluateExam(qa.parseExam(t, 'synthetic-tagging.doc'));
    const byNumber = Object.fromEntries(exam.questions.map(q => [q.number, {
      course: q.tags.course.map(c => c.name),
      categories: q.categories.length,
      tagFindings: q.findings.filter(f => f.kind === 'tag').map(f => `${f.level}: ${f.text}`),
    }]));
    return { byNumber, rules: { course: exam.rules.course.level, bloom: exam.rules.bloom.level, tagQuality: exam.rules.tagQuality.level } };
  }, text);
  const q = result.byNumber;

  // Q1 is correctly tagged; the "Category Name / Category Path" header row is not a category.
  expect(q[1].tagFindings).toEqual([]);
  expect(q[1].course).toEqual(['PHA9999 ‐ Synthetic Biochemistry']);
  expect(q[1].categories).toBe(5);

  // Q4: a CLO's path passing through the course folder is not a course tag.
  expect(q[4].course).toEqual([]);
  expect(q[4].tagFindings).toContain('action: Course Name tag not detected.');

  // Q9: the course tag belongs to a different course than the exam.
  expect(q[9].tagFindings.some(f => /^action: Course Name tag belongs to PHA9998, not this exam's course PHA9999/.test(f))).toBe(true);

  // Q10: two Bloom's levels on one question.
  expect(q[10].tagFindings.some(f => /^action: Abbreviated Bloom's: 2 levels tagged/.test(f))).toBe(true);

  expect(result.rules).toEqual({ course: 'action', bloom: 'action', tagQuality: 'pass' });
});
