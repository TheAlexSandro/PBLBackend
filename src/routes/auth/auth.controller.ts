import { Controller, Res, Body, Post, Req, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response, Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('isLoggedIn')
  isLoggedIn(@Res() res: Response): void {
    return this.authService.isLoggedIn(res);
  }

  @Post('signIn')
  signIn(
    @Res() res: Response,
    @Body('username') username: string,
    @Body('pwd') pwd: string,
  ): void {
    return this.authService.signIn(res, username, pwd);
  }

  @Post('signOut')
  signOut(@Req() req: Request, @Res() res: Response): void {
    return this.authService.signOut(res, req);
  }

  @Post('requestConnect')
  requestConnect(@Req() req: Request, @Res() res: Response): void {
    return this.authService.requestConnect(res, req);
  }
}
