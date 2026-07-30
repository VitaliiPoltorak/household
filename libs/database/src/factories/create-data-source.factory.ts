import { DataSourceOptions } from 'typeorm';
import { Client } from 'pg';

export interface DataSourceConfig {
  schema: string;
  entities: DataSourceOptions['entities'];
  migrations?: DataSourceOptions['migrations'];
}

export function createDataSourceOptions(cfg: DataSourceConfig): DataSourceOptions {
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
    synchronize: process.env.NODE_ENV === 'development',
  };
}

export async function ensureSchema(schema: string): Promise<void> {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'household',
    password: process.env.POSTGRES_PASSWORD || 'household_secret',
    database: process.env.POSTGRES_DB || 'household',
  });
  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.end();
}
