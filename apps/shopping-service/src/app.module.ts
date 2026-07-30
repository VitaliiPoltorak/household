import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KafkaModule } from '@household/kafka';
import { ensureSchema } from '@household/database';
import { StoresModule } from './stores/stores.module';
import { ProductsModule } from './products/products.module';
import { ShoppingListsModule } from './shopping-lists/shopping-lists.module';
import { Store } from './stores/entities/store.entity';
import { Product } from './products/entities/product.entity';
import { ShoppingList } from './shopping-lists/entities/shopping-list.entity';
import { ShoppingListItem } from './shopping-lists/entities/shopping-list-item.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        await ensureSchema('shopping');
        return {
          type: 'postgres' as const,
          host: config.get<string>('POSTGRES_HOST', 'localhost'),
          port: config.get<number>('POSTGRES_PORT', 5432),
          username: config.get<string>('POSTGRES_USER', 'household'),
          password: config.get<string>('POSTGRES_PASSWORD', 'household_secret'),
          database: config.get<string>('POSTGRES_DB', 'household'),
          schema: 'shopping',
          entities: [Store, Product, ShoppingList, ShoppingListItem],
          synchronize: config.get('NODE_ENV') === 'development',
        };
      },
    }),
    KafkaModule.forRootAsync('shopping-service'),
    StoresModule,
    ProductsModule,
    ShoppingListsModule,
  ],
})
export class AppModule {}
