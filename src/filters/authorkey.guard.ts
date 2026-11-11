import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { ScannerKeyGuard } from '../routes/tickets/tickets.guard';

@Injectable()
export class AuthOrScannerKeyGuard implements CanActivate {
  private guards?: CanActivate[];

  constructor(private readonly moduleRef: ModuleRef) {}

  private async getGuards(): Promise<CanActivate[]> {
    this.guards ??= [
      await this.moduleRef.create(ScannerKeyGuard),
      await this.moduleRef.create(AuthGuard),
    ];
    return this.guards;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    for (const guard of await this.getGuards()) {
      try {
        if (await guard.canActivate(ctx)) return true;
      } catch (e) {
        if (e instanceof HttpException && [401, 403].includes(e.getStatus())) {
          continue;
        }
        throw e;
      }
    }
    throw new UnauthorizedException();
  }
}
