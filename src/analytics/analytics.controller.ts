import { Controller, Get, HttpCode, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsQueryDto,
  DailyChartQueryDto,
  MonthlyChartQueryDto,
  SummaryQueryDto,
  TopProductsQueryDto,
} from './dto/analytics-query.dto';
import { ProductStatsQueryDto } from './dto/product-stats-query.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @HttpCode(200)
  @Get('summary')
  @ApiOperation({
    summary: 'Сводка today / current_month / all_time',
    description:
      'Фиксированные периоды без from/to. Фильтры: branch_id, cashier_id, payment_type, include_debt.',
  })
  @ApiOkResponse({
    description: 'Сводные показатели выручки и прибыли',
    schema: {
      example: {
        today: { revenue: 150000, net_profit: 45000 },
        current_month: { revenue: 3200000, net_profit: 980000 },
        all_time: { revenue: 12500000, net_profit: 4100000 },
      },
    },
  })
  @ApiStandardResponses()
  getSummary(@Query() query: SummaryQueryDto) {
    return this.service.getSummary(query);
  }

  @HttpCode(200)
  @Get('net-profit')
  @ApiOperation({
    summary: 'Чистая прибыль',
    description:
      'Расчёт net profit с фильтрами period/from/to, branch, cashier, payment_type, include_debt.',
  })
  @ApiOkResponse({ description: 'Чистая прибыль за период' })
  @ApiStandardResponses()
  getNetProfit(@Query() query: AnalyticsQueryDto) {
    return this.service.getNetProfit(query);
  }

  @HttpCode(200)
  @Get('revenue')
  @ApiOperation({
    summary: 'Выручка',
    description:
      'Выручка за период. period=all_time для общей суммы, current_month для текущего месяца.',
  })
  @ApiOkResponse({ description: 'Выручка за период' })
  @ApiStandardResponses()
  getRevenue(@Query() query: AnalyticsQueryDto) {
    return this.service.getRevenue(query);
  }

  @HttpCode(200)
  @Get('chart/monthly')
  @ApiOperation({
    summary: 'Ежемесячный график',
    description:
      'Точки графика по месяцам. metric: revenue | net_profit. months — глубина (по умолчанию 6).',
  })
  @ApiOkResponse({
    description: 'Массив точек { month, value }',
    schema: {
      example: [
        { month: '2025-12', value: 2800000 },
        { month: '2026-01', value: 3200000 },
      ],
    },
  })
  @ApiStandardResponses()
  getMonthlyChart(@Query() query: MonthlyChartQueryDto) {
    return this.service.getMonthlyChart(query);
  }

  @HttpCode(200)
  @Get('chart/daily')
  @ApiOperation({
    summary: 'Ежедневный график',
    description:
      'Точки графика по дням (для личного дашборда кассира). days — глубина (по умолчанию 14). Маржа не возвращается.',
  })
  @ApiOkResponse({
    description: 'Массив точек { date, label, revenue, units_sold, value }',
    schema: {
      example: [
        { date: '2026-06-14', label: '14.06', revenue: 120000, units_sold: 8, value: 120000 },
        { date: '2026-06-15', label: '15.06', revenue: 150000, units_sold: 11, value: 150000 },
      ],
    },
  })
  @ApiStandardResponses()
  getDailyChart(@Query() query: DailyChartQueryDto) {
    return this.service.getDailyChart(query);
  }

  @HttpCode(200)
  @Get('products/top')
  @ApiOperation({
    summary: 'Топ товаров за период',
    description:
      'Топ продаваемых товаров с фильтрами period/from/to, branch, cashier, payment_type. metric: revenue | units. Маржа не возвращается.',
  })
  @ApiOkResponse({
    description: 'Массив { barcode, name, units, revenue }',
    schema: {
      example: {
        data: [{ barcode: '4780001', name: 'Cola 0.5', units: 42, revenue: 210000 }],
      },
    },
  })
  @ApiStandardResponses()
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.service.getTopProducts(query);
  }

  @HttpCode(200)
  @Get('products/stats')
  @ApiOperation({
    summary: 'Статистика по товарам',
    description: 'Топ товаров, продажи, остатки. Опциональный фильтр branch_id.',
  })
  @ApiOkResponse({ description: 'Статистика по товарам' })
  @ApiStandardResponses()
  getProductStats(@Query() query: ProductStatsQueryDto) {
    return this.service.getProductStats(query.branch_id);
  }
}
