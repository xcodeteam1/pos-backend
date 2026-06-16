import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/** Стандартные ответы ошибок для всех эндпоинтов. */
export function ApiStandardResponses(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({ status: 400, description: 'Ошибка валидации параметров' }),
    ApiResponse({ status: 404, description: 'Ресурс не найден' }),
    ApiResponse({ status: 500, description: 'Внутренняя ошибка сервера' }),
  );
}
