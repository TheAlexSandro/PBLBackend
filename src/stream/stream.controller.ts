import {
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../filters/auth.guard';
import { StreamService } from './stream.service';
import { ScannerKeyGuard } from '../routes/tickets/tickets.guard';

@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Post('scannerToken')
  @UseGuards(ScannerKeyGuard)
  scannerToken(@Res() res: Response, @Body('deviceId') deviceId: string): void {
    this.streamService.scannerToken(res, deviceId);
  }

  @Post('viewerToken')
  @UseGuards(AuthGuard)
  viewerToken(@Res() res: Response): void {
    this.streamService.viewerToken(res);
  }
}
