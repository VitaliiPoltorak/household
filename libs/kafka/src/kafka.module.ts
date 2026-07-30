import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KAFKA_MODULE_OPTIONS } from './kafka.constants';
import { KafkaModuleOptions } from './interfaces/kafka-options.interface';

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
      ],
      exports: [KafkaProducerService, KafkaConsumerService],
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
      ],
      exports: [KafkaProducerService, KafkaConsumerService],
    };
  }
}
