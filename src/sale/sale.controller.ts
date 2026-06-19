import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SaleService } from './sale.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SearchSalesDto } from './dto/search-sale.dto';
import { NetProfitQueryDto } from './dto/net-profit.dto';

@ApiTags('Sale')
@Controller('sale')
export class SaleController {
  constructor(private readonly service: SaleService) {}

  @HttpCode(200)
  @Get('daily')
  selectAllProductCont() {
    return this.service.selectDailySale();
  }

  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'branch_id', required: false })
  @ApiQuery({ name: 'cashier_id', required: false })
  @ApiQuery({
    name: 'from',
    required: false,
    type: Date,
    example: '2024-01-20',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: Date,
    example: '2026-01-20',
  })
  @Get('search')
  @ApiQuery({ name: 'q', required: false, description: 'Qidiruv matni' })
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
  @Get('net-profit')
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
  @ApiBody({ type: CreateSaleDto, isArray: true })
  createProductCont(@Body() body: CreateSaleDto[]) {
    return this.service.createSale(body);
  }


    @HttpCode(200)
  @Get('total-sales')
  @ApiOperation({ summary: 'Umumiy jami sotuv summasi' })
  getTotalSales() {
    return this.service.getTotalSales();
  }

  // 2. Bu oydagi umumiy jami sotuv summasi
  @HttpCode(200)
  @Get('current-month-sales')
  @ApiOperation({ summary: 'Bu oydagi umumiy jami sotuv summasi' })
  getCurrentMonthSales() {
    return this.service.getCurrentMonthSales();
  }

  // 3. To'liq sotuv statistikasi
  @HttpCode(200)
  @Get('statistics')
  @ApiOperation({ summary: 'To\'liq sotuv statistikasi (qarz va qaytarilganlar bilan)' })
  getSalesStatistics() {
    return this.service.getSalesStatistics();
  }

  // 4. Mahsulotlar statistikasi
  @HttpCode(200)
  @Get('product-statistics')
  @ApiOperation({ summary: 'Umumiy va yangi mahsulotlar statistikasi' })
  getProductStatistics() {
    return this.service.getProductStatistics();
  }
}
