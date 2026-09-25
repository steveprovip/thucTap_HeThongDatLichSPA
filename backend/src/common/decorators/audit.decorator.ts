import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../../database/entities/audit-log.entity';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: AuditAction;
  entityType: string;
  /** Mô tả ngắn hiển thị trên màn hình nhật ký. */
  summary: string;
}

/**
 * Ghi nhật ký thao tác thay đổi dữ liệu quan trọng (S1-09).
 * Interceptor sẽ tự lấy id đối tượng từ kết quả trả về hoặc từ params.
 */
export const Audit = (action: AuditAction, entityType: string, summary: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType, summary } as AuditMeta);
