import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { AuthProvider } from '../users/entities/auth-provider.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'household',
  password: process.env.POSTGRES_PASSWORD || 'household_secret',
  database: process.env.POSTGRES_DB || 'household',
  schema: 'auth',
  entities: [User, AuthProvider],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
