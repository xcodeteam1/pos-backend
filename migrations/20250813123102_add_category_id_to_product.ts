import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.raw(`
    ALTER TABLE product
      ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES category(id) ON DELETE CASCADE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  return knex.raw(`
    ALTER TABLE product
      DROP COLUMN IF EXISTS category_id;
  `);
}
