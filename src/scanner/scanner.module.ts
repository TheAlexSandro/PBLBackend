import { Module } from '@nestjs/common';
import { ScannerController } from './scanner.controller.js';
import { ScannerKeyGuard } from './scanner-key.guard.js';
import { ScannerService } from './scanner.service.js';
import { SheetsService } from './sheets.service.js';

@Module({
  controllers: [ScannerController],
  providers: [ScannerService, SheetsService, ScannerKeyGuard],
})
export class ScannerModule {}
