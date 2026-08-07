import { randomUUID } from 'crypto';

export interface KafkaEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  householdId?: string;
  userId?: string;
  payload: T;
  createdAt: string;
}

export interface EventMeta {
  userId?: string;
  householdId?: string;
}

export function createEnvelope<T extends Record<string, unknown>>(
  eventType: string,
  payload: T,
  meta?: EventMeta,
): KafkaEventEnvelope<T> {
  return {
    eventId: randomUUID(),
    eventType,
    userId: meta?.userId,
    householdId: meta?.householdId,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function kafkaTopic(eventType: string): string {
  return eventType.replace(/\./g, '-');
}

// Wrapper published to <topic>.dlq when a consumer handler has exhausted its
// retries. Keeps the original envelope intact so an offline replay tool can
// re-inject it once the root cause is fixed.
export interface FailedMessageEnvelope {
  originalTopic: string;
  originalPartition: number;
  originalOffset: string;
  originalMessage: KafkaEventEnvelope | null;
  originalRaw: string;
  error: string;
  errorStack: string | null;
  retriesAttempted: number;
  failedAt: string;
}
