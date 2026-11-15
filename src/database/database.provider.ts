import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './drizzle/schema';

export const PG_POOL = 'PG_POOL';
export const DB = 'DB';
export type Database = NodePgDatabase<typeof schema>;

export const databaseProviders = [
  {
    provide: PG_POOL,
    useFactory: () => {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000,
        keepAlive: true,
      });

      pool.on('error', (e) => console.error('PG pool error:', e.message));

      return pool;
    },
  },
  {
    provide: DB,
    inject: [PG_POOL],
    useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
  },
];
