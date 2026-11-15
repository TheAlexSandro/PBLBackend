import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, count, eq, isNotNull, or, sql } from 'drizzle-orm';
import type { Client as PgClient } from 'pg';
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

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  private listener: PgClient | null = null;
  private reconnectTimer?: NodeJS.Timeout;
  private attempts = 0;
  private destroyed = false;
  private statsTimer?: NodeJS.Timeout;
  private statsDirty = false;

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

  private scheduleStats(): void {
    if (this.statsTimer) {
      this.statsDirty = true;
      return;
    }
    void this.broadcastTicketStats();
    this.statsTimer = setTimeout(() => {
      this.statsTimer = undefined;
      if (this.statsDirty) {
        this.statsDirty = false;
        this.scheduleStats();
      }
    }, 1000);
  }

  async onModuleInit(): Promise<void> {
    await this.listen();
  }

  private async listen(): Promise<void> {
    const url = process.env['DATABASE_URL'];
    if (!url || this.destroyed) return;

    let client: PgClient;
    try {
      const { Client } = await import('pg');
      client = new Client({
        connectionString: url,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
      });
    } catch (e) {
      this.logger.warn('Gagal memuat driver pg untuk LISTEN:', e);
      return;
    }

    let retried = false;
    const retry = () => {
      if (retried) return;
      retried = true;
      if (this.listener === client) this.listener = null;
      client.end().catch(() => {});
      if (this.destroyed) return;

      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** this.attempts,
        RECONNECT_MAX_MS,
      );
      this.attempts++;
      this.logger.warn(`LISTEN terputus, menyambung ulang dalam ${delay}ms`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        void this.listen();
      }, delay);
    };

    client.on('error', (e) => {
      this.logger.warn(`LISTEN error: ${e.message}`);
      retry();
    });
    client.on('end', retry);

    client.on('notification', (msg) => {
      if (msg.channel === 'ticket_changed') {
        this.scheduleStats();
        return;
      }
      if (msg.channel === 'config_changed') {
        const id = msg.payload;
        if (id === 'SCANNER_STATUS') {
          void this.getScannerStatus().then((a) => this.emitScannerStatus(a));
        } else if (id === 'APP_VER') {
          void this.getAppVersion().then((v) => this.emitAppVersion(v));
        }
        return;
      }
      if (msg.channel === 'scan_log_changed') {
        this.emitRefreshLogs();
      }
    });

    try {
      await client.connect();
      await client.query('LISTEN config_changed');
      await client.query('LISTEN ticket_changed');
      await client.query('LISTEN scan_log_changed');

      if (this.destroyed) {
        client.end().catch(() => {});
        return;
      }

      this.listener = client;
      const wasReconnect = this.attempts > 0;
      this.attempts = 0;
      this.logger.log('LISTEN aktif');
      if (wasReconnect) {
        void this.broadcastTicketStats();
        this.emitRefreshLogs();
      }
    } catch (e) {
      this.logger.warn('LISTEN gagal diaktifkan:', e);
      retry();
    }
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.statsTimer) clearTimeout(this.statsTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.listener?.end().catch(() => {});
    this.listener = null;
    this.server = null;
  }
}
