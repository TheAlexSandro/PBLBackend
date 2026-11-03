import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ScannerKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
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
    return true;
  }
}
