import { DataSourceOptions } from 'typeorm';

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
