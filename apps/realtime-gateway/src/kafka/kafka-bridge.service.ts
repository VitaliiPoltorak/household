import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '@household/kafka';
import { KafkaEventEnvelope, ServerEvents } from '@household/contracts';
import { RealtimeGateway } from '../gateway/realtime.gateway';
import { MembershipService } from '../membership/membership.service';

interface BridgeMapping {
  entity: string;
  socketEvent: string;
}

const KAFKA_TO_SOCKET: Record<string, BridgeMapping> = {
  'finance.transaction.created':  { entity: 'transaction',  socketEvent: ServerEvents.ENTITY_CREATED },
  'finance.transaction.updated':  { entity: 'transaction',  socketEvent: ServerEvents.ENTITY_UPDATED },
  'finance.account.created':      { entity: 'account',      socketEvent: ServerEvents.ENTITY_CREATED },
  'shopping.list.completed':      { entity: 'shoppingList', socketEvent: ServerEvents.ENTITY_UPDATED },
  'shopping.item.purchased':      { entity: 'shoppingItem', socketEvent: ServerEvents.ENTITY_UPDATED },
  'household.created':            { entity: 'household',    socketEvent: ServerEvents.ENTITY_CREATED },
  'household.member.joined':      { entity: 'member',       socketEvent: ServerEvents.ENTITY_CREATED },
  'household.member.removed':     { entity: 'member',       socketEvent: ServerEvents.ENTITY_DELETED },
};

@Injectable()
export class KafkaBridgeService implements OnModuleInit {
  private readonly logger = new Logger(KafkaBridgeService.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly gateway: RealtimeGateway,
    private readonly membership: MembershipService,
  ) {}

  async onModuleInit() {
    const topics = Object.keys(KAFKA_TO_SOCKET).map((t) => t.replace(/\./g, '-'));

    await this.consumer.subscribe(
      topics,
      'realtime-gateway-bridge',
      async (envelope: KafkaEventEnvelope) => {
        this.maybeInvalidateMembership(envelope);

        const mapping = KAFKA_TO_SOCKET[envelope.eventType];
        if (!mapping) return;

        if (!envelope.householdId) {
          this.logger.debug(`Skipping ${envelope.eventType} — no householdId`);
          return;
        }

        const room = `household:${envelope.householdId}`;
        this.gateway.server.to(room).emit(mapping.socketEvent, {
          entity: mapping.entity,
          householdId: envelope.householdId,
          entityId: (envelope.payload as Record<string, unknown>).id as string | undefined,
          data: envelope.payload,
        });

        this.logger.debug(
          `Bridged ${envelope.eventType} → ${mapping.socketEvent} [${mapping.entity}] → room ${room}`,
        );
      },
    );

    this.logger.log(`Kafka bridge subscribed to ${topics.length} topics`);
  }

  /**
   * Membership cache in-memory can go stale if a user is added to or removed
   * from a household mid-session. We already consume the relevant events for
   * bridging — reuse the same stream to invalidate the affected user.
   */
  private maybeInvalidateMembership(envelope: KafkaEventEnvelope): void {
    const payload = envelope.payload as Record<string, unknown>;
    switch (envelope.eventType) {
      case 'household.created':
        if (envelope.userId) this.membership.invalidate(envelope.userId);
        break;
      case 'household.member.joined': {
        const userId = payload['userId'] as string | undefined;
        if (userId) this.membership.invalidate(userId);
        break;
      }
      case 'household.member.removed': {
        const removedUserId = payload['removedUserId'] as string | undefined;
        if (removedUserId) this.membership.invalidate(removedUserId);
        break;
      }
    }
  }
}
