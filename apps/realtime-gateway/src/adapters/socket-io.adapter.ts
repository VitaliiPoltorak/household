import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import * as jwt from 'jsonwebtoken';

export class SocketIoAdapter extends IoAdapter {
  private readonly logger = new Logger(SocketIoAdapter.name);
  private readonly jwtSecret: string;
  private pubClient: Redis;
  private subClient: Redis;

  constructor(app: INestApplication, config: ConfigService) {
    super(app);
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');

    const redisOptions = {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
    };
    this.pubClient = new Redis(redisOptions);
    this.subClient = this.pubClient.duplicate();
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: '*', credentials: true },
      transports: ['websocket', 'polling'],
    });

    // Redis adapter for horizontal scaling
    server.adapter(createAdapter(this.pubClient, this.subClient));
    this.logger.log('Socket.IO Redis adapter configured');

    // JWT authentication middleware
    server.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error('Missing auth token'));
      }
      try {
        const payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
        socket.data.userId = payload.sub as string;
        socket.data.email = payload.email as string | undefined;
        next();
      } catch {
        next(new Error('Invalid or expired token'));
      }
    });

    return server;
  }
}
