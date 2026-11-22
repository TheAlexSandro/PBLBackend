import {
  BadRequestException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { Utils } from '../utils/Utils';

const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const safeEqual = (a = '', b = '') => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class StreamService {
  constructor(private readonly jwt: JwtService) {}

  async scannerToken(res: Response, deviceId: string) {
    if (!DEVICE_ID.test(deviceId ?? ''))
      throw new BadRequestException('deviceId tidak valid');

    return Utils.response(res, HttpStatus.OK, true, 'Success!', null, {
      token: this.jwt.sign(
        { role: 'scanner', room: deviceId },
        { expiresIn: '60s' },
      ),
    });
  }

  async viewerToken(res: Response) {
    return Utils.response(res, HttpStatus.OK, true, 'Success!', null, {
      token: this.jwt.sign({ role: 'viewer', room: '*' }, { expiresIn: '60s' }),
    });
  }

  private reject() {
    throw new UnauthorizedException({
      status: false,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }
}
