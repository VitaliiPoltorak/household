import { join } from 'path';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { entities } from './entities';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'household',
    entities,
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  }),
  synchronize: false,
});
