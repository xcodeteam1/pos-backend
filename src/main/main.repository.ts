import { Injectable } from '@nestjs/common';
import knex from 'knex';
import knexConfig from '../../knexfile';

const db = knex(knexConfig);

// Joriy oydagi to'langan qarzlar summasi
const allAmountQuery: string = `
  SELECT COALESCE(SUM(amount), 0) AS all_amount
  FROM debt
  WHERE created_at != updated_at
    AND updated_at >= date_trunc('month', CURRENT_DATE)
    AND updated_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
`;

// Umumiy va yangi mahsulotlar soni
const selectProductMainQuery: string = `
  SELECT 
    COUNT(*) AS total_products,
    COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_products
  FROM product
  WHERE is_deleted = FALSE;
`;
// Oxirgi 12 oylik savdo statistikasi oy nomi bilan
const selectTwelveMonthQueryWithNames: string = `
WITH months AS (
  SELECT generate_series(
    date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
    date_trunc('month', CURRENT_DATE),
    INTERVAL '1 month'
  ) AS month_start
)
SELECT
  to_char(m.month_start, 'TMMonth') AS month_name,  -- Oyning nomi (yanvar, fevral...)
  COALESCE(SUM(s.price * s.quantity), 0) AS sales
FROM months m
LEFT JOIN sale s
  ON date_trunc('month', s.created_at) = m.month_start
GROUP BY m.month_start
ORDER BY m.month_start;
`;




// Mahsulotlar bo'yicha savdo diagrammasi (JOIN siz, subquery bilan)
const selectDiagramQuery: string = `
  SELECT 
    s.item_barcode,
    (SELECT name FROM product WHERE barcode = s.item_barcode LIMIT 1) AS product_name,
    SUM(s.price * s.quantity) AS total_sum,
    SUM(s.quantity) AS total_quantity
  FROM sale s
  WHERE s.item_barcode IN (SELECT barcode FROM product WHERE is_deleted = FALSE)
  GROUP BY s.item_barcode
  ORDER BY total_sum DESC;
`;

@Injectable()
export class MainRepo {
  async selectProductMain() {
    const res = await db.raw(selectProductMainQuery);
    return res.rows[0];
  }

  async selectSixMonth() {
    const res = await db.raw(selectTwelveMonthQueryWithNames);
    return res.rows[0];
  }

  async selectDiagram() {
    const res = await db.raw(selectDiagramQuery);
    
    const sumAll: number = res.rows.reduce((acc: number, current: any) => {
      return acc + Number(current.total_sum);
    }, 0);

    if (sumAll === 0) {
      return [];
    }

    const result = res.rows.map((item: any) => {
      const percent = ((Number(item.total_sum) / sumAll) * 100).toFixed(2);
      return {
        product_name: item.product_name,
        item_barcode: item.item_barcode,
        total_sum: Number(item.total_sum),
        total_quantity: Number(item.total_quantity),
        percent: Number(percent),
      };
    });

    return result;
  }

  async getAllAmount() {
    const res = await db.raw(allAmountQuery);
    return res.rows[0];
  }
}