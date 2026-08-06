import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  const port = config.get<number>('AUTH_SERVICE_PORT', 3001);
  // Internal service — bind to loopback by default so it isn't reachable
  // from the LAN. Set LISTEN_HOST=0.0.0.0 in containerized deploys.
  const host = config.get<string>('LISTEN_HOST', '127.0.0.1');
  const logger = new Logger('Bootstrap');

  app.use(createGatewaySignatureMiddleware(config));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Auth Service')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port, host);
  logger.log(`Auth Service running on http://${host}:${port}`);
}
bootstrap();
