import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShoppingList } from './entities/shopping-list.entity';
import { ShoppingListItem } from './entities/shopping-list-item.entity';
import { ShoppingListsService } from './shopping-lists.service';
import { ShoppingListsController } from './shopping-lists.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ShoppingList, ShoppingListItem])],
  controllers: [ShoppingListsController],
  providers: [ShoppingListsService],
})
export class ShoppingListsModule {}
