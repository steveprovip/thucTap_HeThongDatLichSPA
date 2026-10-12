#!/usr/bin/env node
// Bộ chấm điểm Trợ lý tư vấn khách theo kiểu τ-bench (Sierra) / Fin simulations (Intercom):
//  - mỗi kịch bản là MỘT cuộc hội thoại nhiều lượt, gửi kèm lịch sử + trạng thái hội thoại (state) y như widget;
//  - chấm theo KẾT QUẢ (ý định, ngày tra giờ, dịch vụ, giá đúng danh mục) chứ không so từng chữ của câu văn;
//  - chạy mỗi kịch bản k lần → pass^k = tỉ lệ kịch bản đạt cả k lần (đo độ ỔN ĐỊNH, không chỉ "đôi khi đúng").
// Dùng trước khi cập nhật / đổi model AI: điểm tụt dưới ngưỡng thì không triển khai (cổng hồi quy).
//
//  - --perturb: kiểm thử BẤT BIẾN kiểu CheckList (Ribeiro và cộng sự, ACL 2020): mỗi kịch bản chạy thêm bản câu khách gõ
//    KHÔNG DẤU và bản VIẾT TẮT kiểu nhắn tin ("không" → "k", "bao nhiêu" → "bn"…) — kết quả phải y như câu gốc.
//
//   node scripts/ai/eval-assistant.mjs [--k 3] [--perturb] [--base http://127.0.0.1:3000/api] [--min 1] [--out logs/ai-eval.md]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const BASE = arg('base', process.env.EVAL_BASE ?? 'http://127.0.0.1:3000/api');
const K = Math.max(1, Number(arg('k', 3)));
const MIN = Number(arg('min', 1)); // ngưỡng pass^k tối thiểu (0..1)
const OUT = arg('out', `logs/ai-eval-${new Date().toISOString().slice(0, 10)}.md`);
const PERTURB = process.argv.includes('--perturb');

/** Biến đổi giữ nguyên ý (CheckList INV): bỏ dấu; viết tắt kiểu nhắn tin. Câu có tên dịch vụ trong ngoặc kép giữ nguyên. */
const unaccent = (q) => q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const texting = (q) => q.replace(/\bkhông\b/gi, 'k').replace(/\bđược\b/gi, 'đc').replace(/\bbao nhiêu\b/gi, 'bn').replace(/\bgì\b/gi, 'j')
  .replace(/\s*\?$/, ' ạ?');
const PERTURBATIONS = [['không dấu', unaccent], ['nhắn tin', texting]];

// Ngày theo giờ Việt Nam (máy chủ tra giờ theo Asia/Ho_Chi_Minh)
const vnDate = (plus = 0) => new Date(Date.now() + 7 * 3600_000 + plus * 86_400_000).toISOString().slice(0, 10);
const TOMORROW = vnDate(1);

/**
 * Mỗi lượt: [câu khách, kỳ vọng]. Kỳ vọng: intent (chuỗi hoặc mảng), bookDate, card (tên dịch vụ trong thẻ chứa chuỗi),
 * has / hasNot (câu trả lời chứa / không chứa), price (tên dịch vụ → câu trả lời phải có đúng giá trong danh mục).
 */
