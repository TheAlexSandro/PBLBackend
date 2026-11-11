import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { Response } from 'express';
import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { config, scanLog, ticket } from '../../database/drizzle/schema';
import { Utils } from '../../utils/Utils';
import { SheetsService } from '../../database/sheet.service';
import { RealtimeService } from '../../realtime/realtime.service';
import {
  Callback,
  Resolution,
  SyncResult,
  TicketRow,
  toCallback,
} from '../../types/types.dto';

type ScanLogResult = 'VALID' | 'ALREADY_SCANNED' | 'NOT_FOUND';
type TicketFull = typeof ticket.$inferSelect;

const TICKET_COLS = { id: ticket.id, nama: ticket.nama, kelas: ticket.kelas };
const MIN_PARTIAL_LENGTH = 5;
const SYNC_COOLDOWN_MS = 30_000;
const CHUNK = 500;
const NOW_UTC = sql`(now() at time zone 'Asia/Jakarta')`;

const norm = (s: string) =>
  s
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();

const toIso = (v: Date | string | null): string | null => {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return `${v.replace(' ', 'T')}Z`;
};

const thisYear = () => new Date().getFullYear();

@Injectable()
export class TicketsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TicketsService.name);
  private lastSync = 0;
  private syncWaiters: Callback<SyncResult>[] | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sheets: SheetsService,
    private readonly realtime: RealtimeService,
  ) {}

  onApplicationBootstrap(): void {
    this.syncFromSheet(true, (err, r) => {
      if (err || !r) return this.logger.error(`Sync awal gagal: ${err}`);
      this.logger.log(`Sync awal: ${r.total} tiket (${r.created} baru)`);
    });
  }

  getStatus(res: Response): void {
    toCallback(
      this.db
        .select({ value: config.value })
        .from(config)
        .where(eq(config.id, 'SCANNER_STATUS'))
        .limit(1),
      (err, rows) => {
        if (err || !rows) return this.fail(res, err);
        return Utils.response(res, HttpStatus.OK, true, null, null, {
          isScannerReady: rows[0]?.value === 'true',
        });
      },
    );
  }

  changeStatus(res: Response, code: string): void {
    if (!code) {
      return Utils.response(
        res,
        HttpStatus.BAD_REQUEST,
        false,
        'Parameter code wajib diisi',
        'BAD_REQUEST',
      );
    }

    toCallback(
      this.db
        .update(config)
        .set({
          value: sql`CASE WHEN ${config.value} = 'true' THEN 'false' ELSE 'true' END`,
        })
        .where(eq(config.id, code))
        .returning({ value: config.value }),
      (err, rows) => {
        if (err || !rows) return this.fail(res, err);
        if (rows.length === 0) {
          return Utils.response(
            res,
            HttpStatus.NOT_FOUND,
            false,
            'Config tidak ditemukan',
            'NOT_FOUND',
          );
        }
        const active = rows[0]?.value === 'true';
        this.realtime.emitScannerStatus(active);
        return Utils.response(res, HttpStatus.OK, true, null, null, {
          code,
          status: active,
        });
      },
    );
  }

  clearLog(res: Response): void {
    toCallback(this.db.delete(scanLog), (err) => {
      if (err) return this.fail(res, err);
      return Utils.response(res, HttpStatus.OK, true, 'Log berhasil dihapus');
    });
  }

  sync(res: Response): void {
    this.syncFromSheet(true, (err, r) => {
      if (err || !r) {
        this.logger.error(`Gagal sync spreadsheet: ${err}`);
        return Utils.response(
          res,
          HttpStatus.BAD_GATEWAY,
          false,
          'Gagal mengambil data spreadsheet',
          'BAD_GATEWAY',
        );
      }
      return Utils.response(res, HttpStatus.OK, true, null, null, {
        total: r.total,
        created: r.created,
      });
    });
  }

  scan(res: Response, rawCode: string): void {
    const code = rawCode.trim();

    this.resolve(code, (err, found) => {
      if (err || !found) return this.fail(res, err);
      if (found.kind !== 'none') return this.respondResolved(res, code, found);
      this.syncFromSheet(false, (syncErr) => {
        if (syncErr) {
          this.logger.error(`Gagal membaca spreadsheet: ${syncErr}`);
          return Utils.response(
            res,
            HttpStatus.BAD_GATEWAY,
            false,
            'Gagal mengambil data spreadsheet',
            'BAD_GATEWAY',
          );
        }
        this.resolve(code, (err2, found2) => {
          if (err2 || !found2) return this.fail(res, err2);
          return this.respondResolved(res, code, found2);
        });
      });
    });
  }

  stats(res: Response, year?: number): void {
    if (year === undefined) return this.statsAll(res);

    if (!Number.isInteger(year) || year < 2026 || year > thisYear()) {
      return Utils.response(
        res,
        HttpStatus.BAD_REQUEST,
        false,
        'Tahun tidak valid',
        'BAD_REQUEST',
      );
    }
    return this.statsByYear(res, year);
  }

  private fail(res: Response, error: string | null): void {
    this.logger.error(error ?? 'Unknown error');
    return Utils.response(
      res,
      HttpStatus.INTERNAL_SERVER_ERROR,
      false,
      'Terjadi kesalahan pada server',
      'INTERNAL_SERVER_ERROR',
    );
  }

  private statsByYear(res: Response, year: number): void {
    const from = new Date(`${year}-01-01T00:00:00+07:00`).toISOString();
    const to = new Date(`${year + 1}-01-01T00:00:00+07:00`).toISOString();

    toCallback(
      this.db
        .select({
          total: count(),
          scanned: count(
            sql`case when ${ticket.scanned} = true
                and ${ticket.scannedAt} >= ${from}::timestamp
                and ${ticket.scannedAt} < ${to}::timestamp
              then 1 end`,
          ),
        })
        .from(ticket),
      (err, rows) => {
        if (err || !rows) return this.fail(res, err);

        const { total, scanned } = rows[0];
        return Utils.response(res, HttpStatus.OK, true, null, null, {
          year,
          total,
          scanned,
          notScanned: total - scanned,
        });
      },
    );
  }

  private statsAll(res: Response): void {
    const yr = sql<number>`extract(year from (${ticket.scannedAt} at time zone 'UTC' at time zone 'Asia/Jakarta'))::int`;

    toCallback(
      this.db
        .select({
          total: count(),
          scanned: count(sql`case when ${ticket.scanned} then 1 end`),
        })
        .from(ticket),
      (err, totals) => {
        if (err || !totals) return this.fail(res, err);

        toCallback(
          this.db
            .select({ year: yr.mapWith(Number), scanned: count() })
            .from(ticket)
            .where(and(eq(ticket.scanned, true), isNotNull(ticket.scannedAt)))
            .groupBy(yr)
            .orderBy(yr),
          (err2, perYear) => {
            if (err2 || !perYear) return this.fail(res, err2);

            const { total, scanned } = totals[0];
            return Utils.response(res, HttpStatus.OK, true, null, null, {
              total,
              scanned,
              notScanned: total - scanned,
              perYear,
            });
          },
        );
      },
    );
  }

  private respondResolved(
    res: Response,
    code: string,
    found: Resolution,
  ): void {
    if (found.kind === 'none') {
      return this.log(code, null, 'NOT_FOUND', (err) => {
        if (err) return this.fail(res, err);
        return Utils.response(
          res,
          HttpStatus.NOT_FOUND,
          false,
          'Tiket tidak ditemukan',
          'NOT_FOUND',
          {
            status: 'not_found',
            valid: false,
          },
        );
      });
    }

    if (found.kind === 'ambiguous') {
      const list = found.candidates
        .map((c) => `${c.nama} (${c.kelas})`)
        .join(', ');
      return this.log(code, null, 'NOT_FOUND', (err) => {
        if (err) return this.fail(res, err);
        return Utils.response(
          res,
          HttpStatus.CONFLICT,
          false,
          `Nama cocok dengan beberapa tiket: ${list}. Gunakan QR berisi ID atau sertakan kelas.`,
          'AMBIGUOUS',
          { status: 'ambiguous', valid: false },
        );
      });
    }

    return this.claim(found.ticket, code, (err, r) => {
      if (err || !r) return this.fail(res, err);

      const info = {
        id: r.current.id,
        name: r.current.nama,
        kelas: r.current.kelas,
      };

      if (r.claimed) {
        return Utils.response(res, HttpStatus.OK, true, 'Tiket Valid', null, {
          status: 'valid',
          valid: true,
          ticket: info,
        });
      }
      return Utils.response(
        res,
        HttpStatus.CONFLICT,
        false,
        'Tiket sudah pernah di-scan',
        'ALREADY_SCANNED',
        {
          status: 'already_scanned',
          valid: false,
          ticket: info,
          scannedAt: toIso(r.current.scannedAt),
        },
      );
    });
  }

  private resolve(code: string, cb: Callback<Resolution>): void {
    toCallback(
      this.db
        .select(TICKET_COLS)
        .from(ticket)
        .where(eq(ticket.id, code))
        .limit(1),
      (err, rows) => {
        if (err || !rows) return cb(err, null);

        if (rows[0]) return cb(null, { kind: 'found', ticket: rows[0] });
        if (/^PBL-[A-Z0-9]+$/i.test(code)) return cb(null, { kind: 'none' });

        const q = norm(code);
        if (!q) return cb(null, { kind: 'none' });

        toCallback(this.db.select(TICKET_COLS).from(ticket), (err2, all) => {
          if (err2 || !all) return cb(err2, null);
          return cb(null, this.matchByName(q, all));
        });
      },
    );
  }

  private matchByName(q: string, rows: TicketRow[]): Resolution {
    const items = rows
      .map((r) => ({ r, n: norm(r.nama), k: norm(r.kelas) }))
      .filter((x) => x.n.length > 0);

    const padded = ` ${q} `;
    const has = (needle: string) =>
      needle.length > 0 && padded.includes(` ${needle} `);
    let matches = items.filter((x) => has(x.n));

    if (matches.length > 1) {
      const longest = Math.max(...matches.map((x) => x.n.length));
      matches = matches.filter((x) => x.n.length === longest);
    }
    if (matches.length > 1) {
      const byClass = matches.filter((x) => has(x.k));
      if (byClass.length > 0) matches = byClass;
    }
    if (matches.length === 0 && q.length >= MIN_PARTIAL_LENGTH) {
      matches = items.filter((x) => x.n.includes(q));
    }

    if (matches.length === 1) return { kind: 'found', ticket: matches[0].r };
    if (matches.length > 1) {
      return {
        kind: 'ambiguous',
        candidates: matches.slice(0, 5).map((x) => x.r),
      };
    }
    return { kind: 'none' };
  }

  private claim(
    t: TicketRow,
    code: string,
    cb: Callback<{ claimed: boolean; current: TicketFull }>,
  ): void {
    toCallback(
      this.db.execute<{ result: ScanLogResult }>(sql`
        WITH upd AS (
          UPDATE "Ticket"
          SET "scanned" = true, "scannedAt" = (now() at time zone 'utc')
          WHERE "id" = ${t.id} AND "scanned" = false
          RETURNING "id"
        )
        INSERT INTO "ScanLog" ("code", "ticketId", "result")
        SELECT ${code}::text, ${t.id}::text,
               (CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 'VALID' ELSE 'ALREADY_SCANNED' END)::"ScanResult"
        RETURNING "result"
      `),
      (err, out) => {
        if (err || !out) return cb(err, null);
        const claimed = out.rows[0]?.result === 'VALID';

        toCallback(
          this.db.select().from(ticket).where(eq(ticket.id, t.id)).limit(1),
          (err2, rows) => {
            if (err2 || !rows) return cb(err2, null);
            if (!rows[0])
              return cb('Tiket tidak ditemukan setelah klaim', null);
            return cb(null, { claimed, current: rows[0] });
          },
        );
      },
    );
  }

  private log(
    code: string,
    ticketId: string | null,
    result: ScanLogResult,
    cb: Callback<unknown>,
  ): void {
    toCallback(this.db.insert(scanLog).values({ code, ticketId, result }), cb);
  }

  syncFromSheet(force: boolean, cb: Callback<SyncResult>): void {
    if (this.syncWaiters) {
      this.syncWaiters.push(cb);
      return;
    }
    if (!force && Date.now() - this.lastSync < SYNC_COOLDOWN_MS) {
      return cb(null, { total: 0, created: 0 });
    }

    this.syncWaiters = [cb];
    this.doSync((err, result) => {
      const waiters = this.syncWaiters ?? [];
      this.syncWaiters = null;
      waiters.forEach((fn) => fn(err, result));
    });
  }

  private doSync(cb: Callback<SyncResult>): void {
    this.sheets.fetchTickets((err: any, fetched: any) => {
      if (err || !fetched) return cb(err, null);

      const rows = [...new Map(fetched.map((r: any) => [r.id, r])).values()];
      this.countTickets((e1, before) => {
        if (e1 || before === null) return cb(e1, null);

        //@ts-ignore
        this.upsertChunks(rows, 0, (e2) => {
          if (e2) return cb(e2, null);

          this.countTickets((e3, after) => {
            if (e3 || after === null) return cb(e3, null);
            this.lastSync = Date.now();
            return cb(null, { total: rows.length, created: after - before });
          });
        });
      });
    });
  }

  private countTickets(cb: Callback<number>): void {
    toCallback(this.db.select({ n: count() }).from(ticket), (err, rows) => {
      if (err || !rows) return cb(err, null);
      return cb(null, rows[0].n);
    });
  }

  private upsertChunks(
    rows: TicketRow[],
    start: number,
    cb: Callback<boolean>,
  ): void {
    if (start >= rows.length) return cb(null, true);

    const chunk = rows.slice(start, start + CHUNK).map((r) => ({
      id: r.id,
      nama: r.nama,
      kelas: r.kelas,
      updatedAt: NOW_UTC,
    }));

    toCallback(
      this.db
        .insert(ticket)
        .values(chunk)
        .onConflictDoUpdate({
          target: ticket.id,
          set: {
            nama: sql`excluded."nama"`,
            kelas: sql`excluded."kelas"`,
            updatedAt: NOW_UTC,
          },
          setWhere: sql`${ticket.nama} is distinct from excluded."nama" or ${ticket.kelas} is distinct from excluded."kelas"`,
        }),
      (err) => {
        if (err) return cb(err, null);
        return this.upsertChunks(rows, start + CHUNK, cb);
      },
    );
  }
}
