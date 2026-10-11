/**
 * TASK v4 · NV4 — mỗi chuyên viên một màu riêng (kiểu Fresha), dùng chung cho Lịch ngày và Bảng ca để nhìn là nhận ra thợ.
 * Chuỗi lớp Tailwind viết đầy đủ ở đây để trình biên dịch Tailwind sinh đủ lớp (không ghép chuỗi động).
 */
export interface StylistColor {
  /** Viền trên của tiêu đề cột. */
  bar: string;
  /** Nền nhạt của khối lịch / viên ca. */
  soft: string;
  /** Viền trái đậm của khối lịch. */
  edge: string;
  text: string;
  dot: string;
}

export const STYLIST_PALETTE: StylistColor[] = [
  { bar: 'border-t-teal-500', soft: 'bg-teal-50', edge: 'border-l-teal-500', text: 'text-teal-900', dot: 'bg-teal-500' },
  { bar: 'border-t-violet-500', soft: 'bg-violet-50', edge: 'border-l-violet-500', text: 'text-violet-900', dot: 'bg-violet-500' },
  { bar: 'border-t-sky-500', soft: 'bg-sky-50', edge: 'border-l-sky-500', text: 'text-sky-900', dot: 'bg-sky-500' },
  { bar: 'border-t-rose-500', soft: 'bg-rose-50', edge: 'border-l-rose-500', text: 'text-rose-900', dot: 'bg-rose-500' },
  { bar: 'border-t-amber-500', soft: 'bg-amber-50', edge: 'border-l-amber-500', text: 'text-amber-900', dot: 'bg-amber-500' },
  { bar: 'border-t-emerald-500', soft: 'bg-emerald-50', edge: 'border-l-emerald-500', text: 'text-emerald-900', dot: 'bg-emerald-500' },
  { bar: 'border-t-indigo-500', soft: 'bg-indigo-50', edge: 'border-l-indigo-500', text: 'text-indigo-900', dot: 'bg-indigo-500' },
  { bar: 'border-t-fuchsia-500', soft: 'bg-fuchsia-50', edge: 'border-l-fuchsia-500', text: 'text-fuchsia-900', dot: 'bg-fuchsia-500' },
  { bar: 'border-t-cyan-500', soft: 'bg-cyan-50', edge: 'border-l-cyan-500', text: 'text-cyan-900', dot: 'bg-cyan-500' },
  { bar: 'border-t-orange-500', soft: 'bg-orange-50', edge: 'border-l-orange-500', text: 'text-orange-900', dot: 'bg-orange-500' },
  { bar: 'border-t-lime-600', soft: 'bg-lime-50', edge: 'border-l-lime-600', text: 'text-lime-900', dot: 'bg-lime-600' },
  { bar: 'border-t-pink-500', soft: 'bg-pink-50', edge: 'border-l-pink-500', text: 'text-pink-900', dot: 'bg-pink-500' },
  { bar: 'border-t-blue-500', soft: 'bg-blue-50', edge: 'border-l-blue-500', text: 'text-blue-900', dot: 'bg-blue-500' },
  { bar: 'border-t-purple-500', soft: 'bg-purple-50', edge: 'border-l-purple-500', text: 'text-purple-900', dot: 'bg-purple-500' },
];

/** Gán màu theo thứ tự mã thợ: ≤ 14 thợ thì không trùng màu, và cùng một thợ giữ nguyên màu khi đổi ngày / đổi màn hình. */
export function stylistColorMap(ids: readonly string[]): Map<string, StylistColor> {
  const sorted = Array.from(new Set(ids)).sort();
  return new Map(sorted.map((id, i) => [id, STYLIST_PALETTE[i % STYLIST_PALETTE.length]]));
}
