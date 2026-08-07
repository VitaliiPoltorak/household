import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EVENT_PUBLISHER } from '@household/contracts';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KAFKA_MODULE_OPTIONS } from './kafka.constants';
import { KafkaModuleOptions } from './interfaces/kafka-options.interface';

// Alias the concrete producer under the abstract EVENT_PUBLISHER token so
// services can depend on the interface (DIP) without importing the transport.
// The class provider stays exported too — legacy call sites and Nest overrides
// (e.g. libs/testing) still reference it directly.
const eventPublisherAlias: Provider = {
  provide: EVENT_PUBLISHER,
  useExisting: KafkaProducerService,
};

@Module({})
export class KafkaModule {
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
      providers: [
        { provide: KAFKA_MODULE_OPTIONS, useValue: options },
        KafkaProducerService,
        KafkaConsumerService,
        eventPublisherAlias,
      ],
      exports: [KafkaProducerService, KafkaConsumerService, EVENT_PUBLISHER],
    };
  }

  static forRootAsync(clientId: string): DynamicModule {
    return {
      module: KafkaModule,
      global: true,
      providers: [
        {
          provide: KAFKA_MODULE_OPTIONS,
          useFactory: (config: ConfigService): KafkaModuleOptions => ({
            clientId,
            brokers: config.get<string>('KAFKA_BROKERS', 'localhost:9092').split(','),
          }),
          inject: [ConfigService],
        },
        KafkaProducerService,
        KafkaConsumerService,
        eventPublisherAlias,
      ],
      exports: [KafkaProducerService, KafkaConsumerService, EVENT_PUBLISHER],
    };
  }
}
