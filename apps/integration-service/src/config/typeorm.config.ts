import { join } from 'path';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { entities } from './entities';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'integration',
    entities,
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  }),
  synchronize: false,
  // See the identical option (and the comment explaining why) in
  // ../../app.module.ts's TypeOrmModule.forRootAsync — this is the same
  // setting for the `migration:run` CLI path.
  migrationsTransactionMode: 'each',
});
