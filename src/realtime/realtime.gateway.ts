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
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { session } from '../database/drizzle/schema';
import { and, eq, gt } from 'drizzle-orm';
import { Utils } from '../utils/Utils';

const allowedOrigins = String(process.env['ALLOWED_ORIGINS']).split(',');

@WebSocketGateway({
  namespace: '/wss',
  cors: { origin: allowedOrigins, credentials: true },
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
      client.emit('ticket:refreshLogs', true);
      this.logger.log(`WS connected: ${client.id}`);
    } catch (e) {
      this.logger.warn(
        `WS ditolak ${client.id}: ${e instanceof Error ? e.message : e}`,
      );
      client.disconnect(true);
    }
  }

  private async handshake(client: Socket): Promise<void> {
    const auth = client.handshake.auth ?? {};

    if (auth['scannerKey'] !== undefined) {
      this.assertKey(auth['scannerKey']);
      return;
    }

    if (auth['wsAuth']) {
      const req = client.handshake.headers.cookie;
      await this.verifyWsToken(req);
    }

    this.reject();
  }

  private async verifyWsToken(cookieHeader: string | undefined): Promise<void> {
    const name = String(process.env['COOKIE_WS']);
    const token = Utils.getCookie(cookieHeader, name);

    if (!cookieHeader) {
      this.logger.warn(
        'REASON: header Cookie kosong',
      );
      this.reject();
    }
    if (!token) {
      this.logger.warn(`REASON: cookie "${name}" tidak ada di header`);
      this.reject();
    }

    const rows = await this.db
      .select({
        id: session.id,
        expiredAt: session.expiredAt,
        key: session.key,
      })
      .from(session)
      .where(eq(session.id, token!))
      .limit(1);

    if (!rows.length) {
      this.logger.warn('REASON: session tidak ada di DB');
      this.reject();
    }
    const row = rows[0];
    if (row.key !== name) {
      this.logger.warn(`REASON: key beda (db=${row.key}, env=${name})`);
      this.reject();
    }
    if (new Date(row.expiredAt).getTime() <= Date.now()) {
      this.logger.warn(
        `REASON: expired (expiredAt=${row.expiredAt}, now=${new Date().toISOString()})`,
      );
      this.reject();
    }
  }

  private reject() {
    throw new UnauthorizedException({
      status: false,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  private assertKey(key: any): void {
    const expected = process.env['SCANNER_KEY'] ?? '';
    if (typeof key !== 'string') this.reject();
    const a = Buffer.from(key);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.reject();
    }
  }
}
