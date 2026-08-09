import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShoppingList } from './entities/shopping-list.entity';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import { ShoppingListsService } from './shopping-lists.service';
import { ShoppingListItemsService } from './shopping-list-items.service';
import { ShoppingListsController } from './shopping-lists.controller';
import { StoresModule } from '../stores/stores.module';
import { ProductsModule } from '../products/products.module';

// One module, two services (#91). See research note: splitting into two
// modules is awkward because both services share the TypeORM entity
// registration and the same controller mounts endpoints for both. The
// meaningful split lives at the service level.
@Module({
  imports: [TypeOrmModule.forFeature([ShoppingList, ShoppingListItem]), StoresModule, ProductsModule],
  controllers: [ShoppingListsController],
  providers: [ShoppingListsService, ShoppingListItemsService],
})
export class ShoppingListsModule {}
