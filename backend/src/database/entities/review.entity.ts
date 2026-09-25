import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Appointment } from './appointment.entity';
import { Customer } from './customer.entity';
import { Stylist } from './stylist.entity';

/** Đánh giá 1-5 sao, mở bằng liên kết dùng một lần trong 7 ngày (S4-04). */
@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'appointment_id' })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ type: 'smallint', nullable: true })
  rating!: number | null;

  @Column({ length: 500, nullable: true, type: 'varchar' })
  comment!: string | null;

  @Index({ unique: true })
  @Column({ length: 64 })
  token!: string;

  @Column({ name: 'token_expires_at', type: 'timestamptz' })
  tokenExpiresAt!: Date;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
