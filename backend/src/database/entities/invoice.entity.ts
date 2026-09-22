import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from './numeric.transformer';
import { Appointment } from './appointment.entity';
import { Customer } from './customer.entity';
import { Stylist } from './stylist.entity';
import { Voucher } from './voucher.entity';
import { InvoiceItem } from './invoice-item.entity';

export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  PAID = 'paid',
  CLOSED = 'closed',
  ADJUSTED = 'adjusted',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 16 })
  code!: string;

  @Column({ name: 'appointment_id' })
  appointmentId!: string;

  @ManyToOne(() => Appointment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: Appointment;

  @Column({ name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @Column({ name: 'stylist_id' })
  stylistId!: string;

  @ManyToOne(() => Stylist, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @Column({ type: 'numeric', precision: 12, scale: 0, default: 0, transformer: NumericTransformer })
  subtotal!: number;

  @Column({ name: 'voucher_id', type: 'uuid', nullable: true })
  voucherId!: string | null;

  @ManyToOne(() => Voucher, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'voucher_id' })
  voucher?: Voucher | null;

  @Column({ name: 'voucher_code', length: 30, nullable: true, type: 'varchar' })
  voucherCode!: string | null;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 12, scale: 0, default: 0, transformer: NumericTransformer })
  discountAmount!: number;

  @Column({ type: 'numeric', precision: 12, scale: 0, default: 0, transformer: NumericTransformer })
  total!: number;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod, enumName: 'payment_method', nullable: true })
  paymentMethod!: PaymentMethod | null;

  @Column({ name: 'transfer_note', length: 255, nullable: true, type: 'varchar' })
  transferNote!: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus, enumName: 'invoice_status', default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus;

  @Column({ name: 'adjusts_invoice_id', type: 'uuid', nullable: true })
  adjustsInvoiceId!: string | null;

  @Column({ name: 'adjust_reason', length: 255, nullable: true, type: 'varchar' })
  adjustReason!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => InvoiceItem, (i) => i.invoice, { cascade: ['insert'] })
  items?: InvoiceItem[];
}
