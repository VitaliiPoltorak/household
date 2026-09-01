import { DataSourceOptions } from 'typeorm';
import { Client } from 'pg';

export interface DataSourceConfig {
  schema: string;
  entities: DataSourceOptions['entities'];
  migrations?: DataSourceOptions['migrations'];
}

export function createDataSourceOptions(
  cfg: DataSourceConfig,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'household',
    password: process.env.POSTGRES_PASSWORD || 'household_secret',
    database: process.env.POSTGRES_DB || 'household',
    schema: cfg.schema,
    entities: cfg.entities,
    migrations: cfg.migrations,
    synchronize: false,
  };
}

export async function ensureSchema(schema: string): Promise<void> {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
  const user = process.env.POSTGRES_USER || 'household';
  const password = process.env.POSTGRES_PASSWORD || 'household_secret';
  const database = process.env.POSTGRES_DB || 'household';

  await ensureDatabase({ host, port, user, password, database });

  const client = new Client({ host, port, user, password, database });
  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.end();
}

// Postgres has no `CREATE DATABASE IF NOT EXISTS` — a plain `pg.Client`
// connection also requires the target database to already exist, so the
// check has to happen over a separate connection to the always-present
// `postgres` maintenance database. Needed for the local `household_test`
// database specifically: `docker compose up -d`'s postgres container only
// auto-creates POSTGRES_DB on first boot (the dev DB name), never the test
// one — CI happens to get this for free because its ephemeral postgres
// service sets POSTGRES_DB=household_test directly, which masked the gap
// for local dev.
async function ensureDatabase(opts: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<void> {
  const admin = new Client({
    host: opts.host,
    port: opts.port,
    user: opts.user,
    password: opts.password,
    database: 'postgres',
  });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [opts.database],
    );
    if (rowCount === 0) {
      // Database identifiers can't be parameterized — quote instead.
      await admin.query(`CREATE DATABASE "${opts.database}"`);
    }
  } finally {
    await admin.end();
  }
}
