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

@WebSocketGateway({
  namespace: '/wss',
  cors: { origin: '*' },
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
    } catch (e) {
      this.logger.warn(
        `WS ditolak ${client.id}: ${e instanceof Error ? e.message : e}`,
      );
      client.disconnect(true);
    }
  }

  private async handshake(client: Socket): Promise<void> {
    const auth = client.handshake.auth ?? {};

    this.logger.log(`auth keys: ${Object.keys(auth).join(',') || '(kosong)'}`);
    if (auth['scannerKey'] !== undefined) {
      this.assertKey(auth['scannerKey']);
      return;
    }

    if (!this.realtime.consumeTicket(auth['ticket'])) this.reject();
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
