import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionsService } from './sessions.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
