import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SearchSalesDto } from './dto/search-sale.dto';
import { NetProfitQueryDto } from './dto/net-profit.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { ProductStatsQueryDto } from 'src/analytics/dto/product-stats-query.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Sale')
@Controller('sale')
export class SaleController {
  constructor(
    private readonly service: SaleService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** @deprecated → /analytics/revenue (all_time). */
  @HttpCode(200)
  @Get('total-sales')
  @ApiOperation({
    summary: '[Deprecated] Общая выручка',
    description: 'Устарело. Используйте GET /analytics/revenue?period=all_time',
    deprecated: true,
  })
  @ApiOkResponse({ description: 'Общая сумма продаж' })
  @ApiStandardResponses()
  getTotalSales() {
    return this.analytics.getTotalSales();
  }

  /** @deprecated → /analytics/revenue?period=current_month. */
  @HttpCode(200)
  @Get('current-month-sales')
  @ApiOperation({
    summary: '[Deprecated] Продажи текущего месяца',
    description: 'Устарело. Используйте GET /analytics/revenue?period=current_month',
    deprecated: true,
  })
  @ApiOkResponse({ description: 'Сумма продаж за текущий месяц' })
  @ApiStandardResponses()
  getCurrentMonthSales() {
    return this.analytics.getCurrentMonthSales();
  }

  /** @deprecated → /analytics/products/stats. */
  @HttpCode(200)
  @Get('product-statistics')
  @ApiOperation({
    summary: '[Deprecated] Статистика товаров',
    description: 'Устарело. Используйте GET /analytics/products/stats',
    deprecated: true,
  })
  @ApiOkResponse({ description: 'Статистика по товарам' })
  @ApiStandardResponses()
  getProductStatistics(@Query() query: ProductStatsQueryDto) {
    return this.analytics.getProductStats(query.branch_id);
  }

  @HttpCode(200)
  @Get('daily')
  @ApiOperation({
    summary: 'Ежедневные продажи',
    description: 'Сводка продаж по кассирам за текущий день.',
  })
  @ApiOkResponse({ description: 'Ежедневная статистика продаж' })
  @ApiStandardResponses()
  selectAllProductCont() {
    return this.service.selectDailySale();
  }

  @HttpCode(200)
  @Get('search')
  @ApiOperation({
    summary: 'Поиск продаж',
    description:
      'Фильтры: q, branch_id, cashier_id, from, to, payment_type, page, pageSize.',
  })
  @ApiOkResponse({ description: 'Список продаж с пагинацией' })
  @ApiStandardResponses()
  search(@Query() query: SearchSalesDto) {
    return this.service.getSales(
      query.page,
      query.pageSize,
      query.q,
      query.branch_id,
      query.cashier_id,
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
      query.payment_type,
    );
  }

  @HttpCode(200)
  @Get('orders')
  @ApiOperation({
    summary: 'Список заказов (чеков)',
    description:
      'Заказы со временем, кассиром, суммой и числом позиций. Фильтры: period/from/to, branch_id, cashier_id, payment_type, page, pageSize.',
  })
  @ApiOkResponse({ description: 'Список заказов с пагинацией' })
  @ApiStandardResponses()
  getOrders(@Query() query: OrdersQueryDto) {
    return this.service.getOrders(query);
  }

  @HttpCode(200)
  @Get('orders/:receiptId')
  @ApiOperation({
    summary: 'Позиции заказа (чека)',
    description: 'Товары конкретного заказа по receipt_id + итоги.',
  })
  @ApiOkResponse({ description: 'Заказ с позициями' })
  @ApiStandardResponses()
  getOrderItems(@Param('receiptId') receiptId: string) {
    return this.service.getOrderItems(receiptId);
  }

  @HttpCode(200)
  @Get('net-profit')
  @ApiOperation({
    summary: 'Чистая прибыль (legacy)',
    description:
      'Расчёт прибыли по продажам. Для новой аналитики используйте GET /analytics/net-profit.',
  })
  @ApiOkResponse({ description: 'Чистая прибыль за период' })
  @ApiStandardResponses()
  getNetProfit(@Query() query: NetProfitQueryDto) {
    return this.service.getNetProfit(
      query.from,
      query.to,
      query.branch_id,
      query.cashier_id,
    );
  }

  @HttpCode(201)
  @Post('create')
  @ApiOperation({
    summary: 'Создать продажу',
    description:
      'Принимает массив позиций и payment_type (cash | terminal | online). Списывает stock.',
  })
  @ApiBody({ type: CreateSaleDto, isArray: true })
  @ApiCreatedResponse({ description: 'Созданные записи продажи' })
  @ApiStandardResponses()
  createProductCont(@Body() body: CreateSaleDto[]) {
    return this.service.createSale(body);
  }
}
