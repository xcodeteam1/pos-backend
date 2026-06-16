import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  HttpCode,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SelectAllNotificationQueryDto } from './dto/select-all-notification.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Notification')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('/list')
  @ApiOperation({
    summary: 'Список уведомлений',
    description: 'Пагинированный список уведомлений.',
  })
  @ApiOkResponse({ description: 'Список уведомлений' })
  @ApiStandardResponses()
  async findAll(@Query() query: SelectAllNotificationQueryDto) {
    return await this.notificationService.findAll(query.page, query.pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Уведомление по ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Данные уведомления' })
  @ApiStandardResponses()
  findOne(@Param('id') id: string) {
    return this.notificationService.findOne(+id);
  }

  @HttpCode(201)
  @Post('/create')
  @ApiOperation({ summary: 'Создать уведомление' })
  @ApiBody({ type: CreateNotificationDto })
  @ApiCreatedResponse({ description: 'Созданное уведомление' })
  @ApiStandardResponses()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationService.create(createNotificationDto);
  }

  @HttpCode(200)
  @Put('/update/:id')
  @ApiOperation({ summary: 'Обновить уведомление' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateNotificationDto })
  @ApiOkResponse({ description: 'Обновлённое уведомление' })
  @ApiStandardResponses()
  update(
    @Param('id') id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
  ) {
    return this.notificationService.update(+id, updateNotificationDto);
  }

  @HttpCode(200)
  @Delete('/delete/:id')
  @ApiOperation({ summary: 'Удалить уведомление' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Результат удаления' })
  @ApiStandardResponses()
  remove(@Param('id') id: string) {
    return this.notificationService.remove(+id);
  }
}
