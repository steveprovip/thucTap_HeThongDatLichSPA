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
const ivory = varsIn(block(":root[data-theme='ivory']"));

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

for (const theme of ['noir', 'ivory']) {
  test(`Token: ${theme} chỉ áp dụng trên màn hình (bản in luôn nền trắng)`, () => {
    const at = css.indexOf(`:root[data-theme='${theme}'] {`);
    const screen = css.lastIndexOf('@media screen', at);
    assert.ok(screen >= 0 && css.slice(screen, at).split('{').length - css.slice(screen, at).split('}').length === 1);
  });
}

test('Token: Lotus Ivory chỉ ghi đè biến đã có (không gõ nhầm tên → màu lặng lẽ rơi về giao diện sáng)', () => {
  assert.deepEqual([...ivory].filter((v) => !light.has(v)), []);
  // Màu hành động, nền, chữ và vàng trang trí phải được định nghĩa riêng cho trang khách
  for (const v of ['canvas', 'fg', 'gold', 'champagne', 'jade', 'slate-900', 'shadow-card']) assert.ok(ivory.has(v), v);
});

test('Token: Lotus Ivory đạt tương phản WCAG AA cho chữ (tiêu đề / nội dung / chữ phụ / chữ vàng / nút ngọc bích)', () => {
  const body = block(":root[data-theme='ivory']") + block(':root');
  const rgb = (name) => body.match(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`)).slice(1).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((c) => { const u = c / 255; return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const canvas = rgb('canvas');
  const white = [255, 255, 255];
  assert.ok(ratio(rgb('slate-900'), canvas) >= 7, 'tiêu đề');
  assert.ok(ratio(rgb('slate-600'), canvas) >= 7, 'nội dung');
  assert.ok(ratio(rgb('slate-500'), canvas) >= 4.5, 'chữ phụ');
  assert.ok(ratio(rgb('gold'), canvas) >= 4.5 && ratio(rgb('gold'), white) >= 4.5, 'chữ vàng');
  assert.ok(ratio(white, rgb('teal-600')) >= 7 && ratio(white, rgb('teal-700')) >= 7, 'chữ trắng trên nút');
});
