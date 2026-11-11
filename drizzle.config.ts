import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/drizzle/schema.ts',
  out: './src/database/drizzle',
  dialect: 'postgresql',
  //@ts-ignore
  dbCredentials: { url: process.env['DATABASE_URL'] },
  tablesFilter: ['Ticket', 'ScanLog', 'Config', 'Session'],
  entities: {
    roles: { provider: 'supabase' },
  },
});
