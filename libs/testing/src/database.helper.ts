import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

function assertTestDatabase(dataSource: DataSource): void {
  const database = (dataSource.options as unknown as Record<string, unknown>)['database'] as string | undefined;
  if (!database || !database.endsWith('_test')) {
    throw new Error(
      `Refusing to run test helpers against database "${database}". ` +
        `Test database name must end with "_test". Set POSTGRES_DB=<name>_test before running tests.`,
    );
  }
}

export async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());
  assertTestDatabase(dataSource);
  const tableNames = dataSource.entityMetadatas
    .map((m) => `"${m.schema ?? 'public'}"."${m.tableName}"`)
    .join(', ');
  if (tableNames) {
    await dataSource.query(`TRUNCATE ${tableNames} CASCADE`);
  }
}

export async function ensureSchema(app: INestApplication): Promise<void> {
  const dataSource = app.get<DataSource>(getDataSourceToken());
  assertTestDatabase(dataSource);
  const schema = (dataSource.options as unknown as Record<string, unknown>)['schema'] as string | undefined;
  if (schema) {
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await dataSource.synchronize();
  }
}
