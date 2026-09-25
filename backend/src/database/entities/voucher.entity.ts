import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { NumericTransformer } from './numeric.transformer';

export enum DiscountType {
  PERCENT = 'percent',
  AMOUNT = 'amount',
}

/** Mã giảm giá đơn giản áp lên phiếu tính tiền (S4-02). */
@Entity('vouchers')
export class Voucher {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 30 })
  code!: string;

  @Column({ length: 255, nullable: true, type: 'varchar' })
  description!: string | null;

  @Column({ name: 'discount_type', type: 'enum', enum: DiscountType, enumName: 'discount_type' })
  discountType!: DiscountType;

  @Column({ name: 'discount_value', type: 'numeric', precision: 12, scale: 0, transformer: NumericTransformer })
  discountValue!: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ name: 'max_usage', type: 'int', nullable: true })
  maxUsage!: number | null;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
