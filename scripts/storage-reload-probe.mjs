// Storage-reload probe (issue #50). Test-only: it changes no tool code.
//
// Opens each standalone (file://) build in a real, persistent browser profile,
// saves a random value to localStorage, reloads at once, and checks the value
// is still there. Prints how many saves were lost per tool. Several workers
// running at once put the computer under load, which is when losses appear.
//
//   npm run build
//   npm run probe:storage                          # 1 worker, Playwright Chromium
//   npm run probe:storage -- --workers=8           # heavier load
//   npm run probe:storage -- --channel=msedge      # installed Microsoft Edge
//   npm run probe:storage -- --tools=ExamBridge,QuestionBridge --rounds=100 --delay=500
//
// Options: --workers=N (default 1)  --rounds=N saves per worker per tool (default 40)
//          --delay=MS wait between save and reload (default 0)
//          --channel=msedge|chrome  --executable=PATH (or CHROMIUM_EXECUTABLE_PATH)
//          --tools=Name,Name (default: every tool in suite.json)  --headed
// Exit code: 0 when nothing was lost, 1 when any save was lost, 2 on a setup error.
// Only synthetic random values are written; profiles are temporary and deleted.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'facultybridge-storage-probe';

function options(argv) {
  const known = new Set(['workers', 'rounds', 'delay', 'channel', 'executable', 'tools', 'headed']);
  const opts = { workers: 1, rounds: 40, delay: 0, channel: '', executable: process.env.CHROMIUM_EXECUTABLE_PATH || '', tools: '', headed: false };
  for (const arg of argv) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!match || !known.has(match[1])) throw new Error(`Unknown option ${arg}. See the top of scripts/storage-reload-probe.mjs.`);
    const [, name, value] = match;
    if (name === 'headed') opts.headed = true;
    else if (['workers', 'rounds', 'delay'].includes(name)) {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (name === 'delay' ? 0 : 1)) throw new Error(`--${name} needs a whole number${name === 'delay' ? '' : ' of 1 or more'}.`);
      opts[name] = n;
    } else opts[name] = value ?? '';
  }
  if (opts.channel && opts.executable) throw new Error('Use either --channel or --executable, not both.');
  return opts;
}

function standaloneFiles(onlyTools) {
  const suite = JSON.parse(fs.readFileSync(path.join(root, 'suite.json'), 'utf8'));
  const wanted = onlyTools ? onlyTools.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;
  const tools = suite.tools.filter(t => !wanted || wanted.includes(t.name.toLowerCase()) || wanted.includes(t.id));
  if (wanted && tools.length !== wanted.length) throw new Error(`Unknown tool in --tools. Choose from: ${suite.tools.map(t => t.name).join(', ')}.`);
  return tools.map(t => {
    const file = path.join(root, 'dist/standalone', `${t.name}-v${t.version}-build${suite.suiteVersion}.html`);
    if (!fs.existsSync(file)) throw new Error(`${path.relative(root, file)} is missing. Run npm run build first.`);
    return { name: t.name, url: pathToFileURL(file).href };
  });
}

async function probeWorker(chromium, launch, tool, worker, opts) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-storage-probe-'));
  let lost = 0;
  try {
    const context = await chromium.launchPersistentContext(profile, launch);
    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(tool.url);
      for (let round = 0; round < opts.rounds; round++) {
        const value = `${worker}-${round}-${Math.random().toString(36).slice(2)}`;
        await page.evaluate(([k, v]) => globalThis.localStorage.setItem(k, v), [KEY, value]);
        if (opts.delay) await page.waitForTimeout(opts.delay);
        await page.reload();
        if (await page.evaluate(k => globalThis.localStorage.getItem(k), KEY) !== value) lost++;
      }
      await page.evaluate(k => globalThis.localStorage.removeItem(k), KEY);
    } finally {
      await context.close();
    }
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return lost;
}

async function main() {
  const opts = options(process.argv.slice(2));
  const tools = standaloneFiles(opts.tools);
  const { chromium } = await import('playwright');
  const launch = { headless: !opts.headed, ...(opts.channel ? { channel: opts.channel } : {}), ...(opts.executable ? { executablePath: opts.executable } : {}) };
  const browserLabel = opts.channel || (opts.executable ? `Chromium at ${opts.executable}` : 'Playwright Chromium');
  console.log(`Storage-reload probe · ${browserLabel} · ${os.platform()} · ${os.cpus().length} CPUs`);
  console.log(`${opts.workers} worker(s) × ${opts.rounds} reloads per tool, ${opts.delay} ms between save and reload\n`);
  let lostTotal = 0, total = 0;
  for (const tool of tools) {
    const counts = await Promise.all(Array.from({ length: opts.workers }, (_, w) => probeWorker(chromium, launch, tool, w, opts)));
    const lost = counts.reduce((a, b) => a + b, 0), runs = opts.workers * opts.rounds;
    lostTotal += lost; total += runs;
    console.log(`${tool.name.padEnd(16)} lost ${lost} of ${runs}`);
  }
  console.log(`${'All tools'.padEnd(16)} lost ${lostTotal} of ${total}`);
  if (lostTotal) console.log('\nSaves were lost across a reload. Record these counts in the release record (see issue #50).');
  process.exitCode = lostTotal ? 1 : 0;
}

main().catch(error => {
  console.error(`Storage-reload probe could not run: ${error.message}`);
  process.exitCode = 2;
});
