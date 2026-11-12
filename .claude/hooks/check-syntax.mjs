// Runs after Claude edits or writes a file (PostToolUse hook).
//
// Gives a fast syntax check (under a second) on JavaScript files, so a missing
// bracket or quote is caught right after the edit instead of minutes later in
// `npm run check`. It only checks that the code can be read; it does not run it.
//
// - Browser scripts in apps/ and packages/ are checked the same way
//   tests/build.test.mjs checks them (as classic browser scripts).
// - Other .js/.mjs/.cjs files (build scripts, tests) use `node --check`.
// - vendor/ (third-party code) and node_modules/ are skipped.
//
// On a syntax error the script exits with code 2. Claude Code then shows the
// error to Claude, which fixes it.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let call;
  try { call = JSON.parse(input); } catch { return; }

  const target = call?.tool_input?.file_path;
  if (!target || !/\.(c|m)?js$/.test(target)) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || call.cwd || process.cwd();
  const absolute = path.resolve(projectDir, target);
  const relative = path.relative(projectDir, absolute).split(path.sep).join('/');
  if (relative.startsWith('../') || /^(vendor|node_modules|dist)\//.test(relative)) return;
  if (!fs.existsSync(absolute)) return;

  let problem = '';
  if (/^(apps|packages)\//.test(relative) && relative.endsWith('.js')) {
    try {
      new vm.Script(fs.readFileSync(absolute, 'utf8'), { filename: relative });
    } catch (error) {
      problem = String(error.stack || error).split('\n').filter((line) => line.trim()).slice(0, 4).join('\n');
    }
  } else {
    const result = spawnSync(process.execPath, ['--check', absolute], { encoding: 'utf8' });
    if (result.status !== 0) problem = (result.stderr || result.stdout || 'Syntax check failed.').trim();
  }

  if (problem) {
    process.stderr.write(`Syntax error in ${relative} after this edit. Fix it before continuing:\n${problem}\n`);
    process.exit(2);
  }
});
