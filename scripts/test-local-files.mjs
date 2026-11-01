import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const capture = process.argv.includes('--capture');
if (capture && process.env.CI) throw new Error('Local baselines must be reviewed outside CI.');
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
// The list reporter keeps real course text out of playwright-report/.
const result = spawnSync(process.execPath, [cli, 'test', 'local-files.spec.js', '--project=chromium', '--workers=1', '--reporter=list'], {
  stdio: 'inherit', env: { ...process.env, BRIDGE_LOCAL_FILES: '1', BRIDGE_CAPTURE_BASELINE: capture ? '1' : '0' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
