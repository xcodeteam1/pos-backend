import type { Knex } from 'knex';

/**
 * Analytics enhancements (ANALYTICS_IMPROVEMENT_TZ.md §6).
 * - payment_type в sale (§6.5)
 * - real_price_at_sale в sale/debt — снимок себестоимости (§6.2)
 * - cashier_id в debt (§6.3)
 * - sale_id/debt_id в return — связь возвратов (§6.1)
 * - индексы под аналитические фильтры (§6.4)
 * Все шаги идемпотентны (IF NOT EXISTS), чтобы безопасно накатывать на прод.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE sale  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'cash';
    ALTER TABLE sale  ADD COLUMN IF NOT EXISTS real_price_at_sale NUMERIC(15,2);

    ALTER TABLE debt  ADD COLUMN IF NOT EXISTS real_price_at_sale NUMERIC(15,2);
    ALTER TABLE debt  ADD COLUMN IF NOT EXISTS cashier_id INTEGER REFERENCES cashier(id) ON DELETE SET NULL;

    ALTER TABLE return ADD COLUMN IF NOT EXISTS sale_id INTEGER REFERENCES sale(id) ON DELETE SET NULL;
    ALTER TABLE return ADD COLUMN IF NOT EXISTS debt_id INTEGER REFERENCES debt(id) ON DELETE SET NULL;
  `);

  // Backfill снимка себестоимости из текущего каталога (исторические строки).
  await knex.raw(`
    UPDATE sale s
      SET real_price_at_sale = p.real_price
      FROM product p
     WHERE p.barcode = s.item_barcode
       AND s.real_price_at_sale IS NULL;

    UPDATE debt d
      SET real_price_at_sale = p.real_price
      FROM product p
     WHERE p.barcode = d.item_barcode
       AND d.real_price_at_sale IS NULL;
  `);

  // Индексы (§6.4): одиночные + составные под реальные фильтры периода/филиала/кассира.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_sale_created_at        ON sale(created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_cashier_created   ON sale(cashier_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sale_payment_type      ON sale(payment_type);
    CREATE INDEX IF NOT EXISTS idx_sale_item_barcode      ON sale(item_barcode);
    CREATE INDEX IF NOT EXISTS idx_sale_not_debt_created  ON sale(created_at) WHERE is_debt = false;

    CREATE INDEX IF NOT EXISTS idx_debt_created_at        ON debt(created_at);
    CREATE INDEX IF NOT EXISTS idx_debt_customer_id       ON debt(customer_id);
    CREATE INDEX IF NOT EXISTS idx_debt_cashier_created   ON debt(cashier_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_debt_item_barcode      ON debt(item_barcode);

    CREATE INDEX IF NOT EXISTS idx_return_barcode_created ON return(item_barcode, created_at);
    CREATE INDEX IF NOT EXISTS idx_return_sale_id         ON return(sale_id);
    CREATE INDEX IF NOT EXISTS idx_return_debt_id         ON return(debt_id);

    CREATE INDEX IF NOT EXISTS idx_product_branch_id      ON product(branch_id);
    CREATE INDEX IF NOT EXISTS idx_product_category_id    ON product(category_id);

    CREATE INDEX IF NOT EXISTS idx_cashier_branch_id      ON cashier(branch_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_sale_created_at;
    DROP INDEX IF EXISTS idx_sale_cashier_created;
    DROP INDEX IF EXISTS idx_sale_payment_type;
    DROP INDEX IF EXISTS idx_sale_item_barcode;
    DROP INDEX IF EXISTS idx_sale_not_debt_created;

    DROP INDEX IF EXISTS idx_debt_created_at;
    DROP INDEX IF EXISTS idx_debt_customer_id;
    DROP INDEX IF EXISTS idx_debt_cashier_created;
    DROP INDEX IF EXISTS idx_debt_item_barcode;

    DROP INDEX IF EXISTS idx_return_barcode_created;
    DROP INDEX IF EXISTS idx_return_sale_id;
    DROP INDEX IF EXISTS idx_return_debt_id;

    DROP INDEX IF EXISTS idx_product_branch_id;
    DROP INDEX IF EXISTS idx_product_category_id;

    DROP INDEX IF EXISTS idx_cashier_branch_id;
  `);

  await knex.raw(`
    ALTER TABLE return DROP COLUMN IF EXISTS sale_id;
    ALTER TABLE return DROP COLUMN IF EXISTS debt_id;

    ALTER TABLE debt  DROP COLUMN IF EXISTS cashier_id;
    ALTER TABLE debt  DROP COLUMN IF EXISTS real_price_at_sale;

    ALTER TABLE sale  DROP COLUMN IF EXISTS real_price_at_sale;
    ALTER TABLE sale  DROP COLUMN IF EXISTS payment_type;
  `);
}
