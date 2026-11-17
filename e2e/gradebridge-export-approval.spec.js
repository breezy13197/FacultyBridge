import { test, expect, downloadFrom, parseCsv } from './fixtures.js';
import { gradeExamCsv } from './workflows.js';

// An approved export must belong to the exact roster, matches, grade item, and
// maximum that faculty reviewed. Changing any of them clears the approval.
// Synthetic data only: two saved courses share names but have different IDs.
const roster = ids => [['Able', 'Anna'], ['Baker', 'Ben'], ['Clark', 'Cara']]
  .map(([last, first], i) => ({ OrgDefinedId: ids[i], 'First Name': first, 'Last Name': last }));
const savedCourses = {
  'Course A – 2026': { savedAt: new Date().toISOString(), roster: roster(['00001', '00002', '00003']), map: {}, gradeItems: ['Exam 1', 'Quiz 1'] },
  'Course B – 2026': { savedAt: new Date().toISOString(), roster: roster(['99999', '99998', '99997']), map: {}, gradeItems: ['Exam 1', 'Quiz 1'] },
};
const examFile = { name: 'exam.csv', mimeType: 'text/csv', buffer: Buffer.from(gradeExamCsv) };

async function approveExport(page, course) {
  await page.locator('#savedSelect').selectOption(course);
  await expect(page.locator('#preflightCard')).toBeVisible();
  await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
  await page.locator('#continueBtn').click();
  await expect(page.locator('#reviewCard')).toBeVisible();
  await page.locator('#prepareBtn').click();
  await expect(page.locator('#auditCard')).toBeVisible();
  await page.locator('#maxConfirm').check();
  await expect(page.locator('#downloadBtn')).toBeEnabled();
}
async function expectApprovalCleared(page) {
  await expect(page.locator('#auditCard')).toBeHidden();
  await expect(page.locator('#maxConfirm')).not.toBeChecked();
  await expect(page.locator('#downloadBtn')).toBeDisabled();
}
const exportedIds = text => parseCsv(text).slice(1).filter(r => r[0]).map(r => r[0]);

test.describe('GradeBridge export approval is bound to what was reviewed', () => {
  test.beforeEach(async ({ page, openTool }) => {
    await page.addInitScript(store => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('gradebridge_profiles_v6', JSON.stringify(store));
        sessionStorage.setItem('seeded', '1');
      }
    }, savedCourses);
    await openTool('gradebridge');
    await page.locator('#examFile').setInputFiles(examFile);
  });

  test('switching saved course clears approval and exports only the new roster', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#savedSelect').selectOption('Course B – 2026');
    await expectApprovalCleared(page);
    await expect(page.locator('#reviewCard')).toBeHidden();

    await approveExport(page, 'Course B – 2026');
    const { text } = await downloadFrom(page, () => page.locator('#downloadBtn').click());
    expect(exportedIds(text)).toEqual(['99999', '99998', '99997']);
  });

  test('"Use" in the saved-courses window also clears approval', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#savedBtn').click();
    await page.locator('#savedList .course-row', { hasText: 'Course B' }).getByRole('button', { name: 'Use' }).click();
    await expectApprovalCleared(page);
    await expect(page.locator('#reviewCard')).toBeHidden();
  });

  test('a stale approval cannot download even if the button is re-enabled', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#savedSelect').selectOption('Course B – 2026');
    // Simulate any path that leaves the old controls usable.
    await page.evaluate(() => {
      document.getElementById('auditCard').classList.remove('hidden');
      document.getElementById('maxConfirm').checked = true;
      document.getElementById('downloadBtn').disabled = false;
    });
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('#downloadBtn').click();
    await expect(page.getByText('changed since you reviewed')).toBeVisible();
    await expect(page.locator('#downloadBtn')).toBeDisabled();
    expect(downloaded).toBe(false);
  });

  test('changing the maximum points after the audit clears approval but keeps matching', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#maxPoints').fill('60');
    await expectApprovalCleared(page);
    await expect(page.locator('#reviewCard')).toBeVisible();
    await page.locator('#prepareBtn').click();
    await expect(page.locator('#auditHeadline')).toContainText('out of 60');
  });

  test('changing the grade item after the audit clears approval', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#gradeItemSelect').selectOption({ label: 'Quiz 1' });
    await expectApprovalCleared(page);
    await page.locator('#prepareBtn').click();
    await page.locator('#maxConfirm').check();
    const { name, text } = await downloadFrom(page, () => page.locator('#downloadBtn').click());
    expect(name).toBe('Brightspace_Quiz_1.csv');
    expect(text.split('\r\n')[0]).toBe('OrgDefinedId,Quiz 1 Points Grade,End-of-Line Indicator');
  });

  test('changing a student match after the audit clears approval and says why', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#autoDetails > summary').click();
    await page.locator('#unlockBtn').click();
    await page.locator('#autoTable').getByRole('button', { name: 'Save change' }).first().click();
    await expectApprovalCleared(page);
    await expect(page.locator('#reviewStatus')).toContainText('A student match changed after the audit was prepared');
  });

  test('switching course asks first when matching decisions have not been downloaded', async ({ page }) => {
    await approveExport(page, 'Course A – 2026');
    await page.locator('#autoDetails > summary').click();
    await page.locator('#unlockBtn').click();
    await page.locator('#autoTable').getByRole('button', { name: 'Save change' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Switch saved course?' });

    await page.locator('#savedSelect').selectOption('Course B – 2026');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#savedSelect')).toHaveValue('Course A – 2026');
    await expect(page.locator('#reviewCard')).toBeVisible();

    await page.locator('#savedSelect').selectOption('Course B – 2026');
    await dialog.getByRole('button', { name: 'Switch course' }).click();
    await expect(page.locator('#reviewCard')).toBeHidden();
    await expect(page.locator('#savedSelect')).toHaveValue('Course B – 2026');
    await expect(page.getByText('Matching and the final audit were cleared')).toBeVisible();
  });
});
