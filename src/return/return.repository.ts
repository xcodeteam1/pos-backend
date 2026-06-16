import { Injectable } from '@nestjs/common';
import knex from 'knex';
import knexConfig from '../../knexfile';
const db = knex(knexConfig);

const createReturnQuery: string = `
        INSERT INTO return(
        item_barcode,
        quantity,
        description,
        sale_id,
        debt_id
        )
        VALUES(?,?,?,?,?)
        RETURNING *;
`;

const updateProductQuantityQuery: string = `
        UPDATE product
            SET 
            stock = stock + ?
        WHERE barcode = ?
        RETURNING *;
`;
const selectAllReturnQUery: string = `
        SELECT *FROM return;
`;
@Injectable()
export class ReturnRepo {
  async selectAllReturn() {
    const res = await db.raw(selectAllReturnQUery);
    return res.rows;
  }
  async createReturn(data: {
    item_barcode: string;
    quantity: number;
    description: string;
    sale_id?: number;
    debt_id?: number;
  }) {
    const res = await db.raw(createReturnQuery, [
      data.item_barcode,
      data.quantity,
      data.description,
      data.sale_id ?? null,
      data.debt_id ?? null,
    ]);
    await db.raw(updateProductQuantityQuery, [
      data.quantity,
      data.item_barcode,
    ]);
    return res.rows[0];
  }
}
