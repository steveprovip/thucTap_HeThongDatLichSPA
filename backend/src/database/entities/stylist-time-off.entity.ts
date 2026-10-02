import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Stylist } from './stylist.entity';

/** Nghỉ riêng của thợ: cả ngày khi startTime/endTime là null (S2-02). */
@Entity('stylist_time_off')
@Index(['stylistId', 'offDate'])
export class StylistTimeOff {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ name: 'off_date', type: 'date' })
  offDate!: string;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime!: string | null;

  @Column({ length: 255, nullable: true, type: 'varchar' })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
