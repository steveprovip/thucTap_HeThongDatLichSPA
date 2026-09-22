/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bảng màu ấm của salon, tương phản đạt chuẩn AA
        brand: {
          50: '#fbf6f2', 100: '#f5e9de', 200: '#e9d1bc', 300: '#d9b191',
          400: '#c68d66', 500: '#b57249', 600: '#a25c3d', 700: '#8c5a3c',
          800: '#6d4530', 900: '#573829',
        },
        ink: { DEFAULT: '#2b2b2b', soft: '#5b5148', muted: '#7a6a5f' },
        surface: { DEFAULT: '#ffffff', alt: '#faf7f4', page: '#f5f3f0' },
        status: {
          pending: '#d97706', confirmed: '#2563eb', arrived: '#7c3aed',
          progress: '#0891b2', completed: '#16a34a', cancelled: '#6b7280', noshow: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(43,43,43,.08), 0 1px 2px rgba(43,43,43,.04)',
        pop: '0 10px 30px rgba(43,43,43,.14)',
      },
      screens: { xs: '360px' },
    },
  },
  plugins: [],
};
