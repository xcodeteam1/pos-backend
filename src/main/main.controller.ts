import { Controller, Get, HttpCode } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MainService } from './main.service';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Main')
@Controller('main')
export class MainController {
  constructor(private readonly service: MainService) {}

  @HttpCode(200)
  @Get('product')
  @ApiOperation({
    summary: 'Статистика товаров (дашборд)',
    description: 'Legacy-эндпоинт для AdminDashboard: общая статистика по товарам.',
  })
  @ApiOkResponse({ description: 'Агрегированная статистика товаров' })
  @ApiStandardResponses()
  selectProductMainCont() {
    return this.service.selectProductMain();
  }

  @HttpCode(200)
  @Get('six-month')
  @ApiOperation({
    summary: 'Продажи за 6 месяцев',
    description: 'Legacy-график продаж за последние 6 месяцев для дашборда.',
  })
  @ApiOkResponse({ description: 'Данные для графика продаж по месяцам' })
  @ApiStandardResponses()
  selectSixMothCont() {
    return this.service.selectSixMoth();
  }

  @HttpCode(200)
  @Get('diagram')
  @ApiOperation({
    summary: 'Диаграмма товаров',
    description: 'Legacy-данные для круговой диаграммы категорий/товаров.',
  })
  @ApiOkResponse({ description: 'Данные для диаграммы' })
  @ApiStandardResponses()
  selectDiagramCont() {
    return this.service.selectDiagram();
  }
}
