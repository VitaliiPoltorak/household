import { EVENT_PUBLISHER } from '@household/contracts';
import { KafkaProducerService, KafkaConsumerService } from '@household/kafka';

export const mockKafkaProducer = {
  emit: jest.fn().mockResolvedValue(undefined),
};

// Same instance re-exported under a name that matches how services now
// depend on the abstraction. Existing tests that read mockKafkaProducer.emit
// keep working because both references point at the same jest.fn().
export const mockEventPublisher = mockKafkaProducer;

export const mockKafkaConsumer = {
  subscribe: jest.fn().mockResolvedValue(undefined),
};

export const KafkaMockProviders = [
  { provide: EVENT_PUBLISHER, useValue: mockKafkaProducer },
  { provide: KafkaProducerService, useValue: mockKafkaProducer },
  { provide: KafkaConsumerService, useValue: mockKafkaConsumer },
];

export function resetKafkaMocks() {
  mockKafkaProducer.emit.mockClear();
  mockKafkaConsumer.subscribe.mockClear();
}
