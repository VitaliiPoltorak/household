import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@household/database';
import { Store } from '../stores/entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ShoppingList } from '../shopping-lists/entities/shopping-list.entity';
import { ShoppingListItem } from '../shopping-lists/entities/shopping-list-item.entity';

export default new DataSource({
  ...createDataSourceOptions({
    schema: 'shopping',
    entities: [Store, Product, ShoppingList, ShoppingListItem],
    migrations: ['src/migrations/*.ts'],
  }),
  synchronize: false,
});
