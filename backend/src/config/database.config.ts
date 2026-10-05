import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '../database/entities';
import type { DbSsl } from './db-connection';

/**
 * Cấu hình TypeORM.
 * synchronize LUÔN tắt: lược đồ do database/schema.sql quản lý để giữ được
 * các ràng buộc EXCLUDE / CHECK mà TypeORM không sinh ra được.
 */
export const buildTypeOrmOptions = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('database.host'),
  port: config.get<number>('database.port'),
  username: config.get<string>('database.username'),
  password: config.get<string>('database.password'),
  database: config.get<string>('database.database'),
  ssl: config.get<DbSsl>('database.ssl') || false,
  entities: ALL_ENTITIES,
  synchronize: false,
  logging: config.get<boolean>('database.logging') ? ['query', 'error'] : ['error'],
  // CSDL miễn phí trên mây (Neon, Supabase) tự ngủ khi vắng khách và mất vài giây để thức dậy:
  // thử lại lâu hơn mặc định (10 lần x 3 giây) để API không chết ngay lần khởi động đầu tiên.
  retryAttempts: 20,
  retryDelay: 3000,
  extra: {
    max: config.get<number>('database.poolMax') ?? 20,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    // Mọi phiên kết nối dùng chung múi giờ của tiệm. Bộ gộp kết nối của Neon/Supabase không nhận
    // tham số khởi tạo này -> tắt bằng DB_STARTUP_TIMEZONE=false (xem config/db-connection.ts).
    ...(config.get<boolean>('database.startupTimezone') === false
      ? {}
      : { options: '-c timezone=Asia/Ho_Chi_Minh' }),
  },
});
