import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { AnalyticsPeriod } from './analytics-period.enum';

const PAYMENT_TYPES = ['cash', 'terminal', 'online'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/** Преобразование строкового query-флага в boolean (default true). */
const toBoolean = ({ value }: { value: unknown }): boolean => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no'].includes(String(value).toLowerCase());
};

/** Базовый набор фильтров аналитики (ANALYTICS_IMPROVEMENT_TZ.md §4). */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: AnalyticsPeriod })
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'YYYY-MM-DD или ISO' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'YYYY-MM-DD или ISO' })
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

  @ApiPropertyOptional({ default: true, description: 'Учитывать долги в выручке/прибыли' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_debt: boolean = true;
}

/** Сводка today/current_month/all_time (§FR-3). Период фиксирован, дат не принимает. */
export class SummaryQueryDto {
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_debt: boolean = true;
}

export enum ChartMetric {
  REVENUE = 'revenue',
  NET_PROFIT = 'net_profit',
}

/** Ежемесячный график (§FR-5). */
export class MonthlyChartQueryDto {
  @ApiPropertyOptional({ default: 6, description: 'Глубина в месяцах' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  months: number = 6;

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

  @ApiPropertyOptional({ enum: ChartMetric, default: ChartMetric.REVENUE })
  @IsOptional()
  @IsEnum(ChartMetric)
  metric: ChartMetric = ChartMetric.REVENUE;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_debt: boolean = true;

  @ApiPropertyOptional({ default: true, description: 'Включать текущий месяц' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_current_month: boolean = true;
}

/** Ежедневный график (личный дашборд кассира). Маржа не возвращается. */
export class DailyChartQueryDto {
  @ApiPropertyOptional({ default: 14, description: 'Глубина в днях' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days: number = 14;

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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_debt: boolean = true;
}

export enum TopProductsMetric {
  REVENUE = 'revenue',
  UNITS = 'units',
}

/** Топ товаров за период (личный дашборд кассира). */
export class TopProductsQueryDto {
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_debt: boolean = true;

  @ApiPropertyOptional({ default: 5, description: 'Сколько позиций вернуть' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 5;

  @ApiPropertyOptional({ enum: TopProductsMetric, default: TopProductsMetric.REVENUE })
  @IsOptional()
  @IsEnum(TopProductsMetric)
  metric: TopProductsMetric = TopProductsMetric.REVENUE;
}
