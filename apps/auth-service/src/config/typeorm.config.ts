import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { User } from '../users/entities/user.entity';
import { AuthProvider } from '../users/entities/auth-provider.entity';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'auth',
    entities: [User, AuthProvider],
    migrations: ['src/migrations/*.ts'],
  }),
  synchronize: false,
});
