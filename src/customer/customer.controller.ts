import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { GetCustomerDto } from './dto/get-costumer.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Customer')
@Controller('customer')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @HttpCode(200)
  @Get('list')
  @ApiOperation({
    summary: 'Список клиентов',
    description: 'Пагинированный список с опциональным поиском по имени или телефону.',
  })
  @ApiOkResponse({ description: 'Список клиентов' })
  @ApiStandardResponses()
  selectAllProductCont(@Query() query: GetCustomerDto) {
    return this.service.getCustomers(query.page, query.pageSize, query.q);
  }

  @HttpCode(200)
  @Get('search')
  @ApiOperation({ summary: 'Поиск клиента по имени' })
  @ApiQuery({ name: 'name', required: true, example: 'Ali', description: 'Часть имени клиента' })
  @ApiOkResponse({ description: 'Найденные клиенты' })
  @ApiStandardResponses()
  searchProductCont(@Query('name') name: string) {
    return this.service.searchCustomer(name);
  }

  @HttpCode(201)
  @Post('create')
  @ApiOperation({ summary: 'Создать клиента' })
  @ApiBody({ type: CreateCustomerDto })
  @ApiCreatedResponse({ description: 'Созданный клиент' })
  @ApiStandardResponses()
  createProductCont(@Body() body: CreateCustomerDto) {
    return this.service.createCustomer(body);
  }
}
