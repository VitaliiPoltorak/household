#!/usr/bin/env node
// Ops kill-switch: flips a feature flag's global `enabled_default` directly
// in Postgres, then deletes its cached Redis key so every consumer picks up
// the new value on next resolve. This is the "direct DB writes" admin
// surface #348 explicitly allows for now — there is no platform-admin role
// in this system, so a REST endpoint would need to invent one.
//
// Because this runs outside Nest it cannot emit a signed
// `feature-flag.updated` Kafka event (see
// apps/household-service/src/feature-flags/feature-flags.service.ts, which
// does that for the HTTP-driven household-override path) — deleting the
// Redis key is this script's entire invalidation story. Consumers that miss
// the delete (a service instance that isn't sharing this Redis, or a
// request that lands between the delete and a stale in-flight populate)
// self-correct within FEATURE_FLAG_CACHE_TTL_SECONDS (60s — see
// libs/feature-flags/src/constants.ts) regardless.
//
// Run inside the already-booted household-service container, once Postgres
// and Redis are up:
//   docker compose exec -T household-service node scripts/feature-flag.js monobank-integration off
//   docker compose exec -T household-service node scripts/feature-flag.js monobank-integration on
//
// Idempotent — flipping to the state it's already in is a no-op write.

'use strict';

const { Client } = require('pg');
const Redis = require('ioredis');

const USAGE = 'Usage: node scripts/feature-flag.js <flag-key> <on|off>';

async function main() {
  const [, , flagKey, stateArg] = process.argv;
  if (!flagKey || (stateArg !== 'on' && stateArg !== 'off')) {
    throw new Error(USAGE);
  }
  const enabled = stateArg === 'on';

  const pg = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'household',
    password: process.env.POSTGRES_PASSWORD || 'household_secret',
    database: process.env.POSTGRES_DB || 'household',
  });
  await pg.connect();

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  });

  try {
    const { rows } = await pg.query(
      `UPDATE "household"."feature_flags" SET "enabled_default" = $1 WHERE "flag_key" = $2 RETURNING "enabled_default"`,
      [enabled, flagKey],
    );
    if (rows.length === 0) {
      throw new Error(
        `Unknown feature flag '${flagKey}' — check libs/contracts/src/feature-flags/registry.ts and that household-service has booted at least once to seed it.`,
      );
    }

    await redis.del(`flag:${flagKey}:default`);

    console.log(
      `feature-flag: '${flagKey}' -> ${rows[0].enabled_default ? 'on' : 'off'} (cache invalidated)`,
    );
  } finally {
    await pg.end();
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error('feature-flag: failed —', err.message);
  process.exitCode = 1;
});