const SCENARIOS = [
  ['Log 12/10 tối: hỏi giờ trống rồi trả lời cụt', [
    ['alo', { intent: 'greeting' }],
    ['bây giờ còn mở cửa không ?', { intent: 'open_now', hasNot: ['Chủ nhật'] }],
    ['sáng mai có giờ nào trống ?', { intent: 'availability' }],
    ['cắt tóc nữ ?', { intent: 'availability', bookDate: TOMORROW, card: 'Cắt tóc nữ' }],
    ['thế giờ trống là ?', { intent: 'availability', bookDate: TOMORROW }],
  ]],
  ['Đổi buổi giữ ngày + dịch vụ', [
    ['chiều mai còn giờ gội đầu dưỡng sinh không', { intent: 'availability', bookDate: TOMORROW, card: 'Gội đầu dưỡng sinh' }],
    ['thế sáng thì sao', { intent: 'availability', bookDate: TOMORROW, card: 'Gội đầu dưỡng sinh' }],
  ]],
  ['Đổi chủ đề giữa lúc tra giờ', [
    ['sáng mai có giờ trống không', { intent: 'availability' }],
    ['cắt tóc nam giá bao nhiêu', { intent: 'service_price', price: 'Cắt tóc nam' }],
    ['làm mất bao lâu', { intent: 'service_duration', has: ['Cắt tóc nam'] }],
  ]],
  ['Giá đúng danh mục (chống bịa số)', [
    ['giá cắt tóc nữ', { intent: 'service_price', price: 'Cắt tóc nữ' }],
    ['gia cat toc nu', { intent: 'service_price', price: 'Cắt tóc nữ' }],
    ['how much for a haircut', { intent: 'service_price' }],
  ]],
  ['Cô dâu', [
    ['tháng sau mình cưới, có gói cô dâu không', { intent: 'need', card: 'Cô dâu' }],
    ['trọn gói gồm những gì', { intent: 'service_detail', has: ['Cô dâu'] }],
  ]],
  ['Dịch vụ tiệm không làm', [
    ['có nối tóc không', { intent: 'not_offered' }],
    ['có xăm chân mày không', { intent: 'not_offered' }],
  ]],
  ['Ngân sách / thợ / đi nhóm', [
    ['có gì dưới 200k không', { intent: 'budget' }],
    ['có thợ nữ không', { intent: 'stylists' }],
    ['2 người đi cùng có đặt chung được không', { intent: 'group_booking' }],
  ]],
  ['Đổi buổi bằng câu cụt', [
    ['mai 3h chiều cắt tóc nam được không', { intent: 'availability', bookDate: TOMORROW, card: 'Cắt tóc nam' }],
    ['vậy tối được không', { intent: 'availability', bookDate: TOMORROW, card: 'Cắt tóc nam' }],
  ]],
  ['Chính sách: cọc / huỷ / thanh toán / khuyến mãi', [
    ['có cần đặt cọc không', { intent: 'deposit' }],
    ['huỷ lịch thì sao', { intent: 'cancel_policy' }],
    ['thanh toán bằng gì được', { intent: 'payment' }],
    ['có khuyến mãi gì không', { intent: 'promotion' }],
  ]],
  ['Giờ giấc / địa chỉ', [
    ['tiệm ở đâu vậy', { intent: 'contact' }],
    ['mấy giờ đóng cửa', { intent: ['hours', 'open_now'], hasNot: ['Chủ nhật:'] }],
  ]],
  ['Hỏi giá rồi hỏi giờ theo ngữ cảnh', [
    ['massage cổ vai gáy giá bao nhiêu', { intent: 'service_price' }],
    // ngữ cảnh có 2 dịch vụ → hỏi lại, không tự chọn bừa; khách chọn rồi mới tra
    ['mai còn giờ không', { intent: 'availability', has: ['cho dịch vụ nào'] }],
    ['massage bấm huyệt cổ vai gáy', { intent: 'availability', bookDate: TOMORROW, card: 'Massage bấm huyệt cổ vai gáy' }],
  ]],
  ['Log 12/10 lần 4 (đúng nguyên văn)', [
    ['alo', { intent: 'greeting' }],
    ['ngày kia có dịch vụ mát xoa nào trống lịch không ?', { intent: 'availability', bookDate: vnDate(2), has: ['nhóm massage'] }],
    ['những dịch vụ nổi bật nhất là ?', { intent: 'hot' }],
    ['"Gội đầu dưỡng sinh thảo dược" mai có lịch trống không ?', { intent: 'availability', bookDate: TOMORROW }],
    ['có những thợ gì có thể làm ?', { intent: 'stylists', has: ['thợ làm được Gội đầu dưỡng sinh thảo dược'] }],
    ['không nêu tên thợ à ?', { intent: 'stylists', has: ['thợ làm được', 'như mình vừa nêu'] }],
    ['dạo gần đây có sự kiện cho mã giảm giá gì không ?', { intent: 'promotion', hasNot: ['hỏi nhanh qua'] }],
  ]],
  ['Tiếng lóng / viết tắt', [
    ['bn tiền gội đầu z', { intent: 'service_price', card: 'Gội đầu' }],
    ['sdt tiệm là gì', { intent: 'contact' }],
    ['tiem lam toi may h vay ban', { intent: 'hours', hasNot: ['Chủ nhật:'] }],
  ]],
  ['Nhầm nhóm dịch vụ', [
    ['e muốn làm đẹp da mặt thì sao ạ', { intent: 'need', hasNot: ['Cạo mặt'] }],
    ['tóc mình xơ quá muốn mềm mượt lại thì làm j', { intent: 'need', hasNot: ['Cắt tóc'] }],
  ]],
  ['Giới tính + ngữ cảnh', [
    ['có làm tóc cho nam k', { intent: 'need', card: 'Cắt tóc nam' }],
    ['giá sao', { intent: 'service_price', price: 'Cắt tóc nam' }],
  ]],
  ['Hỏi giờ trống bằng câu nhắn tin', [
    ['chị ơi mai chiều 3h có ai rảnh làm nail k', { intent: 'availability', bookDate: TOMORROW, has: ['nhóm móng'] }],
  ]],
  ['Va chạm khi bỏ dấu (mún ≠ mụn, thứ năm ≠ tóc nam)', [
    ['tui mún đi spa thư dãn sau giờ làm', { intent: 'need', card: 'Massage', hasNot: ['mụn'] }],
    ['lịch trống thứ năm cho uốn tóc hàn', { intent: 'availability', card: 'Uốn sóng lơi Hàn Quốc' }],
    ['dịch dụ tẩy da chết bao nhiu', { intent: 'service_price' }],
    ['toc toi dai muon tia lai chut thoi', { intent: 'need', card: 'Cắt tóc', hasNot: ['trẻ em', 'râu'] }],
  ]],
  ['Không hiểu 2 lần → chuyển người thật', [
    ['xyz qwe', { intent: 'unknown' }],
    ['abc def ghi', { intent: 'handoff' }],
  ]],
];

