/**
 * Đo hiệu năng các truy vấn nóng trên dữ liệu quy mô lớn (chạy sau `npm run seed:scale` = seed-realistic --scale):
 *   npm run bench:scale
 * In số truy vấn SQL và thời gian (ms, trung vị 5 lần) của: tra khung giờ trống, tìm ngày còn chỗ gần nhất,
 * gợi ý khung giờ 7 ngày, chọn thợ tự động, danh sách lịch hẹn (trang đầu / trang sâu / con trỏ), tìm khách.
 * Chỉ ĐỌC dữ liệu; không chạy trên CSDL tiệm thật.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';

loadEnv();
process.env.TZ = 'Asia/Ho_Chi_Minh';
process.env.MAIL_WORKER_ENABLED = 'false';
process.env.BACKUP_DAILY = 'off';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { AppModule } from '../app.module';
import { AvailabilityService } from '../modules/booking-engine/availability.service';
import { AppointmentsService } from '../modules/booking-engine/appointments.service';
import { CustomersService } from '../modules/customers/customers.service';
import { Role } from '../common/constants/roles.constant';
import { addDays, todaySalon } from '../common/utils/time.util';
import type { AuthUser } from '../common/types/auth.types';
import type { ListAppointmentsQuery } from '../modules/booking-engine/dto/booking.dto';

let queries = 0;
const original = PostgresQueryRunner.prototype.query;
PostgresQueryRunner.prototype.query = function counted(this: PostgresQueryRunner, ...args: Parameters<typeof original>) {
  queries += 1;
  return original.apply(this, args);
} as typeof original;

async function measure(label: string, fn: () => Promise<unknown>, runs = 5): Promise<void> {
  await fn(); // làm nóng
  const times: number[] = [];
  let q = 0;
  for (let i = 0; i < runs; i += 1) {
    queries = 0;
    const t = process.hrtime.bigint();
    await fn();
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
    q = queries;
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(52)} ${String(q).padStart(5)} truy vấn  ${times[Math.floor(runs / 2)].toFixed(1).padStart(8)} ms`);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const availability = app.get(AvailabilityService);
  const appointments = app.get(AppointmentsService);
  const customers = app.get(CustomersService);

  const [svc] = await ds.query(
    `SELECT s.id, count(*)::int AS n FROM services s JOIN stylist_services ss ON ss.service_id = s.id
      WHERE s.is_active GROUP BY s.id ORDER BY n DESC LIMIT 1`);
  const counts = await ds.query(`SELECT (SELECT count(*) FROM appointments)::int AS appts, (SELECT count(*) FROM customers)::int AS customers,
    (SELECT count(*) FROM stylists WHERE is_active)::int AS stylists, (SELECT count(*) FROM services)::int AS services`);
  console.log('Dữ liệu:', counts[0], `· dịch vụ đo: ${svc.n} thợ làm được`);
  const [owner] = await ds.query(`SELECT id, email, full_name FROM users WHERE role = 'owner' LIMIT 1`);
  const user: AuthUser = { id: owner.id, email: owner.email, fullName: owner.full_name, role: Role.OWNER, stylistId: null, mustChangePassword: false };
  const tomorrow = addDays(todaySalon(), 1);
  const list = (extra: Partial<ListAppointmentsQuery>) =>
    appointments.list({ page: 1, limit: 50, ...extra } as ListAppointmentsQuery, user);

  await measure('Khung giờ trống 1 ngày (mọi thợ)', () => availability.getAvailability({ date: tomorrow, serviceIds: [svc.id] }));
  await measure('Ngày còn chỗ gần nhất (2 ngày — mặc định)', () =>
    availability.findNearestAvailableDates({ serviceIds: [svc.id], fromDate: tomorrow, count: 2 }));
  await measure('Ngày còn chỗ gần nhất (quét đủ 30 ngày)', () =>
    availability.findNearestAvailableDates({ serviceIds: [svc.id], fromDate: tomorrow, count: 30 }));
  await measure('Gợi ý khung giờ thông minh 7 ngày', () => availability.smartSlots({ serviceIds: [svc.id], fromDate: tomorrow, days: 7 }));
  await measure('Chọn thợ tự động 1 khung giờ', () =>
    availability.pickAutoStylist({ date: tomorrow, time: '15:00', serviceIds: [svc.id], totalDuration: 30 }));
  await measure('Danh sách lịch hẹn — trang 1', () => list({}));
  await measure('Danh sách lịch hẹn — trang 1000 (offset)', () => list({ page: 1000 }));
  const deep = await list({ page: 999 });
  const cursor = (deep as { nextCursor?: string | null }).nextCursor;
  if (cursor) await measure('Danh sách lịch hẹn — con trỏ tới cùng vị trí', () => list({ cursor } as Partial<ListAppointmentsQuery>));
  await measure('Tìm khách theo tên "lan"', () => customers.search('lan', 1, 20, Role.OWNER));
  await measure('Tìm khách theo SĐT "0790012"', () => customers.search('0790012', 1, 20, Role.OWNER));
  await app.close();
}

main().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
