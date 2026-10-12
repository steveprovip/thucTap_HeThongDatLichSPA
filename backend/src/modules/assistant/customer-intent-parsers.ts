/**
 * QA nhập vai khách 12/10 — đọc NGÀY / BUỔI / GIỜ và NGÂN SÁCH trong câu khách hỏi (tiếng Việt có hoặc không dấu). Hàm thuần,
 * nhận chuỗi đã gập dấu (`fold`) và ngày hôm nay theo giờ tiệm, để kiểm thử độc lập và để trợ lý tra GIỜ TRỐNG THẬT:
 *   "chiều nay còn giờ trống không", "mai 9h sáng còn chỗ không", "thứ 7 này buổi sáng", "15/10 lúc 3 giờ chiều"…
 *   "có gì dưới 200k không", "tầm 300 nghìn thì làm được gì", "trên 1tr5"…
 */

export type DayPart = 'sang' | 'trua' | 'chieu' | 'toi';

export interface WhenQuery {
  /** yyyy-MM-dd theo giờ tiệm. */
  date: string;
  /** Khách có nói rõ ngày không (false = mặc định hôm nay). */
  explicitDate: boolean;
  part: DayPart | null;
  /** "HH:mm" khi khách hỏi một giờ cụ thể. */
  time: string | null;
}

const WEEKDAY: Record<string, number> = {
  'chu nhat': 0, cn: 0, 'thu hai': 1, 'thu 2': 1, 't2': 1, 'thu ba': 2, 'thu 3': 2, 't3': 2, 'thu tu': 3, 'thu 4': 3, 't4': 3,
  'thu nam': 4, 'thu 5': 4, 't5': 4, 'thu sau': 5, 'thu 6': 5, 't6': 5, 'thu bay': 6, 'thu 7': 6, 't7': 6,
};

const pad = (n: number): string => String(n).padStart(2, '0');
/** Cộng ngày trên chuỗi yyyy-MM-dd (tính bằng UTC để không lệch múi giờ). */
export const plusDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dowOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Câu có hỏi về khung giờ còn trống / còn nhận khách không. */
export const AVAILABILITY_RE = new RegExp([
  'con (gio|cho|slot|trong|lich|nhan|dat duoc|kip)', '(gio|khung gio|lich|cho) (nao )?(con )?trong', 'gio nao', 'khung gio',
  'dat duoc (nua|khong|ko|k)', 'con dat duoc', 'nhan khach', 'het cho', 'kin lich', 'co cho', 'ranh (khong|ko|k)', 'luc may gio',
  'may gio (con|thi|duoc|ranh|trong)', 'dat (luc|vao luc|vao)', 'xep (cho|duoc)',
].map((p) => `\\b${p}\\b`).join('|'));

/** Đọc ngày / buổi / giờ trong câu (đã gập dấu). `today` = yyyy-MM-dd theo giờ tiệm. */
export function parseWhen(m: string, today: string): WhenQuery {
  let date = today;
  let explicitDate = false;
  const set = (d: string) => { date = d; explicitDate = true; };

  const dm = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(m);
  if (/\b(hom nay|bua nay|toi nay|chieu nay|sang nay|trua nay)\b/.test(m)) set(today);
  else if (/\b(ngay kia|ngay mot|\bmot\b)/.test(m)) set(plusDays(today, 2));
  // "mai" = ngày mai, trừ "tỉa / cắt / để / uốn mái", "mái tóc"
  else if (/\b(ngay mai|sang mai|chieu mai|toi mai|trua mai)\b/.test(m) || /(?<!(tia|cat|de|uon|duoi|toc) )\bmai\b(?! toc)/.test(m)) set(plusDays(today, 1));
  else if (dm) {
    const [, d, mo, y] = dm;
    const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : Number(today.slice(0, 4));
    let cand = `${year}-${pad(Number(mo))}-${pad(Number(d))}`;
    if (!y && cand < today) cand = `${year + 1}-${pad(Number(mo))}-${pad(Number(d))}`;
    if (!Number.isNaN(new Date(`${cand}T00:00:00Z`).getTime())) set(cand);
  } else if (/\bcuoi tuan\b/.test(m)) {
    set(plusDays(today, (6 - dowOf(today) + 7) % 7));
  } else {
    const key = Object.keys(WEEKDAY).sort((a, b) => b.length - a.length).find((k) => new RegExp(`\\b${k}\\b`).test(m));
    if (key) {
      const want = WEEKDAY[key];
      let diff = (want - dowOf(today) + 7) % 7;
      if (/\b(tuan sau|tuan toi)\b/.test(m)) diff += diff === 0 ? 7 : 7;
      set(plusDays(today, diff));
    }
  }

  // Bỏ dấu dễ nhầm: "tôi" = "toi" (tối), "chuyển sang" = "sang" (sáng) → chỉ nhận buổi khi đi kèm ngữ cảnh thời gian
  const H = String.raw`\d{1,2}\s*(?:h|g|gio)(?:\s*\d{2})?`;
  // "thế sáng thì sao", "vậy tối được không": câu đổi buổi khi đang tra giờ
  const at = (w: string) => new RegExp(String.raw`\b(buoi ${w}|${w} (nay|mai|som|thu \w+|chu nhat|ngay)|${H} ${w}|vao ${w}|${w}$|(the|vay) ${w}\b|${w} thi (sao|the nao|duoc|co|con))`).test(m);
  let part: DayPart | null = null;
  if (at('sang')) part = 'sang';
  else if (/\btrua\b/.test(m)) part = 'trua';
  else if (at('chieu') || /\bchieu\b(?! (cao|dai|khach|long|rong))/.test(m)) part = 'chieu';
  else if (at('toi')) part = 'toi';

  let time: string | null = null;
  const tm = /\b(\d{1,2})\s*(?:h|g|gio|:)\s*(\d{2})?(?!\s*(phut|ngay|tuan|thang|tieng|tuoi))\b/.exec(m);
  if (tm) {
    let h = Number(tm[1]);
    const min = tm[2] ? Number(tm[2]) : /\bruoi\b/.test(m) ? 30 : 0;
    if (h < 12 && (part === 'chieu' || part === 'toi')) h += 12;
    if (h >= 0 && h < 24 && min < 60) time = `${pad(h)}:${pad(min)}`;
  }
  return { date, explicitDate, part, time };
}

