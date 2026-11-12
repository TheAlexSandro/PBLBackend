import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import type { Response, Request } from 'express';
import { Utils } from '../../utils/Utils';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { config, session } from '../../database/drizzle/schema';
import { toCallback } from '../../types/types.dto';
import { eq, lt } from 'drizzle-orm';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  signIn(res: Response, pwd: string) {
    if (!pwd) {
      return Utils.response(
        res,
        HttpStatus.BAD_REQUEST,
        false,
        'Parameter pwd wajib diisi',
        'BAD_REQUEST',
      );
    }

    toCallback(
      this.db
        .select({ id: config.id, value: config.value })
        .from(config)
        .where(eq(config.id, 'PWD')),
      (err, rows) => {
        if (err || !rows || !rows.length) return this.fail(res, err);

        // kata sandi tidak pernah dienkripsi di database, ini hanya untuk mempermudah :)
        if (rows[0].value !== pwd) {
          return Utils.response(
            res,
            HttpStatus.UNAUTHORIZED,
            false,
            'Invalid password',
            'INVALID_PASSWORD',
          );
        }

        const logId = Utils.generateID(100);
        const maxAge = Number(process.env['COOKIE_MAXAGE']);
        const now = Date.now();
        const nowIso = new Date(now).toISOString();

        toCallback(
          this.db.delete(session).where(lt(session.expiredAt, nowIso)),
          (err) => {
            if (err) return this.fail(res, err);

            toCallback(
              this.db.insert(session).values({
                id: logId,
                loginAt: nowIso,
                expiredAt: new Date(now + maxAge).toISOString(),
              }),
              (err) => {
                if (err) return this.fail(res, err);

                res.cookie('log.sessionId', logId, {
                  ...this.cookieOptions(),
                  maxAge,
                });

                return Utils.response(res, HttpStatus.OK, true, 'Success!');
              },
            );
          },
        );
      },
    );
  }

  signOut(res: Response, req: Request) {
    const sessionId = req.cookies?.['log.sessionId'];
    const done = () => {
      res.clearCookie('log.sessionId', this.cookieOptions());
      return Utils.response(res, HttpStatus.OK, true, 'Success!');
    };
    if (!sessionId) return done();

    toCallback(
      this.db.delete(session).where(eq(session.id, sessionId)),
      (err) => {
        if (err) return this.fail(res, err);
        return done();
      },
    );
  }

  private cookieOptions() {
    return {
      secure: true,
      httpOnly: true,
      sameSite: process.env['COOKIE_SAMESITE'] as 'lax' | 'strict' | 'none',
      path: '/',
      //domain: String(process.env['COOKIE_DOMAIN'])
    };
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
