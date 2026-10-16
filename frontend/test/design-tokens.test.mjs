import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');
const config = (await import(pathToFileURL(resolve(root, 'tailwind.config.js')).href)).default;

/** Thân của khối CSS bắt đầu tại `selector {` (đếm ngoặc). */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `thiếu khối ${selector}`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i);
  }
  throw new Error('khối không đóng');
}
const varsIn = (body) => new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const light = varsIn(block(':root'));
const noir = varsIn(block(":root[data-theme='noir']"));

/** Mọi biến `--x` mà một màu trong tailwind.config.js tham chiếu qua rgb(var(--x) / <alpha-value>). */
function referenced(colors, out = new Set()) {
  for (const v of Object.values(colors)) {
    if (typeof v === 'string') for (const m of v.matchAll(/var\(--([a-z0-9-]+)\)/g)) out.add(m[1]);
    else if (v && typeof v === 'object') referenced(v, out);
  }
  return out;
}
const used = referenced(config.theme.extend.colors);

test('Token: mọi biến màu Tailwind dùng đều có giá trị ở giao diện sáng', () => {
  const missing = [...used].filter((v) => !light.has(v));
  assert.deepEqual(missing, []);
});

test('Token: mọi biến màu đều được định nghĩa lại cho Lotus Noir (không sót màu sáng trên nền tối)', () => {
  // canvas/surface… là màu ngữ nghĩa nên phải có ở cả hai; riêng màu giữ nguyên (bloom, lotus) được phép dùng chung
  const shared = new Set(['bloom', 'lotus']);
  const missing = [...used].filter((v) => !noir.has(v) && !shared.has(v));
  assert.deepEqual(missing, []);
});

test('Token: Noir chỉ áp dụng trên màn hình (bản in luôn nền trắng)', () => {
  const at = css.indexOf(":root[data-theme='noir'] {");
  const screen = css.lastIndexOf('@media screen', at);
  assert.ok(screen >= 0 && css.slice(screen, at).split('{').length - css.slice(screen, at).split('}').length === 1);
});
