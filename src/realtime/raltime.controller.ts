import { Controller, Post, UseGuards, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RealtimeService } from './realtime.service';
import { AuthGuard } from '../filters/auth.guard';

@Controller('realtime')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Post('ticket')
  ticket(@Req() req: Request, @Res() res: Response) {
    return this.realtime.issueTicket(req, res);
  }
}
