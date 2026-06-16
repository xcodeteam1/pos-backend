import * as dotenv from 'dotenv';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { multerConfig } from 'src/common/middleware/multer.config';
import { SelectAllProductQueryDto } from './dto/select-all-product.dto';
import { ApiStandardResponses } from 'src/common/swagger/api-responses';
dotenv.config();

@ApiTags('Product')
@Controller('product')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get('list')
  @ApiOperation({
    summary: 'Список товаров',
    description:
      'Пагинация и фильтры: q, tegs, category_id, min_price, max_price.',
  })
  @ApiOkResponse({ description: 'Список товаров с пагинацией' })
  @ApiStandardResponses()
  selectAllProductCont(@Query() query: SelectAllProductQueryDto) {
    return this.service.selectAllProduct(
      Number(query.page),
      Number(query.pageSize),
      query.q,
      query.tegs,
      query.category_id,
      query.min_price,
      query.max_price,
    );
  }

  @HttpCode(200)
  @Get('search')
  @ApiOperation({ summary: 'Быстрый поиск товара' })
  @ApiQuery({ name: 'q', required: true, example: 'olma', description: 'Штрихкод или название' })
  @ApiOkResponse({ description: 'Найденные товары' })
  @ApiStandardResponses()
  searchProductCont(@Query('q') q: string) {
    return this.service.searchProduct(q);
  }

  @HttpCode(200)
  @Get(':barcode')
  @ApiOperation({ summary: 'Товар по штрихкоду' })
  @ApiParam({ name: 'barcode', example: '123456789', description: 'Уникальный штрихкод' })
  @ApiOkResponse({ description: 'Данные товара' })
  @ApiStandardResponses()
  selectByIDProductCont(@Param('barcode') barcode: string) {
    return this.service.selectByIDProduct(barcode);
  }

  @HttpCode(201)
  @Post('create')
  @UseInterceptors(FilesInterceptor('images', 10, multerConfig))
  @ApiOperation({
    summary: 'Создать товар',
    description: 'multipart/form-data. Обязательны barcode, name, branch_id, category_id.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['barcode', 'name', 'branch_id', 'category_id'],
      properties: {
        barcode: { type: 'string', example: '123456789' },
        name: { type: 'string', example: 'Laptop' },
        branch_id: { type: 'number', example: 1 },
        category_id: { type: 'number', example: 2 },
        price: { type: 'number', example: 1500 },
        real_price: { type: 'number', example: 1400 },
        stock: { type: 'number', example: 10 },
        description: { type: 'string' },
        tegs: {
          type: 'array',
          items: { type: 'string', enum: ['new', 'hit', 'sale'] },
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Созданный товар' })
  @ApiStandardResponses()
  async createProductCont(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: CreateProductDto,
  ) {
    const imageUrls = Array.isArray(files)
      ? files.map((file) => `${process.env.BACKEND_URL}/${file?.filename}`)
      : [];
    return this.service.createProduct({ ...body, imageUrls });
  }

  @HttpCode(200)
  @Put('/update/:barcode')
  @ApiOperation({ summary: 'Обновить товар (JSON)' })
  @ApiParam({ name: 'barcode', example: '123456789' })
  @ApiConsumes('application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Product name' },
        branch_id: { type: 'number', example: 1 },
        category_id: { type: 'number', example: 2 },
        price: { type: 'number', example: 12000 },
        stock: { type: 'number', example: 5 },
        real_price: { type: 'number', example: 10000 },
        description: { type: 'string', example: 'Some description' },
        tegs: {
          type: 'array',
          items: { type: 'string', enum: ['new', 'hit', 'sale'] },
          example: ['new'],
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Обновлённый товар' })
  @ApiStandardResponses()
  async updateProduct(
    @Param('barcode') barcode: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.service.updateProduct(barcode, body);
  }

  @Put('image/replace/:barcode')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('image', 1, multerConfig))
  @ApiOperation({
    summary: 'Заменить одно изображение товара',
    description: 'Передаётся oldImage (URL) и новый файл image.',
  })
  @ApiParam({ name: 'barcode', example: '123456789' })
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
  @ApiOkResponse({ description: 'Товар с обновлённым изображением' })
  @ApiStandardResponses()
  async replaceProductImage(
    @Param('barcode') barcode: string,
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

    return this.service.replaceProductImage(barcode, oldImage, newImage);
  }

  @Put('images/add/:barcode')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('images', 10, multerConfig))
  @ApiOperation({ summary: 'Добавить изображения к товару' })
  @ApiParam({ name: 'barcode', example: '123456789' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['images'],
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Товар с новыми изображениями' })
  @ApiStandardResponses()
  async addProductImages(
    @Param('barcode') barcode: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Images are required');
    }

    const imageUrls = files.map(
      (file) => `${process.env.BACKEND_URL}/${file.filename}`,
    );

    return this.service.addProductImages(barcode, imageUrls);
  }

  @Put('images/delete/:barcode')
  @HttpCode(200)
  @ApiOperation({ summary: 'Удалить изображения товара по URL' })
  @ApiParam({ name: 'barcode', example: '123456789' })
  @ApiConsumes('application/json')
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
  @ApiOkResponse({ description: 'Товар после удаления изображений' })
  @ApiStandardResponses()
  async deleteProductImages(
    @Param('barcode') barcode: string,
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

    return this.service.deleteProductImages(barcode, imagesToRemove);
  }

  @HttpCode(200)
  @Delete('/delete/:barcode')
  @ApiOperation({ summary: 'Удалить товар' })
  @ApiParam({ name: 'barcode', example: '123456789' })
  @ApiOkResponse({ description: 'Результат удаления' })
  @ApiStandardResponses()
  deleteProductCont(@Param('barcode') barcode: string) {
    return this.service.deleteProduct(barcode);
  }
}
