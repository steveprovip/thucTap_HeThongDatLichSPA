/**
 * Bỏ dấu tiếng Việt để tìm kiếm "gõ không dấu vẫn ra kết quả có dấu" (S2-03).
 */
export const removeTones = (input: string): string =>
  (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

export const normalizeSearch = (input: string): string => removeTones(input).toLowerCase().trim();

/** So khớp không dấu, không phân biệt hoa thường. */
export const matchesSearch = (haystack: string, needle: string): boolean =>
  normalizeSearch(haystack).includes(normalizeSearch(needle));
