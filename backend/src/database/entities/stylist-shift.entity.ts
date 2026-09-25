import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Stylist } from './stylist.entity';

/** Ca làm của thợ theo ngày, có nghỉ giữa ca (S2-01). */
@Entity('stylist_shifts')
@Index(['stylistId', 'workDate'])
export class StylistShift {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, (s) => s.shifts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'break_start', type: 'time', nullable: true })
  breakStart!: string | null;

  @Column({ name: 'break_end', type: 'time', nullable: true })
  breakEnd!: string | null;

  @Column({ length: 255, nullable: true, type: 'varchar' })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
