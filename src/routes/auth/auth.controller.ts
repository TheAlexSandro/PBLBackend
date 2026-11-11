import { Controller, Res, Body, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response, Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signIn')
  signIn(@Res() res: Response, @Body('pwd') pwd: string): void {
    return this.authService.signIn(res, pwd);
  }

  @Post('signOut')
  signOut(@Req() req: Request, @Res() res: Response) {
    return this.authService.signOut(res, req);
  }
}
