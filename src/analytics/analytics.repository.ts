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

export interface ProductAnalysisFilter {
  from?: string;
  to?: string;
  prevFrom?: string;
  prevTo?: string;
  branch_id?: number;
  category_id?: number;
  cashier_id?: number;
  payment_type?: PaymentType;
}

export interface ProductAnalysisRow {
  barcode: string;
  name: string | null;
  category_name: string | null;
  stock: number;
  units_sold: number;
  revenue: number;
  cost: number;
  margin: number;
  receipts_count: number;
  below_cost: number;
  returns_qty: number;
  prev_revenue: number;
  prev_units: number;
}

export interface ProductAnalysisSummary {
  total_revenue: number;
  total_cost: number;
  total_units: number;
  products_count: number;
  dead_stock_count: number;
  below_cost_count: number;
}

export interface BasketPair {
  barcode_a: string;
  name_a: string | null;
  barcode_b: string;
  name_b: string | null;
  together_count: number;
}

const PRODUCT_SORT_COLUMNS: Record<string, string> = {
  revenue: 'revenue',
  units: 'units_sold',
  margin: 'margin',
  returns: 'returns_qty',
  stock: 'stock',
};

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

  /** Собирает CTE движения товаров (продажи + опционально долги) и WHERE. */
  private buildAnalysisCore(
    f: ProductAnalysisFilter,
    includeDebt: boolean,
    q?: string,
    onlyDead?: boolean,
    onlyBelow?: boolean,
  ): { sql: string; params: Binding[] } {
    const params: Binding[] = [];

    // --- mov: sale ---
    const saleConds: string[] = ['s.is_debt = false'];
    if (f.from) {
      saleConds.push('s.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      saleConds.push('s.created_at < ?');
      params.push(f.to);
    }
    if (f.cashier_id) {
      saleConds.push('s.cashier_id = ?');
      params.push(f.cashier_id);
    }
    if (f.payment_type) {
      saleConds.push('s.payment_type = ?');
      params.push(f.payment_type);
    }

    let debtUnion = '';
    if (includeDebt && !f.payment_type) {
      const debtConds: string[] = ['1=1'];
      if (f.from) {
        debtConds.push('d.created_at >= ?');
        params.push(f.from);
      }
      if (f.to) {
        debtConds.push('d.created_at < ?');
        params.push(f.to);
      }
      if (f.cashier_id) {
        debtConds.push('d.cashier_id = ?');
        params.push(f.cashier_id);
      }
      debtUnion = `
        UNION ALL
        SELECT d.item_barcode AS barcode, d.quantity AS qty,
               d.debt_amount AS revenue,
               COALESCE(d.real_price_at_sale, p.real_price) * d.quantity AS cost,
               NULL::uuid AS receipt,
               CASE WHEN (d.debt_amount / NULLIF(d.quantity, 0)) < COALESCE(d.real_price_at_sale, p.real_price) THEN 1 ELSE 0 END AS below_cost
        FROM debt d
        JOIN product p ON p.barcode = d.item_barcode
        WHERE ${debtConds.join(' AND ')}
      `;
    }

    // --- ret ---
    const retConds: string[] = ['1=1'];
    if (f.from) {
      retConds.push('r.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      retConds.push('r.created_at < ?');
      params.push(f.to);
    }

    // --- prev (рост) ---
    let prevSql: string;
    if (f.prevFrom && f.prevTo) {
      const prevConds: string[] = ['s.is_debt = false', 's.created_at >= ?', 's.created_at < ?'];
      params.push(f.prevFrom, f.prevTo);
      if (f.cashier_id) {
        prevConds.push('s.cashier_id = ?');
        params.push(f.cashier_id);
      }
      if (f.payment_type) {
        prevConds.push('s.payment_type = ?');
        params.push(f.payment_type);
      }
      prevSql = `
        SELECT s.item_barcode AS barcode,
               SUM(s.quantity) AS units,
               SUM(s.price * s.quantity) AS revenue
        FROM sale s
        WHERE ${prevConds.join(' AND ')}
        GROUP BY s.item_barcode
      `;
    } else {
      prevSql = `SELECT NULL::varchar AS barcode, 0::numeric AS units, 0::numeric AS revenue WHERE false`;
    }

    // --- outer (product) ---
    const outer: string[] = ['p.is_deleted = false'];
    if (f.branch_id) {
      outer.push('p.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.category_id) {
      outer.push('p.category_id = ?');
      params.push(f.category_id);
    }
    if (q) {
      outer.push('(p.name ILIKE ? OR p.barcode ILIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (onlyDead) {
      outer.push('COALESCE(a.units, 0) = 0 AND p.stock > 0');
    }
    if (onlyBelow) {
      outer.push('COALESCE(a.below_cost, 0) = 1');
    }

    const sql = `
      WITH mov AS (
        SELECT s.item_barcode AS barcode, s.quantity AS qty,
               s.price * s.quantity AS revenue,
               COALESCE(s.real_price_at_sale, p.real_price) * s.quantity AS cost,
               s.receipt_id AS receipt,
               CASE WHEN s.price < COALESCE(s.real_price_at_sale, p.real_price) THEN 1 ELSE 0 END AS below_cost
        FROM sale s
        JOIN product p ON p.barcode = s.item_barcode
        LEFT JOIN cashier c ON c.id = s.cashier_id
        WHERE ${saleConds.join(' AND ')}
        ${debtUnion}
      ),
      agg AS (
        SELECT barcode,
               SUM(qty) AS units,
               SUM(revenue) AS revenue,
               SUM(cost) AS cost,
               COUNT(DISTINCT receipt) AS receipts,
               MAX(below_cost) AS below_cost
        FROM mov GROUP BY barcode
      ),
      ret AS (
        SELECT r.item_barcode AS barcode, SUM(r.quantity) AS qty
        FROM return r
        WHERE ${retConds.join(' AND ')}
        GROUP BY r.item_barcode
      ),
      prev AS (
        ${prevSql}
      )
      SELECT
        p.barcode, p.name, cat.name AS category_name, p.stock,
        COALESCE(a.units, 0) AS units_sold,
        COALESCE(a.revenue, 0) AS revenue,
        COALESCE(a.cost, 0) AS cost,
        (COALESCE(a.revenue, 0) - COALESCE(a.cost, 0)) AS margin,
        COALESCE(a.receipts, 0) AS receipts_count,
        COALESCE(a.below_cost, 0) AS below_cost,
        COALESCE(rt.qty, 0) AS returns_qty,
        COALESCE(pv.revenue, 0) AS prev_revenue,
        COALESCE(pv.units, 0) AS prev_units
      FROM product p
      LEFT JOIN agg a ON a.barcode = p.barcode
      LEFT JOIN ret rt ON rt.barcode = p.barcode
      LEFT JOIN prev pv ON pv.barcode = p.barcode
      LEFT JOIN category cat ON cat.id = p.category_id
      WHERE ${outer.join(' AND ')}
    `;

    return { sql, params };
  }

  async productAnalysis(
    f: ProductAnalysisFilter,
    includeDebt: boolean,
    q: string | undefined,
    sort: string,
    order: 'asc' | 'desc',
    onlyDead: boolean,
    onlyBelow: boolean,
    page: number,
    pageSize: number,
  ): Promise<{ rows: ProductAnalysisRow[]; total: number }> {
    const core = this.buildAnalysisCore(f, includeDebt, q, onlyDead, onlyBelow);
    const sortColumn = PRODUCT_SORT_COLUMNS[sort] ?? 'revenue';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * pageSize;

    const countRes = await this.knex.raw(
      `SELECT COUNT(*) AS total FROM (${core.sql}) sub`,
      core.params,
    );
    const total = Number(countRes.rows[0]?.total ?? 0);

    const dataRes = await this.knex.raw(
      `${core.sql} ORDER BY ${sortColumn} ${sortDir}, p.name ASC LIMIT ? OFFSET ?`,
      [...core.params, pageSize, offset],
    );

    const rows: ProductAnalysisRow[] = dataRes.rows.map(
      (row: Record<string, unknown>): ProductAnalysisRow => ({
        barcode: String(row.barcode),
        name: (row.name as string) ?? null,
        category_name: (row.category_name as string) ?? null,
        stock: num(row.stock),
        units_sold: num(row.units_sold),
        revenue: num(row.revenue),
        cost: num(row.cost),
        margin: num(row.margin),
        receipts_count: num(row.receipts_count),
        below_cost: num(row.below_cost),
        returns_qty: num(row.returns_qty),
        prev_revenue: num(row.prev_revenue),
        prev_units: num(row.prev_units),
      }),
    );

    return { rows, total };
  }

  async productAnalysisSummary(
    f: ProductAnalysisFilter,
    includeDebt: boolean,
  ): Promise<ProductAnalysisSummary> {
    const core = this.buildAnalysisCore(f, includeDebt, undefined, false, false);

    const res = await this.knex.raw(
      `
      SELECT
        COALESCE(SUM(revenue), 0) AS total_revenue,
        COALESCE(SUM(cost), 0) AS total_cost,
        COALESCE(SUM(units_sold), 0) AS total_units,
        COUNT(*) AS products_count,
        COUNT(*) FILTER (WHERE units_sold = 0 AND stock > 0) AS dead_stock_count,
        COUNT(*) FILTER (WHERE below_cost = 1) AS below_cost_count
      FROM (${core.sql}) sub
      `,
      core.params,
    );

    const row = res.rows[0];
    return {
      total_revenue: num(row.total_revenue),
      total_cost: num(row.total_cost),
      total_units: num(row.total_units),
      products_count: num(row.products_count),
      dead_stock_count: num(row.dead_stock_count),
      below_cost_count: num(row.below_cost_count),
    };
  }

  /** «Часто покупают вместе»: пары товаров в одном чеке (receipt_id). */
  async productBasket(
    f: ProductAnalysisFilter,
    limit: number,
  ): Promise<BasketPair[]> {
    const conds: string[] = [
      'a.is_debt = false',
      'b.is_debt = false',
      'a.receipt_id IS NOT NULL',
      'a.item_barcode < b.item_barcode',
    ];
    const params: Binding[] = [];

    if (f.from) {
      conds.push('a.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      conds.push('a.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      conds.push('pa.branch_id = ? AND pb.branch_id = ?');
      params.push(f.branch_id, f.branch_id);
    }

    params.push(limit);

    const res = await this.knex.raw(
      `
      SELECT
        a.item_barcode AS barcode_a, pa.name AS name_a,
        b.item_barcode AS barcode_b, pb.name AS name_b,
        COUNT(DISTINCT a.receipt_id) AS together_count
      FROM sale a
      JOIN sale b ON a.receipt_id = b.receipt_id AND a.item_barcode < b.item_barcode
      JOIN product pa ON pa.barcode = a.item_barcode
      JOIN product pb ON pb.barcode = b.item_barcode
      WHERE ${conds.join(' AND ')}
      GROUP BY a.item_barcode, pa.name, b.item_barcode, pb.name
      ORDER BY together_count DESC
      LIMIT ?
      `,
      params,
    );

    return res.rows.map(
      (row: Record<string, unknown>): BasketPair => ({
        barcode_a: String(row.barcode_a),
        name_a: (row.name_a as string) ?? null,
        barcode_b: String(row.barcode_b),
        name_b: (row.name_b as string) ?? null,
        together_count: num(row.together_count),
      }),
    );
  }
}
