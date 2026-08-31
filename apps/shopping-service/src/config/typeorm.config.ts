import { join } from 'path';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { entities } from './entities';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'shopping',
    entities,
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
  }),
  synchronize: false,
});
