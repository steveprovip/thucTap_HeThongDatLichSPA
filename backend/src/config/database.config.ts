import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ALL_ENTITIES } from '../database/entities';

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
  entities: ALL_ENTITIES,
  synchronize: false,
  logging: config.get<boolean>('database.logging') ? ['query', 'error'] : ['error'],
  extra: {
    max: 20,
    // Mọi phiên kết nối dùng chung múi giờ của tiệm
    options: '-c timezone=Asia/Ho_Chi_Minh',
  },
});
