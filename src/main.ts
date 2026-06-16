import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

dotenv.config();

// --- Persistent public/images papkasini project root-da yaratish ---
// dist ichida emas, project root/public/images
const rootPublicPath = path.join(__dirname, '..', '..', 'public'); // project root/public
const imagesFolderPath = path.join(rootPublicPath, 'images');

// Papkalar mavjudligini tekshirish va kerak bo'lsa yaratish
if (!fs.existsSync(rootPublicPath)) {
  fs.mkdirSync(rootPublicPath, { recursive: true });
  console.info('public folder created at project root.');
}

if (!fs.existsSync(imagesFolderPath)) {
  fs.mkdirSync(imagesFolderPath, { recursive: true });
  console.info('images folder created at project root.');
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();

  // Static assets: rasmlar va PDFlar shu papkadan xizmat qiladi
  app.useStaticAssets(join(process.cwd(), 'public', 'images'), {
    prefix: '/public/images',
  });

  const config = new DocumentBuilder()
    .setTitle('Scanner-POS API')
    .setDescription(
      [
        'REST API POS-системы: продажи, товары, долги, возвраты, аналитика.',
        '',
        '**Авторизация:** после `POST /auth/login` передавайте `Authorization: Bearer <token>`.',
        '',
        '**Пагинация:** `page` (от 1), `pageSize` (по умолчанию 10).',
        '',
        '**Загрузка файлов:** multipart/form-data, поле `images` или `image`.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addTag('Auth', 'Авторизация admin / cashier')
    .addTag('Cashier', 'CRUD кассиров')
    .addTag('Branch', 'Филиалы')
    .addTag('Product', 'Товары и изображения')
    .addTag('Category', 'Категории и изображения')
    .addTag('Sale', 'Продажи и отчёты')
    .addTag('Debt', 'Долги клиентов')
    .addTag('Customer', 'Клиенты')
    .addTag('Return', 'Возвраты товаров')
    .addTag('Main', 'Дашборд (legacy)')
    .addTag('Analytics', 'Аналитика и статистика')
    .addTag('Notification', 'Уведомления')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addServer('http://213.139.210.248:3017', 'Production')
    .addServer(`http://localhost:${process.env.PORT ?? 3017}`, 'Local')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(process.env.PORT, () => {
    console.log(`listened at http://localhost:${process.env.PORT}/swagger`);
  });
}
bootstrap();
