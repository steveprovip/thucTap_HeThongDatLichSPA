/** Chạy trong MỖI tệp test (setupFiles): trỏ ứng dụng vào CSDL test trước khi AppModule được nạp. */
import { applyTestEnv, resolveTestDb } from './test-db';

applyTestEnv(resolveTestDb());
