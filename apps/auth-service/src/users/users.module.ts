import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AuthProvider } from './entities/auth-provider.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuthProvider])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
