import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from '@household/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('SHOPPING_SERVICE_PORT', 3004);
  const host = config.get<string>('LISTEN_HOST', '127.0.0.1');
  const logger = new Logger('Bootstrap');

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const swagger = new DocumentBuilder().setTitle('Shopping Service').setVersion('0.1.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port, host);
  logger.log(`Shopping Service running on http://${host}:${port}`);
}
bootstrap();
