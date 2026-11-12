import { Controller, Post, UseGuards } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { AuthGuard } from '../filters/auth.guard';

@Controller('realtime')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Post('ticket')
  ticket() {
    return { ticket: this.realtime.issueTicket() };
  }
}
