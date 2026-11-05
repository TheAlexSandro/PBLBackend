import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { AppVersionService } from './app-version.service';

function parseVersion(v: string): number[] {
  return v
    .split('+')[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isOlder(current: string, minimum: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

@Injectable()
export class ScannerKeyGuard implements CanActivate {
  constructor(private readonly versions: AppVersionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['x-scanner-key'];
    const expected = process.env['SCANNER_KEY']!;

    if (typeof key !== 'string')
      throw new UnauthorizedException('Scanner key tidak valid');

    const a = Buffer.from(key);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Scanner key tidak valid');
    }

    await this.checkVersion(req.headers['x-app-version']);
    return true;
  }

  private async checkVersion(header: unknown): Promise<void> {
    const raw = typeof header === 'string' ? header.trim() : '';
    if (raw === '-1') return;

    const minimum = await this.versions.getMinVersion();
    if (!minimum) return;

    if (isOlder(raw, minimum)) {
      throw new HttpException(
        'Versi aplikasi sudah usang. Silakan update.',
        426,
      );
    }
  }
}
