import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Stylist } from './stylist.entity';

/** Giữ chỗ tạm một khung giờ của một thợ trong lúc khách hoàn tất đặt lịch (Mentor S2 · mục 11). */
@Entity('slot_holds')
@Index(['stylistId', 'expiresAt'])
export class SlotHold {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Chuỗi ngẫu nhiên 192 bit, chỉ trình duyệt của khách đang giữ chỗ biết. */
  @Column({ type: 'varchar', length: 64, unique: true })
  token!: string;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'created_ip', type: 'varchar', length: 64, nullable: true })
  createdIp!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
