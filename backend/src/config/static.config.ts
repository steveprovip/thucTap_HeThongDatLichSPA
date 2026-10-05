import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModuleOptions } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Tệp tĩnh do NestJS phục vụ:
 *  1. /uploads — ảnh đại diện của thợ (luôn bật);
 *  2. giao diện đã build (frontend/dist) — chỉ khi SERVE_FRONTEND=true. Khi đó cả web lẫn API nằm trên MỘT địa chỉ
 *     (http://máy-tính:3000), nên chỉ cần một đường hầm Cloudflare, không có CORS và điện thoại/laptop chỉ cần mở một link.
 */
export const buildStaticOptions = (config: ConfigService): ServeStaticModuleOptions[] => {
  const options: ServeStaticModuleOptions[] = [
    {
      rootPath: join(process.cwd(), config.get<string>('upload.dir') ?? 'uploads'),
      serveRoot: '/uploads',
      // Ảnh không tồn tại -> để NestJS trả 404 JSON. Mặc định thư viện còn đăng ký thêm "trang index.html dự phòng"
      // cho /uploads/*, mà thư mục uploads không có index.html nên mọi ảnh thiếu đều bị trả 500.
      renderPath: '/__khong_co_trang_du_phong__',
      serveStaticOptions: { index: false, fallthrough: true },
    },
  ];

  if (config.get<boolean>('app.serveFrontend')) {
    const configured = config.get<string>('app.frontendDist');
    const dist = configured ? resolve(configured) : resolve(process.cwd(), '..', 'frontend', 'dist');
    if (!existsSync(join(dist, 'index.html'))) {
      new Logger('Static').warn(
        `SERVE_FRONTEND=true nhưng không thấy ${join(dist, 'index.html')}. Chạy "npm run build --prefix frontend" trước; tạm thời chỉ phục vụ API.`,
      );
    } else {
      options.push({
        rootPath: dist,
        // Mọi đường dẫn khác (/dang-nhap, /quan-ly/...) trả về index.html để React Router xử lý
        exclude: ['/api/(.*)', '/health', '/uploads/(.*)'],
        // KHÔNG đặt index:false — thư viện sẽ tắt luôn việc trả index.html cho các đường dẫn của React Router
        serveStaticOptions: {
          setHeaders: (res, filePath) => {
            // index.html và version.json không được cache -> thiết bị luôn thấy bản mới ngay sau khi cập nhật.
            // Tệp trong /assets có mã băm trong tên nên cache vĩnh viễn được.
            if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            else res.setHeader('Cache-Control', 'no-cache');
          },
        },
      });
    }
  }
  return options;
};
