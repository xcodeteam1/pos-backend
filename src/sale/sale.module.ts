import { Module } from '@nestjs/common';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';
import { ProductRepo } from 'src/product/product.repository';
import { SaleRepo } from './sale.repository';
import { AnalyticsModule } from 'src/analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [SaleController],
  providers: [SaleService, SaleRepo, ProductRepo],
})
export class SaleModule {}
