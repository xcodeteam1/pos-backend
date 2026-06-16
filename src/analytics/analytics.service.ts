import { Injectable } from '@nestjs/common';
import {
  AnalyticsFilters,
  AnalyticsRepository,
  CashierAggregate,
  ProductStats,
  TopProduct,
} from './analytics.repository';
import {
  AnalyticsQueryDto,
  ChartMetric,
  DailyChartQueryDto,
  MonthlyChartQueryDto,
  PaymentType,
  SummaryQueryDto,
  TopProductsQueryDto,
} from './dto/analytics-query.dto';
import {
  DateRange,
  dayBucket,
  monthBucket,
  resolveRange,
  todayRange,
  currentMonthRange,
} from './analytics.period';

interface BaseFilters {
  branch_id?: number;
  cashier_id?: number;
  payment_type?: PaymentType;
}

export interface PeriodMetrics {
  revenue: number;
  net_profit: number;
  units_sold: number;
  orders_count: number;
}

export interface PeriodBreakdown extends PeriodMetrics {
  breakdown: {
    revenue_from_sales: number;
    revenue_from_debts: number;
    net_profit_from_sales: number;
    net_profit_from_debts: number;
    returns_revenue: number;
    returns_net_profit: number;
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  /**
   * Долг не имеет payment_type, поэтому при фильтре по типу оплаты
   * долги из выручки/прибыли исключаются (§3.1).
   */
  private effectiveIncludeDebt(includeDebt: boolean, paymentType?: PaymentType): boolean {
    return includeDebt && !paymentType;
  }

  private buildFilters(range: DateRange, base: BaseFilters): AnalyticsFilters {
    return {
      from: range.from,
      to: range.to,
      branch_id: base.branch_id,
      cashier_id: base.cashier_id,
      payment_type: base.payment_type,
    };
  }

  private async computeBreakdown(
    filters: AnalyticsFilters,
    includeDebt: boolean,
  ): Promise<PeriodBreakdown> {
    const [sales, debt, ret] = await Promise.all([
      this.repo.salesAggregate(filters),
      includeDebt
        ? this.repo.debtAggregate(filters)
        : Promise.resolve({ revenue: 0, net_profit: 0, units: 0 }),
      this.repo.returnAggregate(filters),
    ]);

    return {
      revenue: round2(sales.revenue + debt.revenue - ret.revenue),
      net_profit: round2(sales.net_profit + debt.net_profit - ret.net_profit),
      units_sold: sales.units + debt.units - ret.units,
      orders_count: sales.orders,
      breakdown: {
        revenue_from_sales: round2(sales.revenue),
        revenue_from_debts: round2(debt.revenue),
        net_profit_from_sales: round2(sales.net_profit),
        net_profit_from_debts: round2(debt.net_profit),
        returns_revenue: round2(ret.revenue),
        returns_net_profit: round2(ret.net_profit),
      },
    };
  }

  private async periodMetrics(
    range: DateRange,
    base: BaseFilters,
    includeDebt: boolean,
  ): Promise<PeriodMetrics> {
    const filters = this.buildFilters(range, base);
    const eff = this.effectiveIncludeDebt(includeDebt, base.payment_type);
    const data = await this.computeBreakdown(filters, eff);
    return {
      revenue: data.revenue,
      net_profit: data.net_profit,
      units_sold: data.units_sold,
      orders_count: data.orders_count,
    };
  }

  private mapCashier(rows: CashierAggregate[]) {
    return rows.map((r) => ({
      cashier_id: r.cashier_id,
      cashier_name: r.cashier_name,
      revenue: round2(r.revenue),
      net_profit: round2(r.net_profit),
      orders_count: r.orders,
    }));
  }

  /** FR-3: сводка today + current_month + all_time. */
  async getSummary(dto: SummaryQueryDto) {
    const base: BaseFilters = {
      branch_id: dto.branch_id,
      cashier_id: dto.cashier_id,
      payment_type: dto.payment_type,
    };

    const today = todayRange();
    const month = currentMonthRange();
    const prevMonth = monthBucket(1);

    const [
      todayMetrics,
      todayCashiers,
      monthMetrics,
      monthCashiers,
      allMetrics,
      allCashiers,
      prevMonthMetrics,
    ] = await Promise.all([
      this.periodMetrics(today, base, dto.include_debt),
      this.repo.salesByCashier(this.buildFilters(today, base)),
      this.periodMetrics(month, base, dto.include_debt),
      this.repo.salesByCashier(this.buildFilters(month, base)),
      this.periodMetrics({}, base, dto.include_debt),
      this.repo.salesByCashier(this.buildFilters({}, base)),
      this.periodMetrics(prevMonth, base, dto.include_debt),
    ]);

    const vsPrev =
      prevMonthMetrics.revenue > 0
        ? round2(
            ((monthMetrics.revenue - prevMonthMetrics.revenue) /
              prevMonthMetrics.revenue) *
              100,
          )
        : null;

    return {
      today: { ...todayMetrics, by_cashier: this.mapCashier(todayCashiers) },
      current_month: {
        ...monthMetrics,
        vs_previous_month_percent: vsPrev,
        by_cashier: this.mapCashier(monthCashiers),
      },
      all_time: { ...allMetrics, by_cashier: this.mapCashier(allCashiers) },
    };
  }

  /** FR-6: чистая прибыль с разбивкой. */
  async getNetProfit(dto: AnalyticsQueryDto) {
    const range = resolveRange(dto.period, dto.from, dto.to);
    const filters = this.buildFilters(range, dto);
    const eff = this.effectiveIncludeDebt(dto.include_debt, dto.payment_type);
    const data = await this.computeBreakdown(filters, eff);

    return {
      net_profit: data.net_profit,
      breakdown: {
        from_sales: data.breakdown.net_profit_from_sales,
        from_debts: data.breakdown.net_profit_from_debts,
        from_returns: -data.breakdown.returns_net_profit,
      },
    };
  }

  /** FR-7: общая продажа (выручка) с разбивкой. */
  async getRevenue(dto: AnalyticsQueryDto) {
    const range = resolveRange(dto.period, dto.from, dto.to);
    const filters = this.buildFilters(range, dto);
    const eff = this.effectiveIncludeDebt(dto.include_debt, dto.payment_type);
    const data = await this.computeBreakdown(filters, eff);

    return {
      revenue: data.revenue,
      revenue_from_sales: data.breakdown.revenue_from_sales,
      revenue_from_debts: data.breakdown.revenue_from_debts,
      returns_deducted: data.breakdown.returns_revenue,
      revenue_net: data.revenue,
    };
  }

  /** FR-5: ежемесячный график. */
  async getMonthlyChart(dto: MonthlyChartQueryDto) {
    const base: BaseFilters = {
      branch_id: dto.branch_id,
      cashier_id: dto.cashier_id,
    };
    const eff = this.effectiveIncludeDebt(dto.include_debt, undefined);

    // самый старый месяц = months-1 назад; текущий месяц включается по флагу
    const startOffset = dto.include_current_month ? dto.months - 1 : dto.months;
    const endOffset = dto.include_current_month ? 0 : 1;

    const offsets: number[] = [];
    for (let o = startOffset; o >= endOffset; o--) offsets.push(o);

    const data = await Promise.all(
      offsets.map(async (offset) => {
        const bucket = monthBucket(offset);
        const metrics = await this.computeBreakdown(
          this.buildFilters({ from: bucket.from, to: bucket.to }, base),
          eff,
        );
        const value =
          dto.metric === ChartMetric.NET_PROFIT
            ? metrics.net_profit
            : metrics.revenue;
        return {
          year: bucket.year,
          month: bucket.month,
          label: bucket.label,
          revenue: metrics.revenue,
          net_profit: metrics.net_profit,
          units_sold: metrics.units_sold,
          value,
        };
      }),
    );

    return { metric: dto.metric, data };
  }

  /** Ежедневный график (личный дашборд кассира). Без маржи. */
  async getDailyChart(dto: DailyChartQueryDto) {
    const base: BaseFilters = {
      branch_id: dto.branch_id,
      cashier_id: dto.cashier_id,
      payment_type: dto.payment_type,
    };
    const eff = this.effectiveIncludeDebt(dto.include_debt, dto.payment_type);

    const offsets: number[] = [];
    for (let o = dto.days - 1; o >= 0; o--) offsets.push(o);

    const data = await Promise.all(
      offsets.map(async (offset) => {
        const bucket = dayBucket(offset);
        const metrics = await this.computeBreakdown(
          this.buildFilters({ from: bucket.from, to: bucket.to }, base),
          eff,
        );
        return {
          date: bucket.date,
          label: bucket.label,
          revenue: metrics.revenue,
          units_sold: metrics.units_sold,
          orders_count: metrics.orders_count,
          value: metrics.revenue,
        };
      }),
    );

    return { metric: 'revenue' as const, data };
  }

  /** Топ товаров за период (личный дашборд кассира). Без маржи. */
  async getTopProducts(dto: TopProductsQueryDto): Promise<{ data: TopProduct[] }> {
    const range = resolveRange(dto.period, dto.from, dto.to);
    const filters = this.buildFilters(range, dto);
    const eff = this.effectiveIncludeDebt(dto.include_debt, dto.payment_type);
    const rows = await this.repo.topProducts(filters, dto.limit, dto.metric, eff);
    return {
      data: rows.map((r) => ({
        barcode: r.barcode,
        name: r.name,
        units: r.units,
        revenue: round2(r.revenue),
      })),
    };
  }

  /** §9.1: статистика по товарам (замена /sale/product-statistics). */
  async getProductStats(branch_id?: number): Promise<ProductStats> {
    return this.repo.productStats(branch_id);
  }

  // ---- Совместимость со старым фронтом (§5.2, deprecated wrappers) ----

  /** Заменяет несуществующий ранее /sale/total-sales. */
  async getTotalSales(): Promise<{ total_sales: number }> {
    const data = await this.computeBreakdown({}, true);
    return { total_sales: data.revenue };
  }

  /** Заменяет несуществующий ранее /sale/current-month-sales. */
  async getCurrentMonthSales(): Promise<{ current_month_sales: number }> {
    const data = await this.computeBreakdown(
      this.buildFilters(currentMonthRange(), {}),
      true,
    );
    return { current_month_sales: data.revenue };
  }
}
