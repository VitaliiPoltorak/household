import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'auth_providers', schema: 'auth' })
@Unique(['provider', 'providerUserId'])
export class AuthProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  provider: string;

  @Column({ name: 'provider_user_id' })
  providerUserId: string;

  @ManyToOne(() => User, (u) => u.authProviders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
