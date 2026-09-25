import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from './numeric.transformer';
import { Customer } from './customer.entity';
import { Stylist } from './stylist.entity';
import { AppointmentServiceItem } from './appointment-service.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  ARRIVED = 'arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum AppointmentSource {
  ONLINE = 'online',
  WALK_IN = 'walk_in',
}

/** Các trạng thái còn "giữ chỗ" của thợ — trùng với điều kiện của ràng buộc EXCLUDE trong DB. */
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ARRIVED,
  AppointmentStatus.IN_PROGRESS,
];

@Entity('appointments')
@Index(['stylistId', 'startAt'])
@Index(['status', 'startAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 8 })
  code!: string;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Column({ name: 'total_duration_minutes', type: 'smallint' })
  totalDurationMinutes!: number;

  @Column({ name: 'estimated_total', type: 'numeric', precision: 12, scale: 0, default: 0, transformer: NumericTransformer })
  estimatedTotal!: number;

  @Column({ type: 'enum', enum: AppointmentStatus, enumName: 'appointment_status', default: AppointmentStatus.PENDING })
  status!: AppointmentStatus;

  @Column({ type: 'enum', enum: AppointmentSource, enumName: 'appointment_source', default: AppointmentSource.ONLINE })
  source!: AppointmentSource;

  @Column({ name: 'customer_note', length: 300, nullable: true, type: 'varchar' })
  customerNote!: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true })
  confirmedBy!: string | null;

  @Column({ name: 'rejected_reason', length: 255, nullable: true, type: 'varchar' })
  rejectedReason!: string | null;

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt!: Date | null;

  @Column({ name: 'checked_in_by', type: 'uuid', nullable: true })
  checkedInBy!: string | null;

  @Column({ name: 'is_late', default: false })
  isLate!: boolean;

  @Column({ name: 'late_minutes', type: 'smallint', default: 0 })
  lateMinutes!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'actual_duration_minutes', type: 'smallint', nullable: true })
  actualDurationMinutes!: number | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by_user', type: 'uuid', nullable: true })
  cancelledByUser!: string | null;

  @Column({ name: 'cancelled_by_label', length: 60, nullable: true, type: 'varchar' })
  cancelledByLabel!: string | null;

  @Column({ name: 'cancel_reason', length: 255, nullable: true, type: 'varchar' })
  cancelReason!: string | null;

  @Column({ name: 'no_show_at', type: 'timestamptz', nullable: true })
  noShowAt!: Date | null;

  @Column({ name: 'no_show_by', type: 'uuid', nullable: true })
  noShowBy!: string | null;

  @Column({ name: 'reminder_sent_at', type: 'timestamptz', nullable: true })
  reminderSentAt!: Date | null;

  @Column({ name: 'confirmation_sent_at', type: 'timestamptz', nullable: true })
  confirmationSentAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'created_ip', length: 64, nullable: true, type: 'varchar' })
  createdIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AppointmentServiceItem, (s) => s.appointment, { cascade: ['insert'] })
  services?: AppointmentServiceItem[];
}
