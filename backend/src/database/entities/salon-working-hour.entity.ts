import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Giờ mở cửa của tiệm theo từng thứ trong tuần (S1-08). 0 = Chủ nhật … 6 = Thứ bảy. */
@Entity('salon_working_hours')
export class SalonWorkingHour {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  @Column({ name: 'open_time', type: 'time', default: '08:00:00' })
  openTime!: string;

  @Column({ name: 'close_time', type: 'time', default: '20:00:00' })
  closeTime!: string;

  @Column({ name: 'is_closed', default: false })
  isClosed!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
