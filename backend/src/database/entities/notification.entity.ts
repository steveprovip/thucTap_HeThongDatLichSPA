import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { Appointment } from './appointment.entity';

export enum NotificationType {
  APPOINTMENT_ASSIGNED = 'appointment_assigned',
  APPOINTMENT_RESCHEDULED = 'appointment_rescheduled',
  APPOINTMENT_CANCELLED = 'appointment_cancelled',
  CUSTOMER_CHECKED_IN = 'customer_checked_in',
  OVERRUN_WARNING = 'overrun_warning',
  APPOINTMENT_NEW = 'appointment_new',
  /** Thợ gửi yêu cầu đăng ký ca / nghỉ -> báo quản lý (Mentor S2 · mục 6). */
  SHIFT_REQUEST_NEW = 'shift_request_new',
  /** Quản lý duyệt / từ chối -> báo thợ. */
  SHIFT_REQUEST_REVIEWED = 'shift_request_reviewed',
}

@Entity('notifications')
@Index(['userId', 'isRead', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type!: NotificationType;

  @Column({ length: 160 })
  title!: string;

  @Column({ length: 500 })
  body!: string;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment | null;

  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
