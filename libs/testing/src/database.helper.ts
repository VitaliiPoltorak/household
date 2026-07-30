import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

export async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const tableNames = dataSource.entityMetadatas
    .map((m) => `"${m.schema ?? 'public'}"."${m.tableName}"`)
    .join(', ');
  if (tableNames) {
    await dataSource.query(`TRUNCATE ${tableNames} CASCADE`);
  }
}

export async function ensureSchema(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const schema = (dataSource.options as unknown as Record<string, unknown>)['schema'] as string | undefined;
  if (schema) {
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await dataSource.synchronize();
  }
}
