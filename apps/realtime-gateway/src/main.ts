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
  // Client-facing edge for WebSocket traffic — must bind broadly by default.
  // Ops can lock it to 127.0.0.1 when fronted by a reverse proxy.
  const host = config.get<string>('LISTEN_HOST', '0.0.0.0');
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.useWebSocketAdapter(new SocketIoAdapter(app, config));

  await app.listen(port, host);
  logger.log(`Realtime Gateway (Socket.IO) running on ws://${host}:${port}`);
}
bootstrap();
