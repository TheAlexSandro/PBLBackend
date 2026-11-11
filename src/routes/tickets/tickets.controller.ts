import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScanDto } from './scan.dto';
import { ScannerKeyGuard } from './tickets.guard';
import { TicketsService } from './tickets.service';
import { AuthGuard } from '../../filters/auth.guard';
import { AuthOrScannerKeyGuard } from '../../filters/authorkey.guard';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post('scan')
  @UseGuards(ScannerKeyGuard)
  scan(@Res() res: Response, @Body() dto: ScanDto): void {
    return this.tickets.scan(res, dto.code);
  }

  @Post('sync')
  @UseGuards(ScannerKeyGuard)
  sync(@Res() res: Response): void {
    return this.tickets.sync(res);
  }

  @Get('stats')
  @UseGuards(AuthGuard)
  stats(
    @Res() res: Response,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ): void {
    return this.tickets.stats(res, year);
  }

  @Post('clearLog')
  @UseGuards(AuthOrScannerKeyGuard)
  clearLog(@Res() res: Response): void {
    return this.tickets.clearLog(res);
  }

  @Get('scannerStatus')
  @UseGuards(AuthOrScannerKeyGuard)
  getStatus(@Res() res: Response): void {
    return this.tickets.getStatus(res);
  }

  @Post('changeStatus')
  @UseGuards(AuthGuard)
  changeStatus(@Res() res: Response, @Query('code') code: string): void {
    return this.tickets.changeStatus(res, code);
  }
}
