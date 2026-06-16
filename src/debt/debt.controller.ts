import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DebtService } from './debt.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { SelectAllDebtQueryDto } from './dto/select-all-debt.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Debt')
@Controller('debt')
export class DebtController {
  constructor(private readonly service: DebtService) {}

  @HttpCode(200)
  @Get('pending')
  @ApiOperation({
    summary: 'Непогашенные долги',
    description: 'Список активных (неоплаченных) долгов.',
  })
  @ApiOkResponse({ description: 'Массив pending-долгов' })
  @ApiStandardResponses()
  selectPendingCont() {
    return this.service.selectPending();
  }

  @HttpCode(200)
  @Get('oldest')
  @ApiOperation({
    summary: 'Самые старые долги',
    description: 'Долги, отсортированные по дате (сначала самые старые).',
  })
  @ApiOkResponse({ description: 'Массив старых долгов' })
  @ApiStandardResponses()
  selectOldest() {
    return this.service.selectOldest();
  }

  @HttpCode(201)
  @Put('update-all-amount/:customer_id')
  @ApiOperation({
    summary: 'Погасить все долги клиента',
    description: 'Отмечает все долги указанного клиента как оплаченные.',
  })
  @ApiParam({ name: 'customer_id', type: Number, example: 5 })
  @ApiCreatedResponse({ description: 'Результат массового погашения' })
  @ApiStandardResponses()
  amountAllDebtCont(@Param('customer_id') customer_id: number) {
    return this.service.amountAllDebt(customer_id);
  }

  @HttpCode(201)
  @Put('update-amount/:id')
  @ApiOperation({
    summary: 'Погасить один долг',
    description: 'Отмечает конкретный долг по id как оплаченный.',
  })
  @ApiParam({ name: 'id', type: Number, example: 12 })
  @ApiCreatedResponse({ description: 'Результат погашения долга' })
  @ApiStandardResponses()
  amountDebtCont(@Param('id') id: number) {
    return this.service.amountDebt(id);
  }

  @HttpCode(200)
  @Get('list')
  @ApiOperation({
    summary: 'Список всех долгов',
    description: 'Пагинированный список долгов.',
  })
  @ApiOkResponse({ description: 'Список долгов с пагинацией' })
  @ApiStandardResponses()
  selectAllDebtCont(@Query() query: SelectAllDebtQueryDto) {
    return this.service.selectAllDebt(query.page, query.pageSize);
  }

  @HttpCode(200)
  @Get('debt-history/:customer_id')
  @ApiOperation({
    summary: 'История долгов клиента',
    description: 'Все долги конкретного клиента по customer_id.',
  })
  @ApiParam({ name: 'customer_id', type: Number, example: 5 })
  @ApiOkResponse({ description: 'История долгов клиента' })
  @ApiStandardResponses()
  debtHIstoryByCustomerCont(@Param('customer_id') customer_id: number) {
    return this.service.debtHIstoryByCustomer(customer_id);
  }

  @HttpCode(200)
  @Get('recent')
  @ApiOperation({
    summary: 'Недавние долги',
    description: 'Последние оформленные долги.',
  })
  @ApiOkResponse({ description: 'Массив недавних долгов' })
  @ApiStandardResponses()
  selectRecentCont() {
    return this.service.selectRecent();
  }

  @HttpCode(200)
  @Get('search')
  @ApiOperation({ summary: 'Поиск долга по имени клиента' })
  @ApiQuery({ name: 'name', required: true, example: 'Ali', description: 'Имя клиента' })
  @ApiOkResponse({ description: 'Найденные долги' })
  @ApiStandardResponses()
  searchDebtCont(@Query('name') name: string) {
    return this.service.searchDebt(name);
  }

  @HttpCode(201)
  @Post('create')
  @ApiOperation({
    summary: 'Создать долг(и)',
    description: 'Принимает массив позиций долга (как продажа, но в долг).',
  })
  @ApiBody({ type: CreateDebtDto, isArray: true })
  @ApiCreatedResponse({ description: 'Созданные записи долга' })
  @ApiStandardResponses()
  createDebt(@Body() body: CreateDebtDto[]) {
    return this.service.createDebt(body);
  }
}
