import { Global, Module } from '@nestjs/common';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';

export const KNEX_CONNECTION = 'KNEX_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: KNEX_CONNECTION,
      useFactory: (): Knex => knex(knexConfig),
    },
  ],
  exports: [KNEX_CONNECTION],
})
export class DatabaseModule {}