/** Khung giờ (phút trong ngày) của từng buổi. */
export const PART_RANGE: Record<DayPart, [number, number]> = { sang: [0, 12 * 60], trua: [11 * 60, 14 * 60], chieu: [12 * 60, 18 * 60], toi: [17 * 60, 24 * 60] };
export const PART_LABEL: Record<DayPart, string> = { sang: 'buổi sáng', trua: 'buổi trưa', chieu: 'buổi chiều', toi: 'buổi tối' };

export interface BudgetQuery { min: number | null; max: number | null; label: string }

/** "200k", "200 nghìn", "200.000", "1tr5", "1,5 triệu", "2 trăm" → số đồng. Số trơn nhỏ (< 1000) hiểu là nghìn đồng. */
export function parseMoney(raw: string, unit: string | undefined): number | null {
  const n = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n)) return null;
  const u = (unit ?? '').trim();
  if (/^tram/.test(u)) return Math.round(n * 100_000); // "trăm" kiểm tra TRƯỚC "tr" (triệu)
  if (/^(tr|trieu|cu|m)/.test(u)) {
    const tail = /^(?:tr|trieu|cu|m)\s*(\d)\b/.exec(u); // "1tr5" = 1.500.000
    return Math.round((n + (tail ? Number(tail[1]) / 10 : 0)) * 1_000_000);
  }
  if (/^(k|nghin|ngan|ng)\b/.test(u)) return Math.round(n * 1000);
  if (n >= 1000) return Math.round(n);
  return Math.round(n * 1000);
}

// "trieu" / "tram" đứng TRƯỚC "tr": nhánh đầu khớp được sẽ thắng ("2 tram" không được hiểu là 2 triệu)
const MONEY = String.raw`(\d+(?:[.,]\d+)?)\s*(trieu|tram|tr\s*\d?|cu|k\b|nghin|ngan|ng\b|d\b|dong|vnd)?`;

/** Ngân sách khách nói tới; null nếu câu không có số tiền kèm ý hỏi theo giá. */
export function parseBudget(m: string): BudgetQuery | null {
  const fmt = (v: number) => `${v.toLocaleString('vi-VN')} đ`;
  const under = new RegExp(String.raw`\b(duoi|khong qua|toi da|it hon|re hon|nho hon|max)\s*${MONEY}`).exec(m);
  if (under) {
    const v = parseMoney(under[2], under[3]);
    return v ? { min: null, max: v, label: `dưới ${fmt(v)}` } : null;
  }
  const over = new RegExp(String.raw`\b(tren|hon|tu|it nhat|cao hon)\s*${MONEY}`).exec(m);
  const around = new RegExp(String.raw`\b(tam|khoang|co|chung|trong khoang|budget|ngan sach|co khoang)\s*${MONEY}`).exec(m);
  const plain = new RegExp(String.raw`\b${MONEY}\s*(thi|co the)?\s*(lam|chon|dat)\s*(duoc)?\s*(gi|dich vu gi|nhung gi)`).exec(m);
  if (around || plain) {
    const v = around ? parseMoney(around[2], around[3]) : parseMoney(plain![1], plain![2]);
    if (!v) return null;
    return { min: Math.round(v * 0.75), max: Math.round(v * 1.15), label: `tầm ${fmt(v)}` };
  }
  if (over && /\b(dich vu|lam|goi|combo|co gi|nao)\b/.test(m)) {
    const v = parseMoney(over[2], over[3]);
    return v ? { min: v, max: null, label: `từ ${fmt(v)}` } : null;
  }
  return null;
}
