/**
 * Tìm kiếm tức thì cho Command Palette (Ctrl/⌘ + K): so khớp KHÔNG DẤU, mọi từ khoá đều phải khớp (AND), chấm điểm
 * khớp đầu chuỗi > đầu từ > giữa từ; số điện thoại khớp theo dãy số (gõ "0987" hay "987 654" đều ra).
 * Chỉ mục được dựng sẵn một lần (bỏ dấu trước) nên mỗi lần gõ chỉ là vài phép so chuỗi — vài nghìn mục < 15 ms.
 */
export interface SearchDoc<T> { item: T; text: string; digits: string }

export const foldText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function buildIndex<T>(items: readonly T[], fields: (item: T) => (string | null | undefined)[]): SearchDoc<T>[] {
  return items.map((item) => {
    const parts = fields(item).filter((x): x is string => !!x);
    return { item, text: foldText(parts.join(' ')), digits: parts.join(' ').replace(/\D/g, '') };
  });
}

function scoreToken(doc: SearchDoc<unknown>, token: string): number {
  if (/^\d{3,}$/.test(token) && doc.digits.includes(token)) return doc.digits.startsWith(token) ? 6 : 4;
  const at = doc.text.indexOf(token);
  if (at < 0) return -1;
  if (at === 0) return 8;
  return /[^a-z0-9]/.test(doc.text[at - 1]) ? 5 : 2;
}

export function search<T>(index: readonly SearchDoc<T>[], query: string, limit = 8): T[] {
  const tokens = foldText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored: { item: T; score: number }[] = [];
  for (const doc of index) {
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = scoreToken(doc, t);
      if (s < 0) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push({ item: doc.item, score: total - doc.text.length / 1000 }); // hoà điểm: chuỗi ngắn (khớp sát) trước
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.item);
}
