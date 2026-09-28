import 'reflect-metadata';
import { Logger, ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { MSG } from './common/constants/messages.constant';

// Toàn hệ thống chạy theo múi giờ của tiệm
process.env.TZ = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const prefix = config.get<string>('app.apiPrefix')!;
  app.setGlobalPrefix(prefix, { exclude: ['health'] });

  app.enableCors({
    origin: [config.get<string>('app.frontendUrl')!, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
      // Gom lỗi kiểm tra dữ liệu thành thông điệp tiếng Việt kèm tên trường
      exceptionFactory: (errors: ValidationError[]) => {
        const flat: Record<string, string> = {};
        const collect = (list: ValidationError[], parent = ''): void => {
          for (const e of list) {
            const path = parent ? `${parent}.${e.property}` : e.property;
            if (e.constraints) flat[path] = Object.values(e.constraints)[0];
            if (e.children?.length) collect(e.children, path);
          }
        };
        collect(errors);
        const first = Object.entries(flat)[0];
        return new BadRequestException({
          message: first ? first[1] : MSG.VALIDATION_FAILED,
          field: first ? first[0] : undefined,
          errors: flat,
        });
      },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('API Hệ thống đặt lịch Salon - Spa')
    .setDescription('REST API cho trang đặt lịch công khai và khu vực vận hành nội bộ')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, swagger));

  // Ctrl+C trong cửa sổ launcher -> đóng kết nối CSDL gọn gàng
  app.enableShutdownHooks();

  const port = config.get<number>('app.port')!;
  // Không ép '0.0.0.0': để Node lắng nghe dual-stack (IPv4 + IPv6) nên cả
  // 127.0.0.1 lẫn ::1 (Windows/macOS hay phân giải "localhost" thành ::1) đều vào được.
  await app.listen(port);

  logger.log(`API chạy tại http://localhost:${port}/${prefix}`);
  logger.log(`Tài liệu API tại http://localhost:${port}/${prefix}/docs`);
  logger.log(`Múi giờ: ${config.get<string>('app.timezone')}`);
}

bootstrap().catch((err: NodeJS.ErrnoException) => {
  const logger = new Logger('Bootstrap');
  if (err?.code === 'EADDRINUSE') {
    logger.error(
      `Cổng ${process.env.PORT ?? 3000} đang bị chiếm (có thể hệ thống đã chạy ở một cửa sổ khác). ` +
        'Đóng cửa sổ đó hoặc đổi PORT trong backend/.env rồi chạy lại.',
    );
  } else {
    logger.error(`Không khởi động được API: ${err?.message ?? err}`, err?.stack);
  }
  process.exit(1);
});
