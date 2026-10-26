import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ScanDto } from './scan.dto.js';
import { ScannerKeyGuard } from './scanner-key.guard.js';
import { ScannerService } from './scanner.service.js';

@Controller('tickets')
@UseGuards(ScannerKeyGuard)
export class ScannerController {
  constructor(private readonly scanner: ScannerService) {}

  @Post('scan')
  @HttpCode(200)
  scan(@Body() dto: ScanDto) {
    return this.scanner.scan(dto.code);
  }

  @Post('sync')
  @HttpCode(200)
  async sync() {
    return { synced: await this.scanner.syncFromSheet(true) };
  }
}
