import { test, expect } from './fixtures.js';
import { workflows } from './workflows.js';

// FacultyBridge promises that nothing leaves the computer. These run each full workflow
// with the network disabled once the page has loaded. A tool that lazy-loads a script,
// font, or library after first paint will fail here. (The shared fixture also records any
// attempted external request, so this proves the page needs no network to work.)
for (const [tool, run] of Object.entries(workflows)) {
  test(`${tool}: full workflow works offline`, async ({ page, context, openTool }) => {
    const offlineOpen = async id => {
      await context.setOffline(false);
      await openTool(id);
      await context.setOffline(true);
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    };
    await run({ page, openTool: offlineOpen });
  });
}
