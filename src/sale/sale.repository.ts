import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import knex from 'knex';
import knexConfig from '../../knexfile';
const db = knex(knexConfig);

type Binding = string | number;
type PaymentType = 'cash' | 'terminal' | 'online';

export interface OrdersFilter {
  from?: string;
  to?: string;
  branch_id?: number;
  cashier_id?: number;
  payment_type?: PaymentType;
}

const selectDailySaleQurey: string = `
        SELECT
        SUM(COALESCE(sale.price, 0)) AS cashier_price,
        COUNT(*) AS cashier_order,
        cashier.name AS cashier_name,
        cashier.id AS cashier_id,
        branch.name AS branch_name
        FROM sale
        LEFT JOIN cashier ON cashier.id = sale.cashier_id 
        LEFT JOIN branch ON branch.id = cashier.branch_id
        WHERE DATE(sale.created_at) = CURRENT_DATE AND sale.is_debt = false
        GROUP BY  cashier.name, branch.name, cashier.id
        ORDER BY cashier_price DESC;

`;
const createSaleQuery = `
INSERT INTO sale(
  item_barcode,
  price,
  quantity,
  cashier_id,
  description,
  payment_type,
  real_price_at_sale,
  receipt_id
)
VALUES(?,?,?,?,?,?, (SELECT real_price FROM product WHERE barcode = ?), ?)
RETURNING *;
`;

const updateProductQuantityQuery: string = `
        UPDATE product
            SET 
            stock = stock - ?
        WHERE barcode = ?
        RETURNING *;
`;
const searchNameBarcodeQuery: string = `
      SELECT 
        sale.*,
        product.name AS product_name,
        cashier.branch_id
      FROM sale
      LEFT JOIN product ON product.barcode = sale.item_barcode
      LEFT JOIN cashier ON cashier.id = sale.cashier_id
      WHERE  
        sale.item_barcode ILIKE ?
        OR product.name ILIKE ?;
`;

const searchNameBarBranchQuery: string = `
        SELECT
        sale.* ,
        product.name AS product_name
        FROM sale
        JOIN product ON product.barcode = sale.item_barcode
        JOIN cashier ON cashier.id = sale.cashier_id
        WHERE  
        cashier.branch_id = ? 
        AND sale.item_barcode ILIKE ?
        OR product.name ILIKE ?;
`;

const searchBranchCashierQuery: string = `
        SELECT
        sale.* ,
        product.name AS product_name
        FROM sale
        JOIN product ON product.barcode = sale.item_barcode
        JOIN cashier ON cashier.id = sale.cashier_id
        WHERE  
        cashier.branch_id = ? 
        AND cashier.id = ?
        ANDsale.item_barcode ILIKE ?
        OR product.name ILIKE ?;
`;

const searchDateQuery: string = `
        SELECT
        sale.* ,
        product.name AS product_name
        FROM sale
        JOIN product ON product.barcode = sale.item_barcode
        JOIN cashier ON cashier.id = sale.cashier_id
        WHERE  
        sale.created_at >=? --from
        AND sale.created_at <=? --to
        AND cashier.branch_id = ? 
        AND cashier.id = ?
        AND sale.item_barcode ILIKE ?
        OR product.name ILIKE ?;
`;
const selectByIDCashierQuery: string = `
    SELECT *FROM cashier WHERE id = ?;`;
