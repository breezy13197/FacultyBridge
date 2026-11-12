// SyllabusBridge policy profiles (v2.3): every dated profile in
// apps/syllabusbridge/policy/ must be well formed, loaded by the page, and
// cover the whole grading scale exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../apps/syllabusbridge/policy/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const html = fs.readFileSync(new URL('../apps/syllabusbridge/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../apps/syllabusbridge/syllabusbridge.js', import.meta.url), 'utf8');
// Section keys SyllabusBridge knows (SECTION_RULES) and the editor fields a Fix this link can open.
const sectionKeys = new Set([...app.slice(app.indexOf('const SECTION_RULES'), app.indexOf('function norm(')).matchAll(/\{key:'(\w+)'/g)].map(m => m[1]));
const editorFields = new Set(['description', ...[...app.matchAll(/\['[^']+','(\w+)',state\.policies\.\w+\]/g)].map(m => m[1])]);

function load(file) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL(file, dir), 'utf8'), context, { filename: file });
  // Copy out of the sandbox so values compare as ordinary data.
  return JSON.parse(JSON.stringify(context.SyllabusBridgePolicyProfiles));
}

test('at least one dated policy profile exists and the page loads each one before the app', () => {
  assert.ok(files.length >= 1);
  for (const file of files) {
    const tag = `<script src="policy/${file}"></script>`;
    assert.ok(html.includes(tag), `index.html must load policy/${file}`);
    assert.ok(html.indexOf(tag) < html.indexOf('<script src="syllabusbridge.js">'), `policy/${file} must load before syllabusbridge.js`);
  }
});

for (const file of files) test(`${file} is a well-formed policy profile`, () => {
  const list = load(file);
  assert.equal(list.length, 1, 'each file adds exactly one profile');
  const p = list[0];
  assert.equal(`${p.id}.js`, file, 'the file name is the profile id');
  assert.match(p.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(p.id.endsWith(p.updated), 'the id ends with the date the policy was updated');
  assert.ok(p.name && typeof p.name === 'string');
  assert.ok(p.campus && typeof p.campus === 'object');

  // Every whole percent from 0 to 100 falls in exactly one band, with a GPA from 0 to 4.
  const rows = p.gradingScale.rows, seen = new Array(101).fill(0);
  for (const r of rows) {
    assert.ok(Number.isInteger(r.min) && Number.isInteger(r.max) && r.min <= r.max && r.min >= 0 && r.max <= 100, JSON.stringify(r));
    assert.ok(typeof r.gpa === 'number' && r.gpa >= 0 && r.gpa <= 4, JSON.stringify(r));
    for (let n = r.min; n <= r.max; n++) seen[n]++;
  }
  assert.deepEqual(seen.map((n, i) => [i, n]).filter(([, n]) => n !== 1), [], 'grading scale has gaps or overlaps');
  // The ends the policy states: >=90 is 4.0 and <=64 is 0.
  assert.deepEqual(rows.find(r => r.max === 100), { min: 90, max: 100, gpa: 4 });
  assert.deepEqual(rows.find(r => r.min === 0), { min: 0, max: 64, gpa: 0 });

  const ids = new Set();
  for (const c of p.contentChecks) {
    assert.ok(/^\w+$/.test(c.id) && !ids.has(c.id), `check id ${c.id}`); ids.add(c.id);
    assert.ok(c.title && c.action, `${c.id} needs a title and a suggested action`);
    assert.equal(typeof c.confirmed, 'boolean', `${c.id} must say whether its wording is confirmed`);
    for (const k of c.sections) assert.ok(sectionKeys.has(k), `${c.id}: unknown section ${k}`);
    assert.ok(editorFields.has(c.fixField), `${c.id}: Fix this field ${c.fixField} is not in the editor`);
    if (c.campusSetting) assert.ok(c.campusSetting in p.campus, `${c.id}: campus setting ${c.campusSetting} is not defined`);
    // A check compares either required phrases or approved wording, whose {placeholders} are campus settings.
    assert.ok(Array.isArray(c.requirements) !== (typeof c.approvedText === 'string'), `${c.id} needs requirements or approvedText, not both`);
    for (const m of (c.approvedText || '').matchAll(/\{(\w+)\}/g)) assert.ok(m[1] in p.campus, `${c.id}: placeholder {${m[1]}} is not a campus setting`);
    for (const r of [...(c.requirements || []), ...(c.onlyWhen ? [c.onlyWhen] : [])]) {
      assert.ok(r.label && r.patterns.length, `${c.id}: each requirement needs a label and patterns`);
      for (const pattern of r.patterns) assert.doesNotThrow(() => new RegExp(pattern, 'i'), `${c.id}: bad pattern ${pattern}`);
    }
  }
  // The seven checks the 2026-09-28 policy requires (roadmap v2.3 item 2).
  if (p.updated === '2026-09-28') assert.deepEqual([...ids].sort(), ['accessibility', 'coursePolicies', 'engagement', 'hardware', 'library', 'programAssessment']);
});
