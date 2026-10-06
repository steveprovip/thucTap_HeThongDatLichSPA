import { Module } from '@nestjs/common';
import { BackupSchedulerService } from './backup-scheduler.service';

/** Tác vụ bảo trì chạy nền của máy chủ cửa hàng (sao lưu tự động hằng ngày). */
@Module({ providers: [BackupSchedulerService] })
export class MaintenanceModule {}
