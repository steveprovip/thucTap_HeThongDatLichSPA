/** Dấu BOM để Excel trên Windows mở đúng tiếng Việt UTF-8 (S4-07). */
export const UTF8_BOM = '\uFEFF';

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Chống CSV/Formula injection: tên khách do người ngoài nhập (vd. =HYPERLINK(...)) sẽ bị Excel
  // thực thi như công thức khi chủ tiệm mở file xuất. Chỉ áp dụng cho chuỗi, số âm giữ nguyên.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Sinh nội dung CSV UTF-8 có BOM.
 * @param headers nhãn cột hiển thị (tiếng Việt)
 * @param rows    mảng mảng giá trị, cùng thứ tự với headers
 */
export const buildCsv = (headers: string[], rows: unknown[][]): string => {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
};
