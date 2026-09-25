import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Appointment } from './appointment.entity';
import { Customer } from './customer.entity';
import { Stylist } from './stylist.entity';

/** Ghi chú kỹ thuật của thợ, chỉ nội bộ xem được (S4-03). */
@Entity('service_notes')
@Index(['customerId', 'createdAt'])
export class ServiceNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'appointment_id' })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ name: 'stylist_id', type: 'uuid', nullable: true })
  stylistId!: string | null;

  @ManyToOne(() => Stylist, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist | null;

  @Column({ length: 500 })
  content!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
