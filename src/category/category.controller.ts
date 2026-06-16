import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  UseInterceptors,
  UploadedFiles,
  Patch,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { multerConfig } from 'src/common/middleware/multer.config';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PatchCategoryDto } from './dto/patch-category.dto';
import { GetCategoryDto } from './dto/get-category.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';

@ApiTags('Category')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @HttpCode(200)
  @Get('list')
  @ApiOperation({
    summary: 'Список категорий',
    description: 'Пагинация и поиск по name или id (q).',
  })
  @ApiOkResponse({ description: 'Список категорий' })
  @ApiStandardResponses()
  async getAllCategories(@Query() query: GetCategoryDto) {
    return this.categoryService.getCategories(
      query.page,
      query.pageSize,
      query.q,
    );
  }

  @HttpCode(200)
  @Get(':id')
  @ApiOperation({ summary: 'Категория по ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Данные категории' })
  @ApiStandardResponses()
  async getCategoryById(@Param('id', ParseIntPipe) id: number) {
    return await this.categoryService.selectByIDCategory(id);
  }

  @HttpCode(201)
  @Post('create')
  @UseInterceptors(FilesInterceptor('images', 10, multerConfig))
  @ApiOperation({
    summary: 'Создать категорию',
    description: 'multipart/form-data с опциональными изображениями.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Electronics' },
        description: { type: 'string', example: 'Electronic devices' },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Созданная категория' })
  @ApiStandardResponses()
  async createCategory(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateCategoryDto,
  ) {
    const imageUrls = [
      ...(Array.isArray(files)
        ? files.map((file) => `${process.env.BACKEND_URL}/${file?.filename}`)
        : []),
      ...(dto.imageUrls || []),
    ];

    return await this.categoryService.createCategory(
      dto.name,
      dto.description,
      imageUrls,
    );
  }

  @HttpCode(200)
  @Put('/update/:id')
  @UseInterceptors(FilesInterceptor('images', 10, multerConfig))
  @ApiOperation({
    summary: 'Обновить категорию',
    description: 'Можно загрузить новые images и передать существующие imageUrls.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        imageUrls: {
          type: 'array',
          items: { type: 'string' },
          example: ['http://localhost:3017/public/images/old.png'],
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Обновлённая категория' })
  @ApiStandardResponses()
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() images: Express.Multer.File[],
    @Body() dto: UpdateCategoryDto,
  ) {
    const uploadedImages = Array.isArray(images)
      ? images.map((file) => `${process.env.BACKEND_URL}/${file?.filename}`)
      : [];

    const existingImages = dto.imageUrls || [];

    const finalImageUrls =
      uploadedImages.length > 0 || existingImages.length > 0
        ? [...uploadedImages, ...existingImages]
        : undefined;

    const updateData: Record<string, unknown> = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.description) updateData.description = dto.description;
    if (finalImageUrls) updateData.imageUrls = finalImageUrls;

    return await this.categoryService.updateCategory(id, updateData);
  }

  @Put('images/add/:id')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('images', 10, multerConfig))
  @ApiOperation({ summary: 'Добавить изображения к категории' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Категория с новыми изображениями' })
  @ApiStandardResponses()
  async addCategoryImages(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Images are required');
    }

    const imageUrls = files.map(
      (file) => `${process.env.BACKEND_URL}/${file.filename}`,
    );

    return this.categoryService.addCategoryImages(id, imageUrls);
  }

  @Put('images/delete/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Удалить изображения категории по URL' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['removeImages'],
      properties: {
        removeImages: {
          type: 'array',
          items: { type: 'string' },
          example: ['http://backend/image1.jpg'],
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Категория после удаления изображений' })
  @ApiStandardResponses()
  async deleteCategoryImages(
    @Param('id', ParseIntPipe) id: number,
    @Body('removeImages') removeImages: string[] | string,
  ) {
    const imagesToRemove = Array.isArray(removeImages)
      ? removeImages
      : removeImages
        ? [removeImages]
        : [];

    if (!imagesToRemove.length) {
      throw new BadRequestException('removeImages is required');
    }

    return this.categoryService.deleteCategoryImages(id, imagesToRemove);
  }

  @Put('image/replace/:id')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('image', 1, multerConfig))
  @ApiOperation({
    summary: 'Заменить одно изображение категории',
    description: 'Передаётся oldImage (URL) и новый файл image.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['oldImage', 'image'],
      properties: {
        oldImage: { type: 'string', example: 'http://backend/old-image.jpg' },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ description: 'Категория с заменённым изображением' })
  @ApiStandardResponses()
  async replaceCategoryImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('oldImage') oldImage: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('New image is required');
    }

    if (!oldImage) {
      throw new BadRequestException('oldImage is required');
    }

    const newImage = `${process.env.BACKEND_URL}/${files[0].filename}`;

    return this.categoryService.replaceCategoryImage(id, oldImage, newImage);
  }

  @HttpCode(200)
  @Patch(':id')
  @ApiOperation({
    summary: 'Частичное обновление категории',
    description: 'PATCH name и/или description без загрузки файлов.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Обновлённая категория' })
  @ApiStandardResponses()
  async patchCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PatchCategoryDto,
  ) {
    return await this.categoryService.patchCategory(
      id,
      dto.name,
      dto.description,
    );
  }

  @HttpCode(200)
  @Delete('/delete/:id')
  @ApiOperation({ summary: 'Удалить категорию' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ description: 'Результат удаления' })
  @ApiStandardResponses()
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return await this.categoryService.deleteCategory(id);
  }
}
