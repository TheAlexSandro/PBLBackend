import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, count, eq, isNotNull, or, sql } from 'drizzle-orm';
import type { Server } from 'socket.io';
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { config, ticket } from '../database/drizzle/schema';

export type ScannerStatusEvent = { active: boolean };
export type AppVersionEvent = {
  latestVersion: string;
  description: string;
  url: string;
};
export type TicketStatsEvent = {
  scanned: number;
  notScanned: number;
  total: number;
  perYear: { year: number; scanned: number }[];
};

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  bind(server: Server): void {
    this.server = server;
  }

  async getScannerStatus(): Promise<boolean> {
    const rows = await this.db
      .select({ value: config.value })
      .from(config)
      .where(eq(config.id, 'SCANNER_STATUS'))
      .limit(1);
    return rows[0]?.value === 'true';
  }

  async getAppVersion(): Promise<AppVersionEvent> {
    const rows = await this.db
      .select({ id: config.id, value: config.value })
      .from(config)
      .where(or(eq(config.id, 'APP_VER'), eq(config.id, 'APP_DESC')));

    return {
      latestVersion: rows.find((r) => r.id === 'APP_VER')?.value ?? '',
      description: rows.find((r) => r.id === 'APP_DESC')?.value ?? '',
      url: process.env['DOWNLOAD_URL'] ?? '',
    };
  }

  async getTicketStats(): Promise<TicketStatsEvent> {
    const yr = sql<number>`extract(year from (${ticket.scannedAt} at time zone 'UTC' at time zone 'Asia/Jakarta'))::int`;

    const [[totals], perYear] = await Promise.all([
      this.db
        .select({
          total: count(),
          scanned: count(sql`case when ${ticket.scanned} then 1 end`),
        })
        .from(ticket),
      this.db
        .select({ year: yr.mapWith(Number), scanned: count() })
        .from(ticket)
        .where(and(eq(ticket.scanned, true), isNotNull(ticket.scannedAt)))
        .groupBy(yr)
        .orderBy(yr),
    ]);

    return {
      scanned: totals.scanned,
      notScanned: totals.total - totals.scanned,
      total: totals.total,
      perYear,
    };
  }

  emitScannerStatus(active: boolean): void {
    this.server?.emit('scanner:status', {
      active,
    } satisfies ScannerStatusEvent);
  }

  emitAppVersion(info: AppVersionEvent): void {
    this.server?.emit('app:version', info);
  }

  emitTicketStats(stats: TicketStatsEvent): void {
    this.server?.emit('ticket:stats', stats);
  }

  emitRefreshLogs(): void {
    this.server?.emit('ticket:refreshLogs', true);
  }

  async broadcastTicketStats(): Promise<void> {
    try {
      this.emitTicketStats(await this.getTicketStats());
    } catch (e) {
      this.logger.warn('Gagal broadcast ticket:stats', e);
    }
  }

  async onModuleInit(): Promise<void> {
    const url = process.env['DATABASE_URL'];
    if (!url) return;
    try {
      
      const { Client } = await import('pg');
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.query('LISTEN config_changed');
      await client.query('LISTEN ticket_changed');
      await client.query('LISTEN scan_log_changed');
      client.on('notification', (msg) => {
        if (msg.channel === 'ticket_changed') {
          void this.broadcastTicketStats();
          return;
        }
        if (msg.channel === 'config_changed') {
          const id = msg.payload;
          if (id === 'SCANNER_STATUS') {
            void this.getScannerStatus().then((a) => this.emitScannerStatus(a));
          } else if (id === 'APP_VER') {
            void this.getAppVersion().then((v) => this.emitAppVersion(v));
          }
        }
        if (msg.channel === 'scan_log_changed') {
          void this.emitRefreshLogs();
        }
      });
    } catch (e) {
      this.logger.warn('LISTEN config_changed tidak aktif:', e);
    }
  }

  onModuleDestroy(): void {
    this.server = null;
  }
}
