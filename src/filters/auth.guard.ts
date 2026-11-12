import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { session } from '../database/drizzle/schema';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const sessionId = this.getSessionId(req);

    if (!sessionId) this.reject();

    try {
      const rows = await this.db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.id, sessionId!),
            gt(session.expiredAt, new Date().toISOString()),
          ),
        )
        .limit(1);

      if (!rows.length) this.reject();
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(err instanceof Error ? err.message : String(err));
      this.reject();
    }
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

  private reject(): never {
    throw new UnauthorizedException({
      status: false,
      message: 'Belum login atau sesi sudah berakhir',
      code: 'UNAUTHORIZED',
    });
  }
}
