import type { EachMessagePayload } from 'kafkajs';
import { KafkaConsumerService } from '../src/kafka-consumer.service';
import type { KafkaProducerService } from '../src/kafka-producer.service';
import type { FailedMessageEnvelope, KafkaEventEnvelope } from '@household/contracts';

/**
 * Unit tests for the retry + DLQ behaviour added in #77.
 *
 * We only exercise the private processMessage() method. Full end-to-end
 * subscribe/consume needs a real Kafka broker and is covered separately by
 * each service's integration tests.
 */

function makeService(producer: Partial<KafkaProducerService> = {}): KafkaConsumerService {
  const options = { clientId: 'test', brokers: ['localhost:9092'] };
  // The Kafka client is instantiated in the constructor but never used by
  // processMessage. Safe to leave it be.
  return new KafkaConsumerService(options, {
    sendRaw: jest.fn().mockResolvedValue(undefined),
    ...producer,
  } as unknown as KafkaProducerService);
}

function payload(overrides: Partial<{ value: string; topic: string; partition: number; offset: string; key: string }> = {}): EachMessagePayload {
  return {
    topic: overrides.topic ?? 'finance-transaction-created',
    partition: overrides.partition ?? 0,
    message: {
      key: overrides.key ? Buffer.from(overrides.key) : null,
      value: overrides.value !== undefined ? Buffer.from(overrides.value) : Buffer.from('{}'),
      offset: overrides.offset ?? '42',
      timestamp: '0',
      attributes: 0,
      size: 0,
      headers: {},
    },
  } as unknown as EachMessagePayload;
}

function goodEnvelope(): KafkaEventEnvelope {
  return {
    eventId: 'e-1',
    eventType: 'finance.transaction.created',
    payload: { transactionId: 't-1' },
    createdAt: '2026-08-08T00:00:00Z',
  };
}

describe('KafkaConsumerService — retry + DLQ (#77)', () => {
  // Suppress logger output — this test intentionally triggers error paths.
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('advances offset on first-attempt success — no retries, no DLQ', async () => {
    const producer = { sendRaw: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(producer);
    const handler = jest.fn().mockResolvedValue(undefined);
    const p = payload({ value: JSON.stringify(goodEnvelope()) });

    await service['processMessage'](p, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(producer.sendRaw).not.toHaveBeenCalled();
  });

  it('retries a failing handler up to MAX_ATTEMPTS, then publishes to DLQ', async () => {
    const producer = { sendRaw: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(producer);
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    const p = payload({ value: JSON.stringify(goodEnvelope()) });

    await service['processMessage'](p, handler);

    expect(handler).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(producer.sendRaw).toHaveBeenCalledTimes(1);

    const [dlqTopic, dlqBodyStr] = producer.sendRaw.mock.calls[0];
    expect(dlqTopic).toBe('finance-transaction-created.dlq');
    const dlqBody = JSON.parse(dlqBodyStr) as FailedMessageEnvelope;
    expect(dlqBody.originalTopic).toBe('finance-transaction-created');
    expect(dlqBody.originalPartition).toBe(0);
    expect(dlqBody.originalOffset).toBe('42');
    expect(dlqBody.retriesAttempted).toBe(3);
    expect(dlqBody.error).toBe('boom');
    expect(dlqBody.originalMessage?.eventId).toBe('e-1');
  }, 10000);

  it('advances offset on eventual success within the retry budget', async () => {
    const producer = { sendRaw: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(producer);
    const handler = jest.fn()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce(undefined);
    const p = payload({ value: JSON.stringify(goodEnvelope()) });

    await service['processMessage'](p, handler);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(producer.sendRaw).not.toHaveBeenCalled(); // succeeded on last attempt
  }, 10000);

  it('sends unparseable JSON directly to DLQ without invoking the handler', async () => {
    const producer = { sendRaw: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(producer);
    const handler = jest.fn();
    const p = payload({ value: 'not-json' });

    await service['processMessage'](p, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(producer.sendRaw).toHaveBeenCalledTimes(1);
    const [dlqTopic, dlqBodyStr] = producer.sendRaw.mock.calls[0];
    expect(dlqTopic).toBe('finance-transaction-created.dlq');
    const dlqBody = JSON.parse(dlqBodyStr) as FailedMessageEnvelope;
    expect(dlqBody.originalMessage).toBeNull(); // couldn't parse
    expect(dlqBody.originalRaw).toBe('not-json');
    expect(dlqBody.retriesAttempted).toBe(0);
  });

  it('skips empty message bodies without invoking handler or DLQ', async () => {
    const producer = { sendRaw: jest.fn() };
    const service = makeService(producer);
    const handler = jest.fn();

    const emptyPayload = payload();
    (emptyPayload.message as { value: Buffer | null }).value = null;

    await service['processMessage'](emptyPayload, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(producer.sendRaw).not.toHaveBeenCalled();
  });

  it('does not throw when DLQ publish itself fails — logs and moves on', async () => {
    const producer = { sendRaw: jest.fn().mockRejectedValue(new Error('kafka down')) };
    const service = makeService(producer);
    const handler = jest.fn().mockRejectedValue(new Error('handler fail'));
    const p = payload({ value: JSON.stringify(goodEnvelope()) });

    await expect(service['processMessage'](p, handler)).resolves.toBeUndefined();
    expect(producer.sendRaw).toHaveBeenCalledTimes(1);
  }, 10000);
});
