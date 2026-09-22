import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Chống spam đặt lịch / tra cứu / gửi lại liên kết (S2-07, S2-09, S1-04). */
@Entity('rate_limits')
@Index(['scope', 'identifier'], { unique: true })
export class RateLimit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ length: 40 })
  scope!: string;

  @Column({ length: 160 })
  identifier!: string;

  @Column({ name: 'hit_count', type: 'int', default: 0 })
  hitCount!: number;

  @Column({ name: 'window_start', type: 'timestamptz', default: () => 'now()' })
  windowStart!: Date;

  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blockedUntil!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
