import { INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { HttpExceptionFilter } from '@household/common';
import { KafkaProducerService, KafkaConsumerService } from '@household/kafka';
import { mockKafkaProducer, mockKafkaConsumer } from './kafka.mock';
import { ensureSchema } from './database.helper';

export async function createTestApp(
  AppModule: Type<unknown>,
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(KafkaProducerService)
    .useValue(mockKafkaProducer)
    .overrideProvider(KafkaConsumerService)
    .useValue(mockKafkaConsumer);

  if (configure) builder = configure(builder);

  const module = await builder.compile();
  const app = module.createNestApplication();

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();
  await ensureSchema(app);
  return app;
}
