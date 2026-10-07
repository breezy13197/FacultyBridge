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
test('recorded baseline logic hashes remain intact', () => {
  const baseline=JSON.parse(read(path.join(root,'tests/import-baseline.json')));
  // Whitelisted migration edits affect theme storage and CSS classes, never processing functions.
  const normalize=s=>s.trim().replace(/'(?:qbTheme|groupbridge-theme|gradebridge_theme|itembridge-theme)'/g,"'ft-theme'").replace(/document.documentElement.dataset.ftTheme=t;/g,'').replace(/\sft-[\w-]+(?=[\s"'])/g,'');
  for(const [id,expected] of Object.entries(baseline)) {
    const s=normalize(read(path.join(root,'apps',id,`${id}.js`)));
    assert.equal(crypto.createHash('sha256').update(s).digest('hex'),expected,`${id} logic changed outside the migration whitelist`);
  }
});
test('build is deterministic and checksum manifest covers every artifact', () => {
  const file=path.join(root,'dist/build-manifest.json'),before=read(file);
  execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});assert.equal(read(file),before);
  const report=JSON.parse(before);
  for(const entry of report.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',entry.path))).digest('hex'),entry.sha256);
});
