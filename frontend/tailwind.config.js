/** @type {import('tailwindcss').Config} */

/**
 * Design tokens. Mọi màu là biến CSS dạng "R G B" (src/index.css) để Tailwind ghép được độ trong suốt
 * (`bg-teal-800/[0.06]`). :root = màu Tailwind mặc định (khu nhân viên, giao diện sáng);
 * `html[data-theme='ivory']` (Lotus Ivory, trang khách): thang slate ấm, "teal" (màu hành động) → ngọc bích Sen;
 * `html[data-theme='noir']` (Lotus Noir, trực đêm) đảo thang màu theo vai trò kiểu Radix: 50–100 nền nổi, 200–300 viền,
 * 400–600 chữ phụ, 700–900 chữ chính / nền nút đặc; "teal" trở thành Champagne Gold.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name) => Object.fromEntries(STEPS.map((s) => [s, v(`${name}-${s}`)]));
const THEMED = ['slate', 'gray', 'teal', 'amber', 'red', 'emerald', 'violet', 'rose', 'sky', 'pink', 'orange', 'blue', 'indigo', 'green', 'fuchsia', 'cyan', 'purple', 'lime', 'yellow'];

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Cảm ứng: tắt hover:* để phần tử không bị "kẹt" trạng thái hover/translate sau khi chạm
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        white: v('white'),
        ...Object.fromEntries(THEMED.map((name) => [name, scale(name)])),
        // Fresha-style light luxury: airy slate surfaces, teal spa accent (Noir: champagne gold).
        brand: {
          DEFAULT: v('teal-600'), primary: v('teal-600'), light: v('teal-50'),
          50: v('teal-50'), 100: v('teal-100'), 200: v('teal-200'), 300: v('teal-300'), 400: v('teal-400'),
          500: v('teal-500'), 600: v('teal-600'), 700: v('teal-700'), 800: v('teal-800'), 900: v('teal-900'),
        },
        accent: { gold: '#D97706', bright: '#F59E0B', glow: '#FEF3C7' },
        ink: { DEFAULT: v('slate-900'), soft: v('slate-600'), muted: v('slate-500') },
        surface: { DEFAULT: v('white'), card: v('white'), alt: v('slate-50'), page: v('canvas'), raised: v('surface-raised') },
        // Trang khách: nền ngà ấm + đường viền vàng sen (Noir: nền Obsidian + viền tóc mảnh)
        ivory: { DEFAULT: v('ivory'), deep: v('ivory-deep'), line: v('ivory-line') },
        border: { subtle: v('slate-200') },
        // Ngữ nghĩa cho thành phần mới: dùng các tên này thay vì màu thô để tự đúng ở cả hai chế độ
        canvas: v('canvas'),
        fg: { DEFAULT: v('fg'), muted: v('fg-muted') },
        line: v('line'),
        gold: { DEFAULT: v('gold'), soft: v('gold-soft'), deep: v('gold-deep') },
        // Vàng trang trí (viền, vòng, thanh) — Ivory: champagne #C5A059; chữ vàng dùng `gold` (đậm hơn, đạt AA)
        champagne: v('champagne'),
        bloom: v('bloom'),
        jade: v('jade'),
        lotus: v('lotus'),
        // Lớp phủ sau hộp thoại / ngăn kéo: luôn tối (đảo thang slate ở Noir sẽ biến slate-900 thành sương trắng)
        scrim: v('scrim'),
        status: {
          pending: '#D97706', confirmed: '#2563EB', arrived: '#7C3AED',
          progress: '#0891B2', completed: '#16A34A', cancelled: '#64748B', noshow: '#DC2626',
        },
      },
      fontFamily: {
        // Inter: có bộ chữ tiếng Việt (Outfit / Geist chưa có → dấu tiếng Việt sẽ rơi về font khác, lệch nét)
        sans: ['Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // Tiêu đề trang khách: serif cổ điển, đủ dấu tiếng Việt — chất "spa sen" thay vì sans mặc định
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        pop: 'var(--shadow-pop)',
        glow: '0 0 0 1px rgb(var(--champagne) / 0.35), 0 12px 40px -12px rgb(var(--champagne) / 0.45)',
      },
      transitionTimingFunction: {
        // Ease-out mạnh (emil-design-eng): phản hồi tức thì, dừng mềm, không nảy quá đà
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
        // Lò xo thật (mass 1 · stiffness 320 · damping 26) dưới dạng linear() — xem --ease-spring trong index.css
        spring: 'var(--ease-spring)',
      },
      transitionDuration: { spring: '520ms' },
      screens: { xs: '360px' },
    },
  },
  plugins: [],
};
