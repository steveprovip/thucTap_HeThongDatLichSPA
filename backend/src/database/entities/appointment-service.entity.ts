import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from './numeric.transformer';
import { Appointment } from './appointment.entity';
import { ServiceItem } from './service.entity';

/**
 * Dòng dịch vụ của một lịch hẹn.
 * Giá và thời lượng được CHỤP LẠI tại thời điểm đặt để việc đổi bảng giá
 * hay đổi thời lượng dịch vụ không làm lệch các lịch hẹn cũ (S1-05).
 */
@Entity('appointment_services')
export class AppointmentServiceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id' })
  appointmentId!: string;

  @ManyToOne(() => Appointment, (a) => a.services, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @Column({ name: 'service_id' })
  serviceId!: string;

  @ManyToOne(() => ServiceItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service?: ServiceItem;

  @Column({ name: 'price_snapshot', type: 'numeric', precision: 12, scale: 0, transformer: NumericTransformer })
  priceSnapshot!: number;

  @Column({ name: 'duration_snapshot', type: 'smallint' })
  durationSnapshot!: number;

  @Column({ name: 'name_snapshot', length: 160 })
  nameSnapshot!: string;

  @Column({ type: 'smallint', default: 0 })
  position!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
