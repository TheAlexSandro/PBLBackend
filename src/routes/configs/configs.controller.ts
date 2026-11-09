import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigsService } from './configs.service';

@Controller('configs')
export class ConfigsController {
  constructor(private readonly configsService: ConfigsService) {}

  @Get('getHomeIcon')
  getHomeIcon(@Res() res: Response): void {
    return this.configsService.getHomeIcon(res);
  }
}
