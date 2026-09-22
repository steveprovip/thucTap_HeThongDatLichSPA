import {
  Column, CreateDateColumn, Entity, Index, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/constants/roles.constant';
import { RefreshToken } from './refresh-token.entity';
import { Stylist } from './stylist.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', length: 120 })
  fullName!: string;

  @Index()
  @Column({ length: 160 })
  email!: string;

  @Column({ length: 20, nullable: true, type: 'varchar' })
  phone!: string | null;

  @Column({ name: 'password_hash', length: 120, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: Role, enumName: 'user_role', default: Role.RECEPTIONIST })
  role!: Role;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'must_change_password', default: false })
  mustChangePassword!: boolean;

  @Column({ name: 'failed_login_attempts', type: 'smallint', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  /** Mọi access/refresh token phát hành trước mốc này đều bị vô hiệu. */
  @Column({ name: 'sessions_valid_from', type: 'timestamptz', default: () => 'now()' })
  sessionsValidFrom!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => RefreshToken, (t) => t.user)
  refreshTokens?: RefreshToken[];

  @OneToOne(() => Stylist, (s) => s.user)
  stylist?: Stylist | null;
}
