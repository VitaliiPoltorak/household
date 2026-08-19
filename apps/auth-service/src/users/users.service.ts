import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { AuthProvider } from './entities/auth-provider.entity';

export interface OAuthProfile {
  provider: string;
  providerUserId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuthProvider)
    private readonly authProviderRepo: Repository<AuthProvider>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  /**
   * Bulk lookup by ids. Missing users are silently omitted from the result —
   * callers (mainly the member-list UI in the web app) can render a fallback
   * for any id that doesn't come back.
   *
   * Deliberately returns full User entities; the controller layer decides
   * which fields to expose over HTTP.
   */
  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    // Dedupe defensively — TypeORM's IN also handles it, but this keeps the
    // SQL parameter list tight when callers pass overlapping arrays.
    const uniqueIds = Array.from(new Set(ids));
    return this.userRepo.find({ where: { id: In(uniqueIds) } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findByProvider(
    provider: string,
    providerUserId: string,
  ): Promise<User | null> {
    const ap = await this.authProviderRepo.findOne({
      where: { provider, providerUserId },
      relations: ['user'],
    });
    return ap?.user ?? null;
  }

  async findOrCreateByOAuth(profile: OAuthProfile): Promise<{ user: User; isNew: boolean }> {
    let user = await this.findByProvider(profile.provider, profile.providerUserId);
    if (user) return { user, isNew: false };

    user = await this.findByEmail(profile.email);
    if (user) {
      await this.authProviderRepo.save(
        this.authProviderRepo.create({
          userId: user.id,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        }),
      );
      return { user, isNew: false };
    }

    user = this.userRepo.create({
      email: profile.email.toLowerCase(),
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      // Provider already verified the mailbox — no need to send our own code.
      emailVerifiedAt: new Date(),
    });
    user = await this.userRepo.save(user);

    await this.authProviderRepo.save(
      this.authProviderRepo.create({
        userId: user.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      }),
    );

    return { user, isNew: true };
  }

  /**
   * Creates an unverified user for the manual email/password flow. Caller is
   * responsible for hashing the password and issuing the verification code —
   * this method just handles the row.
   */
  async createWithPassword(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<User> {
    const user = this.userRepo.create({
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      avatarUrl: null,
      emailVerifiedAt: null,
    });
    return this.userRepo.save(user);
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userRepo.update(userId, { emailVerifiedAt: new Date() });
  }

  /**
   * Replaces the stored hash without touching any other field. Called by the
   * login flow when the stored parameters fall below current Argon2 policy
   * (see PasswordHasherService.needsRehash) so users migrate to stronger
   * settings on next successful sign-in without any user-facing prompt.
   */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.userRepo.update(userId, { passwordHash });
  }

  async updateProfile(
    id: string,
    data: Partial<Pick<User, 'displayName' | 'avatarUrl' | 'locale'>>,
  ): Promise<User> {
    await this.userRepo.update(id, data);
    return this.userRepo.findOneOrFail({ where: { id } });
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepo.delete(id);
  }
}
