import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { BranchModule } from './branch/branch.module';
import { CashierModule } from './cashier/cashier.module';
import { ProductModule } from './product/product.module';
import { SaleModule } from './sale/sale.module';
import { DebtModule } from './debt/debt.module';
import { ReturnModule } from './return/return.module';
import { CustomerModule } from './customer/customer.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MulterModule } from '@nestjs/platform-express';
import { multerConfig } from './common/middleware/multer.config';
import { MainModule } from './main/main.module';
import { CategoryModule } from './category/category.module';
import { NotificationModule } from './notification/notification.module';
import { DatabaseModule } from './database/database.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    DatabaseModule,
    AnalyticsModule,
    AdminModule,
    BranchModule,
    CashierModule,
    ProductModule,
    SaleModule,
    DebtModule,
    ReturnModule,
    CustomerModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    MulterModule.register(multerConfig),
    MainModule,
    CategoryModule,
    NotificationModule,
  ],
})
export class AppModule {}
