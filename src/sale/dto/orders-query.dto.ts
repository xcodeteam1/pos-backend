import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { AnalyticsPeriod } from 'src/analytics/dto/analytics-period.enum';

const PAYMENT_TYPES = ['cash', 'terminal', 'online'] as const;
type PaymentType = (typeof PAYMENT_TYPES)[number];

/** Фильтры списка заказов (чеков). Период резолвится через analytics.period. */
export class OrdersQueryDto {
  @ApiPropertyOptional({ enum: AnalyticsPeriod })
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branch_id?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cashier_id?: number;

  @ApiPropertyOptional({ enum: PAYMENT_TYPES })
  @IsOptional()
  @IsEnum(PAYMENT_TYPES)
  payment_type?: PaymentType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize: number = 10;
}
