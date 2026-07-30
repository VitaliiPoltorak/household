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
