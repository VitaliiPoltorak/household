import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import {
  createGatewaySignatureMiddleware,
  HttpExceptionFilter,
  requireSigningSecret,
} from '@household/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  requireSigningSecret(config);
  const port = config.get<number>('FINANCE_SERVICE_PORT', 3003);
  const host = config.get<string>('LISTEN_HOST', '127.0.0.1');
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.use(createGatewaySignatureMiddleware(config));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const swagger = new DocumentBuilder().setTitle('Finance Service').setVersion('0.1.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port, host);
  logger.log(`Finance Service running on http://${host}:${port}`);
}
bootstrap();
