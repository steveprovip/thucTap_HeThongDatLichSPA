/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Cảm ứng: tắt hover:* để phần tử không bị "kẹt" trạng thái hover/translate sau khi chạm
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // Fresha-style light luxury: airy slate surfaces, teal spa accent.
        brand: {
          DEFAULT: '#0D9488',
          primary: '#0D9488',
          light: '#F0FDFA',
          50: '#F0FDFA', 100: '#CCFBF1', 200: '#99F6E4', 300: '#5EEAD4',
          400: '#2DD4BF', 500: '#14B8A6', 600: '#0D9488', 700: '#0F766E',
          800: '#115E59', 900: '#134E4A',
        },
        accent: { gold: '#D97706', bright: '#F59E0B', glow: '#FEF3C7' },
        ink: { DEFAULT: '#0F172A', soft: '#475569', muted: '#64748B' },
        surface: { DEFAULT: '#FFFFFF', card: '#FFFFFF', alt: '#F8FAFC', page: '#F8FAFC' },
        border: { subtle: '#E2E8F0' },
        status: {
          pending: '#D97706', confirmed: '#2563EB', arrived: '#7C3AED',
          progress: '#0891B2', completed: '#16A34A', cancelled: '#64748B', noshow: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 12px 32px -6px rgba(15, 23, 42, 0.10), 0 4px 10px -2px rgba(15, 23, 42, 0.04)',
        pop: '0 24px 48px -12px rgba(15, 23, 42, 0.18)',
      },
      screens: { xs: '360px' },
    },
  },
  plugins: [],
};
