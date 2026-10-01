import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('node:module');
const sharp = require('sharp');
const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '../..');
if (!Module._extensions['.ts']?.gymflowInventoryLoader) {
  const loader = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, filename);
  loader.gymflowInventoryLoader = true;
  Module._extensions['.ts'] = loader;
}
const { RUNTIME_CATALOG } = require(path.join(root, 'src/mock/exercises.ts'));
const columns = 4, cellWidth = 480, cellHeight = 225, imageWidth = 230, imageHeight = 153;

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function text(value, x, y, size, color, weight = 400) {
  return '<text x="' + x + '" y="' + y + '" font-family="Arial,sans-serif" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '">' + esc(value) + '</text>';
}
async function picture(file) {
  if (!fs.existsSync(file)) {
    const svg = '<svg width="' + imageWidth + '" height="' + imageHeight + '" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#e5e7eb"/>' + text('SEM ARQUIVO LOCAL', 16, 80, 17, '#374151', 700) + '</svg>';
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  return sharp(file).rotate().resize(imageWidth, imageHeight, { fit: 'contain', background: '#fff' }).png().toBuffer();
}
async function card(exercise) {
  const dir = path.join(root, 'public/assets/exercises', exercise.id);
  const first = await picture(path.join(dir, '0.jpg')), second = await picture(path.join(dir, '1.jpg'));
  const labels = '<svg width="' + cellWidth + '" height="' + cellHeight + '" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="100%" height="100%" fill="#fff"/><rect x="0.5" y="0.5" width="479" height="224" fill="none" stroke="#cbd5e1"/>' +
    text(exercise.id, 10, 20, 14, '#111827', 700) + text(exercise.name, 10, 40, 13, '#334155', 500) +
    text('0.jpg', 10, 216, 12, '#64748b') + text('1.jpg', 250, 216, 12, '#64748b') +
    text(exercise.equipment, 326, 216, 11, '#475569') + '</svg>';
  return sharp(Buffer.from(labels)).composite([{ input: first, left: 8, top: 52 }, { input: second, left: 242, top: 52 }]).png().toBuffer();
}
export async function generateContactSheets() {
  const out = path.join(root, 'docs/media/contact-sheets');
  fs.mkdirSync(out, { recursive: true });
  const groups = [...new Set(RUNTIME_CATALOG.map(x => x.muscleGroup))].sort(), results = [];
  for (const group of groups) {
    const exercises = RUNTIME_CATALOG.filter(x => x.muscleGroup === group).sort((a,b) => a.id.localeCompare(b.id));
    const cards = await Promise.all(exercises.map(card));
    const layers = cards.map((input,i) => ({ input, left: (i % columns) * cellWidth, top: Math.floor(i / columns) * cellHeight }));
    const output = path.join(out, group + '.jpg');
    await sharp({ create: { width: columns * cellWidth, height: Math.ceil(cards.length / columns) * cellHeight, channels: 3, background: '#f8fafc' } })
      .composite(layers).jpeg({ quality: 86, mozjpeg: true }).toFile(output);
    results.push({ group, exerciseCount: exercises.length, path: output });
  }
  return results;
}
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  generateContactSheets().then(rows => rows.forEach(x => console.log(x.group + ': ' + x.exerciseCount + ' -> ' + x.path)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
