import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Appointment } from './appointment.entity';

/** Lịch sử đổi thợ / dời giờ của một lịch hẹn (S3-04). */
@Entity('appointment_changes')
@Index(['appointmentId', 'createdAt'])
export class AppointmentChange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id' })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @Column({ length: 60 })
  field!: string;

  @Column({ name: 'old_value', length: 255, nullable: true, type: 'varchar' })
  oldValue!: string | null;

  @Column({ name: 'new_value', length: 255, nullable: true, type: 'varchar' })
  newValue!: string | null;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy!: string | null;

  @Column({ name: 'changed_by_name', length: 120, nullable: true, type: 'varchar' })
  changedByName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
