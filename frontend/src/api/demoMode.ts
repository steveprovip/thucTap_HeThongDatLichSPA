/**
 * Cờ chế độ demo TÁCH RIÊNG khỏi mockBackend.ts: chỉ đọc cờ không còn kéo cả CSDL giả (≈ 100 KB mã, chạy seed() ngay khi nạp)
 * vào gói JS chính của bản production. mockBackend chỉ được nạp động khi VITE_DEMO_MODE=true (npm run dev:demo).
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
