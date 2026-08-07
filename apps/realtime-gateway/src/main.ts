import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './adapters/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('REALTIME_GATEWAY_PORT', 3010);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.useWebSocketAdapter(new SocketIoAdapter(app, config));

  await app.listen(port);
  logger.log(`Realtime Gateway (Socket.IO) running on ws://localhost:${port}`);
}
bootstrap();
