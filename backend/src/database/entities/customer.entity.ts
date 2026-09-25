import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Hồ sơ khách gộp theo số điện thoại (S3-10). */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', length: 120 })
  fullName!: string;

  @Index({ unique: true })
  @Column({ length: 20 })
  phone!: string;

  @Column({ length: 160, nullable: true, type: 'varchar' })
  email!: string | null;

  @Column({ name: 'total_visits', type: 'int', default: 0 })
  totalVisits!: number;

  @Column({ name: 'no_show_count', type: 'int', default: 0 })
  noShowCount!: number;

  @Column({ length: 1000, nullable: true, type: 'varchar' })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
