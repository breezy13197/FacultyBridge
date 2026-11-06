import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const manifest = JSON.parse(fs.readFileSync(path.join(root, 'suite.json'), 'utf8'));
const output = path.join(root, 'dist');
const site = path.join(output, 'site');
const standalone = path.join(output, 'standalone');
const read = file => fs.readFileSync(file, 'utf8');
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
// Raw blocks are consumed as a unit, so markup in report templates is never rewritten.
export const blocks = /<(?<tag>style|script)\b(?<attrs>[^>]*)>(?<data>[\s\S]*?)<\/\k<tag>>|<link\b[^>]*>/gi;
function safeScript(js) { return js.replace(/<\/script/gi, '<\\/script'); }
function target(source) {
  const rel = path.relative(root, source).replaceAll(path.sep, '/');
  if (rel.startsWith('packages/ui/')) return path.join(site, 'assets/ui', rel.slice('packages/ui/'.length));
  if (rel.startsWith('vendor/')) return path.join(site, rel);
  const [_, id, ...rest] = rel.split('/');
  const tool = manifest.tools.find(t => t.id === id);
  if (!tool) throw new Error(`Unmapped local asset: ${rel}`);
  return path.join(site, tool.route, ...rest);
}
function renderSource(source, destination) {
  return read(source).replace(blocks, (block, ...args) => {
    const groups = args.at(-1);
    const attr = groups.tag === 'script' ? 'src' : (block.startsWith('<link') ? 'href' : null);
    if (!attr) return block;
    const match = block.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i'));
    if (!match) return block;
    if (/^(https?:|\/\/)/.test(match[1])) throw new Error(`Remote dependency in ${source}: ${match[1]}`);
    const resolved = path.resolve(path.dirname(source), match[1]);
    if (!resolved.startsWith(root + path.sep)) throw new Error(`Asset escapes repository: ${match[1]}`);
    const asset = target(resolved);
    write(asset, read(resolved));
    const url = path.relative(path.dirname(destination), asset).replaceAll(path.sep, '/');
    return block.replace(match[1], url);
  });
}
function inline(html, base) {
  return html.replace(blocks, (block, ...args) => {
    const groups = args.at(-1);
    if (groups.tag === 'script') {
      const ref = groups.attrs.match(/\bsrc=["']([^"']+)["']/);
      return ref ? `<script>${safeScript(read(path.resolve(base, ref[1])))}</script>` : block;
    }
    if (block.startsWith('<link') && /\brel=["']stylesheet["']/.test(block)) {
      const ref = block.match(/\bhref=["']([^"']+)["']/);
      return `<style>\n${read(path.resolve(base, ref[1]))}\n</style>`;
    }
    return block;
  });
}
fs.rmSync(output, { recursive: true, force: true });
for (const tool of manifest.tools) {
  const destination = path.join(site, tool.route, 'index.html');
  let html = renderSource(path.join(root, 'apps', tool.id, 'index.html'), destination);
  const info = { suiteVersion: manifest.suiteVersion, uiVersion: manifest.uiVersion, support: manifest.support, tools: manifest.tools, toolId: tool.id, output: 'site' };
  const metadataPath = path.join(site, tool.route, 'build-info.js');
  write(metadataPath, `window.FacultyBridgeBuild = ${JSON.stringify(info)};\n`);
  html = html.replace('<script', '<script src="build-info.js"></script>\n<script');
  write(destination, html);
  let single = inline(html, path.dirname(destination)).replace(`"output":"site"`, '"output":"standalone"');
  if (tool.id === 'facultybridge') {
    // Offline landing links resolve to sibling downloads built from the same manifest.
    const files = Object.fromEntries(manifest.tools.filter(t => t.route).map(t => [t.id, filename(t)]));
    single = single.replace('const ICONS =', `for (const tool of FB_TOOLS) { const files = ${JSON.stringify(files)}; if (files[tool.id]) tool.url = files[tool.id]; }\nconst ICONS =`);
  }
  write(path.join(standalone, filename(tool)), single);
}
function filename(tool) { return `${tool.name}-v${tool.version}-build${manifest.suiteVersion}.html`; }
// Include the shared component gallery in the website build.
const gallerySource = path.join(root, 'packages/ui/examples/component-gallery.html');
const galleryDestination = path.join(site, 'assets/ui/examples/component-gallery.html');
write(galleryDestination, renderSource(gallerySource, galleryDestination));
write(path.join(site, 'suite.json'), JSON.stringify(manifest, null, 2) + '\n');
write(path.join(site, 'vendor/README.md'), read(path.join(root, 'vendor/README.md')));
const files = [];
function collect(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) collect(file);
    else files.push({ path: path.relative(output, file).replaceAll(path.sep, '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  }
}
collect(output);
write(path.join(output, 'build-manifest.json'), JSON.stringify({ suiteVersion: manifest.suiteVersion, uiVersion: manifest.uiVersion, files }, null, 2) + '\n');
console.log(`Built ${manifest.tools.length} site pages and ${manifest.tools.length} standalone files (suite ${manifest.suiteVersion}).`);
