import { Entity, Column, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
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

  // Null for OAuth-only accounts (no manual password ever set). Marked
  // @Exclude so class-transformer strips it from every serialized response —
  // even a `return user` slip in a controller can't leak the hash.
  @Exclude({ toPlainOnly: true })
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  // Null until the user proves ownership of the mailbox via the 6-digit code.
  // Existing OAuth users are backfilled to now() in the migration — providers
  // already verified them for us.
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @OneToMany(() => AuthProvider, (ap) => ap.user, { cascade: true })
  authProviders: AuthProvider[];
}
