import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum EmailStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum EmailKind {
  BOOKING_CONFIRMATION = 'booking_confirmation',
  BOOKING_REMINDER = 'booking_reminder',
  BOOKING_CHANGED = 'booking_changed',
  BOOKING_CANCELLED = 'booking_cancelled',
  REVIEW_INVITATION = 'review_invitation',
  ACCOUNT_CREATED = 'account_created',
  PASSWORD_RESET = 'password_reset',
}

/** Hàng đợi email: gửi lại tối đa 3 lần, cách nhau 10 phút (S4-05). */
@Entity('email_queue')
@Index(['status', 'nextAttemptAt'])
export class EmailQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: EmailKind, enumName: 'email_kind' })
  kind!: EmailKind;

  @Column({ name: 'to_email', length: 160 })
  toEmail!: string;

  @Column({ name: 'to_name', length: 120, nullable: true, type: 'varchar' })
  toName!: string | null;

  @Column({ length: 255 })
  subject!: string;

  @Column({ name: 'body_html', type: 'text' })
  bodyHtml!: string;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @Column({ type: 'enum', enum: EmailStatus, enumName: 'email_status', default: EmailStatus.PENDING })
  status!: EmailStatus;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', length: 500, nullable: true, type: 'varchar' })
  lastError!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', default: () => 'now()' })
  scheduledAt!: Date;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
