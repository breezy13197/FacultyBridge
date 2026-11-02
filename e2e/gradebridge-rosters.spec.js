import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './fixtures.js';

// Normal runs, including CI, require the committed synthetic fixtures. Private
// runs can select the ignored QA roster set with traces and HTML reports disabled.
const localDir = path.resolve(process.env.BRIDGE_FIXTURE_DIR || 'tests/test files', 'rosters');
const useLocal = !process.env.CI && process.env.BRIDGE_LOCAL_FILES === '1' && fs.existsSync(localDir);
const dir = useLocal ? localDir : path.resolve(import.meta.dirname, 'data/gradebridge');
const file = name => path.join(dir, name);
test.use({ redact: useLocal });

const ROSTER = 'brightspace_roster_WITH_GRADE_ITEMS.csv';
async function load(page, openTool, exam, bright = ROSTER) {
  await openTool('gradebridge');
  await page.locator('#examFile').setInputFiles(file(exam));
  await page.locator('#brightFile').setInputFiles(file(bright));
}
async function review(page) {
  await page.locator('#gradeItemSelect').selectOption({ label: 'Exam 1' });
  await page.locator('#continueBtn').click();
  await expect(page.locator('#reviewCard')).toBeVisible();
}

test.describe('GradeBridge Brightspace roster files', () => {
  test('plain roster loads with no existing grade items', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_A_happy_path.csv', 'brightspace_roster.csv');
    await expect(page.locator('#brightStatus')).toContainText('13 Brightspace students');
    await expect(page.locator('#pfItems')).toHaveText('0');
  });

  test('roster with grade items detects them', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_A_happy_path.csv');
    await expect(page.locator('#brightStatus')).toContainText('13 Brightspace students');
    await expect(page.locator('#pfItems')).toHaveText('2');
  });

  test('Excel-mangled IDs are refused', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_A_happy_path.csv', 'brightspace_roster_EXCEL_MANGLED.csv');
    await expect(page.locator('#brightStatus')).toContainText('scientific notation');
    await expect(page.locator('#preflightCard')).toBeHidden();
  });

  test('CR-only line endings load all students', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_A_happy_path.csv', 'brightspace_roster_CR_ONLY.csv');
    await expect(page.locator('#brightStatus')).toContainText('13 Brightspace students');
    await expect(page.locator('#preflightCard')).toBeVisible();
  });

  test('valid UTF-8 Portuguese names are accepted', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_J_portuguese_names.csv', 'brightspace_roster_PORTUGUESE.csv');
    await expect(page.locator('#brightStatus')).toContainText('3 Brightspace students');
    await expect(page.locator('#examStatus')).toContainText('3 ExamSoft records');
  });

  test('genuine mojibake is still refused', async ({ page, openTool }) => {
    await openTool('gradebridge');
    // "Jo" + the UTF-8 bytes of "ã" read as Latin-1 and re-saved: the classic double-encoding.
    const garbled = Buffer.from(['OrgDefinedId,Last Name,First Name', '1,Ferreira,Jo' + String.fromCharCode(0xC3, 0xA3) + 'o'].join('\r\n'), 'utf8');
    await page.locator('#brightFile').setInputFiles({ name: 'garbled.csv', mimeType: 'text/csv', buffer: garbled });
    await expect(page.locator('#brightStatus')).toContainText('unsupported text encoding');
  });
});

test.describe('GradeBridge ExamSoft export files', () => {
  test('percent-only export is refused', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_G_percent_only.csv');
    await expect(page.locator('#examStatus')).toContainText('percentages but no raw points');
    await expect(page.locator('#preflightCard')).toBeHidden();
  });

  test('banner rows above the header are skipped', async ({ page, openTool }) => {
    await load(page, openTool, 'examsoft_H_banner_rows.csv');
    await expect(page.locator('#examStatus')).toContainText('12 ExamSoft records');
    await expect(page.locator('#examStatus')).toContainText('header detected on row 5');
    await expect(page.locator('#pfExam')).toHaveText('12');
  });

  // Maximum is inferred from Pts / %, so whole-number and decimal percents agree.
  for (const [name, max] of [
    ['examsoft_A_happy_path.csv', '75'],
    ['examsoft_B_whole_number_percent.csv', '75'],
    ['examsoft_F_bonus_over_max.csv', '75'],
    ['examsoft_K_200pt_whole_percent.csv', '200'],
  ]) {
    test(`${name}: infers maximum ${max}`, async ({ page, openTool }) => {
      await load(page, openTool, name);
      await expect(page.locator('#pfExam')).toHaveText('12');
      await expect(page.locator('#maxPoints')).toHaveValue(max);
    });
  }
});

// Every file below has students that need faculty attention, so the final audit
// must stay blocked until they are resolved. Counts are observed behavior; review
// them before relying on them, as with the other local baselines.
const review_cases = [
  // file, exam records, resolved, needs attention, Brightspace-only
  ['examsoft_A_happy_path.csv', 12, 10, 2, 1],        // the two John Smiths are ambiguous
  ['examsoft_B_whole_number_percent.csv', 12, 10, 2, 1],
  ['examsoft_C_name_variants.csv', 12, 6, 6, 5],      // nicknames, accents, spacing, suffixes
  ['examsoft_D_missing_scores.csv', 12, 7, 5, 1],     // blank, Absent, "-" are not guessed
  ['examsoft_E_retake_duplicate.csv', 13, 9, 4, 1],   // duplicate Student ID
  ['examsoft_F_bonus_over_max.csv', 12, 10, 2, 1],
  ['examsoft_H_banner_rows.csv', 12, 10, 2, 1],
  ['examsoft_I_same_name_different_id.csv', 13, 10, 3, 1],
  ['examsoft_K_200pt_whole_percent.csv', 12, 10, 2, 1],
];
test.describe('GradeBridge review gates with roster fixtures', () => {
  for (const [name, records, resolved, attention, brightOnly] of review_cases) {
    test(`${name}: ${attention} need attention and block the audit`, async ({ page, openTool }) => {
      await load(page, openTool, name);
      await expect(page.locator('#pfExam')).toHaveText(String(records));
      await review(page);
      await expect(page.locator('#mResolved')).toHaveText(String(resolved));
      await expect(page.locator('#mAttention')).toHaveText(String(attention));
      await expect(page.locator('#mBrightOnly')).toHaveText(String(brightOnly));
      await page.locator('#prepareBtn').click();
      await expect(page.locator('#reviewStatus')).toContainText('Cannot prepare final audit');
      await expect(page.locator('#auditCard')).toBeHidden();
    });
  }
});
