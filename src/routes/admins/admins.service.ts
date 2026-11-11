import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { and, count, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { Utils } from '../../utils/Utils';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { ticket } from '../../database/drizzle/schema';
import { toCallback } from '../../types/types.dto';

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

  isLoggedIn(res: Response) {
    return Utils.response(res, HttpStatus.OK, true, 'Success!');
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
              year: year ?? thisYear(),
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
