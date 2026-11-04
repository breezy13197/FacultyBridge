import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { test, expect } from './fixtures.js';

const enabled = process.env.BRIDGE_LOCAL_FILES === '1';
const root = path.resolve(process.env.BRIDGE_FIXTURE_DIR || 'tests/test files');
const baselineDir = path.resolve('tests/local-baselines');
const groups = [
  { folder: 'exams', extension: '.doc', route: 'ExamBridge', input: '#fileInput', ready: '#resultsView' },
  { folder: 'item analysis', extension: '.csv', route: 'ItemBridge', input: '#fileInput', ready: '#workspace' },
  { folder: 'syllabi', extension: '.docx', route: 'SyllabusBridge', input: '#file', ready: '#screen-review' },
  { folder: 'syllabi', extension: '.docx', route: 'CalendarBridge', input: '#fileInput', ready: '#screen-review' },
  { folder: 'course schedule', extension: '.docx', route: 'CalendarBridge', input: '#fileInput', ready: '#screen-review' },
];

test.describe('local course-file regression', () => {
  // Failures must not echo course content.
  test.use({ redact: true });
  test.setTimeout(120_000);
  test.skip(!enabled, 'Run npm run test:e2e:local to include local course files.');
  test('fixture inventory is present', () => {
    for (const group of groups) {
      const dir = path.join(root, group.folder);
      expect(fs.existsSync(dir), `Missing fixture folder: ${group.folder}`).toBe(true);
      expect(fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith(group.extension)).length).toBeGreaterThan(0);
    }
  });
  for (const group of groups) {
    const dir = path.join(root, group.folder);
    const files = enabled && fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith(group.extension)).sort() : [];
    for (const [index, name] of files.entries()) {
      test(`${group.route} ${group.folder} fixture ${index + 1}`, async ({ page, guard }) => {
        await page.goto(`/${group.route}/`);
        await page.locator(group.input).setInputFiles(path.join(dir, name));
        // Boolean assertions keep course content out of failed locator diffs.
        await expect.poll(async () => (await page.locator(group.ready).isVisible()) ||
          (group.route === 'CalendarBridge' && await page.locator('#uploadError').isVisible()), { timeout: 60_000 }).toBe(true);
        let summary;
        if (group.route === 'ExamBridge') {
          summary = await page.evaluate(() => {
            const exam = window.__ExamBridgeQA.getState().exam;
            return { questions: exam.questions.length,
              rules: Object.fromEntries(Object.entries(exam.rules).map(([id, rule]) => [id, {
                level: rule.level, affected: rule.questions?.length ?? 0, evaluated: rule.evaluated ?? null,
              }])) };
          });
          expect(summary.questions).toBeGreaterThan(0);
          await page.locator('#printBtn').click();
          await expect.poll(() => page.locator('#reportModal').isVisible()).toBe(true);
          await page.evaluate(() => { window.print = () => {}; });
          await page.locator('#generateReportBtn').click();
          expect(await page.locator('#reportOutput').evaluate(el => el.textContent.length > 100)).toBe(true);
        } else if (group.route === 'ItemBridge') {
          summary = await page.evaluate(() => {
            const { state, analyze } = window.ItemBridge, exam = state.exams[0];
            return { items: exam.items.length, recommendations: exam.items.reduce((out, item) => {
              const level = analyze(item, exam).level; out[level] = (out[level] || 0) + 1; return out;
            }, {}) };
          });
          expect(summary.items).toBeGreaterThan(0);
          const pending = page.waitForEvent('download');
          await page.locator('#exportReview').click();
          const download = await pending, bytes = fs.readFileSync(await download.path());
          expect(bytes.includes(Buffer.from('ItemID'))).toBe(true);
          expect(bytes.includes(Buffer.from('Recommendation'))).toBe(true);
          await download.delete();
        } else if (group.route === 'CalendarBridge') {
          const accepted = await page.locator(group.ready).isVisible();
          summary = { accepted };
          if (accepted) {
            summary.events = await page.evaluate(() => state.events.length);
            summary.needsReview = await page.evaluate(() => state.events.filter(e => eventIssues(e).length).length);
            expect(summary.events).toBeGreaterThan(0);
            await page.locator('#toFaculty').click();
            if (summary.needsReview) {
              expect(await page.locator('#toExport').isDisabled()).toBe(true);
            } else {
              await page.locator('#toExport').click();
              const pending = page.waitForEvent('download');
              await page.locator('#saveProject').click();
              const download = await pending;
              const project = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
              expect(project.events.length).toBe(summary.events);
              await download.delete();
            }
          } else {
            expect(await page.locator('#uploadError').evaluate(el => el.textContent.length > 20)).toBe(true);
            // CalendarBridge also logs this on-screen rejection to the console. A rejection is an
            // allowed, recorded outcome, so forgive only that exact logged message.
            guard.allowConsoleError(await page.locator('#uploadError').evaluate(el => el.lastChild?.textContent?.trim() || ''));
          }
        } else {
          summary = await page.evaluate(() => ({ sections: state.sections.length, faculty: state.faculty.length,
            clos: state.clos.length, assessments: state.assessments.length, schedule: state.schedule.length }));
          expect(summary.sections).toBeGreaterThan(0);
          await page.locator('#runValidation').click();
          await expect.poll(() => page.locator('#screen-report').isVisible()).toBe(true);
          summary.checks = await page.locator('#results .result').count();
          summary.validation = await page.evaluate(() => state.results.reduce((out, result) => {
            out[result.status] = (out[result.status] || 0) + 1; return out;
          }, {}));
          expect(summary.checks).toBeGreaterThan(0);
          summary.handoffBlockers = await page.evaluate(() => handoffBlockingProblems().length);
          // Export may ask a question in the shared pop-up (blocking dates or remaining issues); accept it.
          const sharedDialog = page.locator('dialog.ft-dialog[open]');
          const acceptIfAsked = async () => { if (await sharedDialog.count()) await sharedDialog.locator('[data-ft-dialog-action="confirm"]').click(); };
          if (summary.handoffBlockers) {
            await page.locator('#exportCourseJsonReport').click();
            await acceptIfAsked();
            await expect.poll(() => page.locator('#screen-review').isVisible()).toBe(true);
          } else {
            const pending = page.waitForEvent('download');
            await page.locator('#exportCourseJsonReport').click();
            await acceptIfAsked();
            const download = await pending;
            const course = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
            expect(course.schema === 'facultybridge.course').toBe(true);
            expect(course.schedule.length).toBe(summary.schedule);
            await download.delete();
          }
        }
        const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
        const baseline = path.join(baselineDir, `${group.route}-${hash}.json`);
        if (process.env.BRIDGE_CAPTURE_BASELINE === '1') {
          fs.mkdirSync(baselineDir, { recursive: true });
          fs.writeFileSync(baseline, JSON.stringify(summary, null, 2) + '\n');
        } else {
          expect(fs.existsSync(baseline), 'Missing reviewed baseline; see tests/README.md.').toBe(true);
          expect(summary).toEqual(JSON.parse(fs.readFileSync(baseline, 'utf8')));
        }
      });
    }
  }
});
