import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CreateCasheirDto } from './dto/create-cashier.dto';
import { UpdateCasheirDto } from './dto/update-cashier.dto';
import { LoginDto } from './dto/login.dto';
import { SelectAllCashierQueryDto } from './dto/select-all-cashier.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Auth')
@Controller('auth')
export class LoginController {
  constructor(private readonly service: AdminService) {}

  @HttpCode(200)
  @Post('login')
  @ApiOperation({
    summary: 'Авторизация',
    description:
      'Единый вход для admin и cashier. Возвращает JWT-токен и данные пользователя без пароля.',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Успешная авторизация',
    schema: {
      example: {
        user: { id: 1, name: 'Admin', login: 'admin1', role: 'admin' },
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiStandardResponses()
  allLoginCont(@Body() body: LoginDto) {
    return this.service.allLogin(body);
  }
}

@ApiTags('Cashier')
@Controller('cashier')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @HttpCode(200)
  @Get('list')
  @ApiOperation({
    summary: 'Список кассиров',
    description: 'Пагинированный список кассиров с опциональным поиском по имени.',
  })
  @ApiOkResponse({ description: 'Список кассиров с метаданными пагинации' })
  @ApiStandardResponses()
  selectAllCashierCont(@Query() query: SelectAllCashierQueryDto) {
    return this.service.selectAllCashier(query.page, query.pageSize, query.q);
  }

  @HttpCode(200)
  @Get('search-cashier')
  @ApiOperation({
    summary: 'Поиск кассира по имени',
    description: 'Возвращает кассиров, чьё имя содержит переданную строку.',
  })
  @ApiQuery({ name: 'name', required: true, example: 'Ali', description: 'Часть имени кассира' })
  @ApiOkResponse({ description: 'Массив найденных кассиров' })
  @ApiStandardResponses()
  searchCashierCont(@Query('name') name: string) {
    return this.service.searchCashier(name);
  }

  @HttpCode(200)
  @Get(':id')
  @ApiOperation({ summary: 'Кассир по ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Данные кассира' })
  @ApiStandardResponses()
  selectByIDCashierCont(@Param('id') id: number) {
    return this.service.selectByIDCashier(id);
  }

  @HttpCode(201)
  @Post('create')
  @ApiOperation({
    summary: 'Создать кассира',
    description: 'Требует существующий branch_id.',
  })
  @ApiBody({ type: CreateCasheirDto })
  @ApiCreatedResponse({ description: 'Созданный кассир' })
  @ApiStandardResponses()
  createCashierCont(@Body() body: CreateCasheirDto) {
    return this.service.createCashier(body);
  }

  @HttpCode(201)
  @Put('/update/:id')
  @ApiOperation({ summary: 'Обновить кассира' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateCasheirDto })
  @ApiCreatedResponse({ description: 'Обновлённые данные кассира' })
  @ApiStandardResponses()
  updateCashierCont(@Body() body: UpdateCasheirDto, @Param('id') id: number) {
    return this.service.updateCashier(id, body);
  }

  @HttpCode(200)
  @Delete('/delete/:id')
  @ApiOperation({ summary: 'Удалить кассира' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Результат удаления', schema: { example: 'succesfully deleting' } })
  @ApiStandardResponses()
  deleteCashierCont(@Param('id') id: number) {
    return this.service.deleteCashier(id);
  }
}
