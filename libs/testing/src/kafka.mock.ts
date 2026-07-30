import { KafkaProducerService, KafkaConsumerService } from '@household/kafka';

export const mockKafkaProducer = {
  emit: jest.fn().mockResolvedValue(undefined),
};

export const mockKafkaConsumer = {
  subscribe: jest.fn().mockResolvedValue(undefined),
};

export const KafkaMockProviders = [
  { provide: KafkaProducerService, useValue: mockKafkaProducer },
  { provide: KafkaConsumerService, useValue: mockKafkaConsumer },
];

export function resetKafkaMocks() {
  mockKafkaProducer.emit.mockClear();
  mockKafkaConsumer.subscribe.mockClear();
}
