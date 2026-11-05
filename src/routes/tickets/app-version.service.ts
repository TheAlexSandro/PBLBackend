import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { config } from '../../database/drizzle/schema';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';

@Injectable()
export class AppVersionService {
  private static readonly TTL_MS = 10_000;
  private cache?: { value: string; at: number };
  private inflight?: Promise<string>;

  constructor(@Inject(DB) private readonly db: Database) {}

  async getMinVersion(): Promise<string> {
    const cached = this.cache;
    if (cached && Date.now() - cached.at < AppVersionService.TTL_MS) {
      return cached.value;
    }

    this.inflight ??= this.load().finally(() => {
      this.inflight = undefined;
    });

    try {
      return await this.inflight;
    } catch {
      if (cached) return cached.value;
      throw new ServiceUnavailableException('Gagal memeriksa versi aplikasi');
    }
  }

  private async load(): Promise<string> {
    const rows = await this.db
      .select({ value: config.value })
      .from(config)
      .where(eq(config.id, 'APP_VER'));

    const value = String(rows[0]?.value).trim();

    this.cache = { value, at: Date.now() };
    return value;
  }
}
