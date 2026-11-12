import {
  Logger,
  UnauthorizedException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { timingSafeEqual } from 'crypto';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';
import { and, eq, gt } from 'drizzle-orm';
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { session } from '../database/drizzle/schema';

const allowedOrigin = String(process.env['ALLOWED_ORIGINS']).split(',');

@WebSocketGateway({
  namespace: '/wss',
  cors: { origin: allowedOrigin, credentials: true },
})
@Injectable()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly realtime: RealtimeService,
    @Inject(DB) private readonly db: Database,
  ) {}

  afterInit(server: Server): void {
    this.realtime.bind(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      await this.handshake(client);
      const [active, version, stats] = await Promise.all([
        this.realtime.getScannerStatus(),
        this.realtime.getAppVersion(),
        this.realtime.getTicketStats(),
      ]);
      client.emit('scanner:status', { active });
      client.emit('app:version', version);
      client.emit('ticket:stats', stats);
      this.logger.log(`WS connected: ${client.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  private async handshake(client: Socket) {
    const scannerKey = client.handshake.auth?.['scannerKey'];

    if (scannerKey) {
      this.assertKey(scannerKey);
      return;
    }

    this.assertOrigin(client.handshake.headers.origin);
    const sessionId = this.getSessionId(client.handshake.headers.cookie);
    if (!sessionId) this.reject();
    await this.verify(sessionId);
  }

  private getSessionId(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;

    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'log.sessionId') {
        try {
          return decodeURIComponent(rest.join('='));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private async verify(sessionId: any) {
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

  private reject(): never {
    throw new UnauthorizedException({
      status: false,
      message: 'Belum login atau sesi sudah berakhir',
      code: 'UNAUTHORIZED',
    });
  }

  private assertOrigin(origin: string | undefined): void {
    if (!origin || !allowedOrigin.includes(origin)) {
      throw new UnauthorizedException();
    }
  }

  private assertKey(key: unknown): void {
    const expected = process.env['SCANNER_KEY'] ?? '';
    if (typeof key !== 'string') throw new UnauthorizedException();
    const a = Buffer.from(key);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
  }
}
