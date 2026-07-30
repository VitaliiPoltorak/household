import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PresenceUser } from '@household/contracts';

const PRESENCE_TTL = 90; // seconds

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly redis: Redis;
  // userId → Set of socketIds (in-process, per instance)
  private readonly connections = new Map<string, Set<string>>();

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
    });
  }

  trackConnect(userId: string, socketId: string): void {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(socketId);
  }

  trackDisconnect(userId: string, socketId: string): boolean {
    const sockets = this.connections.get(userId);
    sockets?.delete(socketId);
    if (!sockets?.size) {
      this.connections.delete(userId);
      return true; // last connection → user is offline
    }
    return false;
  }

  async setOnline(householdId: string, user: PresenceUser): Promise<void> {
    const key = `presence:${householdId}`;
    await this.redis.hset(key, user.userId, JSON.stringify({ ...user, connectedAt: new Date().toISOString() }));
    await this.redis.expire(key, PRESENCE_TTL);
  }

  async setOffline(householdId: string, userId: string): Promise<void> {
    await this.redis.hdel(`presence:${householdId}`, userId);
  }

  async heartbeat(householdId: string, userId: string): Promise<void> {
    const key = `presence:${householdId}`;
    const raw = await this.redis.hget(key, userId);
    if (raw) {
      await this.redis.expire(key, PRESENCE_TTL);
    }
  }

  async setEditing(householdId: string, userId: string, entity: string, entityId: string): Promise<void> {
    const key = `presence:${householdId}`;
    const raw = await this.redis.hget(key, userId);
    if (!raw) return;
    const user = JSON.parse(raw) as PresenceUser;
    await this.redis.hset(key, userId, JSON.stringify({ ...user, editingEntity: entity, editingId: entityId }));
    await this.redis.expire(key, PRESENCE_TTL);
  }

  async clearEditing(householdId: string, userId: string): Promise<void> {
    const key = `presence:${householdId}`;
    const raw = await this.redis.hget(key, userId);
    if (!raw) return;
    const user = JSON.parse(raw) as PresenceUser;
    const { editingEntity: _, editingId: __, ...rest } = user as PresenceUser & { editingEntity?: string; editingId?: string };
    await this.redis.hset(key, userId, JSON.stringify(rest));
    await this.redis.expire(key, PRESENCE_TTL);
  }

  async getSnapshot(householdId: string): Promise<PresenceUser[]> {
    const data = await this.redis.hgetall(`presence:${householdId}`);
    if (!data) return [];
    return Object.values(data).map((v) => JSON.parse(v) as PresenceUser);
  }
}
