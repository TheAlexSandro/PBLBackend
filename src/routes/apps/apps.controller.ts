import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppsService } from './apps.service';

@Controller('app')
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  @Get('version')
  version(@Res() res: Response): void {
    return this.apps.version(res);
  }

  @Get('download')
  download(@Res() res: Response): void {
    return this.apps.download(res);
  }
}
