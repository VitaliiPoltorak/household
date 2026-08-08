import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaConsumerService } from '@household/kafka';
import { maskId } from '@household/common';
import { HouseholdMember } from '../households/entities/household-member.entity';

@Injectable()
export class AuthEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(AuthEventsConsumer.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    @InjectRepository(HouseholdMember)
    private readonly memberRepo: Repository<HouseholdMember>,
  ) {}

  async onModuleInit() {
    await this.consumer.subscribe<{ userId: string }>(
      ['auth-user-deleted'],
      'household-auth-consumer',
      async (envelope) => {
        const { userId } = envelope.payload;
        const result = await this.memberRepo.delete({ userId });
        this.logger.log(`Cleaned up ${result.affected ?? 0} memberships for deleted user ${maskId(userId)}`);
      },
    );
  }
}
