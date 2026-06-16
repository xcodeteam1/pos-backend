import type { Knex } from 'knex';

/**
 * Вводит понятие "чек/заказ" (receipt) для таблицы sale.
 *
 * Все позиции одной продажи (одной корзины) пишутся в одной транзакции и
 * получают единый receipt_id. Существующие строки бэкфилятся детерминированным
 * ключом (cashier_id + created_at): позиции одной корзины уже имеют идентичный
 * created_at (время старта транзакции в Postgres), поэтому группировка корректна.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE sale ADD COLUMN IF NOT EXISTS receipt_id UUID;`);

  await knex.raw(`
    UPDATE sale
    SET receipt_id = md5(COALESCE(cashier_id::text, '0') || '_' || created_at::text)::uuid
    WHERE receipt_id IS NULL;
  `);

  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_sale_receipt_id ON sale(receipt_id);`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_sale_receipt_id;`);
  await knex.raw(`ALTER TABLE sale DROP COLUMN IF EXISTS receipt_id;`);
}