let ipSeq = 1;
async function post(path, body) {
  const ip = `10.88.${Math.floor(ipSeq / 250) % 250}.${ipSeq++ % 250}`; // mỗi lượt một IP giả để không chạm giới hạn 429
  const t = performance.now();
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, 'X-Assistant-Eval': '1' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data ?? {}, ms: Math.round(performance.now() - t) };
}

const catalog = (await (await fetch(`${BASE}/public/catalog`)).json()).data.flatMap((g) => g.services);
const priceOf = (part) => catalog.find((s) => s.name.includes(part))?.price;
const vnd = (n) => n.toLocaleString('vi-VN');

function check(exp, r) {
  const fails = [];
  const d = r.data;
  if (r.status !== 200) return [`HTTP ${r.status}`];
  if (!d.answer?.trim()) fails.push('câu trả lời rỗng');
  if (/\*\*|\[Đặt lịch\]/.test(d.answer ?? '')) fails.push('lộ markdown / nút giả');
  const intents = [exp.intent].flat().filter(Boolean);
  if (intents.length && !intents.includes(d.intent)) fails.push(`ý định ${d.intent} ≠ ${intents.join('|')}`);
  if (exp.bookDate && d.bookDate !== exp.bookDate) fails.push(`ngày tra ${d.bookDate ?? '(không)'} ≠ ${exp.bookDate}`);
  if (exp.card && !(d.suggestions ?? []).some((s) => s.name.includes(exp.card))) fails.push(`thẻ thiếu "${exp.card}"`);
  for (const h of exp.has ?? []) if (!d.answer?.includes(h)) fails.push(`thiếu "${h}"`);
  for (const h of exp.hasNot ?? []) if (d.answer?.includes(h)) fails.push(`không được có "${h}"`);
  if (exp.price) {
    const p = priceOf(exp.price);
    if (p == null) fails.push(`danh mục không có "${exp.price}"`);
    else if (!d.answer?.includes(vnd(p))) fails.push(`giá sai (phải có ${vnd(p)})`);
  }
  return fails;
}

