import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '@household/kafka';
import { KafkaEventEnvelope, ServerEvents } from '@household/contracts';
import { RealtimeGateway } from '../gateway/realtime.gateway';
import { MembershipService } from '../membership/membership.service';

interface BridgeMapping {
  entity: string;
  socketEvent: string;
}

/**
 * Explicit overrides for events that don't fit the
 * `<domain>.<entity>.(created|updated|deleted)` convention. Add here only when
 * a new event genuinely doesn't fit — most events should just auto-bridge.
 */
const OVERRIDES: Record<string, BridgeMapping> = {
  // Two-part event: <domain>.<action>. Treated as household creation.
  'household.created':          { entity: 'household',    socketEvent: ServerEvents.ENTITY_CREATED },
  // Action name doesn't match CRUD verbs — bridge to the closest equivalent.
  'household.member.joined':    { entity: 'member',       socketEvent: ServerEvents.ENTITY_CREATED },
  'household.member.removed':   { entity: 'member',       socketEvent: ServerEvents.ENTITY_DELETED },
  'shopping.list.completed':    { entity: 'shoppingList', socketEvent: ServerEvents.ENTITY_UPDATED },
  'shopping.item.purchased':    { entity: 'shoppingItem', socketEvent: ServerEvents.ENTITY_UPDATED },
};

const ACTION_TO_SOCKET: Record<string, string> = {
  created: ServerEvents.ENTITY_CREATED,
  updated: ServerEvents.ENTITY_UPDATED,
  deleted: ServerEvents.ENTITY_DELETED,
};

/**
 * Resolves a Kafka event type to a socket-side mapping.
 *
 * Convention: `<domain>.<entity>.<action>` where action is
 * `created` / `updated` / `deleted` — auto-bridged, no config edit needed.
 * Anything else needs an explicit entry in OVERRIDES above.
 *
 * Exported for unit testing.
 */
export function resolveMapping(eventType: string): BridgeMapping | null {
  const override = OVERRIDES[eventType];
  if (override) return override;

  const parts = eventType.split('.');
  if (parts.length !== 3) return null;

  const [, entity, action] = parts;
  const socketEvent = ACTION_TO_SOCKET[action];
  if (!socketEvent) return null;

  return { entity, socketEvent };
}

// Kafka topics use dashes (see kafkaTopic() in libs/contracts). This regex
// matches every plain domain-* topic under our three business domains while
// deliberately excluding <topic>.dlq — DLQ messages are for offline replay,
// not live push to browsers.
const DOMAIN_TOPIC_REGEX = /^(finance|shopping|household)-[a-z-]+$/;

@Injectable()
export class KafkaBridgeService implements OnModuleInit {
  private readonly logger = new Logger(KafkaBridgeService.name);

  constructor(
    private readonly consumer: KafkaConsumerService,
    private readonly gateway: RealtimeGateway,
    private readonly membership: MembershipService,
  ) {}

  async onModuleInit() {
    await this.consumer.subscribe(
      [DOMAIN_TOPIC_REGEX],
      'realtime-gateway-bridge',
      async (envelope: KafkaEventEnvelope) => {
        this.maybeInvalidateMembership(envelope);

        const mapping = resolveMapping(envelope.eventType);
        if (!mapping) {
          this.logger.debug(`No bridge mapping for ${envelope.eventType} — skipping`);
          return;
        }

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

    this.logger.log(`Kafka bridge subscribed via convention regex ${DOMAIN_TOPIC_REGEX}`);
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
