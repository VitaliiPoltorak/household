import { Entity, Column, OneToMany } from 'typeorm';
import { BaseEntity } from '@household/database';
import { AuthProvider } from './auth-provider.entity';

@Entity({ name: 'users', schema: 'auth' })
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;

  @Column({ name: 'display_name' })
  displayName: string;

  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ default: 'en' })
  locale: string;

  @OneToMany(() => AuthProvider, (ap) => ap.user, { cascade: true })
  authProviders: AuthProvider[];
}
