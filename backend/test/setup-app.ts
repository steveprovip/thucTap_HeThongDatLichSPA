import { INestApplication, ValidationPipe, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ValidationError } from 'class-validator';
import { AppModule } from '../src/app.module';
import { MSG } from '../src/common/constants/messages.constant';

/** Dựng ứng dụng thật (có kết nối CSDL) cho các bộ kiểm thử end-to-end. */
export async function createTestApp(): Promise<INestApplication> {
  process.env.TZ = 'Asia/Ho_Chi_Minh';
  process.env.MAIL_WORKER_ENABLED = process.env.MAIL_WORKER_ENABLED ?? 'false';
  process.env.BOOKING_IP_LIMIT_PER_HOUR = process.env.BOOKING_IP_LIMIT_PER_HOUR ?? '1000';
  process.env.LOOKUP_IP_LIMIT_PER_HOUR = process.env.LOOKUP_IP_LIMIT_PER_HOUR ?? '1000';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
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
  // AppModule đã đăng ký AllExceptionsFilter và TransformInterceptor ở phạm vi
  // toàn cục (APP_FILTER / APP_INTERCEPTOR) nên KHÔNG đăng ký lại ở đây,
  // tránh bọc hai lần thành { success, data: { success, data } }.

  await app.init();
  return app;
}

export const ACCOUNTS = {
  admin: { email: 'admin@salon.vn', password: 'Admin@123' },
  owner: { email: 'owner@salon.vn', password: 'Owner@123' },
  receptionist: { email: 'reception@salon.vn', password: 'Reception@123' },
  stylist: { email: 'stylist1@salon.vn', password: 'Stylist@123' },
};

export const tomorrowISO = (days = 1): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
