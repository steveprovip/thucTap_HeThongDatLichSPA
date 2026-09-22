import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from './numeric.transformer';
import { Invoice } from './invoice.entity';
import { ServiceItem } from './service.entity';

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'invoice_id' })
  invoiceId!: string;

  @ManyToOne(() => Invoice, (i) => i.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: Invoice;

  @Column({ name: 'service_id', type: 'uuid', nullable: true })
  serviceId!: string | null;

  @ManyToOne(() => ServiceItem, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'service_id' })
  service?: ServiceItem | null;

  @Column({ length: 160 })
  name!: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 0, transformer: NumericTransformer })
  unitPrice!: number;

  @Column({ type: 'smallint', default: 1 })
  quantity!: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 12, scale: 0, transformer: NumericTransformer })
  lineTotal!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
