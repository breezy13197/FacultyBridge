import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fixtureRoot, groups, fixtureFiles, skippedTemporaryFiles, testTitle } from '../e2e/local-fixtures.js';

const captureAll = process.argv.includes('--capture');
const captureMissing = process.argv.includes('--capture-missing');
if ((captureAll || captureMissing) && process.env.CI) throw new Error('Local baselines must be reviewed outside CI.');
const passThrough = process.argv.slice(2).filter(arg => arg !== '--capture' && arg !== '--capture-missing');

// Print which file each numbered test uses. This stays in your terminal only; test names
// and reports use numbers so course file names are not written into test-results/.
console.log(`Local course files: ${fixtureRoot}`);
for (const group of groups) {
  const files = fixtureFiles(group);
  if (!files.length && group.optional && !fs.existsSync(`${fixtureRoot}/${group.folder}`)) continue;
  console.log(`\n${group.route} · ${group.folder}/`);
  files.forEach((name, index) => console.log(`  ${testTitle(group, index)}: ${name}`));
  for (const name of skippedTemporaryFiles(group))
    console.log(`  (skipped temporary file ${name} - close it in Word/Excel or delete it)`);
}
console.log('');

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
// The list reporter keeps real course text out of playwright-report/.
const result = spawnSync(process.execPath, [cli, 'test', 'local-files.spec.js', '--project=chromium', '--workers=1', '--reporter=list', ...passThrough], {
  stdio: 'inherit',
  env: { ...process.env, BRIDGE_LOCAL_FILES: '1', BRIDGE_CAPTURE_BASELINE: captureAll ? '1' : captureMissing ? 'missing' : '0' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
