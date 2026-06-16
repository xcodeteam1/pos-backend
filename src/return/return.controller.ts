import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ReturnService } from './return.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Return')
@Controller('return')
export class ReturnController {
  constructor(private readonly service: ReturnService) {}

  @HttpCode(200)
  @Get('all')
  @ApiOperation({
    summary: 'Список всех возвратов',
    description: 'Возвращает историю возвратов товаров.',
  })
  @ApiOkResponse({ description: 'Массив возвратов' })
  @ApiStandardResponses()
  selectAllReturnCont() {
    return this.service.selectAllReturn();
  }

  @HttpCode(201)
  @Post('create')
  @ApiOperation({
    summary: 'Оформить возврат',
    description:
      'Создаёт возврат товара. Опционально привязка к sale_id или debt_id.',
  })
  @ApiBody({ type: CreateReturnDto })
  @ApiCreatedResponse({ description: 'Созданный возврат' })
  @ApiStandardResponses()
  createReturnCont(@Body() body: CreateReturnDto) {
    return this.service.createReturn(body);
  }
}
