import { Injectable } from '@nestjs/common';
import knex from 'knex';
import knexConfig from '../../knexfile';
const db = knex(knexConfig);

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
  payment_type
)
VALUES(?,?,?,?,?,?)
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
    



    // sale.repository.ts ga qo'shing

// 1. Umumiy jami sotuv summasi (barchasi)
const selectTotalSalesQuery: string = `
  SELECT 
    COALESCE(SUM(s.price * s.quantity), 0) AS total_sales
  FROM sale s
  WHERE s.is_debt = FALSE;
`;

// 2. Bu oydagi umumiy jami sotuv summasi
const selectCurrentMonthSalesQuery: string = `
  SELECT 
    COALESCE(SUM(s.price * s.quantity), 0) AS current_month_sales
  FROM sale s
  WHERE s.is_debt = FALSE
    AND s.created_at >= date_trunc('month', CURRENT_DATE)
    AND s.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
`;

// 3. Umumiy statistika (qarz va qaytarilganlar bilan)
const selectSalesStatisticsQuery: string = `
  SELECT 
    -- Umumiy sotuvlar (qarz bo'lmaganlar)
    COALESCE(SUM(s.price * s.quantity) FILTER (WHERE s.is_debt = FALSE), 0) AS total_sales,
    
    -- Bu oydagi sotuvlar (qarz bo'lmaganlar)
    COALESCE(SUM(s.price * s.quantity) FILTER (
      WHERE s.is_debt = FALSE 
        AND s.created_at >= date_trunc('month', CURRENT_DATE)
        AND s.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    ), 0) AS current_month_sales,
    
    -- Umumiy qarzlar
    COALESCE((
      SELECT SUM(debt_amount) 
      FROM debt 
      WHERE debt_amount > 0
    ), 0) AS total_debt,
    
    -- Bu oydagi qarzlar
    COALESCE((
      SELECT SUM(debt_amount) 
      FROM debt 
      WHERE debt_amount > 0
        AND created_at >= date_trunc('month', CURRENT_DATE)
        AND created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    ), 0) AS current_month_debt,
    
    -- To'langan qarzlar (umumiy)
    COALESCE((
      SELECT SUM(amount) 
      FROM debt 
      WHERE created_at != updated_at
    ), 0) AS total_paid_debt,
    
    -- Bu oyda to'langan qarzlar
    COALESCE((
      SELECT SUM(amount) 
      FROM debt 
      WHERE created_at != updated_at
        AND updated_at >= date_trunc('month', CURRENT_DATE)
        AND updated_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    ), 0) AS current_month_paid_debt,
    
    -- Umumiy qaytarilganlar
    COALESCE((
      SELECT SUM(r.quantity * (
        SELECT p.price 
        FROM product p 
        WHERE p.barcode = r.item_barcode 
        LIMIT 1
      ))
      FROM return r
    ), 0) AS total_returns,
    
    -- Bu oydagi qaytarilganlar
    COALESCE((
      SELECT SUM(r.quantity * (
        SELECT p.price 
        FROM product p 
        WHERE p.barcode = r.item_barcode 
        LIMIT 1
      ))
      FROM return r
      WHERE r.created_at >= date_trunc('month', CURRENT_DATE)
        AND r.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    ), 0) AS current_month_returns
    
  FROM sale s;
`;

// 4. Mahsulotlar statistikasi
const selectProductStatisticsQuery: string = `
  SELECT 
    COUNT(*) AS total_products,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_products,
    COUNT(*) FILTER (WHERE stock <= 10 AND is_deleted = FALSE) AS low_stock_products,
    COUNT(*) FILTER (WHERE stock = 0 AND is_deleted = FALSE) AS out_of_stock_products
  FROM product
  WHERE is_deleted = FALSE;
`;

@Injectable()
export class SaleRepo {
  async selectDailySale() {
    const res = await db.raw(selectDailySaleQurey);
    return res.rows;
  }
 async getNetProfit(from?: string, to?: string, branch_id?: number, cashier_id?: number) {
  const saleParams: any[] = [];
  const debtParams: any[] = [];
  const returnParams: any[] = [];

  let saleFilter = 'WHERE 1=1';
  let debtFilter = 'WHERE 1=1';
  let returnFilter = 'WHERE 1=1';

  if (from) {
    saleFilter += ' AND s.created_at >= ?';
    debtFilter += ' AND d.created_at >= ?';
    returnFilter += ' AND r.created_at >= ?';
    saleParams.push(from);
    debtParams.push(from);
    returnParams.push(from);
  }

  if (to) {
    saleFilter += ' AND s.created_at <= ?';
    debtFilter += ' AND d.created_at <= ?';
    returnFilter += ' AND r.created_at <= ?';
    saleParams.push(to);
    debtParams.push(to);
    returnParams.push(to);
  }

  if (branch_id) {
    saleFilter += ' AND p.branch_id = ?';
    debtFilter += ' AND p.branch_id = ?';
    returnFilter += ' AND p.branch_id = ?';
    saleParams.push(branch_id);
    debtParams.push(branch_id);
    returnParams.push(branch_id);
  }

  if (cashier_id) {
    saleFilter += ' AND s.cashier_id = ?';
    debtFilter += ' AND d.customer_id = ?';
    saleParams.push(cashier_id);
    debtParams.push(cashier_id);
  }

  const query = `
    SELECT
      COALESCE((
        SELECT SUM((p.price - p.real_price) * s.quantity)
        FROM sale s
        JOIN product p ON p.barcode = s.item_barcode
        ${saleFilter}
      ), 0)
      +
      COALESCE((
        SELECT SUM((p.price - p.real_price) * d.quantity)
        FROM debt d
        JOIN product p ON p.barcode = d.item_barcode
        ${debtFilter}
      ), 0)
      -
      COALESCE((
        SELECT SUM((p.price - p.real_price) * r.quantity)
        FROM return r
        JOIN product p ON p.barcode = r.item_barcode
        ${returnFilter}
      ), 0)
      AS net_profit;
  `;

  const params = [...saleParams, ...debtParams, ...returnParams];
  const res = await db.raw(query, params);
  return res.rows[0];
}

  async getTotalSales() {
    const res = await db.raw(selectTotalSalesQuery);
    return res.rows[0];
  }

  async getCurrentMonthSales() {
    const res = await db.raw(selectCurrentMonthSalesQuery);
    return res.rows[0];
  }

  async getSalesStatistics() {
    const res = await db.raw(selectSalesStatisticsQuery);
    return res.rows[0];
  }

  async getProductStatistics() {
    const res = await db.raw(selectProductStatisticsQuery);
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
