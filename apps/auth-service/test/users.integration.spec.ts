import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanDatabase, resetKafkaMocks } from '@household/testing';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';

describe('GET /auth/users (integration)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  const requesterId = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    app = await createTestApp(AppModule);
    userRepo = app.get<Repository<User>>(getRepositoryToken(User));
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    resetKafkaMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const seedUser = async (overrides: Partial<User> = {}) =>
    userRepo.save(
      userRepo.create({
        email: `${Math.random().toString(36).slice(2)}@example.com`,
        displayName: 'Alice Example',
        avatarUrl: null,
        locale: 'en',
        ...overrides,
      }),
    );

  it('returns display name + avatar for known ids (happy path)', async () => {
    const alice = await seedUser({ displayName: 'Alice', avatarUrl: 'https://cdn/a.png' });
    const bob = await seedUser({ displayName: 'Bob', avatarUrl: null });

    const res = await request(app.getHttpServer())
      .get(`/auth/users?ids=${alice.id},${bob.id}`)
      .set('X-User-Id', requesterId)
      .expect(200);

    expect(res.body).toHaveLength(2);
    const byId = Object.fromEntries((res.body as Array<{ id: string }>).map((u) => [u.id, u]));
    expect(byId[alice.id]).toEqual({
      id: alice.id,
      displayName: 'Alice',
      avatarUrl: 'https://cdn/a.png',
    });
    expect(byId[bob.id]).toEqual({
      id: bob.id,
      displayName: 'Bob',
      avatarUrl: null,
    });
  });

  it('does not leak sensitive fields (email / locale / timestamps)', async () => {
    const u = await seedUser({ displayName: 'Carol', locale: 'de' });

    const res = await request(app.getHttpServer())
      .get(`/auth/users?ids=${u.id}`)
      .set('X-User-Id', requesterId)
      .expect(200);

    const row = res.body[0];
    expect(Object.keys(row).sort()).toEqual(['avatarUrl', 'displayName', 'id']);
  });

  it('silently omits unknown ids instead of erroring', async () => {
    const alice = await seedUser({ displayName: 'Alice' });
    const missing = '99999999-9999-4999-8999-999999999999';

    const res = await request(app.getHttpServer())
      .get(`/auth/users?ids=${alice.id},${missing}`)
      .set('X-User-Id', requesterId)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(alice.id);
  });

  it('returns empty array for empty ids param', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/users?ids=')
      .set('X-User-Id', requesterId)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('returns empty array when ids param is omitted entirely', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/users')
      .set('X-User-Id', requesterId)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('rejects when X-User-Id header is missing (401)', async () => {
    await request(app.getHttpServer())
      .get('/auth/users?ids=11111111-1111-4111-8111-111111111111')
      .expect(401);
  });

  it('rejects malformed uuid (400)', async () => {
    await request(app.getHttpServer())
      .get('/auth/users?ids=not-a-uuid')
      .set('X-User-Id', requesterId)
      .expect(400);
  });

  it('rejects when more than 50 ids requested (400)', async () => {
    const many = Array.from({ length: 51 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ).join(',');

    await request(app.getHttpServer())
      .get(`/auth/users?ids=${many}`)
      .set('X-User-Id', requesterId)
      .expect(400);
  });

  it('dedupes overlapping ids in the input', async () => {
    const u = await seedUser({ displayName: 'Dana' });

    const res = await request(app.getHttpServer())
      .get(`/auth/users?ids=${u.id},${u.id},${u.id}`)
      .set('X-User-Id', requesterId)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(u.id);
  });
});
