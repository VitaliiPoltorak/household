import { Module } from '@nestjs/common';
import { MonobankClientService } from './monobank-client.service';

@Module({
  providers: [MonobankClientService],
  exports: [MonobankClientService],
})
export class MonobankModule {}
