import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admins.service';
import { AuthGuard } from '../../filters/auth.guard';

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('getLogs')
  getLogs(
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): void {
    return this.adminService.getLogs(res, page, limit);
  }

  @Get('getTickets')
  getTickets(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): void {
    return this.adminService.getTickets(res, type, year, page, limit);
  }

  @Get('searchTickets')
  searchTickets(
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.searchTickets(res, q, type, year, page, limit);
  }
}
