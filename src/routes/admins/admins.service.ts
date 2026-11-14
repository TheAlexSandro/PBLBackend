import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { and, count, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { Utils } from '../../utils/Utils';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { ticket, scanLog, config } from '../../database/drizzle/schema';
import { toCallback, Callback } from '../../types/types.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const TICKET_TYPES = ['SCANNED', 'NOT_SCANNED', 'TOTAL'] as const;
type TicketType = (typeof TICKET_TYPES)[number];

const toIso = (v: Date | string | null): string | null => {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  return `${v.replace(' ', 'T')}Z`;
};

const thisYear = () => new Date().getFullYear();

const MAX_QUERY_LENGTH = 100;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');
const normalizeClass = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  private isFinal(cb: Callback<boolean>): void {
    toCallback(
      this.db
        .select({ value: config.value })
        .from(config)
        .where(eq(config.id, 'IS_FINAL'))
        .limit(1),
      (err, rows) => {
        if (err || !rows) return cb(err, null);
        const isFinal = Utils.isFinalYear(rows[0].value, Utils.getThisYear());
        return cb(null, isFinal);
      },
    );
  }

  makeFinal(res: Response) {
    toCallback(
      this.db.select({ total: count() }).from(ticket),
      (err, totals) => {
        if (err || !totals) return this.fail(res, err);

        const total = totals[0].total;
        if (total <= 0) {
          return Utils.response(
            res,
            HttpStatus.NOT_FOUND,
            false,
            'Tidak ada tiket untuk ditinjau.',
            'TICKET_EMPTY',
          );
        }

        toCallback(
          this.db
            .select({ id: config.id, value: config.value })
            .from(config)
            .where(eq(config.id, 'IS_FINAL')),
          (err, rows) => {
            if (err || !rows?.length) return this.fail(res, err);
            const isFinal = String(rows[0].value);
            const value =
              isFinal === '-'
                ? Utils.getThisYear()
                : `${isFinal},${Utils.getThisYear()}`;

            toCallback(
              this.db
                .insert(config)
                .values({ id: 'IS_FINAL', value })
                .onConflictDoUpdate({
                  target: config.id,
                  set: { value },
                })
                .returning({ value: config.value }),
              (err, rows) => {
                if (err || !rows?.length) return this.fail(res, err);
                return Utils.response(
                  res,
                  HttpStatus.OK,
                  true,
                  'Tiket sudah difinalkan',
                  null,
                  {
                    isFinal: rows[0].value === 'true',
                  },
                );
              },
            );
          },
        );
      },
    );
  }

  getInfo(res: Response) {
    this.isFinal((err, final) => {
      if (err || final === null) return this.fail(res, err);
      return Utils.response(res, HttpStatus.OK, true, 'Success!', null, {
        isFinal: final,
      });
    });
  }

  getLogs(res: Response, pageRaw?: string, limitRaw?: string) {
    const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(limitRaw ?? '', 10) || DEFAULT_LIMIT),
    );

    toCallback(this.db.select({ n: count() }).from(scanLog), (e1, c) => {
      if (e1 || !c) return this.fail(res, e1);

      toCallback(
        this.db
          .select()
          .from(scanLog)
          .orderBy(desc(scanLog.id))
          .limit(limit)
          .offset((page - 1) * limit),
        (e2, rows) => {
          if (e2 || !rows) return this.fail(res, e2);
          return Utils.response(res, HttpStatus.OK, true, 'Success!', null, {
            page,
            limit,
            total: c[0].n,
            logs: rows,
          });
        },
      );
    });
  }

  getTickets(
    res: Response,
    typeRaw?: string,
    yearRaw?: string,
    pageRaw?: string,
    limitRaw?: string,
  ): void {
    const type = (typeRaw ? typeRaw.toUpperCase() : 'TOTAL') as TicketType;
    const year = yearRaw ? Number(yearRaw) : undefined;
    const page = pageRaw ? Number(pageRaw) : 1;
    const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;

    const bad = (msg: string) =>
      Utils.response(res, HttpStatus.BAD_REQUEST, false, msg, 'BAD_REQUEST');

    if (!TICKET_TYPES.includes(type)) {
      return bad(
        `Parameter type harus salah satu dari: ${TICKET_TYPES.join(', ')}`,
      );
    }
    if (
      year !== undefined &&
      (!Number.isInteger(year) || year < 2026 || year > thisYear())
    ) {
      return bad('Tahun tidak valid');
    }
    if (!Number.isInteger(page) || page < 1) {
      return bad('Parameter page tidak valid');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return bad(`Parameter limit harus 1-${MAX_LIMIT}`);
    }

    const dateCol = type === 'SCANNED' ? ticket.scannedAt : ticket.createdAt;

    const conditions: SQL[] = [];
    if (type === 'SCANNED') {
      conditions.push(eq(ticket.scanned, true), isNotNull(ticket.scannedAt));
    } else if (type === 'NOT_SCANNED') {
      conditions.push(eq(ticket.scanned, false));
    }

    if (year !== undefined) {
      const from = new Date(`${year}-01-01T00:00:00+07:00`).toISOString();
      const to = new Date(`${year + 1}-01-01T00:00:00+07:00`).toISOString();
      conditions.push(
        sql`${dateCol} >= ${from}::timestamp`,
        sql`${dateCol} < ${to}::timestamp`,
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;

    this.isFinal((err, final) => {
      if (err || final === null) return this.fail(res, err);
      if (type !== 'TOTAL' && !final) {
        return Utils.response(res, HttpStatus.OK, true, null, null, {
          type,
          year: year ?? null,
          page,
          limit,
          data: [],
        });
      }

      toCallback(
        this.db.select({ total: count() }).from(ticket).where(where),
        (err, totals) => {
          if (err || !totals) return this.fail(res, err);

          const total = totals[0].total;

          toCallback(
            this.db
              .select()
              .from(ticket)
              .where(where)
              .orderBy(desc(dateCol), ticket.id)
              .limit(limit)
              .offset((page - 1) * limit),
            (err2, rows) => {
              if (err2 || !rows) return this.fail(res, err2);

              return Utils.response(res, HttpStatus.OK, true, null, null, {
                type,
                year: year ?? null,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                data: rows.map((r) => ({
                  ...r,
                  scannedAt: toIso(r.scannedAt),
                })),
              });
            },
          );
        },
      );
    });
  }

  searchTickets(
    res: Response,
    qRaw?: string,
    typeRaw?: string,
    yearRaw?: string,
    pageRaw?: string,
    limitRaw?: string,
  ): void {
    const q = (qRaw ?? '').trim().replace(/\s+/g, ' ');
    const type = (typeRaw ? typeRaw.toUpperCase() : 'TOTAL') as TicketType;
    const year = yearRaw ? Number(yearRaw) : thisYear();
    const page = pageRaw ? Number(pageRaw) : 1;
    const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;

    const bad = (msg: string) =>
      Utils.response(res, HttpStatus.BAD_REQUEST, false, msg, 'BAD_REQUEST');

    if (!q || !/[\p{L}\p{N}]/u.test(q)) return bad('Parameter q wajib diisi');
    if (q.length > MAX_QUERY_LENGTH) {
      return bad(`Parameter q maksimal ${MAX_QUERY_LENGTH} karakter`);
    }
    if (!TICKET_TYPES.includes(type)) {
      return bad(
        `Parameter type harus salah satu dari: ${TICKET_TYPES.join(', ')}`,
      );
    }
    if (!Number.isInteger(year) || year < 2026 || year > thisYear()) {
      return bad('Tahun tidak valid');
    }
    if (!Number.isInteger(page) || page < 1) {
      return bad('Parameter page tidak valid');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return bad(`Parameter limit harus 1-${MAX_LIMIT}`);
    }

    const dateCol = type === 'SCANNED' ? ticket.scannedAt : ticket.createdAt;
    const baseConds: SQL[] = [];
    if (type === 'SCANNED') {
      baseConds.push(eq(ticket.scanned, true), isNotNull(ticket.scannedAt));
    } else if (type === 'NOT_SCANNED') {
      baseConds.push(eq(ticket.scanned, false));
    }

    const from = new Date(`${year}-01-01T00:00:00+07:00`).toISOString();
    const to = new Date(`${year + 1}-01-01T00:00:00+07:00`).toISOString();
    baseConds.push(
      sql`${dateCol} >= ${from}::timestamp`,
      sql`${dateCol} < ${to}::timestamp`,
    );

    const mapRows = (rows: (typeof ticket.$inferSelect)[]) =>
      rows.map((r) => ({ ...r, scannedAt: toIso(r.scannedAt) }));

    const classCond = sql`regexp_replace(lower(${ticket.kelas}), '[[:space:]_-]+', '', 'g') = ${normalizeClass(q)}`;

    toCallback(
      this.db
        .select()
        .from(ticket)
        .where(and(...baseConds, classCond))
        .orderBy(ticket.nama, ticket.id),
      (err, classRows) => {
        if (err || !classRows) return this.fail(res, err);

        if (classRows.length) {
          return Utils.response(res, HttpStatus.OK, true, null, null, {
            mode: 'CLASS',
            q,
            type,
            year,
            page: 1,
            limit: classRows.length,
            total: classRows.length,
            totalPages: 1,
            data: mapRows(classRows),
          });
        }

        const pattern = `%${escapeLike(q)}%`;
        const where = and(
          ...baseConds,
          or(
            ilike(ticket.nama, pattern),
            ilike(ticket.kelas, pattern),
            sql`${ticket.id}::text ilike ${pattern}`,
          ),
        );

        toCallback(
          this.db.select({ total: count() }).from(ticket).where(where),
          (err2, totals) => {
            if (err2 || !totals) return this.fail(res, err2);

            const total = totals[0].total;

            toCallback(
              this.db
                .select()
                .from(ticket)
                .where(where)
                .orderBy(ticket.nama, ticket.id)
                .limit(limit)
                .offset((page - 1) * limit),
              (err3, rows) => {
                if (err3 || !rows) return this.fail(res, err3);

                return Utils.response(res, HttpStatus.OK, true, null, null, {
                  mode: 'SEARCH',
                  q,
                  type,
                  year,
                  page,
                  limit,
                  total,
                  totalPages: Math.ceil(total / limit),
                  data: mapRows(rows),
                });
              },
            );
          },
        );
      },
    );
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
}
