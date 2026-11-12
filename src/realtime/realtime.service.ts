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
import type { Request, Response } from 'express';
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { config, ticket } from '../database/drizzle/schema';
import { randomBytes } from 'crypto';
import { Utils } from '../utils/Utils';

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
  private readonly tickets = new Map<string, number>();

  constructor(@Inject(DB) private readonly db: Database) {}

  bind(server: Server): void {
    this.server = server;
  }

  issueTicket(req: Request, res: Response): void {
    const getCookie = this.getSessionId(req);
    if (!getCookie)
      return Utils.response(
        res,
        HttpStatus.UNAUTHORIZED,
        false,
        'Unauthorized',
        'UNAUTHORIZED',
      );
    const now = Date.now();
    for (const [t, exp] of this.tickets) if (exp <= now) this.tickets.delete(t);

    const ticket = randomBytes(24).toString('base64url');
    const t = `${getCookie}-${ticket}`;
    this.tickets.set(t, now + 30_000);
    return Utils.response(res, HttpStatus.OK, true, 'Success!', null, {
      ticket: t,
    });
  }

  consumeTicket(ticket: unknown): boolean {
    if (typeof ticket !== 'string') return false;
    const exp = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return exp !== undefined && exp > Date.now();
  }

  private getSessionId(req: Request): string | null {
    if (req.cookies?.[String(process.env['COOKIE_KEY'])])
      return req.cookies[String(process.env['COOKIE_KEY'])];

    const header = req.headers.cookie;
    if (!header) return null;

    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === String(process.env['COOKIE_KEY'])) {
        return decodeURIComponent(rest.join('='));
      }
    }
    return null;
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
      client.on('notification', (msg) => {
        if (msg.channel === 'ticket_changed') {
          void this.broadcastTicketStats();
          return;
        }
        if (msg.channel === 'config_changed') {
          const id = msg.payload;
          if (id === 'SCANNER_STATUS') {
            void this.getScannerStatus().then((a) => this.emitScannerStatus(a));
          } else if (id === 'APP_VER' || id === 'APP_DESC') {
            void this.getAppVersion().then((v) => this.emitAppVersion(v));
          }
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
