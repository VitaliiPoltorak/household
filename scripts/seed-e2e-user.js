#!/usr/bin/env node
// Seeds two pre-verified email/password users so the Postman/Newman API
// scenario collection (docs/postman/) can start straight at POST /auth/login
// instead of going through register + email verification, which stays a
// manual-only flow (#192/#204) — the 6-digit code only ever exists in Redis
// and an auth-service log line, not worth a test-only HTTP surface for a
// flow that rarely changes.
//
// Two users, not one: household invite-accept requires invite.email to match
// the caller's own email and rejects existing members
// (apps/household-service/src/households/invites.service.ts), so a single
// user can never self-accept an invite it just created.
//
// Run *inside* the already-built auth-service container, after it has
// booted (so the schema exists):
//   docker compose exec -T auth-service node scripts/seed-e2e-user.js
//
// Idempotent — safe to run on every pre-commit / CI invocation. Upserts on
// the existing unique `email` constraint rather than failing on conflict.

'use strict';

const { hash } = require('@node-rs/argon2');
const { Client } = require('pg');
const { randomUUID } = require('crypto');

// Mirrors PasswordHasherService.PROD_MIN (apps/auth-service/src/auth/password-hasher.service.ts)
// so PasswordHasherService.needsRehash() doesn't fire a silent rehash+write
// on every seeded-user login.
const ARGON2ID = 2;
const PROD_MIN_PARAMS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
const HASH_LENGTH = 32;

const USERS = [
  {
    label: 'owner',
    email: process.env.E2E_EMAIL || 'e2e-owner@household.local',
    displayName: 'E2E Owner',
  },
  {
    label: 'invitee',
    email: process.env.E2E_INVITEE_EMAIL || 'e2e-invitee@household.local',
    displayName: 'E2E Invitee',
  },
];

const PASSWORD = process.env.E2E_PASSWORD || 'E2eScenario!Passw0rd';

const UPSERT_SQL = `
  INSERT INTO auth.users (id, email, display_name, locale, password_hash, email_verified_at, created_at, updated_at)
  VALUES ($1, $2, $3, 'en', $4, now(), now(), now())
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        email_verified_at = now(),
        updated_at = now()
  RETURNING id;
`;

async function main() {
  const passwordHash = await hash(PASSWORD, {
    algorithm: ARGON2ID,
    memoryCost: PROD_MIN_PARAMS.memoryCost,
    timeCost: PROD_MIN_PARAMS.timeCost,
    parallelism: PROD_MIN_PARAMS.parallelism,
    outputLen: HASH_LENGTH,
  });

  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'household',
    password: process.env.POSTGRES_PASSWORD || 'household_secret',
    database: process.env.POSTGRES_DB || 'household',
  });
  await client.connect();

  try {
    for (const user of USERS) {
      const { rows } = await client.query(UPSERT_SQL, [
        randomUUID(),
        user.email,
        user.displayName,
        passwordHash,
      ]);
      console.log(
        `seed-e2e-user: ${user.label} -> ${user.email} (id=${rows[0].id})`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('seed-e2e-user: failed —', err);
  process.exitCode = 1;
});
