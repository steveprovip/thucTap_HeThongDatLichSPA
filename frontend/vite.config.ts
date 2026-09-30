import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { ServerResponse } from 'http';

/**
 * Đích proxy tới NestJS. Dùng 127.0.0.1 thay vì "localhost" để không phụ thuộc việc
 * hệ điều hành phân giải localhost thành ::1 hay 127.0.0.1 (khác nhau giữa các máy).
 * Có thể đổi bằng biến môi trường VITE_PROXY_TARGET khi API chạy ở cổng/máy khác.
 */
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';

/**
 * Khi API chưa lên (NestJS watch mất 15-30 giây để biên dịch) proxy sẽ gặp ECONNREFUSED.
 * Trả về 503 + JSON { message } để frontend hiển thị thông báo tiếng Việt và tự thử lại,
 * thay vì 500 rỗng. Tiến trình Vite không bao giờ bị sập vì lỗi proxy.
 */
const backendProxy = (): ProxyOptions => ({
  target: API_TARGET,
  changeOrigin: true,
  // Gắn IP thật của trình duyệt vào X-Forwarded-For; backend chỉ tin header này từ loopback (TRUST_PROXY)
  xfwd: true,
  configure: (proxy) => {
    proxy.on('error', (_err, _req, res) => {
      const out = res as ServerResponse | undefined;
      if (!out || typeof out.writeHead !== 'function' || out.headersSent || out.writableEnded) return;
      out.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '3' });
      out.end(
        JSON.stringify({
          success: false,
          statusCode: 503,
          message:
            'Không kết nối được tới máy chủ API (Backend đang khởi động hoặc chưa chạy). Vui lòng đợi vài giây và thử lại.',
        }),
      );
    });
  },
});

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Cổng 5173 bận thì báo lỗi ngay thay vì lặng lẽ nhảy sang 5174
    // (launcher và CORS của backend đều trỏ cố định vào 5173).
    strictPort: true,
    host: true,
    open: false,
    proxy: {
      '/api': backendProxy(),
      '/uploads': backendProxy(),
      '/health': backendProxy(),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
