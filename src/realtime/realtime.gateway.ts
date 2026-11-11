import { Logger, UnauthorizedException } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { timingSafeEqual } from 'crypto';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({
  namespace: '/wss',
  cors: { origin: '*' },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly realtime: RealtimeService) {}

  afterInit(server: Server): void {
    this.realtime.bind(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      this.assertKey(client.handshake.auth?.['scannerKey']);
      const [active, version] = await Promise.all([
        this.realtime.getScannerStatus(),
        this.realtime.getAppVersion(),
      ]);
      client.emit('scanner:status', { active });
      client.emit('app:version', version);
      this.logger.log(`WS connected: ${client.id}`);
    } catch {
      client.disconnect(true);
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
