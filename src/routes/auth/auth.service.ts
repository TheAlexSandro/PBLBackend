import { Injectable, Inject, Logger, HttpStatus } from '@nestjs/common';
import type { Response, Request } from 'express';
import { Utils } from '../../utils/Utils';
import { DB } from '../../database/database.provider';
import type { Database } from '../../database/database.provider';
import { session, user } from '../../database/drizzle/schema';
import { toCallback } from '../../types/types.dto';
import { eq, lt, and, gt, or } from 'drizzle-orm';

const maxAge = Number(process.env['COOKIE_MAXAGE']);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  isLoggedIn(res: Response) {
    return Utils.response(res, HttpStatus.OK, true, 'Success!');
  }

  signIn(res: Response, username: string, pwd: string) {
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
        .select({ username: user.username })
        .from(user)
        .where(and(eq(user.username, username), eq(user.password, pwd))),
      (err, rows) => {
        if (err) return this.fail(res, err);
        if (!rows || !rows.length)
          return Utils.response(
            res,
            HttpStatus.UNAUTHORIZED,
            false,
            'Username atau kata sandi tidak valid',
            'UNAUTHORIZED',
          );

        const logId = Utils.generateID(100);
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
                key: String(process.env['COOKIE_KEY']),
              }),
              (err) => {
                if (err) return this.fail(res, err);

                res.cookie(String(process.env['COOKIE_KEY']), logId, {
                  ...this.cookieOptions(
                    String(process.env['COOKIE_SAMESITE']) as
                      'lax' | 'strict' | 'none',
                    String(process.env['ENV']) !== 'dev',
                  ),
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
    const loginKey = String(process.env['COOKIE_KEY']);
    const wsKey = String(process.env['COOKIE_WS']);
    const sessionId = req.cookies?.[loginKey];
    const wsToken = req.cookies?.[wsKey];

    const done = () => {
      res.clearCookie(loginKey, this.cookieOptions());
      res.clearCookie(wsKey, this.cookieOptions());
      return Utils.response(res, HttpStatus.OK, true, 'Success!');
    };

    const conditions = [];
    if (sessionId)
      conditions.push(
        and(eq(session.id, sessionId), eq(session.key, loginKey)),
      );
    if (wsToken)
      conditions.push(and(eq(session.id, wsToken), eq(session.key, wsKey)));

    if (!conditions.length) return done();

    toCallback(this.db.delete(session).where(or(...conditions)), (err) => {
      if (err) return this.fail(res, err);
      return done();
    });
  }

  requestConnect(res: Response, req: Request) {
    const wsToken = req.cookies?.[String(process.env['COOKIE_WS'])];

    toCallback(
      this.db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.id, wsToken!),
            gt(session.expiredAt, new Date().toISOString()),
            eq(session.key, String(process.env['COOKIE_WS'])),
          ),
        )
        .limit(1),
      (err, ro) => {
        if (err) return this.fail(res, err);
        if (ro?.length) {
          return Utils.response(
            res,
            HttpStatus.OK,
            true,
            'Already connected!',
            null,
            {
              'ws.access': ro[0].id,
            },
          );
        }
        const genId = Utils.generateID(10);
        const taId = `ws_-${genId}`;
        const now = Date.now();
        const nowIso = new Date(now).toISOString();

        toCallback(
          this.db.insert(session).values({
            id: taId,
            loginAt: nowIso,
            expiredAt: new Date(now + maxAge).toISOString(),
            key: String(process.env['COOKIE_WS']),
          }),
          (err) => {
            if (err) return this.fail(res, err);

            res.cookie(String(process.env['COOKIE_WS']), taId, {
              ...this.cookieOptions(),
              maxAge,
            });

            return Utils.response(res, HttpStatus.OK, true, 'Success!', null, {
              'ws.access': taId,
            });
          },
        );
      },
    );
  }

  private cookieOptions(
    sameSite?: 'lax' | 'strict' | 'none',
    useDomain?: boolean,
  ) {
    return {
      secure: true,
      httpOnly: true,
      sameSite: sameSite ?? 'none',
      path: '/',
      ...(useDomain ? { domain: String(process.env['COOKIE_DOMAIN']) } : {}),
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
