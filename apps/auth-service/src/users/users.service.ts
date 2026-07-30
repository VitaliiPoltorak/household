import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
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
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
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
