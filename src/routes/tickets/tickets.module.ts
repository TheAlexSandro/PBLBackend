import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { ScannerKeyGuard } from './tickets.guard';
import { TicketsService } from './tickets.service';

import { SheetsService } from './sheet.service';
import { AppVersionService } from './app-version.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, SheetsService, ScannerKeyGuard, AppVersionService],
})
export class TicketsModule {}
