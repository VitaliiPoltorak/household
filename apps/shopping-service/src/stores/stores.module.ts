import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { Product } from '../products/entities/product.entity';
import { ShoppingList } from '../shopping-lists/entities/shopping-list.entity';
import { ShoppingListItem } from '../shopping-lists/entities/shopping-list-item.entity';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';

// Product/ShoppingList/ShoppingListItem repos are read-only from here (impact
// counts on delete, #198) — same pattern as finance-service's CategoriesModule.
// Can't import ProductsModule/ShoppingListsModule directly: both already
// depend on StoresModule, which would create a circular module dependency.
@Module({
  imports: [
    TypeOrmModule.forFeature([Store, Product, ShoppingList, ShoppingListItem]),
  ],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
