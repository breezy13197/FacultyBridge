import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'suite.json')));
const read = p => fs.readFileSync(p, 'utf8');
const blockPattern = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>|<link\b[^>]*>/gi;
function *walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p,e.name); if(e.isDirectory()) yield*walk(f); else yield f; } }
test('all eight modular pages resolve dependencies, have build identities and parseable scripts', () => {
  assert.equal(manifest.tools.length, 8);
  for (const t of manifest.tools) {
    const file = path.join(root, 'dist/site', t.route, 'index.html');
    const html = read(file); assert.ok(html.includes(`data-ft-tool="${t.id}"`));
    const metadata = read(path.join(path.dirname(file), 'build-info.js'));
    assert.ok(metadata.includes(`"version":"${t.version}"`));
    for (const m of html.matchAll(blockPattern)) {
      if (m[1] === 'style') continue;
      const ref = m[0].match(/\b(?:href|src)=["']([^"']+)["']/);
      if (!ref) continue;
      assert.ok(!/^(https?:|\/\/)/.test(ref[1]), `Remote asset: ${ref[1]}`);
      const asset = path.resolve(path.dirname(file), ref[1]); assert.ok(fs.existsSync(asset), `${file}: ${ref[1]}`);
      if (m[1] === 'script') new vm.Script(read(asset), { filename: asset });
    }
  }
});
test('suite.json names a real support contact', () => {
  assert.match(manifest.support?.email ?? '', /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i, 'suite.json support.email must be set to the address faculty should contact');
});
test('standalone builds are self-contained with valid JS, including report templates', () => {
  const dir = path.join(root, 'dist/standalone'); const files = [...walk(dir)];assert.equal(files.length, 8);
  for (const file of files) {
    assert.ok(path.basename(file).includes(`build${manifest.suiteVersion}`));
    const html=read(file);
    for(const m of html.matchAll(blockPattern)) {
      if(m[1]==='script') { assert.ok(!/\bsrc=/.test(m[2]));new vm.Script(m[3],{filename:file}); }
      if(m[0].startsWith('<link')) assert.ok(!/rel=["']stylesheet/.test(m[0]));
    }
    assert.ok(html.includes('"output":"standalone"'));
  }
});
test('every referenced design token is defined and shared foundation is not copied into apps', () => {
  const files = [...walk(path.join(root,'packages/ui')), ...walk(path.join(root,'apps'))];
  const css = files.filter(f => f.endsWith('.css')).map(read).join('\n');
  const definitions = new Set([...files.map(read).join('\n').matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));
  for(const ref of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(definitions.has(ref[1]), `Undefined token ${ref[1]}`);
  for(const t of manifest.tools) {
    const html=read(path.join(root,'apps',t.id,'index.html'));
    for(const name of ['tokens','themes','components','utilities']) assert.ok(html.includes(`packages/ui/${name}.css`));
    const css=read(path.join(root,'apps',t.id,`${t.id}.css`));
    assert.ok(!/--ft-(?:bg|surface|text|font-sans|radius-\w+|space-\w+)\s*:/.test(css),`Duplicate foundation in ${t.id}`);
  }
});
test('every shared ft- class a tool uses has a style rule', () => {
  // A class with no matching rule silently does nothing: the intended spacing or color never appears.
  const ui=path.join(root,'packages/ui');
  const css=[...walk(ui),...walk(path.join(root,'apps'))].filter(f=>f.endsWith('.css')).map(read).join('\n');
  const defined=new Set([...css.matchAll(/\.(ft-[\w-]+)/g)].map(m=>m[1]));
  // 'ft-theme' is the saved-setting name for light/dark mode, not a class.
  const notClasses=new Set(['ft-theme']);
  for(const file of [...walk(path.join(root,'apps')),...walk(path.join(ui,'examples')),...walk(path.join(ui,'templates'))].filter(f=>/\.(html|js)$/.test(f))) {
    for(const m of read(file).matchAll(/(?<![\w-])ft-[a-z][\w-]*(?![\w-])/g)) {
      if(notClasses.has(m[0])||m[0].endsWith('-')) continue;
      assert.ok(defined.has(m[0]),`${path.relative(root,file)} uses .${m[0]}, which no stylesheet defines`);
    }
  }
});
test('tools use the shared pop-up and unsaved-work warning, not browser boxes or home-made pop-ups', () => {
  const browserBox=/(^|[^.\w$])(?:window\.)?(alert|confirm|prompt)\(/m;
  for(const t of manifest.tools) {
    const dir=path.join(root,'apps',t.id), html=read(path.join(dir,'index.html'));
    assert.ok(html.includes('packages/ui/dialog.js'),`${t.id} must load packages/ui/dialog.js`);
    assert.ok(!/role=["']dialog["']|aria-modal=/.test(html),`${t.id} has a home-made pop-up; use <dialog class="ft-dialog">`);
    for(const tag of html.matchAll(/<dialog\b[^>]*>/g)) assert.ok(/class="[^"]*\bft-dialog\b/.test(tag[0]),`${t.id}: ${tag[0]} needs class ft-dialog`);
    for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))) {
      const js=read(path.join(dir,file)), box=js.match(browserBox);
      assert.ok(!box,`${t.id}/${file} calls the browser's ${box?.[2]}(); use FTDialog.${box?.[2]}()`);
      assert.ok(!/beforeunload/.test(js),`${t.id}/${file} has its own leave warning; use FTUnsavedWork`);
    }
  }
});
test('tool and shared UI sources use American spelling of canceled/canceling', () => {
  // packages/ui/DESIGN-SYSTEM.md (Copy style) requires American English; "cancelled"/"cancelling" are British spellings.
  for (const dir of ['apps','packages/ui']) for (const file of walk(path.join(root,dir))) {
    if(!/\.(js|html|css|md)$/.test(file)) continue;
    const hit=read(file).match(/cancell(?:ed|ing)/i);
    assert.ok(!hit,`${path.relative(root,file)} uses "${hit?.[0]}"; use "canceled"/"canceling"`);
  }
});
test('visible version numbers come from suite.json, not hand-typed text', () => {
  // suite.json is the one place versions live (AGENTS.md). Pages use {{version}},
  // which scripts/build.mjs fills in, so a release never leaves an old number on screen.
  const typed = /(?:Bridge v|>v)\d+\.\d/;
  for (const t of manifest.tools) {
    const source = read(path.join(root, 'apps', t.id, 'index.html'));
    assert.ok(!typed.test(source), `apps/${t.id}/index.html has a hand-typed version; use v{{version}}`);
    assert.ok(source.includes('v{{version}}'), `apps/${t.id}/index.html should show its version with v{{version}}`);
    // Protected tool code may still name its version in text faculty see; it must match suite.json.
    for (const m of read(path.join(root, 'apps', t.id, `${t.id}.js`)).matchAll(new RegExp(`${t.name} v(\\d+(?:\\.\\d+)*)`, 'g')))
      assert.equal(m[1], t.version, `apps/${t.id}/${t.id}.js shows "${m[0]}" but suite.json says ${t.version}`);
    for (const dir of ['dist/site', 'dist/standalone']) {
      const built = dir === 'dist/site' ? read(path.join(root, dir, t.route, 'index.html')) : read(path.join(root, dir, `${t.name}-v${t.version}-build${manifest.suiteVersion}.html`));
      assert.ok(!built.includes('{{version}}'), `${dir} ${t.name} still contains {{version}}`);
      assert.match(built, new RegExp(`<title>[^<]*v${t.version.replaceAll('.', '\\.')}\\b`), `${dir} ${t.name} title should show v${t.version}`);
    }
  }
});
test('summary counts use the shared ft-metric card instead of per-tool copies', () => {
  // packages/ui/DESIGN-SYSTEM.md "Metric cards": one shared big-number card across tools.
  const css=read(path.join(root,'packages/ui/components.css'));
  for (const cls of ['ft-metric','ft-metric-value','ft-metric-label','ft-metric-detail','ft-metric-ready','ft-metric-warning','ft-metric-error','ft-metric-brand'])
    assert.match(css,new RegExp(`\\.${cls}\\s*\\{`),`components.css defines .${cls}`);
  assert.ok(read(path.join(root,'packages/ui/examples/component-gallery.html')).includes('class="ft-metric'),'component gallery shows metric cards');
  // Where each tool writes its summary cards: page markup or, for generated cards, the tool script.
  const sources={calendarbridge:'index.html',exambridge:'exambridge.js',itembridge:'itembridge.js',questionbridge:'index.html',syllabusbridge:'index.html'};
  // Per-tool rules that used to size or pad the card or its number with one-off values.
  const retired={calendarbridge:[/\.cb-metric\s*\{/],exambridge:[/\.eb-metric-value\s*\{/,/\.eb-metric-label\s*\{/,/\.eb-metric-detail\s*\{/,/\.eb-metric\s*\{[^}]*padding/],
    itembridge:[/\.ib-metric\s*\{[^}]*padding/,/\.ib-metric\.is-(?:danger|warning|teal|good)/],questionbridge:[/\.qb-metric\b(?!s)/],syllabusbridge:[/\.summary-stat\b/,/(^|[^-\w])\.metric\s*\{/]};
  for (const [id,file] of Object.entries(sources)) {
    const markup=read(path.join(root,'apps',id,file));
    assert.ok(/class="[^"]*\bft-metric\b/.test(markup),`${id} summary cards use .ft-metric (${file})`);
    assert.ok(/\bft-metric-value\b/.test(markup)||id==='itembridge',`${id} marks its numbers with .ft-metric-value`);
    const toolCss=read(path.join(root,'apps',id,`${id}.css`));
    for (const rule of retired[id]) assert.ok(!rule.test(toolCss),`${id}.css still has a per-tool metric rule matching ${rule}`);
  }
});
test('recorded baseline logic hashes remain intact', () => {
  const baseline=JSON.parse(read(path.join(root,'tests/import-baseline.json')));
  // Whitelisted migration edits affect theme storage and CSS classes, never processing functions.
  const normalize=s=>s.replace(/\r\n?/g,'\n').trim().replace(/'(?:qbTheme|groupbridge-theme|gradebridge_theme|itembridge-theme)'/g,"'ft-theme'").replace(/document.documentElement.dataset.ftTheme=t;/g,'').replace(/\sft-[\w-]+(?=[\s"'])/g,'');
  // A key is a tool id (apps/<id>/<id>.js) or the path of shared processing code, such as the schedule reader
  // CalendarBridge and SyllabusBridge both use.
  for(const [id,expected] of Object.entries(baseline)) {
    const source=read(path.join(root,...(id.includes('/')?[id]:['apps',id,`${id}.js`])));
    // Windows checkouts may use CRLF; compare code using canonical LF line endings.
    for (const variant of [source, source.replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')]) {
      const s=normalize(variant);
      assert.equal(crypto.createHash('sha256').update(s).digest('hex'),expected,`${id} logic changed outside the migration whitelist`);
    }
  }
});
test('build is deterministic and checksum manifest covers every artifact', () => {
  const file=path.join(root,'dist/build-manifest.json'),before=read(file);
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});assert.equal(read(file),before);
  const report=JSON.parse(before);
  for(const entry of report.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',entry.path))).digest('hex'),entry.sha256);
});
