import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PresenceUser } from '@household/contracts';

const PRESENCE_TTL = 90; // seconds

@Injectable()
export class PresenceService {
  private readonly redis: Redis;

  // userId → Map<householdId, Set<socketId>>
  // Tracks which sockets are in which household rooms (in-process, per instance).
  // For true multi-instance support this would need Redis, but single-instance is fine for now.
  private readonly householdSockets = new Map<string, Map<string, Set<string>>>();

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
    });
  }

  // Called when a socket joins a household room.
  // Returns true if this is the FIRST socket for this user in this household.
  joinHousehold(userId: string, householdId: string, socketId: string): boolean {
    if (!this.householdSockets.has(userId)) {
      this.householdSockets.set(userId, new Map());
    }
    const byHousehold = this.householdSockets.get(userId)!;
    if (!byHousehold.has(householdId)) {
      byHousehold.set(householdId, new Set());
    }
    const first = byHousehold.get(householdId)!.size === 0;
    byHousehold.get(householdId)!.add(socketId);
    return first;
  }

  // Called when a socket leaves a household room (explicit leave or disconnect).
  // Returns true if this was the LAST socket for this user in this household.
  leaveHousehold(userId: string, householdId: string, socketId: string): boolean {
    const byHousehold = this.householdSockets.get(userId);
    if (!byHousehold) return true;
    const sockets = byHousehold.get(householdId);
    if (!sockets) return true;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      byHousehold.delete(householdId);
      if (byHousehold.size === 0) this.householdSockets.delete(userId);
      return true;
    }
    return false;
  }

  // Called on full socket disconnect. Returns the set of householdIds where
  // the user became offline (no remaining sockets in those households).
  disconnectSocket(userId: string, socketId: string): string[] {
    const byHousehold = this.householdSockets.get(userId);
    if (!byHousehold) return [];

    const offlineIn: string[] = [];
    for (const [householdId, sockets] of byHousehold) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        byHousehold.delete(householdId);
        offlineIn.push(householdId);
      }
    }
    if (byHousehold.size === 0) this.householdSockets.delete(userId);
    return offlineIn;
  }

  // --- Redis presence ---

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
    const exists = await this.redis.hexists(key, userId);
    if (exists) await this.redis.expire(key, PRESENCE_TTL);
  }

  async setEditing(householdId: string, userId: string, entity: string, entityId: string): Promise<void> {
    const key = `presence:${householdId}`;
    const raw = await this.redis.hget(key, userId);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    await this.redis.hset(key, userId, JSON.stringify({ ...stored, editingEntity: entity, editingId: entityId }));
    await this.redis.expire(key, PRESENCE_TTL);
  }

  async clearEditing(householdId: string, userId: string): Promise<void> {
    const key = `presence:${householdId}`;
    const raw = await this.redis.hget(key, userId);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    delete stored['editingEntity'];
    delete stored['editingId'];
    await this.redis.hset(key, userId, JSON.stringify(stored));
    await this.redis.expire(key, PRESENCE_TTL);
  }

  async getSnapshot(householdId: string): Promise<PresenceUser[]> {
    const data = await this.redis.hgetall(`presence:${householdId}`);
    if (!data) return [];
    return Object.values(data).map((v) => JSON.parse(v) as PresenceUser);
  }
}
