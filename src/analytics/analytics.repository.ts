import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { PaymentType } from './dto/analytics-query.dto';

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  branch_id?: number;
  cashier_id?: number;
  payment_type?: PaymentType;
}

export interface SourceAggregate {
  revenue: number;
  net_profit: number;
  units: number;
  orders: number;
}

export interface CashierAggregate {
  cashier_id: number | null;
  cashier_name: string | null;
  branch_id: number | null;
  branch_name: string | null;
  revenue: number;
  net_profit: number;
  units: number;
  orders: number;
}

export interface ProductStats {
  total_products: number;
  new_products: number;
  low_stock: number;
  out_of_stock: number;
}

export interface TopProduct {
  barcode: string;
  name: string | null;
  units: number;
  revenue: number;
}

/** Порог "низкого остатка" для product-stats (§9.1). */
const LOW_STOCK_THRESHOLD = 5;

const num = (v: unknown): number => Number(v ?? 0);

type Binding = string | number;

/**
 * Единый слой аналитических запросов (ANALYTICS_IMPROVEMENT_TZ.md §3, §5.1).
 *
 * Формулы (общие для всех эндпоинтов, чтобы цифры сходились):
 *   revenue     = Σ (price × quantity)                       [sale]
 *               = Σ debt_amount                              [debt]
 *   net_profit  = Σ (sale_price − real_price) × quantity
 *   real_price  = COALESCE(real_price_at_sale, product.real_price)
 *
 * Касса всегда фильтруется по is_debt = false, чтобы не задваивать долги.
 * Период — полуоткрытый интервал [from, to) в Asia/Tashkent (см. analytics.period.ts).
 */