@Injectable()
export class SaleRepo {
  async selectDailySale() {
    const res = await db.raw(selectDailySaleQurey);
    return res.rows;
  }
  async getNetProfit(
    from?: string,
    to?: string,
    branch_id?: number,
    cashier_id?: number,
  ) {
    const params: any[] = [];

    let saleFilter = 'WHERE 1=1';
    let debtFilter = 'WHERE 1=1';
    let returnFilter = 'WHERE 1=1';

    // ------------------ DATE FILTER ------------------

    if (from) {
      saleFilter += ' AND s.created_at >= ?';
      debtFilter += ' AND d.created_at >= ?';
      returnFilter += ' AND r.created_at >= ?';
      params.push(from, from, from);
    }

    if (to) {
      saleFilter += ' AND s.created_at <= ?';
      debtFilter += ' AND d.created_at <= ?';
      returnFilter += ' AND r.created_at <= ?';
      params.push(to, to, to);
    }

    // ------------------ BRANCH FILTER ------------------

    if (branch_id) {
      saleFilter += ' AND p.branch_id = ?';
      debtFilter += ' AND p.branch_id = ?';
      returnFilter += ' AND p.branch_id = ?';
      params.push(branch_id, branch_id, branch_id);
    }

    // ------------------ CASHIER FILTER ------------------

    if (cashier_id) {
      saleFilter += ' AND s.cashier_id = ?';
      debtFilter += ' AND d.customer_id = ?'; // agar debt ham kassirga bog‘langan bo‘lsa shu
      params.push(cashier_id, cashier_id);
    }

    const query = `
      SELECT
        -- sotuvdan sof foyda
        COALESCE((
          SELECT SUM((p.price - p.real_price) * s.quantity)
          FROM sale s
          JOIN product p ON p.barcode = s.item_barcode
          ${saleFilter}
        ), 0)
        +
        -- qarz savdosidan sof foyda
        COALESCE((
          SELECT SUM((p.price - p.real_price) * d.quantity)
          FROM debt d
          JOIN product p ON p.barcode = d.item_barcode
          ${debtFilter}
        ), 0)
        -
        -- qaytgan tovar zarar
        COALESCE((
          SELECT SUM((p.price - p.real_price) * r.quantity)
          FROM return r
          JOIN product p ON p.barcode = r.item_barcode
          ${returnFilter}
        ), 0)
        AS net_profit;
    `;

    const res = await db.raw(query, params);
    return res.rows[0];
  }

  async searchNameBarcode(q: string) {
    const res = await db.raw(searchNameBarcodeQuery, [`%${q}%`, `%${q}%`]);
    return res.rows;
  }

  async searchNameBarBranch(q: string, branch_id: number) {
    const res = await db.raw(searchNameBarBranchQuery, [
      branch_id,
      `%${q}%`,
      `%${q}%`,
    ]);
    return res.rows;
  }
  async searchBranchCashier(q: string, branch_id: number, cashier_id: number) {
    const res = await db.raw(searchBranchCashierQuery, [
      cashier_id,
      branch_id,
      `%${q}%`,
      `%${q}%`,
    ]);
    return res.rows;
  }
  async searchDate(
    q: string,
    branch_id: number,
    cashier_id: number,
    from: Date,
    to: Date,
  ) {
    const res = await db.raw(searchDateQuery, [
      from,
      to,
      cashier_id,
      branch_id,
      `%${q}%`,
      `%${q}%`,
    ]);

    return res.rows;
  }

