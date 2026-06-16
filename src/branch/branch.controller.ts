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
import { BranchService } from './branch.service';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { SelectAllBranchQueryDto } from './dto/select-all-branch.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Branch')
@Controller('branch')
export class BranchController {
  constructor(private readonly service: BranchService) {}

  @HttpCode(200)
  @Get('list')
  @ApiOperation({
    summary: 'Список филиалов',
    description: 'Пагинированный список с опциональным поиском.',
  })
  @ApiOkResponse({ description: 'Список филиалов' })
  @ApiStandardResponses()
  selectAllBranchCont(@Query() query: SelectAllBranchQueryDto) {
    return this.service.selectAllBranch(query.page, query.pageSize, query.q);
  }

  @HttpCode(200)
  @Get('search')
  @ApiOperation({ summary: 'Поиск филиала по названию' })
  @ApiQuery({ name: 'name', required: true, example: 'Tashkent', description: 'Часть названия филиала' })
  @ApiOkResponse({ description: 'Найденные филиалы' })
  @ApiStandardResponses()
  searchBranchCont(@Query('name') name: string) {
    return this.service.searchBranch(name);
  }

  @HttpCode(200)
  @Get(':id')
  @ApiOperation({ summary: 'Филиал по ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Данные филиала' })
  @ApiStandardResponses()
  selectByIDBranchCont(@Param('id') id: number) {
    return this.service.selectByIDBranch(id);
  }

  @HttpCode(201)
  @Post('create')
  @ApiOperation({ summary: 'Создать филиал' })
  @ApiBody({ type: CreateBranchDto })
  @ApiCreatedResponse({ description: 'Созданный филиал' })
  @ApiStandardResponses()
  createBranchCont(@Body() body: CreateBranchDto) {
    return this.service.createBranch(body);
  }

  @HttpCode(201)
  @Put('/update/:id')
  @ApiOperation({ summary: 'Обновить филиал' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateBranchDto })
  @ApiCreatedResponse({ description: 'Обновлённый филиал' })
  @ApiStandardResponses()
  updateBranchCont(@Body() body: UpdateBranchDto, @Param('id') id: number) {
    return this.service.updateBranch(id, body);
  }

  @HttpCode(200)
  @Delete('/delete/:id')
  @ApiOperation({ summary: 'Удалить филиал' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Результат удаления' })
  @ApiStandardResponses()
  deleteBranchCont(@Param('id') id: number) {
    return this.service.deleteBranch(id);
  }
}
