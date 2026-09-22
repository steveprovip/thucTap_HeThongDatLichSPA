import {
  Column, CreateDateColumn, Entity, JoinColumn, OneToMany, OneToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { StylistService } from './stylist-service.entity';
import { StylistShift } from './stylist-shift.entity';

@Entity('stylists')
export class Stylist {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @OneToOne(() => User, (u) => u.stylist, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'full_name', length: 120 })
  fullName!: string;

  @Column({ length: 20, nullable: true, type: 'varchar' })
  phone!: string | null;

  @Column({ name: 'avatar_url', length: 400, nullable: true, type: 'varchar' })
  avatarUrl!: string | null;

  @Column({ length: 500, nullable: true, type: 'varchar' })
  bio!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => StylistService, (ss) => ss.stylist)
  serviceLinks?: StylistService[];

  @OneToMany(() => StylistShift, (s) => s.stylist)
  shifts?: StylistShift[];
}