  async getSales(
    page: number,
    pageSize: number,
    q?: string,
    branch_id?: number,
    cashier_id?: number,
    from?: Date,
    to?: Date,
    payment_type?: 'cash' | 'terminal' | 'online',
  ) {
    const offset = (page - 1) * pageSize;
    const params: any[] = [];

    let where = `WHERE 1=1`;

    if (q) {
      where += ` AND (p.name ILIKE ? OR s.item_barcode ILIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }

    if (branch_id) {
      where += ` AND c.branch_id = ?`;
      params.push(branch_id);
    }

    if (cashier_id) {
      where += ` AND s.cashier_id = ?`;
      params.push(cashier_id);
    }

    if (from) {
      where += ` AND s.created_at >= ?`;
      params.push(from);
    }

    if (to) {
      where += ` AND s.created_at <= ?`;
      params.push(to);
    }

    const data = await db.raw(
      `
      SELECT 
        s.id,
        s.item_barcode,
        p.name AS product_name,
        c.name AS cashier_name,
        s.price,
        s.quantity 
          - COALESCE(SUM(r.quantity), 0) AS final_quantity, -- 👈 MINUS QAYTARILGAN
        s.created_at
      FROM sale s
      JOIN product p ON p.barcode = s.item_barcode
      JOIN cashier c ON c.id = s.cashier_id
      LEFT JOIN return r 
        ON r.item_barcode = s.item_barcode 
       AND r.created_at >= s.created_at
      ${where}
      GROUP BY s.id, p.name, c.name
      HAVING (s.quantity - COALESCE(SUM(r.quantity), 0)) > 0 -- 👈 faqat real sotilganlar
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    return data.rows;
  }

  private buildOrdersWhere(f: OrdersFilter): {
    where: string;
    params: Binding[];
  } {
    const clauses: string[] = ['s.is_debt = false'];
    const params: Binding[] = [];

    if (f.from) {
      clauses.push('s.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      clauses.push('s.created_at < ?');
      params.push(f.to);
    }
    if (f.branch_id) {
      clauses.push('c.branch_id = ?');
      params.push(f.branch_id);
    }
    if (f.cashier_id) {
      clauses.push('s.cashier_id = ?');
      params.push(f.cashier_id);
    }
    if (f.payment_type) {
      clauses.push('s.payment_type = ?');
      params.push(f.payment_type);
    }

    return { where: clauses.join(' AND '), params };
  }

  /** Список заказов (чеков) с агрегатами: время, кассир, сумма, число позиций. */
  async ordersList(f: OrdersFilter, page: number, pageSize: number) {
    const { where, params } = this.buildOrdersWhere(f);
    const offset = (page - 1) * pageSize;

    const res = await db.raw(
      `
      SELECT
        s.receipt_id,
        MIN(s.created_at) AS created_at,
        s.cashier_id,
        c.name AS cashier_name,
        b.name AS branch_name,
        s.payment_type,
        COUNT(*) AS items_count,
        COALESCE(SUM(s.quantity), 0) AS total_quantity,
        COALESCE(SUM(s.price * s.quantity), 0) AS total_amount
      FROM sale s
      LEFT JOIN cashier c ON c.id = s.cashier_id
      LEFT JOIN branch b ON b.id = c.branch_id
      WHERE ${where}
      GROUP BY s.receipt_id, s.cashier_id, c.name, b.name, s.payment_type
      ORDER BY MIN(s.created_at) DESC
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset],
    );

    return res.rows;
  }

  /** Общее число заказов (чеков) для пагинации. */
  async ordersCount(f: OrdersFilter): Promise<number> {
    const { where, params } = this.buildOrdersWhere(f);

    const res = await db.raw(
      `
      SELECT COUNT(DISTINCT s.receipt_id) AS total
      FROM sale s
      LEFT JOIN cashier c ON c.id = s.cashier_id
      WHERE ${where}
      `,
      params,
    );

    return Number(res.rows[0]?.total ?? 0);
  }

  /** Позиции конкретного заказа (чека). */
  async orderItems(receiptId: string) {
    const res = await db.raw(
      `
      SELECT
        s.id,
        s.item_barcode,
        p.name AS product_name,
        s.description,
        s.price,
        s.quantity,
        s.is_debt,
        s.payment_type,
        s.created_at,
        s.cashier_id,
        c.name AS cashier_name,
        b.name AS branch_name,
        (s.price * s.quantity) AS amount
      FROM sale s
      JOIN product p ON p.barcode = s.item_barcode
      LEFT JOIN cashier c ON c.id = s.cashier_id
      LEFT JOIN branch b ON b.id = c.branch_id
      WHERE s.receipt_id = ?
      ORDER BY s.id
      `,
      [receiptId],
    );

    return res.rows;
  }

  async selectByIDCashier(id: number) {
    const res = await db.raw(selectByIDCashierQuery, [id]);
    return res.rows;
  }
  async createSales(
    data: {
      item_barcode: string;
      cashier_id: number;
      price: number;
      quantity: number;
      description?: string;
      payment_type?: 'cash' | 'terminal' | 'online';
    }[],
  ) {
    const trx = await db.transaction();
    // единый чек на всю корзину (все позиции одной продажи)
    const receiptId = randomUUID();

    try {
      const results = [];

      for (const sale of data) {
        const paymentType = sale.payment_type ?? 'cash'; // 👈 default

        const res = await trx.raw(createSaleQuery, [
          sale.item_barcode,
          sale.price,
          sale.quantity,
          sale.cashier_id,
          sale.description ?? '',
          paymentType, // 👈 doim bor
          sale.item_barcode, // 👈 real_price_at_sale snapshot uchun
          receiptId, // 👈 receipt_id (единый на корзину)
        ]);

        await trx.raw(updateProductQuantityQuery, [
          sale.quantity,
          sale.item_barcode,
        ]);

        results.push(res.rows[0]);
      }

      await trx.commit();
      return results;
    } catch (err) {
      await trx.rollback();
      console.error('CREATE SALE ERROR 👉', err.message);
      throw err;
    }
  }
}
