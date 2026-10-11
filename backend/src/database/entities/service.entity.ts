import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from './numeric.transformer';
import { ServiceCategory } from './service-category.entity';
import { StylistService } from './stylist-service.entity';

/** Đặt tên lớp là ServiceItem để tránh trùng với khái niệm "Service" của NestJS. */
@Entity('services')
export class ServiceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'category_id' })
  categoryId!: string;

  @ManyToOne(() => ServiceCategory, (c) => c.services, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: ServiceCategory;

  @Index()
  @Column({ length: 160 })
  name!: string;

  /** Bội số của 15, từ 15 đến 240 phút. */
  @Column({ name: 'duration_minutes', type: 'smallint' })
  durationMinutes!: number;

  @Column({ type: 'numeric', precision: 12, scale: 0, transformer: NumericTransformer })
  price!: number;

  @Column({ length: 500, nullable: true, type: 'varchar' })
  description!: string | null;

  /** TASK v4 · NV2: ảnh riêng của dịch vụ (https://… hoặc /uploads/…); NULL = giao diện tự chọn ảnh theo chủ đề. */
  @Column({ name: 'image_url', length: 500, nullable: true, type: 'varchar' })
  imageUrl!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => StylistService, (ss) => ss.service)
  stylistLinks?: StylistService[];
}
