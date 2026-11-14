import { Controller, Get, Query, Res, UseGuards, Post } from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from './admins.service';
import { AuthGuard } from '../../filters/auth.guard';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('makeFinal')
  @UseGuards(AuthGuard)
  makeFinal(@Res() res: Response): void {
    return this.adminService.makeFinal(res);
  }

  @Get('getInfo')
  getInfo(@Res() res: Response): void {
    return this.adminService.getInfo(res);
  }

  @Get('getLogs')
  @UseGuards(AuthGuard)
  getLogs(
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): void {
    return this.adminService.getLogs(res, page, limit);
  }

  @Get('getTickets')
  @UseGuards(AuthGuard)
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
  @UseGuards(AuthGuard)
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
