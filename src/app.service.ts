import { Injectable, HttpStatus } from '@nestjs/common';
import { Utils } from './utils/Utils';
import { Response } from 'express';

@Injectable()
export class AppService {
  ping(res: Response): void {
    return Utils.response(res, HttpStatus.OK, true, "Alive");
  }
}
