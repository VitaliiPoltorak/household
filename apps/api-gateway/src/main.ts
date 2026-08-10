import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import Redis from 'ioredis';
import { requireStrongJwtSecret } from '@household/common';
import { AppModule } from './app.module';
import { createJwtMiddleware } from './middleware/jwt-express.middleware';
import { createAuthRateLimitMiddleware } from './middleware/auth-rate-limit.middleware';
import { setupProxies } from './proxy/proxy-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.use(helmet());

  const corsOrigins = parseCorsOrigins(config);
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(createJwtMiddleware(requireStrongJwtSecret(config)));

  const authRateLimitRedis = new Redis({
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
  });
  app.use(createAuthRateLimitMiddleware(authRateLimitRedis));

  setupProxies(app);

  // Skip Swagger in production so a public deploy can't be scraped for the
  // full API surface. Dev/staging still get /api/docs for exploration.
  const swaggerEnabled = process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Household API')
      .setDescription('Family finance & shopping management API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // The gateway is the client-facing edge; unlike internal services it must
  // bind to 0.0.0.0 in most deployments. Still exposed as env for parity so
  // ops can lock it down (e.g. behind a reverse proxy on 127.0.0.1).
  const host = config.get<string>('LISTEN_HOST', '0.0.0.0');
  await app.listen(port, host);
  logger.log(`API Gateway running on http://${host}:${port}`);
  if (swaggerEnabled) logger.log(`Swagger docs at http://${host}:${port}/api/docs`);
  logger.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);
}
bootstrap();

function parseCorsOrigins(config: ConfigService): string[] {
  const raw = config.get<string>('CORS_ORIGIN', '');
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error(
      'CORS_ORIGIN must be set to a comma-separated list of allowed browser origins. Refusing to start.',
    );
  }
  return origins;
}
