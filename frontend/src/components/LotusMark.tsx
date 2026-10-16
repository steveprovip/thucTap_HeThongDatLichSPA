/**
 * Dấu hiệu thương hiệu Hương Sen: hoa sen năm cánh nét mảnh trên mặt nước, vẽ bằng SVG (0 request, sắc nét mọi độ phân giải).
 * Màu theo `currentColor` → đặt `text-gold`, `text-teal-700` (ngọc bích) hoặc màu bất kỳ.
 */
export function LotusMark({ className = 'h-6 w-6', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}
         fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round">
      {title && <title>{title}</title>}
      <path d="M16 5.5c3.2 4.1 3.6 9.3 0 14.4-3.6-5.1-3.2-10.3 0-14.4Z" fill="currentColor" fillOpacity="0.16" />
      <path d="M16 19.9c-5-1-8.6-4.6-9.1-9 4.1.5 7.2 3.6 9.1 9Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M16 19.9c5-1 8.6-4.6 9.1-9-4.1.5-7.2 3.6-9.1 9Z" fill="currentColor" fillOpacity="0.1" />
      <path d="M16 21c-5.6 1.1-10.5-.9-12.6-4.5 4.6-1 9.1 1 12.6 4.5Z" />
      <path d="M16 21c5.6 1.1 10.5-.9 12.6-4.5-4.6-1-9.1 1-12.6 4.5Z" />
      <path d="M8 24.6h16M11.5 27h9" strokeOpacity="0.6" />
    </svg>
  );
}
