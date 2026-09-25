import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../common/constants/roles.constant';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  VIEW = 'view',
}

/** Nhật ký chỉ đọc — trigger trong CSDL chặn mọi UPDATE/DELETE (S1-09). */
@Entity('audit_logs')
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_email', length: 160, nullable: true, type: 'varchar' })
  actorEmail!: string | null;

  @Column({ name: 'actor_role', type: 'enum', enum: Role, enumName: 'user_role', nullable: true })
  actorRole!: Role | null;

  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action' })
  action!: AuditAction;

  @Column({ name: 'entity_type', length: 60 })
  entityType!: string;

  @Column({ name: 'entity_id', length: 64, nullable: true, type: 'varchar' })
  entityId!: string | null;

  @Column({ length: 500 })
  summary!: string;

  @Column({ type: 'jsonb', nullable: true })
  changes!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', length: 64, nullable: true, type: 'varchar' })
  ipAddress!: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
