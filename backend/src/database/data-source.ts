/**
 * DataSource dành riêng cho TypeORM CLI (migration:generate, migration:revert…).
 * Ứng dụng NestJS không import tệp này.
 *
 *   npm run migration:generate -- src/database/migrations/TenThayDoi
 *
 * LƯU Ý: entity trong mã nguồn không mô tả hết những gì schema.sql có (ràng buộc EXCLUDE, CHECK, trigger,
 * chỉ mục GIN…) nên migration:generate có thể sinh thêm lệnh DROP cho các đối tượng đó. LUÔN đọc kỹ tệp
 * vừa sinh và xoá mọi lệnh DROP không phải do bạn chủ ý trước khi chạy migration:run.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { resolveDbConnection } from '../config/db-connection';
import { createDataSource } from './db-tools';

loadEnv();

export default createDataSource(resolveDbConnection());
