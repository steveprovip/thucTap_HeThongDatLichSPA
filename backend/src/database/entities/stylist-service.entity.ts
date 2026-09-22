import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Stylist } from './stylist.entity';
import { ServiceItem } from './service.entity';

/** Bảng nối kỹ năng: nhiều dịch vụ / thợ và nhiều thợ / dịch vụ (S1-07). */
@Entity('stylist_services')
export class StylistService {
  @PrimaryColumn({ name: 'stylist_id', type: 'uuid' })
  stylistId!: string;

  @PrimaryColumn({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => Stylist, (s) => s.serviceLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stylist_id' })
  stylist?: Stylist;

  @ManyToOne(() => ServiceItem, (s) => s.stylistLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service?: ServiceItem;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
