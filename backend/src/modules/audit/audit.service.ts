import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { AuditAction, AuditLog } from '../../database/entities/audit-log.entity';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResult, paginate } from '../../common/dto/pagination.dto';
import { endOfDay, startOfDay } from '../../common/utils/time.util';

export interface WriteAuditInput {
  actorId: string | null;
  actorEmail: string | null;
  actorRole: Role | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  /** Ghi nhật ký. Lỗi ghi nhật ký KHÔNG được làm hỏng nghiệp vụ chính. */
  async write(input: WriteAuditInput): Promise<void> {
    try {
      const row = this.repo.create({
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        changes: input.changes ?? null,
        ipAddress: input.ipAddress ?? null,
      });
      await this.repo.save(row);
    } catch (e) {
      this.logger.warn(`Không ghi được nhật ký: ${(e as Error).message}`);
    }
  }

  /** Danh sách nhật ký, lọc theo khoảng ngày và tài khoản, phân trang 50 dòng/trang. */
  async list(params: {
    page: number;
    limit: number;
    from?: string;
    to?: string;
    actorId?: string;
    entityType?: string;
  }): Promise<PaginatedResult<AuditLog>> {
    const where: FindOptionsWhere<AuditLog> = {};
    if (params.actorId) where.actorId = params.actorId;
    if (params.entityType) where.entityType = params.entityType;
    if (params.from && params.to) {
      where.createdAt = Between(startOfDay(params.from), endOfDay(params.to));
    } else if (params.from) {
      where.createdAt = Between(startOfDay(params.from), endOfDay(params.from));
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    return paginate(items, total, params.page, params.limit);
  }
}
