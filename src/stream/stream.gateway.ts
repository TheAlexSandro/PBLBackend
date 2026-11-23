import { Inject, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { timingSafeEqual } from 'crypto';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { DB } from '../database/database.provider';
import type { Database } from '../database/database.provider';
import { session } from '../database/drizzle/schema';

type Role = 'scanner' | 'viewer';
interface Claims {
  role: Role;
  room: string;
}

const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_VIEWERS = 3;
const MAX_FRAME_BYTES = 150_000;
const MIN_FRAME_GAP_MS = 30;

@WebSocketGateway({
  namespace: 'stream',
  cors: {
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  },
  maxHttpBufferSize: 256 * 1024,
})
export class StreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Namespace;

  constructor(@Inject(DB) private readonly db: Database) {}

  async handleConnection(client: Socket) {
    try {
      const { role, room } = await this.authenticate(client);
      if (!client.connected) return;

      if (role === 'scanner') {
        if (!DEVICE_ID.test(room)) throw new Error('room');
        const old = await this.server.in(`${room}:scanner`).fetchSockets();

        const label =
          String(client.handshake.auth?.label ?? '')
            .replace(/[^\w .-]/g, '')
            .slice(0, 40) || room;
        client.data = { role, room, label };
        client.join([`${room}:scanner`, 'scanners']);

        old.forEach((s) => s.disconnect(true));

        this.server
          .to('viewers')
          .emit('scanner-online', { deviceId: room, label });

        const watchers = await this.server.in(`${room}:viewer`).fetchSockets();
        watchers.forEach((v) =>
          client.emit('viewer-joined', { viewerId: v.id }),
        );
      } else if (role === 'viewer') {
        client.data = { role, room };
        client.join('viewers');
        client.emit('scanners', await this.listScanners());
        if (room !== '*') await this.watch(client, room);
      } else {
        throw new Error('role');
      }
    } catch {
      client.disconnect(true);
    }
  }

  private async authenticate(client: Socket): Promise<Claims> {
    const auth = client.handshake.auth ?? {};

    if (auth['scannerKey']) {
      this.assertKey(auth['scannerKey']);
      return { role: 'scanner', room: String(auth['deviceId'] ?? '') };
    }

    if (auth['wsToken']) {
      await this.verifyWsToken(auth['wsToken']);
      return { role: 'viewer', room: '*' };
    }

    this.reject();
  }

  private assertKey(key: unknown): void {
    const expected = process.env['SCANNER_KEY'] ?? '';
    if (typeof key !== 'string') this.reject();
    const a = Buffer.from(key);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) this.reject();
  }

  private async verifyWsToken(wsToken: unknown): Promise<void> {
    if (typeof wsToken !== 'string') this.reject();
    const rows = await this.db
      .select({ id: session.id })
      .from(session)
      .where(
        and(
          eq(session.id, wsToken),
          gt(session.expiredAt, new Date().toISOString()),
          eq(session.key, String(process.env['COOKIE_WS'])),
        ),
      )
      .limit(1);
    if (!rows.length) this.reject();
  }

  private reject(): never {
    throw new UnauthorizedException({
      status: false,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  async handleDisconnect(client: Socket) {
    const { role, room } = (client.data ?? {}) as Partial<Claims>;
    if (!room) return;
    if (role === 'viewer') {
      this.unwatch(client);
    } else if (role === 'scanner') {
      const remaining = await this.server.in(`${room}:scanner`).fetchSockets();
      if (remaining.length === 0)
        this.server.to('viewers').emit('scanner-offline', { deviceId: room });
    }
  }

  @SubscribeMessage('watch')
  async onWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId: unknown,
  ) {
    const { role, room } = (client.data ?? {}) as Partial<Claims>;
    if (
      role !== 'viewer' ||
      typeof deviceId !== 'string' ||
      !DEVICE_ID.test(deviceId)
    )
      return;
    if (room !== '*' && room !== deviceId) return;
    await this.watch(client, deviceId);
  }

  @SubscribeMessage('unwatch')
  onUnwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() deviceId?: unknown,
  ) {
    if (client.data?.role !== 'viewer') return;
    this.unwatch(client, typeof deviceId === 'string' ? deviceId : undefined);
  }

  @SubscribeMessage('frame')
  onFrame(@ConnectedSocket() client: Socket, @MessageBody() frame: unknown) {
    const { role, room } = (client.data ?? {}) as Partial<Claims>;
    if (role !== 'scanner' || !room) return { ok: false };
    if (!Buffer.isBuffer(frame) || frame.length > MAX_FRAME_BYTES)
      return { ok: false };

    const now = Date.now();
    if (now - (client.data.lastFrameAt ?? 0) < MIN_FRAME_GAP_MS)
      return { ok: true };
    client.data.lastFrameAt = now;

    this.server.to(`${room}:viewer`).volatile.emit('frame', room, frame);
    return { ok: true };
  }

  private async listScanners() {
    const sockets = await this.server.in('scanners').fetchSockets();
    return sockets.map((s) => ({
      deviceId: s.data.room as string,
      label: s.data.label as string,
    }));
  }

  private watchSet(client: Socket): Set<string> {
    return (client.data.watching ??= new Set<string>());
  }

  private async watch(client: Socket, deviceId: string) {
    const watching = this.watchSet(client);
    if (watching.has(deviceId)) return;

    const viewers = await this.server.in(`${deviceId}:viewer`).fetchSockets();
    if (viewers.length >= MAX_VIEWERS) {
      client.emit('watch-error', { deviceId, reason: 'penuh' });
      return;
    }

    client.join(`${deviceId}:viewer`);
    watching.add(deviceId);
    this.server
      .to(`${deviceId}:scanner`)
      .emit('viewer-joined', { viewerId: client.id });
  }

  private unwatch(client: Socket, deviceId?: string) {
    const watching = client.data?.watching as Set<string> | undefined;
    if (!watching) return;

    for (const id of deviceId ? [deviceId] : [...watching]) {
      if (!watching.delete(id)) continue;
      client.leave(`${id}:viewer`);
      this.server
        .to(`${id}:scanner`)
        .emit('viewer-left', { viewerId: client.id });
    }
  }
}