@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async salesAggregate(f: AnalyticsFilters): Promise<SourceAggregate> {
    const where: string[] = ['s.is_debt = false'];
    const params: Binding[] = [];

    if (f.from) {
      where.push('s.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('s.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      where.push('c.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.cashier_id) {
      where.push('s.cashier_id = ?');
      params.push(f.cashier_id);
    }
    if (f.payment_type) {
      where.push('s.payment_type = ?');
      params.push(f.payment_type);
    }

    const res = await this.knex.raw(
      `
      SELECT
        COALESCE(SUM(s.price * s.quantity), 0) AS revenue,
        COALESCE(SUM((s.price - COALESCE(s.real_price_at_sale, p.real_price)) * s.quantity), 0) AS net_profit,
        COALESCE(SUM(s.quantity), 0) AS units,
        COUNT(DISTINCT (
          s.cashier_id::text || '_' ||
          (s.created_at)::date::text || '_' ||
          COALESCE(s.payment_type, 'cash')
        )) AS orders
      FROM sale s
      JOIN product p ON p.barcode = s.item_barcode
      LEFT JOIN cashier c ON c.id = s.cashier_id
      WHERE ${where.join(' AND ')}
      `,
      params,
    );

    const row = res.rows[0];
    return {
      revenue: num(row.revenue),
      net_profit: num(row.net_profit),
      units: num(row.units),
      orders: num(row.orders),
    };
  }

  async debtAggregate(
    f: AnalyticsFilters,
  ): Promise<Omit<SourceAggregate, 'orders'>> {
    const where: string[] = ['1=1'];
    const params: Binding[] = [];

    if (f.from) {
      where.push('d.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('d.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      where.push('p.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.cashier_id) {
      where.push('d.cashier_id = ?');
      params.push(f.cashier_id);
    }

    const res = await this.knex.raw(
      `
      SELECT
        COALESCE(SUM(d.debt_amount), 0) AS revenue,
        COALESCE(SUM(d.debt_amount - COALESCE(d.real_price_at_sale, p.real_price) * d.quantity), 0) AS net_profit,
        COALESCE(SUM(d.quantity), 0) AS units
      FROM debt d
      JOIN product p ON p.barcode = d.item_barcode
      WHERE ${where.join(' AND ')}
      `,
      params,
    );

    const row = res.rows[0];
    return {
      revenue: num(row.revenue),
      net_profit: num(row.net_profit),
      units: num(row.units),
    };
  }

  async returnAggregate(
    f: AnalyticsFilters,
  ): Promise<Omit<SourceAggregate, 'orders'>> {
    const where: string[] = ['1=1'];
    const params: Binding[] = [];

    if (f.from) {
      where.push('r.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('r.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      where.push('p.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.cashier_id) {
      // только привязанные возвраты можно атрибутировать кассиру
      where.push('(s.cashier_id = ? OR d.cashier_id = ?)');
      params.push(f.cashier_id, f.cashier_id);
    }

    const unitPrice = 'COALESCE(s.price, d.debt_amount / NULLIF(d.quantity, 0), p.price)';
    const realPrice =
      'COALESCE(s.real_price_at_sale, d.real_price_at_sale, p.real_price)';

    const res = await this.knex.raw(
      `
      SELECT
        COALESCE(SUM(${unitPrice} * r.quantity), 0) AS revenue,
        COALESCE(SUM((${unitPrice} - ${realPrice}) * r.quantity), 0) AS net_profit,
        COALESCE(SUM(r.quantity), 0) AS units
      FROM return r
      JOIN product p ON p.barcode = r.item_barcode
      LEFT JOIN sale s ON s.id = r.sale_id
      LEFT JOIN debt d ON d.id = r.debt_id
      WHERE ${where.join(' AND ')}
      `,
      params,
    );

    const row = res.rows[0];
    return {
      revenue: num(row.revenue),
      net_profit: num(row.net_profit),
      units: num(row.units),
    };
  }

  async salesByCashier(f: AnalyticsFilters): Promise<CashierAggregate[]> {
    const where: string[] = ['s.is_debt = false'];
    const params: Binding[] = [];

    if (f.from) {
      where.push('s.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('s.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      where.push('c.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.cashier_id) {
      where.push('s.cashier_id = ?');
      params.push(f.cashier_id);
    }
    if (f.payment_type) {
      where.push('s.payment_type = ?');
      params.push(f.payment_type);
    }

    const res = await this.knex.raw(
      `
      SELECT
        s.cashier_id,
        c.name AS cashier_name,
        c.branch_id,
        b.name AS branch_name,
        COALESCE(SUM(s.price * s.quantity), 0) AS revenue,
        COALESCE(SUM((s.price - COALESCE(s.real_price_at_sale, p.real_price)) * s.quantity), 0) AS net_profit,
        COALESCE(SUM(s.quantity), 0) AS units,
        COUNT(DISTINCT (
          s.cashier_id::text || '_' ||
          (s.created_at)::date::text || '_' ||
          COALESCE(s.payment_type, 'cash')
        )) AS orders
      FROM sale s
      JOIN product p ON p.barcode = s.item_barcode
      LEFT JOIN cashier c ON c.id = s.cashier_id
      LEFT JOIN branch b ON b.id = c.branch_id
      WHERE ${where.join(' AND ')}
      GROUP BY s.cashier_id, c.name, c.branch_id, b.name
      ORDER BY revenue DESC
      `,
      params,
    );

    return res.rows.map(
      (row: Record<string, unknown>): CashierAggregate => ({
        cashier_id: row.cashier_id === null ? null : Number(row.cashier_id),
        cashier_name: (row.cashier_name as string) ?? null,
        branch_id: row.branch_id === null ? null : Number(row.branch_id),
        branch_name: (row.branch_name as string) ?? null,
        revenue: num(row.revenue),
        net_profit: num(row.net_profit),
        units: num(row.units),
        orders: num(row.orders),
      }),
    );
  }

  /**
   * Топ товаров по выручке/количеству (личный дашборд кассира, §FR-новое).
   * Маржа не считается. Долги включаются при includeDebt и отсутствии payment_type.
   */
  async topProducts(
    f: AnalyticsFilters,
    limit: number,
    metric: 'revenue' | 'units',
    includeDebt: boolean,
  ): Promise<TopProduct[]> {
    const params: Binding[] = [];

    const saleWhere: string[] = ['s.is_debt = false'];
    if (f.from) {
      saleWhere.push('s.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      saleWhere.push('s.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      saleWhere.push('c.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.cashier_id) {
      saleWhere.push('s.cashier_id = ?');
      params.push(f.cashier_id);
    }
    if (f.payment_type) {
      saleWhere.push('s.payment_type = ?');
      params.push(f.payment_type);
    }

    const useDebt = includeDebt && !f.payment_type;
    let debtSub = '';
    if (useDebt) {
      const debtWhere: string[] = ['1=1'];
      if (f.from) {
        debtWhere.push('d.created_at >= ?');
        params.push(f.from);
      }
      if (f.to) {
        debtWhere.push('d.created_at < ?');
        params.push(f.to);
      }
      if (f.branch_id) {
        debtWhere.push('p.branch_id = ?');
        params.push(f.branch_id);
      }
      if (f.cashier_id) {
        debtWhere.push('d.cashier_id = ?');
        params.push(f.cashier_id);
      }
      debtSub = `
        UNION ALL
        SELECT d.item_barcode AS barcode, p.name AS name,
               d.quantity AS units, d.debt_amount AS revenue
        FROM debt d
        JOIN product p ON p.barcode = d.item_barcode
        WHERE ${debtWhere.join(' AND ')}
      `;
    }

    const orderColumn = metric === 'units' ? 'units' : 'revenue';
    params.push(limit);

    const res = await this.knex.raw(
      `
      SELECT barcode, name,
        SUM(units) AS units,
        SUM(revenue) AS revenue
      FROM (
        SELECT s.item_barcode AS barcode, p.name AS name,
               s.quantity AS units, s.price * s.quantity AS revenue
        FROM sale s
        JOIN product p ON p.barcode = s.item_barcode
        LEFT JOIN cashier c ON c.id = s.cashier_id
        WHERE ${saleWhere.join(' AND ')}
        ${debtSub}
      ) t
      GROUP BY barcode, name
      ORDER BY ${orderColumn} DESC
      LIMIT ?
      `,
      params,
    );

    return res.rows.map(
      (row: Record<string, unknown>): TopProduct => ({
        barcode: String(row.barcode),
        name: (row.name as string) ?? null,
        units: num(row.units),
        revenue: num(row.revenue),
      }),
    );
  }

  async productStats(branch_id?: number): Promise<ProductStats> {
    const params: Binding[] = [];
    let branchFilter = '';
    if (branch_id) {
      branchFilter = 'AND branch_id = ?';
      params.push(branch_id);
    }

    const res = await this.knex.raw(
      `
      SELECT
        COUNT(*) FILTER (WHERE is_deleted = false ${branchFilter}) AS total_products,
        COUNT(*) FILTER (WHERE is_deleted = false AND created_at >= date_trunc('month', now()) ${branchFilter}) AS new_products,
        COUNT(*) FILTER (WHERE is_deleted = false AND stock > 0 AND stock <= ${LOW_STOCK_THRESHOLD} ${branchFilter}) AS low_stock,
        COUNT(*) FILTER (WHERE is_deleted = false AND stock <= 0 ${branchFilter}) AS out_of_stock
      FROM product
      `,
      // параметр branch_id повторяется в каждом FILTER
      branch_id ? [params[0], params[0], params[0], params[0]] : [],
    );

    const row = res.rows[0];
    return {
      total_products: num(row.total_products),
      new_products: num(row.new_products),
      low_stock: num(row.low_stock),
      out_of_stock: num(row.out_of_stock),
    };
  }
}
