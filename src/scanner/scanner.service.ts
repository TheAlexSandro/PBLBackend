import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SheetsService } from './sheets.service.js';
import { Prisma } from '../generated/prisma/client.js';

export interface ScanResponse {
  valid: boolean;
  message: string;
  ticket?: { id: string; name: string; kelas: string };
  scannedAt?: Date | null;
}

export interface SyncResult {
  total: number;
  created: number;
}

const SYNC_COOLDOWN_MS = 30_000;
const CHUNK = 500;

@Injectable()
export class ScannerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScannerService.name);
  private lastSync = 0;
  private syncing: Promise<SyncResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sheets: SheetsService,
  ) {}

  async onApplicationBootstrap() {
    try {
      const r = await this.syncFromSheet(true);
      this.logger.log(`Sync awal: ${r.total} tiket (${r.created} baru)`);
    } catch (e) {
      this.logger.error('Sync awal gagal', e as Error);
    }
  }

  async scan(rawCode: string): Promise<ScanResponse> {
    const code = rawCode.trim();

    let ticket = await this.prisma.ticket.findUnique({ where: { id: code } });

    if (!ticket) {
      try {
        await this.syncFromSheet();
      } catch (e) {
        this.logger.error('Gagal membaca spreadsheet', e as Error);
        throw new ServiceUnavailableException(
          'Gagal mengambil data spreadsheet',
        );
      }
      ticket = await this.prisma.ticket.findUnique({ where: { id: code } });
    }

    if (!ticket) {
      await this.prisma.scanLog.create({
        data: { code, ticketId: null, result: 'NOT_FOUND' },
      });
      return { valid: false, message: 'Tiket tidak ditemukan' };
    }

    const found = ticket;
    const { claimed, current } = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { id: found.id, scanned: false },
        data: { scanned: true, scannedAt: new Date() },
      });
      await tx.scanLog.create({
        data: {
          code,
          ticketId: found.id,
          result: count === 1 ? 'VALID' : 'ALREADY_SCANNED',
        },
      });
      const current = await tx.ticket.findUniqueOrThrow({
        where: { id: found.id },
      });
      return { claimed: count === 1, current };
    });

    const info = { id: current.id, name: current.nama, kelas: current.kelas };

    if (claimed) {
      return { valid: true, message: 'Tiket valid', ticket: info };
    }
    return {
      valid: false,
      message: 'Tiket sudah pernah di-scan',
      ticket: info,
      scannedAt: current.scannedAt,
    };
  }

  async syncFromSheet(force = false): Promise<SyncResult> {
    if (this.syncing) return this.syncing;
    if (!force && Date.now() - this.lastSync < SYNC_COOLDOWN_MS) {
      return { total: 0, created: 0 };
    }

    this.syncing = this.doSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async doSync(): Promise<SyncResult> {
    const fetched = await this.sheets.fetchTickets();
    const rows = [...new Map(fetched.map((r) => [r.id, r])).values()];

    const before = await this.prisma.ticket.count();

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values = chunk.map(
        (r) => Prisma.sql`(${r.id}, ${r.nama}, ${r.kelas}, NOW())`,
      );

      await this.prisma.$executeRaw`
      INSERT INTO "Ticket" ("id", "nama", "kelas", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("id") DO UPDATE
      SET "nama" = EXCLUDED."nama",
          "kelas" = EXCLUDED."kelas",
          "updatedAt" = NOW()
      WHERE "Ticket"."nama" IS DISTINCT FROM EXCLUDED."nama"
         OR "Ticket"."kelas" IS DISTINCT FROM EXCLUDED."kelas"
    `;
    }

    const after = await this.prisma.ticket.count();
    this.lastSync = Date.now();
    return { total: rows.length, created: after - before };
  }

  async stats(year?: number) {
    if (year !== undefined) {
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new BadRequestException('Tahun tidak valid');
      }

      const from = new Date(`${year}-01-01T00:00:00+07:00`);
      const to = new Date(`${year + 1}-01-01T00:00:00+07:00`);

      const scanned = await this.prisma.ticket.count({
        where: { scanned: true, scannedAt: { gte: from, lt: to } },
      });
      return { year, scanned };
    }

    const [total, scanned, perYear] = await Promise.all([
      this.prisma.ticket.count(),
      this.prisma.ticket.count({ where: { scanned: true } }),
      this.prisma.$queryRaw<{ year: number; scanned: number }[]>`
      SELECT
        EXTRACT(YEAR FROM ("scannedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta'))::int AS year,
        COUNT(*)::int AS scanned
      FROM "Ticket"
      WHERE "scanned" = true AND "scannedAt" IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `,
    ]);

    return { total, scanned, notScanned: total - scanned, perYear };
  }
}
