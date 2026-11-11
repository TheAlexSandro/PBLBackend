import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { eq, or } from 'drizzle-orm';
import type { Server } from 'socket.io';
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { config } from '../database/drizzle/schema';

export type ScannerStatusEvent = { active: boolean };
export type AppVersionEvent = {
  latestVersion: string;
  description: string;
  url: string;
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

  emitScannerStatus(active: boolean): void {
    this.server?.emit('scanner:status', {
      active,
    } satisfies ScannerStatusEvent);
  }

  emitAppVersion(info: AppVersionEvent): void {
    this.server?.emit('app:version', info);
  }

  async onModuleInit(): Promise<void> {
    const url = process.env['DATABASE_URL'];
    if (!url) return;
    try {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.query('LISTEN config_changed');
      client.on('notification', (msg) => {
        const id = msg.payload;
        if (id === 'SCANNER_STATUS') {
          void this.getScannerStatus().then((a) => this.emitScannerStatus(a));
        } else if (id === 'APP_VER' || id === 'APP_DESC') {
          void this.getAppVersion().then((v) => this.emitAppVersion(v));
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
