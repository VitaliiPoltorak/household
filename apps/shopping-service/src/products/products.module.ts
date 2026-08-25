import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { LinkPreviewService } from './link-preview.service';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), StoresModule],
  controllers: [ProductsController],
  providers: [ProductsService, LinkPreviewService],
  exports: [ProductsService],
})
export class ProductsModule {}
