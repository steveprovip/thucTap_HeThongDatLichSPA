import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Stylist } from './stylist.entity';

export enum ShiftRequestKind {
  SHIFT = 'shift',
  TIME_OFF = 'time_off',
}

export enum ShiftRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/** Yêu cầu thợ tự đăng ký ca làm / ngày nghỉ, chờ quản lý duyệt (Mentor Sprint 2 · mục 6). */
@Entity('shift_requests')
@Index(['status', 'workDate'])
export class ShiftRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ type: 'varchar', length: 16 })
  kind!: ShiftRequestKind;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime!: string | null;

  @Column({ name: 'break_start', type: 'time', nullable: true })
  breakStart!: string | null;

  @Column({ name: 'break_end', type: 'time', nullable: true })
  breakEnd!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @Column({ type: 'varchar', length: 16, default: ShiftRequestStatus.PENDING })
  status!: ShiftRequestStatus;

  @Column({ name: 'review_note', type: 'varchar', length: 255, nullable: true })
  reviewNote!: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /** id ca (stylist_shifts) hoặc ngày nghỉ (stylist_time_off) được tạo khi duyệt. */
  @Column({ name: 'result_id', type: 'uuid', nullable: true })
  resultId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