async function runScenario(turns) {
  const history = [];
  let state;
  const log = [];
  for (const [message, exp] of turns) {
    const r = await post('/public/assistant/chat', { message, history: history.slice(-6), ...(state ? { state } : {}) });
    const fails = check(exp, r);
    log.push({ message, r, fails });
    history.push({ role: 'user', content: message }, { role: 'assistant', content: r.data.answer ?? '' });
    state = r.data.state;
  }
  return { ok: log.every((x) => !x.fails.length), log };
}

const rows = [];
let md = `# Chấm điểm Trợ lý tư vấn — ${new Date().toISOString()}\n\nMáy chủ: \`${BASE}\` · k = ${K} lần / kịch bản · ngày mai = ${TOMORROW}\n`;
const latencies = [];
const models = new Set();
const suites = PERTURB
  ? SCENARIOS.flatMap(([name, turns]) => [[name, turns], ...PERTURBATIONS
    .map(([label, f]) => [`${name} [${label}]`, turns.map(([q, exp]) => [q.startsWith('"') ? q : f(q), exp])])
    .filter(([, t], i, all) => t.some(([q], j) => q !== turns[j][0]) && all.findIndex(([, u]) => JSON.stringify(u) === JSON.stringify(t)) === i)])
  : SCENARIOS;
for (const [name, turns] of suites) {
  const runs = [];
  for (let i = 0; i < K; i += 1) runs.push(await runScenario(turns));
  runs.forEach((x) => x.log.forEach((l) => { latencies.push(l.r.ms); if (l.r.data.model) models.add(l.r.data.model); }));
  const passes = runs.filter((x) => x.ok).length;
  rows.push({ name, passes, turns: turns.length });
  md += `\n## ${passes === K ? '✅' : '❌'} ${name} — đạt ${passes}/${K}\n`;
  const shown = runs.find((x) => !x.ok) ?? runs[0];
  for (const { message, r, fails } of shown.log) {
    md += `\n- **Khách:** ${message}  \n  _${r.data.intent} · ${r.data.source ?? '?'} · ${r.ms} ms_${fails.length ? ` · ❌ ${fails.join('; ')}` : ''}  \n`
      + `  > ${(r.data.answer ?? '').replace(/\n/g, ' ').slice(0, 300)}\n`;
  }
}
latencies.sort((a, b) => a - b);
const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
const passAll = rows.filter((x) => x.passes === K).length / rows.length;
const pass1 = rows.reduce((s, x) => s + x.passes / K, 0) / rows.length;
const summary = `| Chỉ số | Giá trị |\n|---|---|\n| Kịch bản | ${rows.length} (${rows.reduce((s, x) => s + x.turns, 0)} lượt) |\n`
  + `| pass^1 (trung bình) | ${(pass1 * 100).toFixed(1)}% |\n| pass^${K} (đạt cả ${K} lần) | ${(passAll * 100).toFixed(1)}% |\n`
  + `| Độ trễ p50 / p95 | ${p(0.5)} ms / ${p(0.95)} ms |\n| Model | ${[...models].join(', ') || '(chỉ luật — AI local chưa bật)'} |\n`;
md = md.replace('\n', `\n\n${summary}\n`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md);

console.table(rows.map((x) => ({ 'kịch bản': x.name, đạt: `${x.passes}/${K}` })));
console.log(`pass^1 ${(pass1 * 100).toFixed(1)}% · pass^${K} ${(passAll * 100).toFixed(1)}% · p95 ${p(0.95)} ms · báo cáo: ${OUT}`);
process.exit(passAll >= MIN ? 0 : 1);
