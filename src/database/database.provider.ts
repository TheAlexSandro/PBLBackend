import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './drizzle/schema';

export const PG_POOL = 'PG_POOL';
export const DB = 'DB';
export type Database = NodePgDatabase<typeof schema>;

export const databaseProviders = [
  {
    provide: PG_POOL,
    useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
  },
  {
    provide: DB,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
